import { Component, OnInit, OnDestroy, ViewChild, TemplateRef, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ProductService } from '../../services/product.service';
import { Subscription, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { NzMarks } from 'ng-zorro-antd/slider';
import { RoomsService } from '../../services/rooms.service';
import { HotelService } from '../../services/hotel.service';
import { Room, ShiftHandover, BookingHistory, RoomStatus, Event as RoomEvent, GuestInfo, OrderedService } from '../../interfaces/rooms';
import { Hotel } from '../../interfaces/hotel';
import { NzModalService, NzModalRef } from 'ng-zorro-antd/modal';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TableComponent } from '../table/table.component';
import { InvoiceService } from '../../services/invoice.service';
import { User } from '../../interfaces/user';
import { RoomContentModalComponent } from '../room-content-modal/room-content-modal.component';
import { TransactionService } from '../../services/transaction.service';
import { BookingModalComponent } from '../booking-modal/booking-modal.component';
import { CalendarComponent } from '../calendar/calendar.component';
import { RevenueChartComponent } from '../revenue-chart/revenue-chart.component';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { CurrencyService } from '../../services/currency.service';
import { RoomSessionService } from '../../services/room-session.service';
import { ApiService } from '../../services/api.service';
import { SessionContextService } from '../../services/session-context.service';
import { PaymentSpeakerService } from '../../services/payment-speaker.service';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';

interface RoomBookingInfoView {
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  rateTypeLabel: string;
}

interface RoomDisplayInfoView {
  checkinTime: string;
  customerName: string;
  rateTypeLabel: string;
  totalAmount: number;
  advancePayment: number;
  remainingAmount: number;
  guestSource: string;
  additionalCharges: number;
  discount: number;
  transferredFrom?: string;
  transferredAt?: Date;
}

interface RoomTransferInfoView {
  fromRoomId?: string;
  fromRoomNumber?: string;
  toRoomId?: string;
  toRoomNumber?: string;
  transferredAt?: Date;
  transferredBy?: string;
  transferHistory?: any[];
}

interface RoomCardMeta {
  displayStatus: RoomStatus;
  isPrebookedAvailable: boolean;
  statusClass: string;
  statusLabel: string;
  statusColor: string;
  icon: string;
  durationText: string;
  guestSource: string;
  guestSourceLabel: string;
  guestSourceColor: string;
  displayInfo: RoomDisplayInfoView | null;
  bookingInfo: RoomBookingInfoView | null;
  transferInfo: RoomTransferInfoView | null;
  transferredFromRoomNumber: string;
  ariaStatusLabel: string;
}

type RoomWithMeta = Room & {
  __viewMeta?: RoomCardMeta;
};

