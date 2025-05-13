import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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

@Injectable({
  providedIn: 'root'
})
export class BankTransferService {
  private apiUrl = 'http://localhost:3000'; // Thay đổi URL API theo backend của bạn

  constructor(private http: HttpClient) { }

  getTransferHistory(): Observable<BankTransfer[]> {
    return this.http.get<BankTransfer[]>(this.apiUrl);
  }

  getTransferById(id: string): Observable<BankTransfer> {
    return this.http.get<BankTransfer>(`${this.apiUrl}/${id}`);
  }

  searchTransfers(params: {
    startDate?: Date,
    endDate?: Date,
    status?: string,
    bankName?: string
  }): Observable<BankTransfer[]> {
    return this.http.get<BankTransfer[]>(`${this.apiUrl}/search`, { params: params as any });
  }

  // Đăng nhập SePay
  sepayLogin(username: string, password: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/sepay/auth`, { username, password });
  }

  // Lấy lịch sử giao dịch từ SePay qua backend proxy, truyền token qua header
  getSepayTransactions(params?: any, token?: string): Observable<any> {
    const options: any = { params };
    if (token) {
      options.headers = { Authorization: `Bearer ${token}` };
    }
    return this.http.get<any>(`${this.apiUrl}/sepay/transactions`, options);
  }
} 