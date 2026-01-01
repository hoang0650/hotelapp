import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import { TuyaService, TuyaDevice } from '../../services/tuya.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';
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
        nzUnCheckedChildren="OFF"
        nz-tooltip
        [nzTooltipTitle]="getSwitchTooltip()">
      </nz-switch>
    </div>
    <div *ngIf="!device && !isLoading" class="no-device">
      <i 
        nz-icon 
        nzType="poweroff" 
        nzTheme="outline"
        nz-tooltip
        [nzTooltipTitle]="'TUYA.NO_SWITCH' | translate"
        class="switch-icon">
      </i>
    </div>
  `,
  styles: [`
    .tuya-switch-compact {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .no-device {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .switch-icon {
      font-size: 18px;
      color: #8c8c8c;
      cursor: help;
      transition: color 0.3s ease;
    }
    .switch-icon:hover {
      color: #1890ff;
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
    private message: NzMessageService,
    public translate: TranslateService
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

  getSwitchTooltip(): string {
    if (!this.device) {
      return this.translate.instant('TUYA.NO_SWITCH');
    }
    if (!this.device.online) {
      return this.translate.instant('TUYA.OFFLINE');
    }
    return this.device.state 
      ? this.translate.instant('TUYA.TURN_OFF_SWITCH')
      : this.translate.instant('TUYA.TURN_ON_SWITCH');
  }
}

