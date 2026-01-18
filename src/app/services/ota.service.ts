import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { 
  OtaIntegration, 
  OtaBooking, 
  OtaProvider,
  OtaCalendarEvent,
  OtaCalendarResponse,
  OTA_PROVIDER_COLORS
} from '../interfaces/ota-integration';

export interface ApiResponse<T = any> {
  message?: string;
  data?: T;
  error?: any;
  lastSync?: Date;
}

export interface OtaBookingsResponse {
  message: string;
  data: OtaBooking[];
  lastSync?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class OtaService {
  private apiUrl = `${environment.apiUrl}/ota-integrations`;
  
  constructor(private http: HttpClient) { }

  // ============ CRUD OPERATIONS ============
  
  getOtaIntegrations(hotelId?: string): Observable<OtaIntegration[]> {
    let params = new HttpParams();
    if (hotelId) {
      params = params.set('hotelId', hotelId);
    }
    return this.http.get<OtaIntegration[]>(this.apiUrl, { params });
  }

  getOtaIntegrationById(id: string): Observable<OtaIntegration> {
    return this.http.get<OtaIntegration>(`${this.apiUrl}/${id}`);
  }

  createOtaIntegration(integrationData: Partial<OtaIntegration>): Observable<ApiResponse<OtaIntegration>> {
    return this.http.post<ApiResponse<OtaIntegration>>(this.apiUrl, integrationData);
  }

  updateOtaIntegration(id: string, integrationData: Partial<OtaIntegration>): Observable<ApiResponse<OtaIntegration>> {
    return this.http.put<ApiResponse<OtaIntegration>>(`${this.apiUrl}/${id}`, integrationData);
  }

  deleteOtaIntegration(id: string): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${this.apiUrl}/${id}`);
  }

  // ============ AUTHENTICATION ============
  
  loginOtaProvider(id: string, provider: OtaProvider, credentials: any): Observable<ApiResponse<OtaIntegration>> {
    return this.http.post<ApiResponse<OtaIntegration>>(`${this.apiUrl}/${id}/login`, { provider, credentials })
      .pipe(
        catchError(error => {
          console.error('Login error:', error);
          return throwError(() => error);
        })
      );
  }

  // ============ SYNC OPERATIONS ============
  
  syncOtaData(id: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.apiUrl}/${id}/sync`, {});
  }

  /**
   * Đồng bộ inventory/availability lên OTA provider
   * @param id ID của OTA integration
   * @param startDate Ngày bắt đầu (optional, mặc định là hôm nay)
   * @param endDate Ngày kết thúc (optional, mặc định là 90 ngày sau)
   */
  syncInventoryToOta(
    id: string, 
    startDate?: Date, 
    endDate?: Date
  ): Observable<ApiResponse> {
    const body: any = {};
    if (startDate) {
      body.startDate = startDate.toISOString();
    }
    if (endDate) {
      body.endDate = endDate.toISOString();
    }
    return this.http.post<ApiResponse>(`${this.apiUrl}/${id}/sync-inventory`, body);
  }

  /**
   * Đồng bộ inventory cho tất cả OTA của một hotel
   * @param hotelId ID của hotel
   * @param startDate Ngày bắt đầu (optional)
   * @param endDate Ngày kết thúc (optional)
   */
  syncAllInventoryForHotel(
    hotelId: string,
    startDate?: Date,
    endDate?: Date
  ): Observable<ApiResponse> {
    let params = new HttpParams();
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    return this.http.post<ApiResponse>(`${this.apiUrl}/hotel/${hotelId}/sync-all-inventory`, {}, { params });
  }

  // ============ API RIÊNG TỪNG TRANG OTA ============

  /**
   * Lấy bookings từ Booking.com
   * @param hotelId ID khách sạn
   * @param sync true để đồng bộ từ API OTA, false để lấy từ database local
   */
  getBookingComBookings(hotelId: string, sync: boolean = false): Observable<OtaBookingsResponse> {
    let params = new HttpParams().set('hotelId', hotelId);
    if (sync) {
      params = params.set('sync', 'true');
    }
    return this.http.get<OtaBookingsResponse>(`${this.apiUrl}/bookingcom/bookings`, { params });
  }

  /**
   * Lấy bookings từ Agoda
   */
  getAgodaBookings(hotelId: string, sync: boolean = false): Observable<OtaBookingsResponse> {
    let params = new HttpParams().set('hotelId', hotelId);
    if (sync) {
      params = params.set('sync', 'true');
    }
    return this.http.get<OtaBookingsResponse>(`${this.apiUrl}/agoda/bookings`, { params });
  }

  /**
   * Lấy bookings từ Traveloka
   */
  getTravelokaBookings(hotelId: string, sync: boolean = false): Observable<OtaBookingsResponse> {
    let params = new HttpParams().set('hotelId', hotelId);
    if (sync) {
      params = params.set('sync', 'true');
    }
    return this.http.get<OtaBookingsResponse>(`${this.apiUrl}/traveloka/bookings`, { params });
  }

  /**
   * Lấy bookings từ Trip.com
   */
  getTripComBookings(hotelId: string, sync: boolean = false): Observable<OtaBookingsResponse> {
    let params = new HttpParams().set('hotelId', hotelId);
    if (sync) {
      params = params.set('sync', 'true');
    }
    return this.http.get<OtaBookingsResponse>(`${this.apiUrl}/tripcom/bookings`, { params });
  }

  /**
   * Lấy bookings từ Expedia
   */
  getExpediaBookings(hotelId: string, sync: boolean = false): Observable<OtaBookingsResponse> {
    let params = new HttpParams().set('hotelId', hotelId);
    if (sync) {
      params = params.set('sync', 'true');
    }
    return this.http.get<OtaBookingsResponse>(`${this.apiUrl}/expedia/bookings`, { params });
  }

  /**
   * Lấy bookings từ một OTA cụ thể
   */
  getBookingsByProvider(provider: OtaProvider, hotelId: string, sync: boolean = false): Observable<OtaBookingsResponse> {
    switch (provider) {
      case 'Booking.com':
        return this.getBookingComBookings(hotelId, sync);
      case 'Agoda':
        return this.getAgodaBookings(hotelId, sync);
      case 'Traveloka':
        return this.getTravelokaBookings(hotelId, sync);
      case 'Trip.com':
        return this.getTripComBookings(hotelId, sync);
      case 'Expedia':
        return this.getExpediaBookings(hotelId, sync);
      default:
        return throwError(() => new Error('Provider không được hỗ trợ'));
    }
  }

  // ============ OTA BOOKINGS CHO CALENDAR ============

  /**
   * Lấy tất cả OTA bookings để hiển thị trên calendar
   */
  getAllOtaBookingsForCalendar(
    hotelId: string, 
    startDate?: Date, 
    endDate?: Date, 
    status?: string
  ): Observable<OtaCalendarResponse> {
    let params = new HttpParams().set('hotelId', hotelId);
    
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    if (status) {
      params = params.set('status', status);
    }
    
    return this.http.get<OtaCalendarResponse>(`${this.apiUrl}/bookings/calendar`, { params });
  }

  /**
   * Lấy chi tiết một OTA booking
   */
  getOtaBookingById(id: string): Observable<OtaBooking> {
    return this.http.get<OtaBooking>(`${this.apiUrl}/bookings/${id}`);
  }

  /**
   * Assign OTA booking vào phòng cụ thể
   */
  assignOtaBookingToRoom(otaBookingId: string, roomId: string, staffId?: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.apiUrl}/bookings/${otaBookingId}/assign`, {
      roomId,
      staffId
    });
  }

  // ============ HELPER METHODS ============

  /**
   * Lấy màu cho từng OTA provider
   */
  getProviderColor(provider: OtaProvider): string {
    return OTA_PROVIDER_COLORS[provider] || '#888888';
  }

  /**
   * Convert OTA booking sang calendar event
   */
  convertToCalendarEvent(booking: OtaBooking): OtaCalendarEvent {
    return {
      id: booking._id || booking.otaBookingId,
      otaBookingId: booking.otaBookingId,
      provider: booking.otaProvider,
      title: `${booking.guestDetails?.name || 'Khách'} - ${booking.otaProvider}`,
      start: new Date(booking.checkInDate),
      end: new Date(booking.checkOutDate),
      guestName: booking.guestDetails?.name || '',
      guestPhone: booking.guestDetails?.phone,
      guestEmail: booking.guestDetails?.email,
      roomType: booking.roomDetails?.roomTypeName || '',
      roomId: booking.localRoomId,
      totalAmount: booking.pricing?.totalAmount || 0,
      currency: booking.pricing?.currency || 'VND',
      paymentMethod: booking.paymentMethod,
      paymentStatus: booking.paymentStatus,
      status: booking.status,
      numberOfNights: booking.numberOfNights,
      numberOfGuests: booking.guestDetails?.numberOfGuests,
      color: this.getProviderColor(booking.otaProvider),
      extendedProps: {
        otaProvider: booking.otaProvider,
        confirmationNumber: booking.otaConfirmationNumber,
        specialRequests: booking.guestDetails?.specialRequests
      }
    };
  }

  /**
   * Format số tiền theo currency
   */
  formatCurrency(amount: number, currency: string = 'VND'): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  /**
   * Lấy label trạng thái booking
   */
  getStatusLabel(status: string): string {
    const statusLabels: Record<string, string> = {
      'pending': 'Chờ xác nhận',
      'confirmed': 'Đã xác nhận',
      'modified': 'Đã sửa đổi',
      'checked_in': 'Đã nhận phòng',
      'checked_out': 'Đã trả phòng',
      'cancelled': 'Đã hủy',
      'no_show': 'Không đến'
    };
    return statusLabels[status] || status;
  }

  /**
   * Lấy màu trạng thái booking
   */
  getStatusColor(status: string): string {
    const statusColors: Record<string, string> = {
      'pending': 'orange',
      'confirmed': 'blue',
      'modified': 'purple',
      'checked_in': 'green',
      'checked_out': 'gray',
      'cancelled': 'red',
      'no_show': 'magenta'
    };
    return statusColors[status] || 'default';
  }

  /**
   * Lấy label phương thức thanh toán
   */
  getPaymentMethodLabel(method: string): string {
    const methodLabels: Record<string, string> = {
      'pay_at_property': 'Thanh toán tại khách sạn',
      'prepaid': 'Thanh toán trước',
      'credit_card': 'Thẻ tín dụng',
      'bank_transfer': 'Chuyển khoản',
      'virtual_card': 'Thẻ ảo',
      'other': 'Khác'
    };
    return methodLabels[method] || method;
  }

  /**
   * Lấy label trạng thái thanh toán
   */
  getPaymentStatusLabel(status: string): string {
    const statusLabels: Record<string, string> = {
      'pending': 'Chờ thanh toán',
      'partial': 'Thanh toán một phần',
      'paid': 'Đã thanh toán',
      'refunded': 'Đã hoàn tiền',
      'cancelled': 'Đã hủy'
    };
    return statusLabels[status] || status;
  }

  // ============ LEGACY METHODS ============

  /**
   * Lấy bookings từ integration (deprecated - dùng API riêng từng OTA)
   */
  getBookings(integration: OtaIntegration, params?: {
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Observable<OtaBooking[]> {
    let httpParams = new HttpParams();
    if (params?.startDate) httpParams = httpParams.set('startDate', params.startDate);
    if (params?.endDate) httpParams = httpParams.set('endDate', params.endDate);
    if (params?.status) httpParams = httpParams.set('status', params.status);

    return this.http.get<OtaBookingsResponse>(`${this.apiUrl}/${integration._id}/bookings`, { params: httpParams })
      .pipe(
        map(response => response.data || []),
        catchError(error => {
          console.error('Get bookings error:', error);
          return throwError(() => error);
        })
      );
  }
}
