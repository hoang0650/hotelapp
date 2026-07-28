import { Component, OnInit } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';
import { AiUsageService, AiUsageSummary, AiRetailRate } from '../../services/ai-usage.service';
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

  constructor(
    private aiUsageService: AiUsageService,
    private authService: AuthService,
    private message: NzMessageService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadUsage();
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
}
