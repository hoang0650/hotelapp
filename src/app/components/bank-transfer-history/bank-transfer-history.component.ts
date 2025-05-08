import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { BankTransferService, BankTransfer } from '../../services/bank-transfer.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';

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

  // TODO: Thay thế bằng API key thực tế của bạn hoặc cơ chế xác thực phù hợp
  // Lưu ý: Để API key trực tiếp trong code frontend là không an toàn cho production.
  // Nên sử dụng proxy backend để quản lý API key.
  private sepayApiKey = 'YOUR_SEPAY_API_KEY'; // Giữ lại hoặc để trống nếu API SePay chỉ cần Bearer token
  private sepayApiToken = 'TOZMMVAXQ1EJHU6HTIMCGWZQ7HGGVBSDR0Z68B0ZRSYTEFGEDW2IA7TDEQI9O4WP';

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
    private message: NzMessageService,
    private http: HttpClient
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
    this.isLoading = true;
    this.errorMessage = null;

    const apiUrl = 'https://my.sepay.vn/userapi/transactions/list';
    
    // Chuẩn bị headers - SePay có thể yêu cầu API key/token ở đây
    // Kiểm tra tài liệu API của SePay để biết cách xác thực chính xác
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.sepayApiToken}`, // Ví dụ nếu dùng Bearer Token
      'X-Api-Key': this.sepayApiKey, // Ví dụ nếu dùng API Key qua header
      'Content-Type': 'application/json'
      // Thêm các headers khác nếu SePay yêu cầu
    });

    // Thêm các tham số nếu API hỗ trợ (ví dụ: date_from, date_to, page, limit)
    // const params = {
    //   date_from: this.datePipe.transform(this.dateRange[0], 'yyyy-MM-dd'),
    //   date_to: this.datePipe.transform(this.dateRange[1], 'yyyy-MM-dd'),
    //   page: this.pageIndex.toString(),
    //   limit: this.pageSize.toString()
    // };

    // Lưu ý: Việc truyền API key và token trực tiếp như thế này không an toàn trong môi trường production.
    // Bạn nên tạo một backend proxy để gọi API SePay một cách an toàn.

    this.http.get<SepayApiResponse>(apiUrl, { headers /*, params */ }).subscribe(
      response => {
        if (response && response.messages && response.messages.success && response.transactions) {
          this.transactions = response.transactions;
          this.totalTransactions = response.transactions.length; // Hoặc API có thể trả về tổng số
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
        console.error('Lỗi khi gọi API SePay:', error);
        this.errorMessage = 'Đã xảy ra lỗi khi cố gắng kết nối đến SePay. Vui lòng thử lại sau.';
        if (error.status === 0) {
            this.errorMessage = 'Không thể kết nối đến máy chủ SePay. Vui lòng kiểm tra kết nối mạng và cấu hình CORS.';
        } else if (error.status === 401 || error.status === 403) {
            this.errorMessage = 'Xác thực thất bại. Vui lòng kiểm tra API key và token của SePay.';
        }
        // Bạn có thể muốn xử lý các mã lỗi HTTP khác ở đây
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