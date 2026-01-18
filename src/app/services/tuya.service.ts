import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TuyaDevice {
  id: string;
  name: string;
  online: boolean;
  state?: boolean; // Trạng thái bật/tắt
  hotelId?: string;
  roomId?: string;
  roomNumber?: string;
}

export interface TuyaSwitchResponse {
  success: boolean;
  message: string;
  data?: {
    deviceId: string;
    state: boolean;
    timestamp: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class TuyaService {
  private apiUrl = `${environment.apiUrl}/tuya`;

  constructor(private http: HttpClient) { }

  /**
   * Lấy danh sách thiết bị Tuya
   * GET /tuya/devices
   */
  getDevices(roomId?: string, hotelId?: string): Observable<{ message: string; data: TuyaDevice[] }> {
    let url = `${this.apiUrl}/devices`;
    const params: string[] = [];
    if (roomId) {
      params.push(`roomId=${roomId}`);
    }
    if (hotelId) {
      params.push(`hotelId=${hotelId}`);
    }
    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }
    return this.http.get<{ message: string; data: TuyaDevice[] }>(url);
  }

  /**
   * Lấy thông tin một thiết bị
   * GET /tuya/devices/:deviceId
   */
  getDevice(deviceId: string): Observable<{ message: string; data: TuyaDevice }> {
    return this.http.get<{ message: string; data: TuyaDevice }>(`${this.apiUrl}/devices/${deviceId}`);
  }

  /**
   * Bật công tắc điện
   * POST /tuya/devices/:deviceId/turn-on
   */
  turnOn(deviceId: string): Observable<TuyaSwitchResponse> {
    return this.http.post<TuyaSwitchResponse>(`${this.apiUrl}/devices/${deviceId}/turn-on`, {});
  }

  /**
   * Tắt công tắc điện
   * POST /tuya/devices/:deviceId/turn-off
   */
  turnOff(deviceId: string): Observable<TuyaSwitchResponse> {
    return this.http.post<TuyaSwitchResponse>(`${this.apiUrl}/devices/${deviceId}/turn-off`, {});
  }

  /**
   * Toggle công tắc điện (bật nếu tắt, tắt nếu bật)
   * POST /tuya/devices/:deviceId/toggle
   */
  toggle(deviceId: string): Observable<TuyaSwitchResponse> {
    return this.http.post<TuyaSwitchResponse>(`${this.apiUrl}/devices/${deviceId}/toggle`, {});
  }

  /**
   * Lấy trạng thái thiết bị
   * GET /tuya/devices/:deviceId/status
   */
  getStatus(deviceId: string): Observable<{ message: string; data: { state: boolean; online: boolean } }> {
    return this.http.get<{ message: string; data: { state: boolean; online: boolean } }>(`${this.apiUrl}/devices/${deviceId}/status`);
  }

  /**
   * Thêm thiết bị mới
   * POST /tuya/devices
   */
  addDevice(deviceData: {
    deviceId: string;
    name: string;
    roomId?: string;
    roomNumber?: string;
  }): Observable<{ message: string; data: TuyaDevice }> {
    return this.http.post<{ message: string; data: TuyaDevice }>(`${this.apiUrl}/devices`, deviceData);
  }

  /**
   * Cập nhật thiết bị
   * PUT /tuya/devices/:deviceId
   */
  updateDevice(deviceId: string, deviceData: {
    name?: string;
    roomId?: string;
    roomNumber?: string;
  }): Observable<{ message: string; data: TuyaDevice }> {
    return this.http.put<{ message: string; data: TuyaDevice }>(`${this.apiUrl}/devices/${deviceId}`, deviceData);
  }

  /**
   * Xóa thiết bị
   * DELETE /tuya/devices/:deviceId
   */
  deleteDevice(deviceId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/devices/${deviceId}`);
  }

  /**
   * Tự động bật công tắc khi check-in
   * POST /tuya/rooms/:roomId/auto-turn-on
   */
  autoTurnOnOnCheckIn(roomId: string): Observable<{ message: string; data?: any }> {
    return this.http.post<{ message: string; data?: any }>(`${this.apiUrl}/rooms/${roomId}/auto-turn-on`, {});
  }

  /**
   * Tự động tắt công tắc khi check-out
   * POST /tuya/rooms/:roomId/auto-turn-off
   */
  autoTurnOffOnCheckOut(roomId: string): Observable<{ message: string; data?: any }> {
    return this.http.post<{ message: string; data?: any }>(`${this.apiUrl}/rooms/${roomId}/auto-turn-off`, {});
  }

  /**
   * Bật tất cả công tắc trong một phòng
   * POST /tuya/devices/room/:roomId/turn-on
   */
  turnOnByRoom(roomId: string): Observable<{ message: string; data?: any }> {
    return this.http.post<{ message: string; data?: any }>(`${this.apiUrl}/devices/room/${roomId}/turn-on`, {});
  }

  /**
   * Tắt tất cả công tắc trong một phòng
   * POST /tuya/devices/room/:roomId/turn-off
   */
  turnOffByRoom(roomId: string): Observable<{ message: string; data?: any }> {
    return this.http.post<{ message: string; data?: any }>(`${this.apiUrl}/devices/room/${roomId}/turn-off`, {});
  }
}

