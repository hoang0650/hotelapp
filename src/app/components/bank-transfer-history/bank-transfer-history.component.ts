import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { BankTransferService, BankTransfer, SepayTransaction } from '../../services/bank-transfer.service';

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

  // SePay API Token - nên lưu trong environment hoặc database
  // TODO: Tạo UI để user nhập token hoặc lưu trong database
  private sepayApiToken = 'OONBUVPK88JW02IH5EORYXY1JSMW5N6RL3WVNTCZRFUFBBAKHGQJVDI4LD4GUFZH';

  // Định dạng ngày tháng
  dateRange: Date[] = [];
  pageSize = 10;
  pageIndex = 1;
  totalTransactions = 0;
  
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
      startDate: [null],
      endDate: [null],
      status: [''],
      bankName: ['']
    });
  }

  ngOnInit() {
    this.loadTransfers();
    this.fetchSepayTransactions();
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

  fetchSepayTransactions(): void {
    if (!this.sepayApiToken || !this.sepayApiToken.trim()) {
      this.errorMessage = 'Vui lòng cấu hình SePay API Token.';
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    // Chuẩn bị params từ dateRange và pagination
    const params: any = {
      page: this.pageIndex.toString(),
      pageSize: this.pageSize.toString()
    };

    // Thêm date_from và date_to nếu có
    if (this.dateRange && this.dateRange.length === 2) {
      const startDate = new Date(this.dateRange[0]);
      const endDate = new Date(this.dateRange[1]);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      params.date_from = startDate.toISOString().split('T')[0];
      params.date_to = endDate.toISOString().split('T')[0];
    }

    // Gọi backend proxy thay vì gọi trực tiếp SePay API
    this.bankTransferService.getSepayTransactions(this.sepayApiToken, params).subscribe(
      response => {
        if (response && response.data) {
          this.transactions = response.data;
          this.totalTransactions = response.total || response.data.length;
          
          // Cập nhật bộ lọc cho cột Ngân hàng
          const bankNames = [...new Set(this.transactions.map(t => t.bank_brand_name))];
          const bankColumn = this.listOfColumns.find(col => col.name === 'Ngân hàng');
          if (bankColumn) {
            bankColumn.listOfFilter = bankNames.map(name => ({ text: name, value: name }));
          }
        } else {
          this.errorMessage = 'Không thể lấy dữ liệu giao dịch hoặc định dạng phản hồi không đúng.';
          console.error('API response error or invalid format:', response);
        }
        this.isLoading = false;
      },
      error => {
        console.error('Lỗi khi gọi API SePay qua backend:', error);
        this.errorMessage = 'Đã xảy ra lỗi khi cố gắng kết nối đến SePay. Vui lòng thử lại sau.';
        
        if (error.status === 0) {
          this.errorMessage = 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và đảm bảo backend đang chạy.';
        } else if (error.status === 401 || error.status === 403) {
          this.errorMessage = 'Xác thực thất bại. Vui lòng kiểm tra SePay API Token.';
        } else if (error.error?.error) {
          this.errorMessage = error.error.error;
          if (error.error.detail) {
            this.errorMessage += `: ${error.error.detail}`;
          }
        }
        
        this.isLoading = false;
      }
    );
  }
  
  onDateChange(result: Date[]): void {
    if (result && result.length === 2) {
      this.dateRange = result;
      this.pageIndex = 1; // Reset về trang đầu khi đổi ngày
      this.fetchSepayTransactions();
    }
  }

  onPageIndexChange(index: number): void {
    this.pageIndex = index;
    this.fetchSepayTransactions();
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.pageIndex = 1; // Reset về trang đầu khi đổi page size
    this.fetchSepayTransactions();
  }

  // Các hàm xử lý sắp xếp, lọc có thể được thêm ở đây nếu cần
  // Ví dụ: handleSortChange, handleFilterChange
} 