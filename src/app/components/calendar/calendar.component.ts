import { Component, OnInit, OnDestroy, OnChanges, SimpleChanges, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CaliendarModalComponent } from '../caliendar-modal/caliendar-modal.component';
import { NzModalService, NzModalRef } from 'ng-zorro-antd/modal';
import { RoomsService } from '../../services/rooms.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

interface Booking {
  _id?: string;
  bookingId?: string;
  roomId?: string;
  roomNumber?: string;
  hotelId?: string;
  guestInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    idNumber?: string;
  };
  checkInDate?: Date | string;
  checkOutDate?: Date | string;
  rateType?: string;
  status?: string;
  createdAt?: Date | string;
  advancePayment?: number;
  notes?: string;
  userName?: string;
  startTime?: string;
  endTime?: string;
  date?: Date;
}

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css']
})
export class CalendarComponent implements OnInit, OnDestroy, OnChanges {
  @Input() hotelId: string | null = null;
  @Input() roomId: string | null = null;
  @Output() bookingSelected = new EventEmitter<{ date: Date, roomId?: string }>();

  currentMonth!: number;
  currentYear!: number;
  daysOfWeek: string[] = [];
  datesInMonth: Date[] = [];
  calendarCells: Array<Date | null> = [];
  selectedDate: Date | null = null;
  private modalRef: NzModalRef | null = null;
  isLoading = false;

  bookings: Booking[] = [];
  allBookings: Booking[] = [];
  /** Index theo yyyy-mm-dd để tránh filter lại mỗi CD cycle */
  private bookingsByDay = new Map<string, Booking[]>();
  isCheckingIn = false;
  private translateSubscription?: Subscription;
  private loadSub?: Subscription;
  private loadedRange: { start: number; end: number; hotelKey: string } | null = null;

  constructor(
    private modalService: NzModalService,
    private roomsService: RoomsService,
    private message: NzMessageService,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef
  ) {
    this.initDaysOfWeek();
    this.translateSubscription = this.translate.onLangChange.subscribe(() => {
      this.initDaysOfWeek();
    });
  }

  private initDaysOfWeek(): void {
    this.daysOfWeek = [
      this.translate.instant('CALENDAR.DAYS_OF_WEEK.SUN'),
      this.translate.instant('CALENDAR.DAYS_OF_WEEK.MON'),
      this.translate.instant('CALENDAR.DAYS_OF_WEEK.TUE'),
      this.translate.instant('CALENDAR.DAYS_OF_WEEK.WED'),
      this.translate.instant('CALENDAR.DAYS_OF_WEEK.THU'),
      this.translate.instant('CALENDAR.DAYS_OF_WEEK.FRI'),
      this.translate.instant('CALENDAR.DAYS_OF_WEEK.SAT')
    ];
  }

  ngOnDestroy(): void {
    this.translateSubscription?.unsubscribe();
    this.loadSub?.unsubscribe();
  }

