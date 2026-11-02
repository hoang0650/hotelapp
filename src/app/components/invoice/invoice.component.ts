import { Component, Input, OnInit, Inject } from '@angular/core';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { HotelService } from '../../services/hotel.service';
import { BusinessService } from '../../services/business.service';
import { InvoiceService } from '../../services/invoice.service';
import { AuthService } from '../../services/auth.service';
import { SettingsService } from '../../services/settings.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { EInvoiceProviderService } from '../../services/e-invoice-provider.service';
import { SessionContextService } from '../../services/session-context.service';
import { take } from 'rxjs/operators';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { priceDetailLines, PriceDetailLine, StayPriceDetails } from '../../utils/checkout-quote';

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
  totalPrice?: number;
}

// Interface cho dữ liệu duration
interface Duration {
  hours: number;
  days: number;
  minutes?: number;
  totalHours?: number;
  totalMinutes?: number;
}

// Interface cho dịch vụ
interface Service {
  name: string;
  price: number;
  quantity?: number;
  totalPrice?: number;
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
  roomPrice?: number; // Giá phòng (tương thích với roomTotal)
  roomAmount?: number; // Tương thích với tên khác
  paymentMethod?: string;
  paymentStatus?: string;
  duration?: Duration;
  notes?: string;
  staffId?: string;
  rateType?: string; // Loại giá: hourly, daily, nightly
  remainingAmount?: number; // Số tiền còn lại phải thanh toán
  guestInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    idNumber?: string;
    tax_code?: string; // Mã số thuế (cho công ty)
    address?: string;
    guestSource?: string; // Nguồn khách: walkin, booking, agoda, etc.
  };
  guestSource?: string; // Nguồn khách (có thể ở ngoài guestInfo)
  servicesTotal?: number; // Tổng tiền dịch vụ
  priceDetails?: StayPriceDetails;
  metadata?: { priceDetails?: StayPriceDetails; [key: string]: any };
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
  
  // Permissions
  canViewDraftInvoice: boolean = true; // Mặc định cho phép
  canExportInvoice: boolean = true; // Mặc định cho phép
  
  today: Date = new Date();
  
  // Các trường tính toán mới
  subtotal: number = 0; // Tổng tiền hàng (products) = tiền phòng
  serviceTotal: number = 0; // Tổng tiền dịch vụ
  totalAmount: number = 0; // Tổng cộng = tiền phòng + phụ thu + tiền dịch vụ (không trừ khuyến mãi và đặt trước)
  finalTotalAmount: number = 0; // Còn lại phải thanh toán = tổng cộng - đặt trước - khuyến mãi (cho phép số âm)
  
  // Thêm các trường tính toán
  get totalWithoutDiscount(): number {
    return this.subtotal + (this.invoiceData?.additionalCharges || 0);
  }
  
  get serverPriceDetailLines(): PriceDetailLine[] {
    if (!this.invoiceData) return [];
    const details: StayPriceDetails | null =
      this.invoiceData.priceDetails ||
      this.invoiceData.metadata?.priceDetails ||
      null;
    return priceDetailLines(details);
  }

  private priceDetailPdfBlocks(): any[] {
    const lines = this.serverPriceDetailLines;
    if (!lines.length) return [];
    return [{
      text: lines.map(line => `${line.label}: ${this.formatCurrency(line.amount)}`).join('\n'),
      fontSize: 10,
      margin: [0, 0, 0, 8]
    }];
  }

  get durationText(): string {
    // Nếu có checkInTime và checkOutTime, tính lại từ đó để đảm bảo chính xác
    if (this.invoiceData.checkInTime && this.invoiceData.checkOutTime) {
      const checkInTime = this.invoiceData.checkInTime instanceof Date 
        ? this.invoiceData.checkInTime 
        : new Date(this.invoiceData.checkInTime);
      const checkOutTime = this.invoiceData.checkOutTime instanceof Date 
        ? this.invoiceData.checkOutTime 
        : new Date(this.invoiceData.checkOutTime);
      
      if (!isNaN(checkInTime.getTime()) && !isNaN(checkOutTime.getTime())) {
        // Tính chính xác thời gian lưu trú
        const durationInMs = checkOutTime.getTime() - checkInTime.getTime();
        const totalMinutes = Math.floor(durationInMs / (1000 * 60));
        
        const days = Math.floor(totalMinutes / (24 * 60));
        const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
        const minutes = totalMinutes % 60;
        
        // Hiển thị theo định dạng: X ngày Y giờ Z phút hoặc Y giờ Z phút
        const parts: string[] = [];
        
        if (days > 0) {
          parts.push(`${days} ngày`);
        }
        if (hours > 0) {
          parts.push(`${hours} giờ`);
        }
        if (minutes > 0 || (days === 0 && hours === 0)) {
          parts.push(`${minutes} phút`);
        }
        
        return parts.length > 0 ? parts.join(' ') : '0 phút';
      }
    }
    
    // Fallback: sử dụng duration object nếu có
    if (this.invoiceData.duration) {
      const days = this.invoiceData.duration.days || 0;
      const hours = this.invoiceData.duration.hours || 0;
      const minutes = this.invoiceData.duration.minutes || 0;
      
      const parts: string[] = [];
      
      if (days > 0) {
        parts.push(`${days} ngày`);
      }
      if (hours > 0) {
        parts.push(`${hours} giờ`);
      }
      if (minutes > 0 || (days === 0 && hours === 0)) {
        parts.push(`${minutes} phút`);
      }
      
      return parts.length > 0 ? parts.join(' ') : '0 phút';
    }
    
    return 'N/A';
  }

  // Getter kiểm tra services có tồn tại và có phần tử không
  get hasServices(): boolean {
    return !!this.invoiceData.services && this.invoiceData.services.length > 0;
  }

  // Chế độ chỉnh sửa
  isEditMode: boolean = false;
  editForm!: FormGroup;
  editableProducts: any[] = [];
  isSaving: boolean = false;

  constructor(
    @Inject(NZ_MODAL_DATA) private data: { invoiceData: InvoiceData, businessInfo: any, isEditMode?: boolean },
    private hotelService: HotelService,
    private businessService: BusinessService,
    private invoiceService: InvoiceService,
    private authService: AuthService,
    private settingsService: SettingsService,
    private message: NzMessageService,
    private modal: NzModalService,
    private providerService: EInvoiceProviderService,
    private fb: FormBuilder,
    private modalRef: NzModalRef,
    private sessionContext: SessionContextService,
    private translate: TranslateService
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
    this.isEditMode = this.data?.isEditMode || false;
    
    console.log('Assigned invoiceData:', this.invoiceData);
    console.log('Products from data:', this.invoiceData.products);
    console.log('Is Edit Mode:', this.isEditMode);
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
    
    // Khởi tạo form chỉnh sửa nếu ở chế độ edit
    if (this.isEditMode) {
      this.initEditForm();
      this.initEditableProducts();
    }
    
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
    
    // Tính tổng thời gian lưu trú nếu chưa có hoặc tính lại từ checkInTime và checkOutTime
    if (this.invoiceData.checkInTime && this.invoiceData.checkOutTime) {
      const checkInTime = this.invoiceData.checkInTime instanceof Date 
        ? this.invoiceData.checkInTime 
        : new Date(this.invoiceData.checkInTime);
      const checkOutTime = this.invoiceData.checkOutTime instanceof Date 
        ? this.invoiceData.checkOutTime 
        : new Date(this.invoiceData.checkOutTime);
      
      // Kiểm tra Date hợp lệ
      if (!isNaN(checkInTime.getTime()) && !isNaN(checkOutTime.getTime())) {
        // Tính chính xác thời gian lưu trú (milliseconds)
        const durationInMs = checkOutTime.getTime() - checkInTime.getTime();
        
        // Tính số ngày, giờ, phút
        const totalMinutes = Math.floor(durationInMs / (1000 * 60));
        const days = Math.floor(totalMinutes / (24 * 60));
        const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
        const minutes = totalMinutes % 60;
        
        // Tính tổng giờ để tương thích với code cũ
        const totalHours = totalMinutes / 60;
        
        this.invoiceData.duration = {
          days: days,
          hours: hours,
          minutes: minutes,
          totalHours: totalHours,
          totalMinutes: totalMinutes
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
    let guestSource = 'walkin';
    
    // Ưu tiên 1: Từ invoiceData.customerName (đã được frontend xử lý)
    if (this.invoiceData.customerName && this.invoiceData.customerName !== 'Khách lẻ') {
      customerName = this.invoiceData.customerName;
      customerPhone = this.invoiceData.customerPhone || '';
      customerEmail = this.invoiceData.customerEmail || '';
    }
    // Lấy guestSource từ invoiceData trực tiếp (ưu tiên cao nhất)
    if (this.invoiceData.guestSource) {
      guestSource = this.invoiceData.guestSource;
    }
    
    // Ưu tiên 2: Từ invoiceData.guestInfo
    if ((!customerName || customerName === 'Khách lẻ') && this.invoiceData.guestInfo) {
      if (this.invoiceData.guestInfo.name && this.invoiceData.guestInfo.name !== 'Khách lẻ') {
        customerName = this.invoiceData.guestInfo.name;
        customerPhone = this.invoiceData.guestInfo.phone || customerPhone;
        customerEmail = this.invoiceData.guestInfo.email || customerEmail;
      }
    }
    // Lấy guestSource từ guestInfo nếu chưa có
    if (!this.invoiceData.guestSource && this.invoiceData.guestInfo?.guestSource) {
      guestSource = this.invoiceData.guestInfo.guestSource;
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
    // Lấy guestSource từ guestDetails nếu chưa có
    if (!this.invoiceData.guestSource && !this.invoiceData.guestInfo?.guestSource && this.invoiceData['guestDetails']?.guestSource) {
      guestSource = this.invoiceData['guestDetails'].guestSource;
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
    // Lấy guestSource từ bookingId nếu chưa có
    if (!this.invoiceData.guestSource && !this.invoiceData.guestInfo?.guestSource && !this.invoiceData['guestDetails']?.guestSource) {
      const bookingId = this.invoiceData['bookingId'];
      if (typeof bookingId === 'object' && bookingId !== null) {
        if (bookingId.guestInfo?.guestSource) {
          guestSource = bookingId.guestInfo.guestSource;
        } else if (bookingId.guestDetails?.guestSource) {
          guestSource = bookingId.guestDetails.guestSource;
        } else if (bookingId.guestSource) {
          guestSource = bookingId.guestSource;
        } else if (bookingId.source) {
          guestSource = bookingId.source;
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
    // Cập nhật guestSource
    this.invoiceData.guestSource = guestSource;
    
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
    // Đảm bảo guestInfo có guestSource
    if (!this.invoiceData.guestInfo.guestSource) {
      this.invoiceData.guestInfo.guestSource = guestSource;
    }
    // Đảm bảo guestInfo có tax_code (ưu tiên từ guestInfo, sau đó từ customerTaxCode)
    if (!this.invoiceData.guestInfo.tax_code) {
      // Thử lấy từ customerTaxCode nếu chưa có (không fallback sang idNumber vì khác nhau)
      this.invoiceData.guestInfo.tax_code = this.invoiceData['customerTaxCode'] || '';
    }
    
    console.log('Customer info loaded:', {
      customerName,
      customerPhone,
      customerEmail,
      guestSource
    });
  }
  
  // Load thông tin khách sạn từ database
  loadBusinessInfo(): void {
    // Ưu tiên businessInfo truyền từ modal checkout (đã có sẵn → mở hóa đơn tức thì)
    if (this.businessInfo && (this.businessInfo.name || this.businessInfo.legalName)) {
      this.hotelInfo = this.businessInfo;
      this.updateInvoiceDataWithHotelInfo(this.businessInfo);
      this.checkInvoicePermissions(this.businessInfo);
      return;
    }

    // Nếu đã có hotelInfo từ data, sử dụng luôn
    if (this.hotelInfo && this.hotelInfo.name) {
      this.updateInvoiceDataWithHotelInfo(this.hotelInfo);
      this.checkInvoicePermissions(this.hotelInfo);
      return;
    }
    
    // Nếu invoiceData có hotelInfo (từ database), sử dụng luôn
    if (this.invoiceData['hotelInfo'] && this.invoiceData['hotelInfo'].name) {
      this.hotelInfo = this.invoiceData['hotelInfo'];
      this.updateInvoiceDataWithHotelInfo(this.invoiceData['hotelInfo']);
      this.checkInvoicePermissions(this.hotelInfo);
      return;
    }
    
    // Nếu đã có businessName và business_address, không cần load hotel — chỉ check quyền nền
    if (this.invoiceData.businessName && this.invoiceData.businessName !== 'Khách sạn') {
      this.checkInvoicePermissions(this.invoiceData['hotelInfo'] || null);
      return;
    }
    
    // Lấy thông tin khách sạn từ hotelId
    let hotelId = this.invoiceData['hotelId'] || (this.invoiceData as any).hotelId;
    
    if (!hotelId) {
      hotelId = this.sessionContext.getSelectedHotelId();
    }
    
    if (!hotelId) {
      console.warn('Không có hotelId để lấy thông tin khách sạn. InvoiceData:', this.invoiceData);
      return;
    }
    
    this.isLoading = true;
    this.hotelService.getHotelInfo(hotelId, { lite: true }).pipe(take(1)).subscribe({
      next: (hotel: any) => {
        if (!hotel) {
          console.warn('Không tìm thấy thông tin khách sạn');
          this.isLoading = false;
          return;
        }
        
        this.hotelInfo = hotel;
        this.updateInvoiceDataWithHotelInfo(hotel);
        this.checkInvoicePermissions(hotel);
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
    // Công thức mới:
    // Tổng cộng = Tiền phòng (subtotal) + Phụ thu + Tiền dịch vụ (KHÔNG trừ khuyến mãi và đặt trước)
    // ĐỒNG BỘ: Công thức này phải khớp với room-content-modal.component.ts và room.component.ts
    this.totalAmount = this.subtotal + (this.invoiceData.additionalCharges || 0) + this.serviceTotal;
    
    // Ưu tiên 1: Sử dụng remainingAmount từ dữ liệu (đã được tính từ room-content-modal)
    if (this.invoiceData.remainingAmount !== undefined && this.invoiceData.remainingAmount !== null) {
      this.finalTotalAmount = this.invoiceData.remainingAmount;
    }
    // Ưu tiên 2: Tính từ totalAmount (công thức mới)
    else {
      const advancePayment = this.invoiceData.advancePayment || 0;
      const discount = this.invoiceData.discount || 0;
      
      // Còn lại phải thanh toán = Tổng cộng - Đặt trước - Khuyến mãi (cho phép số âm)
      this.finalTotalAmount = this.totalAmount - advancePayment - discount;
    }
    
    // KHÔNG giới hạn số âm (cho phép số âm để hiển thị khách đã trả thừa)
    // this.finalTotalAmount = Math.max(0, this.finalTotalAmount); // Đã bỏ dòng này
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
      'nightly': 'Qua đêm',
      'weekly': 'Theo tuần',
      'monthly': 'Theo tháng'
    };
    return rateTypes[rateType.toLowerCase()] || rateType;
  }

  // Lấy label cho nguồn khách
  getGuestSourceLabel(guestSource: string | undefined): string {
    if (!guestSource) return 'Khách lẻ';
    
    const sourceMap: { [key: string]: string } = {
      'walkin': 'Khách lẻ',
      'walk-in': 'Khách lẻ',
      'booking': 'Đặt phòng',
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
      'fanpage': 'blue',
      'zalo': 'white',
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
      'bank_transfer': 'Chuyển khoản',
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
  
  // Lấy nguồn khách từ nhiều nguồn
  getGuestSource(): string {
    // Ưu tiên 1: Từ invoiceData.guestSource trực tiếp
    if (this.invoiceData.guestSource) {
      return this.invoiceData.guestSource;
    }
    
    // Ưu tiên 2: Từ invoiceData.guestInfo.guestSource
    if (this.invoiceData.guestInfo?.guestSource) {
      return this.invoiceData.guestInfo.guestSource;
    }
    
    // Ưu tiên 3: Từ invoiceData.guestDetails.guestSource
    if (this.invoiceData['guestDetails']?.guestSource) {
      return this.invoiceData['guestDetails'].guestSource;
    }
    
    // Ưu tiên 4: Từ bookingId nếu được populate
    if (this.invoiceData['bookingId'] && typeof this.invoiceData['bookingId'] === 'object') {
      const booking = this.invoiceData['bookingId'];
      if (booking.guestInfo?.guestSource) {
        return booking.guestInfo.guestSource;
      }
      if (booking.guestDetails?.guestSource) {
        return booking.guestDetails.guestSource;
      }
      if (booking.guestSource) {
        return booking.guestSource;
      }
      if (booking.source) {
        return booking.source;
      }
    }
    
    // Mặc định là walkin
    return 'walkin';
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
                { text: 'Nguồn khách:', bold: true }, ` ${this.getGuestSourceLabel(this.getGuestSource())}\n`,
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

        ...this.priceDetailPdfBlocks(),

        // Tổng kết
        {
          table: {
            widths: ['*', 'auto'],
            body: [
              ...(serviceTotal > 0 ? [[
                { text: 'Tổng tiền dịch vụ(Total Service):', bold: true },
                { text: this.formatCurrency(serviceTotal), alignment: 'right' }
              ]] : []),
              ...(this.invoiceData.additionalCharges && this.invoiceData.additionalCharges > 0 ? [[
                { text: 'Phụ thu (Charges):', bold: true },
                { text: this.formatCurrency(this.invoiceData.additionalCharges), alignment: 'right' }
              ]] : []),
              [
                { text: 'Tổng cộng (Total):', bold: true, fontSize: 11 },
                { text: this.formatCurrency(this.totalAmount), alignment: 'right', bold: true, fontSize: 11 }
              ],
              ...(this.invoiceData.advancePayment && this.invoiceData.advancePayment > 0 ? [[
                { text: 'Đã thanh toán trước:', bold: true },
                { text: '- ' + this.formatCurrency(this.invoiceData.advancePayment), alignment: 'right', color: '#52c41a' }
              ]] : []),
              ...(this.invoiceData.discount && this.invoiceData.discount > 0 ? [[
                { text: 'Khuyến mãi (Discount):', bold: true },
                { text: '- ' + this.formatCurrency(this.invoiceData.discount), alignment: 'right', color: '#52c41a' }
              ]] : []),
              [
                { text: 'Còn lại phải thanh toán:', bold: true, fontSize: 11 },
                { 
                  text: this.formatCurrency(this.finalTotalAmount), 
                  alignment: 'right', 
                  bold: true, 
                  fontSize: 11,
                  color: this.finalTotalAmount < 0 ? '#52c41a' : '#ff4d4f'
                }
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
      this.message.error(this.translate.instant('INVOICE.MESSAGES.MISSING_REQUIRED_CREATE'));
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
          this.message.error(this.translate.instant('INVOICE.MESSAGES.CANNOT_GET_INVOICE_ID'));
        }
      },
      error: (error: any) => {
        this.isLoading = false;
        this.message.remove();
        console.error('Error creating invoice:', error);
        const errorMessage = error.error?.message || error.message || this.translate.instant('INVOICE.MESSAGES.TRY_AGAIN');
        this.message.error(this.translate.instant('INVOICE.MESSAGES.CREATE_ERROR', { message: errorMessage }));
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
        this.message.success(this.translate.instant('INVOICE.MESSAGES.EMAIL_SENT_SUCCESS', { email: customerEmail }));
      },
      error: (error: any) => {
        this.isLoading = false;
        this.message.remove();
        console.error('Error sending invoice email:', error);
        const errorMessage = error.error?.message || error.message || this.translate.instant('INVOICE.MESSAGES.TRY_AGAIN');
        this.message.error(this.translate.instant('INVOICE.MESSAGES.EMAIL_ERROR', { message: errorMessage }));
      }
    });
  }

  // Chuẩn bị dữ liệu để tạo invoice
  private prepareInvoicePayload(customerEmail?: string): any {
    // Lấy hotelId từ nhiều nguồn
    let hotelId = this.invoiceData['hotelId'];
    if (!hotelId) {
      hotelId = this.sessionContext.getSelectedHotelId();
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
      staffId: this.invoiceData.staffId || this.sessionContext.getStaffId() || '',
      staffName: this.invoiceData.staffName || this.sessionContext.getStaffName() || 'Nhân viên',
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
        this.message.success(this.translate.instant('INVOICE.MESSAGES.DELETE_SUCCESS'));
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
        this.message.error(this.translate.instant('INVOICE.MESSAGES.DELETE_ERROR', { message: error.error?.message || error.message || this.translate.instant('INVOICE.MESSAGES.TRY_AGAIN') }));
      }
    });
  }

  // Xem hóa đơn nháp (Sepay eInvoice)
  xemHoaDonNhap(): void {
    if (!this.hotelInfo) {
      this.message.warning('Chưa có thông tin khách sạn. Vui lòng đợi...');
      return;
    }

    // Kiểm tra đã chọn provider chưa
    const selectedProvider = this.providerService.getSelectedProvider();
    if (!selectedProvider) {
      this.modal.warning({
        nzTitle: 'Chưa chọn tài khoản nhà cung cấp',
        nzContent: 'Vui lòng chọn tài khoản nhà cung cấp trước khi tạo hóa đơn nháp. Bạn có muốn chuyển đến trang quản lý hóa đơn điện tử để chọn không?',
        nzOkText: 'Chuyển đến',
        nzCancelText: 'Hủy',
        nzOnOk: () => {
          // TODO: Navigate to e-invoice-management page
          this.message.info('Vui lòng vào "Quản lý hóa đơn điện tử" để chọn tài khoản nhà cung cấp trước');
        }
      });
      return;
    }

    // Tiếp tục tạo hóa đơn (không kiểm tra quota nữa vì đã ẩn nút khi 0/0)
    this.proceedWithDraftCreation();
  }

  /**
   * Tiếp tục tạo hóa đơn nháp sau khi đã check quota
   */
  private proceedWithDraftCreation(): void {

    this.isLoadingEasyInvoice = true;
    let invoiceData: any;
    try {
      invoiceData = this.prepareSepayEInvoiceData(true); // is_draft = true
      console.log('[Invoice Component] Prepared invoice data for draft:', JSON.stringify(invoiceData, null, 2));
      
      // Validate dữ liệu trước khi gửi
      const requiredFields = ['template_code', 'invoice_series', 'issued_date', 'currency', 'provider_account_id', 'buyer', 'items', 'is_draft'];
      const missingFields = requiredFields.filter(field => invoiceData[field] === undefined || invoiceData[field] === null);
      if (missingFields.length > 0) {
        this.isLoadingEasyInvoice = false;
        this.message.error(this.translate.instant('INVOICE.MESSAGES.MISSING_REQUIRED_FIELDS', { fields: missingFields.join(', ') }));
        console.error('[Invoice Component] Missing required fields:', missingFields);
        return;
      }
      
      // Validate buyer
      if (!invoiceData.buyer || !invoiceData.buyer.name) {
        this.isLoadingEasyInvoice = false;
        this.message.error(this.translate.instant('INVOICE.MESSAGES.MISSING_BUYER'));
        console.error('[Invoice Component] Missing buyer.name');
        return;
      }
      
      // Validate items
      if (!invoiceData.items || !Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
        this.isLoadingEasyInvoice = false;
        this.message.error(this.translate.instant('INVOICE.MESSAGES.MISSING_ITEMS'));
        console.error('[Invoice Component] Missing or empty items array');
        return;
      }
    } catch (error: any) {
      this.isLoadingEasyInvoice = false;
      console.error('[Invoice Component] Error preparing invoice data:', error);
      this.message.error(error.message || this.translate.instant('INVOICE.MESSAGES.PREPARE_DATA_ERROR'));
      return;
    }
    
    this.invoiceService.createEInvoice(invoiceData, this.getEInvoiceProvider()).subscribe({
      next: (response: any) => {
        // Backend trả về: { success: true, data: { tracking_code }, tracking_code }
        const trackingCode = response.data?.tracking_code || response.tracking_code;
        if (trackingCode) {
          // Kiểm tra trạng thái tạo hóa đơn
          this.checkCreateStatusAndShowPreview(trackingCode);
        } else {
          this.isLoadingEasyInvoice = false;
          this.message.error(this.translate.instant('INVOICE.MESSAGES.NO_TRACKING_CODE'));
        }
      },
      error: (error: any) => {
        this.isLoadingEasyInvoice = false;
        console.error('Error creating draft invoice:', error);
        // Backend trả về: { success: false, error: { code, message, details } }
        const errorCode = error.error?.error?.code || error.error?.code;
        const errorMessage = error.error?.error?.message || error.error?.message || error.message || this.translate.instant('INVOICE.MESSAGES.TRY_AGAIN');
        
        // Kiểm tra nếu lỗi liên quan đến quota
        if (errorCode === 'INSUFFICIENT_QUOTA' || errorCode === 'QUOTA_EXCEEDED' || 
            errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('hạn ngạch')) {
          this.modal.warning({
            nzTitle: 'Đã hết hạn ngạch',
            nzContent: 'Đã hết hạn ngạch. Vui lòng đăng ký gói mới và thử lại sau.',
            nzOkText: 'Đăng ký ngay',
            nzCancelText: 'Đóng',
            nzOnOk: () => {
              // TODO: Navigate to e-invoice-registration page
              this.message.info('Vui lòng vào "Đăng ký gói hóa đơn điện tử" để đăng ký gói mới');
            }
          });
        } else {
          this.message.error(this.translate.instant('INVOICE.MESSAGES.DRAFT_CREATE_ERROR', { message: errorMessage }));
        }
      }
    });
  }

  // Kiểm tra trạng thái tạo và hiển thị preview
  private checkCreateStatusAndShowPreview(trackingCode: string, retries: number = 0): void {
    const maxRetries = 10; // Tối đa 10 lần thử
    const delay = 2000; // Đợi 2 giây giữa mỗi lần thử

    if (retries >= maxRetries) {
      this.isLoadingEasyInvoice = false;
      // Kiểm tra quota trước khi hiển thị thông báo
      this.checkQuotaAndShowError();
      return;
    }

    setTimeout(() => {
      this.invoiceService.checkEInvoiceCreateStatus(trackingCode, this.getEInvoiceProvider(), this.getEInvoiceTemplateMeta() as any).subscribe({
        next: (response: any) => {
          // Backend trả về: { success: true, data: { status, message, reference_code } }
          const statusData = response.data || response;
          const status = statusData.status;
          
          if (status === 'success') {
            this.isLoadingEasyInvoice = false;
            const referenceCode = statusData.reference_code;
            if (referenceCode) {
              // Lấy chi tiết hóa đơn để xem preview
              this.getInvoiceDetailsAndShowPreview(referenceCode);
            } else {
              this.message.success(this.translate.instant('INVOICE.MESSAGES.DRAFT_CREATE_SUCCESS'));
            }
          } else if (status === 'processing' || status === 'pending') {
            // Tiếp tục kiểm tra
            this.checkCreateStatusAndShowPreview(trackingCode, retries + 1);
          } else if (status === 'failed' || status === 'error') {
            this.isLoadingEasyInvoice = false;
            const errorMsg = statusData.message || statusData.error || this.translate.instant('INVOICE.MESSAGES.DRAFT_CREATE_FAILED');
            // Kiểm tra nếu lỗi liên quan đến quota
            if (errorMsg.toLowerCase().includes('quota') || errorMsg.toLowerCase().includes('hạn ngạch')) {
              this.checkQuotaAndShowError();
            } else {
              this.message.error(this.translate.instant('INVOICE.MESSAGES.ERROR_PREFIX', { message: errorMsg }));
            }
          } else {
            // Tiếp tục kiểm tra nếu chưa có kết quả
            this.checkCreateStatusAndShowPreview(trackingCode, retries + 1);
          }
        },
        error: (error: any) => {
          this.isLoadingEasyInvoice = false;
          console.error('Error checking create status:', error);
          // Backend trả về: { success: false, error: { code, message, details } }
          const errorCode = error.error?.error?.code || error.error?.code;
          const errorMessage = error.error?.error?.message || error.error?.message || error.message || this.translate.instant('INVOICE.MESSAGES.TRY_AGAIN');
          
          // Kiểm tra nếu lỗi liên quan đến quota
          if (errorCode === 'INSUFFICIENT_QUOTA' || errorCode === 'QUOTA_EXCEEDED' || 
              errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('hạn ngạch')) {
            this.checkQuotaAndShowError();
          } else {
            this.message.error(this.translate.instant('INVOICE.MESSAGES.STATUS_CHECK_ERROR', { message: errorMessage }));
          }
        }
      });
    }, delay);
  }

  /**
   * Kiểm tra quota và hiển thị thông báo lỗi phù hợp
   * (Đã bỏ - không còn sử dụng vì đã ẩn nút khi 0/0)
   */
  private checkQuotaAndShowError(): void {
    // Hiển thị thông báo chung
    this.message.warning('Đang xử lý hóa đơn nháp. Vui lòng kiểm tra lại sau.');
  }

  // Lấy chi tiết hóa đơn và hiển thị preview
  private getInvoiceDetailsAndShowPreview(referenceCode: string): void {
    this.invoiceService.getEInvoiceDetails(referenceCode, this.getEInvoiceProvider(), this.getEInvoiceTemplateMeta() as any).subscribe({
      next: (response: any) => {
        // Backend trả về: { success: true, data: { invoice_url, pdf_url, ... } }
        const invoiceData = response.data || response;
        const invoiceUrl = invoiceData.invoice_url || invoiceData.invoiceUrl;
        const pdfUrl = invoiceData.pdf_url || invoiceData.pdfUrl;
        
        // Hiển thị thông báo thành công với thông tin về draft
        this.message.success(this.translate.instant('INVOICE.MESSAGES.DRAFT_CREATE_SUCCESS_WITH_REF', { referenceCode }), {
          nzDuration: 5000
        });
        
        if (invoiceUrl) {
          window.open(invoiceUrl, '_blank');
        } else if (pdfUrl) {
          window.open(pdfUrl, '_blank');
        }
      },
      error: (error: any) => {
        console.error('Error getting invoice details:', error);
        // Backend trả về: { success: false, error: { code, message } }
        const errorMessage = error.error?.error?.message || error.error?.message || 'Không thể lấy chi tiết hóa đơn';
        // Vẫn hiển thị thông báo thành công vì đã tạo draft
        this.message.success(this.translate.instant('INVOICE.MESSAGES.DRAFT_CREATE_SUCCESS_WITH_REF', { referenceCode }), {
          nzDuration: 5000
        });
      }
    });
  }

  // Xuất hóa đơn điện tử (Sepay eInvoice)
  xuatHoaDon(): void {
    if (!this.hotelInfo) {
      this.message.warning('Chưa có thông tin khách sạn. Vui lòng đợi...');
      return;
    }

    // Kiểm tra đã chọn provider chưa
    const selectedProvider = this.providerService.getSelectedProvider();
    if (!selectedProvider) {
      this.modal.warning({
        nzTitle: 'Chưa chọn tài khoản nhà cung cấp',
        nzContent: 'Vui lòng chọn tài khoản nhà cung cấp trước khi xuất hóa đơn. Bạn có muốn chuyển đến trang quản lý hóa đơn điện tử để chọn không?',
        nzOkText: 'Chuyển đến',
        nzCancelText: 'Hủy',
        nzOnOk: () => {
          // TODO: Navigate to e-invoice-management page
          this.message.info('Vui lòng vào "Quản lý hóa đơn điện tử" để chọn tài khoản nhà cung cấp trước');
        }
      });
      return;
    }

    // Kiểm tra quota (chỉ cho hotel/staff/business, không check cho admin/superadmin)
    const currentUser = this.authService?.getCurrentUser?.();
    const userRole = currentUser?.role;
    const isAdminOrSuperadmin = userRole === 'superadmin' || userRole === 'admin';
    
    if (!isAdminOrSuperadmin) {
      // Kiểm tra quota trước khi xuất hóa đơn
      this.invoiceService.getEInvoiceUsage(this.getEInvoiceProvider()).subscribe({
        next: (response: any) => {
          if (response.success !== false && response.data) {
            const quotaRemaining = response.data.quota_remaning || response.data.quota_remaining;
            const allocatedQuota = response.data.allocatedQuota || 0;
            const remaining = quotaRemaining ? parseInt(quotaRemaining, 10) : 0;
            const allocated = parseInt(allocatedQuota, 10) || 0;
            
            // Kiểm tra nếu chưa đăng ký (0/0) hoặc đã hết quota
            if (allocated === 0 && remaining === 0) {
              // Chưa đăng ký gói nào - hiển thị modal yêu cầu đăng ký
              this.modal.warning({
                nzTitle: 'Chưa đăng ký gói hóa đơn điện tử',
                nzContent: 'Bạn chưa đăng ký gói hóa đơn điện tử nào. Vui lòng đăng ký gói mới để tiếp tục xuất hóa đơn. Bạn có muốn chuyển đến trang đăng ký gói không?',
                nzOkText: 'Đăng ký ngay',
                nzCancelText: 'Hủy',
                nzOnOk: () => {
                  // TODO: Navigate to e-invoice-registration page
                  this.message.info('Vui lòng vào "Đăng ký gói hóa đơn điện tử" để đăng ký gói mới');
                }
              });
              return;
            } else if (remaining <= 0) {
              // Đã đăng ký nhưng hết quota - hiển thị modal yêu cầu đăng ký thêm
              this.modal.warning({
                nzTitle: 'Đã hết hạn ngạch',
                nzContent: `Bạn đã sử dụng hết ${allocated} hóa đơn đã đăng ký. Vui lòng đăng ký gói mới để tiếp tục xuất hóa đơn. Bạn có muốn chuyển đến trang đăng ký gói không?`,
                nzOkText: 'Đăng ký ngay',
                nzCancelText: 'Hủy',
                nzOnOk: () => {
                  // TODO: Navigate to e-invoice-registration page
                  this.message.info('Vui lòng vào "Đăng ký gói hóa đơn điện tử" để đăng ký gói mới');
                }
              });
              return;
            }
            
            // Có quota, tiếp tục xuất hóa đơn
            this.proceedWithInvoiceIssue();
          } else {
            this.message.error(this.translate.instant('INVOICE.MESSAGES.QUOTA_CHECK_ERROR'));
          }
        },
        error: (error: any) => {
          console.error('Error checking quota:', error);
          this.message.error(this.translate.instant('INVOICE.MESSAGES.QUOTA_CHECK_ERROR'));
        }
      });
    } else {
      // Admin/Superadmin: Không cần check quota, tiếp tục xuất hóa đơn
      this.proceedWithInvoiceIssue();
    }
  }

  /**
   * Tiếp tục xuất hóa đơn sau khi đã check quota
   */
  private proceedWithInvoiceIssue(): void {

    this.isLoadingEasyInvoice = true;
    const invoiceData = this.prepareSepayEInvoiceData(false); // is_draft = false (phát hành ngay)
    
    // Bước 1: Tạo hóa đơn
    this.invoiceService.createEInvoice(invoiceData, this.getEInvoiceProvider()).subscribe({
      next: (response: any) => {
        // Backend trả về: { success: true, data: { tracking_code }, tracking_code }
        const trackingCode = response.data?.tracking_code || response.tracking_code;
        if (trackingCode) {
          // Kiểm tra trạng thái tạo và sau đó phát hành
          this.checkCreateStatusAndIssue(trackingCode);
        } else {
          this.isLoadingEasyInvoice = false;
          this.message.error(this.translate.instant('INVOICE.MESSAGES.NO_TRACKING_CODE'));
        }
      },
      error: (error: any) => {
        this.isLoadingEasyInvoice = false;
        console.error('Error creating invoice:', error);
        // Backend trả về: { success: false, error: { code, message, details } }
        const errorMessage = error.error?.error?.message || error.error?.message || error.message || this.translate.instant('INVOICE.MESSAGES.TRY_AGAIN');
        this.message.error(this.translate.instant('INVOICE.MESSAGES.CREATE_ERROR', { message: errorMessage }));
      }
    });
  }

  // Kiểm tra trạng thái tạo và phát hành hóa đơn
  private checkCreateStatusAndIssue(trackingCode: string, retries: number = 0): void {
    const maxRetries = 10;
    const delay = 2000;

    if (retries >= maxRetries) {
      this.isLoadingEasyInvoice = false;
      this.message.warning('Đang xử lý hóa đơn. Vui lòng kiểm tra lại sau.');
      return;
    }

    setTimeout(() => {
      this.invoiceService.checkEInvoiceCreateStatus(trackingCode, this.getEInvoiceProvider(), this.getEInvoiceTemplateMeta() as any).subscribe({
        next: (response: any) => {
          // Backend trả về: { success: true, data: { status, message, reference_code } }
          const statusData = response.data || response;
          const status = statusData.status;
          
          if (status === 'success') {
            const referenceCode = statusData.reference_code;
            if (referenceCode) {
              // Phát hành hóa đơn
              this.issueInvoice(referenceCode);
            } else {
              this.isLoadingEasyInvoice = false;
              this.message.error(this.translate.instant('INVOICE.MESSAGES.NO_REFERENCE_CODE'));
            }
          } else if (status === 'processing' || status === 'pending') {
            // Tiếp tục kiểm tra
            this.checkCreateStatusAndIssue(trackingCode, retries + 1);
          } else if (status === 'failed' || status === 'error') {
            this.isLoadingEasyInvoice = false;
            const errorMsg = statusData.message || statusData.error || this.translate.instant('INVOICE.MESSAGES.INVOICE_CREATE_FAILED');
            this.message.error(this.translate.instant('INVOICE.MESSAGES.ERROR_PREFIX', { message: errorMsg }));
          } else {
            // Tiếp tục kiểm tra
            this.checkCreateStatusAndIssue(trackingCode, retries + 1);
          }
        },
        error: (error: any) => {
          this.isLoadingEasyInvoice = false;
          console.error('Error checking create status:', error);
          // Backend trả về: { success: false, error: { code, message, details } }
          const errorMessage = error.error?.error?.message || error.error?.message || error.message || this.translate.instant('INVOICE.MESSAGES.TRY_AGAIN');
          this.message.error(this.translate.instant('INVOICE.MESSAGES.STATUS_CHECK_ERROR', { message: errorMessage }));
        }
      });
    }, delay);
  }

  // Phát hành hóa đơn
  private issueInvoice(referenceCode: string): void {
    this.invoiceService.issueEInvoice({
      reference_code: referenceCode,
      ...this.getEInvoiceTemplateMeta()
    }, this.getEInvoiceProvider()).subscribe({
      next: (response: any) => {
        // Backend trả về: { success: true, data: { tracking_code }, tracking_code }
        const issueTrackingCode = response.data?.tracking_code || response.tracking_code;
        if (issueTrackingCode) {
          // Kiểm tra trạng thái phát hành
          this.checkIssueStatusAndShowResult(issueTrackingCode, referenceCode);
        } else {
          this.isLoadingEasyInvoice = false;
          this.message.error(this.translate.instant('INVOICE.MESSAGES.NO_ISSUE_TRACKING_CODE'));
        }
      },
      error: (error: any) => {
        this.isLoadingEasyInvoice = false;
        console.error('Error issuing invoice:', error);
        // Backend trả về: { success: false, error: { code, message, details } }
        const errorMessage = error.error?.error?.message || error.error?.message || error.message || this.translate.instant('INVOICE.MESSAGES.TRY_AGAIN');
        this.message.error(this.translate.instant('INVOICE.MESSAGES.ISSUE_ERROR', { message: errorMessage }));
      }
    });
  }

  // Kiểm tra trạng thái phát hành và hiển thị kết quả
  private checkIssueStatusAndShowResult(trackingCode: string, referenceCode: string, retries: number = 0): void {
    const maxRetries = 10;
    const delay = 2000;

    if (retries >= maxRetries) {
      this.isLoadingEasyInvoice = false;
      this.message.warning('Đang xử lý phát hành hóa đơn. Vui lòng kiểm tra lại sau.');
      return;
    }

    setTimeout(() => {
      this.invoiceService.checkEInvoiceIssueStatus(trackingCode, this.getEInvoiceProvider(), this.getEInvoiceTemplateMeta() as any).subscribe({
        next: (response: any) => {
          // Backend trả về: { success: true, data: { status, message, invoice_url, pdf_url } }
          const statusData = response.data || response;
          const status = statusData.status;
          
          if (status === 'success') {
            this.isLoadingEasyInvoice = false;
            
            // Hiển thị thông báo thành công với thông tin về issued invoice
            this.message.success(this.translate.instant('INVOICE.MESSAGES.ISSUE_SUCCESS_WITH_REF', { referenceCode }), {
              nzDuration: 5000
            });
            
            // Lấy chi tiết hóa đơn để hiển thị
            this.getInvoiceDetailsAndShowResult(referenceCode);
          } else if (status === 'processing' || status === 'pending') {
            // Tiếp tục kiểm tra
            this.checkIssueStatusAndShowResult(trackingCode, referenceCode, retries + 1);
          } else if (status === 'failed' || status === 'error') {
            this.isLoadingEasyInvoice = false;
            const errorMsg = statusData.message || statusData.error || this.translate.instant('INVOICE.MESSAGES.ISSUE_FAILED');
            this.message.error(this.translate.instant('INVOICE.MESSAGES.ERROR_PREFIX', { message: errorMsg }));
          } else {
            // Tiếp tục kiểm tra
            this.checkIssueStatusAndShowResult(trackingCode, referenceCode, retries + 1);
          }
        },
        error: (error: any) => {
          this.isLoadingEasyInvoice = false;
          console.error('Error checking issue status:', error);
          // Backend trả về: { success: false, error: { code, message, details } }
          const errorMessage = error.error?.error?.message || error.error?.message || error.message || this.translate.instant('INVOICE.MESSAGES.TRY_AGAIN');
          this.message.error(this.translate.instant('INVOICE.MESSAGES.ISSUE_STATUS_CHECK_ERROR', { message: errorMessage }));
        }
      });
    }, delay);
  }

  // Lấy chi tiết hóa đơn và hiển thị kết quả
  private getInvoiceDetailsAndShowResult(referenceCode: string): void {
    this.invoiceService.getEInvoiceDetails(referenceCode, this.getEInvoiceProvider(), this.getEInvoiceTemplateMeta() as any).subscribe({
      next: (response: any) => {
        // Backend trả về: { success: true, data: { invoice_url, pdf_url, ... } }
        const invoiceData = response.data || response;
        const invoiceUrl = invoiceData.invoice_url || invoiceData.invoiceUrl;
        const pdfUrl = invoiceData.pdf_url || invoiceData.pdfUrl;
        
        // Mở URL hóa đơn nếu có
        if (invoiceUrl) {
          window.open(invoiceUrl, '_blank');
        } else if (pdfUrl) {
          window.open(pdfUrl, '_blank');
        }
        
        // Cập nhật invoiceData với thông tin hóa đơn điện tử
        if (referenceCode) {
          this.invoiceData['einvoiceReferenceCode'] = referenceCode;
        }
      },
      error: (error: any) => {
        console.error('Error getting invoice details:', error);
        // Backend trả về: { success: false, error: { code, message } }
        // Không hiển thị lỗi vì đã phát hành thành công và đã hiển thị thông báo ở trên
      }
    });
  }

  private getEInvoiceProvider(): string {
    return this.providerService.getSelectedVendor();
  }

  private getEInvoiceTemplateMeta(): { template_code?: string; invoice_series?: string } {
    const template = this.providerService.getSelectedTemplate();
    return {
      template_code: template?.template_code,
      invoice_series: template?.invoice_series
    };
  }

  // Chuẩn bị dữ liệu cho Sepay eInvoice từ hotelInfo và invoiceData
  // Theo tài liệu: https://developer.sepay.vn/vi/einvoice-api/xuat-hoa-don-dien-tu
  private prepareSepayEInvoiceData(isDraft: boolean = true): any {
    // Lấy provider account từ service
    const selectedProvider = this.providerService.getSelectedProvider();
    if (!selectedProvider || !selectedProvider.id) {
      throw new Error('Vui lòng chọn tài khoản nhà cung cấp trước khi tạo hóa đơn');
    }

    const providerAccountId = selectedProvider.id;

    // Lấy template từ provider: ưu tiên template đã chọn, sau đó là template đầu tiên
    let template: any = null;
    
    // Thử lấy template đã chọn từ service
    const selectedTemplate = this.providerService.getSelectedTemplate();
    if (selectedTemplate && selectedProvider.templates && selectedProvider.templates.length > 0) {
      // Tìm template đã chọn trong danh sách templates của provider
      template = selectedProvider.templates.find(
        (t: any) => t.template_code === selectedTemplate.template_code && 
                    t.invoice_series === selectedTemplate.invoice_series
      );
    }
    
    // Nếu không tìm thấy template đã chọn, lấy template đầu tiên
    if (!template && selectedProvider.templates && selectedProvider.templates.length > 0) {
      template = selectedProvider.templates[0];
    }

    if (!template) {
      throw new Error('Không tìm thấy mẫu hóa đơn. Vui lòng kiểm tra lại tài khoản nhà cung cấp.');
    }

    const templateCode = template.template_code || '2'; // Mặc định template 2 (hóa đơn bán hàng)
    const invoiceSeries = template.invoice_series || 'C25HTV'; // Mặc định series

    // Format ngày phát hành: yyyy-MM-dd HH:mm:ss
    const issuedDate = this.formatDateForSepay(this.invoiceData.date || new Date());

    // Chuẩn bị danh sách sản phẩm/dịch vụ theo format Sepay
    const items: any[] = [];
    let lineNumber = 1;
    
    // Thêm products
    if (this.invoiceData.products && this.invoiceData.products.length > 0) {
      this.invoiceData.products.forEach((product: any) => {
        // Xác định unit dựa trên tên sản phẩm
        let unit = product.unit || 'cái';
        const productName = (product.name || '').toLowerCase();
        // Nếu là tiền phòng, dùng "ngày"
        if (productName.includes('tiền phòng') || productName.includes('phòng')) {
          unit = 'ngày';
        }
        
        items.push({
          line_number: lineNumber++,
          line_type: 1, // 1 = sản phẩm/dịch vụ
          item_code: product.code || `SP${lineNumber - 1}`,
          item_name: product.name,
          unit: unit,
          quantity: product.quantity || 1,
          unit_price: product.price || 0,
          tax_rate: product.tax_rate || 0 // 0% thuế suất mặc định (có thể điều chỉnh)
        });
      });
    }

    // Thêm services (chỉ những service không có trong products)
    if (this.invoiceData.services && this.invoiceData.services.length > 0) {
      this.invoiceData.services.forEach((service: any) => {
        if (!this.isServiceInProducts(service)) {
          items.push({
            line_number: lineNumber++,
            line_type: 1, // 1 = sản phẩm/dịch vụ
            item_code: service.code || `DV${lineNumber - 1}`,
            item_name: service.name,
            unit: service.unit || 'lon', // Dịch vụ mặc định là "lon"
            quantity: service.quantity || 1,
            unit_price: service.price || 0,
            tax_rate: service.tax_rate || 0
          });
        }
      });
    }

    // Nếu không có items, thêm tiền phòng
    if (items.length === 0) {
      items.push({
        line_number: 1,
        line_type: 1,
        item_code: 'PHONG',
        item_name: `Tiền phòng ${this.invoiceData.roomNumber || ''}`,
        unit: 'ngày', // Tiền phòng dùng "ngày"
        quantity: 1,
        unit_price: this.invoiceData.roomAmount || this.invoiceData.roomTotal || this.invoiceData['amount'] || 0,
        tax_rate: 0
      });
    }

    // Thêm chiết khấu nếu có (line_type = 3)
    const discount = this.invoiceData.discount || 0;
    if (discount > 0) {
      items.push({
        line_number: lineNumber++,
        line_type: 3, // 3 = chiết khấu trên tổng đơn
        item_name: 'Chiết khấu thương mại',
        amount: discount,
        tax_rate: 0
      });
    }

    // Thông tin khách hàng (buyer)
    // Ưu tiên tax_code từ guestInfo, sau đó từ customerTaxCode (không dùng idNumber vì khác nhau)
    const taxCode = this.invoiceData.guestInfo?.tax_code || 
                    this.invoiceData['customerTaxCode'] || 
                    '';
    
    // Chuẩn bị buyer - chỉ thêm các trường có giá trị hợp lệ
    const buyer: any = {
      name: this.getCustomerName() || 'Khách lẻ'
    };
    
    // Chỉ thêm address nếu có giá trị (không phải empty string)
    const address = this.invoiceData.guestInfo?.address || this.invoiceData['customerAddress'] || '';
    if (address && address.trim() !== '') {
      buyer.address = address.trim();
    } else {
      // Nếu không có address, dùng giá trị mặc định hợp lệ
      buyer.address = 'Chưa cập nhật';
    }
    
    // Chỉ thêm email nếu là email hợp lệ (không phải "N/A" hoặc empty)
    const email = this.getCustomerEmail() || '';
    // Validate email format đơn giản
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && email !== 'N/A' && email.trim() !== '' && emailRegex.test(email.trim())) {
      buyer.email = email.trim();
    } else {
      // Nếu không có email hợp lệ, dùng email mặc định hợp lệ
      buyer.email = 'customer@example.com';
    }
    
    // Chỉ thêm phone nếu có giá trị (không phải "N/A" hoặc empty)
    const phone = this.getCustomerPhone() || '';
    if (phone && phone !== 'N/A' && phone.trim() !== '') {
      buyer.phone = phone.trim();
    }
    
    // Chỉ thêm tax_code nếu có giá trị (không phải empty string)
    if (taxCode && taxCode.trim() !== '') {
      buyer.tax_code = taxCode.trim();
    }

    // Format theo provider
    const selectedVendor = this.providerService.getSelectedVendor();
    const invoicePayload: any = {
      provider: selectedVendor,
      template_code: templateCode,
      invoice_series: invoiceSeries,
      issued_date: selectedVendor === 'easyinvoice'
        ? (this.invoiceData.date ? new Date(this.invoiceData.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))
        : issuedDate,
      currency: 'VND',
      buyer: buyer,
      items: items,
      is_draft: isDraft === true
    };

    if (selectedVendor === 'sepay') {
      invoicePayload.provider_account_id = providerAccountId;
    }
    
    // Chỉ thêm notes nếu có giá trị
    if (this.invoiceData.notes && this.invoiceData.notes.trim() !== '') {
      invoicePayload.notes = this.invoiceData.notes.trim();
    }
    
    if (this.invoiceData['_id'] || this.invoiceData['invoiceId']) {
      invoicePayload.invoiceId = this.invoiceData['_id'] || this.invoiceData['invoiceId'];
    }
    
    console.log('[Invoice Component] Final e-invoice data:', JSON.stringify(invoicePayload, null, 2));
    
    return invoicePayload;
  }

  // Format ngày theo format Sepay: yyyy-MM-dd HH:mm:ss
  private formatDateForSepay(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  // Chuẩn bị dữ liệu cho EasyInvoice từ hotelInfo và invoiceData (LEGACY - giữ lại để tương thích)
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

    // Tính tổng tiền theo công thức mới
    // Tổng cộng = Tiền phòng (subtotal) + Phụ thu + Tiền dịch vụ (KHÔNG trừ khuyến mãi và đặt trước)
    const subtotal = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    const additionalCharges = this.invoiceData.additionalCharges || 0;
    const serviceTotal = this.serviceTotal || 0;
    const totalAmount = subtotal + additionalCharges + serviceTotal;
    
    // Còn lại phải thanh toán = Tổng cộng - Đặt trước - Khuyến mãi (cho phép số âm)
    const discount = this.invoiceData.discount || 0;
    const advancePayment = this.invoiceData.advancePayment || 0;
    const remainingAmount = totalAmount - advancePayment - discount;

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
      totalAmount: totalAmount, // Tổng cộng = tiền phòng + phụ thu + dịch vụ
      remainingAmount: remainingAmount, // Còn lại phải thanh toán = tổng cộng - đặt trước - khuyến mãi
      advancePayment: advancePayment,
      
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
      hotelId: this.invoiceData['hotelId'] || this.sessionContext.getSelectedHotelId(),
      bookingId: this.invoiceData['bookingId'] || ''
    };
  }
  
  checkInvoicePermissions(hotel: any): void {
    // Nếu là superadmin hoặc admin, luôn cho phép
    if (this.authService.isSuperAdmin() || this.authService.isAdmin()) {
      this.canViewDraftInvoice = true;
      this.canExportInvoice = true;
      return;
    }
    
    // Kiểm tra từ hotel settings
    if (hotel && hotel.settings) {
      this.canViewDraftInvoice = hotel.settings.enableDraftInvoice || false;
      this.canExportInvoice = hotel.settings.enableExportInvoice || false;
    } else {
      // Nếu không có hotel info, kiểm tra từ pricing package
      this.checkPricingPackagePermissions();
    }
    
    // Kiểm tra quota để ẩn nút "Xem hóa đơn nháp" nếu quota là 0/0
    this.checkQuotaForButtonVisibility();
  }
  
  /**
   * Kiểm tra quota để ẩn nút "Xem hóa đơn nháp" nếu quota là 0/0
   * Chạy nền sau khi render — không chặn mở hóa đơn.
   */
  checkQuotaForButtonVisibility(): void {
    const currentUser = this.authService?.getCurrentUser?.();
    const userRole = currentUser?.role;
    const isAdminOrSuperadmin = userRole === 'superadmin' || userRole === 'admin';
    
    if (isAdminOrSuperadmin) {
      return;
    }

    // Defer quota check để invoice hiện trước
    setTimeout(() => {
      this.invoiceService.getEInvoiceUsage(this.getEInvoiceProvider()).subscribe({
        next: (response: any) => {
          if (response.success !== false && response.data) {
            const quotaRemaining = response.data.quota_remaning || response.data.quota_remaining;
            const allocatedQuota = response.data.allocatedQuota || 0;
            const remaining = quotaRemaining ? parseInt(quotaRemaining, 10) : 0;
            const allocated = parseInt(allocatedQuota, 10) || 0;
            
            if (allocated === 0 && remaining === 0) {
              this.canViewDraftInvoice = false;
            }
          }
        },
        error: () => {}
      });
    }, 0);
  }
  
  checkPricingPackagePermissions(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      this.canViewDraftInvoice = false;
      this.canExportInvoice = false;
      return;
    }
    
    if (this.authService.isAdmin()) {
      return;
    }
    
    if (!this.authService.isBusiness()) {
      return;
    }
    
    if (!currentUser.businessId) {
      // Nếu không có businessId, mặc định tắt
      this.canViewDraftInvoice = false;
      this.canExportInvoice = false;
      return;
    }
    
    // Lấy thông tin pricing package từ business
    this.businessService.getBusinessById(currentUser.businessId).pipe(take(1)).subscribe({
      next: (business: any) => {
        if (business && business.subscribedPackage) {
          const packageId = business.subscribedPackage;
          // Gọi API để lấy thông tin package
          // Tạm thời, nếu có package thì cho phép (sẽ cần cập nhật sau khi có API)
          this.canViewDraftInvoice = true;
          this.canExportInvoice = true;
        } else {
          this.canViewDraftInvoice = false;
          this.canExportInvoice = false;
        }
      },
      error: () => {
        this.canViewDraftInvoice = false;
        this.canExportInvoice = false;
      }
    });
  }

  /**
   * Khởi tạo form chỉnh sửa
   */
  initEditForm(): void {
    const customerName = this.getCustomerName();
    const customerPhone = this.getCustomerPhone();
    const customerIdNumber = this.invoiceData['customerIdNumber'] || this.invoiceData.guestInfo?.idNumber || '';
    const taxCode = this.invoiceData.guestInfo?.tax_code || this.invoiceData['customerTaxCode'] || '';
    const customerAddress = this.invoiceData.guestInfo?.address || this.invoiceData['customerAddress'] || '';
    const guestSource = this.getGuestSource();
    const paymentMethod = this.invoiceData.paymentMethod || 'cash';
    
    this.editForm = this.fb.group({
      customerName: [customerName, Validators.required],
      customerPhone: [customerPhone],
      customerIdNumber: [customerIdNumber],
      taxCode: [taxCode],
      customerAddress: [customerAddress],
      guestSource: [guestSource],
      paymentMethod: [paymentMethod]
    });
  }

  /**
   * Khởi tạo danh sách sản phẩm/dịch vụ có thể chỉnh sửa
   */
  initEditableProducts(): void {
    // Kết hợp products và services thành một mảng
    this.editableProducts = [];
    
    // Thêm products
    if (this.invoiceData.products && Array.isArray(this.invoiceData.products)) {
      this.invoiceData.products.forEach((product: any) => {
        this.editableProducts.push({
          name: product.name || 'Sản phẩm',
          price: product.price || 0,
          quantity: product.quantity || 1,
          type: 'product'
        });
      });
    }
    
    // Thêm services
    if (this.invoiceData.services && Array.isArray(this.invoiceData.services)) {
      this.invoiceData.services.forEach((service: any) => {
        this.editableProducts.push({
          name: service.name || service.serviceName || 'Dịch vụ',
          price: service.price || 0,
          quantity: service.quantity || 1,
          type: 'service'
        });
      });
    }
    
    // Nếu không có sản phẩm/dịch vụ nào, thêm một dòng mặc định
    if (this.editableProducts.length === 0) {
      this.editableProducts.push({
        name: 'Tiền phòng',
        price: this.invoiceData.roomAmount || this.invoiceData.roomTotal || 0,
        quantity: 1,
        type: 'room'
      });
    }
  }

  /**
   * Cập nhật tổng tiền của sản phẩm
   */
  updateProductTotal(index: number): void {
    const product = this.editableProducts[index];
    if (product) {
      // Tự động tính lại tổng tiền
      const total = (product.price || 0) * (product.quantity || 1);
      // Có thể cập nhật totalAmount nếu cần
    }
  }

  /**
   * Thêm sản phẩm/dịch vụ mới
   */
  addProduct(): void {
    this.editableProducts.push({
      name: 'Sản phẩm/Dịch vụ mới',
      price: 0,
      quantity: 1,
      type: 'product'
    });
  }

  /**
   * Xóa sản phẩm/dịch vụ
   */
  removeProduct(index: number): void {
    if (this.editableProducts.length > 1) {
      this.editableProducts.splice(index, 1);
    } else {
      this.message.warning('Phải có ít nhất một sản phẩm/dịch vụ');
    }
  }

  /**
   * Lưu thay đổi hóa đơn
   */
  saveInvoiceChanges(): void {
    if (!this.editForm || this.editForm.invalid) {
      this.message.error(this.translate.instant('INVOICE.MESSAGES.FILL_REQUIRED'));
      return;
    }

    this.isSaving = true;

    // Cập nhật thông tin khách hàng
    if (!this.invoiceData.guestInfo) {
      this.invoiceData.guestInfo = {};
    }
    
    this.invoiceData.guestInfo.name = this.editForm.value.customerName;
    this.invoiceData.guestInfo.phone = this.editForm.value.customerPhone;
    this.invoiceData.guestInfo.idNumber = this.editForm.value.customerIdNumber;
    this.invoiceData.guestInfo.tax_code = this.editForm.value.taxCode;
    this.invoiceData.guestInfo.address = this.editForm.value.customerAddress;
    this.invoiceData.guestInfo.guestSource = this.editForm.value.guestSource;
    
    // Cập nhật thông tin khách hàng trực tiếp
    this.invoiceData.customerName = this.editForm.value.customerName;
    this.invoiceData.customerPhone = this.editForm.value.customerPhone;
    this.invoiceData['customerIdNumber'] = this.editForm.value.customerIdNumber;
    this.invoiceData['customerTaxCode'] = this.editForm.value.taxCode;
    this.invoiceData['customerAddress'] = this.editForm.value.customerAddress;
    this.invoiceData.guestSource = this.editForm.value.guestSource;
    this.invoiceData.paymentMethod = this.editForm.value.paymentMethod;

    // Cập nhật products và services từ editableProducts
    this.invoiceData.products = this.editableProducts
      .filter(p => p.type === 'product' || p.type === 'room')
      .map(p => ({
        name: p.name,
        price: p.price,
        quantity: p.quantity,
        totalPrice: (p.price || 0) * (p.quantity || 1)
      }));
    
    this.invoiceData.services = this.editableProducts
      .filter(p => p.type === 'service')
      .map(p => ({
        name: p.name,
        serviceName: p.name,
        price: p.price,
        quantity: p.quantity,
        totalPrice: (p.price || 0) * (p.quantity || 1)
      }));

    // Tính lại tổng tiền
    const productsTotal = this.invoiceData.products.reduce((sum, p) => sum + (p.totalPrice || 0), 0);
    const servicesTotal = this.invoiceData.services.reduce((sum, s) => sum + (s.totalPrice || 0), 0);
    this.invoiceData.totalAmount = productsTotal + servicesTotal + (this.invoiceData.additionalCharges || 0) - (this.invoiceData.discount || 0);

    // Lưu vào database
    const invoiceId = this.invoiceData['_id'] || this.invoiceData['invoiceId'];
    if (invoiceId) {
      this.invoiceService.updateInvoice(invoiceId, this.invoiceData).subscribe({
        next: (response: any) => {
          this.isSaving = false;
          this.message.success(this.translate.instant('INVOICE.MESSAGES.UPDATE_SUCCESS'));
          // Đóng modal và trả về kết quả
          if (this.modalRef) {
            this.modalRef.close('updated');
          }
        },
        error: (error: any) => {
          this.isSaving = false;
          console.error('Error updating invoice:', error);
          this.message.error(this.translate.instant('INVOICE.MESSAGES.UPDATE_ERROR', { message: error.error?.message || error.message }));
        }
      });
    } else {
      // Nếu không có invoiceId, chỉ cập nhật local data
      this.isSaving = false;
      this.message.success(this.translate.instant('INVOICE.MESSAGES.INFO_UPDATED'));
      if (this.modalRef) {
        this.modalRef.close('updated');
      }
    }
  }

  /**
   * Hủy chỉnh sửa
   */
  cancelEdit(): void {
    if (this.modalRef) {
      this.modalRef.close();
    }
  }
}
