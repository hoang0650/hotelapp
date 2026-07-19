import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SePayConfig {
  merchant: string;
  secretKey: string;
  sandbox?: boolean;
}

export interface SePayPaymentData {
  packageId: string;
  packageName: string;
  amount: number;
  billingType: 'monthly' | 'yearly';
  currency?: string;
  description?: string;
  customerId?: string;
  orderInvoiceNumber?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SePayService {
  private readonly SEPAY_SANDBOX_URL = 'https://pay-sandbox.sepay.vn/v1/checkout/init';
  private readonly SEPAY_PRODUCTION_URL = 'https://pay.sepay.vn/v1/checkout/init';
  private apiUrl = `${environment.apiUrl}/sepay`;
  
  // Các trường được phép ký trong signature (theo đúng thứ tự trong tài liệu)
  private readonly SIGNED_FIELDS = [
    'merchant',
    'operation',
    'payment_method',
    'order_amount',
    'currency',
    'order_invoice_number',
    'order_description',
    'customer_id',
    'success_url',
    'error_url',
    'cancel_url'
  ];

  constructor(private http: HttpClient) {}

  /**
   * Tạo mã thanh toán SePay theo cấu trúc
   * Format: PHG + số nguyên (3-8 ký tự)
   * Ví dụ: PHG11111111
   */
  private generateSePayPaymentCode(prefix: string = 'PHG', minLength: number = 6, maxLength: number = 8): string {
    // Tạo số ngẫu nhiên từ 6-8 ký tự để đảm bảo unique
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    // Tạo số ngẫu nhiên với độ dài đã chọn
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;
    
    return `${prefix}${randomNumber}`;
  }

  /**
   * Tạo form thanh toán SePay và submit
   * @param paymentData Thông tin thanh toán
   * @param callbacks URLs callback (success, error, cancel)
   * @param onError Callback khi có lỗi
   */
  createPaymentForm(
    paymentData: SePayPaymentData,
    callbacks?: {
      successUrl?: string;
      errorUrl?: string;
      cancelUrl?: string;
    },
    onError?: (error: any) => void
  ): void {
    // Tạo order_invoice_number nếu chưa có theo cấu trúc SePay: PHG + số nguyên (3-8 ký tự)
    const orderInvoiceNumber = paymentData.orderInvoiceNumber || 
      this.generateSePayPaymentCode('PHG', 6, 8);

    // Chuẩn bị các trường form
    const formFields: Record<string, string> = {
      currency: paymentData.currency || 'VND',
      order_amount: Math.round(paymentData.amount).toString(), // Đảm bảo là số nguyên
      operation: 'PURCHASE',
      // Không thêm payment_method nếu để trống - SePay sẽ tự chọn
      order_description: paymentData.description || `Thanh toán gói ${paymentData.packageName} - ${paymentData.billingType === 'yearly' ? 'theo năm' : 'theo tháng'}`,
      order_invoice_number: orderInvoiceNumber
    };

    // Thêm các trường optional
    if (paymentData.customerId) {
      formFields['customer_id'] = paymentData.customerId;
    }

    if (callbacks?.successUrl) {
      formFields['success_url'] = callbacks.successUrl;
    }

    if (callbacks?.errorUrl) {
      formFields['error_url'] = callbacks.errorUrl;
    }

    if (callbacks?.cancelUrl) {
      formFields['cancel_url'] = callbacks.cancelUrl;
    }

    // Gọi backend để tạo signature và lấy merchant config
    this.createPaymentRequest(formFields, paymentData).subscribe({
      next: (response: any) => {
        if (response.signature && response.checkoutUrl) {
          formFields['merchant'] = response.merchant;
          formFields['signature'] = response.signature;
          this.submitForm(response.checkoutUrl, formFields);
        } else {
          console.error('Invalid response from backend:', response);
          const error = {
            error: {
              error: response.error || 'Không thể tạo form thanh toán SePay',
              message: response.message || 'Phản hồi từ server không hợp lệ'
            }
          };
          if (onError) {
            onError(error);
          } else {
            alert('Không thể tạo form thanh toán SePay. Vui lòng thử lại.');
          }
        }
      },
      error: (error) => {
        console.error('Error creating SePay payment:', error);
        // Gọi callback error nếu có
        if (onError) {
          onError(error);
        } else {
          // Fallback: hiển thị alert nếu không có callback
          alert(error.error?.error || error.error?.message || 'Có lỗi xảy ra khi tạo form thanh toán SePay. Vui lòng thử lại.');
        }
      }
    });
  }

  /**
   * Tạo payment history và lấy thông tin thanh toán
   * Gọi trực tiếp đến webhook endpoint để tạo payment history
   */
  createPaymentHistory(paymentData: SePayPaymentData): Observable<any> {
    // Tạo mã thanh toán
    const orderInvoiceNumber = paymentData.orderInvoiceNumber || 
      this.generateSePayPaymentCode('PHG', 6, 8);

    // Gọi đến webhook endpoint để tạo payment history
    // Note: Endpoint này sẽ tạo payment history với status 'pending'
    const webhookUrl = `${environment.apiUrl}/hooks/sepay-payment`;
    
    // Tạo payload để tạo payment history
    const payload = {
      packageId: paymentData.packageId,
      userId: paymentData.customerId,
      billingType: paymentData.billingType,
      amount: paymentData.amount,
      currency: paymentData.currency || 'VND',
      orderInvoiceNumber: orderInvoiceNumber,
      description: paymentData.description
    };

    // Gọi đến endpoint tạo payment history (có thể là một endpoint mới hoặc sử dụng webhook endpoint)
    // Tạm thời sử dụng endpoint mới để tạo payment history
    return this.http.post<any>(`${this.apiUrl}/create-payment-history`, payload);
  }

  /**
   * Tạo payment history cho checkout phòng
   */
  createPaymentHistoryForRoom(payload: {
    userId: string;
    amount: number;
    currency?: string;
    description?: string;
    roomId: string;
    roomNumber: string;
  }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/create-payment-history`, payload);
  }

  /**
   * Gọi backend để tạo signature và lấy config (DEPRECATED - không dùng nữa)
   */
  private createPaymentRequest(
    fields: Record<string, string>,
    paymentData: SePayPaymentData
  ): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/create-payment`, {
      fields,
      paymentData
    });
  }

