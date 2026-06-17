import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { CaliendarModalComponent } from '../caliendar-modal/caliendar-modal.component';
import { NzModalService, NzModalRef } from 'ng-zorro-antd/modal';
import { RoomsService } from '../../services/rooms.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

interface Booking {
  _id?: string;
  bookingId?: string; // ID từ Booking collection
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
  // Legacy fields for compatibility
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
export class CalendarComponent implements OnInit, OnDestroy {
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

  // Bookings từ backend
  bookings: Booking[] = [];
  allBookings: Booking[] = []; // Tất cả bookings để hiển thị bên dưới
  isCheckingIn = false; // Flag để hiển thị loading khi check-in
  private translateSubscription?: Subscription;

  constructor(
    private modalService: NzModalService,
    private roomsService: RoomsService,
    private message: NzMessageService,
    private translate: TranslateService
  ) {
    // Khởi tạo lần đầu
    this.initDaysOfWeek();
    
    // Subscribe để cập nhật khi ngôn ngữ thay đổi
    this.translateSubscription = this.translate.onLangChange.subscribe(() => {
      this.initDaysOfWeek();
    });
  }

  private initDaysOfWeek(): void {
    // Khởi tạo ngay với instant() để có giá trị ngay lập tức
    this.daysOfWeek = [
      this.translate.instant('CALENDAR.DAYS_OF_WEEK.SUN'),
      this.translate.instant('CALENDAR.DAYS_OF_WEEK.MON'),
      this.translate.instant('CALENDAR.DAYS_OF_WEEK.TUE'),
      this.translate.instant('CALENDAR.DAYS_OF_WEEK.WED'),
      this.translate.instant('CALENDAR.DAYS_OF_WEEK.THU'),
      this.translate.instant('CALENDAR.DAYS_OF_WEEK.FRI'),
      this.translate.instant('CALENDAR.DAYS_OF_WEEK.SAT')
    ];
    
    // Sau đó cập nhật bằng get() để đảm bảo translation được load đầy đủ
    this.translate.get([
      'CALENDAR.DAYS_OF_WEEK.SUN',
      'CALENDAR.DAYS_OF_WEEK.MON',
      'CALENDAR.DAYS_OF_WEEK.TUE',
      'CALENDAR.DAYS_OF_WEEK.WED',
      'CALENDAR.DAYS_OF_WEEK.THU',
      'CALENDAR.DAYS_OF_WEEK.FRI',
      'CALENDAR.DAYS_OF_WEEK.SAT'
    ]).subscribe(translations => {
      this.daysOfWeek = [
        translations['CALENDAR.DAYS_OF_WEEK.SUN'],
        translations['CALENDAR.DAYS_OF_WEEK.MON'],
        translations['CALENDAR.DAYS_OF_WEEK.TUE'],
        translations['CALENDAR.DAYS_OF_WEEK.WED'],
        translations['CALENDAR.DAYS_OF_WEEK.THU'],
        translations['CALENDAR.DAYS_OF_WEEK.FRI'],
        translations['CALENDAR.DAYS_OF_WEEK.SAT']
      ];
    });
  }

  ngOnDestroy(): void {
    if (this.translateSubscription) {
      this.translateSubscription.unsubscribe();
    }
  }

  ngOnInit(): void {
    // Đảm bảo daysOfWeek được load trước khi render
    this.initDaysOfWeek();
    this.initializeCalendar();
    this.loadBookings();
    this.loadAllBookings(); // Load tất cả bookings để hiển thị bên dưới
  }

  // Load bookings từ backend
  loadBookings(): void {
    if (!this.hotelId && !this.roomId) return;
    
    this.isLoading = true;
    const params: any = {};
    if (this.hotelId) params.hotelId = this.hotelId;
    if (this.roomId) params.roomId = this.roomId;
    
    // Tính toán startDate và endDate cho tháng hiện tại
    const startDate = new Date(this.currentYear, this.currentMonth, 1);
    const endDate = new Date(this.currentYear, this.currentMonth + 1, 0);
    params.startDate = startDate.toISOString();
    params.endDate = endDate.toISOString();
    
    this.roomsService.getBookings(params).subscribe(
      (data) => {
        this.bookings = (data.bookings || []).map((booking: any) => {
          // Map booking từ backend sang format hiển thị
          const checkInDate = booking.checkInDate ? new Date(booking.checkInDate) : null;
          return {
            ...booking,
            userName: booking.guestInfo?.name || this.translate.instant('CALENDAR.GUEST_PRE_BOOKED'),
            startTime: checkInDate ? this.formatTime(checkInDate) : '',
            endTime: booking.checkOutDate ? this.formatTime(new Date(booking.checkOutDate)) : '',
            date: checkInDate || new Date(booking.createdAt || Date.now()),
            status: booking.status || 'Booked'
          };
        });
        this.isLoading = false;
      },
      (error) => {
        console.error('Error loading bookings:', error);
        this.isLoading = false;
      }
    );
  }

