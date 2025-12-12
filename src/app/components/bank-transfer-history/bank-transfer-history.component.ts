import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { BankTransferService, BankTransfer, SepayTransaction } from '../../services/bank-transfer.service';
import { PayPalService } from '../../services/paypal.service';
import { CryptoService } from '../../services/crypto.service';
import { SePayService } from '../../services/sepay.service';
import { AuthService } from '../../services/auth.service';
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
  
  // Auto-refresh interval
  private refreshInterval: any = null;
  private readonly REFRESH_INTERVAL = 30000; // 30 giây

  // SePay OAuth2 Access Token và Refresh Token
  public sepayApiToken: string | null = localStorage.getItem('sepay_access_token') || 
    'OONBUVPK88JW02IH5EORYXY1JSMW5N6RL3WVNTCZRFUFBBAKHGQJVDI4LD4GUFZH'; // Fallback cho development
  public sepayRefreshToken: string | null = localStorage.getItem('sepay_refresh_token') || null;
  public sepayClientId: string | null = localStorage.getItem('sepay_client_id') || null;
  public sepayClientSecret: string | null = localStorage.getItem('sepay_client_secret') || null; // Nên lưu ở backend
  private isRefreshing = false; // Flag để tránh refresh nhiều lần cùng lúc

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
    private paypalService: PayPalService,
    private cryptoService: CryptoService,
    private sepayService: SePayService,
    private authService: AuthService,
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
    this.loadTransfers();
    // Kiểm tra xem có token không, nếu không thì không fetch
    if (this.sepayApiToken && this.sepayApiToken.trim()) {
      this.fetchSepayTransactions();
    }
    
    // Load payment history từ PayPal, Crypto và SePay nếu có userId
    if (this.userId) {
      this.loadPayPalPayments();
      this.loadCryptoPayments();
      this.loadSePayPayments();
      this.loadAllPayments();
    }

    // Bắt đầu auto-refresh cho payment history (đặc biệt là SePay)
    this.startAutoRefresh();
  }

  ngOnDestroy() {
    // Dọn dẹp interval khi component bị destroy
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
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
   * Refresh tất cả dữ liệu (bao gồm cả SePay transactions nếu có token)
   */
  refreshAllData(): void {
    this.isLoading = true;
    
    // Refresh SePay transactions nếu có token
    if (this.sepayApiToken && this.sepayApiToken.trim()) {
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
    if (!this.sepayApiToken || !this.sepayApiToken.trim()) {
      this.errorMessage = 'Vui lòng cấu hình SePay OAuth2 Access Token. Token có thể được lấy qua OAuth2 flow hoặc từ database.';
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
        console.error('Error details:', {
          status: error.status,
          error: error.error,
          message: error.message
        });
        
        if (error.status === 0) {
          this.errorMessage = 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và đảm bảo backend đang chạy.';
          this.isLoading = false;
        } else if (error.status === 401 || error.status === 403) {
          // Token hết hạn hoặc không hợp lệ, thử refresh tự động
          const errorData = error.error || {};
          console.warn('Token không hợp lệ hoặc đã hết hạn:', errorData);
          
          // Kiểm tra xem có refresh token không
          if (this.sepayRefreshToken && this.sepayClientId && this.sepayClientSecret) {
            console.log('Thử refresh token tự động...');
            this.handleTokenExpired();
          } else {
            // Không có refresh token, yêu cầu đăng nhập lại
            this.errorMessage = errorData.message || errorData.error || 'Access Token không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại qua OAuth2.';
            if (errorData.hint) {
              this.errorMessage += ` (${errorData.hint})`;
            }
            this.isLoading = false;
          }
        } else if (error.error?.error) {
          this.errorMessage = error.error.error;
          if (error.error.message) {
            this.errorMessage += `: ${error.error.message}`;
          }
          if (error.error.detail) {
            this.errorMessage += ` (${error.error.detail})`;
          }
          if (error.error.hint) {
            this.errorMessage += ` - ${error.error.hint}`;
          }
          this.isLoading = false;
        } else {
          this.errorMessage = 'Đã xảy ra lỗi khi cố gắng kết nối đến SePay. Vui lòng thử lại sau.';
          this.isLoading = false;
        }
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
   * Xử lý khi token hết hạn - tự động refresh hoặc yêu cầu đăng nhập lại
   */
  private handleTokenExpired(): void {
    if (this.isRefreshing) {
      // Đang refresh, đợi một chút rồi retry
      setTimeout(() => {
        this.fetchSepayTransactions();
      }, 1000);
      return;
    }

    // Kiểm tra có refresh token không
    if (this.sepayRefreshToken && this.sepayClientId && this.sepayClientSecret) {
      this.refreshToken();
    } else {
      // Không có refresh token, yêu cầu đăng nhập lại
      this.errorMessage = 'Access Token đã hết hạn. Vui lòng đăng nhập lại qua OAuth2 hoặc refresh token.';
      this.isLoading = false;
    }
  }

  /**
   * Refresh access token tự động
   */
  private refreshToken(): void {
    if (!this.sepayRefreshToken || !this.sepayClientId || !this.sepayClientSecret) {
      this.errorMessage = 'Không có thông tin để refresh token. Vui lòng đăng nhập lại qua OAuth2.';
      this.isLoading = false;
      return;
    }

    this.isRefreshing = true;
    this.message.loading('Đang làm mới token...', { nzDuration: 0 });

    this.bankTransferService.refreshOAuth2Token({
      refresh_token: this.sepayRefreshToken,
      client_id: this.sepayClientId,
      client_secret: this.sepayClientSecret
    }).subscribe({
      next: (response) => {
        if (response.success && response.access_token) {
          // Lưu token mới
          this.sepayApiToken = response.access_token;
          localStorage.setItem('sepay_access_token', response.access_token);
          
          if (response.refresh_token) {
            this.sepayRefreshToken = response.refresh_token;
            localStorage.setItem('sepay_refresh_token', response.refresh_token);
          }

          this.message.success('Token đã được làm mới thành công');
          this.message.remove(); // Xóa loading message
          
          // Retry request với token mới
          this.isRefreshing = false;
          this.fetchSepayTransactions();
        } else {
          this.errorMessage = 'Không thể làm mới token. Vui lòng đăng nhập lại qua OAuth2.';
          this.isLoading = false;
          this.isRefreshing = false;
          this.message.remove();
        }
      },
      error: (error) => {
        console.error('Lỗi khi refresh token:', error);
        this.errorMessage = 'Không thể làm mới token. Vui lòng đăng nhập lại qua OAuth2.';
        this.isLoading = false;
        this.isRefreshing = false;
        this.message.remove();
        this.message.error('Làm mới token thất bại. Vui lòng đăng nhập lại.');
      }
    });
  }

  /**
   * Refresh token thủ công (từ UI)
   */
  manualRefreshToken(): void {
    this.isLoading = true;
    this.errorMessage = null;
    this.refreshToken();
  }

  /**
   * Lưu token vào localStorage (sau khi OAuth2 flow)
   */
  saveTokens(accessToken: string, refreshToken: string, clientId?: string, clientSecret?: string): void {
    this.sepayApiToken = accessToken;
    localStorage.setItem('sepay_access_token', accessToken);
    
    if (refreshToken) {
      this.sepayRefreshToken = refreshToken;
      localStorage.setItem('sepay_refresh_token', refreshToken);
    }

    if (clientId) {
      this.sepayClientId = clientId;
      localStorage.setItem('sepay_client_id', clientId);
    }

    if (clientSecret) {
      this.sepayClientSecret = clientSecret;
      localStorage.setItem('sepay_client_secret', clientSecret);
    }
  }

  /**
   * Xóa token (đăng xuất)
   */
  clearTokens(): void {
    this.sepayApiToken = '';
    this.sepayRefreshToken = null;
    this.sepayClientId = null;
    this.sepayClientSecret = null;
    localStorage.removeItem('sepay_access_token');
    localStorage.removeItem('sepay_refresh_token');
    localStorage.removeItem('sepay_client_id');
    localStorage.removeItem('sepay_client_secret');
    localStorage.removeItem('sepay_oauth2_state');
    localStorage.removeItem('sepay_oauth2_redirect_uri');
    this.transactions = [];
    this.totalTransactions = 0;
    this.errorMessage = 'Đã đăng xuất. Vui lòng đăng nhập lại qua OAuth2.';
  }

  /**
   * Bắt đầu OAuth2 flow - redirect user đến SePay để đăng nhập
   */
  startOAuth2Login(): void {
    // Lấy client_id và client_secret từ localStorage hoặc prompt user nhập
    const clientId = this.sepayClientId || prompt('Nhập SePay Client ID:');
    const clientSecret = this.sepayClientSecret || prompt('Nhập SePay Client Secret:');

    if (!clientId || !clientSecret) {
      this.message.warning('Vui lòng nhập Client ID và Client Secret để đăng nhập.');
      return;
    }

    // Lưu client_id và client_secret (tạm thời, nên lưu ở backend)
    if (!this.sepayClientId) {
      this.sepayClientId = clientId;
      localStorage.setItem('sepay_client_id', clientId);
    }
    if (!this.sepayClientSecret) {
      this.sepayClientSecret = clientSecret;
      localStorage.setItem('sepay_client_secret', clientSecret);
    }

    // Tạo redirect URI
    const baseUrl = window.location.origin;
    const redirectUri = `${baseUrl}/sepay-oauth2-callback`;

    // Tạo state để verify (tránh CSRF)
    const state = `state_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    localStorage.setItem('sepay_oauth2_state', state);
    localStorage.setItem('sepay_oauth2_redirect_uri', redirectUri);

    // Scopes cần thiết
    const scope = 'bank-account:read transaction:read profile company';

    this.isLoading = true;
    this.message.loading('Đang tạo authorization URL...', { nzDuration: 0 });

    // Lấy authorization URL từ backend
    this.bankTransferService.getOAuth2AuthorizeUrl({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scope,
      state: state
    }).subscribe({
      next: (response) => {
        this.message.remove();
        this.isLoading = false;
        
        if (response.authorization_url) {
          // Redirect user đến SePay để đăng nhập
          window.location.href = response.authorization_url;
        } else {
          this.message.error('Không thể tạo authorization URL. Vui lòng thử lại.');
        }
      },
      error: (error) => {
        this.message.remove();
        this.isLoading = false;
        console.error('Error getting authorization URL:', error);
        this.message.error(error.error?.error || error.error?.detail || 'Không thể tạo authorization URL. Vui lòng thử lại.');
      }
    });
  }

  /**
   * Load lịch sử thanh toán PayPal
   */
  loadPayPalPayments(): void {
    if (!this.userId) return;

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
    if (!this.userId) return;

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
    if (!this.userId) return;

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

    // Load từ tất cả các phương thức thanh toán
    const paypalHistory$ = this.paypalService.getPaymentHistory({ userId: this.userId, limit: 100 });
    const cryptoHistory$ = this.cryptoService.getPaymentHistory({ userId: this.userId, limit: 100 });
    const sepayHistory$ = this.sepayService.getPaymentHistory({ userId: this.userId, limit: 100 });

    // Combine tất cả payment history
    forkJoin([paypalHistory$, cryptoHistory$, sepayHistory$]).subscribe({
      next: ([paypalData, cryptoData, sepayData]) => {
        const allPayments: any[] = [];
        
        // Thêm PayPal payments
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

        // Thêm Crypto payments
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

        // Thêm SePay payments
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