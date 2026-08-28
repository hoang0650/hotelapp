import { Component, OnInit, OnDestroy } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { InvoiceService } from '../../services/invoice.service';
import { EInvoiceProviderService, EInvoiceVendor } from '../../services/e-invoice-provider.service';
import { HotelService } from '../../services/hotel.service';
import { SePayService, SePayPaymentData } from '../../services/sepay.service';

interface EInvoicePackage {
  id: string;
  name: string;
  invoiceCount: number;
  packagePrice: number;
  pricePerInvoice: number;
  selected: boolean;
  quantity: number;
}

interface DigitalSignaturePricing {
  duration: string;
  price: number;
}

@Component({
  selector: 'app-e-invoice-registration',
  templateUrl: './e-invoice-registration.component.html',
  styleUrls: ['./e-invoice-registration.component.css']
})
export class EInvoiceRegistrationComponent implements OnInit, OnDestroy {
  loading = false;
  packages: EInvoicePackage[] = [];
  selectedPackages: EInvoicePackage[] = [];
  totalAmount = 0;
  currentUser: any = null;
  
  // Quota allocation (cho admin/superadmin)
  isAdmin = false;
  hotels: any[] = [];
  loadingHotels = false;
  selectedHotelId: string | null = null;
  showQuotaAllocation = false;
  systemQuota: any = null;
  loadingSystemQuota = false;
  
  // Payment modal
  showPaymentModal = false;
  paymentAmount = 0;
  paymentQrUrl = '';
  paymentBeneficiaryName = '';
  paymentBankName = '';
  paymentAccountNumber = '';
  paymentHistoryId = '';
  private paymentStatusCheckInterval: any = null;
  
  // Digital signature pricing
  selectedVendor: EInvoiceVendor = 'sepay';
  vendorOptions: { id: EInvoiceVendor; name: string }[] = [];

  digitalSignaturePricing: DigitalSignaturePricing[] = [
    { duration: '1 năm', price: 1272000 },
    { duration: '2 năm', price: 2544000 },
    { duration: '3 năm', price: 3816000 }
  ];

  constructor(
    private http: HttpClient,
    private message: NzMessageService,
    private authService: AuthService,
    private invoiceService: InvoiceService,
    private eInvoiceProviderService: EInvoiceProviderService,
    private hotelService: HotelService,
    private sepayService: SePayService,
    private translate: TranslateService
  ) {
    this.initializePackages();
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.vendorOptions = this.eInvoiceProviderService.vendorOptions;
    this.selectedVendor = this.eInvoiceProviderService.getSelectedVendor();
    this.isAdmin = this.authService.isAdmin() || this.authService.isSuperAdmin();
    this.loadExistingPackages();
    
    // Nếu là admin, load danh sách hotel và system quota
    if (this.isAdmin) {
      this.loadHotels();
      this.loadSystemQuota();
    }
  }
  
  loadHotels(): void {
    this.loadingHotels = true;
    this.hotelService.getHotels().subscribe({
      next: (hotels: any[]) => {
        this.loadingHotels = false;
        this.hotels = hotels || [];
      },
      error: (error) => {
        this.loadingHotels = false;
        console.error('Error loading hotels:', error);
      }
    });
  }
  
  loadSystemQuota(): void {
    this.loadingSystemQuota = true;
    this.invoiceService.getEInvoiceUsage(this.selectedVendor).subscribe({
      next: (response: any) => {
        this.loadingSystemQuota = false;
        if (response.success !== false && response.data) {
          this.systemQuota = response.data;
        }
      },
      error: (error) => {
        this.loadingSystemQuota = false;
        console.error('Error loading system quota:', error);
      }
    });
  }

  onVendorChange(vendor: EInvoiceVendor): void {
    this.eInvoiceProviderService.setSelectedVendor(vendor);
    this.selectedVendor = vendor;
    if (this.isAdmin && this.showQuotaAllocation) {
      this.loadSystemQuota();
    }
  }

