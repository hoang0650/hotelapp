import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, BehaviorSubject } from 'rxjs';
import { User } from '../interfaces/user';
import { environment } from '../../environments/environment';

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
  email: string;
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
  message: string;
  data?: T;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiUrl = `${environment.apiUrl}/users`;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  
  constructor(private http: HttpClient) {
    this.checkAuthStatus();
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  private checkAuthStatus(): void {
    const token = localStorage.getItem('token');
    if (token) {
      this.getUserInfo().subscribe({
        next: (user) => this.currentUserSubject.next(user),
        error: () => {
          localStorage.removeItem('token');
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

  signUp(userData: SignUpRequest): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/signup`, userData);
  }

  signUpBusiness(userData: BusinessSignUpRequest): Observable<{user: User, business: any}> {
    return this.http.post<{user: User, business: any}>(`${this.apiUrl}/business/signup`, userData);
  }

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, credentials).pipe(
      map(response => {
        if (!response.requireTwoFactor) {
          localStorage.setItem('token', response.token);
          this.currentUserSubject.next(response.user);
        }
        return response;
      })
    );
  }

  logout(): void {
    localStorage.removeItem('token');
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
}
