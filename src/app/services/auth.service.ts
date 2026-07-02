import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, catchError, tap, take, finalize, shareReplay } from 'rxjs/operators';
import { Router } from '@angular/router';
import { User } from '../interfaces/user';
import { jwtDecode } from 'jwt-decode';
import { environment } from '../../environments/environment';

interface AuthResponse {
  token: string;
  user: User;
}

export type UserRole = 'superadmin' | 'admin' | 'business' | 'hotel' | 'staff' | 'guest';

export interface PermissionRules {
  canManageAll: boolean;
  canManageBusinesses: boolean;
  canManageHotels: boolean;
  canManageRooms: boolean;
  canManageStaff: boolean;
  canViewShiftHistory: boolean;
  canAskAIAboutStaff: boolean;
  canAskAIAboutBusiness: boolean;
  canAskAIAboutHotel: boolean;
  canAskAIAboutRooms: boolean;
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
  private refreshRequest$: Observable<boolean> | null = null;
  public authResolved = new BehaviorSubject<boolean>(false);
  public authResolved$ = this.authResolved.asObservable();

  constructor(private http: HttpClient, private router: Router) {
    this.refreshAccessToken().subscribe(() => {
      this.authResolved.next(true);
    });
  }

  refreshAccessToken(): Observable<boolean> {
    if (this.refreshRequest$) {
      return this.refreshRequest$;
    }

    const startedWithToken = this.inMemoryToken;
    const startedWithUserId = this.currentUserSubject.value?._id || null;

    this.refreshRequest$ = this.http.post<AuthResponse>(`${this.apiUrl}/users/refresh-token`, {}, { withCredentials: true }).pipe(
      map(response => {
        if (response && response.token) {
          this.inMemoryToken = response.token;
          this.currentUserSubject.next(response.user);
          return true;
        }
        return false;
      }),
      catchError(() => {
        const hasNewerSession =
          !startedWithToken &&
          !startedWithUserId &&
          !!this.inMemoryToken &&
          !!this.currentUserSubject.value;

        if (!hasNewerSession) {
          this.inMemoryToken = null;
          this.currentUserSubject.next(null);
        }
        return of(false);
      }),
      finalize(() => {
        this.refreshRequest$ = null;
      }),
      shareReplay(1)
    );

    return this.refreshRequest$;
  }

  login(emailOrUsername: string, password: string): Observable<boolean> {
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
            // Đã xóa dòng lưu localStorage ở đây
            return true;
          }
          return false;
        }),
        catchError(error => { /*...*/ return of(false); })
      );
  }

  loginFromShiftHandover(token: string, user: User): void {
    this.inMemoryToken = token;
    this.currentUserSubject.next(user);
  }

  logout(): void {
    if (this.isLoggingOut) return;
    this.isLoggingOut = true;

    // Giữ lại việc dọn dẹp các ID cấu hình lặt vặt nếu cần, 
    // nhưng tuyệt đối không còn dữ liệu 'user' nào trong localStorage nữa
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('user');
      localStorage.removeItem('staff');
    }

    this.inMemoryToken = null;
    this.currentUserSubject.next(null);
    if (this.tokenExpirationTimer) clearTimeout(this.tokenExpirationTimer);

    this.http.post(`${this.apiUrl}/users/logout`, {}, { withCredentials: true }).subscribe({
      next: () => this.handleLogoutRedirect(),
      error: () => this.handleLogoutRedirect()
    });
  }

  private handleLogoutRedirect(): void {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const protocol = window.location.protocol;
      const port = window.location.port ? `:${window.location.port}` : '';

      if (!hostname.startsWith('admin.')) {
        window.location.href = `${protocol}//admin.phhotel.vn${port}/login`;
      } else {
        // Ép tải lại trang bằng đường dẫn login để xóa sạch bộ nhớ Layout Admin
        window.location.href = '/login';
      }
    } else {
      this.router.navigate(['/login']);
    }

    setTimeout(() => {
      this.isLoggingOut = false;
    }, 1000);
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

  // Lưu thông tin đăng nhập vào LocalStorage
