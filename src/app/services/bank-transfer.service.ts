import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface BankTransfer {
  id: string;
  amount: number;
  fromAccount: string;
  toAccount: string;
  bankName: string;
  transferTime: Date;
  status: 'success' | 'pending' | 'failed';
  description: string;
}

// Interface cho SePay Transaction
export interface SepayTransaction {
  id: string;
  bank_brand_name: string;
  account_number: string;
  transaction_date: string;
  amount_out: string;
  amount_in: string;
  accumulated: string;
  transaction_content: string;
  reference_number: string;
  code: string | null;
  sub_account: string | null;
  bank_account_id: string;
}

export interface SepayTransactionsResponse {
  data: SepayTransaction[];
  total: number;
}

@Injectable({
  providedIn: 'root'
})
export class BankTransferService {
  private apiUrl = 'http://localhost:3000/sepay'; // Backend endpoint cho SePay
  private bankTransfersUrl = 'api/bank-transfers'; // URL API cho bank transfers nội bộ

  constructor(private http: HttpClient) { }

  getTransferHistory(): Observable<BankTransfer[]> {
    return this.http.get<BankTransfer[]>(this.bankTransfersUrl);
  }

  getTransferById(id: string): Observable<BankTransfer> {
    return this.http.get<BankTransfer>(`${this.bankTransfersUrl}/${id}`);
  }

  searchTransfers(params: {
    startDate?: Date,
    endDate?: Date,
    status?: string,
    bankName?: string
  }): Observable<BankTransfer[]> {
    return this.http.get<BankTransfer[]>(`${this.bankTransfersUrl}/search`, { params: params as any });
  }

  /**
   * Lấy danh sách giao dịch SePay qua backend proxy
   * @param token SePay API Token
   * @param params Query parameters (date_from, date_to, page, pageSize, etc.)
   */
  getSepayTransactions(
    token: string,
    params?: {
      date_from?: string;
      date_to?: string;
      status?: string;
      bankName?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    }
  ): Observable<SepayTransactionsResponse> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    let httpParams = new HttpParams();
    if (params) {
      if (params.date_from) httpParams = httpParams.set('date_from', params.date_from);
      if (params.date_to) httpParams = httpParams.set('date_to', params.date_to);
      if (params.status) httpParams = httpParams.set('status', params.status);
      if (params.bankName) httpParams = httpParams.set('bankName', params.bankName);
      if (params.search) httpParams = httpParams.set('search', params.search);
      if (params.page) httpParams = httpParams.set('page', params.page.toString());
      if (params.pageSize) httpParams = httpParams.set('pageSize', params.pageSize.toString());
    }

    return this.http.get<SepayTransactionsResponse>(`${this.apiUrl}/transactions`, {
      headers,
      params: httpParams
    });
  }
} 