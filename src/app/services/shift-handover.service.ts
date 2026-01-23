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
import { environment } from '../../environments/environment';
import { User } from '../interfaces/user';

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
  private apiUrl = `${environment.apiUrl}/shift-handover`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  // ============ GIAO CA ============

  /**
   * Tạo giao ca mới
   * POST /shift-handover
   * Body: {
   *   hotelId, fromStaffId, toStaffId, toUserPassword,
   *   previousShiftAmount, cashInShift, managerHandoverAmount,
   *   cashAmount, bankTransferAmount, cardPaymentAmount,
   *   expenseAmount, incomeAmount, roomHistory, invoices,
   *   expenses, incomes, serviceOrders, notes, pendingIssues
   * }
   */
  createShiftHandover(handoverData: ShiftHandoverCreateRequest): Observable<ShiftHandoverResponse> {
    return this.http.post<ShiftHandoverResponse>(`${this.apiUrl}`, handoverData).pipe(
      tap(response => {
        // Nếu giao ca thành công và có thông tin login, cập nhật auth
        if (response.login?.token) {
          const existing = this.authService.getCurrentUser();
          const u = response.login.user;
          const normalizedUser: User = {
            _id: u._id,
            username: u.username,
            email: u.email,
            fullName: u.fullName,
            role: (u.role as User['role']),
            status: existing?.status ?? 'active',
            createdAt: existing?.createdAt ?? new Date(),
            updatedAt: existing?.updatedAt ?? new Date(),
            businessId: existing?.businessId,
            hotelId: u.hotelId ?? existing?.hotelId
          };
          this.authService.loginFromShiftHandover(response.login.token, normalizedUser);
          // Lưu thông tin user mới
          if (response.login.user) {
            localStorage.setItem('user', JSON.stringify(response.login.user));
          }
          if (response.login.staff) {
            localStorage.setItem('staff', JSON.stringify(response.login.staff));
            localStorage.setItem('staffId', response.login.staff._id);
          }
        }
      })
    );
  }

  // ============ GIAO TIỀN QUẢN LÝ ============

  /**
   * Giao tiền cho quản lý
   * POST /shift-handover/manager
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
   * GET /shift-handover/history
   * Params: hotelId, staffId, startDate, endDate, page, limit
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
   * GET /shift-handover/history/:id
   */
  getShiftHandoverById(id: string): Observable<{ message: string; data: ShiftHandover }> {
    return this.http.get<{ message: string; data: ShiftHandover }>(`${this.apiUrl}/history/${id}`);
  }

  // ============ THỐNG KÊ GIAO CA ============

  /**
   * Thống kê giao ca theo khách sạn
   * GET /shift-handover/stats
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
   * Tính doanh thu khách sạn
   * GET /shift-handover/revenue
   * Công thức: Tổng doanh thu = Tiền mặt + Chuyển khoản + Cà thẻ - Tiền chi
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

  /**
   * Lấy doanh thu theo period (ngày/tuần/tháng)
   * GET /shift-handover/revenue/period
   * Tính từ Lịch sử phòng trong ca (roomHistory) và expenses trong shift handover
   * Không tính giao tiền quản lý (managerHandoverAmount)
   */
  getRevenueByPeriod(params: {
    hotelId: string;
    period?: 'day' | 'week' | 'month';
    startDate?: string;
    endDate?: string;
  }): Observable<{
    message: string;
    labels: string[];
    revenueData: number[];
    paymentData: number[];
    expenseData: number[];
    totalRevenue: number;
    totalPayment: number;
    totalExpense: number;
    period: string;
    startDate: Date;
    endDate: Date;
  }> {
    let httpParams = new HttpParams().set('hotelId', params.hotelId);
    
    if (params.period) {
      httpParams = httpParams.set('period', params.period);
    }
    if (params.startDate) {
      httpParams = httpParams.set('startDate', params.startDate);
    }
    if (params.endDate) {
      httpParams = httpParams.set('endDate', params.endDate);
    }
    
    return this.http.get<{
      message: string;
      labels: string[];
      revenueData: number[];
      paymentData: number[];
      expenseData: number[];
      totalRevenue: number;
      totalPayment: number;
      totalExpense: number;
      period: string;
      startDate: Date;
      endDate: Date;
    }>(`${this.apiUrl}/revenue/period`, { params: httpParams });
  }

  // ============ LẤY SỐ TIỀN CA TRƯỚC ============

  /**
   * Lấy số tiền từ ca trước để tính cho ca hiện tại
   * GET /shift-handover/previous-amount
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
