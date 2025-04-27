import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { NzModalService } from 'ng-zorro-antd/modal';

// Định nghĩa interface cho Invoice để tránh lỗi type
export interface Invoice {
  id?: string;
  invoiceNumber?: string;
  date?: Date;
  customerName?: string;
  staffName?: string;
  roomId?: string;
  roomNumber?: string;
  checkInTime?: Date;
  checkOutTime?: Date;
  checkIn?: Date | string;
  checkOut?: Date | string;
  products?: any[];
  amount?: number;
  totalAmount?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  hotelId?: string;
  businessName?: string;
  business_address?: string;
  phoneNumber?: string;
  notes?: string;
  bookingId?: string;
  guestInfo?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  status?: 'pending' | 'paid' | 'cancelled';
  items?: {
    name: string;
    price: number;
    quantity: number;
  }[];
  [key: string]: any; // Cho phép thêm thuộc tính dynamic
}

@Injectable({
  providedIn: 'root'
})
export class InvoiceService {
  private apiUrl = environment.apiUrl;
  private invoiceSubject = new BehaviorSubject<Invoice | null>(null);
  private isModalVisibleSubject = new BehaviorSubject<boolean>(false);
  
  // Cache cho invoice
  private invoiceCache: {[key: string]: Invoice} = {};

  constructor(
    private http: HttpClient,
    private modalService: NzModalService
  ) {}

  // Lấy thông tin hiển thị modal
  isModalVisible(): Observable<boolean> {
    return this.isModalVisibleSubject.asObservable();
  }

  // Lấy thông tin hóa đơn hiện tại
  getCurrentInvoice(): Observable<Invoice | null> {
    return this.invoiceSubject.asObservable();
  }

  // Mở modal hóa đơn
  showInvoiceModal(invoice: Invoice): void {
    // Thêm mã hóa đơn nếu chưa có
    if (!invoice.invoiceNumber) {
      invoice.invoiceNumber = this.generateInvoiceNumber();
    }
    
    this.setCurrentInvoice(invoice);
    this.isModalVisibleSubject.next(true);
  }

  // Đóng modal hóa đơn
  hideInvoiceModal(): void {
    this.isModalVisibleSubject.next(false);
  }

  // Tạo mã hóa đơn ngẫu nhiên (6 chữ số)
  generateInvoiceNumber(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Đặt thông tin hóa đơn hiện tại
  setCurrentInvoice(invoice: Invoice): void {
    // Thêm mã hóa đơn nếu chưa có
    if (!invoice.invoiceNumber) {
      invoice.invoiceNumber = this.generateInvoiceNumber();
    }
    
    // Thêm ngày nếu chưa có
    if (!invoice.date) {
      invoice.date = new Date();
    }
    
    this.invoiceSubject.next(invoice);
  }

  // Lấy thông tin hóa đơn theo ID
  getInvoiceById(id: string): Observable<Invoice | null> {
    // Kiểm tra cache trước
    if (this.invoiceCache[id]) {
      return of(this.invoiceCache[id]);
    }
    
    // Đường dẫn API chính xác theo backend
    return this.http.get<Invoice>(`${this.apiUrl}/invoice/${id}`).pipe(
      map(response => {
        // Thêm mã hóa đơn 6 chữ số nếu chưa có
        if (response && !response.invoiceNumber) {
          response.invoiceNumber = this.generateInvoiceNumber();
        }
        
        // Lưu vào cache
        this.invoiceCache[id] = response;
        return response;
      }),
      catchError(error => {
        console.error('Lỗi khi lấy thông tin hóa đơn:', error);
        return of(null);
      })
    );
  }

  // Lấy hóa đơn theo phòng
  getInvoiceByRoom(roomId: string, hotelId?: string): Observable<Invoice | null> {
    let params = new HttpParams();
    if (hotelId) {
      params = params.set('hotelId', hotelId);
    }
    
    return this.http.get<any>(`${this.apiUrl}/invoice/room/${roomId}`, { params }).pipe(
      map(response => {
        if (response && response.invoice) {
          const invoice: Invoice = {
            ...response.invoice,
            invoiceNumber: this.generateInvoiceNumber()
          };
          return invoice;
        }
        throw new Error('Không tìm thấy hóa đơn cho phòng này');
      }),
      catchError(error => {
        console.error('Lỗi khi lấy thông tin hóa đơn theo phòng:', error);
        return of(null);
      })
    );
  }

  // Gửi email hóa đơn
  sendInvoiceEmail(invoiceId: string, email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/invoice/${invoiceId}/email`, { email });
  }

  // Xóa hóa đơn
  deleteInvoice(invoiceId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/invoice/${invoiceId}`);
  }

  // Tạo hóa đơn mới
  createInvoice(invoiceData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/invoice`, invoiceData);
  }

  // Cập nhật hóa đơn
  updateInvoice(id: string, invoiceData: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/invoice/${id}`, invoiceData);
  }

  // Cập nhật trạng thái hóa đơn
  updateInvoiceStatus(id: string, status: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/invoice/${id}/status`, { status });
  }

  // Lấy danh sách hóa đơn theo khách sạn
  getInvoicesByHotel(hotelId: string, status?: string): Observable<any> {
    let params = new HttpParams();
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get(`${this.apiUrl}/invoice/hotel/${hotelId}`, { params });
  }

  // Lấy thống kê hóa đơn
  getInvoiceStatistics(hotelId: string, period: string): Observable<any> {
    let params = new HttpParams()
      .set('period', period);
    return this.http.get(`${this.apiUrl}/invoice/statistics/${hotelId}`, { params });
  }
} 