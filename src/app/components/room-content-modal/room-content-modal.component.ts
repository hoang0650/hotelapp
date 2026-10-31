import { Component, Inject, OnInit, Input, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, NgZone } from '@angular/core';
import { NzModalRef, NZ_MODAL_DATA, NzModalService } from 'ng-zorro-antd/modal';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RoomsService } from '../../services/rooms.service';
import { HotelService } from '../../services/hotel.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { GuestInfo, OrderedService } from '../../interfaces/rooms';
import { InvoiceComponent } from '../../components/invoice/invoice.component';
import { Hotel } from '../../interfaces/hotel';
import { RoomSessionService, RoomSession } from '../../services/room-session.service';
import { Subscription } from 'rxjs';
import { DatePipe } from '@angular/common';
import { ServiceService } from '../../services/service.service';
import { GuestsService } from '../../services/guests.service';
import { GuestSaveModalComponent } from '../guest-save-modal/guest-save-modal.component';
import { BusinessService } from '../../services/business.service';
import { TuyaService } from '../../services/tuya.service';
import { SePayService, SePayPaymentData } from '../../services/sepay.service';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { TranslateService } from '@ngx-translate/core';
import { HttpClient } from '@angular/common/http';
import { TransactionService } from '../../services/transaction.service';
import { environment } from '../../../environments/environment';
import { debounceTime, distinctUntilChanged, takeUntil, take, tap, catchError } from 'rxjs/operators'
import { throwError, Observable } from 'rxjs';
import {
  applyManualAdjustments,
  applyServerInvoice,
  CheckoutQuote,
  priceDetailsFromQuote,
  roomChargeFromQuote,
  showLateCheckoutLine,
  StayPriceDetails,
  toRealInstantIso
} from '../../utils/checkout-quote';
import { Subject } from 'rxjs';

// Interface cho dữ liệu cập nhật phòng
interface RoomUpdate {
  services?: OrderedService[];
  [key: string]: any;
}

