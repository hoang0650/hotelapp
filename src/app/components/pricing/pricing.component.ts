import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { PricingService } from '../../services/pricing.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { AuthService } from '../../services/auth.service';
import { PayPalPaymentData } from '../paypal-payment/paypal-payment.component';

interface PricingPlan {
  name: string;
  price: string;
  period: string;
  description: string;
  features: { text: string; active: boolean }[];
  banks: string[];
  highlight?: boolean;
  subTitle?: string;
  selectText?: string;
  transactions?: string;
  note?: string;
}

@Component({
  selector: 'app-pricing',
  templateUrl: './pricing.component.html',
  styleUrl: './pricing.component.css'
})
export class PricingComponent implements OnInit {
  billingType: 'monthly' | 'yearly' = 'monthly';
  packages: any[] = [];
  currentPackage: any;
  loading = false;
  userId: string = '';
  showPayPalModal = false;
  payPalPaymentData: PayPalPaymentData | null = null;

  plans: PricingPlan[] = [
    {
      name: 'FREE',
      price: '0đ',
      period: '/tháng',
      description: '50 giao dịch/tháng',
      features: [
        { text: 'Chia sẻ biến động số dư', active: true },
        { text: 'Cổng thanh toán trực tuyến', active: true },
        { text: 'Hỗ trợ Webhook, API', active: true },
        { text: 'Tất cả tính năng của SePay', active: true }
      ],
      banks: ['vietcombank', 'acb', 'mb', 'tpb', 'vpb', 'vib', 'ocb', 'shb', 'bacabank'],
      selectText: 'Chọn',
      note: '(Cho phép vượt giao dịch và tính phí sau vượt)'
    },
    {
      name: 'STARTUP',
      price: '84,000đ',
      period: '/tháng',
      description: '180 giao dịch/tháng',
      subTitle: 'Ngân hàng hợp tác',
      features: [
        { text: 'Chia sẻ biến động số dư', active: true },
        { text: 'Cổng thanh toán trực tuyến', active: true },
        { text: 'Hỗ trợ Webhook, API', active: true },
        { text: 'Tất cả tính năng của SePay', active: true }
      ],
      banks: ['vietcombank', 'acb', 'mb', 'tpb', 'vpb', 'vib', 'ocb', 'shb', 'bacabank'],
      highlight: true,
      selectText: 'Chọn',
      note: '(Cho phép vượt giao dịch và tính phí sau vượt)'
    },
    {
      name: 'PINNACLE',
      price: '1,001,000đ',
      period: '/tháng',
      description: '2,300 giao dịch/tháng',
      subTitle: 'Tất cả ngân hàng',
      features: [
        { text: 'Chia sẻ biến động số dư', active: true },
        { text: 'Cổng thanh toán trực tuyến', active: true },
        { text: 'Hỗ trợ Webhook, API', active: true },
        { text: 'Tất cả tính năng của SePay', active: true }
      ],
      banks: ['vietcombank', 'acb', 'mb', 'tpb', 'vpb', 'vib', 'ocb', 'shb', 'bacabank', 'bidv', 'agribank', 'sacombank', 'techcombank', 'eximbank', 'abbank', 'pvcombank', 'vietinbank', 'seabank', 'lpb', 'hdbank', 'scb', 'namabank', 'vietcapital', 'pgbank', 'banviet', 'cbbank', 'msb', 'baoviet', 'dongabank', 'saigonbank', 'vietbank'],
      selectText: 'Chọn',
      note: '(Cho phép vượt giao dịch và tính phí sau vượt)'
    }
  ];

