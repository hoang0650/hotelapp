import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BehaviorSubject } from 'rxjs';
import * as XLSX from 'xlsx';
import { Room, Event, BookingHistory, ShiftHandover } from '../interfaces/rooms';
import { tap, catchError } from 'rxjs/operators';
import { throwError, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class RoomsService {
  private roomDataUpdated$ = new BehaviorSubject<any>(null);
  //private apiUrl = 'https://hotel-app-smp2.onrender.com/rooms';
  private apiUrl = 'http://localhost:3000/rooms';

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

  getRoomById(id: string): Observable<Room> {
    return this.http.get<Room>(`${this.apiUrl}/${id}`);
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
  transferRoom(sourceRoomId: string, targetRoomId: string, staffId: string, note: string): Observable<{
    sourceRoom: Room,
    targetRoom: Room,
    message: string
  }> {
    return this.http.post<{
      sourceRoom: Room,
      targetRoom: Room,
      message: string
    }>(`${this.apiUrl}/transfer`, {
      sourceRoomId,
      targetRoomId,
      staffId,
      note
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
  getRoomHistory(hotelId?: string, filterType?: string, page: number = 1, limit: number = 20): Observable<{
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

  // Giao ca
  createShiftHandover(handoverData: ShiftHandover): Observable<ShiftHandover> {
    return this.http.post<ShiftHandover>(`${this.apiUrl}/shift-handover`, handoverData);
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
    return this.http.get<any>(`http://localhost:3000/hotels/${hotelId}`);
  }

  // Lưu hóa đơn
  saveInvoice(invoiceData: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/invoices`, invoiceData);
  }

  private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {
      console.error(`${operation} failed: ${error.message}`);
      return of(result as T);
    };
  }
}