@Component({
  selector: 'app-room-content-modal',
  templateUrl: './room-content-modal.component.html',
  styleUrls: ['./room-content-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomContentModalComponent implements OnInit, OnDestroy {
  private static servicesCache = new Map<string, any[]>();
  roomData: any;
  private isFormInitialized = false;
  listData: any[] = [];
  checkInForm!: FormGroup;
  servicesForm!: FormGroup;
  checkOutForm!: FormGroup;
  services: any[] = []; // Load từ API
  selectedServices: OrderedService[] = [];
  paymentMethods = [
    { value: 'cash', label: 'ROOM_CONTENT_MODAL.CASH' },
    { value: 'transfer', label: 'ROOM_CONTENT_MODAL.BANK_TRANSFER' },
    { value: 'card', label: 'ROOM_CONTENT_MODAL.CARD' }
  ];
  
  // Get translated payment method label
  getPaymentMethodLabel(method: any): string {
    return this.translate.instant(method.label);
  }

  private mapToTransactionMethod(method: any): 'cash' | 'bank_transfer' | 'card' | 'other' {
    const raw = (method && typeof method === 'object' && 'value' in method) ? (method as any).value : method;
    const m = String(raw || '').toLowerCase().trim();
    if (m === 'bank_transfer' || m === 'banking' || m === 'transfer') return 'bank_transfer';
    if (m === 'card' || m === 'credit_card' || m === 'visa' || m === 'mastercard' || m === 'virtual_card') return 'card';
    if (m === 'cash') return 'cash';
    return 'other';
  }

  private normalizePaymentMethod(method: any): string {
    const m = String(method || '').toLowerCase().trim();
    if (m === 'bank_transfer' || m === 'banking' || m === 'transfer') return 'transfer';
    if (m === 'card' || m === 'credit_card' || m === 'visa' || m === 'mastercard') return 'card';
    return 'cash';
  }
  isLoading = false;
  isSaving = false;
  totalPrice = 0; // Tổng cộng = tiền phòng + phụ thu + tiền dịch vụ
  remainingAmount = 0; // Còn lại phải thanh toán = tổng cộng - đặt trước - khuyến mãi (cho phép số âm)
  private _roomPriceTotal = 0; // Tổng tiền phòng (private để tránh conflict với getter)
  private _servicesPriceTotal = 0; // Tổng tiền dịch vụ (private để tránh conflict với getter)
  private _hasRoomPriceFromAPI = false; // Flag để biết đã có giá trị từ API chưa
  roomPriceDetails: any = null; // Chi tiết tính tiền phòng từ server
  quoteLoading = false;
  quoteError = false;
  private checkoutQuote: CheckoutQuote | null = null;
  private quoteRequestSeq = 0;
  /** Checkout instant used for the quote, reused when saving so the server recomputes the same stay. */
  private quotedCheckOutIso = '';
  /** Set while submitting so checkout reuses the quote just fetched. */
  private checkoutQuoteReady = false;
  advancePayment = 0;
  skipValidation = false;
  modalType: string = 'info'; // Loại modal: checkin, checkout, cleaning
  private sessionSubscription?: Subscription;
  private saveTotalPriceTimer?: ReturnType<typeof setTimeout>;
  private roomReloadTimer?: ReturnType<typeof setTimeout>;
  private destroy$ = new Subject<void>();
  private roomReloadInFlight = false;
  private servicesLoadedHotelId: string | null = null;
  currentTime: Date = new Date();
  bookingTransferInfo: {
    fromRoomId?: string;
    fromRoomNumber?: string;
    toRoomId?: string;
    toRoomNumber?: string;
    transferredAt?: Date;
    transferredBy?: string;
    transferHistory?: any[];
  } | null = null;
  transferInfoDescription = '';
  
  // SePay payment
  showSePayModal = false;
  sepayPaymentCode = '';
  sepayAmount = 0;
  sepayQrUrl = '';
  sepayBeneficiaryName = '';
  sepayBankName = '';
  sepayAccountNumber = '';
  sepayPaymentHistoryId: string = ''; // ID của payment history để kiểm tra trạng thái
  sepayInitializing = false;
  sepayPaymentConfirmed = false;
  currentUser: any = null;
  hotelBankAccount: any = null; // Thông tin ngân hàng của hotel
  private paymentStatusCheckInterval: any = null; // Interval để kiểm tra trạng thái thanh toán
  private paymentStatusCheckInFlight = false;
  private paymentSuccessHandled = false;
  private activeSePayTransactionToken = '';
  private pendingCheckoutCloseResult: any = null;
  private pendingCheckoutData: any = null;
  private pendingInvoiceData: any = null;
  /** Prefetch mã CK khi user chọn chuyển khoản — checkout dùng lại ngay. */
  private prefetchedSePay: {
    amount: number;
    roomId: string;
    paymentHistoryId: string;
    paymentCode: string;
    createdAt: number;
  } | null = null;
  private prefetchSePayInFlight = false;
  
  // Định dạng hiển thị tiền Việt Nam (KHÔNG gắn "đ" vào formatter —
  // suffix trong formatter khiến nz-input-number mất chữ số khi đang gõ).
  formatterVND = (value: number | string): string => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    return new Intl.NumberFormat('vi-VN').format(num);
  };

  parserVND = (value: string): string => {
    if (value === null || value === undefined) return '';
    let raw = String(value).trim().toLowerCase().replace(/\s+/g, '');
    raw = raw.replace(/đ|vnd|vnđ/gi, '');

    let multiplier = 1;
    if (/(k|nghìn|ngàn)$/i.test(raw)) {
      multiplier = 1000;
      raw = raw.replace(/(k|nghìn|ngàn)$/i, '');
    } else if (/(tr|m|triệu)$/i.test(raw)) {
      multiplier = 1000000;
      raw = raw.replace(/(tr|m|triệu)$/i, '');
    }

    // vi-VN: dấu chấm = nghìn, dấu phẩy = thập phân
    if (raw.includes(',') && raw.includes('.')) {
      raw = raw.replace(/\./g, '').replace(/,/g, '.');
    } else if (raw.includes(',')) {
      raw = raw.replace(/,/g, '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
      raw = raw.replace(/\./g, '');
    }

    const num = Number.parseFloat(raw.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(num)) return '';
    return String(Math.round(num * multiplier));
  };

  /** Đồng bộ advancePayment + tổng tiền ngay khi đổi số (không chờ blur). */
  onMoneyFieldChange(): void {
    const fromCheckOut = Number(this.checkOutForm?.get('advancePayment')?.value);
    const fromCheckIn = Number(this.checkInForm?.get('advancePayment')?.value);
    if (Number.isFinite(fromCheckOut)) {
      this.advancePayment = fromCheckOut;
    } else if (Number.isFinite(fromCheckIn)) {
      this.advancePayment = fromCheckIn;
    }
    this.calculateTotalPrice();
  }
  
  selectAllMoneyInput(event: FocusEvent): void {
    const target = event?.target as HTMLInputElement | null;
    if (!target) return;
    setTimeout(() => {
      try {
        target.select();
      } catch (_e) {}
    }, 0);
  }
  
  // Lấy thời gian hiện tại theo UTC+7 (múi giờ Việt Nam)
  getCurrentTime(): Date {
    return this.currentTime;
  }
  
  // Lấy thông tin chuyển phòng từ Booking
  getBookingTransferInfo(): {
    fromRoomId?: string;
    fromRoomNumber?: string;
    toRoomId?: string;
    toRoomNumber?: string;
    transferredAt?: Date;
    transferredBy?: string;
    transferHistory?: any[];
  } | null {
    return this.bookingTransferInfo;
  }

  private computeBookingTransferInfo(): {
    fromRoomId?: string;
    fromRoomNumber?: string;
    toRoomId?: string;
    toRoomNumber?: string;
    transferredAt?: Date;
    transferredBy?: string;
    transferHistory?: any[];
  } | null {
    if (!this.roomData?.currentBooking) return null;
    
    const booking = this.roomData.currentBooking as any;
    if (booking.transferredFrom || booking.transferredTo) {
      // Lấy số phòng từ transferHistory nếu có
      let fromRoomNumber = 'N/A';
      let toRoomNumber = 'N/A';
      
      if (booking.transferHistory && Array.isArray(booking.transferHistory) && booking.transferHistory.length > 0) {
        // Lấy từ lần chuyển đầu tiên trong history
        const firstTransfer = booking.transferHistory[0];
        fromRoomNumber = firstTransfer.fromRoomNumber || 'N/A';
        // Lấy từ lần chuyển cuối cùng
        const lastTransfer = booking.transferHistory[booking.transferHistory.length - 1];
        toRoomNumber = lastTransfer.toRoomNumber || this.roomData.roomNumber || 'N/A';
      } else {
        // Fallback: lấy từ roomData nếu có
        fromRoomNumber = booking.transferredFrom ? String(booking.transferredFrom) : this.translate.instant('COMMON.N_A');
        toRoomNumber = this.roomData.roomNumber || this.translate.instant('COMMON.N_A');
      }
      
      return {
        fromRoomId: booking.transferredFrom,
        fromRoomNumber: fromRoomNumber,
        toRoomId: booking.transferredTo,
        toRoomNumber: toRoomNumber,
        transferredAt: booking.transferredAt ? new Date(booking.transferredAt) : undefined,
        transferredBy: booking.transferredBy,
        transferHistory: booking.transferHistory || []
      };
    }
    
    return null;
  }
  
  // Tạo mô tả thông tin chuyển phòng
  getTransferInfoDescription(): string {
    return this.transferInfoDescription;
  }

  private buildTransferInfoDescription(transferInfo: {
    fromRoomId?: string;
    fromRoomNumber?: string;
    toRoomId?: string;
    toRoomNumber?: string;
    transferredAt?: Date;
    transferredBy?: string;
    transferHistory?: any[];
  } | null): string {
    if (!transferInfo) return '';

    const na = this.translate.instant('COMMON.N_A');
    const lines: string[] = [];

    lines.push(
      this.translate.instant('ROOM_CONTENT_MODAL.TRANSFER_ORIGINAL_ROOM', {
        roomNumber: transferInfo.fromRoomNumber || na
      })
    );

    if (transferInfo.transferredAt) {
      const time = this.datePipe.transform(transferInfo.transferredAt, 'dd/MM/yyyy HH:mm') || na;
      lines.push(this.translate.instant('ROOM_CONTENT_MODAL.TRANSFER_TIME', { time }));
    }

    if (transferInfo.transferHistory && transferInfo.transferHistory.length > 1) {
      lines.push('');
      lines.push(
        this.translate.instant('ROOM_CONTENT_MODAL.TRANSFER_HISTORY_TITLE', {
          count: transferInfo.transferHistory.length
        })
      );

      transferInfo.transferHistory.forEach((transfer, index) => {
        const transferDate = transfer.transferredAt
          ? (this.datePipe.transform(new Date(transfer.transferredAt), 'dd/MM/yyyy HH:mm') || na)
          : na;
        let item = this.translate.instant('ROOM_CONTENT_MODAL.TRANSFER_HISTORY_ITEM', {
          index: index + 1,
          from: transfer.fromRoomNumber || na,
          to: transfer.toRoomNumber || na,
          time: transferDate
        });
        if (transfer.notes) item += ` - ${transfer.notes}`;
        lines.push(item);
      });
    }

    return lines.join('\n');
  }

  private refreshComputedViewState(): void {
    this.currentTime = this.getUTCTimePlus7();
    this.bookingTransferInfo = this.computeBookingTransferInfo();
    this.transferInfoDescription = this.buildTransferInfoDescription(this.bookingTransferInfo);
  }
  
  // Helper function để lọc các event check-in CHƯA CHECKOUT
  // Lưu ý: Nếu backend đã filter bằng excludeCheckedOut=true, hàm này vẫn hoạt động như một lớp bảo vệ bổ sung
  private getEventCheckinTime(event: any): Date | null {
    if (!event) return null;
    const rawTime = event.checkinTime || event.checkInTime || event.checkInDate || event.checkinDate;
    if (!rawTime) return null;
    const parsed = new Date(rawTime);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  }

  private getUncheckedOutCheckinEvents(events: any[]): any[] {
    if (!events || events.length === 0) return [];
    
    return events
      .filter((event: any) => {
        if (event.type !== 'checkin') return false;
        
        // Kiểm tra xem có event checkout nào tương ứng với checkin này không
        // So sánh chính xác bằng checkinTime (có thể là Date object hoặc ISO string)
        const hasCheckout = events.some((e: any) => {
          if (e.type !== 'checkout') return false;
          
          // So sánh checkinTime: chuyển về Date object và so sánh timestamp
          const checkoutCheckinTime = this.getEventCheckinTime(e)?.getTime() || null;
          const eventCheckinTime = this.getEventCheckinTime(event)?.getTime() || null;
          
          // Nếu có checkinTime và khớp chính xác (trong vòng 1 giây để tránh lỗi làm tròn)
          if (checkoutCheckinTime && eventCheckinTime) {
            return Math.abs(checkoutCheckinTime - eventCheckinTime) < 1000; // Trong vòng 1 giây
          }
          
          return false;
        });
        
        // Chỉ lấy event check-in chưa có checkout
        return !hasCheckout;
      })
      .sort((a: any, b: any) => {
        const timeA = this.getEventCheckinTime(a)?.getTime() || 0;
        const timeB = this.getEventCheckinTime(b)?.getTime() || 0;
        return timeB - timeA; // Sắp xếp giảm dần (mới nhất trước)
      });
  }

  /**
   * Real "now". Hotel wall clock is applied only when formatting (+07:00).
   * Shifting this Date used to make toISOString() emit Vietnam digits labeled Z.
   */
  getTimeByTimezone(_timezone: string = 'UTC+7'): Date {
    return new Date();
  }

  getUTCTimePlus7(): Date {
    return new Date();
  }

  showLateCheckout(details: StayPriceDetails | null | undefined): boolean {
    return showLateCheckoutLine(details);
  }

  // Thêm thuộc tính businessInfo
  businessInfo: any = {};
  businessOwner: any = null; // Thông tin chủ doanh nghiệp (business owner)

  initialCharges: number = 0;
  initialDiscount: number = 0;
  initialNotes: string = '';
  /** Tiền đặt trước đã lưu (baseline) — dùng để tạo phiếu thu phần chênh lệch. */
  initialAdvancePayment: number = 0;
  initialSelectedServices: OrderedService[] = []; // Lưu trữ dịch vụ ban đầu

  constructor(
    private modalRef: NzModalRef<RoomContentModalComponent>,
    private fb: FormBuilder,
    private roomsService: RoomsService,
    private hotelService: HotelService,
    private message: NzMessageService,
    private modalService: NzModalService,
    private roomSessionService: RoomSessionService,
    @Inject(NZ_MODAL_DATA) private data: any,
    private datePipe: DatePipe,
    private serviceService: ServiceService,
    private guestsService: GuestsService,
    private businessService: BusinessService,
    private tuyaService: TuyaService,
    private sepayService: SePayService,
    private userService: UserService,
    private authService: AuthService,
    private apiService: ApiService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
    private http: HttpClient,
    private transactionService: TransactionService,
    private ngZone: NgZone
  ) {
    
    this.roomData = data.roomData;
    this.skipValidation = data.skipValidation || false;
    this.modalType = data.modalType || 'info';
    
    // Log để kiểm tra modalType
    console.log('Modal type set to:', this.modalType);
    
    // Form cho check-in với validators tùy chọn
    this.checkInForm = this.fb.group({
      guestInfo: this.fb.group({
        name: ['Khách lẻ'], // Mặc định là "Khách lẻ", không bắt buộc
        idNumber: [''],
        tax_code: [''], // Mã số thuế (cho công ty)
        phone: ['', [Validators.pattern('^[0-9]{10}$')]],
        email: ['', [Validators.email]],
        address: [''],
        guestSource: ['walkin'] // Mặc định là walkin
      }),
      paymentMethod: ['cash', this.skipValidation ? [] : [Validators.required]],
      rateType: ['hourly', this.skipValidation ? [] : [Validators.required]],
      advancePayment: [0, [Validators.min(0)]],
      advancePaymentMethod: ['cash', this.skipValidation ? [] : [Validators.required]], // Hình thức thanh toán cho trả trước
      additionalCharges: [0, [Validators.min(0)]],
      discount: [0, [Validators.min(0)]],
      notes: ['']
    });
    
    // Thêm listener để debug guestSource changes
    const checkInGuestInfoGroup = this.checkInForm.get('guestInfo') as FormGroup;
    if (checkInGuestInfoGroup) {
      checkInGuestInfoGroup.get('guestSource')?.valueChanges.subscribe(value => {
        console.log('CheckIn form guestSource changed to:', value);
      });
    }
    
    // Form cho dịch vụ (cho phép chọn nhiều)
    this.servicesForm = this.fb.group({
      serviceIds: [[] as string[]],
      quantity: [1, [Validators.min(1), Validators.required]]
    });
    
    // Form cho check-out
    this.createCheckOutForm();
  }

  ngOnInit(): void {
    this.fetchCurrentRoom();
    this.refreshComputedViewState();
    
    if (this.modalType === 'checkout') {
      this.calculateTotalPrice();
    }

    // Load phụ trợ sau first paint — không chặn mở modal
    const deferSecondary = () => {
      this.loadServicesFromAPI();
      this.loadBusinessInfo();
      this.loadCurrentUser();
    };
    const ric = (typeof window !== 'undefined' && (window as any).requestIdleCallback) as
      | undefined
      | ((cb: () => void, opts?: { timeout: number }) => void);
    if (typeof ric === 'function') {
      ric(deferSecondary, { timeout: 800 });
    } else {
      setTimeout(deferSecondary, 0);
    }

    Promise.resolve().then(() => this.scheduleRoomDetailsReload(false));

    this.roomsService.getRoomDataUpdated$()
      .pipe(
        debounceTime(120),
        takeUntil(this.destroy$)
      )
      .subscribe((event) => {
        if (!this.shouldHandleRoomUpdateEvent(event)) {
          return;
        }

        if (!this.checkOutForm.dirty && !this.checkInForm.dirty) {
          this.scheduleRoomDetailsReload(false, Math.max(0, Number(event?.delayMs) || 0));
        }
      });

    if (typeof window !== 'undefined') {
      window.addEventListener('sepayPaymentReceived', this.onSePayPaymentReceivedWindow);
    }
  }

  private shouldHandleRoomUpdateEvent(event: any): boolean {
    const currentRoomId = this.normalizeObjectId(this.roomData?._id);
    if (!currentRoomId) {
      return false;
    }

    const currentHotelId = this.getResolvedHotelId();
    const eventHotelId = this.normalizeObjectId(event?.hotelId);
    if (currentHotelId && eventHotelId && currentHotelId !== eventHotelId) {
      return false;
    }

    const eventRoomId = this.normalizeObjectId(event?.roomId);
    const relatedRoomId = this.normalizeObjectId(event?.relatedRoomId);
    if (!eventRoomId && !relatedRoomId) {
      return true;
    }

    return eventRoomId === currentRoomId || relatedRoomId === currentRoomId;
  }

  private scheduleRoomDetailsReload(forcePatchForm: boolean, delayMs: number = 0): void {
    if (this.roomReloadTimer) {
      clearTimeout(this.roomReloadTimer);
      this.roomReloadTimer = undefined;
    }

    const normalizedDelay = Math.max(0, delayMs);
    this.roomReloadTimer = setTimeout(() => {
      this.roomReloadTimer = undefined;
      this.reloadRoomDetails(forcePatchForm);
    }, normalizedDelay);
  }

  private getResolvedHotelId(): string | null {
    return this.normalizeObjectId(
      this.roomData?.hotelId ||
      this.authService.getHotelId() ||
      this.currentUser?.hotelId
    );
  }

  private mapServiceOption(service: any) {
    const serviceId = service?._id || service?.id || service?.serviceId;
    if (!serviceId || !service?.name) {
      return null;
    }

    return {
      id: String(serviceId),
      name: String(service.name),
      price: Number(service.price || service.unitPrice || 0),
      category: service.category || 'custom',
      description: service.description || ''
    };
  }

  /**
   * Load thông tin user hiện tại để lấy QR code từ profile
   */
  loadCurrentUser(): void {
    this.currentUser = this.authService.getCurrentUser();
    
    if (!this.currentUser) {
      this.authService.currentUser$.pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: (user) => {
          this.currentUser = user;
          if (!this.services.length || !this.servicesLoadedHotelId) {
            this.loadServicesFromAPI(true);
          }
        }
      });
    }
  }
  
  // Load dịch vụ từ API
  loadServicesFromAPI(forceReload: boolean = false): void {
    const hotelId = this.getResolvedHotelId();
    if (!hotelId) {
      this.services = [];
      this.servicesLoadedHotelId = null;
      this.cdr.markForCheck();
      return;
    }

    const cachedServices = RoomContentModalComponent.servicesCache.get(hotelId);
    if (cachedServices && !forceReload) {
      this.services = cachedServices;
      this.servicesLoadedHotelId = hotelId;
      this.cdr.markForCheck();
      return;
    }

    this.serviceService.getAvailableServicesForModal(hotelId).pipe(
      take(1),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        const mappedServices = (response?.data?.services || [])
          .map((service: any) => this.mapServiceOption(service))
          .filter((service: any) => !!service);

        if (mappedServices.length > 0) {
          this.services = mappedServices;
          this.servicesLoadedHotelId = hotelId;
          RoomContentModalComponent.servicesCache.set(hotelId, mappedServices);
          this.cdr.markForCheck();
          return;
        }

        this.loadServicesFallback(hotelId);
      },
      error: (error) => {
        console.error('Lỗi khi tải danh sách dịch vụ:', error);
        this.loadServicesFallback(hotelId);
      }
    });
  }

  private loadServicesFallback(hotelId: string): void {
    this.serviceService.getServices(hotelId).pipe(
      take(1),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (data) => {
        const mappedServices = (data || [])
          .map((service: any) => this.mapServiceOption(service))
          .filter((service: any) => !!service);

        this.services = mappedServices;
        this.servicesLoadedHotelId = hotelId;
        RoomContentModalComponent.servicesCache.set(hotelId, mappedServices);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.services = [];
        this.servicesLoadedHotelId = hotelId;
        this.cdr.markForCheck();
        console.error('Fallback cũng lỗi:', err);
      }
    });
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    if (typeof window !== 'undefined') {
      window.removeEventListener('sepayPaymentReceived', this.onSePayPaymentReceivedWindow);
    }

    if (this.sessionSubscription) {
      this.sessionSubscription.unsubscribe();
    }

    if (this.saveTotalPriceTimer) {
      clearTimeout(this.saveTotalPriceTimer);
    }

    if (this.roomReloadTimer) {
      clearTimeout(this.roomReloadTimer);
      this.roomReloadTimer = undefined;
    }
    
    // Dừng polling khi component bị hủy
    this.resetSePayTransactionState();
  }

  private reloadRoomDetails(forcePatchForm: boolean): void {
    if (!this.roomData?._id || this.roomReloadInFlight) {
      return;
    }

    this.roomReloadInFlight = true;
    this.roomsService.getRoomById(this.roomData._id, {
      limit: 100,
      excludeCheckedOut: true
    }).pipe(
      take(1),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (updatedRoom) => {
        this.applyLatestRoomData(updatedRoom, forcePatchForm);
        this.roomReloadInFlight = false;
      },
      error: (err) => {
        console.error('Error reloading room:', err);
        this.roomReloadInFlight = false;
      }
    });
  }

  private applyLatestRoomData(updatedRoom: any, forcePatchForm: boolean): void {
    if (!updatedRoom) {
      return;
    }

    this.roomData = updatedRoom;
    this.refreshComputedViewState();
    const latestHotelId = this.getResolvedHotelId();
    if (latestHotelId && latestHotelId !== this.servicesLoadedHotelId) {
      this.loadServicesFromAPI();
    }

    if (forcePatchForm || (!this.checkOutForm?.dirty && !this.checkInForm?.dirty)) {
      this.fetchCurrentRoom();
    }

    if (this.modalType === 'checkout') {
      this.calculateTotalPrice();
    }

    this.cdr.markForCheck();
  }

  trackByValue(index: number, item: { value: string }): string {
    return item.value;
  }

  trackByServiceId(index: number, item: any): string {
    return item?.id || item?._id || `service-${index}`;
  }

  trackBySelectedService(index: number, item: OrderedService): string {
    return item?.serviceId || item?.serviceName || `selected-service-${index}`;
  }
  
  // Cập nhật UI từ dữ liệu phiên
  private updateUIFromSession(session: RoomSession): void {
    this.initialCharges = session.additionalCharges || 0;
    this.initialDiscount = session.discount || 0;
    this.initialNotes = session.notes || '';
    this.initialSelectedServices = session.selectedServices ? [...session.selectedServices] : [];
    this.selectedServices = session.selectedServices ? [...session.selectedServices] : [];
    this.advancePayment = Number(session.advancePayment) || 0;
    this.initialAdvancePayment = this.advancePayment;

    // Đảm bảo guestInfo có name và guestSource
    const guestInfo = session.guestInfo || { name: 'Khách lẻ' };
    if (!guestInfo.name || guestInfo.name === 'Khách lẻ') {
      // Thử lấy từ roomData.currentBooking nếu có
      if (this.roomData?.currentBooking && typeof this.roomData.currentBooking === 'object') {
        const currentBooking = this.roomData.currentBooking;
        if (currentBooking.guestInfo?.name && currentBooking.guestInfo.name !== 'Khách lẻ') {
          guestInfo.name = currentBooking.guestInfo.name;
          guestInfo.phone = currentBooking.guestInfo.phone || guestInfo.phone;
          guestInfo.email = currentBooking.guestInfo.email || guestInfo.email;
          guestInfo.guestSource = currentBooking.guestInfo.guestSource || guestInfo.guestSource;
        }
      }
    }
    
    // Đảm bảo có guestSource, nếu không thì thử lấy từ roomData.events (chỉ lấy event chưa checkout)
    if (!guestInfo.guestSource && this.roomData?.events && this.roomData.events.length > 0) {
      const checkinEvents = this.getUncheckedOutCheckinEvents(this.roomData.events);
      if (checkinEvents.length > 0 && checkinEvents[0].guestInfo?.guestSource) {
        guestInfo.guestSource = checkinEvents[0].guestInfo.guestSource;
      }
    }
    
    // Đảm bảo có guestSource, mặc định là 'walkin'
    if (!guestInfo.guestSource) {
      guestInfo.guestSource = 'walkin';
    }

    // Patch trực tiếp vào nested form group để đảm bảo guestSource được patch đúng
    const checkInGuestInfoFormGroup = this.checkInForm.get('guestInfo') as FormGroup;
    if (checkInGuestInfoFormGroup) {
      // Patch từng field riêng
      checkInGuestInfoFormGroup.patchValue({
        name: guestInfo.name || 'Khách lẻ',
        idNumber: guestInfo.idNumber || '',
        tax_code: guestInfo.tax_code || '',
        phone: guestInfo.phone || '',
        email: guestInfo.email || '',
        address: guestInfo.address || ''
      }, { emitEvent: false });
      
      // Set guestSource riêng
      const guestSourceControl = checkInGuestInfoFormGroup.get('guestSource');
      if (guestSourceControl) {
        const guestSourceValue = guestInfo.guestSource || 'walkin';
        guestSourceControl.setValue(guestSourceValue, { emitEvent: true });
        console.log('CheckIn form guestSource from session set to:', guestSourceValue);
      }
      
      console.log('CheckIn form guestInfo from session:', checkInGuestInfoFormGroup.value);
    }
    
    this.checkInForm.patchValue({
        paymentMethod: this.normalizePaymentMethod(session.paymentMethod),
        rateType: session.rateType || 'hourly',
        advancePayment: this.advancePayment,
        advancePaymentMethod: session.advancePaymentMethod || 'cash', // Hình thức thanh toán cho trả trước
        additionalCharges: this.initialCharges,
        discount: this.initialDiscount,
        notes: this.initialNotes
    });
    this.checkInForm.get('guestInfo')?.disable();

    // Patch trực tiếp vào nested form group để đảm bảo guestSource được patch đúng
    const checkOutGuestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
    if (checkOutGuestInfoFormGroup) {
      // Patch từng field riêng
      checkOutGuestInfoFormGroup.patchValue({
        name: guestInfo.name || 'Khách lẻ',
        idNumber: guestInfo.idNumber || '',
        tax_code: guestInfo.tax_code || '',
        phone: guestInfo.phone || '',
        email: guestInfo.email || '',
        address: guestInfo.address || ''
      }, { emitEvent: false });
      
      // Set guestSource riêng
      const guestSourceControl = checkOutGuestInfoFormGroup.get('guestSource');
      if (guestSourceControl) {
        const guestSourceValue = guestInfo.guestSource || 'walkin';
        guestSourceControl.setValue(guestSourceValue, { emitEvent: true });
        console.log('CheckOut form guestSource from session set to:', guestSourceValue);
      }
      
      console.log('CheckOut form guestInfo from session:', checkOutGuestInfoFormGroup.value);
    }
    
    this.checkOutForm.patchValue({
        paymentMethod: this.normalizePaymentMethod(session.paymentMethod),
        rateType: session.rateType || 'hourly',
        advancePayment: session.advancePayment || 0,
        advancePaymentMethod: session.advancePaymentMethod || 'cash', // Hình thức thanh toán cho trả trước
        additionalCharges: this.initialCharges, // Patch additionalCharges từ session
        discount: this.initialDiscount // Patch discount từ session
    });

    this.listData = [{
      checkinTime: session.checkinTime,
      rateType: session.rateType,
      advancePayment: session.advancePayment,
      guestInfo: guestInfo,
      additionalCharges: this.initialCharges,
      discount: this.initialDiscount,
      notes: this.initialNotes,
      selectedServices: session.selectedServices || []
    }];
    
    this.advancePayment = session.advancePayment || 0;
    this.initialAdvancePayment = Number(this.advancePayment) || 0;
    this.calculateTotalPrice();
  }

  fetchCurrentRoom(): void {
    if (this.roomData && this.roomData.roomNumber) {
      if (this.roomData.events && this.roomData.events.length > 0) {
        // Lọc các event check-in CHƯA CHECKOUT (chưa có event checkout tương ứng)
        const checkinEvents = this.getUncheckedOutCheckinEvents(this.roomData.events);
          const lastCheckinEvent = checkinEvents.length > 0 ? checkinEvents[0] : null;
          const lastCheckinTime = lastCheckinEvent ? this.getEventCheckinTime(lastCheckinEvent) : null;
        
        console.log('Filtered unchecked out checkin events in fetchCurrentRoom:', {
          totalEvents: this.roomData.events.length,
          checkinEventsCount: checkinEvents.length,
          lastCheckinEvent: lastCheckinEvent ? {
            checkinTime: lastCheckinEvent.checkinTime,
            guestInfo: lastCheckinEvent.guestInfo
          } : null
        });
        
        // Nếu có event check-in và phòng đang có khách
        if (lastCheckinEvent && this.roomData.status === 'occupied') {
          console.log('Loading check-in event from backend:', lastCheckinEvent);
          
          // Lấy thông tin khách hàng từ nhiều nguồn
          let guestInfo = lastCheckinEvent.guestInfo || {};
          
          // Nếu guestInfo không có name hoặc name là "Khách lẻ", thử lấy từ các nguồn khác
          if (!guestInfo.name || guestInfo.name === 'Khách lẻ') {
            // Thử lấy từ roomData.currentBooking
            if (this.roomData.currentBooking && typeof this.roomData.currentBooking === 'object') {
              const currentBooking = this.roomData.currentBooking;
              if (currentBooking.guestInfo?.name && currentBooking.guestInfo.name !== 'Khách lẻ') {
                guestInfo = {
                  ...guestInfo,
                  name: currentBooking.guestInfo.name,
                  phone: currentBooking.guestInfo.phone || guestInfo.phone,
                  email: currentBooking.guestInfo.email || guestInfo.email
                };
              }
            }
            
            // Thử lấy từ booking nếu có
            if ((!guestInfo.name || guestInfo.name === 'Khách lẻ') && lastCheckinEvent.bookingId) {
              // Có thể cần fetch booking để lấy thông tin, nhưng tạm thời giữ nguyên
            }
          }
          
          // Đảm bảo có name, nếu không thì mặc định "Khách lẻ"
          if (!guestInfo.name) {
            guestInfo = { ...guestInfo, name: 'Khách lẻ' };
          }
          
          // Đảm bảo có guestSource, nếu không thì thử lấy từ các nguồn khác
          if (!guestInfo.guestSource) {
            // Thử lấy từ currentBooking
            if (this.roomData.currentBooking && typeof this.roomData.currentBooking === 'object') {
              const currentBooking = this.roomData.currentBooking;
              if (currentBooking.guestInfo?.guestSource) {
                guestInfo.guestSource = currentBooking.guestInfo.guestSource;
              }
            }
            // Nếu vẫn không có, mặc định là "walkin"
            if (!guestInfo.guestSource) {
              guestInfo.guestSource = 'walkin';
            }
          }
          
          // Đảm bảo các giá trị số từ event
          const eventAdvancePayment = Number(lastCheckinEvent.advancePayment) || 0;
          const eventAdditionalCharges = Number(lastCheckinEvent.additionalCharges) || 0;
          const eventDiscount = Number(lastCheckinEvent.discount) || 0;
          
          // Không lưu vào session nữa, chỉ lấy từ RoomEvent
          // Dữ liệu đã được lưu vào RoomEvent qua backend
          
          // Cập nhật listData với guestInfo đã được xử lý
          this.listData = [{
            checkinTime: lastCheckinTime,
            rateType: lastCheckinEvent.rateType || 'hourly',
            advancePayment: eventAdvancePayment, // Đảm bảo là số
            advancePaymentMethod: lastCheckinEvent.advancePaymentMethod || 'cash', // Hình thức thanh toán cho trả trước
            guestInfo: guestInfo, // Sử dụng guestInfo đã được xử lý từ nhiều nguồn
            additionalCharges: eventAdditionalCharges, // Đảm bảo là số
            discount: eventDiscount, // Đảm bảo là số
            notes: lastCheckinEvent.notes || '',
            selectedServices: lastCheckinEvent.selectedServices || []
          }];
          
          // Cập nhật lại các giá trị ban đầu từ event
          this.initialCharges = eventAdditionalCharges;
          this.initialDiscount = eventDiscount;
          this.initialNotes = lastCheckinEvent.notes || '';
          this.initialSelectedServices = lastCheckinEvent.selectedServices && Array.isArray(lastCheckinEvent.selectedServices) ?
                                          [...lastCheckinEvent.selectedServices] : [];
          this.selectedServices = this.initialSelectedServices;
          this.advancePayment = eventAdvancePayment;
          this.initialAdvancePayment = eventAdvancePayment;
          
          // Log để debug
          console.log('Loaded check-in data from backend:', {
            guestInfo: guestInfo,
            guestSource: guestInfo.guestSource, // Log riêng guestSource để debug
            advancePayment: eventAdvancePayment,
            additionalCharges: eventAdditionalCharges,
            discount: eventDiscount
          });

          // Cập nhật form checkin để hiển thị (có thể disable)
          // Patch trực tiếp vào nested form group để đảm bảo guestSource được patch đúng
          const guestInfoFormGroup = this.checkInForm.get('guestInfo') as FormGroup;
          if (guestInfoFormGroup) {
            // Enable form group trước khi patchValue
            if (guestInfoFormGroup.disabled) {
              guestInfoFormGroup.enable();
            }
            
            // Patch từng field riêng để đảm bảo guestSource được set đúng
            guestInfoFormGroup.patchValue({
              name: guestInfo.name || 'Khách lẻ',
              idNumber: guestInfo.idNumber || '',
              phone: guestInfo.phone || '',
              email: guestInfo.email || '',
              address: guestInfo.address || ''
            }, { emitEvent: false });
            
            // Set guestSource riêng để đảm bảo được set đúng
            const guestSourceControl = guestInfoFormGroup.get('guestSource');
            if (guestSourceControl) {
              const guestSourceValue = guestInfo.guestSource || 'walkin';
              guestSourceControl.setValue(guestSourceValue, { emitEvent: true });
              console.log('CheckIn form guestSource set to:', guestSourceValue);
            }
            
            console.log('CheckIn form guestInfo after patchValue:', guestInfoFormGroup.value);
            console.log('CheckIn form guestSource control value:', guestInfoFormGroup.get('guestSource')?.value);
          }
          
          if (!this.isFormInitialized) {
            this.checkInForm.patchValue({
                paymentMethod: this.normalizePaymentMethod(lastCheckinEvent.paymentMethod),
                rateType: lastCheckinEvent.rateType || 'hourly',
                advancePayment: this.advancePayment,
                additionalCharges: this.initialCharges,
                discount: this.initialDiscount,
                notes: this.initialNotes
            }, { emitEvent: false });
          }
          this.checkInForm.disable();

          // Cập nhật checkout form với thông tin khách và tiền đặt trước từ backend
          const checkoutGuestInfo = {
            name: guestInfo.name || 'Khách lẻ',
            idNumber: guestInfo.idNumber || '',
            phone: guestInfo.phone || '',
            email: guestInfo.email || '',
            address: guestInfo.address || '',
            guestSource: guestInfo.guestSource || 'walkin' // Đảm bảo có guestSource
          };
          console.log('Patching checkout form with guestInfo:', checkoutGuestInfo);
          
          // Patch trực tiếp vào nested form group để đảm bảo guestSource được patch đúng
          const checkoutGuestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
          if (checkoutGuestInfoFormGroup) {
            // Enable form group trước khi patchValue
            if (checkoutGuestInfoFormGroup.disabled) {
              checkoutGuestInfoFormGroup.enable();
            }
            
            // Patch từng field riêng để đảm bảo guestSource được set đúng
            checkoutGuestInfoFormGroup.patchValue({
              name: checkoutGuestInfo.name || 'Khách lẻ',
              idNumber: checkoutGuestInfo.idNumber || '',
              phone: checkoutGuestInfo.phone || '',
              email: checkoutGuestInfo.email || '',
              address: checkoutGuestInfo.address || ''
            }, { emitEvent: false });
            
            // Set guestSource riêng để đảm bảo được set đúng
            const guestSourceControl = checkoutGuestInfoFormGroup.get('guestSource');
            if (guestSourceControl) {
              const guestSourceValue = checkoutGuestInfo.guestSource || 'walkin';
              guestSourceControl.setValue(guestSourceValue, { emitEvent: true });
              console.log('Checkout form guestSource set to:', guestSourceValue);
            }
            
            console.log('Checkout form guestInfo after patchValue:', checkoutGuestInfoFormGroup.value);
            console.log('Checkout form guestSource control value:', checkoutGuestInfoFormGroup.get('guestSource')?.value);
          }
          
          if (!this.isFormInitialized) {
            this.checkOutForm.patchValue({ 
              paymentMethod: this.normalizePaymentMethod(lastCheckinEvent.paymentMethod || 'cash'),
              rateType: lastCheckinEvent.rateType || 'hourly', 
              advancePayment: eventAdvancePayment, 
              advancePaymentMethod: lastCheckinEvent.advancePaymentMethod || 'cash', 
              additionalCharges: 0, 
              discount: 0 
            }, { emitEvent: false }); // Thêm emitEvent: false
          }
          console.log('Checkout form full value after patchValue:', this.checkOutForm.value);
          
          this.advancePayment = eventAdvancePayment;
          this.initialAdvancePayment = eventAdvancePayment;

          // 3. ĐÁNH DẤU LÀ FORM ĐÃ KHỞI TẠO XONG (KHÔNG BAO GIỜ GHI ĐÈ NỮA)
          this.isFormInitialized = true;

          console.log('Updated form with backend data:', {
            guestInfo: guestInfo, // Log guestInfo đã được xử lý
            originalGuestInfo: lastCheckinEvent.guestInfo,
            advancePayment: lastCheckinEvent.advancePayment
          });
          
          this.calculateTotalPrice();
        } else {
          // Nếu không tìm thấy event check-in phù hợp, chỉ hiển thị event cuối cùng
          // Nhưng không tính giá nếu không phải checkin event
          const lastEvent = this.roomData.events[this.roomData.events.length - 1];
          if (lastEvent) {
            this.listData = [lastEvent];
            // Chỉ tính giá nếu là checkout modal và có checkin event
            if (this.modalType === 'checkout' && lastEvent.type === 'checkin') {
              this.calculateTotalPrice();
            }
          }
        }
        } else {
        // Nếu không có events, hiển thị thông báo
        if (this.modalType === 'checkout') {
          console.warn('No check-in events found in RoomEvent');
          this.message.warning('Không tìm thấy thông tin check-in từ RoomEvent');
        }
      }
    }

    // Nhận phòng: ưu tiên rateType + tiền đặt trước từ booking (nếu có), không ép hourly
    if (this.modalType === 'checkin' && this.roomData?.status !== 'occupied') {
      const booking: any =
        this.roomData.currentBooking && typeof this.roomData.currentBooking === 'object'
          ? this.roomData.currentBooking
          : null;
      const bookingRateType = booking?.rateType || booking?.bookingType || null;
      const bookingAdvance =
        Number(booking?.deposit ?? booking?.advancePayment ?? 0) || 0;
      const bookingAdvanceMethod = booking?.advancePaymentMethod || booking?.paymentMethod || 'cash';

      if (booking) {
        this.initialAdvancePayment = bookingAdvance;
        this.advancePayment = bookingAdvance;
        this.checkInForm?.patchValue(
          {
            rateType: bookingRateType || this.checkInForm.get('rateType')?.value || 'hourly',
            advancePayment: bookingAdvance,
            advancePaymentMethod: this.normalizePaymentMethod(bookingAdvanceMethod)
          },
          { emitEvent: false }
        );
      } else if (!this.checkInForm?.get('rateType')?.value) {
        this.checkInForm?.patchValue({ rateType: 'hourly' }, { emitEvent: false });
      }
    }

  }

  // Tải thông tin doanh nghiệp
  loadBusinessInfo(): void {
    if (!this.roomData?.hotelId) return;
    this.hotelService.getHotelById(this.roomData.hotelId, { lite: true }).subscribe(
      (data) => {
        this.businessInfo = data;
        // Lưu thông tin ngân hàng của hotel
        this.hotelBankAccount = data.bankAccount || null;
        
        
        // Nếu hotel không có bankAccount, thử lấy từ manager
        if (!this.hotelBankAccount?.qrPaymentUrl && data.managerId) {
          const manager = typeof data.managerId === 'object' ? data.managerId : null;
          if (manager?.bankAccount?.qrPaymentUrl) {
            // Sử dụng QR code từ manager nếu hotel không có
            this.hotelBankAccount = manager.bankAccount;
          }
        }
        
        // Load thông tin business owner nếu có businessId
        if (data.businessId) {
          // Đảm bảo businessId là string
          const businessId = typeof data.businessId === 'string' ? data.businessId : (data.businessId._id || data.businessId.toString());
          const canLoadBusiness = this.authService.isAdmin() || this.authService.isBusiness();
          if (!canLoadBusiness) {
            if (typeof data.businessId === 'object') {
              this.businessInfo = data.businessId;
            }
            return;
          }
          if (businessId) {
            this.businessService.getBusinessById(businessId).subscribe({
              next: (business: any) => {
                // Lấy thông tin owner từ business (ownerId có thể đã được populate)
                if (business.ownerId) {
                  if (typeof business.ownerId === 'object' && business.ownerId._id) {
                    // Đã được populate, lấy trực tiếp
                    this.businessOwner = business.ownerId;
                    console.log('Thông tin business owner (populated):', this.businessOwner);
                  } else {
                    // Chưa được populate, lưu ownerId để dùng sau
                    this.businessOwner = { _id: business.ownerId };
                    console.log('Lưu ownerId để dùng sau:', this.businessOwner);
                  }
                }
              },
              error: (err) => {
                console.error('Lỗi khi tải thông tin business:', err);
              }
            });
          }
        }
      },
      (error) => {
        console.error('Lỗi khi tải thông tin doanh nghiệp:', error);
        // Xử lý lỗi nếu cần, ví dụ hiển thị thông tin mặc định hoặc thông báo
        this.businessInfo = { name: 'Khách sạn Mặc định', address: '', phoneNumber: '' }; // Ví dụ
        this.hotelBankAccount = null;
      }
    );
  }

  changeServiceQuantity(delta: number): void {
    const quantityControl = this.servicesForm?.get('quantity');
    if (!quantityControl) return;
    const currentValue = Number(quantityControl.value) || 1;
    const nextValue = Math.max(1, currentValue + delta);
    quantityControl.setValue(nextValue);
  }

  // Thêm dịch vụ (hỗ trợ chọn nhiều)
  addService(): void {
    if (this.servicesForm.invalid) {
      Object.values(this.servicesForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity();
        }
      });
      return;
    }

    const rawIds = this.servicesForm.get('serviceIds')?.value;
    const serviceIds: string[] = Array.isArray(rawIds)
      ? rawIds.map((id: any) => String(id || '').trim()).filter(Boolean)
      : (rawIds ? [String(rawIds).trim()] : []);
    const quantity = Number(this.servicesForm.get('quantity')?.value) || 1;

    if (!serviceIds.length) {
      this.message.warning('Vui lòng chọn dịch vụ!');
      return;
    }

    let addedCount = 0;
    let updatedCount = 0;

    for (const serviceId of serviceIds) {
      const selectedService = this.services.find(service => service.id === serviceId);
      if (!selectedService) {
        continue;
      }

      const existingIndex = this.selectedServices.findIndex(s => s.serviceId === serviceId);
      if (existingIndex !== -1) {
        this.selectedServices[existingIndex].quantity += quantity;
        this.selectedServices[existingIndex].totalPrice =
          this.selectedServices[existingIndex].price * this.selectedServices[existingIndex].quantity;
        updatedCount += 1;
      } else {
        const orderedService: OrderedService = {
          serviceId: selectedService.id,
          serviceName: selectedService.name,
          price: selectedService.price,
          quantity: quantity,
          totalPrice: selectedService.price * quantity,
          orderTime: new Date()
        };
        this.selectedServices.push(orderedService);
        addedCount += 1;
      }
    }

    if (!addedCount && !updatedCount) {
      this.message.error(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.SERVICE_NOT_FOUND'));
      return;
    }

    if (addedCount && updatedCount) {
      this.message.success(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.SERVICES_ADDED_AND_UPDATED', { addedCount, updatedCount }));
    } else if (updatedCount) {
      this.message.success(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.SERVICES_UPDATED', { updatedCount }));
    } else {
      this.message.success(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.SERVICES_ADDED', { addedCount }));
    }

    // Cập nhật vào RoomEvent nếu phòng đang occupied và có event checkin
    if (this.roomData._id && this.roomData.status === 'occupied') {
      // Lấy thông tin từ form checkout nếu có
      const guestInfoFormGroup = this.checkOutForm?.get('guestInfo') as FormGroup;
      const guestInfo = guestInfoFormGroup ? 
        (guestInfoFormGroup.disabled ? guestInfoFormGroup.getRawValue() : guestInfoFormGroup.value) : 
        (this.checkOutForm?.get('guestInfo')?.value || {});
      
      // Lấy các giá trị từ form hoặc từ event hiện tại
      const advancePayment = Number(this.checkOutForm?.get('advancePayment')?.value) || 
                             (this.listData && this.listData.length > 0 ? this.listData[0].advancePayment : 0) || 0;
      const rateType = this.checkOutForm?.get('rateType')?.value || 
                      (this.listData && this.listData.length > 0 ? this.listData[0].rateType : null) || 
                      'hourly';
      // Lấy giá trị phụ thu và khuyến mãi từ form checkout (chỉ giá trị người dùng nhập thêm)
      // Form checkout bắt đầu từ 0, không bao gồm giá trị từ check-in event
      const checkoutCharges = Number(this.checkOutForm?.get('additionalCharges')?.value) || 0;
      const checkoutDiscount = Number(this.checkOutForm?.get('discount')?.value) || 0;
      
      // Tính tổng phụ thu và khuyến mãi (cộng dồn, không ghi đè)
      // initialCharges và initialDiscount đã được set khi load dữ liệu từ check-in event
      const additionalCharges = this.initialCharges + checkoutCharges;
      const discount = this.initialDiscount + checkoutDiscount;
      
      // Đảm bảo guestInfo đầy đủ
      const updatedGuestInfo = {
        name: guestInfo.name || 'Khách lẻ',
        idNumber: guestInfo.idNumber || '',
        tax_code: guestInfo.tax_code || '',
        phone: guestInfo.phone || '',
        email: guestInfo.email || '',
        address: guestInfo.address || '',
        guestSource: guestInfo.guestSource || 'walkin'
      };
      
      // Cập nhật RoomEvent với selectedServices mới
      this.roomsService.updateRoomCheckinInfo(
        this.roomData._id,
        updatedGuestInfo,
        advancePayment,
        rateType,
        additionalCharges,
        discount,
        this.selectedServices // Gửi selectedServices đã được cập nhật
      ).subscribe({
        next: (response) => {
          console.log('Dịch vụ đã được cập nhật vào RoomEvent', response);
          
          // Cập nhật listData để đồng bộ
          if (this.listData && this.listData.length > 0) {
            this.listData[0].selectedServices = [...this.selectedServices];
          }
        },
        error: (error) => {
          console.error('Lỗi khi cập nhật dịch vụ vào RoomEvent:', error);
          // Không hiển thị error message để không làm phiền user khi thêm dịch vụ
        }
      });
    }
    
    // Reset form
    this.servicesForm.reset({
      serviceIds: [],
      quantity: 1
    });
    
    // Cập nhật tổng giá
    this.calculateTotalPrice();
  }

  // Xóa dịch vụ
  removeService(index: number): void {
    if (index < 0 || index >= this.selectedServices.length) {
      console.error('Invalid service index:', index);
      return;
    }
    
    // Xóa dịch vụ khỏi danh sách
    const removedService = this.selectedServices[index];
    this.selectedServices.splice(index, 1);
    
    console.log('Removed service:', removedService);
    
    // Cập nhật vào RoomEvent nếu phòng đang occupied và có event checkin
    if (this.roomData._id && this.roomData.status === 'occupied') {
      // Lấy thông tin từ form checkout nếu có
      const guestInfoFormGroup = this.checkOutForm?.get('guestInfo') as FormGroup;
      const guestInfo = guestInfoFormGroup ? 
        (guestInfoFormGroup.disabled ? guestInfoFormGroup.getRawValue() : guestInfoFormGroup.value) : 
        (this.checkOutForm?.get('guestInfo')?.value || {});
      
      // Lấy các giá trị từ form hoặc từ event hiện tại
      const advancePayment = Number(this.checkOutForm?.get('advancePayment')?.value) || 
                             (this.listData && this.listData.length > 0 ? this.listData[0].advancePayment : 0) || 0;
      const rateType = this.checkOutForm?.get('rateType')?.value || 
                      (this.listData && this.listData.length > 0 ? this.listData[0].rateType : null) || 
                      'hourly';
      // Lấy giá trị phụ thu và khuyến mãi từ form checkout (chỉ giá trị người dùng nhập thêm)
      // Form checkout bắt đầu từ 0, không bao gồm giá trị từ check-in event
      const checkoutCharges = Number(this.checkOutForm?.get('additionalCharges')?.value) || 0;
      const checkoutDiscount = Number(this.checkOutForm?.get('discount')?.value) || 0;
      
      // Tính tổng phụ thu và khuyến mãi (cộng dồn, không ghi đè)
      // initialCharges và initialDiscount đã được set khi load dữ liệu từ check-in event
      const additionalCharges = this.initialCharges + checkoutCharges;
      const discount = this.initialDiscount + checkoutDiscount;
      
      // Đảm bảo guestInfo đầy đủ
      const updatedGuestInfo = {
        name: guestInfo.name || 'Khách lẻ',
        idNumber: guestInfo.idNumber || '',
        tax_code: guestInfo.tax_code || '',
        phone: guestInfo.phone || '',
        email: guestInfo.email || '',
        address: guestInfo.address || '',
        guestSource: guestInfo.guestSource || 'walkin'
      };
      
      // Cập nhật RoomEvent với selectedServices mới
      this.roomsService.updateRoomCheckinInfo(
        this.roomData._id,
        updatedGuestInfo,
        advancePayment,
        rateType,
        additionalCharges,
        discount,
        this.selectedServices // Gửi selectedServices đã được cập nhật
      ).subscribe({
        next: (response) => {
          console.log('Dịch vụ đã được cập nhật vào RoomEvent', response);
          this.message.success(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.SERVICE_DELETED'));
          
          // Cập nhật listData để đồng bộ
          if (this.listData && this.listData.length > 0) {
            this.listData[0].selectedServices = [...this.selectedServices];
          }
        },
        error: (error) => {
          console.error('Lỗi khi cập nhật dịch vụ vào RoomEvent:', error);
          this.message.error(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.SERVICE_UPDATE_ERROR', { message: error.error?.message || error.message }));
        }
      });
    }
    
    // Cập nhật tổng tiền
    this.calculateTotalPrice();
  }

  private buildCheckoutQuoteRequest(checkInOverride?: Date): {
    roomId: string;
    rateType: string;
    checkInTime: string;
    checkOutTime: string;
    services: OrderedService[];
    additionalCharges: number;
    discount: number;
  } | null {
    if (!this.roomData?._id) return null;
    const lastCheckIn = this.listData && this.listData.length > 0 ? this.listData[0] : null;
    const parsedCheckin = checkInOverride || this.getEventCheckinTime(lastCheckIn);
    if (!parsedCheckin) return null;
    const checkOut = new Date();
    let checkIn = parsedCheckin;
    if (checkIn.getTime() >= checkOut.getTime()) {
      checkIn = new Date(checkOut.getTime() - 3600000);
    }
    const rateType = this.checkOutForm?.get('rateType')?.value || lastCheckIn?.rateType || 'hourly';
    const checkOutIso = toRealInstantIso(checkOut);
    this.quotedCheckOutIso = checkOutIso;
    return {
      roomId: this.roomData._id,
      rateType,
      checkInTime: toRealInstantIso(checkIn),
      checkOutTime: checkOutIso,
      services: this.selectedServices || [],
      // Phụ thu / khuyến mãi are applied on the client so they are not baked into the room charge.
      additionalCharges: 0,
      discount: 0
    };
  }

  /**
   * Ask the server for the stay quote. Room charge and priceDetails replace any local math.
   */
  refreshCheckoutQuote(checkInOverride?: Date): Observable<CheckoutQuote> {
    const request = this.buildCheckoutQuoteRequest(checkInOverride);
    if (!request) {
      return throwError(() => new Error('missing-checkout-quote-input'));
    }
    const seq = ++this.quoteRequestSeq;
    this.quoteLoading = true;
    this.quoteError = false;
    this.cdr.markForCheck();
    return this.roomsService.calculateCheckoutTotal(request).pipe(
      tap((quote) => {
        if (seq !== this.quoteRequestSeq) return;
        this.checkoutQuote = quote;
        const details = priceDetailsFromQuote(quote);
        this.roomPriceDetails = details;
        this._roomPriceTotal = roomChargeFromQuote(quote);
        this._hasRoomPriceFromAPI = true;
        this.quoteLoading = false;
        this.quoteError = false;
        this.calculateTotalPrice();
        this.cdr.markForCheck();
      }),
      catchError((error) => {
        if (seq === this.quoteRequestSeq) {
          this.quoteLoading = false;
          this.quoteError = true;
          this._hasRoomPriceFromAPI = false;
          this._roomPriceTotal = 0;
          this.roomPriceDetails = null;
          this.checkoutQuote = null;
          this.cdr.markForCheck();
        }
        return throwError(() => error);
      })
    );
  }

  // Tính tổng tiền từ quote server + phụ thu/khuyến mãi nhập tay
  calculateTotalPrice(): void {
    // Chỉ tính giá khi modalType là 'checkout' và có checkin event hợp lệ
    if (this.modalType !== 'checkout') {
      this.totalPrice = 0;
      this._hasRoomPriceFromAPI = false; // Reset flag khi không phải checkout
      return;
    }
    
    // Lấy thông tin check-in cuối cùng
    const lastCheckIn = this.listData && this.listData.length > 0 ? this.listData[0] : null;
    if (!lastCheckIn) {
      this.totalPrice = 0;
      return;
    }
    
    // Kiểm tra xem có phải là checkin event không
    if (lastCheckIn.type && lastCheckIn.type !== 'checkin') {
      // Nếu không phải checkin event, không tính giá
      this.totalPrice = 0;
      return;
    }
    
    if (!this._hasRoomPriceFromAPI && !this.quoteLoading) {
      this.refreshCheckoutQuote().subscribe({
        error: () => this.message.error(this.translate.instant('ROOM_CONTENT_MODAL.QUOTE_ERROR'))
      });
    }

    const roomPrice = this._hasRoomPriceFromAPI ? this._roomPriceTotal : 0;

    const serviceTotal = this.selectedServices.reduce((total, service) => {
      const serviceAmount = service.totalPrice !== undefined ? 
        service.totalPrice : (service.price * (service.quantity || 1));
      return total + serviceAmount;
    }, 0);
    this._servicesPriceTotal = serviceTotal;
    console.log(`Service total: ${serviceTotal}`);

    const checkoutCharges = +(this.checkOutForm?.get('additionalCharges')?.value || 0);
    const checkoutDiscount = +(this.checkOutForm?.get('discount')?.value || 0);

    const totalAdditionalCharges = this.initialCharges + checkoutCharges;
    const totalDiscount = this.initialDiscount + checkoutDiscount;

    const lastCheckInEvent = this.listData && this.listData.length > 0 ? this.listData[0] : null;
    const formAdvancePayment = this.checkOutForm?.get('advancePayment')?.value;
    const normalizedFormAdvancePayment = Number(formAdvancePayment);
    this.advancePayment = !isNaN(normalizedFormAdvancePayment)
      ? normalizedFormAdvancePayment
      : (lastCheckInEvent?.advancePayment || 0);

    const adjusted = applyManualAdjustments(
      roomPrice,
      serviceTotal,
      totalAdditionalCharges,
      totalDiscount,
      this.advancePayment
    );
    this.totalPrice = adjusted.totalPrice;
    this.remainingAmount = adjusted.remainingAmount;

    if (this.roomData && this.roomData._id) {
      this.roomData.totalPrice = this.totalPrice;
      const hotelId = this.roomData.hotelId || this.authService.getHotelId();
      if (hotelId) {
        if (this.saveTotalPriceTimer) {
          clearTimeout(this.saveTotalPriceTimer);
        }
        this.saveTotalPriceTimer = setTimeout(() => {
          this.apiService.saveRoomTotalPrice(hotelId, this.roomData._id, this.totalPrice).subscribe({
            next: () => console.log('[Redis] Room total price saved'),
            error: (err) => console.error('[Redis] Error saving room total price:', err)
          });
        }, 300);
      }

      const hotelIdForSession = this.normalizeObjectId(hotelId || this.currentUser?.hotelId);
      if (hotelIdForSession) {
        const roomId = this.roomData._id;
        const existingSession = this.roomSessionService.getSession(roomId);
        if (existingSession) {
          this.roomSessionService.updateSession(roomId, {
            totalPrice: this.totalPrice,
            additionalCharges: totalAdditionalCharges,
            discount: totalDiscount,
            advancePayment: this.advancePayment,
            rateType: (this.checkOutForm?.get('rateType')?.value || lastCheckInEvent?.rateType || existingSession.rateType || 'hourly'),
            selectedServices: this.selectedServices || []
          });
        } else {
          const sessionData: RoomSession = {
            roomId: roomId,
            roomNumber: this.roomData.roomNumber,
            roomType: String((this.roomData.roomType as any)?.name || this.roomData.roomType || ''),
            hotelId: hotelIdForSession,
            checkinTime: lastCheckInEvent?.checkinTime ? new Date(lastCheckInEvent.checkinTime) : new Date(),
            guestInfo: lastCheckInEvent?.guestInfo,
            paymentMethod: lastCheckInEvent?.paymentMethod,
            rateType: (this.checkOutForm?.get('rateType')?.value || lastCheckInEvent?.rateType || 'hourly'),
            advancePayment: this.advancePayment,
            advancePaymentMethod: lastCheckInEvent?.advancePaymentMethod,
            additionalCharges: totalAdditionalCharges,
            discount: totalDiscount,
            notes: lastCheckInEvent?.notes,
            totalPrice: this.totalPrice,
            selectedServices: this.selectedServices || []
          };
          this.roomSessionService.startSession(roomId, sessionData);
        }
      }
    }

    // Prefetch mã CK nếu đang chọn chuyển khoản (không chặn UI)
    if (
      this.modalType === 'checkout' &&
      this.normalizePaymentMethod(this.checkOutForm?.get('paymentMethod')?.value) === 'transfer' &&
      this.remainingAmount > 0
    ) {
      this.prefetchSePayPaymentCode();
    }
  }

  // Xử lý check-in
  processCheckIn(): void {
    // Kiểm tra trạng thái phòng
    const allowPrebooked = this.isPrebookedAvailable();
    if (this.roomData.status !== 'vacant' && !allowPrebooked) {
      this.message.error(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.ROOM_NOT_READY_CHECKIN', {
        roomNumber: this.roomData.roomNumber,
        status: this.getStatusLabel(this.roomData.status)
      }));
      this.isLoading = false;
      return;
    }

    // Nếu skipValidation = true, bỏ qua việc kiểm tra form hợp lệ
    if (!this.skipValidation && this.checkInForm.invalid) {
      Object.values(this.checkInForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity();
        }
      });
      return;
    }
    
    this.isLoading = true;
    
    // Tạo thời gian checkin một lần duy nhất theo UTC+7 (múi giờ Việt Nam)
    const checkinTime = this.getUTCTimePlus7();
    
    // Lấy giá trị trực tiếp từ form control để đảm bảo lấy đúng
    const guestInfoFormGroup = this.checkInForm.get('guestInfo') as FormGroup;
    
    // Lấy giá trị từ form control, sử dụng getRawValue() nếu form bị disable
    const guestInfoForm = guestInfoFormGroup ? 
      (guestInfoFormGroup.disabled ? guestInfoFormGroup.getRawValue() : guestInfoFormGroup.value) : 
      (this.checkInForm.get('guestInfo')?.value || {});
    
    // Lấy guestSource trực tiếp từ form control để đảm bảo lấy đúng
    const guestSourceControl = guestInfoFormGroup?.get('guestSource');
    const guestSourceValue = guestSourceControl ? 
      (guestSourceControl.disabled ? guestSourceControl.getRawValue() : guestSourceControl.value) : 
      (guestInfoForm.guestSource || 'walkin');
    
    // Đảm bảo tên khách mặc định là "Khách lẻ" nếu không nhập
    const guestInfo = {
      name: guestInfoForm.name || 'Khách lẻ',
      idNumber: guestInfoForm.idNumber || '',
      tax_code: guestInfoForm.tax_code || '',
      phone: guestInfoForm.phone || '',
      email: guestInfoForm.email || '',
      address: guestInfoForm.address || '',
      guestSource: guestSourceValue || 'walkin' // Sử dụng giá trị từ form control
    };
    
    
    // Đảm bảo advancePayment luôn là số, mặc định 0
    const advancePayment = Number(this.checkInForm.get('advancePayment')?.value) || 0;
    const advancePaymentMethod = this.checkInForm.get('advancePaymentMethod')?.value || 'cash';
    const additionalCharges = Number(this.checkInForm.get('additionalCharges')?.value) || 0;
    const discount = Number(this.checkInForm.get('discount')?.value) || 0;
    
    const checkinInstant = toRealInstantIso(checkinTime);
    const checkinEventData = {
        type: 'checkin',
        checkinTime: checkinInstant,
        checkInTime: checkinInstant,
        checkInDate: checkinInstant,
        guestInfo: guestInfo,
        guestName: guestInfo.name,
        guestPhone: guestInfo.phone,
        guestId: guestInfo.idNumber,
        guestEmail: guestInfo.email,
        guestAddress: guestInfo.address,
        paymentMethod: this.normalizePaymentMethod(this.checkInForm.get('paymentMethod')?.value || 'cash'),
        rateType: this.checkInForm.get('rateType')?.value || 'hourly',
        advancePayment: advancePayment, // Đảm bảo là số
        advancePaymentMethod: advancePaymentMethod, // Hình thức thanh toán cho trả trước
        additionalCharges: additionalCharges, // Đảm bảo là số
        discount: discount, // Đảm bảo là số
        notes: this.checkInForm.get('notes')?.value || '',
        selectedServices: this.selectedServices || []
      };

    const newRoom = {
      status: 'occupied',
      events: [
        checkinEventData
      ]
    };
    
    // Đóng modal ngay lập tức
    if (this.modalRef) {
      this.modalRef.close({ 
        success: true,
        checkinInfo: {
          checkinTime: checkinTime, // Sử dụng cùng thời gian
          guestInfo: this.checkInForm.get('guestInfo')?.value,
            paymentMethod: this.normalizePaymentMethod(this.checkInForm.get('paymentMethod')?.value),
          rateType: this.checkInForm.get('rateType')?.value,
          advancePayment: this.checkInForm.get('advancePayment')?.value,
          notes: this.checkInForm.get('notes')?.value,
          selectedServices: this.selectedServices
        }
      });
    }
    
    // Thực hiện checkin trong background
    this.roomsService.checkInRoom(this.roomData._id, newRoom)
      .subscribe(
        (room) => {
          setTimeout(() => {
            this.message.success(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.CHECKIN_SUCCESS'));
            
            // Tạo phiếu thu cho tiền đặt trước nếu có
            // Nếu nhận từ booking đã có đặt trước → chỉ tạo phần chênh lệch (tránh trùng phiếu thu booking_advance)
            try {
              const hotelId = this.normalizeObjectId(
                this.roomData.hotelId || this.authService.getHotelId() || this.currentUser?.hotelId
              );
              const payerName = guestInfo?.name || 'Khách lẻ';
              const booking: any =
                this.roomData.currentBooking && typeof this.roomData.currentBooking === 'object'
                  ? this.roomData.currentBooking
                  : null;
              const alreadyBookedAdvance =
                Number(booking?.deposit ?? booking?.advancePayment ?? this.initialAdvancePayment) || 0;
              const advanceDiff = Number(advancePayment || 0) - alreadyBookedAdvance;
              if (hotelId && advanceDiff > 0) {
                const methodForTransaction = this.mapToTransactionMethod(advancePaymentMethod);
                this.transactionService.createIncome({
                  hotelId,
                  amount: advanceDiff,
                  method: methodForTransaction,
                  incomeCategory: 'deposit',
                  description: `[Đặt trước] Phòng ${this.roomData.roomNumber}`,
                  notes: `Đặt trước lúc nhận phòng ${this.roomData.roomNumber} - ${payerName}`,
                  payer: payerName,
                  metadata: {
                    source: 'checkin_advance',
                    roomId: String(this.roomData._id),
                    roomNumber: String(this.roomData.roomNumber || ''),
                    payer: payerName,
                    previousAdvancePayment: alreadyBookedAdvance,
                    newAdvancePayment: Number(advancePayment) || 0
                  }
                }).subscribe({
                  next: () => console.log('Đã tạo phiếu thu đặt trước cho phòng', this.roomData.roomNumber, 'amount:', advanceDiff, 'method:', methodForTransaction),
                  error: (err) => console.error('Lỗi tạo phiếu thu đặt trước:', err)
                });
              }
            } catch (e) {
              console.error('Lỗi khi tạo phiếu thu đặt trước:', e);
            }
            
            // Log để debug - dữ liệu đã được lưu vào RoomEvent qua backend
            console.log('Check-in data saved to RoomEvent:', {
              guestInfo: checkinEventData.guestInfo,
              guestSource: checkinEventData.guestInfo?.guestSource, // Log riêng guestSource
              advancePayment: advancePayment,
              additionalCharges: additionalCharges,
              discount: discount
            });

            const hotelIdForSession = this.normalizeObjectId(this.roomData.hotelId || this.authService.getHotelId() || this.currentUser?.hotelId);
            if (hotelIdForSession) {
              const sessionData: RoomSession = {
                roomId: this.roomData._id,
                roomNumber: this.roomData.roomNumber,
                roomType: String((this.roomData.roomType as any)?.name || this.roomData.roomType || ''),
                hotelId: hotelIdForSession,
                checkinTime: checkinTime,
                guestInfo: checkinEventData.guestInfo,
                paymentMethod: checkinEventData.paymentMethod,
                rateType: checkinEventData.rateType,
                advancePayment: advancePayment,
                advancePaymentMethod: advancePaymentMethod,
                additionalCharges: additionalCharges,
                discount: discount,
                notes: checkinEventData.notes,
                selectedServices: this.selectedServices || []
              };
              this.roomSessionService.startSession(this.roomData._id, sessionData);
            }
            
            // Tự động bật công tắc điện khi check-in
            this.tuyaService.autoTurnOnOnCheckIn(this.roomData._id).subscribe({
              next: (response) => {
                if (response.data && response.data.devicesControlled > 0) {
                  console.log(`Đã tự động bật ${response.data.devicesControlled} công tắc điện`);
                }
              },
              error: (error) => {
                console.error('Lỗi khi tự động bật công tắc:', error);
                // Không hiển thị lỗi để không làm phiền user
              }
            });
            
            // Notify để reload data - dữ liệu sẽ được lấy từ RoomEvent khi reload
            this.emitRoomDataUpdated('checkin', {
              roomId: this.roomData?._id,
              delayMs: 0,
              refreshRooms: false,
              refreshHistory: false
            });
          }, 0);
        },
        (error) => {
          setTimeout(() => {
            this.message.error(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.CHECKIN_ERROR', { message: error.message }));
            this.emitRoomDataUpdated('checkin', {
              roomId: this.roomData?._id,
              delayMs: 0,
              refreshRooms: true,
              refreshHistory: false,
              force: true
            });
          }, 0);
        }
      );
  }

  private isPrebookedAvailable(): boolean {
    if (!this.roomData) return false;
    if (this.roomData.status !== 'booked') return false;

    const booking: any = this.roomData.currentBooking;
    const rawCheckin = booking?.checkInDate;
    if (rawCheckin) {
      const d = new Date(rawCheckin);
      if (!isNaN(d.getTime())) {
        return d.getTime() > Date.now();
      }
    }

    const events: any[] = Array.isArray(this.roomData?.events) ? this.roomData.events : [];
    const bookingEvent = events.find(e => e && e.type === 'booking');
    const raw = bookingEvent?.checkinTime || bookingEvent?.checkInTime || bookingEvent?.checkInDate || bookingEvent?.checkinDate;
    if (raw) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        return d.getTime() > Date.now();
      }
    }

    return false;
  }

  // Xử lý checkout
  processCheckOut(): void {
    // Kiểm tra trạng thái phòng
    if (this.roomData.status !== 'occupied') {
      this.message.error(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.ROOM_NOT_OCCUPIED_CHECKOUT', {
        roomNumber: this.roomData.roomNumber,
        status: this.getStatusLabel(this.roomData.status)
      }));
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    const currentTime = this.getUTCTimePlus7();
    
    // Lấy dữ liệu từ RoomEvent (lastCheckinEvent) thay vì session
    let checkInTime = this.getUTCTimePlus7();
    let lastCheckinEvent = null;
    
    // Tìm event check-in cuối cùng CHƯA CHECKOUT từ roomData.events
    if (this.roomData.events && this.roomData.events.length > 0) {
      const checkinEvents = this.getUncheckedOutCheckinEvents(this.roomData.events);
      
      if (checkinEvents.length > 0) {
        lastCheckinEvent = checkinEvents[0];
        checkInTime = this.getEventCheckinTime(lastCheckinEvent) || this.getUTCTimePlus7();
      }
    }
    
    // Nếu không tìm thấy event check-in, thử reload lại room data từ backend
    if (!lastCheckinEvent) {
      console.warn('No unchecked out checkin event found, attempting to reload room data');
      
      // Thử reload room data từ backend với excludeCheckedOut = true
      if (this.roomData && this.roomData._id) {
        this.roomsService.getRoomById(this.roomData._id, { excludeCheckedOut: true }).subscribe({
          next: (reloadedRoom) => {
            if (reloadedRoom.events && reloadedRoom.events.length > 0) {
              const reloadedCheckinEvents = this.getUncheckedOutCheckinEvents(reloadedRoom.events);
              if (reloadedCheckinEvents.length > 0) {
                // Cập nhật roomData với dữ liệu mới
                this.roomData = reloadedRoom;
                lastCheckinEvent = reloadedCheckinEvents[0];
                checkInTime = this.getEventCheckinTime(lastCheckinEvent) || this.getUTCTimePlus7();
                // Tiếp tục xử lý checkout với event mới
                this.processCheckOutWithEvent(lastCheckinEvent, checkInTime);
                return;
              }
            }
            // Nếu vẫn không tìm thấy, hiển thị warning và cho phép checkout với thông tin mặc định
            this.message.warning('Không tìm thấy thông tin check-in từ RoomEvent. Sử dụng thông tin mặc định.');
            this.processCheckOutWithDefaultData();
          },
          error: (err) => {
            console.error('Error reloading room data:', err);
            this.message.warning('Không tìm thấy thông tin check-in từ RoomEvent. Sử dụng thông tin mặc định.');
            this.processCheckOutWithDefaultData();
          }
        });
      } else {
        this.message.warning('Không tìm thấy thông tin check-in từ RoomEvent. Sử dụng thông tin mặc định.');
        this.processCheckOutWithDefaultData();
      }
      this.isLoading = false;
      return;
    }
    
    // Tiếp tục xử lý checkout với event tìm được
    this.processCheckOutWithEvent(lastCheckinEvent, checkInTime);
  }
  
  // Xử lý checkout với event check-in đã tìm được
  private processCheckOutWithEvent(lastCheckinEvent: any, checkInTime: Date): void {
    if (!this.checkoutQuoteReady) {
      this.refreshCheckoutQuote(checkInTime).subscribe({
        next: () => {
          this.checkoutQuoteReady = true;
          try {
            this.processCheckOutWithEvent(lastCheckinEvent, checkInTime);
          } finally {
            this.checkoutQuoteReady = false;
          }
        },
        error: () => {
          this.isLoading = false;
          this.checkoutQuoteReady = false;
          this.message.error(this.translate.instant('ROOM_CONTENT_MODAL.QUOTE_ERROR'));
          this.cdr.markForCheck();
        }
      });
      return;
    }

    const currentTime = new Date();
    
    // Lấy tên khách và nguồn khách từ nhiều nguồn
    let customerName = 'Khách lẻ';
    let customerPhone = 'N/A';
    let customerEmail = 'N/A';
    let guestSource = 'walkin';
    
    // Ưu tiên 1: Từ form checkout (nếu user đã chỉnh sửa)
    const formGuestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
    const formGuestInfo = formGuestInfoFormGroup ? 
      (formGuestInfoFormGroup.disabled ? formGuestInfoFormGroup.getRawValue() : formGuestInfoFormGroup.value) : 
      (this.checkOutForm.get('guestInfo')?.value || {});
    
    // Lấy guestSource trực tiếp từ form control
    const formGuestSourceControl = formGuestInfoFormGroup?.get('guestSource');
    const formGuestSourceValue = formGuestSourceControl ? 
      (formGuestSourceControl.disabled ? formGuestSourceControl.getRawValue() : formGuestSourceControl.value) : 
      (formGuestInfo.guestSource || null);
    
    if (formGuestInfo.name && formGuestInfo.name !== 'Khách lẻ') {
      customerName = formGuestInfo.name;
      customerPhone = formGuestInfo.phone || customerPhone;
      customerEmail = formGuestInfo.email || customerEmail;
    }
    if (formGuestSourceValue) {
      guestSource = formGuestSourceValue;
    }
    
    console.log('Checkout processCheckOut - guestSource from form:', {
      formGuestInfo: formGuestInfo,
      formGuestSourceControl: formGuestSourceControl?.value,
      formGuestSourceValue: formGuestSourceValue,
      finalGuestSource: guestSource
    });
    
    // Ưu tiên 2: Từ lastCheckinEvent.guestInfo (chỉ nếu form không có giá trị)
    if ((!customerName || customerName === 'Khách lẻ') && lastCheckinEvent.guestInfo?.name && lastCheckinEvent.guestInfo.name !== 'Khách lẻ') {
      customerName = lastCheckinEvent.guestInfo.name;
      customerPhone = lastCheckinEvent.guestInfo.phone || customerPhone;
      customerEmail = lastCheckinEvent.guestInfo.email || customerEmail;
    }
    // CHỈ lấy guestSource từ lastCheckinEvent nếu form KHÔNG có giá trị
    if (!formGuestSourceValue && lastCheckinEvent.guestInfo?.guestSource) {
      guestSource = lastCheckinEvent.guestInfo.guestSource;
    }
    
    // Ưu tiên 3: Từ roomData.currentBooking (chỉ nếu form và lastCheckinEvent không có giá trị)
    if ((!customerName || customerName === 'Khách lẻ') && this.roomData.currentBooking) {
      const currentBooking = typeof this.roomData.currentBooking === 'object' ? this.roomData.currentBooking : null;
      if (currentBooking?.guestInfo?.name) {
        customerName = currentBooking.guestInfo.name;
        customerPhone = currentBooking.guestInfo.phone || customerPhone;
        customerEmail = currentBooking.guestInfo.email || customerEmail;
      }
    }
    // CHỈ lấy guestSource từ currentBooking nếu form và lastCheckinEvent KHÔNG có giá trị
    if (!formGuestSourceValue && !lastCheckinEvent.guestInfo?.guestSource) {
      const currentBooking = typeof this.roomData.currentBooking === 'object' ? this.roomData.currentBooking : null;
      if (currentBooking?.guestInfo?.guestSource) {
        guestSource = currentBooking.guestInfo.guestSource;
      }
    }
    
    // Ưu tiên 4: Từ roomData.events (lastCheckinEvent) - chỉ lấy event chưa checkout
    if ((!customerName || customerName === 'Khách lẻ') && this.roomData.events && this.roomData.events.length > 0) {
      const checkinEvents = this.getUncheckedOutCheckinEvents(this.roomData.events);
      
      if (checkinEvents.length > 0) {
        const lastCheckinEvent = checkinEvents[0];
        if (lastCheckinEvent.guestInfo?.name && lastCheckinEvent.guestInfo.name !== 'Khách lẻ') {
          customerName = lastCheckinEvent.guestInfo.name;
          customerPhone = lastCheckinEvent.guestInfo.phone || customerPhone;
          customerEmail = lastCheckinEvent.guestInfo.email || customerEmail;
        }
        // CHỈ lấy guestSource từ events nếu form và currentBooking KHÔNG có giá trị
        if (!formGuestSourceValue) {
          const currentBooking = typeof this.roomData.currentBooking === 'object' ? this.roomData.currentBooking : null;
          if (!currentBooking?.guestInfo?.guestSource && lastCheckinEvent.guestInfo?.guestSource) {
            guestSource = lastCheckinEvent.guestInfo.guestSource;
          }
        }
      }
    }
    
    // Ưu tiên 5: Từ listData (nếu có) (chỉ nếu các nguồn trên không có giá trị)
    if ((!customerName || customerName === 'Khách lẻ') && this.listData && this.listData.length > 0) {
      const firstItem = this.listData[0];
      if (firstItem.guestInfo?.name && firstItem.guestInfo.name !== 'Khách lẻ') {
        customerName = firstItem.guestInfo.name;
        customerPhone = firstItem.guestInfo.phone || customerPhone;
        customerEmail = firstItem.guestInfo.email || customerEmail;
      }
      // CHỈ lấy guestSource từ listData nếu các nguồn trên KHÔNG có giá trị
      if (!formGuestSourceValue) {
        const currentBooking = typeof this.roomData.currentBooking === 'object' ? this.roomData.currentBooking : null;
        if (!currentBooking?.guestInfo?.guestSource) {
          const checkinEvents = this.roomData.events ? this.getUncheckedOutCheckinEvents(this.roomData.events) : [];
          if (!checkinEvents || checkinEvents.length === 0 || !checkinEvents[0].guestInfo?.guestSource) {
            if (firstItem.guestInfo?.guestSource) {
              guestSource = firstItem.guestInfo.guestSource;
            }
          }
        }
      }
    }
    
    // Log để debug
    console.log('Checkout processCheckOut - Final guestSource:', {
      formGuestSourceValue: formGuestSourceValue,
      lastCheckinEventGuestSource: lastCheckinEvent?.guestInfo?.guestSource,
      finalGuestSource: guestSource
    });
    
    // Tính thời gian lưu trú chính xác theo phút
    const durationInMilliseconds = currentTime.getTime() - checkInTime.getTime();
    const durationInMinutes = Math.floor(durationInMilliseconds / (1000 * 60));
    const durationInHours = Math.floor(durationInMinutes / 60);
    const remainingMinutes = durationInMinutes % 60;
    const durationInDays = Math.ceil(durationInHours / 24);
    
    // Tính tổng tiền phòng dựa trên loại giá (rateType)
    // Ưu tiên lấy rateType từ form checkout nếu có, nếu không thì lấy từ lastCheckinEvent
    let rateType = this.checkOutForm?.get('rateType')?.value || lastCheckinEvent?.rateType || 'hourly';
    
    // Tính tổng tiền dịch vụ
    const servicesTotal = this.calculateServicesTotal();
    
    // Lấy giá trị phụ thu và giảm giá từ form checkout, đảm bảo là số
    const checkoutCharges = Number(this.checkOutForm.get('additionalCharges')?.value) || 0;
    const checkoutDiscount = Number(this.checkOutForm.get('discount')?.value) || 0;
    
    // Tính tổng phụ thu và khuyến mãi (bao gồm cả từ check-in và checkout)
    // initialCharges và initialDiscount đã được set khi load dữ liệu từ check-in event
    // checkoutCharges và checkoutDiscount là giá trị người dùng nhập thêm vào form checkout (form bắt đầu từ 0)
    // Đồng bộ với room.component.ts: totalAmount = roomPrice + additionalCharges + serviceAmount - discount - advancePayment
    const additionalCharges = this.initialCharges + checkoutCharges;
    const discount = this.initialDiscount + checkoutDiscount;
    
    // Trừ tiền đã trả trước (nếu có) - lấy từ lastCheckinEvent hoặc form
    const advancePayment = Number(this.checkOutForm?.get('advancePayment')?.value) || 
                           Number(lastCheckinEvent.advancePayment) || 0;
    const advancePaymentMethod = this.checkOutForm?.get('advancePaymentMethod')?.value || 
                                 lastCheckinEvent.advancePaymentMethod || 'cash';
    
    const roomTotal = this._roomPriceTotal;
    const adjusted = applyManualAdjustments(roomTotal, servicesTotal, additionalCharges, discount, advancePayment);
    const grandTotal = Math.max(0, adjusted.remainingAmount);
    const remainingAmount = grandTotal;

    this.processCheckoutWithPrice(
      roomTotal, 
      rateType, 
      lastCheckinEvent, 
      customerName, 
      customerPhone, 
      customerEmail, 
      guestSource, 
      formGuestInfo, 
      advancePayment,
      advancePaymentMethod,
      servicesTotal, 
      additionalCharges, 
      discount, 
      remainingAmount, 
      grandTotal, 
      currentTime, 
      checkInTime,
      durationInHours,
      durationInDays
    );
  }
  
  // Xử lý checkout với thông tin mặc định khi không tìm thấy event check-in
  private processCheckOutWithDefaultData(): void {
    const currentTime = this.getUTCTimePlus7();
    // Sử dụng thời gian hiện tại trừ 1 giờ làm checkinTime mặc định
    const defaultCheckInTime = new Date(currentTime.getTime() - 3600000);
    
    // Tạo event mặc định
    const defaultEvent = {
      checkinTime: defaultCheckInTime,
      rateType: this.checkOutForm?.get('rateType')?.value || 'hourly',
      advancePayment: Number(this.checkOutForm?.get('advancePayment')?.value) || 0,
      guestInfo: {
        name: 'Khách lẻ',
        phone: '',
        email: '',
        guestSource: 'walkin'
      }
    };
    
    // Lấy thông tin từ form nếu có
    const formGuestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
    const formGuestInfo = formGuestInfoFormGroup ? 
      (formGuestInfoFormGroup.disabled ? formGuestInfoFormGroup.getRawValue() : formGuestInfoFormGroup.value) : 
      (this.checkOutForm.get('guestInfo')?.value || {});
    
    if (formGuestInfo.name && formGuestInfo.name !== 'Khách lẻ') {
      defaultEvent.guestInfo.name = formGuestInfo.name;
      defaultEvent.guestInfo.phone = formGuestInfo.phone || '';
      defaultEvent.guestInfo.email = formGuestInfo.email || '';
      defaultEvent.guestInfo.guestSource = formGuestInfo.guestSource || 'walkin';
    }
    
    // Tiếp tục xử lý checkout với event mặc định
    this.processCheckOutWithEvent(defaultEvent, defaultCheckInTime);
  }

  /**
   * Xử lý checkout với giá đã được tính từ backend
   */
  private processCheckoutWithPrice(
    roomTotal: number,
    rateType: string,
    lastCheckinEvent: any,
    customerName: string,
    customerPhone: string,
    customerEmail: string,
    guestSource: string,
    formGuestInfo: any,
    advancePayment: number,
    advancePaymentMethod: string,
    servicesTotal: number,
    additionalCharges: number,
    discount: number,
    remainingAmount: number,
    grandTotal: number,
    currentTime: Date,
    checkInTime: Date,
    durationInHours: number,
    durationInDays: number
  ): void {
    let validRoomTotal = Number(roomTotal);
    if (!Number.isFinite(validRoomTotal)) {
      validRoomTotal = Number(this._roomPriceTotal);
    }
    if (!Number.isFinite(validRoomTotal)) {
      validRoomTotal = 0;
    }
    
    console.log('[processCheckoutWithPrice] Final roomTotal:', validRoomTotal);
    
    // Checkout chạy ngay — payload đã đủ guest/charges/services (không PATCH checkin-info).
    const formGuestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
    const formGuestInfoValue = formGuestInfoFormGroup ? 
      (formGuestInfoFormGroup.disabled ? formGuestInfoFormGroup.getRawValue() : formGuestInfoFormGroup.value) : 
      (this.checkOutForm.get('guestInfo')?.value || {});
    
    this.proceedWithCheckoutAfterUpdate(
      validRoomTotal,
      rateType,
      lastCheckinEvent,
      customerName,
      customerPhone,
      customerEmail,
      guestSource,
      formGuestInfoValue,
      advancePayment,
      advancePaymentMethod,
      servicesTotal,
      additionalCharges,
      discount,
      remainingAmount,
      grandTotal,
      currentTime,
      checkInTime,
      durationInHours,
      durationInDays
    );
  }
  
  /**
   * Tiếp tục xử lý checkout sau khi đã cập nhật check-in event
   */
  private proceedWithCheckoutAfterUpdate(
    validRoomTotal: number,
    rateType: string,
    lastCheckinEvent: any,
    customerName: string,
    customerPhone: string,
    customerEmail: string,
    guestSource: string,
    formGuestInfo: any,
    advancePayment: number,
    advancePaymentMethod: string,
    servicesTotal: number,
    additionalCharges: number,
    discount: number,
    remainingAmount: number,
    grandTotal: number,
    currentTime: Date,
    checkInTime: Date,
    durationInHours: number,
    durationInDays: number
  ): void {
    // Tạo phiếu thu phần tiền đặt trước mới nhập (chênh lệch so với lúc mở modal)
    const guestNameForAdvance =
      (formGuestInfo?.name || lastCheckinEvent?.guestInfo?.name || customerName || 'Khách lẻ') as string;
    this.createAdvancePaymentIncomeIfNeeded(
      advancePayment,
      this.initialAdvancePayment,
      advancePaymentMethod,
      { name: guestNameForAdvance },
      { source: 'checkout_advance', silent: true }
    );

    // Chuẩn bị dữ liệu checkout. Times are real instants, never a shifted wall clock.
    const paymentMethod = this.normalizePaymentMethod(this.checkOutForm.get('paymentMethod')?.value);
    const createDebt = this.checkOutForm.get('createDebt')?.value || false;
    const checkoutInstant = this.quotedCheckOutIso || toRealInstantIso(currentTime);
    const checkInInstant = toRealInstantIso(checkInTime);
    const quoteDetails = this.roomPriceDetails || this.checkoutQuote?.priceDetails || null;
    // Lưu paymentMethod vào checkoutData để sử dụng sau khi kiểm tra QR setting
    const checkoutData = {
      status: 'dirty',
      paymentStatus: createDebt ? 'pending' : ((paymentMethod === 'transfer') ? 'pending' : 'paid'),
      checkoutTime: checkoutInstant,
      checkOutTime: checkoutInstant,
      checkinTime: checkInInstant,
      checkInTime: checkInInstant,
      skipAutoIncomeVoucher: createDebt || paymentMethod === 'transfer',
      advancePayment: advancePayment,
      advancePaymentMethod: advancePaymentMethod,
      roomTotal: validRoomTotal, // Gửi validRoomTotal đã được validate
      rateType: rateType, // Gửi rateType đã được tính toán từ backend
      totalAmount: grandTotal, // Tổng tiền (room + services + charges - discount)
      remainingAmount: remainingAmount,
      additionalCharges: additionalCharges,
      discount: discount,
      paymentMethod: paymentMethod,
      notes: this.checkOutForm.get('notes')?.value,
      reason: this.checkOutForm.get('reason')?.value,
      services: this.selectedServices,
      createDebt: createDebt, // Flag để đưa vào công nợ
      // Gửi thông tin khách hàng để backend sử dụng
      customerName: customerName,
      customerPhone: customerPhone && customerPhone !== 'N/A' ? customerPhone : undefined,
      customerEmail: customerEmail && customerEmail !== 'N/A' ? customerEmail : undefined,
      guestName: customerName,
      guestPhone: customerPhone && customerPhone !== 'N/A' ? customerPhone : '',
      guestId: formGuestInfo.idNumber || '',
      guestEmail: customerEmail && customerEmail !== 'N/A' ? customerEmail : '',
      guestAddress: formGuestInfo.address || '',
      // Gửi guestInfo đầy đủ để backend lưu vào event
      guestInfo: {
        name: customerName,
        phone: customerPhone && customerPhone !== 'N/A' ? customerPhone : '',
        email: customerEmail && customerEmail !== 'N/A' ? customerEmail : '',
        idNumber: formGuestInfo.idNumber || '',
        address: formGuestInfo.address || '',
        guestSource: guestSource // Sử dụng guestSource đã lấy từ nhiều nguồn (ưu tiên từ form)
      },
      events: [
        ...this.roomData.events || [],
        {
          type: 'checkout',
          checkoutTime: checkoutInstant,
          checkOutTime: checkoutInstant,
          checkinTime: checkInInstant,
          checkInTime: checkInInstant,
          amount: grandTotal,
          rateType: rateType, // Thêm rateType đã được tính toán từ backend
          paymentMethod: paymentMethod,
          staffId: this.currentUser?._id || this.currentUser?.id || undefined,
          guestInfo: {
            name: customerName,
            phone: customerPhone && customerPhone !== 'N/A' ? customerPhone : '',
            email: customerEmail && customerEmail !== 'N/A' ? customerEmail : '',
            idNumber: formGuestInfo.idNumber || '',
            address: formGuestInfo.address || '',
            guestSource: guestSource // Đảm bảo guestSource được gửi trong event
          }
        }
      ]
    };

    const closeResult = {
      success: true,
      action: 'checkout',
      checkoutInfo: {
        roomId: this.roomData?._id,
        roomNumber: this.roomData?.roomNumber,
        checkInTime: checkInTime,
        checkOutTime: currentTime,
        customerName: customerName,
        guestSource: guestSource,
        paymentMethod: paymentMethod,
        paymentStatus: checkoutData.paymentStatus,
        rateType: rateType,
        roomTotal: validRoomTotal,
        servicesTotal: servicesTotal,
        additionalCharges: additionalCharges,
        discount: discount,
        advancePayment: advancePayment,
        advancePaymentMethod: advancePaymentMethod,
        totalAmount: grandTotal,
        remainingAmount: remainingAmount,
        notes: checkoutData.notes
      }
    };
    this.pendingCheckoutCloseResult = closeResult;
    
    // Log để debug
    console.log('Checkout data being sent to backend:', {
      guestInfo: checkoutData.guestInfo,
      guestSource: checkoutData.guestInfo.guestSource,
      rateType: rateType,
      roomTotal: validRoomTotal,
      additionalCharges: additionalCharges,
      discount: discount,
      grandTotal: grandTotal,
      remainingAmount: remainingAmount,
      eventsGuestInfo: checkoutData.events[checkoutData.events.length - 1]?.guestInfo,
      eventsGuestSource: checkoutData.events[checkoutData.events.length - 1]?.guestInfo?.guestSource
    });
    
    // Tạo danh sách products cho hóa đơn
    const products: any[] = [];
    
    console.log('[processCheckoutWithPrice] Creating invoice products:', {
      roomTotal: validRoomTotal,
      roomNumber: this.roomData.roomNumber,
      servicesCount: this.selectedServices?.length || 0
    });
    
    // Thêm tiền phòng vào products (sử dụng validRoomTotal đã được validate ở trên)
    products.push({
      name: `Tiền phòng ${this.roomData.roomNumber}`,
      price: validRoomTotal,
      quantity: 1,
      totalPrice: validRoomTotal // Thêm totalPrice để đảm bảo tính đúng
    });
    
    // Thêm các dịch vụ vào products
    if (this.selectedServices && this.selectedServices.length > 0) {
      this.selectedServices.forEach(service => {
        const serviceTotal = service.price * (service.quantity || 1);
        products.push({
          name: service.serviceName,
          price: service.price,
          quantity: service.quantity || 1,
          totalPrice: serviceTotal // Thêm totalPrice để đảm bảo tính đúng
        });
      });
    }
    
    console.log('[processCheckoutWithPrice] Products created:', products);
    
    // Tạo dữ liệu hóa đơn
    const invoiceData = {
      roomId: this.roomData._id,
      roomNumber: this.roomData.roomNumber,
      roomType: this.roomData.type,
      hotelId: this.roomData.hotelId || this.authService.getHotelId() || this.currentUser?.hotelId,
      invoiceNumber: 'INV-' + Date.now(),
      date: new Date(),
      staffName: this.currentUser?.fullName || this.currentUser?.username || 'Nhân viên',
      staffId: this.currentUser?._id || this.currentUser?.id || undefined,
      customerName: customerName, // Sử dụng tên khách đã lấy từ nhiều nguồn
      customerPhone: customerPhone !== 'N/A' ? customerPhone : '',
      customerEmail: customerEmail !== 'N/A' ? customerEmail : '',
      checkInTime: checkInInstant,
      checkOutTime: checkoutInstant,
      duration: {
        hours: quoteDetails?.durationInHours ?? durationInHours,
        days: quoteDetails?.days ?? durationInDays
      },
      roomPrice: validRoomTotal,
      roomTotal: validRoomTotal,
      products: (this.checkoutQuote?.products && this.checkoutQuote.products.length)
        ? this.checkoutQuote.products
        : products,
      priceDetails: quoteDetails,
      metadata: {
        priceDetails: quoteDetails
      },
      services: this.selectedServices.map(service => ({
        name: service.serviceName,
        price: service.price,
        quantity: service.quantity,
        totalPrice: service.price * service.quantity
      })),
      servicesTotal: servicesTotal,
      additionalCharges: additionalCharges,
      discount: discount,
      totalAmount: grandTotal,
      grandTotal: grandTotal,
      advancePayment: advancePayment || 0,
      advancePaymentMethod: (this.checkOutForm?.get('advancePaymentMethod')?.value ||
                             lastCheckinEvent?.advancePaymentMethod ||
                             'cash'),
      remainingAmount: remainingAmount,
      paymentMethod: paymentMethod,
      paymentStatus: checkoutData.paymentStatus || 'paid', // Thêm paymentStatus từ checkoutData
      notes: this.checkOutForm.get('notes')?.value,
      rateType: rateType, // Thêm rateType vào invoiceData
      guestInfo: {
        name: customerName,
        phone: customerPhone && customerPhone !== 'N/A' ? customerPhone : '',
        email: customerEmail && customerEmail !== 'N/A' ? customerEmail : '',
        idNumber: formGuestInfo.idNumber || '',
        tax_code: formGuestInfo.tax_code || '', // Mã số thuế (cho công ty)
        address: formGuestInfo.address || '',
        guestSource: guestSource // Thêm guestSource vào guestInfo
      },
      guestSource: guestSource // Thêm guestSource trực tiếp vào invoiceData để dễ truy cập
    };
    
    // Kiểm tra nếu payment method là 'transfer' (chuyển khoản)
    if (paymentMethod === 'transfer') {
      // Kiểm tra xem có nên hiển thị QR payment không
      this.checkAndHandleTransferPayment(remainingAmount, invoiceData, checkoutData);
    } else {
      // Đóng modal ngay — sơ đồ nhận dirty qua afterClose + emit trước khi mở hóa đơn
      if (this.modalRef) {
        this.modalRef.close(closeResult);
      }
      this.pendingCheckoutCloseResult = null;

      // Emit dirty ngay (không chờ API) để board cập nhật trước hóa đơn
      this.emitRoomDataUpdated('checkout', {
        roomId: this.roomData?._id,
        status: 'dirty',
        guestStatus: null,
        force: false,
        delayMs: 0,
        refreshRooms: false,
        refreshHistory: false
      });
      
      // Thực hiện checkout trong background
      this.roomsService.checkOutRoom(this.roomData._id, checkoutData)
        .subscribe(
          (response) => {
            this.finishCheckoutSuccess(response, invoiceData, {
              successMessage: this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.CHECKOUT_SUCCESS'),
              showInvoice: (checkoutData.paymentStatus || 'paid') === 'paid'
            });
          },
          (error) => {
            this.message.error(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.CHECKOUT_ERROR', { message: error.message }));
            this.emitRoomDataUpdated('checkout', {
              roomId: this.roomData?._id,
              force: true,
              refreshRooms: true,
              delayMs: 0
            });
          }
        );
    }
  }
  
  /**
   * Kiểm tra và xử lý thanh toán chuyển khoản với QR (nếu được bật)
   */
  checkAndHandleTransferPayment(amount: number, invoiceData: any, checkoutData: any): void {
    const normalizedAmount = Number(amount) || 0;
    if (normalizedAmount <= 0) {
      checkoutData.paymentStatus = 'paid';
      checkoutData.remainingAmount = 0;
      invoiceData.paymentStatus = 'paid';
      invoiceData.remainingAmount = 0;
      this.proceedWithCheckoutDirectly(checkoutData, invoiceData);
      return;
    }

    // Fast path: đã có QR hoặc business/pricing sẵn → hiện modal ngay, không gọi lại hotel API
    const manager = (this.businessInfo && typeof this.businessInfo.managerId === 'object') ? this.businessInfo.managerId : null;
    const isQrAvailable = !!(
      this.businessOwner?.bankAccount?.qrPaymentUrl ||
      this.hotelBankAccount?.qrPaymentUrl ||
      manager?.bankAccount?.qrPaymentUrl ||
      this.currentUser?.bankAccount?.qrPaymentUrl
    );

    if (isQrAvailable) {
      this.handleTransferPayment(normalizedAmount, invoiceData, checkoutData);
      return;
    }

    // Đã có pricingPackage trong memory → quyết định ngay
    if (this.businessInfo?.pricingPackage) {
      const hasQRFeature = !!this.businessInfo.pricingPackage.qrPaymentFeature;
      if (hasQRFeature) {
        this.handleTransferPayment(normalizedAmount, invoiceData, checkoutData);
      } else {
        checkoutData.paymentStatus = 'paid';
        invoiceData.paymentStatus = 'paid';
        this.proceedWithCheckoutDirectly(checkoutData, invoiceData);
      }
      return;
    }

    // Fallback: chỉ khi chưa có dữ liệu sẵn mới gọi hotel API
    if (this.roomData?.hotelId) {
      this.hotelService.getHotelById(this.roomData.hotelId).subscribe({
        next: (hotel: any) => {
          const hotelSettings = hotel.settings || {};
          const enableQRFromSettings = hotelSettings.enableQRPaymentForBankTransfer || false;

          if (hotel.businessId) {
            this.checkPricingPackageAndHandlePayment(
              hotel.businessId,
              enableQRFromSettings,
              normalizedAmount,
              invoiceData,
              checkoutData
            );
          } else if (enableQRFromSettings) {
            this.handleTransferPayment(normalizedAmount, invoiceData, checkoutData);
          } else {
            checkoutData.paymentStatus = 'paid';
            invoiceData.paymentStatus = 'paid';
            this.proceedWithCheckoutDirectly(checkoutData, invoiceData);
          }
        },
        error: () => {
          this.handleTransferPayment(normalizedAmount, invoiceData, checkoutData);
        }
      });
    } else {
      this.handleTransferPayment(normalizedAmount, invoiceData, checkoutData);
    }
  }
  
  /**
   * Kiểm tra pricing package và xử lý thanh toán
   */
  private checkPricingPackageAndHandlePayment(businessId: string, enableQRFromSettings: boolean, amount: number, invoiceData: any, checkoutData: any): void {
    // Kiểm tra từ businessInfo nếu có
    if (this.businessInfo?.pricingPackage) {
      const pricingPackage = this.businessInfo.pricingPackage;
      const hasQRFeature = pricingPackage.qrPaymentFeature || false;
      
      // Nếu pricing package có QR feature hoặc hotel setting bật QR
      if (hasQRFeature || enableQRFromSettings) {
        // Gọi handleTransferPayment - nó sẽ tự kiểm tra có QR code không
        // Nếu không có QR code, sẽ tự động bỏ qua modal và checkout trực tiếp
        this.handleTransferPayment(amount, invoiceData, checkoutData);
      } else {
        // Không có QR feature và không bật trong settings, set paymentStatus = 'paid' và checkout với xuất hóa đơn
        checkoutData.paymentStatus = 'paid';
        invoiceData.paymentStatus = 'paid';
        this.proceedWithCheckoutDirectly(checkoutData, invoiceData);
      }
    } else {
      // Không có pricing package info, chỉ kiểm tra hotel settings
      if (enableQRFromSettings) {
        // Gọi handleTransferPayment - nó sẽ tự kiểm tra có QR code không
        // Nếu không có QR code, sẽ tự động bỏ qua modal và checkout trực tiếp
        this.handleTransferPayment(amount, invoiceData, checkoutData);
      } else {
        // Không bật QR, set paymentStatus = 'paid' và checkout với xuất hóa đơn
        checkoutData.paymentStatus = 'paid';
        invoiceData.paymentStatus = 'paid';
        this.proceedWithCheckoutDirectly(checkoutData, invoiceData);
      }
    }
  }
  
  /**
   * Thực hiện checkout trực tiếp không qua QR
   */
  private proceedWithCheckoutDirectly(checkoutData: any, invoiceData: any): void {
    if (this.modalRef) {
      const closeResult = this.pendingCheckoutCloseResult || {
        success: true,
        action: 'checkout',
        checkoutInfo: {
          roomId: this.roomData?._id,
          roomNumber: this.roomData?.roomNumber,
          checkInTime: checkoutData?.checkInTime || checkoutData?.checkinTime,
          checkOutTime: checkoutData?.checkOutTime || checkoutData?.checkoutTime,
          customerName: checkoutData?.customerName || checkoutData?.guestName || checkoutData?.guestInfo?.name || 'Khách lẻ',
          guestSource: checkoutData?.guestInfo?.guestSource || invoiceData?.guestSource || 'walkin',
          paymentMethod: checkoutData?.paymentMethod || 'transfer',
          paymentStatus: checkoutData?.paymentStatus || 'paid',
          rateType: checkoutData?.rateType || 'hourly',
          roomTotal: Number(checkoutData?.roomTotal) || 0,
          servicesTotal: Array.isArray(checkoutData?.services)
            ? checkoutData.services.reduce((sum: number, s: any) => sum + (Number(s?.totalPrice) || (Number(s?.price) || 0) * (Number(s?.quantity) || 1)), 0)
            : 0,
          additionalCharges: Number(checkoutData?.additionalCharges) || 0,
          discount: Number(checkoutData?.discount) || 0,
          advancePayment: Number(checkoutData?.advancePayment) || 0,
          advancePaymentMethod: checkoutData?.advancePaymentMethod || 'cash',
          totalAmount: Number(checkoutData?.totalAmount) || 0,
          remainingAmount: Number(checkoutData?.remainingAmount) || 0,
          notes: checkoutData?.notes || ''
        }
      };
      this.pendingCheckoutCloseResult = null;
      this.modalRef.close(closeResult);
    }

    this.emitRoomDataUpdated('checkout', {
      roomId: this.roomData?._id,
      status: 'dirty',
      guestStatus: null,
      force: false,
      delayMs: 0,
      refreshRooms: false,
      refreshHistory: false
    });
    
    // Kiểm tra paymentStatus - chỉ hiển thị hóa đơn nếu đã thanh toán
    const paymentStatus = checkoutData.paymentStatus || 'paid';
    const shouldShowInvoice = paymentStatus === 'paid';
    
    this.roomsService.checkOutRoom(this.roomData._id, checkoutData).subscribe({
      next: (response) => {
        this.isLoading = false;
        if (response.success !== false) {
          this.finishCheckoutSuccess(response, invoiceData, {
            successMessage: this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.CHECKOUT_SUCCESS'),
            showInvoice: shouldShowInvoice
          });
        } else {
          this.message.error(response.message || this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.CHECKOUT_ERROR_GENERIC'));
        }
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error during checkout:', error);
        this.message.error(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.CHECKOUT_ERROR_GENERIC'));
      }
    });
  }

  /**
   * Xử lý thanh toán chuyển khoản với SePay
   */
  handleTransferPayment(amount: number, invoiceData: any, checkoutData: any): void {
    const normalizedAmount = Number(amount) || 0;
    if (normalizedAmount <= 0) {
      checkoutData.paymentStatus = 'paid';
      checkoutData.remainingAmount = 0;
      invoiceData.paymentStatus = 'paid';
      invoiceData.remainingAmount = 0;
      this.proceedWithCheckoutDirectly(checkoutData, invoiceData);
      return;
    }

    const userId = this.currentUser?._id || this.currentUser?.id;
    if (!userId) {
      this.message.error(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.USER_NOT_FOUND'));
      return;
    }

    const bank = this.resolveBankAccountForQr();
    if (!bank.qrPaymentUrl) {
      checkoutData.paymentStatus = 'paid';
      invoiceData.paymentStatus = 'paid';
      this.proceedWithCheckoutDirectly(checkoutData, invoiceData);
      return;
    }

    // Hiện QR ngay — bỏ qua check/bắt buộc Mã thanh toán / Nội dung CK trên QR
    const reused = this.takePrefetchedSePay(normalizedAmount);
    const paymentCode = reused?.paymentCode || this.generateLocalSePayPaymentCode();
    // Giữ mã nội bộ để polling/history; không gắn vào QR (des) và không bắt khách nhập CK
    this.sepayPaymentCode = paymentCode;

    this.prepareSePayModalState(
      normalizedAmount,
      this.buildRoomCheckoutQrUrl(bank.qrPaymentUrl, normalizedAmount),
      bank.beneficiaryName,
      bank.bankName,
      bank.accountNumber,
      checkoutData,
      invoiceData
    );
    this.sepayPaymentCode = paymentCode;

    if (reused?.paymentHistoryId) {
      this.sepayPaymentHistoryId = reused.paymentHistoryId;
      this.sepayInitializing = false;
      this.startPaymentStatusPolling();
      return;
    }

    this.isLoading = false;
    this.sepayInitializing = true;

    const payload = {
      userId: userId,
      amount: normalizedAmount,
      currency: 'VND',
      orderInvoiceNumber: paymentCode,
      description: `Thanh toán phòng ${this.roomData.roomNumber} - ${invoiceData.customerName || 'Khách lẻ'}`,
      roomId: this.roomData._id,
      roomNumber: this.roomData.roomNumber,
      hotelId: this.getResolvedHotelId() || undefined,
      paymentType: 'room_checkout'
    };

    this.sepayService.createPaymentHistoryForRoom(payload).subscribe({
      next: (response: any) => {
        this.sepayInitializing = false;
        if (response?.success) {
          this.sepayPaymentHistoryId = response.paymentHistoryId || '';
          if (response.paymentCode) {
            this.sepayPaymentCode = response.paymentCode;
          }
          this.prefetchedSePay = {
            amount: normalizedAmount,
            roomId: String(this.roomData._id),
            paymentHistoryId: String(this.sepayPaymentHistoryId || ''),
            paymentCode: this.sepayPaymentCode,
            createdAt: Date.now()
          };
          if (this.showSePayModal) {
            this.startPaymentStatusPolling();
          }
        } else {
          // Vẫn giữ QR — không chặn thanh toán vì lỗi liên kết mã CK
          console.warn('SePay payment history create failed:', response?.error);
          if (this.showSePayModal) {
            this.startPaymentStatusPolling();
          }
        }
      },
      error: (error: any) => {
        this.sepayInitializing = false;
        console.error('Error creating SePay payment history:', error);
        // Bỏ qua check mã CK: vẫn giữ modal QR để khách quét thanh toán
        if (this.showSePayModal) {
          this.startPaymentStatusPolling();
        }
      }
    });
  }

  /**
   * QR checkout: gắn số tiền, không gắn nội dung CK (des / payment code).
   * Webhook tự khớp theo số tiền + tài khoản / payment history.
   */
  private buildRoomCheckoutQrUrl(baseUrl: string, amount: number): string {
    const raw = String(baseUrl || '').trim();
    if (!raw) {
      return '';
    }
    try {
      const url = new URL(raw);
      const normalizedAmount = Math.round(Number(amount) || 0);
      if (normalizedAmount > 0) {
        url.searchParams.set('amount', String(normalizedAmount));
      }
      url.searchParams.delete('des');
      url.searchParams.delete('description');
      url.searchParams.delete('content');
      return url.toString();
    } catch {
      return raw;
    }
  }

  private resolveBankAccountForQr(): {
    qrPaymentUrl: string;
    beneficiaryName: string;
    bankName: string;
    accountNumber: string;
  } {
    if (this.businessOwner?.bankAccount?.qrPaymentUrl) {
      const ba = this.businessOwner.bankAccount;
      return {
        qrPaymentUrl: ba.qrPaymentUrl,
        beneficiaryName: ba.beneficiaryName || ba.accountHolderName || '',
        bankName: ba.bankName || '',
        accountNumber: ba.accountNumber || ''
      };
    }
    if (this.hotelBankAccount?.qrPaymentUrl) {
      const ba = this.hotelBankAccount;
      return {
        qrPaymentUrl: ba.qrPaymentUrl,
        beneficiaryName: ba.beneficiaryName || ba.accountHolderName || '',
        bankName: ba.bankName || '',
        accountNumber: ba.accountNumber || ''
      };
    }
    const manager = this.businessInfo?.managerId;
    if (manager && typeof manager === 'object' && manager.bankAccount?.qrPaymentUrl) {
      const ba = manager.bankAccount;
      return {
        qrPaymentUrl: ba.qrPaymentUrl,
        beneficiaryName: ba.beneficiaryName || ba.accountHolderName || '',
        bankName: ba.bankName || '',
        accountNumber: ba.accountNumber || ''
      };
    }
    const ba = this.currentUser?.bankAccount || {};
    return {
      qrPaymentUrl: ba.qrPaymentUrl || '',
      beneficiaryName: ba.beneficiaryName || ba.accountHolderName || '',
      bankName: ba.bankName || '',
      accountNumber: ba.accountNumber || ''
    };
  }

  /** Format: PHG + 6-8 chữ số (khớp backend generateSePayPaymentCode). */
  private generateLocalSePayPaymentCode(): string {
    const length = 6 + Math.floor(Math.random() * 3); // 6..8
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;
    return `PHG${randomNumber}`;
  }

  private getRemainingAmountForPrefetch(): number {
    // Ưu tiên remainingAmount đã tính sẵn
    if (Number.isFinite(this.remainingAmount) && this.remainingAmount > 0) {
      return Math.max(0, Number(this.remainingAmount));
    }
    const total = Number(this.totalPrice) || 0;
    const advance =
      Number(this.checkOutForm?.get('advancePayment')?.value) ||
      Number(this.advancePayment) ||
      0;
    const discount =
      this.initialDiscount + (Number(this.checkOutForm?.get('discount')?.value) || 0);
    return Math.max(0, total - advance - discount);
  }

  /** Khi chọn chuyển khoản: tạo mã + payment history trước, checkout chỉ hiện QR. */
  private prefetchSePayPaymentCode(): void {
    const amount = this.getRemainingAmountForPrefetch();
    const roomId = String(this.roomData?._id || '');
    const userId = this.currentUser?._id || this.currentUser?.id;

    if (!roomId || !userId || amount <= 0) {
      this.prefetchedSePay = null;
      this.sepayPaymentCode = '';
      return;
    }

    // Đã có prefetch còn hạn + đúng số tiền
    if (
      this.prefetchedSePay &&
      this.prefetchedSePay.roomId === roomId &&
      this.prefetchedSePay.amount === amount &&
      Date.now() - this.prefetchedSePay.createdAt < 5 * 60 * 1000
    ) {
      this.sepayPaymentCode = this.prefetchedSePay.paymentCode;
      return;
    }

    if (this.prefetchSePayInFlight) {
      return;
    }

    const paymentCode = this.generateLocalSePayPaymentCode();
    this.sepayPaymentCode = paymentCode; // hiện ngay trên UI nếu cần
    this.prefetchSePayInFlight = true;

    this.sepayService
      .createPaymentHistoryForRoom({
        userId,
        amount,
        currency: 'VND',
        orderInvoiceNumber: paymentCode,
        description: `Thanh toán phòng ${this.roomData.roomNumber}`,
        roomId,
        roomNumber: this.roomData.roomNumber,
        hotelId: this.getResolvedHotelId() || undefined,
        paymentType: 'room_checkout'
      })
      .subscribe({
        next: (response: any) => {
          this.prefetchSePayInFlight = false;
          if (response?.success) {
            this.prefetchedSePay = {
              amount,
              roomId,
              paymentHistoryId: String(response.paymentHistoryId || ''),
              paymentCode: String(response.paymentCode || paymentCode),
              createdAt: Date.now()
            };
            this.sepayPaymentCode = this.prefetchedSePay.paymentCode;
          }
        },
        error: () => {
          this.prefetchSePayInFlight = false;
          // Giữ mã local để vẫn hiện nhanh; checkout sẽ tạo lại nếu cần
          this.prefetchedSePay = {
            amount,
            roomId,
            paymentHistoryId: '',
            paymentCode,
            createdAt: Date.now()
          };
        }
      });
  }

  private takePrefetchedSePay(amount: number): {
    paymentHistoryId: string;
    paymentCode: string;
  } | null {
    const roomId = String(this.roomData?._id || '');
    const cached = this.prefetchedSePay;
    if (
      !cached ||
      cached.roomId !== roomId ||
      cached.amount !== amount ||
      Date.now() - cached.createdAt > 5 * 60 * 1000
    ) {
      return null;
    }
    // Dùng 1 lần
    this.prefetchedSePay = null;
    return {
      paymentHistoryId: cached.paymentHistoryId,
      paymentCode: cached.paymentCode
    };
  }
  
  /**
   * Thực hiện checkout sau khi đã tạo payment history
   */
  proceedWithCheckout(checkoutData: any, invoiceData: any): void {
    // Đóng modal
    if (this.modalRef) {
      const closeResult = this.pendingCheckoutCloseResult || {
        success: true,
        action: 'checkout',
        checkoutInfo: {
          roomId: this.roomData?._id,
          roomNumber: this.roomData?.roomNumber,
          checkInTime: checkoutData?.checkInTime || checkoutData?.checkinTime,
          checkOutTime: checkoutData?.checkOutTime || checkoutData?.checkoutTime,
          customerName: checkoutData?.customerName || checkoutData?.guestName || checkoutData?.guestInfo?.name || 'Khách lẻ',
          guestSource: checkoutData?.guestInfo?.guestSource || invoiceData?.guestSource || 'walkin',
          paymentMethod: checkoutData?.paymentMethod || 'transfer',
          paymentStatus: checkoutData?.paymentStatus || 'paid',
          rateType: checkoutData?.rateType || 'hourly',
          roomTotal: Number(checkoutData?.roomTotal) || 0,
          servicesTotal: Array.isArray(checkoutData?.services)
            ? checkoutData.services.reduce((sum: number, s: any) => sum + (Number(s?.totalPrice) || (Number(s?.price) || 0) * (Number(s?.quantity) || 1)), 0)
            : 0,
          additionalCharges: Number(checkoutData?.additionalCharges) || 0,
          discount: Number(checkoutData?.discount) || 0,
          advancePayment: Number(checkoutData?.advancePayment) || 0,
          advancePaymentMethod: checkoutData?.advancePaymentMethod || 'cash',
          totalAmount: Number(checkoutData?.totalAmount) || 0,
          remainingAmount: Number(checkoutData?.remainingAmount) || 0,
          notes: checkoutData?.notes || ''
        }
      };
      this.pendingCheckoutCloseResult = null;
      this.modalRef.close(closeResult);
    }
    
    // Kiểm tra paymentStatus - chỉ hiển thị hóa đơn nếu đã thanh toán
    const paymentStatus = checkoutData.paymentStatus || 'paid';
    const shouldShowInvoice = paymentStatus === 'paid';
    
    // Thực hiện checkout trong background
    this.roomsService.checkOutRoom(this.roomData._id, checkoutData)
      .subscribe(
        (response) => {
          this.finishCheckoutSuccess(response, invoiceData, {
            successMessage: paymentStatus === 'pending'
              ? 'Check-out thành công. Đang chờ xác nhận thanh toán...'
              : this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.CHECKOUT_SUCCESS'),
            showInvoice: shouldShowInvoice
          });
        },
        (error) => {
          this.message.error(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.CHECKOUT_ERROR', { message: error.message }));
          this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 0 });
        }
      );
  }
  
  /**
   * Bắt đầu kiểm tra trạng thái thanh toán (polling)
   */
  private startPaymentStatusPolling(): void {
    this.stopPaymentStatusPolling(false);

    if (
      (!this.sepayPaymentHistoryId && !this.sepayPaymentCode) ||
      !this.activeSePayTransactionToken
    ) {
      return;
    }

    let checkCount = 0;
    const maxChecks = 90;
    const transactionToken = this.activeSePayTransactionToken;
    const runCheck = () => {
      checkCount++;
      this.checkPaymentStatusOnce(transactionToken, checkCount >= maxChecks);
      if (checkCount >= maxChecks) {
        this.stopPaymentStatusPolling();
        console.log('Đã kiểm tra trạng thái thanh toán tối đa, dừng polling');
      }
    };

    setTimeout(() => {
      if (transactionToken === this.activeSePayTransactionToken) {
        runCheck();
      }
    }, 800);

    this.paymentStatusCheckInterval = setInterval(() => {
      if (transactionToken !== this.activeSePayTransactionToken) {
        this.stopPaymentStatusPolling(false);
        return;
      }
      runCheck();
    }, 2000);
  }

  private onSePayPaymentReceivedWindow = (event: Event): void => {
    const detail = (event as CustomEvent)?.detail;
    this.ngZone.run(() => this.handleRealtimeSePayPayment(detail));
  };

  /** Khớp giao dịch SePay đang chờ (QR checkout) với payload realtime/polling */
  private matchesActiveSePayPayment(payload: any): boolean {
    if (!payload) {
      return false;
    }

    const payloadHistoryId = String(payload.paymentHistoryId || payload.id || '').trim();
    const payloadCode = String(
      payload.paymentCode || payload.sepayInvoiceNumber || payload.orderInvoiceNumber || ''
    ).trim();
    const payloadRoomId = this.normalizeObjectId(payload.roomId);
    const currentRoomId = this.normalizeObjectId(this.roomData?._id);
    const payloadHotelId = this.normalizeObjectId(payload.hotelId);
    const currentHotelId = this.getResolvedHotelId();
    const currentHistoryId = String(this.sepayPaymentHistoryId || '').trim();
    const currentCode = String(this.sepayPaymentCode || '').trim();
    const payloadAmount = Number(payload.amount);
    const currentAmount = Number(this.sepayAmount);
    const payloadType = String(payload.paymentType || '').trim().toLowerCase();

    const matchById = !!(currentHistoryId && payloadHistoryId && currentHistoryId === payloadHistoryId);
    const matchByCode = !!(currentCode && payloadCode && currentCode === payloadCode);

    const sameRoom = !!(currentRoomId && payloadRoomId && currentRoomId === payloadRoomId);
    const sameHotel = !!(currentHotelId && payloadHotelId && currentHotelId === payloadHotelId);

    const amountClose =
      Number.isFinite(payloadAmount) &&
      Number.isFinite(currentAmount) &&
      currentAmount > 0 &&
      Math.abs(payloadAmount - currentAmount) <= Math.max(currentAmount * 0.01, 1000);

    const isCheckoutLike =
      !payloadType ||
      payloadType === 'room_checkout' ||
      payloadType === 'bank_transfer_in';

    const matchByRoom = sameRoom && isCheckoutLike;
    const matchByHotelAmount = sameHotel && amountClose && isCheckoutLike && this.showSePayModal;

    return matchById || matchByCode || matchByRoom || matchByHotelAmount;
  }

  /** Đóng modal CK khi socket báo payment_received khớp giao dịch đang chờ */
  private handleRealtimeSePayPayment(payload: any): void {
    if (!payload || this.paymentSuccessHandled) {
      return;
    }

    const awaitingPayment =
      this.showSePayModal ||
      (!!this.pendingCheckoutData && !!this.activeSePayTransactionToken);

    if (!awaitingPayment) {
      return;
    }

    if (!this.matchesActiveSePayPayment(payload)) {
      return;
    }

    this.onPaymentSuccess();
  }
  
  /**
   * Dừng kiểm tra trạng thái thanh toán
   */
  private stopPaymentStatusPolling(resetState: boolean = true): void {
    if (this.paymentStatusCheckInterval) {
      clearInterval(this.paymentStatusCheckInterval);
      this.paymentStatusCheckInterval = null;
    }
    this.paymentStatusCheckInFlight = false;
    if (resetState) {
      this.sepayInitializing = false;
    }
  }
  
  /**
   * Xử lý khi thanh toán thành công
   */
  private onPaymentSuccess(): void {
    if (this.paymentSuccessHandled) {
      return;
    }

    this.paymentSuccessHandled = true;
    this.sepayPaymentConfirmed = true;
    console.log('[onPaymentSuccess] Thanh toán thành công, đóng modal QR và hiển thị invoice');
    
    // Dừng polling
    this.stopPaymentStatusPolling();
    
    // Đóng modal QR trước (tự động đóng)
    this.showSePayModal = false;
    this.cdr.markForCheck();
    this.cdr.detectChanges();
    
    // Lấy checkoutData và invoiceData đã lưu
    const checkoutData = this.pendingCheckoutData;
    const invoiceData = this.pendingInvoiceData;
    
    if (checkoutData && invoiceData) {
      // Cập nhật paymentStatus thành 'paid'
      checkoutData.paymentStatus = 'paid';
      invoiceData.paymentStatus = 'paid';
      
      // this.loadLatestPaymentAndPlaySound();
      
      // Hiển thị thông báo thành công (màu xanh)
      this.message.success(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.CHECKOUT_SUCCESS'));
      
      // Đợi một chút để modal QR đóng hoàn toàn trước khi đóng modal checkout
      setTimeout(() => {
        // Đóng modal checkout
        if (this.modalRef) {
          const closeResult = this.pendingCheckoutCloseResult || {
            success: true,
            action: 'checkout',
            checkoutInfo: {
              roomId: this.roomData?._id,
              roomNumber: this.roomData?.roomNumber,
              checkInTime: checkoutData?.checkInTime || checkoutData?.checkinTime,
              checkOutTime: checkoutData?.checkOutTime || checkoutData?.checkoutTime,
              customerName: checkoutData?.customerName || checkoutData?.guestName || checkoutData?.guestInfo?.name || 'Khách lẻ',
              guestSource: checkoutData?.guestInfo?.guestSource || invoiceData?.guestSource || 'walkin',
              paymentMethod: checkoutData?.paymentMethod || 'transfer',
              paymentStatus: checkoutData?.paymentStatus || 'paid',
              rateType: checkoutData?.rateType || 'hourly',
              roomTotal: Number(checkoutData?.roomTotal) || 0,
              servicesTotal: Array.isArray(checkoutData?.services)
                ? checkoutData.services.reduce((sum: number, s: any) => sum + (Number(s?.totalPrice) || (Number(s?.price) || 0) * (Number(s?.quantity) || 1)), 0)
                : 0,
              additionalCharges: Number(checkoutData?.additionalCharges) || 0,
              discount: Number(checkoutData?.discount) || 0,
              advancePayment: Number(checkoutData?.advancePayment) || 0,
              advancePaymentMethod: checkoutData?.advancePaymentMethod || 'cash',
              totalAmount: Number(checkoutData?.totalAmount) || 0,
              remainingAmount: Number(checkoutData?.remainingAmount) || 0,
              notes: checkoutData?.notes || ''
            }
          };
          this.pendingCheckoutCloseResult = null;
          this.modalRef.close(closeResult);
        }
        
        // Cập nhật checkout với paymentStatus = 'paid' trong background
        this.roomsService.checkOutRoom(this.roomData._id, checkoutData)
          .subscribe(
            (response) => {
              this.finishCheckoutSuccess(response, invoiceData, {
                successMessage: 'Thanh toán thành công. Check-out hoàn tất.',
                showInvoice: true
              });
              this.resetSePayTransactionState();
            },
            (error) => {
              console.error('Error updating checkout with payment status:', error);
              this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 0 });
              this.showInvoice(invoiceData);
              this.resetSePayTransactionState();
            }
          );
      }, 100);
    } else {
      console.error('[onPaymentSuccess] Không tìm thấy checkoutData hoặc invoiceData');
      this.resetSePayTransactionState();
    }
  }
  
  /**
   * Lấy lịch sử chuyển khoản gần nhất và phát thông báo âm thanh
   */
  private loadLatestPaymentAndPlaySound(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?._id) {
      console.warn('[loadLatestPaymentAndPlaySound] Không tìm thấy userId');
      // Fallback: lấy từ invoiceData ngay lập tức
      const amount = this.pendingInvoiceData?.totalAmount || 
                    this.pendingInvoiceData?.remainingAmount || 0;
      if (amount > 0) {
        this.playPaymentSuccessSound(amount);
      }
      return;
    }
    
    // Đợi một chút để đảm bảo webhook đã cập nhật dữ liệu
    setTimeout(() => {
      // Lấy lịch sử chuyển khoản SePay gần nhất
      this.sepayService.getPaymentHistory({ userId: currentUser._id, limit: 10 }).subscribe({
        next: (response: any) => {
          let amount = 0;
          
          // Tìm giao dịch gần nhất có status 'completed' hoặc 'paid'
          const paymentHistories = Array.isArray(response) 
            ? response 
            : (response?.success && response.data ? response.data : []);
          
          if (paymentHistories && paymentHistories.length > 0) {
            // Tìm giao dịch gần nhất đã hoàn thành
            const completedPayment = paymentHistories.find((p: any) => 
              (p.status === 'completed' || p.status === 'paid') && 
              (p.amount > 0 || p.totalAmount > 0)
            );
            
            if (completedPayment) {
              // Ưu tiên lấy transferAmount từ paymentGatewayResponse (số tiền thực tế nhận được)
              amount = completedPayment.paymentGatewayResponse?.transferAmount || 
                      completedPayment.amount || 
                      completedPayment.totalAmount || 0;
            } else {
              // Nếu không tìm thấy completed, lấy giao dịch gần nhất
              const latestPayment = paymentHistories[0];
              amount = latestPayment.amount || latestPayment.totalAmount || 0;
            }
          }
          
          // Nếu không lấy được từ API, thử lấy từ invoiceData
          if (amount === 0) {
            amount = this.pendingInvoiceData?.totalAmount || 
                    this.pendingInvoiceData?.remainingAmount || 0;
          }
          
          if (amount > 0) {
            console.log('[loadLatestPaymentAndPlaySound] Số tiền thanh toán:', amount);
            // Phát thông báo âm thanh
            this.playPaymentSuccessSound(amount);
          } else {
            console.warn('[loadLatestPaymentAndPlaySound] Không tìm thấy số tiền thanh toán');
          }
        },
        error: (error) => {
          console.error('[loadLatestPaymentAndPlaySound] Lỗi khi lấy lịch sử thanh toán:', error);
          // Fallback: lấy từ invoiceData
          const amount = this.pendingInvoiceData?.totalAmount || 
                        this.pendingInvoiceData?.remainingAmount || 0;
          if (amount > 0) {
            console.log('[loadLatestPaymentAndPlaySound] Sử dụng số tiền từ invoiceData:', amount);
            this.playPaymentSuccessSound(amount);
          }
        }
      });
    }, 1000); // Đợi 1 giây để webhook cập nhật dữ liệu
  }
  
  private playPaymentSuccessSound(amount: number): void {
    try {
      console.log('[playPaymentSuccessSound] Bắt đầu phát thông báo, số tiền:', amount);
      const roundedAmount = Math.round(amount);
      const formattedAmount = roundedAmount.toLocaleString('vi-VN');
      const message = `Thanh toán thành công số tiền ${formattedAmount} đồng`;
      console.log('[playPaymentSuccessSound] Nội dung thông báo:', message);

      const ttsUrl = `${environment.aiUrl}/tts?text=${encodeURIComponent(message)}`;
      let attempts = 0;
      const maxAttempts = 5;
      const retryDelayMs = 2000;
      const requestAudio = () => {
        this.http.get(ttsUrl, { responseType: 'blob' as 'json' }).subscribe({
          next: (audioBlob: any) => {
            const blob = audioBlob as Blob;
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio();
            audio.src = audioUrl;
            audio.onended = () => URL.revokeObjectURL(audioUrl);
            audio.onerror = () => URL.revokeObjectURL(audioUrl);
            const playPromise = audio.play();
            if (playPromise && typeof (playPromise as any).catch === 'function') {
              (playPromise as Promise<void>).catch((err) => {
                console.error('Audio play error:', err);
              });
            }
          },
          error: (error) => {
            attempts += 1;
            if (error?.status === 503 && attempts < maxAttempts) {
              setTimeout(requestAudio, retryDelayMs);
              return;
            }
            console.error('[playPaymentSuccessSound] Lỗi khi gọi TTS API:', error);
          }
        });
      };
      requestAudio();
    } catch (error) {
      console.error('[playPaymentSuccessSound] Lỗi khi phát âm thanh:', error);
    }
  }
  
  /**
   * Đóng modal SePay (người dùng đóng thủ công)
   * Sau khi đóng, hiển thị invoice ngay lập tức
   * Webhook sẽ tự động cập nhật trạng thái thanh toán sau
   */
  closeSePayModal(): void {
    // Đóng modal QR
    this.showSePayModal = false;
    this.cdr.markForCheck();
    
    // Dừng polling nếu có
    this.stopPaymentStatusPolling();
    
    // Lấy checkoutData và invoiceData đã lưu
    const checkoutData = this.pendingCheckoutData;
    const invoiceData = this.pendingInvoiceData;
    
    if (checkoutData && invoiceData) {
      // Hiển thị thông báo
      this.message.info('Đã lưu thông tin thanh toán. Hệ thống sẽ tự động cập nhật trạng thái khi nhận được xác nhận từ ngân hàng.');
      
      // Đóng modal checkout
      if (this.modalRef) {
        const closeResult = this.pendingCheckoutCloseResult || {
          success: true,
          action: 'checkout',
          checkoutInfo: {
            roomId: this.roomData?._id,
            roomNumber: this.roomData?.roomNumber,
            checkInTime: checkoutData?.checkInTime || checkoutData?.checkinTime,
            checkOutTime: checkoutData?.checkOutTime || checkoutData?.checkoutTime,
            customerName: checkoutData?.customerName || checkoutData?.guestName || checkoutData?.guestInfo?.name || 'Khách lẻ',
            guestSource: checkoutData?.guestInfo?.guestSource || invoiceData?.guestSource || 'walkin',
            paymentMethod: checkoutData?.paymentMethod || 'transfer',
            paymentStatus: checkoutData?.paymentStatus || 'paid',
            rateType: checkoutData?.rateType || 'hourly',
            roomTotal: Number(checkoutData?.roomTotal) || 0,
            servicesTotal: Array.isArray(checkoutData?.services)
              ? checkoutData.services.reduce((sum: number, s: any) => sum + (Number(s?.totalPrice) || (Number(s?.price) || 0) * (Number(s?.quantity) || 1)), 0)
              : 0,
            additionalCharges: Number(checkoutData?.additionalCharges) || 0,
            discount: Number(checkoutData?.discount) || 0,
            advancePayment: Number(checkoutData?.advancePayment) || 0,
            advancePaymentMethod: checkoutData?.advancePaymentMethod || 'cash',
            totalAmount: Number(checkoutData?.totalAmount) || 0,
            remainingAmount: Number(checkoutData?.remainingAmount) || 0,
            notes: checkoutData?.notes || ''
          }
        };
        this.pendingCheckoutCloseResult = null;
        this.modalRef.close(closeResult);
      }
      
      // Thực hiện checkout với paymentStatus = 'pending' (webhook sẽ cập nhật sau)
      this.roomsService.checkOutRoom(this.roomData._id, checkoutData)
        .subscribe(
          (response) => {
            this.finishCheckoutSuccess(response, invoiceData, {
              successMessage: 'Check-out thành công. Đang chờ xác nhận thanh toán...',
              showInvoice: true
            });
            this.resetSePayTransactionState();
          },
          (error) => {
            console.error('Error during checkout:', error);
            this.showInvoice(invoiceData);
            this.resetSePayTransactionState();
          }
        );
    } else {
      console.warn('[closeSePayModal] Không tìm thấy checkoutData hoặc invoiceData');
      this.resetSePayTransactionState();
    }
  }
  
  /**
   * Copy mã thanh toán vào clipboard
   */
  // Bỏ copyPaymentCode - không cần mã thanh toán nữa
  
  calculateDuration(checkInTime: Date, checkOutTime: Date): number {
    // Tính số ngày giữa check-in và check-out
    const diffTime = Math.abs(checkOutTime.getTime() - checkInTime.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 1; // Tối thiểu 1 ngày
  }
  
  calculateDurationInHours(checkInTime: Date, checkOutTime: Date): number {
    // Tính số giờ giữa check-in và check-out
    const diffTime = Math.abs(checkOutTime.getTime() - checkInTime.getTime());
    const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
    return diffHours > 0 ? diffHours : 1; // Tối thiểu 1 giờ
  }

  calculateRoomTotal(durationInHours: number, roomPrice: number): number {
    const hourlyRate = roomPrice / 24; // Giá theo giờ
    let total = 0;
    
    if (durationInHours <= 2) {
      // Nếu ở dưới 2 giờ, tính 30% giá ngày
      total = roomPrice * 0.3;
    } else if (durationInHours <= 6) {
      // Nếu ở dưới 6 giờ, tính 50% giá ngày
      total = roomPrice * 0.5;
    } else if (durationInHours < 24) {
      // Nếu ở dưới 24 giờ nhưng trên 6 giờ, tính 1 ngày
      total = roomPrice;
    } else {
      // Nếu ở từ 24 giờ trở lên, tính theo số ngày (làm tròn lên)
      const days = Math.ceil(durationInHours / 24);
      total = roomPrice * days;
    }
    
    return total;
  }

  // Room charge comes from POST /rooms/calculate-checkout-total.

  calculateServicesTotal(): number {
    // Tính tổng tiền dịch vụ từ danh sách dịch vụ đã chọn
    return this.selectedServices.reduce((total, service) => {
      // Sử dụng totalPrice nếu có, nếu không thì tính từ price và quantity
      const serviceTotal = service.totalPrice !== undefined ? 
        service.totalPrice : (service.price * service.quantity);
      return total + serviceTotal;
    }, 0);
  }

  // Xử lý dọn phòng
  cleanRoom(): void {
    // Kiểm tra trạng thái phòng
    if (this.roomData.status !== 'dirty' && this.roomData.status !== 'maintenance' && this.roomData.status !== 'cleaning') {
      this.message.error(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.ROOM_NOT_NEED_CLEANING_TOAST', {
        roomNumber: this.roomData.roomNumber,
        status: this.getStatusLabel(this.roomData.status)
      }));
      this.isLoading = false;
      return;
    }
    
    this.isLoading = true;
    
    const newRoom = {
      status: 'vacant',
      events: [
        ...this.roomData.events || [],
        {
          type: 'maintenance', // Sử dụng giá trị 'maintenance' thay vì 'maintenance_completed'
          completedTime: new Date(),
          notes: this.roomData.status === 'maintenance' ? 'Đã hoàn thành bảo trì' : 'Đã dọn dẹp phòng'
        }
      ]
    };
    
    // Đóng modal ngay — sơ đồ patch vacant optimistic qua afterClose
    if (this.modalRef) {
      this.modalRef.close({ success: true, status: 'vacant', action: 'clean' });
    }
    
    // Thực hiện clean room trong background
    this.roomsService.cleanRoom(this.roomData._id, newRoom)
      .subscribe(
        (room) => {
          const successMessage = this.roomData.status === 'maintenance'
            ? this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.MAINTENANCE_DONE_SUCCESS')
            : this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.ROOM_READY_SUCCESS');
          this.message.success(successMessage);
          this.emitRoomDataUpdated('cleaning', {
            roomId: this.roomData?._id,
            force: false,
            delayMs: 0,
            refreshRooms: false,
            refreshHistory: false
          });
        },
        (error) => {
          this.message.error(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.ROOM_STATUS_UPDATE_ERROR', { message: error.message }));
          this.emitRoomDataUpdated('cleaning', {
            roomId: this.roomData?._id,
            force: false,
            delayMs: 0,
            refreshRooms: true,
            refreshHistory: false
          });
        }
      );
  }

  // Xử lý submit form dựa theo loại modal
  submitForm(): void {
    switch (this.modalType) {
      case 'checkin':
        this.processCheckIn();
        break;
      case 'checkout':
        this.processCheckOut();
        break;
      case 'cleaning':
        this.cleanRoom();
        break;
      default:
        console.log('Không có hành động cho loại modal:', this.modalType);
    }
  }

  // Tiền phòng lấy từ quote server. Không tính phụ thu local.
  get roomPriceTotal(): number {
    if (this.modalType !== 'checkout' || !this._hasRoomPriceFromAPI) {
      return 0;
    }
    return this._roomPriceTotal;
  }

  // Thêm getter cho tiền dịch vụ
  get servicesPriceTotal(): number {
    // Ưu tiên trả về giá trị đã tính từ calculateTotalPrice
    if (this._servicesPriceTotal > 0 && this.modalType === 'checkout') {
      return this._servicesPriceTotal;
    }
    
    return this.selectedServices.reduce((total, service) => {
      // Sử dụng totalPrice nếu có, nếu không thì tính từ price và quantity
      const serviceTotal = service.totalPrice !== undefined ? 
        service.totalPrice : (service.price * service.quantity);
      return total + serviceTotal;
    }, 0);
  }

  /**
   * Kết thúc checkout: 1 lần emit + tắt điện nền + mở hóa đơn ngay (không chờ reload room).
   */
  private finishCheckoutSuccess(
    response: any,
    invoiceData: any,
    options?: { successMessage?: string; showInvoice?: boolean }
  ): void {
    const successMessage = options?.successMessage || this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.CHECKOUT_SUCCESS');
    const shouldShowInvoice = options?.showInvoice !== false;

    this.message.success(successMessage);

    if (this.roomData?._id) {
      this.roomSessionService.endSession(this.roomData._id);
      this.tuyaService.autoTurnOffOnCheckOut(this.roomData._id).subscribe({
        next: () => {},
        error: () => {}
      });
    }

    // Patch sơ đồ → dirty TRƯỚC khi mở hóa đơn (tránh board vẫn occupied)
    this.emitRoomDataUpdated('checkout', {
      roomId: this.roomData?._id || response?.room?._id,
      status: 'dirty',
      guestStatus: null,
      force: false,
      delayMs: 0,
      refreshRooms: false,
      refreshHistory: false
    });

    if (!shouldShowInvoice) {
      return;
    }

    const mergedInvoice = applyServerInvoice(invoiceData, response);
    // Mở hóa đơn sau 1 tick để CD kịp vẽ status dirty trên sơ đồ
    setTimeout(() => this.showInvoice(mergedInvoice), 0);
  }

  // Hiển thị hóa đơn
  showInvoice(invoiceData: any): void {
    // Đảm bảo hotelId luôn có trong invoiceData
    if (!invoiceData.hotelId) {
      invoiceData.hotelId = this.roomData?.hotelId || this.authService.getHotelId() || this.currentUser?.hotelId;
    }

    // Stamp hotel header từ businessInfo đã load sẵn → invoice mở không chờ API
    const hotel = this.businessInfo;
    if (hotel) {
      if (!invoiceData.businessName || invoiceData.businessName === 'Khách sạn') {
        invoiceData.businessName = hotel.name || hotel.legalName || 'Khách sạn';
      }
      if (!invoiceData.business_address) {
        const addr = hotel.address;
        invoiceData.business_address = typeof addr === 'string'
          ? addr
          : [addr?.street, addr?.city, addr?.state, addr?.country].filter(Boolean).join(', ');
      }
      if (!invoiceData.phoneNumber) {
        invoiceData.phoneNumber = hotel.contactInfo?.phone || hotel.phoneNumber || hotel.phone || '';
      }
      if (!invoiceData.hotelInfo) {
        invoiceData.hotelInfo = hotel;
      }
    }
    
    // Đảm bảo dữ liệu dịch vụ được chuẩn bị đúng
    if (invoiceData.services && invoiceData.services.length > 0) {
      invoiceData.services = invoiceData.services.map((service: any) => ({
        name: service.name || service.serviceName,
        price: service.price || 0,
        quantity: service.quantity || 1,
        totalPrice: (service.price || 0) * (service.quantity || 1)
      }));
    }

    // Đảm bảo định dạng ngày và giờ
    if (invoiceData.checkInTime) {
      const checkInDate = new Date(invoiceData.checkInTime);
      invoiceData.formattedCheckInTime = this.datePipe.transform(checkInDate, 'dd/MM/yyyy HH:mm', '+0700');
    }

    if (invoiceData.checkOutTime) {
      const checkOutDate = new Date(invoiceData.checkOutTime);
      invoiceData.formattedCheckOutTime = this.datePipe.transform(checkOutDate, 'dd/MM/yyyy HH:mm', '+0700');
    }

    // Đảm bảo số ngày và số giờ được định nghĩa
    if (!invoiceData.duration) {
      invoiceData.duration = {
        days: 1,
        hours: 24
      };
    }

    // Sử dụng NzModalService để tạo modal
    const modal: NzModalRef = this.modalService.create({
      nzTitle: 'Hóa đơn thanh toán',
      nzContent: InvoiceComponent,
      nzWidth: '800px',
      nzData: {
        invoiceData: invoiceData,
        businessInfo: this.businessInfo || invoiceData.hotelInfo || null
      },
      nzFooter: [
        {
          label: 'Đóng',
          onClick: () => modal.destroy()
        },
        {
          label: 'In hóa đơn',
          type: 'primary',
          onClick: () => {
            const instance = modal.getContentComponent();
            if (instance && instance.printInvoice) {
              instance.printInvoice();
            }
          }
        }
      ]
    });

    modal.afterClose.subscribe((result: any) => {
      console.log('Invoice modal closed', result);
    });
  }

  // Hàm public để đóng modal từ template
  closeModal(): void {
    this.modalRef.destroy();
  }

  // Helper: Lấy label cho trạng thái phòng
  getStatusLabel(status: string): string {
    const labels: {[key: string]: string} = {
      'vacant': 'Trống',
      'occupied': 'Đang sử dụng',
      'dirty': 'Cần dọn dẹp',
      'cleaning': 'Đang dọn dẹp',
      'maintenance': 'Bảo trì'
    };
    return labels[status] || status;
  }

  createCheckOutForm(): void {
    this.checkOutForm = this.fb.group({
      guestInfo: this.fb.group({
        name: ['Khách lẻ'],
        idNumber: [''],
        tax_code: [''], 
        phone: ['', [Validators.pattern('^[0-9]{10}$')]],
        email: ['', [Validators.email]],
        address: [''],
        guestSource: ['walkin'] 
      }),
      paymentMethod: ['cash', [Validators.required]],
      rateType: ['hourly', [Validators.required]], 
      advancePayment: [0, [Validators.min(0)]],
      advancePaymentMethod: ['cash', [Validators.required]], 
      notes: [''],
      additionalCharges: [0],
      discount: [0],
      reason: [''],
      createDebt: [false] 
    });
    
    // THÊM DEBOUNCETIME CHỐNG GỌI TÍNH TIỀN LIÊN TỤC
    this.checkOutForm.get('rateType')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((newRateType) => {
        console.log('RateType changed to:', newRateType);
        this._roomPriceTotal = 0;
        this._hasRoomPriceFromAPI = false;
        this.roomPriceDetails = null;
        this.refreshCheckoutQuote().subscribe({
          error: () => this.message.error(this.translate.instant('ROOM_CONTENT_MODAL.QUOTE_ERROR'))
        });
    });
    
    this.checkOutForm.get('additionalCharges')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe(() => {
        this.calculateTotalPrice();
    });
    
    this.checkOutForm.get('discount')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe(() => {
        this.calculateTotalPrice();
    });
    
    this.checkOutForm.get('advancePayment')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((val) => {
        this.advancePayment = Number(val) || 0;
        this.calculateTotalPrice();
        // Đổi số tiền → prefetch lại mã CK nếu đang chọn chuyển khoản
        if (this.normalizePaymentMethod(this.checkOutForm.get('paymentMethod')?.value) === 'transfer') {
          this.prefetchSePayPaymentCode();
        }
    });

    this.checkOutForm.get('paymentMethod')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((method) => {
        if (this.normalizePaymentMethod(method) === 'transfer') {
          this.prefetchSePayPaymentCode();
        } else {
          this.prefetchedSePay = null;
          this.sepayPaymentCode = '';
        }
      });
  }
  
  private getOcrSourceData(ocrData: any): Record<string, any> {
    if (ocrData?.result?.data && typeof ocrData.result.data === 'object') {
      return ocrData.result.data;
    }
    if (ocrData?.data && typeof ocrData.data === 'object') {
      return ocrData.data;
    }
    return ocrData || {};
  }

  private getOcrValue(ocrData: any, keys: string[]): string {
    const source = this.getOcrSourceData(ocrData);
    for (const key of keys) {
      const value = source?.[key] ?? ocrData?.[key];
      if (value !== undefined && value !== null && `${value}`.trim() !== '') {
        return `${value}`.trim();
      }
    }
    return '';
  }

  // Xử lý khi OCR scan hoàn thành
  onOCRScanComplete(ocrData: any): void {
    if (!ocrData || !this.checkOutForm) return;

    const guestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
    if (!guestInfoFormGroup) return;

    const source = this.getOcrSourceData(ocrData);
    const idNumber = this.getOcrValue(ocrData, ['Số ID', 'Số CCCD', 'idNumber', 'cccd']).replace(/\s+/g, '');
    const fullName = this.getOcrValue(ocrData, ['Họ tên', 'Họ và tên', 'fullName', 'name']);
    const fullNameLegacy = `${source?.['lastName'] || ocrData?.lastName || ''} ${source?.['firstName'] || ocrData?.firstName || ''}`.trim();
    const phone = this.getOcrValue(ocrData, ['Số điện thoại', 'phone']);
    const address = this.getOcrValue(ocrData, ['Địa chỉ thường trú', 'Địa chỉ', 'address', 'Quê quán']);

    if (idNumber) {
      guestInfoFormGroup.patchValue({ idNumber });
    }
    if (fullName || fullNameLegacy) {
      guestInfoFormGroup.patchValue({ name: fullName || fullNameLegacy });
    }
    if (phone) {
      guestInfoFormGroup.patchValue({ phone });
    }
    if (address) {
      guestInfoFormGroup.patchValue({ address });
    }

    this.message.success(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.OCR_FILLED'));
  }

  // Mở modal để lưu thông tin khách vào guest-management
  openGuestSaveModal(): void {
    if (!this.roomData || !this.roomData._id) {
      this.message.error(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.ROOM_INFO_NOT_FOUND'));
      return;
    }
    
    // Lấy thông tin khách từ form nếu có
    let guestInfo: any = null;
    if (this.checkOutForm) {
      const guestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
      if (guestInfoFormGroup) {
        guestInfo = guestInfoFormGroup.disabled ? guestInfoFormGroup.getRawValue() : guestInfoFormGroup.value;
      }
    }
    
    // Mở modal GuestSaveModalComponent
    const modalRef = this.modalService.create({
      nzTitle: 'Lưu thông tin khách',
      nzContent: GuestSaveModalComponent,
      nzFooter: null,
      nzWidth: 900,
      nzMaskClosable: false,
      nzData: {
        room: this.roomData,
        guestInfo: guestInfo
      }
    });
    
    modalRef.afterClose.subscribe((result) => {
      if (result && result.success) {
        this.message.success(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.GUEST_ASSIGNED_SUCCESS'));
        // Reload room data
        this.roomsService.getRoomById(this.roomData._id).subscribe({
          next: (updatedRoom) => {
            this.roomData = updatedRoom;
            // Reload lại dữ liệu phòng
            this.ngOnInit();
            
            // Thông báo cho room.component để reload
            this.emitRoomDataUpdated('generic', { roomId: this.roomData?._id, force: false, delayMs: 100 });
          },
          error: (error) => {
            console.error('Error reloading room:', error);
            // Vẫn thông báo để room.component reload
            this.emitRoomDataUpdated('generic', { roomId: this.roomData?._id, force: false, delayMs: 100 });
          }
        });
      }
    });
  }

  // Lưu thông tin khách và tiền đặt trước — optimistic (UI phản hồi ngay)
  saveGuestInfo(): void {
    if (!this.checkOutForm) {
      console.error('checkOutForm is not initialized');
      return;
    }

    if (!this.roomData || !this.roomData._id) {
      this.message.error(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.ROOM_INFO_NOT_FOUND'));
      return;
    }

    if (this.isSaving) {
      return;
    }

    this.isSaving = true;

    const guestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
    const guestInfo = guestInfoFormGroup
      ? (guestInfoFormGroup.disabled ? guestInfoFormGroup.getRawValue() : guestInfoFormGroup.value)
      : (this.checkOutForm.get('guestInfo')?.value || {});

    const guestSourceControl = guestInfoFormGroup?.get('guestSource');
    const guestSourceValue = guestSourceControl
      ? (guestSourceControl.disabled ? guestSourceControl.getRawValue() : guestSourceControl.value)
      : (guestInfo.guestSource || null);

    const advancePayment = Number(this.checkOutForm.get('advancePayment')?.value) || 0;
    const advancePaymentMethodControl = this.checkOutForm.get('advancePaymentMethod');
    const advancePaymentMethod = advancePaymentMethodControl
      ? ((advancePaymentMethodControl.disabled ? advancePaymentMethodControl.getRawValue() : advancePaymentMethodControl.value) || 'cash')
      : 'cash';

    const checkoutCharges = Number(this.checkOutForm.get('additionalCharges')?.value) || 0;
    const checkoutDiscount = Number(this.checkOutForm.get('discount')?.value) || 0;
    const additionalCharges = this.initialCharges + checkoutCharges;
    const discount = this.initialDiscount + checkoutDiscount;
    const rateTypeControl = this.checkOutForm?.get('rateType');
    const rateTypeRaw = rateTypeControl
      ? (rateTypeControl.disabled ? rateTypeControl.getRawValue() : rateTypeControl.value)
      : null;
    const rateType =
      rateTypeRaw ||
      (this.listData && this.listData.length > 0 ? this.listData[0].rateType : null) ||
      'hourly';
    const notes = this.checkOutForm?.get('notes')?.value || this.initialNotes || '';

    let guestSource = guestSourceValue || 'walkin';
    if (!guestSourceValue && this.roomData.events && this.roomData.events.length > 0) {
      const checkinEvents = this.getUncheckedOutCheckinEvents(this.roomData.events);
      if (checkinEvents.length > 0 && checkinEvents[0].guestInfo?.guestSource) {
        guestSource = checkinEvents[0].guestInfo.guestSource;
      }
    }

    const updatedGuestInfo = {
      name: guestInfo.name || 'Khách lẻ',
      idNumber: guestInfo.idNumber || '',
      tax_code: guestInfo.tax_code || '',
      phone: guestInfo.phone || '',
      email: guestInfo.email || '',
      address: guestInfo.address || '',
      guestSource: guestSource
    };

    const previousAdvancePayment = Number(this.initialAdvancePayment) || 0;
    const checkinTime =
      this.listData && this.listData.length > 0 && this.listData[0]?.checkinTime
        ? this.listData[0].checkinTime
        : new Date();

    // 1) Cập nhật local ngay — UI cảm giác tức thì
    this.initialNotes = notes;
    this.initialCharges = additionalCharges;
    this.initialDiscount = discount;
    this.advancePayment = advancePayment;

    if (this.listData && this.listData.length > 0) {
      this.listData[0].guestInfo = updatedGuestInfo;
      this.listData[0].advancePayment = advancePayment;
      this.listData[0].advancePaymentMethod = advancePaymentMethod;
      this.listData[0].rateType = rateType;
      this.listData[0].additionalCharges = additionalCharges;
      this.listData[0].discount = discount;
      this.listData[0].notes = notes;
      this.listData[0].selectedServices = [...(this.selectedServices || [])];
    }

    if (this.roomData.events && Array.isArray(this.roomData.events)) {
      const checkinEvents = this.getUncheckedOutCheckinEvents(this.roomData.events);
      if (checkinEvents.length > 0) {
        checkinEvents[0].rateType = rateType;
        checkinEvents[0].guestInfo = updatedGuestInfo;
        checkinEvents[0].advancePayment = advancePayment;
        checkinEvents[0].advancePaymentMethod = advancePaymentMethod;
        checkinEvents[0].additionalCharges = additionalCharges;
        checkinEvents[0].discount = discount;
        checkinEvents[0].notes = notes;
        checkinEvents[0].selectedServices = [...(this.selectedServices || [])];
      }
    }

    if (guestInfoFormGroup) {
      if (guestInfoFormGroup.disabled) {
        guestInfoFormGroup.enable({ emitEvent: false });
      }
      guestInfoFormGroup.patchValue(
        {
          name: updatedGuestInfo.name,
          idNumber: updatedGuestInfo.idNumber,
          tax_code: updatedGuestInfo.tax_code || '',
          phone: updatedGuestInfo.phone,
          email: updatedGuestInfo.email,
          address: updatedGuestInfo.address,
          guestSource: updatedGuestInfo.guestSource
        },
        { emitEvent: false }
      );
    }

    this.checkOutForm.patchValue(
      {
        advancePayment: advancePayment,
        rateType: rateType,
        notes: notes
      },
      { emitEvent: false }
    );

    this.calculateTotalPrice();
    this.message.success(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.GUEST_SAVED'));
    this.isSaving = false;

    const hotelId = this.normalizeObjectId(
      this.roomData.hotelId || this.authService.getHotelId() || this.currentUser?.hotelId
    );
    const checkinInfo = {
      roomId: this.roomData._id,
      roomNumber: this.roomData.roomNumber,
      checkinTime,
      guestInfo: updatedGuestInfo,
      advancePayment,
      advancePaymentMethod,
      rateType,
      notes,
      additionalCharges,
      discount,
      selectedServices: this.selectedServices || [],
      paymentMethod:
        this.checkOutForm?.get('paymentMethod')?.value ||
        (this.listData && this.listData.length > 0 ? this.listData[0].paymentMethod : null) ||
        'cash'
    };

    // Đồng bộ RoomSession (roomSessions:v2) ngay — nguồn sự thật cho sơ đồ phòng
    const roomId = String(this.roomData._id);
    const existingSession = this.roomSessionService.getSession(roomId);
    if (existingSession) {
      this.roomSessionService.updateSession(roomId, {
        guestInfo: updatedGuestInfo,
        advancePayment,
        advancePaymentMethod,
        rateType,
        notes,
        additionalCharges,
        discount,
        selectedServices: this.selectedServices || []
      });
    } else if (hotelId) {
      this.roomSessionService.startSession(roomId, {
        roomId,
        roomNumber: this.roomData.roomNumber,
        roomType: this.roomData.type,
        hotelId: String(hotelId),
        checkinTime: new Date(checkinTime),
        guestInfo: updatedGuestInfo,
        paymentMethod: checkinInfo.paymentMethod,
        rateType,
        advancePayment,
        advancePaymentMethod,
        additionalCharges,
        discount,
        notes,
        selectedServices: this.selectedServices || []
      });
    }

    // Đóng modal ngay kèm checkinInfo để sơ đồ patch rateType tức thì
    if (this.modalRef) {
      this.modalRef.close({
        success: true,
        action: 'save_guest_info',
        roomId: this.roomData._id,
        checkinInfo
      });
    }

    this.emitRoomDataUpdated('checkin_info', {
      roomId: this.roomData._id,
      status: 'occupied',
      force: false,
      delayMs: 0,
      refreshRooms: false,
      refreshHistory: false,
      checkinInfo
    });

    // 2) Persist nền: Redis checkin_* + API + phiếu thu
    if (hotelId) {
      this.apiService.saveCheckinData(hotelId, this.roomData._id, checkinInfo).subscribe({
        error: (err) => console.error('[Redis] Error saving checkin data:', err)
      });
    }

    this.createAdvancePaymentIncomeIfNeeded(
      advancePayment,
      previousAdvancePayment,
      advancePaymentMethod,
      updatedGuestInfo,
      { source: 'advance_payment_save' }
    );

    this.roomsService
      .updateRoomCheckinInfo(
        this.roomData._id,
        updatedGuestInfo,
        advancePayment,
        rateType,
        additionalCharges,
        discount,
        this.selectedServices,
        advancePaymentMethod,
        notes
      )
      .subscribe({
        next: () => {
          this.roomsService
            .getRoomById(this.roomData._id, { limit: 1000, excludeCheckedOut: true })
            .subscribe({
              next: (updatedRoom) => {
                this.roomData = updatedRoom;
                this.emitRoomDataUpdated('checkin_info', {
                  roomId: this.roomData?._id,
                  status: 'occupied',
                  force: false,
                  delayMs: 0,
                  refreshRooms: false,
                  refreshHistory: false,
                  checkinInfo
                });
              },
              error: () => {
                /* đã emit trước đó */
              }
            });
        },
        error: (err) => {
          console.error('Error updating checkin info:', err);
          this.message.warning(
            'Đã lưu tạm trên máy, nhưng đồng bộ server lỗi: ' +
              (err.error?.message || err.message || 'không xác định')
          );
        }
      });
  }

  private createAdvancePaymentIncomeIfNeeded(
    advancePayment: number,
    previousAdvancePayment: number,
    advancePaymentMethod: string,
    updatedGuestInfo: { name?: string },
    options?: { source?: string; silent?: boolean }
  ): void {
    try {
      const hotelId = this.normalizeObjectId(this.roomData.hotelId || this.authService.getHotelId() || this.currentUser?.hotelId);
      const payerName = updatedGuestInfo?.name || 'Khách lẻ';
      const baseline = Number(previousAdvancePayment ?? this.initialAdvancePayment) || 0;
      const advanceDiff = Number(advancePayment || 0) - baseline;
      if (!hotelId || advanceDiff <= 0) return;

      const methodForTransaction = this.mapToTransactionMethod(advancePaymentMethod);
      const bookingId = this.normalizeObjectId(
        typeof this.roomData.currentBooking === 'string'
          ? this.roomData.currentBooking
          : (this.roomData.currentBooking && typeof this.roomData.currentBooking === 'object' ? (this.roomData.currentBooking as any)._id : undefined)
      ) || undefined;
      const source = options?.source || 'advance_payment';
      this.transactionService.createIncome({
        hotelId: hotelId,
        amount: advanceDiff,
        method: methodForTransaction,
        incomeCategory: 'deposit',
        description: `[Đặt trước] Phòng ${this.roomData.roomNumber}`,
        notes: `Đặt trước phòng ${this.roomData.roomNumber} - ${payerName}`,
        payer: payerName,
        bookingId: bookingId,
        metadata: {
          source,
          roomId: String(this.roomData._id),
          roomNumber: String(this.roomData.roomNumber || ''),
          bookingId: bookingId || null,
          payer: payerName,
          previousAdvancePayment: baseline,
          newAdvancePayment: Number(advancePayment) || 0
        }
      }).subscribe({
        next: () => {
          // Đánh dấu phần đã tạo phiếu thu để tránh tạo trùng khi lưu/checkout tiếp
          this.initialAdvancePayment = Number(advancePayment) || 0;
          if (this.listData && this.listData.length > 0) {
            this.listData[0].advancePayment = this.initialAdvancePayment;
          }
          console.log(
            'Đã tạo phiếu thu đặt trước phòng',
            this.roomData.roomNumber,
            'amount:',
            advanceDiff,
            'method:',
            methodForTransaction,
            'source:',
            source
          );
          if (!options?.silent) {
            this.message.success(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.ADVANCE_RECEIPT_CREATED', {
              amount: advanceDiff.toLocaleString('vi-VN')
            }));
          }
        },
        error: (err) => {
          console.error('Lỗi tạo phiếu thu đặt trước:', err);
          this.message.error(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.ADVANCE_RECEIPT_ERROR', {
            message: err?.error?.message || err?.message || this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.UNKNOWN_ERROR')
          }));
        }
      });
    } catch (e) {
      console.error('Lỗi khi tạo phiếu thu đặt trước:', e);
    }
  }

  private normalizeObjectId(value: any): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value._id) return String(value._id);
    return String(value);
  }

  private prepareSePayModalState(
    amount: number,
    qrPaymentUrl: string,
    beneficiaryName: string,
    bankName: string,
    accountNumber: string,
    checkoutData: any,
    invoiceData: any
  ): void {
    this.stopPaymentStatusPolling(false);
    this.paymentSuccessHandled = false;
    this.sepayPaymentConfirmed = false;
    this.activeSePayTransactionToken = `${this.roomData?._id || 'room'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.sepayPaymentHistoryId = '';
    this.sepayAmount = amount;
    this.sepayQrUrl = qrPaymentUrl;
    this.sepayBeneficiaryName = beneficiaryName;
    this.sepayBankName = bankName;
    this.sepayAccountNumber = accountNumber;
    this.pendingCheckoutData = checkoutData;
    this.pendingInvoiceData = invoiceData;
    this.showSePayModal = true;
    this.cdr.markForCheck();
  }

  private checkPaymentStatusOnce(transactionToken: string, isLastAttempt: boolean = false): void {
    if (
      this.paymentStatusCheckInFlight ||
      (!this.sepayPaymentHistoryId && !this.sepayPaymentCode) ||
      !this.showSePayModal ||
      this.paymentSuccessHandled ||
      transactionToken !== this.activeSePayTransactionToken
    ) {
      return;
    }

    this.paymentStatusCheckInFlight = true;
    const roomId = this.normalizeObjectId(this.roomData?._id) || undefined;

    this.sepayService.getPaymentStatus({
      paymentHistoryId: this.sepayPaymentHistoryId || undefined,
      paymentCode: this.sepayPaymentHistoryId ? undefined : (this.sepayPaymentCode || undefined),
      roomId: roomId || undefined,
      paymentType: 'room_checkout'
    }).subscribe({
      next: (response: any) => {
        this.paymentStatusCheckInFlight = false;

        if (transactionToken !== this.activeSePayTransactionToken || this.paymentSuccessHandled) {
          return;
        }

        if (!response?.found) {
          if (isLastAttempt) {
            this.stopPaymentStatusPolling();
          }
          return;
        }

        if (response.paymentHistoryId && !this.sepayPaymentHistoryId) {
          this.sepayPaymentHistoryId = String(response.paymentHistoryId);
        }

        const status = String(response.status || '').toLowerCase();
        if (response.completed || status === 'completed' || status === 'paid') {
          this.stopPaymentStatusPolling(false);
          this.onPaymentSuccess();
          return;
        }

        if (status === 'failed' || status === 'cancelled') {
          this.stopPaymentStatusPolling();
          this.message.warning('Thanh toán đã bị hủy hoặc thất bại. Vui lòng thử lại.');
        }
      },
      error: (error) => {
        this.paymentStatusCheckInFlight = false;
        if (transactionToken !== this.activeSePayTransactionToken) {
          return;
        }
        console.error('Error checking payment status:', error);
        if (isLastAttempt) {
          this.stopPaymentStatusPolling();
        }
      }
    });
  }

  private resetSePayTransactionState(): void {
    this.stopPaymentStatusPolling(false);
    this.sepayInitializing = false;
    this.paymentSuccessHandled = false;
    this.sepayPaymentConfirmed = false;
    this.activeSePayTransactionToken = '';
    this.sepayPaymentHistoryId = '';
    this.sepayPaymentCode = '';
    this.pendingCheckoutData = null;
    this.pendingInvoiceData = null;
  }

  copySePayPaymentCode(): void {
    const code = String(this.sepayPaymentCode || '').trim();
    if (!code || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }
    navigator.clipboard.writeText(code).then(
      () => this.message.success(this.translate.instant('ROOM_CONTENT_MODAL.MESSAGES.PAYMENT_CODE_COPIED')),
      () => this.message.warning('Không copy được mã thanh toán')
    );
  }

  private emitRoomDataUpdated(
    reason: 'checkin' | 'checkout' | 'recheckin' | 'delete_checkout_history' | 'cleaning' | 'dirty' | 'maintenance' | 'status' | 'transfer' | 'generic' | 'checkin_info',
    options?: {
      roomId?: string;
      relatedRoomId?: string;
      force?: boolean;
      delayMs?: number;
      refreshRooms?: boolean;
      refreshHistory?: boolean;
      status?: string;
      guestStatus?: string | null;
      checkinInfo?: any;
    }
  ): void {
    const hotelId = this.normalizeObjectId(this.roomData?.hotelId || this.authService.getHotelId() || this.currentUser?.hotelId);
    const statusOnly =
      reason === 'cleaning' ||
      reason === 'dirty' ||
      reason === 'maintenance' ||
      reason === 'status';
    const checkoutStatus =
      reason === 'checkout'
        ? { status: options?.status || 'dirty', guestStatus: options?.guestStatus ?? null }
        : { status: options?.status, guestStatus: options?.guestStatus };

    // Optimistic trên roomData trong modal — parent đọc qua emit
    if (reason === 'checkout' && this.roomData) {
      (this.roomData as any).status = checkoutStatus.status || 'dirty';
      (this.roomData as any).guestStatus = undefined;
      (this.roomData as any).currentBooking = null;
      (this.roomData as any).events = [];
    }

    this.roomsService.notifyRoomDataUpdated({
      hotelId: hotelId || undefined,
      roomId: options?.roomId,
      relatedRoomId: options?.relatedRoomId,
      reason,
      status: checkoutStatus.status,
      guestStatus: checkoutStatus.guestStatus,
      checkinInfo: options?.checkinInfo,
      // Status / local checkin-checkout đã patch — không GET lại cả phòng
      refreshRooms: options?.refreshRooms ?? (!statusOnly && reason !== 'checkin' && reason !== 'checkout' && reason !== 'checkin_info'),
      refreshHistory: options?.refreshHistory ?? (reason === 'checkout' || reason === 'recheckin' || reason === 'delete_checkout_history'),
      force: options?.force ?? false,
      delayMs: options?.delayMs ?? 0
    });
  }
  
  // Getter để lấy phụ thu checkin sớm từ roomPriceDetails
  getEarlyCheckinSurcharge(): number {
    if (!this.roomPriceDetails) return 0;
    
    // Kiểm tra breakdown trước (cho hourly rate với nightly period)
    if (this.roomPriceDetails.breakdown?.beforeNightly?.earlyCheckinSurcharge) {
      return this.roomPriceDetails.breakdown.beforeNightly.earlyCheckinSurcharge;
    }
    
    // Kiểm tra trực tiếp từ roomPriceDetails
    if (this.roomPriceDetails.earlyCheckinSurcharge) {
      return this.roomPriceDetails.earlyCheckinSurcharge;
    }
    
    return 0;
  }
  
  // Getter để lấy số giờ checkin sớm
  getEarlyCheckinHours(): number {
    if (!this.roomPriceDetails) return 0;
    
    // Kiểm tra breakdown trước (cho hourly rate với nightly period)
    if (this.roomPriceDetails.breakdown?.beforeNightly?.hours) {
      return this.roomPriceDetails.breakdown.beforeNightly.hours;
    }
    
    // Kiểm tra trực tiếp từ roomPriceDetails
    if (this.roomPriceDetails.earlyCheckinHours) {
      return this.roomPriceDetails.earlyCheckinHours;
    }
    
    return 0;
  }
  
  // Getter để lấy phụ thu checkout trễ từ roomPriceDetails
  getLateCheckoutSurcharge(): number {
    if (!this.roomPriceDetails) return 0;
    
    // Kiểm tra breakdown trước (cho hourly rate với nightly period)
    if (this.roomPriceDetails.breakdown?.afterNightly?.lateCheckoutSurcharge) {
      return this.roomPriceDetails.breakdown.afterNightly.lateCheckoutSurcharge;
    }
    
    // Kiểm tra trực tiếp từ roomPriceDetails
    if (this.roomPriceDetails.lateCheckoutSurcharge) {
      return this.roomPriceDetails.lateCheckoutSurcharge;
    }
    
    return 0;
  }
  
  // Getter để lấy số giờ checkout trễ
  getLateCheckoutHours(): number {
    if (!this.roomPriceDetails) return 0;
    
    // Kiểm tra breakdown trước (cho hourly rate với nightly period)
    if (this.roomPriceDetails.breakdown?.afterNightly?.hours) {
      return this.roomPriceDetails.breakdown.afterNightly.hours;
    }
    
    // Kiểm tra trực tiếp từ roomPriceDetails
    if (this.roomPriceDetails.lateCheckoutHours) {
      return this.roomPriceDetails.lateCheckoutHours;
    }
    
    return 0;
  }
  
  // Getter để lấy số tiền qua đêm (basePrice)
  getBaseRoomPrice(): number {
    if (!this.roomPriceDetails) return 0;
    
    // Kiểm tra breakdown trước (cho hourly rate với nightly period)
    if (this.roomPriceDetails.breakdown?.nightly?.price) {
      return this.roomPriceDetails.breakdown.nightly.price;
    }
    
    // Kiểm tra trực tiếp từ roomPriceDetails
    if (this.roomPriceDetails.basePrice) {
      return this.roomPriceDetails.basePrice;
    }
    
    return 0;
  }
  
  // Getter để lấy số đêm (nights)
  getNights(): number {
    if (!this.roomPriceDetails) return 0;
    
    // Kiểm tra breakdown trước (cho hourly rate với nightly period)
    if (this.roomPriceDetails.breakdown?.nightly?.nights) {
      return this.roomPriceDetails.breakdown.nightly.nights;
    }
    
    // Kiểm tra trực tiếp từ roomPriceDetails
    if (this.roomPriceDetails.nights) {
      return this.roomPriceDetails.nights;
    }
    
    return 0;
  }
  
  // Getter để lấy số giờ (hours) - cho hourly rate
  getHours(): number {
    if (!this.roomPriceDetails) return 0;
    
    // Kiểm tra breakdown trước (cho hourly rate với nightly period)
    if (this.roomPriceDetails.breakdown?.hourly?.hours) {
      return this.roomPriceDetails.breakdown.hourly.hours;
    }
    
    // Kiểm tra trực tiếp từ roomPriceDetails
    if (this.roomPriceDetails.hours) {
      return this.roomPriceDetails.hours;
    }
    
    return 0;
  }
  
  // Getter để lấy giá theo giờ (hourlyPrice) - cho hourly rate
  getHourlyPrice(): number {
    if (!this.roomPriceDetails) return 0;
    
    // Kiểm tra breakdown trước (cho hourly rate với nightly period)
    if (this.roomPriceDetails.breakdown?.hourly?.price) {
      return this.roomPriceDetails.breakdown.hourly.price;
    }
    
    // Kiểm tra trực tiếp từ roomPriceDetails
    if (this.roomPriceDetails.hourlyPrice) {
      return this.roomPriceDetails.hourlyPrice;
    }
    
    // Nếu có basePrice và rateType là hourly
    if (this.roomPriceDetails.basePrice && this.roomPriceDetails.rateType === 'hourly') {
      return this.roomPriceDetails.basePrice;
    }
    
    return 0;
  }
  
  // Debug method để kiểm tra roomPriceDetails
  debugRoomPriceDetails(): void {
    console.log('roomPriceDetails:', this.roomPriceDetails);
    console.log('getEarlyCheckinSurcharge():', this.getEarlyCheckinSurcharge());
    console.log('getEarlyCheckinHours():', this.getEarlyCheckinHours());
    console.log('getLateCheckoutSurcharge():', this.getLateCheckoutSurcharge());
    console.log('getLateCheckoutHours():', this.getLateCheckoutHours());
    console.log('getBaseRoomPrice():', this.getBaseRoomPrice());
    console.log('getNights():', this.getNights());
    console.log('getHours():', this.getHours());
    console.log('getHourlyPrice():', this.getHourlyPrice());
  }
}

