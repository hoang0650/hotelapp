import { Component, OnInit, OnDestroy } from '@angular/core';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { User } from '../../interfaces/user';
import { Subscription } from 'rxjs';

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
    private authService: AuthService
  ) {}

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
    const roleLabels: Record<string, string> = {
      'superadmin': 'Super Admin',
      'admin': 'Admin',
      'business': 'Chủ doanh nghiệp',
      'hotel': 'Quản lý khách sạn',
      'staff': 'Nhân viên',
      'guest': 'Khách'
    };
    return roleLabels[this.currentUser.role] || this.currentUser.role || '';
  }

  logout(): void {
    this.userService.logout();
    this.authService.logout();
  }
}
