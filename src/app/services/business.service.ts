import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Business {
  _id?: string;
  name: string;
  address: string;
  tax_code: number;
  contact: {
    phone: string;
    email: string;
  };
  hotels?: string[]; // Nếu bạn có mối quan hệ với Hotel
}

@Injectable({
  providedIn: 'root'
})
export class BusinessService {
  private apiUrl = 'http:localhost:3000/businesses'

  constructor(private http: HttpClient) { }

  // Lấy tất cả doanh nghiệp
  getBusinesses(): Observable<Business[]> {
    return this.http.get<Business[]>(this.apiUrl);
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
