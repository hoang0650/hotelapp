import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { User } from '../interfaces/user';
import { jwtDecode } from 'jwt-decode';

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
  private apiUrl = 'https://nest-production-8106.up.railway.app/api';
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private tokenExpirationTimer: any;

  constructor(private http: HttpClient, private router: Router) {
    this.loadUserFromLocalStorage();
  }

  private loadUserFromLocalStorage() {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const decodedToken: any = jwtDecode(token);
        
        // Kiểm tra token hết hạn
        if (decodedToken.exp && decodedToken.exp * 1000 < Date.now()) {
          this.logout();
          return;
        }
        
        if (decodedToken && decodedToken.user) {
          this.currentUserSubject.next(decodedToken.user);
        } else if (decodedToken && decodedToken.userId) {
          // Fallback nếu token có format khác
          this.currentUserSubject.next({
            _id: decodedToken.userId,
            username: decodedToken.username,
            email: decodedToken.email,
            role: decodedToken.role,
            status: decodedToken.status,
            businessId: decodedToken.businessId,
            hotelId: decodedToken.hotelId
          } as User);
        }
      } catch (error) {
        console.error('Error decoding token:', error);
        this.logout();
      }
    }
  }

  login(email: string, password: string): Observable<boolean> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/users/login`, { email, password })
      .pipe(
        map(response => {
          if (response && response.token) {
            localStorage.setItem('token', response.token);
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
    localStorage.setItem('token', token);
    this.currentUserSubject.next(user);
  }

  logout(): void {
    localStorage.removeItem('token');
    this.currentUserSubject.next(null);
    this.router.navigate(['/login']);
    if (this.tokenExpirationTimer) {
      clearTimeout(this.tokenExpirationTimer);
    }
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  getToken(): string | null {
    return localStorage.getItem('token');
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
          canManageBusinesses: false,  // Chỉ business của mình
          canManageHotels: true,       // Hotels thuộc business
          canManageRooms: true,        // Rooms thuộc hotels của business
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
          canViewShiftHistory: false,  // Không được xem lịch sử giao ca
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
          canViewShiftHistory: false,
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
}
