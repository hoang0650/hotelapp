import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { BankTransferService, BankTransfer } from '../../services/bank-transfer.service';

// Định nghĩa Interface cho một giao dịch
export interface SepayTransaction {
  id: string;
  bank_brand_name: string;
  account_number: string;
  transaction_date: string;
  amount_out: string;
  amount_in: string;
  accumulated: string;
  transaction_content: string;
  reference_number: string;
  code: string | null;
  sub_account: string | null;
  bank_account_id: string;
}

// Định nghĩa Interface cho cấu trúc response từ API SePay
export interface SepayApiResponse {
  status: number;
  error: string | null;
  messages: {
    success: boolean;
  };
  transactions: SepayTransaction[];
}

@Component({
  selector: 'app-bank-transfer-history',
  templateUrl: './bank-transfer-history.component.html',
  styleUrls: ['./bank-transfer-history.component.css']
})
export class BankTransferHistoryComponent implements OnInit {
  searchForm: FormGroup;
  transfers: BankTransfer[] = [];
  isLoading = false;
  isDetailVisible = false;
  selectedTransfer: BankTransfer | null = null;
  transactions: SepayTransaction[] = [];
  errorMessage: string | null = null;
  bankNameFilters: Array<{ text: string; value: any }> = [];
  pageSize = 10;
  pageIndex = 1;
  totalTransactions = 0;
  sepayToken: string = '';
  
  // Các cột sẽ hiển thị trong bảng
  listOfColumns: Array<{ 
    name: string; 
    sortOrder: 'ascend' | 'descend' | null;
    sortFn: ((a: SepayTransaction, b: SepayTransaction) => number) | null; 
    sortDirections: Array<'ascend' | 'descend' | null>;
    filterMultiple: boolean;
    listOfFilter?: Array<{ text: string; value: any }>; 
    filterFn?: ((value: any, record: SepayTransaction) => boolean) | null; 
    priority?: boolean | number; 
  }> = [
    { name: 'ID', sortOrder: null, sortFn: (a, b) => a.id.localeCompare(b.id), sortDirections: ['ascend', 'descend', null], filterMultiple: false },
    { name: 'Ngân hàng', sortOrder: null, sortFn: (a, b) => a.bank_brand_name.localeCompare(b.bank_brand_name), sortDirections: ['ascend', 'descend', null], filterMultiple: true, listOfFilter: [], filterFn: (list: string[], item: SepayTransaction) => list.some(name => item.bank_brand_name.indexOf(name) !== -1) },
    { name: 'Số tài khoản', sortOrder: null, sortFn: (a, b) => a.account_number.localeCompare(b.account_number), sortDirections: ['ascend', 'descend', null], filterMultiple: false },
    { name: 'Ngày giao dịch', sortOrder: 'descend', sortFn: (a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime(), sortDirections: ['descend', 'ascend', null], filterMultiple: false },
    { name: 'Số tiền ra', sortOrder: null, sortFn: (a, b) => parseFloat(a.amount_out) - parseFloat(b.amount_out), sortDirections: ['descend', 'ascend', null], filterMultiple: false },
    { name: 'Số tiền vào', sortOrder: null, sortFn: (a, b) => parseFloat(a.amount_in) - parseFloat(b.amount_in), sortDirections: ['descend', 'ascend', null], filterMultiple: false },
    { name: 'Nội dung', sortOrder: null, sortFn: null, sortDirections: ['ascend', 'descend', null], filterMultiple: false },
    { name: 'Mã tham chiếu', sortOrder: null, sortFn: null, sortDirections: ['ascend', 'descend', null], filterMultiple: false }
  ];

  constructor(
    private fb: FormBuilder,
    private bankTransferService: BankTransferService,
    private message: NzMessageService
  ) {
    this.searchForm = this.fb.group({
      dateRange: [null],
      status: [''],
      bankName: [''],
      searchKeyword: ['']
    });
  }

  ngOnInit() {
    this.sepayToken = localStorage.getItem('sepayToken') || '';
    if (this.sepayToken) {
      this.fetchSepayTransactions();
    }
    this.loadTransfers();
  }

  loadTransfers() {
    this.isLoading = true;
    this.bankTransferService.getTransferHistory()
      .subscribe({
        next: (data) => {
          this.transfers = data;
          this.isLoading = false;
        },
        error: (error) => {
          this.message.error('Không thể tải dữ liệu. Vui lòng thử lại sau.');
          this.isLoading = false;
        }
      });
  }

  search() {
    if (!this.searchForm.valid) {
      return;
    }

    this.isLoading = true;
    this.bankTransferService.searchTransfers(this.searchForm.value)
      .subscribe({
        next: (data) => {
          this.transfers = data;
          this.isLoading = false;
        },
        error: (error) => {
          this.message.error('Không thể tìm kiếm. Vui lòng thử lại sau.');
          this.isLoading = false;
        }
      });
  }

  resetForm() {
    this.searchForm.reset();
    this.loadTransfers();
  }

  viewDetail(transfer: BankTransfer) {
    this.selectedTransfer = transfer;
    this.isDetailVisible = true;
  }

  handleCancel() {
    this.isDetailVisible = false;
    this.selectedTransfer = null;
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'success':
        return 'success';
      case 'pending':
        return 'processing';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'success':
        return 'Thành công';
      case 'pending':
        return 'Đang xử lý';
      case 'failed':
        return 'Thất bại';
      default:
        return 'Không xác định';
    }
  }

