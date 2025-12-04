import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CaliendarModalComponent } from '../caliendar-modal/caliendar-modal.component';
import { NzModalService, NzModalRef } from 'ng-zorro-antd/modal';
import { RoomsService } from '../../services/rooms.service';
import { NzMessageService } from 'ng-zorro-antd/message';

interface Booking {
  _id?: string;
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
export class CalendarComponent implements OnInit {
  @Input() hotelId: string | null = null;
  @Input() roomId: string | null = null;
  @Output() bookingSelected = new EventEmitter<{ date: Date, roomId?: string }>();
  
  currentMonth!: number;
  currentYear!: number;
  daysOfWeek: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  datesInMonth: Date[] = [];
  selectedDate: Date | null = null;
  private modalRef: NzModalRef | null = null;
  isLoading = false;

  // Bookings từ backend
  bookings: Booking[] = [];
  allBookings: Booking[] = []; // Tất cả bookings để hiển thị bên dưới
  isCheckingIn = false; // Flag để hiển thị loading khi check-in

  constructor(
    private modalService: NzModalService,
    private roomsService: RoomsService,
    private message: NzMessageService
  ) {}

  ngOnInit(): void {
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
            userName: booking.guestInfo?.name || 'Khách đặt trước',
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
  }

  getBookingsForDate(date: Date): Booking[] {
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

  selectDate(date: Date) {
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

  getDisplayMonth(): number {
    return this.currentMonth + 1; // Cộng 1 để hiển thị đúng tháng (1-12)
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
      nzTitle: 'Xác nhận hủy đặt phòng',
      nzContent: `
        <div style="margin-bottom: 16px;">
          <p>Bạn có chắc chắn muốn hủy đặt phòng này?</p>
          <p><strong>Khách:</strong> ${booking.userName || booking.guestInfo?.name || 'N/A'}</p>
          <p><strong>Phòng:</strong> ${booking.roomNumber || 'N/A'}</p>
          <p><strong>Ngày đến:</strong> ${booking.checkInDate ? new Date(booking.checkInDate).toLocaleString('vi-VN') : 'N/A'}</p>
          <input type="text" id="cancelReason" placeholder="Lý do hủy (không bắt buộc)" 
            style="width: 100%; padding: 8px; border: 1px solid #d9d9d9; border-radius: 4px; margin-top: 8px;" />
        </div>
      `,
      nzOkText: 'Hủy đặt phòng',
      nzOkDanger: true,
      nzCancelText: 'Không',
      nzOnOk: () => {
        const reasonInput = document.getElementById('cancelReason') as HTMLInputElement;
        const reason = reasonInput ? reasonInput.value : 'Hủy từ calendar';
        
        this.isLoading = true;
        this.roomsService.cancelBooking(
          booking.roomId!, 
          reason, 
          booking._id, 
          booking.checkInDate ? new Date(booking.checkInDate) : undefined
        ).subscribe(
          () => {
            this.message.success('Đã hủy đặt phòng thành công.');
            this.isLoading = false;
            this.loadBookings(); // Reload bookings cho calendar
            this.loadAllBookings(); // Reload tất cả bookings cho bảng
          },
          (error) => {
            this.message.error(error.error?.message || 'Không thể hủy đặt phòng.');
            this.isLoading = false;
          }
        );
      }
    });
  }

  // Load tất cả bookings để hiển thị bên dưới
  loadAllBookings(): void {
    if (!this.hotelId && !this.roomId) return;
    
    const params: any = {};
    if (this.hotelId) params.hotelId = this.hotelId;
    if (this.roomId) params.roomId = this.roomId;
    // Không giới hạn tháng để hiển thị tất cả
    
    this.roomsService.getBookings(params).subscribe(
      (data) => {
        this.allBookings = (data.bookings || []).map((booking: any) => {
          const checkInDate = booking.checkInDate ? new Date(booking.checkInDate) : null;
          // Map status: 'checked_in' -> 'checked_in', 'booked' -> 'booked', 'cancelled' -> 'cancelled'
          const status = booking.status || 'booked';
          return {
            ...booking,
            userName: booking.guestInfo?.name || booking.guestDetails?.name || 'Khách đặt trước',
            startTime: checkInDate ? this.formatTime(checkInDate) : '',
            endTime: booking.checkOutDate ? this.formatTime(new Date(booking.checkOutDate)) : '',
            date: checkInDate || new Date(booking.createdAt || Date.now()),
            status: status // Giữ nguyên status từ backend
          };
        });
      },
      (error) => {
        console.error('Error loading all bookings:', error);
      }
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
      this.message.error('Không tìm thấy thông tin phòng.');
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
      this.message.error('Không tìm thấy ID phòng.');
      return;
    }

    this.modalService.confirm({
      nzTitle: 'Xác nhận nhận phòng',
      nzContent: `
        <div style="margin-bottom: 16px;">
          <p><strong>Phòng:</strong> ${booking.roomNumber || 'N/A'}</p>
          <p><strong>Khách:</strong> ${booking.guestInfo?.name || booking.userName || 'Khách đặt trước'}</p>
          <p><strong>Ngày đến:</strong> ${this.formatDateTime(booking.checkInDate)}</p>
          <p><strong>Ngày đi:</strong> ${this.formatDateTime(booking.checkOutDate)}</p>
          <p>Bạn có chắc chắn muốn nhận phòng cho booking này?</p>
        </div>
      `,
      nzOkText: 'Xác nhận',
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        this.isCheckingIn = true;
        
        // Lấy thông tin từ booking để check-in
        const checkInTime = booking.checkInDate ? new Date(booking.checkInDate) : new Date();
        const guestInfo = booking.guestInfo || { name: booking.userName || 'Khách đặt trước' };
        
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
            notes: booking.notes || `Nhận phòng từ booking ${booking._id}`,
            selectedServices: []
          }],
          bookingId: booking._id // Đánh dấu booking này đã được check-in
        };

        this.roomsService.checkInRoom(roomId, checkinData).subscribe(
          (response) => {
            this.message.success('Nhận phòng thành công.');
            this.isCheckingIn = false;
            
            // Đợi một chút để backend cập nhật booking status
            setTimeout(() => {
              // Reload bookings để cập nhật trạng thái
              this.loadBookings();
              this.loadAllBookings();
            }, 300);
            
            // Notify để reload rooms
            this.roomsService.notifyRoomDataUpdated();
          },
          (error) => {
            this.message.error(error.error?.message || 'Không thể nhận phòng.');
            this.isCheckingIn = false;
          }
        );
      }
    });
  }
}
