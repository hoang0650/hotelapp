import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NzMessageService } from 'ng-zorro-antd/message';
import { BankTransferService, BankTransfer, SepayTransaction } from '../../services/bank-transfer.service';
import { BankHubService, BankHubStatus, BankHubBankAccount } from '../../services/bankhub.service';
import { PayPalService } from '../../services/paypal.service';
import { CryptoService } from '../../services/crypto.service';
import { SePayService } from '../../services/sepay.service';
import { AuthService } from '../../services/auth.service';
import { HotelService } from '../../services/hotel.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-bank-transfer-history',
  templateUrl: './bank-transfer-history.component.html',
  styleUrls: ['./bank-transfer-history.component.css']
})
export class BankTransferHistoryComponent implements OnInit, OnDestroy {
  searchForm: FormGroup;
  transfers: BankTransfer[] = [];
  isLoading = false;
  isDetailVisible = false;
  selectedTransfer: BankTransfer | null = null;
  transactions: SepayTransaction[] = [];
  errorMessage: string | null = null;
  
  // Payment history từ các phương thức khác
  paypalPayments: any[] = [];
  cryptoPayments: any[] = [];
  sepayPayments: any[] = []; // SePay payment history từ PaymentHistory model
  allPayments: any[] = []; // Tổng hợp tất cả payment history
  activeTabIndex = 0; // 0: Tất cả, 1: SePay, 2: PayPal, 3: Crypto
  userId: string = '';
  allPaymentsLoading = false;
  
  // BankHub integration
  bankHubStatus: BankHubStatus | null = null;
  bankHubVerified = false;
  bankHubLoading = false;
  bankHubLinkUrl: SafeResourceUrl | null = null;
  showBankHubIframe = false;
  linkedBankAccounts: BankHubBankAccount[] = [];

  // Auto-refresh interval
  private refreshInterval: any = null;
  private readonly REFRESH_INTERVAL = 30000; // 30 giây

