import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { BankTransferService, BankTransfer } from '../../services/bank-transfer.service';
import { PayPalService } from '../../services/paypal.service';
import { CryptoService } from '../../services/crypto.service';
import { SePayService } from '../../services/sepay.service';
import { AuthService } from '../../services/auth.service';
import { HotelService } from '../../services/hotel.service';
import { PaymentSpeakerService } from '../../services/payment-speaker.service';
import { UserService } from '../../services/user.service';
import { forkJoin } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';

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
  
  // Payment history từ các phương thức khác
  paypalPayments: any[] = [];
  cryptoPayments: any[] = [];
  sepayPayments: any[] = []; // SePay payment history từ PaymentHistory model
  allPayments: any[] = []; // Tổng hợp tất cả payment history
  activeTabIndex = 0; // 0: Tất cả, 1: SePay, 2: PayPal, 3: Crypto
  userId: string = '';
  hotelId: string = '';
  allPaymentsLoading = false;
  configuredBankAccount: {
    bankName: string;
    accountNumber: string;
    accountHolderName: string;
    beneficiaryName: string;
  } | null = null;
  updatingPaymentIds = new Set<string>();

  // Auto-refresh interval
  private refreshInterval: any = null;
  private readonly REFRESH_INTERVAL = 30000; // 30 giây
  private paymentSocket: Socket | null = null;

  private isFirstLoadSePay = true;
  private lastPlayedPaymentId: string | null = null;
  private readonly paymentSpeakerChangedHandler = (event: Event) => this.handlePaymentSpeakerChanged(event as CustomEvent);

  // Payment method visibility settings
  enablePayPalPayment: boolean = false;
  enableCryptoPayment: boolean = false;
  enableSePayPayment: boolean = true; // Mặc định bật SePay
  enablePaymentSpeaker: boolean = false;

  constructor(
    private fb: FormBuilder,
    private bankTransferService: BankTransferService,
    private paypalService: PayPalService,
    private cryptoService: CryptoService,
    private sepayService: SePayService,
    private authService: AuthService,
    private hotelService: HotelService,
    private message: NzMessageService,
    private paymentSpeakerService: PaymentSpeakerService,
    private userService: UserService
  ) {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?._id) {
      this.userId = currentUser._id;
    }
    const resolvedHotelId = this.authService.getHotelId() || currentUser?.hotelId || '';
    this.hotelId = typeof resolvedHotelId === 'string' ? resolvedHotelId : String((resolvedHotelId as any)?._id || '');
    this.searchForm = this.fb.group({
      startDate: [null],
      endDate: [null],
      status: [''],
      bankName: ['']
    });
  }

  ngOnInit() {
    this.loadConfiguredBankAccount();
    this.loadTransfers();
    this.loadHotelSettings();
    if (!this.hotelId && this.userId) {
      this.refreshPaymentHistory();
    }

    this.startAutoRefresh();
    this.startPaymentSocket();

    window.addEventListener('hotelPaymentSpeakerChanged', this.paymentSpeakerChangedHandler);
  }

  /**
   * Load hotel settings để kiểm tra các phương thức thanh toán được bật
   */
  loadHotelSettings(): void {
    const hotelId = this.authService.getHotelId() || this.hotelId;
    if (!hotelId) {
      // Nếu không có hotelId, vẫn cho phép hiển thị tất cả (fallback)
      return;
    }
    this.hotelId = String(hotelId);

    this.hotelService.getHotelById(hotelId).subscribe({
      next: (hotel: any) => {
        // Lấy settings từ hotel
        const hotelSettings = hotel?.settings || {};
        const notificationSettings = hotelSettings?.notificationSettings || {};

        this.enablePayPalPayment = hotelSettings.enablePayPalPayment || hotel.enablePayPalPayment || false;
        this.enableCryptoPayment = hotelSettings.enableCryptoPayment || hotel.enableCryptoPayment || false;
        this.enablePaymentSpeaker = !!notificationSettings.enablePaymentSpeaker;
        this.paymentSpeakerService.setEnabled(this.hotelId, this.enablePaymentSpeaker);
        // SePay mặc định bật, có thể kiểm tra thêm nếu cần
        this.enableSePayPayment = true;
        this.refreshPaymentHistory();
        this.startPaymentSocket();
      },
      error: (error) => {
        console.error('Error loading hotel settings:', error);
        // Fallback: cho phép hiển thị tất cả nếu không load được settings
        this.enableSePayPayment = true;
        this.refreshPaymentHistory();
        this.startPaymentSocket();
      }
    });
  }

  ngOnDestroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    this.stopPaymentSocket();
    window.removeEventListener('hotelPaymentSpeakerChanged', this.paymentSpeakerChangedHandler);
  }

  private startPaymentSocket(): void {
    const hotelId = String(this.hotelId || this.authService.getHotelId() || '').trim();
    if (!hotelId || this.paymentSocket) {
      return;
    }

    const socketUrl = String(environment.apiUrl || '').replace(/\/$/, '');
    if (!socketUrl) return;

    this.hotelId = hotelId;
    this.paymentSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true
    });

    this.paymentSocket.on('connect', () => {
      this.paymentSocket?.emit('join_hotel', hotelId);
    });

    this.paymentSocket.on('payment_received', (payload: any) => {
      this.handleSocketPaymentReceived(payload);
    });
  }

  private handleSocketPaymentReceived(payload: any): void {
    const hotelId = String(payload?.hotelId || '').trim();
    if (!hotelId || hotelId !== String(this.hotelId)) {
      return;
    }

    const paymentId = String(payload?.paymentHistoryId || payload?.transactionId || '').trim();
    const amount = Number(payload?.amount || 0);

    if (paymentId && this.lastPlayedPaymentId === paymentId) {
      this.loadSePayPayments();
      this.loadAllPayments();
      return;
    }

    if (paymentId) {
      this.lastPlayedPaymentId = paymentId;
    }

    this.message.success(
      amount > 0
        ? `Thanh toán SePay thành công: ${amount.toLocaleString('vi-VN')} VND`
        : 'Thanh toán SePay thành công'
    );

    if (this.enablePaymentSpeaker) {
      this.paymentSpeakerService.setEnabled(this.hotelId, true);
    }
    this.paymentSpeakerService.tryPlayForPayment(payload, this.hotelId);

    this.loadSePayPayments();
    this.loadAllPayments();
  }

  private stopPaymentSocket(): void {
    if (!this.paymentSocket) return;
    try {
      this.paymentSocket.off('connect');
      this.paymentSocket.off('payment_received');
      this.paymentSocket.disconnect();
    } catch (_e) {}
    this.paymentSocket = null;
  }

  private loadConfiguredBankAccount(): void {
    this.userService.getProfile().subscribe({
      next: (user: any) => {
        const bankAccount = user?.bankAccount || null;
        const accountNumber = String(bankAccount?.accountNumber || '').trim();
        if (!accountNumber) {
          this.configuredBankAccount = null;
          return;
        }

        this.configuredBankAccount = {
          bankName: String(bankAccount?.bankName || '').trim(),
          accountNumber,
          accountHolderName: String(bankAccount?.accountHolderName || '').trim(),
          beneficiaryName: String(bankAccount?.beneficiaryName || '').trim()
        };
      },
      error: (error) => {
        console.error('Error loading configured bank account:', error);
        this.configuredBankAccount = null;
      }
    });
  }

  private handlePaymentSpeakerChanged(event: CustomEvent): void {
    const detail = event?.detail || {};
    const hotelId = String(detail?.hotelId || '').trim();
    const currentHotelId = String(this.hotelId || this.authService.getHotelId() || '').trim();
    if (!hotelId || !currentHotelId || hotelId !== currentHotelId) {
      return;
    }

    this.enablePaymentSpeaker = !!detail?.enabled;
    this.paymentSpeakerService.setEnabled(hotelId, this.enablePaymentSpeaker);
  }
  /**
   * Bắt đầu auto-refresh payment history
   */
  startAutoRefresh(): void {
    if (!this.userId && !this.hotelId) return;

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
    if (!this.userId && !this.hotelId) return;

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
    if ((!this.userId && !this.hotelId) || !this.enableSePayPayment) return;

    this.sepayService.getPaymentHistory({
      hotelId: this.hotelId || undefined,
      userId: this.hotelId ? undefined : this.userId,
      limit: 100
    }).subscribe({
      next: (response: any) => {
        if (response?.success && response.data) {
          this.sepayPayments = response.data;
          
          // LOGIC PHÁT ÂM THANH KHI CÓ TIỀN VÀO
          const paymentHistories = response.data;
          if (paymentHistories && paymentHistories.length > 0) {
            // Tìm giao dịch gần nhất đã thành công
            const latestCompleted = paymentHistories.find((p: any) => 
              (p.status === 'completed' || p.status === 'paid') && 
              (p.amount > 0 || p.totalAmount > 0)
            );

            if (latestCompleted) {
              if (this.isFirstLoadSePay) {
                // Lần đầu mở trang: Chỉ lưu lại ID giao dịch cuối, không phát âm thanh
                this.lastPlayedPaymentId = latestCompleted._id || latestCompleted.id;
                this.isFirstLoadSePay = false;
              } else if (this.lastPlayedPaymentId !== (latestCompleted._id || latestCompleted.id)) {
                // Các lần refresh sau: Nếu ID giao dịch cuối khác ID đã lưu -> Có tiền mới vào!
                let amount = latestCompleted.paymentGatewayResponse?.transferAmount || 
                             latestCompleted.amount || 
                             latestCompleted.totalAmount || 0;
                
                if (amount > 0 && this.enablePaymentSpeaker) {
                  this.paymentSpeakerService.playPaymentSuccess(amount);
                }
                
                // Cập nhật lại ID đã phát
                this.lastPlayedPaymentId = latestCompleted._id || latestCompleted.id;
              }
            } else {
              this.isFirstLoadSePay = false;
            }
          }
        }
      },
      error: (error) => {
        console.error('Error loading SePay payments:', error);
      }
    });
  }

  /**
   * Load tất cả lịch sử thanh toán (tổng hợp từ tất cả phương thức)
   */
  loadAllPayments(): void {
    if (!this.userId && !this.hotelId) return;

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
      requests.push(this.sepayService.getPaymentHistory({
        hotelId: this.hotelId || undefined,
        userId: this.hotelId ? undefined : this.userId,
        limit: 100
      }));
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

  getPaymentHistoryId(item: any): string {
    return String(item?._id || item?.id || '');
  }

  isUpdatingPayment(item: any): boolean {
    const paymentHistoryId = this.getPaymentHistoryId(item);
    return !!paymentHistoryId && this.updatingPaymentIds.has(paymentHistoryId);
  }

  getSePayPaymentTypeLabel(item: any): string {
    const paymentType = String(item?.metadata?.paymentType || '').trim();
    switch (paymentType) {
      case 'room_checkout':
        return 'Thanh toán phòng';
      case 'booking_deposit':
        return 'Đặt cọc';
      case 'bank_transfer_in':
        return 'Tiền vào tài khoản';
      default:
        return 'Giao dịch SePay';
    }
  }

  updateSePayPaymentStatus(item: any, status: 'pending' | 'completed'): void {
    const paymentHistoryId = this.getPaymentHistoryId(item);
    if (!paymentHistoryId || this.updatingPaymentIds.has(paymentHistoryId)) {
      return;
    }

    this.updatingPaymentIds.add(paymentHistoryId);
    this.sepayService.updatePaymentHistoryStatus(paymentHistoryId, status).subscribe({
      next: (response: any) => {
        this.updatingPaymentIds.delete(paymentHistoryId);
        this.message.success(response?.message || 'Đã cập nhật trạng thái thanh toán');
        this.refreshPaymentHistory();
      },
      error: (error) => {
        this.updatingPaymentIds.delete(paymentHistoryId);
        this.message.error(error?.error?.message || 'Không thể cập nhật trạng thái thanh toán');
      }
    });
  }

  // Các hàm xử lý sắp xếp, lọc có thể được thêm ở đây nếu cần
  // Ví dụ: handleSortChange, handleFilterChange
} 
