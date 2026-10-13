import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, AfterViewInit, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';
import { HttpClient } from '@angular/common/http';
import { Subject, forkJoin, of, firstValueFrom } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { CurrencyService } from '../../services/currency.service';
import { PayPalService } from '../../services/paypal.service';

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
  private convertRequestId = 0;

  /** Giá gói luôn tính bằng VND (hoặc currency gốc từ paymentData). */
  sourceCurrency: string = 'VND';
  /** Currency người dùng chọn để xem giá. */
  selectedCurrency: string = 'VND';
  /** Số tiền gốc của gói (VND). */
  sourceAmount: number = 0;
  /** Số tiền đã quy đổi sang selectedCurrency để hiển thị. */
  displayAmount: number = 0;
  /** Số tiền PayPal thu (luôn USD). */
  paypalUsdAmount: number = 0;
  /** 1 USD = X sourceCurrency */
  usdToSourceRate: number = 0;
  /** 1 sourceCurrency = X selectedCurrency (khi khác nhau) */
  sourceToSelectedRate: number = 0;
  isConverting: boolean = false;

  availableCurrencies: CurrencyOption[] = [
    { code: 'VND', name: 'Vietnamese Dong', symbol: '₫' },
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
    { code: 'THB', name: 'Thai Baht', symbol: '฿' }
  ];

  constructor(
    private message: NzMessageService,
    @Inject(PLATFORM_ID) private platformId: Object,
    public currencyService: CurrencyService,
    private http: HttpClient,
    private translate: TranslateService,
    private paypalService: PayPalService
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    if (this.paymentData) {
      this.resetFromPaymentData();
    }
    if (this.visible && this.paymentData) {
      this.loadPayPalScript();
    }
  }

  ngAfterViewInit(): void {
    if (this.visible && this.paymentData) {
      setTimeout(() => this.loadPayPalScript(), 100);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private resetFromPaymentData(): void {
    if (!this.paymentData) return;
    this.sourceCurrency = (this.paymentData.currency || 'VND').toUpperCase();
    this.selectedCurrency = this.sourceCurrency;
    this.sourceAmount = Number(this.paymentData.amount) || 0;
    this.displayAmount = 0;
    this.paypalUsdAmount = 0;
    this.usdToSourceRate = 0;
    this.sourceToSelectedRate = 0;
    this.refreshConversions();
  }

  onVisibleChange(visible: boolean): void {
    this.visible = visible;
    this.visibleChange.emit(visible);

    if (visible && this.paymentData) {
      this.resetFromPaymentData();
      setTimeout(() => {
        if (this.visible && this.paymentData) {
          this.loadPayPalScript();
        }
      }, 300);
    } else if (this.isBrowser && typeof document !== 'undefined') {
      const container = document.getElementById(this.paypalButtonId);
      if (container) {
        try {
          container.innerHTML = '';
        } catch (_) {}
      }
    }
  }

  onCurrencyChange(): void {
    const code = (this.selectedCurrency || 'VND').toUpperCase();
    this.selectedCurrency = code;

    if (!this.currencyService.isPayPalSupported(code) && code !== 'USD') {
      this.message.info(
        `${code} không được PayPal hỗ trợ trực tiếp. PayPal sẽ thu bằng USD đã quy đổi từ giá gói ${this.sourceCurrency}.`
      );
    }

    this.refreshConversions();
  }

  /**
   * Luôn quy đổi từ giá gói (sourceAmount + sourceCurrency):
   * - displayAmount = source → selectedCurrency
   * - paypalUsdAmount = source → USD (PayPal luôn charge USD)
   */
  refreshConversions(): void {
    if (!this.paymentData || !(this.sourceAmount > 0)) {
      this.displayAmount = 0;
      this.paypalUsdAmount = 0;
      return;
    }

    const requestId = ++this.convertRequestId;
    this.isConverting = true;

    const toSelected$ =
      this.selectedCurrency === this.sourceCurrency
        ? of(1)
        : this.currencyService.getExchangeRate(this.sourceCurrency, this.selectedCurrency).pipe(
            catchError(() => of(0))
          );

    const toUsd$ =
      this.sourceCurrency === 'USD'
        ? of(1)
        : this.currencyService.getExchangeRate(this.sourceCurrency, 'USD').pipe(
            catchError(() => of(this.sourceCurrency === 'VND' ? 1 / 26000 : 0))
          );

    forkJoin({ toSelected: toSelected$, toUsd: toUsd$ })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ toSelected, toUsd }) => {
          if (requestId !== this.convertRequestId) return;

          const selectedRate = toSelected > 0 ? toSelected : 0;
          let usdRate = toUsd > 0 ? toUsd : 0;

          // Fallback VND → USD nếu API trả 0
          if (!(usdRate > 0) && this.sourceCurrency === 'VND') {
            usdRate = 1 / 26000;
          }

          this.sourceToSelectedRate = selectedRate;
          this.usdToSourceRate = usdRate > 0 ? 1 / usdRate : 0;

          if (this.selectedCurrency === this.sourceCurrency) {
            this.displayAmount = this.currencyService.roundAmount(this.sourceAmount, this.sourceCurrency);
            this.sourceToSelectedRate = 1;
          } else if (selectedRate > 0) {
            this.displayAmount = this.currencyService.roundAmount(
              this.sourceAmount * selectedRate,
              this.selectedCurrency
            );
          } else {
            this.displayAmount = 0;
            this.message.error(this.translate.instant('PAYPAL_PAYMENT.MESSAGES.EXCHANGE_RATE_FAIL'));
          }

          if (this.sourceCurrency === 'USD') {
            this.paypalUsdAmount = this.currencyService.roundAmount(this.sourceAmount, 'USD');
          } else if (usdRate > 0) {
            this.paypalUsdAmount = this.currencyService.roundAmount(this.sourceAmount * usdRate, 'USD');
          } else {
            this.paypalUsdAmount = 0;
          }

          this.isConverting = false;

          if (this.paypalUsdAmount >= 0.01) {
            this.reloadPayPalButtons();
          }
        },
        error: () => {
          if (requestId !== this.convertRequestId) return;
          this.isConverting = false;
          if (this.sourceCurrency === 'VND') {
            const usdRate = 1 / 26000;
            this.usdToSourceRate = 26000;
            this.paypalUsdAmount = this.currencyService.roundAmount(this.sourceAmount * usdRate, 'USD');
            if (this.selectedCurrency === 'VND') {
              this.displayAmount = this.sourceAmount;
              this.sourceToSelectedRate = 1;
            } else if (this.selectedCurrency === 'USD') {
              this.displayAmount = this.paypalUsdAmount;
              this.sourceToSelectedRate = usdRate;
            } else {
              this.displayAmount = 0;
            }
            this.reloadPayPalButtons();
            return;
          }
          this.message.error(this.translate.instant('PAYPAL_PAYMENT.MESSAGES.EXCHANGE_RATE_FAIL'));
        }
      });
  }

  loadPayPalScript(): void {
    if (!this.isBrowser || typeof document === 'undefined') return;

    const container = document.getElementById(this.paypalButtonId);
    if (!container) {
      setTimeout(() => {
        if (this.visible && this.paymentData) this.loadPayPalScript();
      }, 100);
      return;
    }

    if (this.isConverting || !(this.paypalUsdAmount >= 0.01)) {
      setTimeout(() => {
        if (this.visible && this.paymentData) this.loadPayPalScript();
      }, 150);
      return;
    }

    if (this.paypalLoaded && typeof paypal !== 'undefined') {
      this.renderPayPalButton();
      return;
    }

    const existing = document.getElementById('paypal-script') as HTMLScriptElement | null;
    if (existing) {
      if (existing.src.includes('currency=USD') && typeof paypal !== 'undefined') {
        this.paypalLoaded = true;
        this.renderPayPalButton();
        return;
      }
      existing.parentNode?.removeChild(existing);
      this.paypalLoaded = false;
      try {
        delete (window as any).paypal;
      } catch (_) {}
    }

    this.http.get<{ clientId: string; sandbox?: boolean }>(`${environment.apiUrl}/paypal/config`).subscribe({
      next: (cfg) => {
        const clientId = cfg?.clientId;
        if (!clientId) {
          this.message.error(this.translate.instant('PAYPAL_PAYMENT.MESSAGES.CLIENT_ID_MISSING'));
          return;
        }
        const script = document.createElement('script');
        script.id = 'paypal-script';
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`;
        script.async = true;
        script.onload = () => {
          this.paypalLoaded = true;
          this.renderPayPalButton();
        };
        script.onerror = () => {
          this.message.error(this.translate.instant('PAYPAL_PAYMENT.MESSAGES.SDK_LOAD_FAIL'));
        };
        document.body.appendChild(script);
      },
      error: () => {
        this.message.error(this.translate.instant('PAYPAL_PAYMENT.MESSAGES.CONFIG_FAIL'));
      }
    });
  }

  renderPayPalButton(): void {
    if (!this.isBrowser || typeof document === 'undefined') return;
    if (typeof paypal === 'undefined') return;
    if (this.isConverting || !(this.paypalUsdAmount >= 0.01)) return;

    const container = document.getElementById(this.paypalButtonId);
    if (!container || !document.body.contains(container)) return;

    try {
      container.innerHTML = '';
    } catch (_) {
      return;
    }

    const amountValue = this.currencyService.roundAmount(this.paypalUsdAmount, 'USD').toFixed(2);
    const description =
      this.paymentData.description ||
      `${this.paymentData.packageName} - ${
        this.paymentData.billingType === 'yearly' ? 'Thanh toán theo năm' : 'Thanh toán theo tháng'
      }`;

    try {
      paypal
        .Buttons({
          style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'paypal' },
          // The order is created and captured by the server, which computes the package price itself
          // (the amount shown here is only an estimate; the server value wins).
          createOrder: () =>
            firstValueFrom(
              this.paypalService.createOrder({
                packageId: this.paymentData.packageId,
                billingType: this.paymentData.billingType
              } as any)
            ).then((order: any) => {
              if (order?.amount) this.paypalUsdAmount = Number(order.amount);
              return order.orderId;
            }),
          onApprove: (data: any) =>
            firstValueFrom(this.paypalService.captureOrder({ orderId: data.orderID })).then((capture: any) => {
              if (!capture?.success) {
                throw new Error(capture?.underpaid ? 'PayPal payment is less than the package price' : 'PayPal capture failed');
              }
              return this.handlePaymentSuccess({ ...(capture.data || {}), id: data.orderID });
            }),
          onCancel: () => this.handlePaymentCancel(),
          onError: (err: any) => this.handlePaymentError(err)
        })
        .render(`#${this.paypalButtonId}`)
        .catch((error: any) => {
          console.error('PayPal render error:', error);
          this.message.error(this.translate.instant('PAYPAL_PAYMENT.MESSAGES.BUTTON_LOAD_FAIL'));
        });
    } catch (error: any) {
      console.error('Error rendering PayPal button:', error);
      this.message.error(this.translate.instant('PAYPAL_PAYMENT.MESSAGES.BUTTON_LOAD_ERROR'));
    }
  }

  private reloadPayPalButtons(): void {
    if (!this.visible || !this.isBrowser) return;
    setTimeout(() => {
      const container = document.getElementById(this.paypalButtonId);
      if (!container) return;
      try {
        container.innerHTML = '';
      } catch (_) {}
      this.loadPayPalScript();
    }, 50);
  }

  handlePaymentSuccess(details: any): void {
    this.loading = true;
    this.message.success(this.translate.instant('PAYPAL_PAYMENT.MESSAGES.PAYMENT_SUCCESS'));

    this.paymentSuccess.emit({
      success: true,
      paymentId: details.id,
      payerId: details.payer?.payer_id,
      paymentDetails: details,
      paymentData: {
        ...this.paymentData,
        currency: 'USD',
        amount: this.paypalUsdAmount
      },
      currency: 'USD',
      amountUsd: this.paypalUsdAmount,
      sourceCurrency: this.sourceCurrency,
      sourceAmount: this.sourceAmount,
      displayCurrency: this.selectedCurrency,
      displayAmount: this.displayAmount
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
    this.message.error(this.translate.instant('PAYPAL_PAYMENT.MESSAGES.PAYMENT_FAIL'));
    this.loading = false;
  }

  closeModal(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  formatExchangeRate(): string {
    const parts: string[] = [];

    if (this.usdToSourceRate > 0 && this.sourceCurrency !== 'USD') {
      const usdFmt = new Intl.NumberFormat('en-US', {
        maximumFractionDigits: this.usdToSourceRate >= 100 ? 0 : 4
      }).format(this.usdToSourceRate);
      parts.push(`1 USD ≈ ${usdFmt} ${this.sourceCurrency}`);
    }

    if (
      this.selectedCurrency !== this.sourceCurrency &&
      this.selectedCurrency !== 'USD' &&
      this.sourceToSelectedRate > 0
    ) {
      // Ví dụ: 299000 VND → EUR → hiện "1 VND ≈ 0.000034 EUR" hoặc tốt hơn "299.000 ₫ ≈ €10.xx"
      const perUnit = this.sourceToSelectedRate;
      if (perUnit < 0.01) {
        const perMillion = perUnit * 1_000_000;
        parts.push(`1.000.000 ${this.sourceCurrency} ≈ ${perMillion.toFixed(2)} ${this.selectedCurrency}`);
      } else {
        parts.push(`1 ${this.sourceCurrency} ≈ ${perUnit.toPrecision(4)} ${this.selectedCurrency}`);
      }
    }

    return parts.length ? parts.join(' · ') : '—';
  }

  formatPrice(price: number, currency?: string): string {
    if (!price && price !== 0) return '0';
    const currencyCode = (currency || this.selectedCurrency || 'VND').toUpperCase();
    const noDecimal = ['JPY', 'VND', 'KRW'].includes(currencyCode);
    return new Intl.NumberFormat(currencyCode === 'VND' ? 'vi-VN' : 'en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: noDecimal ? 0 : 2,
      maximumFractionDigits: noDecimal ? 0 : 2
    }).format(price);
  }

  getCurrencySymbol(currencyCode: string): string {
    const currency = this.availableCurrencies.find((c) => c.code === currencyCode);
    return currency ? currency.symbol : currencyCode;
  }
}
