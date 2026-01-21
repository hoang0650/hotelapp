import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, AfterViewInit, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NzMessageService } from 'ng-zorro-antd/message';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { CurrencyService } from '../../services/currency.service';

declare var paypal: any;

export interface PayPalPaymentData {
  packageId: string;
  packageName: string;
  amount: number;
  billingType: 'monthly' | 'yearly';
  currency?: string;
  description?: string;
}

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
}

@Component({
  selector: 'app-paypal-payment',
  templateUrl: './paypal-payment.component.html',
  styleUrls: ['./paypal-payment.component.css']
})
export class PaypalPaymentComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() paymentData!: PayPalPaymentData;
  @Input() visible: boolean = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() paymentSuccess = new EventEmitter<any>();
  @Output() paymentCancel = new EventEmitter<void>();

  loading = false;
  paypalButtonId = 'paypal-button-container';
  private destroy$ = new Subject<void>();
  private paypalLoaded = false;
  private isBrowser: boolean;
  
  selectedCurrency: string = 'USD';
  originalAmount: number = 0; // Số tiền gốc
  convertedAmount: number = 0; // Số tiền đã convert sang USD
  exchangeRate: number = 1; // Tỷ giá hiện tại
  isConverting: boolean = false;
  
  availableCurrencies: CurrencyOption[] = [
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'GBP', name: 'British Pound', symbol: '£' },
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
    { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
    { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
    { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
    { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
    { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
    { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
    { code: 'THB', name: 'Thai Baht', symbol: '฿' },
    { code: 'VND', name: 'Vietnamese Dong', symbol: '₫' }
  ];

  constructor(
    private message: NzMessageService,
    @Inject(PLATFORM_ID) private platformId: Object,
    public currencyService: CurrencyService,
    private http: HttpClient
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    if (this.paymentData) {
      // Sử dụng currency từ paymentData hoặc mặc định là USD
      const requestedCurrency = this.paymentData.currency || 'USD';
      
      // Kiểm tra currency có được PayPal hỗ trợ không
      if (this.currencyService.isPayPalSupported(requestedCurrency)) {
        this.selectedCurrency = requestedCurrency;
      } else {
        this.selectedCurrency = 'USD';
        this.message.warning(`Currency ${requestedCurrency} không được PayPal hỗ trợ. Đã chuyển sang USD.`);
      }
      
      // Lưu số tiền gốc
      this.originalAmount = this.paymentData.amount;
      this.convertedAmount = this.originalAmount;
      
      // Nếu currency khác USD, convert sang USD
      if (this.selectedCurrency !== 'USD') {
        this.convertToUSD();
      }
    }
    
    if (this.visible && this.paymentData) {
      this.loadPayPalScript();
    }
  }

  ngAfterViewInit(): void {
    if (this.visible && this.paymentData) {
      setTimeout(() => {
        this.loadPayPalScript();
      }, 100);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPayPalScript(): void {
    // Chỉ chạy trên browser, không chạy trên server
    if (!this.isBrowser) {
      return;
    }

    // Kiểm tra container có tồn tại trong DOM không
    if (typeof document !== 'undefined') {
      const container = document.getElementById(this.paypalButtonId);
      if (!container) {
        console.warn('PayPal container not found, waiting...');
        // Retry sau 100ms
        setTimeout(() => {
          if (this.visible && this.paymentData) {
            this.loadPayPalScript();
          }
        }, 100);
        return;
      }
    }

    if (this.paypalLoaded && typeof paypal !== 'undefined') {
      this.renderPayPalButton();
      return;
    }

    // Kiểm tra xem script đã được load chưa
    if (typeof document !== 'undefined' && document.getElementById('paypal-script')) {
      this.paypalLoaded = true;
      this.renderPayPalButton();
      return;
    }

    // Load PayPal SDK từ cấu hình backend
    if (typeof document === 'undefined') {
      return;
    }

    this.http.get<{ clientId: string; sandbox?: boolean }>(`${environment.apiUrl}/paypal/config`)
      .subscribe({
        next: (cfg) => {
          const clientId = cfg?.clientId;
          if (!clientId) {
            this.message.error('Thiếu cấu hình PayPal Client ID');
            return;
          }
          const script = document.createElement('script');
          script.id = 'paypal-script';
          script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${this.selectedCurrency}&intent=capture`;
          script.async = true;
          script.onload = () => {
            this.paypalLoaded = true;
            this.renderPayPalButton();
          };
          script.onerror = () => {
            this.message.error('Không thể tải PayPal SDK. Vui lòng thử lại sau.');
          };
          document.body.appendChild(script);
        },
        error: () => {
          this.message.error('Không thể lấy cấu hình PayPal từ hệ thống');
        }
      });
  }

  renderPayPalButton(): void {
    if (!this.isBrowser || typeof document === 'undefined') {
      return;
    }

    if (typeof paypal === 'undefined') {
      console.error('PayPal SDK chưa được load');
      return;
    }

    // Kiểm tra container có tồn tại trong DOM không
    const container = document.getElementById(this.paypalButtonId);
    if (!container) {
      console.warn('PayPal container element not found in DOM');
      return;
    }

    // Kiểm tra container có trong DOM tree không
    if (!document.body.contains(container)) {
      console.warn('PayPal container element not in DOM tree');
      return;
    }

    // Xóa button cũ nếu có (nhưng đảm bảo container vẫn còn trong DOM)
    try {
      container.innerHTML = '';
    } catch (error) {
      console.error('Error clearing PayPal container:', error);
      return;
    }

    // Luôn dùng USD cho PayPal (đã convert trước đó)
    const amount = this.convertedAmount;
    const currency = 'USD'; // PayPal luôn dùng USD
    const description = this.paymentData.description || `${this.paymentData.packageName} - ${this.paymentData.billingType === 'yearly' ? 'Thanh toán theo năm' : 'Thanh toán theo tháng'}`;

    // Kiểm tra lại container trước khi render
    const containerCheck = document.getElementById(this.paypalButtonId);
    if (!containerCheck || !document.body.contains(containerCheck)) {
      console.error('Container không tồn tại hoặc đã bị xóa khỏi DOM');
      return;
    }

    try {
      paypal.Buttons({
        style: {
          layout: 'vertical',
          color: 'blue',
          shape: 'rect',
          label: 'paypal'
        },
        createOrder: (data: any, actions: any) => {
          return actions.order.create({
            purchase_units: [{
              amount: {
                value: amount.toFixed(2),
                currency_code: currency
              },
              description: description
            }]
          });
        },
        onApprove: (data: any, actions: any) => {
          return actions.order.capture().then((details: any) => {
            this.handlePaymentSuccess(details);
          });
        },
        onCancel: (data: any) => {
          this.handlePaymentCancel();
        },
        onError: (err: any) => {
          this.handlePaymentError(err);
        }
      }).render(`#${this.paypalButtonId}`).catch((error: any) => {
        console.error('PayPal render error:', error);
        this.message.error('Không thể tải PayPal button. Vui lòng thử lại.');
      });
    } catch (error: any) {
      console.error('Error rendering PayPal button:', error);
      this.message.error('Có lỗi xảy ra khi tải PayPal button. Vui lòng thử lại.');
    }
  }

  handlePaymentSuccess(details: any): void {
    this.loading = true;
    this.message.success('Thanh toán PayPal thành công!');
    
    // Emit event với thông tin thanh toán, bao gồm currency đã chọn
    this.paymentSuccess.emit({
      success: true,
      paymentId: details.id,
      payerId: details.payer?.payer_id,
      paymentDetails: details,
      paymentData: {
        ...this.paymentData,
        currency: this.selectedCurrency // Gửi currency đã chọn
      },
      currency: this.selectedCurrency
    });

    this.loading = false;
    this.closeModal();
  }

  handlePaymentCancel(): void {
    this.message.warning('Bạn đã hủy thanh toán PayPal');
    this.paymentCancel.emit();
    this.closeModal();
  }

  handlePaymentError(err: any): void {
    console.error('PayPal payment error:', err);
    this.message.error('Có lỗi xảy ra khi thanh toán PayPal. Vui lòng thử lại.');
    this.loading = false;
  }

  closeModal(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  onVisibleChange(visible: boolean): void {
    this.visible = visible;
    this.visibleChange.emit(visible);
    
    if (visible && this.paymentData) {
      // Reset currency khi mở modal
      if (this.paymentData.currency) {
        this.selectedCurrency = this.paymentData.currency;
      }
      
      // Đợi modal đã render xong trước khi load PayPal script
      setTimeout(() => {
        // Kiểm tra container có tồn tại trong DOM không
        const container = document.getElementById(this.paypalButtonId);
        if (container && document.body.contains(container)) {
          this.loadPayPalScript();
        } else {
          // Retry sau 200ms nếu container chưa sẵn sàng
          setTimeout(() => {
            if (this.visible && this.paymentData) {
              this.loadPayPalScript();
            }
          }, 200);
        }
      }, 300);
    } else {
      // Khi đóng modal, cleanup PayPal button
      if (this.isBrowser && typeof document !== 'undefined') {
        const container = document.getElementById(this.paypalButtonId);
        if (container) {
          try {
            container.innerHTML = '';
          } catch (error) {
            console.error('Error cleaning up PayPal container:', error);
          }
        }
      }
    }
  }

  onCurrencyChange(): void {
    // Nếu currency không được PayPal hỗ trợ (như VND), vẫn cho phép chọn nhưng sẽ convert sang USD
    // Không cần kiểm tra và reject, chỉ cần convert
    const isPayPalSupported = this.currencyService.isPayPalSupported(this.selectedCurrency);
    
    if (!isPayPalSupported) {
      // Hiển thị thông báo nhưng vẫn cho phép chọn
      this.message.info(`${this.selectedCurrency} không được PayPal hỗ trợ trực tiếp. Số tiền sẽ được chuyển đổi sang USD.`);
    }

    // Convert sang USD nếu currency khác USD hoặc không được PayPal hỗ trợ
    if (this.selectedCurrency !== 'USD') {
      this.convertToUSD();
    } else {
      // Nếu chọn USD, dùng số tiền gốc
      this.convertedAmount = this.originalAmount;
      this.exchangeRate = 1;
    }

    // Khi thay đổi currency, cần reload PayPal SDK với currency mới
    if (this.isBrowser && typeof document !== 'undefined') {
      // Đợi một chút để đảm bảo DOM đã sẵn sàng
      setTimeout(() => {
        // Kiểm tra container có tồn tại không
        const container = document.getElementById(this.paypalButtonId);
        if (!container) {
          console.warn('Container not found when changing currency');
          return;
        }

        // Xóa button cũ một cách an toàn
        try {
          container.innerHTML = '';
        } catch (error) {
          console.error('Error clearing container:', error);
        }
        
        // Xóa script cũ
        const oldScript = document.getElementById('paypal-script');
        if (oldScript && oldScript.parentNode) {
          oldScript.parentNode.removeChild(oldScript);
        }
        
        // Reset flag
        this.paypalLoaded = false;
        
        // Load lại với currency mới (luôn dùng USD cho PayPal)
        setTimeout(() => {
          if (this.visible && this.paymentData) {
            this.loadPayPalScript();
          }
        }, 200);
      }, 100);
    }
  }

  /**
   * Convert số tiền từ currency hiện tại sang USD
   */
  convertToUSD(): void {
    if (!this.paymentData || this.selectedCurrency === 'USD') {
      this.convertedAmount = this.originalAmount;
      this.exchangeRate = 1;
      return;
    }

    this.isConverting = true;
    
    // Lấy tỷ giá từ currency hiện tại sang USD
    this.currencyService.getExchangeRate(this.selectedCurrency, 'USD')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rate: number) => {
          this.exchangeRate = rate;
          // Convert: amount * rate = USD amount
          const converted = this.originalAmount * rate;
          this.convertedAmount = this.currencyService.roundAmount(converted, 'USD');
          this.isConverting = false;
        },
        error: (error) => {
          console.error('Currency conversion error:', error);
          this.message.error('Không thể lấy tỷ giá. Sử dụng giá gốc.');
          this.convertedAmount = this.originalAmount;
          this.exchangeRate = 1;
          this.isConverting = false;
        }
      });
  }

  formatPrice(price: number, currency?: string): string {
    if (!price && price !== 0) return '0';
    const currencyCode = currency || this.selectedCurrency;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price);
  }

  getCurrencySymbol(currencyCode: string): string {
    const currency = this.availableCurrencies.find(c => c.code === currencyCode);
    return currency ? currency.symbol : currencyCode;
  }
}

