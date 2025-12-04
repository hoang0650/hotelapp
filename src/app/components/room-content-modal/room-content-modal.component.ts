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
    // Load danh sách dịch vụ từ API
    this.loadServicesFromAPI();
    
    // Lấy thông tin phiên phòng nếu có
    if (this.roomData && this.roomData._id) {
      // Reload room từ backend để đảm bảo dữ liệu mới nhất
      this.roomsService.getRoomById(this.roomData._id).subscribe({
        next: (updatedRoom) => {
          this.roomData = updatedRoom;
          console.log('Reloaded room data from backend:', updatedRoom);
          
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
        paymentMethod: session.paymentMethod,
        guestInfo: session.guestInfo || { name: 'Khách lẻ' },
        advancePayment: session.advancePayment || 0
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
    
    this.advancePayment = session.advancePayment || 0;
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
        if (lastCheckinEvent && this.roomData.status === 'occupied') {
          console.log('Loading check-in event from backend:', lastCheckinEvent);
          
          // Luôn cập nhật session với dữ liệu mới nhất từ backend
          const sessionData: RoomSession = {
            roomId: this.roomData._id,
            roomNumber: this.roomData.roomNumber,
            roomType: this.roomData.type,
            hotelId: this.roomData.hotelId,
            checkinTime: new Date(lastCheckinEvent.checkinTime),
            guestInfo: lastCheckinEvent.guestInfo || { name: 'Khách lẻ' },
            paymentMethod: lastCheckinEvent.paymentMethod,
            rateType: lastCheckinEvent.rateType || 'hourly',
            advancePayment: lastCheckinEvent.advancePayment || 0,
            additionalCharges: lastCheckinEvent.additionalCharges || 0,
            discount: lastCheckinEvent.discount || 0,
            notes: lastCheckinEvent.notes || '',
            selectedServices: lastCheckinEvent.selectedServices && Array.isArray(lastCheckinEvent.selectedServices) ? 
              lastCheckinEvent.selectedServices : []
          };
          
          // Cập nhật session với dữ liệu mới nhất từ backend
          this.roomSessionService.startSession(this.roomData._id, sessionData);
          
          // Cập nhật listData
          this.listData = [{
            checkinTime: lastCheckinEvent.checkinTime,
            rateType: lastCheckinEvent.rateType,
            advancePayment: lastCheckinEvent.advancePayment || 0,
            guestInfo: lastCheckinEvent.guestInfo || { name: 'Khách lẻ' },
            additionalCharges: lastCheckinEvent.additionalCharges || 0,
            discount: lastCheckinEvent.discount || 0,
            notes: lastCheckinEvent.notes || ''
          }];
          
          // Cập nhật lại các giá trị ban đầu từ event
          this.initialCharges = lastCheckinEvent.additionalCharges || 0;
          this.initialDiscount = lastCheckinEvent.discount || 0;
          this.initialNotes = lastCheckinEvent.notes || '';
          this.initialSelectedServices = lastCheckinEvent.selectedServices && Array.isArray(lastCheckinEvent.selectedServices) ?
                                          [...lastCheckinEvent.selectedServices] : [];
          this.selectedServices = this.initialSelectedServices;
          this.advancePayment = lastCheckinEvent.advancePayment || 0;

          // Cập nhật form checkin để hiển thị (có thể disable)
          this.checkInForm.patchValue({
              guestInfo: lastCheckinEvent.guestInfo || { name: 'Khách lẻ' },
              paymentMethod: lastCheckinEvent.paymentMethod,
              rateType: lastCheckinEvent.rateType,
              advancePayment: this.advancePayment,
              additionalCharges: this.initialCharges,
              discount: this.initialDiscount,
              notes: this.initialNotes
          });
          this.checkInForm.disable();

          // Cập nhật checkout form với thông tin khách và tiền đặt trước từ backend
          this.checkOutForm.patchValue({ 
            paymentMethod: lastCheckinEvent.paymentMethod,
            rateType: lastCheckinEvent.rateType || 'hourly', // Thêm rateType từ check-in event
            guestInfo: lastCheckinEvent.guestInfo || { name: 'Khách lẻ' },
            advancePayment: lastCheckinEvent.advancePayment || 0
          });
          
          this.advancePayment = lastCheckinEvent.advancePayment || 0;

          console.log('Updated form with backend data:', {
            guestInfo: lastCheckinEvent.guestInfo,
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
      }
    }
  }

  // Tải thông tin doanh nghiệp
  loadBusinessInfo(): void {
    this.hotelService.getHotelById(this.roomData.hotelId).subscribe(
      (data) => {
        this.businessInfo = data;
        console.log('Thông tin doanh nghiệp:', this.businessInfo);
      },
      (error) => {
        console.error('Lỗi khi tải thông tin doanh nghiệp:', error);
        // Xử lý lỗi nếu cần, ví dụ hiển thị thông tin mặc định hoặc thông báo
        this.businessInfo = { name: 'Khách sạn Mặc định', address: '', phoneNumber: '' }; // Ví dụ
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
    
    // Lưu danh sách dịch vụ đã chọn vào session
    if (this.roomData && this.roomData._id) {
      const sessionData = this.roomSessionService.getSession(this.roomData._id);
      if (sessionData) {
        sessionData.selectedServices = [...this.selectedServices];
        this.roomSessionService.updateSession(this.roomData._id, sessionData);
      }
    }
    
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
    
    // Cập nhật session nếu đang trong phiên checkout
    if (this.modalType === 'checkout' && this.roomData?._id) {
        this.roomSessionService.updateSession(this.roomData._id, { selectedServices: this.selectedServices });
    }
    
    // Cập nhật tổng tiền
    this.calculateTotalPrice();
  }

  // Tính tổng tiền
  calculateTotalPrice(): void {
    // Chỉ tính giá khi modalType là 'checkout' và có checkin event hợp lệ
    if (this.modalType !== 'checkout') {
      this.totalPrice = 0;
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
        console.warn('Invalid checkinTime, using current time:', lastCheckIn.checkinTime);
        checkInTime = new Date();
      }
    } else {
      console.warn('No checkinTime found, using current time');
      checkInTime = new Date();
    }
    
    const checkOutTime = new Date();
    
    // Kiểm tra xem checkOutTime có hợp lệ không
    if (isNaN(checkOutTime.getTime())) {
      console.error('Invalid checkOutTime');
      this.totalPrice = 0;
      return;
    }
    
    // Đảm bảo checkInTime không lớn hơn checkOutTime
    if (checkInTime.getTime() > checkOutTime.getTime()) {
      console.warn('Check-in time is after check-out time, using current time for check-in');
      checkInTime = new Date(checkOutTime.getTime() - 3600000); // 1 giờ trước
    }
    
    // Tính thời gian chính xác theo phút
    const durationInMilliseconds = checkOutTime.getTime() - checkInTime.getTime();
    const durationInMinutes = Math.floor(durationInMilliseconds / (1000 * 60));
    const durationInHours = Math.floor(durationInMinutes / 60);
    const remainingMinutes = durationInMinutes % 60;
    const durationInDays = Math.ceil(durationInHours / 24);
    
    // Đảm bảo duration không âm
    const validDurationInHours = Math.max(0, durationInHours);
    const validDurationInDays = Math.max(1, durationInDays);
    
    // Log thông tin tính toán thời gian (chỉ khi Date hợp lệ)
    if (!isNaN(checkInTime.getTime()) && !isNaN(checkOutTime.getTime())) {
      console.log(`Check-in time: ${checkInTime.toISOString()}`);
      console.log(`Check-out time: ${checkOutTime.toISOString()}`);
      console.log(`Duration in hours: ${validDurationInHours}`);
    }
    
    // Xác định loại giá và tính tiền phòng
    // Ưu tiên lấy rateType từ form checkout nếu có, nếu không thì lấy từ lastCheckIn
    const rateType = this.checkOutForm?.get('rateType')?.value || lastCheckIn.rateType || 'hourly';
    const roomPrice = this.calculateRoomTotalByRateType(validDurationInHours, validDurationInDays, rateType, remainingMinutes);
    
    // Lưu roomPrice vào biến để hiển thị
    this._roomPriceTotal = roomPrice;
    
    console.log(`Room price (${rateType}): ${roomPrice}`, {
      rateType: rateType,
      formRateType: this.checkOutForm?.get('rateType')?.value,
      lastCheckInRateType: lastCheckIn.rateType
    });
    
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
    
    const guestInfoForm = this.checkInForm.get('guestInfo')?.value || {};
    // Đảm bảo tên khách mặc định là "Khách lẻ" nếu không nhập
    const guestInfo = {
      ...guestInfoForm,
      name: guestInfoForm.name || 'Khách lẻ'
    };
    
    const checkinEventData = {
        type: 'checkin',
        checkinTime: new Date(),
        guestInfo: guestInfo,
        paymentMethod: this.checkInForm.get('paymentMethod')?.value,
        rateType: this.checkInForm.get('rateType')?.value,
        advancePayment: this.checkInForm.get('advancePayment')?.value,
        additionalCharges: this.checkInForm.get('additionalCharges')?.value,
        discount: this.checkInForm.get('discount')?.value,
        notes: this.checkInForm.get('notes')?.value,
        selectedServices: this.selectedServices
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
          checkinTime: new Date(),
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
            
            // Lưu thông tin vào phiên
            const sessionData: RoomSession = {
              roomId: this.roomData._id,
              roomNumber: this.roomData.roomNumber,
              roomType: this.roomData.type,
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
            
            // Notify để reload data
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
    const currentTime = new Date();
    
    // Lấy dữ liệu từ session hoặc localStorage
    const session = this.roomSessionService.getSession(this.roomData._id);
    if (!session) {
      this.message.error('Không tìm thấy thông tin check-in');
      this.isLoading = false;
      return;
    }
    
    const checkInTime = session.checkinTime ? new Date(session.checkinTime) : new Date();
    
    // Tính thời gian lưu trú chính xác theo phút
    const durationInMilliseconds = currentTime.getTime() - checkInTime.getTime();
    const durationInMinutes = Math.floor(durationInMilliseconds / (1000 * 60));
    const durationInHours = Math.floor(durationInMinutes / 60);
    const remainingMinutes = durationInMinutes % 60;
    const durationInDays = Math.ceil(durationInHours / 24);
    
    // Tính tổng tiền phòng dựa trên loại giá (rateType)
    // Ưu tiên lấy rateType từ form checkout nếu có, nếu không thì lấy từ session
    const rateType = this.checkOutForm?.get('rateType')?.value || session.rateType || 'hourly';
    const roomTotal = this.calculateRoomTotalByRateType(durationInHours, durationInDays, rateType, remainingMinutes);
    
    // Tính tổng tiền dịch vụ
    const servicesTotal = this.calculateServicesTotal();
    
    // Lấy giá trị phụ thu và giảm giá
    const additionalCharges = +(this.checkOutForm.get('additionalCharges')?.value || 0);
    const discount = +(this.checkOutForm.get('discount')?.value || 0);
    
    // Tính tổng tiền cuối cùng
    const grandTotal = roomTotal + servicesTotal + additionalCharges - discount;
    
    // Trừ tiền đã trả trước (nếu có)
    const remainingAmount = grandTotal - (session.advancePayment || 0);
    
    // Chuẩn bị dữ liệu checkout
    const checkoutData = {
      status: 'dirty',
      paymentStatus: 'paid',
      checkoutTime: currentTime,
      totalAmount: grandTotal,
      remainingAmount: remainingAmount,
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
          checkoutTime: currentTime,
          amount: grandTotal,
          rateType: rateType, // Thêm rateType vào event checkout
          paymentMethod: this.checkOutForm.get('paymentMethod')?.value,
          staffId: localStorage.getItem('staffId') || undefined
        }
      ]
    };
    
    // Tạo danh sách products cho hóa đơn
    const products: any[] = [];
    
    // Thêm tiền phòng vào products
    products.push({
      name: `Tiền phòng ${this.roomData.roomNumber}`,
      price: roomTotal,
      quantity: 1
    });
    
    // Thêm các dịch vụ vào products
    if (this.selectedServices && this.selectedServices.length > 0) {
      this.selectedServices.forEach(service => {
        products.push({
          name: service.serviceName,
          price: service.price,
          quantity: service.quantity || 1
        });
      });
    }
    
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
      customerName: session.guestInfo?.name || 'Khách lẻ',
      customerPhone: session.guestInfo?.phone || 'N/A',
      customerEmail: session.guestInfo?.email || 'N/A',
      checkInTime: checkInTime,
      checkOutTime: currentTime,
      duration: {
        hours: durationInHours,
        days: durationInDays
      },
      roomPrice: roomTotal,
      roomTotal: roomTotal,
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
      advancePayment: session.advancePayment || 0,
      remainingAmount: remainingAmount,
      paymentMethod: this.checkOutForm.get('paymentMethod')?.value,
      notes: this.checkOutForm.get('notes')?.value
    };
    
    // Đóng modal ngay lập tức
    if (this.modalRef) {
      this.modalRef.close();
    }
    
    // Thực hiện checkout trong background
    this.roomsService.checkOutRoom(this.roomData._id, checkoutData)
      .subscribe(
        (response) => {
          setTimeout(() => {
            this.message.success('Trả phòng thành công');
            
            // Xóa phiên
            this.roomSessionService.endSession(this.roomData._id);
            
            // Cập nhật danh sách phòng
            this.roomsService.notifyRoomDataUpdated();
            
            // Hiển thị hóa đơn sau khi modal đã đóng
            setTimeout(() => {
              this.showInvoice(invoiceData);
            }, 200);
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
    
    const hourlyRate = this.roomData.pricing?.hourly || this.roomData.firstHourRate || 0;
    const dailyRate = this.roomData.pricing?.daily || 0;
    const nightlyRate = this.roomData.pricing?.nightly || 0;
    const additionalHourRate = this.roomData.additionalHourRate || (hourlyRate * 0.8);
    
    // Grace period mặc định 15 phút
    const gracePeriodMinutes = 15;
    // Số giờ tự động chuyển sang qua đêm mặc định 8 giờ
    const autoNightlyHours = 8;
    
    let total = 0;
    
    switch (rateType) {
      case 'hourly':
        // Kiểm tra nếu quá số giờ tự động chuyển sang qua đêm
        if (durationInHours >= autoNightlyHours && nightlyRate > 0) {
          // Tự động chuyển sang tính qua đêm
          const durationInNights = Math.ceil(durationInHours / 24);
          return nightlyRate * durationInNights;
        }
        
        // Tính theo giờ
        if (this.roomData.firstHourRate && this.roomData.additionalHourRate) {
          // Có giá giờ đầu và giờ tiếp theo
          total = this.roomData.firstHourRate;
          
          // Tính giá cho các giờ tiếp theo với grace period
          if (durationInHours >= 1) {
            let billableHours = durationInHours - 1; // Số giờ tính phí (trừ giờ đầu)
            
            // Nếu có thời gian dư sau giờ thứ 2
            if (durationInHours >= 2 && remainingMinutes > gracePeriodMinutes) {
              // Quá grace period, tính thêm 1 giờ
              billableHours += 1;
            } else if (durationInHours === 1 && remainingMinutes > gracePeriodMinutes) {
              // Nếu chỉ có 1 giờ nhưng quá 15 phút, tính thêm 1 giờ
              billableHours = 1;
            }
            
            if (billableHours > 0) {
              total += billableHours * this.roomData.additionalHourRate;
            }
          }
          
          // Nếu vượt quá 6 giờ, chuyển sang giá ngày
          if (durationInHours > 6 && dailyRate > 0) {
            total = dailyRate;
          }
        } else {
          // Tính theo giá hourly từ pricing
          total = hourlyRate;
          
          if (durationInHours >= 1) {
            let billableHours = durationInHours - 1;
            
            // Áp dụng grace period
            if (durationInHours >= 2 && remainingMinutes > gracePeriodMinutes) {
              billableHours += 1;
            } else if (durationInHours === 1 && remainingMinutes > gracePeriodMinutes) {
              billableHours = 1;
            }
            
            if (billableHours > 0) {
              total += billableHours * additionalHourRate;
            }
          }
          
          // Nếu vượt quá 6 giờ và có giá ngày, dùng giá ngày
          if (durationInHours > 6 && dailyRate > 0 && total > dailyRate) {
            total = dailyRate;
          }
        }
        break;
        
      case 'daily':
        // Tính theo ngày
        total = dailyRate * durationInDays;
        break;
        
      case 'nightly':
        // Tính theo đêm
        total = nightlyRate;
        // Nếu nhiều hơn 1 đêm
        if (durationInDays > 1) {
          total += (durationInDays - 1) * dailyRate;
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
            
            // Đảm bảo không còn phiên nào hoạt động
            this.roomSessionService.endSession(this.roomData._id);
            
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
      
      const checkOutTime = new Date();
      
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
        address: ['']
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
      // Tính lại giá ngay lập tức
      setTimeout(() => {
        this.calculateTotalPrice();
      }, 0);
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
    
    const guestInfo = this.checkOutForm.get('guestInfo')?.value || {};
    const advancePayment = this.checkOutForm.get('advancePayment')?.value || 0;
    
    console.log('Saving guest info:', { guestInfo, advancePayment, roomId: this.roomData._id });
    
    // Đảm bảo tên khách mặc định là "Khách lẻ" nếu không nhập
    const updatedGuestInfo = {
      ...guestInfo,
      name: guestInfo.name || 'Khách lẻ'
    };
    
    // Lấy thông tin check-in hiện tại
    const savedCheckinData = localStorage.getItem(`checkin_${this.roomData._id}`);
    let checkinData: any = {
      roomId: this.roomData._id,
      roomNumber: this.roomData.roomNumber,
      checkinTime: new Date(),
      guestInfo: updatedGuestInfo,
      advancePayment: advancePayment
    };
    
    if (savedCheckinData) {
      try {
        const existingData = JSON.parse(savedCheckinData);
        checkinData = {
          ...existingData,
          guestInfo: updatedGuestInfo,
          advancePayment: advancePayment
        };
      } catch (e) {
        console.error('Error parsing existing checkin data:', e);
      }
    }
    
    // Lưu vào localStorage
    localStorage.setItem(`checkin_${this.roomData._id}`, JSON.stringify(checkinData));
    
    // Cập nhật vào room.events nếu có event checkin
    if (this.roomData.events && this.roomData.events.length > 0) {
      const checkinEvents = this.roomData.events.filter((e: any) => e.type === 'checkin');
      if (checkinEvents.length > 0) {
        // Cập nhật event checkin với thông tin mới qua API
        this.roomsService.updateRoomCheckinInfo(
          this.roomData._id,
          updatedGuestInfo,
          advancePayment
        ).subscribe({
          next: (response) => {
            console.log('Update checkin info response:', response);
            this.message.success('Đã lưu thông tin khách và tiền đặt trước.');
            this.isSaving = false;
            
            // Cập nhật listData ngay lập tức để hiển thị
            if (this.listData && this.listData.length > 0) {
              this.listData[0].guestInfo = updatedGuestInfo;
              this.listData[0].advancePayment = advancePayment;
              this.advancePayment = advancePayment;
              console.log('Updated listData:', this.listData[0]);
            }
            
            // Cập nhật form với dữ liệu mới
            this.checkOutForm.patchValue({
              guestInfo: updatedGuestInfo,
              advancePayment: advancePayment
            });
            console.log('Updated form values:', this.checkOutForm.value);
            
            // Reload lại room từ API để đảm bảo dữ liệu đồng bộ
            setTimeout(() => {
              this.roomsService.getRoomById(this.roomData._id).subscribe({
                next: (updatedRoom) => {
                  this.roomData = updatedRoom;
                  
                  // Reload lại dữ liệu từ room mới
                  if (this.roomData.events && this.roomData.events.length > 0) {
                    // Sắp xếp events theo thời gian để lấy event checkin mới nhất
                    const checkinEvents = this.roomData.events
                      .filter((e: any) => e.type === 'checkin')
                      .sort((a: any, b: any) => {
                        const timeA = a.checkinTime ? new Date(a.checkinTime).getTime() : 0;
                        const timeB = b.checkinTime ? new Date(b.checkinTime).getTime() : 0;
                        return timeB - timeA;
                      });
                    
                    if (checkinEvents.length > 0) {
                      const lastCheckin = checkinEvents[0];
                      
                      // Cập nhật listData với dữ liệu từ backend
                      this.listData = [{
                        checkinTime: lastCheckin.checkinTime,
                        rateType: lastCheckin.rateType,
                        advancePayment: lastCheckin.advancePayment || 0,
                        guestInfo: lastCheckin.guestInfo || { name: 'Khách lẻ' },
                        additionalCharges: this.initialCharges,
                        discount: this.initialDiscount,
                        notes: this.initialNotes
                      }];
                      
                      // Cập nhật form với dữ liệu từ backend
                      this.checkOutForm.patchValue({
                        guestInfo: lastCheckin.guestInfo || { name: 'Khách lẻ' },
                        advancePayment: lastCheckin.advancePayment || 0
                      });
                      
                      this.advancePayment = lastCheckin.advancePayment || 0;
                      
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
    
    // Cập nhật listData để hiển thị thông tin mới
    if (this.listData && this.listData.length > 0) {
      this.listData[0].guestInfo = updatedGuestInfo;
      this.listData[0].advancePayment = advancePayment;
      this.advancePayment = advancePayment;
    }
  }
}
