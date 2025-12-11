import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CryptoPaymentRequest {
  packageId: string;
  userId: string;
  billingType: 'monthly' | 'yearly';
  amount: number;
  currency?: string;
  network?: 'TRC20' | 'ERC20' | 'BEP20';
}

export interface CryptoPaymentResponse {
  success: boolean;
  transactionId: string;
  cryptoAddress: string;
  cryptoAmount: string;
  cryptoNetwork: string;
  networkInfo: {
    name: string;
    network: string;
    decimals: number;
  };
  qrData: {
    address: string;
    amount: string;
    network: string;
    memo: string;
  };
  paymentHistoryId: string;
  instructions: {
    step1: string;
    step2: string;
    step3: string;
    step4: string;
    warning: string;
  };
}

export interface CryptoVerifyRequest {
  transactionHash: string;
  transactionId: string;
  network?: 'TRC20' | 'ERC20' | 'BEP20';
}

export interface CryptoPaymentData {
  packageId: string;
  packageName: string;
  amount: number;
  billingType: 'monthly' | 'yearly';
  currency?: string;
  userId: string;
}

@Injectable({
  providedIn: 'root'
})
export class CryptoService {
  private apiUrl = `${environment.apiUrl}/crypto`;

  constructor(private http: HttpClient) {}

  /**
   * Tạo thanh toán crypto
   */
  createPayment(data: CryptoPaymentRequest): Observable<CryptoPaymentResponse> {
    return this.http.post<CryptoPaymentResponse>(`${this.apiUrl}/create-payment`, data);
  }

  /**
   * Xác nhận thanh toán crypto
   */
  verifyPayment(data: CryptoVerifyRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/verify-payment`, data);
  }

  /**
   * Lấy lịch sử thanh toán crypto
   */
  getPaymentHistory(params?: {
    userId?: string;
    status?: string;
    network?: string;
    limit?: number;
    skip?: number;
  }): Observable<any> {
    let queryParams = '';
    if (params) {
      const query = new URLSearchParams();
      if (params.userId) query.append('userId', params.userId);
      if (params.status) query.append('status', params.status);
      if (params.network) query.append('network', params.network);
      if (params.limit) query.append('limit', params.limit.toString());
      if (params.skip) query.append('skip', params.skip.toString());
      queryParams = '?' + query.toString();
    }
    return this.http.get(`${this.apiUrl}/payment-history${queryParams}`);
  }
}

