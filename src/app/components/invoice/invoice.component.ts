import { Component, Input, OnInit, Inject } from '@angular/core';
import { NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { HotelService } from '../../services/hotel.service';
import { BusinessService } from '../../services/business.service';
import { InvoiceService } from '../../services/invoice.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { take } from 'rxjs/operators';

// Khai báo để TypeScript biết về biến toàn cục pdfMake
declare global {
  interface Window {
    pdfMake: any;
    pdfMake_vfs: any;
  }
}

// Interface cho các mục trong hóa đơn
interface InvoiceProduct {
  name: string;
  price: number;
  quantity?: number;
}

// Interface cho dữ liệu duration
interface Duration {
  hours: number;
  days: number;
}

// Interface cho dịch vụ
interface Service {
  name: string;
  price: number;
  quantity?: number;
}

// Interface cho dữ liệu hóa đơn
interface InvoiceData {
  invoiceNumber: string;
  date: Date | string;
  businessName?: string;
  business_address?: string;
  phoneNumber?: string;
  staffName?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  roomNumber?: string;
  roomType?: string;
  roomRate?: number;
  checkInTime?: Date | string;
  checkOutTime?: Date | string;
  products: InvoiceProduct[];
  services?: Service[];
  additionalCharges?: number;
  discount?: number;
  advancePayment?: number;
  totalAmount: number;
  roomTotal?: number;
  roomAmount?: number; // Tương thích với tên khác
  paymentMethod?: string;
  paymentStatus?: string;
  duration?: Duration;
  notes?: string;
  staffId?: string;
  rateType?: string; // Loại giá: hourly, daily, nightly
  guestInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    idNumber?: string;
    address?: string;
    guestSource?: string; // Nguồn khách: walkin, booking, agoda, etc.
  };
  guestSource?: string; // Nguồn khách (có thể ở ngoài guestInfo)
  servicesTotal?: number; // Tổng tiền dịch vụ
  [key: string]: any; // Cho phép có các trường khác
}

@Component({
  selector: 'app-invoice',
  templateUrl: './invoice.component.html',
  styleUrls: ['./invoice.component.css']
})
export class InvoiceComponent implements OnInit {
  invoiceData: InvoiceData;
  businessInfo: any; // Giữ lại để tương thích
  hotelInfo: any; // Thông tin khách sạn
  isLoading: boolean = false;
  isLoadingEasyInvoice: boolean = false;
  
  today: Date = new Date();
  
  // Các trường tính toán mới
  subtotal: number = 0; // Tổng tiền hàng (products)
  serviceTotal: number = 0; // Tổng tiền dịch vụ
  finalTotalAmount: number = 0; // Tổng tiền cuối cùng phải trả
  
  // Thêm các trường tính toán
  get totalWithoutDiscount(): number {
    return this.subtotal + (this.invoiceData?.additionalCharges || 0);
  }
  
  get durationText(): string {
    if (!this.invoiceData.duration) {
      return 'N/A';
    }
    
    const hours = this.invoiceData.duration.hours || 0;
    const days = this.invoiceData.duration.days || 0;
    
    if (days >= 1) {
      return `${days} ngày ${hours % 24 > 0 ? `${hours % 24} giờ` : ''}`;
    } else {
      return `${hours} giờ`;
    }
  }

  // Getter kiểm tra services có tồn tại và có phần tử không
  get hasServices(): boolean {
    return !!this.invoiceData.services && this.invoiceData.services.length > 0;
  }

  constructor(
    @Inject(NZ_MODAL_DATA) private data: { invoiceData: InvoiceData, businessInfo: any },
    private hotelService: HotelService,
    private businessService: BusinessService,
    private invoiceService: InvoiceService,
    private message: NzMessageService
  ) {
    console.log('=== InvoiceComponent Constructor ===');
    console.log('Raw data received:', this.data);
    console.log('data.invoiceData:', this.data?.invoiceData);
    
    this.invoiceData = this.data?.invoiceData || {
      invoiceNumber: '',
      date: new Date(),
      products: [],
      services: [],
      totalAmount: 0
    };
    this.businessInfo = this.data?.businessInfo;
    
    console.log('Assigned invoiceData:', this.invoiceData);
    console.log('Products from data:', this.invoiceData.products);
  }

  ngOnInit(): void {
    console.log('=== InvoiceComponent ngOnInit ===');
    console.log('invoiceData at ngOnInit:', this.invoiceData);
    console.log('invoiceData.products:', this.invoiceData.products);
    console.log('invoiceData.roomTotal:', this.invoiceData.roomTotal);
    console.log('invoiceData.servicesTotal:', this.invoiceData['servicesTotal']);
    console.log('invoiceData.additionalCharges:', this.invoiceData.additionalCharges);
    console.log('invoiceData.discount:', this.invoiceData.discount);
    console.log('invoiceData.totalAmount:', this.invoiceData.totalAmount);
    console.log('invoiceData.rateType:', this.invoiceData.rateType);
    console.log('invoiceData.guestSource:', this.invoiceData.guestSource);
    console.log('invoiceData.guestInfo:', this.invoiceData.guestInfo);
    
    // Parse Date objects từ ISO strings nếu cần
    if (this.invoiceData.checkInTime && typeof this.invoiceData.checkInTime === 'string') {
      this.invoiceData.checkInTime = new Date(this.invoiceData.checkInTime);
    }
    if (this.invoiceData.checkOutTime && typeof this.invoiceData.checkOutTime === 'string') {
      this.invoiceData.checkOutTime = new Date(this.invoiceData.checkOutTime);
    }
    if (this.invoiceData.date && typeof this.invoiceData.date === 'string') {
      this.invoiceData.date = new Date(this.invoiceData.date);
    }
    
    // Lấy thông tin khách hàng từ nhiều nguồn
    this.loadCustomerInfo();
    
    // Đảm bảo rằng products luôn là một mảng
    if (!this.invoiceData.products || !Array.isArray(this.invoiceData.products)) {
      console.log('Products is not array, initializing empty array');
      this.invoiceData.products = [];
    }
    
    // Đảm bảo rằng services luôn là một mảng
    if (!this.invoiceData.services || !Array.isArray(this.invoiceData.services)) {
      this.invoiceData.services = [];
    }
    
    // Đảm bảo rằng tất cả các trường cần thiết tồn tại
    this.invoiceData = {
      ...this.invoiceData,
      additionalCharges: this.invoiceData.additionalCharges || 0,
      discount: this.invoiceData.discount || 0,
      advancePayment: this.invoiceData.advancePayment || 0,
      paymentStatus: this.invoiceData.paymentStatus || 'paid',
      rateType: this.invoiceData.rateType || 'hourly', // Đảm bảo có rateType
      guestSource: this.invoiceData.guestSource || this.invoiceData.guestInfo?.guestSource || 'walkin' // Đảm bảo có guestSource
    };
    
    console.log('Products after processing:', this.invoiceData.products);
    
    // Tính toán các giá trị
    this.subtotal = this.calculateSubtotal();
    this.serviceTotal = this.calculateServiceTotal();
    this.calculateFinalTotal();
    
    // KHÔNG tự động thêm dịch vụ nữa vì đã được thêm từ room-history
    // (Loại bỏ logic tự động thêm services vào products để tránh trùng lặp)
    
    // Tính tổng thời gian lưu trú nếu chưa có
    if (!this.invoiceData.duration && this.invoiceData.checkInTime && this.invoiceData.checkOutTime) {
      const checkInTime = this.invoiceData.checkInTime instanceof Date 
        ? this.invoiceData.checkInTime 
        : new Date(this.invoiceData.checkInTime);
      const checkOutTime = this.invoiceData.checkOutTime instanceof Date 
        ? this.invoiceData.checkOutTime 
        : new Date(this.invoiceData.checkOutTime);
      
      // Kiểm tra Date hợp lệ
      if (!isNaN(checkInTime.getTime()) && !isNaN(checkOutTime.getTime())) {
        const durationInHours = Math.ceil((checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60));
        
        this.invoiceData.duration = {
          hours: durationInHours,
          days: Math.ceil(durationInHours / 24)
        };
      }
    }
    
    console.log('=== Final Calculated Values ===');
    console.log('Subtotal (products):', this.subtotal);
    console.log('Service Total:', this.serviceTotal);
    console.log('Final Total:', this.finalTotalAmount);
    console.log('Final Products:', this.invoiceData.products);
    console.log('RateType:', this.invoiceData.rateType);
    console.log('GuestSource:', this.invoiceData.guestSource);
    
    // Load business info nếu chưa có
    this.loadBusinessInfo();
  }
  
