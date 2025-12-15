import { Component, OnInit, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { RoomsService } from '../../services/rooms.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Room } from '../../interfaces/rooms';
import { HotelService } from '../../services/hotel.service';
import { BusinessService } from '../../services/business.service';

declare global {
  interface Window {
    pdfMake: any;
    pdfMake_vfs: any;
  }
}

@Component({
  selector: 'app-booking-modal',
  templateUrl: './booking-modal.component.html',
  styleUrls: ['./booking-modal.component.css']
})
export class BookingModalComponent implements OnInit {
  bookingForm: FormGroup;
  rooms: Room[] = [];
  availableRooms: Room[] = [];
  selectedDate?: Date;
  hotelId?: string;
  isLoading = false;
  businessInfo: any = null;
  hotelInfo: any = null;

  constructor(
    private fb: FormBuilder,
    @Inject(NZ_MODAL_DATA) public data: {
      selectedDate?: Date;
      hotelId?: string;
      roomId?: string;
      rooms?: Room[];
    },
    private modalRef: NzModalRef,
    private roomsService: RoomsService,
    private message: NzMessageService,
    private hotelService: HotelService,
    private businessService: BusinessService
  ) {
    this.selectedDate = data.selectedDate;
    this.hotelId = data.hotelId;
    
    this.bookingForm = this.fb.group({
      roomId: [data.roomId || null, [Validators.required]],
      guestName: ['', [Validators.required]],
      guestPhone: [''],
      guestEmail: [''],
      guestIdNumber: [''],
      checkInDate: [data.selectedDate ? this.formatDateTimeLocal(data.selectedDate) : '', [Validators.required]],
      checkOutDate: [''],
      rateType: ['hourly', [Validators.required]],
      advancePayment: [0, [Validators.min(0)]],
      notes: ['']
    });
  }

  ngOnInit(): void {
    this.loadRooms();
    if (this.hotelId) {
      this.loadBusinessInfo();
    }
    
    // Set default checkOutDate nếu có checkInDate
    this.bookingForm.get('checkInDate')?.valueChanges.subscribe(value => {
      if (value && !this.bookingForm.get('checkOutDate')?.value) {
        const checkIn = new Date(value);
        checkIn.setDate(checkIn.getDate() + 1);
        this.bookingForm.patchValue({
          checkOutDate: this.formatDateTimeLocal(checkIn)
        });
      }
    });
    
    // Filter available rooms khi thay đổi checkInDate hoặc checkOutDate
    this.bookingForm.get('checkInDate')?.valueChanges.subscribe(() => this.filterAvailableRooms());
    this.bookingForm.get('checkOutDate')?.valueChanges.subscribe(() => this.filterAvailableRooms());
  }

  formatDateTimeLocal(date: Date): string {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  loadRooms(): void {
    if (this.data.rooms) {
      this.rooms = this.data.rooms;
      this.filterAvailableRooms();
    } else if (this.hotelId) {
      this.isLoading = true;
      this.roomsService.getRooms({ hotelId: this.hotelId }).subscribe(
        (rooms) => {
          this.rooms = rooms;
          this.filterAvailableRooms();
          this.isLoading = false;
        },
        (error) => {
          this.message.error('Lỗi khi tải danh sách phòng: ' + (error.error?.message || error.message));
          this.isLoading = false;
        }
      );
    }
  }

  loadBusinessInfo(): void {
    if (!this.hotelId) return;
    
    this.hotelService.getHotelById(this.hotelId).subscribe(
      (hotel) => {
        // Lưu thông tin hotel
        this.hotelInfo = hotel;
        
        if (hotel.businessId) {
          // Extract businessId nếu là object
          const businessId = typeof hotel.businessId === 'object' && hotel.businessId !== null && '_id' in hotel.businessId
            ? hotel.businessId._id
            : hotel.businessId;
          
          if (businessId && typeof businessId === 'string') {
            this.businessService.getBusinessById(businessId).subscribe(
              (business) => {
                this.businessInfo = business;
              },
              (error) => {
                console.error('Error loading business info:', error);
              }
            );
          }
        }
      },
      (error) => {
        console.error('Error loading hotel info:', error);
      }
    );
  }

  filterAvailableRooms(): void {
    const checkInDate = this.bookingForm.get('checkInDate')?.value;
    const checkOutDate = this.bookingForm.get('checkOutDate')?.value;
    
    if (!checkInDate) {
      this.availableRooms = this.rooms.filter(r => r.status === 'vacant');
      return;
    }
    
    const checkIn = new Date(checkInDate);
    const checkOut = checkOutDate ? new Date(checkOutDate) : null;
    
    this.availableRooms = this.rooms.filter(room => {
      if (room.status === 'vacant') {
        return true;
      }
      
      // Kiểm tra phòng occupied có thể đặt vào ngày này không
      if (room.status === 'occupied') {
        const lastCheckinEvent = room.events?.filter(e => e.type === 'checkin').pop();
        if (lastCheckinEvent && lastCheckinEvent.checkinTime) {
          const occupiedCheckIn = new Date(lastCheckinEvent.checkinTime);
          const now = new Date();
          
          if (checkOut) {
            if (checkOut <= occupiedCheckIn) {
              return true; // Ngày đặt trước thời gian occupied
            }
          }
          if (checkIn >= now && checkIn > occupiedCheckIn) {
            return true; // Ngày đặt trong tương lai và sau thời gian occupied
          }
          return false; // Trùng với thời gian occupied
        }
        return false;
      }
      
      // Kiểm tra conflict với bookings khác
      if (room.events && room.events.length > 0) {
        const bookingEvents = room.events.filter(e => e.type === 'booking');
        for (const booking of bookingEvents) {
          if (booking.checkinTime && booking.expectedCheckoutTime) {
            const existingCheckIn = new Date(booking.checkinTime);
            const existingCheckOut = new Date(booking.expectedCheckoutTime);
            
            const hasOverlap = (
              (checkIn >= existingCheckIn && checkIn < existingCheckOut) ||
              (checkOut && checkOut > existingCheckIn && checkOut <= existingCheckOut) ||
              (checkIn <= existingCheckIn && checkOut && checkOut >= existingCheckOut)
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
            (checkIn >= currentCheckIn && checkIn < currentCheckOut) ||
            (checkOut && checkOut > currentCheckIn && checkOut <= currentCheckOut) ||
            (checkIn <= currentCheckIn && checkOut && checkOut >= currentCheckOut)
          );
          
          if (hasOverlap) {
            return false;
          }
        }
      }
      
      return true;
    });
    
    // Cập nhật roomId nếu phòng đã chọn không còn available
    const selectedRoomId = this.bookingForm.get('roomId')?.value;
    if (selectedRoomId && !this.availableRooms.find(r => r._id === selectedRoomId)) {
      this.bookingForm.patchValue({ roomId: null });
    }
  }

  getSelectedRoom(): Room | null {
    const roomId = this.bookingForm.get('roomId')?.value;
    if (!roomId) return null;
    return this.rooms.find(r => r._id === roomId) || null;
  }

  getRoomStatusLabel(room: Room): string {
    if (room.status === 'vacant') return 'Trống';
    if (room.status === 'occupied') return 'Đang có khách';
    return room.status;
  }

  onSubmit(): boolean {
    if (this.bookingForm.invalid) {
      Object.values(this.bookingForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      this.message.warning('Vui lòng điền đầy đủ thông tin bắt buộc.');
      return false;
    }
    
    if (!this.hotelId) {
      this.message.error('Không tìm thấy thông tin khách sạn.');
      return false;
    }
    
    const formValue = this.bookingForm.value;
    const selectedRoom = this.getSelectedRoom();
    if (!selectedRoom) {
      this.message.warning('Vui lòng chọn phòng.');
      return false;
    }
    
    const checkInDate = new Date(formValue.checkInDate);
    const checkOutDate = formValue.checkOutDate ? new Date(formValue.checkOutDate) : undefined;
    
    // Kiểm tra lại trước khi gửi
    if (!this.isRoomAvailableForDate(selectedRoom, checkInDate, checkOutDate)) {
      this.message.error('Phòng không khả dụng vào thời gian này. Vui lòng chọn ngày khác.');
      return false;
    }
    
    const bookingData = {
      roomId: formValue.roomId,
      hotelId: this.hotelId, // Đã kiểm tra không undefined ở trên
      guestInfo: {
        name: formValue.guestName,
        phone: formValue.guestPhone || '',
        email: formValue.guestEmail || '',
        idNumber: formValue.guestIdNumber || ''
      },
      checkInDate: checkInDate,
      checkOutDate: checkOutDate,
      rateType: formValue.rateType,
      advancePayment: parseFloat(formValue.advancePayment) || 0,
      notes: formValue.notes || ''
    };
    
    this.isLoading = true;
    this.roomsService.createBooking(bookingData).subscribe(
      (response) => {
        this.message.success('Đặt phòng thành công!');
        this.isLoading = false;
        this.modalRef.close({ success: true, booking: response });
      },
      (error) => {
        this.message.error(error.error?.message || 'Không thể đặt phòng.');
        this.isLoading = false;
      }
    );
    
    return false; // Return false để giữ modal mở trong quá trình loading
  }

  isRoomAvailableForDate(room: Room, checkInDate: Date, checkOutDate?: Date): boolean {
    // Nếu phòng đang occupied, kiểm tra xem ngày đặt có trùng không
    if (room.status === 'occupied') {
      const lastCheckinEvent = room.events?.filter(e => e.type === 'checkin').pop();
      if (lastCheckinEvent && lastCheckinEvent.checkinTime) {
        const occupiedCheckIn = new Date(lastCheckinEvent.checkinTime);
        const now = new Date();
        
        if (checkOutDate) {
          if (checkOutDate <= occupiedCheckIn) {
            return true; // Ngày đặt trước thời gian occupied
          }
        }
        if (checkInDate >= now && checkInDate > occupiedCheckIn) {
          return true; // Ngày đặt trong tương lai và sau thời gian occupied
        }
        return false; // Trùng với thời gian occupied
      }
      return false;
    }
    
    // Kiểm tra conflict với bookings khác
    if (room.events && room.events.length > 0) {
      const bookingEvents = room.events.filter(e => e.type === 'booking');
      for (const booking of bookingEvents) {
        if (booking.checkinTime && booking.expectedCheckoutTime) {
          const existingCheckIn = new Date(booking.checkinTime);
          const existingCheckOut = new Date(booking.expectedCheckoutTime);
          
          const hasOverlap = (
            (checkInDate >= existingCheckIn && checkInDate < existingCheckOut) ||
            (checkOutDate && checkOutDate > existingCheckIn && checkOutDate <= existingCheckOut) ||
            (checkInDate <= existingCheckIn && checkOutDate && checkOutDate >= existingCheckOut)
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
          (checkOutDate && checkOutDate > currentCheckIn && checkOutDate <= currentCheckOut) ||
          (checkInDate <= currentCheckIn && checkOutDate && checkOutDate >= currentCheckOut)
        );
        
        if (hasOverlap) {
          return false;
        }
      }
    }
    
    return true;
  }

  onCancel(): void {
    this.modalRef.close();
  }

  exportConfirmationPDF(): void {
    if (this.bookingForm.invalid) {
      this.message.warning('Vui lòng điền đầy đủ thông tin trước khi xuất PDF.');
      return;
    }
    
    const formValue = this.bookingForm.value;
    const selectedRoom = this.getSelectedRoom();
    if (!selectedRoom) {
      this.message.warning('Vui lòng chọn phòng.');
      return;
    }
    
    const checkInDate = new Date(formValue.checkInDate);
    const checkOutDate = formValue.checkOutDate ? new Date(formValue.checkOutDate) : null;
    
    const rateTypeLabels: {[key: string]: string} = {
      'hourly': 'Theo giờ',
      'daily': 'Ngày đêm',
      'nightly': 'Qua đêm'
    };
    
    const docDefinition: any = {
      content: [
        {
          text: 'XÁC NHẬN ĐẶT PHÒNG',
          style: 'header',
          alignment: 'center',
          margin: [0, 0, 0, 20]
        },
        {
          columns: [
            {
              text: [
                { text: 'Khách sạn: ', bold: true },
                { text: this.hotelInfo?.name || 'N/A' }
              ],
              margin: [0, 0, 0, 10]
            },
            {
              text: [
                { text: 'Ngày xác nhận: ', bold: true },
                { text: new Date().toLocaleDateString('vi-VN') }
              ],
              alignment: 'right',
              margin: [0, 0, 0, 10]
            }
          ]
        },
        {
          text: [
            { text: 'Địa chỉ: ', bold: true },
            { text: this.getHotelAddress() || 'N/A' }
          ],
          margin: [0, 0, 0, 10]
        },
        {
          text: [
            { text: 'Số điện thoại: ', bold: true },
            { text: this.hotelInfo?.contactInfo?.phone || 'N/A' }
          ],
          margin: [0, 0, 0, 20]
        },
        {
          table: {
            widths: ['*', '*'],
            body: [
              [
                { text: 'Thông tin khách hàng', bold: true, colSpan: 2, fillColor: '#f0f0f0' },
                {}
              ],
              [
                { text: 'Họ và tên:', bold: true },
                { text: formValue.guestName }
              ],
              [
                { text: 'Số điện thoại:', bold: true },
                { text: formValue.guestPhone || 'N/A' }
              ],
              [
                { text: 'Email:', bold: true },
                { text: formValue.guestEmail || 'N/A' }
              ],
              [
                { text: 'CCCD/CMND:', bold: true },
                { text: formValue.guestIdNumber || 'N/A' }
              ],
              [
                { text: 'Thông tin phòng', bold: true, colSpan: 2, fillColor: '#f0f0f0' },
                {}
              ],
              [
                { text: 'Số phòng:', bold: true },
                { text: selectedRoom.roomNumber }
              ],
              [
                { text: 'Loại phòng:', bold: true },
                { text: selectedRoom.type }
              ],
              [
                { text: 'Tầng:', bold: true },
                { text: selectedRoom.floor || 'N/A' }
              ],
              [
                { text: 'Thời gian', bold: true, colSpan: 2, fillColor: '#f0f0f0' },
                {}
              ],
              [
                { text: 'Ngày nhận phòng:', bold: true },
                { text: checkInDate.toLocaleString('vi-VN', { 
                  day: '2-digit', 
                  month: '2-digit', 
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                }) }
              ],
              [
                { text: 'Ngày trả phòng:', bold: true },
                { text: checkOutDate ? checkOutDate.toLocaleString('vi-VN', { 
                  day: '2-digit', 
                  month: '2-digit', 
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                }) : 'Chưa xác định' }
              ],
              [
                { text: 'Hình thức:', bold: true },
                { text: rateTypeLabels[formValue.rateType] || formValue.rateType }
              ],
              [
                { text: 'Tiền đặt trước:', bold: true },
                { text: this.formatCurrency(formValue.advancePayment || 0) }
              ],
              ...(formValue.notes ? [[
                { text: 'Ghi chú:', bold: true, colSpan: 2 },
                { text: formValue.notes }
              ]] : [])
            ]
          },
          margin: [0, 0, 0, 20]
        },
        {
          text: [
            'Lưu ý: ',
            { text: 'Vui lòng đến đúng giờ đã đặt. Nếu có thay đổi, vui lòng liên hệ khách sạn trước ít nhất 24 giờ.', italics: true }
          ],
          margin: [0, 0, 0, 20],
          fontSize: 10
        },
        {
          text: 'Cảm ơn quý khách đã đặt phòng!\nChúc quý khách có một kỳ nghỉ tuyệt vời!',
          alignment: 'center',
          style: 'thankYou',
          margin: [0, 20, 0, 0]
        }
      ],
      styles: {
        header: {
          fontSize: 18,
          bold: true
        },
        thankYou: {
          fontSize: 12,
          italics: true
        }
      },
      defaultStyle: {
        fontSize: 11
      }
    };
    
    if (window.pdfMake) {
      // Tạo tên file: tenkhach-ngày nhận phòng.pdf
      const guestName = this.formatFileName(formValue.guestName);
      const checkInDateStr = this.formatDateForFileName(checkInDate);
      const fileName = `${guestName}-${checkInDateStr}.pdf`;
      
      window.pdfMake.createPdf(docDefinition).download(fileName);
    } else {
      this.message.error('PDF library chưa được tải. Vui lòng tải lại trang.');
    }
  }

  formatFileName(name: string): string {
    if (!name) return 'khach';
    // Loại bỏ dấu tiếng Việt và ký tự đặc biệt, thay khoảng trắng bằng dấu gạch ngang
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Loại bỏ dấu
      .replace(/[^a-zA-Z0-9\s-]/g, '') // Loại bỏ ký tự đặc biệt
      .replace(/\s+/g, '-') // Thay khoảng trắng bằng dấu gạch ngang
      .toLowerCase()
      .trim();
  }

  formatDateForFileName(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  }

  getHotelAddress(): string {
    if (!this.hotelInfo?.address) return '';
    
    const address = this.hotelInfo.address;
    const parts: string[] = [];
    
    if (address.street) parts.push(address.street);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.country) parts.push(address.country);
    if (address.postalCode) parts.push(address.postalCode);
    
    return parts.join(', ') || '';
  }

  formatNumber = (value: number): string => {
    if (value == null) return '';
    return new Intl.NumberFormat('vi-VN').format(value);
  }

  parseNumber = (value: string): string => {
    return value.replace(/\$\s?|(,*)/g, '');
  }
}

