import { Component, OnInit, OnDestroy } from '@angular/core';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { User } from '../../interfaces/user';
import { Subscription } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  private subscriptions = new Subscription();

  constructor(
    private userService: UserService,
    private authService: AuthService,
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
}
