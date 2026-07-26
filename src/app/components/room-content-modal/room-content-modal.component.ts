import { Component, Inject, OnInit, Input, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
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
import { debounceTime, distinctUntilChanged, takeUntil, take } from 'rxjs/operators'
import { Subject } from 'rxjs';

// Interface cho dá»¯ liá»‡u cáº­p nháº­t phÃ²ng
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
  services: any[] = []; // Load tá»« API
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
  totalPrice = 0; // Tá»•ng cá»™ng = tiá»n phÃ²ng + phá»¥ thu + tiá»n dá»‹ch vá»¥
  remainingAmount = 0; // CÃ²n láº¡i pháº£i thanh toÃ¡n = tá»•ng cá»™ng - Ä‘áº·t trÆ°á»›c - khuyáº¿n mÃ£i (cho phÃ©p sá»‘ Ã¢m)
  private _roomPriceTotal = 0; // Tá»•ng tiá»n phÃ²ng (private Ä‘á»ƒ trÃ¡nh conflict vá»›i getter)
  private _servicesPriceTotal = 0; // Tá»•ng tiá»n dá»‹ch vá»¥ (private Ä‘á»ƒ trÃ¡nh conflict vá»›i getter)
  private _hasRoomPriceFromAPI = false; // Flag Ä‘á»ƒ biáº¿t Ä‘Ã£ cÃ³ giÃ¡ trá»‹ tá»« API chÆ°a
  roomPriceDetails: any = null; // Chi tiáº¿t tÃ­nh tiá»n phÃ²ng (bao gá»“m phá»¥ thu sá»›m/trá»…)
  advancePayment = 0;
  skipValidation = false;
  modalType: string = 'info'; // Loáº¡i modal: checkin, checkout, cleaning
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
  // Bá» sepayPaymentCode - khÃ´ng cáº§n mÃ£ thanh toÃ¡n ná»¯a
  sepayAmount = 0;
  sepayQrUrl = '';
  sepayBeneficiaryName = '';
  sepayBankName = '';
  sepayAccountNumber = '';
  sepayPaymentHistoryId: string = ''; // ID cá»§a payment history Ä‘á»ƒ kiá»ƒm tra tráº¡ng thÃ¡i
  sepayInitializing = false;
  currentUser: any = null;
  hotelBankAccount: any = null; // ThÃ´ng tin ngÃ¢n hÃ ng cá»§a hotel
  private paymentStatusCheckInterval: any = null; // Interval Ä‘á»ƒ kiá»ƒm tra tráº¡ng thÃ¡i thanh toÃ¡n
  private paymentStatusCheckInFlight = false;
  private paymentSuccessHandled = false;
  private activeSePayTransactionToken = '';
  private pendingCheckoutCloseResult: any = null;
  private pendingCheckoutData: any = null;
  private pendingInvoiceData: any = null;
  
  // Äá»‹nh dáº¡ng hiá»ƒn thá»‹ tiá»n Viá»‡t Nam
  formatterVND = (value: number): string => `${value} Ä‘`;
  parserVND = (value: string): string => {
    if (value === null || value === undefined) return '';
    const cleaned = String(value).replace(/[^\d]/g, '');
    return cleaned;
  };
  
  selectAllMoneyInput(event: FocusEvent): void {
    const target = event?.target as HTMLInputElement | null;
    if (!target) return;
    setTimeout(() => {
      try {
        target.select();
      } catch (_e) {}
    }, 0);
  }
  
  // Láº¥y thá»i gian hiá»‡n táº¡i theo UTC+7 (mÃºi giá» Viá»‡t Nam)
  getCurrentTime(): Date {
    return this.currentTime;
  }
  
  // Láº¥y thÃ´ng tin chuyá»ƒn phÃ²ng tá»« Booking
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
      // Láº¥y sá»‘ phÃ²ng tá»« transferHistory náº¿u cÃ³
      let fromRoomNumber = 'N/A';
      let toRoomNumber = 'N/A';
      
      if (booking.transferHistory && Array.isArray(booking.transferHistory) && booking.transferHistory.length > 0) {
        // Láº¥y tá»« láº§n chuyá»ƒn Ä‘áº§u tiÃªn trong history
        const firstTransfer = booking.transferHistory[0];
        fromRoomNumber = firstTransfer.fromRoomNumber || 'N/A';
        // Láº¥y tá»« láº§n chuyá»ƒn cuá»‘i cÃ¹ng
        const lastTransfer = booking.transferHistory[booking.transferHistory.length - 1];
        toRoomNumber = lastTransfer.toRoomNumber || this.roomData.roomNumber || 'N/A';
      } else {
        // Fallback: láº¥y tá»« roomData náº¿u cÃ³
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
  
  // Táº¡o mÃ´ táº£ thÃ´ng tin chuyá»ƒn phÃ²ng
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
  
  // Helper function Ä‘á»ƒ lá»c cÃ¡c event check-in CHÆ¯A CHECKOUT
  // LÆ°u Ã½: Náº¿u backend Ä‘Ã£ filter báº±ng excludeCheckedOut=true, hÃ m nÃ y váº«n hoáº¡t Ä‘á»™ng nhÆ° má»™t lá»›p báº£o vá»‡ bá»• sung
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
        
        // Kiá»ƒm tra xem cÃ³ event checkout nÃ o tÆ°Æ¡ng á»©ng vá»›i checkin nÃ y khÃ´ng
        // So sÃ¡nh chÃ­nh xÃ¡c báº±ng checkinTime (cÃ³ thá»ƒ lÃ  Date object hoáº·c ISO string)
        const hasCheckout = events.some((e: any) => {
          if (e.type !== 'checkout') return false;
          
          // So sÃ¡nh checkinTime: chuyá»ƒn vá» Date object vÃ  so sÃ¡nh timestamp
          const checkoutCheckinTime = this.getEventCheckinTime(e)?.getTime() || null;
          const eventCheckinTime = this.getEventCheckinTime(event)?.getTime() || null;
          
          // Náº¿u cÃ³ checkinTime vÃ  khá»›p chÃ­nh xÃ¡c (trong vÃ²ng 1 giÃ¢y Ä‘á»ƒ trÃ¡nh lá»—i lÃ m trÃ²n)
          if (checkoutCheckinTime && eventCheckinTime) {
            return Math.abs(checkoutCheckinTime - eventCheckinTime) < 1000; // Trong vÃ²ng 1 giÃ¢y
          }
          
          return false;
        });
        
        // Chá»‰ láº¥y event check-in chÆ°a cÃ³ checkout
        return !hasCheckout;
      })
      .sort((a: any, b: any) => {
        const timeA = this.getEventCheckinTime(a)?.getTime() || 0;
        const timeB = this.getEventCheckinTime(b)?.getTime() || 0;
        return timeB - timeA; // Sáº¯p xáº¿p giáº£m dáº§n (má»›i nháº¥t trÆ°á»›c)
      });
  }

  // Helper function Ä‘á»ƒ táº¡o Date theo timezone Ä‘Æ°á»£c chá»‰ Ä‘á»‹nh
  // timezone: 'UTC+7', 'UTC+8', etc. (máº·c Ä‘á»‹nh UTC+7)
  getTimeByTimezone(timezone: string = 'UTC+7'): Date {
    const now = new Date();
    
    // Parse timezone offset (vÃ­ dá»¥: 'UTC+7' -> 7, 'UTC-5' -> -5)
    const timezoneMatch = timezone.match(/UTC([+-])(\d+)/);
    if (timezoneMatch) {
      const sign = timezoneMatch[1] === '+' ? 1 : -1;
      const hours = parseInt(timezoneMatch[2]);
      const offset = sign * hours * 60 * 60 * 1000; // offset in milliseconds
      const localOffset = now.getTimezoneOffset() * 60000; // local offset in milliseconds
      return new Date(now.getTime() + localOffset + offset);
    }
    
    // Fallback: tráº£ vá» thá»i gian hiá»‡n táº¡i
    return new Date(now);
  }
  
  // Helper function Ä‘á»ƒ táº¡o Date theo UTC+7 (mÃºi giá» Viá»‡t Nam) - giá»¯ láº¡i Ä‘á»ƒ backward compatibility
  getUTCTimePlus7(): Date {
    // Láº¥y timezone tá»« roomData náº¿u cÃ³
    const timezone = (this.roomData as any)?.priceSettings?.timezone || 'UTC+7';
    return this.getTimeByTimezone(timezone);
  }

  // ThÃªm thuá»™c tÃ­nh businessInfo
  businessInfo: any = {};
  businessOwner: any = null; // ThÃ´ng tin chá»§ doanh nghiá»‡p (business owner)

  initialCharges: number = 0;
  initialDiscount: number = 0;
  initialNotes: string = '';
  initialSelectedServices: OrderedService[] = []; // LÆ°u trá»¯ dá»‹ch vá»¥ ban Ä‘áº§u

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
    private transactionService: TransactionService
  ) {
    
    this.roomData = data.roomData;
    this.skipValidation = data.skipValidation || false;
    this.modalType = data.modalType || 'info';
    
    // Log Ä‘á»ƒ kiá»ƒm tra modalType
    console.log('Modal type set to:', this.modalType);
    
    // Form cho check-in vá»›i validators tÃ¹y chá»n
    this.checkInForm = this.fb.group({
      guestInfo: this.fb.group({
        name: ['KhÃ¡ch láº»'], // Máº·c Ä‘á»‹nh lÃ  "KhÃ¡ch láº»", khÃ´ng báº¯t buá»™c
        idNumber: [''],
        tax_code: [''], // MÃ£ sá»‘ thuáº¿ (cho cÃ´ng ty)
        phone: ['', [Validators.pattern('^[0-9]{10}$')]],
        email: ['', [Validators.email]],
        address: [''],
        guestSource: ['walkin'] // Máº·c Ä‘á»‹nh lÃ  walkin
      }),
      paymentMethod: ['cash', this.skipValidation ? [] : [Validators.required]],
      rateType: ['hourly', this.skipValidation ? [] : [Validators.required]],
      advancePayment: [0, [Validators.min(0)]],
      advancePaymentMethod: ['cash', this.skipValidation ? [] : [Validators.required]], // HÃ¬nh thá»©c thanh toÃ¡n cho tráº£ trÆ°á»›c
      additionalCharges: [0, [Validators.min(0)]],
      discount: [0, [Validators.min(0)]],
      notes: ['']
    });
    
    // ThÃªm listener Ä‘á»ƒ debug guestSource changes
    const checkInGuestInfoGroup = this.checkInForm.get('guestInfo') as FormGroup;
    if (checkInGuestInfoGroup) {
      checkInGuestInfoGroup.get('guestSource')?.valueChanges.subscribe(value => {
        console.log('CheckIn form guestSource changed to:', value);
      });
    }
    
    // Form cho dá»‹ch vá»¥
    this.servicesForm = this.fb.group({
      serviceId: [''],
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

    // Load phá»¥ trá»£ sau first paint â€” khÃ´ng cháº·n má»Ÿ modal
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
   * Load thÃ´ng tin user hiá»‡n táº¡i Ä‘á»ƒ láº¥y QR code tá»« profile
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
  
  // Load dá»‹ch vá»¥ tá»« API
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
        console.error('Lá»—i khi táº£i danh sÃ¡ch dá»‹ch vá»¥:', error);
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
        console.error('Fallback cÅ©ng lá»—i:', err);
      }
    });
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

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
    
    // Dá»«ng polling khi component bá»‹ há»§y
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
  
  // Cáº­p nháº­t UI tá»« dá»¯ liá»‡u phiÃªn
  private updateUIFromSession(session: RoomSession): void {
    this.initialCharges = session.additionalCharges || 0;
    this.initialDiscount = session.discount || 0;
    this.initialNotes = session.notes || '';
    this.initialSelectedServices = session.selectedServices ? [...session.selectedServices] : [];
    this.selectedServices = session.selectedServices ? [...session.selectedServices] : [];
    this.advancePayment = session.advancePayment || 0;

    // Äáº£m báº£o guestInfo cÃ³ name vÃ  guestSource
    const guestInfo = session.guestInfo || { name: 'KhÃ¡ch láº»' };
    if (!guestInfo.name || guestInfo.name === 'KhÃ¡ch láº»') {
      // Thá»­ láº¥y tá»« roomData.currentBooking náº¿u cÃ³
      if (this.roomData?.currentBooking && typeof this.roomData.currentBooking === 'object') {
        const currentBooking = this.roomData.currentBooking;
        if (currentBooking.guestInfo?.name && currentBooking.guestInfo.name !== 'KhÃ¡ch láº»') {
          guestInfo.name = currentBooking.guestInfo.name;
          guestInfo.phone = currentBooking.guestInfo.phone || guestInfo.phone;
          guestInfo.email = currentBooking.guestInfo.email || guestInfo.email;
          guestInfo.guestSource = currentBooking.guestInfo.guestSource || guestInfo.guestSource;
        }
      }
    }
    
    // Äáº£m báº£o cÃ³ guestSource, náº¿u khÃ´ng thÃ¬ thá»­ láº¥y tá»« roomData.events (chá»‰ láº¥y event chÆ°a checkout)
    if (!guestInfo.guestSource && this.roomData?.events && this.roomData.events.length > 0) {
      const checkinEvents = this.getUncheckedOutCheckinEvents(this.roomData.events);
      if (checkinEvents.length > 0 && checkinEvents[0].guestInfo?.guestSource) {
        guestInfo.guestSource = checkinEvents[0].guestInfo.guestSource;
      }
    }
    
    // Äáº£m báº£o cÃ³ guestSource, máº·c Ä‘á»‹nh lÃ  'walkin'
    if (!guestInfo.guestSource) {
      guestInfo.guestSource = 'walkin';
    }

    // Patch trá»±c tiáº¿p vÃ o nested form group Ä‘á»ƒ Ä‘áº£m báº£o guestSource Ä‘Æ°á»£c patch Ä‘Ãºng
    const checkInGuestInfoFormGroup = this.checkInForm.get('guestInfo') as FormGroup;
    if (checkInGuestInfoFormGroup) {
      // Patch tá»«ng field riÃªng
      checkInGuestInfoFormGroup.patchValue({
        name: guestInfo.name || 'KhÃ¡ch láº»',
        idNumber: guestInfo.idNumber || '',
        tax_code: guestInfo.tax_code || '',
        phone: guestInfo.phone || '',
        email: guestInfo.email || '',
        address: guestInfo.address || ''
      }, { emitEvent: false });
      
      // Set guestSource riÃªng
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
        advancePaymentMethod: session.advancePaymentMethod || 'cash', // HÃ¬nh thá»©c thanh toÃ¡n cho tráº£ trÆ°á»›c
        additionalCharges: this.initialCharges,
        discount: this.initialDiscount,
        notes: this.initialNotes
    });
    this.checkInForm.get('guestInfo')?.disable();

    // Patch trá»±c tiáº¿p vÃ o nested form group Ä‘á»ƒ Ä‘áº£m báº£o guestSource Ä‘Æ°á»£c patch Ä‘Ãºng
    const checkOutGuestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
    if (checkOutGuestInfoFormGroup) {
      // Patch tá»«ng field riÃªng
      checkOutGuestInfoFormGroup.patchValue({
        name: guestInfo.name || 'KhÃ¡ch láº»',
        idNumber: guestInfo.idNumber || '',
        tax_code: guestInfo.tax_code || '',
        phone: guestInfo.phone || '',
        email: guestInfo.email || '',
        address: guestInfo.address || ''
      }, { emitEvent: false });
      
      // Set guestSource riÃªng
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
        advancePaymentMethod: session.advancePaymentMethod || 'cash', // HÃ¬nh thá»©c thanh toÃ¡n cho tráº£ trÆ°á»›c
        additionalCharges: this.initialCharges, // Patch additionalCharges tá»« session
        discount: this.initialDiscount // Patch discount tá»« session
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
    this.calculateTotalPrice();
  }

  fetchCurrentRoom(): void {
    if (this.roomData && this.roomData.roomNumber) {
      if (this.roomData.events && this.roomData.events.length > 0) {
        // Lá»c cÃ¡c event check-in CHÆ¯A CHECKOUT (chÆ°a cÃ³ event checkout tÆ°Æ¡ng á»©ng)
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
        
        // Náº¿u cÃ³ event check-in vÃ  phÃ²ng Ä‘ang cÃ³ khÃ¡ch
        if (lastCheckinEvent && this.roomData.status === 'occupied') {
          console.log('Loading check-in event from backend:', lastCheckinEvent);
          
          // Láº¥y thÃ´ng tin khÃ¡ch hÃ ng tá»« nhiá»u nguá»“n
          let guestInfo = lastCheckinEvent.guestInfo || {};
          
          // Náº¿u guestInfo khÃ´ng cÃ³ name hoáº·c name lÃ  "KhÃ¡ch láº»", thá»­ láº¥y tá»« cÃ¡c nguá»“n khÃ¡c
          if (!guestInfo.name || guestInfo.name === 'KhÃ¡ch láº»') {
            // Thá»­ láº¥y tá»« roomData.currentBooking
            if (this.roomData.currentBooking && typeof this.roomData.currentBooking === 'object') {
              const currentBooking = this.roomData.currentBooking;
              if (currentBooking.guestInfo?.name && currentBooking.guestInfo.name !== 'KhÃ¡ch láº»') {
                guestInfo = {
                  ...guestInfo,
                  name: currentBooking.guestInfo.name,
                  phone: currentBooking.guestInfo.phone || guestInfo.phone,
                  email: currentBooking.guestInfo.email || guestInfo.email
                };
              }
            }
            
            // Thá»­ láº¥y tá»« booking náº¿u cÃ³
            if ((!guestInfo.name || guestInfo.name === 'KhÃ¡ch láº»') && lastCheckinEvent.bookingId) {
              // CÃ³ thá»ƒ cáº§n fetch booking Ä‘á»ƒ láº¥y thÃ´ng tin, nhÆ°ng táº¡m thá»i giá»¯ nguyÃªn
            }
          }
          
          // Äáº£m báº£o cÃ³ name, náº¿u khÃ´ng thÃ¬ máº·c Ä‘á»‹nh "KhÃ¡ch láº»"
          if (!guestInfo.name) {
            guestInfo = { ...guestInfo, name: 'KhÃ¡ch láº»' };
          }
          
          // Äáº£m báº£o cÃ³ guestSource, náº¿u khÃ´ng thÃ¬ thá»­ láº¥y tá»« cÃ¡c nguá»“n khÃ¡c
          if (!guestInfo.guestSource) {
            // Thá»­ láº¥y tá»« currentBooking
            if (this.roomData.currentBooking && typeof this.roomData.currentBooking === 'object') {
              const currentBooking = this.roomData.currentBooking;
              if (currentBooking.guestInfo?.guestSource) {
                guestInfo.guestSource = currentBooking.guestInfo.guestSource;
              }
            }
            // Náº¿u váº«n khÃ´ng cÃ³, máº·c Ä‘á»‹nh lÃ  "walkin"
            if (!guestInfo.guestSource) {
              guestInfo.guestSource = 'walkin';
            }
          }
          
          // Äáº£m báº£o cÃ¡c giÃ¡ trá»‹ sá»‘ tá»« event
          const eventAdvancePayment = Number(lastCheckinEvent.advancePayment) || 0;
          const eventAdditionalCharges = Number(lastCheckinEvent.additionalCharges) || 0;
          const eventDiscount = Number(lastCheckinEvent.discount) || 0;
          
          // KhÃ´ng lÆ°u vÃ o session ná»¯a, chá»‰ láº¥y tá»« RoomEvent
          // Dá»¯ liá»‡u Ä‘Ã£ Ä‘Æ°á»£c lÆ°u vÃ o RoomEvent qua backend
          
          // Cáº­p nháº­t listData vá»›i guestInfo Ä‘Ã£ Ä‘Æ°á»£c xá»­ lÃ½
          this.listData = [{
            checkinTime: lastCheckinTime,
            rateType: lastCheckinEvent.rateType || 'hourly',
            advancePayment: eventAdvancePayment, // Äáº£m báº£o lÃ  sá»‘
            advancePaymentMethod: lastCheckinEvent.advancePaymentMethod || 'cash', // HÃ¬nh thá»©c thanh toÃ¡n cho tráº£ trÆ°á»›c
            guestInfo: guestInfo, // Sá»­ dá»¥ng guestInfo Ä‘Ã£ Ä‘Æ°á»£c xá»­ lÃ½ tá»« nhiá»u nguá»“n
            additionalCharges: eventAdditionalCharges, // Äáº£m báº£o lÃ  sá»‘
            discount: eventDiscount, // Äáº£m báº£o lÃ  sá»‘
            notes: lastCheckinEvent.notes || '',
            selectedServices: lastCheckinEvent.selectedServices || []
          }];
          
          // Cáº­p nháº­t láº¡i cÃ¡c giÃ¡ trá»‹ ban Ä‘áº§u tá»« event
          this.initialCharges = eventAdditionalCharges;
          this.initialDiscount = eventDiscount;
          this.initialNotes = lastCheckinEvent.notes || '';
          this.initialSelectedServices = lastCheckinEvent.selectedServices && Array.isArray(lastCheckinEvent.selectedServices) ?
                                          [...lastCheckinEvent.selectedServices] : [];
          this.selectedServices = this.initialSelectedServices;
          this.advancePayment = eventAdvancePayment;
          
          // Log Ä‘á»ƒ debug
          console.log('Loaded check-in data from backend:', {
            guestInfo: guestInfo,
            guestSource: guestInfo.guestSource, // Log riÃªng guestSource Ä‘á»ƒ debug
            advancePayment: eventAdvancePayment,
            additionalCharges: eventAdditionalCharges,
            discount: eventDiscount
          });

          // Cáº­p nháº­t form checkin Ä‘á»ƒ hiá»ƒn thá»‹ (cÃ³ thá»ƒ disable)
          // Patch trá»±c tiáº¿p vÃ o nested form group Ä‘á»ƒ Ä‘áº£m báº£o guestSource Ä‘Æ°á»£c patch Ä‘Ãºng
          const guestInfoFormGroup = this.checkInForm.get('guestInfo') as FormGroup;
          if (guestInfoFormGroup) {
            // Enable form group trÆ°á»›c khi patchValue
            if (guestInfoFormGroup.disabled) {
              guestInfoFormGroup.enable();
            }
            
            // Patch tá»«ng field riÃªng Ä‘á»ƒ Ä‘áº£m báº£o guestSource Ä‘Æ°á»£c set Ä‘Ãºng
            guestInfoFormGroup.patchValue({
              name: guestInfo.name || 'KhÃ¡ch láº»',
              idNumber: guestInfo.idNumber || '',
              phone: guestInfo.phone || '',
              email: guestInfo.email || '',
              address: guestInfo.address || ''
            }, { emitEvent: false });
            
            // Set guestSource riÃªng Ä‘á»ƒ Ä‘áº£m báº£o Ä‘Æ°á»£c set Ä‘Ãºng
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

          // Cáº­p nháº­t checkout form vá»›i thÃ´ng tin khÃ¡ch vÃ  tiá»n Ä‘áº·t trÆ°á»›c tá»« backend
          const checkoutGuestInfo = {
            name: guestInfo.name || 'KhÃ¡ch láº»',
            idNumber: guestInfo.idNumber || '',
            phone: guestInfo.phone || '',
            email: guestInfo.email || '',
            address: guestInfo.address || '',
            guestSource: guestInfo.guestSource || 'walkin' // Äáº£m báº£o cÃ³ guestSource
          };
          console.log('Patching checkout form with guestInfo:', checkoutGuestInfo);
          
          // Patch trá»±c tiáº¿p vÃ o nested form group Ä‘á»ƒ Ä‘áº£m báº£o guestSource Ä‘Æ°á»£c patch Ä‘Ãºng
          const checkoutGuestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
          if (checkoutGuestInfoFormGroup) {
            // Enable form group trÆ°á»›c khi patchValue
            if (checkoutGuestInfoFormGroup.disabled) {
              checkoutGuestInfoFormGroup.enable();
            }
            
            // Patch tá»«ng field riÃªng Ä‘á»ƒ Ä‘áº£m báº£o guestSource Ä‘Æ°á»£c set Ä‘Ãºng
            checkoutGuestInfoFormGroup.patchValue({
              name: checkoutGuestInfo.name || 'KhÃ¡ch láº»',
              idNumber: checkoutGuestInfo.idNumber || '',
              phone: checkoutGuestInfo.phone || '',
              email: checkoutGuestInfo.email || '',
              address: checkoutGuestInfo.address || ''
            }, { emitEvent: false });
            
            // Set guestSource riÃªng Ä‘á»ƒ Ä‘áº£m báº£o Ä‘Æ°á»£c set Ä‘Ãºng
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
            }, { emitEvent: false }); // ThÃªm emitEvent: false
          }
          console.log('Checkout form full value after patchValue:', this.checkOutForm.value);
          
          this.advancePayment = eventAdvancePayment;

          // 3. ÄÃNH Dáº¤U LÃ€ FORM ÄÃƒ KHá»žI Táº O XONG (KHÃ”NG BAO GIá»œ GHI ÄÃˆ Ná»®A)
          this.isFormInitialized = true;

          console.log('Updated form with backend data:', {
            guestInfo: guestInfo, // Log guestInfo Ä‘Ã£ Ä‘Æ°á»£c xá»­ lÃ½
            originalGuestInfo: lastCheckinEvent.guestInfo,
            advancePayment: lastCheckinEvent.advancePayment
          });
          
          this.calculateTotalPrice();
        } else {
          // Náº¿u khÃ´ng tÃ¬m tháº¥y event check-in phÃ¹ há»£p, chá»‰ hiá»ƒn thá»‹ event cuá»‘i cÃ¹ng
          // NhÆ°ng khÃ´ng tÃ­nh giÃ¡ náº¿u khÃ´ng pháº£i checkin event
          const lastEvent = this.roomData.events[this.roomData.events.length - 1];
          if (lastEvent) {
            this.listData = [lastEvent];
            // Chá»‰ tÃ­nh giÃ¡ náº¿u lÃ  checkout modal vÃ  cÃ³ checkin event
            if (this.modalType === 'checkout' && lastEvent.type === 'checkin') {
              this.calculateTotalPrice();
            }
          }
        }
        } else {
        // Náº¿u khÃ´ng cÃ³ events, hiá»ƒn thá»‹ thÃ´ng bÃ¡o
        if (this.modalType === 'checkout') {
          console.warn('No check-in events found in RoomEvent');
          this.message.warning('KhÃ´ng tÃ¬m tháº¥y thÃ´ng tin check-in tá»« RoomEvent');
        }
      }
    }

    // Nháº­n phÃ²ng phÃ²ng trá»‘ng/booked: luÃ´n máº·c Ä‘á»‹nh theo giá»
    if (this.modalType === 'checkin' && this.roomData?.status !== 'occupied') {
      this.checkInForm?.patchValue({ rateType: 'hourly' }, { emitEvent: false });
    }

  }

  // Táº£i thÃ´ng tin doanh nghiá»‡p
  loadBusinessInfo(): void {
    if (!this.roomData?.hotelId) return;
    this.hotelService.getHotelById(this.roomData.hotelId, { lite: true }).subscribe(
      (data) => {
        this.businessInfo = data;
        // LÆ°u thÃ´ng tin ngÃ¢n hÃ ng cá»§a hotel
        this.hotelBankAccount = data.bankAccount || null;
        
        
        // Náº¿u hotel khÃ´ng cÃ³ bankAccount, thá»­ láº¥y tá»« manager
        if (!this.hotelBankAccount?.qrPaymentUrl && data.managerId) {
          const manager = typeof data.managerId === 'object' ? data.managerId : null;
          if (manager?.bankAccount?.qrPaymentUrl) {
            // Sá»­ dá»¥ng QR code tá»« manager náº¿u hotel khÃ´ng cÃ³
            this.hotelBankAccount = manager.bankAccount;
          }
        }
        
        // Load thÃ´ng tin business owner náº¿u cÃ³ businessId
        if (data.businessId) {
          // Äáº£m báº£o businessId lÃ  string
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
                // Láº¥y thÃ´ng tin owner tá»« business (ownerId cÃ³ thá»ƒ Ä‘Ã£ Ä‘Æ°á»£c populate)
                if (business.ownerId) {
                  if (typeof business.ownerId === 'object' && business.ownerId._id) {
                    // ÄÃ£ Ä‘Æ°á»£c populate, láº¥y trá»±c tiáº¿p
                    this.businessOwner = business.ownerId;
                    console.log('ThÃ´ng tin business owner (populated):', this.businessOwner);
                  } else {
                    // ChÆ°a Ä‘Æ°á»£c populate, lÆ°u ownerId Ä‘á»ƒ dÃ¹ng sau
                    this.businessOwner = { _id: business.ownerId };
                    console.log('LÆ°u ownerId Ä‘á»ƒ dÃ¹ng sau:', this.businessOwner);
                  }
                }
              },
              error: (err) => {
                console.error('Lá»—i khi táº£i thÃ´ng tin business:', err);
              }
            });
          }
        }
      },
      (error) => {
        console.error('Lá»—i khi táº£i thÃ´ng tin doanh nghiá»‡p:', error);
        // Xá»­ lÃ½ lá»—i náº¿u cáº§n, vÃ­ dá»¥ hiá»ƒn thá»‹ thÃ´ng tin máº·c Ä‘á»‹nh hoáº·c thÃ´ng bÃ¡o
        this.businessInfo = { name: 'KhÃ¡ch sáº¡n Máº·c Ä‘á»‹nh', address: '', phoneNumber: '' }; // VÃ­ dá»¥
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

  // ThÃªm dá»‹ch vá»¥
  addService(): void {
    // Kiá»ƒm tra form há»£p lá»‡
    if (this.servicesForm.invalid) {
      Object.values(this.servicesForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity();
        }
      });
      return;
    }
    
    // Láº¥y dá»¯ liá»‡u tá»« form
    const serviceId = this.servicesForm.get('serviceId')?.value;
    const quantity = this.servicesForm.get('quantity')?.value || 1;
    
    // Kiá»ƒm tra dá»‹ch vá»¥ Ä‘Ã£ chá»n
    if (!serviceId) {
      this.message.warning('Vui lÃ²ng chá»n dá»‹ch vá»¥!');
      return;
    }
    
    // TÃ¬m dá»‹ch vá»¥ trong danh sÃ¡ch
    const selectedService = this.services.find(service => service.id === serviceId);
    if (!selectedService) {
      this.message.error('KhÃ´ng tÃ¬m tháº¥y dá»‹ch vá»¥ Ä‘Ã£ chá»n!');
      return;
    }
    
    // Kiá»ƒm tra xem dá»‹ch vá»¥ Ä‘Ã£ cÃ³ trong danh sÃ¡ch chÆ°a
    const existingIndex = this.selectedServices.findIndex(s => s.serviceId === serviceId);
    
    if (existingIndex !== -1) {
      // Náº¿u dá»‹ch vá»¥ Ä‘Ã£ tá»“n táº¡i, cáº­p nháº­t sá»‘ lÆ°á»£ng
      this.selectedServices[existingIndex].quantity += quantity;
      // Cáº­p nháº­t tá»•ng giÃ¡
      this.selectedServices[existingIndex].totalPrice = 
        this.selectedServices[existingIndex].price * this.selectedServices[existingIndex].quantity;
      this.message.success(`ÄÃ£ cáº­p nháº­t sá»‘ lÆ°á»£ng ${selectedService.name}`);
    } else {
      // ThÃªm dá»‹ch vá»¥ má»›i vÃ o danh sÃ¡ch
      const orderedService: OrderedService = {
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        price: selectedService.price,
        quantity: quantity,
        totalPrice: selectedService.price * quantity,
        orderTime: new Date()
      };
      
      this.selectedServices.push(orderedService);
      this.message.success(`ÄÃ£ thÃªm ${quantity} ${selectedService.name}`);
    }
    
    // Cáº­p nháº­t vÃ o RoomEvent náº¿u phÃ²ng Ä‘ang occupied vÃ  cÃ³ event checkin
    if (this.roomData._id && this.roomData.status === 'occupied') {
      // Láº¥y thÃ´ng tin tá»« form checkout náº¿u cÃ³
      const guestInfoFormGroup = this.checkOutForm?.get('guestInfo') as FormGroup;
      const guestInfo = guestInfoFormGroup ? 
        (guestInfoFormGroup.disabled ? guestInfoFormGroup.getRawValue() : guestInfoFormGroup.value) : 
        (this.checkOutForm?.get('guestInfo')?.value || {});
      
      // Láº¥y cÃ¡c giÃ¡ trá»‹ tá»« form hoáº·c tá»« event hiá»‡n táº¡i
      const advancePayment = Number(this.checkOutForm?.get('advancePayment')?.value) || 
                             (this.listData && this.listData.length > 0 ? this.listData[0].advancePayment : 0) || 0;
      const rateType = this.checkOutForm?.get('rateType')?.value || 
                      (this.listData && this.listData.length > 0 ? this.listData[0].rateType : null) || 
                      'hourly';
      // Láº¥y giÃ¡ trá»‹ phá»¥ thu vÃ  khuyáº¿n mÃ£i tá»« form checkout (chá»‰ giÃ¡ trá»‹ ngÆ°á»i dÃ¹ng nháº­p thÃªm)
      // Form checkout báº¯t Ä‘áº§u tá»« 0, khÃ´ng bao gá»“m giÃ¡ trá»‹ tá»« check-in event
      const checkoutCharges = Number(this.checkOutForm?.get('additionalCharges')?.value) || 0;
      const checkoutDiscount = Number(this.checkOutForm?.get('discount')?.value) || 0;
      
      // TÃ­nh tá»•ng phá»¥ thu vÃ  khuyáº¿n mÃ£i (cá»™ng dá»“n, khÃ´ng ghi Ä‘Ã¨)
      // initialCharges vÃ  initialDiscount Ä‘Ã£ Ä‘Æ°á»£c set khi load dá»¯ liá»‡u tá»« check-in event
      const additionalCharges = this.initialCharges + checkoutCharges;
      const discount = this.initialDiscount + checkoutDiscount;
      
      // Äáº£m báº£o guestInfo Ä‘áº§y Ä‘á»§
      const updatedGuestInfo = {
        name: guestInfo.name || 'KhÃ¡ch láº»',
        idNumber: guestInfo.idNumber || '',
        tax_code: guestInfo.tax_code || '',
        phone: guestInfo.phone || '',
        email: guestInfo.email || '',
        address: guestInfo.address || '',
        guestSource: guestInfo.guestSource || 'walkin'
      };
      
      // Cáº­p nháº­t RoomEvent vá»›i selectedServices má»›i
      this.roomsService.updateRoomCheckinInfo(
        this.roomData._id,
        updatedGuestInfo,
        advancePayment,
        rateType,
        additionalCharges,
        discount,
        this.selectedServices // Gá»­i selectedServices Ä‘Ã£ Ä‘Æ°á»£c cáº­p nháº­t
      ).subscribe({
        next: (response) => {
          console.log('Dá»‹ch vá»¥ Ä‘Ã£ Ä‘Æ°á»£c cáº­p nháº­t vÃ o RoomEvent', response);
          
          // Cáº­p nháº­t listData Ä‘á»ƒ Ä‘á»“ng bá»™
          if (this.listData && this.listData.length > 0) {
            this.listData[0].selectedServices = [...this.selectedServices];
          }
        },
        error: (error) => {
          console.error('Lá»—i khi cáº­p nháº­t dá»‹ch vá»¥ vÃ o RoomEvent:', error);
          // KhÃ´ng hiá»ƒn thá»‹ error message Ä‘á»ƒ khÃ´ng lÃ m phiá»n user khi thÃªm dá»‹ch vá»¥
        }
      });
    }
    
    // Reset form
    this.servicesForm.reset({
      serviceId: '',
      quantity: 1
    });
    
    // Cáº­p nháº­t tá»•ng giÃ¡
    this.calculateTotalPrice();
  }

  // XÃ³a dá»‹ch vá»¥
  removeService(index: number): void {
    if (index < 0 || index >= this.selectedServices.length) {
      console.error('Invalid service index:', index);
      return;
    }
    
    // XÃ³a dá»‹ch vá»¥ khá»i danh sÃ¡ch
    const removedService = this.selectedServices[index];
    this.selectedServices.splice(index, 1);
    
    console.log('Removed service:', removedService);
    
    // Cáº­p nháº­t session (náº¿u cáº§n)
    sessionStorage.setItem('selectedServices', JSON.stringify(this.selectedServices));
    
    // Cáº­p nháº­t vÃ o RoomEvent náº¿u phÃ²ng Ä‘ang occupied vÃ  cÃ³ event checkin
    if (this.roomData._id && this.roomData.status === 'occupied') {
      // Láº¥y thÃ´ng tin tá»« form checkout náº¿u cÃ³
      const guestInfoFormGroup = this.checkOutForm?.get('guestInfo') as FormGroup;
      const guestInfo = guestInfoFormGroup ? 
        (guestInfoFormGroup.disabled ? guestInfoFormGroup.getRawValue() : guestInfoFormGroup.value) : 
        (this.checkOutForm?.get('guestInfo')?.value || {});
      
      // Láº¥y cÃ¡c giÃ¡ trá»‹ tá»« form hoáº·c tá»« event hiá»‡n táº¡i
      const advancePayment = Number(this.checkOutForm?.get('advancePayment')?.value) || 
                             (this.listData && this.listData.length > 0 ? this.listData[0].advancePayment : 0) || 0;
      const rateType = this.checkOutForm?.get('rateType')?.value || 
                      (this.listData && this.listData.length > 0 ? this.listData[0].rateType : null) || 
                      'hourly';
      // Láº¥y giÃ¡ trá»‹ phá»¥ thu vÃ  khuyáº¿n mÃ£i tá»« form checkout (chá»‰ giÃ¡ trá»‹ ngÆ°á»i dÃ¹ng nháº­p thÃªm)
      // Form checkout báº¯t Ä‘áº§u tá»« 0, khÃ´ng bao gá»“m giÃ¡ trá»‹ tá»« check-in event
      const checkoutCharges = Number(this.checkOutForm?.get('additionalCharges')?.value) || 0;
      const checkoutDiscount = Number(this.checkOutForm?.get('discount')?.value) || 0;
      
      // TÃ­nh tá»•ng phá»¥ thu vÃ  khuyáº¿n mÃ£i (cá»™ng dá»“n, khÃ´ng ghi Ä‘Ã¨)
      // initialCharges vÃ  initialDiscount Ä‘Ã£ Ä‘Æ°á»£c set khi load dá»¯ liá»‡u tá»« check-in event
      const additionalCharges = this.initialCharges + checkoutCharges;
      const discount = this.initialDiscount + checkoutDiscount;
      
      // Äáº£m báº£o guestInfo Ä‘áº§y Ä‘á»§
      const updatedGuestInfo = {
        name: guestInfo.name || 'KhÃ¡ch láº»',
        idNumber: guestInfo.idNumber || '',
        tax_code: guestInfo.tax_code || '',
        phone: guestInfo.phone || '',
        email: guestInfo.email || '',
        address: guestInfo.address || '',
        guestSource: guestInfo.guestSource || 'walkin'
      };
      
      // Cáº­p nháº­t RoomEvent vá»›i selectedServices má»›i
      this.roomsService.updateRoomCheckinInfo(
        this.roomData._id,
        updatedGuestInfo,
        advancePayment,
        rateType,
        additionalCharges,
        discount,
        this.selectedServices // Gá»­i selectedServices Ä‘Ã£ Ä‘Æ°á»£c cáº­p nháº­t
      ).subscribe({
        next: (response) => {
          console.log('Dá»‹ch vá»¥ Ä‘Ã£ Ä‘Æ°á»£c cáº­p nháº­t vÃ o RoomEvent', response);
          this.message.success('ÄÃ£ xÃ³a dá»‹ch vá»¥');
          
          // Cáº­p nháº­t listData Ä‘á»ƒ Ä‘á»“ng bá»™
          if (this.listData && this.listData.length > 0) {
            this.listData[0].selectedServices = [...this.selectedServices];
          }
        },
        error: (error) => {
          console.error('Lá»—i khi cáº­p nháº­t dá»‹ch vá»¥ vÃ o RoomEvent:', error);
          this.message.error('Lá»—i khi cáº­p nháº­t dá»‹ch vá»¥: ' + (error.error?.message || error.message));
        }
      });
    }
    
    // Cáº­p nháº­t tá»•ng tiá»n
    this.calculateTotalPrice();
  }

  // TÃ­nh tá»•ng tiá»n
  calculateTotalPrice(): void {
    // Chá»‰ tÃ­nh giÃ¡ khi modalType lÃ  'checkout' vÃ  cÃ³ checkin event há»£p lá»‡
    if (this.modalType !== 'checkout') {
      this.totalPrice = 0;
      this._hasRoomPriceFromAPI = false; // Reset flag khi khÃ´ng pháº£i checkout
      return;
    }
    
    // Láº¥y thÃ´ng tin check-in cuá»‘i cÃ¹ng
    const lastCheckIn = this.listData && this.listData.length > 0 ? this.listData[0] : null;
    if (!lastCheckIn) {
      this.totalPrice = 0;
      return;
    }
    
    // Kiá»ƒm tra xem cÃ³ pháº£i lÃ  checkin event khÃ´ng
    if (lastCheckIn.type && lastCheckIn.type !== 'checkin') {
      // Náº¿u khÃ´ng pháº£i checkin event, khÃ´ng tÃ­nh giÃ¡
      this.totalPrice = 0;
      return;
    }
    
    console.log('Calculating price based on check-in data:', lastCheckIn);
    
    // Kiá»ƒm tra vÃ  validate checkinTime
    const parsedCheckinTime = this.getEventCheckinTime(lastCheckIn);
    let checkInTime: Date = parsedCheckinTime || this.getUTCTimePlus7();
    
    const checkOutTime = this.getUTCTimePlus7();
    
    // Kiá»ƒm tra xem checkOutTime cÃ³ há»£p lá»‡ khÃ´ng
    if (isNaN(checkOutTime.getTime())) {
      console.error('[calculateTotalPrice] Invalid checkOutTime');
      this.totalPrice = 0;
      this._hasRoomPriceFromAPI = false;
      return;
    }
    
    // Äáº£m báº£o checkInTime khÃ´ng lá»›n hÆ¡n checkOutTime
    if (checkInTime.getTime() >= checkOutTime.getTime()) {
      console.warn('[calculateTotalPrice] Check-in time is after or equal to check-out time, using 1 hour before check-out for check-in');
      checkInTime = new Date(checkOutTime.getTime() - 3600000); // 1 giá» trÆ°á»›c
    }
    
    // TÃ­nh thá»i gian chÃ­nh xÃ¡c theo phÃºt
    const durationInMilliseconds = checkOutTime.getTime() - checkInTime.getTime();
    const durationInMinutes = Math.floor(durationInMilliseconds / (1000 * 60));
    const durationInHours = Math.floor(durationInMinutes / 60);
    const remainingMinutes = durationInMinutes % 60;
    const durationInDays = Math.ceil(durationInHours / 24);
    
    // Äáº£m báº£o duration khÃ´ng Ã¢m
    // KhÃ´ng Ã©p lÃªn 1 giá» á»Ÿ Ä‘Ã¢y vÃ¬ calculateRoomTotalByRateType Ä‘Ã£ xá»­ lÃ½ giÃ¡ tá»‘i thiá»ƒu lÃ  1 giá»
    // Náº¿u Ã©p lÃªn 1 giá», khi khÃ¡ch á»Ÿ dÆ°á»›i 1 giá» (vd 45p) vÃ  cÃ³ gracePeriod (vd 15p), 
    // logic sáº½ tÃ­nh thÃ nh 1 giá» Ä‘áº§u + 1 giá» thÃªm = 2 giá» (sai)
    const validDurationInHours = Math.max(0, durationInHours); 
    const validDurationInDays = Math.max(1, durationInDays);
    
    // XÃ¡c Ä‘á»‹nh loáº¡i giÃ¡ vÃ  tÃ­nh tiá»n phÃ²ng
    // Æ¯u tiÃªn láº¥y rateType tá»« form checkout náº¿u cÃ³, náº¿u khÃ´ng thÃ¬ láº¥y tá»« lastCheckIn
    const rateType = this.checkOutForm?.get('rateType')?.value || lastCheckIn.rateType || 'hourly';
    
    // Log thÃ´ng tin tÃ­nh toÃ¡n thá»i gian (chá»‰ khi Date há»£p lá»‡)
    if (!isNaN(checkInTime.getTime()) && !isNaN(checkOutTime.getTime())) {
      console.log(`[calculateTotalPrice] Check-in time: ${checkInTime.toISOString()}`);
      console.log(`[calculateTotalPrice] Check-out time: ${checkOutTime.toISOString()}`);
      console.log(`[calculateTotalPrice] Duration in hours: ${validDurationInHours}`);
      console.log(`[calculateTotalPrice] Duration in minutes: ${durationInMinutes}`);
      console.log(`[calculateTotalPrice] RateType: ${rateType}`);
    } else {
      console.error('[calculateTotalPrice] Invalid dates:', { checkInTime, checkOutTime });
    }

    const roomPrice = this.calculateRoomTotalByRateType(validDurationInHours, validDurationInDays, rateType, remainingMinutes);
    this._roomPriceTotal = roomPrice;
    this._hasRoomPriceFromAPI = true;

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

    this.totalPrice = roomPrice + totalAdditionalCharges + serviceTotal;

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

    this.remainingAmount = this.totalPrice - this.advancePayment - totalDiscount;

  }

  // Xá»­ lÃ½ check-in
  processCheckIn(): void {
    // Kiá»ƒm tra tráº¡ng thÃ¡i phÃ²ng
    const allowPrebooked = this.isPrebookedAvailable();
    if (this.roomData.status !== 'vacant' && !allowPrebooked) {
      this.message.error(`PhÃ²ng ${this.roomData.roomNumber} khÃ´ng sáºµn sÃ ng Ä‘á»ƒ nháº­n phÃ²ng (Tráº¡ng thÃ¡i hiá»‡n táº¡i: ${this.getStatusLabel(this.roomData.status)}).`);
      this.isLoading = false;
      return;
    }

    // Náº¿u skipValidation = true, bá» qua viá»‡c kiá»ƒm tra form há»£p lá»‡
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
    
    // Táº¡o thá»i gian checkin má»™t láº§n duy nháº¥t theo UTC+7 (mÃºi giá» Viá»‡t Nam)
    const checkinTime = this.getUTCTimePlus7();
    
    // Láº¥y giÃ¡ trá»‹ trá»±c tiáº¿p tá»« form control Ä‘á»ƒ Ä‘áº£m báº£o láº¥y Ä‘Ãºng
    const guestInfoFormGroup = this.checkInForm.get('guestInfo') as FormGroup;
    
    // Láº¥y giÃ¡ trá»‹ tá»« form control, sá»­ dá»¥ng getRawValue() náº¿u form bá»‹ disable
    const guestInfoForm = guestInfoFormGroup ? 
      (guestInfoFormGroup.disabled ? guestInfoFormGroup.getRawValue() : guestInfoFormGroup.value) : 
      (this.checkInForm.get('guestInfo')?.value || {});
    
    // Láº¥y guestSource trá»±c tiáº¿p tá»« form control Ä‘á»ƒ Ä‘áº£m báº£o láº¥y Ä‘Ãºng
    const guestSourceControl = guestInfoFormGroup?.get('guestSource');
    const guestSourceValue = guestSourceControl ? 
      (guestSourceControl.disabled ? guestSourceControl.getRawValue() : guestSourceControl.value) : 
      (guestInfoForm.guestSource || 'walkin');
    
    // Äáº£m báº£o tÃªn khÃ¡ch máº·c Ä‘á»‹nh lÃ  "KhÃ¡ch láº»" náº¿u khÃ´ng nháº­p
    const guestInfo = {
      name: guestInfoForm.name || 'KhÃ¡ch láº»',
      idNumber: guestInfoForm.idNumber || '',
      tax_code: guestInfoForm.tax_code || '',
      phone: guestInfoForm.phone || '',
      email: guestInfoForm.email || '',
      address: guestInfoForm.address || '',
      guestSource: guestSourceValue || 'walkin' // Sá»­ dá»¥ng giÃ¡ trá»‹ tá»« form control
    };
    
    
    // Äáº£m báº£o advancePayment luÃ´n lÃ  sá»‘, máº·c Ä‘á»‹nh 0
    const advancePayment = Number(this.checkInForm.get('advancePayment')?.value) || 0;
    const advancePaymentMethod = this.checkInForm.get('advancePaymentMethod')?.value || 'cash';
    const additionalCharges = Number(this.checkInForm.get('additionalCharges')?.value) || 0;
    const discount = Number(this.checkInForm.get('discount')?.value) || 0;
    
    const checkinEventData = {
        type: 'checkin',
        checkinTime: checkinTime, // Sá»­ dá»¥ng thá»i gian Ä‘Ã£ táº¡o
        checkInTime: checkinTime,
        checkInDate: checkinTime,
        guestInfo: guestInfo,
        guestName: guestInfo.name,
        guestPhone: guestInfo.phone,
        guestId: guestInfo.idNumber,
        guestEmail: guestInfo.email,
        guestAddress: guestInfo.address,
        paymentMethod: this.normalizePaymentMethod(this.checkInForm.get('paymentMethod')?.value || 'cash'),
        rateType: this.checkInForm.get('rateType')?.value || 'hourly',
        advancePayment: advancePayment, // Äáº£m báº£o lÃ  sá»‘
        advancePaymentMethod: advancePaymentMethod, // HÃ¬nh thá»©c thanh toÃ¡n cho tráº£ trÆ°á»›c
        additionalCharges: additionalCharges, // Äáº£m báº£o lÃ  sá»‘
        discount: discount, // Äáº£m báº£o lÃ  sá»‘
        notes: this.checkInForm.get('notes')?.value || '',
        selectedServices: this.selectedServices || []
      };

    const newRoom = {
      status: 'occupied',
      events: [
        checkinEventData
      ]
    };
    
    // ÄÃ³ng modal ngay láº­p tá»©c
    if (this.modalRef) {
      this.modalRef.close({ 
        success: true,
        checkinInfo: {
          checkinTime: checkinTime, // Sá»­ dá»¥ng cÃ¹ng thá»i gian
          guestInfo: this.checkInForm.get('guestInfo')?.value,
            paymentMethod: this.normalizePaymentMethod(this.checkInForm.get('paymentMethod')?.value),
          rateType: this.checkInForm.get('rateType')?.value,
          advancePayment: this.checkInForm.get('advancePayment')?.value,
          notes: this.checkInForm.get('notes')?.value,
          selectedServices: this.selectedServices
        }
      });
    }
    
    // Thá»±c hiá»‡n checkin trong background
    this.roomsService.checkInRoom(this.roomData._id, newRoom)
      .subscribe(
        (room) => {
          setTimeout(() => {
            this.message.success('Nháº­n phÃ²ng thÃ nh cÃ´ng');
            
            // Táº¡o phiáº¿u thu cho tiá»n Ä‘áº·t trÆ°á»›c náº¿u cÃ³
            try {
              const hotelId = this.authService.getHotelId();
              const payerName = guestInfo?.name || 'KhÃ¡ch láº»';
              if (hotelId && advancePayment > 0) {
                const normalizedMethod = this.normalizePaymentMethod(advancePaymentMethod);
                const methodForTransaction = (normalizedMethod === 'transfer' ? 'bank_transfer' : normalizedMethod) as 'cash' | 'bank_transfer' | 'card';
                this.transactionService.createIncome({
                  hotelId,
                  amount: advancePayment,
                  method: methodForTransaction,
                  incomeCategory: 'deposit',
                  description: `[Äáº·t trÆ°á»›c] PhÃ²ng ${this.roomData.roomNumber}`,
                  notes: `Äáº·t trÆ°á»›c lÃºc nháº­n phÃ²ng ${this.roomData.roomNumber} - ${payerName}`,
                  payer: payerName
                }).subscribe({
                  next: () => console.log('ÄÃ£ táº¡o phiáº¿u thu Ä‘áº·t trÆ°á»›c cho phÃ²ng', this.roomData.roomNumber, 'method:', methodForTransaction),
                  error: (err) => console.error('Lá»—i táº¡o phiáº¿u thu Ä‘áº·t trÆ°á»›c:', err)
                });
              }
            } catch (e) {
              console.error('Lá»—i khi táº¡o phiáº¿u thu Ä‘áº·t trÆ°á»›c:', e);
            }
            
            // Log Ä‘á»ƒ debug - dá»¯ liá»‡u Ä‘Ã£ Ä‘Æ°á»£c lÆ°u vÃ o RoomEvent qua backend
            console.log('Check-in data saved to RoomEvent:', {
              guestInfo: checkinEventData.guestInfo,
              guestSource: checkinEventData.guestInfo?.guestSource, // Log riÃªng guestSource
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
            
            // Tá»± Ä‘á»™ng báº­t cÃ´ng táº¯c Ä‘iá»‡n khi check-in
            this.tuyaService.autoTurnOnOnCheckIn(this.roomData._id).subscribe({
              next: (response) => {
                if (response.data && response.data.devicesControlled > 0) {
                  console.log(`ÄÃ£ tá»± Ä‘á»™ng báº­t ${response.data.devicesControlled} cÃ´ng táº¯c Ä‘iá»‡n`);
                }
              },
              error: (error) => {
                console.error('Lá»—i khi tá»± Ä‘á»™ng báº­t cÃ´ng táº¯c:', error);
                // KhÃ´ng hiá»ƒn thá»‹ lá»—i Ä‘á»ƒ khÃ´ng lÃ m phiá»n user
              }
            });
            
            // Notify Ä‘á»ƒ reload data - dá»¯ liá»‡u sáº½ Ä‘Æ°á»£c láº¥y tá»« RoomEvent khi reload
            this.emitRoomDataUpdated('checkin', { roomId: this.roomData?._id, delayMs: 100 });
          }, 100);
        },
        (error) => {
          setTimeout(() => {
            this.message.error('Lá»—i khi nháº­n phÃ²ng: ' + error.message);
            this.emitRoomDataUpdated('checkin', { roomId: this.roomData?._id, delayMs: 100 });
          }, 100);
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

  // Xá»­ lÃ½ checkout
  processCheckOut(): void {
    // Kiá»ƒm tra tráº¡ng thÃ¡i phÃ²ng
    if (this.roomData.status !== 'occupied') {
      this.message.error(`PhÃ²ng ${this.roomData.roomNumber} hiá»‡n khÃ´ng cÃ³ khÃ¡ch Ä‘á»ƒ tráº£ phÃ²ng (Tráº¡ng thÃ¡i: ${this.getStatusLabel(this.roomData.status)}).`);
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    const currentTime = this.getUTCTimePlus7();
    
    // Láº¥y dá»¯ liá»‡u tá»« RoomEvent (lastCheckinEvent) thay vÃ¬ session
    let checkInTime = this.getUTCTimePlus7();
    let lastCheckinEvent = null;
    
    // TÃ¬m event check-in cuá»‘i cÃ¹ng CHÆ¯A CHECKOUT tá»« roomData.events
    if (this.roomData.events && this.roomData.events.length > 0) {
      const checkinEvents = this.getUncheckedOutCheckinEvents(this.roomData.events);
      
      if (checkinEvents.length > 0) {
        lastCheckinEvent = checkinEvents[0];
        checkInTime = this.getEventCheckinTime(lastCheckinEvent) || this.getUTCTimePlus7();
      }
    }
    
    // Náº¿u khÃ´ng tÃ¬m tháº¥y event check-in, thá»­ reload láº¡i room data tá»« backend
    if (!lastCheckinEvent) {
      console.warn('No unchecked out checkin event found, attempting to reload room data');
      
      // Thá»­ reload room data tá»« backend vá»›i excludeCheckedOut = true
      if (this.roomData && this.roomData._id) {
        this.roomsService.getRoomById(this.roomData._id, { excludeCheckedOut: true }).subscribe({
          next: (reloadedRoom) => {
            if (reloadedRoom.events && reloadedRoom.events.length > 0) {
              const reloadedCheckinEvents = this.getUncheckedOutCheckinEvents(reloadedRoom.events);
              if (reloadedCheckinEvents.length > 0) {
                // Cáº­p nháº­t roomData vá»›i dá»¯ liá»‡u má»›i
                this.roomData = reloadedRoom;
                lastCheckinEvent = reloadedCheckinEvents[0];
                checkInTime = this.getEventCheckinTime(lastCheckinEvent) || this.getUTCTimePlus7();
                // Tiáº¿p tá»¥c xá»­ lÃ½ checkout vá»›i event má»›i
                this.processCheckOutWithEvent(lastCheckinEvent, checkInTime);
                return;
              }
            }
            // Náº¿u váº«n khÃ´ng tÃ¬m tháº¥y, hiá»ƒn thá»‹ warning vÃ  cho phÃ©p checkout vá»›i thÃ´ng tin máº·c Ä‘á»‹nh
            this.message.warning('KhÃ´ng tÃ¬m tháº¥y thÃ´ng tin check-in tá»« RoomEvent. Sá»­ dá»¥ng thÃ´ng tin máº·c Ä‘á»‹nh.');
            this.processCheckOutWithDefaultData();
          },
          error: (err) => {
            console.error('Error reloading room data:', err);
            this.message.warning('KhÃ´ng tÃ¬m tháº¥y thÃ´ng tin check-in tá»« RoomEvent. Sá»­ dá»¥ng thÃ´ng tin máº·c Ä‘á»‹nh.');
            this.processCheckOutWithDefaultData();
          }
        });
      } else {
        this.message.warning('KhÃ´ng tÃ¬m tháº¥y thÃ´ng tin check-in tá»« RoomEvent. Sá»­ dá»¥ng thÃ´ng tin máº·c Ä‘á»‹nh.');
        this.processCheckOutWithDefaultData();
      }
      this.isLoading = false;
      return;
    }
    
    // Tiáº¿p tá»¥c xá»­ lÃ½ checkout vá»›i event tÃ¬m Ä‘Æ°á»£c
    this.processCheckOutWithEvent(lastCheckinEvent, checkInTime);
  }
  
  // Xá»­ lÃ½ checkout vá»›i event check-in Ä‘Ã£ tÃ¬m Ä‘Æ°á»£c
  private processCheckOutWithEvent(lastCheckinEvent: any, checkInTime: Date): void {
    const currentTime = this.getUTCTimePlus7();
    
    // Láº¥y tÃªn khÃ¡ch vÃ  nguá»“n khÃ¡ch tá»« nhiá»u nguá»“n
    let customerName = 'KhÃ¡ch láº»';
    let customerPhone = 'N/A';
    let customerEmail = 'N/A';
    let guestSource = 'walkin';
    
    // Æ¯u tiÃªn 1: Tá»« form checkout (náº¿u user Ä‘Ã£ chá»‰nh sá»­a)
    const formGuestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
    const formGuestInfo = formGuestInfoFormGroup ? 
      (formGuestInfoFormGroup.disabled ? formGuestInfoFormGroup.getRawValue() : formGuestInfoFormGroup.value) : 
      (this.checkOutForm.get('guestInfo')?.value || {});
    
    // Láº¥y guestSource trá»±c tiáº¿p tá»« form control
    const formGuestSourceControl = formGuestInfoFormGroup?.get('guestSource');
    const formGuestSourceValue = formGuestSourceControl ? 
      (formGuestSourceControl.disabled ? formGuestSourceControl.getRawValue() : formGuestSourceControl.value) : 
      (formGuestInfo.guestSource || null);
    
    if (formGuestInfo.name && formGuestInfo.name !== 'KhÃ¡ch láº»') {
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
    
    // Æ¯u tiÃªn 2: Tá»« lastCheckinEvent.guestInfo (chá»‰ náº¿u form khÃ´ng cÃ³ giÃ¡ trá»‹)
    if ((!customerName || customerName === 'KhÃ¡ch láº»') && lastCheckinEvent.guestInfo?.name && lastCheckinEvent.guestInfo.name !== 'KhÃ¡ch láº»') {
      customerName = lastCheckinEvent.guestInfo.name;
      customerPhone = lastCheckinEvent.guestInfo.phone || customerPhone;
      customerEmail = lastCheckinEvent.guestInfo.email || customerEmail;
    }
    // CHá»ˆ láº¥y guestSource tá»« lastCheckinEvent náº¿u form KHÃ”NG cÃ³ giÃ¡ trá»‹
    if (!formGuestSourceValue && lastCheckinEvent.guestInfo?.guestSource) {
      guestSource = lastCheckinEvent.guestInfo.guestSource;
    }
    
    // Æ¯u tiÃªn 3: Tá»« roomData.currentBooking (chá»‰ náº¿u form vÃ  lastCheckinEvent khÃ´ng cÃ³ giÃ¡ trá»‹)
    if ((!customerName || customerName === 'KhÃ¡ch láº»') && this.roomData.currentBooking) {
      const currentBooking = typeof this.roomData.currentBooking === 'object' ? this.roomData.currentBooking : null;
      if (currentBooking?.guestInfo?.name) {
        customerName = currentBooking.guestInfo.name;
        customerPhone = currentBooking.guestInfo.phone || customerPhone;
        customerEmail = currentBooking.guestInfo.email || customerEmail;
      }
    }
    // CHá»ˆ láº¥y guestSource tá»« currentBooking náº¿u form vÃ  lastCheckinEvent KHÃ”NG cÃ³ giÃ¡ trá»‹
    if (!formGuestSourceValue && !lastCheckinEvent.guestInfo?.guestSource) {
      const currentBooking = typeof this.roomData.currentBooking === 'object' ? this.roomData.currentBooking : null;
      if (currentBooking?.guestInfo?.guestSource) {
        guestSource = currentBooking.guestInfo.guestSource;
      }
    }
    
    // Æ¯u tiÃªn 4: Tá»« roomData.events (lastCheckinEvent) - chá»‰ láº¥y event chÆ°a checkout
    if ((!customerName || customerName === 'KhÃ¡ch láº»') && this.roomData.events && this.roomData.events.length > 0) {
      const checkinEvents = this.getUncheckedOutCheckinEvents(this.roomData.events);
      
      if (checkinEvents.length > 0) {
        const lastCheckinEvent = checkinEvents[0];
        if (lastCheckinEvent.guestInfo?.name && lastCheckinEvent.guestInfo.name !== 'KhÃ¡ch láº»') {
          customerName = lastCheckinEvent.guestInfo.name;
          customerPhone = lastCheckinEvent.guestInfo.phone || customerPhone;
          customerEmail = lastCheckinEvent.guestInfo.email || customerEmail;
        }
        // CHá»ˆ láº¥y guestSource tá»« events náº¿u form vÃ  currentBooking KHÃ”NG cÃ³ giÃ¡ trá»‹
        if (!formGuestSourceValue) {
          const currentBooking = typeof this.roomData.currentBooking === 'object' ? this.roomData.currentBooking : null;
          if (!currentBooking?.guestInfo?.guestSource && lastCheckinEvent.guestInfo?.guestSource) {
            guestSource = lastCheckinEvent.guestInfo.guestSource;
          }
        }
      }
    }
    
    // Æ¯u tiÃªn 5: Tá»« listData (náº¿u cÃ³) (chá»‰ náº¿u cÃ¡c nguá»“n trÃªn khÃ´ng cÃ³ giÃ¡ trá»‹)
    if ((!customerName || customerName === 'KhÃ¡ch láº»') && this.listData && this.listData.length > 0) {
      const firstItem = this.listData[0];
      if (firstItem.guestInfo?.name && firstItem.guestInfo.name !== 'KhÃ¡ch láº»') {
        customerName = firstItem.guestInfo.name;
        customerPhone = firstItem.guestInfo.phone || customerPhone;
        customerEmail = firstItem.guestInfo.email || customerEmail;
      }
      // CHá»ˆ láº¥y guestSource tá»« listData náº¿u cÃ¡c nguá»“n trÃªn KHÃ”NG cÃ³ giÃ¡ trá»‹
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
    
    // Log Ä‘á»ƒ debug
    console.log('Checkout processCheckOut - Final guestSource:', {
      formGuestSourceValue: formGuestSourceValue,
      lastCheckinEventGuestSource: lastCheckinEvent?.guestInfo?.guestSource,
      finalGuestSource: guestSource
    });
    
    // TÃ­nh thá»i gian lÆ°u trÃº chÃ­nh xÃ¡c theo phÃºt
    const durationInMilliseconds = currentTime.getTime() - checkInTime.getTime();
    const durationInMinutes = Math.floor(durationInMilliseconds / (1000 * 60));
    const durationInHours = Math.floor(durationInMinutes / 60);
    const remainingMinutes = durationInMinutes % 60;
    const durationInDays = Math.ceil(durationInHours / 24);
    
    // TÃ­nh tá»•ng tiá»n phÃ²ng dá»±a trÃªn loáº¡i giÃ¡ (rateType)
    // Æ¯u tiÃªn láº¥y rateType tá»« form checkout náº¿u cÃ³, náº¿u khÃ´ng thÃ¬ láº¥y tá»« lastCheckinEvent
    let rateType = this.checkOutForm?.get('rateType')?.value || lastCheckinEvent?.rateType || 'hourly';
    
    // TÃ­nh tá»•ng tiá»n dá»‹ch vá»¥
    const servicesTotal = this.calculateServicesTotal();
    
    // Láº¥y giÃ¡ trá»‹ phá»¥ thu vÃ  giáº£m giÃ¡ tá»« form checkout, Ä‘áº£m báº£o lÃ  sá»‘
    const checkoutCharges = Number(this.checkOutForm.get('additionalCharges')?.value) || 0;
    const checkoutDiscount = Number(this.checkOutForm.get('discount')?.value) || 0;
    
    // TÃ­nh tá»•ng phá»¥ thu vÃ  khuyáº¿n mÃ£i (bao gá»“m cáº£ tá»« check-in vÃ  checkout)
    // initialCharges vÃ  initialDiscount Ä‘Ã£ Ä‘Æ°á»£c set khi load dá»¯ liá»‡u tá»« check-in event
    // checkoutCharges vÃ  checkoutDiscount lÃ  giÃ¡ trá»‹ ngÆ°á»i dÃ¹ng nháº­p thÃªm vÃ o form checkout (form báº¯t Ä‘áº§u tá»« 0)
    // Äá»“ng bá»™ vá»›i room.component.ts: totalAmount = roomPrice + additionalCharges + serviceAmount - discount - advancePayment
    const additionalCharges = this.initialCharges + checkoutCharges;
    const discount = this.initialDiscount + checkoutDiscount;
    
    // Trá»« tiá»n Ä‘Ã£ tráº£ trÆ°á»›c (náº¿u cÃ³) - láº¥y tá»« lastCheckinEvent hoáº·c form
    const advancePayment = Number(this.checkOutForm?.get('advancePayment')?.value) || 
                           Number(lastCheckinEvent.advancePayment) || 0;
    const advancePaymentMethod = this.checkOutForm?.get('advancePaymentMethod')?.value || 
                                 lastCheckinEvent.advancePaymentMethod || 'cash';
    
    const roomTotal = this.calculateRoomTotalByRateType(durationInHours, durationInDays, rateType, remainingMinutes);
    const grandTotal = Math.max(0, roomTotal + additionalCharges + servicesTotal - discount - advancePayment);
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
  
  // Xá»­ lÃ½ checkout vá»›i thÃ´ng tin máº·c Ä‘á»‹nh khi khÃ´ng tÃ¬m tháº¥y event check-in
  private processCheckOutWithDefaultData(): void {
    const currentTime = this.getUTCTimePlus7();
    // Sá»­ dá»¥ng thá»i gian hiá»‡n táº¡i trá»« 1 giá» lÃ m checkinTime máº·c Ä‘á»‹nh
    const defaultCheckInTime = new Date(currentTime.getTime() - 3600000);
    
    // Táº¡o event máº·c Ä‘á»‹nh
    const defaultEvent = {
      checkinTime: defaultCheckInTime,
      rateType: this.checkOutForm?.get('rateType')?.value || 'hourly',
      advancePayment: Number(this.checkOutForm?.get('advancePayment')?.value) || 0,
      guestInfo: {
        name: 'KhÃ¡ch láº»',
        phone: '',
        email: '',
        guestSource: 'walkin'
      }
    };
    
    // Láº¥y thÃ´ng tin tá»« form náº¿u cÃ³
    const formGuestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
    const formGuestInfo = formGuestInfoFormGroup ? 
      (formGuestInfoFormGroup.disabled ? formGuestInfoFormGroup.getRawValue() : formGuestInfoFormGroup.value) : 
      (this.checkOutForm.get('guestInfo')?.value || {});
    
    if (formGuestInfo.name && formGuestInfo.name !== 'KhÃ¡ch láº»') {
      defaultEvent.guestInfo.name = formGuestInfo.name;
      defaultEvent.guestInfo.phone = formGuestInfo.phone || '';
      defaultEvent.guestInfo.email = formGuestInfo.email || '';
      defaultEvent.guestInfo.guestSource = formGuestInfo.guestSource || 'walkin';
    }
    
    // Tiáº¿p tá»¥c xá»­ lÃ½ checkout vá»›i event máº·c Ä‘á»‹nh
    this.processCheckOutWithEvent(defaultEvent, defaultCheckInTime);
  }

  /**
   * Xá»­ lÃ½ checkout vá»›i giÃ¡ Ä‘Ã£ Ä‘Æ°á»£c tÃ­nh tá»« backend
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
    // Äáº£m báº£o roomTotal cÃ³ giÃ¡ trá»‹ há»£p lá»‡
    // Náº¿u roomTotal lÃ  0 hoáº·c undefined, sá»­ dá»¥ng _roomPriceTotal hoáº·c tÃ­nh láº¡i
    let validRoomTotal = roomTotal;
    if (!validRoomTotal || validRoomTotal <= 0) {
      console.warn('[processCheckoutWithPrice] roomTotal is invalid, using _roomPriceTotal:', {
        roomTotal,
        _roomPriceTotal: this._roomPriceTotal
      });
      validRoomTotal = this._roomPriceTotal || 0;
      
      // Náº¿u váº«n khÃ´ng cÃ³ giÃ¡ trá»‹, tÃ­nh láº¡i tá»« calculateRoomTotalByRateType
      if (!validRoomTotal || validRoomTotal <= 0) {
        const remainingMinutes = 0;
        validRoomTotal = this.calculateRoomTotalByRateType(durationInHours, durationInDays, rateType, remainingMinutes);
        console.warn('[processCheckoutWithPrice] Recalculated roomTotal:', validRoomTotal);
      }
    }
    
    console.log('[processCheckoutWithPrice] Final roomTotal:', validRoomTotal);
    
    // QUAN TRá»ŒNG: Cáº­p nháº­t check-in event vá»›i additionalCharges vÃ  discount má»›i (tá»•ng) TRÆ¯á»šC KHI checkout
    // Äáº£m báº£o khi room.component reload, nÃ³ sáº½ láº¥y Ä‘Æ°á»£c giÃ¡ trá»‹ má»›i nháº¥t tá»« check-in event
    // Láº¥y giÃ¡ trá»‹ phá»¥ thu vÃ  khuyáº¿n mÃ£i tá»« form checkout (chá»‰ giÃ¡ trá»‹ ngÆ°á»i dÃ¹ng nháº­p thÃªm)
    const checkoutCharges = Number(this.checkOutForm.get('additionalCharges')?.value) || 0;
    const checkoutDiscount = Number(this.checkOutForm.get('discount')?.value) || 0;
    
    const formGuestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
    const formGuestInfoValue = formGuestInfoFormGroup ? 
      (formGuestInfoFormGroup.disabled ? formGuestInfoFormGroup.getRawValue() : formGuestInfoFormGroup.value) : 
      (this.checkOutForm.get('guestInfo')?.value || {});
    
    const updatedGuestInfo = {
      name: formGuestInfoValue.name || customerName || 'KhÃ¡ch láº»',
      idNumber: formGuestInfoValue.idNumber || '',
      tax_code: formGuestInfoValue.tax_code || '',
      phone: formGuestInfoValue.phone || customerPhone || '',
      email: formGuestInfoValue.email || customerEmail || '',
      address: formGuestInfoValue.address || '',
      guestSource: formGuestInfoValue.guestSource || guestSource || 'walkin'
    };
    
    // Cáº­p nháº­t check-in event vá»›i additionalCharges vÃ  discount má»›i (tá»•ng) trÆ°á»›c khi checkout
    // Äáº£m báº£o room.component sáº½ láº¥y Ä‘Æ°á»£c giÃ¡ trá»‹ má»›i nháº¥t khi reload
    this.roomsService.updateRoomCheckinInfo(
      this.roomData._id,
      updatedGuestInfo,
      advancePayment,
      rateType,
      additionalCharges,
      discount,
      this.selectedServices,
      advancePaymentMethod
    ).subscribe({
      next: (updateResponse) => {
        console.log('Updated check-in event before checkout:', {
          additionalCharges: additionalCharges,
          discount: discount,
          initialCharges: this.initialCharges,
          checkoutCharges: checkoutCharges,
          initialDiscount: this.initialDiscount,
          checkoutDiscount: checkoutDiscount,
          grandTotal: grandTotal,
          remainingAmount: remainingAmount
        });
        
        // Sau khi cáº­p nháº­t check-in event thÃ nh cÃ´ng, tiáº¿p tá»¥c vá»›i checkout
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
      },
      error: (updateError) => {
        console.error('Error updating check-in event before checkout:', updateError);
        // Váº«n tiáº¿p tá»¥c checkout dÃ¹ cÃ³ lá»—i cáº­p nháº­t
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
    });
  }
  
  /**
   * Tiáº¿p tá»¥c xá»­ lÃ½ checkout sau khi Ä‘Ã£ cáº­p nháº­t check-in event
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
    // Chuáº©n bá»‹ dá»¯ liá»‡u checkout
    const paymentMethod = this.normalizePaymentMethod(this.checkOutForm.get('paymentMethod')?.value);
    const createDebt = this.checkOutForm.get('createDebt')?.value || false;
    // LÆ°u paymentMethod vÃ o checkoutData Ä‘á»ƒ sá»­ dá»¥ng sau khi kiá»ƒm tra QR setting
    const checkoutData = {
      status: 'dirty',
      paymentStatus: createDebt ? 'pending' : ((paymentMethod === 'transfer') ? 'pending' : 'paid'),
      checkoutTime: currentTime,
      checkOutTime: currentTime,
      checkinTime: checkInTime,
      checkInTime: checkInTime,
      skipAutoIncomeVoucher: true,
      advancePayment: advancePayment,
      advancePaymentMethod: advancePaymentMethod,
      roomTotal: validRoomTotal, // Gá»­i validRoomTotal Ä‘Ã£ Ä‘Æ°á»£c validate
      rateType: rateType, // Gá»­i rateType Ä‘Ã£ Ä‘Æ°á»£c tÃ­nh toÃ¡n tá»« backend
      totalAmount: grandTotal, // Tá»•ng tiá»n (room + services + charges - discount)
      remainingAmount: remainingAmount,
      additionalCharges: additionalCharges,
      discount: discount,
      paymentMethod: paymentMethod,
      notes: this.checkOutForm.get('notes')?.value,
      reason: this.checkOutForm.get('reason')?.value,
      services: this.selectedServices,
      createDebt: createDebt, // Flag Ä‘á»ƒ Ä‘Æ°a vÃ o cÃ´ng ná»£
      // Gá»­i thÃ´ng tin khÃ¡ch hÃ ng Ä‘á»ƒ backend sá»­ dá»¥ng
      customerName: customerName,
      customerPhone: customerPhone && customerPhone !== 'N/A' ? customerPhone : undefined,
      customerEmail: customerEmail && customerEmail !== 'N/A' ? customerEmail : undefined,
      guestName: customerName,
      guestPhone: customerPhone && customerPhone !== 'N/A' ? customerPhone : '',
      guestId: formGuestInfo.idNumber || '',
      guestEmail: customerEmail && customerEmail !== 'N/A' ? customerEmail : '',
      guestAddress: formGuestInfo.address || '',
      // Gá»­i guestInfo Ä‘áº§y Ä‘á»§ Ä‘á»ƒ backend lÆ°u vÃ o event
      guestInfo: {
        name: customerName,
        phone: customerPhone && customerPhone !== 'N/A' ? customerPhone : '',
        email: customerEmail && customerEmail !== 'N/A' ? customerEmail : '',
        idNumber: formGuestInfo.idNumber || '',
        address: formGuestInfo.address || '',
        guestSource: guestSource // Sá»­ dá»¥ng guestSource Ä‘Ã£ láº¥y tá»« nhiá»u nguá»“n (Æ°u tiÃªn tá»« form)
      },
      events: [
        ...this.roomData.events || [],
        {
          type: 'checkout',
          checkoutTime: currentTime,
          checkOutTime: currentTime,
          checkinTime: checkInTime,
          checkInTime: checkInTime,
          amount: grandTotal,
          rateType: rateType, // ThÃªm rateType Ä‘Ã£ Ä‘Æ°á»£c tÃ­nh toÃ¡n tá»« backend
          paymentMethod: paymentMethod,
          staffId: this.currentUser?._id || this.currentUser?.id || undefined,
          guestInfo: {
            name: customerName,
            phone: customerPhone && customerPhone !== 'N/A' ? customerPhone : '',
            email: customerEmail && customerEmail !== 'N/A' ? customerEmail : '',
            idNumber: formGuestInfo.idNumber || '',
            address: formGuestInfo.address || '',
            guestSource: guestSource // Äáº£m báº£o guestSource Ä‘Æ°á»£c gá»­i trong event
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
    
    // Log Ä‘á»ƒ debug
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
    
    // Táº¡o danh sÃ¡ch products cho hÃ³a Ä‘Æ¡n
    const products: any[] = [];
    
    console.log('[processCheckoutWithPrice] Creating invoice products:', {
      roomTotal: validRoomTotal,
      roomNumber: this.roomData.roomNumber,
      servicesCount: this.selectedServices?.length || 0
    });
    
    // ThÃªm tiá»n phÃ²ng vÃ o products (sá»­ dá»¥ng validRoomTotal Ä‘Ã£ Ä‘Æ°á»£c validate á»Ÿ trÃªn)
    products.push({
      name: `Tiá»n phÃ²ng ${this.roomData.roomNumber}`,
      price: validRoomTotal,
      quantity: 1,
      totalPrice: validRoomTotal // ThÃªm totalPrice Ä‘á»ƒ Ä‘áº£m báº£o tÃ­nh Ä‘Ãºng
    });
    
    // ThÃªm cÃ¡c dá»‹ch vá»¥ vÃ o products
    if (this.selectedServices && this.selectedServices.length > 0) {
      this.selectedServices.forEach(service => {
        const serviceTotal = service.price * (service.quantity || 1);
        products.push({
          name: service.serviceName,
          price: service.price,
          quantity: service.quantity || 1,
          totalPrice: serviceTotal // ThÃªm totalPrice Ä‘á»ƒ Ä‘áº£m báº£o tÃ­nh Ä‘Ãºng
        });
      });
    }
    
    console.log('[processCheckoutWithPrice] Products created:', products);
    
    // Táº¡o dá»¯ liá»‡u hÃ³a Ä‘Æ¡n
    const invoiceData = {
      roomId: this.roomData._id,
      roomNumber: this.roomData.roomNumber,
      roomType: this.roomData.type,
      hotelId: this.roomData.hotelId || this.authService.getHotelId() || this.currentUser?.hotelId,
      invoiceNumber: 'INV-' + Date.now(),
      date: new Date(),
      staffName: this.currentUser?.fullName || this.currentUser?.username || 'NhÃ¢n viÃªn',
      staffId: this.currentUser?._id || this.currentUser?.id || undefined,
      customerName: customerName, // Sá»­ dá»¥ng tÃªn khÃ¡ch Ä‘Ã£ láº¥y tá»« nhiá»u nguá»“n
      customerPhone: customerPhone !== 'N/A' ? customerPhone : '',
      customerEmail: customerEmail !== 'N/A' ? customerEmail : '',
      checkInTime: checkInTime,
      checkOutTime: currentTime,
      duration: {
        hours: durationInHours,
        days: durationInDays
      },
      roomPrice: validRoomTotal,
      roomTotal: validRoomTotal,
      products: products,
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
      paymentStatus: checkoutData.paymentStatus || 'paid', // ThÃªm paymentStatus tá»« checkoutData
      notes: this.checkOutForm.get('notes')?.value,
      rateType: rateType, // ThÃªm rateType vÃ o invoiceData
      guestInfo: {
        name: customerName,
        phone: customerPhone && customerPhone !== 'N/A' ? customerPhone : '',
        email: customerEmail && customerEmail !== 'N/A' ? customerEmail : '',
        idNumber: formGuestInfo.idNumber || '',
        tax_code: formGuestInfo.tax_code || '', // MÃ£ sá»‘ thuáº¿ (cho cÃ´ng ty)
        address: formGuestInfo.address || '',
        guestSource: guestSource // ThÃªm guestSource vÃ o guestInfo
      },
      guestSource: guestSource // ThÃªm guestSource trá»±c tiáº¿p vÃ o invoiceData Ä‘á»ƒ dá»… truy cáº­p
    };
    
    // Kiá»ƒm tra náº¿u payment method lÃ  'transfer' (chuyá»ƒn khoáº£n)
    if (paymentMethod === 'transfer') {
      // Kiá»ƒm tra xem cÃ³ nÃªn hiá»ƒn thá»‹ QR payment khÃ´ng
      this.checkAndHandleTransferPayment(remainingAmount, invoiceData, checkoutData);
    } else {
      // ÄÃ³ng modal ngay láº­p tá»©c vÃ  thá»±c hiá»‡n checkout
      if (this.modalRef) {
        this.modalRef.close(closeResult);
      }
      this.pendingCheckoutCloseResult = null;
      
      // Thá»±c hiá»‡n checkout trong background
      this.roomsService.checkOutRoom(this.roomData._id, checkoutData)
        .subscribe(
          (response) => {
            setTimeout(() => {
              // Hiá»ƒn thá»‹ thÃ´ng bÃ¡o thÃ nh cÃ´ng (mÃ u xanh)
              this.message.success('Check-out thÃ nh cÃ´ng');

              if (this.roomData && this.roomData._id) {
                this.roomSessionService.endSession(this.roomData._id);
              }
              
              // Tá»± Ä‘á»™ng reload danh sÃ¡ch phÃ²ng ngay láº­p tá»©c
              this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, delayMs: 120 });
              
              // Tá»± Ä‘á»™ng táº¯t cÃ´ng táº¯c Ä‘iá»‡n khi check-out Ä‘á»ƒ tiáº¿t kiá»‡m Ä‘iá»‡n
              this.tuyaService.autoTurnOffOnCheckOut(this.roomData._id).subscribe({
                next: (response) => {
                  if (response.data && response.data.devicesControlled > 0) {
                    console.log(`ÄÃ£ tá»± Ä‘á»™ng táº¯t ${response.data.devicesControlled} cÃ´ng táº¯c Ä‘iá»‡n Ä‘á»ƒ tiáº¿t kiá»‡m Ä‘iá»‡n`);
                  }
                },
                error: (error) => {
                  console.error('Lá»—i khi tá»± Ä‘á»™ng táº¯t cÃ´ng táº¯c:', error);
                  // KhÃ´ng hiá»ƒn thá»‹ lá»—i Ä‘á»ƒ khÃ´ng lÃ m phiá»n user
                }
              });
              
              // Tá»± Ä‘á»™ng reload room data sau khi checkout thÃ nh cÃ´ng
              // TÄƒng delay Ä‘á»ƒ Ä‘áº£m báº£o backend Ä‘Ã£ lÆ°u xong checkout event vÃ  cáº­p nháº­t room status
              setTimeout(() => {
                if (this.roomData && this.roomData._id) {
                  this.roomsService.getRoomById(this.roomData._id, { 
                    limit: 1000,
                    excludeCheckedOut: true
                  }).subscribe({
                    next: (updatedRoom) => {
                      this.roomData = updatedRoom;
                      // Cáº­p nháº­t danh sÃ¡ch phÃ²ng vá»›i delay Ä‘á»ƒ Ä‘áº£m báº£o backend Ä‘Ã£ cáº­p nháº­t xong
                      // QUAN TRá»ŒNG: Sau khi checkout, phÃ²ng chuyá»ƒn sang dirty, nhÆ°ng cáº§n reload events Ä‘á»ƒ hiá»ƒn thá»‹ Ä‘Ãºng giÃ¡ trá»‹ cuá»‘i cÃ¹ng
                      setTimeout(() => {
                        this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 150 });
                      }, 500); // TÄƒng delay lÃªn 500ms Ä‘á»ƒ Ä‘áº£m báº£o backend Ä‘Ã£ lÆ°u xong checkout event vá»›i additionalCharges vÃ  discount má»›i
                    },
                    error: (err) => {
                      console.error('Error reloading room data:', err);
                      // Váº«n cáº­p nháº­t danh sÃ¡ch phÃ²ng dÃ¹ cÃ³ lá»—i
                      setTimeout(() => {
                        this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 150 });
                      }, 500);
                    }
                  });
                } else {
                  // Cáº­p nháº­t danh sÃ¡ch phÃ²ng vá»›i delay
                  setTimeout(() => {
                    this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 150 });
                  }, 500);
                }
              }, 300); // Delay 300ms trÆ°á»›c khi reload room data
              
              // Chá»‰ hiá»ƒn thá»‹ hÃ³a Ä‘Æ¡n náº¿u Ä‘Ã£ thanh toÃ¡n (khÃ´ng pháº£i chuyá»ƒn khoáº£n pending)
              // Náº¿u paymentMethod lÃ  'transfer', paymentStatus sáº½ lÃ  'pending' vÃ  khÃ´ng hiá»ƒn thá»‹ hÃ³a Ä‘Æ¡n
              const paymentStatus = checkoutData.paymentStatus || 'paid';
              if (paymentStatus === 'paid') {
                setTimeout(() => {
                  this.showInvoice(invoiceData);
                }, 200);
              }
            }, 100);
          },
          (error) => {
            setTimeout(() => {
              this.message.error('Lá»—i khi tráº£ phÃ²ng: ' + error.message);
              this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 120 });
            }, 100);
          }
        );
    }
  }
  
  /**
   * Kiá»ƒm tra vÃ  xá»­ lÃ½ thanh toÃ¡n chuyá»ƒn khoáº£n vá»›i QR (náº¿u Ä‘Æ°á»£c báº­t)
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

    // Æ¯u tiÃªn: náº¿u cÃ³ QR tá»« cÃ¡c nguá»“n business/hotel/manager/user thÃ¬ hiá»ƒn thá»‹ ngay
    const manager = (this.businessInfo && typeof this.businessInfo.managerId === 'object') ? this.businessInfo.managerId : null;
    const isQrAvailable = !!(
      this.businessOwner?.bankAccount?.qrPaymentUrl ||
      this.hotelBankAccount?.qrPaymentUrl ||
      manager?.bankAccount?.qrPaymentUrl ||
      this.currentUser?.bankAccount?.qrPaymentUrl
    );
    if (isQrAvailable) {
      this.handleTransferPayment(amount, invoiceData, checkoutData);
      return;
    }
    
    // Náº¿u khÃ´ng cÃ³ QR sáºµn cÃ³, kiá»ƒm tra hotel settings vÃ  pricing package
    if (this.roomData?.hotelId) {
      this.hotelService.getHotelById(this.roomData.hotelId).subscribe({
        next: (hotel: any) => {
          const hotelSettings = hotel.settings || {};
          const enableQRFromSettings = hotelSettings.enableQRPaymentForBankTransfer || false;
          
          if (hotel.businessId) {
            this.checkPricingPackageAndHandlePayment(hotel.businessId, enableQRFromSettings, amount, invoiceData, checkoutData);
          } else {
            if (enableQRFromSettings) {
              this.handleTransferPayment(amount, invoiceData, checkoutData);
            } else {
              checkoutData.paymentStatus = 'paid';
              invoiceData.paymentStatus = 'paid';
              this.proceedWithCheckoutDirectly(checkoutData, invoiceData);
            }
          }
        },
        error: (error) => {
          console.error('Error loading hotel settings:', error);
          // Fallback: thá»­ xá»­ lÃ½ transfer payment (sáº½ tá»± Ä‘á»™ng checkout trá»±c tiáº¿p náº¿u khÃ´ng cÃ³ QR)
          this.handleTransferPayment(amount, invoiceData, checkoutData);
        }
      });
    } else {
      // KhÃ´ng cÃ³ hotelId, xá»­ lÃ½ transfer payment (sáº½ tá»± Ä‘á»™ng checkout trá»±c tiáº¿p náº¿u khÃ´ng cÃ³ QR)
      this.handleTransferPayment(amount, invoiceData, checkoutData);
    }
  }
  
  /**
   * Kiá»ƒm tra pricing package vÃ  xá»­ lÃ½ thanh toÃ¡n
   */
  private checkPricingPackageAndHandlePayment(businessId: string, enableQRFromSettings: boolean, amount: number, invoiceData: any, checkoutData: any): void {
    // Kiá»ƒm tra tá»« businessInfo náº¿u cÃ³
    if (this.businessInfo?.pricingPackage) {
      const pricingPackage = this.businessInfo.pricingPackage;
      const hasQRFeature = pricingPackage.qrPaymentFeature || false;
      
      // Náº¿u pricing package cÃ³ QR feature hoáº·c hotel setting báº­t QR
      if (hasQRFeature || enableQRFromSettings) {
        // Gá»i handleTransferPayment - nÃ³ sáº½ tá»± kiá»ƒm tra cÃ³ QR code khÃ´ng
        // Náº¿u khÃ´ng cÃ³ QR code, sáº½ tá»± Ä‘á»™ng bá» qua modal vÃ  checkout trá»±c tiáº¿p
        this.handleTransferPayment(amount, invoiceData, checkoutData);
      } else {
        // KhÃ´ng cÃ³ QR feature vÃ  khÃ´ng báº­t trong settings, set paymentStatus = 'paid' vÃ  checkout vá»›i xuáº¥t hÃ³a Ä‘Æ¡n
        checkoutData.paymentStatus = 'paid';
        invoiceData.paymentStatus = 'paid';
        this.proceedWithCheckoutDirectly(checkoutData, invoiceData);
      }
    } else {
      // KhÃ´ng cÃ³ pricing package info, chá»‰ kiá»ƒm tra hotel settings
      if (enableQRFromSettings) {
        // Gá»i handleTransferPayment - nÃ³ sáº½ tá»± kiá»ƒm tra cÃ³ QR code khÃ´ng
        // Náº¿u khÃ´ng cÃ³ QR code, sáº½ tá»± Ä‘á»™ng bá» qua modal vÃ  checkout trá»±c tiáº¿p
        this.handleTransferPayment(amount, invoiceData, checkoutData);
      } else {
        // KhÃ´ng báº­t QR, set paymentStatus = 'paid' vÃ  checkout vá»›i xuáº¥t hÃ³a Ä‘Æ¡n
        checkoutData.paymentStatus = 'paid';
        invoiceData.paymentStatus = 'paid';
        this.proceedWithCheckoutDirectly(checkoutData, invoiceData);
      }
    }
  }
  
  /**
   * Thá»±c hiá»‡n checkout trá»±c tiáº¿p khÃ´ng qua QR
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
          customerName: checkoutData?.customerName || checkoutData?.guestName || checkoutData?.guestInfo?.name || 'KhÃ¡ch láº»',
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
    
    // Kiá»ƒm tra paymentStatus - chá»‰ hiá»ƒn thá»‹ hÃ³a Ä‘Æ¡n náº¿u Ä‘Ã£ thanh toÃ¡n
    const paymentStatus = checkoutData.paymentStatus || 'paid';
    const shouldShowInvoice = paymentStatus === 'paid';
    
    this.roomsService.checkOutRoom(this.roomData._id, checkoutData).subscribe({
      next: (response) => {
        this.isLoading = false;
        if (response.success) {
          setTimeout(() => {
            // Hiá»ƒn thá»‹ thÃ´ng bÃ¡o thÃ nh cÃ´ng (mÃ u xanh)
            this.message.success('Check-out thÃ nh cÃ´ng');
            
            // Tá»± Ä‘á»™ng reload danh sÃ¡ch phÃ²ng ngay láº­p tá»©c
            this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, delayMs: 120 });
            
            // Tá»± Ä‘á»™ng táº¯t cÃ´ng táº¯c Ä‘iá»‡n khi check-out Ä‘á»ƒ tiáº¿t kiá»‡m Ä‘iá»‡n
            this.tuyaService.autoTurnOffOnCheckOut(this.roomData._id).subscribe({
              next: (response) => {
                if (response.data && response.data.devicesControlled > 0) {
                  console.log(`ÄÃ£ tá»± Ä‘á»™ng táº¯t ${response.data.devicesControlled} cÃ´ng táº¯c Ä‘iá»‡n Ä‘á»ƒ tiáº¿t kiá»‡m Ä‘iá»‡n`);
                }
              },
              error: (error) => {
                console.error('Lá»—i khi tá»± Ä‘á»™ng táº¯t cÃ´ng táº¯c:', error);
              }
            });
            
            // Tá»± Ä‘á»™ng reload room data sau khi checkout thÃ nh cÃ´ng
            if (this.roomData && this.roomData._id) {
              this.roomsService.getRoomById(this.roomData._id, { 
                limit: 1000,
                excludeCheckedOut: true
              }).subscribe({
                next: (updatedRoom) => {
                  this.roomData = updatedRoom;
                  // Tá»± Ä‘á»™ng reload danh sÃ¡ch phÃ²ng láº¡i má»™t láº§n ná»¯a Ä‘á»ƒ Ä‘áº£m báº£o
                  this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 150 });
                },
                error: (err) => {
                  console.error('Error reloading room data:', err);
                  // Váº«n reload danh sÃ¡ch phÃ²ng dÃ¹ cÃ³ lá»—i
                  this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 150 });
                }
              });
            } else {
              // Tá»± Ä‘á»™ng reload danh sÃ¡ch phÃ²ng
              this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 150 });
            }
            
            // Hiá»ƒn thá»‹ hÃ³a Ä‘Æ¡n náº¿u paymentStatus = 'paid' (khi QR bá»‹ táº¯t vÃ  chá»n chuyá»ƒn khoáº£n)
            if (shouldShowInvoice) {
              setTimeout(() => {
                this.showInvoice(invoiceData);
              }, 200);
            }
          }, 100);
        } else {
          this.message.error(response.message || 'Lá»—i khi checkout');
        }
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error during checkout:', error);
        this.message.error('Lá»—i khi checkout');
      }
    });
  }

  /**
   * Xá»­ lÃ½ thanh toÃ¡n chuyá»ƒn khoáº£n vá»›i SePay
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

    // Láº¥y userId tá»« currentUser
    const userId = this.currentUser?._id || this.currentUser?.id;
    
    if (!userId) {
      this.message.error('KhÃ´ng tÃ¬m tháº¥y thÃ´ng tin ngÆ°á»i dÃ¹ng');
      return;
    }
    
    // Æ¯U TIÃŠN 1: Láº¥y QR code tá»« business owner (chá»§ doanh nghiá»‡p)
    let qrPaymentUrl = '';
    let beneficiaryName = '';
    let bankName = '';
    let accountNumber = '';
    
    if (this.businessOwner?.bankAccount?.qrPaymentUrl) {
      // Business owner cÃ³ QR code
      qrPaymentUrl = this.businessOwner.bankAccount.qrPaymentUrl;
      beneficiaryName = this.businessOwner.bankAccount.beneficiaryName || this.businessOwner.bankAccount.accountHolderName || '';
      bankName = this.businessOwner.bankAccount.bankName || '';
      accountNumber = this.businessOwner.bankAccount.accountNumber || '';
      console.log('Sá»­ dá»¥ng QR code tá»« business owner (chá»§ doanh nghiá»‡p):', { qrPaymentUrl, beneficiaryName, bankName, accountNumber });
    } else if (this.hotelBankAccount?.qrPaymentUrl) {
      // Æ¯U TIÃŠN 2: Láº¥y QR code tá»« hotel (doanh nghiá»‡p)
      qrPaymentUrl = this.hotelBankAccount.qrPaymentUrl;
      beneficiaryName = this.hotelBankAccount.beneficiaryName || this.hotelBankAccount.accountHolderName || '';
      bankName = this.hotelBankAccount.bankName || '';
      accountNumber = this.hotelBankAccount.accountNumber || '';
      console.log('Sá»­ dá»¥ng QR code tá»« hotel:', { qrPaymentUrl, beneficiaryName, bankName, accountNumber });
    } else {
      // Æ¯U TIÃŠN 3: Láº¥y QR code tá»« manager cá»§a hotel (náº¿u cÃ³)
      const manager = this.businessInfo?.managerId;
      if (manager && typeof manager === 'object' && manager.bankAccount?.qrPaymentUrl) {
        qrPaymentUrl = manager.bankAccount.qrPaymentUrl;
        beneficiaryName = manager.bankAccount.beneficiaryName || manager.bankAccount.accountHolderName || '';
        bankName = manager.bankAccount.bankName || '';
        accountNumber = manager.bankAccount.accountNumber || '';
        console.log('Sá»­ dá»¥ng QR code tá»« manager cá»§a hotel:', { qrPaymentUrl, beneficiaryName, bankName, accountNumber });
      } else {
        // Æ¯U TIÃŠN 4: Láº¥y QR code tá»« user hiá»‡n táº¡i (admin/staff cá»§a hotel)
        qrPaymentUrl = this.currentUser?.bankAccount?.qrPaymentUrl || '';
        beneficiaryName = this.currentUser?.bankAccount?.beneficiaryName || this.currentUser?.bankAccount?.accountHolderName || '';
        bankName = this.currentUser?.bankAccount?.bankName || '';
        accountNumber = this.currentUser?.bankAccount?.accountNumber || '';
        console.log('Sá»­ dá»¥ng QR code tá»« user hiá»‡n táº¡i (admin/staff):', { qrPaymentUrl, beneficiaryName, bankName, accountNumber });
      }
    }
    
    // Náº¿u khÃ´ng cÃ³ QR code, bá» qua modal vÃ  checkout trá»±c tiáº¿p
    if (!qrPaymentUrl) {
      console.log('KhÃ´ng cÃ³ QR code, bá» qua modal vÃ  checkout trá»±c tiáº¿p');
      checkoutData.paymentStatus = 'paid';
      invoiceData.paymentStatus = 'paid';
      this.proceedWithCheckoutDirectly(checkoutData, invoiceData);
      return;
    }

    this.prepareSePayModalState(amount, qrPaymentUrl, beneficiaryName, bankName, accountNumber, checkoutData, invoiceData);
    
    // Táº¡o payment history SePay
    // Gá»i trá»±c tiáº¿p API vá»›i roomId vÃ  roomNumber
    const payload = {
      userId: userId,
      amount: normalizedAmount,
      currency: 'VND',
      description: `Thanh toÃ¡n phÃ²ng ${this.roomData.roomNumber} - ${invoiceData.customerName || 'KhÃ¡ch láº»'}`,
      roomId: this.roomData._id,
      roomNumber: this.roomData.roomNumber
    };
    
    this.isLoading = true;
    this.sepayInitializing = true;
    this.sepayService.createPaymentHistoryForRoom(payload).subscribe({
      next: (response: any) => {
        this.isLoading = false;
        this.sepayInitializing = false;
        if (response.success) {
          this.sepayPaymentHistoryId = response.paymentHistoryId || ''; // LÆ°u paymentHistoryId Ä‘á»ƒ kiá»ƒm tra tráº¡ng thÃ¡i
          if (!this.showSePayModal) {
            return;
          }
          this.startPaymentStatusPolling();
        } else {
          this.showSePayModal = false;
          this.resetSePayTransactionState();
          this.message.error(response.error || 'CÃ³ lá»—i xáº£y ra khi táº¡o payment history');
          // Váº«n tiáº¿p tá»¥c checkout
          this.proceedWithCheckout(checkoutData, invoiceData);
        }
      },
      error: (error: any) => {
        this.isLoading = false;
        this.sepayInitializing = false;
        console.error('Error creating SePay payment history:', error);
        this.showSePayModal = false;
        this.resetSePayTransactionState();
        this.message.error('CÃ³ lá»—i xáº£y ra khi táº¡o payment history. Vui lÃ²ng thá»­ láº¡i.');
        // Váº«n tiáº¿p tá»¥c checkout
        this.proceedWithCheckout(checkoutData, invoiceData);
      }
    });
  }
  
  /**
   * Thá»±c hiá»‡n checkout sau khi Ä‘Ã£ táº¡o payment history
   */
  proceedWithCheckout(checkoutData: any, invoiceData: any): void {
    // ÄÃ³ng modal
    if (this.modalRef) {
      const closeResult = this.pendingCheckoutCloseResult || {
        success: true,
        action: 'checkout',
        checkoutInfo: {
          roomId: this.roomData?._id,
          roomNumber: this.roomData?.roomNumber,
          checkInTime: checkoutData?.checkInTime || checkoutData?.checkinTime,
          checkOutTime: checkoutData?.checkOutTime || checkoutData?.checkoutTime,
          customerName: checkoutData?.customerName || checkoutData?.guestName || checkoutData?.guestInfo?.name || 'KhÃ¡ch láº»',
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
    
    // Kiá»ƒm tra paymentStatus - chá»‰ hiá»ƒn thá»‹ hÃ³a Ä‘Æ¡n náº¿u Ä‘Ã£ thanh toÃ¡n
    const paymentStatus = checkoutData.paymentStatus || 'paid';
    const shouldShowInvoice = paymentStatus === 'paid';
    
    // Thá»±c hiá»‡n checkout trong background
    this.roomsService.checkOutRoom(this.roomData._id, checkoutData)
      .subscribe(
        (response) => {
          setTimeout(() => {
            // Hiá»ƒn thá»‹ thÃ´ng bÃ¡o thÃ nh cÃ´ng (mÃ u xanh)
            if (paymentStatus === 'pending') {
              this.message.success('Check-out thÃ nh cÃ´ng. Äang chá» xÃ¡c nháº­n thanh toÃ¡n...');
            } else {
              this.message.success('Check-out thÃ nh cÃ´ng');
            }
            
            // Tá»± Ä‘á»™ng táº¯t cÃ´ng táº¯c Ä‘iá»‡n khi check-out Ä‘á»ƒ tiáº¿t kiá»‡m Ä‘iá»‡n
            this.tuyaService.autoTurnOffOnCheckOut(this.roomData._id).subscribe({
              next: (response) => {
                if (response.data && response.data.devicesControlled > 0) {
                  console.log(`ÄÃ£ tá»± Ä‘á»™ng táº¯t ${response.data.devicesControlled} cÃ´ng táº¯c Ä‘iá»‡n Ä‘á»ƒ tiáº¿t kiá»‡m Ä‘iá»‡n`);
                }
              },
              error: (error) => {
                console.error('Lá»—i khi tá»± Ä‘á»™ng táº¯t cÃ´ng táº¯c:', error);
              }
            });
            
            // Tá»± Ä‘á»™ng reload room data sau khi checkout thÃ nh cÃ´ng
            if (this.roomData && this.roomData._id) {
              this.roomsService.getRoomById(this.roomData._id, { 
                limit: 1000,
                excludeCheckedOut: true
              }).subscribe({
                next: (updatedRoom) => {
                  this.roomData = updatedRoom;
                  // Cáº­p nháº­t danh sÃ¡ch phÃ²ng
                  this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 150 });
                },
                error: (err) => {
                  console.error('Error reloading room data:', err);
                  // Váº«n cáº­p nháº­t danh sÃ¡ch phÃ²ng dÃ¹ cÃ³ lá»—i
                  this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 150 });
                }
              });
            } else {
              // Cáº­p nháº­t danh sÃ¡ch phÃ²ng
              this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 150 });
            }
            
            // Chá»‰ hiá»ƒn thá»‹ hÃ³a Ä‘Æ¡n náº¿u Ä‘Ã£ thanh toÃ¡n (paymentStatus = 'paid')
            // Náº¿u chÆ°a thanh toÃ¡n (pending), hÃ³a Ä‘Æ¡n sáº½ Ä‘Æ°á»£c hiá»ƒn thá»‹ sau khi webhook xÃ¡c nháº­n
            if (shouldShowInvoice) {
              setTimeout(() => {
                this.showInvoice(invoiceData);
              }, 200);
            }
          }, 100);
        },
        (error) => {
          setTimeout(() => {
            this.message.error('Lá»—i khi tráº£ phÃ²ng: ' + error.message);
            this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 120 });
          }, 100);
        }
      );
  }
  
  /**
   * Báº¯t Ä‘áº§u kiá»ƒm tra tráº¡ng thÃ¡i thanh toÃ¡n (polling)
   */
  private startPaymentStatusPolling(): void {
    this.stopPaymentStatusPolling(false);

    if (!this.sepayPaymentHistoryId || !this.activeSePayTransactionToken) {
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
        console.log('ÄÃ£ kiá»ƒm tra tráº¡ng thÃ¡i thanh toÃ¡n tá»‘i Ä‘a, dá»«ng polling');
      }
    };

    setTimeout(() => {
      if (transactionToken === this.activeSePayTransactionToken) {
        runCheck();
      }
    }, 1200);

    this.paymentStatusCheckInterval = setInterval(() => {
      if (transactionToken !== this.activeSePayTransactionToken) {
        this.stopPaymentStatusPolling(false);
        return;
      }
      runCheck();
    }, 2000);
  }
  
  /**
   * Dá»«ng kiá»ƒm tra tráº¡ng thÃ¡i thanh toÃ¡n
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
   * Xá»­ lÃ½ khi thanh toÃ¡n thÃ nh cÃ´ng
   */
  private onPaymentSuccess(): void {
    if (this.paymentSuccessHandled) {
      return;
    }

    this.paymentSuccessHandled = true;
    console.log('[onPaymentSuccess] Thanh toÃ¡n thÃ nh cÃ´ng, Ä‘Ã³ng modal QR vÃ  hiá»ƒn thá»‹ invoice');
    
    // Dá»«ng polling
    this.stopPaymentStatusPolling();
    
    // ÄÃ³ng modal QR trÆ°á»›c (tá»± Ä‘á»™ng Ä‘Ã³ng)
    this.showSePayModal = false;
    
    // Force change detection Ä‘á»ƒ Ä‘áº£m báº£o modal Ä‘Ã³ng ngay láº­p tá»©c
    this.cdr.detectChanges();
    
    // Láº¥y checkoutData vÃ  invoiceData Ä‘Ã£ lÆ°u
    const checkoutData = this.pendingCheckoutData;
    const invoiceData = this.pendingInvoiceData;
    
    if (checkoutData && invoiceData) {
      // Cáº­p nháº­t paymentStatus thÃ nh 'paid'
      checkoutData.paymentStatus = 'paid';
      invoiceData.paymentStatus = 'paid';
      
      // this.loadLatestPaymentAndPlaySound();
      
      // Hiá»ƒn thá»‹ thÃ´ng bÃ¡o thÃ nh cÃ´ng (mÃ u xanh)
      this.message.success('Check-out thÃ nh cÃ´ng');
      
      // Äá»£i má»™t chÃºt Ä‘á»ƒ modal QR Ä‘Ã³ng hoÃ n toÃ n trÆ°á»›c khi Ä‘Ã³ng modal checkout
      setTimeout(() => {
        // ÄÃ³ng modal checkout
        if (this.modalRef) {
          const closeResult = this.pendingCheckoutCloseResult || {
            success: true,
            action: 'checkout',
            checkoutInfo: {
              roomId: this.roomData?._id,
              roomNumber: this.roomData?.roomNumber,
              checkInTime: checkoutData?.checkInTime || checkoutData?.checkinTime,
              checkOutTime: checkoutData?.checkOutTime || checkoutData?.checkoutTime,
              customerName: checkoutData?.customerName || checkoutData?.guestName || checkoutData?.guestInfo?.name || 'KhÃ¡ch láº»',
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
        
        // Cáº­p nháº­t checkout vá»›i paymentStatus = 'paid' trong background
        this.roomsService.checkOutRoom(this.roomData._id, checkoutData)
          .subscribe(
            (response) => {
              // Tá»± Ä‘á»™ng reload room data sau khi checkout thÃ nh cÃ´ng
              if (this.roomData && this.roomData._id) {
                this.roomsService.getRoomById(this.roomData._id, { 
                  limit: 1000,
                  excludeCheckedOut: true
                }).subscribe({
                  next: (updatedRoom) => {
                    this.roomData = updatedRoom;
                    // Tá»± Ä‘á»™ng reload danh sÃ¡ch phÃ²ng
                    this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 150 });
                  },
                  error: (err) => {
                    console.error('Error reloading room data:', err);
                    // Váº«n reload danh sÃ¡ch phÃ²ng dÃ¹ cÃ³ lá»—i
                    this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 150 });
                  }
                });
              } else {
                // Tá»± Ä‘á»™ng reload danh sÃ¡ch phÃ²ng
                this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 150 });
              }
              
              // Hiá»ƒn thá»‹ invoice sau khi checkout thÃ nh cÃ´ng
              setTimeout(() => {
                this.showInvoice(invoiceData);
              }, 500);
              this.resetSePayTransactionState();
            },
            (error) => {
              console.error('Error updating checkout with payment status:', error);
              // Váº«n reload danh sÃ¡ch phÃ²ng vÃ  hiá»ƒn thá»‹ invoice ngay cáº£ khi cÃ³ lá»—i
              this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 120 });
              setTimeout(() => {
                this.showInvoice(invoiceData);
              }, 500);
              this.resetSePayTransactionState();
            }
          );
      }, 300);
    } else {
      console.error('[onPaymentSuccess] KhÃ´ng tÃ¬m tháº¥y checkoutData hoáº·c invoiceData');
      this.resetSePayTransactionState();
    }
  }
  
  /**
   * Láº¥y lá»‹ch sá»­ chuyá»ƒn khoáº£n gáº§n nháº¥t vÃ  phÃ¡t thÃ´ng bÃ¡o Ã¢m thanh
   */
  private loadLatestPaymentAndPlaySound(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?._id) {
      console.warn('[loadLatestPaymentAndPlaySound] KhÃ´ng tÃ¬m tháº¥y userId');
      // Fallback: láº¥y tá»« invoiceData ngay láº­p tá»©c
      const amount = this.pendingInvoiceData?.totalAmount || 
                    this.pendingInvoiceData?.remainingAmount || 0;
      if (amount > 0) {
        this.playPaymentSuccessSound(amount);
      }
      return;
    }
    
    // Äá»£i má»™t chÃºt Ä‘á»ƒ Ä‘áº£m báº£o webhook Ä‘Ã£ cáº­p nháº­t dá»¯ liá»‡u
    setTimeout(() => {
      // Láº¥y lá»‹ch sá»­ chuyá»ƒn khoáº£n SePay gáº§n nháº¥t
      this.sepayService.getPaymentHistory({ userId: currentUser._id, limit: 10 }).subscribe({
        next: (response: any) => {
          let amount = 0;
          
          // TÃ¬m giao dá»‹ch gáº§n nháº¥t cÃ³ status 'completed' hoáº·c 'paid'
          const paymentHistories = Array.isArray(response) 
            ? response 
            : (response?.success && response.data ? response.data : []);
          
          if (paymentHistories && paymentHistories.length > 0) {
            // TÃ¬m giao dá»‹ch gáº§n nháº¥t Ä‘Ã£ hoÃ n thÃ nh
            const completedPayment = paymentHistories.find((p: any) => 
              (p.status === 'completed' || p.status === 'paid') && 
              (p.amount > 0 || p.totalAmount > 0)
            );
            
            if (completedPayment) {
              // Æ¯u tiÃªn láº¥y transferAmount tá»« paymentGatewayResponse (sá»‘ tiá»n thá»±c táº¿ nháº­n Ä‘Æ°á»£c)
              amount = completedPayment.paymentGatewayResponse?.transferAmount || 
                      completedPayment.amount || 
                      completedPayment.totalAmount || 0;
            } else {
              // Náº¿u khÃ´ng tÃ¬m tháº¥y completed, láº¥y giao dá»‹ch gáº§n nháº¥t
              const latestPayment = paymentHistories[0];
              amount = latestPayment.amount || latestPayment.totalAmount || 0;
            }
          }
          
          // Náº¿u khÃ´ng láº¥y Ä‘Æ°á»£c tá»« API, thá»­ láº¥y tá»« invoiceData
          if (amount === 0) {
            amount = this.pendingInvoiceData?.totalAmount || 
                    this.pendingInvoiceData?.remainingAmount || 0;
          }
          
          if (amount > 0) {
            console.log('[loadLatestPaymentAndPlaySound] Sá»‘ tiá»n thanh toÃ¡n:', amount);
            // PhÃ¡t thÃ´ng bÃ¡o Ã¢m thanh
            this.playPaymentSuccessSound(amount);
          } else {
            console.warn('[loadLatestPaymentAndPlaySound] KhÃ´ng tÃ¬m tháº¥y sá»‘ tiá»n thanh toÃ¡n');
          }
        },
        error: (error) => {
          console.error('[loadLatestPaymentAndPlaySound] Lá»—i khi láº¥y lá»‹ch sá»­ thanh toÃ¡n:', error);
          // Fallback: láº¥y tá»« invoiceData
          const amount = this.pendingInvoiceData?.totalAmount || 
                        this.pendingInvoiceData?.remainingAmount || 0;
          if (amount > 0) {
            console.log('[loadLatestPaymentAndPlaySound] Sá»­ dá»¥ng sá»‘ tiá»n tá»« invoiceData:', amount);
            this.playPaymentSuccessSound(amount);
          }
        }
      });
    }, 1000); // Äá»£i 1 giÃ¢y Ä‘á»ƒ webhook cáº­p nháº­t dá»¯ liá»‡u
  }
  
  private playPaymentSuccessSound(amount: number): void {
    try {
      console.log('[playPaymentSuccessSound] Báº¯t Ä‘áº§u phÃ¡t thÃ´ng bÃ¡o, sá»‘ tiá»n:', amount);
      const roundedAmount = Math.round(amount);
      const formattedAmount = roundedAmount.toLocaleString('vi-VN');
      const message = `Thanh toÃ¡n thÃ nh cÃ´ng sá»‘ tiá»n ${formattedAmount} Ä‘á»“ng`;
      console.log('[playPaymentSuccessSound] Ná»™i dung thÃ´ng bÃ¡o:', message);

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
            console.error('[playPaymentSuccessSound] Lá»—i khi gá»i TTS API:', error);
          }
        });
      };
      requestAudio();
    } catch (error) {
      console.error('[playPaymentSuccessSound] Lá»—i khi phÃ¡t Ã¢m thanh:', error);
    }
  }
  
  /**
   * ÄÃ³ng modal SePay (ngÆ°á»i dÃ¹ng Ä‘Ã³ng thá»§ cÃ´ng)
   * Sau khi Ä‘Ã³ng, hiá»ƒn thá»‹ invoice ngay láº­p tá»©c
   * Webhook sáº½ tá»± Ä‘á»™ng cáº­p nháº­t tráº¡ng thÃ¡i thanh toÃ¡n sau
   */
  closeSePayModal(): void {
    // ÄÃ³ng modal QR
    this.showSePayModal = false;
    
    // Dá»«ng polling náº¿u cÃ³
    this.stopPaymentStatusPolling();
    
    // Láº¥y checkoutData vÃ  invoiceData Ä‘Ã£ lÆ°u
    const checkoutData = this.pendingCheckoutData;
    const invoiceData = this.pendingInvoiceData;
    
    if (checkoutData && invoiceData) {
      // Hiá»ƒn thá»‹ thÃ´ng bÃ¡o
      this.message.info('ÄÃ£ lÆ°u thÃ´ng tin thanh toÃ¡n. Há»‡ thá»‘ng sáº½ tá»± Ä‘á»™ng cáº­p nháº­t tráº¡ng thÃ¡i khi nháº­n Ä‘Æ°á»£c xÃ¡c nháº­n tá»« ngÃ¢n hÃ ng.');
      
      // ÄÃ³ng modal checkout
      if (this.modalRef) {
        const closeResult = this.pendingCheckoutCloseResult || {
          success: true,
          action: 'checkout',
          checkoutInfo: {
            roomId: this.roomData?._id,
            roomNumber: this.roomData?.roomNumber,
            checkInTime: checkoutData?.checkInTime || checkoutData?.checkinTime,
            checkOutTime: checkoutData?.checkOutTime || checkoutData?.checkoutTime,
            customerName: checkoutData?.customerName || checkoutData?.guestName || checkoutData?.guestInfo?.name || 'KhÃ¡ch láº»',
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
      
      // Thá»±c hiá»‡n checkout vá»›i paymentStatus = 'pending' (webhook sáº½ cáº­p nháº­t sau)
      this.roomsService.checkOutRoom(this.roomData._id, checkoutData)
        .subscribe(
          (response) => {
            // Cáº­p nháº­t danh sÃ¡ch phÃ²ng
            this.emitRoomDataUpdated('checkout', { roomId: this.roomData?._id, force: false, delayMs: 150 });
            
            // Hiá»ƒn thá»‹ invoice ngay láº­p tá»©c
            setTimeout(() => {
              this.showInvoice(invoiceData);
            }, 300);
            this.resetSePayTransactionState();
          },
          (error) => {
            console.error('Error during checkout:', error);
            // Váº«n hiá»ƒn thá»‹ invoice ngay cáº£ khi cÃ³ lá»—i
            setTimeout(() => {
              this.showInvoice(invoiceData);
            }, 300);
            this.resetSePayTransactionState();
          }
        );
    } else {
      console.warn('[closeSePayModal] KhÃ´ng tÃ¬m tháº¥y checkoutData hoáº·c invoiceData');
      this.resetSePayTransactionState();
    }
  }
  
  /**
   * Copy mÃ£ thanh toÃ¡n vÃ o clipboard
   */
  // Bá» copyPaymentCode - khÃ´ng cáº§n mÃ£ thanh toÃ¡n ná»¯a
  
  calculateDuration(checkInTime: Date, checkOutTime: Date): number {
    // TÃ­nh sá»‘ ngÃ y giá»¯a check-in vÃ  check-out
    const diffTime = Math.abs(checkOutTime.getTime() - checkInTime.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 1; // Tá»‘i thiá»ƒu 1 ngÃ y
  }
  
  calculateDurationInHours(checkInTime: Date, checkOutTime: Date): number {
    // TÃ­nh sá»‘ giá» giá»¯a check-in vÃ  check-out
    const diffTime = Math.abs(checkOutTime.getTime() - checkInTime.getTime());
    const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
    return diffHours > 0 ? diffHours : 1; // Tá»‘i thiá»ƒu 1 giá»
  }

  calculateRoomTotal(durationInHours: number, roomPrice: number): number {
    const hourlyRate = roomPrice / 24; // GiÃ¡ theo giá»
    let total = 0;
    
    if (durationInHours <= 2) {
      // Náº¿u á»Ÿ dÆ°á»›i 2 giá», tÃ­nh 30% giÃ¡ ngÃ y
      total = roomPrice * 0.3;
    } else if (durationInHours <= 6) {
      // Náº¿u á»Ÿ dÆ°á»›i 6 giá», tÃ­nh 50% giÃ¡ ngÃ y
      total = roomPrice * 0.5;
    } else if (durationInHours < 24) {
      // Náº¿u á»Ÿ dÆ°á»›i 24 giá» nhÆ°ng trÃªn 6 giá», tÃ­nh 1 ngÃ y
      total = roomPrice;
    } else {
      // Náº¿u á»Ÿ tá»« 24 giá» trá»Ÿ lÃªn, tÃ­nh theo sá»‘ ngÃ y (lÃ m trÃ²n lÃªn)
      const days = Math.ceil(durationInHours / 24);
      total = roomPrice * days;
    }
    
    return total;
  }

  // TÃ­nh tiá»n phÃ²ng dá»±a trÃªn loáº¡i giÃ¡
  calculateRoomTotalByRateType(durationInHours: number, durationInDays: number, rateType: string, remainingMinutes: number = 0): number {
    if (!this.roomData) return 0;
    
    // Láº¥y giÃ¡ tá»« roomData hoáº·c priceConfig
    const priceConfig = (this.roomData as any)?.priceConfig;
    const hourlyRate = this.roomData.pricing?.hourly || this.roomData.firstHourRate || priceConfig?.hourlyRates?.firstHourPrice || 0;
    const dailyRate = this.roomData.pricing?.daily || priceConfig?.dailyRates?.standardPrice || 0;
    const nightlyRate = this.roomData.pricing?.nightly || priceConfig?.nightlyRates?.standardPrice || 0;
    const weeklyRate = this.roomData.pricing?.weekly || priceConfig?.weeklyRates?.standardPrice || 0;
    const monthlyRate = this.roomData.pricing?.monthly || priceConfig?.monthlyRates?.standardPrice || 0;
    const additionalHourRate = this.roomData.additionalHourRate || priceConfig?.hourlyRates?.additionalHourPrice || (hourlyRate * 0.8);
    
    // Láº¥y cÃ¡c tham sá»‘ tá»« priceConfig hoáº·c giÃ¡ trá»‹ máº·c Ä‘á»‹nh
    const gracePeriodMinutes = priceConfig?.hourlyRates?.gracePeriodMinutes || 15;
    const autoNightlyHours = priceConfig?.hourlyRates?.autoNightlyHours || 8;
    const maxHoursBeforeDay = priceConfig?.hourlyRates?.maxHoursBeforeDay || 6;
    const autoDailyHours = priceConfig?.nightlyRates?.autoDailyHours || 24;
    
    // Láº¥y thá»i gian check-in vÃ  check-out Ä‘á»ƒ tÃ­nh phá»¥ thu
    const lastCheckIn = this.listData && this.listData.length > 0 ? this.listData[0] : null;
    const checkInTime = lastCheckIn?.checkinTime ? new Date(lastCheckIn.checkinTime) : null;
    const checkOutTime = this.getUTCTimePlus7();
    
    // Helper function Ä‘á»ƒ parse time string (HH:mm) thÃ nh giá» vÃ  phÃºt
    const parseTime = (timeStr: string) => {
      const parts = timeStr.split(':');
      return {
        hour: parseInt(parts[0]) || 0,
        minute: parseInt(parts[1]) || 0
      };
    };
    
    // Helper function Ä‘á»ƒ tÃ­nh sá»‘ giá» sá»›m/trá»… (lÃ m trÃ²n lÃªn)
    const calculateEarlyHours = (actualTime: Date, standardTime: string): number => {
      const actual = parseTime(`${actualTime.getHours()}:${actualTime.getMinutes()}`);
      const standard = parseTime(standardTime);
      const actualMinutes = actual.hour * 60 + actual.minute;
      const standardMinutes = standard.hour * 60 + standard.minute;
      if (actualMinutes < standardMinutes) {
        const earlyMinutes = standardMinutes - actualMinutes;
        return Math.ceil(earlyMinutes / 60); // LÃ m trÃ²n lÃªn
      }
      return 0;
    };
    
    const calculateLateHours = (actualTime: Date, standardTime: string): number => {
      const actual = parseTime(`${actualTime.getHours()}:${actualTime.getMinutes()}`);
      const standard = parseTime(standardTime);
      const actualMinutes = actual.hour * 60 + actual.minute;
      const standardMinutes = standard.hour * 60 + standard.minute;
      if (actualMinutes > standardMinutes) {
        const lateMinutes = actualMinutes - standardMinutes;
        return Math.ceil(lateMinutes / 60); // LÃ m trÃ²n lÃªn
      }
      return 0;
    };
    
    // Láº¥y giÃ¡ trá»‹ tá»« priceConfig hoáº·c giÃ¡ trá»‹ máº·c Ä‘á»‹nh
    // Æ¯u tiÃªn láº¥y tá»« priceConfig, fallback vá» roomData.priceSettings
    const nightlyStartTime = priceConfig?.nightlyRates?.startTime || 
                             (this.roomData as any)?.priceSettings?.nightlyStartTime || '20:00';
    const nightlyEndTime = priceConfig?.nightlyRates?.endTime || 
                           (this.roomData as any)?.priceSettings?.nightlyEndTime || '12:00';
    const dailyStartTime = '12:00'; // Thá»i gian báº¯t Ä‘áº§u nháº­n ngÃ y Ä‘Ãªm
    const dailyCheckOutTime = priceConfig?.dailyRates?.checkOutTime || 
                              (this.roomData as any)?.priceSettings?.dailyEndTime || '12:00';
    const nightlyEarlyCheckinSurcharge = priceConfig?.nightlyRates?.earlyCheckinSurcharge || 
                                         (this.roomData as any)?.priceSettings?.nightlyEarlyCheckinSurcharge || 0;
    const nightlyLateCheckoutSurcharge = priceConfig?.nightlyRates?.lateCheckoutSurcharge || 
                                         (this.roomData as any)?.priceSettings?.nightlyLateCheckoutSurcharge || 0;
    const dailyEarlyCheckinSurcharge = priceConfig?.dailyRates?.earlyCheckinSurcharge || 
                                      (this.roomData as any)?.priceSettings?.dailyEarlyCheckinSurcharge || 0;
    const dailyLateCheckoutFee = priceConfig?.dailyRates?.latecheckOutFee || 
                                (this.roomData as any)?.priceSettings?.dailyLateCheckoutFee || 0;
    const dailyWeekendSurchargePercent = Number(priceConfig?.dailyRates?.weekendSurcharge ?? 0) || 0;
    const dailyHolidaySurchargePercent = Number(priceConfig?.dailyRates?.holidaySurcharge ?? 0) || 0;
    const nightlyWeekendSurchargePercent = Number(priceConfig?.nightlyRates?.weekendSurcharge ?? 0) || 0;
    const nightlyHolidaySurchargePercent = Number(priceConfig?.nightlyRates?.holidaySurcharge ?? 0) || 0;

    const holidayKey = `phhotel:holidayDates:${String(this.roomData?.hotelId || this.authService.getHotelId() || 'default')}`;
    const holidaySet = (() => {
      const fallback = ['01-01', '04-30', '05-01', '09-02'];
      try {
        if (typeof window === 'undefined') return new Set(fallback);
        const raw = localStorage.getItem(holidayKey) || '';
        const values = raw
          .split(/[\n,;]+/g)
          .map((v) => String(v || '').trim())
          .filter(Boolean);
        return new Set([...fallback, ...values]);
      } catch {
        return new Set(fallback);
      }
    })();

    const toYmd = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const toMmdd = (d: Date): string => {
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${m}-${day}`;
    };

    const isWeekend = (d: Date): boolean => {
      const dow = d.getDay();
      return dow === 0 || dow === 6;
    };

    const isHoliday = (d: Date): boolean => {
      const ymd = toYmd(d);
      const mmdd = toMmdd(d);
      return holidaySet.has(ymd) || holidaySet.has(mmdd);
    };
    
    let total = 0;
    let priceDetails: any = {};
    
    // Æ¯U TIÃŠN: Sá»­ dá»¥ng rateType tá»« user (theo logic backend)
    switch (rateType) {
      case 'hourly':
        // Hourly rate: KHÃ”NG tÃ­nh phá»¥ thu sá»›m/trá»…, chá»‰ tÃ­nh theo giá» Ä‘Æ¡n giáº£n
        const firstHourPrice = this.roomData.firstHourRate || priceConfig?.hourlyRates?.firstHourPrice || hourlyRate;
        const additionalHourPrice = this.roomData.additionalHourRate || priceConfig?.hourlyRates?.additionalHourPrice || additionalHourRate;
        
        // TÃ­nh giÃ¡ giá» Ä‘áº§u
        total = firstHourPrice;
        priceDetails.firstHourPrice = firstHourPrice;
        
        // TÃ­nh giÃ¡ cho cÃ¡c giá» tiáº¿p theo
        if (durationInHours >= 1) {
          let billableHours = durationInHours - 1; // Sá»‘ giá» tÃ­nh phÃ­ (trá»« giá» Ä‘áº§u)
          
          // Náº¿u cÃ³ thá»i gian dÆ° sau giá» thá»© 2
          if (durationInHours >= 2 && remainingMinutes > gracePeriodMinutes) {
            billableHours += 1;
          } else if (durationInHours === 1 && remainingMinutes > gracePeriodMinutes) {
            billableHours = 1;
          }
          
          if (billableHours > 0) {
            const additionalPrice = billableHours * additionalHourPrice;
            total += additionalPrice;
            priceDetails.additionalHoursCount = billableHours;
            priceDetails.additionalHoursPrice = additionalPrice;
            priceDetails.remainingMinutes = remainingMinutes;
            priceDetails.gracePeriodMinutes = gracePeriodMinutes;
          }
        }
        
        // LÆ°u thÃªm thÃ´ng tin Ä‘á»ƒ hiá»ƒn thá»‹ chi tiáº¿t
        priceDetails.durationInHours = durationInHours;
        priceDetails.totalHours = durationInHours + (remainingMinutes / 60);
        
        // KHÃ”NG tá»± Ä‘á»™ng chuyá»ƒn sang daily khi chá»n hourly - Ä‘á»ƒ user xem cÃ¡ch tÃ­nh
        // Bá» logic tá»± Ä‘á»™ng chuyá»ƒn sang daily
        priceDetails.rateType = 'hourly';
        priceDetails.note = 'TÃ­nh theo giá» bÃ¬nh thÆ°á»ng, khÃ´ng tÃ­nh phá»¥ thu sá»›m/trá»…';
        break;
        
      case 'daily':
        // TÃ­nh sá»‘ ngÃ y dá»±a trÃªn ngÃ y thá»±c táº¿ (qua Ä‘Ãªm), khÃ´ng lÃ m trÃ²n tá»« giá»
        // Theo logic backend trong rooms.js
        const checkInDateForDaily = checkInTime ? new Date(checkInTime) : new Date();
        checkInDateForDaily.setHours(0, 0, 0, 0);
        const checkOutDateForDaily = checkOutTime ? new Date(checkOutTime) : new Date();
        checkOutDateForDaily.setHours(0, 0, 0, 0);
        const actualDaysForDaily = Math.max(1, Math.ceil((checkOutDateForDaily.getTime() - checkInDateForDaily.getTime()) / (1000 * 60 * 60 * 24)));
        const durationInDaysCalculated = actualDaysForDaily;
        total = durationInDaysCalculated * dailyRate;
        priceDetails.basePrice = dailyRate;
        priceDetails.days = durationInDaysCalculated;
        priceDetails.rateType = 'daily';

        let holidaySurchargeAmount = 0;
        let weekendSurchargeAmount = 0;
        for (let i = 0; i < durationInDaysCalculated; i++) {
          const dayDate = new Date(checkInDateForDaily);
          dayDate.setDate(dayDate.getDate() + i);
          if (isHoliday(dayDate) && dailyHolidaySurchargePercent > 0) {
            holidaySurchargeAmount += (dailyRate * dailyHolidaySurchargePercent) / 100;
          } else if (isWeekend(dayDate) && dailyWeekendSurchargePercent > 0) {
            weekendSurchargeAmount += (dailyRate * dailyWeekendSurchargePercent) / 100;
          }
        }
        holidaySurchargeAmount = Math.round(holidaySurchargeAmount);
        weekendSurchargeAmount = Math.round(weekendSurchargeAmount);
        if (holidaySurchargeAmount > 0 || weekendSurchargeAmount > 0) {
          total += holidaySurchargeAmount + weekendSurchargeAmount;
          priceDetails.holidaySurchargeAmount = holidaySurchargeAmount;
          priceDetails.weekendSurchargeAmount = weekendSurchargeAmount;
          priceDetails.holidaySurchargePercent = dailyHolidaySurchargePercent;
          priceDetails.weekendSurchargePercent = dailyWeekendSurchargePercent;
        }
        
        // TÃ­nh phá»¥ thu check-in sá»›m CHá»ˆ Náº¾U check-in TRÆ¯á»šC thá»i gian daily (trÆ°á»›c dailyStartTime - 12:00)
        // Náº¿u check-in trong thá»i gian daily (sau 12:00), KHÃ”NG tÃ­nh early check-in surcharge
        if (checkInTime) {
          const checkInMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
          const [startHour, startMinute] = dailyStartTime.split(':').map(Number);
          const startTimeMinutes = startHour * 60 + startMinute;
          
          // Kiá»ƒm tra xem check-in cÃ³ trong thá»i gian daily khÃ´ng (sau dailyStartTime)
          const isInDailyTime = checkInMinutes >= startTimeMinutes;
          
          // CHá»ˆ tÃ­nh early check-in surcharge náº¿u check-in TRÆ¯á»šC thá»i gian daily (trÆ°á»›c dailyStartTime)
          if (!isInDailyTime) {
            const earlyCheckinHoursDaily = calculateEarlyHours(checkInTime, dailyStartTime);
            if (earlyCheckinHoursDaily > 0 && dailyEarlyCheckinSurcharge > 0) {
              const earlyCheckinSurchargeDaily = earlyCheckinHoursDaily * dailyEarlyCheckinSurcharge;
              total += earlyCheckinSurchargeDaily;
              priceDetails.earlyCheckinSurcharge = earlyCheckinSurchargeDaily;
              priceDetails.earlyCheckinHours = earlyCheckinHoursDaily;
              console.log(`Daily early check-in: ${earlyCheckinHoursDaily} hours, surcharge: ${earlyCheckinSurchargeDaily}`);
            }
          } else {
            console.log(`Daily check-in trong thá»i gian quy Ä‘á»‹nh (sau ${dailyStartTime}), khÃ´ng tÃ­nh early check-in surcharge`);
          }
        }
        
        // TÃ­nh phá»¥ thu check-out trá»… (náº¿u check-out sau 12:00 ngÃ y hÃ´m sau)
        if (checkOutTime) {
          const checkOutDateOnly = new Date(checkOutTime);
          checkOutDateOnly.setHours(0, 0, 0, 0);
          const checkInDateOnly = new Date(checkInTime || new Date());
          checkInDateOnly.setHours(0, 0, 0, 0);
          const isNextDay = checkOutDateOnly.getTime() > checkInDateOnly.getTime();
          
          const checkOutMinutes = checkOutTime.getHours() * 60 + checkOutTime.getMinutes();
          const [checkOutHour, checkOutMinute] = dailyCheckOutTime.split(':').map(Number);
          const checkOutTimeMinutes = checkOutHour * 60 + checkOutMinute;
          
          if (isNextDay && checkOutMinutes > checkOutTimeMinutes && dailyLateCheckoutFee > 0) {
            const lateMinutes = checkOutMinutes - checkOutTimeMinutes;
            const lateCheckoutHoursDaily = Math.ceil(lateMinutes / 60); // LÃ m trÃ²n lÃªn
            const lateCheckoutFeeDaily = lateCheckoutHoursDaily * dailyLateCheckoutFee;
            total += lateCheckoutFeeDaily;
            priceDetails.lateCheckoutSurcharge = lateCheckoutFeeDaily;
            priceDetails.lateCheckoutHours = lateCheckoutHoursDaily;
            console.log(`Daily late check-out: ${lateCheckoutHoursDaily} hours, fee: ${lateCheckoutFeeDaily}`);
          }
        }
        
        console.log(`Daily rate calculation: ${durationInDaysCalculated} days * ${dailyRate} = ${total}`);
        break;
        
      case 'nightly':
        if (!checkInTime || !checkOutTime) {
          total = Math.max(0, nightlyRate);
          priceDetails.basePrice = nightlyRate;
          priceDetails.rateType = 'nightly';
          priceDetails.nights = 1;
          break;
        }

        const dayMs = 1000 * 60 * 60 * 24;
        const [endHourForNightly, endMinuteForNightly] = nightlyEndTime.split(':').map(Number);
        const nightlyEndDateTime = new Date(checkInTime);
        nightlyEndDateTime.setHours(endHourForNightly || 0, endMinuteForNightly || 0, 0, 0);
        if (nightlyEndDateTime.getTime() <= checkInTime.getTime()) {
          nightlyEndDateTime.setDate(nightlyEndDateTime.getDate() + 1);
        }

        const shouldSplitNightlyToDaily =
          durationInHours > autoDailyHours &&
          dailyRate > 0 &&
          nightlyRate > 0;

        if (shouldSplitNightlyToDaily) {
          const nightlyNights = 1;
          let dailyDays = 0;

          if (checkOutTime.getTime() > nightlyEndDateTime.getTime()) {
            const startDateOnly = new Date(nightlyEndDateTime);
            startDateOnly.setHours(0, 0, 0, 0);
            const endDateOnly = new Date(checkOutTime);
            endDateOnly.setHours(0, 0, 0, 0);
            dailyDays = Math.max(0, Math.ceil((endDateOnly.getTime() - startDateOnly.getTime()) / dayMs));
          }

          total = nightlyNights * nightlyRate + dailyDays * dailyRate;
          priceDetails.basePrice = nightlyRate;
          priceDetails.rateType = 'nightly';
          priceDetails.nights = nightlyNights;
          priceDetails.days = dailyDays;
          priceDetails.dailyBasePrice = dailyRate;
          priceDetails.autoConverted = true;
          priceDetails.originalRateType = 'nightly';
          priceDetails.reason = `VÆ°á»£t quÃ¡ ${autoDailyHours} giá» (${durationInHours} giá»)`;

          const checkInMinutesForNight = checkInTime.getHours() * 60 + checkInTime.getMinutes();
          const endTimeMinutesForNight = (endHourForNightly || 0) * 60 + (endMinuteForNightly || 0);
          const nightlyStartDateForSurcharge = new Date(checkInTime);
          nightlyStartDateForSurcharge.setHours(0, 0, 0, 0);
          if (checkInMinutesForNight <= endTimeMinutesForNight) {
            nightlyStartDateForSurcharge.setDate(nightlyStartDateForSurcharge.getDate() - 1);
          }

          let holidaySurchargeAmount = 0;
          let weekendSurchargeAmount = 0;
          if (isHoliday(nightlyStartDateForSurcharge) && nightlyHolidaySurchargePercent > 0) {
            holidaySurchargeAmount += (nightlyRate * nightlyHolidaySurchargePercent) / 100;
          } else if (isWeekend(nightlyStartDateForSurcharge) && nightlyWeekendSurchargePercent > 0) {
            weekendSurchargeAmount += (nightlyRate * nightlyWeekendSurchargePercent) / 100;
          }

          for (let i = 0; i < dailyDays; i++) {
            const d = new Date(nightlyEndDateTime);
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() + i);
            if (isHoliday(d) && dailyHolidaySurchargePercent > 0) {
              holidaySurchargeAmount += (dailyRate * dailyHolidaySurchargePercent) / 100;
            } else if (isWeekend(d) && dailyWeekendSurchargePercent > 0) {
              weekendSurchargeAmount += (dailyRate * dailyWeekendSurchargePercent) / 100;
            }
          }

          holidaySurchargeAmount = Math.round(holidaySurchargeAmount);
          weekendSurchargeAmount = Math.round(weekendSurchargeAmount);
          if (holidaySurchargeAmount > 0 || weekendSurchargeAmount > 0) {
            total += holidaySurchargeAmount + weekendSurchargeAmount;
            priceDetails.holidaySurchargeAmount = holidaySurchargeAmount;
            priceDetails.weekendSurchargeAmount = weekendSurchargeAmount;
            priceDetails.holidaySurchargePercent = Math.max(dailyHolidaySurchargePercent, nightlyHolidaySurchargePercent);
            priceDetails.weekendSurchargePercent = Math.max(dailyWeekendSurchargePercent, nightlyWeekendSurchargePercent);
          }
        } else {
          const durationInNights = 1;
          total = durationInNights * nightlyRate;
          priceDetails.basePrice = nightlyRate;
          priceDetails.rateType = 'nightly';
          priceDetails.nights = durationInNights;

          const checkInMinutesForNight = checkInTime.getHours() * 60 + checkInTime.getMinutes();
          const endTimeMinutesForNight = (endHourForNightly || 0) * 60 + (endMinuteForNightly || 0);
          const nightlyStartDateForSurcharge = new Date(checkInTime);
          nightlyStartDateForSurcharge.setHours(0, 0, 0, 0);
          if (checkInMinutesForNight <= endTimeMinutesForNight) {
            nightlyStartDateForSurcharge.setDate(nightlyStartDateForSurcharge.getDate() - 1);
          }

          let holidaySurchargeAmount = 0;
          let weekendSurchargeAmount = 0;
          if (isHoliday(nightlyStartDateForSurcharge) && nightlyHolidaySurchargePercent > 0) {
            holidaySurchargeAmount += (nightlyRate * nightlyHolidaySurchargePercent) / 100;
          } else if (isWeekend(nightlyStartDateForSurcharge) && nightlyWeekendSurchargePercent > 0) {
            weekendSurchargeAmount += (nightlyRate * nightlyWeekendSurchargePercent) / 100;
          }
          holidaySurchargeAmount = Math.round(holidaySurchargeAmount);
          weekendSurchargeAmount = Math.round(weekendSurchargeAmount);
          if (holidaySurchargeAmount > 0 || weekendSurchargeAmount > 0) {
            total += holidaySurchargeAmount + weekendSurchargeAmount;
            priceDetails.holidaySurchargeAmount = holidaySurchargeAmount;
            priceDetails.weekendSurchargeAmount = weekendSurchargeAmount;
            priceDetails.holidaySurchargePercent = nightlyHolidaySurchargePercent;
            priceDetails.weekendSurchargePercent = nightlyWeekendSurchargePercent;
          }
        }
        
        // TÃ­nh phá»¥ thu check-in sá»›m CHá»ˆ Náº¾U check-in TRÆ¯á»šC thá»i gian nightly (trÆ°á»›c nightlyStartTime)
        // Thá»i gian quy Ä‘á»‹nh qua Ä‘Ãªm: 20:00 - 12:00 ngÃ y hÃ´m sau
        // Náº¿u check-in trong thá»i gian nÃ y (sau 20:00 hoáº·c trÆ°á»›c 12:00 ngÃ y hÃ´m sau), KHÃ”NG tÃ­nh early check-in surcharge
        if (checkInTime) {
          const checkInMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
          const [startHour, startMinute] = nightlyStartTime.split(':').map(Number);
          const startTimeMinutes = startHour * 60 + startMinute;
          const [endHour, endMinute] = nightlyEndTime.split(':').map(Number);
          const endTimeMinutes = endHour * 60 + endMinute;
          
          // Kiá»ƒm tra xem check-in cÃ³ trong thá»i gian nightly khÃ´ng
          // Thá»i gian nightly: tá»« nightlyStartTime (vÃ­ dá»¥ 20:00) Ä‘áº¿n nightlyEndTime ngÃ y hÃ´m sau (vÃ­ dá»¥ 12:00)
          const isInNightlyTime = checkInMinutes >= startTimeMinutes || checkInMinutes <= endTimeMinutes;
          
          // CHá»ˆ tÃ­nh early check-in surcharge náº¿u check-in TRÆ¯á»šC thá»i gian nightly (trÆ°á»›c nightlyStartTime)
          if (!isInNightlyTime) {
            const earlyCheckinHoursNightly = calculateEarlyHours(checkInTime, nightlyStartTime);
            if (earlyCheckinHoursNightly > 0 && nightlyEarlyCheckinSurcharge > 0) {
              const earlyCheckinSurchargeNightly = earlyCheckinHoursNightly * nightlyEarlyCheckinSurcharge;
              total += earlyCheckinSurchargeNightly;
              priceDetails.earlyCheckinSurcharge = earlyCheckinSurchargeNightly;
              priceDetails.earlyCheckinHours = earlyCheckinHoursNightly;
              console.log(`Nightly early check-in: ${earlyCheckinHoursNightly} hours, surcharge: ${earlyCheckinSurchargeNightly}`);
            }
          } else {
            console.log(`Nightly check-in trong thá»i gian quy Ä‘á»‹nh (${nightlyStartTime}-${nightlyEndTime}), khÃ´ng tÃ­nh early check-in surcharge`);
          }
        }
        
        if (priceDetails.days && Number(priceDetails.days) > 0) {
          const checkOutMinutes = checkOutTime.getHours() * 60 + checkOutTime.getMinutes();
          const [dailyCoHour, dailyCoMinute] = dailyCheckOutTime.split(':').map(Number);
          const dailyCheckOutMinutes = (dailyCoHour || 0) * 60 + (dailyCoMinute || 0);
          if (checkOutMinutes > dailyCheckOutMinutes && dailyLateCheckoutFee > 0) {
            const lateMinutes = checkOutMinutes - dailyCheckOutMinutes;
            const lateCheckoutHoursDaily = Math.ceil(lateMinutes / 60);
            const lateCheckoutFeeDaily = lateCheckoutHoursDaily * dailyLateCheckoutFee;
            total += lateCheckoutFeeDaily;
            priceDetails.lateCheckoutSurcharge = lateCheckoutFeeDaily;
            priceDetails.lateCheckoutHours = lateCheckoutHoursDaily;
          }
        } else {
          const checkOutDateOnly = new Date(checkOutTime);
          checkOutDateOnly.setHours(0, 0, 0, 0);
          const checkInDateOnly = new Date(checkInTime || new Date());
          checkInDateOnly.setHours(0, 0, 0, 0);
          const isNextDay = checkOutDateOnly.getTime() > checkInDateOnly.getTime();
          
          const checkOutMinutes = checkOutTime.getHours() * 60 + checkOutTime.getMinutes();
          const [endHour, endMinute] = nightlyEndTime.split(':').map(Number);
          const endTimeMinutes = (endHour || 0) * 60 + (endMinute || 0);
          
          if (isNextDay && checkOutMinutes > endTimeMinutes && nightlyLateCheckoutSurcharge > 0) {
            const lateMinutes = checkOutMinutes - endTimeMinutes;
            const lateCheckoutHoursNightly = Math.ceil(lateMinutes / 60);
            const lateCheckoutSurchargeNightly = lateCheckoutHoursNightly * nightlyLateCheckoutSurcharge;
            total += lateCheckoutSurchargeNightly;
            priceDetails.lateCheckoutSurcharge = lateCheckoutSurchargeNightly;
            priceDetails.lateCheckoutHours = lateCheckoutHoursNightly;
          }
        }
        
        console.log(
          `Nightly rate calculation: ${Number(priceDetails?.nights || 0)} nights * ${nightlyRate}` +
            (priceDetails?.days ? ` + ${Number(priceDetails.days)} days * ${Number(priceDetails.dailyBasePrice || 0)}` : '') +
            ` = ${total}`
        );
        break;
      
      case 'weekly':
        const weeks = Math.max(1, Math.ceil(durationInDays / 7));
        total = weeks * weeklyRate;
        priceDetails.basePrice = weeklyRate;
        priceDetails.rateType = 'weekly';
        priceDetails.weeks = weeks;
        console.log(`Weekly rate calculation: ${weeks} weeks * ${weeklyRate} = ${total}`);
        break;

      case 'monthly':
        const months = Math.max(1, Math.ceil(durationInDays / 30));
        total = months * monthlyRate;
        priceDetails.basePrice = monthlyRate;
        priceDetails.rateType = 'monthly';
        priceDetails.months = months;
        console.log(`Monthly rate calculation: ${months} months * ${monthlyRate} = ${total}`);
        break;
        
      default:
        // Máº·c Ä‘á»‹nh tÃ­nh theo giá»
        total = hourlyRate * durationInHours;
        priceDetails.rateType = 'hourly';
        priceDetails.basePrice = hourlyRate;
    }
    
    // LÆ°u priceDetails vÃ o this.roomPriceDetails Ä‘á»ƒ hiá»ƒn thá»‹ trong UI
    this.roomPriceDetails = priceDetails;
    
    return Math.max(0, Math.round(total));
  }

  calculateServicesTotal(): number {
    // TÃ­nh tá»•ng tiá»n dá»‹ch vá»¥ tá»« danh sÃ¡ch dá»‹ch vá»¥ Ä‘Ã£ chá»n
    return this.selectedServices.reduce((total, service) => {
      // Sá»­ dá»¥ng totalPrice náº¿u cÃ³, náº¿u khÃ´ng thÃ¬ tÃ­nh tá»« price vÃ  quantity
      const serviceTotal = service.totalPrice !== undefined ? 
        service.totalPrice : (service.price * service.quantity);
      return total + serviceTotal;
    }, 0);
  }

  // Xá»­ lÃ½ dá»n phÃ²ng
  cleanRoom(): void {
    // Kiá»ƒm tra tráº¡ng thÃ¡i phÃ²ng
    if (this.roomData.status !== 'dirty' && this.roomData.status !== 'maintenance' && this.roomData.status !== 'cleaning') {
      this.message.error(`PhÃ²ng ${this.roomData.roomNumber} khÃ´ng á»Ÿ tráº¡ng thÃ¡i cáº§n dá»n dáº¹p hoáº·c báº£o trÃ¬ (Tráº¡ng thÃ¡i: ${this.getStatusLabel(this.roomData.status)}).`);
      this.isLoading = false;
      return;
    }
    
    this.isLoading = true;
    
    const newRoom = {
      status: 'vacant',
      events: [
        ...this.roomData.events || [],
        {
          type: 'maintenance', // Sá»­ dá»¥ng giÃ¡ trá»‹ 'maintenance' thay vÃ¬ 'maintenance_completed'
          completedTime: new Date(),
          notes: this.roomData.status === 'maintenance' ? 'ÄÃ£ hoÃ n thÃ nh báº£o trÃ¬' : 'ÄÃ£ dá»n dáº¹p phÃ²ng'
        }
      ]
    };
    
    // ÄÃ³ng modal ngay láº­p tá»©c
    if (this.modalRef) {
      this.modalRef.close();
    }
    
    // Thá»±c hiá»‡n clean room trong background
    this.roomsService.cleanRoom(this.roomData._id, newRoom)
      .subscribe(
        (room) => {
          setTimeout(() => {
            let successMessage = 'ÄÃ£ cáº­p nháº­t tráº¡ng thÃ¡i phÃ²ng thÃ nh "Sáºµn sÃ ng"';
            if (this.roomData.status === 'maintenance') {
              successMessage = 'ÄÃ£ hoÃ n thÃ nh báº£o trÃ¬ vÃ  cáº­p nháº­t tráº¡ng thÃ¡i phÃ²ng thÃ nh "Sáºµn sÃ ng"';
            }
            this.message.success(successMessage);
            
            // KhÃ´ng cÃ²n dÃ¹ng session ná»¯a, dá»¯ liá»‡u Ä‘Ã£ Ä‘Æ°á»£c lÆ°u vÃ o RoomEvent
            
            this.emitRoomDataUpdated('cleaning', { roomId: this.roomData?._id, force: false, delayMs: 100 });
          }, 100);
        },
        (error) => {
          setTimeout(() => {
            this.message.error('Lá»—i khi cáº­p nháº­t tráº¡ng thÃ¡i phÃ²ng: ' + error.message);
            this.emitRoomDataUpdated('cleaning', { roomId: this.roomData?._id, force: false, delayMs: 100 });
          }, 100);
        }
      );
  }

  // Xá»­ lÃ½ submit form dá»±a theo loáº¡i modal
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
        console.log('KhÃ´ng cÃ³ hÃ nh Ä‘á»™ng cho loáº¡i modal:', this.modalType);
    }
  }

  // ThÃªm getter cho tiá»n phÃ²ng
  get roomPriceTotal(): number {
    // Chá»‰ tÃ­nh giÃ¡ khi modalType lÃ  'checkout'
    if (this.modalType !== 'checkout') {
      return 0;
    }
    
    // Æ¯u tiÃªn tráº£ vá» giÃ¡ trá»‹ Ä‘Ã£ tÃ­nh tá»« calculateTotalPrice (tá»« backend API)
    // Sá»­ dá»¥ng flag Ä‘á»ƒ biáº¿t Ä‘Ã£ cÃ³ giÃ¡ trá»‹ tá»« API
    if (this._hasRoomPriceFromAPI) {
      return this._roomPriceTotal;
    }
    
    // Náº¿u chÆ°a cÃ³ giÃ¡ trá»‹ tá»« API, tÃ­nh toÃ¡n táº¡m thá»i Ä‘á»ƒ hiá»ƒn thá»‹
    // Fallback: tÃ­nh toÃ¡n local náº¿u chÆ°a cÃ³ giÃ¡ trá»‹ tá»« API
    try {
      const lastCheckIn = this.listData && this.listData.length > 0 ? this.listData[0] : null;
      if (!lastCheckIn || !this.roomData) return 0;
      
      // Kiá»ƒm tra xem cÃ³ pháº£i lÃ  checkin event khÃ´ng
      if (lastCheckIn.type && lastCheckIn.type !== 'checkin') {
        return 0;
      }

      // Kiá»ƒm tra checkinTime
      if (!lastCheckIn.checkinTime) {
        return 0;
      }

      const checkInTime = new Date(lastCheckIn.checkinTime);
      
      // Kiá»ƒm tra Date há»£p lá»‡
      if (isNaN(checkInTime.getTime())) {
        return 0;
      }
      
      const checkOutTime = this.getUTCTimePlus7();
      
      // Kiá»ƒm tra checkOutTime há»£p lá»‡
      if (isNaN(checkOutTime.getTime())) {
        return 0;
      }
      
      // Äáº£m báº£o checkInTime khÃ´ng lá»›n hÆ¡n checkOutTime
      if (checkInTime.getTime() > checkOutTime.getTime()) {
        return 0;
      }
      
      // TÃ­nh thá»i gian chÃ­nh xÃ¡c theo phÃºt
      const durationInMilliseconds = checkOutTime.getTime() - checkInTime.getTime();
      const durationInMinutes = Math.floor(durationInMilliseconds / (1000 * 60));
      const durationInHours = Math.floor(durationInMinutes / 60);
      const remainingMinutes = durationInMinutes % 60;
      const durationInDays = Math.ceil(durationInHours / 24);
      
      // Æ¯u tiÃªn láº¥y rateType tá»« form checkout náº¿u cÃ³, náº¿u khÃ´ng thÃ¬ láº¥y tá»« lastCheckIn
      const rateType = this.checkOutForm?.get('rateType')?.value || lastCheckIn.rateType || 'hourly';

      // TÃ­nh toÃ¡n táº¡m thá»i (sáº½ Ä‘Æ°á»£c cáº­p nháº­t khi API tráº£ vá»)
      return this.calculateRoomTotalByRateType(Math.max(0, durationInHours), Math.max(1, durationInDays), rateType, remainingMinutes);
    } catch (error) {
      console.error('Error calculating room price:', error);
      return 0;
    }
  }

  // ThÃªm getter cho tiá»n dá»‹ch vá»¥
  get servicesPriceTotal(): number {
    // Æ¯u tiÃªn tráº£ vá» giÃ¡ trá»‹ Ä‘Ã£ tÃ­nh tá»« calculateTotalPrice
    if (this._servicesPriceTotal > 0 && this.modalType === 'checkout') {
      return this._servicesPriceTotal;
    }
    
    return this.selectedServices.reduce((total, service) => {
      // Sá»­ dá»¥ng totalPrice náº¿u cÃ³, náº¿u khÃ´ng thÃ¬ tÃ­nh tá»« price vÃ  quantity
      const serviceTotal = service.totalPrice !== undefined ? 
        service.totalPrice : (service.price * service.quantity);
      return total + serviceTotal;
    }, 0);
  }

  // Hiá»ƒn thá»‹ hÃ³a Ä‘Æ¡n
  showInvoice(invoiceData: any): void {
    // Äáº£m báº£o hotelId luÃ´n cÃ³ trong invoiceData
    if (!invoiceData.hotelId) {
      invoiceData.hotelId = this.roomData?.hotelId || this.authService.getHotelId() || this.currentUser?.hotelId;
    }
    
    // Äáº£m báº£o dá»¯ liá»‡u dá»‹ch vá»¥ Ä‘Æ°á»£c chuáº©n bá»‹ Ä‘Ãºng
    if (invoiceData.services && invoiceData.services.length > 0) {
      invoiceData.services = invoiceData.services.map((service: any) => ({
        name: service.name || service.serviceName,
        price: service.price || 0,
        quantity: service.quantity || 1,
        totalPrice: (service.price || 0) * (service.quantity || 1)
      }));
    }

    // Äáº£m báº£o Ä‘á»‹nh dáº¡ng ngÃ y vÃ  giá»
    if (invoiceData.checkInTime) {
      const checkInDate = new Date(invoiceData.checkInTime);
      invoiceData.formattedCheckInTime = this.datePipe.transform(checkInDate, 'dd/MM/yyyy HH:mm');
    }

    if (invoiceData.checkOutTime) {
      const checkOutDate = new Date(invoiceData.checkOutTime);
      invoiceData.formattedCheckOutTime = this.datePipe.transform(checkOutDate, 'dd/MM/yyyy HH:mm');
    }

    // Äáº£m báº£o sá»‘ ngÃ y vÃ  sá»‘ giá» Ä‘Æ°á»£c Ä‘á»‹nh nghÄ©a
    if (!invoiceData.duration) {
      invoiceData.duration = {
        days: 1,
        hours: 24
      };
    }

    // Sá»­ dá»¥ng NzModalService Ä‘á»ƒ táº¡o modal
    const modal: NzModalRef = this.modalService.create({
      nzTitle: 'HÃ³a Ä‘Æ¡n thanh toÃ¡n',
      nzContent: InvoiceComponent,
      nzWidth: '800px',
      nzData: {
        invoiceData: invoiceData,
        businessInfo: this.businessInfo
      },
      nzFooter: [
        {
          label: 'ÄÃ³ng',
          onClick: () => modal.destroy()
        },
        {
          label: 'In hÃ³a Ä‘Æ¡n',
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

  // HÃ m public Ä‘á»ƒ Ä‘Ã³ng modal tá»« template
  closeModal(): void {
    this.modalRef.destroy();
  }

  // Helper: Láº¥y label cho tráº¡ng thÃ¡i phÃ²ng
  getStatusLabel(status: string): string {
    const labels: {[key: string]: string} = {
      'vacant': 'Trá»‘ng',
      'occupied': 'Äang sá»­ dá»¥ng',
      'dirty': 'Cáº§n dá»n dáº¹p',
      'cleaning': 'Äang dá»n dáº¹p',
      'maintenance': 'Báº£o trÃ¬'
    };
    return labels[status] || status;
  }

  createCheckOutForm(): void {
    this.checkOutForm = this.fb.group({
      guestInfo: this.fb.group({
        name: ['KhÃ¡ch láº»'],
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
    
    // THÃŠM DEBOUNCETIME CHá»NG Gá»ŒI TÃNH TIá»€N LIÃŠN Tá»¤C
    this.checkOutForm.get('rateType')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((newRateType) => {
        console.log('RateType changed to:', newRateType);
        this._roomPriceTotal = 0;
        this._hasRoomPriceFromAPI = false;
        this.calculateTotalPrice();
    });
    
    this.checkOutForm.get('additionalCharges')?.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => {
        this.calculateTotalPrice();
    });
    
    this.checkOutForm.get('discount')?.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => {
        this.calculateTotalPrice();
    });
    
    this.checkOutForm.get('advancePayment')?.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((val) => {
        this.advancePayment = val || 0;
        this.calculateTotalPrice();
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

  // Xá»­ lÃ½ khi OCR scan hoÃ n thÃ nh
  onOCRScanComplete(ocrData: any): void {
    if (!ocrData || !this.checkOutForm) return;

    const guestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
    if (!guestInfoFormGroup) return;

    const source = this.getOcrSourceData(ocrData);
    const idNumber = this.getOcrValue(ocrData, ['Sá»‘ ID', 'Sá»‘ CCCD', 'idNumber', 'cccd']).replace(/\s+/g, '');
    const fullName = this.getOcrValue(ocrData, ['Há» tÃªn', 'Há» vÃ  tÃªn', 'fullName', 'name']);
    const fullNameLegacy = `${source?.['lastName'] || ocrData?.lastName || ''} ${source?.['firstName'] || ocrData?.firstName || ''}`.trim();
    const phone = this.getOcrValue(ocrData, ['Sá»‘ Ä‘iá»‡n thoáº¡i', 'phone']);
    const address = this.getOcrValue(ocrData, ['Äá»‹a chá»‰ thÆ°á»ng trÃº', 'Äá»‹a chá»‰', 'address', 'QuÃª quÃ¡n']);

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

    this.message.success('ÄÃ£ tá»± Ä‘á»™ng Ä‘iá»n thÃ´ng tin tá»« OCR. Vui lÃ²ng kiá»ƒm tra vÃ  chá»‰nh sá»­a náº¿u cáº§n.');
  }

  // Má»Ÿ modal Ä‘á»ƒ lÆ°u thÃ´ng tin khÃ¡ch vÃ o guest-management
  openGuestSaveModal(): void {
    if (!this.roomData || !this.roomData._id) {
      this.message.error('KhÃ´ng tÃ¬m tháº¥y thÃ´ng tin phÃ²ng.');
      return;
    }
    
    // Láº¥y thÃ´ng tin khÃ¡ch tá»« form náº¿u cÃ³
    let guestInfo: any = null;
    if (this.checkOutForm) {
      const guestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
      if (guestInfoFormGroup) {
        guestInfo = guestInfoFormGroup.disabled ? guestInfoFormGroup.getRawValue() : guestInfoFormGroup.value;
      }
    }
    
    // Má»Ÿ modal GuestSaveModalComponent
    const modalRef = this.modalService.create({
      nzTitle: 'LÆ°u thÃ´ng tin khÃ¡ch',
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
        this.message.success('ÄÃ£ lÆ°u vÃ  assign khÃ¡ch vÃ o phÃ²ng thÃ nh cÃ´ng');
        // Reload room data
        this.roomsService.getRoomById(this.roomData._id).subscribe({
          next: (updatedRoom) => {
            this.roomData = updatedRoom;
            // Reload láº¡i dá»¯ liá»‡u phÃ²ng
            this.ngOnInit();
            
            // ThÃ´ng bÃ¡o cho room.component Ä‘á»ƒ reload
            this.emitRoomDataUpdated('generic', { roomId: this.roomData?._id, force: false, delayMs: 100 });
          },
          error: (error) => {
            console.error('Error reloading room:', error);
            // Váº«n thÃ´ng bÃ¡o Ä‘á»ƒ room.component reload
            this.emitRoomDataUpdated('generic', { roomId: this.roomData?._id, force: false, delayMs: 100 });
          }
        });
      }
    });
  }

  // LÆ°u thÃ´ng tin khÃ¡ch vÃ  tiá»n Ä‘áº·t trÆ°á»›c (giá»¯ láº¡i Ä‘á»ƒ tÆ°Æ¡ng thÃ­ch)
  saveGuestInfo(): void {
    if (!this.checkOutForm) {
      console.error('checkOutForm is not initialized');
      return;
    }
    
    if (!this.roomData || !this.roomData._id) {
      this.message.error('KhÃ´ng tÃ¬m tháº¥y thÃ´ng tin phÃ²ng.');
      return;
    }
    
    this.isSaving = true;
    
    // Láº¥y giÃ¡ trá»‹ trá»±c tiáº¿p tá»« form control Ä‘á»ƒ Ä‘áº£m báº£o láº¥y Ä‘Ãºng
    const guestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
    
    // Láº¥y giÃ¡ trá»‹ tá»« form control, sá»­ dá»¥ng getRawValue() náº¿u form bá»‹ disable
    const guestInfo = guestInfoFormGroup ? 
      (guestInfoFormGroup.disabled ? guestInfoFormGroup.getRawValue() : guestInfoFormGroup.value) : 
      (this.checkOutForm.get('guestInfo')?.value || {});
    
    // Láº¥y guestSource trá»±c tiáº¿p tá»« form control Ä‘á»ƒ Ä‘áº£m báº£o láº¥y Ä‘Ãºng
    const guestSourceControl = guestInfoFormGroup?.get('guestSource');
    const guestSourceValue = guestSourceControl ? 
      (guestSourceControl.disabled ? guestSourceControl.getRawValue() : guestSourceControl.value) : 
      (guestInfo.guestSource || null);
    
    // Äáº£m báº£o advancePayment luÃ´n lÃ  sá»‘
    const advancePayment = Number(this.checkOutForm.get('advancePayment')?.value) || 0;
    
    const advancePaymentMethodControl = this.checkOutForm.get('advancePaymentMethod');
    const advancePaymentMethod = advancePaymentMethodControl
      ? ((advancePaymentMethodControl.disabled ? advancePaymentMethodControl.getRawValue() : advancePaymentMethodControl.value) || 'cash')
      : 'cash';
    
    // Láº¥y giÃ¡ trá»‹ phá»¥ thu vÃ  khuyáº¿n mÃ£i tá»« form checkout (chá»‰ giÃ¡ trá»‹ ngÆ°á»i dÃ¹ng nháº­p thÃªm)
    // Form checkout báº¯t Ä‘áº§u tá»« 0, khÃ´ng bao gá»“m giÃ¡ trá»‹ tá»« check-in event
    const checkoutCharges = Number(this.checkOutForm.get('additionalCharges')?.value) || 0;
    const checkoutDiscount = Number(this.checkOutForm.get('discount')?.value) || 0;
    
    // TÃ­nh tá»•ng phá»¥ thu vÃ  khuyáº¿n mÃ£i (cá»™ng dá»“n, khÃ´ng ghi Ä‘Ã¨)
    // initialCharges vÃ  initialDiscount Ä‘Ã£ Ä‘Æ°á»£c set khi load dá»¯ liá»‡u tá»« check-in event
    // Khi lÆ°u, cá»™ng thÃªm giÃ¡ trá»‹ ngÆ°á»i dÃ¹ng nháº­p vÃ o form checkout
    // Khi má»Ÿ láº¡i modal, initialCharges vÃ  initialDiscount sáº½ Ä‘Æ°á»£c load láº¡i tá»« RoomEvent (Ä‘Ã£ bao gá»“m cáº£ láº§n nháº­p trÆ°á»›c)
    const additionalCharges = this.initialCharges + checkoutCharges;
    const discount = this.initialDiscount + checkoutDiscount;
    
    // Láº¥y rateType tá»« form checkout (Æ°u tiÃªn tá»« form, náº¿u khÃ´ng cÃ³ thÃ¬ láº¥y tá»« event)
    const rateType = this.checkOutForm?.get('rateType')?.value || 
                     (this.listData && this.listData.length > 0 ? this.listData[0].rateType : null) || 
                     'hourly';

    const notes = this.checkOutForm?.get('notes')?.value || this.initialNotes || '';
    
    // Láº¥y guestSource tá»« form, náº¿u khÃ´ng cÃ³ thÃ¬ láº¥y tá»« events
    let guestSource = guestSourceValue || 'walkin';
    if (!guestSourceValue && this.roomData.events && this.roomData.events.length > 0) {
      // Thá»­ láº¥y tá»« lastCheckinEvent (chá»‰ láº¥y event chÆ°a checkout)
      const checkinEvents = this.getUncheckedOutCheckinEvents(this.roomData.events);
      if (checkinEvents.length > 0 && checkinEvents[0].guestInfo?.guestSource) {
        guestSource = checkinEvents[0].guestInfo.guestSource;
      }
    }
    
    console.log('Saving guest info:', { 
      guestInfoFormGroupValue: guestInfoFormGroup?.value,
      guestInfoFormGroupRawValue: guestInfoFormGroup?.getRawValue(),
      guestInfo: guestInfo,
      guestSourceControl: guestSourceControl?.value,
      guestSourceControlRaw: guestSourceControl?.getRawValue(),
      guestSourceValue: guestSourceValue,
      finalGuestSource: guestSource,
      rateType: rateType, // Log rateType
      advancePayment,
      additionalCharges,
      discount,
      selectedServices: this.selectedServices, // Log selectedServices
      roomId: this.roomData._id 
    });
    
    // Äáº£m báº£o tÃªn khÃ¡ch máº·c Ä‘á»‹nh lÃ  "KhÃ¡ch láº»" náº¿u khÃ´ng nháº­p vÃ  Ä‘áº£m báº£o Ä‘áº§y Ä‘á»§ cÃ¡c trÆ°á»ng
    const updatedGuestInfo = {
      name: guestInfo.name || 'KhÃ¡ch láº»',
      idNumber: guestInfo.idNumber || '',
      tax_code: guestInfo.tax_code || '',
      phone: guestInfo.phone || '',
      email: guestInfo.email || '',
      address: guestInfo.address || '',
      guestSource: guestSource
    };
    
    console.log('Updated guestInfo for save:', updatedGuestInfo);
    
    let checkinData: any = {
      roomId: this.roomData._id,
      roomNumber: this.roomData.roomNumber,
      checkinTime: (this.listData && this.listData.length > 0 && this.listData[0]?.checkinTime)
        ? this.listData[0].checkinTime
        : new Date(),
      guestInfo: updatedGuestInfo,
      advancePayment: advancePayment,
      advancePaymentMethod: advancePaymentMethod,
      rateType: rateType,
      notes: notes,
      additionalCharges: additionalCharges,
      discount: discount,
      selectedServices: this.selectedServices || []
    };

    // LÆ°u vÃ o Redis
    const hotelId = this.normalizeObjectId(this.roomData.hotelId || this.authService.getHotelId() || this.currentUser?.hotelId);
    if (hotelId) {
      this.apiService.saveCheckinData(hotelId, this.roomData._id, checkinData).subscribe({
        next: () => console.log('[Redis] Checkin data saved'),
        error: (err) => console.error('[Redis] Error saving checkin data:', err)
      });
    }
    
    const previousAdvancePayment = (this.listData && this.listData.length > 0) ? (Number(this.listData[0].advancePayment) || 0) : 0;

    this.roomsService.updateRoomCheckinInfo(
      this.roomData._id,
      updatedGuestInfo,
      advancePayment,
      rateType,
      additionalCharges,
      discount,
      this.selectedServices,
      advancePaymentMethod,
      notes
    ).subscribe({
      next: (response) => {
        console.log('Update checkin info response:', response);
        this.message.success('ÄÃ£ lÆ°u thÃ´ng tin khÃ¡ch vÃ  tiá»n Ä‘áº·t trÆ°á»›c.');

        this.initialNotes = notes;
        this.createAdvancePaymentIncomeIfNeeded(advancePayment, previousAdvancePayment, advancePaymentMethod, updatedGuestInfo);
        this.isSaving = false;

        if (this.modalRef) {
          setTimeout(() => {
            this.modalRef.close();
          }, 500);
        }

        if (this.listData && this.listData.length > 0) {
          this.listData[0].guestInfo = updatedGuestInfo;
          this.listData[0].advancePayment = advancePayment;
          this.listData[0].advancePaymentMethod = advancePaymentMethod;
          this.listData[0].rateType = rateType;
          this.listData[0].additionalCharges = additionalCharges;
          this.listData[0].discount = discount;
          this.listData[0].notes = notes;
          this.advancePayment = advancePayment;
        }

        this.initialCharges = additionalCharges;
        this.initialDiscount = discount;

        const updatedGuestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
        if (updatedGuestInfoFormGroup) {
          if (updatedGuestInfoFormGroup.disabled) {
            updatedGuestInfoFormGroup.enable();
          }
          updatedGuestInfoFormGroup.patchValue({
            name: updatedGuestInfo.name,
            idNumber: updatedGuestInfo.idNumber,
            tax_code: updatedGuestInfo.tax_code || '',
            phone: updatedGuestInfo.phone,
            email: updatedGuestInfo.email,
            address: updatedGuestInfo.address
          }, { emitEvent: false });
          const updatedGuestSourceControl = updatedGuestInfoFormGroup.get('guestSource');
          if (updatedGuestSourceControl) {
            updatedGuestSourceControl.setValue(updatedGuestInfo.guestSource, { emitEvent: true });
          }
        }

        this.checkOutForm.patchValue({
          advancePayment: advancePayment,
          rateType: rateType
        }, { emitEvent: false });

        setTimeout(() => {
          this.calculateTotalPrice();
        }, 100);

        setTimeout(() => {
          this.roomsService.getRoomById(this.roomData._id, {
            limit: 1000,
            excludeCheckedOut: true
          }).subscribe({
            next: (updatedRoom) => {
              this.roomData = updatedRoom;
              this.emitRoomDataUpdated('checkin', { roomId: this.roomData?._id, force: false, delayMs: 100 });
            },
            error: (err) => {
              console.error('Error reloading room:', err);
              this.emitRoomDataUpdated('checkin', { roomId: this.roomData?._id, force: false, delayMs: 100 });
            }
          });
        }, 300);
      },
      error: (err) => {
        console.error('Error updating checkin info:', err);
        this.message.warning('Lá»—i khi cáº­p nháº­t backend: ' + (err.error?.message || err.message));
        this.isSaving = false;
      }
    });
  }

  private createAdvancePaymentIncomeIfNeeded(
    advancePayment: number,
    previousAdvancePayment: number,
    advancePaymentMethod: string,
    updatedGuestInfo: { name?: string }
  ): void {
    try {
      const hotelId = this.normalizeObjectId(this.roomData.hotelId || this.authService.getHotelId() || this.currentUser?.hotelId);
      const payerName = updatedGuestInfo?.name || 'KhÃ¡ch láº»';
      const advanceDiff = Number(advancePayment || 0) - Number(previousAdvancePayment || 0);
      if (!hotelId || advanceDiff <= 0) return;

      const methodForTransaction = this.mapToTransactionMethod(advancePaymentMethod);
      const bookingId = this.normalizeObjectId(
        typeof this.roomData.currentBooking === 'string'
          ? this.roomData.currentBooking
          : (this.roomData.currentBooking && typeof this.roomData.currentBooking === 'object' ? (this.roomData.currentBooking as any)._id : undefined)
      ) || undefined;
      this.transactionService.createIncome({
        hotelId: hotelId,
        amount: advanceDiff,
        method: methodForTransaction,
        incomeCategory: 'deposit',
        description: `[Äáº·t trÆ°á»›c] PhÃ²ng ${this.roomData.roomNumber}`,
        notes: `Äáº·t trÆ°á»›c phÃ²ng ${this.roomData.roomNumber} - ${payerName}`,
        payer: payerName,
        bookingId: bookingId,
        metadata: {
          source: 'advance_payment',
          roomId: String(this.roomData._id),
          roomNumber: String(this.roomData.roomNumber || ''),
          bookingId: bookingId || null,
          payer: payerName
        }
      }).subscribe({
        next: () => console.log('ÄÃ£ táº¡o phiáº¿u thu Ä‘áº·t trÆ°á»›c phÃ²ng', this.roomData.roomNumber, 'amount:', advanceDiff, 'method:', methodForTransaction),
        error: (err) => {
          console.error('Lá»—i táº¡o phiáº¿u thu Ä‘áº·t trÆ°á»›c:', err);
          this.message.error('KhÃ´ng táº¡o Ä‘Æ°á»£c phiáº¿u thu Ä‘áº·t trÆ°á»›c: ' + (err?.error?.message || err?.message || 'Lá»—i khÃ´ng xÃ¡c Ä‘á»‹nh'));
        }
      });
    } catch (e) {
      console.error('Lá»—i khi táº¡o phiáº¿u thu Ä‘áº·t trÆ°á»›c:', e);
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
      !this.sepayPaymentHistoryId ||
      !this.showSePayModal ||
      this.paymentSuccessHandled ||
      transactionToken !== this.activeSePayTransactionToken
    ) {
      return;
    }

    this.paymentStatusCheckInFlight = true;
    this.sepayService.getPaymentHistory({
      limit: 20,
      skip: 0
    }).subscribe({
      next: (response: any) => {
        this.paymentStatusCheckInFlight = false;

        if (transactionToken !== this.activeSePayTransactionToken || this.paymentSuccessHandled) {
          return;
        }

        const paymentHistories = Array.isArray(response) ? response : (response.data || []);
        const paymentHistory = paymentHistories.find((p: any) =>
          this.sepayPaymentHistoryId && (p._id === this.sepayPaymentHistoryId || p.id === this.sepayPaymentHistoryId)
        );

        if (!paymentHistory) {
          if (isLastAttempt) {
            this.stopPaymentStatusPolling();
          }
          return;
        }

        const expectedAmount = this.sepayAmount;
        const receivedAmount = paymentHistory.paymentGatewayResponse?.transferAmount || paymentHistory.amount;
        const amountDifference = Math.abs(receivedAmount - expectedAmount);
        const amountTolerance = expectedAmount * 0.01;

        if (paymentHistory.status === 'completed' || paymentHistory.status === 'paid') {
          if (amountDifference > amountTolerance) {
            console.warn('Sá»‘ tiá»n khÃ´ng khá»›p:', {
              expected: expectedAmount,
              received: receivedAmount,
              difference: amountDifference
            });
          }
          this.stopPaymentStatusPolling(false);
          this.onPaymentSuccess();
          return;
        }

        if (paymentHistory.status === 'failed' || paymentHistory.status === 'cancelled') {
          this.stopPaymentStatusPolling();
          this.message.warning('Thanh toÃ¡n Ä‘Ã£ bá»‹ há»§y hoáº·c tháº¥t báº¡i. Vui lÃ²ng thá»­ láº¡i.');
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
    this.activeSePayTransactionToken = '';
    this.sepayPaymentHistoryId = '';
    this.pendingCheckoutData = null;
    this.pendingInvoiceData = null;
  }

  private emitRoomDataUpdated(
    reason: 'checkin' | 'checkout' | 'recheckin' | 'delete_checkout_history' | 'cleaning' | 'dirty' | 'maintenance' | 'status' | 'transfer' | 'generic',
    options?: { roomId?: string; relatedRoomId?: string; force?: boolean; delayMs?: number }
  ): void {
    const hotelId = this.normalizeObjectId(this.roomData?.hotelId || this.authService.getHotelId() || this.currentUser?.hotelId);
    this.roomsService.notifyRoomDataUpdated({
      hotelId: hotelId || undefined,
      roomId: options?.roomId,
      relatedRoomId: options?.relatedRoomId,
      reason,
      refreshRooms: true,
      refreshHistory: true,
      force: options?.force ?? false,
      delayMs: options?.delayMs
    });
  }
  
  // Getter Ä‘á»ƒ láº¥y phá»¥ thu checkin sá»›m tá»« roomPriceDetails
  getEarlyCheckinSurcharge(): number {
    if (!this.roomPriceDetails) return 0;
    
    // Kiá»ƒm tra breakdown trÆ°á»›c (cho hourly rate vá»›i nightly period)
    if (this.roomPriceDetails.breakdown?.beforeNightly?.earlyCheckinSurcharge) {
      return this.roomPriceDetails.breakdown.beforeNightly.earlyCheckinSurcharge;
    }
    
    // Kiá»ƒm tra trá»±c tiáº¿p tá»« roomPriceDetails
    if (this.roomPriceDetails.earlyCheckinSurcharge) {
      return this.roomPriceDetails.earlyCheckinSurcharge;
    }
    
    return 0;
  }
  
  // Getter Ä‘á»ƒ láº¥y sá»‘ giá» checkin sá»›m
  getEarlyCheckinHours(): number {
    if (!this.roomPriceDetails) return 0;
    
    // Kiá»ƒm tra breakdown trÆ°á»›c (cho hourly rate vá»›i nightly period)
    if (this.roomPriceDetails.breakdown?.beforeNightly?.hours) {
      return this.roomPriceDetails.breakdown.beforeNightly.hours;
    }
    
    // Kiá»ƒm tra trá»±c tiáº¿p tá»« roomPriceDetails
    if (this.roomPriceDetails.earlyCheckinHours) {
      return this.roomPriceDetails.earlyCheckinHours;
    }
    
    return 0;
  }
  
  // Getter Ä‘á»ƒ láº¥y phá»¥ thu checkout trá»… tá»« roomPriceDetails
  getLateCheckoutSurcharge(): number {
    if (!this.roomPriceDetails) return 0;
    
    // Kiá»ƒm tra breakdown trÆ°á»›c (cho hourly rate vá»›i nightly period)
    if (this.roomPriceDetails.breakdown?.afterNightly?.lateCheckoutSurcharge) {
      return this.roomPriceDetails.breakdown.afterNightly.lateCheckoutSurcharge;
    }
    
    // Kiá»ƒm tra trá»±c tiáº¿p tá»« roomPriceDetails
    if (this.roomPriceDetails.lateCheckoutSurcharge) {
      return this.roomPriceDetails.lateCheckoutSurcharge;
    }
    
    return 0;
  }
  
  // Getter Ä‘á»ƒ láº¥y sá»‘ giá» checkout trá»…
  getLateCheckoutHours(): number {
    if (!this.roomPriceDetails) return 0;
    
    // Kiá»ƒm tra breakdown trÆ°á»›c (cho hourly rate vá»›i nightly period)
    if (this.roomPriceDetails.breakdown?.afterNightly?.hours) {
      return this.roomPriceDetails.breakdown.afterNightly.hours;
    }
    
    // Kiá»ƒm tra trá»±c tiáº¿p tá»« roomPriceDetails
    if (this.roomPriceDetails.lateCheckoutHours) {
      return this.roomPriceDetails.lateCheckoutHours;
    }
    
    return 0;
  }
  
  // Getter Ä‘á»ƒ láº¥y sá»‘ tiá»n qua Ä‘Ãªm (basePrice)
  getBaseRoomPrice(): number {
    if (!this.roomPriceDetails) return 0;
    
    // Kiá»ƒm tra breakdown trÆ°á»›c (cho hourly rate vá»›i nightly period)
    if (this.roomPriceDetails.breakdown?.nightly?.price) {
      return this.roomPriceDetails.breakdown.nightly.price;
    }
    
    // Kiá»ƒm tra trá»±c tiáº¿p tá»« roomPriceDetails
    if (this.roomPriceDetails.basePrice) {
      return this.roomPriceDetails.basePrice;
    }
    
    return 0;
  }
  
  // Getter Ä‘á»ƒ láº¥y sá»‘ Ä‘Ãªm (nights)
  getNights(): number {
    if (!this.roomPriceDetails) return 0;
    
    // Kiá»ƒm tra breakdown trÆ°á»›c (cho hourly rate vá»›i nightly period)
    if (this.roomPriceDetails.breakdown?.nightly?.nights) {
      return this.roomPriceDetails.breakdown.nightly.nights;
    }
    
    // Kiá»ƒm tra trá»±c tiáº¿p tá»« roomPriceDetails
    if (this.roomPriceDetails.nights) {
      return this.roomPriceDetails.nights;
    }
    
    return 0;
  }
  
  // Getter Ä‘á»ƒ láº¥y sá»‘ giá» (hours) - cho hourly rate
  getHours(): number {
    if (!this.roomPriceDetails) return 0;
    
    // Kiá»ƒm tra breakdown trÆ°á»›c (cho hourly rate vá»›i nightly period)
    if (this.roomPriceDetails.breakdown?.hourly?.hours) {
      return this.roomPriceDetails.breakdown.hourly.hours;
    }
    
    // Kiá»ƒm tra trá»±c tiáº¿p tá»« roomPriceDetails
    if (this.roomPriceDetails.hours) {
      return this.roomPriceDetails.hours;
    }
    
    return 0;
  }
  
  // Getter Ä‘á»ƒ láº¥y giÃ¡ theo giá» (hourlyPrice) - cho hourly rate
  getHourlyPrice(): number {
    if (!this.roomPriceDetails) return 0;
    
    // Kiá»ƒm tra breakdown trÆ°á»›c (cho hourly rate vá»›i nightly period)
    if (this.roomPriceDetails.breakdown?.hourly?.price) {
      return this.roomPriceDetails.breakdown.hourly.price;
    }
    
    // Kiá»ƒm tra trá»±c tiáº¿p tá»« roomPriceDetails
    if (this.roomPriceDetails.hourlyPrice) {
      return this.roomPriceDetails.hourlyPrice;
    }
    
    // Náº¿u cÃ³ basePrice vÃ  rateType lÃ  hourly
    if (this.roomPriceDetails.basePrice && this.roomPriceDetails.rateType === 'hourly') {
      return this.roomPriceDetails.basePrice;
    }
    
    return 0;
  }
  
  // Debug method Ä‘á»ƒ kiá»ƒm tra roomPriceDetails
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

