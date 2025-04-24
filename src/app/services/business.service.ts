import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Business } from '../interfaces/business';
import { AuthService } from './auth.service';


@Injectable({
  providedIn: 'root'
})
export class BusinessService {
  // private apiUrl = 'https://hotel-app-smp2.onrender.com/businesses';
  private apiUrl = 'http://localhost:3000/businesses'

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  // Lấy tất cả doanh nghiệp
  getBusinesses(): Observable<Business[]> {
    // API backend đã thực hiện populate hotels
    return this.http.get<Business[]>(this.apiUrl);
  }

  // Lấy doanh nghiệp theo ID
  getBusinessById(id: string): Observable<Business> {
    return this.http.get<Business>(`${this.apiUrl}/${id}`);
  }

  // Lấy thông tin doanh nghiệp hiện tại
  getBusinessInfo(): Observable<Business> {
    const currentUser = this.authService.getCurrentUser();
    // Nếu có userId, lấy doanh nghiệp theo ownerId
    if (currentUser && currentUser._id) {
      return this.http.get<Business>(`${this.apiUrl}/owner/${currentUser._id}`);
    }
    // Nếu không có userId, trả về doanh nghiệp đầu tiên (tạm thời)
    return this.http.get<Business>(`${this.apiUrl}/default`);
  }

  // Tạo doanh nghiệp mới
  createBusiness(business: Business): Observable<Business> {
    // Lấy thông tin người dùng hiện tại
    const currentUser = this.authService.getCurrentUser();
    
    // Thêm ownerId vào business nếu có người dùng đăng nhập
    if (currentUser && currentUser._id) {
      business.ownerId = currentUser._id;
    }
    
    return this.http.post<Business>(this.apiUrl, business);
  }

  // Cập nhật doanh nghiệp
  updateBusiness(id: string, business: Business): Observable<Business> {
    return this.http.put<Business>(`${this.apiUrl}/${id}`, business);
  }

  // Cập nhật trạng thái doanh nghiệp
  updateBusinessStatus(id: string, status: 'active' | 'inactive' | 'pending' | 'block' | 'reject' | 'unactive'): Observable<Business> {
    return this.http.patch<Business>(`${this.apiUrl}/${id}/status`, { status });
  }

  // Xoá doanh nghiệp
  deleteBusiness(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

}
