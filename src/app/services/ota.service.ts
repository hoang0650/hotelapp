import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { OtaIntegration, OtaBooking } from '../interfaces/ota-integration'; // Adjusted path if necessary

export interface ApiResponse<T = any> {
  message?: string;
  data?: T;
  // Các trường khác tùy theo cấu trúc response của bạn
}

@Injectable({
  providedIn: 'root'
})
export class OtaService {
  private apiUrl = 'http://localhost:3000/api/v1/ota-integrations'; // Điều chỉnh nếu API prefix của bạn khác

  constructor(private http: HttpClient) { }

  // Lấy tất cả các cấu hình OTA, có thể lọc theo hotelId
  getOtaIntegrations(hotelId?: string): Observable<OtaIntegration[]> {
    let params = new HttpParams();
    if (hotelId) {
      params = params.set('hotelId', hotelId);
    }
    return this.http.get<OtaIntegration[]>(this.apiUrl, { params });
  }

  // Lấy chi tiết một cấu hình OTA
  getOtaIntegrationById(id: string): Observable<OtaIntegration> {
    return this.http.get<OtaIntegration>(`${this.apiUrl}/${id}`);
  }

  // Tạo mới một cấu hình OTA
  createOtaIntegration(integrationData: Partial<OtaIntegration>): Observable<ApiResponse<OtaIntegration>> {
    return this.http.post<ApiResponse<OtaIntegration>>(this.apiUrl, integrationData);
  }

  // Cập nhật một cấu hình OTA
  updateOtaIntegration(id: string, integrationData: Partial<OtaIntegration>): Observable<ApiResponse<OtaIntegration>> {
    return this.http.put<ApiResponse<OtaIntegration>>(`${this.apiUrl}/${id}`, integrationData);
  }

  // Xóa một cấu hình OTA
  deleteOtaIntegration(id: string): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${this.apiUrl}/${id}`);
  }

  // Placeholder: "Đăng nhập" vào OTA provider
  loginOtaProvider(id: string): Observable<ApiResponse<OtaIntegration>> {
    return this.http.post<ApiResponse<OtaIntegration>>(`${this.apiUrl}/${id}/login`, {});
  }

  // Placeholder: Lấy đặt phòng từ OTA provider (trả về dữ liệu mẫu)
  getOtaBookings(id: string): Observable<ApiResponse<OtaBooking[]>> {
    return this.http.get<ApiResponse<OtaBooking[]>>(`${this.apiUrl}/${id}/bookings`);
  }

  // Placeholder: Đồng bộ dữ liệu với OTA provider
  syncOtaData(id: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.apiUrl}/${id}/sync`, {});
  }
} 