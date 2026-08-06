import { Component, OnInit, OnDestroy, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { NotificationsService } from '../../services/notifications.service';
import { SettingsService, NotificationSettings } from '../../services/settings.service';
import { HotelService } from '../../services/hotel.service';
import { User } from '../../interfaces/user';
import { Subscription, forkJoin, of } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { TranslationService } from '../../services/translation.service';
import { Announcement } from '../../services/notifications.service';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { resolveBlogImageUrl } from '../../helpers/blog-image-url';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  private subscriptions = new Subscription();
  private refreshIntervalId: any = null;
  isAdminSubdomain: boolean = false;
  
  // Notifications
  notifications: Announcement[] = [];
  filteredNotifications: Announcement[] = [];
  unreadCount = 0;
  unreadCounts = { total: 0, system: 0, hotel: 0 };
  activeTab: 'all' | 'system' | 'hotel' = 'all';
  isNotificationDrawerVisible = false;
  notificationSettings: NotificationSettings | null = null;
  areNotificationsEnabled = true; // Mặc định bật
  isAuthResolved: boolean = false;
  private lastNotificationUserId: string | null = null;
  
  // Tab titles for notifications
  tabAllTitle = '';
  tabSystemTitle = '';
  tabHotelTitle = '';
  
  // Computed tab titles with counts
  get tabAllTitleWithCount(): string {
    return this.tabAllTitle + (this.unreadCounts.total > 0 ? ` (${this.unreadCounts.total})` : '');
  }
  
  get tabSystemTitleWithCount(): string {
    return this.tabSystemTitle + (this.unreadCounts.system > 0 ? ` (${this.unreadCounts.system})` : '');
  }
  
  get tabHotelTitleWithCount(): string {
    return this.tabHotelTitle + (this.unreadCounts.hotel > 0 ? ` (${this.unreadCounts.hotel})` : '');
  }

  constructor(
    private userService: UserService,
    public authService: AuthService, 
    private notificationsService: NotificationsService,
    private settingsService: SettingsService,
    private hotelService: HotelService,
    public translate: TranslateService,
    public translationService: TranslationService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: any
  ) {
    translate.setDefaultLang('vi');
    translate.use(this.translationService.getCurrentLang());
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.isAdminSubdomain = window.location.hostname.startsWith('admin.');
    }
    // Initialize tab titles
    this.updateTabTitles();
    
    // Đăng ký lắng nghe từ UserService
    this.subscriptions.add(
    this.authService.authResolved$.subscribe(resolved => {
      this.isAuthResolved = resolved;
    })
  );
    
    // Đăng ký lắng nghe từ AuthService (cho giao ca)
    this.subscriptions.add(
      this.authService.currentUser$.subscribe(user => {
        this.currentUser = user;
        this.handleNotificationBootstrap(user);
      })
    );
    
    // Subscribe to language changes to update tab titles
    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => {
        this.updateTabTitles();
        this.cdr.detectChanges();
      })
    );
    
    if (isPlatformBrowser(this.platformId)) {
      this.subscriptions.add(
        this.notificationsService.announcements$.subscribe(() => {
          this.updateNotifications();
        })
      );
    }
  }

  private handleNotificationBootstrap(user: User | null): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const userId = user?._id || null;
    const hasSession = !!user && !!this.authService.getToken();

    if (!hasSession) {
      this.lastNotificationUserId = null;
      this.stopNotificationRefresh();
      this.notificationSettings = null;
      this.notifications = [];
      this.filteredNotifications = [];
      this.unreadCount = 0;
      this.unreadCounts = { total: 0, system: 0, hotel: 0 };
      return;
    }

    if (this.lastNotificationUserId === userId && this.refreshIntervalId) {
      return;
    }

    this.lastNotificationUserId = userId;
    // Không tranh bandwidth với board sau login — Redis/Mongo đang chậm
    setTimeout(() => {
      if (this.lastNotificationUserId !== userId || !this.authService.getToken()) return;
      this.loadNotificationSettings();
      this.notificationsService.loadAnnouncements();
      this.startNotificationRefresh();
    }, 3500);
  }

  private startNotificationRefresh(): void {
    this.stopNotificationRefresh();
    this.refreshIntervalId = setInterval(() => {
      if (!this.authService.getCurrentUser() || !this.authService.getToken()) {
        this.stopNotificationRefresh();
        return;
      }

      this.notificationsService.loadAnnouncements();
      this.loadNotificationSettings();
    }, 5 * 60 * 1000);
  }

  private stopNotificationRefresh(): void {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
  }
  
  private updateTabTitles(): void {
    this.tabAllTitle = this.getTranslatedOr('NOTIFICATIONS.ALL', 'Tất cả');
    this.tabSystemTitle = this.getTranslatedOr('NOTIFICATIONS.SYSTEM', 'Hệ thống');
    this.tabHotelTitle = this.getTranslatedOr('NOTIFICATIONS.HOTEL', 'Khách sạn');
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.stopNotificationRefresh();
  }

  get isLoggedIn(): boolean {
    return !!(this.currentUser && this.authService.getToken()) || this.userService.isLoggedIn;
  }

  get displayName(): string {
    if (!this.currentUser) return '';
    return this.currentUser.fullName || this.currentUser.username || this.currentUser.email || '';
  }

  get userRole(): string {
    if (!this.currentUser) return '';
    const role = this.currentUser.role || '';
    const roleKey = `ROLES.${role.toUpperCase()}`;
    return this.getTranslatedOr(roleKey, role);
  }

  private getTranslatedOr(key: string, fallback: string): string {
    const v = this.translate.instant(key);
    if (!v || v === key) return fallback;
    return v;
  }

  switchLanguage(lang: string): void {
    console.log(`Header: Switching language to ${lang}`);
    this.translationService.switchLanguage(lang);
    
    setTimeout(() => {
      this.updateTabTitles();
      this.cdr.detectChanges();
      if (isPlatformBrowser(this.platformId)) {
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
      }
      console.log(`Header: Language switch completed, current lang: ${this.translate.currentLang}`);
    }, 200);
  }

  logout(): void {
    // Chỉ gọi lệnh dọn dẹp, không chuyển trang ở đây để tránh hủy Request API Logout
    this.userService.clearCurrentUser();
    this.authService.logout();
  }

  // Notifications
  openNotificationDrawer(): void {
    this.isNotificationDrawerVisible = true;
  }

  closeNotificationDrawer(): void {
    this.isNotificationDrawerVisible = false;
  }

  markAsRead(announcement: Announcement): void {
    this.notificationsService.markAsRead(announcement.id).subscribe({
      next: () => {
        announcement.isRead = true;
        this.loadUnreadCounts();
        this.filterNotificationsByTab();
      },
      error: (error) => {
        console.error('Error marking as read:', error);
      }
    });
  }

  markAllAsRead(): void {
    this.notificationsService.markAllAsRead().subscribe({
      next: () => {
        this.notifications.forEach(n => n.isRead = true);
        this.loadUnreadCounts();
        this.filterNotificationsByTab();
      },
      error: (error) => {
        console.error('Error marking all as read:', error);
      }
    });
  }

  private loadNotificationSettings(): void {
    if (this.currentUser?.hotelId) {
      forkJoin({
        hotel: this.hotelService.getHotelById(this.currentUser.hotelId, { lite: true }).pipe(
          catchError(() => of(null))
        ),
        system: this.settingsService.getSettingsByType('notification').pipe(
          catchError(() => of({ success: false, data: null }))
        )
      }).subscribe({
        next: ({ hotel, system }) => {
          if (hotel?.settings?.notificationSettings) {
            const hotelNotif = hotel.settings.notificationSettings;
            this.notificationSettings = {
              enableEmailNotifications: hotelNotif.enableEmailNotifications ?? true,
              enableSMSNotifications: hotelNotif.enableSMSNotifications ?? false,
              enablePushNotifications: hotelNotif.enablePushNotifications ?? true,
              notifyOnBooking: hotelNotif.notifyOnBooking ?? true,
              notifyOnCheckin: hotelNotif.notifyOnCheckin ?? true,
              notifyOnCheckout: hotelNotif.notifyOnCheckout ?? true,
              notifyOnPayment: hotelNotif.notifyOnPayment ?? true,
              notifyOnCancellation: hotelNotif.notifyOnCancellation ?? true,
              notifyOnLowInventory: hotelNotif.notifyOnLowInventory ?? true,
              notifyOnSystemError: hotelNotif.notifyOnSystemError ?? true,
              notificationEmail: hotelNotif.notificationEmail ?? ''
            };
          } else if (system?.success && system?.data) {
            this.notificationSettings = system.data;
          } else {
            this.notificationSettings = {
              enableEmailNotifications: true,
              enableSMSNotifications: false,
              enablePushNotifications: true,
              notifyOnBooking: true,
              notifyOnCheckin: true,
              notifyOnCheckout: true,
              notifyOnPayment: true,
              notifyOnCancellation: true,
              notifyOnLowInventory: true,
              notifyOnSystemError: true,
              notificationEmail: ''
            };
          }
          this.updateNotificationsEnabled();
          this.updateNotifications();
        }
      });
    } else {
      this.settingsService.getSettingsByType('notification').subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.notificationSettings = response.data;
          } else {
            this.notificationSettings = {
              enableEmailNotifications: true,
              enableSMSNotifications: false,
              enablePushNotifications: true,
              notifyOnBooking: true,
              notifyOnCheckin: true,
              notifyOnCheckout: true,
              notifyOnPayment: true,
              notifyOnCancellation: true,
              notifyOnLowInventory: true,
              notifyOnSystemError: true,
              notificationEmail: ''
            };
          }
          this.updateNotificationsEnabled();
          this.updateNotifications();
        },
        error: () => {
          this.notificationSettings = {
            enableEmailNotifications: true,
            enableSMSNotifications: false,
            enablePushNotifications: true,
            notifyOnBooking: true,
            notifyOnCheckin: true,
            notifyOnCheckout: true,
            notifyOnPayment: true,
            notifyOnCancellation: true,
            notifyOnLowInventory: true,
            notifyOnSystemError: true,
            notificationEmail: ''
          };
          this.updateNotificationsEnabled();
          this.updateNotifications();
        }
      });
    }
  }

  private updateNotificationsEnabled(): void {
    if (!this.notificationSettings) {
      this.areNotificationsEnabled = true;
      return;
    }
    
    this.areNotificationsEnabled = 
      this.notificationSettings.enableEmailNotifications ||
      this.notificationSettings.enableSMSNotifications ||
      this.notificationSettings.enablePushNotifications;
  }

  private updateNotifications(): void {
    if (!this.areNotificationsEnabled) {
      this.notifications = [];
      this.filteredNotifications = [];
      this.unreadCount = 0;
      return;
    }
    
    const allNotifications = this.notificationsService.getAllNotifications();
    
    if (this.notificationSettings) {
      this.notifications = allNotifications.filter(notification => {
        if (!notification.notificationType || notification.notificationType === 'general') {
          return true;
        }
        
        const notificationTypeMap: { [key: string]: keyof NotificationSettings } = {
          'booking': 'notifyOnBooking',
          'checkin': 'notifyOnCheckin',
          'checkout': 'notifyOnCheckout',
          'payment': 'notifyOnPayment',
          'cancellation': 'notifyOnCancellation',
          'lowInventory': 'notifyOnLowInventory',
          'systemError': 'notifyOnSystemError'
        };
        
        const notifyOnKey = notificationTypeMap[notification.notificationType];
        if (notifyOnKey && this.notificationSettings) {
          return this.notificationSettings[notifyOnKey] === true;
        }
        
        return true;
      });
    } else {
      this.notifications = allNotifications;
    }
    
    this.filterNotificationsByTab();
    this.loadUnreadCounts();
  }
  
  filterNotificationsByTab(): void {
    if (!this.notifications) {
      this.filteredNotifications = [];
      return;
    }
    if (this.activeTab === 'all') {
      this.filteredNotifications = this.notifications;
    } else if (this.activeTab === 'system') {
      this.filteredNotifications = this.notifications.filter(n => 
        !n.targetType || n.targetType === 'system'
      );
    } else if (this.activeTab === 'hotel') {
      this.filteredNotifications = this.notifications.filter(n => 
        n.targetType === 'hotel'
      );
    }
  }
  
  switchTab(tab: 'all' | 'system' | 'hotel'): void {
    this.activeTab = tab;
    this.filterNotificationsByTab();
  }
  
  onTabChange(event: any): void {
    const index = typeof event === 'number' ? event : (event?.index ?? 0);
    if (index === 0) {
      this.switchTab('all');
    } else if (index === 1) {
      this.switchTab('system');
    } else if (index === 2) {
      this.switchTab('hotel');
    }
  }
  
  loadUnreadCounts(): void {
    this.notificationsService.getUnreadCount().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.unreadCounts = response.data;
          this.unreadCount = response.data.total;
          this.updateTabTitles();
          this.cdr.detectChanges();
        }
      },
      error: (error) => {
        console.error('Error loading unread counts:', error);
      }
    });
  }

  getNotificationIcon(type: string): string {
    const iconMap: { [key: string]: string } = {
      'maintenance': 'tool',
      'update': 'sync',
      'info': 'info-circle',
      'warning': 'exclamation-circle',
      'success': 'check-circle'
    };
    return iconMap[type] || 'bell';
  }

  getNotificationColor(type: string): string {
    const colorMap: { [key: string]: string } = {
      'maintenance': 'orange',
      'update': 'blue',
      'info': 'cyan',
      'warning': 'gold',
      'success': 'green'
    };
    return colorMap[type] || 'default';
  }

  formatDate(date: Date | string): string {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    const currentLang = this.translate.currentLang || 'vi';
    const localeMap: { [key: string]: string } = {
      'vi': 'vi-VN',
      'en': 'en-US',
      'de': 'de-DE'
    };
    const locale = localeMap[currentLang] || 'vi-VN';
    return d.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getNotificationTypeLabel(type: string): string {
    const labelMap: { [key: string]: string } = {
      'maintenance': this.translate.instant('NOTIFICATIONS.TYPE_MAINTENANCE'),
      'update': this.translate.instant('NOTIFICATIONS.TYPE_UPDATE'),
      'info': this.translate.instant('NOTIFICATIONS.TYPE_INFO'),
      'warning': this.translate.instant('NOTIFICATIONS.TYPE_WARNING'),
      'success': this.translate.instant('NOTIFICATIONS.TYPE_SUCCESS')
    };
    return labelMap[type] || this.translate.instant('NOTIFICATIONS.TYPE_GENERAL');
  }

  apiBaseUrl = environment.apiUrl;
  cdnBaseUrl = (environment as { cdnUrl?: string }).cdnUrl || 'https://cdn.phhotel.vn';

  getImageUrl(urlOrId: string | null | undefined): string {
    return resolveBlogImageUrl(urlOrId, this.apiBaseUrl, this.cdnBaseUrl);
  }

  getAvatarUrl(): string {
    if (!this.currentUser) return 'assets/images/avatar.jpg';
    const avatar = this.currentUser.avatar || (this.currentUser as any).avatarId;
    if (!avatar) return 'assets/images/avatar.jpg';
    return this.getImageUrl(avatar);
  }

  handleImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.src = 'https://mdbcdn.b-cdn.net/img/new/avatars/2.webp';
    }
  }
}
