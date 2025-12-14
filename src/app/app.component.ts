import { Component, OnInit, OnDestroy } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Router, NavigationEnd } from '@angular/router';
import { AuthService } from './services/auth.service';
import { SettingsService } from './services/settings.service';
import { NotificationsService } from './services/notifications.service';
import { filter, interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'hotel';
  isMaintenanceMode = false;
  maintenanceMessage = 'Hệ thống đang bảo trì. Vui lòng quay lại sau.';
  private maintenanceCheckInterval?: Subscription;
  private maintenanceModeChangeSubscription?: any;

  constructor(
    private translate: TranslateService,
    private router: Router,
    private authService: AuthService,
    private settingsService: SettingsService,
    private notificationsService: NotificationsService
  ) {}

  ngOnInit(): void {
    // Set default language from localStorage or use 'vi'
    const savedLang = localStorage.getItem('language') || 'vi';
    this.translate.setDefaultLang('vi');
    this.translate.use(savedLang);
    
    // Kiểm tra maintenance mode từ localStorage
    this.checkMaintenanceMode();
    
    // Lắng nghe navigation để kiểm tra maintenance mode
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.checkMaintenanceMode();
    });
    
    // Lắng nghe sự kiện maintenance mode thay đổi
    this.maintenanceModeChangeSubscription = window.addEventListener('maintenanceModeChanged', (event: any) => {
      this.handleMaintenanceModeChange(event.detail);
    });
    
    // Kiểm tra maintenance mode từ backend mỗi 30 giây (chỉ cho admin)
    const currentUser = this.authService.getCurrentUser();
    const isAdmin = this.authService.isSuperAdmin() || this.authService.isAdmin();
    
    if (isAdmin) {
      this.maintenanceCheckInterval = interval(30000).subscribe(() => {
        this.checkMaintenanceModeFromBackend();
      });
    }
  }

  ngOnDestroy(): void {
    if (this.maintenanceCheckInterval) {
      this.maintenanceCheckInterval.unsubscribe();
    }
    if (this.maintenanceModeChangeSubscription) {
      window.removeEventListener('maintenanceModeChanged', this.maintenanceModeChangeSubscription);
    }
  }

  private checkMaintenanceMode(): void {
    const maintenanceMode = localStorage.getItem('maintenanceMode') === 'true';
    const maintenanceMsg = localStorage.getItem('maintenanceMessage');
    
    if (maintenanceMode) {
      const currentUser = this.authService.getCurrentUser();
      const isAdmin = this.authService.isSuperAdmin() || this.authService.isAdmin();
      
      // Nếu không phải admin và không đang ở trang maintenance, redirect
      if (!isAdmin && !this.router.url.startsWith('/maintenance')) {
        this.isMaintenanceMode = true;
        if (maintenanceMsg) {
          this.maintenanceMessage = maintenanceMsg;
        }
        this.router.navigate(['/maintenance']);
      } else if (isAdmin) {
        // Admin có thể truy cập, nhưng vẫn hiển thị thông báo
        this.isMaintenanceMode = false;
      }
    } else {
      this.isMaintenanceMode = false;
      
      // Nếu đang ở maintenance page và maintenance mode đã tắt, redirect về trang chủ
      if (this.router.url.startsWith('/maintenance')) {
        this.router.navigate(['/admin/room']);
      }
    }
  }

  private checkMaintenanceModeFromBackend(): void {
    // Chỉ check nếu là admin
    const isAdmin = this.authService.isSuperAdmin() || this.authService.isAdmin();
    if (!isAdmin) return;
    
    this.settingsService.getSettingsByType('general').subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const generalSettings = response.data as any;
          const backendMaintenanceMode = generalSettings.maintenanceMode || false;
          const backendMaintenanceMessage = generalSettings.maintenanceMessage || '';
          
          const localMaintenanceMode = localStorage.getItem('maintenanceMode') === 'true';
          
          // Nếu backend maintenance mode khác với local, cập nhật
          if (backendMaintenanceMode !== localMaintenanceMode) {
            if (backendMaintenanceMode) {
              localStorage.setItem('maintenanceMode', 'true');
              if (backendMaintenanceMessage) {
                localStorage.setItem('maintenanceMessage', backendMaintenanceMessage);
              }
            } else {
              localStorage.removeItem('maintenanceMode');
              localStorage.removeItem('maintenanceMessage');
            }
            
            // Reload notifications
            this.notificationsService.loadAnnouncements();
            
            // Broadcast event
            window.dispatchEvent(new CustomEvent('maintenanceModeChanged', { 
              detail: { enabled: backendMaintenanceMode, message: backendMaintenanceMessage } 
            }));
          }
        }
      },
      error: (error) => {
        // Silent fail để không làm gián đoạn user experience
        console.error('Error checking maintenance mode:', error);
      }
    });
  }

  private handleMaintenanceModeChange(detail: any): void {
    if (detail.enabled === false) {
      // Maintenance mode đã được tắt
      this.isMaintenanceMode = false;
      localStorage.removeItem('maintenanceMode');
      localStorage.removeItem('maintenanceMessage');
      
      // Reload notifications
      this.notificationsService.loadAnnouncements();
      
      // Nếu đang ở maintenance page, redirect về trang chủ
      if (this.router.url.startsWith('/maintenance')) {
        this.router.navigate(['/admin/room']);
      }
    } else {
      // Maintenance mode đã được bật
      this.isMaintenanceMode = true;
      localStorage.setItem('maintenanceMode', 'true');
      if (detail.message) {
        localStorage.setItem('maintenanceMessage', detail.message);
        this.maintenanceMessage = detail.message;
      }
      
      // Reload notifications
      this.notificationsService.loadAnnouncements();
    }
  }
}
