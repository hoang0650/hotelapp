import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Expense {
  _id?: string;
  hotelId: string;
  amount: number;
  method: 'cash' | 'credit_card' | 'bank_transfer' | 'card' | 'virtual_card' | 'other';
  expenseCategory?: 'supplies' | 'utilities' | 'salary' | 'maintenance' | 'marketing' | 'other';
  description?: string;
  notes?: string;
  recipient?: string;
  status?: 'pending' | 'completed' | 'failed' | 'cancelled' | 'approved' | 'rejected';
  createdAt?: Date;
  updatedAt?: Date;
  details?: {
    recipient?: string;
    [key: string]: any;
  };
  approvedBy?: string;
  processedAt?: Date;
}

export interface ExpenseResponse {
  message: string;
  data: Expense;
}

export interface ExpenseListResponse {
  message: string;
  data: Expense[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class TransactionService {
  private apiUrl = `${environment.apiUrl || 'http://localhost:3000'}/transactions`;

  constructor(private http: HttpClient) { }

  /**
   * Tạo phiếu chi mới
   * POST /transactions/expense
   */
  createExpense(expense: {
    hotelId: string;
    amount: number;
    method: 'cash' | 'credit_card' | 'bank_transfer' | 'card' | 'virtual_card' | 'other';
    expenseCategory?: 'supplies' | 'utilities' | 'salary' | 'maintenance' | 'marketing' | 'other';
    description?: string;
    notes?: string;
    recipient?: string;
  }): Observable<ExpenseResponse> {
    return this.http.post<ExpenseResponse>(`${this.apiUrl}/expense`, expense);
  }

  /**
   * Lấy danh sách phiếu chi
   * GET /transactions/expense
   */
  getExpenses(params: {
    hotelId: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Observable<ExpenseListResponse> {
    let httpParams = new HttpParams()
      .set('hotelId', params.hotelId);
    
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
    
    return this.http.get<ExpenseListResponse>(`${this.apiUrl}/expense`, { params: httpParams });
  }

  /**
   * Xóa phiếu chi
   * DELETE /transactions/expense/:id
   */
  deleteExpense(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/expense/${id}`);
  }

  /**
   * Tạo phiếu thu mới
   * POST /transactions/income
   */
  createIncome(income: {
    hotelId: string;
    amount: number;
    method: 'cash' | 'credit_card' | 'bank_transfer' | 'card' | 'virtual_card' | 'other';
    incomeCategory?: 'service' | 'rental' | 'other';
    description?: string;
    notes?: string;
    payer?: string;
  }): Observable<ExpenseResponse> {
    return this.http.post<ExpenseResponse>(`${this.apiUrl}/income`, income);
  }

  /**
   * Lấy danh sách phiếu thu
   * GET /transactions/income
   */
  getIncomes(params: {
    hotelId: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Observable<ExpenseListResponse> {
    let httpParams = new HttpParams()
      .set('hotelId', params.hotelId);
    
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
    
    return this.http.get<ExpenseListResponse>(`${this.apiUrl}/income`, { params: httpParams });
  }

  /**
   * Xóa phiếu thu
   * DELETE /transactions/income/:id
   */
  deleteIncome(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/income/${id}`);
  }
}

