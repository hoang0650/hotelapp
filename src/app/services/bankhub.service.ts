import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface BankHubStatus {
  configured: boolean;
  authenticated?: boolean;
  company_xid?: string;
  message?: string;
}

export interface BankHubLinkToken {
  xid: string;
  hosted_link_url: string;
  link_token: string;
  expires_at: string;
}

export interface BankHubBankAccount {
  xid: string;
  bank_brand_name: string;
  account_number: string;
  account_type: string;
  status: string;
}

export interface BankHubBankAccountsResponse {
  data: BankHubBankAccount[];
  configured_account_number?: string;
  configured_account_source?: string | null;
  matched_bank_account?: BankHubBankAccount | null;
  configured_account_linked?: boolean;
}

export interface BankHubTransaction {
  xid: string;
  bank_account_xid: string;
  bank_brand_name: string;
  account_number: string;
  transaction_date: string;
  amount_in: number;
  amount_out: number;
  accumulated: number;
  transaction_content: string;
  reference_number: string;
}

export interface BankHubTransactionsResponse {
  data: BankHubTransaction[];
  total?: number;
  configured_account_number?: string;
  configured_account_source?: string | null;
  matched_bank_account?: BankHubBankAccount | null;
  configured_account_linked?: boolean;
  bank_account_xid?: string | null;
}

@Injectable({ providedIn: 'root' })
export class BankHubService {
  private apiUrl = `${environment.apiUrl}/bankhub`;

  constructor(private http: HttpClient) {}

  getStatus(): Observable<BankHubStatus> {
    return this.http.get<BankHubStatus>(`${this.apiUrl}/status`);
  }

  createLinkToken(data?: { company_xid?: string; purpose?: string; completion_redirect_uri?: string }): Observable<BankHubLinkToken> {
    return this.http.post<BankHubLinkToken>(`${this.apiUrl}/link-token`, data || {});
  }

  getBankAccounts(companyXid?: string): Observable<BankHubBankAccountsResponse> {
    let params = new HttpParams();
    if (companyXid) params = params.set('company_xid', companyXid);
    return this.http.get<BankHubBankAccountsResponse>(`${this.apiUrl}/bank-accounts`, { params });
  }

  getTransactions(queryParams?: {
    bank_account_xid?: string;
    from_date?: string;
    to_date?: string;
    page?: number;
    limit?: number;
    account_number?: string;
  }): Observable<BankHubTransactionsResponse> {
    let params = new HttpParams();
    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params = params.set(key, String(value));
        }
      });
    }
    return this.http.get<BankHubTransactionsResponse>(`${this.apiUrl}/transactions`, { params });
  }
}
