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
  private apiUrl = 'api/bank-transfers'; // Thay đổi URL API theo backend của bạn

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
} 