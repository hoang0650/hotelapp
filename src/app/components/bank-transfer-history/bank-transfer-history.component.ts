import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BankTransferService, SepayTransaction, SepayTransactionResponse } from '../../services/bank-transfer.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Subscription } from 'rxjs';
import { Hotel } from '../../interfaces/hotel';
import { HotelService } from '../../services/hotel.service';

@Component({
  selector: 'app-bank-transfer-history',
  templateUrl: './bank-transfer-history.component.html',
  styleUrls: ['./bank-transfer-history.component.css']
})
export class BankTransferHistoryComponent implements OnInit, OnDestroy {
  sepayLoginForm: FormGroup;
  filterForm: FormGroup;
  transactions: SepayTransaction[] = [];
  isLoading = false;
  isLoggedIn = false;
  sepayToken: string | null = null;
  private subscriptions = new Subscription();

  currentPage = 1;
  pageSize = 10;
  totalTransactions = 0;

  hotels: Hotel[] = [];
  selectedHotelId: string | null = null;

  transactionStatusOptions = [
    { label: 'Tất cả', value: '' },
    { label: 'Thành công', value: 'completed' },
    { label: 'Đang xử lý', value: 'pending' },
    { label: 'Thất bại', value: 'failed' },
  ];

  constructor(
    private fb: FormBuilder,
    private bankTransferService: BankTransferService,
    private message: NzMessageService,
    private hotelService: HotelService
  ) {
    this.sepayLoginForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required]
    });

    this.filterForm = this.fb.group({
      dateRange: [[]],
      status: [''],
      bankName: [''],
      search: ['']
    });
  }

  ngOnInit(): void {
    this.checkSepayLoginStatus();
    if (this.isLoggedIn) {
      this.loadTransactions();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  checkSepayLoginStatus(): void {
    this.sepayToken = localStorage.getItem('sepay_token');
    if (this.sepayToken) {
      this.isLoggedIn = true;
    } else {
      this.isLoggedIn = false;
    }
  }

  handleSepayLogin(): void {
    if (this.sepayLoginForm.invalid) {
      this.message.error('Vui lòng nhập tên đăng nhập và mật khẩu SePay.');
      return;
    }
    this.isLoading = true;
    const { username, password } = this.sepayLoginForm.value;
    this.subscriptions.add(
      this.bankTransferService.sepayLogin(username, password).subscribe(
        response => {
          this.isLoading = false;
          if (response && response.token) {
            this.sepayToken = response.token;
            localStorage.setItem('sepay_token', response.token);
            this.isLoggedIn = true;
            this.message.success('Đăng nhập SePay thành công!');
            this.loadTransactions();
          } else {
            this.message.error('Đăng nhập SePay thất bại: Không nhận được token.');
          }
        },
        error => {
          this.isLoading = false;
          this.message.error(error.error?.error || error.error?.detail || 'Đăng nhập SePay thất bại.');
          console.error('Sepay Login Error:', error);
        }
      )
    );
  }

  handleSepayLogout(): void {
    localStorage.removeItem('sepay_token');
    this.sepayToken = null;
    this.isLoggedIn = false;
    this.transactions = [];
    this.totalTransactions = 0;
    this.message.info('Đã đăng xuất khỏi SePay.');
  }

  loadTransactions(page: number = this.currentPage, pageSize: number = this.pageSize): void {
    if (!this.isLoggedIn || !this.sepayToken) {
      return;
    }
    this.isLoading = true;

    const filters = this.filterForm.value;
    const params: any = {
      page: page,
      pageSize: pageSize,
    };

    if (filters.dateRange && filters.dateRange.length === 2) {
      params.date_from = this.formatDate(filters.dateRange[0]);
      params.date_to = this.formatDate(filters.dateRange[1]);
    }
    if (filters.status) params.status = filters.status;
    if (filters.bankName) params.bankName = filters.bankName.trim();
    if (filters.search) params.search = filters.search.trim();

    this.subscriptions.add(
      this.bankTransferService.getSepayTransactions(this.sepayToken, params).subscribe(
        (response: SepayTransactionResponse) => {
          this.transactions = response.data.map(t => ({...t, source: 'SePay'}));
          this.totalTransactions = response.total;
          this.currentPage = page;
          this.isLoading = false;
        },
        error => {
          this.isLoading = false;
          this.message.error(error.error?.error || 'Không thể tải lịch sử giao dịch SePay.');
          if (error.status === 401) {
            this.handleSepayLogout();
            this.message.error('Token SePay không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.');
          }
          console.error('Load Sepay Transactions Error:', error);
        }
      )
    );
  }

  formatDate(date: Date): string {
    if (!date) return '';
    const year = date.getFullYear();
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const day = ('0' + date.getDate()).slice(-2);
    return `${year}-${month}-${day}`;
  }

  onFilterSubmit(): void {
    this.currentPage = 1;
    this.loadTransactions();
  }

  onPageIndexChange(page: number): void {
    this.loadTransactions(page, this.pageSize);
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.currentPage = 1;
    this.loadTransactions(1, size);
  }

  viewDetails(transaction: SepayTransaction): void {
    console.log('View Details:', transaction);
    this.message.info(`Chi tiết GD: ${transaction.transaction_content}, Số tiền: ${transaction.amount}`);
  }
} 