@Component({
  selector: 'app-room',
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomComponent implements OnInit, OnDestroy {
  @ViewChild(TableComponent) tableComponent!: TableComponent;
  @ViewChild(CalendarComponent) calendarComponent!: CalendarComponent;
  @ViewChild(RevenueChartComponent) revenueChartComponent?: RevenueChartComponent;
  @ViewChild('shiftHandoverContent') shiftHandoverContent!: TemplateRef<any>;
  
  // Subscription để theo dõi thay đổi totalPayment từ table
  private tableTotalPaymentSubscription: Subscription | null = null;
  
  rooms: Room[] = [];
  displayRoomsByFloor: { [floor: string]: RoomWithMeta[] } = {};
  displayFloors: string[] = [];
  roomTableData: BookingHistory[] = [];
  selectedRoomId: string | null = null;
  hotels: Hotel[] = [];
  selectedHotelId: string | null = null;
  floors: string[] = [];
  selectedFloor: string | null = null;
  private shouldLoadHotelsAfterInitialRender = false;
  isLoading = false;
  isRoomsLoading = false;
  private isModalOpen = false; // Flag để tránh mở nhiều modal cùng lúc
  private isReloading = false; // Flag để tránh mở modal khi đang reload
  bookings: any[] = []; // Danh sách bookings để hiển thị trên calendar
  
  totalPayment: number = 0;
  totalRevenue: number = 0; // Tổng doanh thu
  totalExpense: number = 0; // Tổng chi
  totalRoomCount: number = 0;
  chartLabels: string[] = [];
  chartRevenueData: number[] = [];
  chartPaymentData: number[] = [];
  chartExpenseData: number[] = []; // Dữ liệu chi cho biểu đồ
  selectedPeriod: 'day' | 'week' | 'month'  = 'day'; // Khoảng thời gian cho biểu đồ
  
  // Currency handling
  usdRate: number = 0;
  
  // Collapse panel states
  isRevenuePanelActive = false; // Mở mặc định
  isCalendarPanelActive = false;
  isHistoryPanelActive = false;
  activeFloors: string[] = [];
  isFirstLoadForHotel = true;
  
  // Compact mode for room display
  isCompactMode = false; // Chế độ rút gọn: chỉ hiển thị số phòng, thời gian lưu trú và loại phòng
  Math = Math; // Expose Math object to template for calculations
  
  // Phiếu chi
  isExpenseModalVisible = false;
  expenseForm: FormGroup;
  expenseList: any[] = [];
  expenseLoading = false;
  
  // Phiếu thu
  isIncomeModalVisible = false;
  incomeForm: FormGroup;
  incomeList: any[] = [];
  incomeLoading = false;
  
  shiftHandoverForm: FormGroup;
  private roomDataUpdatedSubscription: Subscription;
  
  // Cached room counts for template performance
  cachedVacantCount = 0;
  cachedOccupiedCount = 0;
  cachedDirtyCount = 0;
  cachedMaintenanceCount = 0;
  cachedBookedCount = 0;
  cachedGuestOutCount = 0;
  
  // Cache để lưu roomPrice từ backend API cho mỗi room
  private roomPriceCache = new Map<string, number>();
  // Map để lưu roomPrice trực tiếp vào room object (để trigger change detection)
  private roomPriceMap = new Map<string, number>();
  private lastLoadedHotelId: string | null = null;
  private realtimeRoomsTimer: ReturnType<typeof setInterval> | null = null;
  private realtimePricesTimer: ReturnType<typeof setInterval> | null = null;
  private lastRealtimePriceRefreshAt = 0;
  private realtimeLastSnapshotKey: string | null = null;
  private realtimeRefreshing = false;
  private roomsSocket: Socket | null = null;
  private roomsSocketConnected = false;
  private roomsSocketHotelId: string | null = null;
  private paymentSpeakerEnabled = false;
  private lastPaymentToastEventKey: string | null = null;
  private roomNumberByIdMap = new Map<string, string>();
  private historyReloadQueued = false;
  private historyReloadInFlight = false;
  private lastHistoryLoadedAt = 0;
  private occupiedEventsReloadQueued = false;
  private displayRebuildQueued = false;
  private chartDataLoading = false;
  private expensesLoadedHotelId: string | null = null;
  private incomesLoadedHotelId: string | null = null;
  private chartLoadedKey: string | null = null;
  private postRoomLoadPrefetchHotelId: string | null = null;
  private auxiliaryReloadTimer: ReturnType<typeof setTimeout> | null = null;
  private auxiliaryReloadQueued = false;

  roomStatusDisplayOptions: { value: RoomStatus, label: string, color: string }[] = [
    { value: 'vacant', label: '', color: 'green' }, // Label sẽ được translate trong getRoomStatusLabelAndColor
    { value: 'occupied', label: '', color: 'red' },
    { value: 'cleaning', label: '', color: 'blue' },
    { value: 'dirty', label: '', color: 'orange' },
    { value: 'maintenance', label: '', color: 'purple' },
    { value: 'booked', label: '', color: 'geekblue' }
  ];

  constructor(
    public productService: ProductService, 
    private roomsService: RoomsService,
    private hotelService: HotelService,
    private modalService: NzModalService,
    private fb: FormBuilder,
    private message: NzMessageService,
    private invoiceService: InvoiceService,
    private transactionService: TransactionService,
    public authService: AuthService,
    private userService: UserService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
    private currencyService: CurrencyService,
    private roomSessionService: RoomSessionService,
    private apiService: ApiService,
    private paymentSpeakerService: PaymentSpeakerService,
    private sessionContext: SessionContextService
  ) {
    this.roomDataUpdatedSubscription = this.roomsService.getRoomDataUpdated$().subscribe((event) => {
      if (!this.selectedHotelId) {
        return;
      }

      const eventHotelId = event?.hotelId ? String(event.hotelId) : '';
      if (eventHotelId && eventHotelId !== String(this.selectedHotelId)) {
        return;
      }

      const runUpdate = () => {
        if (event?.refreshRooms) {
          if (event.roomId && !event.force && event.reason !== 'recheckin' && event.reason !== 'delete_checkout_history') {
            this.updateSingleRoomRealtime(event.roomId);
            if (event.relatedRoomId) {
              this.updateSingleRoomRealtime(event.relatedRoomId);
            }
          } else {
            this.loadRooms(true);
          }
        } else if (
          event?.roomId &&
          (event?.reason === 'dirty' ||
            event?.reason === 'status' ||
            event?.reason === 'cleaning' ||
            event?.reason === 'maintenance' ||
            event?.reason === 'transfer')
        ) {
          // Optimistic status đã mutate object / cache — chỉ rebuild display
          this.scheduleDisplayRebuild();
        }

        // Checkout / check-in / thu chi → refresh phụ trợ. Status-only không đụng history/chart.
        const auxReasons = new Set(['checkout', 'checkin', 'recheckin', 'delete_checkout_history', 'generic']);
        if (event?.refreshHistory || event?.force || (event?.reason && auxReasons.has(event.reason))) {
          this.scheduleAuxiliaryDataReload({
            force: true,
            incomes: true,
            expenses: true,
            chart: true,
            history: !this.isModalOpen
          });
        } else if (!this.isModalOpen && this.isHistoryPanelActive) {
          this.scheduleRoomHistoryReload(false);
        }
      };

      const delayMs = event?.delayMs ?? 0;
      if (delayMs > 0) {
        setTimeout(runUpdate, delayMs);
      } else {
        runUpdate();
      }
    });
    
    this.shiftHandoverForm = this.fb.group({
      fromStaffId: ['', [Validators.required]],
      toStaffId: ['', [Validators.required]],
      cashAmount: [0, [Validators.required, Validators.min(0)]],
      notes: [''],
    });
    
    this.expenseForm = this.fb.group({
      amount: [0, [Validators.required, Validators.min(1)]],
      method: ['cash', [Validators.required]],
      expenseCategory: ['other', [Validators.required]],
      description: ['', [Validators.required]],
      notes: [''],
      recipient: ['']
    });
    
    this.incomeForm = this.fb.group({
      amount: [0, [Validators.required, Validators.min(1)]],
      method: ['cash', [Validators.required]],
      incomeCategory: ['other', [Validators.required]],
      description: ['', [Validators.required]],
      notes: [''],
      payer: ['']
    });
  }

  ngOnInit(): void {
    // Ưu tiên hotelId đã warm từ login bootstrap / Redis / user profile
    const storedHotelId =
      this.sessionContext.getSelectedHotelId() ||
      this.hotelService.getStoredHotelId() ||
      this.authService.getHotelId();

    if (storedHotelId) {
      this.selectedHotelId = storedHotelId;
      this.roomSessionService.setHotelId(storedHotelId);
      this.onHotelChange(storedHotelId);
      this.shouldLoadHotelsAfterInitialRender = true;
    } else {
      this.loadHotels();
    }

    const currentUser = this.authService.getCurrentUser();
    const userId = currentUser?._id;

    // Chỉ gọi Redis selected-hotel khi chưa có hotelId (không chặn render)
    if (userId && !this.selectedHotelId) {
      this.apiService.getSelectedHotel(userId).subscribe({
        next: (res) => {
          if (res?.selectedHotelId) {
            const resolvedHotelId = res.selectedHotelId;
            this.selectedHotelId = resolvedHotelId;
            this.sessionContext.setSelectedHotelId(resolvedHotelId, { persist: false });
            this.roomSessionService.setHotelId(resolvedHotelId);
            this.onHotelChange(resolvedHotelId);
          }
        },
        error: () => {}
      });
    }

    const cachedColumnsCount = this.sessionContext.getRoomColumnsCount();
    if (cachedColumnsCount !== null) {
      this.count = cachedColumnsCount;
    } else if (userId) {
      this.apiService.getRoomColumnsCount(userId).subscribe({
        next: (res) => {
          if (res?.columnsCount && res.columnsCount >= 2 && res.columnsCount <= 12) {
            this.count = res.columnsCount;
            this.sessionContext.setRoomColumnsCount(res.columnsCount, { persist: false });
          }
        },
        error: () => {}
      });
    }
    
    window.addEventListener('floorFilterChanged', this.__onFloorFilterChanged as EventListener);
    window.addEventListener('columnsCountChanged', this.__onColumnsCountChanged as EventListener);
    window.addEventListener('hotelPaymentSpeakerChanged', this.__onHotelPaymentSpeakerChanged as EventListener);
    
    // Tỷ giá VND -> USD — không chặn first paint sơ đồ phòng
    setTimeout(() => {
      this.currencyService.getExchangeRate('VND', 'USD').subscribe({
        next: (rate) => { this.usdRate = rate || 0; },
        error: () => { this.usdRate = 0; }
      });
    }, 1500);
  }

  // Collapse panel change handlers
  onRevenuePanelChange(active: boolean): void {
    this.isRevenuePanelActive = active;
    if (active && this.selectedHotelId && !this.isRoomsLoading) {
      // Force reload khi mở panel — không chờ bấm nút reload
      setTimeout(() => {
        this.loadChartDataFromAPI(true);
        this.revenueChartComponent?.reload();
      }, 0);
    }
  }
  
  onCalendarPanelChange(active: boolean): void {
    this.isCalendarPanelActive = active;
    if (active && this.selectedHotelId && !this.isRoomsLoading) {
      setTimeout(() => {
        if (this.calendarComponent) {
          this.calendarComponent.loadBookings();
          this.calendarComponent.loadAllBookings();
        }
      }, 0);
    }
  }
  
  onHistoryPanelChange(active: boolean): void {
    this.isHistoryPanelActive = active;
    if (active && this.selectedHotelId && !this.isRoomsLoading) {
      this.scheduleRoomHistoryReload(true);
      setTimeout(() => this.tableComponent?.reloadData(), 0);
    }
  }
  
  // Expand/Collapse all functions
  expandAllCollapse(): void {
    this.isRevenuePanelActive = true;
    this.isCalendarPanelActive = true;
    this.isHistoryPanelActive = true;
    if (this.selectedHotelId && !this.isRoomsLoading) {
      setTimeout(() => {
        this.loadChartDataFromAPI(true);
        this.revenueChartComponent?.reload();
        if (this.calendarComponent) {
          this.calendarComponent.loadBookings();
          this.calendarComponent.loadAllBookings();
        }
        this.scheduleRoomHistoryReload(true);
        this.tableComponent?.reloadData();
      }, 0);
    }
  }
  
  collapseAllCollapse(): void {
    this.isRevenuePanelActive = false;
    this.isCalendarPanelActive = false;
    this.isHistoryPanelActive = false;
  }
  
  formatUSD(amount: number | undefined): string {
    if (!this.usdRate) return '';
    const value = Number(amount || 0) * this.usdRate;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(this.currencyService.roundAmount(value, 'USD'));
  }

  ngOnDestroy(): void {
    if (this.roomDataUpdatedSubscription) {
      this.roomDataUpdatedSubscription.unsubscribe();
    }
    if (this.auxiliaryReloadTimer) {
      clearTimeout(this.auxiliaryReloadTimer);
      this.auxiliaryReloadTimer = null;
    }
    this.stopRealtimeSync();
    window.removeEventListener('floorFilterChanged', this.__onFloorFilterChanged as EventListener);
    window.removeEventListener('columnsCountChanged', this.__onColumnsCountChanged as EventListener);
    window.removeEventListener('hotelPaymentSpeakerChanged', this.__onHotelPaymentSpeakerChanged as EventListener);
  }

  private __onFloorFilterChanged = (event: Event): void => {
    const detail = (event as CustomEvent)?.detail ?? null;
    this.onFloorChange(detail);
    this.cdr.detectChanges();
  };

  private __onColumnsCountChanged = (event: Event): void => {
    const newCount = Number((event as CustomEvent)?.detail);
    if (newCount >= 2 && newCount <= 12) {
      this.reGenerateArray(newCount);
      this.cdr.detectChanges();
    }
  };

  private __onHotelPaymentSpeakerChanged = (event: Event): void => {
    const detail = (event as CustomEvent)?.detail || {};
    const hotelId = String(detail?.hotelId || '').trim();
    if (!hotelId || !this.selectedHotelId || hotelId !== String(this.selectedHotelId)) {
      return;
    }

    this.paymentSpeakerEnabled = !!detail?.enabled;
    this.paymentSpeakerService.setEnabled(hotelId, this.paymentSpeakerEnabled);
    this.cdr.markForCheck();
  };

  openShiftHandoverModal(contentTemplate: any): void {
    this.modalService.create({
      nzTitle: 'Giao ca',
      nzContent: contentTemplate,
      nzWidth: 600,
      nzFooter: [
        {
          label: 'Hủy',
          onClick: () => this.modalService.closeAll()
        },
        {
          label: 'Xác nhận giao ca',
          type: 'primary',
          disabled: () => this.shiftHandoverForm.invalid,
          onClick: () => this.submitShiftHandover()
        }
      ],
      nzMaskClosable: false
    });
  }
  
  submitShiftHandover(): void {
    if (this.shiftHandoverForm.invalid) {
      Object.values(this.shiftHandoverForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      this.message.warning(this.translate.instant('COMMON.PLEASE_FILL_ALL'));
      return;
    }
    
    if (!this.selectedHotelId) {
      this.message.error(this.translate.instant('ROOM.SELECT_HOTEL'));
      return;
    }

    this.isLoading = true;
    const handoverData: Omit<ShiftHandover, 'id' | 'createdAt' | 'confirmedByPassword'> = {
      hotelId: this.selectedHotelId,
      fromStaffId: this.shiftHandoverForm.value.fromStaffId,
      toStaffId: this.shiftHandoverForm.value.toStaffId,
      handoverTime: new Date(),
      notes: this.shiftHandoverForm.value.notes,
      cashAmount: this.shiftHandoverForm.value.cashAmount,
    };
    
    this.roomsService.createShiftHandover(handoverData).subscribe(
      (response) => {
        this.message.success('Yêu cầu giao ca đã được tạo. Vui lòng xác nhận bằng mật khẩu.');
        this.isLoading = false;
        this.modalService.closeAll(); 
        if (response && response.id) {
            this.message.success(`Giao ca (ID: ${response.id}) thành công!`);
        } else {
            this.message.info('Giao ca đã được ghi nhận.');
        }
      },
      (error) => {
        this.message.error('Lỗi tạo giao ca: ' + (error.error?.message || error.message));
        this.isLoading = false;
      }
    );
  }
  
  showRoomHistory(force: boolean = false): void {
    if (!this.selectedHotelId) {
      this.message.warning(this.translate.instant('ROOM.SELECT_HOTEL'));
      return;
    }

    const hotelId = this.selectedHotelId;
    if (!force) {
      const cachedRoomHistory = this.roomsService.getCachedRoomHistory(hotelId, 'all', 1, 100);
      if (cachedRoomHistory) {
        this.applyRoomHistoryPayload(cachedRoomHistory.payload, cachedRoomHistory.updatedAt);
        return;
      }
    }

    const now = Date.now();
    if (!force && this.historyReloadInFlight) {
      return;
    }
    if (!force && now - this.lastHistoryLoadedAt < 500) {
      return;
    }
    
    this.historyReloadInFlight = true;
    this.roomsService.getRoomHistory(hotelId, 'all', 1, 100)
    .subscribe(
      (data) => {
        this.roomsService.setCachedRoomHistory(data, hotelId, 'all', 1, 100);
        this.applyRoomHistoryPayload(data);
        this.historyReloadInFlight = false;
      },
      (error) => {
        console.error('Lỗi tải lịch sử phòng:', error);
        this.historyReloadInFlight = false;
      }
    );
  }

  private scheduleRoomHistoryReload(force: boolean = false): void {
    if (this.historyReloadQueued && !force) {
      return;
    }

    this.historyReloadQueued = true;
    Promise.resolve().then(() => {
      this.historyReloadQueued = false;
      if (this.selectedHotelId && !this.isRoomsLoading) {
        this.showRoomHistory(force);
      }
    });
  }

  /**
   * Debounce reload phiếu thu/chi + biểu đồ + lịch sử phòng (socket / roomDataUpdated).
   * Không phụ thuộc nút reload trên UI.
   */
  private scheduleAuxiliaryDataReload(options: {
    force?: boolean;
    incomes?: boolean;
    expenses?: boolean;
    chart?: boolean;
    history?: boolean;
    delayMs?: number;
  } = {}): void {
    if (!this.selectedHotelId) {
      return;
    }

    const force = options.force !== false;
    const incomes = options.incomes !== false;
    const expenses = options.expenses !== false;
    const chart = options.chart !== false;
    const history = options.history !== false;
    const delayMs = options.delayMs ?? 400;

    if (this.auxiliaryReloadTimer) {
      clearTimeout(this.auxiliaryReloadTimer);
    }
    this.auxiliaryReloadQueued = true;
    this.auxiliaryReloadTimer = setTimeout(() => {
      this.auxiliaryReloadTimer = null;
      this.auxiliaryReloadQueued = false;
      const hotelId = this.selectedHotelId;
      if (!hotelId || this.isRoomsLoading) {
        return;
      }

      if (force) {
        this.transactionService.clearCachedIncomes(hotelId);
        this.transactionService.clearCachedExpenses(hotelId);
        this.hotelService.clearCachedHotelRevenueByPeriod(hotelId);
        this.roomsService.clearCachedRoomHistory(hotelId);
      }

      if (incomes) {
        this.loadIncomes(force, true);
      }
      if (expenses) {
        this.loadExpenses(force, true);
      }
      if (chart) {
        this.loadChartDataFromAPI(force, true);
        if (this.isRevenuePanelActive) {
          this.revenueChartComponent?.reload();
        }
      }
      if (history) {
        this.scheduleRoomHistoryReload(force);
        if (this.isHistoryPanelActive) {
          this.tableComponent?.reloadData();
        }
      }
      this.cdr.markForCheck();
    }, delayMs);
  }
  
  // Load danh sách phiếu chi
  loadExpenses(force: boolean = false, prefetch: boolean = false): void {
    if (!this.selectedHotelId) return;

    const hotelId = this.selectedHotelId;
    const expenseQuery = {
      hotelId,
      page: 1,
      limit: 1000
    };
    if (!force) {
      if (this.expenseLoading) {
        return;
      }
      const cachedExpenses = this.transactionService.getCachedExpenses(expenseQuery);
      if (cachedExpenses) {
        this.applyExpensePayload(cachedExpenses.payload);
        return;
      }
      if (this.expensesLoadedHotelId === hotelId && this.expenseList.length > 0) {
        return;
      }
    }

    if (!prefetch) {
      this.expenseLoading = true;
    }
    this.transactionService.getExpenses(expenseQuery).subscribe(
      (data) => {
        this.transactionService.setCachedExpenses(expenseQuery, data);
        this.applyExpensePayload(data);
        this.expenseLoading = false;
      },
      (error) => {
        console.error('Error loading expenses:', error);
        this.expenseLoading = false;
      }
    );
  }
  
  // Mở modal phiếu chi
  openExpenseModal(): void {
    if (!this.selectedHotelId) {
      this.message.warning(this.translate.instant('ROOM.SELECT_HOTEL'));
      return;
    }
    this.expenseForm.reset({
      amount: 0,
      method: 'cash',
      expenseCategory: 'other',
      description: '',
      notes: '',
      recipient: ''
    });
    this.isExpenseModalVisible = true;
    this.loadExpenses();
  }
  
  // Mở modal phiếu thu
  openIncomeModal(): void {
    if (!this.selectedHotelId) {
      this.message.warning(this.translate.instant('ROOM.SELECT_HOTEL'));
      return;
    }
    this.incomeForm.reset({
      amount: 0,
      method: 'cash',
      incomeCategory: 'other',
      description: '',
      notes: '',
      payer: ''
    });
    this.isIncomeModalVisible = true;
    this.loadIncomes();
  }
  
  // Load danh sách phiếu thu
  loadIncomes(force: boolean = false, prefetch: boolean = false): void {
    if (!this.selectedHotelId) return;

    const hotelId = this.selectedHotelId;
    const incomeQuery = {
      hotelId,
      page: 1,
      limit: 1000
    };
    if (!force) {
      if (this.incomeLoading) {
        return;
      }
      const cachedIncomes = this.transactionService.getCachedIncomes(incomeQuery);
      if (cachedIncomes) {
        this.applyIncomePayload(cachedIncomes.payload);
        return;
      }
      if (this.incomesLoadedHotelId === hotelId && this.incomeList.length > 0) {
        return;
      }
    }

    if (!prefetch) {
      this.incomeLoading = true;
    }
    this.transactionService.getIncomes(incomeQuery).subscribe(
      (data) => {
        this.transactionService.setCachedIncomes(incomeQuery, data);
        this.applyIncomePayload(data);
        this.incomeLoading = false;
      },
      (error) => {
        console.error('Error loading incomes:', error);
        this.incomeLoading = false;
      }
    );
  }
  
  // Tạo phiếu thu
  submitIncome(): void {
    if (!this.selectedHotelId) {
      this.message.warning(this.translate.instant('ROOM.SELECT_HOTEL'));
      return;
    }
    
    if (this.incomeForm.invalid) {
      this.message.warning(this.translate.instant('COMMON.PLEASE_FILL_ALL'));
      return;
    }
    
    const incomeData = {
      hotelId: this.selectedHotelId,
      ...this.incomeForm.value
    };
    
    this.incomeLoading = true;
    this.transactionService.createIncome(incomeData).subscribe(
      (response) => {
        this.message.success(this.translate.instant('COMMON.CREATE_SUCCESS'));
        this.isIncomeModalVisible = false;
        this.transactionService.clearCachedIncomes(this.selectedHotelId || undefined);
        this.hotelService.clearCachedHotelRevenueByPeriod(this.selectedHotelId || undefined);
        this.loadIncomes(true);
        this.showRoomHistory(true); // Reload để cập nhật biểu đồ
        this.loadChartDataFromAPI(true);
        // Cập nhật lại totalRevenue từ table sau khi tạo phiếu thu
        setTimeout(() => {
          this.updateRevenueFromTable();
        }, 200);
        this.incomeLoading = false;
      },
      (error) => {
        this.message.error('Lỗi tạo phiếu thu: ' + (error.error?.message || error.message));
        this.incomeLoading = false;
      }
    );
  }
  
  // Xóa phiếu thu
  deleteIncome(incomeId: string): void {
    this.modalService.confirm({
      nzTitle: 'Xác nhận xóa',
      nzContent: 'Bạn có chắc chắn muốn xóa phiếu thu này?',
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.transactionService.deleteIncome(incomeId).subscribe(
          () => {
            this.message.success(this.translate.instant('COMMON.DELETE_SUCCESS'));
            this.transactionService.clearCachedIncomes(this.selectedHotelId || undefined);
            this.hotelService.clearCachedHotelRevenueByPeriod(this.selectedHotelId || undefined);
            this.loadIncomes(true);
            this.showRoomHistory(true); // Reload để cập nhật biểu đồ
            this.loadChartDataFromAPI(true);
            // Cập nhật lại totalRevenue từ table sau khi xóa phiếu thu
            setTimeout(() => {
              this.updateRevenueFromTable();
            }, 200);
          },
          (error) => {
            this.message.error('Lỗi xóa phiếu thu: ' + (error.error?.message || error.message));
          }
        );
      }
    });
  }
  
  // Tạo phiếu chi
  submitExpense(): void {
    if (!this.selectedHotelId) {
      this.message.warning(this.translate.instant('ROOM.SELECT_HOTEL'));
      return;
    }
    
    if (this.expenseForm.invalid) {
      this.message.warning(this.translate.instant('COMMON.PLEASE_FILL_ALL'));
      return;
    }
    
    const expenseData = {
      hotelId: this.selectedHotelId,
      ...this.expenseForm.value
    };
    
    this.expenseLoading = true;
    this.transactionService.createExpense(expenseData).subscribe(
      (response) => {
        this.message.success(this.translate.instant('COMMON.CREATE_SUCCESS'));
        this.isExpenseModalVisible = false;
        this.transactionService.clearCachedExpenses(this.selectedHotelId || undefined);
        this.hotelService.clearCachedHotelRevenueByPeriod(this.selectedHotelId || undefined);
        this.loadExpenses(true);
        this.showRoomHistory(true); // Reload để cập nhật biểu đồ
        this.loadChartDataFromAPI(true);
        // Cập nhật lại totalRevenue từ table sau khi tạo phiếu chi
        setTimeout(() => {
          this.updateRevenueFromTable();
        }, 200);
        this.expenseLoading = false;
      },
      (error) => {
        this.message.error('Lỗi tạo phiếu chi: ' + (error.error?.message || error.message));
        this.expenseLoading = false;
      }
    );
  }
  
  // Xóa phiếu chi
  deleteExpense(expenseId: string): void {
    this.modalService.confirm({
      nzTitle: 'Xác nhận xóa',
      nzContent: 'Bạn có chắc chắn muốn xóa phiếu chi này?',
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.transactionService.deleteExpense(expenseId).subscribe(
          () => {
            this.message.success(this.translate.instant('COMMON.DELETE_SUCCESS'));
            this.transactionService.clearCachedExpenses(this.selectedHotelId || undefined);
            this.hotelService.clearCachedHotelRevenueByPeriod(this.selectedHotelId || undefined);
            this.loadExpenses(true);
            this.showRoomHistory(true); // Reload để cập nhật biểu đồ
            this.loadChartDataFromAPI(true);
            // Cập nhật lại totalRevenue từ table sau khi xóa phiếu chi
            setTimeout(() => {
              this.updateRevenueFromTable();
            }, 200);
          },
          (error) => {
            this.message.error('Lỗi xóa phiếu chi: ' + (error.error?.message || error.message));
          }
        );
      }
    });
  }
  
  prepareChartData(): void {
    const groupedData = this.groupDataByDate(this.roomTableData);
    const sortedDates = Object.keys(groupedData).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const recentDates = sortedDates.slice(-7);
    
    this.chartLabels = recentDates.map(date => {
      const d = new Date(date);
      return `${d.getDate()}/${d.getMonth() + 1}`;
    });
    
    this.chartRevenueData = recentDates.map(date => groupedData[date].revenue);
    this.chartPaymentData = recentDates.map(date => groupedData[date].payment);
  }
  
  groupDataByDate(data: BookingHistory[]): { [key: string]: { revenue: number, payment: number, count: number } } {
    const result: { [key: string]: { revenue: number, payment: number, count: number } } = {};
    data.forEach(item => {
      const dateObj = new Date(item.date);
      const dateStr = dateObj.toISOString().split('T')[0];
      
      if (!result[dateStr]) {
        result[dateStr] = { revenue: 0, payment: 0, count: 0 };
      }
      if (item.event === 'check-out' && item.totalAmount) {
        result[dateStr].revenue += item.totalAmount; 
        result[dateStr].payment += item.totalAmount;
      }
      result[dateStr].count++;
    });
    return result;
  }

  // Helper function để extract ID từ string hoặc object (xử lý cả populated và non-populated)
  private extractId(value: any): string | null {
    if (!value) return null;
    
    if (typeof value === 'string') {
      return value;
    }
    
    if (typeof value === 'object') {
      // Ưu tiên lấy _id nếu có
      if (value._id) {
        return typeof value._id === 'string' ? value._id : value._id.toString();
      }
      // Nếu không có _id nhưng object có toString (như ObjectID)
      if (typeof value.toString === 'function' && value.toString() !== '[object Object]') {
        return value.toString();
      }
    }
    
    return null;
  }

  // Helper function để extract businessId từ hotel (xử lý cả populated và non-populated)
  private extractBusinessId(hotel: Hotel): string | null {
    if (!hotel || !hotel.businessId) {
      return null;
    }
    return this.extractId(hotel.businessId);
  }

  loadHotels(): void {
    const currentUser = this.authService.getCurrentUser();
    const userRole = String(currentUser?.role || '').trim().toLowerCase();
    const userHotelId = this.extractId(currentUser?.hotelId);
    const userBusinessId = this.extractId(currentUser?.businessId);
    const isPlatformAdmin = userRole === 'superadmin' || userRole === 'admin';
    const isBusinessRole = userRole === 'business';
    const isHotelRole = userRole === 'hotel';

    // Staff chỉ gắn 1 khách sạn
    if (this.authService.isStaff() && userHotelId) {
      this.isLoading = true;
      this.cdr.detectChanges();
      this.hotelService.getHotelById(userHotelId, { lite: true }).subscribe({
        next: (hotel) => {
          this.hotels = hotel ? [hotel] : [];
          this.selectedHotelId = hotel?._id || userHotelId;

          if (this.selectedHotelId) {
            this.hotelService.saveRoomContext(this.selectedHotelId, this.selectedFloor || '');
            if (this.lastLoadedHotelId !== this.selectedHotelId && !this.isRoomsLoading) {
              this.onHotelChange(this.selectedHotelId);
            }
          } else {
            this.rooms = [];
            this.floors = [];
            this.message.warning('Không tìm thấy khách sạn của bạn. Vui lòng liên hệ quản trị viên.');
          }

          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          this.hotels = [];
          this.selectedHotelId = null;
          this.rooms = [];
          this.floors = [];
          this.message.error('Lỗi khi tải thông tin khách sạn: ' + (error.error?.message || error.message));
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
      return;
    }

    this.isLoading = true;
    this.cdr.detectChanges();

    // superadmin/admin: lấy tất cả KS — không truyền businessId
    // business/hotel: để backend filter theo quyền; FE có thể kèm businessId để rõ phạm vi
    const businessIdParam = isPlatformAdmin ? undefined : (userBusinessId || undefined);

    this.hotelService.getHotelsCached(businessIdParam, undefined, { lite: true }).subscribe({
      next: (data) => {
        const hotels = Array.isArray(data) ? data : [];

        if (isPlatformAdmin) {
          this.hotels = hotels;
        } else if (isBusinessRole) {
          this.hotels = userBusinessId
            ? hotels.filter((hotel) => this.extractBusinessId(hotel) === userBusinessId)
            : hotels;
        } else if (isHotelRole) {
          // hotel: ưu tiên danh sách theo business; fallback hotelId nếu API chỉ trả 1
          this.hotels = hotels;
          if ((!this.hotels || this.hotels.length === 0) && userHotelId) {
            this.hotelService.getHotelById(userHotelId, { lite: true }).subscribe({
              next: (hotel) => {
                this.hotels = hotel ? [hotel] : [];
                this.applyHotelSelectionAfterLoad();
                this.isLoading = false;
                this.cdr.detectChanges();
              },
              error: () => {
                this.hotels = [];
                this.applyHotelSelectionAfterLoad();
                this.isLoading = false;
                this.cdr.detectChanges();
              }
            });
            return;
          }
        } else {
          this.hotels = [];
        }

        this.applyHotelSelectionAfterLoad();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.message.error('Lỗi khi tải danh sách khách sạn: ' + (error.error?.message || error.message));
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private applyHotelSelectionAfterLoad(): void {
    if (this.hotels.length > 0 && !this.authService.isStaff()) {
      const preferredHotelId = this.selectedHotelId || this.hotelService.getStoredHotelId();
      const hotelExists = preferredHotelId
        ? this.hotels.some((h) => this.extractId(h._id) === preferredHotelId)
        : false;

      if (hotelExists && preferredHotelId) {
        this.selectedHotelId = preferredHotelId;
        if (this.lastLoadedHotelId !== preferredHotelId && !this.isRoomsLoading) {
          this.onHotelChange(this.selectedHotelId);
        }
      } else {
        this.selectedHotelId = this.hotels[0]._id!;
        if (this.lastLoadedHotelId !== this.selectedHotelId && !this.isRoomsLoading) {
          this.onHotelChange(this.selectedHotelId);
        }
      }

      if (this.selectedHotelId) {
        this.hotelService.saveRoomContext(this.selectedHotelId, this.selectedFloor || '');
      }
      return;
    }

    if (this.hotels.length === 0 && !this.authService.isStaff()) {
      this.selectedHotelId = null;
      this.rooms = [];
      this.floors = [];
    }
  }

  loadRooms(force: boolean = false): void {
    if (!this.selectedHotelId) return;
    const hotelId = this.selectedHotelId;

    if (!force) {
      const cachedRooms = this.roomsService.getCachedRooms(hotelId);
      if (cachedRooms !== null) {
        this.rooms = this.hydrateSyntheticEventsFromCurrentBooking(cachedRooms);
        this.lastLoadedHotelId = hotelId;
        this.realtimeLastSnapshotKey = this.buildRoomsSnapshotKey(this.rooms);
        this.updateFloorsFromRooms();
        this.isRoomsLoading = false;
        this.cdr.detectChanges();

        setTimeout(() => {
          if (this.shouldLoadHotelsAfterInitialRender) {
            this.shouldLoadHotelsAfterInitialRender = false;
            this.loadHotels();
          }
          if (this.selectedHotelId === hotelId) {
            this.syncHotelFloorsInBackground(hotelId);
          }
          // Chỉ seed giá local từ booking — không N+1 events/API giá sau first paint
          this.seedLocalPricesForOccupiedRooms();
        }, 0);
        return;
      }
    }

    this.isRoomsLoading = true;
    // Gọi hàm ép chạy Change Detection trước khi load để hiện trạng thái loading nếu cần
    this.cdr.detectChanges(); 
    const params: any = { hotelId: hotelId, lite: true };

    this.roomsService.getRooms(params).subscribe({
      next: (data) => {
        this.rooms = this.hydrateSyntheticEventsFromCurrentBooking(data || []);
        this.roomsService.setCachedRooms(hotelId, this.rooms);
        this.lastLoadedHotelId = hotelId;
        this.realtimeLastSnapshotKey = this.buildRoomsSnapshotKey(this.rooms);
        this.updateFloorsFromRooms();
        
        this.isRoomsLoading = false;
        
        // 🔥 CHÍ MẠNG: Ép Angular vẽ ngay sơ đồ phòng lên màn hình, không đợi click!
        this.cdr.detectChanges();

        setTimeout(() => {
          if (this.shouldLoadHotelsAfterInitialRender) {
            this.shouldLoadHotelsAfterInitialRender = false;
            this.loadHotels();
          }

          if (this.selectedHotelId === hotelId) {
            this.syncHotelFloorsInBackground(hotelId);
          }

          // Không prefetch history/chart/thu-chi — mở panel/modal mới tải (giữ bandwidth cho sơ đồ)
          this.seedLocalPricesForOccupiedRooms();
        }, 0);
      },
      error: (err) => {
        this.isRoomsLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private prefetchAuxiliaryDataAfterRoomsLoaded(hotelId: string): void {
    // Giữ API tương thích; không còn auto-prefetch nặng sau load phòng.
    // History/chart/thu-chi tải khi mở panel/modal tương ứng.
    if (!hotelId) {
      return;
    }
    this.postRoomLoadPrefetchHotelId = hotelId;
  }


  
  private hasRenderableOccupiedData(room: Room): boolean {
    if (!room || room.status !== 'occupied') {
      return false;
    }

    const events = (room as any)?.events;
    if (Array.isArray(events) && events.length > 0) {
      return true;
    }

    if (room.currentBooking && typeof room.currentBooking === 'object') {
      return true;
    }

    const roomId = room._id?.toString() || '';
    if (!roomId) {
      return false;
    }

    const session = this.roomSessionService.getSession(roomId);
    return !!session?.checkinTime;
  }

  // Load danh sách bookings
  loadBookings(): void {
    if (!this.selectedHotelId) return;
    
    this.roomsService.getBookings({ hotelId: this.selectedHotelId }).subscribe(
      (data) => {
        this.bookings = data.bookings || [];
      },
      (error) => {
        console.error('Error loading bookings:', error);
      }
    );
  }

  onHotelChange(hotelId: string | null): void {
    if (hotelId && this.lastLoadedHotelId === hotelId && this.rooms.length > 0 && !this.isRoomsLoading) {
      return;
    }
    if (this.authService.isStaff()) {
      const currentUser = this.authService.getCurrentUser();
      const staffHotelId = this.extractId(currentUser?.hotelId);
      if (staffHotelId && hotelId !== staffHotelId) {
        this.message.warning(this.translate.instant('ROOM.STAFF_ONLY_HOTEL'));
        this.selectedHotelId = staffHotelId;
        return;
      }
    }
    this.selectedHotelId = hotelId;
    if (hotelId) {
      this.sessionContext.setSelectedHotelId(hotelId);
    }
    this.isFirstLoadForHotel = true;
    this.activeFloors = [];
    // Ưu tiên paint từ cache login-bootstrap — tránh flash trống sơ đồ phòng
    const cachedRooms = hotelId ? this.roomsService.getCachedRooms(hotelId) : null;
    if (cachedRooms && cachedRooms.length > 0) {
      this.rooms = this.hydrateSyntheticEventsFromCurrentBooking(cachedRooms);
      this.lastLoadedHotelId = hotelId;
      this.realtimeLastSnapshotKey = this.buildRoomsSnapshotKey(this.rooms);
      this.isRoomsLoading = false;
    } else {
      this.rooms = [];
      this.lastLoadedHotelId = null;
    }
    this.displayRoomsByFloor = {};
    this.displayFloors = [];
    this.bookings = [];
    this.roomTableData = [];
    this.expenseList = [];
    this.incomeList = [];
    this.selectedFloor = null;
    this.floors = [];
    this.chartLabels = [];
    this.chartRevenueData = [];
    this.chartPaymentData = [];
    this.chartExpenseData = [];
    this.totalPayment = 0;
    this.totalRevenue = 0;
    this.totalExpense = 0;
    this.expensesLoadedHotelId = null;
    this.incomesLoadedHotelId = null;
    this.chartLoadedKey = null;
    this.chartDataLoading = false;
    this.postRoomLoadPrefetchHotelId = null;
    this.historyReloadQueued = false;
    this.historyReloadInFlight = false;
    this.lastHistoryLoadedAt = 0;

    if (!hotelId) {
      this.isRoomsLoading = false;
      return;
    }

    if (this.rooms.length > 0) {
      this.updateFloorsFromRooms();
      this.cdr.detectChanges();
    }

    this.loadPaymentSpeakerSetting(hotelId);

    const storedFloor = this.hotelService.getStoredFloor();
    if (storedFloor) {
      this.selectedFloor = storedFloor;
    }

    this.hotelService.saveRoomContext(hotelId!, this.selectedFloor || '');
    this.restoreCachedSecondaryData(hotelId);

    // Chạy lệnh tải phòng trước; room sessions Redis hydrate sau để không tranh bandwidth
    this.loadRooms();
    this.startRealtimeSync();
    setTimeout(() => {
      if (this.selectedHotelId === hotelId) {
        this.roomSessionService.setHotelId(hotelId);
      }
    }, 0);
  }

  private syncHotelFloorsInBackground(hotelId: string): void {
    this.roomsService.getHotelFloors(hotelId).subscribe(
      (data) => {
        if (this.selectedHotelId !== hotelId) {
          return;
        }

        const apiFloors = (data.floors || []).map((f: any) => String(f));
        const mergedFloors = Array.from(new Set([...(this.floors || []), ...apiFloors])).sort((a, b) => {
          const numA = parseInt(a) || 0;
          const numB = parseInt(b) || 0;
          return numA - numB;
        });

        if (mergedFloors.length > 0) {
          this.floors = mergedFloors;
        }

        if (this.selectedFloor && !this.floors.includes(this.selectedFloor)) {
          this.selectedFloor = null;
          this.hotelService.saveRoomContext(hotelId, '');
        }

        this.cdr.detectChanges();
      },
      () => {}
    );
  }

  private startRealtimeSync(): void {
    this.stopRealtimeSync();
    if (!this.selectedHotelId) return;
    this.startRoomsSocketRealtime();
    this.startRealtimePolling();
  }

  private stopRealtimeSync(): void {
    this.stopRoomsSocketRealtime();
    this.stopRealtimePolling();
    this.realtimeRefreshing = false;
    this.lastRealtimePriceRefreshAt = 0;
    this.realtimeLastSnapshotKey = null;
  }

  private startRealtimePolling(): void {
    if (!this.selectedHotelId) return;
    if (!this.realtimeRoomsTimer) {
      this.realtimeRoomsTimer = setInterval(() => {
        this.refreshRoomsLiteRealtime();
      }, 60000);
    }

    if (!this.realtimePricesTimer) {
      this.realtimePricesTimer = setInterval(() => {
        this.runRealtimeDisplayTick();
      }, 30000);
    }

    this.runRealtimeDisplayTick(true);
  }

  private stopRealtimePolling(): void {
    this.stopRealtimeRoomsPolling();
    if (this.realtimePricesTimer) {
      clearInterval(this.realtimePricesTimer);
      this.realtimePricesTimer = null;
    }
  }

  private stopRealtimeRoomsPolling(): void {
    if (this.realtimeRoomsTimer) {
      clearInterval(this.realtimeRoomsTimer);
      this.realtimeRoomsTimer = null;
    }
  }

  private runRealtimeDisplayTick(forcePriceRefresh: boolean = false): void {
    if (!this.selectedHotelId) return;
    if (this.isRoomsLoading || this.isReloading || this.isModalOpen) return;

    const now = Date.now();
    const shouldRefreshPrices =
      forcePriceRefresh ||
      this.lastRealtimePriceRefreshAt === 0 ||
      now - this.lastRealtimePriceRefreshAt >= 60000;

    if (shouldRefreshPrices) {
      this.lastRealtimePriceRefreshAt = now;
      this.refreshOccupiedRoomPricesRealtime();
    }

    this.scheduleDisplayRebuild();
    this.cdr.markForCheck();
  }

  private startRoomsSocketRealtime(): void {
    if (!this.selectedHotelId) return;
    const hotelId = String(this.selectedHotelId);

    // Đã kết nối đúng hotel → chỉ đảm bảo còn trong room
    if (this.roomsSocket?.connected && this.roomsSocketHotelId === hotelId) {
      this.roomsSocket.emit('join_hotel', hotelId);
      return;
    }

    // Đổi hotel hoặc chưa có socket → reconnect
    if (this.roomsSocket && this.roomsSocketHotelId !== hotelId) {
      this.stopRoomsSocketRealtime();
    }

    if (this.roomsSocket) {
      this.roomsSocket.emit('join_hotel', hotelId);
      this.roomsSocketHotelId = hotelId;
      return;
    }

    const socketUrl = String(environment.apiUrl || '').replace(/\/$/, '');
    if (!socketUrl) return;
    
    this.roomsSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true
    });
    
    this.roomsSocket.on('connect', () => {
      this.roomsSocketConnected = true;
      this.roomsSocketHotelId = this.selectedHotelId;
      this.roomsSocket?.emit('join_hotel', this.selectedHotelId);
      this.stopRealtimeRoomsPolling();
      this.runRealtimeDisplayTick(true);
    });
    
    this.roomsSocket.on('disconnect', () => {
      this.roomsSocketConnected = false;
      this.roomsSocketHotelId = null;
      this.startRealtimePolling();
    });
    
    this.roomsSocket.on('rooms_updated', (payload: any) => {
      const payloadHotelId = String(payload?.hotelId || '').trim();
      if (!payloadHotelId || !this.selectedHotelId) return;
      if (payloadHotelId !== String(this.selectedHotelId)) return;
      
      const roomId = payload?.roomId;
      const reason = String(payload?.reason || '').toLowerCase();
      const statusOnly =
        reason === 'status' ||
        reason === 'guest_out' ||
        reason === 'guest_return' ||
        reason === 'cleaning' ||
        reason === 'transfer';

      if (statusOnly && roomId && payload?.status) {
        // Patch local từ socket payload — không GET /rooms/:id
        this.patchLocalRoomStatusFromSocket(roomId, payload);
        if (payload.relatedRoomId && payload.relatedStatus) {
          this.patchLocalRoomStatusFromSocket(payload.relatedRoomId, {
            status: payload.relatedStatus,
            guestStatus: payload.relatedGuestStatus
          });
        }
      } else if (roomId) {
        this.updateSingleRoomRealtime(roomId);
        if (payload.relatedRoomId) {
          this.updateSingleRoomRealtime(payload.relatedRoomId);
        }
      } else {
        this.refreshRoomsLiteRealtime();
      }

      // Chỉ sync history/doanh thu cho checkin/checkout — transfer đã patch local
      if (reason === 'checkout' || reason === 'checkin' || reason === 'recheckin') {
        this.scheduleAuxiliaryDataReload({
          force: true,
          incomes: true,
          expenses: false,
          chart: true,
          history: true,
          delayMs: 500
        });
      }
    });

    this.roomsSocket.on('transactions_updated', (payload: any) => {
      const payloadHotelId = String(payload?.hotelId || '').trim();
      if (!payloadHotelId || !this.selectedHotelId) return;
      if (payloadHotelId !== String(this.selectedHotelId)) return;

      const type = String(payload?.type || '').toLowerCase();
      this.scheduleAuxiliaryDataReload({
        force: true,
        incomes: type !== 'expense',
        expenses: type !== 'income',
        chart: true,
        history: false,
        delayMs: 300
      });
    });

    this.roomsSocket.on('payment_received', (payload: any) => {
      this.handleRealtimePaymentReceived(payload);
    });
  }

  private stopRoomsSocketRealtime(): void {
    if (this.roomsSocket) {
      try {
        this.roomsSocket.off('connect');
        this.roomsSocket.off('disconnect');
        this.roomsSocket.off('rooms_updated');
        this.roomsSocket.off('transactions_updated');
        this.roomsSocket.off('payment_received');
        this.roomsSocket.disconnect();
      } catch (_e) {}
    }
    this.roomsSocket = null;
    this.roomsSocketConnected = false;
    this.roomsSocketHotelId = null;
  }

  private buildRoomsSnapshotKey(rooms: Room[]): string {
    const parts = rooms
      .map((r) => {
        const id = this.extractId((r as any)?._id);
        const status = (r as any)?.status || '';
        const guestStatus = (r as any)?.guestStatus || '';
        const roomUpdatedAt = (r as any)?.updatedAt ? new Date((r as any).updatedAt).getTime() : 0;
        const currentBookingSignature = this.buildCurrentBookingRealtimeSignature((r as any)?.currentBooking);
        return `${id}:${status}:${guestStatus}:${roomUpdatedAt}:${currentBookingSignature}`;
      })
      .sort();
    return parts.join('|');
  }

  private buildCurrentBookingRealtimeSignature(currentBooking: any): string {
    if (!currentBooking) {
      return '';
    }

    if (typeof currentBooking !== 'object') {
      return this.extractId(currentBooking) || String(currentBooking);
    }

    const bookingId = this.extractId(currentBooking._id) || '';
    const updatedAt = currentBooking.updatedAt ? new Date(currentBooking.updatedAt).getTime() : 0;
    const checkInDate = currentBooking.checkInDate ? new Date(currentBooking.checkInDate).getTime() : 0;
    const checkOutDate = currentBooking.checkOutDate ? new Date(currentBooking.checkOutDate).getTime() : 0;
    const advancePayment = this.normalizeMoneyValue(currentBooking.advancePayment ?? currentBooking.deposit);
    const additionalCharges = this.normalizeMoneyValue(currentBooking.additionalCharges);
    const discount = this.normalizeMoneyValue(currentBooking.discount ?? currentBooking.discounts);
    const totalAmount = this.normalizeMoneyValue(currentBooking.totalAmount);
    const paidAmount = this.normalizeMoneyValue(currentBooking.paidAmount);
    const remainingAmount = this.normalizeMoneyValue(
      currentBooking.remainingAmount ?? currentBooking.paymentDetails?.remainingAmount
    );
    const selectedServices = this.normalizeMoneyValue(currentBooking.selectedServices ?? currentBooking.services);
    const rateType = currentBooking.rateType || currentBooking.bookingType || '';
    const guestName =
      currentBooking.guestInfo?.name ||
      currentBooking.guestDetails?.name ||
      '';

    return [
      bookingId,
      updatedAt,
      checkInDate,
      checkOutDate,
      rateType,
      advancePayment,
      additionalCharges,
      discount,
      totalAmount,
      paidAmount,
      remainingAmount,
      selectedServices,
      guestName
    ].join(':');
  }

  private loadPaymentSpeakerSetting(hotelId: string): void {
    if (!hotelId) {
      this.paymentSpeakerEnabled = false;
      return;
    }

    this.hotelService.getHotelById(hotelId, { lite: true }).subscribe({
      next: (hotel) => {
        this.paymentSpeakerEnabled = !!hotel?.settings?.notificationSettings?.enablePaymentSpeaker;
        this.paymentSpeakerService.setEnabled(hotelId, this.paymentSpeakerEnabled);
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.paymentSpeakerEnabled = false;
        this.paymentSpeakerService.setEnabled(hotelId, false);
        console.error('Error loading payment speaker setting:', error);
      }
    });
  }

  private handleRealtimePaymentReceived(payload: any): void {
    const hotelId = String(payload?.hotelId || '').trim();
    if (!hotelId || !this.selectedHotelId || hotelId !== String(this.selectedHotelId)) {
      return;
    }

    const amount = Number(payload?.amount || 0);
    const eventKey = String(
      payload?.paymentHistoryId ||
      payload?.transactionId ||
      payload?.id ||
      `${hotelId}_${amount}_${payload?.roomId || ''}`
    );

    if (eventKey && this.lastPaymentToastEventKey === eventKey) {
      return;
    }
    this.lastPaymentToastEventKey = eventKey;

    const amountLabel = amount > 0 ? amount.toLocaleString('vi-VN') + ' VND' : '';
    const roomLabel = payload?.roomNumber ? ` · Phòng ${payload.roomNumber}` : '';
    this.message.success(
      amountLabel
        ? `Thanh toán SePay thành công: ${amountLabel}${roomLabel}`
        : `Thanh toán SePay thành công${roomLabel}`
    );

    if (this.paymentSpeakerEnabled) {
      this.paymentSpeakerService.setEnabled(this.selectedHotelId, true);
    }
    this.paymentSpeakerService.tryPlayForPayment(payload, this.selectedHotelId);

    // Báo modal chuyển khoản (room-content-modal) đóng khi thanh toán xong
    try {
      window.dispatchEvent(new CustomEvent('sepayPaymentReceived', { detail: payload }));
    } catch (_e) {}

    // SePay thành công → tự cập nhật phiếu thu + biểu đồ + lịch sử (không cần reload tay)
    this.scheduleAuxiliaryDataReload({
      force: true,
      incomes: true,
      expenses: false,
      chart: true,
      history: true,
      delayMs: 400
    });
  }

  private refreshRoomsLiteRealtime(): void {
    if (!this.selectedHotelId) return;
    if (this.isRoomsLoading || this.isReloading || this.isModalOpen) return;
    if (this.realtimeRefreshing) return;
    
    this.realtimeRefreshing = true;
    const params: any = { hotelId: this.selectedHotelId, lite: true };
    this.roomsService.getRooms(params).subscribe({
      next: (data) => {
        const incomingRooms: Room[] = (data || []).map((room: any) => ({
          ...room,
          guestStatus: room.guestStatus || undefined
        }));
        
        const existingById = new Map<string, Room>();
        (this.rooms || []).forEach((r) => {
          const id = this.extractId((r as any)?._id);
          if (id) existingById.set(id, r);
        });
        
        const mergedBase: Room[] = incomingRooms.map((r) => {
          const id = this.extractId((r as any)?._id);
          const existing = id ? existingById.get(id) : undefined;
          const nextRoom: any = { ...(existing || {}), ...(r as any) };
          
          if (existing?.events && (!nextRoom.events || nextRoom.events.length === 0)) {
            nextRoom.events = existing.events;
          }
          if (existing?.currentBooking && !nextRoom.currentBooking) {
            nextRoom.currentBooking = existing.currentBooking;
          }
          
          return nextRoom as Room;
        });
        const merged = this.hydrateSyntheticEventsFromCurrentBooking(mergedBase);
        
        const snapshotKey = this.buildRoomsSnapshotKey(merged);
        if (this.realtimeLastSnapshotKey !== snapshotKey) {
          this.realtimeLastSnapshotKey = snapshotKey;
          this.rooms = merged;
          this.lastLoadedHotelId = this.selectedHotelId;
          this.updateFloorsFromRooms();
          // Realtime lite đã có currentBooking → synthetic events đủ cho board; không N+1 /events
          this.seedLocalPricesForOccupiedRooms();
          this.cdr.detectChanges();
        }
        
        this.realtimeRefreshing = false;
      },
      error: (error) => {
        console.error('Error realtime reloading rooms:', error);
        this.realtimeRefreshing = false;
      }
    });
  }

  private refreshOccupiedRoomPricesRealtime(): void {
    if (!this.selectedHotelId) return;
    if (this.isRoomsLoading || this.isReloading || this.isModalOpen) return;
    
    const occupiedRooms = (this.rooms || []).filter((r) => r && r.status === 'occupied');
    if (occupiedRooms.length === 0) return;
    
    occupiedRooms.forEach((room) => {
      const events = (room as any)?.events;
      if (!events || !Array.isArray(events) || events.length === 0) return;
      const checkinEvent = events.find((e: any) => e && e.type === 'checkin');
      if (!checkinEvent) return;
      if (!this.getEventCheckinTime(checkinEvent)) return;
      this.loadRoomPriceFromAPI(room, checkinEvent, true);
    });
  }

  onFloorChange(floor: string | null): void {
    this.selectedFloor = floor;
    this.rebuildDisplayRooms();
    if (this.selectedHotelId) {
      this.hotelService.saveRoomContext(this.selectedHotelId, floor || '');
    }
  }

  // Xử lý thay đổi khoảng thời gian biểu đồ
  onPeriodChange(period: 'day' | 'week' | 'month'): void {
    this.selectedPeriod = period;
    // revenue-chart tự load theo period — giữ sync state cha
  }
  
  // Cập nhật tổng doanh thu từ table component
  updateRevenueFromTable(): void {
    if (this.tableComponent && this.tableComponent.totalPayment !== undefined) {
      // Lấy totalPayment từ table component (tổng tiền phòng đã thanh toán trong lịch sử)
      // Đây chính là tổng doanh thu từ các phòng đã checkout và thanh toán
      this.totalRevenue = this.tableComponent.totalPayment || 0;
    }
  }
  
  // Load dữ liệu biểu đồ từ API
  loadChartDataFromAPI(force: boolean = false, prefetch: boolean = false): void {
    if (!this.selectedHotelId) return;

    const hotelId = this.selectedHotelId;
    const chartKey = `${hotelId}:${this.selectedPeriod}`;

    if (!force) {
      if (this.chartDataLoading) {
        return;
      }
      const cachedRevenue = this.hotelService.getCachedHotelRevenueByPeriod(hotelId, this.selectedPeriod);
      if (cachedRevenue) {
        this.applyRevenuePayload(cachedRevenue.payload, chartKey);
        return;
      }
      if (this.chartLoadedKey === chartKey && this.chartLabels.length > 0) {
        return;
      }
    }

    this.chartDataLoading = true;
    this.hotelService.getHotelRevenueByPeriod(hotelId, this.selectedPeriod).subscribe(
      (data) => {
        this.hotelService.setCachedHotelRevenueByPeriod(hotelId, this.selectedPeriod, data);
        this.applyRevenuePayload(data, chartKey);
        this.chartDataLoading = false;
      },
      (error) => {
        console.error('Error loading chart data:', error);
        this.chartDataLoading = false;
      }
    );
  }

  private applyRoomHistoryPayload(data: {
    history: BookingHistory[],
    totalPages: number,
    currentPage: number,
    totalPayment: number,
    totalItems: number
  }, updatedAt?: number): void {
    this.roomTableData = data.history || [];
    this.totalPayment = data.totalPayment || 0;
    this.totalRoomCount = data.totalItems || 0;
    this.lastHistoryLoadedAt = updatedAt || Date.now();
    Promise.resolve().then(() => this.updateRevenueFromTable());
  }

  private applyExpensePayload(data: { data: any[] }): void {
    this.expenseList = data.data || [];
    this.totalExpense = this.expenseList.reduce((sum, expense) => sum + (expense.amount || 0), 0);
    this.expensesLoadedHotelId = this.selectedHotelId;
  }

  private applyIncomePayload(data: { data: any[] }): void {
    this.incomeList = data.data || [];
    this.incomesLoadedHotelId = this.selectedHotelId;
  }

  private applyRevenuePayload(data: {
    labels: string[];
    revenueData: number[];
    paymentData: number[];
    expenseData?: number[];
    totalRevenue: number;
    totalPayment: number;
    totalExpense?: number;
  }, chartKey: string): void {
    this.chartLabels = data.labels;
    this.chartRevenueData = data.revenueData;
    this.chartPaymentData = data.paymentData;
    this.chartExpenseData = data.expenseData || [];
    this.chartLoadedKey = chartKey;
    const canUseTableRevenue =
      this.isHistoryPanelActive &&
      !!this.tableComponent &&
      Array.isArray(this.roomTableData) &&
      this.roomTableData.length > 0;
    if (!canUseTableRevenue) {
      this.totalRevenue = data.totalRevenue || 0;
    }
    this.totalPayment = data.totalPayment;
    this.totalExpense = data.totalExpense || 0;

    if (canUseTableRevenue) {
      setTimeout(() => {
        this.updateRevenueFromTable();
      }, 100);
    }
  }

  private restoreCachedSecondaryData(hotelId: string): void {
    const cachedRoomHistory = this.roomsService.getCachedRoomHistory(hotelId, 'all', 1, 100);
    if (cachedRoomHistory) {
      this.applyRoomHistoryPayload(cachedRoomHistory.payload, cachedRoomHistory.updatedAt);
    }

    const cachedRevenue = this.hotelService.getCachedHotelRevenueByPeriod(hotelId, this.selectedPeriod);
    if (cachedRevenue) {
      this.applyRevenuePayload(cachedRevenue.payload, `${hotelId}:${this.selectedPeriod}`);
    }

    const cachedIncomes = this.transactionService.getCachedIncomes({
      hotelId,
      page: 1,
      limit: 1000
    });
    if (cachedIncomes) {
      this.applyIncomePayload(cachedIncomes.payload);
    }

    const cachedExpenses = this.transactionService.getCachedExpenses({
      hotelId,
      page: 1,
      limit: 1000
    });
    if (cachedExpenses) {
      this.applyExpensePayload(cachedExpenses.payload);
    }
  }

  viewInvoice(item: BookingHistory): void {
    if (!item || !item.roomId) {
      this.message.warning('Không thể hiển thị hóa đơn: Thiếu thông tin phòng.');
      return;
    }
    const roomForInvoice = this.rooms.find(r => r._id === item.roomId);
    const normalizePaymentMethod = (method: any): string => {
      const m = String(method || '').toLowerCase().trim();
      if (m === 'bank_transfer' || m === 'banking' || m === 'transfer') return 'transfer';
      if (m === 'card' || m === 'credit_card' || m === 'visa' || m === 'mastercard') return 'card';
      return 'cash';
    };

    const selectedHotel = this.selectedHotelId
      ? this.hotels.find(h => h._id === this.selectedHotelId)
      : null;
    const invoiceData = {
        invoiceNumber: item._id || new Date().getTime().toString(),
        date: item.date || new Date(),
        customerName: item.customerName || 'Khách lẻ',
        staffName: item.staffName || 'Nhân viên',
        roomNumber: item.roomNumber || roomForInvoice?.roomNumber,
        checkInTime: item.checkInTime || new Date(new Date(item.date).getTime() - 3600000),
        checkOutTime: item.event === 'check-out' ? item.date : new Date(),
        products: [
            { name: `Tiền phòng ${item.roomNumber || roomForInvoice?.roomNumber}`, price: item.totalAmount || item.amount || 0, quantity: 1, totalPrice: item.totalAmount || item.amount || 0 }
        ],
        totalAmount: item.totalAmount || item.amount || 0,
        paymentMethod: normalizePaymentMethod(item.paymentMethod || 'cash'),
        hotelId: this.selectedHotelId ?? undefined,
        businessName: selectedHotel?.name || 'Khách sạn',
        hotelInfo: selectedHotel || undefined,
        business_address: selectedHotel
          ? (typeof (selectedHotel as any).address === 'string'
            ? (selectedHotel as any).address
            : [(selectedHotel as any).address?.street, (selectedHotel as any).address?.city].filter(Boolean).join(', '))
          : '',
        phoneNumber: (selectedHotel as any)?.contactInfo?.phone || (selectedHotel as any)?.phone || ''
    };
    this.invoiceService.showInvoiceModal(invoiceData);
  }

  getRoomStatusClass(status: RoomStatus | undefined, guestStatus?: string): string {
    if (!status) return 'inactive-room';
    
    // Nếu phòng occupied và khách ra ngoài, dùng class đặc biệt
    if (status === 'occupied' && guestStatus === 'out') {
      return 'occupied-guest-out-room';
    }
    
    const option = this.roomStatusDisplayOptions.find(opt => opt.value === status);
    return option ? `${option.value}-room` : 'inactive-room';
  }

  getRoomStatusLabelAndColor(status: RoomStatus | undefined): { label: string, color: string } {
    if (!status) return { label: this.translate.instant('COMMON.NO_DATA'), color: 'default' };
    const option = this.roomStatusDisplayOptions.find(opt => opt.value === status);
    // Sử dụng translate cho label
    if (option) {
      const translatedLabel = this.translate.instant(`ROOM.${option.value.toUpperCase()}`);
      return { label: translatedLabel, color: option.color };
    }
    return { label: status, color: 'default' };
  }

  // Lấy label và màu cho nguồn khách
  getGuestSourceLabelAndColor(guestSource: string | undefined): { label: string, color: string } {
    if (!guestSource) return { label: 'Walk-in', color: 'default' };
    
    const sourceMap: { [key: string]: { label: string, color: string } } = {
      'walkin': { label: 'Walk-in', color: 'blue' },
      'booking': { label: 'Booking', color: 'green' },
      'agoda': { label: 'Agoda', color: 'orange' },
      'traveloka': { label: 'Traveloka', color: 'purple' },
      'expedia': { label: 'Expedia', color: 'cyan' },
      'trip': { label: 'Trip.com', color: 'magenta' },
      'g2j': { label: 'G2J', color: 'gold' },
      'other': { label: 'Khác', color: 'default' }
    };
    
    return sourceMap[guestSource] || { label: guestSource, color: 'default' };
  }

  private normalizeGuestSource(source: any, booking?: any): string {
    let normalized = String(source || '').toLowerCase().trim();
    if ((!normalized || normalized === 'ota') && booking && booking.otaSource) {
      normalized = String(booking.otaSource).toLowerCase().trim();
    }
    if (
      normalized === 'walkin' ||
      normalized === 'walk-in' ||
      normalized === 'walk_in' ||
      normalized === 'direct' ||
      normalized === 'phone' ||
      normalized === 'regular' ||
      normalized === 'guest' ||
      normalized === 'khach le' ||
      normalized === 'khách lẻ'
    ) {
      return 'walkin';
    }
    if (normalized.includes('booking')) {
      return 'booking';
    }
    if (normalized.includes('agoda')) {
      return 'agoda';
    }
    if (normalized.includes('traveloka')) {
      return 'traveloka';
    }
    if (normalized.includes('expedia')) {
      return 'expedia';
    }
    if (normalized.includes('trip')) {
      return 'trip';
    }
    if (normalized.includes('g2j')) {
      return 'g2j';
    }
    if (!normalized) {
      return 'walkin';
    }
    return 'other';
  }

  getHotelName(hotelId: string | undefined): string {
    if (!hotelId) return '';
    const hotel = this.hotels.find(h => h._id === hotelId);
    return hotel ? hotel.name : '';
  }
  
  // Format số cho input number
  formatNumber = (value: number): string => {
    if (value == null) return '';
    return new Intl.NumberFormat('vi-VN', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    }).format(value);
  }

  hGutter = 16;
  vGutter = 16;
  count = 4;
  marksHGutter: NzMarks = { 8: '8', 16: '16', 24: '24', 32: '32', 40: '40', 48: '48' };
  marksVGutter: NzMarks = { 8: '8', 16: '16', 24: '24', 32: '32', 40: '40', 48: '48' };
  marksCount: NzMarks = { 2: '2', 3: '3', 4: '4', 6: '6', 8: '8', 12: '12' };

  reGenerateArray(count: number): void {
    this.count = count;
    this.sessionContext.setRoomColumnsCount(count);
  }

  getRoomColSpan(): number {
    if (this.isCompactMode) {
      // Với số cột lớn (6, 8, 12), giữ nguyên hoặc tăng nhẹ để phòng rộng hơn
      if (this.count >= 12) {
        // 12 cột: giữ nguyên để phòng rộng hơn
        return 24 / 12; // = 2
      }
      if (this.count >= 8) {
        // 8 cột: tăng nhẹ lên 9 cột thay vì 12 để phòng rộng hơn
        return Math.floor(24 / 9); // ≈ 2.67 → 2
      }
      if (this.count >= 6) {
        // 6 cột: tăng nhẹ lên 7 cột thay vì 9 để phòng rộng hơn
        return Math.floor(24 / 7); // ≈ 3.4 → 3
      }
      // Với số cột nhỏ hơn (2, 3, 4), tăng 1.5 lần như cũ
      const compactCount = Math.floor(this.count * 1.5);
      return Math.max(1, Math.floor(24 / compactCount));
    }
    return 24 / this.count;
  }

  // Responsive methods for different breakpoints
  getRoomColSpanXs(): number {
    // Mobile (<576px): luôn full width
    return 24;
  }

  getRoomColSpanSm(): number {
    // Tablet (≥576px): giảm số cột để phòng không bị chật
    if (this.isCompactMode) {
      // Compact mode: với số cột lớn, giữ rộng hơn
      if (this.count <= 3) return 8;   // 2-3 cột → 3 phòng/row
      if (this.count <= 4) return 6;  // 4 cột → 4 phòng/row
      if (this.count === 6) return 4; // 6 cột → 6 phòng/row (giữ nguyên)
      if (this.count === 8) return 3; // 8 cột → 8 phòng/row (giữ nguyên)
      if (this.count === 12) return 2; // 12 cột → 12 phòng/row (giữ nguyên)
      return 4; // default
    }
    // Normal mode: giảm số cột trên tablet để dễ nhìn hơn
    if (this.count <= 2) return 12; // 2 cột → 2 phòng/row
    if (this.count <= 3) return 8;  // 3 cột → 3 phòng/row
    if (this.count <= 4) return 6; // 4 cột → 4 phòng/row
    if (this.count <= 6) return 4; // 6 cột → 6 phòng/row
    if (this.count <= 8) return 3; // 8 cột → 8 phòng/row
    return 2; // 12 cột → 12 phòng/row
  }

  getRoomColSpanMd(): number {
    // Tablet landscape (≥768px): bắt đầu hiển thị đúng số cột nhưng vẫn điều chỉnh cho số cột lớn
    if (this.count <= 4) {
      return this.getRoomColSpan();
    }
    // Với số cột lớn (6, 8, 12), giảm một chút để không quá chật
    if (this.count === 6) return 4; // 6 cột → 6 phòng/row
    if (this.count === 8) return 3; // 8 cột → 8 phòng/row
    if (this.count === 12) return 2; // 12 cột → 12 phòng/row
    return this.getRoomColSpan();
  }

  getRoomColSpanLg(): number {
    // Desktop (≥992px): hiển thị đúng số cột
    return this.getRoomColSpan();
  }

  getRoomColSpanXl(): number {
    // Large desktop (≥1200px): hiển thị đúng số cột
    return this.getRoomColSpan();
  }

  // Điều chỉnh gutter (khoảng cách) dựa trên số cột để phòng không bị chật
  getRoomGutter(): [number, number] {
    // Khi số cột lớn, giảm gutter để tiết kiệm không gian
    if (this.count >= 12) {
      return [8, 8]; // Gutter nhỏ nhất cho 12 cột
    }
    if (this.count >= 8) {
      return [10, 10]; // Gutter nhỏ cho 8 cột
    }
    if (this.count >= 6) {
      return [12, 12]; // Gutter vừa cho 6 cột
    }
    // Gutter mặc định cho số cột nhỏ hơn
    return [this.hGutter, this.vGutter];
  }

  switchValue = false;

  onSelectRoom(room: Room): void {
    this.selectedRoomId = room._id;
  }

  onRoomClick(room: Room, event: MouseEvent): void {
    if (!room || !room._id) {
      return;
    }
    
    // Tránh mở nhiều modal cùng lúc hoặc khi đang reload
    if (this.isModalOpen || this.isReloading) {
      return;
    }
    
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation(); // Ngăn các handler khác
    
    // Xác định loại modal dựa trên trạng thái
    let modalType = 'info';
    switch (room.status) {
      case 'vacant':
        modalType = 'checkin';
        break;
      case 'occupied':
        modalType = 'checkout';
        break;
      case 'dirty':
      case 'cleaning':
      case 'maintenance':
        modalType = 'cleaning';
        break;
      default:
        modalType = 'info';
    }
    
    try {
      this.isModalOpen = true;
      
      // Mở modal trực tiếp
      const modalRef = this.modalService.create({
        nzTitle: `Phòng ${room.roomNumber}`,
        nzContent: RoomContentModalComponent,
        nzFooter: null,
        nzMaskClosable: false,
        nzClassName: 'room-detail-modal',
        nzWidth: 700,
        nzData: {
          roomData: room,
          modalType: modalType
        }
      });
      
      modalRef.afterClose.subscribe((result) => {
        this.isModalOpen = false;

        // Checkout đã apply local dirty — không GET /rooms/:id nặng
        if (modalType === 'checkout' && result?.action === 'checkout' && result?.checkoutInfo) {
          this.applyCheckoutCloseResult(result.checkoutInfo);

          setTimeout(() => {
            if (!this.isModalOpen) {
              this.showRoomHistory(true);
            }
          }, 200);
          return;
        }

        if (modalType === 'checkin' && result?.success && result?.checkinInfo) {
          this.applyCheckinCloseResult(room._id || '', result.checkinInfo);
        }

        setTimeout(() => {
          if (!this.isModalOpen) {
            const isStatusLite = modalType === 'cleaning';
            this.roomsService.notifyRoomDataUpdated({
              hotelId: this.selectedHotelId || undefined,
              roomId: room._id!,
              reason: modalType === 'checkin' ? 'checkin' : modalType === 'checkout' ? 'checkout' : 'generic',
              refreshRooms: modalType === 'checkin',
              refreshHistory: !isStatusLite && (modalType === 'checkout' || modalType === 'checkin'),
              force: false
            });
          }
        }, 300);
      });
    } catch (error) {
      console.error('Error creating modal:', error);
      this.isModalOpen = false;
      this.message.error(this.translate.instant('COMMON.ERROR_OCCURRED'));
    }
  }

  private applyCheckoutCloseResult(checkoutInfo: any): void {
    const roomId = checkoutInfo?.roomId;
    if (!roomId) return;

    const roomIndex = this.rooms.findIndex(r => r && r._id === roomId);
    if (roomIndex !== -1) {
      const existing = this.rooms[roomIndex] as any;
      this.rooms[roomIndex] = {
        ...existing,
        status: 'dirty',
        guestStatus: undefined,
        currentBooking: null
      };
      this.updateFloorsFromRooms();
    }

    const checkOutTime = checkoutInfo.checkOutTime ? new Date(checkoutInfo.checkOutTime) : new Date();
    const checkInTime = checkoutInfo.checkInTime ? new Date(checkoutInfo.checkInTime) : undefined;

    const syntheticHistory: any = {
      event: 'check-out',
      date: checkOutTime,
      checkInTime: checkInTime,
      checkOutTime: checkOutTime,
      roomId: roomId,
      roomNumber: checkoutInfo.roomNumber,
      customerName: checkoutInfo.customerName,
      guestSource: checkoutInfo.guestSource,
      paymentMethod: checkoutInfo.paymentMethod,
      paymentStatus: checkoutInfo.paymentStatus,
      rateType: checkoutInfo.rateType,
      amount: Number(checkoutInfo.roomTotal) || 0,
      roomTotal: Number(checkoutInfo.roomTotal) || 0,
      servicesTotal: Number(checkoutInfo.servicesTotal) || 0,
      additionalCharges: Number(checkoutInfo.additionalCharges) || 0,
      discount: Number(checkoutInfo.discount) || 0,
      advancePayment: Number(checkoutInfo.advancePayment) || 0,
      advancePaymentMethod: checkoutInfo.advancePaymentMethod,
      totalAmount: Number(checkoutInfo.totalAmount) || 0,
      notes: checkoutInfo.notes || ''
    };

    const exists = (this.roomTableData || []).some((h: any) => {
      if (!h) return false;
      if (h.event !== 'check-out' && h.event !== 'checkout') return false;
      if (h.roomId !== roomId) return false;
      const t = h.checkOutTime || h.checkoutTime || h.date;
      if (!t) return false;
      const dt = new Date(t);
      return Math.abs(dt.getTime() - checkOutTime.getTime()) < 3000;
    });

    if (!exists) {
      this.roomTableData = [syntheticHistory, ...(this.roomTableData || [])];
      setTimeout(() => this.updateRevenueFromTable(), 0);
    }
  }

  private applyCheckinCloseResult(roomId: string, checkinInfo: any): void {
    if (!roomId) return;
    const roomIndex = this.rooms.findIndex(r => r && r._id === roomId);
    if (roomIndex === -1) return;

    const existing = this.rooms[roomIndex] as any;
    const checkinTime = checkinInfo?.checkinTime || checkinInfo?.checkInTime || null;
    this.rooms[roomIndex] = {
      ...existing,
      status: 'occupied',
      events: [
        {
          type: 'checkin',
          roomId: roomId,
          checkinTime: checkinTime,
          checkInTime: checkinTime,
          guestInfo: checkinInfo?.guestInfo,
          rateType: checkinInfo?.rateType || 'hourly',
          advancePayment: Number(checkinInfo?.advancePayment) || 0,
          additionalCharges: Number(checkinInfo?.additionalCharges) || 0,
          discount: Number(checkinInfo?.discount) || 0,
          paymentMethod: checkinInfo?.paymentMethod,
          notes: checkinInfo?.notes,
          selectedServices: checkinInfo?.selectedServices || []
        }
      ]
    };
    this.updateFloorsFromRooms();
  }

  // Tính tổng tiền đặt trước từ tất cả các phòng đang có khách
  getTotalAdvancePayment(): number {
    let total = 0;
    this.rooms.forEach(room => {
      if (room.status === 'occupied') {
        const checkinInfo = this.getRoomCheckinInfo(room);
        if (checkinInfo && checkinInfo.advancePayment > 0) {
          total += checkinInfo.advancePayment;
        }
      }
    });
    return total;
  }

  // Đếm số lượng phòng trống
  getVacantRoomCount(): number {
    return this.rooms.filter(room => room.status === 'vacant').length;
  }

  // Đếm số lượng phòng đang ở
  getOccupiedRoomCount(): number {
    return this.rooms.filter(room => room.status === 'occupied').length;
  }

  // Đếm số lượng phòng đang bẩn
  getDirtyRoomCount(): number {
    return this.rooms.filter(room => room.status === 'dirty').length;
  }

  // Đếm số lượng phòng sửa chữa
  getMaintenanceRoomCount(): number {
    return this.rooms.filter(room => room.status === 'maintenance').length;
  }

  // Đếm số lượng phòng đã đặt
  getBookedRoomCount(): number {
    return this.rooms.filter(room => room.status === 'booked').length;
  }

  // Đếm số lượng phòng có khách ra ngoài
  getGuestOutRoomCount(): number {
    return this.rooms.filter(room => room.status === 'occupied' && room.guestStatus === 'out').length;
  }

  // Lấy icon phòng theo trạng thái
  getRoomIcon(room: Room): string {
    // Nếu phòng đang occupied và khách ra ngoài
    if (room.status === 'occupied' && room.guestStatus === 'out') {
      return 'logout';
    }
    
    // Icon theo trạng thái phòng
    switch (room.status) {
      case 'vacant':
        return 'home';
      case 'occupied':
        return 'user';
      case 'dirty':
        return 'clear';
      case 'maintenance':
        return 'setting';
      case 'booked':
        return 'calendar';
      case 'cleaning':
        return 'clear';
      default:
        return 'home';
    }
  }

  // Nhóm phòng theo tầng (có filter theo selectedFloor nếu có)
  getRoomsByFloor(): { [floor: string]: Room[] } {
    const grouped: { [floor: string]: Room[] } = {};
    
    // Normalize selectedFloor thành string để so sánh
    const normalizedSelectedFloor = this.selectedFloor ? String(this.selectedFloor) : null;
    
    // Filter rooms theo selectedFloor nếu có
    const filteredRooms = normalizedSelectedFloor 
      ? this.rooms.filter(room => {
          // Normalize room.floor thành string để so sánh
          const roomFloor = room.floor ? String(room.floor) : '0';
          return roomFloor === normalizedSelectedFloor;
        })
      : this.rooms;
    
    filteredRooms.forEach(room => {
      // Normalize floor thành string
      const floor = room.floor ? String(room.floor) : '0';
      if (!grouped[floor]) {
        grouped[floor] = [];
      }
      grouped[floor].push(room);
    });
    
    // Sắp xếp các tầng
    const sortedFloors = Object.keys(grouped).sort((a, b) => {
      const numA = parseInt(a) || 0;
      const numB = parseInt(b) || 0;
      return numA - numB;
    });
    const sortedGrouped: { [floor: string]: Room[] } = {};
    sortedFloors.forEach(floor => {
      sortedGrouped[floor] = grouped[floor];
    });
    return sortedGrouped;
  }

  // Lấy danh sách tầng đã sắp xếp (có filter theo selectedFloor nếu có)
  // TrackBy functions để tối ưu performance
  trackByHotelId(index: number, hotel: Hotel): string {
    return hotel._id || index.toString();
  }

  trackByFloor(index: number, floor: string): string {
    return floor || index.toString();
  }

  trackByRoomId(index: number, room: Room): string {
    return room._id ? room._id.toString() : index.toString();
  }

  // Filter function cho hotel select
  filterHotelOption = (input: string, option: any): boolean => {
    return option.nzLabel.toLowerCase().indexOf(input.toLowerCase()) >= 0;
  };

  getSortedFloors(): string[] {
    // Nếu đã chọn tầng, chỉ trả về tầng đó
    if (this.selectedFloor) {
      // Normalize selectedFloor thành string
      const normalizedSelectedFloor = String(this.selectedFloor);
      // Kiểm tra xem tầng đã chọn có phòng không
      const hasRooms = this.rooms.some(room => {
        const roomFloor = room.floor ? String(room.floor) : '0';
        return roomFloor === normalizedSelectedFloor;
      });
      return hasRooms ? [normalizedSelectedFloor] : [];
    }
    
    // Nếu chưa chọn tầng, trả về tất cả tầng có phòng
    const floors = new Set<string>();
    this.rooms.forEach(room => {
      // Normalize floor thành string
      const floor = room.floor ? String(room.floor) : '0';
      floors.add(floor);
    });
    return Array.from(floors).sort((a, b) => {
      const numA = parseInt(a) || 0;
      const numB = parseInt(b) || 0;
      return numA - numB;
    });
  }

  // Lấy tên hiển thị cho tầng
  getFloorDisplayName(floor: string): string {
    // Import TranslateService nếu chưa có
    // Sử dụng translate pipe trong template thay vì method này
    if (floor === '0' || floor === '') {
      return 'Trệt'; // Sẽ được translate trong template
    }
    return `Tầng ${floor}`; // Sẽ được translate trong template
  }

  // Cập nhật cached room counts cho template performance
  private updateCachedRoomCounts(): void {
    this.recomputeRoomDerivedState();
  }

  // Cập nhật danh sách tầng từ phòng thực tế
  updateFloorsFromRooms(): void {
    this.recomputeRoomDerivedState();
    if (this.selectedHotelId) {
      this.roomsService.setCachedRooms(this.selectedHotelId, this.rooms);
    }
  }

  private rebuildDisplayRooms(): void {
    this.recomputeRoomDerivedState();
  }

  private scheduleDisplayRebuild(): void {
    if (this.displayRebuildQueued) {
      return;
    }

    this.displayRebuildQueued = true;
    requestAnimationFrame(() => {
      this.displayRebuildQueued = false;
      this.rebuildDisplayRooms();
      this.cdr.detectChanges();
    });
  }

  private scheduleOccupiedEventsReload(forceReload: boolean = false): void {
    if (this.occupiedEventsReloadQueued) {
      return;
    }

    this.occupiedEventsReloadQueued = true;
    Promise.resolve().then(() => {
      this.occupiedEventsReloadQueued = false;
      this.loadEventsForOccupiedRooms(forceReload);
    });
  }

  private recomputeRoomDerivedState(): void {
    const floorSet = new Set<string>();
    const roomNumberMap = new Map<string, string>();
    let vacantCount = 0;
    let occupiedCount = 0;
    let dirtyCount = 0;
    let maintenanceCount = 0;
    let bookedCount = 0;
    let guestOutCount = 0;

    for (const room of this.rooms) {
      const floor = room.floor ? String(room.floor) : '0';
      floorSet.add(floor);

      if (room._id) {
        roomNumberMap.set(String(room._id), room.roomNumber || '');
      }

      switch (room.status) {
        case 'vacant':
          vacantCount += 1;
          break;
        case 'occupied':
          occupiedCount += 1;
          if (room.guestStatus === 'out') {
            guestOutCount += 1;
          }
          break;
        case 'dirty':
          dirtyCount += 1;
          break;
        case 'maintenance':
          maintenanceCount += 1;
          break;
        case 'booked':
          bookedCount += 1;
          break;
      }
    }

    this.roomNumberByIdMap = roomNumberMap;
    this.cachedVacantCount = vacantCount;
    this.cachedOccupiedCount = occupiedCount;
    this.cachedDirtyCount = dirtyCount;
    this.cachedMaintenanceCount = maintenanceCount;
    this.cachedBookedCount = bookedCount;
    this.cachedGuestOutCount = guestOutCount;
    this.floors = Array.from(floorSet).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));

    if (this.isFirstLoadForHotel && this.floors.length > 0) {
      this.activeFloors = [...this.floors];
      this.isFirstLoadForHotel = false;
    }

    if (this.selectedFloor && !this.floors.includes(this.selectedFloor)) {
      this.selectedFloor = null;
    }

    const normalizedSelectedFloor = this.selectedFloor ? String(this.selectedFloor) : null;
    const grouped: { [floor: string]: RoomWithMeta[] } = {};

    for (const room of this.rooms) {
      const floor = room.floor ? String(room.floor) : '0';
      if (normalizedSelectedFloor && floor !== normalizedSelectedFloor) {
        continue;
      }

      const roomWithMeta = room as RoomWithMeta;
      roomWithMeta.__viewMeta = this.buildRoomCardMeta(room);

      if (!grouped[floor]) {
        grouped[floor] = [];
      }
      grouped[floor].push(roomWithMeta);
    }

    const displayFloors = Object.keys(grouped).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
    const sortedGrouped: { [floor: string]: RoomWithMeta[] } = {};
    displayFloors.forEach((floor) => {
      sortedGrouped[floor] = grouped[floor];
    });

    this.displayRoomsByFloor = sortedGrouped;
    this.displayFloors = displayFloors;
  }

  private buildRoomCardMeta(room: Room): RoomCardMeta {
    const displayStatus = this.getRoomDisplayStatus(room);
    const isPrebookedAvailable = displayStatus === 'vacant' && room.status !== 'occupied';
    const statusMeta = this.getRoomStatusLabelAndColor(displayStatus);
    const guestSource = room.status === 'occupied' ? this.getRoomGuestSource(room) : '';
    const guestSourceMeta = guestSource ? this.getGuestSourceLabelAndColor(guestSource) : { label: '', color: 'default' };
    const displayInfo = room.status === 'occupied' ? this.getRoomDisplayInfo(room) : null;
    const bookingInfo = room.status !== 'occupied' ? this.getRoomBookingInfo(room) : null;
    const transferInfo = this.getBookingTransferInfo(room);
    const transferredFromRoomNumber =
      (displayInfo?.transferredFrom && (this.getRoomNumberById(displayInfo.transferredFrom) || displayInfo.transferredFrom)) || '';

    return {
      displayStatus,
      isPrebookedAvailable,
      statusClass: this.getRoomStatusClass(displayStatus, room.guestStatus),
      statusLabel: statusMeta.label,
      statusColor: statusMeta.color,
      icon: this.getRoomIcon(room),
      durationText: room.status === 'occupied' ? this.getRoomDurationText(room) : '',
      guestSource,
      guestSourceLabel: guestSourceMeta.label,
      guestSourceColor: guestSourceMeta.color,
      displayInfo,
      bookingInfo,
      transferInfo,
      transferredFromRoomNumber,
      ariaStatusLabel: room.status === 'occupied' ? this.translate.instant('ROOM.OCCUPIED') : statusMeta.label,
    };
  }

  // Lấy thông tin chuyển phòng từ Booking
  getBookingTransferInfo(room: Room): {
    fromRoomId?: string;
    fromRoomNumber?: string;
    toRoomId?: string;
    toRoomNumber?: string;
    transferredAt?: Date;
    transferredBy?: string;
    transferHistory?: any[];
  } | null {
    if (!room.currentBooking) return null;
    
    // Nếu currentBooking là Booking đầy đủ
    const booking = room.currentBooking as any;
    
    // Kiểm tra từ transferHistory trước (nếu có nhiều lần chuyển)
    if (booking.transferHistory && Array.isArray(booking.transferHistory) && booking.transferHistory.length > 0) {
      const firstTransfer = booking.transferHistory[0];
      const lastTransfer = booking.transferHistory[booking.transferHistory.length - 1];
      
      return {
        fromRoomId: firstTransfer.fromRoomId?.toString() || booking.transferredFrom?.toString(),
        fromRoomNumber: firstTransfer.fromRoomNumber || this.getRoomNumberById(firstTransfer.fromRoomId?.toString() || booking.transferredFrom?.toString() || '') || 'N/A',
        toRoomId: lastTransfer.toRoomId?.toString() || booking.transferredTo?.toString() || room._id?.toString(),
        toRoomNumber: lastTransfer.toRoomNumber || this.getRoomNumberById(lastTransfer.toRoomId?.toString() || booking.transferredTo?.toString() || '') || room.roomNumber || 'N/A',
        transferredAt: lastTransfer.transferredAt ? new Date(lastTransfer.transferredAt) : (booking.transferredAt ? new Date(booking.transferredAt) : undefined),
        transferredBy: lastTransfer.transferredBy || booking.transferredBy,
        transferHistory: booking.transferHistory
      };
    }
    
    // Nếu không có transferHistory, lấy từ transferredFrom/transferredTo
    if (booking.transferredFrom || booking.transferredTo) {
      return {
        fromRoomId: booking.transferredFrom?.toString(),
        fromRoomNumber: this.getRoomNumberById(booking.transferredFrom?.toString() || '') || 'N/A',
        toRoomId: booking.transferredTo?.toString() || room._id?.toString(),
        toRoomNumber: this.getRoomNumberById(booking.transferredTo?.toString() || '') || room.roomNumber || 'N/A',
        transferredAt: booking.transferredAt ? new Date(booking.transferredAt) : undefined,
        transferredBy: booking.transferredBy,
        transferHistory: booking.transferHistory || []
      };
    }
    
    return null;
  }

  // Lấy thông tin booking của phòng
  getRoomBookingInfo(room: Room): {
    guestName: string;
    checkInDate: string;
    checkOutDate: string;
    rateTypeLabel: string;
  } | null {
    if (room.status !== 'booked' && !this.isPrebookedAvailable(room)) {
      return null;
    }
    
    // Lấy từ currentBooking nếu có (ưu tiên)
    if (room.currentBooking) {
      const checkInDate = room.currentBooking.checkInDate 
        ? new Date(room.currentBooking.checkInDate)
        : null;
      const checkOutDate = room.currentBooking.checkOutDate 
        ? new Date(room.currentBooking.checkOutDate)
        : null;
      
      // Lấy rateType từ bookingType hoặc rateType (tương thích cả hai)
      const currentBooking = room.currentBooking as any;
      const rateType = currentBooking?.rateType || currentBooking?.bookingType || 'hourly';
      
      // Sử dụng translation thay vì hardcode
      const rateTypeLabels: {[key: string]: string} = {
        'hourly': this.translate.instant('ROOM.RATE_TYPE_HOURLY') || 'Theo giờ',
        'daily': this.translate.instant('ROOM.RATE_TYPE_DAILY') || 'Ngày đêm',
        'nightly': this.translate.instant('ROOM.RATE_TYPE_NIGHTLY') || 'Qua đêm',
        'weekly': this.translate.instant('ROOM.RATE_TYPE_WEEKLY') || 'Theo tuần',
        'monthly': this.translate.instant('ROOM.RATE_TYPE_MONTHLY') || 'Theo tháng'
      };
      const rateTypeLabel = rateTypeLabels[rateType] || this.translate.instant('ROOM.RATE_TYPE_HOURLY') || 'Theo giờ';
      
      const checkInDateStr = checkInDate 
        ? `${checkInDate.getHours().toString().padStart(2, '0')}:${checkInDate.getMinutes().toString().padStart(2, '0')} ${checkInDate.getDate().toString().padStart(2, '0')}/${(checkInDate.getMonth() + 1).toString().padStart(2, '0')}/${checkInDate.getFullYear()}`
        : '';
      
      const checkOutDateStr = checkOutDate 
        ? `${checkOutDate.getHours().toString().padStart(2, '0')}:${checkOutDate.getMinutes().toString().padStart(2, '0')} ${checkOutDate.getDate().toString().padStart(2, '0')}/${(checkOutDate.getMonth() + 1).toString().padStart(2, '0')}/${checkOutDate.getFullYear()}`
        : '';
      
      // Lấy guestName từ guestInfo hoặc guestDetails (tương thích cả hai)
      const guestName = currentBooking?.guestInfo?.name 
        || currentBooking?.guestDetails?.name 
        || 'Khách đặt trước';
      
      return {
        guestName: guestName,
        checkInDate: checkInDateStr,
        checkOutDate: checkOutDateStr,
        rateTypeLabel: rateTypeLabel
      };
    }
    
    // Lấy từ events (đã được load từ RoomEvent collection qua loadEventsForOccupiedRooms)
    // CHỈ SỬ DỤNG events từ RoomEvent collection, không sử dụng room.events trong rooms.js
    if (room.events && room.events.length > 0) {
      const bookingEvent = room.events.find(e => e.type === 'booking');
      if (bookingEvent) {
        const checkInDate = this.getEventCheckinTime(bookingEvent);
        const expectedCheckoutTime = bookingEvent.expectedCheckoutTime ? new Date(bookingEvent.expectedCheckoutTime) : null;
        
        // Sử dụng translation thay vì hardcode
        const rateTypeLabels: {[key: string]: string} = {
          'hourly': this.translate.instant('ROOM.RATE_TYPE_HOURLY') || 'Theo giờ',
          'daily': this.translate.instant('ROOM.RATE_TYPE_DAILY') || 'Ngày đêm',
          'nightly': this.translate.instant('ROOM.RATE_TYPE_NIGHTLY') || 'Qua đêm',
          'weekly': this.translate.instant('ROOM.RATE_TYPE_WEEKLY') || 'Theo tuần',
          'monthly': this.translate.instant('ROOM.RATE_TYPE_MONTHLY') || 'Theo tháng'
        };
        const rateTypeLabel = rateTypeLabels[bookingEvent.rateType || 'hourly'] || this.translate.instant('ROOM.RATE_TYPE_HOURLY') || 'Theo giờ';
        
        const checkInDateStr = checkInDate 
          ? `${checkInDate.getHours().toString().padStart(2, '0')}:${checkInDate.getMinutes().toString().padStart(2, '0')} ${checkInDate.getDate().toString().padStart(2, '0')}/${(checkInDate.getMonth() + 1).toString().padStart(2, '0')}/${checkInDate.getFullYear()}`
          : '';
        
        const checkOutDateStr = expectedCheckoutTime 
          ? `${expectedCheckoutTime.getHours().toString().padStart(2, '0')}:${expectedCheckoutTime.getMinutes().toString().padStart(2, '0')} ${expectedCheckoutTime.getDate().toString().padStart(2, '0')}/${(expectedCheckoutTime.getMonth() + 1).toString().padStart(2, '0')}/${expectedCheckoutTime.getFullYear()}`
          : '';
        
        return {
          guestName: bookingEvent.guestInfo?.name || 'Khách đặt trước',
          checkInDate: checkInDateStr,
          checkOutDate: checkOutDateStr,
          rateTypeLabel: rateTypeLabel
        };
      }
    }
    
    return null;
  }

  private getRoomBookingCheckInTime(room: Room): Date | null {
    if (room.currentBooking?.checkInDate) {
      const d = new Date(room.currentBooking.checkInDate);
      return isNaN(d.getTime()) ? null : d;
    }

    if (room.events && room.events.length > 0) {
      const bookingEvent = room.events.find(e => e.type === 'booking');
      if (bookingEvent) {
        return this.getEventCheckinTime(bookingEvent);
      }
    }

    return null;
  }

  isPrebookedAvailable(room: Room): boolean {
    if (!room || room.status === 'occupied') return false;
    const checkinTime = this.getRoomBookingCheckInTime(room);
    if (!checkinTime) return false;
    return checkinTime.getTime() > Date.now();
  }

  getRoomDisplayStatus(room: Room): RoomStatus {
    if (this.isPrebookedAvailable(room)) return 'vacant';
    return room.status || 'vacant';
  }

  // Lấy thông tin chi tiết của phòng để hiển thị (giống hình)
  getRoomDisplayInfo(room: Room): {
    checkinTime: string;
    customerName: string;
    rateTypeLabel: string;
    totalAmount: number;
    advancePayment: number;
    remainingAmount: number;
    guestSource: string;
    additionalCharges: number;
    discount: number;
    transferredFrom?: string;
    transferredAt?: Date;
  } | null {
    if (room.status !== 'occupied') {
      return null;
    }
    if (!this.hasRenderableOccupiedData(room)) {
      return null;
    }
    const checkinInfo = this.getRoomCheckinInfo(room);
    if (!checkinInfo) {
      return null;
    }
    
    const checkinTimeStr = checkinInfo.checkinTime 
      ? `${checkinInfo.checkinTime.getHours().toString().padStart(2, '0')}:${checkinInfo.checkinTime.getMinutes().toString().padStart(2, '0')} ${checkinInfo.checkinTime.getDate().toString().padStart(2, '0')}/${(checkinInfo.checkinTime.getMonth() + 1).toString().padStart(2, '0')}/${checkinInfo.checkinTime.getFullYear()}`
      : '';

    return {
      checkinTime: checkinTimeStr,
      customerName: checkinInfo.guestName,
      rateTypeLabel: checkinInfo.rateTypeLabel,
      totalAmount: checkinInfo.totalAmount,
      advancePayment: checkinInfo.advancePayment,
      remainingAmount: checkinInfo.remainingAmount,
      guestSource: checkinInfo.guestSource || 'walkin',
      additionalCharges: checkinInfo.additionalCharges || 0,
      discount: checkinInfo.discount || 0,
      transferredFrom: checkinInfo.transferredFrom,
      transferredAt: checkinInfo.transferredAt
    };
  }

  private getEventCheckinTime(event: any): Date | null {
    if (!event) return null;
    const rawTime = event.checkinTime || event.checkInTime || event.checkInDate || event.checkinDate;
    if (!rawTime) return null;
    const parsed = new Date(rawTime);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  }

  private seedLocalPricesForOccupiedRooms(): void {
    const occupiedRooms = this.rooms.filter(r => r && r._id && r.status === 'occupied');
    if (occupiedRooms.length === 0) return;

    occupiedRooms.forEach(room => {
      const events = (room as any).events;
      if (!events || !Array.isArray(events) || events.length === 0) return;
      const checkinEvent = events.find((e: any) => e && e.type === 'checkin');
      if (!checkinEvent) return;
      const checkinTime = this.getEventCheckinTime(checkinEvent);
      if (!checkinTime) return;

      const rawRateType = (checkinEvent.rateType || 'hourly') as string;
      const cacheKey = `${room._id}_${checkinTime.getTime()}_${rawRateType}`;
      if (this.roomPriceCache.has(cacheKey)) return;

      const bookingTotal = Number((room as any)?.currentBooking?.totalAmount) || 0;
      const localPrice = bookingTotal > 0
        ? bookingTotal
        : this.calculateRoomPriceLocal(room, checkinTime, rawRateType);
      this.roomPriceCache.set(cacheKey, localPrice);
      this.roomPriceMap.set(cacheKey, localPrice);
    });
    this.scheduleDisplayRebuild();
  }

  /** @deprecated Dùng seedLocalPricesForOccupiedRooms — giữ alias tránh break call cũ */
  private prefetchRoomPricesForOccupiedRooms(): void {
    this.seedLocalPricesForOccupiedRooms();
  }

  private normalizeMoneyValue(value: any): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (Array.isArray(value)) {
      return value.reduce((sum, item) => {
        if (!item) return sum;
        const amountCandidate =
          (item.amount !== undefined ? item.amount : undefined) ??
          (item.totalPrice !== undefined ? item.totalPrice : undefined) ??
          (item.price !== undefined && item.quantity !== undefined ? (Number(item.price) || 0) * (Number(item.quantity) || 0) : undefined);
        return sum + (Number(amountCandidate) || 0);
      }, 0);
    }
    if (typeof value === 'object') {
      if (value.amount !== undefined) return Number(value.amount) || 0;
      if (value.totalPrice !== undefined) return Number(value.totalPrice) || 0;
      return 0;
    }
    return 0;
  }

  private hasMoneyValue(value: any): boolean {
    return value !== null && value !== undefined && value !== '';
  }

  private getCurrentBookingObject(room: Room): any | null {
    if (!room?.currentBooking || typeof room.currentBooking !== 'object') {
      return null;
    }
    return room.currentBooking as any;
  }

  private hydrateSyntheticEventsFromCurrentBooking(rooms: Room[]): Room[] {
    return rooms.map((room: any) => {
      if (!room || !room._id) return room;
      if (room.events && Array.isArray(room.events) && room.events.length > 0) return room;

      const currentBooking = room.currentBooking && typeof room.currentBooking === 'object'
        ? room.currentBooking
        : null;
      if (!currentBooking) return room;

      if (room.status === 'occupied') {
        const checkinTime =
          currentBooking.checkinTime ||
          currentBooking.checkInTime ||
          currentBooking.actualCheckInDate ||
          currentBooking.checkInDate ||
          null;
        const selectedServices = currentBooking.selectedServices || currentBooking.services || [];
        const additionalCharges = this.normalizeMoneyValue(currentBooking.additionalCharges);
        const discount = this.normalizeMoneyValue(currentBooking.discount ?? currentBooking.discounts);

        return {
          ...room,
          events: [
            {
              type: 'checkin',
              __synthetic: true,
              roomId: room._id,
              checkinTime: checkinTime,
              checkInTime: checkinTime,
              guestInfo: currentBooking.guestInfo,
              rateType: currentBooking.rateType || 'hourly',
              advancePayment: currentBooking.advancePayment || 0,
              advancePaymentMethod: currentBooking.advancePaymentMethod,
              additionalCharges: additionalCharges,
              discount: discount,
              selectedServices: selectedServices,
              paymentMethod: currentBooking.paymentMethod,
              notes: currentBooking.notes,
              transferredFrom: currentBooking.transferredFrom,
              transferredTo: currentBooking.transferredTo,
              transferredAt: currentBooking.transferredAt
            }
          ]
        };
      }

      if (room.status === 'booked') {
        const checkinTime = currentBooking.checkInDate || currentBooking.checkinDate || null;
        const expectedCheckoutTime = currentBooking.checkOutDate || currentBooking.checkoutDate || null;
        return {
          ...room,
          events: [
            {
              type: 'booking',
              __synthetic: true,
              roomId: room._id,
              checkinTime: checkinTime,
              expectedCheckoutTime: expectedCheckoutTime,
              guestInfo: currentBooking.guestInfo,
              rateType: currentBooking.rateType || currentBooking.bookingType || 'hourly',
              advancePayment: currentBooking.advancePayment || 0,
              advancePaymentMethod: currentBooking.advancePaymentMethod,
              notes: currentBooking.notes
            }
          ]
        };
      }

      return room;
    });
  }

  // Load events cho các phòng đang occupied và booked
  // Board dùng synthetic từ currentBooking; chỉ fetch RoomEvent khi thiếu data hoặc forceReload (modal tự load riêng)
  loadEventsForOccupiedRooms(forceReload: boolean = false): void {
    const occupiedRooms = this.rooms.filter(room => {
      if (!room._id) return false;
      if (room.status !== 'occupied' && room.status !== 'booked') return false;
      if (forceReload) return true;
      if (!room.events || room.events.length === 0) return true;
      // Synthetic đủ cho card sơ đồ → bỏ GET /rooms/:id/events (N+1)
      const hasSyntheticOnly = (room.events as any[]).every((e: any) => e && e.__synthetic === true);
      if (hasSyntheticOnly) {
        const checkinOrBooking = (room.events as any[]).find(
          (e: any) => e && (e.type === 'checkin' || e.type === 'booking')
        );
        return !this.getEventCheckinTime(checkinOrBooking);
      }
      return false;
    });
    
    if (occupiedRooms.length === 0) return;
    
    // Fetch events cho tất cả phòng occupied cùng lúc
    // Sử dụng excludeCheckedOut = true để chỉ lấy checkin events chưa checkout (từ RoomEvent collection)
    const eventRequests = occupiedRooms.map(room => {
      const eventType = room.status === 'occupied' ? 'checkin' : 'booking';
      return this.roomsService.getRoomEvents(room._id!, { 
        limit: 10, 
        type: eventType,
        excludeCheckedOut: room.status === 'occupied' // Chỉ excludeCheckedOut cho phòng occupied
      })
        .pipe(
          // Map kết quả với roomId để biết events thuộc phòng nào
          map(events => ({ roomId: room._id, events }))
        );
    });
    
    // Chạy tất cả requests song song
    forkJoin(eventRequests).subscribe({
      next: (results) => {
        results.forEach(({ roomId, events }) => {
          const roomIndex = this.rooms.findIndex(r => r._id === roomId);
          if (roomIndex !== -1) {
            // QUAN TRỌNG: Đảm bảo chỉ lấy events của phòng hiện tại (roomId)
            // Lọc bỏ events không thuộc về phòng này (tránh lấy nhầm events từ phòng khác khi chuyển phòng)
            const filteredEvents = events.filter(event => {
              // Kiểm tra roomId của event (nếu có)
              if (event.roomId) {
                const eventRoomId = typeof event.roomId === 'object' 
                  ? (event.roomId as any)?._id?.toString() || (event.roomId as any)?.toString()
                  : event.roomId.toString();
                const currentRoomId = roomId?.toString();
                if (eventRoomId !== currentRoomId) {
                  console.warn(`Filtered out event from different room:`, {
                    eventId: event._id,
                    eventType: event.type,
                    eventRoomId: eventRoomId,
                    currentRoomId: currentRoomId,
                    roomNumber: this.rooms[roomIndex].roomNumber
                  });
                  return false; // Bỏ qua events không thuộc phòng này
                }
              }
              return true; // Giữ lại events thuộc phòng này hoặc không có roomId (backward compatibility)
            });
            
            // Đảm bảo events có đầy đủ thông tin, bao gồm transferredFrom, transferredAt, additionalCharges, discount
            this.rooms[roomIndex].events = filteredEvents.map(event => {
              // Đảm bảo additionalCharges và discount được giữ nguyên từ RoomEvent
              const mappedEvent = {
                ...event,
                // Đảm bảo transferredFrom được convert đúng sang string (có thể là ObjectId)
                transferredFrom: event.transferredFrom 
                  ? (typeof event.transferredFrom === 'object' 
                    ? (event.transferredFrom as any)?._id?.toString() || (event.transferredFrom as any)?.toString()
                    : event.transferredFrom.toString())
                  : undefined,
                transferredAt: event.transferredAt ? new Date(event.transferredAt) : undefined,
                transferredBy: event.transferredBy
                  ? (typeof event.transferredBy === 'object'
                    ? (event.transferredBy as any)?._id?.toString() || (event.transferredBy as any)?.toString()
                    : event.transferredBy.toString())
                  : undefined,
                // Đảm bảo additionalCharges và discount được giữ nguyên từ RoomEvent
                additionalCharges: event.additionalCharges !== undefined && event.additionalCharges !== null
                  ? (typeof event.additionalCharges === 'number' ? event.additionalCharges : Number(event.additionalCharges) || 0)
                  : 0,
                discount: event.discount !== undefined && event.discount !== null
                  ? (typeof event.discount === 'number' ? event.discount : Number(event.discount) || 0)
                  : 0,
                advancePayment: event.advancePayment !== undefined && event.advancePayment !== null
                  ? (typeof event.advancePayment === 'number' ? event.advancePayment : Number(event.advancePayment) || 0)
                  : 0,
                advancePaymentMethod: (event as any).advancePaymentMethod || undefined
              };
              
              return mappedEvent;
            });
            
            // Load roomPrice từ backend API cho phòng occupied (có checkin event)
            if (this.rooms[roomIndex].status === 'occupied' && filteredEvents.length > 0) {
              const checkinEvent = filteredEvents.find(e => e.type === 'checkin');
              if (checkinEvent && this.getEventCheckinTime(checkinEvent)) {
                this.loadRoomPriceFromAPI(this.rooms[roomIndex], checkinEvent);
              }
            }
          }
        });
        this.scheduleDisplayRebuild();
      },
      error: (error) => {
        console.error('Error loading events for occupied rooms:', error);
      }
    });
  }
  
  // Load roomPrice từ backend API (đồng bộ với room-content-modal)
  private loadRoomPriceFromAPI(room: Room, checkinEvent: any, forceReload: boolean = false): void {
    const checkinTime = this.getEventCheckinTime(checkinEvent);
    if (!room._id || !checkinTime) return;
    const checkoutTime = new Date(); // Thời gian hiện tại
    const rawRateType = (checkinEvent.rateType || 'hourly') as 'hourly' | 'daily' | 'nightly' | 'weekly' | 'monthly';
    
    // Tạo cache key dựa trên roomId, checkinTime và rateType
    const cacheKey = `${room._id}_${checkinTime.getTime()}_${rawRateType}`;
    
    // Kiểm tra cache trước
    if (!forceReload && this.roomPriceCache.has(cacheKey)) {
      console.log(`[loadRoomPriceFromAPI] Using cached price for room ${room.roomNumber}:`, this.roomPriceCache.get(cacheKey));
      return;
    }
    
    // Kiểm tra xem đang load chưa (tránh duplicate requests)
    const loadingKey = `loading_${cacheKey}`;
    if (this.roomPriceCache.has(loadingKey)) {
      console.log(`[loadRoomPriceFromAPI] Already loading price for room ${room.roomNumber}`);
      return;
    }
    
    // Nếu là weekly/monthly/nightly: dùng luôn tính local để đồng bộ cách hiển thị (nightly có rule qua đêm + gia hạn theo ngày)
    if (rawRateType === 'weekly' || rawRateType === 'monthly' || rawRateType === 'nightly') {
      const fallbackPrice = this.calculateRoomPriceLocal(room, checkinTime, rawRateType);
      this.roomPriceCache.set(cacheKey, fallbackPrice);
      this.roomPriceMap.set(cacheKey, fallbackPrice);
      this.scheduleDisplayRebuild();
      return;
    }

    // Đánh dấu đang load
    this.roomPriceCache.set(loadingKey, 0);
    
    // Gọi API để tính giá phòng (chỉ hỗ trợ hourly/daily/nightly)
    const rateType = rawRateType as 'hourly' | 'daily' | 'nightly';
    this.roomsService.calculateRoomPrice(room._id, checkinTime, checkoutTime, rateType).subscribe({
      next: (priceResponse) => {
        const roomPrice = priceResponse.totalPrice || 0;
        // Lưu vào cache
        this.roomPriceCache.set(cacheKey, roomPrice);
        // Lưu vào roomPriceMap để UI có thể access
        this.roomPriceMap.set(cacheKey, roomPrice);
        // Xóa flag loading
        this.roomPriceCache.delete(loadingKey);
        
        // Trigger change detection để cập nhật UI
        this.scheduleDisplayRebuild();
      },
      error: (error) => {
        console.error(`[loadRoomPriceFromAPI] Error loading price for room ${room.roomNumber}:`, error);
        // Xóa flag loading
        this.roomPriceCache.delete(loadingKey);
        // Cache giá trị fallback local để tránh gọi lại API nhiều lần khi không có priceConfig
        const fallbackPrice = this.calculateRoomPriceLocal(room, checkinTime, rawRateType);
        this.roomPriceCache.set(cacheKey, fallbackPrice);
        this.roomPriceMap.set(cacheKey, fallbackPrice);
        this.scheduleDisplayRebuild();
      }
    });
  }
  
  // Lấy roomPrice từ cache hoặc tính local (fallback)
  private getRoomPrice(room: Room, checkinTime: Date | null, rateType: string): number {
    if (!room._id || !checkinTime) return 0;
    return this.calculateRoomPriceLocal(room, checkinTime, rateType);
  }
  
  // Tính roomPrice realtime theo cùng logic với room-content-modal
  private calculateRoomPriceLocal(room: Room, checkinTime: Date, rateType: string): number {
    const now = new Date();
    if (checkinTime.getTime() >= now.getTime()) {
      return 0;
    }

    const durationInMilliseconds = now.getTime() - checkinTime.getTime();
    const durationInMinutes = Math.floor(durationInMilliseconds / (1000 * 60));
    const durationInHours = Math.max(0, Math.floor(durationInMinutes / 60));
    const remainingMinutes = durationInMinutes % 60;
    const durationInDays = Math.max(1, Math.ceil(durationInHours / 24));

    const priceConfig: any = (room as any)?.priceConfig || null;
    const hourlyRate = room.pricing?.hourly || room.firstHourRate || priceConfig?.hourlyRates?.firstHourPrice || 0;
    const dailyRate = room.pricing?.daily || priceConfig?.dailyRates?.standardPrice || 0;
    const nightlyRate = room.pricing?.nightly || priceConfig?.nightlyRates?.standardPrice || 0;
    const weeklyRate = room.pricing?.weekly || priceConfig?.weeklyRates?.standardPrice || 0;
    const monthlyRate = room.pricing?.monthly || priceConfig?.monthlyRates?.standardPrice || 0;
    const additionalHourRate = room.additionalHourRate || priceConfig?.hourlyRates?.additionalHourPrice || (hourlyRate * 0.8);

    const gracePeriodMinutes = priceConfig?.hourlyRates?.gracePeriodMinutes ||
      (room as any)?.priceSettings?.gracePeriodMinutes ||
      15;
    const autoDailyHours = priceConfig?.nightlyRates?.autoDailyHours || 24;
    const nightlyStartTime = priceConfig?.nightlyRates?.startTime ||
      (room as any)?.priceSettings?.nightlyStartTime || '20:00';
    const nightlyEndTime = priceConfig?.nightlyRates?.endTime ||
      (room as any)?.priceSettings?.nightlyEndTime || '12:00';
    const dailyStartTime = '12:00';
    const dailyCheckOutTime = priceConfig?.dailyRates?.checkOutTime ||
      (room as any)?.priceSettings?.dailyEndTime || '12:00';
    const nightlyEarlyCheckinSurcharge = priceConfig?.nightlyRates?.earlyCheckinSurcharge ||
      (room as any)?.priceSettings?.nightlyEarlyCheckinSurcharge || 0;
    const nightlyLateCheckoutSurcharge = priceConfig?.nightlyRates?.lateCheckoutSurcharge ||
      (room as any)?.priceSettings?.nightlyLateCheckoutSurcharge || 0;
    const dailyEarlyCheckinSurcharge = priceConfig?.dailyRates?.earlyCheckinSurcharge ||
      (room as any)?.priceSettings?.dailyEarlyCheckinSurcharge || 0;
    const dailyLateCheckoutFee = priceConfig?.dailyRates?.latecheckOutFee ||
      (room as any)?.priceSettings?.dailyLateCheckoutFee || 0;
    const dailyWeekendSurchargePercent = Number(priceConfig?.dailyRates?.weekendSurcharge ?? 0) || 0;
    const dailyHolidaySurchargePercent = Number(priceConfig?.dailyRates?.holidaySurcharge ?? 0) || 0;
    const nightlyWeekendSurchargePercent = Number(priceConfig?.nightlyRates?.weekendSurcharge ?? 0) || 0;
    const nightlyHolidaySurchargePercent = Number(priceConfig?.nightlyRates?.holidaySurcharge ?? 0) || 0;

    const holidayKey = `phhotel:holidayDates:${String((room as any)?.hotelId || this.selectedHotelId || this.authService.getHotelId() || 'default')}`;
    const holidaySet = (() => {
      const fallback = ['01-01', '04-30', '05-01', '09-02'];
      try {
        if (typeof window === 'undefined') return new Set(fallback);
        const raw = localStorage.getItem(holidayKey) || '';
        const values = raw
          .split(/[\n,;]+/g)
          .map((value) => String(value || '').trim())
          .filter(Boolean);
        return new Set([...fallback, ...values]);
      } catch {
        return new Set(fallback);
      }
    })();

    const parseTime = (timeStr: string) => {
      const parts = timeStr.split(':');
      return {
        hour: parseInt(parts[0], 10) || 0,
        minute: parseInt(parts[1], 10) || 0
      };
    };

    const calculateEarlyHours = (actualTime: Date, standardTime: string): number => {
      const actual = parseTime(`${actualTime.getHours()}:${actualTime.getMinutes()}`);
      const standard = parseTime(standardTime);
      const actualMinutes = actual.hour * 60 + actual.minute;
      const standardMinutes = standard.hour * 60 + standard.minute;
      if (actualMinutes < standardMinutes) {
        return Math.ceil((standardMinutes - actualMinutes) / 60);
      }
      return 0;
    };

    const toYmd = (date: Date): string => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const toMmdd = (date: Date): string => {
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${m}-${d}`;
    };

    const isWeekend = (date: Date): boolean => {
      const dow = date.getDay();
      return dow === 0 || dow === 6;
    };

    const isHoliday = (date: Date): boolean => {
      const ymd = toYmd(date);
      const mmdd = toMmdd(date);
      return holidaySet.has(ymd) || holidaySet.has(mmdd);
    };

    let total = 0;

    switch (rateType) {
      case 'hourly': {
        const firstHourPrice = room.firstHourRate || priceConfig?.hourlyRates?.firstHourPrice || hourlyRate;
        const extraHourPrice = room.additionalHourRate || priceConfig?.hourlyRates?.additionalHourPrice || additionalHourRate;
        total = firstHourPrice;

        if (durationInHours >= 1) {
          let billableHours = durationInHours - 1;
          if (durationInHours >= 2 && remainingMinutes > gracePeriodMinutes) {
            billableHours += 1;
          } else if (durationInHours === 1 && remainingMinutes > gracePeriodMinutes) {
            billableHours = 1;
          }

          if (billableHours > 0) {
            total += billableHours * extraHourPrice;
          }
        }
        break;
      }
      case 'daily': {
        const checkInDateOnly = new Date(checkinTime);
        checkInDateOnly.setHours(0, 0, 0, 0);
        const checkOutDateOnly = new Date(now);
        checkOutDateOnly.setHours(0, 0, 0, 0);
        const actualDays = Math.max(1, Math.ceil((checkOutDateOnly.getTime() - checkInDateOnly.getTime()) / (1000 * 60 * 60 * 24)));

        total = actualDays * dailyRate;

        let holidaySurchargeAmount = 0;
        let weekendSurchargeAmount = 0;
        for (let i = 0; i < actualDays; i++) {
          const dayDate = new Date(checkInDateOnly);
          dayDate.setDate(dayDate.getDate() + i);
          if (isHoliday(dayDate) && dailyHolidaySurchargePercent > 0) {
            holidaySurchargeAmount += (dailyRate * dailyHolidaySurchargePercent) / 100;
          } else if (isWeekend(dayDate) && dailyWeekendSurchargePercent > 0) {
            weekendSurchargeAmount += (dailyRate * dailyWeekendSurchargePercent) / 100;
          }
        }
        total += Math.round(holidaySurchargeAmount) + Math.round(weekendSurchargeAmount);

        const checkInMinutes = checkinTime.getHours() * 60 + checkinTime.getMinutes();
        const [startHour, startMinute] = dailyStartTime.split(':').map(Number);
        const startTimeMinutes = startHour * 60 + startMinute;
        const isInDailyTime = checkInMinutes >= startTimeMinutes;
        if (!isInDailyTime && dailyEarlyCheckinSurcharge > 0) {
          total += calculateEarlyHours(checkinTime, dailyStartTime) * dailyEarlyCheckinSurcharge;
        }

        const checkoutMinutes = now.getHours() * 60 + now.getMinutes();
        const [checkOutHour, checkOutMinute] = dailyCheckOutTime.split(':').map(Number);
        const checkOutTimeMinutes = checkOutHour * 60 + checkOutMinute;
        const isNextDay = checkOutDateOnly.getTime() > checkInDateOnly.getTime();
        if (isNextDay && checkoutMinutes > checkOutTimeMinutes && dailyLateCheckoutFee > 0) {
          total += Math.ceil((checkoutMinutes - checkOutTimeMinutes) / 60) * dailyLateCheckoutFee;
        }
        break;
      }
      case 'nightly': {
        const [endHourForNightly, endMinuteForNightly] = nightlyEndTime.split(':').map(Number);
        const nightlyEndDateTime = new Date(checkinTime);
        nightlyEndDateTime.setHours(endHourForNightly || 0, endMinuteForNightly || 0, 0, 0);
        if (nightlyEndDateTime.getTime() <= checkinTime.getTime()) {
          nightlyEndDateTime.setDate(nightlyEndDateTime.getDate() + 1);
        }

        const shouldSplitNightlyToDaily =
          durationInHours > autoDailyHours &&
          dailyRate > 0 &&
          nightlyRate > 0;

        if (shouldSplitNightlyToDaily) {
          const dayMs = 1000 * 60 * 60 * 24;
          const nightlyNights = 1;
          let dailyDays = 0;

          if (now.getTime() > nightlyEndDateTime.getTime()) {
            const startDateOnly = new Date(nightlyEndDateTime);
            startDateOnly.setHours(0, 0, 0, 0);
            const endDateOnly = new Date(now);
            endDateOnly.setHours(0, 0, 0, 0);
            dailyDays = Math.max(0, Math.ceil((endDateOnly.getTime() - startDateOnly.getTime()) / dayMs));
          }

          total = nightlyNights * nightlyRate + dailyDays * dailyRate;

          const checkInMinutesForNight = checkinTime.getHours() * 60 + checkinTime.getMinutes();
          const endTimeMinutesForNight = (endHourForNightly || 0) * 60 + (endMinuteForNightly || 0);
          const nightlyStartDateForSurcharge = new Date(checkinTime);
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
            const date = new Date(nightlyEndDateTime);
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() + i);
            if (isHoliday(date) && dailyHolidaySurchargePercent > 0) {
              holidaySurchargeAmount += (dailyRate * dailyHolidaySurchargePercent) / 100;
            } else if (isWeekend(date) && dailyWeekendSurchargePercent > 0) {
              weekendSurchargeAmount += (dailyRate * dailyWeekendSurchargePercent) / 100;
            }
          }

          total += Math.round(holidaySurchargeAmount) + Math.round(weekendSurchargeAmount);
        } else {
          total = Math.max(0, nightlyRate);

          const checkInMinutesForNight = checkinTime.getHours() * 60 + checkinTime.getMinutes();
          const endTimeMinutesForNight = (endHourForNightly || 0) * 60 + (endMinuteForNightly || 0);
          const nightlyStartDateForSurcharge = new Date(checkinTime);
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
          total += Math.round(holidaySurchargeAmount) + Math.round(weekendSurchargeAmount);
        }

        const checkInMinutes = checkinTime.getHours() * 60 + checkinTime.getMinutes();
        const [startHour, startMinute] = nightlyStartTime.split(':').map(Number);
        const startTimeMinutes = startHour * 60 + startMinute;
        const [endHour, endMinute] = nightlyEndTime.split(':').map(Number);
        const endTimeMinutes = endHour * 60 + endMinute;
        const isInNightlyTime = checkInMinutes >= startTimeMinutes || checkInMinutes <= endTimeMinutes;
        if (!isInNightlyTime && nightlyEarlyCheckinSurcharge > 0) {
          total += calculateEarlyHours(checkinTime, nightlyStartTime) * nightlyEarlyCheckinSurcharge;
        }

        const checkoutMinutes = now.getHours() * 60 + now.getMinutes();
        const nowDateOnly = new Date(now);
        nowDateOnly.setHours(0, 0, 0, 0);
        const checkinDateOnly = new Date(checkinTime);
        checkinDateOnly.setHours(0, 0, 0, 0);
        const isNextDay = nowDateOnly.getTime() > checkinDateOnly.getTime();

        if (shouldSplitNightlyToDaily) {
          const [dailyCoHour, dailyCoMinute] = dailyCheckOutTime.split(':').map(Number);
          const dailyCheckOutMinutes = (dailyCoHour || 0) * 60 + (dailyCoMinute || 0);
          if (checkoutMinutes > dailyCheckOutMinutes && dailyLateCheckoutFee > 0) {
            total += Math.ceil((checkoutMinutes - dailyCheckOutMinutes) / 60) * dailyLateCheckoutFee;
          }
        } else if (isNextDay && checkoutMinutes > endTimeMinutes && nightlyLateCheckoutSurcharge > 0) {
          total += Math.ceil((checkoutMinutes - endTimeMinutes) / 60) * nightlyLateCheckoutSurcharge;
        }
        break;
      }
      case 'weekly': {
        const weeks = Math.max(1, Math.ceil(durationInDays / 7));
        total = weeklyRate > 0 ? weeks * weeklyRate : Math.max(1, weeks * 7) * dailyRate;
        break;
      }
      case 'monthly': {
        const months = Math.max(1, Math.ceil(durationInDays / 30));
        total = monthlyRate > 0 ? months * monthlyRate : Math.max(1, months * 30) * dailyRate;
        break;
      }
      default:
        total = hourlyRate * Math.max(1, durationInHours);
    }

    return Math.max(0, Math.round(total));
  }

  // Lấy thông tin checkin của phòng đang có khách
  getRoomCheckinInfo(room: Room): { 
    guestName: string; 
    checkinTime: Date | null; 
    roomPrice: number; 
    serviceAmount: number;
    totalAmount: number;
    additionalCharges: number;
    advancePayment: number;
    discount: number;
    remainingAmount: number;
    rateType: string;
    rateTypeLabel: string;
    guestSource: string;
    transferredFrom?: string;
    transferredAt?: Date;
  } | null {
    if (room.status !== 'occupied') {
      return null;
    }
    
    if (!room.events || room.events.length === 0) {
      const roomId = room._id?.toString() || '';
      const session = roomId ? this.roomSessionService.getSession(roomId) : null;
      if (!session || !session.checkinTime) {
        return null;
      }

      const checkinTime = new Date(session.checkinTime);
      const rateType = session.rateType || (session as any).bookingType || 'hourly';
      const rateTypeLabel = this.getRateTypeLabel(rateType);
      const roomPrice = this.getRoomPrice(room, checkinTime, rateType);

      const advancePayment = Number(session.advancePayment || 0) || 0;
      const additionalCharges = this.normalizeMoneyValue(session.additionalCharges);
      const discount = this.normalizeMoneyValue(session.discount);

      const guestName = (session.guestInfo?.name && session.guestInfo.name !== 'Khách lẻ')
        ? session.guestInfo.name
        : 'Khách lẻ';
      const guestSource = session.guestInfo?.guestSource || 'walkin';

      const serviceAmount = (session.selectedServices || []).reduce((sum: number, service: any) => {
        const v = service.totalPrice !== undefined
          ? service.totalPrice
          : (service.price || service.unitPrice || 0) * (service.quantity || 1);
        return sum + v;
      }, 0);

      const totalAmount = Math.max(0, roomPrice + additionalCharges + serviceAmount);
      const remainingAmount = totalAmount - advancePayment - discount;

      return {
        guestName: guestName,
        checkinTime: checkinTime,
        discount: discount,
        roomPrice: Math.round(roomPrice),
        serviceAmount: Math.round(serviceAmount),
        totalAmount: Math.round(totalAmount),
        additionalCharges: Math.round(additionalCharges),
        advancePayment: advancePayment,
        remainingAmount: Math.round(remainingAmount),
        rateType: rateType,
        rateTypeLabel: rateTypeLabel,
        guestSource: guestSource
      };
    }

    // Tìm event checkin cuối cùng CHƯA CHECKOUT (sắp xếp theo thời gian để lấy mới nhất)
    // Lọc các event check-in chưa có checkout tương ứng
    // Events đã được load từ RoomEvent collection và gán vào room.events
    const checkinEvents = room.events
      .filter(e => {
        if (e.type !== 'checkin') return false;
        
        // QUAN TRỌNG: Chỉ lấy events của phòng hiện tại (room._id)
        // Đảm bảo không lấy events từ phòng khác khi chuyển phòng
        // Kiểm tra xem event có thuộc về phòng này không (nếu có roomId trong event)
        if (e.roomId && e.roomId.toString() !== room._id?.toString()) {
          return false; // Bỏ qua events không thuộc phòng này
        }
        
        // Kiểm tra xem có event checkout nào tương ứng với checkin này không
        // QUAN TRỌNG: Chỉ kiểm tra checkout events của phòng hiện tại
        const hasCheckout = room.events?.some((checkoutEvent: any) => {
          if (checkoutEvent.type !== 'checkout') return false;
          
          // Đảm bảo checkout event thuộc về phòng hiện tại
          if (checkoutEvent.roomId && checkoutEvent.roomId.toString() !== room._id?.toString()) {
            return false; // Bỏ qua checkout events không thuộc phòng này
          }
          
          // So sánh checkinTime: chuyển về Date object và so sánh timestamp
          const checkoutCheckinTime = this.getEventCheckinTime(checkoutEvent)?.getTime() || null;
          const eventCheckinTime = this.getEventCheckinTime(e)?.getTime() || null;
          
          // Nếu có checkinTime và khớp chính xác (trong vòng 1 giây để tránh lỗi làm tròn)
          if (checkoutCheckinTime && eventCheckinTime) {
            return Math.abs(checkoutCheckinTime - eventCheckinTime) < 1000; // Trong vòng 1 giây
          }
          
          return false;
        }) || false;
        
        // Kiểm tra xem event checkin này đã được transfer đi chưa
        // Nếu có transferredFrom và transferredFrom khác room._id, đây là event từ phòng khác chuyển đến
        // Nếu có transferredTo trong checkout event, đây là event đã được chuyển đi
        const isTransferredOut = room.events?.some((checkoutEvent: any) => {
          if (checkoutEvent.type !== 'checkout') return false;
          if (checkoutEvent.roomId && checkoutEvent.roomId.toString() !== room._id?.toString()) {
            return false; // Chỉ kiểm tra checkout events của phòng này
          }
          // Kiểm tra xem có checkout event nào có transferredTo (đã chuyển sang phòng khác) không
          if (checkoutEvent.transferredTo) {
            const checkoutCheckinTime = this.getEventCheckinTime(checkoutEvent)?.getTime() || null;
            const eventCheckinTime = this.getEventCheckinTime(e)?.getTime() || null;
            if (checkoutCheckinTime && eventCheckinTime) {
              return Math.abs(checkoutCheckinTime - eventCheckinTime) < 1000; // Khớp checkinTime
            }
          }
          return false;
        }) || false;
        
        // Chỉ lấy event check-in chưa có checkout và chưa được transfer đi
        return !hasCheckout && !isTransferredOut;
      })
      .sort((a, b) => {
        const timeA = this.getEventCheckinTime(a)?.getTime() || 0;
        const timeB = this.getEventCheckinTime(b)?.getTime() || 0;
        return timeB - timeA; // Sắp xếp giảm dần (mới nhất trước)
      });
    
    if (checkinEvents.length === 0) return null;
    
    const lastCheckin = checkinEvents[0]; // Lấy event mới nhất chưa checkout
    const checkinTime = this.getEventCheckinTime(lastCheckin);
    const currentBooking = this.getCurrentBookingObject(room);
    const rateType = lastCheckin.rateType || currentBooking?.rateType || currentBooking?.bookingType || 'hourly';
    
    // Lấy label cho loại giá
    const rateTypeLabel = this.getRateTypeLabel(rateType);
    const roomPrice = this.getRoomPrice(room, checkinTime, rateType);
    
    // Lấy advancePayment từ event, đảm bảo parse đúng kiểu số
    let advancePayment = 0;
    if (lastCheckin.advancePayment !== undefined && lastCheckin.advancePayment !== null) {
      advancePayment = typeof lastCheckin.advancePayment === 'number' 
        ? lastCheckin.advancePayment 
        : Number(lastCheckin.advancePayment) || 0;
    } else if (this.hasMoneyValue(currentBooking?.advancePayment)) {
      advancePayment = this.normalizeMoneyValue(currentBooking.advancePayment);
    } else if (this.hasMoneyValue(currentBooking?.deposit)) {
      advancePayment = this.normalizeMoneyValue(currentBooking.deposit);
    }
    
    // Lấy tên khách hàng từ nhiều nguồn
    // Ưu tiên 1: Từ lastCheckin.guestInfo (RoomEvent collection) - đảm bảo lấy đúng từ phòng cũ khi chuyển phòng
    let guestName = 'Khách lẻ';
    if (lastCheckin.guestInfo) {
      // Lấy từ guestInfo trong RoomEvent (đã được chuyển từ phòng cũ)
      if (lastCheckin.guestInfo.name && lastCheckin.guestInfo.name !== 'Khách lẻ') {
        guestName = lastCheckin.guestInfo.name;
      } else if (lastCheckin.guestInfo.name === 'Khách lẻ' || !lastCheckin.guestInfo.name) {
        // Nếu là 'Khách lẻ' hoặc không có tên, giữ nguyên
        guestName = 'Khách lẻ';
      }
    }
    
    // Ưu tiên 2: Từ room.currentBooking nếu không có trong event (fallback)
    if ((!guestName || guestName === 'Khách lẻ') && room.currentBooking) {
      const bookingAny = currentBooking as any;
      // Kiểm tra guestInfo trước (tương thích với code cũ)
      if (bookingAny?.guestInfo?.name && bookingAny.guestInfo.name !== 'Khách lẻ') {
        guestName = bookingAny.guestInfo.name;
      } else if (bookingAny?.guestDetails?.name && bookingAny.guestDetails.name !== 'Khách lẻ') {
        // Kiểm tra guestDetails (từ Booking model)
        guestName = bookingAny.guestDetails.name;
      }
    }
    
    // Lấy nguồn khách từ event (ưu tiên từ RoomEvent - đã được chuyển từ phòng cũ)
    const guestSource =
      lastCheckin.guestInfo?.guestSource ||
      currentBooking?.guestInfo?.guestSource ||
      currentBooking?.source ||
      currentBooking?.otaSource ||
      'walkin';
    
    // Tính tiền dịch vụ từ selectedServices (đồng bộ với room-content-modal)
    const selectedServices = Array.isArray(lastCheckin.selectedServices) && lastCheckin.selectedServices.length > 0
      ? lastCheckin.selectedServices
      : (Array.isArray(currentBooking?.selectedServices) && currentBooking.selectedServices.length > 0
          ? currentBooking.selectedServices
          : (Array.isArray(currentBooking?.services) ? currentBooking.services : []));

    let serviceAmount = 0;
    if (selectedServices.length > 0) {
      serviceAmount = selectedServices.reduce((sum: number, service: any) => {
        // Sử dụng totalPrice nếu có (giống room-content-modal), nếu không thì tính từ price và quantity
        const serviceAmount = service.totalPrice !== undefined 
          ? service.totalPrice 
          : (service.price || service.unitPrice || 0) * (service.quantity || 1);
        return sum + serviceAmount;
      }, 0);
    }
    
    // Lấy phụ thu từ event (đồng bộ với room-content-modal)
    // Lấy từ RoomEvent collection (không phải từ room.events trong rooms.js)
    const additionalCharges = this.hasMoneyValue(lastCheckin.additionalCharges)
      ? this.normalizeMoneyValue(lastCheckin.additionalCharges)
      : this.normalizeMoneyValue(currentBooking?.additionalCharges);
    
    // Lấy chiết khấu nếu có, mặc định = 0 (đồng bộ với room-content-modal)
    // Lấy từ RoomEvent collection (không phải từ room.events trong rooms.js)
    const discount = this.hasMoneyValue(lastCheckin.discount)
      ? this.normalizeMoneyValue(lastCheckin.discount)
      : this.normalizeMoneyValue(currentBooking?.discount ?? currentBooking?.discounts);

    const totalAmount = Math.max(0, roomPrice + additionalCharges + serviceAmount);
    const paidAmount = this.hasMoneyValue(currentBooking?.paidAmount)
      ? this.normalizeMoneyValue(currentBooking.paidAmount)
      : 0;
    const remainingAmount = paidAmount > 0
      ? totalAmount - paidAmount
      : totalAmount - advancePayment - discount;
    // Lấy thông tin chuyển phòng từ nhiều nguồn
    let transferredFrom: string | undefined = undefined;
    let transferredAt: Date | undefined = undefined;
    
    // Ưu tiên 1: Từ checkin event (RoomEvent collection)
    if (lastCheckin.transferredFrom) {
      // Đảm bảo convert đúng sang string (có thể là ObjectId hoặc string)
      transferredFrom = typeof lastCheckin.transferredFrom === 'object' 
        ? (lastCheckin.transferredFrom as any)?._id?.toString() || (lastCheckin.transferredFrom as any)?.toString()
        : lastCheckin.transferredFrom.toString();
      transferredAt = lastCheckin.transferredAt ? new Date(lastCheckin.transferredAt) : undefined;
    }
    
    // Ưu tiên 2: Từ currentBooking nếu không có trong event
    if (!transferredFrom && room.currentBooking) {
      const bookingAny = currentBooking as any;
      
      // Kiểm tra transferHistory trước (nếu có nhiều lần chuyển)
      if (bookingAny?.transferHistory && Array.isArray(bookingAny.transferHistory) && bookingAny.transferHistory.length > 0) {
        const lastTransfer = bookingAny.transferHistory[bookingAny.transferHistory.length - 1];
        if (lastTransfer.fromRoomId) {
          transferredFrom = typeof lastTransfer.fromRoomId === 'object'
            ? (lastTransfer.fromRoomId as any)?._id?.toString() || (lastTransfer.fromRoomId as any)?.toString()
            : lastTransfer.fromRoomId.toString();
          transferredAt = lastTransfer.transferredAt ? new Date(lastTransfer.transferredAt) : undefined;
        }
      }
      
      // Nếu không có trong transferHistory, lấy từ transferredFrom trực tiếp
      if (!transferredFrom && bookingAny?.transferredFrom) {
        transferredFrom = typeof bookingAny.transferredFrom === 'object'
          ? (bookingAny.transferredFrom as any)?._id?.toString() || (bookingAny.transferredFrom as any)?.toString()
          : bookingAny.transferredFrom.toString();
        transferredAt = bookingAny.transferredAt ? new Date(bookingAny.transferredAt) : undefined;
      }
    }
    
    return {
      guestName: guestName,
      checkinTime: checkinTime,
      discount: discount,
      roomPrice: Math.round(roomPrice),
      serviceAmount: Math.round(serviceAmount),
      totalAmount: Math.round(totalAmount),
      additionalCharges: Math.round(additionalCharges),
      advancePayment: advancePayment,
      remainingAmount: Math.round(remainingAmount),
      rateType: rateType,
      rateTypeLabel: rateTypeLabel,
      guestSource: guestSource,
      transferredFrom: transferredFrom,
      transferredAt: transferredAt
    };
  }

  private getRateTypeLabel(rateType: string): string {
    const rateTypeLabels: { [key: string]: string } = {
      hourly: this.translate.instant('ROOM.RATE_TYPE_HOURLY') || 'Theo giờ',
      daily: this.translate.instant('ROOM.RATE_TYPE_DAILY') || 'Ngày đêm',
      nightly: this.translate.instant('ROOM.RATE_TYPE_NIGHTLY') || 'Qua đêm',
      weekly: this.translate.instant('ROOM.RATE_TYPE_WEEKLY') || 'Theo tuần',
      monthly: this.translate.instant('ROOM.RATE_TYPE_MONTHLY') || 'Theo tháng'
    };
    return rateTypeLabels[rateType] || rateTypeLabels['hourly'];
  }

  // Tính phụ thu checkin sớm/checkout trễ (tương tự room-content-modal.component.ts)
  private calculateEarlyLateSurcharge(checkinTime: Date | null, rateType: string, room: Room): number {
    if (!checkinTime) return 0;
    
    const now = new Date();
    const durationInHours = Math.ceil((now.getTime() - checkinTime.getTime()) / (1000 * 60 * 60));
    
    // Lấy thông tin priceConfig từ room
    const priceConfig: any = (room as any)?.priceConfig || (room as any)?.priceConfigId || null;
    
    // Lấy giá từ roomData hoặc priceConfig
    const hourlyRate = room.pricing?.hourly || room.firstHourRate || priceConfig?.hourlyRates?.firstHourPrice || 0;
    const dailyRate = room.pricing?.daily || priceConfig?.dailyRates?.standardPrice || 0;
    const nightlyRate = room.pricing?.nightly || priceConfig?.nightlyRates?.standardPrice || 0;
    
    // Lấy các tham số từ priceConfig hoặc giá trị mặc định
    const nightlyStartTime = priceConfig?.nightlyRates?.startTime || 
                             (room as any)?.priceSettings?.nightlyStartTime || '20:00';
    const nightlyEndTime = priceConfig?.nightlyRates?.endTime || 
                           (room as any)?.priceSettings?.nightlyEndTime || '12:00';
    const dailyStartTime = '12:00'; // Thời gian bắt đầu nhận ngày đêm
    const dailyCheckOutTime = priceConfig?.dailyRates?.checkOutTime || 
                              (room as any)?.priceSettings?.dailyEndTime || '12:00';
    const nightlyEarlyCheckinSurcharge = priceConfig?.nightlyRates?.earlyCheckinSurcharge || 
                                         (room as any)?.priceSettings?.nightlyEarlyCheckinSurcharge || 0;
    const nightlyLateCheckoutSurcharge = priceConfig?.nightlyRates?.lateCheckoutSurcharge || 
                                         (room as any)?.priceSettings?.nightlyLateCheckoutSurcharge || 0;
    const dailyEarlyCheckinSurcharge = priceConfig?.dailyRates?.earlyCheckinSurcharge || 
                                      (room as any)?.priceSettings?.dailyEarlyCheckinSurcharge || 0;
    const dailyLateCheckoutFee = priceConfig?.dailyRates?.latecheckOutFee || 
                                (room as any)?.priceSettings?.dailyLateCheckoutFee || 0;

    // Helper function để parse time string (HH:mm) thành giờ và phút
    const parseTime = (timeStr: string) => {
      const parts = timeStr.split(':');
      return {
        hour: parseInt(parts[0]) || 0,
        minute: parseInt(parts[1]) || 0
      };
    };

    // Helper function để tính số giờ sớm/trễ (làm tròn lên)
    const calculateEarlyHours = (actualTime: Date, standardTime: string): number => {
      const actual = parseTime(`${actualTime.getHours()}:${actualTime.getMinutes()}`);
      const standard = parseTime(standardTime);
      const actualMinutes = actual.hour * 60 + actual.minute;
      const standardMinutes = standard.hour * 60 + standard.minute;
      if (actualMinutes < standardMinutes) {
        const earlyMinutes = standardMinutes - actualMinutes;
        return Math.ceil(earlyMinutes / 60); // Làm tròn lên
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
        return Math.ceil(lateMinutes / 60); // Làm tròn lên
      }
      return 0;
    };

    let surcharge = 0;
    
    switch (rateType) {
      case 'daily':
        // Tính phụ thu check-in sớm CHỈ NẾU check-in TRƯỚC thời gian daily (trước dailyStartTime - 12:00)
        if (checkinTime) {
          const checkInMinutes = checkinTime.getHours() * 60 + checkinTime.getMinutes();
          const [startHour, startMinute] = dailyStartTime.split(':').map(Number);
          const startTimeMinutes = startHour * 60 + startMinute;
          
          // Kiểm tra xem check-in có trong thời gian daily không (sau dailyStartTime)
          const isInDailyTime = checkInMinutes >= startTimeMinutes;
          
          // CHỈ tính early check-in surcharge nếu check-in TRƯỚC thời gian daily (trước dailyStartTime)
          if (!isInDailyTime) {
            const earlyCheckinHoursDaily = calculateEarlyHours(checkinTime, dailyStartTime);
            if (earlyCheckinHoursDaily > 0 && dailyEarlyCheckinSurcharge > 0) {
              surcharge += earlyCheckinHoursDaily * dailyEarlyCheckinSurcharge;
            }
          }
        }
        
        // Tính phụ thu check-out trễ (nếu check-out sau 12:00 ngày hôm sau)
        if (now) {
          const checkOutDateOnly = new Date(now);
          checkOutDateOnly.setHours(0, 0, 0, 0);
          const checkInDateOnly = new Date(checkinTime);
          checkInDateOnly.setHours(0, 0, 0, 0);
          const isNextDay = checkOutDateOnly.getTime() > checkInDateOnly.getTime();
          
          const checkOutMinutes = now.getHours() * 60 + now.getMinutes();
          const [checkOutHour, checkOutMinute] = dailyCheckOutTime.split(':').map(Number);
          const checkOutTimeMinutes = checkOutHour * 60 + checkOutMinute;
          
          if (isNextDay && checkOutMinutes > checkOutTimeMinutes && dailyLateCheckoutFee > 0) {
            const lateMinutes = checkOutMinutes - checkOutTimeMinutes;
            const lateCheckoutHoursDaily = Math.ceil(lateMinutes / 60); // Làm tròn lên
            surcharge += lateCheckoutHoursDaily * dailyLateCheckoutFee;
          }
        }
        break;
        
      case 'nightly':
        // Tính phụ thu check-in sớm CHỈ NẾU check-in TRƯỚC thời gian nightly (trước nightlyStartTime)
        if (checkinTime) {
          const checkInMinutes = checkinTime.getHours() * 60 + checkinTime.getMinutes();
          const [startHour, startMinute] = nightlyStartTime.split(':').map(Number);
          const startTimeMinutes = startHour * 60 + startMinute;
          const [endHour, endMinute] = nightlyEndTime.split(':').map(Number);
          const endTimeMinutes = endHour * 60 + endMinute;
          
          // Kiểm tra xem check-in có trong thời gian nightly không
          const isInNightlyTime = checkInMinutes >= startTimeMinutes || checkInMinutes <= endTimeMinutes;
          
          // CHỈ tính early check-in surcharge nếu check-in TRƯỚC thời gian nightly (trước nightlyStartTime)
          if (!isInNightlyTime) {
            const earlyCheckinHoursNightly = calculateEarlyHours(checkinTime, nightlyStartTime);
            if (earlyCheckinHoursNightly > 0 && nightlyEarlyCheckinSurcharge > 0) {
              surcharge += earlyCheckinHoursNightly * nightlyEarlyCheckinSurcharge;
            }
          }
        }
        
        // Tính phụ thu checkout trễ cho nightly (nếu có daily days sau nightly)
        if (durationInHours > 24 && dailyLateCheckoutFee > 0) {
          const checkOutMinutes = now.getHours() * 60 + now.getMinutes();
          const [checkOutHour, checkOutMinute] = dailyCheckOutTime.split(':').map(Number);
          const checkOutTimeMinutes = checkOutHour * 60 + checkOutMinute;
          
          if (checkOutMinutes > checkOutTimeMinutes) {
            const lateMinutes = checkOutMinutes - checkOutTimeMinutes;
            const lateCheckoutHoursDaily = Math.ceil(lateMinutes / 60); // Làm tròn lên
            surcharge += lateCheckoutHoursDaily * dailyLateCheckoutFee;
          }
        }
        break;
        
      case 'hourly':
        // Hourly rate: KHÔNG tính phụ thu sớm/trễ
        break;
    }
    
    return Math.round(surcharge);
  }

  // Lấy số phòng theo ID
  getRoomNumberById(roomId: string): string | null {
    if (!roomId) return null;
    return this.roomNumberByIdMap.get(roomId) || null;
  }

  // Lấy nguồn khách từ phòng
  getRoomGuestSource(room: Room): string {
    if (room.status !== 'occupied') return 'walkin';
    if (!this.hasRenderableOccupiedData(room)) return '';
    
    const checkinInfo = this.getRoomCheckinInfo(room);
    if (checkinInfo?.guestSource) {
      return this.normalizeGuestSource(checkinInfo.guestSource);
    }
    
    if (room.currentBooking) {
      const currentBooking = typeof room.currentBooking === 'object' ? room.currentBooking : null;
      const bookingAny = currentBooking as any;
      if (bookingAny?.guestInfo?.guestSource) {
        return this.normalizeGuestSource(bookingAny.guestInfo.guestSource, bookingAny);
      } else if (bookingAny?.guestDetails) {
        const rawSource = bookingAny.source || bookingAny.otaSource || '';
        return this.normalizeGuestSource(rawSource, bookingAny);
      }
    }
    
    return 'walkin';
  }

  // Tính và hiển thị thời gian lưu trú của khách (tương tự invoice component)
  getRoomDurationText(room: Room): string {
    if (room.status !== 'occupied') {
      return '';
    }
    if (!this.hasRenderableOccupiedData(room)) {
      return '';
    }

    const checkinInfo = this.getRoomCheckinInfo(room);
    if (!checkinInfo || !checkinInfo.checkinTime) {
      return '';
    }

    const checkInTime = checkinInfo.checkinTime instanceof Date
      ? checkinInfo.checkinTime
      : new Date(checkinInfo.checkinTime);
    const checkOutTime = new Date(); // Thời gian hiện tại (vì phòng đang occupied, chưa checkout)

    if (isNaN(checkInTime.getTime()) || isNaN(checkOutTime.getTime())) {
      return '';
    }

    // Tính chính xác thời gian lưu trú
    const durationInMs = checkOutTime.getTime() - checkInTime.getTime();
    const totalMinutes = Math.floor(durationInMs / (1000 * 60));

    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    // Hiển thị theo định dạng: X ngày Y giờ Z phút hoặc Y giờ Z phút
    const parts: string[] = [];

    if (days > 0) {
      parts.push(`${days} ngày`);
    }
    if (hours > 0) {
      parts.push(`${hours} giờ`);
    }
    if (minutes > 0 || (days === 0 && hours === 0)) {
      parts.push(`${minutes} phút`);
    }

    return parts.length > 0 ? parts.join(' ') : '0 phút';
  }

  // Xử lý khi chọn ngày từ calendar để đặt phòng
  onCalendarDateSelected(event: { date: Date, roomId?: string }): void {
    // Tìm phòng nếu có roomId, nếu không thì mở modal chọn phòng
    if (event.roomId) {
      const room = this.rooms.find(r => r._id === event.roomId);
      if (room && room.status === 'vacant') {
        // Mở modal đặt phòng cho phòng cụ thể
        this.openBookingModal(room, event.date);
      }
    } else {
      // Mở modal chọn phòng và đặt phòng
      this.openBookingModalForDate(event.date);
    }
  }

  // Kiểm tra phòng có thể đặt được vào ngày cụ thể
  isRoomAvailableForDate(room: Room, checkInDate: Date, checkOutDate?: Date): boolean {
    // Nếu phòng đang occupied, kiểm tra xem ngày đặt có trùng không
    // CHỈ SỬ DỤNG events từ RoomEvent collection, không sử dụng room.events trong rooms.js
    if (room.status === 'occupied') {
      // Lấy checkin event từ room.events (đã được load từ RoomEvent collection)
      const lastCheckinEvent = room.events?.filter(e => e.type === 'checkin').pop();
      const occupiedCheckIn = lastCheckinEvent ? this.getEventCheckinTime(lastCheckinEvent) : null;
      if (occupiedCheckIn) {
        const now = new Date();
        
        // Nếu ngày đặt trong quá khứ hoặc trùng với thời gian occupied, không thể đặt
        if (checkOutDate) {
          if (new Date(checkOutDate) <= occupiedCheckIn) {
            return true; // Ngày đặt trước thời gian occupied
          }
        }
        if (checkInDate >= now && checkInDate > occupiedCheckIn) {
          return true; // Ngày đặt trong tương lai và sau thời gian occupied
        }
        return false; // Trùng với thời gian occupied
      }
      return false; // Đang occupied và không có thông tin checkin
    }
    
    // Kiểm tra conflict với bookings khác
    // CHỈ SỬ DỤNG events từ RoomEvent collection, không sử dụng room.events trong rooms.js
    if (room.events && room.events.length > 0) {
      const bookingEvents = room.events.filter(e => e.type === 'booking');
      for (const booking of bookingEvents) {
        if (booking.checkinTime && booking.expectedCheckoutTime) {
          const existingCheckIn = new Date(booking.checkinTime);
          const existingCheckOut = new Date(booking.expectedCheckoutTime);
          
          const hasOverlap = (
            (checkInDate >= existingCheckIn && checkInDate < existingCheckOut) ||
            (checkOutDate && new Date(checkOutDate) > existingCheckIn && new Date(checkOutDate) <= existingCheckOut) ||
            (checkInDate <= existingCheckIn && checkOutDate && new Date(checkOutDate) >= existingCheckOut)
          );
          
          if (hasOverlap) {
            return false;
          }
        }
      }
    }
    
    // Kiểm tra currentBooking
    if (room.currentBooking && room.status === 'booked' && room.currentBooking.checkInDate) {
      const currentCheckIn = new Date(room.currentBooking.checkInDate);
      const currentCheckOut = room.currentBooking.checkOutDate ? new Date(room.currentBooking.checkOutDate) : null;
      
      if (currentCheckOut) {
        const hasOverlap = (
          (checkInDate >= currentCheckIn && checkInDate < currentCheckOut) ||
          (checkOutDate && new Date(checkOutDate) > currentCheckIn && new Date(checkOutDate) <= currentCheckOut) ||
          (checkInDate <= currentCheckIn && checkOutDate && new Date(checkOutDate) >= currentCheckOut)
        );
        
        if (hasOverlap) {
          return false;
        }
      }
    }
    
    return true;
  }

  // Mở modal đặt phòng cho phòng cụ thể
  openBookingModalForDate(date: Date): void {
    const lang = this.translate.currentLang || 'vi';
    const locale = lang === 'de' ? 'de-DE' : lang === 'en' ? 'en-US' : 'vi-VN';
    const modalRef: NzModalRef = this.modalService.create({
      nzTitle: this.translate.instant('BOOKING_MODAL.TITLE_FOR_DATE', { date: date.toLocaleDateString(locale) }),
      nzContent: BookingModalComponent,
      nzData: {
        selectedDate: date,
        hotelId: this.selectedHotelId,
        rooms: this.rooms
      },
      nzFooter: [
        {
          label: this.translate.instant('COMMON.CANCEL'),
          onClick: () => modalRef.close()
        },
        {
          label: this.translate.instant('BOOKING_MODAL.EXPORT_PDF_CONFIRMATION'),
          onClick: () => {
            const instance = modalRef.getContentComponent() as BookingModalComponent;
            if (instance) {
              instance.exportConfirmationPDF();
            }
          }
        },
        {
          label: this.translate.instant('BOOKING_MODAL.SUBMIT_BOOKING'),
          type: 'primary',
          onClick: () => {
            const instance = modalRef.getContentComponent() as BookingModalComponent;
            if (instance) {
              instance.onSubmit();
            }
          }
        }
      ],
      nzWidth: 800,
      nzMaskClosable: false
    });
    
    modalRef.afterClose.subscribe((result) => {
      if (result?.success) {
        this.loadRooms(true);
        if (this.isCalendarPanelActive) {
          this.loadBookings();
          if (this.calendarComponent) {
            this.calendarComponent.loadBookings();
          }
        }
      }
    });
  }

  // Mở modal đặt phòng
  openBookingModal(room: Room, selectedDate?: Date): void {
    const modalRef: NzModalRef = this.modalService.create({
      nzTitle: this.translate.instant('BOOKING_MODAL.TITLE_FOR_ROOM', { roomNumber: room.roomNumber }),
      nzContent: BookingModalComponent,
      nzData: {
        selectedDate: selectedDate,
        hotelId: this.selectedHotelId,
        roomId: room._id,
        rooms: this.rooms
      },
      nzFooter: [
        {
          label: this.translate.instant('COMMON.CANCEL'),
          onClick: () => modalRef.close()
        },
        {
          label: this.translate.instant('BOOKING_MODAL.EXPORT_PDF_CONFIRMATION'),
          onClick: () => {
            const instance = modalRef.getContentComponent() as BookingModalComponent;
            if (instance) {
              instance.exportConfirmationPDF();
            }
          }
        },
        {
          label: this.translate.instant('BOOKING_MODAL.SUBMIT_BOOKING'),
          type: 'primary',
          onClick: () => {
            const instance = modalRef.getContentComponent() as BookingModalComponent;
            if (instance) {
              instance.onSubmit();
            }
          }
        }
      ],
      nzWidth: 800,
      nzMaskClosable: false
    });
    
    modalRef.afterClose.subscribe((result) => {
      if (result?.success) {
        this.loadRooms(true);
        if (this.isCalendarPanelActive) {
          this.loadBookings();
          if (this.calendarComponent) {
            this.calendarComponent.loadBookings();
          }
        }
      }
    });
  }

  canAccessSettings(): boolean {
    const user = this.authService.getCurrentUser();
    if (!user) {
      return false;
    }
    return ['superadmin', 'admin', 'business', 'hotel', 'staff'].includes(user.role);
  }

  canManageSystemSettings(): boolean {
    return this.authService.isSuperAdmin() || this.authService.isAdmin();
  }

  getSettingsMenuLabel(): string {
    return this.canManageSystemSettings() ? 'Cài đặt hệ thống' : 'Cài đặt phạm vi làm việc';
  }

  getSettingsMenuDescription(): string {
    return this.canManageSystemSettings()
      ? 'Quản trị cấu hình chung'
      : 'Xem hoặc chỉnh cài đặt theo quyền hiện tại';
  }

  getCurrentUserLabel(): string {
    const user = this.authService.getCurrentUser();
    return user?.fullName || user?.username || user?.email || 'Tài khoản';
  }

  canAccessPricingManagement(): boolean {
    return true;
  }

  canAccessElectricSetting(): boolean {
    return this.authService.isSuperAdmin() ||
           this.authService.isAdmin() ||
           this.authService.isBusiness() ||
           this.authService.isHotelManager();
  }

  navigateToSettings(): void {
    if (this.canAccessSettings()) {
      this.router.navigate(['/admin/settings']);
    }
  }

  navigateToPricing(): void {
    this.router.navigate(['/admin/pricing-management']);
  }

  navigateToElectric(): void {
    this.router.navigate(['/admin/electric-setting']);
  }

  openFloorFilterModal(): void {
    window.dispatchEvent(new CustomEvent('openAdminFloorFilter'));
  }

  openColumnsModal(): void {
    window.dispatchEvent(new CustomEvent('openAdminColumnsModal'));
  }

  openProfile(): void {
    this.router.navigate(['/admin/profile']);
  }

  logout(): void {
    this.userService.clearCurrentUser();
    this.authService.logout();
  }

  expandAllFloors(): void {
    this.activeFloors = [...this.floors];
  }

  collapseAllFloors(): void {
    this.activeFloors = [];
  }

  onFloorPanelChange(floor: string, isActive: boolean): void {
    if (isActive) {
      if (!this.activeFloors.includes(floor)) {
        this.activeFloors.push(floor);
      }
    } else {
      this.activeFloors = this.activeFloors.filter(f => f !== floor);
    }
  }

  // Thêm hàm này vào class RoomComponent
  private patchLocalRoomStatusFromSocket(roomId: string, payload: any): void {
    const hotelId = this.selectedHotelId;
    if (!hotelId || !roomId) return;
    const index = this.rooms.findIndex(r => String(r._id) === String(roomId));
    if (index === -1) return;

    const nextStatus = payload?.status;
    if (nextStatus) {
      this.rooms[index].status = nextStatus;
    }
    if (payload?.guestStatus !== undefined) {
      this.rooms[index].guestStatus = payload.guestStatus || undefined;
    }
    if (nextStatus && nextStatus !== 'occupied' && nextStatus !== 'booked') {
      this.rooms[index].events = [];
      this.rooms[index].currentBooking = undefined;
    }
    this.roomsService.patchCachedRoom(hotelId, this.rooms[index]);
    this.realtimeLastSnapshotKey = this.buildRoomsSnapshotKey(this.rooms);
    this.scheduleDisplayRebuild();
  }

  private updateSingleRoomRealtime(roomId: string): void {
    const hotelId = this.selectedHotelId;
    if (!hotelId || !roomId) return;
    
    // Chỉ lấy data chi tiết của ĐÚNG 1 phòng bị thay đổi
    this.roomsService.getRoomById(roomId, { limit: 10, excludeCheckedOut: true }).subscribe({
      next: (updatedRoom) => {
        const index = this.rooms.findIndex(r => r._id === roomId);
        if (index !== -1) {
          const hydratedRoom = this.hydrateSyntheticEventsFromCurrentBooking([updatedRoom])[0] || updatedRoom;
          // 1. GHI ĐÈ THUỘC TÍNH (Mutation) thay vì gán mới toàn bộ object
          // Kỹ thuật này giúp Angular không render lại toàn bộ thẻ HTML gây chớp
          Object.assign(this.rooms[index], hydratedRoom);
          this.lastLoadedHotelId = hotelId;
          this.roomsService.patchCachedRoom(hotelId, this.rooms[index]);
          
          // 2. Xử lý logic riêng cho phòng đang có khách (Cập nhật thời gian, giá tiền, phụ thu, KM)
          if (this.rooms[index].status === 'occupied' || this.rooms[index].status === 'booked') {
            const eventType = this.rooms[index].status === 'occupied' ? 'checkin' : 'booking';
            this.roomsService.getRoomEvents(roomId, {
              limit: 10,
              type: eventType,
              excludeCheckedOut: this.rooms[index].status === 'occupied'
            })
              .subscribe(events => {
                // Lọc và gán đúng event của phòng này
                const filteredEvents = events.filter(e => !e.roomId || e.roomId.toString() === roomId);
                this.rooms[index].events = filteredEvents.map(e => ({
                  ...e,
                  additionalCharges: Number(e.additionalCharges) || 0,
                  discount: Number(e.discount) || 0,
                  advancePayment: Number(e.advancePayment) || 0
                }));
                
                // Tính lại giá phòng & cập nhật thời gian real-time
                const checkinEvent = filteredEvents.find(e => e.type === 'checkin');
                if (checkinEvent) {
                  this.loadRoomPriceFromAPI(this.rooms[index], checkinEvent, true);
                }
                this.roomsService.patchCachedRoom(hotelId, this.rooms[index]);
                this.realtimeLastSnapshotKey = this.buildRoomsSnapshotKey(this.rooms);
                this.scheduleDisplayRebuild();
              });
          } else {
            // Xóa sạch event cũ nếu phòng đã trả/đang dọn / bảo trì
            this.rooms[index].events = [];
            this.rooms[index].currentBooking = undefined;
            this.rooms[index].guestStatus = undefined;
            this.roomsService.patchCachedRoom(hotelId, this.rooms[index]);
            this.realtimeLastSnapshotKey = this.buildRoomsSnapshotKey(this.rooms);
            this.scheduleDisplayRebuild();
          }
        }
      },
      error: (err) => console.error(`Realtime Sync Error - Phòng ${roomId}:`, err)
    });
  }
}
