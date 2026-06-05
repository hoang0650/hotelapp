import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, catchError, tap, take } from 'rxjs/operators';
import { Router } from '@angular/router';
import { User } from '../interfaces/user';
import { jwtDecode } from 'jwt-decode';
import { environment } from '../../environments/environment';

interface AuthResponse {
  token: string;
  user: User;
}

export type UserRole = 'superadmin' | 'admin' | 'business' | 'hotel' | 'staff' | 'guest';

// Quy tắc phân quyền
export interface PermissionRules {
  canManageAll: boolean;           // Quản lý tất cả (admin)
  canManageBusinesses: boolean;    // Quản lý businesses
  canManageHotels: boolean;        // Quản lý hotels
  canManageRooms: boolean;         // Quản lý rooms
  canManageStaff: boolean;         // Quản lý staff
  canViewShiftHistory: boolean;    // Xem lịch sử giao ca
  canAskAIAboutStaff: boolean;     // Hỏi AI về staff
  canAskAIAboutBusiness: boolean;  // Hỏi AI về business
  canAskAIAboutHotel: boolean;     // Hỏi AI về hotel
  canAskAIAboutRooms: boolean;     // Hỏi AI về rooms
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}`;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private tokenExpirationTimer: any;
  private inMemoryToken: string | null = null;
  private isLoggingOut = false;

  constructor(private http: HttpClient, private router: Router) {
    this.refreshAccessToken().subscribe();
  }

  refreshAccessToken(): Observable<boolean> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/users/refresh-token`, {}, { withCredentials: true }).pipe(
      map(response => {
        if (response && response.token) {
          this.inMemoryToken = response.token;
          this.currentUserSubject.next(response.user);
          return true;
        }
        return false;
      }),
      catchError(() => of(false))
    );
  }

  login(emailOrUsername: string, password: string): Observable<boolean> {
    // Kiểm tra xem input có phải là email không (chứa @)
    const isEmail = emailOrUsername.includes('@');
    const loginPayload: any = { password, remember: true };
    
    if (isEmail) {
      loginPayload.email = emailOrUsername;
    } else {
      loginPayload.username = emailOrUsername;
    }
    
    return this.http.post<AuthResponse>(`${this.apiUrl}/users/login`, loginPayload, { withCredentials: true })
      .pipe(
        map(response => {
          if (response && response.token) {
            this.inMemoryToken = response.token;
            this.currentUserSubject.next(response.user);
            return true;
          }
          return false;
        }),
        catchError(error => {
          console.error('Login error:', error);
          return of(false);
        })
      );
  }

  /**
   * Login từ giao ca - cập nhật token mới
   */
  loginFromShiftHandover(token: string, user: User): void {
    this.inMemoryToken = token;
    this.currentUserSubject.next(user);
  }

  logout(): void {
    if (this.isLoggingOut) {
      return;
    }
    this.isLoggingOut = true;

    this.http.post(`${this.apiUrl}/users/logout`, {}, { withCredentials: true }).subscribe({
      next: () => {},
      error: () => {}
    });
    this.inMemoryToken = null;
    this.currentUserSubject.next(null);
    
    // Nếu đang ở admin subdomain, chuyển về domain chính sau khi logout
    if (typeof window !== 'undefined' && window.location.hostname.startsWith('admin.')) {
      const protocol = window.location.protocol;
      const port = window.location.port ? `:${window.location.port}` : '';
      const mainDomain = 'phhotel.vn';
      window.location.href = `${protocol}//${mainDomain}${port}/login`;
    } else {
      if (this.router.url !== '/login') {
        this.router.navigate(['/login']);
      }
    }
    
    if (this.tokenExpirationTimer) {
      clearTimeout(this.tokenExpirationTimer);
    }
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  getToken(): string | null {
    return this.inMemoryToken;
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  // ============ KIỂM TRA VAI TRÒ ============

  isSuperAdmin(): boolean {
    const user = this.getCurrentUser();
    return !!user && user.role === 'superadmin';
  }

  isAdmin(): boolean {
    const user = this.getCurrentUser();
    return !!user && (user.role === 'admin' || user.role === 'superadmin');
  }

  isBusiness(): boolean {
    const user = this.getCurrentUser();
    return !!user && user.role === 'business';
  }

  isHotelManager(): boolean {
    const user = this.getCurrentUser();
    return !!user && user.role === 'hotel';
  }

  isStaff(): boolean {
    const user = this.getCurrentUser();
    return !!user && user.role === 'staff';
  }

  isGuest(): boolean {
    const user = this.getCurrentUser();
    return !!user && user.role === 'guest';
  }

  /**
   * Kiểm tra subdomain và chuyển hướng nếu cần thiết
   * Đã đăng nhập (tất cả các role) -> admin.phhotel.vn
   * Chưa đăng nhập -> phhotel.vn
   */
  checkSubdomainAndRedirect(): void {
    if (typeof window === 'undefined') return;

    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port ? `:${window.location.port}` : '';

    // Không chuyển hướng nếu đang ở localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return;
    }

    const isAdminSubdomain = hostname.startsWith('admin.');
    const mainDomain = 'phhotel.vn';
    const adminSubdomain = 'admin.phhotel.vn';

    const redirectToAdmin = () => {
      window.location.href = `${protocol}//${adminSubdomain}${port}/admin/room`;
    };
    const redirectToMainLogin = () => {
      window.location.href = `${protocol}//${mainDomain}${port}/login`;
    };

    const user = this.getCurrentUser();
    if (user) {
      if (!isAdminSubdomain) {
        redirectToAdmin();
      }
      return;
    }

    this.refreshAccessToken().pipe(take(1)).subscribe(success => {
      const refreshedUser = this.getCurrentUser();

      if (success && refreshedUser) {
        if (!isAdminSubdomain) {
          redirectToAdmin();
        }
        return;
      }

      if (isAdminSubdomain) {
        redirectToMainLogin();
      }
    });
  }

  // ============ LẤY THÔNG TIN ID ============

  getBusinessId(): string | null {
    const user = this.getCurrentUser();
    return user?.businessId || null;
  }

  getHotelId(): string | null {
    const user = this.getCurrentUser();
    return user?.hotelId || null;
  }

  getUserId(): string | null {
    const user = this.getCurrentUser();
    return user?._id || null;
  }

  // ============ PHÂN QUYỀN CHI TIẾT ============

  /**
   * Lấy quy tắc phân quyền dựa trên vai trò
   * - Admin: Full quyền (quản lý tất cả business, hotel, room, staff, user)
   * - Business: Chỉ quản lý hotel, room, staff thuộc sở hữu của business đó
   * - Hotel/Manager: Chỉ quản lý room và staff thuộc hotel đó
   * - Staff: Chỉ xem và thao tác với room, không được phép hỏi về business/hotel/staff khác
   */
  getPermissionRules(): PermissionRules {
    const user = this.getCurrentUser();
    const role = user?.role as UserRole;

    const defaultRules: PermissionRules = {
      canManageAll: false,
      canManageBusinesses: false,
      canManageHotels: false,
      canManageRooms: false,
      canManageStaff: false,
      canViewShiftHistory: false,
      canAskAIAboutStaff: false,
      canAskAIAboutBusiness: false,
      canAskAIAboutHotel: false,
      canAskAIAboutRooms: false
    };

    switch (role) {
      case 'superadmin':
      case 'admin':
        return {
          canManageAll: true,
          canManageBusinesses: true,
          canManageHotels: true,
          canManageRooms: true,
          canManageStaff: true,
          canViewShiftHistory: true,
          canAskAIAboutStaff: true,
          canAskAIAboutBusiness: true,
          canAskAIAboutHotel: true,
          canAskAIAboutRooms: true
        };

      case 'business':
        return {
          canManageAll: false,
          canManageBusinesses: false,  // Business KHÔNG thể tạo/cập nhật doanh nghiệp, chỉ xem
          canManageHotels: false,      // Business KHÔNG thể tạo/cập nhật khách sạn, chỉ xem
          canManageRooms: false,       // Business KHÔNG thể tạo/cập nhật phòng, chỉ xem
          canManageStaff: true,        // Staff thuộc hotels của business
          canViewShiftHistory: true,   // Được xem lịch sử giao ca
          canAskAIAboutStaff: true,    // Được hỏi AI về staff thuộc business
          canAskAIAboutBusiness: false, // Không được hỏi về business khác
          canAskAIAboutHotel: true,    // Được hỏi về hotels thuộc business
          canAskAIAboutRooms: true
        };

      case 'hotel':
        return {
          canManageAll: false,
          canManageBusinesses: false,
          canManageHotels: false,      // Chỉ hotel của mình
          canManageRooms: true,        // Rooms thuộc hotel
          canManageStaff: true,        // Staff thuộc hotel
          canViewShiftHistory: true,   // Được xem lịch sử giao ca của hotel
          canAskAIAboutStaff: true,    // Được hỏi AI về staff thuộc hotel
          canAskAIAboutBusiness: false,
          canAskAIAboutHotel: false,   // Không được hỏi về hotel khác
          canAskAIAboutRooms: true
        };

      case 'staff':
        return {
          canManageAll: false,
          canManageBusinesses: false,
          canManageHotels: false,
          canManageRooms: false,       // Chỉ xem và thao tác cơ bản
          canManageStaff: false,       // Không được quản lý staff
          canViewShiftHistory: true,   // Được xem lịch sử giao ca
          canAskAIAboutStaff: false,   // Không được hỏi về staff khác
          canAskAIAboutBusiness: false,
          canAskAIAboutHotel: false,
          canAskAIAboutRooms: true     // Chỉ được hỏi về rooms
        };

      default:
        return defaultRules;
    }
  }

  /**
   * Kiểm tra xem người dùng có quyền truy cập tài nguyên không
   */
  canAccessResource(resourceType: 'business' | 'hotel' | 'room' | 'staff', resourceId?: string): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;

    // Admin có quyền truy cập tất cả
    if (this.isAdmin()) return true;

    switch (resourceType) {
      case 'business':
        // Business chỉ có thể truy cập business của mình
        return this.isBusiness() && user.businessId === resourceId;

      case 'hotel':
        // Business có thể truy cập hotels thuộc business
        // Hotel manager có thể truy cập hotel của mình
        // Staff có thể truy cập hotel của mình
        if (this.isBusiness()) return true; // Sẽ kiểm tra chi tiết ở backend
        return user.hotelId === resourceId;

      case 'room':
        // Tất cả user đã đăng nhập có thể truy cập rooms (với giới hạn scope)
        return true;

      case 'staff':
        // Business và hotel manager có thể truy cập staff
        // Staff không thể quản lý staff khác
        if (this.isStaff()) return false;
        return this.isBusiness() || this.isHotelManager();

      default:
        return false;
    }
  }

  /**
   * Kiểm tra quyền cho AI queries
   * - Business hỏi AI về staff thuộc business -> được phép
   * - Staff không được phép hỏi về business/hotel/staff khác nhưng được phép hỏi về room
   */
  canAskAIAbout(targetType: 'business' | 'hotel' | 'staff' | 'room' | 'booking' | 'service'): boolean {
    const rules = this.getPermissionRules();

    switch (targetType) {
      case 'business':
        return rules.canAskAIAboutBusiness;
      case 'hotel':
        return rules.canAskAIAboutHotel;
      case 'staff':
        return rules.canAskAIAboutStaff;
      case 'room':
      case 'booking':
      case 'service':
        return rules.canAskAIAboutRooms;
      default:
        return false;
    }
  }

  /**
   * Kiểm tra xem có thể xem lịch sử giao ca không
   * Chỉ admin hoặc business được phép xem
   */
  canViewShiftHistory(): boolean {
    return this.getPermissionRules().canViewShiftHistory;
  }

  /**
   * Lấy scope cho AI queries
   */
  getAIScope(): { role: UserRole; businessId?: string; hotelId?: string; allowedTargets: string[] } {
    const user = this.getCurrentUser();
    const role = (user?.role || 'guest') as UserRole;

    const accessRules: Record<UserRole, string[]> = {
      'superadmin': ['all'],
      'admin': ['all'],
      'business': ['hotel', 'room', 'staff', 'booking', 'service', 'report'],
      'hotel': ['room', 'staff', 'booking', 'service', 'report'],
      'staff': ['room', 'booking', 'service'],
      'guest': []
    };

    return {
      role,
      businessId: user?.businessId,
      hotelId: user?.hotelId,
      allowedTargets: accessRules[role] || []
    };
  }

  /**
   * Kiểm tra xem tài khoản có bị block không (blocking cascade)
   * - Admin không thể bị block
   * - Business bị block -> tất cả cấp dưới bị block
   * - Hotel bị block -> staff bị block
   */
  isAccountBlocked(): boolean {
    const user = this.getCurrentUser();
    if (!user) return true;

    // Admin không thể bị block
    if (this.isAdmin()) return false;

    // Kiểm tra status của user
    return user.status !== 'active';
  }

  /**
   * Cập nhật current user (dùng sau khi cập nhật profile)
   */
  setCurrentUser(user: User): void {
    this.currentUserSubject.next(user);
  }
}
