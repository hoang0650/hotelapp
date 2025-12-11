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
    // Tạo order_invoice_number nếu chưa có
    const orderInvoiceNumber = paymentData.orderInvoiceNumber || 
      `INV_${Date.now()}_${paymentData.packageId}`;

    // Chuẩn bị các trường form
    const formFields: Record<string, string> = {
      currency: paymentData.currency || 'VND',
      order_amount: Math.round(paymentData.amount).toString(), // Đảm bảo là số nguyên
      operation: 'PURCHASE',
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
   * Gọi backend để tạo signature và lấy config
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
      if (fields[fieldName]) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = fieldName;
        input.value = fields[fieldName];
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
}