  onTokenChange(token: string) {
    this.sepayToken = token;
    if (token) {
      localStorage.setItem('sepayToken', token);
      this.fetchSepayTransactions();
    } else {
      localStorage.removeItem('sepayToken');
      this.transactions = [];
      this.totalTransactions = 0;
    }
  }

  logoutSepay() {
    this.sepayToken = '';
    localStorage.removeItem('sepayToken');
    this.transactions = [];
    this.totalTransactions = 0;
  }

  fetchSepayTransactions(): void {
    if (!this.sepayToken) {
      this.errorMessage = 'Vui lòng nhập API Token SePay!';
      return;
    }
    this.isLoading = true;
    this.errorMessage = null;
    // Chuẩn bị params filter/search/pagination
    const params: any = {
      page: this.pageIndex,
      pageSize: this.pageSize
    };
    const { dateRange, status, bankName, searchKeyword } = this.searchForm.value;
    if (dateRange && dateRange.length === 2) {
      params.date_from = this.formatDate(dateRange[0]);
      params.date_to = this.formatDate(dateRange[1]);
    }
    if (status) params.status = status;
    if (bankName) params.bankName = bankName;
    if (searchKeyword) params.search = searchKeyword;

    this.bankTransferService.getSepayTransactions(params, this.sepayToken).subscribe(
      res => {
        if (res && Array.isArray(res.data)) {
          this.transactions = res.data;
          this.totalTransactions = res.total;
          // Cập nhật bộ lọc cho cột Ngân hàng
          const bankNames = [...new Set(this.transactions.map(t => t.bank_brand_name))];
          this.bankNameFilters = bankNames.map(name => ({ text: name, value: name }));
          const bankColumn = this.listOfColumns.find(col => col.name === 'Ngân hàng');
          if (bankColumn) {
            bankColumn.listOfFilter = this.bankNameFilters;
          }
          this.errorMessage = null;
        } else {
          this.transactions = [];
          this.totalTransactions = 0;
          this.errorMessage = 'Không thể lấy dữ liệu giao dịch hoặc định dạng phản hồi không đúng.';
        }
        this.isLoading = false;
      },
      error => {
        this.transactions = [];
        this.totalTransactions = 0;
        if (error.status === 401) {
          this.errorMessage = 'Token SePay không hợp lệ hoặc đã hết hạn. Vui lòng nhập lại!';
          this.sepayToken = '';
          localStorage.removeItem('sepayToken');
        } else {
          this.errorMessage = 'Đã xảy ra lỗi khi cố gắng kết nối đến SePay. Vui lòng thử lại sau.';
        }
        this.isLoading = false;
      }
    );
  }

  onFilterSubmit(): void {
    this.pageIndex = 1;
    this.fetchSepayTransactions();
  }

  onResetFilter(): void {
    this.searchForm.reset();
    this.pageIndex = 1;
    this.fetchSepayTransactions();
  }

  onPageIndexChange(index: number): void {
    this.pageIndex = index;
    this.fetchSepayTransactions();
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.pageIndex = 1;
    this.fetchSepayTransactions();
  }

  formatDate(date: Date): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().slice(0, 10);
  }

  getRowClass(data: any): string {
    const amountIn = Number(data.amount_in || 0);
    const amountOut = Number(data.amount_out || 0);
    if (amountIn > 0) return 'row-success';
    if (amountOut > 0 && amountIn === 0) return 'row-failed';
    return '';
  }
} 