  // Payment method visibility settings
  enablePayPalPayment: boolean = false;
  enableCryptoPayment: boolean = false;
  enableSePayPayment: boolean = true; // Mặc định bật SePay

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
    private sanitizer: DomSanitizer,
    private bankTransferService: BankTransferService,
    private bankHubService: BankHubService,
    private paypalService: PayPalService,
    private cryptoService: CryptoService,
    private sepayService: SePayService,
    private authService: AuthService,
    private hotelService: HotelService,
    private message: NzMessageService
  ) {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?._id) {
      this.userId = currentUser._id;
    }
    this.searchForm = this.fb.group({
      startDate: [null],
      endDate: [null],
      status: [''],
      bankName: ['']
    });
  }

  ngOnInit() {
    this.checkBankHubStatus();
    this.loadTransfers();
    this.loadHotelSettings();
    
    if (this.userId) {
      this.loadPayPalPayments();
      this.loadCryptoPayments();
      this.loadSePayPayments();
      this.loadAllPayments();
    }

    this.startAutoRefresh();

    // Listen for BankHub iframe postMessage events
    window.addEventListener('message', this.handleBankHubMessage.bind(this));
  }

  /**
   * Load hotel settings để kiểm tra các phương thức thanh toán được bật
   */
  loadHotelSettings(): void {
    const hotelId = this.authService.getHotelId();
    if (!hotelId) {
      // Nếu không có hotelId, vẫn cho phép hiển thị tất cả (fallback)
      return;
    }

    this.hotelService.getHotelById(hotelId).subscribe({
      next: (hotel: any) => {
        // Lấy settings từ hotel
        this.enablePayPalPayment = hotel.enablePayPalPayment || false;
        this.enableCryptoPayment = hotel.enableCryptoPayment || false;
        // SePay mặc định bật, có thể kiểm tra thêm nếu cần
        this.enableSePayPayment = true;
        
        // Fetch SePay transactions nếu SePay được bật
        if (this.enableSePayPayment) {
          this.fetchSepayTransactions();
        }
      },
      error: (error) => {
        console.error('Error loading hotel settings:', error);
        // Fallback: cho phép hiển thị tất cả nếu không load được settings
        this.enableSePayPayment = true;
        this.fetchSepayTransactions();
      }
    });
  }

  ngOnDestroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    window.removeEventListener('message', this.handleBankHubMessage.bind(this));
  }

  // ============ BankHub Methods ============

  checkBankHubStatus(): void {
    this.bankHubLoading = true;
    this.bankHubService.getStatus().subscribe({
      next: (status) => {
        this.bankHubStatus = status;
        this.bankHubVerified = !!(status.configured && status.authenticated);
        if (this.bankHubVerified) {
          this.loadLinkedBankAccounts();
        }
        this.bankHubLoading = false;
      },
      error: () => {
        this.bankHubStatus = { configured: false };
        this.bankHubVerified = false;
        this.bankHubLoading = false;
      }
    });
  }

  loadLinkedBankAccounts(): void {
    this.bankHubService.getBankAccounts().subscribe({
      next: (res: any) => {
        this.linkedBankAccounts = res.data || [];
      },
      error: () => {
        this.linkedBankAccounts = [];
      }
    });
  }

  openBankHubLink(): void {
    this.bankHubLoading = true;
    this.bankHubService.createLinkToken().subscribe({
      next: (res) => {
        const hostedUrl = String((res as any)?.hosted_link_url || '').trim();
        const allowed = ['https://bankhub.sepay.vn', 'https://bankhub-sandbox.sepay.vn'];
        const safe = this.toSafeResourceUrl(hostedUrl, allowed);
        if (!safe) {
          this.message.error('Liên kết BankHub không hợp lệ');
          this.bankHubLoading = false;
          return;
        }
        this.bankHubLinkUrl = safe;
        this.showBankHubIframe = true;
        this.bankHubLoading = false;
      },
      error: (err) => {
        this.message.error(err.error?.message || 'Không thể tạo liên kết BankHub');
        this.bankHubLoading = false;
      }
    });
  }

  closeBankHubIframe(): void {
    this.showBankHubIframe = false;
    this.bankHubLinkUrl = null;
    this.checkBankHubStatus();
  }

  handleBankHubMessage(event: MessageEvent): void {
    if (!event.data?.event) return;
    const bankHubOrigins = ['https://bankhub.sepay.vn', 'https://bankhub-sandbox.sepay.vn'];
    if (!bankHubOrigins.includes(event.origin)) return;

    switch (event.data.event) {
      case 'FINISHED_BANK_ACCOUNT_LINK':
        this.message.success('Liên kết tài khoản ngân hàng thành công!');
        this.closeBankHubIframe();
        break;
      case 'FINISHED_BANK_ACCOUNT_UNLINK':
        this.message.info('Đã hủy liên kết tài khoản ngân hàng');
        this.closeBankHubIframe();
        break;
      case 'BANKHUB_CLOSE_LINK':
        this.closeBankHubIframe();
        break;
      case 'BANKHUB_TOKEN_EXPIRED':
      case 'BANKHUB_SESSION_EXPIRED':
        this.message.warning('Phiên làm việc đã hết hạn, vui lòng thử lại');
        this.closeBankHubIframe();
        break;
    }
  }

  private toSafeResourceUrl(url: string, allowedOrigins: string[]): any {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:') return null;
      const origin = u.origin;
      if (!allowedOrigins.includes(origin)) return null;
      return this.sanitizer.bypassSecurityTrustResourceUrl(u.toString());
    } catch {
      return null;
    }
  }

  /**
   * Bắt đầu auto-refresh payment history
   */
  startAutoRefresh(): void {
    // Chỉ auto-refresh nếu có userId
    if (!this.userId) return;

    // Clear interval cũ nếu có
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    // Tạo interval mới để refresh payment history mỗi 30 giây
    this.refreshInterval = setInterval(() => {
      // Chỉ refresh payment history, không refresh SePay transactions (tốn token)
      this.refreshPaymentHistory();
    }, this.REFRESH_INTERVAL);
  }

  /**
   * Refresh tất cả payment history (không refresh SePay transactions)
   */
  refreshPaymentHistory(): void {
    if (!this.userId) return;

    // Refresh payment history từ các phương thức thanh toán
    this.loadPayPalPayments();
    this.loadCryptoPayments();
    this.loadSePayPayments();
    this.loadAllPayments();
  }

  /**
   * Refresh tất cả dữ liệu
   */
  refreshAllData(): void {
    this.isLoading = true;
    
    // Refresh SePay transactions nếu được bật
    if (this.enableSePayPayment) {
      this.fetchSepayTransactions();
    }
    
    // Refresh payment history
    this.refreshPaymentHistory();
    
    // Refresh transfers
    this.loadTransfers();
    
    this.message.success('Đã làm mới dữ liệu');
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
    // Chuẩn hóa: 'completed' từ SePay = 'success'
    const normalizedStatus = (status === 'completed') ? 'success' : status;
    
    switch (normalizedStatus) {
      case 'success':
      case 'paid':
        return 'success';
      case 'pending':
        return 'processing';
      case 'failed':
      case 'cancelled':
        return 'error';
      default:
        return 'default';
    }
  }

  getStatusText(status: string): string {
    // Chuẩn hóa: 'completed' từ SePay = 'success'
    const normalizedStatus = (status === 'completed') ? 'success' : status;
    
    switch (normalizedStatus) {
      case 'success':
      case 'paid':
        return 'Hoàn thành';
      case 'pending':
        return 'Đang xử lý';
      case 'failed':
        return 'Thất bại';
      case 'cancelled':
        return 'Đã hủy';
      default:
        return 'Không xác định';
    }
  }

  fetchSepayTransactions(): void {
    if (!this.enableSePayPayment) {
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

    // Gọi backend proxy - backend sẽ tự quản lý token
    this.bankTransferService.getSepayTransactions(null, params).subscribe(
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
        console.error('Error details:', {
          status: error.status,
          error: error.error,
          message: error.message
        });
        
        if (error.status === 0) {
          this.errorMessage = 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và đảm bảo backend đang chạy.';
        } else if (error.error?.error) {
          this.errorMessage = error.error.error;
          if (error.error.message) {
            this.errorMessage += `: ${error.error.message}`;
          }
        } else {
          this.errorMessage = 'Đã xảy ra lỗi khi cố gắng kết nối đến SePay. Vui lòng thử lại sau.';
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


  /**
   * Load lịch sử thanh toán PayPal
   */
  loadPayPalPayments(): void {
    if (!this.userId || !this.enablePayPalPayment) return;

    this.paypalService.getPaymentHistory({ userId: this.userId, limit: 50 }).subscribe({
      next: (response) => {
        if (response?.success && response.data) {
          this.paypalPayments = response.data;
        }
      },
      error: (error) => {
        console.error('Error loading PayPal payments:', error);
        // Không hiển thị lỗi để không làm phiền user
      }
    });
  }

  /**
   * Load lịch sử thanh toán Crypto
   */
  loadCryptoPayments(): void {
    if (!this.userId || !this.enableCryptoPayment) return;

    this.cryptoService.getPaymentHistory({ userId: this.userId, limit: 50 }).subscribe({
      next: (response) => {
        if (response?.success && response.data) {
          this.cryptoPayments = response.data;
        }
      },
      error: (error) => {
        console.error('Error loading Crypto payments:', error);
        // Không hiển thị lỗi để không làm phiền user
      }
    });
  }

  /**
   * Load lịch sử thanh toán SePay từ PaymentHistory
   */
  loadSePayPayments(): void {
    if (!this.userId || !this.enableSePayPayment) return;

    this.sepayService.getPaymentHistory({ userId: this.userId, limit: 50 }).subscribe({
      next: (response) => {
        if (response?.success && response.data) {
          this.sepayPayments = response.data;
        }
      },
      error: (error) => {
        console.error('Error loading SePay payments:', error);
        // Không hiển thị lỗi để không làm phiền user
      }
    });
  }

  /**
   * Load tất cả lịch sử thanh toán (tổng hợp từ tất cả phương thức)
   */
  loadAllPayments(): void {
    if (!this.userId) return;

    this.allPaymentsLoading = true;

    // Load từ tất cả các phương thức thanh toán (chỉ load những phương thức được bật)
    const requests: any[] = [];
    
    if (this.enablePayPalPayment) {
      requests.push(this.paypalService.getPaymentHistory({ userId: this.userId, limit: 100 }));
    }
    if (this.enableCryptoPayment) {
      requests.push(this.cryptoService.getPaymentHistory({ userId: this.userId, limit: 100 }));
    }
    if (this.enableSePayPayment) {
      requests.push(this.sepayService.getPaymentHistory({ userId: this.userId, limit: 100 }));
    }

    if (requests.length === 0) {
      this.allPayments = [];
      this.allPaymentsLoading = false;
      return;
    }

    // Combine tất cả payment history
    forkJoin(requests).subscribe({
      next: (responses) => {
        const allPayments: any[] = [];
        let responseIndex = 0;
        
        // Thêm PayPal payments
        if (this.enablePayPalPayment && responses[responseIndex]) {
          const paypalData = responses[responseIndex];
          responseIndex++;
          if (paypalData?.success && paypalData.data) {
            paypalData.data.forEach((payment: any) => {
              allPayments.push({
                ...payment,
                paymentMethod: 'paypal',
                paymentMethodLabel: 'PayPal',
                paymentMethodIcon: 'pay-circle',
                paymentMethodColor: '#0070ba'
              });
            });
          } else if (paypalData?.data) {
            // Fallback nếu response không có success field
            paypalData.data.forEach((payment: any) => {
              allPayments.push({
                ...payment,
                paymentMethod: 'paypal',
                paymentMethodLabel: 'PayPal',
                paymentMethodIcon: 'pay-circle',
                paymentMethodColor: '#0070ba'
              });
            });
          }
        }

        // Thêm Crypto payments
        if (this.enableCryptoPayment && responses[responseIndex]) {
          const cryptoData = responses[responseIndex];
          responseIndex++;
          if (cryptoData?.success && cryptoData.data) {
            cryptoData.data.forEach((payment: any) => {
              allPayments.push({
                ...payment,
                paymentMethod: 'crypto_usdt',
                paymentMethodLabel: `Crypto USDT (${payment.cryptoNetwork || 'N/A'})`,
                paymentMethodIcon: 'dollar-circle',
                paymentMethodColor: '#26a17b'
              });
            });
          } else if (cryptoData?.data) {
            // Fallback nếu response không có success field
            cryptoData.data.forEach((payment: any) => {
              allPayments.push({
                ...payment,
                paymentMethod: 'crypto_usdt',
                paymentMethodLabel: `Crypto USDT (${payment.cryptoNetwork || 'N/A'})`,
                paymentMethodIcon: 'dollar-circle',
                paymentMethodColor: '#26a17b'
              });
            });
          }
        }

        // Thêm SePay payments
        if (this.enableSePayPayment && responses[responseIndex]) {
          const sepayData = responses[responseIndex];
          if (sepayData?.success && sepayData.data) {
            sepayData.data.forEach((payment: any) => {
              allPayments.push({
                ...payment,
                paymentMethod: 'sepay',
                paymentMethodLabel: 'SePay',
                paymentMethodIcon: 'credit-card',
                paymentMethodColor: '#667eea'
              });
            });
          } else if (sepayData?.data) {
            // Fallback nếu response không có success field
            sepayData.data.forEach((payment: any) => {
              allPayments.push({
                ...payment,
                paymentMethod: 'sepay',
                paymentMethodLabel: 'SePay',
                paymentMethodIcon: 'credit-card',
                paymentMethodColor: '#667eea'
              });
            });
          }
        }

        // Sắp xếp theo ngày tạo (mới nhất trước)
        this.allPayments = allPayments.sort((a, b) => {
          const dateA = new Date(a.createdAt || a.created_at || 0).getTime();
          const dateB = new Date(b.createdAt || b.created_at || 0).getTime();
          return dateB - dateA;
        });

        this.allPaymentsLoading = false;
      },
      error: (error) => {
        console.error('Error loading all payment history:', error);
        this.allPaymentsLoading = false;
        // Không hiển thị lỗi để không làm phiền user
      }
    });
  }

  /**
   * Chuyển tab
   */
  onTabChange(event: any): void {
    // nzSelectChange emit NzTabChangeEvent hoặc number tùy version
    // Nếu là object, lấy index từ event.index, nếu là number thì dùng trực tiếp
    this.activeTabIndex = typeof event === 'number' ? event : (event?.index ?? event);
  }

  /**
   * Format số tiền
   */
  formatAmount(amount: number, currency: string = 'VND'): string {
    if (!amount && amount !== 0) return '0';
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    }
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  /**
   * Lấy text cho payment method
   */
  getPaymentMethodText(method: string): string {
    switch (method) {
      case 'paypal':
        return 'PayPal';
      case 'sepay':
        return 'SePay';
      case 'crypto_usdt':
        return 'Crypto USDT';
      default:
        return method;
    }
  }

  /**
   * Lấy icon cho payment method
   */
  getPaymentMethodIcon(method: string): string {
    switch (method) {
      case 'paypal':
        return 'pay-circle';
      case 'sepay':
        return 'credit-card';
      case 'crypto_usdt':
        return 'dollar-circle';
      default:
        return 'wallet';
    }
  }

  /**
   * Lấy màu cho payment method
   */
  getPaymentMethodColor(method: string): string {
    switch (method) {
      case 'paypal':
        return '#0070ba';
      case 'sepay':
        return '#667eea';
      case 'crypto_usdt':
        return '#26a17b';
      default:
        return '#999';
    }
  }

  // Các hàm xử lý sắp xếp, lọc có thể được thêm ở đây nếu cần
  // Ví dụ: handleSortChange, handleFilterChange
} 
