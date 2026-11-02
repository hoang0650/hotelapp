import { Component, OnDestroy, OnInit, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { RoomsService } from '../../services/rooms.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Room } from '../../interfaces/rooms';
import { HotelService } from '../../services/hotel.service';
import { BusinessService } from '../../services/business.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';
import { roomChargeFromQuote, toRealInstantIso } from '../../utils/checkout-quote';
import { merge, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

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
export class BookingModalComponent implements OnInit, OnDestroy {
  bookingForm: FormGroup;
  rooms: Room[] = [];
  availableRooms: Room[] = [];
  selectedDate?: Date;
  hotelId?: string;
  isLoading = false;
  businessInfo: any = null;
  hotelInfo: any = null;
  hotelLogo: string | null = null;
  apiBaseUrl = environment.apiUrl;
  isLoadingHotelInfo = false;
  bookingQuote: number | null = null;
  bookingQuoteLoading = false;
  private bookingQuoteSeq = 0;
  private quoteSub?: Subscription;

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
    private businessService: BusinessService,
    private http: HttpClient,
    private translate: TranslateService,
    private authService: AuthService
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
      advancePaymentMethod: ['cash'],
      notes: ['']
    });
  }

  ngOnInit(): void {
    this.loadRooms();
    
    // Lấy hotelId từ room nếu chưa có
    if (!this.hotelId && this.data.rooms && this.data.rooms.length > 0) {
      const firstRoom = this.data.rooms[0];
      if (firstRoom.hotelId) {
        this.hotelId = typeof firstRoom.hotelId === 'string' 
          ? firstRoom.hotelId 
          : (firstRoom.hotelId as any)?._id || null;
      }
    }
    
    // Lấy hotelId từ roomId nếu có
    if (!this.hotelId && this.data.roomId && this.data.rooms) {
      const selectedRoom = this.data.rooms.find(r => r._id === this.data.roomId);
      if (selectedRoom?.hotelId) {
        this.hotelId = typeof selectedRoom.hotelId === 'string' 
          ? selectedRoom.hotelId 
          : (selectedRoom.hotelId as any)?._id || null;
      }
    }
    
    // Nếu vẫn chưa có hotelId, thử lấy từ session context
    if (!this.hotelId) {
      this.hotelId = this.hotelService.getStoredHotelId() || undefined;
    }
    
    // Load hotel info nếu có hotelId
    if (this.hotelId) {
      this.loadBusinessInfo();
    }

    this.quoteSub = merge(
      this.bookingForm.get('roomId')!.valueChanges,
      this.bookingForm.get('checkInDate')!.valueChanges,
      this.bookingForm.get('checkOutDate')!.valueChanges,
      this.bookingForm.get('rateType')!.valueChanges
    ).pipe(debounceTime(250)).subscribe(() => {
      this.refreshBookingQuote();
    });
    this.refreshBookingQuote();
    
    // Đảm bảo roomId được set đúng trong form nếu có
    if (this.data.roomId && this.bookingForm.get('roomId')?.value !== this.data.roomId) {
      this.bookingForm.patchValue({ roomId: this.data.roomId });
    }
    
    // Set default checkOutDate nếu có checkInDate và validation
    this.bookingForm.get('checkInDate')?.valueChanges.subscribe(value => {
      if (value) {
        const checkIn = new Date(value);
        const checkOutControl = this.bookingForm.get('checkOutDate');
        const currentCheckOut = checkOutControl?.value;
        
        // Nếu chưa có checkOutDate, set mặc định là +1 ngày
        if (!currentCheckOut) {
          const defaultCheckOut = new Date(checkIn);
          defaultCheckOut.setDate(defaultCheckOut.getDate() + 1);
          checkOutControl?.setValue(this.formatDateTimeLocal(defaultCheckOut), { emitEvent: false });
        } else {
          // Nếu có checkOutDate, kiểm tra xem có hợp lệ không
          const checkOut = new Date(currentCheckOut);
          if (checkOut <= checkIn) {
            // Nếu checkOutDate <= checkInDate, tự động cập nhật thành +1 ngày
            const newCheckOut = new Date(checkIn);
            newCheckOut.setDate(newCheckOut.getDate() + 1);
            checkOutControl?.setValue(this.formatDateTimeLocal(newCheckOut), { emitEvent: false });
          }
        }
        
        // Clear errors khi thay đổi
        checkOutControl?.setErrors(null);
        checkOutControl?.updateValueAndValidity({ emitEvent: false });
        
        // Filter available rooms
        this.filterAvailableRooms();
      }
    });
    
    // Validation cho checkOutDate
    this.bookingForm.get('checkOutDate')?.valueChanges.subscribe(value => {
      if (value) {
        const checkInValue = this.bookingForm.get('checkInDate')?.value;
        if (checkInValue) {
          const checkIn = new Date(checkInValue);
          const checkOut = new Date(value);
          if (checkOut <= checkIn) {
            this.bookingForm.get('checkOutDate')?.setErrors({ invalidDateRange: true });
          } else {
            this.bookingForm.get('checkOutDate')?.setErrors(null);
          }
        }
        // Filter available rooms
        this.filterAvailableRooms();
      }
    });
  }

  ngOnDestroy(): void {
    this.quoteSub?.unsubscribe();
  }

  refreshBookingQuote(): void {
    const roomId = this.bookingForm.get('roomId')?.value;
    const checkInRaw = this.bookingForm.get('checkInDate')?.value;
    const checkOutRaw = this.bookingForm.get('checkOutDate')?.value;
    const rateType = this.bookingForm.get('rateType')?.value || 'hourly';
    if (!roomId || !checkInRaw) {
      this.bookingQuote = null;
      this.bookingQuoteLoading = false;
      return;
    }
    const checkInTime = toRealInstantIso(checkInRaw);
    const checkOutTime = checkOutRaw
      ? toRealInstantIso(checkOutRaw)
      : toRealInstantIso(new Date(new Date(checkInTime).getTime() + 60 * 60 * 1000));
    if (!checkInTime || !checkOutTime || new Date(checkOutTime).getTime() <= new Date(checkInTime).getTime()) {
      this.bookingQuote = null;
      return;
    }
    const seq = ++this.bookingQuoteSeq;
    this.bookingQuoteLoading = true;
    this.roomsService.calculateCheckoutTotal({
      roomId,
      rateType,
      checkInTime,
      checkOutTime
    }).subscribe({
      next: (quote) => {
        if (seq !== this.bookingQuoteSeq) return;
        this.bookingQuote = roomChargeFromQuote(quote);
        this.bookingQuoteLoading = false;
      },
      error: () => {
        if (seq !== this.bookingQuoteSeq) return;
        this.bookingQuote = null;
        this.bookingQuoteLoading = false;
      }
    });
  }

  formatDateTimeLocal(date: Date): string {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  loadRooms(): void {
    if (this.data.rooms) {
      this.rooms = this.data.rooms;
      // Nếu có roomId trong data, đảm bảo room đó có trong danh sách
      if (this.data.roomId && !this.rooms.find(r => r._id === this.data.roomId)) {
        // Nếu room không có trong danh sách, load từ API
        if (this.hotelId) {
          this.isLoading = true;
          this.roomsService.getRooms({ hotelId: this.hotelId }).subscribe(
            (rooms) => {
              this.rooms = rooms;
              this.filterAvailableRooms();
              // Đảm bảo roomId được set đúng sau khi load
              if (this.data.roomId && this.rooms.find(r => r._id === this.data.roomId)) {
                this.bookingForm.patchValue({ roomId: this.data.roomId });
              }
              this.isLoading = false;
            },
            (error) => {
              const details = error?.error?.message || error?.message || '';
              this.message.error(this.translate.instant('BOOKING_MODAL.LOAD_ROOMS_ERROR_DETAIL', { message: details }));
              this.isLoading = false;
            }
          );
        } else {
          this.filterAvailableRooms();
        }
      } else {
        this.filterAvailableRooms();
        // Đảm bảo roomId được set đúng nếu có
        if (this.data.roomId && this.rooms.find(r => r._id === this.data.roomId)) {
          this.bookingForm.patchValue({ roomId: this.data.roomId });
        }
      }
    } else if (this.hotelId) {
      this.isLoading = true;
      this.roomsService.getRooms({ hotelId: this.hotelId }).subscribe(
        (rooms) => {
          this.rooms = rooms;
          this.filterAvailableRooms();
          // Đảm bảo roomId được set đúng sau khi load
          if (this.data.roomId && this.rooms.find(r => r._id === this.data.roomId)) {
            this.bookingForm.patchValue({ roomId: this.data.roomId });
          }
          this.isLoading = false;
        },
        (error) => {
          const details = error?.error?.message || error?.message || '';
          this.message.error(this.translate.instant('BOOKING_MODAL.LOAD_ROOMS_ERROR_DETAIL', { message: details }));
          this.isLoading = false;
        }
      );
    }
  }

  loadBusinessInfo(): void {
    // Thử lấy hotelId từ nhiều nguồn
    let targetHotelId = this.hotelId;
    
    // Nếu chưa có hotelId, thử lấy từ room
    if (!targetHotelId && this.data.rooms && this.data.rooms.length > 0) {
      const firstRoom = this.data.rooms[0];
      if (firstRoom.hotelId) {
        targetHotelId = typeof firstRoom.hotelId === 'string' 
          ? firstRoom.hotelId 
          : (firstRoom.hotelId as any)?._id || null;
      }
    }
    
    // Lấy từ roomId nếu có
    if (!targetHotelId && this.data.roomId && this.data.rooms) {
      const selectedRoom = this.data.rooms.find(r => r._id === this.data.roomId);
      if (selectedRoom?.hotelId) {
        targetHotelId = typeof selectedRoom.hotelId === 'string' 
          ? selectedRoom.hotelId 
          : (selectedRoom.hotelId as any)?._id || null;
      }
    }
    
    if (!targetHotelId) {
      console.warn('Không tìm thấy hotelId để load thông tin khách sạn');
      return;
    }
    
    // Cập nhật hotelId nếu tìm thấy từ room
    if (targetHotelId !== this.hotelId) {
      this.hotelId = targetHotelId;
    }
    
    this.hotelService.getHotelById(targetHotelId).subscribe(
      (hotel) => {
        // Lưu thông tin hotel
        this.hotelInfo = hotel;
        
        // Lấy logo khách sạn (ưu tiên logoId từ business, sau đó từ hotel nếu có)
        if (hotel.businessId) {
          const business = typeof hotel.businessId === 'object' ? hotel.businessId : null;
          if (business) {
            const logoId = (business as any).logoId;
            this.hotelLogo = logoId ? `/files/${logoId}` : ((business as any).logo || null);
          }
        }
        
        // Nếu chưa có logo, thử lấy từ hotel (nếu có logoId trong hotel model)
        if (!this.hotelLogo && (hotel as any).logoId) {
          this.hotelLogo = `/files/${(hotel as any).logoId}`;
        } else if (!this.hotelLogo && (hotel as any).logo) {
          this.hotelLogo = (hotel as any).logo;
        }
        
        if (hotel.businessId) {
          // Extract businessId nếu là object
          const businessId = typeof hotel.businessId === 'object' && hotel.businessId !== null && '_id' in hotel.businessId
            ? hotel.businessId._id
            : hotel.businessId;
          
          const canLoadBusiness = this.authService.isAdmin() || this.authService.isBusiness();
          if (!canLoadBusiness) {
            if (!this.businessInfo && typeof hotel.businessId === 'object') {
              this.businessInfo = hotel.businessId;
            }
            return;
          }
          
          if (businessId && typeof businessId === 'string') {
            this.businessService.getBusinessById(businessId).subscribe(
              (business) => {
                this.businessInfo = business;
                // Cập nhật logo nếu chưa có
                if (!this.hotelLogo) {
                  const logoId = (business as any).logoId;
                  this.hotelLogo = logoId ? `/files/${logoId}` : (business.logo || null);
                }
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
        // Không hiển thị lỗi nếu là 403 - có thể do quyền truy cập
        // Nhưng vẫn cho phép tạo booking vì hotelId đã có sẵn
        if (error.status !== 403) {
          this.message.warning(this.translate.instant('BOOKING_MODAL.LOAD_HOTEL_INFO_ERROR'));
        }
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
    const status = String(room?.status || '').toLowerCase().trim();
    const key = `ROOM.${status.toUpperCase()}`;
    const translated = this.translate.instant(key);
    if (translated && translated !== key) return translated;
    return status || this.translate.instant('COMMON.NO_DATA');
  }

  onSubmit(): boolean {
    if (this.bookingForm.invalid) {
      Object.values(this.bookingForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      this.message.warning(this.translate.instant('BOOKING_MODAL.FILL_REQUIRED_FIELDS'));
      return false;
    }
    
    if (!this.hotelId) {
      this.message.error(this.translate.instant('BOOKING_MODAL.HOTEL_NOT_FOUND'));
      return false;
    }
    
    const formValue = this.bookingForm.value;
    const selectedRoom = this.getSelectedRoom();
    if (!selectedRoom) {
      this.message.warning(this.translate.instant('BOOKING_MODAL.SELECT_ROOM_REQUIRED'));
      return false;
    }
    
    const checkInDate = new Date(toRealInstantIso(formValue.checkInDate));
    const checkOutDate = formValue.checkOutDate ? new Date(toRealInstantIso(formValue.checkOutDate)) : undefined;
    
    // Kiểm tra checkOutDate phải sau checkInDate
    if (checkOutDate && checkOutDate <= checkInDate) {
      this.message.error(this.translate.instant('BOOKING_MODAL.INVALID_DATE_RANGE'));
      this.bookingForm.get('checkOutDate')?.setErrors({ invalidDateRange: true });
      this.bookingForm.get('checkOutDate')?.markAsDirty();
      return false;
    }
    
    // Kiểm tra checkInDate không được trong quá khứ (trừ khi đặt cho hôm nay)
    const now = new Date();
    now.setSeconds(0, 0); // Bỏ phần giây và milliseconds
    const checkInDateNormalized = new Date(checkInDate);
    checkInDateNormalized.setSeconds(0, 0);
    
    // Cho phép đặt cho hôm nay hoặc tương lai
    if (checkInDateNormalized < now) {
      // Kiểm tra xem có phải cùng ngày không (cho phép đặt trong ngày)
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const checkInDay = new Date(checkInDateNormalized);
      checkInDay.setHours(0, 0, 0, 0);
      
      if (checkInDay < today) {
        this.message.error(this.translate.instant('BOOKING_MODAL.CHECK_IN_PAST_ERROR'));
        this.bookingForm.get('checkInDate')?.setErrors({ pastDate: true });
        this.bookingForm.get('checkInDate')?.markAsDirty();
        return false;
      }
    }
    
    // Kiểm tra lại trước khi gửi
    if (!this.isRoomAvailableForDate(selectedRoom, checkInDate, checkOutDate)) {
      this.message.error(this.translate.instant('BOOKING_MODAL.ROOM_NOT_AVAILABLE'));
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
      checkInDate: toRealInstantIso(formValue.checkInDate),
      checkOutDate: formValue.checkOutDate ? toRealInstantIso(formValue.checkOutDate) : undefined,
      rateType: formValue.rateType,
      advancePayment: parseFloat(formValue.advancePayment) || 0,
      advancePaymentMethod: formValue.advancePaymentMethod || 'cash',
      notes: formValue.notes || ''
    };
    
    this.isLoading = true;
    this.roomsService.createBooking(bookingData).subscribe(
      (response) => {
        this.message.success(this.translate.instant('BOOKING_MODAL.BOOKING_SUCCESS'));
        this.isLoading = false;
        this.modalRef.close({ success: true, booking: response });
      },
      (error) => {
        this.message.error(error.error?.message || this.translate.instant('BOOKING_MODAL.BOOKING_ERROR'));
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

  async exportConfirmationPDF(): Promise<void> {
    if (this.bookingForm.invalid) {
      this.message.warning(this.translate.instant('BOOKING_MODAL.FILL_INFO_BEFORE_PDF'));
      return;
    }
    
    const formValue = this.bookingForm.value;
    const selectedRoom = this.getSelectedRoom();
    if (!selectedRoom) {
      this.message.warning(this.translate.instant('BOOKING_MODAL.SELECT_ROOM_REQUIRED'));
      return;
    }
    
    // Đảm bảo hotelId được set đúng
    if (!this.hotelId) {
      // Thử lấy từ room
      if (selectedRoom?.hotelId) {
        this.hotelId = typeof selectedRoom.hotelId === 'string' 
          ? selectedRoom.hotelId 
          : (selectedRoom.hotelId as any)?._id || null;
      }
    }
    
    // Đảm bảo hotel info đã được load
    if (!this.hotelInfo && this.hotelId) {
      this.isLoadingHotelInfo = true;
      try {
        await new Promise<void>((resolve, reject) => {
          this.hotelService.getHotelById(this.hotelId!).subscribe(
            (hotel) => {
              this.hotelInfo = hotel;
              // Lấy logo
              if (hotel.businessId) {
                const business = typeof hotel.businessId === 'object' ? hotel.businessId : null;
                if (business) {
                  const logoId = (business as any).logoId;
                  this.hotelLogo = logoId ? `/files/${logoId}` : ((business as any).logo || null);
                }
              }
              if (!this.hotelLogo && (hotel as any).logoId) {
                this.hotelLogo = `/files/${(hotel as any).logoId}`;
              } else if (!this.hotelLogo && (hotel as any).logo) {
                this.hotelLogo = (hotel as any).logo;
              }
              resolve();
            },
            (error) => {
              console.error('Error loading hotel info:', error);
              // Nếu là lỗi 403, vẫn cho phép tiếp tục nhưng không có hotel info
              if (error.status === 403) {
                this.message.warning(this.translate.instant('BOOKING_MODAL.HOTEL_INFO_ACCESS_DENIED'));
                resolve(); // Resolve thay vì reject để vẫn có thể tạo PDF
              } else {
                reject(error);
              }
            }
          );
        });
      } catch (error) {
        this.message.error(this.translate.instant('BOOKING_MODAL.LOAD_HOTEL_INFO_ERROR'));
        this.isLoadingHotelInfo = false;
        return;
      }
      this.isLoadingHotelInfo = false;
    }
    
    const checkInDate = new Date(toRealInstantIso(formValue.checkInDate));
    const checkOutDate = formValue.checkOutDate ? new Date(toRealInstantIso(formValue.checkOutDate)) : null;
    const hotelClock = { timeZone: 'Asia/Ho_Chi_Minh' };
    
    const rateTypeLabels: {[key: string]: string} = {
      'hourly': 'Theo giờ',
      'daily': 'Ngày đêm',
      'nightly': 'Qua đêm'
    };
    
    const content: any[] = [];
    
    // Logo (không hiển thị tên khách sạn với background màu xanh)
    if (this.hotelLogo) {
      try {
        const logoUrl = this.getImageUrl(this.hotelLogo);
        const logoBase64 = await this.convertImageUrlToBase64(logoUrl);
        if (logoBase64) {
          content.push({
            image: logoBase64,
            fit: [120, 120],
            alignment: 'left',
            margin: [0, 0, 0, 20]
          });
        }
      } catch (error) {
        console.error('Error converting logo to base64:', error);
      }
    }
    
    // Tiêu đề
    content.push({
      text: 'XÁC NHẬN ĐẶT PHÒNG',
      style: 'header',
      alignment: 'center',
      margin: [0, 0, 0, 20]
    });
    
    // Thông tin khách sạn và ngày xác nhận
    content.push({
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
    });
    
    const docDefinition: any = {
      content: [
        ...content,
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
                  minute: '2-digit',
                  ...hotelClock
                }) }
              ],
              [
                { text: 'Ngày trả phòng:', bold: true },
                { text: checkOutDate ? checkOutDate.toLocaleString('vi-VN', { 
                  day: '2-digit', 
                  month: '2-digit', 
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  ...hotelClock
                }) : 'Chưa xác định' }
              ],
              [
                { text: 'Hình thức:', bold: true },
                { text: rateTypeLabels[formValue.rateType] || formValue.rateType }
              ],
              ...(this.bookingQuote != null ? [[
                { text: 'Tiền phòng:', bold: true },
                { text: this.formatCurrency(this.bookingQuote) }
              ]] : []),
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
      this.message.error(this.translate.instant('BOOKING_MODAL.PDF_LIBRARY_NOT_LOADED'));
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

  getImageUrl(urlOrId: string | null | undefined): string {
    if (!urlOrId) return '';
    // Nếu là URL đầy đủ (http/https), trả về nguyên
    if (urlOrId.startsWith('http://') || urlOrId.startsWith('https://')) {
      return urlOrId;
    }
    // Nếu là imageId hoặc path, thêm base URL
    if (urlOrId.startsWith('/files/')) {
      return `${this.apiBaseUrl}${urlOrId}`;
    }
    // Nếu chỉ là ID, thêm /files/ prefix
    return `${this.apiBaseUrl}/files/${urlOrId}`;
  }

  /**
   * Convert image URL to base64 for pdfMake
   */
  async convertImageUrlToBase64(imageUrl: string): Promise<string | null> {
    if (!imageUrl) return null;
    
    try {
      // Fetch image as blob
      const blob = await this.http.get(imageUrl, { responseType: 'blob' }).toPromise();
      if (!blob) return null;
      
      // Convert blob to base64
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          resolve(base64data);
        };
        reader.onerror = () => {
          console.error('Error reading blob');
          resolve(null);
        };
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting image to base64:', error);
      return null;
    }
  }
}

