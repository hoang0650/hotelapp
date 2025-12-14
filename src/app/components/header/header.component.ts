import { Component, OnInit, OnDestroy } from '@angular/core';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { NotificationsService } from '../../services/notifications.service';
import { User } from '../../interfaces/user';
import { Subscription } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { Announcement } from '../../services/notifications.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  private subscriptions = new Subscription();
  
  // Notifications
  notifications: Announcement[] = [];
  unreadCount = 0;
  isNotificationDrawerVisible = false;

  constructor(
    private userService: UserService,
    private authService: AuthService,
    private notificationsService: NotificationsService,
    public translate: TranslateService
  ) {
    // Set default language
    const savedLang = localStorage.getItem('language') || 'vi';
    translate.setDefaultLang('vi');
    translate.use(savedLang);
  }

  ngOnInit(): void {
    // Đăng ký lắng nghe từ UserService
    this.subscriptions.add(
      this.userService.currentUser.subscribe(user => {
        this.currentUser = user;
      })
    );
    
    // Đăng ký lắng nghe từ AuthService (cho giao ca)
    this.subscriptions.add(
      this.authService.currentUser$.subscribe(user => {
        if (user) {
          this.currentUser = user;
        }
      })
    );
    
    // Load notifications ngay khi component khởi tạo
    this.notificationsService.loadAnnouncements();
    
    // Đăng ký lắng nghe notifications
    this.subscriptions.add(
      this.notificationsService.announcements$.subscribe(announcements => {
        this.notifications = this.notificationsService.getAllNotifications();
      })
    );
    
    this.subscriptions.add(
      this.notificationsService.unreadCount$.subscribe(count => {
        this.unreadCount = count;
      })
    );
    
    // Load notifications mỗi 5 phút
    setInterval(() => {
      this.notificationsService.loadAnnouncements();
    }, 5 * 60 * 1000);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get isLoggedIn(): boolean {
    return this.userService.isLoggedIn || !!this.currentUser;
  }

  // Lấy tên hiển thị - ưu tiên fullName > username > email
  get displayName(): string {
    if (!this.currentUser) return '';
    return this.currentUser.fullName || this.currentUser.username || this.currentUser.email || '';
  }

  // Lấy vai trò người dùng
  get userRole(): string {
    if (!this.currentUser) return '';
    const role = this.currentUser.role || '';
    // Sử dụng translate cho role labels
    const roleKey = `ROLES.${role.toUpperCase()}`;
    return this.translate.instant(roleKey) || role;
  }

  // Chuyển đổi ngôn ngữ
  switchLanguage(lang: string): void {
    this.translate.use(lang);
    localStorage.setItem('language', lang);
  }

  logout(): void {
    this.userService.logout();
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
    this.notificationsService.markAsRead(announcement.id);
  }

  markAllAsRead(): void {
    this.notificationsService.markAllAsRead();
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
    return d.toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  isRead(announcementId: string): boolean {
    // Lấy danh sách đã đọc từ localStorage
    const stored = localStorage.getItem('readAnnouncements');
    const readAnnouncements = stored ? JSON.parse(stored) : [];
    return readAnnouncements.includes(announcementId);
  }

  getNotificationTypeLabel(type: string): string {
    const labelMap: { [key: string]: string } = {
      'maintenance': 'Bảo trì',
      'update': 'Cập nhật',
      'info': 'Thông tin',
      'warning': 'Cảnh báo',
      'success': 'Thành công'
    };
    return labelMap[type] || 'Thông báo';
  }
}
