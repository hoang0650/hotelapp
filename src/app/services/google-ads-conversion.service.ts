import { Injectable } from '@angular/core';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export type GoogleAdsPurchaseConversion = {
  /** ID giao dịch duy nhất (PayPal order id / SePay paymentHistoryId) — chống đếm trùng */
  transactionId: string;
  /** Giá trị đơn hàng (VND hoặc USD tùy currency) */
  value?: number;
  currency?: 'VND' | 'USD' | string;
  /** true nếu khách lần đầu mua gói */
  newCustomer?: boolean;
};

/**
 * Google Ads conversion: Lượt mua hàng
 * AW-16709706533 / wSTyCPi2yugcEKXG558-
 */
@Injectable({ providedIn: 'root' })
export class GoogleAdsConversionService {
  private readonly sendTo = 'AW-16709706533/wSTyCPi2yugcEKXG558-';
  private readonly reportedIds = new Set<string>();

  trackPurchase(payload: GoogleAdsPurchaseConversion): void {
    if (typeof window === 'undefined') return;

    const transactionId = String(payload.transactionId || '').trim();
    if (!transactionId) {
      console.warn('[GoogleAds] skip conversion: missing transaction_id');
      return;
    }

    if (this.reportedIds.has(transactionId)) {
      console.info('[GoogleAds] skip duplicate conversion:', transactionId);
      return;
    }

    if (typeof window.gtag !== 'function') {
      console.warn('[GoogleAds] gtag chưa sẵn sàng — thử lại sau 500ms');
      setTimeout(() => this.trackPurchase(payload), 500);
      return;
    }

    const eventParams: Record<string, unknown> = {
      send_to: this.sendTo,
      transaction_id: transactionId,
    };

    if (typeof payload.value === 'number' && payload.value > 0) {
      eventParams['value'] = payload.value;
      eventParams['currency'] = payload.currency || 'VND';
    }

    if (typeof payload.newCustomer === 'boolean') {
      eventParams['new_customer'] = payload.newCustomer;
    }

    try {
      window.gtag('event', 'conversion', eventParams);
      this.reportedIds.add(transactionId);
      console.info('[GoogleAds] purchase conversion sent:', eventParams);
    } catch (error) {
      console.error('[GoogleAds] conversion error:', error);
    }
  }
}
