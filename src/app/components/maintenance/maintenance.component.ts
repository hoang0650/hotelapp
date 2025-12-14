import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { SettingsService } from '../../services/settings.service';
import { AuthService } from '../../services/auth.service';
import { interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-maintenance',
  templateUrl: './maintenance.component.html',
  styleUrls: ['./maintenance.component.css']
})
export class MaintenanceComponent implements OnInit, OnDestroy {
  maintenanceMessage = 'Hệ thống đang bảo trì. Vui lòng quay lại sau.';
  isLoading = true;
  isAdmin = false;
  private maintenanceCheckInterval?: Subscription;
  private maintenanceModeChangeSubscription?: any;

  constructor(
    private router: Router,
    private settingsService: SettingsService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.checkUserRole();
    this.loadMaintenanceMessage();
    
    // Lắng nghe sự kiện maintenance mode thay đổi
    this.maintenanceModeChangeSubscription = window.addEventListener('maintenanceModeChanged', (event: any) => {
      if (event.detail.enabled === false) {
        // Maintenance mode đã được tắt, redirect về trang chủ
        this.router.navigate(['/admin/room']);
      }
    });
    
    // Kiểm tra maintenance mode từ backend mỗi 10 giây
    this.maintenanceCheckInterval = interval(10000).subscribe(() => {
      this.checkMaintenanceMode();
    });
  }

  ngOnDestroy(): void {
    if (this.maintenanceCheckInterval) {
      this.maintenanceCheckInterval.unsubscribe();
    }
    if (this.maintenanceModeChangeSubscription) {
      window.removeEventListener('maintenanceModeChanged', this.maintenanceModeChangeSubscription);
    }
  }

  private checkUserRole(): void {
    const currentUser = this.authService.getCurrentUser();
    this.isAdmin = this.authService.isSuperAdmin() || this.authService.isAdmin();
  }

  private loadMaintenanceMessage(): void {
    this.settingsService.getSettingsByType('general').subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const generalSettings = response.data as any;
          if (generalSettings.maintenanceMessage) {
            this.maintenanceMessage = generalSettings.maintenanceMessage;
          }
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading maintenance message:', error);
        this.isLoading = false;
      }
    });
  }

  goToLogin(): void {
    this.authService.logout();
  }

  private checkMaintenanceMode(): void {
    // Chỉ check nếu không phải admin
    if (this.isAdmin) return;
    
    this.settingsService.getSettingsByType('general').subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const generalSettings = response.data as any;
          const maintenanceMode = generalSettings.maintenanceMode || false;
          
          if (!maintenanceMode) {
            // Maintenance mode đã được tắt
            localStorage.removeItem('maintenanceMode');
            localStorage.removeItem('maintenanceMessage');
            
            // Redirect về trang chủ
            this.router.navigate(['/admin/room']);
          }
        }
      },
      error: (error) => {
        // Silent fail
        console.error('Error checking maintenance mode:', error);
      }
    });
  }
}

