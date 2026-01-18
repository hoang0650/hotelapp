import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BehaviorSubject } from 'rxjs';
import * as XLSX from 'xlsx';
import { Room, Event, BookingHistory, ShiftHandover } from '../interfaces/rooms';
import { tap, catchError } from 'rxjs/operators';
import { throwError, of } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class RoomsService {
  private roomDataUpdated$ = new BehaviorSubject<any>(null);
  private apiUrl = `${environment.apiUrl}/rooms`;

  constructor(private http: HttpClient) { }

  getRooms(params?: { hotelId?: string, floor?: number }): Observable<Room[]> {
    let httpParams = new HttpParams();
    
    if (params) {
      if (params.hotelId) {
        httpParams = httpParams.set('hotelId', params.hotelId);
      }
      if (params.floor !== undefined) {
        httpParams = httpParams.set('floor', params.floor.toString());
      }
    }
    
    return this.http.get<Room[]>(this.apiUrl, { params: httpParams });
  }

  getRoomById(id: string, options?: { limit?: number, includeOldEvents?: boolean, excludeCheckedOut?: boolean }): Observable<Room> {
    let httpParams = new HttpParams();
    
    if (options) {
      if (options.limit) {
        httpParams = httpParams.set('limit', options.limit.toString());
      }
      if (options.includeOldEvents) {
        httpParams = httpParams.set('includeOldEvents', 'true');
      }
      // Thêm option excludeCheckedOut để chỉ lấy check-in events chưa checkout
      if (options.excludeCheckedOut !== undefined) {
        httpParams = httpParams.set('excludeCheckedOut', options.excludeCheckedOut.toString());
      }
    }
    
    return this.http.get<Room>(`${this.apiUrl}/${id}`, { params: httpParams });
  }

  // Lấy events riêng từ RoomEvent collection (mới)
  getRoomEvents(roomId: string, options?: {
    limit?: number;
    skip?: number;
    type?: string;
    startDate?: string;
    endDate?: string;
    excludeCheckedOut?: boolean;
  }): Observable<Event[]> {
    let httpParams = new HttpParams();
    
    if (options) {
      if (options.limit) httpParams = httpParams.set('limit', options.limit.toString());
      if (options.skip) httpParams = httpParams.set('skip', options.skip.toString());
      if (options.type) httpParams = httpParams.set('type', options.type);
      if (options.startDate) httpParams = httpParams.set('startDate', options.startDate);
      if (options.endDate) httpParams = httpParams.set('endDate', options.endDate);
      if (options.excludeCheckedOut !== undefined) {
        httpParams = httpParams.set('excludeCheckedOut', options.excludeCheckedOut.toString());
      }
    }
    
    return this.http.get<Event[]>(`${this.apiUrl}/${roomId}/events`, { params: httpParams });
  }

  getAvailableRooms(params: { hotelId: string, checkInDate?: string, checkOutDate?: string, floor?: number }): Observable<Room[]> {
    let httpParams = new HttpParams()
      .set('hotelId', params.hotelId);
    
    if (params.checkInDate) {
      httpParams = httpParams.set('checkInDate', params.checkInDate);
    }
    
    if (params.checkOutDate) {
      httpParams = httpParams.set('checkOutDate', params.checkOutDate);
    }
    
    if (params.floor !== undefined) {
      httpParams = httpParams.set('floor', params.floor.toString());
    }
    
    return this.http.get<Room[]>(`${this.apiUrl}/available`, { params: httpParams });
  }

  getRoomsByFloor(hotelId: string, floor: number): Observable<Room[]> {
    return this.http.get<Room[]>(`${this.apiUrl}/hotel/${hotelId}/floor/${floor}`);
  }

  getHotelFloors(hotelId: string): Observable<{ floors: number[] }> {
    return this.http.get<{ floors: number[] }>(`${this.apiUrl}/hotel/${hotelId}/floors`);
  }

  createRoom(data: Room): Observable<Room> {
    return this.http.post<Room>(this.apiUrl, data);
  }

  updateRoom(id: string, room: Room): Observable<Room> {
    return this.http.put<Room>(`${this.apiUrl}/${id}`, room);
  }

  deleteRoom(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // Dịch vụ phòng
  assignServiceToRoom(roomId: string, serviceId: string): Observable<Room> {
    return this.http.post<Room>(`${this.apiUrl}/${roomId}/services/${serviceId}`, {});
  }

  removeServiceFromRoom(roomId: string, serviceId: string): Observable<Room> {
    return this.http.delete<Room>(`${this.apiUrl}/${roomId}/services/${serviceId}`);
  }

  // Quản lý trạng thái phòng
  getRoomDataUpdated$() {
    return this.roomDataUpdated$.asObservable();
  }

  notifyRoomDataUpdated(): void {
    this.roomDataUpdated$.next(null);
  }

  // Cập nhật trạng thái phòng
  updateRoomStatus(roomId: string, status: string, staffId: string, note: string): Observable<Room> {
    return this.http.patch<Room>(`${this.apiUrl}/${roomId}/status`, { 
      status, 
      staffId, 
      note 
    });
  }

  // Chuyển phòng
  transferRoom(sourceRoomId: string, targetRoomId: string, staffId: string, notes: string): Observable<{
    sourceRoom: Room,
    targetRoom: Room,
    booking?: any,
    checkinEvent?: {
      checkinTime?: Date;
      guestInfo?: any;
      rateType?: string;
      advancePayment?: number;
      additionalCharges?: number;
      discount?: number;
      selectedServices?: any[];
      paymentMethod?: string;
      expectedCheckoutTime?: Date;
      transferredFrom?: string;
      transferredAt?: Date;
    },
    message: string
  }> {
    return this.http.post<{
      sourceRoom: Room,
      targetRoom: Room,
      booking?: any,
      checkinEvent?: {
        checkinTime?: Date;
        guestInfo?: any;
        rateType?: string;
        advancePayment?: number;
        additionalCharges?: number;
        discount?: number;
        selectedServices?: any[];
        paymentMethod?: string;
        expectedCheckoutTime?: Date;
        transferredFrom?: string;
        transferredAt?: Date;
      },
      message: string
    }>(`${this.apiUrl}/transfer`, {
      sourceRoomId,
      targetRoomId,
      staffId,
      notes
    });
  }

  // Phương thức check-in với đầy đủ thông tin khách hàng
  checkInRoom(id: string, payload: object): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/checkin/${id}`, payload);
  }

  // Phương thức check-out với thông tin thanh toán
  checkOutRoom(id: string, payload: object): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/checkout/${id}`, payload);
  }

  // Check-in lại (undo checkout)
  recheckinRoom(payload: { roomId: string, invoiceId?: string, historyId?: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/recheckin`, payload);
  }

  // Xóa lịch sử checkout
  deleteCheckoutHistory(payload: { roomId: string, invoiceId?: string, historyId: string }): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/history`, { body: payload });
  }

  // Dọn dẹp phòng
  cleanRoom(roomId: string, roomUpdate: any): Observable<any> {
    const url = `${this.apiUrl}/clean/${roomId}`;
    return this.http.post<any>(url, roomUpdate).pipe(
      tap(() => {
        this.notifyRoomDataUpdated();
      }),
      catchError(this.handleError<any>('cleanRoom'))
    );
  }

  // Lịch sử phòng
  getRoomHistory(hotelId?: string, filterType?: string, page: number = 1, limit: number = 10): Observable<{
    history: BookingHistory[],
    totalPages: number,
    currentPage: number,
    totalPayment: number,
    totalItems: number
  }> {
    let httpParams = new HttpParams();
    
    if (hotelId) {
      httpParams = httpParams.set('hotelId', hotelId);
    }
    
    if (filterType) {
      httpParams = httpParams.set('filterType', filterType);
    }
    
    httpParams = httpParams.set('page', page.toString());
    httpParams = httpParams.set('limit', limit.toString());
    
    return this.http.get<{
      history: BookingHistory[],
      totalPages: number,
      currentPage: number,
      totalPayment: number,
      totalItems: number
    }>(`${this.apiUrl}/history`, { params: httpParams });
  }

  // Lấy thông tin chi tiết hóa đơn
  getInvoiceDetails(invoiceId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/invoice/${invoiceId}`);
  }

  // Tạo hóa đơn khi check-out
  createInvoice(roomId: string, invoiceData: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/${roomId}/invoice`, invoiceData);
  }

  // Đặt phòng trước (Booking/Reservation)
  createBooking(bookingData: {
    roomId: string;
    hotelId: string;
    guestInfo: {
      name: string;
      phone?: string;
      email?: string;
      idNumber?: string;
      address?: string;
    };
    checkInDate: Date;
    checkOutDate?: Date;
    rateType: 'hourly' | 'daily' | 'nightly';
    notes?: string;
    advancePayment?: number;
  }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/booking`, bookingData);
  }

  // Hủy đặt phòng
  cancelBooking(roomId: string, reason: string, bookingId?: string, checkInDate?: Date): Observable<any> {
    const body: any = { reason };
    if (bookingId) body.bookingId = bookingId;
    if (checkInDate) body.checkInDate = checkInDate;
    return this.http.post<any>(`${this.apiUrl}/booking/cancel/${roomId}`, body);
  }

  // Lấy danh sách bookings
  getBookings(params?: {
    roomId?: string;
    hotelId?: string;
    startDate?: string;
    endDate?: string;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params) {
      if (params.roomId) httpParams = httpParams.set('roomId', params.roomId);
      if (params.hotelId) httpParams = httpParams.set('hotelId', params.hotelId);
      if (params.startDate) httpParams = httpParams.set('startDate', params.startDate);
      if (params.endDate) httpParams = httpParams.set('endDate', params.endDate);
    }
    return this.http.get<any>(`${this.apiUrl}/bookings`, { params: httpParams });
  }

  // Khách tạm ra ngoài
  guestOut(roomId: string, note?: string): Observable<any> {
    const staffId = localStorage.getItem('staffId') || null;
    return this.http.post<any>(`${this.apiUrl}/${roomId}/guest-out`, { note, staffId });
  }

  // Khách quay lại
  guestReturn(roomId: string): Observable<any> {
    const staffId = localStorage.getItem('staffId') || null;
    return this.http.post<any>(`${this.apiUrl}/${roomId}/guest-return`, { staffId });
  }

  // Giao ca
  createShiftHandover(handoverData: ShiftHandover): Observable<ShiftHandover> {
    return this.http.post<ShiftHandover>(`${this.apiUrl}/shift-handover`, handoverData);
  }

  // Cập nhật thông tin khách và tiền đặt trước
  updateRoomCheckinInfo(roomId: string, guestInfo: any, advancePayment: number, rateType?: string, additionalCharges?: number, discount?: number, selectedServices?: any[], advancePaymentMethod?: string): Observable<any> {
    const body: any = {
      guestInfo,
      advancePayment
    };
    if (advancePaymentMethod) {
      body.advancePaymentMethod = advancePaymentMethod;
    }
    // Thêm rateType nếu có
    if (rateType) {
      body.rateType = rateType;
    }
    // Thêm additionalCharges và discount nếu có
    if (additionalCharges !== undefined && additionalCharges !== null) {
      body.additionalCharges = additionalCharges;
    }
    if (discount !== undefined && discount !== null) {
      body.discount = discount;
    }
    // Thêm selectedServices nếu có
    if (selectedServices !== undefined && selectedServices !== null) {
      body.selectedServices = selectedServices;
    }
    return this.http.patch<any>(`${this.apiUrl}/${roomId}/checkin-info`, body);
  }

  // Xác nhận giao ca bằng mật khẩu
  confirmShiftHandover(handoverId: string, password: string): Observable<{ success: boolean, message: string }> {
    return this.http.post<{ success: boolean, message: string }>(
      `${this.apiUrl}/shift-handover/${handoverId}/confirm`, 
      { password }
    );
  }

  // Lịch sử giao ca
  getShiftHandoverHistory(hotelId: string): Observable<ShiftHandover[]> {
    return this.http.get<ShiftHandover[]>(`${this.apiUrl}/shift-handover/hotel/${hotelId}`);
  }

  // Xuất dữ liệu
  exportToExcel(data: any[], fileName: string, sheetName: string): void {
    const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);
    const workbook: XLSX.WorkBook = { Sheets: { [sheetName]: worksheet }, SheetNames: [sheetName] };
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  }

  // Lấy thông tin khách sạn
  getHotelInfo(hotelId: string): Observable<{ 
    name: string; 
    address: string; 
    phoneNumber: string;
    [key: string]: any;
  }> {
    return this.http.get<any>(`${environment.apiUrl}/hotels/${hotelId}`);
  }

  // Lưu hóa đơn
  saveInvoice(invoiceData: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/invoices`, invoiceData);
  }

  // Tính giá phòng dựa trên priceConfig
  calculateRoomPrice(roomId: string, checkInDate: Date, checkOutDate: Date, rateType: 'hourly' | 'daily' | 'nightly'): Observable<{
    roomId: string;
    totalPrice: number;
    priceDetails: any;
    durationInHours: number;
    rateType: string;
    originalRateType?: string;
  }> {
    const priceConfigApiUrl = `${environment.apiUrl}/priceConfig`;
    return this.http.post<{
      roomId: string;
      totalPrice: number;
      priceDetails: any;
      durationInHours: number;
      rateType: string;
      originalRateType?: string;
    }>(`${priceConfigApiUrl}/calculate`, {
      roomId,
      checkInDate: checkInDate.toISOString(),
      checkOutDate: checkOutDate.toISOString(),
      rateType
    });
  }

  private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {
      console.error(`${operation} failed: ${error.message}`);
      return of(result as T);
    };
  }
}