  initializePackages(): void {
    this.packages = [
      {
        id: 'einvoice-300',
        name: 'elnvoice-300',
        invoiceCount: 300,
        packagePrice: 180000,
        pricePerInvoice: 600,
        selected: false,
        quantity: 0
      },
      {
        id: 'einvoice-500',
        name: 'elnvoice-500',
        invoiceCount: 500,
        packagePrice: 240000,
        pricePerInvoice: 480,
        selected: false,
        quantity: 0
      },
      {
        id: 'einvoice-1k',
        name: 'elnvoice-1K',
        invoiceCount: 1000,
        packagePrice: 450000,
        pricePerInvoice: 450,
        selected: false,
        quantity: 0
      },
      {
        id: 'einvoice-3k',
        name: 'elnvoice-3K',
        invoiceCount: 3000,
        packagePrice: 720000,
        pricePerInvoice: 240,
        selected: false,
        quantity: 0
      },
      {
        id: 'einvoice-5k',
        name: 'elnvoice-5K',
        invoiceCount: 5000,
        packagePrice: 900000,
        pricePerInvoice: 180,
        selected: false,
        quantity: 0
      },
      {
        id: 'einvoice-10k',
        name: 'elnvoice-10K',
        invoiceCount: 10000,
        packagePrice: 1610000,
        pricePerInvoice: 161,
        selected: false,
        quantity: 0
      },
      {
        id: 'einvoice-20k',
        name: 'elnvoice-20K',
        invoiceCount: 20000,
        packagePrice: 3000000,
        pricePerInvoice: 150,
        selected: false,
        quantity: 0
      },
      {
        id: 'einvoice-50k',
        name: 'elnvoice-50K',
        invoiceCount: 50000,
        packagePrice: 6500000,
        pricePerInvoice: 130,
        selected: false,
        quantity: 0
      },
      {
        id: 'einvoice-200k',
        name: 'elnvoice-200K',
        invoiceCount: 200000,
        packagePrice: 20000000,
        pricePerInvoice: 100,
        selected: false,
        quantity: 0
      }
    ];
  }

  loadExistingPackages(): void {
    // TODO: Load existing packages from backend if needed
  }

  onPackageSelect(pkg: EInvoicePackage): void {
    pkg.selected = true;
    pkg.quantity = 1;
    if (!this.selectedPackages.find(p => p.id === pkg.id)) {
      this.selectedPackages.push(pkg);
    }
    this.calculateTotal();
  }

  onPackageDeselect(pkg: EInvoicePackage): void {
    pkg.selected = false;
    pkg.quantity = 0;
    this.selectedPackages = this.selectedPackages.filter(p => p.id !== pkg.id);
    this.calculateTotal();
  }

  onQuantityChange(pkg: EInvoicePackage, quantity: number): void {
    if (quantity <= 0 || !quantity) {
      this.onPackageDeselect(pkg);
    } else {
      pkg.quantity = quantity;
      this.calculateTotal();
    }
  }

  calculateTotal(): void {
    this.totalAmount = this.selectedPackages.reduce((sum, pkg) => {
      return sum + (pkg.packagePrice * pkg.quantity);
    }, 0);
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('vi-VN').format(price);
  }

  onSubmit(): void {
    if (this.selectedPackages.length === 0) {
      this.message.warning('Vui lòng chọn ít nhất một gói hóa đơn điện tử');
      return;
    }

    if (!this.currentUser) {
      this.message.error(this.translate.instant('E_INVOICE_REGISTRATION.MESSAGES.LOGIN_REQUIRED'));
      return;
    }

    // Nếu là admin và đã chọn hotel, phân chia quota
    if (this.isAdmin && this.selectedHotelId && this.showQuotaAllocation) {
      this.allocateQuotaToHotel();
      return;
    }

    // Nếu không phải admin hoặc chưa chọn hotel, hiển thị modal thanh toán
    this.openPaymentModal();
  }
  