  ngOnInit(): void {
    this.initializeCalendar();
    this.refresh(false);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['hotelId'] || changes['roomId']) && !changes['hotelId']?.firstChange) {
      this.loadedRange = null;
      this.refresh(true);
    }
  }

  /** API public — room board gọi khi cần reload */
  loadBookings(): void {
    this.refresh(true);
  }

  loadAllBookings(): void {
    this.refresh(true);
  }

  /**
   * Một request duy nhất cho cả lưới tháng + bảng lịch sử.
   * Lấy cửa sổ rộng (±1 tháng quanh tháng đang xem) rồi tách client-side.
   */
  refresh(force: boolean = false): void {
    if (!this.hotelId && !this.roomId) return;
    if (this.currentMonth == null || this.currentYear == null) {
      this.initializeCalendar();
    }

    const rangeStart = new Date(this.currentYear, this.currentMonth - 1, 1);
    const rangeEnd = new Date(this.currentYear, this.currentMonth + 2, 0, 23, 59, 59, 999);
    const hotelKey = `${this.hotelId || ''}|${this.roomId || ''}`;

    // Đổi tháng trong cửa sổ đã load → chỉ refilter, không gọi API
    if (
      !force &&
      this.loadedRange &&
      this.loadedRange.hotelKey === hotelKey &&
      rangeStart.getTime() >= this.loadedRange.start &&
      rangeEnd.getTime() <= this.loadedRange.end &&
      this.allBookings.length > 0
    ) {
      this.applyMonthFilter();
      return;
    }

    this.isLoading = true;
    this.loadSub?.unsubscribe();

    const params: any = {
      limit: 150,
      startDate: rangeStart.toISOString(),
      endDate: rangeEnd.toISOString(),
      forceRefresh: force
    };
    if (this.hotelId) params.hotelId = this.hotelId;
    if (this.roomId) params.roomId = this.roomId;

    this.loadSub = this.roomsService.getBookings(params).subscribe({
      next: (data) => {
        const mapped = (data.bookings || []).map((booking: any) => this.mapBooking(booking));
        this.allBookings = mapped;
        this.loadedRange = {
          start: rangeStart.getTime(),
          end: rangeEnd.getTime(),
          hotelKey
        };
        this.applyMonthFilter();
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error loading bookings:', error);
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  private mapBooking(booking: any): Booking {
    const checkInDate = booking.checkInDate ? new Date(booking.checkInDate) : null;
    const status = booking.status || 'booked';
    return {
      ...booking,
      userName: booking.guestInfo?.name || booking.guestDetails?.name || this.translate.instant('CALENDAR.GUEST_PRE_BOOKED'),
      startTime: checkInDate ? this.formatTime(checkInDate) : '',
      endTime: booking.checkOutDate ? this.formatTime(new Date(booking.checkOutDate)) : '',
      date: checkInDate || new Date(booking.createdAt || Date.now()),
      status
    };
  }

  private applyMonthFilter(): void {
    const monthStart = new Date(this.currentYear, this.currentMonth, 1).getTime();
    const monthEnd = new Date(this.currentYear, this.currentMonth + 1, 0, 23, 59, 59, 999).getTime();

    this.bookings = this.allBookings.filter((booking) => {
      const t = booking.date ? new Date(booking.date).getTime() : NaN;
      return !isNaN(t) && t >= monthStart && t <= monthEnd;
    });

    this.rebuildBookingsByDay();
  }

  private dayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  private rebuildBookingsByDay(): void {
    const map = new Map<string, Booking[]>();
    for (const booking of this.bookings) {
      if (!booking.date) continue;
      const d = new Date(booking.date);
      if (isNaN(d.getTime())) continue;
      const key = this.dayKey(d);
      const list = map.get(key);
      if (list) list.push(booking);
      else map.set(key, [booking]);
    }
    this.bookingsByDay = map;
  }

  formatTime(date: Date): string {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  initializeCalendar() {
    const today = new Date();
    this.currentMonth = today.getMonth();
    this.currentYear = today.getFullYear();
    this.generateDates(this.currentMonth, this.currentYear);
  }

  generateDates(month: number, year: number) {
    this.datesInMonth = [];
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const lastDateOfMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 1; i <= lastDateOfMonth; i++) {
      this.datesInMonth.push(new Date(year, month, i));
    }

    const cells: Array<Date | null> = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push(null);
    }
    this.datesInMonth.forEach(d => cells.push(d));
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    this.calendarCells = cells;
  }

  getBookingsForDate(date: Date | null): Booking[] {
    if (!date) return [];
    return this.bookingsByDay.get(this.dayKey(date)) || [];
  }

  trackByDate = (_: number, date: Date | null): string => {
    return date ? this.dayKey(date) : 'empty';
  };

  trackByBookingId = (_: number, booking: Booking): string => {
    return String(booking._id || booking.bookingId || booking.roomId || _);
  };

  isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  }

  isSelected(date: Date): boolean {
    return !!this.selectedDate &&
      date.getDate() === this.selectedDate.getDate() &&
      date.getMonth() === this.selectedDate.getMonth() &&
      date.getFullYear() === this.selectedDate.getFullYear();
  }

  selectDate(date: Date | null) {
    if (!date) return;
    this.selectedDate = date;
    this.bookingSelected.emit({ date, roomId: this.roomId || undefined });
  }

  prevMonth(): void {
    if (this.currentMonth === 0) {
      this.currentMonth = 11;
      this.currentYear--;
    } else {
      this.currentMonth--;
    }
    this.generateDates(this.currentMonth, this.currentYear);
    this.refresh(false);
  }

  nextMonth(): void {
    if (this.currentMonth === 11) {
      this.currentMonth = 0;
      this.currentYear++;
    } else {
      this.currentMonth++;
    }
    this.generateDates(this.currentMonth, this.currentYear);
    this.refresh(false);
  }

  getDisplayMonth(): string {
    const monthNumber = this.currentMonth + 1;
    return this.translate.instant(`CALENDAR.MONTHS.${monthNumber}`);
  }

  confirmBooking() {}

  showModal(): void {
    this.modalRef = this.modalService.create({
      nzTitle: 'Sửa thông tin đặt phòng',
      nzContent: CaliendarModalComponent,
      nzData: {
        roomData: this.bookings
      },
      nzFooter: [
        {
          label: 'Lưu',
          type: 'primary',
          onClick: () => this.handleCheck(),
        },
        {
          label: 'Hủy',
          type: 'dashed',
          onClick: () => this.modalRef?.close(),
        }
      ],
    });
  }

  handleLabel() {}
  handleCheck() {}

  cancelBooking(booking: Booking): void {
    if (!booking.roomId) {
      this.message.error(this.translate.instant('CALENDAR.ROOM_NOT_FOUND'));
      return;
    }

    this.modalService.confirm({
      nzTitle: this.translate.instant('CALENDAR.CONFIRM_CANCEL_TITLE'),
      nzContent: `
        <div style="margin-bottom: 16px;">
          <p>${this.translate.instant('CALENDAR.CONFIRM_CANCEL_MESSAGE')}</p>
          <p><strong>${this.translate.instant('CALENDAR.GUEST')}:</strong> ${booking.userName || booking.guestInfo?.name || 'N/A'}</p>
          <p><strong>${this.translate.instant('CALENDAR.ROOM')}:</strong> ${booking.roomNumber || 'N/A'}</p>
          <p><strong>${this.translate.instant('CALENDAR.CHECKIN_DATE')}:</strong> ${booking.checkInDate ? new Date(booking.checkInDate).toLocaleString('vi-VN') : 'N/A'}</p>
          <input type="text" id="cancelReason" placeholder="${this.translate.instant('CALENDAR.CANCEL_REASON')}"
            style="width: 100%; padding: 8px; border: 1px solid #d9d9d9; border-radius: 4px; margin-top: 8px;" />
        </div>
      `,
      nzOkText: this.translate.instant('CALENDAR.CANCEL_BOOKING'),
      nzOkDanger: true,
      nzCancelText: this.translate.instant('CALENDAR.NO'),
      nzOnOk: () => {
        const reasonInput = document.getElementById('cancelReason') as HTMLInputElement;
        const reason = reasonInput ? reasonInput.value : this.translate.instant('CALENDAR.CANCEL_BOOKING');

        this.isLoading = true;
        const bookingId = booking.bookingId || booking._id;
        this.roomsService.cancelBooking(
          booking.roomId!,
          reason,
          bookingId,
          booking.checkInDate ? new Date(booking.checkInDate) : undefined
        ).subscribe({
          next: () => {
            this.message.success(this.translate.instant('CALENDAR.CANCEL_SUCCESS'));
            this.roomsService.clearBookingsCache();
            this.refresh(true);
            this.roomsService.notifyRoomDataUpdated();
          },
          error: (error) => {
            this.message.error(error.error?.message || this.translate.instant('CALENDAR.CANCEL_ERROR'));
            this.isLoading = false;
          }
        });
      }
    });
  }

  formatDateTime(date: Date | string | undefined): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }

  viewBookingHistory(): void {
    this.refresh(true);
  }

  canCheckin(booking: Booking): boolean {
    if (!booking.roomId || !booking.checkInDate) {
      return false;
    }
    const status = String(booking.status || '').toLowerCase();
    if (status === 'cancelled' || status === 'checked_in' || status === 'checked-in' || status === 'completed') {
      return false;
    }
    return true;
  }

  checkinBooking(booking: Booking): void {
    if (!booking.roomId || this.isCheckingIn) return;
    this.isCheckingIn = true;

    const checkinData: any = {
      status: 'occupied',
      events: [{
        type: 'checkin',
        checkinTime: booking.checkInDate ? new Date(booking.checkInDate) : new Date(),
        guestInfo: booking.guestInfo || {},
        rateType: booking.rateType || 'hourly',
        advancePayment: booking.advancePayment || 0,
        notes: booking.notes || '',
        bookingId: booking.bookingId || booking._id
      }]
    };

    this.roomsService.checkInRoom(booking.roomId, checkinData).subscribe({
      next: () => {
        this.message.success(this.translate.instant('CALENDAR.CHECKIN_SUCCESS'));
        this.isCheckingIn = false;
        this.roomsService.clearBookingsCache();
        this.refresh(true);
        this.roomsService.notifyRoomDataUpdated({
          hotelId: this.hotelId || undefined,
          roomId: booking.roomId,
          reason: 'checkin',
          status: 'occupied',
          refreshRooms: true,
          delayMs: 0
        });
      },
      error: (error) => {
        this.message.error(error.error?.message || this.translate.instant('CALENDAR.CHECKIN_ERROR'));
        this.isCheckingIn = false;
      }
    });
  }
}
