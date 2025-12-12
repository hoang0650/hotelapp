import { Component, Inject, OnInit, Input, OnDestroy, ChangeDetectorRef } from '@angular/core';
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
import { BusinessService } from '../../services/business.service';
import { TuyaService } from '../../services/tuya.service';
import { SePayService, SePayPaymentData } from '../../services/sepay.service';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';

// Interface cho dữ liệu cập nhật phòng
interface RoomUpdate {
  services?: OrderedService[];
  [key: string]: any;
}

@Component({
  selector: 'app-room-content-modal',
  templateUrl: './room-content-modal.component.html',
  styleUrls: ['./room-content-modal.component.css']
})
export class RoomContentModalComponent implements OnInit, OnDestroy {
  roomData: any;
  
  listData: any[] = [];
  checkInForm!: FormGroup;
  servicesForm!: FormGroup;
  checkOutForm!: FormGroup;
  services: any[] = []; // Load từ API
  selectedServices: OrderedService[] = [];
  paymentMethods = [
    { value: 'cash', label: 'Tiền mặt' },
    { value: 'card', label: 'Thẻ ngân hàng' },
    { value: 'transfer', label: 'Chuyển khoản' }
  ];
  isLoading = false;
  isSaving = false;
  totalPrice = 0;
  private _roomPriceTotal = 0; // Tổng tiền phòng (private để tránh conflict với getter)
  private _servicesPriceTotal = 0; // Tổng tiền dịch vụ (private để tránh conflict với getter)
  private _hasRoomPriceFromAPI = false; // Flag để biết đã có giá trị từ API chưa
  advancePayment = 0;
  skipValidation = false;
  modalType: string = 'info'; // Loại modal: checkin, checkout, cleaning
  private sessionSubscription?: Subscription;
  
  // SePay payment
  showSePayModal = false;
  sepayPaymentCode = '';
  sepayAmount = 0;
  sepayQrUrl = '';
  sepayBeneficiaryName = '';
  sepayBankName = '';
  sepayAccountNumber = '';
  sepayPaymentHistoryId: string = ''; // ID của payment history để kiểm tra trạng thái
  currentUser: any = null;
  hotelBankAccount: any = null; // Thông tin ngân hàng của hotel
  private paymentStatusCheckInterval: any = null; // Interval để kiểm tra trạng thái thanh toán
  
  // Định dạng hiển thị tiền Việt Nam
  formatterVND = (value: number): string => `${value} đ`;
  parserVND = (value: string): string => value.replace(' đ', '');
  
  // Lấy thời gian hiện tại theo UTC+7 (múi giờ Việt Nam)
  getCurrentTime(): Date {
    return this.getUTCTimePlus7();
  }
  