  openPaymentModal(): void {
    if (this.totalAmount <= 0) {
      this.message.warning('Tổng tiền phải lớn hơn 0');
      return;
    }

    // Tạo payment history cho e-invoice packages
    // Không truyền packageId vì e-invoice packages không phải pricing packages
    const userId = this.currentUser._id || this.currentUser.id;
    const packageNames = this.selectedPackages.map(pkg => `${pkg.name} x${pkg.quantity}`).join(', ');
    
    // Gọi trực tiếp API create-payment-history với payload đơn giản
    const payload = {
      userId: userId,
      amount: this.totalAmount,
      currency: 'VND',
      description: `Đăng ký gói hóa đơn điện tử: ${packageNames}`,
      // Không truyền packageId vì e-invoice packages không phải pricing packages
      // Backend sẽ xử lý như một payment thông thường
    };

    this.loading = true;
    // Gọi trực tiếp API create-payment-history
    this.http.post(`${environment.apiUrl}/sepay/create-payment-history`, payload).subscribe({
      next: (response: any) => {
        this.loading = false;
        console.log('[EInvoice Registration] Payment history response:', JSON.stringify(response, null, 2));
        
        // Kiểm tra response.success (có thể là true, false, hoặc undefined)
        if (response.success !== false) {
          // Lấy QR code và thông tin thanh toán từ response
          const qrUrl = response.qrPaymentUrl || response.data?.qrPaymentUrl;
          const beneficiaryName = response.beneficiaryName || response.data?.beneficiaryName || '';
          const bankName = response.bankName || response.data?.bankName || '';
          const accountNumber = response.accountNumber || response.data?.accountNumber || '';
          const paymentHistoryId = response.paymentHistoryId || response.data?.paymentHistoryId || '';
          
          console.log('[EInvoice Registration] QR URL from response:', qrUrl ? `Found: ${qrUrl.substring(0, 50)}...` : 'Not found');
          console.log('[EInvoice Registration] Response keys:', Object.keys(response));
          
          if (!qrUrl) {
            // Nếu không có QR code, có thể là do hệ thống chưa có QR code
            // Nhưng vẫn cho phép tiếp tục nếu có paymentHistoryId (để user có thể thanh toán sau)
            console.warn('[EInvoice Registration] No QR code in response, but payment history created');
            this.message.warning('Hệ thống chưa có QR code thanh toán. Vui lòng liên hệ quản trị viên để cập nhật. Mã thanh toán: ' + (response.paymentCode || paymentHistoryId));
            return;
          }
          
          // Lưu thông tin thanh toán và hiển thị modal
          this.paymentAmount = this.totalAmount;
          this.paymentQrUrl = qrUrl;
          this.paymentBeneficiaryName = beneficiaryName;
          this.paymentBankName = bankName;
          this.paymentAccountNumber = accountNumber;
          this.paymentHistoryId = paymentHistoryId;
          
          // Hiển thị modal
          this.showPaymentModal = true;
          
          // Bắt đầu polling để kiểm tra trạng thái thanh toán
          this.startPaymentStatusPolling();
        } else {
          // Response có success: false hoặc error
          console.error('[EInvoice Registration] Payment history creation failed:', response);
          const errorMsg = response.error || response.message || this.translate.instant('E_INVOICE_REGISTRATION.MESSAGES.CREATE_PAYMENT_HISTORY_ERROR');
          this.message.error(errorMsg);
        }
      },
      error: (error: any) => {
        this.loading = false;
        console.error('Error creating payment history:', error);
        const errorMessage = error.error?.error || error.error?.message || error.message || this.translate.instant('E_INVOICE_REGISTRATION.MESSAGES.CREATE_PAYMENT_HISTORY_ERROR_RETRY');
        this.message.error(errorMessage);
      }
    });
  }
  
  /**
   * Bắt đầu polling để kiểm tra trạng thái thanh toán
   */
  startPaymentStatusPolling(): void {
    // Dừng interval cũ nếu có
    if (this.paymentStatusCheckInterval) {
      clearInterval(this.paymentStatusCheckInterval);
    }
    
    // Kiểm tra trạng thái mỗi 5 giây
    this.paymentStatusCheckInterval = setInterval(() => {
      if (!this.paymentHistoryId) {
        return;
      }
      
      // Gọi API để kiểm tra trạng thái thanh toán
      this.http.get(`${environment.apiUrl}/sepay/payment-history/${this.paymentHistoryId}`).subscribe({
        next: (response: any) => {
          if (response.success && response.data) {
            const status = response.data.status;
            if (status === 'completed' || status === 'success') {
              // Thanh toán thành công
              this.message.success(this.translate.instant('E_INVOICE_REGISTRATION.MESSAGES.PAYMENT_PROCESSING'));
              this.closePaymentModal();
              
              // Gọi API đăng ký gói sau khi thanh toán thành công
              this.registerPackagesAfterPayment();
            } else if (status === 'failed' || status === 'cancelled') {
              // Thanh toán thất bại hoặc bị hủy
              clearInterval(this.paymentStatusCheckInterval);
              this.paymentStatusCheckInterval = null;
            }
          }
        },
        error: (error) => {
          console.error('Error checking payment status:', error);
        }
      });
    }, 5000); // Kiểm tra mỗi 5 giây
  }
  
