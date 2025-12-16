import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Debt {
  _id?: string;
  hotelId: string;
  invoiceId: string;
  invoiceNumber: string;
  roomId?: string;
  roomNumber: string;
  bookingId?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerId?: string;
  guestInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    idNumber?: string;
    address?: string;
    guestSource?: string;
  };
  createdByStaffId?: string;
  createdByStaffName?: string;
  settledByStaffId?: string;
  settledByStaffName?: string;
  debtAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'pending' | 'partial' | 'settled' | 'cancelled';
  paymentMethod?: string;
  debtDate: Date | string;
  dueDate?: Date | string;
  settledDate?: Date | string;
  notes?: string;
  paymentHistory?: Array<{
    paymentDate: Date | string;
    amount: number;
    paymentMethod: string;
    staffId?: string;
    staffName?: string;
    notes?: string;
  }>;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface DebtQuery {
  page?: number;
  pageSize?: number;
  hotelId?: string;
  status?: string;
  customerId?: string;
  startDate?: string;
  endDate?: string;
}

export interface DebtResponse {
  debts: Debt[];
  total: number;
  page: number;
  totalPages: number;
}

export interface SettleDebtRequest {
  amount: number;
  paymentMethod: string;
  notes?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DebtService {
  private apiUrl = 'https://nest-production-8106.up.railway.app/debts';

  constructor(private http: HttpClient) { }

  /**
   * Tạo công nợ từ hóa đơn
   */
  createDebt(invoiceId: string, notes?: string, dueDate?: Date): Observable<{ message: string; debt: Debt }> {
    return this.http.post<{ message: string; debt: Debt }>(this.apiUrl, {
      invoiceId,
      notes,
      dueDate
    });
  }

  /**
   * Lấy danh sách công nợ
   */
  getDebts(query?: DebtQuery): Observable<DebtResponse> {
    let params = new HttpParams();
    
    if (query) {
      if (query.page) params = params.set('page', query.page.toString());
      if (query.pageSize) params = params.set('limit', query.pageSize.toString());
      if (query.hotelId) params = params.set('hotelId', query.hotelId);
      if (query.status) params = params.set('status', query.status);
      if (query.customerId) params = params.set('customerId', query.customerId);
      if (query.startDate) params = params.set('startDate', query.startDate);
      if (query.endDate) params = params.set('endDate', query.endDate);
    }
    
    return this.http.get<DebtResponse>(this.apiUrl, { params });
  }

  /**
   * Lấy chi tiết công nợ
   */
  getDebtById(id: string): Observable<{ message: string; debt: Debt }> {
    return this.http.get<{ message: string; debt: Debt }>(`${this.apiUrl}/${id}`);
  }

  /**
   * Thanh toán công nợ
   */
  settleDebt(id: string, request: SettleDebtRequest): Observable<{ message: string; debt: Debt }> {
    return this.http.post<{ message: string; debt: Debt }>(`${this.apiUrl}/${id}/settle`, request);
  }

  /**
   * Xóa công nợ
   */
  deleteDebt(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }
}

