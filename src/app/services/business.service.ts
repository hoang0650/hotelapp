import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Business } from '../interfaces/business';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';


@Injectable({
  providedIn: 'root'
})
export class BusinessService {
  private apiUrl = `${environment.apiUrl}/businesses`;

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

  // Lấy thông tin doanh nghiệp hiện tại của người dùng đang đăng nhập
  getBusinessInfoOfCurrentUser(): Observable<Business> {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser && currentUser._id) {
      return this.http.get<Business>(`${this.apiUrl}/owner/${currentUser._id}`);
    }
    return new Observable<Business>(observer => {
      observer.error('User not logged in or user ID not available.');
    });
  }

  // Tạo doanh nghiệp mới
  createBusiness(business: Partial<Business>): Observable<Business> {
    return this.http.post<Business>(this.apiUrl, business);
  }

  // Cập nhật doanh nghiệp
  updateBusiness(id: string, business: Partial<Business>): Observable<Business> {
    return this.http.put<Business>(`${this.apiUrl}/${id}`, business);
  }

  // Cập nhật trạng thái doanh nghiệp
  updateBusinessStatus(id: string, status: 'pending' | 'active' | 'inactive' | 'suspended'): Observable<Business> {
    return this.http.patch<{ message: string, business: Business }>(`${this.apiUrl}/${id}/status`, { status }).pipe(
      map(response => response.business)
    );
  }

  // Xoá doanh nghiệp
  deleteBusiness(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // Method to update subscription (example, implement as needed)
  updateSubscription(businessId: string, plan: string, contractYears: number, autoRenew: boolean): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${businessId}/subscription`, { plan, contractYears, autoRenew });
  }
}
