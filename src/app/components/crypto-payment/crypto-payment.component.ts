import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';
import { CryptoService, CryptoPaymentRequest, CryptoPaymentData } from '../../services/crypto.service';

@Component({
  selector: 'app-crypto-payment',
  templateUrl: './crypto-payment.component.html',
  styleUrls: ['./crypto-payment.component.css']
})
export class CryptoPaymentComponent implements OnInit {
  @Input() paymentData!: CryptoPaymentData;
  @Input() visible: boolean = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() paymentSuccess = new EventEmitter<any>();
  @Output() paymentCancel = new EventEmitter<void>();

  loading = false;
  paymentInfo: any = null;
  selectedNetwork: 'TRC20' | 'ERC20' | 'BEP20' = 'TRC20';
  transactionHash: string = '';
  verifying = false;

  networks = [
    { value: 'TRC20', label: 'TRC20 (Tron)', icon: '🌐' },
    { value: 'ERC20', label: 'ERC20 (Ethereum)', icon: '⛽' },
    { value: 'BEP20', label: 'BEP20 (BSC)', icon: '🔷' }
  ];

  constructor(
    private cryptoService: CryptoService,
    private message: NzMessageService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    // Nếu paymentData có network, sử dụng network đó
    if (this.paymentData?.network) {
      this.selectedNetwork = this.paymentData.network;
    }
    
    if (this.visible && this.paymentData) {
      this.createPayment();
    }
  }

  createPayment(): void {
    if (!this.paymentData) {
      this.message.error(this.translate.instant('CRYPTO_PAYMENT.MESSAGES.MISSING_PAYMENT_INFO'));
      return;
    }

    // Ưu tiên sử dụng network từ paymentData, nếu không có thì dùng selectedNetwork
    const network = this.paymentData.network || this.selectedNetwork;

    this.loading = true;
    const request: CryptoPaymentRequest = {
      packageId: this.paymentData.packageId,
      userId: this.paymentData.userId,
      billingType: this.paymentData.billingType,
      amount: this.paymentData.amount,
      currency: this.paymentData.currency || 'VND',
      network: network
    };

    this.cryptoService.createPayment(request).subscribe({
      next: (response) => {
        this.paymentInfo = response;
        this.loading = false;
        this.message.success(this.translate.instant('CRYPTO_PAYMENT.MESSAGES.CREATED'));
      },
      error: (error) => {
        console.error('Error creating crypto payment:', error);
        this.message.error(error.error?.error || this.translate.instant('CRYPTO_PAYMENT.MESSAGES.CREATE_ERROR'));
        this.loading = false;
      }
    });
  }

  onNetworkChange(): void {
    if (this.paymentData) {
      this.createPayment();
    }
  }

  verifyPayment(): void {
    if (!this.transactionHash || !this.paymentInfo) {
      this.message.warning('Vui lòng nhập transaction hash');
      return;
    }

    this.verifying = true;
    this.cryptoService.verifyPayment({
      transactionHash: this.transactionHash,
      transactionId: this.paymentInfo.transactionId,
      network: this.selectedNetwork
    }).subscribe({
      next: (response) => {
        this.message.success(this.translate.instant('CRYPTO_PAYMENT.MESSAGES.CONFIRM_REQUESTED'));
        this.verifying = false;
        // Có thể emit event để parent component xử lý
        this.paymentSuccess.emit({
          success: true,
          transactionId: this.paymentInfo.transactionId,
          transactionHash: this.transactionHash,
          status: 'pending'
        });
      },
      error: (error) => {
        console.error('Error verifying payment:', error);
        this.message.error(error.error?.error || this.translate.instant('CRYPTO_PAYMENT.MESSAGES.CONFIRM_ERROR'));
        this.verifying = false;
      }
    });
  }

  copyToClipboard(text: string, label: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.message.success(this.translate.instant('CRYPTO_PAYMENT.MESSAGES.COPIED_LABEL', { label }));
    }).catch(() => {
      this.message.error(this.translate.instant('CRYPTO_PAYMENT.MESSAGES.COPY_FAIL'));
    });
  }

  closeModal(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.paymentInfo = null;
    this.transactionHash = '';
  }

  onCancel(): void {
    this.message.info('Đã hủy thanh toán crypto');
    this.paymentCancel.emit();
    this.closeModal();
  }
}

