import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import { TuyaService, TuyaDevice } from '../../services/tuya.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Subscription } from 'rxjs';

/**
 * Component compact để hiển thị công tắc trong room list
 */
@Component({
  selector: 'app-tuya-switch-compact',
  template: `
    <div class="tuya-switch-compact" *ngIf="device">
      <nz-switch
        [ngModel]="device.state"
        [nzDisabled]="!device.online || isToggling"
        [nzLoading]="isToggling"
        (ngModelChange)="toggle()"
        nzSize="small"
        nzCheckedChildren="ON"
        nzUnCheckedChildren="OFF">
      </nz-switch>
      <nz-tag [nzColor]="device.online ? 'green' : 'red'" nzSize="small">
        {{ device.online ? 'Online' : 'Offline' }}
      </nz-tag>
    </div>
    <div *ngIf="!device && !isLoading" class="no-device">
      <span nz-icon nzType="info-circle" nzTheme="outline"></span>
      Chưa có công tắc
    </div>
  `,
  styles: [`
    .tuya-switch-compact {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .no-device {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #8c8c8c;
      font-size: 12px;
    }
  `]
})
export class TuyaSwitchCompactComponent implements OnInit, OnDestroy {
  @Input() roomId?: string;
  @Input() roomNumber?: string;
  @Input() autoLoad: boolean = true;

  device?: TuyaDevice;
  isLoading: boolean = false;
  isToggling: boolean = false;
  private refreshSubscription?: Subscription;

  constructor(
    private tuyaService: TuyaService,
    private message: NzMessageService
  ) { }

  ngOnInit(): void {
    if (this.autoLoad && this.roomId) {
      this.loadDevice();
    }
  }

  ngOnDestroy(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
  }

  loadDevice(): void {
    if (!this.roomId) return;
    
    this.isLoading = true;
    this.tuyaService.getDevices(this.roomId).subscribe({
      next: (response) => {
        const devices = response.data || [];
        // Lấy thiết bị đầu tiên của phòng
        this.device = devices.length > 0 ? devices[0] : undefined;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading device:', error);
        this.device = undefined;
        this.isLoading = false;
      }
    });
  }

  toggle(): void {
    if (!this.device || this.isToggling) return;
    
    this.isToggling = true;
    this.tuyaService.toggle(this.device.id).subscribe({
      next: (response) => {
        if (response.success && this.device) {
          this.device.state = response.data?.state ?? !this.device.state;
        }
        this.isToggling = false;
      },
      error: (error) => {
        console.error('Error toggling device:', error);
        this.isToggling = false;
      }
    });
  }
}

