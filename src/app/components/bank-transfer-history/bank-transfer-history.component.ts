import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';
import { BankTransferService, BankTransfer } from '../../services/bank-transfer.service';
import { PayPalService } from '../../services/paypal.service';
import { CryptoService } from '../../services/crypto.service';
import { SePayService } from '../../services/sepay.service';
import { AuthService } from '../../services/auth.service';
import { HotelService } from '../../services/hotel.service';
import { PaymentSpeakerService } from '../../services/payment-speaker.service';
import { UserService } from '../../services/user.service';
import { Subscription } from 'rxjs';
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

  // ===== Đối soát thủ công (admin/superadmin) =====
  /** Bỏ lọc theo hotel/user để đối soát giao dịch của toàn bộ người dùng. */
  systemWideMode = true;
  reconcileStatusFilter = '';
  reconcileSearch = '';
  sepayTotal = 0;

  manualModalVisible = false;
  manualTarget: any = null;
  manualStatus: 'pending' | 'completed' | 'failed' | 'cancelled' = 'completed';
  manualNote = '';
  manualTransactionId = '';
  manualSubmitting = false;

  // Auto-refresh interval — chỉ dùng cho phạm vi khách sạn của mình
  private refreshInterval: any = null;
  private readonly REFRESH_INTERVAL = 60000;
  private paymentSocket: Socket | null = null;
  private refreshTimer: any = null;
  private sepayLoading = false;

  private isFirstLoadSePay = true;
  private lastPlayedPaymentId: string | null = null;
  private readonly paymentSpeakerChangedHandler = (event: Event) => this.handlePaymentSpeakerChanged(event as CustomEvent);
  private authSub: Subscription | null = null;
  private scopeTouched = false;
  private adminHistoryLoaded = false;

  get isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  get isSuperAdmin(): boolean {
    return this.authService.isSuperAdmin();
  }

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
    private userService: UserService,
    private translate: TranslateService
  ) {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?._id) {
      this.userId = currentUser._id;
    }
    const resolvedHotelId = this.authService.getHotelId() || currentUser?.hotelId || '';
    this.hotelId = typeof resolvedHotelId === 'string' ? resolvedHotelId : String((resolvedHotelId as any)?._id || '');
    this.systemWideMode = false;
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
      this.scheduleRefresh();
    }

    this.authSub = this.authService.currentUser$.subscribe((user) => {
      if (!user) return;
      if (user._id) this.userId = String(user._id);
      const hotel = this.authService.getHotelId() || (user as any).hotelId || '';
      if (hotel) {
        this.hotelId = typeof hotel === 'string' ? hotel : String(hotel._id || hotel);
      }
      if (this.authService.isAdmin() && !this.scopeTouched && !this.adminHistoryLoaded) {
        this.adminHistoryLoaded = true;
        this.scheduleRefresh();
      }
    });

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
        this.scheduleRefresh();
        this.startPaymentSocket();
      },
      error: (error) => {
        console.error('Error loading hotel settings:', error);
        // Fallback: cho phép hiển thị tất cả nếu không load được settings
        this.enableSePayPayment = true;
        this.scheduleRefresh();
        this.startPaymentSocket();
      }
    });
  }

  ngOnDestroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.stopPaymentSocket();
    window.removeEventListener('hotelPaymentSpeakerChanged', this.paymentSpeakerChangedHandler);
    this.authSub?.unsubscribe();
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
      this.scheduleRefresh();
      return;
    }

    if (paymentId) {
      this.lastPlayedPaymentId = paymentId;
    }

    this.message.success(
      amount > 0
        ? this.translate.instant('BANK_TRANSFER_HISTORY.MESSAGES.SEPAY_SUCCESS_WITH_AMOUNT', {
            amount: amount.toLocaleString('vi-VN')
          })
        : this.translate.instant('BANK_TRANSFER_HISTORY.MESSAGES.SEPAY_SUCCESS')
    );

    if (this.enablePaymentSpeaker) {
      this.paymentSpeakerService.setEnabled(this.hotelId, true);
    }
    this.paymentSpeakerService.tryPlayForPayment(payload, this.hotelId);

    this.scheduleRefresh();
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
    if (!this.canLoadPayments()) return;

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    // Toàn hệ thống không poll — payload nặng, dùng socket + nút Làm mới
    if (this.systemWideMode) {
      return;
    }

    this.refreshInterval = setInterval(() => {
      this.refreshPaymentHistory();
    }, this.REFRESH_INTERVAL);
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refreshPaymentHistory();
    }, 250);
  }

  /**
   * Refresh payment history (một lần SePay, không forkJoin trùng)
   */
  refreshPaymentHistory(): void {
    if (!this.canLoadPayments()) return;

    this.loadPayPalPayments();
    this.loadCryptoPayments();
    this.loadSePayPayments();
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
    
    this.message.success(this.translate.instant('BANK_TRANSFER_HISTORY.MESSAGES.REFRESHED'));
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
          this.message.error(this.translate.instant('BANK_TRANSFER_HISTORY.MESSAGES.LOAD_FAIL'));
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
          this.message.error(this.translate.instant('BANK_TRANSFER_HISTORY.MESSAGES.SEARCH_FAIL'));
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

    this.paypalService.getPaymentHistory({ userId: this.userId, limit: 30 }).subscribe({
      next: (response) => {
        if (response?.success && response.data) {
          this.paypalPayments = response.data;
          this.mergeAllPayments();
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

    this.cryptoService.getPaymentHistory({ userId: this.userId, limit: 30 }).subscribe({
      next: (response) => {
        if (response?.success && response.data) {
          this.cryptoPayments = response.data;
          this.mergeAllPayments();
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
    if (!this.canLoadPayments() || !this.enableSePayPayment || this.sepayLoading) return;

    this.sepayLoading = true;
    this.sepayService.getPaymentHistory(this.sepayQueryParams()).subscribe({
      next: (response: any) => {
        this.sepayLoading = false;
        if (response?.success && response.data) {
          this.sepayPayments = response.data;
          this.sepayTotal = Number(response.total ?? response.data.length);
          
          // LOGIC PHÁT ÂM THANH KHI CÓ TIỀN VÀO
          // Chế độ toàn hệ thống liệt kê giao dịch của mọi khách sạn, nên không phát loa
          // để tránh báo tiền vào của người khác.
          const paymentHistories = this.systemWideMode ? [] : response.data;
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
        this.mergeAllPayments();
      },
      error: (error) => {
        this.sepayLoading = false;
        console.error('Error loading SePay payments:', error);
      }
    });
  }

  /**
   * Load tất cả lịch sử thanh toán (tổng hợp từ tất cả phương thức)
   */
  loadAllPayments(): void {
    this.mergeAllPayments();
  }

  private mergeAllPayments(): void {
    const allPayments: any[] = [];

    this.paypalPayments.forEach((payment: any) => {
      allPayments.push({
        ...payment,
        paymentMethod: 'paypal',
        paymentMethodLabel: 'PayPal',
        paymentMethodIcon: 'pay-circle',
        paymentMethodColor: '#0070ba'
      });
    });

    this.cryptoPayments.forEach((payment: any) => {
      allPayments.push({
        ...payment,
        paymentMethod: 'crypto_usdt',
        paymentMethodLabel: `Crypto USDT (${payment.cryptoNetwork || 'N/A'})`,
        paymentMethodIcon: 'dollar-circle',
        paymentMethodColor: '#26a17b'
      });
    });

    this.sepayPayments.forEach((payment: any) => {
      allPayments.push({
        ...payment,
        paymentMethod: 'sepay',
        paymentMethodLabel: 'SePay',
        paymentMethodIcon: 'credit-card',
        paymentMethodColor: '#667eea'
      });
    });

    this.allPayments = allPayments.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.created_at || 0).getTime();
      const dateB = new Date(b.createdAt || b.created_at || 0).getTime();
      return dateB - dateA;
    });
    this.allPaymentsLoading = false;
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
    const kind = this.getPaymentKind(item);
    switch (kind) {
      case 'package':
        return 'Đăng ký gói';
      case 'hotel_guest':
        return String(item?.metadata?.paymentType || '') === 'booking_deposit'
          ? 'Khách đặt cọc'
          : 'Khách thanh toán tại KS';
      case 'hotel_transfer':
        return 'Tiền vào tài khoản KS';
      default:
        if (item?.paymentMethod === 'paypal') return 'Thanh toán PayPal';
        if (item?.paymentMethod === 'crypto_usdt') return 'Thanh toán Crypto';
        return 'Giao dịch';
    }
  }

  getPaymentKind(item: any): 'package' | 'hotel_guest' | 'hotel_transfer' | 'other' {
    const paymentType = String(item?.metadata?.paymentType || '').trim();
    if (item?.packageId || paymentType === 'pricing' || paymentType === 'pricing_subscription') {
      return 'package';
    }
    if (paymentType === 'room_checkout' || paymentType === 'booking_deposit' || item?.roomId) {
      return 'hotel_guest';
    }
    if (paymentType === 'bank_transfer_in') {
      return 'hotel_transfer';
    }
    return 'other';
  }

  getPaymentKindColor(item: any): string {
    switch (this.getPaymentKind(item)) {
      case 'package':
        return 'purple';
      case 'hotel_guest':
        return 'cyan';
      case 'hotel_transfer':
        return 'blue';
      default:
        return 'default';
    }
  }

  private asId(value: any): string {
    if (!value) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return String(value._id || value.id || '').trim();
  }

  getAccountUser(item: any): {
    id: string;
    name: string;
    username: string;
    email: string;
    phone: string;
    role: string;
    roleLabel: string;
  } | null {
    const raw = item?.userId;
    if (!raw) return null;
    const id = this.asId(raw);
    const obj = typeof raw === 'object' ? raw : {};
    const username = String(obj.username || '').trim();
    const email = String(obj.email || '').trim();
    const name = String(obj.fullName || obj.name || username || email || '').trim();
    const role = String(obj.role || '').trim();
    const roleMap: Record<string, string> = {
      superadmin: 'Superadmin',
      admin: 'Admin',
      business: 'Doanh nghiệp',
      hotel: 'Chủ KS',
      staff: 'Nhân viên',
      guest: 'Tài khoản khách'
    };
    return {
      id,
      name: name || id,
      username,
      email,
      phone: String(obj.phone || '').trim(),
      role,
      roleLabel: roleMap[role] || role
    };
  }

  getGuestName(item: any): string {
    return String(item?.metadata?.guestName || item?.metadata?.customerName || '').trim();
  }

  getGuestPhone(item: any): string {
    return String(item?.metadata?.guestPhone || item?.metadata?.customerPhone || '').trim();
  }

  getHotelName(item: any): string {
    const hotel = item?.hotelId;
    if (hotel && typeof hotel === 'object') return String(hotel.name || '').trim();
    return '';
  }

  getHotelId(item: any): string {
    return this.asId(item?.hotelId);
  }

  getRoomLabel(item: any): string {
    const fromMeta = String(item?.metadata?.roomNumber || '').trim();
    if (fromMeta) return fromMeta;
    const room = item?.roomId;
    if (room && typeof room === 'object') return String(room.roomNumber || '').trim();
    return '';
  }

  copyText(value: string, label = 'ID'): void {
    const text = String(value || '').trim();
    if (!text || !navigator?.clipboard) return;
    navigator.clipboard.writeText(text).then(
      () => this.message.success(`Đã copy ${label}`),
      () => this.message.error(`Không copy được ${label}`)
    );
  }

  /**
   * Đủ dữ kiện để gọi API chưa. Admin ở chế độ toàn hệ thống không cần userId/hotelId
   * vì backend tự mở phạm vi theo quyền.
   */
  private canLoadPayments(): boolean {
    if (this.isAdmin && this.systemWideMode) return true;
    return !!this.userId || !!this.hotelId;
  }

  /**
   * Tham số truy vấn SePay. Ở chế độ toàn hệ thống ta cố tình bỏ hotelId/userId
   * để backend trả về giao dịch của mọi người dùng.
   */
  private sepayQueryParams(): {
    hotelId?: string;
    userId?: string;
    status?: string;
    search?: string;
    scope?: 'system' | 'own';
    limit: number;
  } {
    const scopeAll = this.isAdmin && this.systemWideMode;
    return {
      hotelId: scopeAll ? undefined : this.hotelId || undefined,
      userId: scopeAll ? undefined : this.hotelId ? undefined : this.userId,
      status: this.reconcileStatusFilter || undefined,
      search: this.reconcileSearch.trim() || undefined,
      scope: this.isAdmin ? (scopeAll ? 'system' : 'own') : undefined,
      limit: scopeAll ? 40 : 40
    };
  }

  /** Bật/tắt phạm vi toàn hệ thống rồi tải lại. */
  onSystemWideModeChange(enabled: boolean): void {
    this.scopeTouched = true;
    this.systemWideMode = enabled;
    this.isFirstLoadSePay = true;
    this.lastPlayedPaymentId = null;
    this.startAutoRefresh();
    this.scheduleRefresh();
  }

  /** Áp dụng bộ lọc đối soát. */
  applyReconcileFilters(): void {
    this.refreshPaymentHistory();
  }

  clearReconcileFilters(): void {
    this.reconcileStatusFilter = '';
    this.reconcileSearch = '';
    this.refreshPaymentHistory();
  }

  /** Chỉ giao dịch SePay có endpoint cập nhật trạng thái thủ công. */
  canManualUpdate(item: any): boolean {
    if (!this.isAdmin || !item) return false;
    const method = String(item.paymentMethod || 'sepay');
    if (method !== 'sepay') return false;
    return !!this.getPaymentHistoryId(item);
  }

  /** Chủ giao dịch — chỉ cần khi admin xem nhiều người dùng cùng lúc. */
  getOwnerLabel(item: any): string {
    const user = this.getAccountUser(item);
    const hotel = this.getHotelName(item);
    const parts: string[] = [];
    if (user) {
      parts.push(user.name);
      if (user.id) parts.push(user.id);
    }
    if (hotel) parts.push(hotel);
    return parts.join(' · ');
  }

  /** Thông tin lần đối soát thủ công gần nhất, để biết ai đã xác nhận. */
  getManualUpdateInfo(item: any): { byRole: string; note: string; updatedAt: string; status: string } | null {
    const entry = item?.paymentGatewayResponse?.manualStatusUpdate;
    if (!entry) return null;
    return {
      byRole: String(entry.byEmail || entry.byRole || '').trim(),
      note: String(entry.note || '').trim(),
      updatedAt: String(entry.updatedAt || '').trim(),
      status: String(entry.status || '').trim()
    };
  }

  /** Các trạng thái người dùng hiện tại được phép đặt thủ công. */
  get manualStatusOptions(): Array<{ value: 'pending' | 'completed' | 'failed' | 'cancelled'; label: string }> {
    const options: Array<{ value: 'pending' | 'completed' | 'failed' | 'cancelled'; label: string }> = [
      { value: 'completed', label: 'Hoàn thành — đã nhận được tiền' },
      { value: 'pending', label: 'Đang xử lý — chờ đối soát lại' }
    ];
    if (this.isAdmin) {
      options.push(
        { value: 'failed', label: 'Thất bại — không nhận được tiền' },
        { value: 'cancelled', label: 'Đã hủy — giao dịch bị hủy' }
      );
    }
    return options;
  }

  /**
   * Mở hộp thoại xác nhận thủ công. Bắt buộc qua bước này thay vì đổi trạng thái
   * ngay khi bấm, vì đây là thao tác ghi nhận tiền thật.
   */
  openManualUpdate(item: any, status: 'pending' | 'completed' | 'failed' | 'cancelled' = 'completed'): void {
    if (!this.canManualUpdate(item)) {
      this.message.warning('Giao dịch này không hỗ trợ xác nhận thủ công');
      return;
    }
    this.manualTarget = item;
    this.manualStatus = status;
    this.manualNote = '';
    this.manualTransactionId = '';
    this.manualSubmitting = false;
    this.manualModalVisible = true;
  }

  cancelManualUpdate(): void {
    this.manualModalVisible = false;
    this.manualTarget = null;
    this.manualNote = '';
    this.manualTransactionId = '';
    this.manualSubmitting = false;
  }

  confirmManualUpdate(): void {
    const item = this.manualTarget;
    const paymentHistoryId = this.getPaymentHistoryId(item);
    if (!paymentHistoryId || this.manualSubmitting) {
      return;
    }

    const note = this.manualNote.trim();
    if (note.length < 5) {
      this.message.warning('Vui lòng nhập lý do đối soát thủ công (tối thiểu 5 ký tự)');
      return;
    }

    this.manualSubmitting = true;
    this.updatingPaymentIds.add(paymentHistoryId);
    this.sepayService
      .updatePaymentHistoryStatus(
        paymentHistoryId,
        this.manualStatus,
        note,
        this.manualTransactionId.trim()
      )
      .subscribe({
      next: (response: any) => {
        this.updatingPaymentIds.delete(paymentHistoryId);
        this.manualSubmitting = false;
        this.manualModalVisible = false;
        this.manualTarget = null;
        this.manualNote = '';
        this.manualTransactionId = '';
        this.message.success(
          response?.message || this.translate.instant('BANK_TRANSFER_HISTORY.MESSAGES.UPDATE_STATUS_SUCCESS')
        );
        this.refreshPaymentHistory();
      },
      error: (error) => {
        this.updatingPaymentIds.delete(paymentHistoryId);
        this.manualSubmitting = false;
        this.message.error(
          error?.error?.error ||
            error?.error?.message ||
            this.translate.instant('BANK_TRANSFER_HISTORY.MESSAGES.UPDATE_STATUS_FAIL')
        );
      }
    });
  }

  // Các hàm xử lý sắp xếp, lọc có thể được thêm ở đây nếu cần
  // Ví dụ: handleSortChange, handleFilterChange
} 
