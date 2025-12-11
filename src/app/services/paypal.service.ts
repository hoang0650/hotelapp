import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PayPalOrderRequest {
  packageId: string;
  userId: string;
  billingType: 'monthly' | 'yearly';
  amount: number;
  currency?: string;
}

export interface PayPalOrderResponse {
  success: boolean;
  orderId: string;
  approvalUrl: string;
  paymentHistoryId: string;
}

export interface PayPalCaptureRequest {
  orderId: string;
}

export interface PayPalCaptureResponse {
  success: boolean;
  status: string;
  paymentHistory: any;
  data: any;
}

@Injectable({
  providedIn: 'root'
})
export class PayPalService {
  private apiUrl = `${environment.apiUrl}/paypal`;

  constructor(private http: HttpClient) {}

  /**
   * Tạo PayPal order
   */
  createOrder(data: PayPalOrderRequest): Observable<PayPalOrderResponse> {
    return this.http.post<PayPalOrderResponse>(`${this.apiUrl}/create-order`, data);
  }

  /**
   * Capture PayPal payment
   */
  captureOrder(data: PayPalCaptureRequest): Observable<PayPalCaptureResponse> {
    return this.http.post<PayPalCaptureResponse>(`${this.apiUrl}/capture-order`, data);
  }

  /**
   * Lấy lịch sử thanh toán PayPal
   */
  getPaymentHistory(params?: {
    userId?: string;
    status?: string;
    limit?: number;
    skip?: number;
  }): Observable<any> {
    let queryParams = '';
    if (params) {
      const query = new URLSearchParams();
      if (params.userId) query.append('userId', params.userId);
      if (params.status) query.append('status', params.status);
      if (params.limit) query.append('limit', params.limit.toString());
      if (params.skip) query.append('skip', params.skip.toString());
      queryParams = '?' + query.toString();
    }
    return this.http.get(`${this.apiUrl}/payment-history${queryParams}`);
  }
}