  // Helper function để lọc các event check-in CHƯA CHECKOUT
  // Lưu ý: Nếu backend đã filter bằng excludeCheckedOut=true, hàm này vẫn hoạt động như một lớp bảo vệ bổ sung
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
          const checkoutCheckinTime = e.checkinTime ? new Date(e.checkinTime).getTime() : null;
          const eventCheckinTime = event.checkinTime ? new Date(event.checkinTime).getTime() : null;
          
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
        const timeA = a.checkinTime ? new Date(a.checkinTime).getTime() : 0;
        const timeB = b.checkinTime ? new Date(b.checkinTime).getTime() : 0;
        return timeB - timeA; // Sắp xếp giảm dần (mới nhất trước)
      });
  }

  // Helper function để tạo Date theo timezone được chỉ định
  // timezone: 'UTC+7', 'UTC+8', etc. (mặc định UTC+7)
  getTimeByTimezone(timezone: string = 'UTC+7'): Date {
    const now = new Date();
    
    // Parse timezone offset (ví dụ: 'UTC+7' -> 7, 'UTC-5' -> -5)
    const timezoneMatch = timezone.match(/UTC([+-])(\d+)/);
    if (timezoneMatch) {
      const sign = timezoneMatch[1] === '+' ? 1 : -1;
      const hours = parseInt(timezoneMatch[2]);
      const offset = sign * hours * 60 * 60 * 1000; // offset in milliseconds
      const localOffset = now.getTimezoneOffset() * 60000; // local offset in milliseconds
      return new Date(now.getTime() + localOffset + offset);
    }
    
    // Fallback: trả về thời gian hiện tại
    return new Date(now);
  }
  
  // Helper function để tạo Date theo UTC+7 (múi giờ Việt Nam) - giữ lại để backward compatibility
  getUTCTimePlus7(): Date {
    // Lấy timezone từ roomData nếu có
    const timezone = (this.roomData as any)?.priceSettings?.timezone || 'UTC+7';
    return this.getTimeByTimezone(timezone);
  }

  // Thêm thuộc tính businessInfo
  businessInfo: any = {};

  initialCharges: number = 0;
  initialDiscount: number = 0;
  initialNotes: string = '';
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
    private cdr: ChangeDetectorRef
  ) {
    // Log dữ liệu nhận được từ directive để debug
    console.log('Room Content Modal received data:', data);
    
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
        phone: ['', [Validators.pattern('^[0-9]{10}$')]],
        email: ['', [Validators.email]],
        address: [''],
        guestSource: ['walkin'] // Mặc định là walkin
      }),
      paymentMethod: ['cash', this.skipValidation ? [] : [Validators.required]],
      rateType: ['hourly', this.skipValidation ? [] : [Validators.required]],
      advancePayment: [0, [Validators.min(0)]],
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
    
    // Form cho dịch vụ
    this.servicesForm = this.fb.group({
      serviceId: [''],
      quantity: [1, [Validators.min(1), Validators.required]]
    });
    
    // Form cho check-out
    this.createCheckOutForm();
  }

  ngOnInit(): void {
    // Load danh sách dịch vụ từ API
    this.loadServicesFromAPI();
    
    // Lấy thông tin phiên phòng nếu có
    if (this.roomData && this.roomData._id) {
      // Reload room từ backend để đảm bảo dữ liệu mới nhất
      // excludeCheckedOut = true: chỉ lấy check-in events chưa checkout (tránh lấy phòng đã checkout)
      // limit: lấy nhiều events hơn nếu cần (mặc định backend trả về 1000)
      this.roomsService.getRoomById(this.roomData._id, { 
        limit: 1000,
        excludeCheckedOut: true // Chỉ lấy check-in events chưa checkout
      }).subscribe({
        next: (updatedRoom) => {
          this.roomData = updatedRoom;
          console.log('Reloaded room data from backend (excludeCheckedOut=true):', updatedRoom);
          console.log('Events count:', updatedRoom.events?.length || 0);
          
          // Luôn lấy dữ liệu từ backend, không phụ thuộc vào session
          this.fetchCurrentRoom();
        },
        error: (err) => {
          console.error('Error reloading room:', err);
          // Fallback: sử dụng roomData đã có
          this.fetchCurrentRoom();
        }
      });
    } else {
      this.fetchCurrentRoom();
    }
    
    // Chỉ tính giá nếu là checkout modal và đã có dữ liệu
    if (this.modalType === 'checkout') {
      // Sử dụng setTimeout để đảm bảo dữ liệu đã được load
      setTimeout(() => {
        this.calculateTotalPrice();
      }, 100);
    }
    
    this.loadBusinessInfo();
    
    // Load current user để lấy QR code từ profile
    this.loadCurrentUser();
  }
  
  /**
   * Load thông tin user hiện tại để lấy QR code từ profile
   */
  loadCurrentUser(): void {
    // Lấy user từ AuthService
    this.currentUser = this.authService.getCurrentUser();
    
    // Nếu chưa có user, subscribe để lấy khi có
    if (!this.currentUser) {
      this.authService.currentUser$.subscribe({
        next: (user) => {
          this.currentUser = user;
        }
      });
    }
  }
  
  // Load dịch vụ từ API
  loadServicesFromAPI(): void {
    if (this.roomData?.hotelId) {
      this.serviceService.getAvailableServicesForModal(this.roomData.hotelId).subscribe({
        next: (response) => {
          if (response?.data?.services) {
            this.services = response.data.services.map((s: any) => ({
              id: s._id,
              name: s.name,
              price: s.price,
              category: s.category,
              description: s.description
            }));
          }
        },
        error: (error) => {
          console.error('Lỗi khi tải danh sách dịch vụ:', error);
          // Fallback nếu API lỗi
          this.serviceService.getServices(this.roomData.hotelId).subscribe({
            next: (data) => {
              this.services = data.map((s: any) => ({
                id: s._id,
                name: s.name,
                price: s.price,
                category: s.category
              }));
            },
            error: (err) => console.error('Fallback cũng lỗi:', err)
          });
        }
      });
    }
  }
  
  ngOnDestroy(): void {
    // Hủy subscription khi component bị hủy
    if (this.sessionSubscription) {
      this.sessionSubscription.unsubscribe();
    }
    
    // Dừng polling khi component bị hủy
    this.stopPaymentStatusPolling();
  }
  
  // Cập nhật UI từ dữ liệu phiên
  private updateUIFromSession(session: RoomSession): void {
    this.initialCharges = session.additionalCharges || 0;
    this.initialDiscount = session.discount || 0;
    this.initialNotes = session.notes || '';
    this.initialSelectedServices = session.selectedServices ? [...session.selectedServices] : [];
    this.selectedServices = session.selectedServices ? [...session.selectedServices] : [];
    this.advancePayment = session.advancePayment || 0;

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
        paymentMethod: session.paymentMethod,
        rateType: session.rateType,
        advancePayment: this.advancePayment,
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
        paymentMethod: session.paymentMethod,
        rateType: session.rateType || 'hourly',
        advancePayment: session.advancePayment || 0
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
        // Lọc các event check-in CHƯA CHECKOUT (chưa có event checkout tương ứng)
        const checkinEvents = this.getUncheckedOutCheckinEvents(this.roomData.events);
        const lastCheckinEvent = checkinEvents.length > 0 ? checkinEvents[0] : null;
        
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
            checkinTime: lastCheckinEvent.checkinTime,
            rateType: lastCheckinEvent.rateType || 'hourly',
            advancePayment: eventAdvancePayment, // Đảm bảo là số
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
          
          this.checkInForm.patchValue({
              paymentMethod: lastCheckinEvent.paymentMethod,
              rateType: lastCheckinEvent.rateType,
              advancePayment: this.advancePayment,
              additionalCharges: this.initialCharges,
              discount: this.initialDiscount,
              notes: this.initialNotes
          });
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
          
          this.checkOutForm.patchValue({ 
            paymentMethod: lastCheckinEvent.paymentMethod || 'cash',
            rateType: lastCheckinEvent.rateType || 'hourly', // Thêm rateType từ check-in event
            advancePayment: eventAdvancePayment // Sử dụng giá trị đã đảm bảo là số
          });
          console.log('Checkout form full value after patchValue:', this.checkOutForm.value);
          
          this.advancePayment = eventAdvancePayment;

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
  }

  // Tải thông tin doanh nghiệp
  loadBusinessInfo(): void {
    this.hotelService.getHotelById(this.roomData.hotelId).subscribe(
      (data) => {
        this.businessInfo = data;
        // Lưu thông tin ngân hàng của hotel
        this.hotelBankAccount = data.bankAccount || null;
        console.log('Thông tin doanh nghiệp:', this.businessInfo);
        console.log('Thông tin ngân hàng hotel:', this.hotelBankAccount);
        
        // Nếu hotel không có bankAccount, thử lấy từ manager
        if (!this.hotelBankAccount?.qrPaymentUrl && data.managerId) {
          const manager = typeof data.managerId === 'object' ? data.managerId : null;
          if (manager?.bankAccount?.qrPaymentUrl) {
            // Sử dụng QR code từ manager nếu hotel không có
            this.hotelBankAccount = manager.bankAccount;
            console.log('Sử dụng QR code từ manager vì hotel chưa có:', this.hotelBankAccount);
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

  // Thêm dịch vụ
  addService(): void {
    // Kiểm tra form hợp lệ
    if (this.servicesForm.invalid) {
      Object.values(this.servicesForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity();
        }
      });
      return;
    }
    
    // Lấy dữ liệu từ form
    const serviceId = this.servicesForm.get('serviceId')?.value;
    const quantity = this.servicesForm.get('quantity')?.value || 1;
    
    // Kiểm tra dịch vụ đã chọn
    if (!serviceId) {
      this.message.warning('Vui lòng chọn dịch vụ!');
      return;
    }
    
    // Tìm dịch vụ trong danh sách
    const selectedService = this.services.find(service => service.id === serviceId);
    if (!selectedService) {
      this.message.error('Không tìm thấy dịch vụ đã chọn!');
      return;
    }
    
    // Kiểm tra xem dịch vụ đã có trong danh sách chưa
    const existingIndex = this.selectedServices.findIndex(s => s.serviceId === serviceId);
    
    if (existingIndex !== -1) {
      // Nếu dịch vụ đã tồn tại, cập nhật số lượng
      this.selectedServices[existingIndex].quantity += quantity;
      // Cập nhật tổng giá
      this.selectedServices[existingIndex].totalPrice = 
        this.selectedServices[existingIndex].price * this.selectedServices[existingIndex].quantity;
      this.message.success(`Đã cập nhật số lượng ${selectedService.name}`);
    } else {
      // Thêm dịch vụ mới vào danh sách
      const orderedService: OrderedService = {
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        price: selectedService.price,
        quantity: quantity,
        totalPrice: selectedService.price * quantity,
        orderTime: new Date()
      };
      
      this.selectedServices.push(orderedService);
      this.message.success(`Đã thêm ${quantity} ${selectedService.name}`);
    }
    
    // Không lưu vào session nữa, dữ liệu sẽ được lưu vào RoomEvent khi checkout
    
    // Reset form
    this.servicesForm.reset({
      serviceId: '',
      quantity: 1
    });
    
    // Cập nhật tổng giá
    this.calculateTotalPrice();
  }

  // Xóa dịch vụ
  removeService(index: number): void {
    this.selectedServices.splice(index, 1);
    
    // Cập nhật session
    sessionStorage.setItem('selectedServices', JSON.stringify(this.selectedServices));
    
    // Cập nhật dữ liệu phòng
    if (this.roomData._id) {
      const servicesUpdate: RoomUpdate = {
        services: this.selectedServices
      };
      
      this.roomsService.updateRoom(this.roomData._id, servicesUpdate as any)
        .subscribe({
          next: (response) => {
            console.log('Dịch vụ đã được cập nhật', response);
            // Cập nhật lại dữ liệu phòng
            this.fetchCurrentRoom();
          },
          error: (error) => console.error('Lỗi khi cập nhật dịch vụ:', error)
        });
    }
    
    // Không lưu vào session nữa, dữ liệu sẽ được lưu vào RoomEvent khi checkout
    
    // Cập nhật tổng tiền
    this.calculateTotalPrice();
  }

  // Tính tổng tiền
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
    
    console.log('Calculating price based on check-in data:', lastCheckIn);
    
    // Kiểm tra và validate checkinTime
    let checkInTime: Date;
    if (lastCheckIn.checkinTime) {
      checkInTime = new Date(lastCheckIn.checkinTime);
      // Kiểm tra xem Date có hợp lệ không
      if (isNaN(checkInTime.getTime())) {
        console.warn('[calculateTotalPrice] Invalid checkinTime, using current time UTC+7:', lastCheckIn.checkinTime);
        checkInTime = this.getUTCTimePlus7();
      }
    } else {
      console.warn('[calculateTotalPrice] No checkinTime found, using current time UTC+7');
      checkInTime = this.getUTCTimePlus7();
    }
    
    const checkOutTime = this.getUTCTimePlus7();
    
    // Kiểm tra xem checkOutTime có hợp lệ không
    if (isNaN(checkOutTime.getTime())) {
      console.error('[calculateTotalPrice] Invalid checkOutTime');
      this.totalPrice = 0;
      this._hasRoomPriceFromAPI = false;
      return;
    }
    
    // Đảm bảo checkInTime không lớn hơn checkOutTime
    if (checkInTime.getTime() >= checkOutTime.getTime()) {
      console.warn('[calculateTotalPrice] Check-in time is after or equal to check-out time, using 1 hour before check-out for check-in');
      checkInTime = new Date(checkOutTime.getTime() - 3600000); // 1 giờ trước
    }
    
    // Tính thời gian chính xác theo phút
    const durationInMilliseconds = checkOutTime.getTime() - checkInTime.getTime();
    const durationInMinutes = Math.floor(durationInMilliseconds / (1000 * 60));
    const durationInHours = Math.floor(durationInMinutes / 60);
    const remainingMinutes = durationInMinutes % 60;
    const durationInDays = Math.ceil(durationInHours / 24);
    
    // Đảm bảo duration không âm và có giá trị tối thiểu
    // Nếu duration quá nhỏ (dưới 1 giờ), vẫn tính ít nhất 1 giờ để tránh lỗi tính toán
    const validDurationInHours = Math.max(1, durationInHours); // Tối thiểu 1 giờ
    const validDurationInDays = Math.max(1, durationInDays);
    
    // Xác định loại giá và tính tiền phòng
    // Ưu tiên lấy rateType từ form checkout nếu có, nếu không thì lấy từ lastCheckIn
    const rateType = this.checkOutForm?.get('rateType')?.value || lastCheckIn.rateType || 'hourly';
    
    // Log thông tin tính toán thời gian (chỉ khi Date hợp lệ)
    if (!isNaN(checkInTime.getTime()) && !isNaN(checkOutTime.getTime())) {
      console.log(`[calculateTotalPrice] Check-in time: ${checkInTime.toISOString()}`);
      console.log(`[calculateTotalPrice] Check-out time: ${checkOutTime.toISOString()}`);
      console.log(`[calculateTotalPrice] Duration in hours: ${validDurationInHours}`);
      console.log(`[calculateTotalPrice] Duration in minutes: ${durationInMinutes}`);
      console.log(`[calculateTotalPrice] RateType: ${rateType}`);
    } else {
      console.error('[calculateTotalPrice] Invalid dates:', { checkInTime, checkOutTime });
    }
    
    // Gọi backend API để tính giá chính xác theo priceConfig
    this.roomsService.calculateRoomPrice(
      this.roomData._id,
      checkInTime,
      checkOutTime,
      rateType as 'hourly' | 'daily' | 'nightly'
    ).subscribe({
      next: (priceResponse) => {
        // Cập nhật rateType từ backend (có thể đã được tự động chuyển đổi)
        const finalRateType = priceResponse.rateType || rateType;
        
        // Cập nhật rateType trong form nếu đã thay đổi
        if (priceResponse.originalRateType && priceResponse.rateType !== priceResponse.originalRateType) {
          this.checkOutForm.patchValue({ rateType: finalRateType }, { emitEvent: false });
          console.log(`RateType tự động chuyển từ ${priceResponse.originalRateType} sang ${finalRateType}`);
        }
        
        // Sử dụng giá từ backend
        const roomPrice = priceResponse.totalPrice || 0;
        this._roomPriceTotal = roomPrice;
        this._hasRoomPriceFromAPI = true; // Đánh dấu đã có giá trị từ API
        
        console.log(`Room price (${finalRateType}): ${roomPrice}`, {
          rateType: finalRateType,
          originalRateType: priceResponse.originalRateType,
          formRateType: this.checkOutForm?.get('rateType')?.value,
          lastCheckInRateType: lastCheckIn.rateType,
          priceDetails: priceResponse.priceDetails,
          _roomPriceTotal: this._roomPriceTotal,
          _hasRoomPriceFromAPI: this._hasRoomPriceFromAPI
        });
        
        // Force change detection để cập nhật UI
        this.cdr.detectChanges();
        
        // Tính tổng tiền dịch vụ
        const serviceTotal = this.selectedServices.reduce((total, service) => {
          // Sử dụng totalPrice nếu có, nếu không thì tính từ price và quantity
          const serviceAmount = service.totalPrice !== undefined ? 
            service.totalPrice : (service.price * (service.quantity || 1));
          return total + serviceAmount;
        }, 0);
        this._servicesPriceTotal = serviceTotal; // Lưu tổng tiền dịch vụ
        console.log(`Service total: ${serviceTotal}`);
        
        // Lấy giá trị phụ thu và giảm giá TỪ FORM CHECKOUT
        const checkoutCharges = +(this.checkOutForm?.get('additionalCharges')?.value || 0);
        const checkoutDiscount = +(this.checkOutForm?.get('discount')?.value || 0);
        
        // Tổng cộng = Tiền phòng + Tổng DV + Phụ thu (checkin + checkout) - Giảm giá (checkin + checkout)
        const subtotal = roomPrice + serviceTotal;
        this.totalPrice = Math.max(0, subtotal + this.initialCharges + checkoutCharges - this.initialDiscount - checkoutDiscount);
        
        // Lấy tiền trả trước (luôn lấy từ initial state hoặc checkin event)
        const lastCheckInEvent = this.listData && this.listData.length > 0 ? this.listData[0] : null;
        this.advancePayment = lastCheckInEvent?.advancePayment || 0;
        
        console.log(`Final price calculation: ${roomPrice} (room) + ${serviceTotal} (services) + ${this.initialCharges} (initial charges) + ${checkoutCharges} (checkout charges) - ${this.initialDiscount} (initial discount) - ${checkoutDiscount} (checkout discount) = ${this.totalPrice}`);
      },
      error: (error) => {
        console.error('[calculateTotalPrice] Error calculating room price from backend:', error);
        console.error('[calculateTotalPrice] Error details:', {
          status: error.status,
          statusText: error.statusText,
          message: error.message,
          url: error.url,
          error: error.error
        });
        // Fallback: sử dụng tính toán frontend đơn giản
        // Đảm bảo validDurationInHours tối thiểu là 1 để tránh lỗi tính toán
        const safeDurationInHours = Math.max(1, validDurationInHours);
        const safeDurationInDays = Math.max(1, validDurationInDays);
        console.log(`[calculateTotalPrice] Using fallback calculation with duration: ${safeDurationInHours} hours, rateType: ${rateType}`);
        const roomPrice = this.calculateRoomTotalByRateType(safeDurationInHours, safeDurationInDays, rateType, remainingMinutes);
        this._roomPriceTotal = roomPrice;
        this._hasRoomPriceFromAPI = true; // Đánh dấu đã tính toán (dù là fallback)
        
        console.log(`[calculateTotalPrice] Fallback room price calculated: ${roomPrice}`);
        
        // Force change detection để cập nhật UI
        this.cdr.detectChanges();
        
        // Tính tổng tiền dịch vụ
        const serviceTotal = this.selectedServices.reduce((total, service) => {
          const serviceAmount = service.totalPrice !== undefined ? 
            service.totalPrice : (service.price * (service.quantity || 1));
          return total + serviceAmount;
        }, 0);
        this._servicesPriceTotal = serviceTotal;
        
        // Lấy giá trị phụ thu và giảm giá TỪ FORM CHECKOUT
        const checkoutCharges = +(this.checkOutForm?.get('additionalCharges')?.value || 0);
        const checkoutDiscount = +(this.checkOutForm?.get('discount')?.value || 0);
        
        // Tổng cộng
        const subtotal = roomPrice + serviceTotal;
        this.totalPrice = Math.max(0, subtotal + this.initialCharges + checkoutCharges - this.initialDiscount - checkoutDiscount);
        
        // Lấy tiền trả trước
        const lastCheckInEvent = this.listData && this.listData.length > 0 ? this.listData[0] : null;
        this.advancePayment = lastCheckInEvent?.advancePayment || 0;
      }
    });
  }

  // Xử lý check-in
  processCheckIn(): void {
    // Kiểm tra trạng thái phòng
    if (this.roomData.status !== 'vacant') {
      this.message.error(`Phòng ${this.roomData.roomNumber} không sẵn sàng để nhận phòng (Trạng thái hiện tại: ${this.getStatusLabel(this.roomData.status)}).`);
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
      phone: guestInfoForm.phone || '',
      email: guestInfoForm.email || '',
      address: guestInfoForm.address || '',
      guestSource: guestSourceValue || 'walkin' // Sử dụng giá trị từ form control
    };
    
    // Log để debug
    console.log('Check-in guestInfo from form:', {
      guestInfoFormGroupValue: guestInfoFormGroup?.value,
      guestInfoFormGroupRawValue: guestInfoFormGroup?.getRawValue(),
      guestInfoForm: guestInfoForm,
      guestSourceControl: guestSourceControl?.value,
      guestSourceControlRaw: guestSourceControl?.getRawValue(),
      guestSourceValue: guestSourceValue,
      guestInfo: guestInfo,
      finalGuestSource: guestInfo.guestSource
    });
    
    // Đảm bảo advancePayment luôn là số, mặc định 0
    const advancePayment = Number(this.checkInForm.get('advancePayment')?.value) || 0;
    const additionalCharges = Number(this.checkInForm.get('additionalCharges')?.value) || 0;
    const discount = Number(this.checkInForm.get('discount')?.value) || 0;
    
    const checkinEventData = {
        type: 'checkin',
        checkinTime: checkinTime, // Sử dụng thời gian đã tạo
        guestInfo: guestInfo,
        paymentMethod: this.checkInForm.get('paymentMethod')?.value || 'cash',
        rateType: this.checkInForm.get('rateType')?.value || 'hourly',
        advancePayment: advancePayment, // Đảm bảo là số
        additionalCharges: additionalCharges, // Đảm bảo là số
        discount: discount, // Đảm bảo là số
        notes: this.checkInForm.get('notes')?.value || '',
        selectedServices: this.selectedServices || []
      };

    const newRoom = {
      status: 'occupied',
      events: [
        ...this.roomData.events || [],
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
          paymentMethod: this.checkInForm.get('paymentMethod')?.value,
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
            this.message.success('Nhận phòng thành công');
            
            // Log để debug - dữ liệu đã được lưu vào RoomEvent qua backend
            console.log('Check-in data saved to RoomEvent:', {
              guestInfo: checkinEventData.guestInfo,
              guestSource: checkinEventData.guestInfo?.guestSource, // Log riêng guestSource
              advancePayment: advancePayment,
              additionalCharges: additionalCharges,
              discount: discount
            });
            
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
            this.roomsService.notifyRoomDataUpdated();
          }, 100);
        },
        (error) => {
          setTimeout(() => {
            this.message.error('Lỗi khi nhận phòng: ' + error.message);
            this.roomsService.notifyRoomDataUpdated();
          }, 100);
        }
      );
  }

  // Xử lý checkout
  processCheckOut(): void {
    // Kiểm tra trạng thái phòng
    if (this.roomData.status !== 'occupied') {
      this.message.error(`Phòng ${this.roomData.roomNumber} hiện không có khách để trả phòng (Trạng thái: ${this.getStatusLabel(this.roomData.status)}).`);
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
        checkInTime = new Date(lastCheckinEvent.checkinTime);
      }
    }
    
    if (!lastCheckinEvent) {
      this.message.error('Không tìm thấy thông tin check-in từ RoomEvent');
      this.isLoading = false;
      return;
    }
    
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
    
    // Lấy giá trị phụ thu và giảm giá, đảm bảo là số
    const additionalCharges = Number(this.checkOutForm.get('additionalCharges')?.value) || 0;
    const discount = Number(this.checkOutForm.get('discount')?.value) || 0;
    
    // Trừ tiền đã trả trước (nếu có) - lấy từ lastCheckinEvent
    const advancePayment = Number(lastCheckinEvent.advancePayment) || 0;
    
    // Gọi backend API để tính giá và tự động cập nhật rateType nếu cần
    this.roomsService.calculateRoomPrice(
      this.roomData._id,
      checkInTime,
      currentTime,
      rateType as 'hourly' | 'daily' | 'nightly'
    ).subscribe({
      next: (priceResponse) => {
        // Cập nhật rateType từ backend (có thể đã được tự động chuyển đổi)
        const finalRateType = priceResponse.rateType || rateType;
        rateType = finalRateType;
        
        // Cập nhật rateType trong form nếu đã thay đổi
        if (priceResponse.originalRateType && priceResponse.rateType !== priceResponse.originalRateType) {
          this.checkOutForm.patchValue({ rateType: finalRateType }, { emitEvent: false });
          console.log(`RateType tự động chuyển từ ${priceResponse.originalRateType} sang ${finalRateType}`);
        }
        
        // Sử dụng giá từ backend
        const roomTotal = priceResponse.totalPrice || 0;
        
        // Tính tổng tiền cuối cùng
        const grandTotal = roomTotal + servicesTotal + additionalCharges - discount;
        const remainingAmount = grandTotal - advancePayment;
        
        // Tiếp tục xử lý checkout với giá đã tính
        this.processCheckoutWithPrice(
          roomTotal, 
          finalRateType, 
          lastCheckinEvent, 
          customerName, 
          customerPhone, 
          customerEmail, 
          guestSource, 
          formGuestInfo, 
          advancePayment, 
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
      error: (error) => {
        console.error('Error calculating room price from backend:', error);
        // Fallback: sử dụng tính toán frontend
        const roomTotal = this.calculateRoomTotalByRateType(durationInHours, durationInDays, rateType, remainingMinutes);
        const grandTotal = roomTotal + servicesTotal + additionalCharges - discount;
        const remainingAmount = grandTotal - advancePayment;
        
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
    
    // Tạm thời return để đợi API response
    return;
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
    // Đảm bảo roomTotal có giá trị hợp lệ
    // Nếu roomTotal là 0 hoặc undefined, sử dụng _roomPriceTotal hoặc tính lại
    let validRoomTotal = roomTotal;
    if (!validRoomTotal || validRoomTotal <= 0) {
      console.warn('[processCheckoutWithPrice] roomTotal is invalid, using _roomPriceTotal:', {
        roomTotal,
        _roomPriceTotal: this._roomPriceTotal
      });
      validRoomTotal = this._roomPriceTotal || 0;
      
      // Nếu vẫn không có giá trị, tính lại từ calculateRoomTotalByRateType
      if (!validRoomTotal || validRoomTotal <= 0) {
        const remainingMinutes = 0;
        validRoomTotal = this.calculateRoomTotalByRateType(durationInHours, durationInDays, rateType, remainingMinutes);
        console.warn('[processCheckoutWithPrice] Recalculated roomTotal:', validRoomTotal);
      }
    }
    
    console.log('[processCheckoutWithPrice] Final roomTotal:', validRoomTotal);
    // Chuẩn bị dữ liệu checkout
    const paymentMethod = this.checkOutForm.get('paymentMethod')?.value;
    const checkoutData = {
      status: 'dirty',
      paymentStatus: paymentMethod === 'transfer' ? 'pending' : 'paid', // Pending nếu chuyển khoản, paid nếu tiền mặt/thẻ
      checkoutTime: currentTime,
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
      // Gửi thông tin khách hàng để backend sử dụng
      customerName: customerName,
      customerPhone: customerPhone && customerPhone !== 'N/A' ? customerPhone : undefined,
      customerEmail: customerEmail && customerEmail !== 'N/A' ? customerEmail : undefined,
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
          checkoutTime: currentTime,
          amount: grandTotal,
          rateType: rateType, // Thêm rateType đã được tính toán từ backend
          paymentMethod: paymentMethod,
          staffId: localStorage.getItem('staffId') || undefined,
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
    
    // Log để debug
    console.log('Checkout data being sent to backend:', {
      guestInfo: checkoutData.guestInfo,
      guestSource: checkoutData.guestInfo.guestSource,
      rateType: rateType,
      roomTotal: roomTotal,
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
      hotelId: this.roomData.hotelId || 
               localStorage.getItem('selectedHotelId') || 
               localStorage.getItem('hotelId'),
      invoiceNumber: 'INV-' + Date.now(),
      date: new Date(),
      staffName: localStorage.getItem('staffName') || 'Nhân viên',
      staffId: localStorage.getItem('staffId') || undefined,
      customerName: customerName, // Sử dụng tên khách đã lấy từ nhiều nguồn
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
        address: formGuestInfo.address || '',
        guestSource: guestSource // Thêm guestSource vào guestInfo
      },
      guestSource: guestSource // Thêm guestSource trực tiếp vào invoiceData để dễ truy cập
    };
    
    // Kiểm tra nếu payment method là 'transfer' (chuyển khoản)
    if (paymentMethod === 'transfer') {
      // Tạo payment history SePay và hiển thị QR code
      this.handleTransferPayment(remainingAmount, invoiceData, checkoutData);
    } else {
      // Đóng modal ngay lập tức và thực hiện checkout
      if (this.modalRef) {
        this.modalRef.close();
      }
      
      // Thực hiện checkout trong background
      this.roomsService.checkOutRoom(this.roomData._id, checkoutData)
        .subscribe(
          (response) => {
            setTimeout(() => {
              this.message.success('Trả phòng thành công');
              
              // Dữ liệu đã được lưu vào RoomEvent qua backend, không cần xóa session nữa
              
              // Tự động tắt công tắc điện khi check-out để tiết kiệm điện
              this.tuyaService.autoTurnOffOnCheckOut(this.roomData._id).subscribe({
                next: (response) => {
                  if (response.data && response.data.devicesControlled > 0) {
                    console.log(`Đã tự động tắt ${response.data.devicesControlled} công tắc điện để tiết kiệm điện`);
                  }
                },
                error: (error) => {
                  console.error('Lỗi khi tự động tắt công tắc:', error);
                  // Không hiển thị lỗi để không làm phiền user
                }
              });
              
              // Cập nhật danh sách phòng
              this.roomsService.notifyRoomDataUpdated();
              
              // Chỉ hiển thị hóa đơn nếu đã thanh toán (không phải chuyển khoản pending)
              // Nếu paymentMethod là 'transfer', paymentStatus sẽ là 'pending' và không hiển thị hóa đơn
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
              this.message.error('Lỗi khi trả phòng: ' + error.message);
              this.roomsService.notifyRoomDataUpdated();
            }, 100);
          }
        );
    }
  }
  
  /**
   * Xử lý thanh toán chuyển khoản với SePay
   */
  handleTransferPayment(amount: number, invoiceData: any, checkoutData: any): void {
    // Lấy userId từ currentUser hoặc localStorage
    const userId = this.currentUser?._id || this.currentUser?.id || localStorage.getItem('userId');
    
    if (!userId) {
      this.message.error('Không tìm thấy thông tin người dùng');
      return;
    }
    
    // ƯU TIÊN 1: Lấy QR code từ hotel (doanh nghiệp)
    let qrPaymentUrl = '';
    let beneficiaryName = '';
    let bankName = '';
    let accountNumber = '';
    
    if (this.hotelBankAccount?.qrPaymentUrl) {
      // Hotel có QR code
      qrPaymentUrl = this.hotelBankAccount.qrPaymentUrl;
      beneficiaryName = this.hotelBankAccount.beneficiaryName || this.hotelBankAccount.accountHolderName || '';
      bankName = this.hotelBankAccount.bankName || '';
      accountNumber = this.hotelBankAccount.accountNumber || '';
      console.log('Sử dụng QR code từ hotel:', { qrPaymentUrl, beneficiaryName, bankName, accountNumber });
    } else {
      // ƯU TIÊN 2: Lấy QR code từ manager của hotel (nếu có)
      const manager = this.businessInfo?.managerId;
      if (manager && typeof manager === 'object' && manager.bankAccount?.qrPaymentUrl) {
        qrPaymentUrl = manager.bankAccount.qrPaymentUrl;
        beneficiaryName = manager.bankAccount.beneficiaryName || manager.bankAccount.accountHolderName || '';
        bankName = manager.bankAccount.bankName || '';
        accountNumber = manager.bankAccount.accountNumber || '';
        console.log('Sử dụng QR code từ manager của hotel:', { qrPaymentUrl, beneficiaryName, bankName, accountNumber });
      } else {
        // ƯU TIÊN 3: Lấy QR code từ user hiện tại (admin/staff của hotel)
        qrPaymentUrl = this.currentUser?.bankAccount?.qrPaymentUrl || '';
        beneficiaryName = this.currentUser?.bankAccount?.beneficiaryName || this.currentUser?.bankAccount?.accountHolderName || '';
        bankName = this.currentUser?.bankAccount?.bankName || '';
        accountNumber = this.currentUser?.bankAccount?.accountNumber || '';
        console.log('Sử dụng QR code từ user hiện tại (admin/staff):', { qrPaymentUrl, beneficiaryName, bankName, accountNumber });
      }
    }
    
    if (!qrPaymentUrl) {
      this.message.warning('Chưa có QR code thanh toán. Vui lòng cập nhật thông tin ngân hàng cho khách sạn hoặc trong profile.');
      // Vẫn tiếp tục checkout nhưng không hiển thị QR
      this.proceedWithCheckout(checkoutData, invoiceData);
      return;
    }
    
    // Tạo payment history SePay
    // Gọi trực tiếp API với roomId và roomNumber
    const payload = {
      userId: userId,
      amount: amount,
      currency: 'VND',
      description: `Thanh toán phòng ${this.roomData.roomNumber} - ${invoiceData.customerName || 'Khách lẻ'}`,
      roomId: this.roomData._id,
      roomNumber: this.roomData.roomNumber
    };
    
    this.isLoading = true;
    this.sepayService.createPaymentHistoryForRoom(payload).subscribe({
      next: (response: any) => {
        this.isLoading = false;
        if (response.success) {
          // Lưu thông tin payment
          this.sepayPaymentCode = response.paymentCode;
          this.sepayAmount = amount;
          this.sepayQrUrl = qrPaymentUrl;
          this.sepayBeneficiaryName = beneficiaryName;
          this.sepayBankName = bankName;
          this.sepayAccountNumber = accountNumber;
          this.sepayPaymentHistoryId = response.paymentHistoryId || ''; // Lưu paymentHistoryId để kiểm tra trạng thái
          
          // Hiển thị modal với QR code và thông tin thanh toán
          this.showSePayModal = true;
          
          // Lưu checkoutData và invoiceData để sử dụng sau khi đóng modal QR
          (this as any)._pendingCheckoutData = checkoutData;
          (this as any)._pendingInvoiceData = invoiceData;
          
          // Không bắt đầu polling - người dùng có thể đóng modal và hiển thị invoice ngay
          // Webhook sẽ tự động cập nhật trạng thái sau
        } else {
          this.message.error(response.error || 'Có lỗi xảy ra khi tạo payment history');
          // Vẫn tiếp tục checkout
          this.proceedWithCheckout(checkoutData, invoiceData);
        }
      },
      error: (error: any) => {
        this.isLoading = false;
        console.error('Error creating SePay payment history:', error);
        this.message.error('Có lỗi xảy ra khi tạo payment history. Vui lòng thử lại.');
        // Vẫn tiếp tục checkout
        this.proceedWithCheckout(checkoutData, invoiceData);
      }
    });
  }
  
  /**
   * Thực hiện checkout sau khi đã tạo payment history
   */
  proceedWithCheckout(checkoutData: any, invoiceData: any): void {
    // Đóng modal
    if (this.modalRef) {
      this.modalRef.close();
    }
    
    // Kiểm tra paymentStatus - chỉ hiển thị hóa đơn nếu đã thanh toán
    const paymentStatus = checkoutData.paymentStatus || 'paid';
    const shouldShowInvoice = paymentStatus === 'paid';
    
    // Thực hiện checkout trong background
    this.roomsService.checkOutRoom(this.roomData._id, checkoutData)
      .subscribe(
        (response) => {
          setTimeout(() => {
            if (paymentStatus === 'pending') {
              this.message.success('Trả phòng thành công. Đang chờ xác nhận thanh toán...');
            } else {
              this.message.success('Trả phòng thành công');
            }
            
            // Tự động tắt công tắc điện khi check-out để tiết kiệm điện
            this.tuyaService.autoTurnOffOnCheckOut(this.roomData._id).subscribe({
              next: (response) => {
                if (response.data && response.data.devicesControlled > 0) {
                  console.log(`Đã tự động tắt ${response.data.devicesControlled} công tắc điện để tiết kiệm điện`);
                }
              },
              error: (error) => {
                console.error('Lỗi khi tự động tắt công tắc:', error);
              }
            });
            
            // Cập nhật danh sách phòng
            this.roomsService.notifyRoomDataUpdated();
            
            // Chỉ hiển thị hóa đơn nếu đã thanh toán (paymentStatus = 'paid')
            // Nếu chưa thanh toán (pending), hóa đơn sẽ được hiển thị sau khi webhook xác nhận
            if (shouldShowInvoice) {
              setTimeout(() => {
                this.showInvoice(invoiceData);
              }, 200);
            }
          }, 100);
        },
        (error) => {
          setTimeout(() => {
            this.message.error('Lỗi khi trả phòng: ' + error.message);
            this.roomsService.notifyRoomDataUpdated();
          }, 100);
        }
      );
  }
  
  /**
   * Bắt đầu kiểm tra trạng thái thanh toán (polling)
   */
  private startPaymentStatusPolling(): void {
    // Dừng interval cũ nếu có
    if (this.paymentStatusCheckInterval) {
      clearInterval(this.paymentStatusCheckInterval);
    }
    
    // Kiểm tra mỗi 5 giây, tối đa 5 phút (60 lần)
    let checkCount = 0;
    const maxChecks = 60;
    
    this.paymentStatusCheckInterval = setInterval(() => {
      checkCount++;
      
      if (!this.sepayPaymentCode && !this.sepayPaymentHistoryId) {
        this.stopPaymentStatusPolling();
        return;
      }
      
      // Kiểm tra trạng thái thanh toán
      // Tìm payment history bằng paymentCode (sepayInvoiceNumber) hoặc paymentHistoryId
      this.sepayService.getPaymentHistory({
        limit: 100, // Lấy nhiều hơn để tìm được payment history
        skip: 0
      }).subscribe({
        next: (response: any) => {
          // Tìm payment history với paymentCode hoặc ID tương ứng
          const paymentHistories = Array.isArray(response) 
            ? response 
            : (response.data || []);
          
          // Tìm bằng paymentCode (sepayInvoiceNumber) hoặc paymentHistoryId
          const paymentHistory = paymentHistories.find((p: any) => {
            // Tìm bằng paymentCode (sepayInvoiceNumber)
            if (this.sepayPaymentCode && (p.sepayInvoiceNumber === this.sepayPaymentCode || p.paymentCode === this.sepayPaymentCode)) {
              return true;
            }
            // Tìm bằng paymentHistoryId
            if (this.sepayPaymentHistoryId && (p._id === this.sepayPaymentHistoryId || p.id === this.sepayPaymentHistoryId)) {
              return true;
            }
            return false;
          });
          
          if (paymentHistory) {
            // Kiểm tra trạng thái thanh toán
            if (paymentHistory.status === 'completed' || paymentHistory.status === 'paid') {
              // Thanh toán thành công
              this.stopPaymentStatusPolling();
              this.onPaymentSuccess();
            } else if (paymentHistory.status === 'failed' || paymentHistory.status === 'cancelled') {
              // Thanh toán thất bại
              this.stopPaymentStatusPolling();
              this.message.warning('Thanh toán đã bị hủy hoặc thất bại. Vui lòng thử lại.');
            }
          }
          
          // Dừng polling sau maxChecks lần
          if (checkCount >= maxChecks) {
            this.stopPaymentStatusPolling();
            console.log('Đã kiểm tra trạng thái thanh toán tối đa, dừng polling');
          }
        },
        error: (error) => {
          console.error('Error checking payment status:', error);
          // Tiếp tục polling nếu chưa đạt maxChecks
          if (checkCount >= maxChecks) {
            this.stopPaymentStatusPolling();
          }
        }
      });
    }, 5000); // Kiểm tra mỗi 5 giây
  }
  
  /**
   * Dừng kiểm tra trạng thái thanh toán
   */
  private stopPaymentStatusPolling(): void {
    if (this.paymentStatusCheckInterval) {
      clearInterval(this.paymentStatusCheckInterval);
      this.paymentStatusCheckInterval = null;
    }
  }
  
  /**
   * Xử lý khi thanh toán thành công
   */
  private onPaymentSuccess(): void {
    console.log('[onPaymentSuccess] Thanh toán thành công, đóng modal QR và hiển thị invoice');
    
    // Dừng polling
    this.stopPaymentStatusPolling();
    
    // Đóng modal QR trước (tự động đóng)
    this.showSePayModal = false;
    
    // Force change detection để đảm bảo modal đóng ngay lập tức
    this.cdr.detectChanges();
    
    // Lấy checkoutData và invoiceData đã lưu
    const checkoutData = (this as any)._pendingCheckoutData;
    const invoiceData = (this as any)._pendingInvoiceData;
    
    if (checkoutData && invoiceData) {
      // Cập nhật paymentStatus thành 'paid'
      checkoutData.paymentStatus = 'paid';
      invoiceData.paymentStatus = 'paid';
      
      // Hiển thị thông báo thành công
      this.message.success('Thanh toán thành công! Đang hiển thị hóa đơn...');
      
      // Đợi một chút để modal QR đóng hoàn toàn trước khi đóng modal checkout
      setTimeout(() => {
        // Đóng modal checkout
        if (this.modalRef) {
          this.modalRef.close();
        }
        
        // Cập nhật checkout với paymentStatus = 'paid' trong background
        this.roomsService.checkOutRoom(this.roomData._id, checkoutData)
          .subscribe(
            (response) => {
              // Cập nhật danh sách phòng
              this.roomsService.notifyRoomDataUpdated();
              
              // Hiển thị invoice sau khi checkout thành công
              setTimeout(() => {
                this.showInvoice(invoiceData);
              }, 500);
            },
            (error) => {
              console.error('Error updating checkout with payment status:', error);
              // Vẫn hiển thị invoice ngay cả khi có lỗi
              setTimeout(() => {
                this.showInvoice(invoiceData);
              }, 500);
            }
          );
      }, 300);
    } else {
      console.error('[onPaymentSuccess] Không tìm thấy checkoutData hoặc invoiceData');
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
    
    // Dừng polling nếu có
    this.stopPaymentStatusPolling();
    
    // Lấy checkoutData và invoiceData đã lưu
    const checkoutData = (this as any)._pendingCheckoutData;
    const invoiceData = (this as any)._pendingInvoiceData;
    
    if (checkoutData && invoiceData) {
      // Hiển thị thông báo
      this.message.info('Đã lưu thông tin thanh toán. Hệ thống sẽ tự động cập nhật trạng thái khi nhận được xác nhận từ ngân hàng.');
      
      // Đóng modal checkout
      if (this.modalRef) {
        this.modalRef.close();
      }
      
      // Thực hiện checkout với paymentStatus = 'pending' (webhook sẽ cập nhật sau)
      this.roomsService.checkOutRoom(this.roomData._id, checkoutData)
        .subscribe(
          (response) => {
            // Cập nhật danh sách phòng
            this.roomsService.notifyRoomDataUpdated();
            
            // Hiển thị invoice ngay lập tức
            setTimeout(() => {
              this.showInvoice(invoiceData);
            }, 300);
          },
          (error) => {
            console.error('Error during checkout:', error);
            // Vẫn hiển thị invoice ngay cả khi có lỗi
            setTimeout(() => {
              this.showInvoice(invoiceData);
            }, 300);
          }
        );
    } else {
      console.warn('[closeSePayModal] Không tìm thấy checkoutData hoặc invoiceData');
    }
  }
  
  /**
   * Copy mã thanh toán vào clipboard
   */
  copyPaymentCode(): void {
    if (this.sepayPaymentCode) {
      navigator.clipboard.writeText(this.sepayPaymentCode).then(() => {
        this.message.success('Đã copy mã thanh toán vào clipboard');
      });
    }
  }
  
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

  // Tính tiền phòng dựa trên loại giá
  calculateRoomTotalByRateType(durationInHours: number, durationInDays: number, rateType: string, remainingMinutes: number = 0): number {
    if (!this.roomData) return 0;
    
    // Lấy giá từ roomData hoặc priceConfig
    const priceConfig = (this.roomData as any)?.priceConfig;
    const hourlyRate = this.roomData.pricing?.hourly || this.roomData.firstHourRate || priceConfig?.hourlyRates?.firstHourPrice || 0;
    const dailyRate = this.roomData.pricing?.daily || priceConfig?.dailyRates?.standardPrice || 0;
    const nightlyRate = this.roomData.pricing?.nightly || priceConfig?.nightlyRates?.standardPrice || 0;
    const additionalHourRate = this.roomData.additionalHourRate || priceConfig?.hourlyRates?.additionalHourPrice || (hourlyRate * 0.8);
    
    // Lấy các tham số từ priceConfig hoặc giá trị mặc định
    const gracePeriodMinutes = priceConfig?.hourlyRates?.gracePeriodMinutes || 15;
    const autoNightlyHours = priceConfig?.hourlyRates?.autoNightlyHours || 8;
    const maxHoursBeforeDay = priceConfig?.hourlyRates?.maxHoursBeforeDay || 6;
    const autoDailyHours = priceConfig?.nightlyRates?.autoDailyHours || 24;
    
    // Lấy thời gian check-in và check-out để tính phụ thu
    const lastCheckIn = this.listData && this.listData.length > 0 ? this.listData[0] : null;
    const checkInTime = lastCheckIn?.checkinTime ? new Date(lastCheckIn.checkinTime) : null;
    const checkOutTime = this.getUTCTimePlus7();
    
    // Helper function để parse time string (HH:mm) thành giờ và phút
    const parseTime = (timeStr: string) => {
      const parts = timeStr.split(':');
      return {
        hour: parseInt(parts[0]) || 0,
        minute: parseInt(parts[1]) || 0
      };
    };
    
    // Helper function để tính số giờ sớm/trễ (tính chính xác theo phút, không làm tròn)
    const calculateEarlyHours = (actualTime: Date, standardTime: string): number => {
      const actual = parseTime(`${actualTime.getHours()}:${actualTime.getMinutes()}`);
      const standard = parseTime(standardTime);
      const actualMinutes = actual.hour * 60 + actual.minute;
      const standardMinutes = standard.hour * 60 + standard.minute;
      if (actualMinutes < standardMinutes) {
        return (standardMinutes - actualMinutes) / 60; // Trả về số giờ chính xác (có thể là số thập phân)
      }
      return 0;
    };
    
    const calculateLateHours = (actualTime: Date, standardTime: string): number => {
      const actual = parseTime(`${actualTime.getHours()}:${actualTime.getMinutes()}`);
      const standard = parseTime(standardTime);
      const actualMinutes = actual.hour * 60 + actual.minute;
      const standardMinutes = standard.hour * 60 + standard.minute;
      if (actualMinutes > standardMinutes) {
        return (actualMinutes - standardMinutes) / 60; // Trả về số giờ chính xác (có thể là số thập phân)
      }
      return 0;
    };
    
    // Lấy giá trị từ priceConfig hoặc giá trị mặc định
    const nightlyStartTime = priceConfig?.nightlyRates?.startTime || '22:00';
    const nightlyEndTime = priceConfig?.nightlyRates?.endTime || '12:00';
    const dailyCheckInTime = priceConfig?.dailyRates?.checkInTime || '14:00';
    const dailyCheckOutTime = priceConfig?.dailyRates?.checkOutTime || '12:00';
    const nightlyEarlyCheckinSurcharge = priceConfig?.nightlyRates?.earlyCheckinSurcharge || 0;
    const nightlyLateCheckoutSurcharge = priceConfig?.nightlyRates?.lateCheckoutSurcharge || 0;
    const dailyEarlyCheckinSurcharge = priceConfig?.dailyRates?.earlyCheckinSurcharge || 0;
    const dailyLateCheckoutFee = priceConfig?.dailyRates?.latecheckOutFee || 0;
    
    let total = 0;
    let priceDetails: any = {};
    
    // ƯU TIÊN: Sử dụng rateType từ user (theo logic backend)
    switch (rateType) {
      case 'hourly':
        // Lấy thời gian quy định cho nightly rate
        const firstHourPrice = this.roomData.firstHourRate || priceConfig?.hourlyRates?.firstHourPrice || hourlyRate;
        const additionalHourPrice = this.roomData.additionalHourRate || priceConfig?.hourlyRates?.additionalHourPrice || additionalHourRate;
        
        // Parse thời gian quy định
        const [nightlyStartHour, nightlyStartMinute] = nightlyStartTime.split(':').map(Number);
        const [nightlyEndHour, nightlyEndMinute] = nightlyEndTime.split(':').map(Number);
        
        // Tính thời gian check-in/check-out theo phút trong ngày
        let checkInMinutes = 0;
        let checkOutMinutes = 0;
        let nightlyStartMinutes = 0;
        let nightlyEndMinutes = 0;
        let isSameDay = true;
        
        if (checkInTime && checkOutTime) {
          checkInMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
          checkOutMinutes = checkOutTime.getHours() * 60 + checkOutTime.getMinutes();
          nightlyStartMinutes = nightlyStartHour * 60 + nightlyStartMinute;
          nightlyEndMinutes = nightlyEndHour * 60 + nightlyEndMinute;
          
          // Tính ngày check-in và check-out
          const checkInDateOnly = new Date(checkInTime.getFullYear(), checkInTime.getMonth(), checkInTime.getDate());
          const checkOutDateOnly = new Date(checkOutTime.getFullYear(), checkOutTime.getMonth(), checkOutTime.getDate());
          isSameDay = checkInDateOnly.getTime() === checkOutDateOnly.getTime();
        }
        
        // Kiểm tra xem có vượt qua khung giờ qua đêm không
        // Khung giờ qua đêm: từ nightlyStartTime (ví dụ 22:00) đến nightlyEndTime ngày hôm sau (ví dụ 12:00)
        let hasNightlyPeriod = false;
        let nightlyPrice = 0;
        let earlyCheckinSurcharge = 0;
        let lateCheckoutSurcharge = 0;
        let hoursBeforeNightly = 0;
        let hoursAfterNightly = 0;
        
        // Kiểm tra nếu check-out sau nightlyStartTime (cùng ngày) hoặc khác ngày
        if (checkInTime && checkOutTime && (!isSameDay || (isSameDay && checkOutMinutes > nightlyStartMinutes))) {
          hasNightlyPeriod = true;
          
          // Tính số giờ trước nightlyStartTime (nếu check-in trước nightlyStartTime)
          if (checkInMinutes < nightlyStartMinutes) {
            hoursBeforeNightly = (nightlyStartMinutes - checkInMinutes) / 60;
            
            // Chỉ tính phụ thu check-in sớm (KHÔNG tính giá theo giờ)
            if (nightlyEarlyCheckinSurcharge > 0) {
              earlyCheckinSurcharge = hoursBeforeNightly * nightlyEarlyCheckinSurcharge;
            }
          }
          
          // Tính giá qua đêm (luôn có nếu vào khung giờ qua đêm)
          nightlyPrice = nightlyRate;
          
          // Tính số giờ sau nightlyEndTime (nếu check-out sau nightlyEndTime)
          // Nếu cùng ngày: checkOutMinutes > nightlyEndMinutes
          // Nếu khác ngày: luôn có giờ sau nightlyEndTime
          if (!isSameDay || (isSameDay && checkOutMinutes > nightlyEndMinutes)) {
            if (isSameDay) {
              hoursAfterNightly = (checkOutMinutes - nightlyEndMinutes) / 60;
            } else {
              // Khác ngày: tính từ 0:00 đến checkOutMinutes
              hoursAfterNightly = checkOutMinutes / 60;
            }
            
            // Chỉ tính phụ thu check-out muộn (KHÔNG tính giá theo giờ)
            if (nightlyLateCheckoutSurcharge > 0) {
              lateCheckoutSurcharge = hoursAfterNightly * nightlyLateCheckoutSurcharge;
            }
          }
        }
        
        // Nếu không có khung giờ qua đêm, tính theo giờ bình thường
        if (!hasNightlyPeriod) {
          // Tính giá giờ đầu
          total = firstHourPrice;
          priceDetails.firstHourPrice = firstHourPrice;
          
          // Tính giá cho các giờ tiếp theo
          if (durationInHours >= 1) {
            let billableHours = durationInHours - 1; // Số giờ tính phí (trừ giờ đầu)
            
            // Nếu có thời gian dư sau giờ thứ 2
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
          
          // Kiểm tra nếu quá số giờ tự động chuyển sang qua đêm (nhưng chưa vào khung giờ qua đêm)
          if (durationInHours >= autoNightlyHours && nightlyRate > 0) {
            // Tự động chuyển sang tính qua đêm
            const durationInNights = Math.ceil(durationInHours / 24);
            total = durationInNights * nightlyRate;
            priceDetails = {
              basePrice: nightlyRate,
              rateType: 'nightly',
              nights: durationInNights,
              autoConverted: true,
              originalRateType: 'hourly'
            };
          } else if (durationInHours > maxHoursBeforeDay && dailyRate > 0) {
            // Chuyển sang tính giá ngày nếu vượt quá số giờ tối đa
            total = dailyRate;
            priceDetails = {
              basePrice: dailyRate,
              rateType: 'daily',
              autoConverted: true,
              originalRateType: 'hourly'
            };
          }
        } else {
          // Có khung giờ qua đêm: tính tổng = phụ thu check-in sớm + giá qua đêm + phụ thu check-out muộn
          total = earlyCheckinSurcharge + nightlyPrice + lateCheckoutSurcharge;
          
          priceDetails = {
            rateType: 'nightly',
            autoConverted: true,
            originalRateType: 'hourly',
            nightlyPrice: nightlyPrice,
            earlyCheckinSurcharge: earlyCheckinSurcharge,
            lateCheckoutSurcharge: lateCheckoutSurcharge,
            breakdown: {
              beforeNightly: hoursBeforeNightly > 0 ? {
                hours: hoursBeforeNightly,
                earlyCheckinSurcharge: earlyCheckinSurcharge,
                note: 'Chỉ tính phụ thu check-in sớm, không tính giá theo giờ'
              } : null,
              nightly: {
                price: nightlyPrice
              },
              afterNightly: hoursAfterNightly > 0 ? {
                hours: hoursAfterNightly,
                lateCheckoutSurcharge: lateCheckoutSurcharge,
                note: 'Chỉ tính phụ thu check-out muộn, không tính giá theo giờ'
              } : null
            }
          };
        }
        break;
        
      case 'daily':
        // Tính số ngày (làm tròn lên) - theo logic backend: Math.ceil(durationInHours / 24)
        // Backend: const durationInDays = Math.ceil(durationInHours / 24);
        //          totalPrice = durationInDays * priceConfig.dailyRates.standardPrice;
        // Đảm bảo durationInHours tối thiểu là 0 (backend không có Math.max)
        const safeDurationForDaily = Math.max(0, durationInHours);
        const durationInDaysCalculated = Math.ceil(safeDurationForDaily / 24);
        // Backend không có Math.max(1, ...), nhưng để tránh lỗi hiển thị, đảm bảo ít nhất 1 ngày nếu có thời gian
        const finalDays = safeDurationForDaily > 0 ? Math.max(1, durationInDaysCalculated) : 0;
        total = finalDays * dailyRate;
        priceDetails.basePrice = dailyRate;
        priceDetails.days = finalDays;
        priceDetails.rateType = 'daily';
        console.log(`Daily rate calculation: ${safeDurationForDaily} hours = ${finalDays} days * ${dailyRate} = ${total}`);
        break;
        
      case 'nightly':
        // Theo logic backend trong calculateRoomPriceHelper
        // Lấy thời gian quy định
        const [startHour2, startMinute2] = nightlyStartTime.split(':').map(Number);
        const [endHour2, endMinute2] = nightlyEndTime.split(':').map(Number);
        
        // Tính thời gian check-in/check-out theo phút trong ngày (theo backend)
        // Backend: const checkInMinutes2 = checkIn.getHours() * 60 + checkIn.getMinutes();
        //          const checkOutMinutes2 = checkOut.getHours() * 60 + checkOut.getMinutes();
        let checkInMinutes2 = 0;
        let checkOutMinutes2 = 0;
        const startTimeMinutes2 = startHour2 * 60 + startMinute2;
        const endTimeMinutes2 = endHour2 * 60 + endMinute2;
        
        if (checkInTime && checkOutTime) {
          checkInMinutes2 = checkInTime.getHours() * 60 + checkInTime.getMinutes();
          checkOutMinutes2 = checkOutTime.getHours() * 60 + checkOutTime.getMinutes();
        }
        
        // Đảm bảo durationInHours tối thiểu là 0 (backend không có Math.max)
        const safeDurationForNightly = Math.max(0, durationInHours);
        
        // Kiểm tra nếu vượt quá autoDailyHours thì tự động chuyển sang daily rate (theo logic backend)
        // Backend: if (durationInHours > autoDailyHours) {
        //            const durationInDays = Math.ceil(durationInHours / 24);
        //            totalPrice = durationInDays * priceConfig.dailyRates.standardPrice;
        if (safeDurationForNightly > autoDailyHours) {
          // Tự động chuyển sang daily rate
          const durationInDays2 = Math.ceil(safeDurationForNightly / 24);
          // Backend không có Math.max(1, ...), nhưng để tránh lỗi hiển thị, đảm bảo ít nhất 1 ngày nếu có thời gian
          const finalDays2 = safeDurationForNightly > 0 ? Math.max(1, durationInDays2) : 0;
          total = finalDays2 * dailyRate;
          priceDetails = {
            basePrice: dailyRate,
            rateType: 'daily',
            days: finalDays2,
            autoConverted: true,
            originalRateType: 'nightly',
            reason: `Vượt quá ${autoDailyHours} giờ (${safeDurationForNightly} giờ)`
          };
          console.log(`Nightly auto-converted to daily: ${safeDurationForNightly} hours > ${autoDailyHours} hours = ${finalDays2} days * ${dailyRate} = ${total}`);
        } else {
          // Tính giá qua đêm (theo logic backend)
          // Backend: const durationInNights = Math.ceil(durationInHours / 24);
          //          totalPrice = durationInNights * priceConfig.nightlyRates.standardPrice;
          const durationInNights = Math.ceil(safeDurationForNightly / 24);
          // Backend không có Math.max(1, ...), nhưng để tránh lỗi hiển thị, đảm bảo ít nhất 1 đêm nếu có thời gian
          const finalNights = safeDurationForNightly > 0 ? Math.max(1, durationInNights) : 0;
          total = finalNights * nightlyRate;
          priceDetails.basePrice = nightlyRate;
          priceDetails.rateType = 'nightly';
          priceDetails.nights = finalNights;
          
          console.log(`Nightly base calculation: ${safeDurationForNightly} hours = ${finalNights} nights * ${nightlyRate} = ${total}`);
          
          // Tính phụ thu check-in sớm (nếu check-in trước startTime) - theo logic backend
          // Backend: if (checkInMinutes2 < startTimeMinutes2) {
          //            earlyCheckinHours2 = (startTimeMinutes2 - checkInMinutes2) / 60;
          //            earlyCheckinSurcharge2 = earlyCheckinHours2 * (priceConfig.nightlyRates.earlyCheckinSurcharge || 0);
          let earlyCheckinHours2 = 0;
          if (checkInTime && checkInMinutes2 < startTimeMinutes2) {
            // Check-in sớm, tính số giờ sớm (chính xác theo phút)
            earlyCheckinHours2 = (startTimeMinutes2 - checkInMinutes2) / 60;
            const earlyCheckinSurcharge2 = earlyCheckinHours2 * (nightlyEarlyCheckinSurcharge || 0);
            if (earlyCheckinSurcharge2 > 0) {
              total += earlyCheckinSurcharge2;
              priceDetails.earlyCheckinHours = earlyCheckinHours2;
              priceDetails.earlyCheckinSurcharge = earlyCheckinSurcharge2;
              console.log(`Nightly early check-in surcharge: ${earlyCheckinHours2} hours * ${nightlyEarlyCheckinSurcharge} = ${earlyCheckinSurcharge2}`);
            }
          }
          
          // Tính phụ thu check-out muộn (nếu check-out sau endTime) - theo logic backend
          // Backend: if (checkOutMinutes2 > endTimeMinutes2) {
          //            lateCheckoutHours2 = (checkOutMinutes2 - endTimeMinutes2) / 60;
          //            lateCheckoutSurcharge2 = lateCheckoutHours2 * (priceConfig.nightlyRates.lateCheckoutSurcharge || 0);
          let lateCheckoutHours2 = 0;
          if (checkOutTime && checkOutMinutes2 > endTimeMinutes2) {
            // Check-out muộn, tính số giờ muộn (chính xác theo phút)
            lateCheckoutHours2 = (checkOutMinutes2 - endTimeMinutes2) / 60;
            const lateCheckoutSurcharge2 = lateCheckoutHours2 * (nightlyLateCheckoutSurcharge || 0);
            if (lateCheckoutSurcharge2 > 0) {
              total += lateCheckoutSurcharge2;
              priceDetails.lateCheckoutHours = lateCheckoutHours2;
              priceDetails.lateCheckoutSurcharge = lateCheckoutSurcharge2;
              console.log(`Nightly late check-out surcharge: ${lateCheckoutHours2} hours * ${nightlyLateCheckoutSurcharge} = ${lateCheckoutSurcharge2}`);
            }
          }
          
          console.log(`Nightly final total: ${total} (base: ${durationInNights * nightlyRate}, early: ${priceDetails.earlyCheckinSurcharge || 0}, late: ${priceDetails.lateCheckoutSurcharge || 0})`);
        }
        break;
        
      default:
        // Mặc định tính theo giờ
        total = hourlyRate * durationInHours;
    }
    
    return Math.max(0, Math.round(total));
  }

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
      this.message.error(`Phòng ${this.roomData.roomNumber} không ở trạng thái cần dọn dẹp hoặc bảo trì (Trạng thái: ${this.getStatusLabel(this.roomData.status)}).`);
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
    
    // Đóng modal ngay lập tức
    if (this.modalRef) {
      this.modalRef.close();
    }
    
    // Thực hiện clean room trong background
    this.roomsService.cleanRoom(this.roomData._id, newRoom)
      .subscribe(
        (room) => {
          setTimeout(() => {
            let successMessage = 'Đã cập nhật trạng thái phòng thành "Sẵn sàng"';
            if (this.roomData.status === 'maintenance') {
              successMessage = 'Đã hoàn thành bảo trì và cập nhật trạng thái phòng thành "Sẵn sàng"';
            }
            this.message.success(successMessage);
            
            // Không còn dùng session nữa, dữ liệu đã được lưu vào RoomEvent
            
            this.roomsService.notifyRoomDataUpdated();
          }, 100);
        },
        (error) => {
          setTimeout(() => {
            this.message.error('Lỗi khi cập nhật trạng thái phòng: ' + error.message);
            this.roomsService.notifyRoomDataUpdated();
          }, 100);
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

  // Thêm getter cho tiền phòng
  get roomPriceTotal(): number {
    // Chỉ tính giá khi modalType là 'checkout'
    if (this.modalType !== 'checkout') {
      return 0;
    }
    
    // Ưu tiên trả về giá trị đã tính từ calculateTotalPrice (từ backend API)
    // Sử dụng flag để biết đã có giá trị từ API
    if (this._hasRoomPriceFromAPI) {
      return this._roomPriceTotal;
    }
    
    // Nếu chưa có giá trị từ API, tính toán tạm thời để hiển thị
    // Fallback: tính toán local nếu chưa có giá trị từ API
    try {
      const lastCheckIn = this.listData && this.listData.length > 0 ? this.listData[0] : null;
      if (!lastCheckIn || !this.roomData) return 0;
      
      // Kiểm tra xem có phải là checkin event không
      if (lastCheckIn.type && lastCheckIn.type !== 'checkin') {
        return 0;
      }

      // Kiểm tra checkinTime
      if (!lastCheckIn.checkinTime) {
        return 0;
      }

      const checkInTime = new Date(lastCheckIn.checkinTime);
      
      // Kiểm tra Date hợp lệ
      if (isNaN(checkInTime.getTime())) {
        return 0;
      }
      
      const checkOutTime = this.getUTCTimePlus7();
      
      // Kiểm tra checkOutTime hợp lệ
      if (isNaN(checkOutTime.getTime())) {
        return 0;
      }
      
      // Đảm bảo checkInTime không lớn hơn checkOutTime
      if (checkInTime.getTime() > checkOutTime.getTime()) {
        return 0;
      }
      
      // Tính thời gian chính xác theo phút
      const durationInMilliseconds = checkOutTime.getTime() - checkInTime.getTime();
      const durationInMinutes = Math.floor(durationInMilliseconds / (1000 * 60));
      const durationInHours = Math.floor(durationInMinutes / 60);
      const remainingMinutes = durationInMinutes % 60;
      const durationInDays = Math.ceil(durationInHours / 24);
      
      // Ưu tiên lấy rateType từ form checkout nếu có, nếu không thì lấy từ lastCheckIn
      const rateType = this.checkOutForm?.get('rateType')?.value || lastCheckIn.rateType || 'hourly';

      // Tính toán tạm thời (sẽ được cập nhật khi API trả về)
      return this.calculateRoomTotalByRateType(Math.max(0, durationInHours), Math.max(1, durationInDays), rateType, remainingMinutes);
    } catch (error) {
      console.error('Error calculating room price:', error);
      return 0;
    }
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

  // Hiển thị hóa đơn
  showInvoice(invoiceData: any): void {
    // Đảm bảo hotelId luôn có trong invoiceData
    if (!invoiceData.hotelId) {
      invoiceData.hotelId = this.roomData?.hotelId || 
                            localStorage.getItem('selectedHotelId') || 
                            localStorage.getItem('hotelId');
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
      invoiceData.formattedCheckInTime = this.datePipe.transform(checkInDate, 'dd/MM/yyyy HH:mm');
    }

    if (invoiceData.checkOutTime) {
      const checkOutDate = new Date(invoiceData.checkOutTime);
      invoiceData.formattedCheckOutTime = this.datePipe.transform(checkOutDate, 'dd/MM/yyyy HH:mm');
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
        businessInfo: this.businessInfo
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
        phone: ['', [Validators.pattern('^[0-9]{10}$')]],
        email: ['', [Validators.email]],
        address: [''],
        guestSource: ['walkin'] // Mặc định là walkin
      }),
      paymentMethod: ['cash', [Validators.required]],
      rateType: ['hourly', [Validators.required]], // Thêm rateType với giá trị mặc định là 'hourly'
      notes: [''],
      additionalCharges: [0],
      discount: [0],
      reason: [''],
      advancePayment: [0, [Validators.min(0)]]
    });
    
    // Lắng nghe sự thay đổi của rateType để tính lại giá
    this.checkOutForm.get('rateType')?.valueChanges.subscribe((newRateType) => {
      console.log('RateType changed to:', newRateType);
      // Reset cached values để force recalculation
      this._roomPriceTotal = 0;
      this._hasRoomPriceFromAPI = false; // Reset flag khi rateType thay đổi
      // Tính lại giá ngay lập tức (không dùng setTimeout để tránh delay)
      this.calculateTotalPrice();
    });
    
    // Lắng nghe sự thay đổi của additionalCharges và discount để cập nhật tổng tiền
    this.checkOutForm.get('additionalCharges')?.valueChanges.subscribe(() => {
      setTimeout(() => {
        this.calculateTotalPrice();
      }, 0);
    });
    
    this.checkOutForm.get('discount')?.valueChanges.subscribe(() => {
      setTimeout(() => {
        this.calculateTotalPrice();
      }, 0);
    });
    
    // Lắng nghe sự thay đổi của advancePayment để cập nhật tổng tiền
    this.checkOutForm.get('advancePayment')?.valueChanges.subscribe(() => {
      this.advancePayment = this.checkOutForm.get('advancePayment')?.value || 0;
    });
  }
  
  // Lưu thông tin khách và tiền đặt trước
  saveGuestInfo(): void {
    if (!this.checkOutForm) {
      console.error('checkOutForm is not initialized');
      return;
    }
    
    if (!this.roomData || !this.roomData._id) {
      this.message.error('Không tìm thấy thông tin phòng.');
      return;
    }
    
    this.isSaving = true;
    
    // Lấy giá trị trực tiếp từ form control để đảm bảo lấy đúng
    const guestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
    
    // Lấy giá trị từ form control, sử dụng getRawValue() nếu form bị disable
    const guestInfo = guestInfoFormGroup ? 
      (guestInfoFormGroup.disabled ? guestInfoFormGroup.getRawValue() : guestInfoFormGroup.value) : 
      (this.checkOutForm.get('guestInfo')?.value || {});
    
    // Lấy guestSource trực tiếp từ form control để đảm bảo lấy đúng
    const guestSourceControl = guestInfoFormGroup?.get('guestSource');
    const guestSourceValue = guestSourceControl ? 
      (guestSourceControl.disabled ? guestSourceControl.getRawValue() : guestSourceControl.value) : 
      (guestInfo.guestSource || null);
    
    // Đảm bảo advancePayment luôn là số
    const advancePayment = Number(this.checkOutForm.get('advancePayment')?.value) || 0;
    
    // Lấy rateType từ form checkout (ưu tiên từ form, nếu không có thì lấy từ event)
    const rateType = this.checkOutForm?.get('rateType')?.value || 
                     (this.listData && this.listData.length > 0 ? this.listData[0].rateType : null) || 
                     'hourly';
    
    // Lấy guestSource từ form, nếu không có thì lấy từ events
    let guestSource = guestSourceValue || 'walkin';
    if (!guestSourceValue && this.roomData.events && this.roomData.events.length > 0) {
      // Thử lấy từ lastCheckinEvent (chỉ lấy event chưa checkout)
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
      roomId: this.roomData._id 
    });
    
    // Đảm bảo tên khách mặc định là "Khách lẻ" nếu không nhập và đảm bảo đầy đủ các trường
    const updatedGuestInfo = {
      name: guestInfo.name || 'Khách lẻ',
      idNumber: guestInfo.idNumber || '',
      phone: guestInfo.phone || '',
      email: guestInfo.email || '',
      address: guestInfo.address || '',
      guestSource: guestSourceValue || 'walkin' // Sử dụng giá trị từ form control
    };
    
    console.log('Updated guestInfo for save:', updatedGuestInfo);
    
    // Lấy thông tin check-in hiện tại
    const savedCheckinData = localStorage.getItem(`checkin_${this.roomData._id}`);
    let checkinData: any = {
      roomId: this.roomData._id,
      roomNumber: this.roomData.roomNumber,
      checkinTime: new Date(),
      guestInfo: updatedGuestInfo,
      advancePayment: advancePayment,
      rateType: rateType // Lưu rateType vào localStorage
    };
    
    if (savedCheckinData) {
      try {
        const existingData = JSON.parse(savedCheckinData);
        checkinData = {
          ...existingData,
          guestInfo: updatedGuestInfo,
          advancePayment: advancePayment,
          rateType: rateType // Cập nhật rateType
        };
      } catch (e) {
        console.error('Error parsing existing checkin data:', e);
      }
    }
    
    // Lưu vào localStorage
    localStorage.setItem(`checkin_${this.roomData._id}`, JSON.stringify(checkinData));
    
    // Cập nhật vào room.events nếu có event checkin (chỉ lấy event chưa checkout)
    if (this.roomData.events && this.roomData.events.length > 0) {
      const checkinEvents = this.getUncheckedOutCheckinEvents(this.roomData.events);
      if (checkinEvents.length > 0) {
        // Cập nhật event checkin với thông tin mới qua API (bao gồm rateType)
        this.roomsService.updateRoomCheckinInfo(
          this.roomData._id,
          updatedGuestInfo,
          advancePayment,
          rateType // Gửi rateType
        ).subscribe({
          next: (response) => {
            console.log('Update checkin info response:', response);
            this.message.success('Đã lưu thông tin khách và tiền đặt trước.');
            this.isSaving = false;
            
            // Dữ liệu đã được lưu vào RoomEvent qua backend, không cần cập nhật session nữa
            
            // Cập nhật listData ngay lập tức để hiển thị (bao gồm rateType)
            if (this.listData && this.listData.length > 0) {
              this.listData[0].guestInfo = updatedGuestInfo;
              this.listData[0].advancePayment = advancePayment;
              this.listData[0].rateType = rateType; // Cập nhật rateType
              this.advancePayment = advancePayment;
              console.log('Updated listData:', this.listData[0]);
            }
            
            // Cập nhật form với dữ liệu mới (bao gồm guestSource và rateType)
            const updatedGuestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
            if (updatedGuestInfoFormGroup) {
              // Enable form group trước khi patchValue
              if (updatedGuestInfoFormGroup.disabled) {
                updatedGuestInfoFormGroup.enable();
              }
              
              // Patch từng field riêng
              updatedGuestInfoFormGroup.patchValue({
                name: updatedGuestInfo.name,
                idNumber: updatedGuestInfo.idNumber,
                phone: updatedGuestInfo.phone,
                email: updatedGuestInfo.email,
                address: updatedGuestInfo.address
              }, { emitEvent: false });
              
              // Set guestSource riêng
              const guestSourceControl = updatedGuestInfoFormGroup.get('guestSource');
              if (guestSourceControl) {
                guestSourceControl.setValue(updatedGuestInfo.guestSource, { emitEvent: true });
                console.log('Updated form guestSource set to:', updatedGuestInfo.guestSource);
              }
            }
            
            // Cập nhật rateType trong form
            this.checkOutForm.patchValue({
              advancePayment: advancePayment,
              rateType: rateType // Cập nhật rateType trong form
            }, { emitEvent: false }); // Không emit event để tránh trigger calculateTotalPrice nhiều lần
            
            console.log('Updated form values:', this.checkOutForm.value);
            console.log('Updated guestSource:', updatedGuestInfo.guestSource);
            console.log('Updated rateType:', rateType);
            
            // Tính lại tiền sau khi lưu (vì rateType có thể đã thay đổi)
            setTimeout(() => {
              this.calculateTotalPrice();
            }, 100);
            
            // Reload lại room từ API để đảm bảo dữ liệu đồng bộ
            // excludeCheckedOut = true: chỉ lấy check-in events chưa checkout
            setTimeout(() => {
              this.roomsService.getRoomById(this.roomData._id, { 
                limit: 1000,
                excludeCheckedOut: true // Chỉ lấy check-in events chưa checkout
              }).subscribe({
                next: (updatedRoom) => {
                  this.roomData = updatedRoom;
                  
                  // Reload lại dữ liệu từ room mới
                  if (this.roomData.events && this.roomData.events.length > 0) {
                    // Sắp xếp events theo thời gian để lấy event checkin mới nhất
                    // Lọc các event check-in CHƯA CHECKOUT (chưa có event checkout tương ứng)
                    const checkinEvents = this.getUncheckedOutCheckinEvents(this.roomData.events);
                    
                    if (checkinEvents.length > 0) {
                      const lastCheckin = checkinEvents[0];
                      
                      console.log('Reloading unchecked out checkin event:', {
                        checkinTime: lastCheckin.checkinTime,
                        guestInfo: lastCheckin.guestInfo
                      });
                      
                      // Log để debug
                      console.log('Reloading from backend - lastCheckin:', {
                        lastCheckin: lastCheckin,
                        guestInfo: lastCheckin.guestInfo,
                        guestSource: lastCheckin.guestInfo?.guestSource,
                        fullEvent: JSON.stringify(lastCheckin, null, 2)
                      });
                      
                      // Cập nhật listData với dữ liệu từ backend (bao gồm rateType)
                      this.listData = [{
                        checkinTime: lastCheckin.checkinTime,
                        rateType: lastCheckin.rateType || rateType || 'hourly', // Ưu tiên từ backend, nếu không có thì dùng rateType đã lưu
                        advancePayment: lastCheckin.advancePayment || 0,
                        guestInfo: lastCheckin.guestInfo || { name: 'Khách lẻ' },
                        additionalCharges: this.initialCharges,
                        discount: this.initialDiscount,
                        notes: this.initialNotes
                      }];
                      
                      // Cập nhật form với dữ liệu từ backend (bao gồm guestSource)
                      const reloadedGuestInfo = lastCheckin.guestInfo || { name: 'Khách lẻ' };
                      
                      // Patch trực tiếp vào nested form group để đảm bảo guestSource được patch đúng
                      const reloadedGuestInfoFormGroup = this.checkOutForm.get('guestInfo') as FormGroup;
                      if (reloadedGuestInfoFormGroup) {
                        // Enable form group trước khi patchValue
                        if (reloadedGuestInfoFormGroup.disabled) {
                          reloadedGuestInfoFormGroup.enable();
                        }
                        
                        // Patch từng field riêng (KHÔNG dùng || 'walkin' để không override giá trị đúng)
                        reloadedGuestInfoFormGroup.patchValue({
                          name: reloadedGuestInfo.name || 'Khách lẻ',
                          idNumber: reloadedGuestInfo.idNumber || '',
                          phone: reloadedGuestInfo.phone || '',
                          email: reloadedGuestInfo.email || '',
                          address: reloadedGuestInfo.address || ''
                        }, { emitEvent: false });
                        
                        // Set guestSource riêng - ưu tiên giá trị từ backend, nếu không có thì giữ giá trị hiện tại
                        const guestSourceControl = reloadedGuestInfoFormGroup.get('guestSource');
                        if (guestSourceControl) {
                          // Lấy giá trị hiện tại trước khi patch
                          const currentGuestSource = guestSourceControl.value;
                          const backendGuestSource = reloadedGuestInfo.guestSource;
                          
                          // Logic: Nếu backend có guestSource và khác rỗng, dùng nó
                          // Nếu không, giữ giá trị hiện tại (không reset về 'walkin')
                          let finalGuestSource = currentGuestSource || 'walkin';
                          if (backendGuestSource && backendGuestSource.trim() !== '') {
                            finalGuestSource = backendGuestSource;
                          }
                          
                          guestSourceControl.setValue(finalGuestSource, { emitEvent: true });
                          console.log('Reloaded form guestSource:', {
                            backendGuestSource: backendGuestSource,
                            currentGuestSource: currentGuestSource,
                            finalGuestSource: finalGuestSource,
                            reloadedGuestInfoFull: reloadedGuestInfo
                          });
                        }
                        
                        console.log('Reloaded form guestInfo after patchValue:', reloadedGuestInfoFormGroup.value);
                      }
                      
                      // Cập nhật rateType trong form nếu có
                      const reloadedRateType = lastCheckin.rateType || rateType || 'hourly';
                      this.checkOutForm.patchValue({
                        advancePayment: lastCheckin.advancePayment || 0,
                        rateType: reloadedRateType // Cập nhật rateType trong form
                      }, { emitEvent: false }); // Không emit event để tránh trigger calculateTotalPrice nhiều lần
                      console.log('Reloaded form with guestSource from backend:', reloadedGuestInfo.guestSource);
                      console.log('Reloaded form with rateType from backend:', reloadedRateType);
                      
                      this.advancePayment = lastCheckin.advancePayment || 0;
                      
                      // Tính lại tiền sau khi reload (vì rateType có thể đã thay đổi)
                      setTimeout(() => {
                        this.calculateTotalPrice();
                      }, 100);
                      
                      // Trigger change detection
                      this.checkOutForm.markAsDirty();
                    }
                  }
                  
                  this.roomsService.notifyRoomDataUpdated();
                },
                error: (err) => {
                  console.error('Error reloading room:', err);
                  this.roomsService.notifyRoomDataUpdated();
                }
              });
            }, 500); // Đợi 500ms để đảm bảo backend đã lưu xong
          },
          error: (err) => {
            console.error('Error updating checkin info:', err);
            // Vẫn báo thành công vì đã lưu vào localStorage
            this.message.warning('Đã lưu vào bộ nhớ tạm. Lỗi khi cập nhật backend: ' + (err.error?.message || err.message));
            this.isSaving = false;
            
            // Không cập nhật session nữa, dữ liệu đã được lưu vào RoomEvent qua backend
            
            // Cập nhật listData để hiển thị thông tin mới
            if (this.listData && this.listData.length > 0) {
              this.listData[0].guestInfo = updatedGuestInfo;
              this.listData[0].advancePayment = advancePayment;
              this.advancePayment = advancePayment;
            }
            
            // Cập nhật form
            this.checkOutForm.patchValue({
              guestInfo: updatedGuestInfo,
              advancePayment: advancePayment
            });
          }
        });
        return;
      }
    }
    
    // Nếu không có event checkin, chỉ lưu vào localStorage
    this.message.success('Đã lưu thông tin khách và tiền đặt trước vào bộ nhớ tạm.');
    this.isSaving = false;
    
    // Không cập nhật session nữa, dữ liệu sẽ được lưu vào RoomEvent khi có check-in event
    
    // Cập nhật listData để hiển thị thông tin mới
    if (this.listData && this.listData.length > 0) {
      this.listData[0].guestInfo = updatedGuestInfo;
      this.listData[0].advancePayment = advancePayment;
      this.advancePayment = advancePayment;
    }
    
    // Cập nhật form
    this.checkOutForm.patchValue({
      guestInfo: updatedGuestInfo,
      advancePayment: advancePayment
    });
  }
}