  // Lấy thông tin khách hàng từ nhiều nguồn
  loadCustomerInfo(): void {
    let customerName = 'Khách lẻ';
    let customerPhone = '';
    let customerEmail = '';
    
    // Ưu tiên 1: Từ invoiceData.customerName (đã được frontend xử lý)
    if (this.invoiceData.customerName && this.invoiceData.customerName !== 'Khách lẻ') {
      customerName = this.invoiceData.customerName;
      customerPhone = this.invoiceData.customerPhone || '';
      customerEmail = this.invoiceData.customerEmail || '';
    }
    
    // Ưu tiên 2: Từ invoiceData.guestInfo
    if ((!customerName || customerName === 'Khách lẻ') && this.invoiceData.guestInfo) {
      if (this.invoiceData.guestInfo.name && this.invoiceData.guestInfo.name !== 'Khách lẻ') {
        customerName = this.invoiceData.guestInfo.name;
        customerPhone = this.invoiceData.guestInfo.phone || customerPhone;
        customerEmail = this.invoiceData.guestInfo.email || customerEmail;
      }
    }
    
    // Ưu tiên 3: Từ invoiceData.guestDetails
    if ((!customerName || customerName === 'Khách lẻ') && this.invoiceData['guestDetails']) {
      const guestDetails = this.invoiceData['guestDetails'];
      if (guestDetails.name && guestDetails.name !== 'Khách lẻ') {
        customerName = guestDetails.name;
        customerPhone = guestDetails.phone || customerPhone;
        customerEmail = guestDetails.email || customerEmail;
      }
    }
    
    // Ưu tiên 4: Từ bookingId nếu được populate (có thể cần fetch thêm)
    if ((!customerName || customerName === 'Khách lẻ') && this.invoiceData['bookingId']) {
      const bookingId = this.invoiceData['bookingId'];
      // Nếu bookingId là object (đã được populate)
      if (typeof bookingId === 'object' && bookingId !== null) {
        if (bookingId.guestInfo?.name && bookingId.guestInfo.name !== 'Khách lẻ') {
          customerName = bookingId.guestInfo.name;
          customerPhone = bookingId.guestInfo.phone || customerPhone;
          customerEmail = bookingId.guestInfo.email || customerEmail;
        } else if (bookingId.guestDetails?.name && bookingId.guestDetails.name !== 'Khách lẻ') {
          customerName = bookingId.guestDetails.name;
          customerPhone = bookingId.guestDetails.phone || customerPhone;
          customerEmail = bookingId.guestDetails.email || customerEmail;
        } else if (bookingId.guestName && bookingId.guestName !== 'Khách lẻ') {
          customerName = bookingId.guestName;
        } else if (bookingId.customerName && bookingId.customerName !== 'Khách lẻ') {
          customerName = bookingId.customerName;
        }
      }
    }
    
    // Cập nhật invoiceData với thông tin đã tìm được
    this.invoiceData.customerName = customerName;
    if (customerPhone) {
      this.invoiceData.customerPhone = customerPhone;
    }
    if (customerEmail) {
      this.invoiceData.customerEmail = customerEmail;
    }
    
    // Đảm bảo guestInfo có đầy đủ thông tin
    if (!this.invoiceData.guestInfo) {
      this.invoiceData.guestInfo = {};
    }
    if (!this.invoiceData.guestInfo.name || this.invoiceData.guestInfo.name === 'Khách lẻ') {
      this.invoiceData.guestInfo.name = customerName;
    }
    if (!this.invoiceData.guestInfo.phone && customerPhone) {
      this.invoiceData.guestInfo.phone = customerPhone;
    }
    if (!this.invoiceData.guestInfo.email && customerEmail) {
      this.invoiceData.guestInfo.email = customerEmail;
    }
    
    console.log('Customer info loaded:', {
      customerName,
      customerPhone,
      customerEmail
    });
  }
  
