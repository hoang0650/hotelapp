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

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:3000/api';
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
        if (decodedToken && decodedToken.user) {
          this.currentUserSubject.next(decodedToken.user);
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

  // Kiểm tra xem người dùng có phải là admin không
  isAdmin(): boolean {
    const user = this.getCurrentUser();
    return !!user && user.role === 'admin';
  }

  // Kiểm tra xem người dùng có phải là business không
  isBusiness(): boolean {
    const user = this.getCurrentUser();
    return !!user && user.role === 'business';
  }

  // Kiểm tra xem người dùng có phải là hotel manager không
  isHotelManager(): boolean {
    const user = this.getCurrentUser();
    return !!user && user.role === 'hotel';
  }

  // Lấy businessId của người dùng hiện tại
  getBusinessId(): string | null {
    const user = this.getCurrentUser();
    return user && user.businessId ? user.businessId : null;
  }

  // Lấy hotelId của người dùng hiện tại
  getHotelId(): string | null {
    const user = this.getCurrentUser();
    return user && user.hotelId ? user.hotelId : null;
  }

  // Kiểm tra xem người dùng có quyền truy cập tài nguyên không
  canAccessResource(resourceId: string): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;

    if (user.role === 'admin') return true;
    
    if (user.role === 'business' && user.businessId) {
      return user.businessId === resourceId;
    }
    
    if (user.role === 'hotel' && user.hotelId) {
      return user.hotelId === resourceId;
    }
    
    return false;
  }
}
