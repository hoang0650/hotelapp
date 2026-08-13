import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { InvoiceService, Invoice } from '../../services/invoice.service';
import { HotelService } from '../../services/hotel.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-invoice-modal',
  templateUrl: './invoice-modal.component.html',
  styleUrls: ['./invoice-modal.component.css']
})
export class InvoiceModalComponent implements OnInit, OnDestroy {
  isVisible = false;
  invoiceData: Invoice = {};
  isLoading = false;
  private destroy$ = new Subject<void>();

  // Computed values
  subtotal = 0;
  serviceTotal = 0;
  finalTotal = 0;
  remainingAmount = 0;
  durationText = '';

  // Business info
  businessInfo: any = null;

  constructor(
    private invoiceService: InvoiceService,
    private hotelService: HotelService,
    private message: NzMessageService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    // Theo dõi trạng thái hiển thị modal
    this.invoiceService.isModalVisible()
      .pipe(takeUntil(this.destroy$))
      .subscribe((visible: boolean) => {
        this.isVisible = visible;
      });

    // Theo dõi dữ liệu hóa đơn hiện tại
    this.invoiceService.getCurrentInvoice()
      .pipe(takeUntil(this.destroy$))
      .subscribe((invoice: Invoice | null) => {
        if (invoice) {
          console.log('=== invoice-modal received data ===', invoice);
          this.invoiceData = invoice;
          this.ensureInvoiceData();
          this.loadBusinessInfo();
          this.calculateTotals();
          this.calculateDuration();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Tải thông tin business/hotel
  loadBusinessInfo(): void {
    if (this.invoiceData.businessName && this.invoiceData.businessName !== 'Khách sạn') {
      return;
    }

    if (this.invoiceData['hotelInfo']?.name) {
      const hotel = this.invoiceData['hotelInfo'];
      this.businessInfo = hotel;
      this.invoiceData.businessName = hotel.name || 'Khách sạn';
      this.invoiceData.business_address =
        typeof hotel.address === 'string'
          ? hotel.address
          : [hotel.address?.street, hotel.address?.city].filter(Boolean).join(', ');
      this.invoiceData.phoneNumber = hotel.contactInfo?.phone || hotel.phone || hotel.phoneNumber || '';
      return;
    }

    const hotelIdRaw: any = this.invoiceData.hotelId || this.invoiceData['hotelId'];
    const hotelId =
      hotelIdRaw && typeof hotelIdRaw === 'object'
        ? String(hotelIdRaw._id || hotelIdRaw.id || '').trim()
        : String(hotelIdRaw || '').trim();
    if (!hotelId || hotelId === 'undefined' || hotelId === 'null') {
      return;
    }

    this.hotelService.getHotelInfo(hotelId, { lite: true })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (hotel: any) => {
          if (hotel) {
            this.businessInfo = hotel;
            this.invoiceData.businessName = hotel.name || 'Khách sạn';
            this.invoiceData.business_address =
              typeof hotel.address === 'string'
                ? hotel.address
                : [hotel.address?.street, hotel.address?.city].filter(Boolean).join(', ');
            this.invoiceData.phoneNumber = hotel.contactInfo?.phone || hotel.phone || hotel.phoneNumber || '';
          }
        },
        error: (err) => {
          console.error('Error loading hotel info:', err);
        }
      });
  }

  // Tính thời gian lưu trú
  calculateDuration(): void {
    const checkIn = this.invoiceData.checkInTime || this.invoiceData['checkIn'];
    const checkOut = this.invoiceData.checkOutTime || this.invoiceData['checkOut'];
    
    if (checkIn && checkOut) {
      const checkInDate = new Date(checkIn);
      const checkOutDate = new Date(checkOut);
      const diffMs = checkOutDate.getTime() - checkInDate.getTime();
      const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
      const diffDays = Math.ceil(diffHours / 24);
      
      if (diffDays >= 1) {
        this.durationText = `${diffDays} ngày ${diffHours % 24 > 0 ? `${diffHours % 24} giờ` : ''}`;
      } else {
        this.durationText = `${diffHours} giờ`;
      }
    } else {
      this.durationText = 'N/A';
    }
  }

  // Tính tổng tiền
  calculateTotals(): void {
    // Lấy roomTotal
    const roomTotal = this.invoiceData['roomTotal'] || this.invoiceData['roomAmount'] || 0;
    
    // Tính serviceTotal từ services array hoặc servicesTotal
    this.serviceTotal = this.invoiceData['servicesTotal'] || this.invoiceData['serviceAmount'] || 0;
    
    // Nếu có services array, tính lại
    const services = this.invoiceData['services'] as any[];
    if (services && Array.isArray(services) && services.length > 0) {
      this.serviceTotal = services.reduce((sum, s) => {
        return sum + (s.totalPrice || (s.price || 0) * (s.quantity || 1));
      }, 0);
    }
    
    // Tính subtotal từ products
    if (this.invoiceData.products && this.invoiceData.products.length > 0) {
      this.subtotal = this.invoiceData.products.reduce((sum, item) => {
        return sum + (item.price || 0) * (item.quantity || 1);
      }, 0);
    } else {
      this.subtotal = roomTotal + this.serviceTotal;
    }
    
    // Lấy các giá trị khác
    const additionalCharges = this.invoiceData['additionalCharges'] || 0;
    const discount = this.invoiceData['discount'] || 0;
    const advancePayment = this.invoiceData['advancePayment'] || 0;
    
    // Tính tổng cuối cùng
    if (this.invoiceData.totalAmount && this.invoiceData.totalAmount > 0) {
      this.finalTotal = this.invoiceData.totalAmount;
    } else {
      this.finalTotal = this.subtotal + additionalCharges - discount;
    }
    
    // Tính còn lại phải trả
    this.remainingAmount = this.finalTotal - advancePayment;
    
    // Đảm bảo không âm
    this.finalTotal = Math.max(0, this.finalTotal);
  }
  
  // Đảm bảo hóa đơn luôn có dữ liệu hợp lệ để hiển thị
  ensureInvoiceData(): void {
    if (!this.invoiceData.date) {
      this.invoiceData.date = new Date();
    }
    
    // Tạo số hóa đơn format chuẩn INV-{timestamp}
    if (!this.invoiceData.invoiceNumber) {
      this.invoiceData.invoiceNumber = 'INV-' + new Date().getTime();
    }
    
    if (!this.invoiceData.products) {
      this.invoiceData.products = [];
    }
    
    // Đảm bảo luôn có dữ liệu sản phẩm mặc định nếu không có
    if (this.invoiceData.products.length === 0) {
      // Thêm tiền phòng
      const roomPrice = this.invoiceData['roomTotal'] || this.invoiceData['roomAmount'] || this.invoiceData.amount || 0;
      if (roomPrice > 0 && this.invoiceData.roomNumber) {
        this.invoiceData.products.push({
          name: `Tiền phòng ${this.invoiceData.roomNumber}`,
          quantity: 1,
          price: roomPrice
        });
      }
      
      // Thêm chi tiết dịch vụ nếu có
      const services = this.invoiceData['services'] as any[];
      if (services && Array.isArray(services) && services.length > 0) {
        services.forEach(service => {
          this.invoiceData.products!.push({
            name: service.serviceName || service.name || 'Dịch vụ',
            quantity: service.quantity || 1,
            price: service.price || 0
          });
        });
      } else {
        // Fallback: thêm servicesTotal nếu có
        const servicesTotal = this.invoiceData['servicesTotal'] || this.invoiceData['serviceAmount'] || 0;
        if (servicesTotal > 0) {
          this.invoiceData.products.push({
            name: 'Dịch vụ sử dụng',
            quantity: 1,
            price: servicesTotal
          });
        }
      }
    }
  }

  // Lấy tên khách hàng
  getCustomerName(): string {
    return this.invoiceData.customerName || 
           this.invoiceData.guestInfo?.name || 
           this.invoiceData['guestDetails']?.name ||
           'Khách lẻ';
  }

  // Lấy SĐT khách hàng
  getCustomerPhone(): string {
    return this.invoiceData['customerPhone'] || 
           this.invoiceData.guestInfo?.phone || 
           this.invoiceData['guestDetails']?.phone ||
           '';
  }

  // Lấy CCCD/CMND khách hàng
  getCustomerIdNumber(): string {
    return this.invoiceData['customerIdNumber'] ||
           (this.invoiceData['guestInfo'] as any)?.idNumber ||
           (this.invoiceData['guestDetails'] as any)?.idNumber ||
           '';
  }

  // Lấy email khách hàng
  getCustomerEmail(): string {
    return this.invoiceData['customerEmail'] || 
           this.invoiceData.guestInfo?.email || 
           this.invoiceData['guestDetails']?.email ||
           '';
  }

  // Lấy label hình thức thanh toán
  getPaymentMethodLabel(): string {
    const method = (this.invoiceData.paymentMethod || 'cash').toLowerCase();
    const labels: {[key: string]: string} = {
      'cash': 'Tiền mặt',
      'card': 'Thẻ ngân hàng',
      'bank_transfer': 'Chuyển khoản',
      'transfer': 'Chuyển khoản',
      'banking': 'Chuyển khoản',
      'qr': 'Quét mã QR',
      'visa': 'Visa/Mastercard'
    };
    return labels[method] || method;
  }

  // Lấy label hình thức tính giá
  getRateTypeLabel(): string {
    const rateType = this.invoiceData['rateType'] || 'hourly';
    const labels: {[key: string]: string} = {
      'hourly': 'Theo giờ',
      'daily': 'Ngày đêm',
      'nightly': 'Qua đêm',
      'weekly': 'Theo tuần',
      'monthly': 'Theo tháng'
    };
    return labels[rateType] || rateType;
  }

  // Lấy danh sách dịch vụ
  getServices(): any[] {
    const services = this.invoiceData['services'] as any[];
    if (services && Array.isArray(services) && services.length > 0) {
      return services;
    }
    return [];
  }

  handleCancel(): void {
    this.invoiceService.hideInvoiceModal();
  }

  printInvoice(): void {
    window.print();
  }

  downloadInvoice(): void {
    this.message.info('Đang tải xuống hóa đơn');
  }

  sendInvoiceByEmail(): void {
    this.message.info('Chức năng gửi email đang được phát triển');
  }

  deleteInvoice(): void {
    if (!this.invoiceData.id) {
      this.message.warning('Không thể xóa hóa đơn: Thiếu ID');
      return;
    }

    this.isLoading = true;
    this.invoiceService.deleteInvoice(this.invoiceData.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        () => {
          this.message.success(this.translate.instant('INVOICE_MODAL.MESSAGES.DELETE_SUCCESS'));
          this.handleCancel();
          this.isLoading = false;
        },
        error => {
          console.error('Lỗi khi xóa hóa đơn:', error);
          this.message.error(this.translate.instant('INVOICE_MODAL.MESSAGES.DELETE_FAILED'));
          this.isLoading = false;
        }
      );
  }

  // Format currency
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount || 0);
  }
}