  // Load thông tin khách sạn từ database
  loadBusinessInfo(): void {
    // Nếu đã có hotelInfo từ data, sử dụng luôn
    if (this.hotelInfo && this.hotelInfo.name) {
      this.updateInvoiceDataWithHotelInfo(this.hotelInfo);
      return;
    }
    
    // Nếu invoiceData có hotelInfo (từ database), sử dụng luôn
    if (this.invoiceData['hotelInfo'] && this.invoiceData['hotelInfo'].name) {
      this.hotelInfo = this.invoiceData['hotelInfo'];
      this.updateInvoiceDataWithHotelInfo(this.invoiceData['hotelInfo']);
      return;
    }
    
    // Nếu đã có businessName và business_address, không cần load
    if (this.invoiceData.businessName && this.invoiceData.businessName !== 'Khách sạn') {
      return;
    }
    
    // Lấy thông tin khách sạn từ hotelId
    // Thử lấy hotelId từ nhiều nguồn
    let hotelId = this.invoiceData['hotelId'] || (this.invoiceData as any).hotelId;
    
    // Nếu không có trong invoiceData, thử lấy từ localStorage
    if (!hotelId) {
      hotelId = localStorage.getItem('selectedHotelId') || localStorage.getItem('hotelId');
    }
    
    // Nếu vẫn không có, thử lấy từ roomId nếu có
    if (!hotelId && this.invoiceData['roomId']) {
      // Có thể gọi API để lấy hotelId từ roomId, nhưng tạm thời bỏ qua
      console.warn('Không có hotelId, sẽ thử lấy từ roomId nếu cần');
    }
    
    if (!hotelId) {
      console.warn('Không có hotelId để lấy thông tin khách sạn. InvoiceData:', this.invoiceData);
      // Không return, vẫn tiếp tục với thông tin có sẵn
      return;
    }
    
    this.isLoading = true;
    this.hotelService.getHotelInfo(hotelId).pipe(take(1)).subscribe({
      next: (hotel: any) => {
        if (!hotel) {
          console.warn('Không tìm thấy thông tin khách sạn');
          this.isLoading = false;
          return;
        }
        
        // Lưu thông tin hotel
        this.hotelInfo = hotel;
        
        // Cập nhật invoiceData với thông tin khách sạn
        this.updateInvoiceDataWithHotelInfo(hotel);
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading hotel info:', err);
        this.isLoading = false;
      }
    });
  }
  
  // Cập nhật invoiceData với thông tin business
  updateInvoiceDataWithBusinessInfo(business: any): void {
    this.invoiceData.businessName = business.name || business.legalName || 'Khách sạn';
    this.invoiceData.business_address = this.formatBusinessAddress(business.address);
    this.invoiceData.phoneNumber = business.contactInfo?.phone || business.phoneNumber || '';
    
    // Lưu businessInfo đầy đủ
    this.businessInfo = business;
  }
  
  // Cập nhật invoiceData với thông tin khách sạn (method chính)
  updateInvoiceDataWithHotelInfo(hotel: any): void {
    // Lưu thông tin hotel
    this.hotelInfo = hotel;
    
    // Cập nhật invoiceData với thông tin khách sạn
    this.invoiceData.businessName = hotel.name || 'Khách sạn';
    this.invoiceData.business_address = this.formatBusinessAddress(hotel.address);
    this.invoiceData.phoneNumber = hotel.contactInfo?.phone || '';
    
    // Giữ lại businessInfo để tương thích (nếu có)
    if (hotel.businessId && typeof hotel.businessId === 'object') {
      this.businessInfo = hotel.businessId;
    }
  }
  
  // Format địa chỉ business
  formatBusinessAddress(address: any): string {
    if (!address) return '';
    
    if (typeof address === 'string') {
      return address;
    }
    
    const parts = [];
    if (address.street) parts.push(address.street);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.postalCode) parts.push(address.postalCode);
    if (address.country) parts.push(address.country);
    
