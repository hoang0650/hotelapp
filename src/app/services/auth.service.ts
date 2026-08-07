import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, catchError, tap, take, finalize, shareReplay, timeout } from 'rxjs/operators';
import { Router } from '@angular/router';
import { User } from '../interfaces/user';
import { jwtDecode } from 'jwt-decode';
import { environment } from '../../environments/environment';
import { getCookie, removeCookie, setCookie } from '../utils/cookie-storage';

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
    // Phải chạy trước refresh — iframe logout từ domain kia
    this.consumeClearSessionRequest();
    // Session từ httpOnly refresh cookie + memory — không dùng sessionStorage/localStorage
    this.refreshAccessToken().subscribe(() => {
      this.authResolved.next(true);
    });
  }

  private isJwtStillValid(token: string): boolean {
    try {
      const decoded: any = jwtDecode(token);
      const exp = Number(decoded?.exp || 0);
      if (!exp) return true;
      return exp * 1000 > Date.now() + 5000;
    } catch {
      return false;
    }
  }

  private hasValidStoredSession(): boolean {
    return !!(this.inMemoryToken && this.currentUserSubject.value && this.isJwtStillValid(this.inMemoryToken));
  }

  refreshAccessToken(): Observable<boolean> {
    if (this.refreshRequest$) {
      return this.refreshRequest$;
    }

    this.refreshRequest$ = this.http.post<AuthResponse>(`${this.apiUrl}/users/refresh-token`, {}, { withCredentials: true }).pipe(
      timeout(8000),
      map(response => {
        if (response && response.token) {
          this.inMemoryToken = response.token;
          this.currentUserSubject.next(response.user);
          return true;
        }
        return this.hasValidStoredSession();
      }),
      catchError((err) => {
        const status = err?.status;
        // Cookie refresh hết hạn / không còn → xóa session memory
        if (status === 401 || status === 403) {
          this.inMemoryToken = null;
          this.currentUserSubject.next(null);
          return of(false);
        }
        // Lỗi mạng tạm thời: giữ phiên JWT còn hạn trong memory
        if (this.hasValidStoredSession()) {
          return of(true);
        }
        this.inMemoryToken = null;
        this.currentUserSubject.next(null);
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

  /** Chỉ xóa phiên local, không redirect (dùng trên trang public khi 401). */
  clearLocalSessionOnly(): void {
    this.inMemoryToken = null;
    this.currentUserSubject.next(null);
  }

  logout(): void {
    if (this.isLoggingOut) return;
    this.isLoggingOut = true;

    this.inMemoryToken = null;
    this.currentUserSubject.next(null);
    if (this.tokenExpirationTimer) clearTimeout(this.tokenExpirationTimer);

    this.http.post(`${this.apiUrl}/users/logout`, {}, { withCredentials: true }).subscribe({
      next: () => this.handleLogoutRedirect(),
      error: () => this.handleLogoutRedirect()
    });
  }

  /** Gọi sớm khi load trang với ?clear_session=1 (iframe từ logout ở domain kia — legacy). */
  consumeClearSessionRequest(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('clear_session') !== '1') {
        return false;
      }
      this.inMemoryToken = null;
      this.currentUserSubject.next(null);
      // Dọn query để không lặp lại khi user F5
      params.delete('clear_session');
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
      window.history.replaceState({}, '', nextUrl);
      return true;
    } catch {
      return false;
    }
  }

  private handleLogoutRedirect(): void {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const pathname = window.location.pathname || '/';
      const marketingPaths = ['/home', '/pricing', '/blog', '/contact', '/about-us', '/privacy-policy', '/terms-of-service'];
      const isMarketingPage =
        pathname === '/' ||
        marketingPaths.some(p => pathname === p || pathname.startsWith(`${p}/`));

      // Đang ở trang marketing công khai → chỉ clear session, không đẩy sang admin login
      if (!hostname.startsWith('admin.') && isMarketingPage) {
        this.isLoggingOut = false;
        return;
      }

      if (!hostname.startsWith('admin.')) {
        window.location.href = 'https://admin.phhotel.vn/login';
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

  /** Remember-me: chỉ lưu username vào cookie (không lưu mật khẩu). */
  saveCredentials(username: string, _password?: string): void {
    setCookie('remember_me_user', username, { maxAgeSec: 30 * 24 * 60 * 60 });
    removeCookie('remember_me_pass');
  }

  getSavedCredentials(): { username: string, password: string } | null {
    const user = getCookie('remember_me_user');
    if (user) {
      return { username: user, password: '' };
    }
    return null;
  }

  clearCredentials(): void {
    removeCookie('remember_me_user');
    removeCookie('remember_me_pass');
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
    const pathname = window.location.pathname;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return;
    }

    const isAdminSubdomain = hostname.startsWith('admin.');
    const adminSubdomain = 'admin.phhotel.vn';

    const redirectToAdmin = () => {
      window.location.href = `https://${adminSubdomain}/admin/room`;
    };

    // Trang public / marketing: không ép sang admin hay /login
    const publicPaths = [
      '/login',
      '/signup',
      '/business-signup',
      '/forgot-password',
      '/unauthorized',
      '/notfound',
      '/home',
      '/pricing',
      '/blog',
      '/contact',
      '/about-us',
      '/privacy-policy',
      '/terms-of-service'
    ];
    const isPublicPath =
      pathname === '/' ||
      publicPaths.some(p => pathname === p || pathname.startsWith(`${p}/`)) ||
      pathname.startsWith('/reset-password');

    if (isPublicPath) {
      return;
    }

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
        this.router.navigate(['/login']);
      }
    });
  }

  getBusinessId(): string | null {
    const user = this.getCurrentUser();
    const raw = user?.businessId as any;
    if (!raw) return null;
    if (typeof raw === 'object' && raw._id) return String(raw._id);
    const s = String(raw).trim();
    if (!s || s === '[object Object]') return null;
    return s;
  }

  getUserId(): string | null {
    const user = this.getCurrentUser();
    const id = user?._id as any;
    if (!id) return null;
    if (typeof id === 'object' && id.toString) return String(id);
    return String(id);
  }

  getHotelId(): string | null {
    const user = this.getCurrentUser();
    const raw = user?.hotelId as any;
    if (!raw) return null;
    if (typeof raw === 'object' && raw._id) return String(raw._id);
    return String(raw);
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
