import { Component, OnInit } from '@angular/core';
import { CaliendarModalComponent } from '../caliendar-modal/caliendar-modal.component';
import { NzModalService, NzModalRef } from 'ng-zorro-antd/modal';

interface Booking {
  userName: string;
  startTime: string;
  endTime: string;
  status: string;
  date: Date;
}

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css']
})
export class CalendarComponent implements OnInit {
  currentMonth!: number;
  currentYear!: number;
  daysOfWeek: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  datesInMonth: Date[] = [];
  selectedDate: Date | null = null;
  private modalRef: NzModalRef | null = null;

  // Sample bookings
  bookings: Booking[] = [
    {
      userName: 'John Doe',
      startTime: '10:00 AM',
      endTime: '12:00 PM',
      status: 'Booked',
      date: new Date(2024, 7, 22) // Tháng 7 là August
    },
    {
      userName: 'Jane Smith',
      startTime: '01:00 PM',
      endTime: '03:00 PM',
      status: 'Cancelled',
      date: new Date(2024, 7, 23) // Tháng 7 là August
    }
    // Add more bookings as needed
  ];

  constructor(private modalService: NzModalService) {}

  ngOnInit(): void {
    this.initializeCalendar();
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
      booking =>
        booking.date.getDate() === date.getDate() &&
        booking.date.getMonth() === date.getMonth() &&
        booking.date.getFullYear() === date.getFullYear()
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
  }

  prevMonth(): void {
    if (this.currentMonth === 0) {
      this.currentMonth = 11;
      this.currentYear--;
    } else {
      this.currentMonth--;
    }
    this.generateDates(this.currentMonth, this.currentYear);
  }

  nextMonth(): void {
    if (this.currentMonth === 11) {
      this.currentMonth = 0;
      this.currentYear++;
    } else {
      this.currentMonth++;
    }
    this.generateDates(this.currentMonth, this.currentYear);
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
}