  generatePaymentSound(payload: {
    message: string;
    speed?: number | string;
    voice?: string;
    format?: 'mp3' | 'wav' | string;
    callbackUrl?: string;
  }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/fpt-tts`, payload);
  }

  getTtsFile(asyncUrl: string): Observable<Blob> {
    const proxyUrl = `${this.apiUrl}/fpt-tts-file?url=${encodeURIComponent(asyncUrl)}`;
    return this.http.get(proxyUrl, { responseType: 'blob' });
  }

  /**
   * Submit form đến SePay
   */
  private submitForm(url: string, fields: Record<string, string>): void {
    // Tạo form element
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    form.style.display = 'none';

    // Thêm các input fields theo đúng thứ tự như trong tài liệu
    const fieldOrder = [
      'merchant',
      'currency',
      'order_amount',
      'operation',
      'order_description',
      'order_invoice_number',
      'payment_method',
      'customer_id',
      'success_url',
      'error_url',
      'cancel_url',
      'signature'
    ];

    fieldOrder.forEach(fieldName => {
      // Thêm field nếu có trong fields (kể cả giá trị rỗng cho payment_method)
      if (fields[fieldName] !== undefined && fields[fieldName] !== null) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = fieldName;
        input.value = fields[fieldName] || ''; // Đảm bảo có giá trị, kể cả rỗng
        form.appendChild(input);
      }
    });

    // Thêm form vào body và submit
    document.body.appendChild(form);
    form.submit();
    // Xóa form sau khi submit (sẽ redirect nên có thể không cần)
    setTimeout(() => {
      if (document.body.contains(form)) {
        document.body.removeChild(form);
      }
    }, 1000);
  }

  /**
   * Lấy QR code thanh toán cho pricing payment (từ superadmin/settings)
   * Không yêu cầu quyền đặc biệt, chỉ cần đăng nhập
   */
  getPricingQRCode(): Observable<any> {
    return this.http.get(`${this.apiUrl}/pricing-qr-code`);
  }

  /**
   * Lấy lịch sử thanh toán SePay
   */
  getPaymentHistory(params?: {
    userId?: string;
    hotelId?: string;
    status?: string;
    limit?: number;
    skip?: number;
  }): Observable<any> {
    let queryParams = '';
    if (params) {
      const query = new URLSearchParams();
      if (params.userId) query.append('userId', params.userId);
      if (params.hotelId) query.append('hotelId', params.hotelId);
      if (params.status) query.append('status', params.status);
      if (params.limit) query.append('limit', params.limit.toString());
      if (params.skip) query.append('skip', params.skip.toString());
      queryParams = '?' + query.toString();
    }
    return this.http.get(`${this.apiUrl}/payment-history${queryParams}`);
  }

  updatePaymentHistoryStatus(paymentHistoryId: string, status: 'pending' | 'completed' | 'failed' | 'cancelled', note?: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/payment-history/${paymentHistoryId}/status`, {
      status,
      note: note || ''
    });
  }
}

