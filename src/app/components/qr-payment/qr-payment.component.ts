import { Component, OnInit } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { User } from '../../interfaces/user';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-qr-payment',
  templateUrl: './qr-payment.component.html',
  styleUrls: ['./qr-payment.component.css']
})
export class QrPaymentComponent implements OnInit {
  loading = false;
  qrPaymentUrl = '';
  bankName = '';
  accountNumber = '';
  accountHolderName = '';
  beneficiaryName = '';
  fullName = '';
  username = '';
  email = '';
  phone = '';

  constructor(
    private userService: UserService,
    private message: NzMessageService
  ) {}

  ngOnInit(): void {
    this.loadPaymentInfo();
  }

  loadPaymentInfo(): void {
    this.loading = true;
    this.userService.getProfile().subscribe({
      next: (user: User) => {
        this.applyProfilePaymentInfo(user);
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading QR payment profile:', error);
        this.message.error('Khong the tai thong tin QR thanh toan tu ho so');
        this.loading = false;
      }
    });
  }

  get hasQrPayment(): boolean {
    return !!this.qrPaymentUrl;
  }

  get hasBankAccountInfo(): boolean {
    return !!this.bankName && !!this.accountNumber;
  }

  get displayBeneficiaryName(): string {
    return this.beneficiaryName || this.accountHolderName || this.fullName || this.username;
  }

  get paymentInstructions(): string {
    if (!this.hasQrPayment) {
      return 'Vui long cap nhat thong tin ngan hang trong ho so de tao QR thanh toan.';
    }
    return 'Su dung ung dung ngan hang de quet ma QR hoac mo link QR thanh toan ben duoi.';
  }

  private applyProfilePaymentInfo(user: User): void {
    const bankAccount = user?.bankAccount || {};
    this.bankName = String(bankAccount.bankName || '').trim();
    this.accountNumber = String(bankAccount.accountNumber || '').trim();
    this.accountHolderName = String(bankAccount.accountHolderName || '').trim();
    this.beneficiaryName = String(bankAccount.beneficiaryName || '').trim();
    this.fullName = String(user?.fullName || '').trim();
    this.username = String(user?.username || '').trim();
    this.email = String(user?.email || '').trim();
    this.phone = String(user?.phone || '').trim();

    const savedQrPaymentUrl = String(bankAccount.qrPaymentUrl || '').trim();
    this.qrPaymentUrl = savedQrPaymentUrl || this.buildQrPaymentUrl(this.bankName, this.accountNumber);
  }

  private buildQrPaymentUrl(bankName: string, accountNumber: string): string {
    if (!bankName || !accountNumber) {
      return '';
    }

    const encodedAccount = encodeURIComponent(accountNumber);
    const encodedBank = encodeURIComponent(bankName);
    return `https://qr.sepay.vn/img?acc=${encodedAccount}&bank=${encodedBank}`;
  }
}
