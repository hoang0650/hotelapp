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
    return this.http.post(`${this.apiUrl}/invoices/${invoiceId}/email`, { email });
  }

  // Xóa hóa đơn
  deleteInvoice(invoiceId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/invoices/${invoiceId}`);
  }

  // Tạo hóa đơn mới (API mới)
  createInvoice(invoiceData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/invoices`, invoiceData);
  }
  
  // Lấy danh sách hóa đơn (API mới)
  getInvoices(params?: {
    hotelId?: string;
    roomId?: string;
    customerId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    paymentStatus?: string;
    page?: number;
    limit?: number;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params) {
      if (params.hotelId) httpParams = httpParams.set('hotelId', params.hotelId);
      if (params.roomId) httpParams = httpParams.set('roomId', params.roomId);
      if (params.customerId) httpParams = httpParams.set('customerId', params.customerId);
      if (params.startDate) httpParams = httpParams.set('startDate', params.startDate);
      if (params.endDate) httpParams = httpParams.set('endDate', params.endDate);
      if (params.status) httpParams = httpParams.set('status', params.status);
      if (params.paymentStatus) httpParams = httpParams.set('paymentStatus', params.paymentStatus);
      if (params.page) httpParams = httpParams.set('page', params.page.toString());
      if (params.limit) httpParams = httpParams.set('limit', params.limit.toString());
    }
    return this.http.get(`${this.apiUrl}/invoices`, { params: httpParams });
  }
  
  // Lấy chi tiết hóa đơn (API mới)
  getInvoiceByIdNew(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/invoices/${id}`);
  }
  
  // Lấy thống kê hóa đơn (API mới)
  getInvoiceStats(params?: {
    hotelId?: string;
    startDate?: string;
    endDate?: string;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params) {
      if (params.hotelId) httpParams = httpParams.set('hotelId', params.hotelId);
      if (params.startDate) httpParams = httpParams.set('startDate', params.startDate);
      if (params.endDate) httpParams = httpParams.set('endDate', params.endDate);
    }
    return this.http.get(`${this.apiUrl}/invoices/stats`, { params: httpParams });
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

  // ============ SEPAY EINVOICE API ============

  // Đăng nhập Sepay eInvoice
  loginEInvoice(username: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/e-invoice/login`, {
      username,
      password
    });
  }

  // Đăng xuất Sepay eInvoice
  logoutEInvoice(): Observable<any> {
    return this.http.post(`${this.apiUrl}/e-invoice/logout`, {});
  }

  // Lấy danh sách tài khoản nhà cung cấp
  getEInvoiceProviderAccounts(): Observable<any> {
    // Thêm timestamp để tránh cache
    const timestamp = new Date().getTime();
    return this.http.get(`${this.apiUrl}/e-invoice/provider-accounts`, {
      params: { _t: timestamp.toString() }
    });
  }

  // Lấy chi tiết tài khoản nhà cung cấp
  getEInvoiceProviderAccountDetails(accountId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/e-invoice/provider-accounts/${accountId}`);
  }

  // Tạo hóa đơn điện tử (Sepay eInvoice)
  createEInvoice(invoiceData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/e-invoice/create`, invoiceData);
  }

  // Kiểm tra trạng thái tạo hóa đơn
  checkEInvoiceCreateStatus(trackingCode: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/e-invoice/create/check/${trackingCode}`);
  }

  // Phát hành hóa đơn điện tử
  issueEInvoice(issueData: { reference_code: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/e-invoice/issue`, issueData);
  }

  // Kiểm tra trạng thái phát hành hóa đơn
  checkEInvoiceIssueStatus(trackingCode: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/e-invoice/issue/check/${trackingCode}`);
  }

  // Lấy chi tiết hóa đơn điện tử
  getEInvoiceDetails(referenceCode: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/e-invoice/${referenceCode}`);
  }

  // Kiểm tra hạn ngạch
  getEInvoiceUsage(): Observable<any> {
    return this.http.get(`${this.apiUrl}/e-invoice/usage`);
  }

  // Danh sách hóa đơn điện tử
  listEInvoices(params?: {
    page?: number;
    limit?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params) {
      if (params.page) httpParams = httpParams.set('page', params.page.toString());
      if (params.limit) httpParams = httpParams.set('limit', params.limit.toString());
      if (params.status) httpParams = httpParams.set('status', params.status);
      if (params.startDate) httpParams = httpParams.set('startDate', params.startDate);
      if (params.endDate) httpParams = httpParams.set('endDate', params.endDate);
    }
    return this.http.get(`${this.apiUrl}/e-invoice`, { params: httpParams });
  }

  // ============ LEGACY METHODS (giữ lại để tương thích) ============

  // Xem hóa đơn nháp (EasyInvoice) - DEPRECATED: Sử dụng createEInvoice với is_draft: true
  previewDraftInvoice(invoiceData: any): Observable<any> {
    // Chuyển sang sử dụng Sepay eInvoice API
    const sepayData = this.convertToSepayFormat(invoiceData, true);
    return this.createEInvoice(sepayData);
  }

  // Xuất hóa đơn điện tử (EasyInvoice) - DEPRECATED: Sử dụng createEInvoice và issueEInvoice
  exportEasyInvoice(invoiceData: any): Observable<any> {
    // Chuyển sang sử dụng Sepay eInvoice API
    const sepayData = this.convertToSepayFormat(invoiceData, false);
    return this.createEInvoice(sepayData);
  }

  // Chuyển đổi dữ liệu từ format cũ sang format Sepay eInvoice
  private convertToSepayFormat(invoiceData: any, isDraft: boolean): any {
    return {
      provider_account_id: invoiceData.providerAccountId || invoiceData.provider_account_id,
      is_draft: isDraft,
      invoice: {
        seller: {
          name: invoiceData.company?.name || invoiceData.company?.legalName || '',
          tax_code: invoiceData.company?.taxCode || invoiceData.company?.taxId || '',
          address: invoiceData.company?.address || '',
          email: invoiceData.company?.email || invoiceData.company?.contactInfo?.email || '',
          phone: invoiceData.company?.phone || invoiceData.company?.contactInfo?.phone || ''
        },
        buyer: {
          name: invoiceData.customer?.name || '',
          tax_code: invoiceData.customer?.taxCode || invoiceData.customer?.tax_code || '',
          address: invoiceData.customer?.address || '',
          email: invoiceData.customer?.email || '',
          phone: invoiceData.customer?.phone || ''
        },
        items: (invoiceData.items || []).map((item: any) => ({
          name: item.name,
          quantity: item.quantity || 1,
          unit_price: item.unitPrice || item.price || 0,
          total_price: (item.unitPrice || item.price || 0) * (item.quantity || 1),
          unit: item.unit || 'cái',
          note: item.note || item.description || ''
        })),
        total_amount: invoiceData.totalAmount || 0,
        discount_amount: invoiceData.discount || 0,
        tax_amount: invoiceData.tax || 0,
        note: invoiceData.notes || invoiceData.note || ''
      },
      invoiceId: invoiceData.invoiceId || invoiceData._id
    };
  }
} 