  /**
   * Đăng ký gói sau khi thanh toán thành công
   */
  registerPackagesAfterPayment(): void {
    const userId = this.currentUser._id || this.currentUser.id;
    const orderData = {
      userId: userId,
      packages: this.selectedPackages.map(pkg => ({
        packageId: pkg.id,
        packageName: pkg.name,
        quantity: pkg.quantity,
        invoiceCount: pkg.invoiceCount,
        packagePrice: pkg.packagePrice,
        totalPrice: pkg.packagePrice * pkg.quantity
      })),
      totalAmount: this.totalAmount,
      paymentHistoryId: this.paymentHistoryId
    };

    this.http.post(`${environment.apiUrl}/e-invoice/register`, orderData).subscribe({
      next: (response: any) => {
        if (response.success !== false) {
          this.message.success(this.translate.instant('E_INVOICE_REGISTRATION.MESSAGES.SUBSCRIBE_SUCCESS'));
          
          // Emit event để e-invoice-management component reload quota
          // Hoặc có thể dùng service để notify
          window.dispatchEvent(new CustomEvent('eInvoiceQuotaUpdated'));
          
          // Reset form
          this.selectedPackages = [];
          this.packages.forEach(pkg => {
            pkg.selected = false;
            pkg.quantity = 0;
          });
          this.totalAmount = 0;
          this.closePaymentModal();
        } else {
          this.message.error(response.message || this.translate.instant('E_INVOICE_REGISTRATION.MESSAGES.SUBSCRIBE_ERROR'));
        }
      },
      error: (error) => {
        console.error('Error registering e-invoice packages:', error);
        this.message.error(error.error?.error?.message || error.error?.message || this.translate.instant('E_INVOICE_REGISTRATION.MESSAGES.SUBSCRIBE_ERROR'));
      }
    });
  }
  
  /**
   * Đóng modal thanh toán
   */
  closePaymentModal(): void {
    this.showPaymentModal = false;
    
    // Dừng polling
    if (this.paymentStatusCheckInterval) {
      clearInterval(this.paymentStatusCheckInterval);
      this.paymentStatusCheckInterval = null;
    }
  }
  
  ngOnDestroy(): void {
    // Dừng polling khi component bị destroy
    if (this.paymentStatusCheckInterval) {
      clearInterval(this.paymentStatusCheckInterval);
    }
  }
  
  allocateQuotaToHotel(): void {
    if (!this.selectedHotelId) {
      this.message.warning('Vui lòng chọn khách sạn để phân chia quota');
      return;
    }

    // Tính tổng quota từ các gói đã chọn
    const totalQuota = this.selectedPackages.reduce((sum, pkg) => {
      return sum + (pkg.invoiceCount * pkg.quantity);
    }, 0);

    if (totalQuota <= 0) {
      this.message.warning('Tổng quota phải lớn hơn 0');
      return;
    }

    // Kiểm tra system quota còn đủ không
    if (this.systemQuota && this.systemQuota.unallocatedQuota < totalQuota) {
      this.message.error(this.translate.instant('E_INVOICE_REGISTRATION.MESSAGES.QUOTA_INSUFFICIENT', {
        remaining: this.systemQuota.unallocatedQuota,
        required: totalQuota
      }));
      return;
    }

    this.loading = true;

    // Phân chia quota cho từng gói
    const allocationPromises = this.selectedPackages.map(pkg => {
      const quota = pkg.invoiceCount * pkg.quantity;
      return this.invoiceService.allocateQuota({
        hotelId: this.selectedHotelId!,
        quota: quota,
        packageId: pkg.id,
        packageName: pkg.name,
        invoiceCount: pkg.invoiceCount,
        paymentStatus: 'paid' // Giả sử đã thanh toán khi admin phân chia
      }).toPromise();
    });

    Promise.all(allocationPromises).then(() => {
      this.loading = false;
      this.message.success(this.translate.instant('E_INVOICE_REGISTRATION.MESSAGES.QUOTA_ALLOCATED', { totalQuota }));
      // Reset form
      this.selectedPackages = [];
      this.packages.forEach(pkg => {
        pkg.selected = false;
        pkg.quantity = 0;
      });
      this.totalAmount = 0;
      this.selectedHotelId = null;
      // Reload system quota
      this.loadSystemQuota();
    }).catch((error) => {
      this.loading = false;
      console.error('Error allocating quota:', error);
      this.message.error(error.error?.error?.message || this.translate.instant('E_INVOICE_REGISTRATION.MESSAGES.QUOTA_ALLOCATE_ERROR'));
    });
  }

  onDigitalSignatureLinkClick(): void {
    // TODO: Navigate to digital signature pricing page or open modal
    this.message.info('Chức năng đang được phát triển');
  }
}