  bankIcons: { [key: string]: string } = {
    vietcombank: 'assets/banks/vietcombank.png',
    acb: 'assets/banks/acb.png',
    mb: 'assets/banks/mb.png',
    tpb: 'assets/banks/tpb.png',
    vpb: 'assets/banks/vpb.png',
    vib: 'assets/banks/vib.png',
    ocb: 'assets/banks/ocb.png',
    shb: 'assets/banks/shb.png',
    bacabank: 'assets/banks/bacabank.png',
    bidv: 'assets/banks/bidv.png',
    agribank: 'assets/banks/agribank.png',
    sacombank: 'assets/banks/sacombank.png',
    techcombank: 'assets/banks/techcombank.png',
    eximbank: 'assets/banks/eximbank.png',
    abbank: 'assets/banks/abbank.png',
    pvcombank: 'assets/banks/pvcombank.png',
    vietinbank: 'assets/banks/vietinbank.png',
    seabank: 'assets/banks/seabank.png',
    lpb: 'assets/banks/lpb.png',
    hdbank: 'assets/banks/hdbank.png',
    scb: 'assets/banks/scb.png',
    namabank: 'assets/banks/namabank.png',
    vietcapital: 'assets/banks/vietcapital.png',
    pgbank: 'assets/banks/pgbank.png',
    banviet: 'assets/banks/banviet.png',
    cbbank: 'assets/banks/cbbank.png',
    msb: 'assets/banks/msb.png',
    baoviet: 'assets/banks/baoviet.png',
    dongabank: 'assets/banks/dongabank.png',
    saigonbank: 'assets/banks/saigonbank.png',
    vietbank: 'assets/banks/vietbank.png',
  };

