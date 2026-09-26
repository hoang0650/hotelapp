import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface GpayConfig {
  enabled: boolean;
  portalEnabled: boolean;
  qrEnabled: boolean;
  sandbox: boolean;
}

export type GpayPricingMethod = 'qr' | 'portal';

export interface GpayPricingPayment {
  success: boolean;
  method: GpayPricingMethod;
  paymentHistoryId: string;
  paymentCode: string;
  amount: number;
  grossAmount: number;
  packageName: string;
  billingType: 'monthly' | 'yearly';
  // method 'qr'
  qrCode?: string;
  qrCodeImage?: string;
  accountNumber?: string;
  accountName?: string;
  provider?: string;
  // method 'portal'
  billUrl?: string;
  billId?: string;
  expiredTime?: string | null;
}

export interface GpayCheckout {
  success: boolean;
  paymentHistoryId: string;
  paymentCode: string;
  billUrl: string;
  billId: string;
  expiredTime?: string | null;
}

export interface GpayPaymentStatus {
  success: boolean;
  paymentHistoryId: string;
  paymentCode: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded' | string;
  completed: boolean;
  /** GPay gateway order status (ORDER_PENDING / SUCCESS / FAILED / CANCEL ...); empty for QR payments. */
  orderStatus: string;
  amount: number;
  packageId: string;
  billingType: string;
  packageName: string;
}

@Injectable({
  providedIn: 'root'
})
export class GpayService {
  private apiUrl = `${environment.apiUrl}/gpay`;

  constructor(private http: HttpClient) {}

  getConfig(): Observable<GpayConfig> {
    return this.http.get<GpayConfig>(`${this.apiUrl}/config`);
  }

  /** Creates the pending payment for a package; the amount is computed by the server. */
  createPricingPayment(body: {
    packageId: string;
    billingType: 'monthly' | 'yearly';
    method: GpayPricingMethod;
    returnUrl?: string;
  }): Observable<GpayPricingPayment> {
    return this.http.post<GpayPricingPayment>(`${this.apiUrl}/pricing`, body);
  }

  /** Gateway bill (ATM / international card) for an existing pending payment. */
  createCheckout(paymentHistoryId: string, returnUrl: string): Observable<GpayCheckout> {
    return this.http.post<GpayCheckout>(`${this.apiUrl}/checkout`, { paymentHistoryId, returnUrl });
  }

  getPaymentStatus(paymentHistoryId: string): Observable<GpayPaymentStatus> {
    return this.http.get<GpayPaymentStatus>(`${this.apiUrl}/payments/${encodeURIComponent(paymentHistoryId)}`);
  }
}