  // Format thời gian để hiển thị
  formatTime(date: Date): string {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  initializeCalendar() {
    const today = new Date();
    this.currentMonth = today.getMonth(); // Tháng hiện tại (0-11)
    this.currentYear = today.getFullYear(); // Năm hiện tại
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
    return this.bookings.filter(
      booking => {
        const bookingDate = booking.date || (booking.checkInDate ? new Date(booking.checkInDate) : null);
        if (!bookingDate) return false;
        return (
          bookingDate.getDate() === date.getDate() &&
          bookingDate.getMonth() === date.getMonth() &&
          bookingDate.getFullYear() === date.getFullYear()
        );
      }
    );
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  }

  isSelected(date: Date) {
    return (
      this.selectedDate &&
      date.getDate() === this.selectedDate.getDate() &&
      date.getMonth() === this.selectedDate.getMonth() &&
      date.getFullYear() === this.selectedDate.getFullYear()
    );
  }

  selectDate(date: Date | null) {
    if (!date) return;
    this.selectedDate = date;
    // Emit event để room component có thể xử lý đặt phòng
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
    this.loadBookings(); // Reload bookings khi đổi tháng
  }

  nextMonth(): void {
    if (this.currentMonth === 11) {
      this.currentMonth = 0;
      this.currentYear++;
    } else {
      this.currentMonth++;
    }
    this.generateDates(this.currentMonth, this.currentYear);
    this.loadBookings(); // Reload bookings khi đổi tháng
  }

  getDisplayMonth(): string {
    const monthNumber = this.currentMonth + 1; // Cộng 1 để hiển thị đúng tháng (1-12)
    return this.translate.instant(`CALENDAR.MONTHS.${monthNumber}`);
  }

  confirmBooking() {
    // Implement booking confirmation logic
  }

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
      // Add more modal options as needed
    });
  }

  handleLabel() {}

  handleCheck() {}

  // Hủy đặt phòng
  cancelBooking(booking: Booking): void {
    if (!booking.roomId) {
      this.message.error('Không tìm thấy thông tin phòng.');
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
        // Lấy bookingId từ booking (có thể là bookingId hoặc _id)
        const bookingId = booking.bookingId || booking._id;
        this.roomsService.cancelBooking(
          booking.roomId!, 
          reason, 
          bookingId, 
          booking.checkInDate ? new Date(booking.checkInDate) : undefined
        ).subscribe(
          () => {
            this.message.success(this.translate.instant('CALENDAR.CANCEL_SUCCESS'));
            this.isLoading = false;
            
            // Đợi một chút để backend cập nhật xong
            setTimeout(() => {
              // Reload bookings để cập nhật trạng thái thành 'cancelled'
              this.loadBookings(); // Reload bookings cho calendar
              this.loadAllBookings(); // Reload tất cả bookings cho bảng
            }, 300);
            
            // Notify để reload rooms (phòng sẽ chuyển sang vacant và có thể đặt lại)
            this.roomsService.notifyRoomDataUpdated();
          },
          (error) => {
            this.message.error(error.error?.message || this.translate.instant('CALENDAR.CANCEL_ERROR'));
            this.isLoading = false;
          }
        );
      }
    });
  }

  // Load tất cả bookings để hiển thị bên dưới (Giới hạn 100 cái mới nhất để chống giật)
  loadAllBookings(): void {
    if (!this.hotelId && !this.roomId) return;
    
    const params: any = {
      limit: 100 // TỐI ƯU: Chỉ lấy 100 booking gần nhất để chống treo máy
    };
    if (this.hotelId) params.hotelId = this.hotelId;
    if (this.roomId) params.roomId = this.roomId;
    
    this.roomsService.getBookings(params).subscribe(
      (data) => {
        this.allBookings = (data.bookings || []).map((booking: any) => {
          const checkInDate = booking.checkInDate ? new Date(booking.checkInDate) : null;
          const status = booking.status || 'booked';
          return {
            ...booking,
            userName: booking.guestInfo?.name || booking.guestDetails?.name || this.translate.instant('CALENDAR.GUEST_PRE_BOOKED'),
            startTime: checkInDate ? this.formatTime(checkInDate) : '',
            endTime: booking.checkOutDate ? this.formatTime(new Date(booking.checkOutDate)) : '',
            date: checkInDate || new Date(booking.createdAt || Date.now()),
            status: status
          };
        });
      },
      (error) => console.error('Error loading all bookings:', error)
    );
  }

  // Format ngày giờ để hiển thị trong bảng
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

  // Xem lịch sử đặt phòng (giữ lại để tương thích)
  viewBookingHistory(): void {
    this.loadAllBookings();
  }

  // Kiểm tra xem booking có thể check-in không
  canCheckin(booking: Booking): boolean {
    if (!booking.roomId || !booking.checkInDate) {
      return false;
    }
    
    // Chỉ cho phép check-in nếu:
    // 1. Status là 'booked' hoặc 'confirmed'
    // 2. CheckInDate là hôm nay hoặc đã qua
    const status = booking.status || 'booked';
    if (status !== 'booked' && status !== 'confirmed') {
      return false;
    }
    
    const checkInDate = new Date(booking.checkInDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    checkInDate.setHours(0, 0, 0, 0);
    
    // Cho phép check-in nếu ngày check-in là hôm nay hoặc đã qua
    return checkInDate <= today;
  }

  // Nhận phòng từ booking
  checkinBooking(booking: Booking): void {
    if (!booking.roomId || !booking._id) {
      this.message.error(this.translate.instant('CALENDAR.ROOM_NOT_FOUND'));
      return;
    }

    // Bỏ check canCheckin - cho phép nhận phòng bất cứ lúc nào (có thể nhận sớm)
    // if (!this.canCheckin(booking)) {
    //   this.message.warning('Không thể nhận phòng cho booking này.');
    //   return;
    // }

    // Đảm bảo roomId là string (không phải undefined)
    const roomId = booking.roomId;
    if (!roomId) {
      this.message.error(this.translate.instant('CALENDAR.ROOM_ID_NOT_FOUND'));
      return;
    }

    this.modalService.confirm({
      nzTitle: this.translate.instant('CALENDAR.CONFIRM_CHECKIN_TITLE'),
      nzContent: `
        <div style="margin-bottom: 16px;">
          <p><strong>${this.translate.instant('CALENDAR.ROOM')}:</strong> ${booking.roomNumber || 'N/A'}</p>
          <p><strong>${this.translate.instant('CALENDAR.GUEST')}:</strong> ${booking.guestInfo?.name || booking.userName || this.translate.instant('CALENDAR.GUEST_PRE_BOOKED')}</p>
          <p><strong>${this.translate.instant('CALENDAR.CHECKIN_DATE')}:</strong> ${this.formatDateTime(booking.checkInDate)}</p>
          <p><strong>${this.translate.instant('CALENDAR.CHECKOUT_DATE')}:</strong> ${this.formatDateTime(booking.checkOutDate)}</p>
          <p>${this.translate.instant('CALENDAR.CONFIRM_CHECKIN_MESSAGE')}</p>
        </div>
      `,
      nzOkText: this.translate.instant('COMMON.CONFIRM'),
      nzCancelText: this.translate.instant('CALENDAR.CANCEL'),
      nzOnOk: () => {
        this.isCheckingIn = true;
        
        // Lấy thông tin từ booking để check-in
        const checkInTime = booking.checkInDate ? new Date(booking.checkInDate) : new Date();
        const guestInfo = booking.guestInfo || { name: booking.userName || this.translate.instant('CALENDAR.GUEST_PRE_BOOKED') };
        
        // Lấy bookingId từ booking (có thể là _id hoặc bookingId)
        const bookingId = booking.bookingId || booking._id;
        
        const checkinData = {
          status: 'occupied',
          events: [{
            type: 'checkin',
            checkinTime: checkInTime,
            guestInfo: guestInfo,
            paymentMethod: 'cash', // Mặc định
            rateType: booking.rateType || 'hourly',
            advancePayment: booking.advancePayment || 0,
            additionalCharges: 0,
            discount: 0,
            notes: booking.notes || `${this.translate.instant('CALENDAR.CHECKIN')} từ booking ${bookingId}`,
            selectedServices: []
          }],
          bookingId: bookingId // Đánh dấu booking này đã được check-in
        };

        this.roomsService.checkInRoom(roomId, checkinData).subscribe(
          (response) => {
            this.message.success(this.translate.instant('CALENDAR.CHECKIN_SUCCESS'));
            this.isCheckingIn = false;
            
            // Đợi một chút để backend cập nhật booking status thành 'checked_in'
            setTimeout(() => {
              // Reload bookings để cập nhật trạng thái thành 'checked_in'
              this.loadBookings();
              this.loadAllBookings();
            }, 500); // Tăng delay lên 500ms để đảm bảo backend đã cập nhật xong
            
            // Notify để reload rooms
            this.roomsService.notifyRoomDataUpdated();
          },
          (error) => {
            this.message.error(error.error?.message || this.translate.instant('CALENDAR.CHECKIN_ERROR'));
            this.isCheckingIn = false;
          }
        );
      }
    });
  }
}
