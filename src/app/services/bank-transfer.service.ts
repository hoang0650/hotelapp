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
  private apiUrl = `${environment.apiUrl}/sepay`; // Backend endpoint cho SePay
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
   * Lấy danh sách giao dịch SePay qua backend proxy (sử dụng OAuth2 API)
   * @param token SePay OAuth2 Access Token
   * @param params Query parameters (date_from, date_to, page, pageSize, etc.)
   */
  getSepayTransactions(
    token: string | null,
    params?: {
      date_from?: string;
      date_to?: string;
      status?: string;
      bankName?: string;
      bank_account_id?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    }
  ): Observable<SepayTransactionsResponse> {
    // Nếu không có token, backend sẽ tự lấy token
    const headers = new HttpHeaders({
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });

    let httpParams = new HttpParams();
    if (params) {
      if (params.date_from) httpParams = httpParams.set('date_from', params.date_from);
      if (params.date_to) httpParams = httpParams.set('date_to', params.date_to);
      if (params.status) httpParams = httpParams.set('status', params.status);
      if (params.bankName) httpParams = httpParams.set('bankName', params.bankName);
      if (params.bank_account_id) httpParams = httpParams.set('bank_account_id', params.bank_account_id);
      if (params.search) httpParams = httpParams.set('search', params.search);
      if (params.page) httpParams = httpParams.set('page', params.page.toString());
      if (params.pageSize) httpParams = httpParams.set('pageSize', params.pageSize.toString());
    }

    // Sử dụng OAuth2 API endpoint
    return this.http.get<SepayTransactionsResponse>(`${this.apiUrl}/transactions`, {
      headers,
      params: httpParams
    });
  }

  /**
   * OAuth2: Lấy authorization URL
   */
  getOAuth2AuthorizeUrl(params: {
    client_id: string;
    redirect_uri: string;
    scope?: string;
    state?: string;
  }): Observable<{ authorization_url: string; state: string }> {
    let httpParams = new HttpParams();
    httpParams = httpParams.set('client_id', params.client_id);
    httpParams = httpParams.set('redirect_uri', params.redirect_uri);
    if (params.scope) httpParams = httpParams.set('scope', params.scope);
    if (params.state) httpParams = httpParams.set('state', params.state);

    return this.http.get<{ authorization_url: string; state: string }>(`${this.apiUrl}/oauth2/authorize`, {
      params: httpParams
    });
  }

  /**
   * OAuth2: Đổi authorization code lấy access token
   */
  exchangeOAuth2Token(data: {
    code: string;
    client_id: string;
    client_secret: string;
    redirect_uri: string;
  }): Observable<{
    success: boolean;
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    scope?: string;
    expires_at?: Date;
  }> {
    return this.http.post<{
      success: boolean;
      access_token: string;
      refresh_token: string;
      token_type: string;
      expires_in: number;
      scope?: string;
      expires_at?: Date;
    }>(`${this.apiUrl}/oauth2/token`, data);
  }

  /**
   * OAuth2: Refresh access token
   */
  refreshOAuth2Token(data: {
    refresh_token: string;
    client_id: string;
    client_secret: string;
  }): Observable<{
    success: boolean;
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    expires_at?: Date;
  }> {
    return this.http.post<{
      success: boolean;
      access_token: string;
      refresh_token: string;
      token_type: string;
      expires_in: number;
      expires_at?: Date;
    }>(`${this.apiUrl}/oauth2/refresh`, data);
  }

  /**
   * OAuth2: Lấy thông tin người dùng
   */
  getOAuth2UserInfo(token: string): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    });

    return this.http.get(`${this.apiUrl}/oauth2/me`, { headers });
  }

  /**
   * OAuth2: Lấy danh sách tài khoản ngân hàng
   */
  getOAuth2BankAccounts(token: string): Observable<{ data: any[]; total: number }> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    });

    return this.http.get<{ data: any[]; total: number }>(`${this.apiUrl}/oauth2/bank-accounts`, { headers });
  }
} 