  constructor(
    private pricingService: PricingService,
    private message: NzMessageService,
    private modal: NzModalService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?._id) {
      this.userId = currentUser._id;
    }
  }

  ngOnInit(): void {
    this.loadPackages();
    if (this.userId) {
      this.loadCurrentPackage();
    } else {
      this.currentPackage = null;
    }
  }

  loadPackages(): void {
    this.loading = true;
    this.pricingService.getAllPackages().subscribe({
      next: (response) => {
        if (response.success !== false) {
          this.packages = response.data || response || [];
        } else {
          this.packages = [];
          // Không hiển thị lỗi nếu chỉ là response format khác
          if (response.message) {
            this.message.error(response.message);
          }
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading packages:', error);
        // Chỉ hiển thị lỗi nếu không phải lỗi 401/403 (không cần đăng nhập)
        if (error.status !== 401 && error.status !== 403) {
          this.message.error(error.error?.message || 'Không thể tải thông tin gói dịch vụ');
        }
        this.loading = false;
      }
    });
  }

  loadCurrentPackage(): void {
    if (!this.userId) return;
    
    this.pricingService.getCurrentUserPackage(this.userId).subscribe({
      next: (response: any) => {
        if (response && response.success !== false) {
          this.currentPackage = response.data || response;
          // Cập nhật billingType nếu có
          if (response.billingType) {
            this.billingType = response.billingType;
          } else if (this.currentPackage?.billingType) {
            this.billingType = this.currentPackage.billingType;
          }
        } else {
          this.currentPackage = null;
        }
      },
      error: (error) => {
        console.error('Error loading current package:', error);
        // Không hiển thị lỗi nếu user chưa có gói (404 hoặc null)
        if (error.status !== 404 && error.status !== 400) {
          this.message.error(error.error?.message || 'Không thể tải thông tin gói hiện tại');
        }
        this.currentPackage = null;
      }
    });
  }

  subscribeToPlan(packageId: string) {
    if (!this.userId) {
      this.message.warning('Vui lòng đăng nhập để đăng ký gói');
      return;
    }

    // Xác nhận đăng ký với billingType hiện tại
    const billingTypeText = this.billingType === 'yearly' ? 'theo năm' : 'theo tháng';
    const pkg = this.packages.find(p => (p._id || p.id) === packageId);
    const packagePrice = pkg ? this.getPackagePrice(pkg) : 0;
    const priceText = this.formatPrice(packagePrice);

    // Mở PayPal payment modal
    this.payPalPaymentData = {
      packageId: packageId,
      packageName: pkg?.name || 'N/A',
      amount: packagePrice,
      billingType: this.billingType,
      currency: 'USD', // Mặc định USD, người dùng có thể thay đổi trong modal
      description: `Đăng ký gói ${pkg?.name || 'N/A'} - ${billingTypeText}`
    };
    this.showPayPalModal = true;
  }

  cancelSubscription(): void {
    if (!this.userId) {
      this.message.warning('Vui lòng đăng nhập để hủy gói');
      return;
    }

    this.modal.confirm({
      nzTitle: 'Xác nhận hủy gói',
      nzContent: 'Bạn có chắc chắn muốn hủy gói hiện tại?',
      nzOkText: 'Hủy gói',
      nzCancelText: 'Giữ lại',
      nzOnOk: () => {
        this.loading = true;
        this.pricingService.cancelSubscription(this.userId).subscribe({
          next: (response) => {
            if (response.success !== false) {
              this.message.success(response.message || 'Hủy gói thành công');
              this.currentPackage = null;
            } else {
              this.message.error(response.message || 'Hủy gói thất bại');
            }
            this.loading = false;
          },
          error: (error) => {
            console.error('Cancel subscription error:', error);
            if (error.status === 401) {
              this.message.error('Vui lòng đăng nhập để hủy gói');
            } else if (error.status === 403) {
              this.message.error('Bạn không có quyền hủy gói dịch vụ');
            } else {
              this.message.error(error.error?.message || 'Hủy gói thất bại');
            }
            this.loading = false;
          }
        });
      }
    });
  }

  isFreePackage(pkg: any): boolean {
    return pkg?.name?.toUpperCase() === 'FREE' || pkg?.id === 'free' || pkg?._id === 'free';
  }

  formatPrice(price: number): string {
    if (!price && price !== 0) return '0';
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  }

  getPackageDescription(pkg: any): string {
    if (pkg.description) {
      return pkg.description;
    }
    if (pkg.duration) {
      return `Thời hạn: ${pkg.duration} tháng`;
    }
    return '';
  }

  getFeatureText(feature: any): string {
    if (typeof feature === 'string') {
      return feature;
    }
    if (feature && typeof feature === 'object') {
      return feature.text || feature.name || String(feature);
    }
    return String(feature || '');
  }

  getPackagePrice(pkg: any): number {
    if (this.billingType === 'yearly') {
      // Khi chọn năm, hiển thị giá năm (đã áp dụng discount)
      const yearlyPrice = pkg.yearlyPrice || (pkg.price ? pkg.price * 12 : 0);
      const discount = pkg.yearlyDiscount || 0;
      return yearlyPrice * (1 - discount / 100);
    } else {
      // Khi chọn tháng, hiển thị giá tháng
      return pkg.monthlyPrice || pkg.price || 0;
    }
  }

  // Tính giá gốc (trước khi giảm) khi chọn năm
  getOriginalYearlyPrice(pkg: any): number {
    return pkg.yearlyPrice || (pkg.monthlyPrice ? pkg.monthlyPrice * 12 : (pkg.price ? pkg.price * 12 : 0));
  }

  // Tính % tiết kiệm khi so sánh giá tháng * 12 vs giá năm
  getSavingsPercentage(pkg: any): number {
    if (this.billingType !== 'yearly') {
      return 0;
    }
    
    const monthlyPrice = pkg.monthlyPrice || pkg.price || 0;
    const yearlyPrice = pkg.yearlyPrice || (monthlyPrice * 12);
    
    if (monthlyPrice === 0 || yearlyPrice === 0) {
      return pkg.yearlyDiscount || 0;
    }
    
    // Tính % tiết kiệm: (giá tháng * 12 - giá năm) / (giá tháng * 12) * 100
    const monthlyTotal = monthlyPrice * 12;
    const savings = ((monthlyTotal - yearlyPrice) / monthlyTotal) * 100;
    
    // Nếu có yearlyDiscount, ưu tiên dùng nó
    if (pkg.yearlyDiscount && pkg.yearlyDiscount > 0) {
      return pkg.yearlyDiscount;
    }
    
    return Math.round(savings * 100) / 100; // Làm tròn 2 chữ số
  }

  // Tính số tiền tiết kiệm (VND)
  getSavingsAmount(pkg: any): number {
    if (this.billingType !== 'yearly') {
      return 0;
    }
    
    const monthlyPrice = pkg.monthlyPrice || pkg.price || 0;
    const yearlyPrice = pkg.yearlyPrice || (monthlyPrice * 12);
    const discount = pkg.yearlyDiscount || 0;
    
    if (discount > 0) {
      // Nếu có discount %, tính dựa trên discount
      const originalYearly = yearlyPrice / (1 - discount / 100);
      return originalYearly - yearlyPrice;
    } else {
      // Tính dựa trên chênh lệch giá
      const monthlyTotal = monthlyPrice * 12;
      return monthlyTotal - yearlyPrice;
    }
  }

  isCurrentPackage(packageId: string): boolean {
    if (!this.currentPackage) {
      return false;
    }
    // So sánh bằng _id (từ API) hoặc id
    const currentPackageId = this.currentPackage._id || this.currentPackage.id;
    return currentPackageId === packageId || currentPackageId?.toString() === packageId?.toString();
  }

  switchBillingType(type: 'monthly' | 'yearly'): void {
    this.billingType = type;
    const message = type === 'yearly' 
      ? 'Đã chuyển sang gói theo năm - Tiết kiệm 20%'
      : 'Đã chuyển sang gói theo tháng';
    this.message.success(message);
  }

  onBillingTypeChange(value: 'monthly' | 'yearly'): void {
    // Cập nhật billingType từ event
    this.billingType = value;
    // Force change detection để cập nhật UI
    this.cdr.detectChanges();
    console.log('Billing type changed to:', this.billingType);
    // Có thể thêm logic khi thay đổi billing type nếu cần
  }

  showFeatureDetails(): void {
    this.modal.create({
      nzTitle: 'Tính năng chi tiết',
      nzContent: `
        <ul style="list-style:none;padding:0">
          <li style="margin:12px 0">
            <i nz-icon nzType="check-circle" nzTheme="twotone" style="color:#52c41a;margin-right:8px"></i>
            <strong>Báo cáo nâng cao:</strong> Phân tích chi tiết, biểu đồ trực quan
          </li>
          <li style="margin:12px 0">
            <i nz-icon nzType="check-circle" nzTheme="twotone" style="color:#52c41a;margin-right:8px"></i>
            <strong>API tích hợp:</strong> Kết nối với các hệ thống khác
          </li>
          <li style="margin:12px 0">
            <i nz-icon nzType="check-circle" nzTheme="twotone" style="color:#52c41a;margin-right:8px"></i>
            <strong>Hỗ trợ 24/7:</strong> Chat, email và điện thoại
          </li>
          <li style="margin:12px 0">
            <i nz-icon nzType="check-circle" nzTheme="twotone" style="color:#52c41a;margin-right:8px"></i>
            <strong>Sao lưu tự động:</strong> Bảo vệ dữ liệu của bạn
          </li>
          <li style="margin:12px 0">
            <i nz-icon nzType="check-circle" nzTheme="twotone" style="color:#52c41a;margin-right:8px"></i>
            <strong>Tùy chỉnh giao diện:</strong> Theo thương hiệu của bạn
          </li>
        </ul>
      `,
      nzWidth: 500,
      nzCentered: true,
      nzFooter: null,
      nzClassName: 'feature-modal'
    });
  }

  redirectToLogin() {
    window.location.href = '/login'; // Hoặc router.navigate nếu dùng Angular Router
  }

  onPayPalPaymentSuccess(event: any): void {
    console.log('PayPal payment success:', event);
    
    // Sau khi thanh toán thành công, đăng ký gói
    if (event.paymentData && event.paymentData.packageId) {
      this.loading = true;
      this.pricingService.subscribe(
        this.userId, 
        event.paymentData.packageId, 
        event.paymentData.billingType,
        event.paymentId // Có thể gửi payment ID để tracking
      ).subscribe({
        next: (response: any) => {
          if (response.success !== false) {
            const billingTypeText = event.paymentData.billingType === 'yearly' ? 'theo năm' : 'theo tháng';
            this.message.success(response.message || `Đăng ký gói ${billingTypeText} thành công`);
            this.loadCurrentPackage();
          } else {
            this.message.error(response.message || 'Đăng ký gói dịch vụ thất bại');
          }
          this.loading = false;
        },
        error: (error: any) => {
          console.error('Subscribe error after PayPal payment:', error);
          this.message.error(error.error?.message || 'Có lỗi xảy ra khi đăng ký gói dịch vụ sau thanh toán');
          this.loading = false;
        }
      });
    }
  }

  onPayPalPaymentCancel(): void {
    console.log('PayPal payment cancelled');
    this.showPayPalModal = false;
    this.payPalPaymentData = null;
  }
}
