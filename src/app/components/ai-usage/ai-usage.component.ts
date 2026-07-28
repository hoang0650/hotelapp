import { Component, OnInit } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';
import {
  AiUsageService,
  AiUsageSummary,
  AiRetailRate,
  AiHotelUsageRow
} from '../../services/ai-usage.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-ai-usage',
  templateUrl: './ai-usage.component.html',
  styleUrls: ['./ai-usage.component.css']
})
export class AiUsageComponent implements OnInit {
  loading = false;
  usage: AiUsageSummary | null = null;
  currentUser: any = null;
  isAdmin = false;

  // Admin allocate
  adminLoading = false;
  hotelRows: AiHotelUsageRow[] = [];
  hotelTotal = 0;
  hotelPage = 1;
  hotelPageSize = 10;
  hotelSearch = '';
  allocateVisible = false;
  allocateSubmitting = false;
  selectedHotel: AiHotelUsageRow | null = null;
  allocateTurns: number = 500;
  allocateNote = '';

  constructor(
    private aiUsageService: AiUsageService,
    private authService: AuthService,
    private message: NzMessageService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.isAdmin = this.authService.isSuperAdmin() || this.authService.isAdmin();
    this.loadUsage();
    if (this.isAdmin) {
      this.loadHotelUsages();
    }
  }

  loadUsage(): void {
    this.loading = true;
    this.aiUsageService.getMyUsage().subscribe({
      next: (res) => {
        this.usage = res?.data || null;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.message.error(this.translate.instant('AI_USAGE.LOAD_ERROR'));
      }
    });
  }

  loadHotelUsages(): void {
    this.adminLoading = true;
    this.aiUsageService
      .listHotelUsages({
        search: this.hotelSearch || undefined,
        page: this.hotelPage,
        pageSize: this.hotelPageSize
      })
      .subscribe({
        next: (res) => {
          this.hotelRows = res?.data?.items || [];
          this.hotelTotal = res?.data?.total || 0;
          this.adminLoading = false;
        },
        error: () => {
          this.adminLoading = false;
          this.message.error(this.translate.instant('AI_USAGE.ADMIN_LOAD_ERROR'));
        }
      });
  }

  onHotelSearch(): void {
    this.hotelPage = 1;
    this.loadHotelUsages();
  }

  onHotelPageChange(page: number): void {
    this.hotelPage = page;
    this.loadHotelUsages();
  }

  openAllocate(row: AiHotelUsageRow): void {
    this.selectedHotel = row;
    this.allocateTurns = 500;
    this.allocateNote = '';
    this.allocateVisible = true;
  }

  closeAllocate(): void {
    this.allocateVisible = false;
    this.selectedHotel = null;
  }

  submitAllocate(): void {
    if (!this.selectedHotel?.hotelId) return;
    const turns = Math.floor(Number(this.allocateTurns));
    if (!Number.isFinite(turns) || turns < 1) {
      this.message.warning(this.translate.instant('AI_USAGE.ALLOCATE_TURNS_INVALID'));
      return;
    }

    this.allocateSubmitting = true;
    this.aiUsageService
      .allocateBonus({
        hotelId: this.selectedHotel.hotelId,
        turns,
        note: this.allocateNote?.trim() || undefined
      })
      .subscribe({
        next: (res) => {
          this.allocateSubmitting = false;
          this.allocateVisible = false;
          this.message.success(
            res?.message || this.translate.instant('AI_USAGE.ALLOCATE_SUCCESS')
          );
          this.loadHotelUsages();
          this.loadUsage();
        },
        error: (err) => {
          this.allocateSubmitting = false;
          this.message.error(
            err?.error?.message || this.translate.instant('AI_USAGE.ALLOCATE_ERROR')
          );
        }
      });
  }

  get progressStatus(): 'success' | 'exception' | 'active' | 'normal' {
    if (!this.usage || this.usage.unlimited) return 'normal';
    if (this.usage.percentUsed >= 100) return 'exception';
    if (this.usage.percentUsed >= 80) return 'active';
    return 'success';
  }

  getChannelTurns(channel: string): number {
    const map = this.usage?.byChannel as Record<string, { turns?: number }> | undefined;
    return Number(map?.[channel]?.turns) || 0;
  }

  getChannelCost(channel: string): number {
    const map = this.usage?.byChannel as Record<string, { retailCostVnd?: number }> | undefined;
    return Number(map?.[channel]?.retailCostVnd) || 0;
  }

  formatVnd(value: number | null | undefined): string {
    const n = Number(value) || 0;
    return n.toLocaleString('vi-VN') + 'đ';
  }

  formatUsd(value: number | null | undefined): string {
    const n = Number(value) || 0;
    return '$' + n.toFixed(4);
  }

  channelLabel(channel: string): string {
    const key = `AI_USAGE.CHANNEL_${String(channel || '').toUpperCase()}`;
    const t = this.translate.instant(key);
    return t === key ? channel : t;
  }

  trackRate(_: number, rate: AiRetailRate): string {
    return rate.modelId;
  }

  trackHotel(_: number, row: AiHotelUsageRow): string {
    return row.hotelId;
  }
}
