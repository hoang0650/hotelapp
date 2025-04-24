import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, BehaviorSubject, tap } from 'rxjs';
import { User } from '../interfaces/users';

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

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private headers = new HttpHeaders({ 'Content-Type': 'application/json', 'charset': 'UTF-8' })
  private options = { headers: this.headers }
  // private apiUrl = 'https://hotel-app-smp2.onrender.com/users'
  private apiUrl = 'http://localhost:3000/users'
  public loggedIn = new BehaviorSubject<boolean>(false);
  
  constructor(private http: HttpClient) { 
    this.checkToken();
  }

   // Hàm này kiểm tra token và cập nhật trạng thái đăng nhập
   private checkToken(): void {
    const token = localStorage.getItem('access_token');
    const isLoggedIn = !!token; // Kiểm tra xem token có tồn tại không

    this.loggedIn.next(isLoggedIn);
  }

  get isLoggedIn(): Observable<boolean>{
    return this.loggedIn.asObservable();
  }

  //2. sử dụng interface
  signUp(userData: User): Observable<User>{
    return this.http.post<User>(`${this.apiUrl}/signup`,userData);
  }
  
  register(user: any): Observable<any> {
    return this.http.post('/api/user', JSON.stringify(user), this.options)
  }

  login(userData:any): Observable<any>{
    return this.http.post<User>(`${this.apiUrl}/login`,userData);
  }

  logout(): void {
    localStorage.removeItem('access_token');
    this.loggedIn.next(false);
  }
  
  getUserInfor(): Observable <any>{
    const token = localStorage.getItem('access_token');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
    return this.http.get<any>(`${this.apiUrl}/info`, { headers });
  }

  countUsers(): Observable<any>{
    return this.http.get('/api/users/count').pipe(map((res:any)=>{return res.JSON()}))
  }

  addUser(user:any):Observable<any>{
    return this.http.post('/api/user', JSON.stringify(user), this.options)
  }

  getUser(user:any): Observable<any>{
    return this.http.get(`/api/user/${user._id}`).pipe(map((res:any)=>{return res.JSON()}))
  }

  editUser(user:any):Observable<any>{
    return this.http.put(`/api/user/${user._id}`, JSON.stringify(user), this.options)
  }

  deleteUser(user:any): Observable<any>{
    return this.http.delete(`/api/user/${user._id}`, this.options)
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

  /**
   * Lấy danh sách người dùng theo vai trò
   * @param role Vai trò cần lọc (admin, business, hotel, staff, customer)
   * @returns Observable với danh sách người dùng
   */
  getUsersByRole(role: string): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/role/${role}`);
  }

  /**
   * Cập nhật thông tin người dùng
   * @param userId ID của người dùng
   * @param userData Thông tin cần cập nhật
   * @returns Observable với thông tin người dùng đã cập nhật
   */
  updateUser(userId: string, userData: Partial<User>): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/${userId}`, userData);
  }

  /**
   * Khóa hoặc mở khóa tài khoản người dùng
   * @param userId ID của người dùng
   * @param blocked Trạng thái khóa (true: khóa, false: mở khóa)
   * @returns Observable với thông tin người dùng đã cập nhật
   */
  toggleUserBlock(userId: string, blocked: boolean): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${userId}/block`, { blocked });
  }

  /**
   * Đổi mật khẩu người dùng
   * @param userId ID của người dùng
   * @param currentPassword Mật khẩu hiện tại
   * @param newPassword Mật khẩu mới
   * @returns Observable với thông báo kết quả
   */
  changePassword(userId: string, currentPassword: string, newPassword: string): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${userId}/change-password`, {
      currentPassword,
      newPassword
    });
  }
}
