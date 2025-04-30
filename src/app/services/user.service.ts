import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, BehaviorSubject } from 'rxjs';
import { User } from '../interfaces/users';
import { environment } from '../../environments/environment';

export interface BusinessInfo {
  name: string;
  address: string;
  tax_code: number;
  contact?: {
    phone?: string;
    email?: string;
  };
}

export interface BusinessUser {
  username: string;
  email: string;
  password: string;
  businessInfo: BusinessInfo;
}

export interface LoginHistory {
  loginDate: Date;
  ipAddress: string;
}

export interface UserResponse {
  userId: string;
  username: string;
  email: string;
  role: string;
  blocked: boolean;
  createdAt: Date;
  loginHistory?: LoginHistory[];
  businessId?: string;
  hotelId?: string;
  permissions?: string[];
}

export interface SignUpRequest {
  username: string;
  email: string;
  password: string;
  role?: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private headers = new HttpHeaders({ 'Content-Type': 'application/json' });
  private apiUrl = `${environment.apiUrl}/users`;
  public loggedIn = new BehaviorSubject<boolean>(false);
  
  constructor(private http: HttpClient) { 
    this.checkToken();
  }

  private checkToken(): void {
    const token = localStorage.getItem('access_token');
    this.loggedIn.next(!!token);
  }

  get isLoggedIn(): Observable<boolean> {
    return this.loggedIn.asObservable();
  }

  signUp(userData: SignUpRequest): Observable<UserResponse> {
    return this.http.post<UserResponse>(`${this.apiUrl}/signup`, userData);
  }

  login(credentials: { email: string; password: string }): Observable<{ token: string }> {
    return this.http.post<{ token: string }>(`${this.apiUrl}/login`, credentials);
  }

  logout(): void {
    localStorage.removeItem('access_token');
    this.loggedIn.next(false);
  }

  getUserInfo(): Observable<UserResponse> {
    const token = localStorage.getItem('access_token');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
    return this.http.get<UserResponse>(`${this.apiUrl}/info`, { headers });
  }

  getUsersByRole(role: string): Observable<UserResponse[]> {
    return this.http.get<UserResponse[]>(`${this.apiUrl}/role/${role}`);
  }

  updateUser(userId: string, userData: Partial<UserResponse>): Observable<UserResponse> {
    return this.http.put<UserResponse>(`${this.apiUrl}/${userId}`, userData);
  }

  deleteUser(params: { _id: string }): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${params._id}`);
  }

  toggleUserBlock(userId: string, blocked: boolean): Observable<UserResponse> {
    return this.http.patch<UserResponse>(`${this.apiUrl}/${userId}/block`, { blocked });
  }

  changePassword(userId: string, currentPassword: string, newPassword: string): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.apiUrl}/${userId}/change-password`, {
      currentPassword,
      newPassword
    });
  }

  countUsers(): Observable<any>{
    return this.http.get('/api/users/count').pipe(map((res:any)=>{return res.JSON()}))
  }

  addUser(userData: Partial<UserResponse>): Observable<UserResponse> {
    return this.http.post<UserResponse>(this.apiUrl, userData);
  }

  getUser(user:any): Observable<any>{
    return this.http.get(`/api/user/${user._id}`).pipe(map((res:any)=>{return res.JSON()}))
  }

  editUser(user: any): Observable<any> {
    return this.http.put(`/api/user/${user._id}`, JSON.stringify(user), {
      headers: this.headers
    });
  }

  // Thêm các phương thức mới
  
  /**
   * Đăng ký tài khoản doanh nghiệp
   * @param businessUserData Thông tin người dùng doanh nghiệp
   * @returns Observable với dữ liệu người dùng và doanh nghiệp đã tạo
   */
  signUpBusiness(businessUserData: BusinessUser): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/business/signup`, businessUserData);
  }
}
