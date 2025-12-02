import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { 
  ShiftHandover,
  ShiftHandoverCreateRequest,
  ShiftHandoverResponse,
  ShiftHandoverHistoryResponse,
  ShiftHandoverStats,
  RevenueResponse,
  ManagerHandover
} from '../interfaces/shift-handover';
import { AuthService } from './auth.service';

export interface PreviousShiftAmountResponse {
  message: string;
  data: {
    previousShiftAmount: number;
    lastShiftHandover: {
      id: string;
      handoverTime: Date;
      handoverAmount: number;
    } | null;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ShiftHandoverService {
  private apiUrl = 'http://localhost:3000/shift-handover';

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  // ============ GIAO CA ============

  /**
   * Tạo giao ca mới
   * Khi nhân viên bấm giao ca:
   * 1. Chọn nhân viên nhận ca
   * 2. Nhập mật khẩu xác nhận
   * 3. Lưu lịch sử giao ca
   * 4. Login vào tài khoản được giao ca
   */
  createShiftHandover(handoverData: ShiftHandoverCreateRequest): Observable<ShiftHandoverResponse> {
    return this.http.post<ShiftHandoverResponse>(`${this.apiUrl}`, handoverData).pipe(
      tap(response => {
        // Nếu giao ca thành công và có thông tin login, cập nhật auth
        if (response.login?.token) {
          localStorage.setItem('token', response.login.token);
          // AuthService sẽ tự cập nhật user từ token mới
        }
      })
    );
  }

  // ============ GIAO TIỀN QUẢN LÝ ============

  /**
   * Giao tiền cho quản lý
   * Công thức: Số tiền thực nhận trong ca = Số tiền ca trước + Tiền mặt trong ca - Tiền giao quản lý
   */
  createManagerHandover(data: {
    hotelId: string;
    staffId: string;
    managerId: string;
    amount: number;
    notes?: string;
  }): Observable<{ message: string; transaction: any }> {
    return this.http.post<{ message: string; transaction: any }>(`${this.apiUrl}/manager`, data);
  }

  // ============ LỊCH SỬ GIAO CA (CHỈ ADMIN/BUSINESS) ============

  /**
   * Lấy lịch sử giao ca
   * CHỈ admin hoặc business được quyền xem
   */
  getShiftHandoverHistory(params: {
    hotelId?: string;
    staffId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Observable<ShiftHandoverHistoryResponse> {
    let httpParams = new HttpParams();
    
    if (params.hotelId) {
      httpParams = httpParams.set('hotelId', params.hotelId);
    }
    if (params.staffId) {
      httpParams = httpParams.set('staffId', params.staffId);
    }
    if (params.startDate) {
      httpParams = httpParams.set('startDate', params.startDate);
    }
    if (params.endDate) {
      httpParams = httpParams.set('endDate', params.endDate);
    }
    if (params.page) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params.limit) {
      httpParams = httpParams.set('limit', params.limit.toString());
    }
    
    return this.http.get<ShiftHandoverHistoryResponse>(`${this.apiUrl}/history`, { params: httpParams });
  }

  /**
   * Lấy chi tiết một lần giao ca
   */
  getShiftHandoverById(id: string): Observable<{ message: string; data: ShiftHandover }> {
    return this.http.get<{ message: string; data: ShiftHandover }>(`${this.apiUrl}/history/${id}`);
  }

  // ============ THỐNG KÊ GIAO CA ============

  /**
   * Thống kê giao ca theo khách sạn
   */
  getShiftHandoverStats(params: {
    hotelId?: string;
    startDate?: string;
    endDate?: string;
  }): Observable<{ message: string; data: ShiftHandoverStats[] }> {
    let httpParams = new HttpParams();
    
    if (params.hotelId) {
      httpParams = httpParams.set('hotelId', params.hotelId);
    }
    if (params.startDate) {
      httpParams = httpParams.set('startDate', params.startDate);
    }
    if (params.endDate) {
      httpParams = httpParams.set('endDate', params.endDate);
    }
    
    return this.http.get<{ message: string; data: ShiftHandoverStats[] }>(`${this.apiUrl}/stats`, { params: httpParams });
  }

  // ============ TÍNH TOÁN DOANH THU ============

  /**
   * Tính doanh thu khách sạn theo công thức:
   * Tổng doanh thu = Tiền mặt + Chuyển khoản + Cà thẻ - Tiền chi = Phiếu thu - Phiếu chi
   */
  calculateRevenue(params: {
    hotelId: string;
    startDate?: string;
    endDate?: string;
  }): Observable<RevenueResponse> {
    let httpParams = new HttpParams().set('hotelId', params.hotelId);
    
    if (params.startDate) {
      httpParams = httpParams.set('startDate', params.startDate);
    }
    if (params.endDate) {
      httpParams = httpParams.set('endDate', params.endDate);
    }
    
    return this.http.get<RevenueResponse>(`${this.apiUrl}/revenue`, { params: httpParams });
  }

  // ============ LẤY SỐ TIỀN CA TRƯỚC ============

  /**
   * Lấy số tiền từ ca trước để tính cho ca hiện tại
   */
  getPreviousShiftAmount(hotelId: string, staffId?: string): Observable<PreviousShiftAmountResponse> {
    let httpParams = new HttpParams().set('hotelId', hotelId);
    
    if (staffId) {
      httpParams = httpParams.set('staffId', staffId);
    }
    
    return this.http.get<PreviousShiftAmountResponse>(`${this.apiUrl}/previous-amount`, { params: httpParams });
  }

  // ============ HELPER METHODS ============

  /**
   * Tính số tiền giao ca
   * Công thức: Số tiền giao ca = Số tiền ca trước + Tiền mặt trong ca - Tiền giao quản lý
   */
  calculateHandoverAmount(
    previousShiftAmount: number, 
    cashInShift: number, 
    managerHandoverAmount: number
  ): number {
    return previousShiftAmount + cashInShift - managerHandoverAmount;
  }

  /**
   * Tính tổng doanh thu
   * Công thức: Tổng doanh thu = Tiền mặt + Chuyển khoản + Cà thẻ - Tiền chi
   */
  calculateTotalRevenue(
    cashAmount: number,
    bankTransferAmount: number,
    cardPaymentAmount: number,
    expenseAmount: number
  ): number {
    return cashAmount + bankTransferAmount + cardPaymentAmount - expenseAmount;
  }

  /**
   * Format số tiền
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  }

  /**
   * Lấy label trạng thái giao ca
   */
  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'pending': 'Chờ xác nhận',
      'confirmed': 'Đã xác nhận',
      'rejected': 'Đã từ chối',
      'cancelled': 'Đã hủy'
    };
    return labels[status] || status;
  }

  /**
   * Lấy màu trạng thái
   */
  getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      'pending': 'orange',
      'confirmed': 'green',
      'rejected': 'red',
      'cancelled': 'gray'
    };
    return colors[status] || 'default';
  }

  /**
   * Kiểm tra quyền xem lịch sử giao ca
   * Chỉ admin hoặc business được phép xem
   */
  canViewHistory(): boolean {
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    return ['superadmin', 'admin', 'business'].includes(user.role);
  }

  /**
   * Kiểm tra quyền tạo giao ca
   */
  canCreateHandover(): boolean {
    const user = this.authService.getCurrentUser();
    return !!user; // Tất cả user đã đăng nhập đều có thể giao ca
  }
}
