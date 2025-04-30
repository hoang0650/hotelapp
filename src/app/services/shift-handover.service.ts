import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ShiftHandoverService {
  private apiUrl = `${environment.apiUrl}/shift-handover`;

  constructor(private http: HttpClient) {}

  // Lấy thông tin ca hiện tại của nhân viên
  getCurrentShift(staffId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/current/${staffId}`);
  }

  // Tạo giao ca mới
  createShiftHandover(handoverData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, handoverData);
  }

  // Xác nhận giao ca bằng mật khẩu
  confirmShiftHandover(handoverId: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/confirm/${handoverId}`, { password });
  }

  // Lấy danh sách nhân viên có thể nhận ca
  getAvailableStaff(): Observable<any> {
    return this.http.get(`${this.apiUrl}/available-staff`);
  }

  // Lấy số tiền thu được trong ca
  getShiftRevenue(staffId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/revenue/${staffId}`);
  }
} 