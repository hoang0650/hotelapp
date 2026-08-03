import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import { TranslationService } from './services/translation.service';
import { Router, NavigationEnd } from '@angular/router';
import { AuthService } from './services/auth.service';
import { SettingsService } from './services/settings.service';
import { NotificationsService } from './services/notifications.service';
import { SeoService } from './services/seo.service';
import { ThemeService } from './services/theme.service';
import { filter, interval, Subscription, take } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'hotel';
  isMaintenanceMode = false;
  maintenanceMessage = 'Hệ thống đang bảo trì. Vui lòng quay lại sau.';
  isBrowser = false;
  authResolved = false;
  currentUrl = '/';
  private maintenanceCheckInterval?: Subscription;
  private maintenanceModeChangeListener?: any;

  constructor(
    private translate: TranslateService,
    private translationService: TranslationService,
    private router: Router,
    public authService: AuthService,
    private settingsService: SettingsService,
    private notificationsService: NotificationsService,
    private seoService: SeoService,
    private themeService: ThemeService,
    @Inject(PLATFORM_ID) private platformId: any
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    // Khởi tạo theme sớm (đọc cookie + apply data-theme)
    void this.themeService.currentTheme;
  }

  ngOnInit(): void {
    this.translate.setDefaultLang('vi');
    this.translate.use(this.translationService.getCurrentLang());

    this.currentUrl = this.router.url || (this.isBrowser ? window.location.pathname : '/');
    this.authService.authResolved$.subscribe(resolved => {
      this.authResolved = resolved;
    });
    this.authService.authResolved$.pipe(
      filter(resolved => resolved),
      take(1)
    ).subscribe(() => {
      this.authService.checkSubdomainAndRedirect();
    });
    
    if (isPlatformBrowser(this.platformId)) {
      this.checkMaintenanceMode();
    }
    
    // Lắng nghe navigation để kiểm tra maintenance mode
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.currentUrl = this.router.url || (this.isBrowser ? window.location.pathname : '/');
      if (isPlatformBrowser(this.platformId)) {
        this.checkMaintenanceMode();
      }
    });

    this.seoService.init();
    
    // Lắng nghe sự kiện maintenance mode thay đổi
    if (isPlatformBrowser(this.platformId)) {
      this.maintenanceModeChangeListener = (event: any) => {
        this.handleMaintenanceModeChange(event.detail);
      };
      window.addEventListener('maintenanceModeChanged', this.maintenanceModeChangeListener);
    }
    
    // Kiểm tra maintenance mode từ backend mỗi 30 giây (chỉ cho admin)
    const currentUser = this.authService.getCurrentUser();
    const isAdmin = this.authService.isSuperAdmin() || this.authService.isAdmin();
    
    if (isAdmin && isPlatformBrowser(this.platformId)) {
      this.maintenanceCheckInterval = interval(30000).subscribe(() => {
        this.checkMaintenanceModeFromBackend();
      });
    }
  }

  ngOnDestroy(): void {
    if (this.maintenanceCheckInterval) {
      this.maintenanceCheckInterval.unsubscribe();
    }
    if (this.maintenanceModeChangeListener && isPlatformBrowser(this.platformId)) {
      window.removeEventListener('maintenanceModeChanged', this.maintenanceModeChangeListener);
      this.maintenanceModeChangeListener = null;
    }
  }

  private checkMaintenanceMode(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const maintenanceMode = this.notificationsService.isMaintenanceMode();
    const maintenanceMsg = this.notificationsService.getMaintenanceMessage();
    
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
    if (!isPlatformBrowser(this.platformId)) return;
    // Chỉ check nếu là admin
    const isAdmin = this.authService.isSuperAdmin() || this.authService.isAdmin();
    if (!isAdmin) return;
    
    this.settingsService.getSettingsByType('general').subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const generalSettings = response.data as any;
          const backendMaintenanceMode = generalSettings.maintenanceMode || false;
          const backendMaintenanceMessage = generalSettings.maintenanceMessage || '';
          
          const localMaintenanceMode = this.notificationsService.isMaintenanceMode();
          
          // Nếu backend maintenance mode khác với local, cập nhật
          if (backendMaintenanceMode !== localMaintenanceMode) {
            if (backendMaintenanceMode) {
              this.notificationsService.setMaintenanceMode(true, backendMaintenanceMessage || null);
            } else {
              this.notificationsService.clearMaintenanceMode();
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
    if (!isPlatformBrowser(this.platformId)) return;
    if (detail.enabled === false) {
      // Maintenance mode đã được tắt
      this.isMaintenanceMode = false;
      this.notificationsService.clearMaintenanceMode();
      
      // Reload notifications
      this.notificationsService.loadAnnouncements();
      
      // Nếu đang ở maintenance page, redirect về trang chủ
      if (this.router.url.startsWith('/maintenance')) {
        this.router.navigate(['/admin/room']);
      }
    } else {
      // Maintenance mode đã được bật
      this.isMaintenanceMode = true;
      this.notificationsService.setMaintenanceMode(true, detail.message || null);
      if (detail.message) {
        this.maintenanceMessage = detail.message;
      }
      
      // Reload notifications
      this.notificationsService.loadAnnouncements();
    }
  }

  isAuthResolvingForAdminRoute(): boolean {
    if (!this.isBrowser || this.authResolved) {
      return false;
    }

    const pathname = this.currentUrl || window.location.pathname || '/';
    const normalizedPath = pathname.split('?')[0];
    const publicPaths = ['/login', '/signup', '/business-signup', '/forgot-password', '/unauthorized', '/notfound'];
    const isPublicPath = publicPaths.some(p => normalizedPath.startsWith(p)) || normalizedPath.startsWith('/reset-password');
    if (isPublicPath) {
      return false;
    }

    const hostname = window.location.hostname || '';
    const isAdminSubdomain = hostname.startsWith('admin.');
    const isAdminPath = normalizedPath.startsWith('/admin/');
    return isAdminSubdomain || isAdminPath;
  }

  /** Admin shell đã có sidebar — ẩn header/footer public để tránh hiện Đăng nhập/Bảng giá khi reload. */
  isAdminShellRoute(): boolean {
    if (!this.isBrowser) return false;
    const pathname = this.currentUrl || window.location.pathname || '/';
    const normalizedPath = pathname.split('?')[0];
    const hostname = window.location.hostname || '';
    if (normalizedPath.startsWith('/login') || normalizedPath.startsWith('/signup') || normalizedPath.startsWith('/forgot-password')) {
      return false;
    }
    return hostname.startsWith('admin.') || normalizedPath.startsWith('/admin/');
  }
}