    return parts.join(', ') || '';
  }
  
  // Tính tổng tiền hàng (chỉ products)
  calculateSubtotal(): number {
    if (!this.invoiceData.products) {
      return 0;
    }
    return this.invoiceData.products.reduce((total: number, item: InvoiceProduct) => {
      const price = item.price || 0;
      const quantity = item.quantity || 1;
      // KHÔNG cộng/trừ charges/discount ở đây nữa
      return total + (price * quantity);
    }, 0);
  }
  
  // Tính tổng tiền dịch vụ (loại bỏ các dịch vụ trùng với products)
  calculateServiceTotal(): number {
    if (!this.invoiceData.services) {
      return 0;
    }
    return this.invoiceData.services.reduce((total: number, service: Service) => {
      // Kiểm tra xem dịch vụ này có vẻ đã nằm trong products chưa
      if (this.isServiceInProducts(service)) {
        return total; // Bỏ qua nếu đã có trong products
      }
      const price = service.price || 0;
      const quantity = service.quantity || 1;
      return total + (price * quantity);
    }, 0);
  }
  
  // Tính tổng tiền cuối cùng
  calculateFinalTotal(): void {
    // Nếu có totalAmount từ dữ liệu, sử dụng nó
    if (this.invoiceData.totalAmount && this.invoiceData.totalAmount > 0) {
      // Trừ tiền đã trả trước nếu có
      const advancePayment = this.invoiceData.advancePayment || 0;
      this.finalTotalAmount = this.invoiceData.totalAmount - advancePayment;
    } else {
      // Tính từ subtotal nếu không có totalAmount
      let currentTotal = this.subtotal + this.serviceTotal;
      
      // Cộng phụ thu
      currentTotal += this.invoiceData.additionalCharges || 0;
      
      // Trừ giảm giá
      currentTotal -= this.invoiceData.discount || 0;
      
      // Trừ tiền trả trước
      currentTotal -= this.invoiceData.advancePayment || 0;
      
      this.finalTotalAmount = currentTotal;
    }
    
    // Đảm bảo không âm
    this.finalTotalAmount = Math.max(0, this.finalTotalAmount);
  }

  // Định dạng tiền tệ
  formatCurrency(amount: number | undefined): string {
    if (amount === undefined || amount === null) return '0 đ';
    return amount.toLocaleString('vi-VN') + ' đ';
  }

  // Lấy nhãn hình thức tính
  getRateTypeLabel(rateType: string | undefined): string {
    if (!rateType) return 'Theo giờ';
    const rateTypes: { [key: string]: string } = {
      'hourly': 'Theo giờ',
      'daily': 'Ngày đêm',
      'nightly': 'Qua đêm'
    };
    return rateTypes[rateType.toLowerCase()] || rateType;
  }

  // Lấy label cho nguồn khách
  getGuestSourceLabel(guestSource: string | undefined): string {
    if (!guestSource) return 'Walk-in';
    
    const sourceMap: { [key: string]: string } = {
      'walkin': 'Walk-in',
      'booking': 'Booking',
      'agoda': 'Agoda',
      'traveloka': 'Traveloka',
      'expedia': 'Expedia',
      'trip': 'Trip.com',
      'g2j': 'G2J',
      'other': 'Khác'
    };
    
    return sourceMap[guestSource] || guestSource;
  }

  // Lấy màu cho nguồn khách
  getGuestSourceColor(guestSource: string | undefined): string {
    if (!guestSource) return 'default';
    
    const colorMap: { [key: string]: string } = {
      'walkin': 'blue',
      'booking': 'green',
      'agoda': 'orange',
      'traveloka': 'purple',
      'expedia': 'cyan',
      'trip': 'magenta',
      'g2j': 'gold',
      'other': 'default'
    };
    
    return colorMap[guestSource] || 'default';
  }

  // Lấy nhãn phương thức thanh toán
  getPaymentMethodLabel(method: string | undefined): string {
    if (!method) return 'Tiền mặt';
    const paymentMethods: { [key: string]: string } = {
      'cash': 'Tiền mặt',
      'card': 'Thẻ tín dụng',
      'transfer': 'Chuyển khoản',
      'banking': 'Chuyển khoản',
      'qr': 'QR Code',
      'visa': 'Thẻ VISA',
      'momo': 'Ví MoMo',
      'zalopay': 'ZaloPay',
      'vnpay': 'VNPay'
    };
    return paymentMethods[method.toLowerCase()] || method;
  }
  
  // Lấy nhãn trạng thái thanh toán
  getPaymentStatusLabel(status: string | undefined): string {
    if (!status) return 'Đã thanh toán';
    const statusLabels: { [key: string]: string } = {
      'paid': 'Đã thanh toán',
      'pending': 'Chưa thanh toán',
      'partial': 'Thanh toán một phần',
      'included_in_room_charge': 'Đã tính vào tiền phòng'
    };
    return statusLabels[status.toLowerCase()] || status;
  }
  
  // Lấy tên khách hàng từ nhiều nguồn
  getCustomerName(): string {
    // Ưu tiên customerName đã được xử lý
    if (this.invoiceData.customerName && this.invoiceData.customerName !== 'Khách lẻ') {
      return this.invoiceData.customerName;
    }
    
    // Fallback: guestInfo
    if (this.invoiceData.guestInfo?.name && this.invoiceData.guestInfo.name !== 'Khách lẻ') {
      return this.invoiceData.guestInfo.name;
    }
    
    // Fallback: guestDetails
    if (this.invoiceData['guestDetails']?.name && this.invoiceData['guestDetails'].name !== 'Khách lẻ') {
      return this.invoiceData['guestDetails'].name;
    }
    
    // Fallback: bookingId nếu được populate
    if (this.invoiceData['bookingId'] && typeof this.invoiceData['bookingId'] === 'object') {
      const booking = this.invoiceData['bookingId'];
      if (booking.guestInfo?.name && booking.guestInfo.name !== 'Khách lẻ') {
        return booking.guestInfo.name;
      }
      if (booking.guestDetails?.name && booking.guestDetails.name !== 'Khách lẻ') {
        return booking.guestDetails.name;
      }
      if (booking.guestName && booking.guestName !== 'Khách lẻ') {
        return booking.guestName;
      }
      if (booking.customerName && booking.customerName !== 'Khách lẻ') {
        return booking.customerName;
      }
    }
    
    return 'Khách lẻ';
  }
  
  // Lấy số điện thoại khách hàng từ nhiều nguồn
  getCustomerPhone(): string {
    // Ưu tiên customerPhone đã được xử lý
    if (this.invoiceData.customerPhone) {
      return this.invoiceData.customerPhone;
    }
    
    // Fallback: guestInfo
    if (this.invoiceData.guestInfo?.phone) {
      return this.invoiceData.guestInfo.phone;
    }
    
    // Fallback: guestDetails
    if (this.invoiceData['guestDetails']?.phone) {
      return this.invoiceData['guestDetails'].phone;
    }
    
    // Fallback: bookingId nếu được populate
    if (this.invoiceData['bookingId'] && typeof this.invoiceData['bookingId'] === 'object') {
      const booking = this.invoiceData['bookingId'];
      if (booking.guestInfo?.phone) {
        return booking.guestInfo.phone;
      }
      if (booking.guestDetails?.phone) {
        return booking.guestDetails.phone;
      }
    }
    
    return 'Không có thông tin';
  }
  
  // Lấy email khách hàng từ nhiều nguồn
  getCustomerEmail(): string {
    // Ưu tiên customerEmail đã được xử lý
    if (this.invoiceData.customerEmail) {
      return this.invoiceData.customerEmail;
    }
    
    // Fallback: guestInfo
    if (this.invoiceData.guestInfo?.email) {
      return this.invoiceData.guestInfo.email;
    }
    
    // Fallback: guestDetails
    if (this.invoiceData['guestDetails']?.email) {
      return this.invoiceData['guestDetails'].email;
    }
    
    // Fallback: bookingId nếu được populate
    if (this.invoiceData['bookingId'] && typeof this.invoiceData['bookingId'] === 'object') {
      const booking = this.invoiceData['bookingId'];
      if (booking.guestInfo?.email) {
        return booking.guestInfo.email;
      }
      if (booking.guestDetails?.email) {
        return booking.guestDetails.email;
      }
    }
    
    return 'N/A';
  }
  
  // Lấy màu sắc cho phương thức thanh toán
  getPaymentMethodColor(method: string | undefined): string {
    if (!method) return 'green';
    const colorMap: { [key: string]: string } = {
      'cash': 'green',
      'card': 'blue',
      'banking': 'purple',
      'qr': 'cyan',
      'visa': 'geekblue',
      'momo': 'magenta',
      'zalopay': 'blue',
      'vnpay': 'orange'
    };
    return colorMap[method.toLowerCase()] || 'default';
  }
  
  // Lấy lớp CSS cho trạng thái thanh toán
  getPaymentStatusClass(status: string | undefined): string {
    if (!status) return 'status-paid';
    const statusClasses: { [key: string]: string } = {
      'paid': 'status-paid',
      'pending': 'status-pending',
      'partial': 'status-partial',
      'included_in_room_charge': 'status-included'
    };
    return statusClasses[status.toLowerCase()] || '';
  }

  // Lấy màu sắc cho trạng thái thanh toán (dùng cho nz-tag)
  getPaymentStatusColor(status: string | undefined): string {
    if (!status) return 'success';
    const colorMap: { [key: string]: string } = {
      'paid': 'success',
      'pending': 'warning',
      'partial': 'processing',
      'included_in_room_charge': 'purple'
    };
    return colorMap[status.toLowerCase()] || 'default';
  }
  
  // Kiểm tra xem dịch vụ có trong danh sách sản phẩm không
  isServiceInProducts(service: Service): boolean {
    if (!this.invoiceData?.products || !service?.name) {
      return false;
    }
    // Kiểm tra chính xác tên trước
    if (this.invoiceData.products.some(p => p.name === service.name)) {
        return true;
    }
    // Kiểm tra bao gồm (nếu cần, có thể làm logic phức tạp hơn)
    // return this.invoiceData.products.some(product => 
    //   product.name && (product.name.includes(service.name) || service.name.includes(product.name))
    // );
    return false; // Chỉ kiểm tra tên chính xác cho đơn giản
  }
  
  // Kiểm tra xem danh sách sản phẩm có chứa các dịch vụ không
  hasServiceProductsDuplicated(): boolean {
     // Hàm này có thể không cần thiết nữa nếu isServiceInProducts hoạt động đúng
     return false; 
  }

  exportInvoice(): void {
    // Sử dụng cùng định dạng PDF với downloadPDF và getDocumentDefinition
    const documentDefinition = this.getDocumentDefinition();
    window.pdfMake.createPdf(documentDefinition).print();
  }

  // Hàm in hóa đơn
  printInvoice(): void {
    const documentDefinition = this.getDocumentDefinition();
    window.pdfMake.createPdf(documentDefinition).print();
  }

  // Hàm tạo cấu trúc tài liệu PDF cho pdfMake
  private getDocumentDefinition(): any {
    const checkInTime = this.invoiceData.checkInTime ? 
      new Date(this.invoiceData.checkInTime).toLocaleDateString('vi-VN') + ' ' + 
      new Date(this.invoiceData.checkInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
    const checkOutTime = this.invoiceData.checkOutTime ? 
      new Date(this.invoiceData.checkOutTime).toLocaleDateString('vi-VN') + ' ' + 
      new Date(this.invoiceData.checkOutTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
    const invoiceDate = this.invoiceData.date ? 
      new Date(this.invoiceData.date).toLocaleDateString('vi-VN') + ' ' + 
      new Date(this.invoiceData.date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 
      new Date().toLocaleDateString('vi-VN') + ' ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const printDate = new Date().toLocaleDateString('vi-VN') + ' ' + 
      new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    // Tạo body cho bảng sản phẩm
    const productBody = (this.invoiceData.products || []).map(item => [
        item.name,
        { text: `x${item.quantity || 1}`, alignment: 'center' },
        { text: this.formatCurrency(item.price || 0), alignment: 'right' },
        { text: this.formatCurrency((item.price || 0) * (item.quantity || 1)), alignment: 'right' }
    ]);

    // Nếu không có sản phẩm, thêm dòng tiền phòng
    if (productBody.length === 0) {
      productBody.push([
        `Tiền phòng ${this.invoiceData.roomNumber || ''}`,
        { text: 'x1', alignment: 'center' },
        { text: this.formatCurrency(this.invoiceData['amount'] || this.invoiceData.roomAmount || 0), alignment: 'right' },
        { text: this.formatCurrency(this.invoiceData['amount'] || this.invoiceData.roomAmount || 0), alignment: 'right' }
      ]);
    }

    // Tạo body cho bảng dịch vụ (chỉ những dịch vụ không có trong products)
    const serviceBody = (this.invoiceData.services || [])
      .filter(service => !this.isServiceInProducts(service))
      .map(item => [
        item.name,
        { text: `x${item.quantity || 1}`, alignment: 'center' },
        { text: this.formatCurrency(item.price || 0), alignment: 'right' },
        { text: this.formatCurrency((item.price || 0) * (item.quantity || 1)), alignment: 'right' }
      ]);

    // Header của bảng chi tiết
    const tableHeader = [
      { text: 'Tên hàng\n(Product)', style: 'tableHeader' }, 
      { text: 'Số lượng\n(Quantity)', style: 'tableHeader', alignment: 'center' }, 
      { text: 'Đơn giá\n(Unit)', style: 'tableHeader', alignment: 'right' }, 
      { text: 'Thành tiền\n(Price)', style: 'tableHeader', alignment: 'right' }
    ];

    // Kết hợp body sản phẩm và dịch vụ
    let tableBody: any[] = [tableHeader, ...productBody, ...serviceBody];

    // Tính tổng tiền dịch vụ
    const serviceTotal = this.serviceTotal || 0;

    return {
      content: [
        // Header với thông tin khách sạn và số hóa đơn
        {
          columns: [
            {
              width: '*',
              text: [
                { text: this.invoiceData.businessName || 'Khách sạn', bold: true, fontSize: 12 },
                { text: `\n${this.invoiceData.business_address || 'Chưa có địa chỉ'}`, fontSize: 10 },
                { text: `\nĐT: ${this.invoiceData.phoneNumber || 'Chưa có số điện thoại'}`, fontSize: 10 }
              ]
            },
            {
              width: '*',
              text: [
                { text: `Số hóa đơn: ${this.invoiceData.invoiceNumber || this.invoiceData['bookingId'] || 'N/A'}`, bold: true, fontSize: 10 },
                { text: `\nNgày: ${invoiceDate}`, fontSize: 10 }
              ],
              alignment: 'right'
            }
          ],
          margin: [0, 0, 0, 10]
        },

        // Đường kẻ ngang
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2 }], margin: [0, 5, 0, 10] },

        // Tiêu đề
        { text: 'HOÁ ĐƠN THANH TOÁN', style: 'header', alignment: 'center', margin: [0, 0, 0, 15] },

        // Thông tin khách hàng và đặt phòng (2 cột)
        {
          columns: [
            {
              width: '*',
              text: [
                { text: 'Mã đặt phòng:', bold: true }, ` ${this.invoiceData['bookingId'] || 'N/A'}\n`,
                { text: 'Phòng:', bold: true }, ` ${this.invoiceData.roomNumber || 'N/A'}\n`,
                { text: 'Ngày đến:', bold: true }, ` ${checkInTime}\n`,
                { text: 'Thời gian lưu trú:', bold: true }, ` ${this.durationText || 'N/A'}\n`,
                { text: 'SĐT khách hàng:', bold: true }, ` ${this.getCustomerPhone() || 'Không có thông tin'}\n`,
                { text: 'Nguồn khách:', bold: true }, ` ${this.getGuestSourceLabel(this.invoiceData.guestSource || this.invoiceData.guestInfo?.guestSource || 'walkin')}\n`,
                { text: 'Hình thức tính:', bold: true }, ` ${this.getRateTypeLabel(this.invoiceData['rateType'])}`
              ],
              fontSize: 9
            },
            {
              width: '*',
              text: [
                { text: 'Khách hàng:', bold: true }, ` ${this.getCustomerName()}\n`,
                { text: 'Nhân viên:', bold: true }, ` ${this.invoiceData.staffName || 'Không có thông tin'}\n`,
                { text: 'Ngày đi:', bold: true }, ` ${checkOutTime}\n`,
                { text: 'Phương thức thanh toán:', bold: true }, ` ${this.getPaymentMethodLabel(this.invoiceData.paymentMethod || 'cash')}\n`,
                { text: 'CCCD/CMND:', bold: true }, ` ${this.invoiceData['customerIdNumber'] || this.invoiceData.guestInfo?.idNumber || 'Không có'}\n`,
                { text: 'Loại phòng:', bold: true }, ` ${this.invoiceData['roomType'] || 'Phòng thường'}\n`,
                { text: 'Địa chỉ:', bold: true }, ` ${this.invoiceData.guestInfo?.address || this.invoiceData['customerAddress'] || 'Không có'}`
              ],
              fontSize: 9
            }
          ],
          margin: [0, 0, 0, 15]
        },

        // Bảng chi tiết sản phẩm/dịch vụ
        {
          table: {
            widths: ['*', 'auto', 'auto', 'auto'],
            body: tableBody
          },
          layout: {
            hLineWidth: function (i: number, node: any) {
              return i === 0 || i === node.table.body.length ? 1 : 0.5;
            },
            vLineWidth: function (i: number, node: any) {
              return i === 0 || i === node.table.widths.length ? 1 : 0.5;
            },
            hLineColor: function (i: number, node: any) {
              return i === 0 || i === node.table.body.length ? '#000' : '#aaa';
            },
            vLineColor: function (i: number, node: any) {
              return i === 0 || i === node.table.widths.length ? '#000' : '#aaa';
            }
          },
          margin: [0, 0, 0, 10]
        },

        // Tổng kết
        {
          table: {
            widths: ['*', 'auto'],
            body: [
              ...(serviceTotal > 0 ? [[
                { text: 'Tổng tiền dịch vụ(Total Service):', bold: true },
                { text: this.formatCurrency(serviceTotal), alignment: 'right' }
              ]] : []),
              [
                { text: 'Phụ thu (Charges):', bold: true },
                { text: this.formatCurrency(this.invoiceData.additionalCharges || 0), alignment: 'right' }
              ],
              [
                { text: 'Khuyến mãi (Discount):', bold: true },
                { text: this.formatCurrency(-(this.invoiceData.discount || 0)), alignment: 'right' }
              ],
              [
                { text: 'Tổng tiền (Total):', bold: true, fontSize: 11 },
                { text: this.formatCurrency(this.finalTotalAmount), alignment: 'right', bold: true, fontSize: 11 }
              ]
            ]
          },
          layout: 'noBorders',
          margin: [0, 10, 0, 20]
        },

        // Footer
        {
          text: [
            { text: 'Cảm ơn quý khách đã sử dụng dịch vụ!\n', alignment: 'center', fontSize: 10 },
            { text: 'Chúc quý khách một ngày tốt lành!\n', alignment: 'center', fontSize: 10 },
            { text: `Ngày in: ${printDate}`, alignment: 'center', fontSize: 9, italics: true }
          ],
          alignment: 'center',
          margin: [0, 20, 0, 0]
        }
      ],
      styles: {
        header: {
          fontSize: 16,
          bold: true
        },
        tableHeader: {
          bold: true,
          fontSize: 9,
          color: 'black'
        }
      },
      defaultStyle: {
        fontSize: 10
      }
    };
  }

  // Gửi hóa đơn qua email
  sendInvoiceEmail(): void {
    const customerEmail = this.getCustomerEmail();
    if (!customerEmail) {
      this.message.warning('Không tìm thấy địa chỉ email của khách hàng.');
      return;
    }

    // Kiểm tra xem invoice đã có _id chưa (đã lưu vào database)
    const invoiceId = this.invoiceData['_id'] || this.invoiceData['invoiceId'];
    
    // Nếu invoice chưa có trong database, tạo mới trước
    if (!invoiceId) {
      this.createInvoiceThenSendEmail(customerEmail);
    } else {
      // Invoice đã có, gửi email trực tiếp
      this.sendEmailDirectly(invoiceId, customerEmail);
    }
  }

  // Tạo invoice mới rồi gửi email
  private createInvoiceThenSendEmail(customerEmail: string): void {
    this.isLoading = true;
    this.message.loading('Đang lưu hóa đơn...', { nzDuration: 0 });

    // Chuẩn bị dữ liệu để tạo invoice
    const invoicePayload = this.prepareInvoicePayload(customerEmail);
    
    if (!invoicePayload.hotelId || !invoicePayload.roomNumber || !invoicePayload.customerName) {
      this.isLoading = false;
      this.message.remove();
      this.message.error('Thiếu thông tin bắt buộc để tạo hóa đơn (hotelId, roomNumber, customerName).');
      return;
    }

    // Tạo invoice mới
    this.invoiceService.createInvoice(invoicePayload).subscribe({
      next: (response: any) => {
        const newInvoiceId = response.data?._id || response.data?.id || response._id;
        if (newInvoiceId) {
          // Cập nhật invoiceData với _id mới
          this.invoiceData['_id'] = newInvoiceId;
          this.invoiceData['invoiceId'] = newInvoiceId;
          // Gửi email sau khi tạo thành công
          this.sendEmailDirectly(newInvoiceId, customerEmail);
        } else {
          this.isLoading = false;
          this.message.remove();
          this.message.error('Không thể lấy ID hóa đơn sau khi tạo.');
        }
      },
      error: (error: any) => {
        this.isLoading = false;
        this.message.remove();
        console.error('Error creating invoice:', error);
        const errorMessage = error.error?.message || error.message || 'Vui lòng thử lại sau';
        this.message.error('Lỗi khi tạo hóa đơn: ' + errorMessage);
      }
    });
  }

  // Gửi email trực tiếp
  private sendEmailDirectly(invoiceId: string, customerEmail: string): void {
    this.isLoading = true;
    this.message.loading('Đang gửi hóa đơn qua email...', { nzDuration: 0 });

    this.invoiceService.sendInvoiceEmail(invoiceId, customerEmail).subscribe({
      next: (response: any) => {
        this.isLoading = false;
        this.message.remove();
        this.message.success(`Hóa đơn đã được gửi đến ${customerEmail}`);
      },
      error: (error: any) => {
        this.isLoading = false;
        this.message.remove();
        console.error('Error sending invoice email:', error);
        const errorMessage = error.error?.message || error.message || 'Vui lòng thử lại sau';
        this.message.error('Lỗi khi gửi email: ' + errorMessage);
      }
    });
  }

  // Chuẩn bị dữ liệu để tạo invoice
  private prepareInvoicePayload(customerEmail?: string): any {
    // Lấy hotelId từ nhiều nguồn
    let hotelId = this.invoiceData['hotelId'];
    if (!hotelId) {
      hotelId = localStorage.getItem('selectedHotelId') || localStorage.getItem('hotelId');
    }

    // Lấy roomId nếu có
    const roomId = this.invoiceData['roomId'];

    // Chuẩn bị products từ services và products
    const products: any[] = [];
    
    // Thêm services vào products
    if (this.invoiceData.services && Array.isArray(this.invoiceData.services)) {
      this.invoiceData.services.forEach((service: any) => {
        products.push({
          name: service.name || service.serviceName || 'Dịch vụ',
          price: service.price || 0,
          quantity: service.quantity || 1,
          totalPrice: service.totalPrice || (service.price || 0) * (service.quantity || 1)
        });
      });
    }

    // Thêm products hiện có
    if (this.invoiceData.products && Array.isArray(this.invoiceData.products)) {
      this.invoiceData.products.forEach((product: any) => {
        products.push({
          name: product.name || 'Sản phẩm',
          price: product.price || 0,
          quantity: product.quantity || 1,
          totalPrice: product.totalPrice || (product.price || 0) * (product.quantity || 1)
        });
      });
    }

    return {
      invoiceNumber: this.invoiceData.invoiceNumber,
      hotelId: hotelId,
      roomId: roomId,
      roomNumber: this.invoiceData.roomNumber || '',
      roomType: this.invoiceData.roomType || '',
      bookingId: this.invoiceData['bookingId'] || this.invoiceData['bookingId'],
      customerName: this.invoiceData.customerName || this.invoiceData.guestInfo?.name || 'Khách lẻ',
      customerPhone: this.invoiceData.customerPhone || this.invoiceData.guestInfo?.phone || '',
      customerEmail: this.invoiceData.customerEmail || this.invoiceData.guestInfo?.email || customerEmail || '',
      guestDetails: this.invoiceData.guestInfo || {},
      staffId: this.invoiceData.staffId || localStorage.getItem('staffId') || '',
      staffName: this.invoiceData.staffName || localStorage.getItem('staffName') || 'Nhân viên',
      checkInTime: this.invoiceData.checkInTime || this.invoiceData['checkInDate'] || new Date(),
      checkOutTime: this.invoiceData.checkOutTime || this.invoiceData['checkOutDate'] || new Date(),
      duration: this.invoiceData.duration || { hours: 0, days: 0 },
      rateType: this.invoiceData.rateType || 'hourly',
      products: products,
      roomAmount: this.invoiceData.roomAmount || this.invoiceData.roomTotal || this.invoiceData['amount'] || 0,
      serviceAmount: this.invoiceData['serviceAmount'] || this.invoiceData.servicesTotal || 0,
      additionalCharges: this.invoiceData.additionalCharges || 0,
      discount: this.invoiceData.discount || 0,
      advancePayment: this.invoiceData.advancePayment || 0,
      totalAmount: this.invoiceData.totalAmount || 0,
      paymentMethod: this.invoiceData.paymentMethod || 'cash',
      paymentStatus: this.invoiceData.paymentStatus || 'paid',
      notes: this.invoiceData.notes || '',
      status: 'issued',
      date: this.invoiceData.date || new Date()
    };
  }
  
  // Tải xuống hóa đơn dưới dạng PDF
  downloadPDF(): void {
    const filename = `HoaDon_${this.invoiceData.invoiceNumber || this.invoiceData['bookingId'] || new Date().getTime()}.pdf`;
    const pdfDocGenerator = window.pdfMake.createPdf(this.getDocumentDefinition());
    pdfDocGenerator.download(filename);
  }
  
  // Xóa hóa đơn
  deleteInvoice(): void {
    // Lấy invoice ID
    const invoiceId = this.invoiceData['_id'] || this.invoiceData['invoiceId'];
    if (!invoiceId) {
      this.message.warning('Không tìm thấy ID hóa đơn. Không thể xóa.');
      return;
    }

    // Hiển thị loading
    this.isLoading = true;
    this.message.loading('Đang xóa hóa đơn...', { nzDuration: 0 });

    // Gọi API xóa hóa đơn
    this.invoiceService.deleteInvoice(invoiceId).subscribe({
      next: (response: any) => {
        this.isLoading = false;
        this.message.remove();
        this.message.success('Xóa hóa đơn thành công');
        // Đóng modal sau 1 giây
        setTimeout(() => {
          // Có thể emit event để parent component đóng modal
          window.location.reload(); // Hoặc có thể dùng cách khác để đóng modal
        }, 1000);
      },
      error: (error: any) => {
        this.isLoading = false;
        this.message.remove();
        console.error('Error deleting invoice:', error);
        this.message.error('Lỗi khi xóa hóa đơn: ' + (error.error?.message || error.message || 'Vui lòng thử lại sau'));
      }
    });
  }

  // Xem hóa đơn nháp (EasyInvoice)
  xemHoaDonNhap(): void {
    if (!this.hotelInfo) {
      this.message.warning('Chưa có thông tin khách sạn. Vui lòng đợi...');
      return;
    }

    this.isLoadingEasyInvoice = true;
    const invoiceData = this.prepareEasyInvoiceData();
    
    this.invoiceService.previewDraftInvoice(invoiceData).subscribe({
      next: (response: any) => {
        this.isLoadingEasyInvoice = false;
        // Mở hóa đơn nháp trong tab mới hoặc iframe
        if (response.data?.previewUrl) {
          window.open(response.data.previewUrl, '_blank');
        } else if (response.previewUrl) {
          window.open(response.previewUrl, '_blank');
        } else {
          this.message.success('Xem hóa đơn nháp thành công');
          console.log('Preview data:', response);
        }
      },
      error: (error: any) => {
        this.isLoadingEasyInvoice = false;
        console.error('Error previewing draft invoice:', error);
        const errorMessage = error.error?.message || error.message || 'Vui lòng thử lại sau';
        this.message.error('Lỗi khi xem hóa đơn nháp: ' + errorMessage);
      }
    });
  }

  // Xuất hóa đơn điện tử (EasyInvoice)
  xuatHoaDon(): void {
    if (!this.hotelInfo) {
      this.message.warning('Chưa có thông tin khách sạn. Vui lòng đợi...');
      return;
    }

    this.isLoadingEasyInvoice = true;
    const invoiceData = this.prepareEasyInvoiceData();
    
    this.invoiceService.exportEasyInvoice(invoiceData).subscribe({
      next: (response: any) => {
        this.isLoadingEasyInvoice = false;
        this.message.success('Xuất hóa đơn điện tử thành công!');
        
        // Mở hóa đơn đã xuất trong tab mới hoặc tải xuống
        if (response.data?.invoiceUrl) {
          window.open(response.data.invoiceUrl, '_blank');
        } else if (response.invoiceUrl) {
          window.open(response.invoiceUrl, '_blank');
        } else if (response.data?.pdfUrl) {
          window.open(response.data.pdfUrl, '_blank');
        } else if (response.pdfUrl) {
          window.open(response.pdfUrl, '_blank');
        }
        
        // Cập nhật invoiceData với thông tin hóa đơn điện tử nếu có
        if (response.data?.invoiceId) {
          this.invoiceData['easyInvoiceId'] = response.data.invoiceId;
        }
        if (response.data?.invoiceNumber) {
          this.invoiceData['easyInvoiceNumber'] = response.data.invoiceNumber;
        }
      },
      error: (error: any) => {
        this.isLoadingEasyInvoice = false;
        console.error('Error exporting easy invoice:', error);
        const errorMessage = error.error?.message || error.message || 'Vui lòng thử lại sau';
        this.message.error('Lỗi khi xuất hóa đơn điện tử: ' + errorMessage);
      }
    });
  }

  // Chuẩn bị dữ liệu cho EasyInvoice từ hotelInfo và invoiceData
  private prepareEasyInvoiceData(): any {
    // Lấy thông tin công ty từ hotelInfo
    const companyInfo = {
      name: this.hotelInfo?.name || this.invoiceData.businessName || 'Khách sạn',
      address: this.formatBusinessAddress(this.hotelInfo?.address) || this.invoiceData.business_address || '',
      phone: this.hotelInfo?.contactInfo?.phone || this.invoiceData.phoneNumber || '',
      email: this.hotelInfo?.contactInfo?.email || '',
      taxCode: this.hotelInfo?.taxCode || this.businessInfo?.taxCode || '',
      website: this.hotelInfo?.contactInfo?.website || ''
    };

    // Chuẩn bị danh sách sản phẩm/dịch vụ
    const items: any[] = [];
    
    // Thêm products
    if (this.invoiceData.products && this.invoiceData.products.length > 0) {
      this.invoiceData.products.forEach((product: any) => {
        items.push({
          name: product.name,
          quantity: product.quantity || 1,
          unitPrice: product.price || 0,
          totalPrice: (product.price || 0) * (product.quantity || 1)
        });
      });
    }

    // Thêm services (chỉ những service không có trong products)
    if (this.invoiceData.services && this.invoiceData.services.length > 0) {
      this.invoiceData.services.forEach((service: any) => {
        if (!this.isServiceInProducts(service)) {
          items.push({
            name: service.name,
            quantity: service.quantity || 1,
            unitPrice: service.price || 0,
            totalPrice: (service.price || 0) * (service.quantity || 1)
          });
        }
      });
    }

    // Nếu không có items, thêm tiền phòng
    if (items.length === 0) {
      items.push({
        name: `Tiền phòng ${this.invoiceData.roomNumber || ''}`,
        quantity: 1,
        unitPrice: this.invoiceData.roomAmount || this.invoiceData.roomTotal || this.invoiceData['amount'] || 0,
        totalPrice: this.invoiceData.roomAmount || this.invoiceData.roomTotal || this.invoiceData['amount'] || 0
      });
    }

    // Thông tin khách hàng
    const customerInfo = {
      name: this.getCustomerName(),
      phone: this.getCustomerPhone(),
      email: this.getCustomerEmail(),
      address: this.invoiceData.guestInfo?.address || this.invoiceData['customerAddress'] || '',
      idNumber: this.invoiceData['customerIdNumber'] || this.invoiceData.guestInfo?.idNumber || ''
    };

    // Tính tổng tiền
    const subtotal = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    const additionalCharges = this.invoiceData.additionalCharges || 0;
    const discount = this.invoiceData.discount || 0;
    const totalAmount = subtotal + additionalCharges - discount;

    return {
      // Thông tin công ty
      company: companyInfo,
      
      // Thông tin khách hàng
      customer: customerInfo,
      
      // Thông tin hóa đơn
      invoice: {
        invoiceNumber: this.invoiceData.invoiceNumber || this.invoiceData['bookingId'] || '',
        date: this.invoiceData.date ? new Date(this.invoiceData.date).toISOString() : new Date().toISOString(),
        dueDate: this.invoiceData.checkOutTime ? new Date(this.invoiceData.checkOutTime).toISOString() : new Date().toISOString()
      },
      
      // Danh sách sản phẩm/dịch vụ
      items: items,
      
      // Tổng tiền
      subtotal: subtotal,
      additionalCharges: additionalCharges,
      discount: discount,
      totalAmount: totalAmount,
      
      // Thông tin bổ sung
      roomNumber: this.invoiceData.roomNumber || '',
      roomType: this.invoiceData['roomType'] || '',
      checkInTime: this.invoiceData.checkInTime ? new Date(this.invoiceData.checkInTime).toISOString() : '',
      checkOutTime: this.invoiceData.checkOutTime ? new Date(this.invoiceData.checkOutTime).toISOString() : '',
      duration: this.durationText,
      rateType: this.getRateTypeLabel(this.invoiceData.rateType),
      paymentMethod: this.getPaymentMethodLabel(this.invoiceData.paymentMethod),
      staffName: this.invoiceData.staffName || '',
      notes: this.invoiceData.notes || '',
      
      // Metadata
      hotelId: this.invoiceData['hotelId'] || localStorage.getItem('selectedHotelId'),
      bookingId: this.invoiceData['bookingId'] || ''
    };
  }
}
