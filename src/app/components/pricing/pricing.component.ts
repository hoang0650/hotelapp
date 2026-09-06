import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { PricingService } from '../../services/pricing.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { AuthService } from '../../services/auth.service';
import { PayPalPaymentData } from '../paypal-payment/paypal-payment.component';
import { SePayService, SePayPaymentData } from '../../services/sepay.service';
import { PayPalService } from '../../services/paypal.service';
import { UserService } from '../../services/user.service';
import { SettingsService } from '../../services/settings.service';
import { NotificationsService, Announcement } from '../../services/notifications.service';
import { forkJoin } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { HotelService } from '../../services/hotel.service';
import { TranslateService } from '@ngx-translate/core';
import { GoogleAdsConversionService } from '../../services/google-ads-conversion.service';
import {
  FEATURE_PREVIEW_LIMIT,
  isRecommendedSellerPackage,
  sortPackagesByRecommendedOrder
} from '../../constants/recommended-pricing-packages';

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
  maxRooms?: number;
}

@Component({
  selector: 'app-pricing',
  templateUrl: './pricing.component.html',
  styleUrl: './pricing.component.css'
})
export class PricingComponent implements OnInit, OnDestroy, AfterViewInit {
  billingType: 'monthly' | 'yearly' = 'monthly';
  packages: any[] = [];
  currentPackage: any;
  loading = false;
  userId: string = '';
  private preselectPackageId: string | null = null;
  private preselectBillingType: 'monthly' | 'yearly' | null = null;
  showPayPalModal = false;
  payPalPaymentData: PayPalPaymentData | null = null;
  selectedPackage: any = null; // Gói đã chọn để thanh toán
  paymentHistory: any[] = []; // Lịch sử thanh toán
  showPaymentHistory = false; // Hiển thị lịch sử thanh toán
  paymentHistoryLoading = false;
  
  // Kiểm tra tính năng thanh toán từ package
  canUsePayPal: boolean = true; // Mặc định cho phép
  enablePayPalPayment: boolean = true;

  // SePay QR code
  showSePayModal = false;
  // Bỏ sepayPaymentCode - không cần mã thanh toán nữa
  sepayAmount = 0;
  sepayQrUrl = '';
  sepayBeneficiaryName = '';
  sepayPaymentHistoryId = ''; // Lưu paymentHistoryId để kiểm tra trạng thái
  sepayPaymentCode = ''; // Nội dung chuyển khoản (PHGxxxxxx)
  currentUser: any = null;
  systemQRCode: string = ''; // QR code từ superadmin hoặc settings
  systemBeneficiaryName: string = ''; // Tên người thụ hưởng từ superadmin hoặc settings
  systemBankName: string = ''; // Tên ngân hàng từ superadmin hoặc settings
  systemAccountNumber: string = ''; // Số tài khoản từ superadmin hoặc settings
  hasQRCode: boolean = false; // Kiểm tra có QR code không
  private paymentStatusCheckInterval: any = null; // Interval để kiểm tra trạng thái thanh toán
  
