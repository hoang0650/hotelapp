import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, BehaviorSubject } from 'rxjs';
import { User } from '../interfaces/user';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface BusinessInfo {
  name: string;
  legalName: string;
  taxId: string;
  address: string;
  contactInfo?: {
    email?: string;
    phone?: string;
    website?: string;
  };
}

export interface SignUpRequest {
  username: string;
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
}

export interface BusinessSignUpRequest extends SignUpRequest {
  businessInfo: BusinessInfo;
}

export interface LoginRequest {
  email?: string;
  username?: string;
  password: string;
  twoFactorCode?: string;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: User;
  requireTwoFactor?: boolean;
  userId?: string;
}

export interface ApiResponse<T = any> {
  success?: boolean;
  message: string;
  data?: T;
  error?: string;
  user?: T; // Backend có thể trả về 'user' thay vì 'data'
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiUrl = `${environment.apiUrl}/users`;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  
  constructor(private http: HttpClient, private authService: AuthService) {
    this.checkAuthStatus();
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  private checkAuthStatus(): void {
    const token = this.authService.getToken();
    if (token) {
      this.getUserInfo().subscribe({
        next: (user) => this.currentUserSubject.next(user),
        error: () => {
          this.currentUserSubject.next(null);
        }
      });
    }
  }

  get currentUser(): Observable<User | null> {
    return this.currentUserSubject.asObservable();
  }

  get isLoggedIn(): boolean {
    return !!this.currentUserSubject.value;
  }

  getUserInfo(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/info`, {
      headers: this.getAuthHeaders()
    });
  }

  signUp(userData: SignUpRequest): Observable<any> {
    // Sử dụng route /register cho đăng ký công khai (không yêu cầu authentication)
    return this.http.post<any>(`${this.apiUrl}/register`, userData);
  }

  signUpBusiness(userData: BusinessSignUpRequest): Observable<{user: User, business: any}> {
    return this.http.post<{user: User, business: any}>(`${this.apiUrl}/business/signup`, userData);
  }

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, credentials, { withCredentials: true }).pipe(
      map(response => {
        if (!response.requireTwoFactor) {
          this.currentUserSubject.next(response.user);
        }
        return response;
      })
    );
  }

  forgotPassword(data: { email?: string; username?: string }): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/forgot-password`, data);
  }

  resetPassword(data: { token: string; password: string }): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/reset-password`, data);
  }

  logout(): void {
    this.http.post(`${this.apiUrl}/logout`, {}, { withCredentials: true }).subscribe({
      next: () => {},
      error: () => {}
    });
    this.currentUserSubject.next(null);
  }

  getUsersByRole(role: string): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/role/${role}`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Lấy tất cả users (chỉ admin)
   */
  getAllUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Lấy users theo business ID
   */
  getUsersByBusiness(businessId: string): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/business/${businessId}`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Lấy users theo hotel ID
   */
  getUsersByHotel(hotelId: string): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/hotel/${hotelId}`, {
      headers: this.getAuthHeaders()
    });
  }

  updateUser(userId: string, userData: Partial<User>): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/${userId}`, userData, {
      headers: this.getAuthHeaders()
    });
  }

  updateUserStatus(userId: string, status: User['status']): Observable<ApiResponse<User>> {
    return this.http.put<ApiResponse<User>>(`${this.apiUrl}/${userId}/status`, { status }, {
      headers: this.getAuthHeaders()
    });
  }

  changePassword(userId: string, currentPassword: string, newPassword: string): Observable<ApiResponse> {
    return this.http.put<ApiResponse>(`${this.apiUrl}/${userId}/password`, {
      currentPassword,
      newPassword
    }, {
      headers: this.getAuthHeaders()
    });
  }

  getProfile(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/profile`, {
      headers: this.getAuthHeaders()
    });
  }

  updatePreferences(preferences: User['preferences']): Observable<ApiResponse<{preferences: User['preferences']}>> {
    return this.http.put<ApiResponse<{preferences: User['preferences']}>>(`${this.apiUrl}/preferences`, preferences, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Cập nhật current user (dùng sau khi giao ca)
   */
  setCurrentUser(user: User): void {
    this.currentUserSubject.next(user);
  }

  /**
   * Refresh current user từ token mới
   */
  refreshCurrentUser(): void {
    this.checkAuthStatus();
  }

  /**
   * Cập nhật hồ sơ cá nhân (thông tin cá nhân và ngân hàng)
   */
  updateProfile(profileData: {
    fullName?: string;
    phone?: string;
    avatar?: string;
    bankAccount?: {
      bankName?: string;
      accountNumber?: string;
      accountHolderName?: string;
      branch?: string;
      swiftCode?: string;
      iban?: string;
    };
    personalInfo?: {
      dateOfBirth?: Date;
      gender?: string;
      nationality?: string;
      idCard?: string;
      idCardIssueDate?: Date;
      idCardIssuePlace?: string;
      address?: {
        street?: string;
        ward?: string;
        district?: string;
        city?: string;
        country?: string;
        postalCode?: string;
      };
    };
  }): Observable<ApiResponse<User>> {
    return this.http.put<any>(`${this.apiUrl}/profile`, profileData, {
      headers: this.getAuthHeaders()
    }).pipe(
      map(response => {
        // Backend trả về { success, message, user } hoặc { success, message, data }
        const userData = response.user || response.data;
        if (userData) {
          this.currentUserSubject.next(userData);
        }
        // Normalize response về format ApiResponse
        return {
          success: response.success,
          message: response.message,
          data: userData,
          error: response.error,
          user: userData
        } as ApiResponse<User>;
      })
    );
  }
}
