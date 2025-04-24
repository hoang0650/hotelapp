import { Component, Inject, OnInit, Input, OnDestroy } from '@angular/core';
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
  @Input() roomData: any;
  
  listData: any[] = [];
  checkInForm!: FormGroup;
  servicesForm!: FormGroup;
  checkOutForm!: FormGroup;
  services: any[] = [
    { id: '1', name: 'Nước ngọt', price: 15000 },
    { id: '2', name: 'Bia', price: 20000 },
    { id: '3', name: 'Bò húc', price: 25000 },
    { id: '4', name: 'Snack', price: 10000 },
    { id: '5', name: 'Mì ăn liền', price: 12000 }
  ];
  selectedServices: OrderedService[] = [];
  paymentMethods = [
    { value: 'cash', label: 'Tiền mặt' },
    { value: 'card', label: 'Thẻ ngân hàng' },
    { value: 'transfer', label: 'Chuyển khoản' }
  ];
  isLoading = false;
  totalPrice = 0;
  advancePayment = 0;
  skipValidation = false;
  modalType: string = 'info'; // Loại modal: checkin, checkout, cleaning
  private sessionSubscription?: Subscription;
  
  // Định dạng hiển thị tiền Việt Nam
  formatterVND = (value: number): string => `${value} đ`;
  parserVND = (value: string): string => value.replace(' đ', '');
  
  // Lấy thời gian hiện tại
  getCurrentTime(): Date {
    return new Date();
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
    private businessService: BusinessService
  ) {
    this.roomData = data.roomData;
    this.skipValidation = data.skipValidation || false;
    this.modalType = data.modalType || 'info';
    
    // Form cho check-in với validators tùy chọn
    this.checkInForm = this.fb.group({
      guestInfo: this.fb.group({
        name: ['', this.skipValidation ? [] : [Validators.required]],
        idNumber: [''],
        phone: ['', [Validators.pattern('^[0-9]{10}$')]],
        email: ['', [Validators.email]],
        address: ['']
      }),
      paymentMethod: ['cash', this.skipValidation ? [] : [Validators.required]],
      rateType: ['hourly', this.skipValidation ? [] : [Validators.required]],
      advancePayment: [0, [Validators.min(0)]],
      additionalCharges: [0, [Validators.min(0)]],
      discount: [0, [Validators.min(0)]],
      notes: ['']
    });
    
    // Form cho dịch vụ
    this.servicesForm = this.fb.group({
      serviceId: [''],
      quantity: [1, [Validators.min(1), Validators.required]]
    });
    
    // Form cho check-out
    this.createCheckOutForm();
  }

  ngOnInit(): void {
    // Lấy thông tin phiên phòng nếu có
    if (this.roomData && this.roomData._id) {
      // Lắng nghe thay đổi phiên
      this.sessionSubscription = this.roomSessionService
        .getSessionObservable(this.roomData._id)
        .subscribe(session => {
          if (session) {
            console.log(`Loaded session data for room ${this.roomData._id}:`, session);
            // Cập nhật UI từ phiên
            this.updateUIFromSession(session);
          } else {
            // Nếu không có phiên, lấy dữ liệu từ API
            this.fetchCurrentRoom();
          }
        });
    } else {
      this.fetchCurrentRoom();
    }
    this.calculateTotalPrice();
    this.loadBusinessInfo();
  }
  
  ngOnDestroy(): void {
    // Hủy subscription khi component bị hủy
    if (this.sessionSubscription) {
      this.sessionSubscription.unsubscribe();
    }
  }
  
  // Cập nhật UI từ dữ liệu phiên
  private updateUIFromSession(session: RoomSession): void {
    this.initialCharges = session.additionalCharges || 0;
    this.initialDiscount = session.discount || 0;
    this.initialNotes = session.notes || '';
    this.initialSelectedServices = session.selectedServices ? [...session.selectedServices] : [];
    this.selectedServices = session.selectedServices ? [...session.selectedServices] : [];
    this.advancePayment = session.advancePayment || 0;

    this.checkInForm.patchValue({
        guestInfo: session.guestInfo,
        paymentMethod: session.paymentMethod,
        rateType: session.rateType,
        advancePayment: this.advancePayment,
        additionalCharges: this.initialCharges,
        discount: this.initialDiscount,
        notes: this.initialNotes
    });
    this.checkInForm.get('guestInfo')?.disable();

    this.checkOutForm.patchValue({
        paymentMethod: session.paymentMethod
    });

    this.listData = [{
      checkinTime: session.checkinTime,
      rateType: session.rateType,
      advancePayment: session.advancePayment,
      guestInfo: session.guestInfo,
      additionalCharges: this.initialCharges,
      discount: this.initialDiscount,
      notes: this.initialNotes
    }];

    this.calculateTotalPrice();
  }

  fetchCurrentRoom(): void {
    if (this.roomData && this.roomData.roomNumber) {
      if (this.roomData.events && this.roomData.events.length > 0) {
        // Lấy event check-in gần nhất
        const checkinEvents = this.roomData.events
          .filter((event: any) => event.type === 'checkin')
          .sort((a: any, b: any) => new Date(b.checkinTime).getTime() - new Date(a.checkinTime).getTime());
          
        const lastCheckinEvent = checkinEvents.length > 0 ? checkinEvents[0] : null;
        
        // Nếu có event check-in và phòng đang có khách
        if (lastCheckinEvent && (this.roomData.roomStatus === 'active' || this.roomData.roomStatus === 'occupied')) {
          this.listData = [lastCheckinEvent];
          
          // Kiểm tra xem đã có phiên chưa
          const existingSession = this.roomSessionService.getSession(this.roomData._id);
          
          if (!existingSession) {
            // Tạo phiên mới từ dữ liệu check-in
            const sessionData: RoomSession = {
              roomId: this.roomData._id,
              roomNumber: this.roomData.roomNumber,
              roomType: this.roomData.roomType,
              hotelId: this.roomData.hotelId,
              checkinTime: new Date(lastCheckinEvent.checkinTime),
              guestInfo: lastCheckinEvent.guestInfo,
              paymentMethod: lastCheckinEvent.paymentMethod,
              rateType: lastCheckinEvent.rateType || 'hourly',
              advancePayment: lastCheckinEvent.advancePayment,
              additionalCharges: lastCheckinEvent.additionalCharges,
              discount: lastCheckinEvent.discount,
              notes: lastCheckinEvent.notes,
              selectedServices: lastCheckinEvent.selectedServices && Array.isArray(lastCheckinEvent.selectedServices) ? 
                lastCheckinEvent.selectedServices : []
            };
            
            // Lưu phiên
            this.roomSessionService.startSession(this.roomData._id, sessionData);
            this.updateUIFromSession(sessionData);
          } else {
            this.updateUIFromSession(existingSession);
          }
          
          // Cập nhật lại các giá trị ban đầu từ event (phòng trường hợp session chưa có)
          this.initialCharges = lastCheckinEvent.additionalCharges || 0;
          this.initialDiscount = lastCheckinEvent.discount || 0;
          this.initialNotes = lastCheckinEvent.notes || '';
          this.initialSelectedServices = lastCheckinEvent.selectedServices && Array.isArray(lastCheckinEvent.selectedServices) ?
                                          [...lastCheckinEvent.selectedServices] : [];
          this.selectedServices = this.initialSelectedServices;
          this.advancePayment = lastCheckinEvent.advancePayment || 0;

          // Cập nhật form checkin để hiển thị (có thể disable)
          this.checkInForm.patchValue({
              guestInfo: lastCheckinEvent.guestInfo,
              paymentMethod: lastCheckinEvent.paymentMethod,
              rateType: lastCheckinEvent.rateType,
              advancePayment: this.advancePayment,
              additionalCharges: this.initialCharges,
              discount: this.initialDiscount,
              notes: this.initialNotes
          });
          this.checkInForm.disable();

          // Cập nhật checkout form (chỉ payment method)
          this.checkOutForm.patchValue({ paymentMethod: lastCheckinEvent.paymentMethod });

          console.log('Loaded check-in data:', lastCheckinEvent);
          this.calculateTotalPrice();
        } else {
          // Nếu không tìm thấy event check-in phù hợp
          this.listData = [this.roomData.events[this.roomData.events.length - 1]];
          this.calculateTotalPrice();
        }
      }
    }
  }

  // Tải thông tin doanh nghiệp
  loadBusinessInfo(): void {
    this.businessService.getBusinessInfo().subscribe(
      (info) => {
        this.businessInfo = info;
      },
      (error) => {
        console.error('Lỗi khi tải thông tin doanh nghiệp:', error);
      }
    );
  }

  // Thêm dịch vụ
  addService(): void {
    if (!this.servicesForm.valid) {
      this.message.error('Vui lòng điền đầy đủ thông tin dịch vụ');
      return;
    }
    
    const serviceData = this.servicesForm.value;
    
    // Kiểm tra xem dịch vụ đã tồn tại chưa
    const existingServiceIndex = this.selectedServices.findIndex(
      s => s.serviceId === serviceData.serviceId
    );

    if (existingServiceIndex >= 0) {
      // Cập nhật số lượng nếu dịch vụ đã tồn tại
      this.selectedServices[existingServiceIndex].quantity += (serviceData.quantity || 1);
      // Cập nhật totalPrice nếu cần
      if (this.selectedServices[existingServiceIndex].price) {
      this.selectedServices[existingServiceIndex].totalPrice = 
          this.selectedServices[existingServiceIndex].price * this.selectedServices[existingServiceIndex].quantity;
      }
    } else {
      // Thêm dịch vụ mới
      const selectedServiceDetails = this.services.find(s => s.id === serviceData.serviceId);
      if (!selectedServiceDetails) {
        this.message.error('Không tìm thấy thông tin dịch vụ đã chọn.');
        return;
      }
      const newService: OrderedService = {
        serviceId: serviceData.serviceId,
        serviceName: selectedServiceDetails.name, // Lấy tên từ danh sách services
        price: selectedServiceDetails.price,   // Lấy giá từ danh sách services
        quantity: serviceData.quantity || 1,
        totalPrice: selectedServiceDetails.price * (serviceData.quantity || 1) // Tính totalPrice ngay khi thêm
        // notes và timestamp có thể thêm nếu cần
      };
      this.selectedServices.push(newService);
    }
    
    // Lưu dịch vụ vào session
    sessionStorage.setItem('selectedServices', JSON.stringify(this.selectedServices));

    // Reset form
    this.servicesForm.reset();
    this.servicesForm.get('quantity')?.setValue(1);
    
    // Cập nhật dữ liệu phòng với dịch vụ mới
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
    
    // Cập nhật session nếu đang trong phiên checkout
    if (this.modalType === 'checkout' && this.roomData?._id) {
        this.roomSessionService.updateSession(this.roomData._id, { selectedServices: this.selectedServices });
    }
    
    // Cập nhật tổng tiền
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
    
    // Cập nhật session nếu đang trong phiên checkout
    if (this.modalType === 'checkout' && this.roomData?._id) {
        this.roomSessionService.updateSession(this.roomData._id, { selectedServices: this.selectedServices });
    }
    
    // Cập nhật tổng tiền
    this.calculateTotalPrice();
  }

  // Tính tổng tiền
  calculateTotalPrice(): void {
    // Lấy thông tin check-in cuối cùng
    const lastCheckIn = this.listData && this.listData.length > 0 ? this.listData[0] : null;
    if (!lastCheckIn) {
      this.totalPrice = 0;
      return;
    }
    
    console.log('Calculating price based on check-in data:', lastCheckIn);
    
    // Lấy thời gian check-in và check-out
    const checkInTime = new Date(lastCheckIn.checkinTime);
    const checkOutTime = new Date();
    const durationInHours = Math.ceil((checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60));
    
    // Log thông tin tính toán thời gian
    console.log(`Check-in time: ${checkInTime.toISOString()}`);
    console.log(`Check-out time: ${checkOutTime.toISOString()}`);
    console.log(`Duration in hours: ${durationInHours}`);
    
    // Xác định loại giá
    let roomPrice = 0;
    const rateType = lastCheckIn.rateType || 'hourly';
    
    if (rateType === 'hourly') {
      if (this.roomData.firstHourRate && this.roomData.additionalHourRate) {
        roomPrice = this.roomData.firstHourRate;
        if (durationInHours > 1) {
          roomPrice += (durationInHours - 1) * this.roomData.additionalHourRate;
        }
        
        // Nếu số giờ vượt quá 6 giờ, chuyển sang tính theo ngày
        if (durationInHours > 6) {
          roomPrice = this.roomData.dailyRate;
        }
      } else {
        roomPrice = this.roomData.hourlyRate * durationInHours;
      }
    } else if (rateType === 'daily') {
      const days = Math.ceil(durationInHours / 24);
      roomPrice = this.roomData.dailyRate * days;
    } else if (rateType === 'nightly') {
      roomPrice = this.roomData.nightlyRate;
    }
    
    console.log(`Room price (${rateType}): ${roomPrice}`);
    
    // Tính tổng tiền dịch vụ
    const serviceTotal = this.selectedServices.reduce((total, service) => total + service.totalPrice, 0);
    console.log(`Service total: ${serviceTotal}`);
    
    // Lấy giá trị phụ thu và giảm giá TỪ FORM CHECKOUT
    const checkoutCharges = +(this.checkOutForm?.get('additionalCharges')?.value || 0);
    const checkoutDiscount = +(this.checkOutForm?.get('discount')?.value || 0);
    
    // Tổng cộng = Tiền phòng + Tổng DV + Phụ thu (checkin + checkout) - Giảm giá (checkin + checkout)
    const subtotal = roomPrice + serviceTotal;
    this.totalPrice = subtotal + this.initialCharges + checkoutCharges - this.initialDiscount - checkoutDiscount;
    
    // Lấy tiền trả trước (luôn lấy từ initial state hoặc checkin event)
    const lastCheckInEvent = this.listData && this.listData.length > 0 ? this.listData[0] : null;
    this.advancePayment = lastCheckInEvent?.advancePayment || 0;
    
    console.log(`Final price calculation: ${roomPrice} (room) + ${serviceTotal} (services) + ${this.initialCharges} (initial charges) + ${checkoutCharges} (checkout charges) - ${this.initialDiscount} (initial discount) - ${checkoutDiscount} (checkout discount) = ${this.totalPrice}`);
  }

  // Xử lý check-in
  processCheckIn(): void {
    // Kiểm tra trạng thái phòng
    if (this.roomData.roomStatus !== 'available') {
      this.message.error(`Phòng ${this.roomData.roomNumber} không sẵn sàng để nhận phòng (Trạng thái hiện tại: ${this.roomData.roomStatus}).`);
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
    
    const checkinEventData = {
        type: 'checkin',
        checkinTime: new Date(),
        guestInfo: this.checkInForm.get('guestInfo')?.value,
        paymentMethod: this.checkInForm.get('paymentMethod')?.value,
        rateType: this.checkInForm.get('rateType')?.value,
        advancePayment: this.checkInForm.get('advancePayment')?.value,
        additionalCharges: this.checkInForm.get('additionalCharges')?.value,
        discount: this.checkInForm.get('discount')?.value,
        notes: this.checkInForm.get('notes')?.value,
        selectedServices: this.selectedServices
      };

    const newRoom = {
      roomStatus: 'occupied',
      events: [
        ...this.roomData.events || [],
        checkinEventData
      ]
    };
    
    this.roomsService.checkInRoom(this.roomData._id, newRoom)
      .subscribe(
        (room) => {
          this.message.success('Nhận phòng thành công');
          
          // Lưu thông tin vào phiên
          const sessionData: RoomSession = {
            roomId: this.roomData._id,
            roomNumber: this.roomData.roomNumber,
            roomType: this.roomData.roomType,
            hotelId: this.roomData.hotelId,
            checkinTime: checkinEventData.checkinTime,
            guestInfo: checkinEventData.guestInfo,
            paymentMethod: checkinEventData.paymentMethod,
            rateType: checkinEventData.rateType,
            advancePayment: checkinEventData.advancePayment,
            additionalCharges: checkinEventData.additionalCharges,
            discount: checkinEventData.discount,
            notes: checkinEventData.notes,
            selectedServices: checkinEventData.selectedServices
          };
          
          // Lưu phiên
          this.roomSessionService.startSession(this.roomData._id, sessionData);
          this.roomsService.notifyRoomDataUpdated();
          this.isLoading = false;
          
          // Lưu thông tin để sử dụng khi checkout
          const checkinInfo = {
            checkinTime: new Date(),
            guestInfo: this.checkInForm.get('guestInfo')?.value,
            paymentMethod: this.checkInForm.get('paymentMethod')?.value,
            rateType: this.checkInForm.get('rateType')?.value,
            advancePayment: this.checkInForm.get('advancePayment')?.value,
            notes: this.checkInForm.get('notes')?.value,
            selectedServices: this.selectedServices
          };
          
          // Đóng modal và trả về dữ liệu
          this.modalRef.close({ checkinInfo });
        },
        (error) => {
          this.message.error('Lỗi khi nhận phòng: ' + error.message);
          this.isLoading = false;
        }
      );
  }

  // Xử lý checkout
  processCheckOut(): void {
    // Kiểm tra trạng thái phòng
    if (this.roomData.roomStatus !== 'occupied' && this.roomData.roomStatus !== 'active') {
      this.message.error(`Phòng ${this.roomData.roomNumber} hiện không có khách để trả phòng (Trạng thái: ${this.roomData.roomStatus}).`);
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    const currentTime = new Date();
    
    // Lấy dữ liệu từ session storage
    const checkInTimeStr = sessionStorage.getItem('checkInTime');
    const customerInfo = JSON.parse(sessionStorage.getItem('customerInfo') || '{}');
    
    if (!checkInTimeStr) {
      this.message.error('Không tìm thấy thông tin check-in');
      this.isLoading = false;
      return;
    }
    
    const checkInTime = new Date(checkInTimeStr);
    
    // Tính thời gian lưu trú chính xác
    const durationInHours = this.calculateDurationInHours(checkInTime, currentTime);
    const durationInDays = Math.ceil(durationInHours / 24);
    
    // Tính tổng tiền
    const roomTotal = this.calculateRoomTotal(durationInHours, this.roomData.price);
    const servicesTotal = this.calculateServicesTotal();
    const additionalCharges = this.checkOutForm.get('additionalCharges')?.value || 0;
    const discount = this.checkOutForm.get('discount')?.value || 0;
    const grandTotal = roomTotal + servicesTotal + additionalCharges - discount;
    
    // Chuẩn bị dữ liệu checkout
    const checkoutData = {
      roomStatus: 'dirty',
      paymentStatus: 'paid',
      checkoutTime: currentTime.toISOString(),
      totalAmount: grandTotal,
      remainingAmount: grandTotal - this.advancePayment,
          additionalCharges: additionalCharges,
          discount: discount,
          paymentMethod: this.checkOutForm.get('paymentMethod')?.value,
          notes: this.checkOutForm.get('notes')?.value,
      reason: this.checkOutForm.get('reason')?.value,
      services: this.selectedServices,
          events: [
            ...this.roomData.events || [],
            {
              type: 'checkout',
          checkoutTime: currentTime.toISOString(),
          amount: grandTotal,
              paymentMethod: this.checkOutForm.get('paymentMethod')?.value,
          staffId: localStorage.getItem('staffId') || undefined
        }
      ]
    };
    
    // Tạo dữ liệu hóa đơn
        const invoiceData = {
      roomId: this.roomData._id,
          roomNumber: this.roomData.roomNumber,
          roomType: this.roomData.roomType,
          hotelId: this.roomData.hotelId,
      invoiceNumber: 'INV-' + Date.now(),
      date: new Date(),
      staffName: localStorage.getItem('staffName') || 'Nhân viên',
      staffId: localStorage.getItem('staffId') || undefined,
      customerName: customerInfo.name || customerInfo.fullName || 'Khách lẻ',
      customerPhone: customerInfo.phone || 'N/A',
      customerEmail: customerInfo.email || 'N/A',
      checkInTime: checkInTime.toISOString(),
      checkOutTime: currentTime.toISOString(),
              duration: {
                hours: durationInHours,
        days: durationInDays
      },
      roomPrice: this.roomData.price || 0,
      roomTotal: roomTotal,
      services: this.selectedServices.map(service => ({
        name: service.serviceName,
        price: service.price,
        quantity: service.quantity,
        totalPrice: service.price * service.quantity
      })),
      servicesTotal: servicesTotal,
      initialCharges: this.initialCharges,
      initialDiscount: this.initialDiscount,
      additionalCharges: additionalCharges,
      discount: discount,
      advancePayment: this.advancePayment || 0,
      remainingAmount: grandTotal - this.advancePayment,
      totalAmount: grandTotal,
      paymentMethod: this.checkOutForm.get('paymentMethod')?.value,
      paymentStatus: 'paid',
      notes: this.checkOutForm.get('notes')?.value,
      initialNotes: this.initialNotes,
      createdAt: currentTime.toISOString(),
      guestInfo: customerInfo
    };
        
    this.roomsService.checkOutRoom(this.roomData._id, checkoutData)
          .subscribe(
            (room) => {
          this.message.success('Thanh toán và trả phòng thành công');
              
              // Kết thúc phiên
                this.roomSessionService.endSession(this.roomData._id);
              
          // Lưu hoá đơn
          this.roomsService.saveInvoice(invoiceData).subscribe(
            (invoice) => {
              console.log('Hoá đơn đã được lưu', invoice);
              // Cập nhật UI
              this.roomsService.notifyRoomDataUpdated();
              this.isLoading = false;
              // Hiển thị hóa đơn
              this.showInvoice(invoiceData);
              // Đóng modal và trả về dữ liệu
              this.modalRef.close({ checkout: true, invoiceData });
            },
            (error) => {
              console.error('Lỗi khi lưu hoá đơn:', error);
              this.roomsService.notifyRoomDataUpdated();
              this.isLoading = false;
              this.modalRef.close({ checkout: true });
              }
          );
            },
            (error) => {
              this.message.error('Lỗi khi trả phòng: ' + error.message);
              this.isLoading = false;
            }
          );
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

  calculateServicesTotal(): number {
    if (!this.selectedServices || this.selectedServices.length === 0) return 0;
    return this.selectedServices.reduce((total, service) => total + (service.totalPrice || 0), 0);
  }

  // Xử lý dọn phòng
  cleanRoom(): void {
    // Kiểm tra trạng thái phòng
    if (this.roomData.roomStatus !== 'dirty' && this.roomData.roomStatus !== 'maintenance') {
      this.message.error(`Phòng ${this.roomData.roomNumber} không ở trạng thái cần dọn dẹp hoặc bảo trì (Trạng thái: ${this.roomData.roomStatus}).`);
      this.isLoading = false;
      return;
    }
    
    this.isLoading = true;
    
    const newRoom = {
      roomStatus: 'available',
      events: [
        ...this.roomData.events || [],
        {
          type: 'cleaning',
          cleaningTime: new Date()
        }
      ]
    };
    
    this.roomsService.cleanRoom(this.roomData._id, newRoom)
      .subscribe(
        (room) => {
          this.message.success('Đã cập nhật trạng thái phòng thành "Sẵn sàng"');
          
          // Đảm bảo không còn phiên nào hoạt động
          this.roomSessionService.endSession(this.roomData._id);
          
          this.roomsService.notifyRoomDataUpdated();
          this.isLoading = false;
          this.modalRef.close();
        },
        (error) => {
          this.message.error('Lỗi khi cập nhật trạng thái phòng: ' + error.message);
          this.isLoading = false;
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
    const lastCheckIn = this.listData && this.listData.length > 0 ? this.listData[0] : null;
    if (!lastCheckIn || !this.roomData) return 0;

    const checkInTime = new Date(lastCheckIn.checkinTime);
    const checkOutTime = new Date(); // Hoặc thời gian checkout thực tế nếu có
    const durationInHours = Math.ceil((checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60));
    const rateType = lastCheckIn.rateType || 'hourly';

    let price = 0;
    if (rateType === 'hourly') {
      if (this.roomData.firstHourRate && this.roomData.additionalHourRate) {
        price = this.roomData.firstHourRate;
        if (durationInHours > 1) {
          price += (durationInHours - 1) * this.roomData.additionalHourRate;
        }
        if (durationInHours > 6) price = this.roomData.dailyRate; // Chuyển sang giá ngày
      } else {
        price = (this.roomData.hourlyRate || 0) * durationInHours;
      }
    } else if (rateType === 'daily') {
      const days = Math.ceil(durationInHours / 24);
      price = (this.roomData.dailyRate || 0) * days;
    } else if (rateType === 'nightly') {
      price = this.roomData.nightlyRate || 0;
    }
    return price;
  }

  // Thêm getter cho tiền dịch vụ
  get servicesPriceTotal(): number {
    return this.selectedServices.reduce((total, service) => total + (service.totalPrice || 0), 0);
  }

  // Hiển thị hóa đơn
  showInvoice(invoiceData: any): void {
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

  createCheckOutForm(): void {
    this.checkOutForm = this.fb.group({
      paymentMethod: ['cash', [Validators.required]],
      notes: [''],
      additionalCharges: [0],
      discount: [0],
      reason: ['']
    });
    
    // Lắng nghe sự thay đổi của additionalCharges và discount để cập nhật tổng tiền
    this.checkOutForm.get('additionalCharges')?.valueChanges.subscribe(() => {
      this.calculateTotalPrice();
    });
    
    this.checkOutForm.get('discount')?.valueChanges.subscribe(() => {
      this.calculateTotalPrice();
    });
  }
}