saveCredentials(username: string, password: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('remember_me_user', username);
    localStorage.setItem('remember_me_pass', btoa(password)); // Mã hóa Base64 đơn giản để tránh lưu plain-text
  }
}

// Lấy thông tin đã lưu
getSavedCredentials(): { username: string, password: string } | null {
  if (typeof window !== 'undefined') {
    const user = localStorage.getItem('remember_me_user');
    const pass = localStorage.getItem('remember_me_pass');
    if (user && pass) {
      return { username: user, password: atob(pass) };
    }
  }
  return null;
}

// Xóa thông tin khi đăng xuất
clearCredentials(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('remember_me_user');
    localStorage.removeItem('remember_me_pass');
  }
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

  checkSubdomainAndRedirect(): void {
    if (typeof window === 'undefined') return;

    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port ? `:${window.location.port}` : '';
    const pathname = window.location.pathname;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return;
    }

    const isAdminSubdomain = hostname.startsWith('admin.');
    const adminSubdomain = 'admin.phhotel.vn';

    const redirectToAdmin = () => {
      window.location.href = `${protocol}//${adminSubdomain}${port}/admin/room`;
    };

    // Nhận diện các trang public không yêu cầu token
    const publicPaths = ['/login', '/signup', '/business-signup', '/forgot-password', '/unauthorized', '/notfound'];
    const isPublicPath = publicPaths.some(p => pathname.startsWith(p)) || pathname.startsWith('/reset-password');

    const user = this.getCurrentUser();
    if (user) {
      if (!isAdminSubdomain) {
        redirectToAdmin();
      }
      return;
    }

    // Nếu chưa đăng nhập và đã ở sẵn trang public (/login) thì DỪNG LẠI
    // Không gọi API refreshAccessToken để chống vòng lặp 401
    if (isPublicPath) {
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
        this.router.navigate(['/login']);
      }
    });
  }

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
          canManageBusinesses: false,
          canManageHotels: false,
          canManageRooms: false,
          canManageStaff: true,
          canViewShiftHistory: true,
          canAskAIAboutStaff: true,
          canAskAIAboutBusiness: false,
          canAskAIAboutHotel: true,
          canAskAIAboutRooms: true
        };

      case 'hotel':
        return {
          canManageAll: false,
          canManageBusinesses: false,
          canManageHotels: false,
          canManageRooms: true,
          canManageStaff: true,
          canViewShiftHistory: true,
          canAskAIAboutStaff: true,
          canAskAIAboutBusiness: false,
          canAskAIAboutHotel: false,
          canAskAIAboutRooms: true
        };

      case 'staff':
        return {
          canManageAll: false,
          canManageBusinesses: false,
          canManageHotels: false,
          canManageRooms: false,
          canManageStaff: false,
          canViewShiftHistory: true,
          canAskAIAboutStaff: false,
          canAskAIAboutBusiness: false,
          canAskAIAboutHotel: false,
          canAskAIAboutRooms: true
        };

      default:
        return defaultRules;
    }
  }

  canAccessResource(resourceType: 'business' | 'hotel' | 'room' | 'staff', resourceId?: string): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;

    if (this.isAdmin()) return true;

    switch (resourceType) {
      case 'business':
        return this.isBusiness() && user.businessId === resourceId;

      case 'hotel':
        if (this.isBusiness()) return true;
        return user.hotelId === resourceId;

      case 'room':
        return true;

      case 'staff':
        if (this.isStaff()) return false;
        return this.isBusiness() || this.isHotelManager();

      default:
        return false;
    }
  }

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

  canViewShiftHistory(): boolean {
    return this.getPermissionRules().canViewShiftHistory;
  }

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

  isAccountBlocked(): boolean {
    const user = this.getCurrentUser();
    if (!user) return true;

    if (this.isAdmin()) return false;

    return user.status !== 'active';
  }

  setCurrentUser(user: User): void {
    this.currentUserSubject.next(user);
  }
}
