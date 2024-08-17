import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Business } from '../interfaces/business';


@Injectable({
  providedIn: 'root'
})
export class BusinessService {
  private apiUrl = 'http://localhost:3000/businesses'

  constructor(private http: HttpClient) { }

  // Lấy tất cả doanh nghiệp
  getBusinesses(): Observable<Business[]> {
    return this.http.get<Business[]>(this.apiUrl);
  }

  //Lấy danh sách khách sạn
  getHotels(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/hotels`);
  }

  // Lấy doanh nghiệp theo ID
  getBusinessById(id: string): Observable<Business> {
    return this.http.get<Business>(`${this.apiUrl}/${id}`);
  }

  // Tạo doanh nghiệp mới
  createBusiness(business: Business): Observable<Business> {
    return this.http.post<Business>(this.apiUrl, business);
  }

  // Cập nhật doanh nghiệp
  updateBusiness(id: string, business: Business): Observable<Business> {
    return this.http.put<Business>(`${this.apiUrl}/${id}`, business);
  }

  // Xoá doanh nghiệp
  deleteBusiness(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

}
