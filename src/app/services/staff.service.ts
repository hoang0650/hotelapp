import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Staff } from '../interfaces/staff';

@Injectable({
  providedIn: 'root'
})
export class StaffService {
  // private baseUrl = 'https://hotel-app-smp2.onrender.com/staffs';
  private baseUrl = 'http://localhost:3000/staffs';

  constructor(private http: HttpClient) {}

  // Lấy tất cả nhân viên
  getStaff(): Observable<Staff[]> {
    return this.http.get<Staff[]>(`${this.baseUrl}`);
  }

  // Lấy nhân viên theo khách sạn
  getStaffByHotel(hotelId: string): Observable<Staff[]> {
    return this.http.get<Staff[]>(`${this.baseUrl}/hotel/${hotelId}`);
  }

  // Lấy nhân viên theo id
  getStaffById(id: string): Observable<Staff> {
    return this.http.get<Staff>(`${this.baseUrl}/${id}`);
  }

  // Cập nhật thông tin nhân viên
  updateStaff(id: string, staff: Staff): Observable<Staff> {
    return this.http.put<Staff>(`${this.baseUrl}/${id}`, staff);
  }

  // Tạo nhân viên mới
  createStaff(staff: Staff): Observable<Staff> {
    return this.http.post<Staff>(`${this.baseUrl}`, staff);
  }

  // Xóa nhân viên
  deleteStaff(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