  // Navigation buttons
  @ViewChild('pricingPlansContainer', { static: false }) pricingPlansContainer!: ElementRef<HTMLDivElement>;
  canScrollLeft = false;
  canScrollRight = false;
  readonly featurePreviewLimit = FEATURE_PREVIEW_LIMIT;
  private expandedFeaturePackages = new Set<string>();

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
    private cdr: ChangeDetectorRef,
    private sepayService: SePayService,
    private paypalService: PayPalService,
    private userService: UserService,
    private settingsService: SettingsService,
    private notificationsService: NotificationsService,
    private http: HttpClient,
    private hotelService: HotelService,
    private translate: TranslateService,
    private googleAdsConversion: GoogleAdsConversionService
  ) {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?._id) {
      this.userId = currentUser._id;
    }
  }

  private loadHotelSettings(): void {
    const hotelId = this.authService.getHotelId?.() || null;
    if (!hotelId) {
      this.enablePayPalPayment = true;
      this.checkPaymentFeatures();
      return;
    }
    this.hotelService.getHotelById(hotelId).subscribe({
      next: (hotel: any) => {
        this.enablePayPalPayment = hotel.enablePayPalPayment || false;
        this.checkPaymentFeatures();
        this.cdr.detectChanges();
      },
      error: () => {
        this.enablePayPalPayment = true;
        this.checkPaymentFeatures();
      }
    });
  }

  private onPaymentSettingsChanged = (event: any) => {
    const detail = event?.detail || {};
    this.enablePayPalPayment = !!detail.enablePayPalPayment;
    this.checkPaymentFeatures();
    this.cdr.detectChanges();
  };

  ngOnInit(): void {
    // Load user trước để kiểm tra role
    this.loadCurrentUser();
    
    const urlParams = new URLSearchParams(window.location.search);
    const upgradeId = urlParams.get('upgradePackageId') || urlParams.get('packageId');
    const billing = urlParams.get('billingType') as ('monthly' | 'yearly') | null;
    this.preselectPackageId = upgradeId;
    this.preselectBillingType = billing;
    
    this.loadPackages();
    if (this.userId) {
      this.loadCurrentPackage();
      this.loadPaymentHistory();
      // Không cần load QR code trước, sẽ được lấy từ backend response trong createPaymentHistory
    } else {
      this.currentPackage = null;
    }

    // Xử lý callback từ SePay sau khi thanh toán
    this.handlePaymentCallback();
    this.loadHotelSettings();
    window.addEventListener('paymentSettingsChanged', this.onPaymentSettingsChanged as EventListener);
  }

  ngAfterViewInit(): void {
    // Đợi view render xong rồi mới kiểm tra scroll
    setTimeout(() => {
      this.updateScrollButtons();
      if (this.pricingPlansContainer) {
        this.pricingPlansContainer.nativeElement.addEventListener('scroll', () => {
          this.updateScrollButtons();
        });
        
        // Cập nhật khi window resize
        window.addEventListener('resize', () => {
          setTimeout(() => {
            this.updateScrollButtons();
          }, 100);
        });
      }
    }, 300);
  }

  scrollPlans(direction: 'left' | 'right'): void {
    if (!this.pricingPlansContainer) return;
    
    const container = this.pricingPlansContainer.nativeElement;
    // Tính toán scroll amount dựa trên width của 1 card + gap
    const cardWidth = container.querySelector('.pricing-plan')?.clientWidth || 350;
    const gap = 24;
    const scrollAmount = cardWidth + gap;
    
    if (direction === 'left') {
      container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    } else {
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
    
    // Cập nhật lại trạng thái nút sau khi scroll
    setTimeout(() => {
      this.updateScrollButtons();
    }, 400);
  }

  updateScrollButtons(): void {
    if (!this.pricingPlansContainer) {
      this.canScrollLeft = false;
      this.canScrollRight = false;
      return;
    }
    
    const container = this.pricingPlansContainer.nativeElement;
    const scrollLeft = container.scrollLeft;
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;
    
    // Kiểm tra xem có thể scroll không
    const canScroll = scrollWidth > clientWidth;
    
    this.canScrollLeft = canScroll && scrollLeft > 5; // 5px để tránh lỗi làm tròn
    this.canScrollRight = canScroll && scrollLeft < (scrollWidth - clientWidth - 5); // 5px để tránh lỗi làm tròn
    
    // Force change detection
    this.cdr.detectChanges();
  }

  /**
   * Load thông tin user hiện tại
   */
  loadCurrentUser(): void {
    this.applySessionUser(this.authService.getCurrentUser());

    this.authService.authResolved$.pipe(
      filter(resolved => resolved),
      take(1)
    ).subscribe(() => {
      this.applySessionUser(this.authService.getCurrentUser());
    });

    this.authService.currentUser$.subscribe({
      next: (user) => this.applySessionUser(user)
    });
  }

  private applySessionUser(user: any): void {
    this.currentUser = user || this.currentUser;
    if (!user?._id) {
      return;
    }

    const nextUserId = String(user._id);
    const userChanged = this.userId !== nextUserId;
    this.userId = nextUserId;
    if (userChanged) {
      this.loadCurrentPackage();
      this.loadPaymentHistory();
    }
  }

  /**
   * Load QR code từ superadmin hoặc settings
   * Tất cả các user bất kể role đều có thể lấy QR code này
   * Sử dụng endpoint mới từ backend (chỉ cần đăng nhập, không yêu cầu quyền đặc biệt)
   */
  loadSystemQRCode(): void {
    this.sepayService.getPricingQRCode().subscribe({
      next: (response: any) => {
        if (response.success && response.qrPaymentUrl) {
          this.systemQRCode = response.qrPaymentUrl;
          this.systemBeneficiaryName = response.beneficiaryName || '';
          this.systemBankName = response.bankName || '';
          this.systemAccountNumber = response.accountNumber || '';
          this.hasQRCode = true;
        } else {
          this.hasQRCode = false;
        }
      },
      error: (error: any) => {
        console.error('Error loading pricing QR code:', error);
        this.hasQRCode = false;
      }
    });
  }

  /**
   * Xử lý callback từ SePay sau khi thanh toán
   * Với webhook, chỉ cần hiển thị thông báo và reload package
   * Webhook sẽ tự động xử lý đăng ký gói
   */
  handlePaymentCallback(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('paymentStatus') || urlParams.get('payment');
    const paymentMethod = urlParams.get('paymentMethod');
    const packageId = urlParams.get('packageId');

    // Chỉ xử lý callback từ SePay
    if (paymentMethod !== 'sepay') {
      return;
    }

    if (paymentStatus === 'success') {
      // Thanh toán thành công - webhook sẽ tự động xử lý đăng ký gói
      this.message.success(this.t('PRICING_PAGE.MESSAGES.PAYMENT_SUCCESS_PROCESSING'));
      
      // Lưu thông tin package trước khi reset để tạo thông báo
      const packageInfo = this.selectedPackage ? { ...this.selectedPackage } : null;
      this.selectedPackage = null; // Reset selected package
      
      // Lấy lịch sử chuyển khoản gần nhất và phát thông báo âm thanh
      this.loadLatestPaymentAndPlaySound();
      
      // Tạo thông báo hệ thống cho thanh toán thành công
      if (packageInfo) {
        const billingTypeText = packageInfo.billingType === 'yearly' ? 'theo năm' : 'theo tháng';
        // Kiểm tra xem có phải nâng cấp/cập nhật gói không
        const isUpgrade = this.currentPackage && this.currentPackage.packageId && this.currentPackage.packageId !== packageInfo.packageId;
        const isUpdate = this.currentPackage && this.currentPackage.packageId === packageInfo.packageId && this.currentPackage.billingType !== packageInfo.billingType;
        
        if (isUpgrade) {
          this.createSubscriptionAnnouncement(packageInfo.name, billingTypeText, 'upgrade');
        } else if (isUpdate) {
          this.createSubscriptionAnnouncement(packageInfo.name, billingTypeText, 'update');
        } else {
          this.createSubscriptionAnnouncement(packageInfo.name, billingTypeText, 'payment');
        }
      }
      
      // Reload package sau 2 giây để kiểm tra xem đã đăng ký chưa
      setTimeout(() => {
        this.loadCurrentPackage({ force: true });
        this.loadPaymentHistory();
      }, 2000);
      
      // Xóa query params để tránh xử lý lại
      window.history.replaceState({}, '', '/pricing');
    } else if (paymentStatus === 'error') {
      this.message.error(this.t('PRICING_PAGE.MESSAGES.PAYMENT_FAILED'));
      this.selectedPackage = null; // Reset selected package
      window.history.replaceState({}, '', '/pricing');
    } else if (paymentStatus === 'cancel') {
      this.message.warning(this.t('PRICING_PAGE.MESSAGES.PAYMENT_CANCELLED'));
      this.selectedPackage = null; // Reset selected package
      window.history.replaceState({}, '', '/pricing');
    }
  }

  loadPackages(options?: { force?: boolean }): void {
    const cached = !options?.force ? this.pricingService.getCachedPackages() : null;
    if (cached?.payload) {
      this.applyPackagesResponse(cached.payload, { fromCache: true });
      // Refresh nền — không bật spinner lại
      this.pricingService.getAllPackages({ force: true }).subscribe({
        next: (response) => this.applyPackagesResponse(response, { fromCache: false }),
        error: (error) => {
          console.error('Error refreshing packages cache:', error);
        }
      });
      return;
    }

    this.loading = true;
    this.pricingService.getAllPackages({ force: !!options?.force }).subscribe({
      next: (response) => {
        this.applyPackagesResponse(response, { fromCache: false });
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading packages:', error);
        if (error.status !== 401 && error.status !== 403) {
          this.message.error(error.error?.message || this.t('PRICING_PAGE.MESSAGES.LOAD_PACKAGES_ERROR'));
        }
        this.loading = false;
      }
    });
  }

  private applyPackagesResponse(response: any, meta: { fromCache: boolean }): void {
    if (response && response.success !== false) {
      const rawPackages = response.data || response || [];
      this.packages = sortPackagesByRecommendedOrder(Array.isArray(rawPackages) ? rawPackages : []);

      if (this.preselectPackageId) {
        const type: 'monthly' | 'yearly' = this.preselectBillingType || this.billingType;
        this.performPreselect(this.preselectPackageId, type);
        this.preselectPackageId = null;
        this.preselectBillingType = null;
        try {
          window.history.replaceState({}, '', '/pricing');
        } catch {}
      }

      if (this.currentUser && this.currentUser.role === 'guest' && !this.currentPackage) {
        const freePackage = this.packages.find((pkg: any) =>
          (pkg.monthlyPrice === 0 && pkg.yearlyPrice === 0) ||
          (pkg.monthlyPrice === 0 && !pkg.yearlyPrice)
        );

        if (freePackage && this.userId) {
          this.pricingService.subscribe(this.userId, freePackage._id || freePackage.id, 'monthly').subscribe({
            next: (subscribeResponse: any) => {
              if (subscribeResponse.success !== false) {
                console.log('Auto-subscribed guest to free package');
                this.loadCurrentPackage({ force: true });
              }
            },
            error: (subscribeError: any) => {
              console.error('Error auto-subscribing guest to free package:', subscribeError);
            }
          });
        }
      }
    } else if (!meta.fromCache) {
      this.packages = [];
      if (response?.message) {
        this.message.error(response.message);
      }
    }

    setTimeout(() => {
      this.updateScrollButtons();
    }, meta.fromCache ? 50 : 200);
    this.cdr.markForCheck();
  }

  loadCurrentPackage(options?: { force?: boolean }): void {
    if (!this.userId) return;

    const cached = !options?.force ? this.pricingService.getCachedCurrentUserPackage(this.userId) : null;
    if (cached?.payload) {
      this.applyCurrentPackageResponse(cached.payload, { fromCache: true });
      this.pricingService.getCurrentUserPackage(this.userId, { force: true }).subscribe({
        next: (response: any) => this.applyCurrentPackageResponse(response, { fromCache: false }),
        error: (error) => {
          if (error.status !== 404 && error.status !== 400) {
            console.error('Error refreshing current package cache:', error);
          }
        }
      });
      return;
    }

    this.pricingService.getCurrentUserPackage(this.userId, { force: !!options?.force }).subscribe({
      next: (response: any) => this.applyCurrentPackageResponse(response, { fromCache: false }),
      error: (error) => {
        console.error('Error loading current package:', error);
        if (error.status !== 404 && error.status !== 400) {
          this.message.error(error.error?.message || this.t('PRICING_PAGE.MESSAGES.LOAD_CURRENT_PACKAGE_ERROR'));
        }
        this.currentPackage = null;
        this.tryAutoSubscribeGuestFreePackage();
        this.canUsePayPal = true;
      }
    });
  }

  private applyCurrentPackageResponse(response: any, meta: { fromCache: boolean }): void {
    if (response && response.success !== false) {
      this.currentPackage = response.data || response;
      if (response.billingType) {
        this.billingType = response.billingType;
      } else if (this.currentPackage?.billingType) {
        this.billingType = this.currentPackage.billingType;
      }
      this.checkPaymentFeatures();
    } else {
      this.currentPackage = null;
      if (!meta.fromCache) {
        this.tryAutoSubscribeGuestFreePackage();
      }
      this.canUsePayPal = true;
    }
    this.cdr.markForCheck();
  }

  private tryAutoSubscribeGuestFreePackage(): void {
    if (!(this.currentUser && this.currentUser.role === 'guest' && this.packages.length > 0 && this.userId)) {
      return;
    }

    const freePackage = this.packages.find((pkg: any) =>
      (pkg.monthlyPrice === 0 && pkg.yearlyPrice === 0) ||
      (pkg.monthlyPrice === 0 && !pkg.yearlyPrice)
    );

    if (!freePackage) {
      return;
    }

    this.pricingService.subscribe(this.userId, freePackage._id || freePackage.id, 'monthly').subscribe({
      next: (subscribeResponse: any) => {
        if (subscribeResponse.success !== false) {
          console.log('Auto-subscribed guest to free package');
          this.loadCurrentPackage({ force: true });
        }
      },
      error: (subscribeError: any) => {
        console.error('Error auto-subscribing guest to free package:', subscribeError);
      }
    });
  }
  
  /**
   * Cổng thanh toán mua/gia hạn gói trên trang Pricing.
   * Không dùng paypalPaymentFeature của gói hay enablePayPalPayment của khách sạn —
   * các flag đó dành cho tính năng vận hành KS sau khi đã có gói, không phải điều kiện hiện nút mua gói.
   */
  checkPaymentFeatures(): void {
    this.canUsePayPal = true;
  }

  subscribeToPlan(packageId: string) {
    if (!this.userId) {
      this.message.warning(this.t('PRICING_PAGE.MESSAGES.LOGIN_REQUIRED'));
      return;
    }

    const pkg = this.packages.find(p => (p._id || p.id) === packageId);
    if (!pkg) {
      this.message.error(this.t('PRICING_PAGE.MESSAGES.PACKAGE_NOT_FOUND'));
      return;
    }

    const billingTypeText = this.getBillingLabel(this.billingType);

    // Kiểm tra nếu là gói miễn phí
    if (this.isFreePackage(pkg)) {
      // Đăng ký trực tiếp không cần thanh toán
      this.loading = true;
      // Kiểm tra xem có phải nâng cấp/cập nhật gói không
      const isUpgrade = this.currentPackage && this.currentPackage.packageId && this.currentPackage.packageId !== packageId;
      const isUpdate = this.currentPackage && this.currentPackage.packageId === packageId && this.currentPackage.billingType !== this.billingType;
      
      this.pricingService.subscribe(this.userId, packageId, this.billingType).subscribe({
        next: (response: any) => {
          if (response.success !== false) {
            this.message.success(response.message || this.t('PRICING_PAGE.MESSAGES.SUBSCRIBE_SUCCESS', { billingType: billingTypeText }));
            this.loadCurrentPackage({ force: true });
            this.selectedPackage = null;
            // Tạo thông báo hệ thống
            if (isUpgrade) {
              this.createSubscriptionAnnouncement(pkg.name, billingTypeText, 'upgrade');
            } else if (isUpdate) {
              this.createSubscriptionAnnouncement(pkg.name, billingTypeText, 'update');
            } else {
              this.createSubscriptionAnnouncement(pkg.name, billingTypeText, 'subscribe');
            }
          } else {
            this.message.error(response.message || this.t('PRICING_PAGE.MESSAGES.SUBSCRIBE_ERROR'));
          }
          this.loading = false;
        },
        error: (error: any) => {
          console.error('Subscribe error:', error);
          this.message.error(error.error?.message || this.t('PRICING_PAGE.MESSAGES.SUBSCRIBE_ERROR'));
          this.loading = false;
        }
      });
      return;
    }

    if (this.isDowngradeSelection(pkg, this.billingType)) {
      this.message.warning(this.t('PRICING_PAGE.MESSAGES.NO_DOWNGRADE_BEFORE_EXPIRY'));
      return;
    }

    // Tính số tiền cần thanh toán ròng (khấu trừ trực tiếp giá gói hiện tại nếu còn hạn)
    const netAmount = this.computeNetAmount(pkg, this.billingType);

    if (netAmount === 0) {
      this.loading = true;
      this.pricingService.subscribe(this.userId, packageId, this.billingType).subscribe({
        next: (response: any) => {
          if (response.success !== false) {
            const billingTypeText = this.getBillingLabel(this.billingType);
            this.message.success(response.message || this.t('PRICING_PAGE.MESSAGES.SWITCH_WITHOUT_PAYMENT', {
              packageName: pkg.name,
              billingType: billingTypeText
            }));
            this.loadCurrentPackage({ force: true });
            this.selectedPackage = null;
            // Tạo thông báo hệ thống (hạ gói/cập nhật)
            this.createSubscriptionAnnouncement(pkg.name, billingTypeText, 'subscribe');
          } else {
            this.message.error(response.message || this.t('PRICING_PAGE.MESSAGES.UPDATE_PACKAGE_ERROR'));
          }
          this.loading = false;
        },
        error: (error: any) => {
          console.error('Subscribe (downgrade/no-charge) error:', error);
          this.message.error(error.error?.message || this.t('PRICING_PAGE.MESSAGES.UPDATE_PACKAGE_ERROR'));
          this.loading = false;
        }
      });
      return;
    }

    // Lưu gói đã chọn để hiển thị nút thanh toán, kèm netAmount để các phương thức thanh toán dùng
    this.selectedPackage = {
      ...pkg,
      packageId: packageId,
      billingType: this.billingType,
      netAmount
    };
    
    // Kiểm tra tính năng thanh toán từ package đã chọn
    this.checkPaymentFeatures();

    this.message.success(this.t('PRICING_PAGE.MESSAGES.SELECTED_PLAN_SUCCESS', {
      packageName: pkg.name,
      billingType: billingTypeText,
      amount: this.formatPrice(netAmount)
    }));
  }

  /**
   * Thanh toán qua PayPal
   */
  payWithPayPal(): void {
    if (!this.selectedPackage || !this.userId) {
      this.message.warning(this.t('PRICING_PAGE.MESSAGES.SELECT_PLAN_BEFORE_PAYMENT'));
      return;
    }
    
    // Kiểm tra tính năng PayPal
    if (!this.canUsePayPal) {
      this.message.warning(this.t('PRICING_PAGE.MESSAGES.PAYPAL_NOT_SUPPORTED'));
      return;
    }

    const packageId = this.selectedPackage.packageId;
    const pkg = this.selectedPackage;
    const packagePrice = (this.selectedPackage.netAmount !== undefined) 
      ? this.selectedPackage.netAmount 
      : this.getPackagePrice(pkg);
    const billingTypeText = this.getBillingLabel(this.selectedPackage.billingType);

    this.payPalPaymentData = {
      packageId: packageId,
      packageName: pkg?.name || 'N/A',
      amount: packagePrice,
      billingType: this.selectedPackage.billingType,
      currency: 'VND'
    };

    this.showPayPalModal = true;
  }

  /**
   * Thanh toán qua SePay
   * Tạo payment history và hiển thị QR code thanh toán
   * Webhook sẽ tự động xử lý khi SePay nhận được tiền
   */
  payWithSePay(): void {
    if (!this.selectedPackage || !this.userId) {
      this.message.warning(this.t('PRICING_PAGE.MESSAGES.SELECT_PLAN_BEFORE_PAYMENT'));
      return;
    }

    // Đảm bảo đã load user profile
    if (!this.currentUser) {
      this.loadCurrentUser();
    }

    const packageId = this.selectedPackage.packageId;
    const pkg = this.selectedPackage;
    const packagePrice = (this.selectedPackage.netAmount !== undefined) 
      ? this.selectedPackage.netAmount 
      : this.getPackagePrice(pkg);
    const billingTypeText = this.getBillingLabel(this.selectedPackage.billingType);

    // Luôn load lại QR code từ superadmin profile trước khi thanh toán
    // Ưu tiên: superadmin profile > settings (chỉ lấy từ hệ thống)
    this.loadQRCodeFromSuperadminForPayment(packagePrice, packageId, pkg, billingTypeText);
  }

  /**
   * Load QR code từ superadmin profile để thanh toán
   * Ưu tiên: superadmin profile > settings
   * Chỉ lấy từ hệ thống, không lấy từ currentUser
   */
  loadQRCodeFromSuperadminForPayment(packagePrice: number, packageId: string, pkg: any, billingTypeText: string): void {
    // QR code sẽ được lấy từ backend response trong createPaymentHistory
    // Không cần gọi API riêng vì backend sẽ tự động trả về QR code từ hệ thống
    this.proceedWithSePayPayment('', '', packagePrice, packageId, pkg, billingTypeText);
  }

  /**
   * Tiến hành thanh toán SePay với QR code đã lấy được
   */
  proceedWithSePayPayment(qrPaymentUrl: string, beneficiaryName: string, packagePrice: number, packageId: string, pkg: any, billingTypeText: string): void {
    // Tạo payment history
    const sepayPaymentData: SePayPaymentData = {
      packageId: packageId,
      packageName: pkg?.name || 'N/A',
      amount: packagePrice,
      billingType: this.selectedPackage.billingType,
      currency: 'VND',
      description: `Đăng ký gói ${pkg?.name || 'N/A'} - ${billingTypeText}`,
      customerId: this.userId
    };

    // Gọi API tạo payment history (backend sẽ trả về QR code từ hệ thống cho pricing payment)
    this.loading = true;
    this.sepayService.createPaymentHistory(sepayPaymentData).subscribe({
      next: (response: any) => {
        this.loading = false;
        console.log('[Pricing] Payment history response:', JSON.stringify(response, null, 2));
        
        // Kiểm tra response.success (có thể là true, false, hoặc undefined)
        if (response.success !== false) {
          // Ưu tiên sử dụng QR code từ backend response (từ hệ thống/superadmin)
          // Nếu không có, fallback về QR code đã lấy từ frontend
          const finalQrUrl = response.qrPaymentUrl || response.data?.qrPaymentUrl || qrPaymentUrl;
          const finalBeneficiaryName = response.beneficiaryName || response.data?.beneficiaryName || beneficiaryName;
          const finalBankName = response.bankName || response.data?.bankName || '';
          const finalAccountNumber = response.accountNumber || response.data?.accountNumber || '';
          
          console.log('[Pricing] Final QR URL:', finalQrUrl ? `Found: ${finalQrUrl.substring(0, 50)}...` : 'Not found');
          console.log('[Pricing] Response keys:', Object.keys(response));
          
          if (!finalQrUrl) {
            // Nếu không có QR code, có thể là do hệ thống chưa có QR code
            // Nhưng vẫn cho phép tiếp tục nếu có paymentHistoryId (để user có thể thanh toán sau)
            console.warn('[Pricing] No QR code in response, but payment history created');
            this.message.warning(this.t('PRICING_PAGE.MESSAGES.QR_NOT_CONFIGURED', {
              code: response.paymentCode || response.paymentHistoryId || 'N/A'
            }));
            return;
          }
          
          // Lưu thông tin payment và hiển thị modal với QR code
          this.sepayAmount = packagePrice;
          this.sepayQrUrl = finalQrUrl;
          this.sepayBeneficiaryName = finalBeneficiaryName;
          this.sepayPaymentHistoryId = response.paymentHistoryId || ''; // Lưu paymentHistoryId để kiểm tra trạng thái
          this.sepayPaymentCode = response.paymentCode || response.data?.paymentCode || '';
          
          // Cập nhật systemQRCode để lần sau không cần load lại
          this.systemQRCode = finalQrUrl;
          this.systemBeneficiaryName = finalBeneficiaryName;
          this.systemBankName = finalBankName;
          this.systemAccountNumber = finalAccountNumber;
          this.hasQRCode = true;
          
          // Hiển thị modal với QR code
          this.showSePayModal = true;
          
          // Bắt đầu polling để kiểm tra trạng thái thanh toán và tự động đóng modal khi thành công
          this.startPaymentStatusPolling();
        } else {
          // Response có success: false hoặc error
          console.error('[Pricing] Payment history creation failed:', response);
          const errorMsg = response.error || response.message || this.t('PRICING_PAGE.MESSAGES.CREATE_PAYMENT_HISTORY_ERROR');
          this.message.error(errorMsg);
        }
      },
      error: (error: any) => {
        this.loading = false;
        console.error('Error creating SePay payment history:', error);
        const errorMessage = error.error?.error || error.error?.message || error.message || this.t('PRICING_PAGE.MESSAGES.CREATE_PAYMENT_HISTORY_ERROR');
        this.message.error(errorMessage);
      }
    });
  }

  /**
   * Đóng modal SePay và reload package/payment history
   */
  closeSePayModal(): void {
    this.showSePayModal = false;
    // Bỏ copy mã thanh toán - không cần mã thanh toán nữa
    this.sepayPaymentCode = '';
    this.selectedPackage = null;
    this.loadCurrentPackage({ force: true });
    this.loadPaymentHistory();
  }

  // Bỏ copyPaymentCode - không cần mã thanh toán nữa

  /**
   * Hủy chọn gói
   */
  cancelPackageSelection(): void {
    this.selectedPackage = null;
    this.message.info(this.t('PRICING_PAGE.MESSAGES.SELECTION_CANCELLED'));
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
              this.message.success(response.message || this.t('PRICING_PAGE.MESSAGES.CANCEL_SUCCESS'));
              this.loadCurrentPackage({ force: true });
              this.loadPaymentHistory();
            } else {
              this.message.error(response.message || this.t('PRICING_PAGE.MESSAGES.CANCEL_ERROR'));
            }
            this.loading = false;
          },
          error: (error) => {
            console.error('Cancel subscription error:', error);
            if (error.status === 401) {
              this.message.error(this.t('PRICING_PAGE.MESSAGES.CANCEL_LOGIN_REQUIRED'));
            } else if (error.status === 403) {
              this.message.error(this.t('PRICING_PAGE.MESSAGES.CANCEL_NO_PERMISSION'));
            } else {
              this.message.error(error.error?.message || this.t('PRICING_PAGE.MESSAGES.CANCEL_ERROR'));
            }
            this.loading = false;
          }
        });
      }
    });
  }

  isFreePackage(pkg: any): boolean {
    if (pkg?.isContactOnly) return false;
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

  isRecommendedPackage(pkg: any): boolean {
    return isRecommendedSellerPackage(pkg);
  }

  // Feature values hỗ trợ map sang USER_MANAGEMENT.FEATURES.*
  private resolvePackageKey(pkg: any): string {
    return String(pkg?._id || pkg?.id || pkg?.name || '').trim();
  }

  getPackageFeatures(pkg: any): any[] {
    return Array.isArray(pkg?.features) ? pkg.features : [];
  }

  getFeatureCount(pkg: any): number {
    return this.getPackageFeatures(pkg).length;
  }

  isPackageFeaturesExpanded(pkg: any): boolean {
    const key = this.resolvePackageKey(pkg);
    return !!key && this.expandedFeaturePackages.has(key);
  }

  togglePackageFeatures(pkg: any): void {
    const key = this.resolvePackageKey(pkg);
    if (!key) {
      return;
    }
    if (this.expandedFeaturePackages.has(key)) {
      this.expandedFeaturePackages.delete(key);
    } else {
      this.expandedFeaturePackages.add(key);
    }
  }

  getVisibleFeatures(pkg: any): any[] {
    const features = this.getPackageFeatures(pkg);
    if (this.isPackageFeaturesExpanded(pkg) || features.length <= this.featurePreviewLimit) {
      return features;
    }
    return features.slice(0, this.featurePreviewLimit);
  }

  private featureI18nKey(featureValue: string): string {
    return `USER_MANAGEMENT.FEATURES.${String(featureValue || '').trim().toUpperCase()}`;
  }

  getFeatureText(feature: any): string {
    if (typeof feature === 'string') {
      const key = this.featureI18nKey(feature);
      const translated = this.translate.instant(key);
      if (translated && translated !== key) {
        return translated;
      }
      return feature;
    }

    if (feature && typeof feature === 'object') {
      if (feature.value) {
        const key = this.featureI18nKey(String(feature.value));
        const translated = this.translate.instant(key);
        if (translated && translated !== key) {
          return translated;
        }
      }
      return feature.label || feature.text || feature.name || String(feature);
    }

    return String(feature || '');
  }

  getOpenClawAddonHighlights(pkg: any): string[] {
    const highlights: string[] = [];
    if (pkg?.aiChatboxFeature) {
      highlights.push(this.t('PRICING_PAGE.OPENCLAW_HIGHLIGHTS.AI_CHATBOX'));
    }
    if (pkg?.features?.includes('fanpage_messages')) {
      highlights.push(this.t('PRICING_PAGE.OPENCLAW_HIGHLIGHTS.FANPAGE'));
    }
    if (pkg?.features?.includes('zalo_messages')) {
      highlights.push(this.t('PRICING_PAGE.OPENCLAW_HIGHLIGHTS.ZALO'));
    }
    if (pkg?.features?.includes('telegram_messages')) {
      highlights.push(this.t('PRICING_PAGE.OPENCLAW_HIGHLIGHTS.TELEGRAM'));
    }
    return highlights;
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params);
  }

  getBillingLabel(type: 'monthly' | 'yearly' | null | undefined): string {
    return type === 'yearly'
      ? this.t('PRICING_PAGE.BILLING.YEARLY_SHORT')
      : this.t('PRICING_PAGE.BILLING.MONTHLY_SHORT');
  }

  getPackagePrice(pkg: any): number {
    if (pkg?.isContactOnly) return 0;
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

  private getPackagePriceForBilling(pkg: any, billing: 'monthly' | 'yearly'): number {
    if (pkg?.isContactOnly) return 0;
    if (billing === 'yearly') {
      const yearlyPrice = pkg.yearlyPrice || (pkg.price ? pkg.price * 12 : 0);
      const discount = pkg.yearlyDiscount || 0;
      return Math.round(yearlyPrice * (1 - discount / 100));
    }
    return pkg.monthlyPrice || pkg.price || 0;
  }

  private resolvePackageId(pkg: any): string {
    return String(pkg?.packageId || pkg?._id || pkg?.id || '').trim();
  }

  isCurrentPackageActive(): boolean {
    const expiryDate = this.currentPackage?.expiryDate || this.currentPackage?.packageExpiryDate;
    if (!expiryDate) {
      return false;
    }
    const expiry = new Date(expiryDate);
    return !Number.isNaN(expiry.getTime()) && expiry.getTime() > Date.now();
  }

  private getCurrentPackageResolvedBilling(): 'monthly' | 'yearly' {
    return this.currentPackage?.billingType === 'yearly' ? 'yearly' : 'monthly';
  }

  getCurrentPackageCreditAmount(): number {
    if (!this.currentPackage || !this.isCurrentPackageActive()) {
      return 0;
    }

    const currentPackageId = this.resolvePackageId(this.currentPackage);
    const currentPackageObject = this.packages.find(p => this.resolvePackageId(p) === currentPackageId) || this.currentPackage;
    if (this.isFreePackage(currentPackageObject)) {
      return 0;
    }

    return this.getPackagePriceForBilling(currentPackageObject, this.getCurrentPackageResolvedBilling());
  }

  getSelectedPackageGrossAmount(): number {
    if (!this.selectedPackage) {
      return 0;
    }
    return this.getPackagePriceForBilling(this.selectedPackage, this.selectedPackage.billingType || this.billingType);
  }

  getSelectedPackageNetAmount(): number {
    if (!this.selectedPackage) {
      return 0;
    }
    return this.selectedPackage.netAmount ?? this.getSelectedPackageGrossAmount();
  }

  getSelectedPackageCreditAmount(): number {
    if (!this.selectedPackage) {
      return 0;
    }
    const grossAmount = this.getSelectedPackageGrossAmount();
    const netAmount = this.getSelectedPackageNetAmount();
    return Math.max(0, grossAmount - netAmount);
  }

  hasSelectedPackageCredit(): boolean {
    return this.getSelectedPackageCreditAmount() > 0;
  }

  isDowngradeSelection(targetPkg: any, billing: 'monthly' | 'yearly' = this.billingType): boolean {
    if (!this.isCurrentPackageActive()) {
      return false;
    }

    const currentPrice = this.getCurrentPackageCreditAmount();
    const targetPrice = this.getPackagePriceForBilling(targetPkg, billing);
    return currentPrice > 0 && targetPrice <= currentPrice;
  }

  getActionHint(packageItem: any): string {
    if (this.isCurrentPackage(packageItem._id || packageItem.id)) {
      return this.t('PRICING_PAGE.CURRENT_PLAN_NO_CANCEL');
    }

    if (this.isCurrentPackageActive() && this.isDowngradeSelection(packageItem, this.billingType)) {
      return this.t('PRICING_PAGE.DOWNGRADE_BLOCKED_HINT');
    }

    if (this.isCurrentPackageActive()) {
      const creditAmount = this.computeNetAmount(packageItem, this.billingType);
      if (creditAmount > 0 && creditAmount < this.getPackagePriceForBilling(packageItem, this.billingType)) {
        return this.t('PRICING_PAGE.UPGRADE_CREDIT_HINT', {
          amount: this.formatPrice(creditAmount)
        });
      }
    }

    return this.t('PRICING_PAGE.SELECT_PLAN_HINT', {
      billingType: this.getBillingLabel(this.billingType).toLowerCase()
    });
  }

  getSelectPlanButtonText(packageItem: any): string {
    if (this.isCurrentPackage(packageItem._id || packageItem.id)) {
      return this.t('PRICING_PAGE.CURRENT_PLAN_BUTTON');
    }
    if (this.loading) {
      return this.t('PRICING_PAGE.BUTTON_PROCESSING');
    }
    if (!packageItem.isActive) {
      return this.t('PRICING_PAGE.BUTTON_UNAVAILABLE');
    }
    if (this.isCurrentPackageActive() && this.isDowngradeSelection(packageItem, this.billingType)) {
      return this.t('PRICING_PAGE.BUTTON_WAIT_UNTIL_EXPIRY');
    }
    return this.t('PRICING_PAGE.BUTTON_SELECT_PLAN', {
      billingType: this.getBillingLabel(this.billingType).toLowerCase()
    });
  }

  contactPackage(pkg: any): void {
    const phone = (pkg?.contactPhone || '').toString().trim();
    const email = (pkg?.contactEmail || '').toString().trim();
    const url = (pkg?.contactUrl || '').toString().trim();

    if (url) {
      window.open(url, '_blank');
      return;
    }
    if (phone) {
      window.open(`tel:${phone}`, '_self');
      return;
    }
    if (email) {
      window.open(`mailto:${email}`, '_self');
      return;
    }

    this.modal.info({
      nzTitle: pkg?.contactLabel || this.t('PRICING_PAGE.CONTACT'),
      nzContent: this.t('PRICING_PAGE.CONTACT_PACKAGE_MESSAGE'),
      nzOkText: this.t('PRICING_PAGE.CLOSE'),
      nzMaskClosable: true
    });
  }

  /**
   * Tính số tiền còn lại (credit) của gói hiện tại theo thời gian chưa sử dụng
   * - monthly: chia theo 30 ngày
   * - yearly: chia theo 365 ngày
   */
  private getRemainingCredit(billing: 'monthly' | 'yearly'): number {
    if (!this.isCurrentPackageActive()) {
      return 0;
    }
    return this.getCurrentPackageCreditAmount();
  }

  /**
   * Tính số tiền thực phải thanh toán khi nâng gói (gói mới - credit còn lại)
   * Nếu bằng 0 hoặc âm, coi như hạ gói/không cần thanh toán.
   */
  private computeNetAmount(targetPkg: any, billing: 'monthly' | 'yearly'): number {
    const targetPrice = this.getPackagePriceForBilling(targetPkg, billing);
    const credit = Math.min(targetPrice, this.getRemainingCredit(billing));
    return Math.max(0, Math.round(targetPrice - credit));
  }

  private performPreselect(packageId: string, billing: 'monthly' | 'yearly'): void {
    const pkg = this.packages.find(p => (p._id || p.id) === packageId);
    if (!pkg) {
      return;
    }
    this.billingType = billing;
    const netAmount = this.computeNetAmount(pkg, this.billingType);
    this.selectedPackage = {
      ...pkg,
      packageId: packageId,
      billingType: this.billingType,
      netAmount
    };
    this.checkPaymentFeatures();
    this.cdr.detectChanges();
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
    const currentPackageId = this.currentPackage.packageId || this.currentPackage._id || this.currentPackage.id;
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
    if (this.selectedPackage) {
      const packageId = this.resolvePackageId(this.selectedPackage);
      const selectedPackage = this.packages.find(p => this.resolvePackageId(p) === packageId);
      if (selectedPackage) {
        this.selectedPackage = {
          ...selectedPackage,
          packageId,
          billingType: value,
          netAmount: this.computeNetAmount(selectedPackage, value)
        };
        this.checkPaymentFeatures();
      }
    }
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
      // Kiểm tra xem có phải nâng cấp/cập nhật gói không
      const isUpgrade = this.currentPackage && this.currentPackage.packageId && this.currentPackage.packageId !== event.paymentData.packageId;
      const isUpdate = this.currentPackage && this.currentPackage.packageId === event.paymentData.packageId && this.currentPackage.billingType !== event.paymentData.billingType;
      
      this.pricingService.subscribe(
        this.userId, 
        event.paymentData.packageId, 
        event.paymentData.billingType,
        event.paymentId // Có thể gửi payment ID để tracking
      ).subscribe({
        next: (response: any) => {
          if (response.success !== false) {
            const billingTypeText = event.paymentData.billingType === 'yearly' ? 'theo năm' : 'theo tháng';
            this.message.success(response.message || this.t('PRICING_PAGE.MESSAGES.SUBSCRIBE_SUCCESS', { billingType: billingTypeText }));
            this.loadCurrentPackage({ force: true });

            // Google Ads — Lượt mua hàng (PayPal)
            const amountUsd = Number(event.amountUsd || event.paymentData?.amount || 0);
            this.googleAdsConversion.trackPurchase({
              transactionId: String(event.paymentId || event.paymentDetails?.id || `paypal_${Date.now()}`),
              value: amountUsd > 0 ? amountUsd : undefined,
              currency: amountUsd > 0 ? 'USD' : undefined,
              newCustomer: !this.currentPackage?.packageId,
            });

            // Tạo thông báo hệ thống cho thanh toán và đăng ký gói thành công
            const pkg = this.packages.find(p => (p._id || p.id) === event.paymentData.packageId);
            if (pkg) {
              if (isUpgrade) {
                this.createSubscriptionAnnouncement(pkg.name, billingTypeText, 'upgrade');
              } else if (isUpdate) {
                this.createSubscriptionAnnouncement(pkg.name, billingTypeText, 'update');
              } else {
                this.createSubscriptionAnnouncement(pkg.name, billingTypeText, 'payment');
              }
            }
          } else {
            this.message.error(response.message || this.t('PRICING_PAGE.MESSAGES.SUBSCRIBE_ERROR'));
          }
          this.loading = false;
        },
        error: (error: any) => {
          console.error('Subscribe error after PayPal payment:', error);
          this.message.error(error.error?.message || this.t('PRICING_PAGE.MESSAGES.SUBSCRIBE_AFTER_PAYMENT_ERROR'));
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

  /**
   * Load lịch sử thanh toán của user
   */
  loadPaymentHistory(): void {
    if (!this.userId) return;

    this.paymentHistoryLoading = true;
    
    const paypalHistory$ = this.paypalService.getPaymentHistory({ userId: this.userId, limit: 10 });
    const sepayHistory$ = this.sepayService.getPaymentHistory({ userId: this.userId, limit: 10 });

    forkJoin([paypalHistory$, sepayHistory$]).subscribe({
        next: ([paypalData, sepayData]) => {
          const allPayments: any[] = [];
          
          if (paypalData?.data) {
            paypalData.data.forEach((payment: any) => {
              allPayments.push({
                ...payment,
                paymentMethod: 'paypal',
                paymentMethodLabel: 'PayPal',
                paymentMethodIcon: 'pay-circle'
              });
            });
          }

          if (sepayData?.data) {
            sepayData.data.forEach((payment: any) => {
              allPayments.push({
                ...payment,
                paymentMethod: 'sepay',
                paymentMethodLabel: 'SePay',
                paymentMethodIcon: 'credit-card'
              });
            });
          }

          this.paymentHistory = allPayments.sort((a, b) => {
            const dateA = new Date(a.createdAt || a.created_at || 0).getTime();
            const dateB = new Date(b.createdAt || b.created_at || 0).getTime();
            return dateB - dateA;
          });

          this.paymentHistoryLoading = false;
        },
        error: (error) => {
          console.error('Error loading payment history:', error);
          this.paymentHistoryLoading = false;
        }
      });
  }

  /**
   * Toggle hiển thị lịch sử thanh toán
   */
  togglePaymentHistory(): void {
    this.showPaymentHistory = !this.showPaymentHistory;
    if (this.showPaymentHistory && this.paymentHistory.length === 0) {
      this.loadPaymentHistory();
    }
  }

  /**
   * Lấy màu cho payment method
   */
  getPaymentMethodColor(method: string): string {
    switch (method) {
      case 'paypal':
        return '#0070ba';
      case 'sepay':
        return '#667eea';
      default:
        return '#999';
    }
  }

  getPaymentMethodBgColor(method: string): string {
    switch (method) {
      case 'paypal':
        return 'rgba(0, 112, 186, 0.1)';
      case 'sepay':
        return 'rgba(102, 126, 234, 0.1)';
      default:
        return 'rgba(153, 153, 153, 0.1)';
    }
  }

  getPaymentStatusIcon(status: string): string {
    switch (status) {
      case 'completed':
      case 'paid':
        return 'check-circle';
      case 'pending':
        return 'clock-circle';
      case 'failed':
        return 'close-circle';
      case 'cancelled':
        return 'stop';
      case 'refunded':
        return 'undo';
      default:
        return 'question-circle';
    }
  }

  trackByPaymentId(index: number, item: any): string {
    return item._id || item.id || item.transactionId || index.toString();
  }

  /**
   * Lấy text cho status
   */
  getPaymentStatusText(status: string): string {
    switch (status) {
      case 'completed':
      case 'paid':
        return 'Hoàn thành';
      case 'pending':
        return 'Đang chờ';
      case 'failed':
        return 'Thất bại';
      case 'cancelled':
        return 'Đã hủy';
      case 'refunded':
        return 'Đã hoàn tiền';
      default:
        return 'Không xác định';
    }
  }

  /**
   * Lấy màu cho status
   */
  getPaymentStatusColor(status: string): string {
    switch (status) {
      case 'completed':
        return 'success';
      case 'pending':
        return 'processing';
      case 'failed':
        return 'error';
      case 'cancelled':
        return 'default';
      case 'refunded':
        return 'warning';
      default:
        return 'default';
    }
  }

  /**
   * Lấy lịch sử chuyển khoản gần nhất và phát thông báo âm thanh
   */
  private loadLatestPaymentAndPlaySound(): void {
    if (!this.userId) {
      console.warn('[loadLatestPaymentAndPlaySound] Không tìm thấy userId');
      // Fallback: lấy từ selectedPackage hoặc sepayAmount ngay lập tức
      const amount = this.selectedPackage?.price || this.sepayAmount || 0;
      if (amount > 0) {
        this.playPaymentSuccessSound(amount);
      }
      return;
    }
    
    // Đợi một chút để đảm bảo webhook đã cập nhật dữ liệu
    setTimeout(() => {
      // Lấy lịch sử chuyển khoản SePay gần nhất
      this.sepayService.getPaymentHistory({ userId: this.userId, limit: 10 }).subscribe({
        next: (response: any) => {
          let amount = 0;
          
          // Tìm giao dịch gần nhất có status 'completed' hoặc 'paid'
          const paymentHistories = Array.isArray(response) 
            ? response 
            : (response?.success && response.data ? response.data : []);
          
          if (paymentHistories && paymentHistories.length > 0) {
            // Tìm giao dịch gần nhất đã hoàn thành
            const completedPayment = paymentHistories.find((p: any) => 
              (p.status === 'completed' || p.status === 'paid') && 
              (p.amount > 0 || p.totalAmount > 0)
            );
            
            if (completedPayment) {
              // Ưu tiên lấy transferAmount từ paymentGatewayResponse (số tiền thực tế nhận được)
              amount = completedPayment.paymentGatewayResponse?.transferAmount || 
                      completedPayment.amount || 
                      completedPayment.totalAmount || 0;
            } else {
              // Nếu không tìm thấy completed, lấy giao dịch gần nhất
              const latestPayment = paymentHistories[0];
              amount = latestPayment.amount || latestPayment.totalAmount || 0;
            }
          }
          
          // Nếu không lấy được từ API, thử lấy từ selectedPackage hoặc sepayAmount
          if (amount === 0) {
            amount = this.selectedPackage?.price || this.sepayAmount || 0;
          }
          
          if (amount > 0) {
            console.log('[loadLatestPaymentAndPlaySound] Số tiền thanh toán:', amount);
            // Phát thông báo âm thanh
            this.playPaymentSuccessSound(amount);
          } else {
            console.warn('[loadLatestPaymentAndPlaySound] Không tìm thấy số tiền thanh toán');
          }
        },
        error: (error) => {
          console.error('[loadLatestPaymentAndPlaySound] Lỗi khi lấy lịch sử thanh toán:', error);
          // Fallback: lấy từ selectedPackage hoặc sepayAmount
          const amount = this.selectedPackage?.price || this.sepayAmount || 0;
          if (amount > 0) {
            console.log('[loadLatestPaymentAndPlaySound] Sử dụng số tiền từ selectedPackage/sepayAmount:', amount);
            this.playPaymentSuccessSound(amount);
          }
        }
      });
    }, 1000); // Đợi 1 giây để webhook cập nhật dữ liệu
  }
  
  /**
   * Phát thông báo âm thanh khi thanh toán thành công
   */
  private playPaymentSuccessSound(amount: number): void {
    try {
      console.log('[playPaymentSuccessSound] Bắt đầu phát thông báo, số tiền:', amount);
      const roundedAmount = Math.round(amount);
      const formattedAmount = roundedAmount.toLocaleString('vi-VN');
      const message = `Thanh toán thành công số tiền ${formattedAmount} đồng`;
      console.log('[playPaymentSuccessSound] Nội dung thông báo:', message);

      const ttsUrl = `${environment.aiUrl}/tts?text=${encodeURIComponent(message)}`;
      let attempts = 0;
      const maxAttempts = 5;
      const retryDelayMs = 2000;
      const requestAudio = () => {
        this.http.get(ttsUrl, { responseType: 'blob' as 'json' }).subscribe({
          next: (audioBlob: any) => {
            const blob = audioBlob as Blob;
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio();
            audio.src = audioUrl;
            audio.onended = () => URL.revokeObjectURL(audioUrl);
            audio.onerror = () => URL.revokeObjectURL(audioUrl);
            const playPromise = audio.play();
            if (playPromise && typeof (playPromise as any).catch === 'function') {
              (playPromise as Promise<void>).catch((err) => {
                console.error('Audio play error:', err);
              });
            }
          },
          error: (error) => {
            attempts += 1;
            if (error?.status === 503 && attempts < maxAttempts) {
              setTimeout(requestAudio, retryDelayMs);
              return;
            }
            console.error('[playPaymentSuccessSound] Lỗi khi gọi TTS API:', error);
          }
        });
      };
      requestAudio();
    } catch (error) {
      console.error('[playPaymentSuccessSound] Lỗi khi phát âm thanh:', error);
    }
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
      
      if (!this.sepayPaymentHistoryId) {
        this.stopPaymentStatusPolling();
        return;
      }
      
      // Kiểm tra trạng thái thanh toán
      // Tìm payment history bằng paymentHistoryId
      this.sepayService.getPaymentHistory({
        limit: 100, // Lấy nhiều hơn để tìm được payment history
        skip: 0
      }).subscribe({
        next: (response: any) => {
          // Tìm payment history với paymentHistoryId
          const paymentHistories = Array.isArray(response) 
            ? response 
            : (response.data || []);
          
          // Tìm bằng paymentHistoryId
          const paymentHistory = paymentHistories.find((p: any) => {
            // Tìm bằng paymentHistoryId
            if (this.sepayPaymentHistoryId && (p._id === this.sepayPaymentHistoryId || p.id === this.sepayPaymentHistoryId)) {
              return true;
            }
            return false;
          });
          
          if (paymentHistory) {
            // Kiểm tra số tiền có khớp không (so sánh với số tiền cần thanh toán)
            const expectedAmount = this.sepayAmount;
            const receivedAmount = paymentHistory.paymentGatewayResponse?.transferAmount || paymentHistory.amount;
            const amountDifference = Math.abs(receivedAmount - expectedAmount);
            const amountTolerance = expectedAmount * 0.01; // Cho phép sai số 1%
            
            // Kiểm tra trạng thái thanh toán
            if (paymentHistory.status === 'completed' || paymentHistory.status === 'paid') {
              // Kiểm tra số tiền có khớp không
              if (amountDifference <= amountTolerance) {
                // Thanh toán thành công và số tiền khớp
                this.stopPaymentStatusPolling();
                this.onPaymentSuccess();
              } else {
                console.warn('Số tiền không khớp:', {
                  expected: expectedAmount,
                  received: receivedAmount,
                  difference: amountDifference
                });
                // Vẫn coi là thành công nếu status là completed (có thể do phí giao dịch)
                this.stopPaymentStatusPolling();
                this.onPaymentSuccess();
              }
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
    console.log('[onPaymentSuccess] Thanh toán thành công, đóng modal QR');
    
    // Dừng polling
    this.stopPaymentStatusPolling();
    
    // Đóng modal QR trước (tự động đóng)
    this.showSePayModal = false;
    
    // Force change detection để đảm bảo modal đóng ngay lập tức
    this.cdr.detectChanges();

    // Google Ads — Lượt mua hàng (SePay / chuyển khoản)
    this.googleAdsConversion.trackPurchase({
      transactionId: String(this.sepayPaymentHistoryId || this.sepayPaymentCode || `sepay_${Date.now()}`),
      value: this.sepayAmount > 0 ? this.sepayAmount : undefined,
      currency: this.sepayAmount > 0 ? 'VND' : undefined,
      newCustomer: !this.currentPackage?.packageId,
    });
    
    // Lấy lịch sử chuyển khoản gần nhất và phát thông báo âm thanh
    this.loadLatestPaymentAndPlaySound();
    
    // Hiển thị thông báo thành công
    this.message.success(this.t('PRICING_PAGE.MESSAGES.PAYMENT_SUCCESS_PROCESSING_SHORT'));
    
    // Tạo thông báo hệ thống cho thanh toán thành công
    if (this.selectedPackage) {
      const billingTypeText = this.selectedPackage.billingType === 'yearly' ? 'theo năm' : 'theo tháng';
      // Kiểm tra xem có phải nâng cấp/cập nhật gói không
      const isUpgrade = this.currentPackage && this.currentPackage.packageId && this.currentPackage.packageId !== this.selectedPackage.packageId;
      const isUpdate = this.currentPackage && this.currentPackage.packageId === this.selectedPackage.packageId && this.currentPackage.billingType !== this.selectedPackage.billingType;
      
      if (isUpgrade) {
        this.createSubscriptionAnnouncement(this.selectedPackage.name, billingTypeText, 'upgrade');
      } else if (isUpdate) {
        this.createSubscriptionAnnouncement(this.selectedPackage.name, billingTypeText, 'update');
      } else {
        this.createSubscriptionAnnouncement(this.selectedPackage.name, billingTypeText, 'payment');
      }
    }
    
    // Reload package sau 2 giây để kiểm tra xem đã đăng ký chưa
    setTimeout(() => {
      this.loadCurrentPackage({ force: true });
      this.loadPaymentHistory();
    }, 2000);
  }

  /**
   * Tạo thông báo hệ thống cho subscription/payment
   */
  private createSubscriptionAnnouncement(packageName: string, billingTypeText: string, actionType: 'subscribe' | 'payment' | 'upgrade' | 'update'): void {
    try {
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser) return;

      // Xác định title và message dựa trên actionType
      let title = '';
      let message = '';
      let notificationType: 'payment' | 'general' = 'payment';

      switch (actionType) {
        case 'subscribe':
          title = `Đăng ký gói: ${packageName}`;
          message = `Đã đăng ký gói ${packageName} ${billingTypeText} thành công.`;
          notificationType = 'payment';
          break;
        case 'payment':
          title = `Thanh toán gói: ${packageName}`;
          message = `Thanh toán gói ${packageName} ${billingTypeText} thành công. Hệ thống đang xử lý đăng ký gói.`;
          notificationType = 'payment';
          break;
        case 'upgrade':
          title = `Nâng cấp gói: ${packageName}`;
          message = `Đã nâng cấp lên gói ${packageName} ${billingTypeText} thành công.`;
          notificationType = 'payment';
          break;
        case 'update':
          title = `Cập nhật gói: ${packageName}`;
          message = `Đã cập nhật gói ${packageName} ${billingTypeText} thành công.`;
          notificationType = 'payment';
          break;
      }

      // Xác định targetType và targetBusinesses/targetHotels
      let targetType: 'system' | 'business' | 'hotel' = 'system';
      let targetBusinesses: string[] = [];
      let targetHotels: string[] = [];

      // Nếu user có businessId, tạo thông báo cho business
      if (currentUser.businessId) {
        targetType = 'business';
        let businessId: string | null = null;
        if (typeof currentUser.businessId === 'string') {
          businessId = currentUser.businessId;
        } else if (currentUser.businessId && typeof currentUser.businessId === 'object') {
          businessId = (currentUser.businessId as any)._id || (currentUser.businessId as any).toString();
        }
        if (businessId) {
          targetBusinesses = [businessId.toString()];
        }
      }

      // Nếu user có hotelId, tạo thông báo cho hotel
      if (currentUser.hotelId) {
        targetType = 'hotel';
        let hotelId: string | null = null;
        if (typeof currentUser.hotelId === 'string') {
          hotelId = currentUser.hotelId;
        } else if (currentUser.hotelId && typeof currentUser.hotelId === 'object') {
          hotelId = (currentUser.hotelId as any)._id || (currentUser.hotelId as any).toString();
        }
        if (hotelId) {
          targetHotels = [hotelId.toString()];
        }
      }

      // Lấy userId của currentUser
      let currentUserId: string | undefined = undefined;
      if (currentUser._id) {
        currentUserId = typeof currentUser._id === 'string' ? currentUser._id : (currentUser._id as any).toString();
      }

      // Tạo announcement
      const announcement: Partial<Announcement> = {
        type: 'success',
        title: title,
        message: message,
        priority: 'medium',
        startDate: new Date().toISOString(),
        isActive: true,
        targetRoles: ['business', 'hotel'], // Chỉ gửi cho business và hotel manager
        targetBusinesses: targetBusinesses,
        targetHotels: targetHotels,
        targetType: targetType,
        notificationType: notificationType,
        userId: currentUserId // Lưu userId để chỉ user đó và admin/superadmin thấy
      };

      // Gọi API tạo announcement (không cần đợi response)
      this.notificationsService.createAnnouncement(announcement).subscribe({
        next: () => {
          console.log('[createSubscriptionAnnouncement] Created announcement successfully');
        },
        error: (error) => {
          console.error('[createSubscriptionAnnouncement] Error creating announcement:', error);
          // Không hiển thị lỗi cho user, chỉ log
        }
      });
    } catch (error) {
      console.error('[createSubscriptionAnnouncement] Error:', error);
      // Không throw error để không ảnh hưởng đến flow chính
    }
  }

  /**
   * Cleanup khi component bị destroy
   */
  ngOnDestroy(): void {
    this.stopPaymentStatusPolling();
    window.removeEventListener('paymentSettingsChanged', this.onPaymentSettingsChanged as EventListener);
  }
}
