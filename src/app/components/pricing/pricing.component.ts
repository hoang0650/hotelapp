import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { PricingService } from '../../services/pricing.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { AuthService } from '../../services/auth.service';
import { PayPalPaymentData } from '../paypal-payment/paypal-payment.component';
import { SePayService, SePayPaymentData } from '../../services/sepay.service';
import { PayPalService } from '../../services/paypal.service';
import { CryptoService, CryptoPaymentData } from '../../services/crypto.service';
import { UserService } from '../../services/user.service';
import { SettingsService } from '../../services/settings.service';
import { NotificationsService, Announcement } from '../../services/notifications.service';
import { forkJoin } from 'rxjs';
import { HotelService } from '../../services/hotel.service';

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
  showCryptoModal = false;
  cryptoPaymentData: CryptoPaymentData | null = null;
  selectedPackage: any = null; // Gói đã chọn để thanh toán
  paymentHistory: any[] = []; // Lịch sử thanh toán
  showPaymentHistory = false; // Hiển thị lịch sử thanh toán
  paymentHistoryLoading = false;
  selectedCryptoNetwork: 'TRC20' | 'ERC20' | 'BEP20' = 'TRC20'; // Mạng crypto đã chọn
  
  cryptoNetworks = [
    { value: 'TRC20', label: 'TRC20 (Tron)', icon: '🌐' },
    { value: 'ERC20', label: 'ERC20 (Ethereum)', icon: '⛽' },
    { value: 'BEP20', label: 'BEP20 (BSC)', icon: '🔷' }
  ];
  
  // Kiểm tra tính năng thanh toán từ package
  canUsePayPal: boolean = true; // Mặc định cho phép
  canUseCrypto: boolean = true; // Mặc định cho phép
  enablePayPalPayment: boolean = true;
  enableCryptoPayment: boolean = true;

  // SePay QR code
  showSePayModal = false;
  // Bỏ sepayPaymentCode - không cần mã thanh toán nữa
  sepayAmount = 0;
  sepayQrUrl = '';
  sepayBeneficiaryName = '';
  sepayPaymentHistoryId = ''; // Lưu paymentHistoryId để kiểm tra trạng thái
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
    private cryptoService: CryptoService,
    private userService: UserService,
    private settingsService: SettingsService,
    private notificationsService: NotificationsService,
    private http: HttpClient,
    private hotelService: HotelService
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
      this.enableCryptoPayment = true;
      this.checkPaymentFeatures();
      return;
    }
    this.hotelService.getHotelById(hotelId).subscribe({
      next: (hotel: any) => {
        this.enablePayPalPayment = hotel.enablePayPalPayment || false;
        this.enableCryptoPayment = hotel.enableCryptoPayment || false;
        this.checkPaymentFeatures();
        this.cdr.detectChanges();
      },
      error: () => {
        this.enablePayPalPayment = true;
        this.enableCryptoPayment = true;
        this.checkPaymentFeatures();
      }
    });
  }

  private onPaymentSettingsChanged = (event: any) => {
    const detail = event?.detail || {};
    this.enablePayPalPayment = !!detail.enablePayPalPayment;
    this.enableCryptoPayment = !!detail.enableCryptoPayment;
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
    // Lấy user từ AuthService
    this.currentUser = this.authService.getCurrentUser();
    
    // Nếu chưa có user hoặc chưa có bankAccount, load từ API
    if (this.userId && (!this.currentUser || !this.currentUser.bankAccount)) {
      this.userService.getProfile().subscribe({
        next: (userData: any) => {
          this.currentUser = userData;
        },
        error: (error: any) => {
          console.error('Error loading user profile:', error);
          // Fallback: sử dụng user từ AuthService
          if (!this.currentUser) {
            this.currentUser = this.authService.getCurrentUser();
          }
        }
      });
    }
    
    // Nếu chưa có user, subscribe để lấy khi có
    if (!this.currentUser) {
      this.authService.currentUser$.subscribe({
        next: (user) => {
          this.currentUser = user;
          // Không cần kiểm tra QR code từ currentUser nữa, chỉ lấy từ hệ thống/superadmin
        }
      });
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
      this.message.success('Thanh toán thành công! Hệ thống đang xử lý đăng ký gói. Vui lòng đợi vài giây...');
      
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
        this.loadCurrentPackage();
        this.loadPaymentHistory();
      }, 2000);
      
      // Xóa query params để tránh xử lý lại
      window.history.replaceState({}, '', '/pricing');
    } else if (paymentStatus === 'error') {
      this.message.error('Thanh toán thất bại. Vui lòng thử lại.');
      this.selectedPackage = null; // Reset selected package
      window.history.replaceState({}, '', '/pricing');
    } else if (paymentStatus === 'cancel') {
      this.message.warning('Bạn đã hủy thanh toán.');
      this.selectedPackage = null; // Reset selected package
      window.history.replaceState({}, '', '/pricing');
    }
  }

  loadPackages(): void {
    this.loading = true;
    this.pricingService.getAllPackages().subscribe({
      next: (response) => {
        if (response.success !== false) {
          this.packages = response.data || response || [];
          
          if (this.preselectPackageId) {
            const type: 'monthly' | 'yearly' = this.preselectBillingType || this.billingType;
            this.performPreselect(this.preselectPackageId, type);
            this.preselectPackageId = null;
            this.preselectBillingType = null;
            try {
              window.history.replaceState({}, '', '/pricing');
            } catch {}
          }
          
          // Nếu user là guest và chưa có package, tự động map với gói free (giá = 0)
          if (this.currentUser && this.currentUser.role === 'guest' && !this.currentPackage) {
            const freePackage = this.packages.find((pkg: any) => 
              (pkg.monthlyPrice === 0 && pkg.yearlyPrice === 0) || 
              (pkg.monthlyPrice === 0 && !pkg.yearlyPrice)
            );
            
            if (freePackage && this.userId) {
              // Tự động subscribe gói free cho guest
              this.pricingService.subscribe(this.userId, freePackage._id || freePackage.id, 'monthly').subscribe({
                next: (subscribeResponse: any) => {
                  if (subscribeResponse.success !== false) {
                    console.log('Auto-subscribed guest to free package');
                    this.loadCurrentPackage();
                  }
                },
                error: (subscribeError: any) => {
                  console.error('Error auto-subscribing guest to free package:', subscribeError);
                }
              });
            }
          }
        } else {
          this.packages = [];
          // Không hiển thị lỗi nếu chỉ là response format khác
          if (response.message) {
            this.message.error(response.message);
          }
        }
        this.loading = false;
        // Cập nhật scroll buttons sau khi load packages
        setTimeout(() => {
          this.updateScrollButtons();
        }, 200);
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
          // Kiểm tra tính năng thanh toán
          this.checkPaymentFeatures();
        } else {
          this.currentPackage = null;
          
          // Nếu user là guest và chưa có package, tự động map với gói free
          if (this.currentUser && this.currentUser.role === 'guest' && this.packages.length > 0) {
            const freePackage = this.packages.find((pkg: any) => 
              (pkg.monthlyPrice === 0 && pkg.yearlyPrice === 0) || 
              (pkg.monthlyPrice === 0 && !pkg.yearlyPrice)
            );
            
            if (freePackage) {
              // Tự động subscribe gói free cho guest
              this.pricingService.subscribe(this.userId, freePackage._id || freePackage.id, 'monthly').subscribe({
                next: (subscribeResponse: any) => {
                  if (subscribeResponse.success !== false) {
                    console.log('Auto-subscribed guest to free package');
                    this.loadCurrentPackage(); // Reload để lấy package mới
                  }
                },
                error: (subscribeError: any) => {
                  console.error('Error auto-subscribing guest to free package:', subscribeError);
                }
              });
            }
          }
          
          // Reset về mặc định nếu không có package
          this.canUsePayPal = true;
          this.canUseCrypto = true;
        }
      },
      error: (error) => {
        console.error('Error loading current package:', error);
        // Không hiển thị lỗi nếu user chưa có gói (404 hoặc null)
        if (error.status !== 404 && error.status !== 400) {
          this.message.error(error.error?.message || 'Không thể tải thông tin gói hiện tại');
        }
        this.currentPackage = null;
        
        // Nếu user là guest và chưa có package, tự động map với gói free
        if (this.currentUser && this.currentUser.role === 'guest' && this.packages.length > 0) {
          const freePackage = this.packages.find((pkg: any) => 
            (pkg.monthlyPrice === 0 && pkg.yearlyPrice === 0) || 
            (pkg.monthlyPrice === 0 && !pkg.yearlyPrice)
          );
          
          if (freePackage) {
            // Tự động subscribe gói free cho guest
            this.pricingService.subscribe(this.userId, freePackage._id || freePackage.id, 'monthly').subscribe({
              next: (subscribeResponse: any) => {
                if (subscribeResponse.success !== false) {
                  console.log('Auto-subscribed guest to free package');
                  this.loadCurrentPackage(); // Reload để lấy package mới
                }
              },
              error: (subscribeError: any) => {
                console.error('Error auto-subscribing guest to free package:', subscribeError);
              }
            });
          }
        }
        
        // Reset về mặc định nếu không có package
        this.canUsePayPal = true;
        this.canUseCrypto = true;
      }
    });
  }
  
  /**
   * Kiểm tra tính năng thanh toán từ package đã chọn hoặc current package
   */
  checkPaymentFeatures(): void {
    // Kiểm tra từ selectedPackage (gói đang chọn để thanh toán)
    if (this.selectedPackage) {
      const pkg = this.packages.find(p => p._id === this.selectedPackage.packageId || p._id === this.selectedPackage._id);
      if (pkg) {
        this.canUsePayPal = (pkg.paypalPaymentFeature === true) && this.enablePayPalPayment;
        this.canUseCrypto = (pkg.cryptoPaymentFeature === true) && this.enableCryptoPayment;
        return;
      }
      // Nếu selectedPackage có trực tiếp các fields
      if (this.selectedPackage.paypalPaymentFeature !== undefined) {
        this.canUsePayPal = (this.selectedPackage.paypalPaymentFeature === true) && this.enablePayPalPayment;
      }
      if (this.selectedPackage.cryptoPaymentFeature !== undefined) {
        this.canUseCrypto = (this.selectedPackage.cryptoPaymentFeature === true) && this.enableCryptoPayment;
      }
      return;
    }
    
    // Nếu không có selectedPackage, kiểm tra từ currentPackage (gói đã đăng ký)
    if (this.currentPackage) {
      const pkg = this.packages.find(p => p._id === this.currentPackage._id || p._id === this.currentPackage.packageId);
      if (pkg) {
        this.canUsePayPal = (pkg.paypalPaymentFeature === true) && this.enablePayPalPayment;
        this.canUseCrypto = (pkg.cryptoPaymentFeature === true) && this.enableCryptoPayment;
        return;
      }
      // Nếu currentPackage có trực tiếp các fields
      if (this.currentPackage.paypalPaymentFeature !== undefined) {
        this.canUsePayPal = (this.currentPackage.paypalPaymentFeature === true) && this.enablePayPalPayment;
      }
      if (this.currentPackage.cryptoPaymentFeature !== undefined) {
        this.canUseCrypto = (this.currentPackage.cryptoPaymentFeature === true) && this.enableCryptoPayment;
      }
    } else {
      this.canUsePayPal = this.enablePayPalPayment;
      this.canUseCrypto = this.enableCryptoPayment;
    }
  }

  subscribeToPlan(packageId: string) {
    if (!this.userId) {
      this.message.warning('Vui lòng đăng nhập để đăng ký gói');
      return;
    }

    const pkg = this.packages.find(p => (p._id || p.id) === packageId);
    if (!pkg) {
      this.message.error('Không tìm thấy gói dịch vụ.');
      return;
    }

    const billingTypeText = this.billingType === 'yearly' ? 'theo năm' : 'theo tháng';

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
            this.message.success(response.message || `Đăng ký gói ${billingTypeText} thành công`);
            this.loadCurrentPackage();
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
            this.message.error(response.message || 'Đăng ký gói dịch vụ thất bại');
          }
          this.loading = false;
        },
        error: (error: any) => {
          console.error('Subscribe error:', error);
          this.message.error(error.error?.message || 'Có lỗi xảy ra khi đăng ký gói dịch vụ');
          this.loading = false;
        }
      });
      return;
    }

    // Tính số tiền cần thanh toán ròng (khấu trừ phần còn lại của gói hiện tại nếu nâng cấp)
    const netAmount = this.computeNetAmount(pkg, this.billingType);

    // Nếu số tiền gói mới <= gói hiện tại (hạ gói) hoặc netAmount = 0 => tự động cập nhật gói không cần thanh toán
    const currentPkgObj = this.packages.find(p => (p._id || p.id) === (this.currentPackage?._id || this.currentPackage?.packageId));
    const originalBilling = this.billingType;
    let isDowngrade = false;
    if (currentPkgObj) {
      this.billingType = this.currentPackage?.billingType || this.billingType;
      const currentPrice = this.getPackagePrice(currentPkgObj);
      this.billingType = originalBilling;
      const targetPrice = this.getPackagePrice(pkg);
      isDowngrade = (targetPrice <= currentPrice);
    }

    if (isDowngrade || netAmount === 0) {
      this.loading = true;
      this.pricingService.subscribe(this.userId, packageId, this.billingType).subscribe({
        next: (response: any) => {
          if (response.success !== false) {
            const billingTypeText = this.billingType === 'yearly' ? 'theo năm' : 'theo tháng';
            this.message.success(response.message || `Đã chuyển sang gói ${pkg.name} ${billingTypeText} mà không cần thanh toán`);
            this.loadCurrentPackage();
            this.selectedPackage = null;
            // Tạo thông báo hệ thống (hạ gói/cập nhật)
            this.createSubscriptionAnnouncement(pkg.name, billingTypeText, isDowngrade ? 'update' : 'subscribe');
          } else {
            this.message.error(response.message || 'Cập nhật gói thất bại');
          }
          this.loading = false;
        },
        error: (error: any) => {
          console.error('Subscribe (downgrade/no-charge) error:', error);
          this.message.error(error.error?.message || 'Có lỗi xảy ra khi cập nhật gói');
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

    this.message.success(`Đã chọn gói ${pkg.name} - ${billingTypeText}. Số tiền cần thanh toán: ${this.formatPrice(netAmount)}.`);
  }

  /**
   * Thanh toán qua PayPal
   */
  payWithPayPal(): void {
    if (!this.selectedPackage || !this.userId) {
      this.message.warning('Vui lòng chọn gói trước khi thanh toán');
      return;
    }
    
    // Kiểm tra tính năng PayPal
    if (!this.canUsePayPal) {
      this.message.warning('Gói này không hỗ trợ thanh toán bằng PayPal');
      return;
    }

    const packageId = this.selectedPackage.packageId;
    const pkg = this.selectedPackage;
    const packagePrice = (this.selectedPackage.netAmount !== undefined) 
      ? this.selectedPackage.netAmount 
      : this.getPackagePrice(pkg);
    const billingTypeText = this.selectedPackage.billingType === 'yearly' ? 'theo năm' : 'theo tháng';

    this.payPalPaymentData = {
      packageId: packageId,
      packageName: pkg?.name || 'N/A',
      amount: packagePrice,
      billingType: this.selectedPackage.billingType,
      currency: 'USD' // PayPal sử dụng USD
    };

    this.showPayPalModal = true;
  }

  /**
   * Thanh toán qua Crypto USDT
   */
  payWithCrypto(): void {
    if (!this.selectedPackage || !this.userId) {
      this.message.warning('Vui lòng chọn gói trước khi thanh toán');
      return;
    }
    
    // Kiểm tra tính năng Crypto
    if (!this.canUseCrypto) {
      this.message.warning('Gói này không hỗ trợ thanh toán bằng Crypto');
      return;
    }

    const packageId = this.selectedPackage.packageId;
    const pkg = this.selectedPackage;
    const packagePrice = (this.selectedPackage.netAmount !== undefined) 
      ? this.selectedPackage.netAmount 
      : this.getPackagePrice(pkg);

    this.cryptoPaymentData = {
      packageId: packageId,
      packageName: pkg?.name || 'N/A',
      amount: packagePrice,
      billingType: this.selectedPackage.billingType,
      currency: 'VND',
      userId: this.userId,
      network: this.selectedCryptoNetwork // Thêm network đã chọn
    };

    this.showCryptoModal = true;
  }

  /**
   * Thanh toán qua SePay
   * Tạo payment history và hiển thị QR code thanh toán
   * Webhook sẽ tự động xử lý khi SePay nhận được tiền
   */
  payWithSePay(): void {
    if (!this.selectedPackage || !this.userId) {
      this.message.warning('Vui lòng chọn gói trước khi thanh toán');
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
    const billingTypeText = this.selectedPackage.billingType === 'yearly' ? 'theo năm' : 'theo tháng';

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
            this.message.warning('Hệ thống chưa có QR code thanh toán. Vui lòng liên hệ quản trị viên để cập nhật. Mã thanh toán: ' + (response.paymentCode || response.paymentHistoryId));
            return;
          }
          
          // Lưu thông tin payment và hiển thị modal với QR code
          this.sepayAmount = packagePrice;
          this.sepayQrUrl = finalQrUrl;
          this.sepayBeneficiaryName = finalBeneficiaryName;
          this.sepayPaymentHistoryId = response.paymentHistoryId || ''; // Lưu paymentHistoryId để kiểm tra trạng thái
          
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
          const errorMsg = response.error || response.message || 'Có lỗi xảy ra khi tạo payment history';
          this.message.error(errorMsg);
        }
      },
      error: (error: any) => {
        this.loading = false;
        console.error('Error creating SePay payment history:', error);
        const errorMessage = error.error?.error || error.error?.message || error.message || 'Có lỗi xảy ra khi tạo payment history. Vui lòng thử lại.';
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
    this.selectedPackage = null;
    this.loadCurrentPackage();
    this.loadPaymentHistory();
  }

  // Bỏ copyPaymentCode - không cần mã thanh toán nữa

  /**
   * Hủy chọn gói
   */
  cancelPackageSelection(): void {
    this.selectedPackage = null;
    this.message.info('Đã hủy chọn gói');
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
              this.message.success(response.message || 'Yêu cầu hủy đã ghi nhận. Gói sẽ được hủy khi hết hạn.');
              this.loadCurrentPackage();
              this.loadPaymentHistory();
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

  // Map các feature values với labels
  private availableFeatures: { value: string; label: string }[] = [
    { value: 'room_management', label: 'Quản lý phòng' },
    { value: 'hotel_management', label: 'Quản lý khách sạn' },
    { value: 'company_management', label: 'Quản lý doanh nghiệp' },
    { value: 'staff_management', label: 'Quản lý nhân viên' },
    { value: 'service_management', label: 'Quản lý dịch vụ' },
    { value: 'user_management', label: 'Quản lý người dùng' },
    { value: 'pricing_management', label: 'Quản lý gói giá' },
    { value: 'ota_management', label: 'Quản lý OTA' },
    { value: 'revenue_chart', label: 'Biểu đồ doanh thu' },
    { value: 'shift_handover', label: 'Giao ca' },
    { value: 'bank_transfer_history', label: 'Lịch sử chuyển khoản' },
    { value: 'calendar', label: 'Lịch' },
    { value: 'email_admin', label: 'Quản lý email' },
    { value: 'qr_payment', label: 'Thanh toán QR' },
    { value: 'visa_payment', label: 'Thanh toán Visa' },
    { value: 'electric_management', label: 'Quản lý điện' }
  ];

  getFeatureText(feature: any): string {
    // Nếu là string (value), tìm label tương ứng
    if (typeof feature === 'string') {
      const featureMap = this.availableFeatures.find(f => f.value === feature);
      if (featureMap) {
        return featureMap.label;
      }
      // Nếu không tìm thấy trong map, trả về string gốc
      return feature;
    }
    
    // Nếu là object, ưu tiên lấy label
    if (feature && typeof feature === 'object') {
      // Nếu có value, map với availableFeatures để lấy label
      if (feature.value) {
        const featureMap = this.availableFeatures.find(f => f.value === feature.value);
        if (featureMap) {
          return featureMap.label;
        }
      }
      // Fallback: lấy label, text, hoặc name
      return feature.label || feature.text || feature.name || String(feature);
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

  /**
   * Tính số tiền còn lại (credit) của gói hiện tại theo thời gian chưa sử dụng
   * - monthly: chia theo 30 ngày
   * - yearly: chia theo 365 ngày
   */
  private getRemainingCredit(billing: 'monthly' | 'yearly'): number {
    if (!this.currentPackage) return 0;
    const now = new Date();
    const expiry = new Date(this.currentPackage.expiryDate || this.currentPackage.packageExpiryDate || 0);
    if (isNaN(expiry.getTime()) || expiry <= now) return 0;
    const totalDays = billing === 'yearly' ? 365 : 30;
    const remainingDays = Math.max(0, Math.min(totalDays, Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))));
    // Lấy giá gói hiện tại theo billing
    let currentPrice = 0;
    const currentPkgObj = this.packages.find(p => (p._id || p.id) === (this.currentPackage._id || this.currentPackage.packageId));
    if (currentPkgObj) {
      // Tạm mượn billingType hiện tại để tính đúng discount năm
      const originalBilling = this.billingType;
      this.billingType = billing;
      currentPrice = this.getPackagePrice(currentPkgObj);
      this.billingType = originalBilling;
    } else {
      // Fallback từ currentPackage nếu có field giá
      if (billing === 'yearly') {
        const yearlyPrice = this.currentPackage.yearlyPrice || ((this.currentPackage.monthlyPrice || this.currentPackage.price || 0) * 12);
        const discount = this.currentPackage.yearlyDiscount || 0;
        currentPrice = yearlyPrice * (1 - discount / 100);
      } else {
        currentPrice = this.currentPackage.monthlyPrice || this.currentPackage.price || 0;
      }
    }
    return Math.round((currentPrice * remainingDays / totalDays));
  }

  /**
   * Tính số tiền thực phải thanh toán khi nâng gói (gói mới - credit còn lại)
   * Nếu bằng 0 hoặc âm, coi như hạ gói/không cần thanh toán.
   */
  private computeNetAmount(targetPkg: any, billing: 'monthly' | 'yearly'): number {
    // Tạm mượn billingType để dùng getPackagePrice với đúng kiểu
    const originalBilling = this.billingType;
    this.billingType = billing;
    const targetPrice = this.getPackagePrice(targetPkg);
    this.billingType = originalBilling;
    const credit = this.getRemainingCredit(billing);
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
            this.message.success(response.message || `Đăng ký gói ${billingTypeText} thành công`);
            this.loadCurrentPackage();
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

  onCryptoPaymentSuccess(event: any): void {
    console.log('Crypto payment success:', event);
    
    if (event.success && this.selectedPackage) {
      this.loading = true;
      // Gọi subscribe với paymentMethod='crypto_usdt'
      // Kiểm tra xem có phải nâng cấp/cập nhật gói không
      const isUpgrade = this.currentPackage && this.currentPackage.packageId && this.currentPackage.packageId !== this.selectedPackage.packageId;
      const isUpdate = this.currentPackage && this.currentPackage.packageId === this.selectedPackage.packageId && this.currentPackage.billingType !== this.selectedPackage.billingType;
      
      this.pricingService.subscribe(
        this.userId,
        this.selectedPackage.packageId,
        this.selectedPackage.billingType,
        event.transactionId,
        'crypto_usdt'
      ).subscribe({
        next: (response: any) => {
          if (response.success !== false) {
            const billingTypeText = this.selectedPackage.billingType === 'yearly' ? 'theo năm' : 'theo tháng';
            this.message.success(response.message || `Đăng ký gói ${billingTypeText} thành công. Đang chờ xác nhận thanh toán.`);
            this.loadCurrentPackage();
            // Tạo thông báo hệ thống cho thanh toán và đăng ký gói thành công
            if (isUpgrade) {
              this.createSubscriptionAnnouncement(this.selectedPackage.name, billingTypeText, 'upgrade');
            } else if (isUpdate) {
              this.createSubscriptionAnnouncement(this.selectedPackage.name, billingTypeText, 'update');
            } else {
              this.createSubscriptionAnnouncement(this.selectedPackage.name, billingTypeText, 'payment');
            }
            this.selectedPackage = null;
          } else {
            this.message.error(response.message || 'Đăng ký gói dịch vụ thất bại');
          }
          this.loading = false;
        },
        error: (error: any) => {
          console.error('Subscribe error after crypto payment:', error);
          this.message.error(error.error?.message || 'Có lỗi xảy ra khi đăng ký gói dịch vụ sau thanh toán');
          this.loading = false;
        }
      });
    }
  }

  onCryptoPaymentCancel(): void {
    console.log('Crypto payment cancelled');
    this.showCryptoModal = false;
    this.cryptoPaymentData = null;
  }

  /**
   * Load lịch sử thanh toán của user
   */
  loadPaymentHistory(): void {
    if (!this.userId) return;

    this.paymentHistoryLoading = true;
    
    // Load từ tất cả các phương thức thanh toán
    const paypalHistory$ = this.paypalService.getPaymentHistory({ userId: this.userId, limit: 10 });
    const cryptoHistory$ = this.cryptoService.getPaymentHistory({ userId: this.userId, limit: 10 });
    const sepayHistory$ = this.sepayService.getPaymentHistory({ userId: this.userId, limit: 10 });

    // Combine tất cả payment history
    forkJoin([paypalHistory$, cryptoHistory$, sepayHistory$]).subscribe({
        next: ([paypalData, cryptoData, sepayData]) => {
          const allPayments: any[] = [];
          
          // Thêm PayPal payments
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

          // Thêm Crypto payments
          if (cryptoData?.data) {
            cryptoData.data.forEach((payment: any) => {
              allPayments.push({
                ...payment,
                paymentMethod: 'crypto_usdt',
                paymentMethodLabel: `Crypto USDT (${payment.cryptoNetwork || 'N/A'})`,
                paymentMethodIcon: 'dollar-circle'
              });
            });
          }

          // Thêm SePay payments
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

          // Sắp xếp theo ngày tạo (mới nhất trước)
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
          // Không hiển thị lỗi để không làm phiền user
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
      case 'crypto_usdt':
        return '#26a17b';
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
      case 'crypto_usdt':
        return 'rgba(38, 161, 123, 0.1)';
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
      const formattedAmount = roundedAmount.toString();
      const message = `Thanh toán thành công số tiền ${formattedAmount} đồng`;
      console.log('[playPaymentSuccessSound] Nội dung thông báo:', message);

      this.sepayService.generatePaymentSound({
        message: message,
        speed: -1,
        voice: 'banmai',
        format: 'mp3'
      }).subscribe({
        next: (response) => {
          console.log('[playPaymentSuccessSound] FPT.AI TTS response:', response);
          const asyncUrl = response && response.async;
          if (!asyncUrl) {
            console.warn('[playPaymentSuccessSound] Không tìm thấy async URL trong response');
            return;
          }

          let attempts = 0;
          const maxAttempts = 24;
          const checkAudioAvailability = setInterval(() => {
            attempts += 1;
            const src = `${asyncUrl}?t=${Date.now()}`;
            const audio = new Audio();
            audio.src = src;
            audio.oncanplaythrough = () => {
              clearInterval(checkAudioAvailability);
              const playPromise = audio.play();
              if (playPromise && typeof (playPromise as any).catch === 'function') {
                (playPromise as Promise<void>).catch((err) => {
                  console.error('Audio play error:', err);
                });
              }
            };
            audio.onerror = (e) => {
              if (attempts >= maxAttempts) {
                clearInterval(checkAudioAvailability);
                console.error('[playPaymentSuccessSound] Không thể tải file âm thanh sau nhiều lần thử:', e);
              } else {
                console.warn('[playPaymentSuccessSound] File âm thanh chưa sẵn sàng, sẽ thử lại:', e);
              }
            };
            // Bắt đầu tải
            audio.load();
          }, 5000);
        },
        error: (error) => {
          console.error('[playPaymentSuccessSound] Lỗi khi gọi FPT.AI TTS API:', error);
        }
      });
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
    
    // Lấy lịch sử chuyển khoản gần nhất và phát thông báo âm thanh
    this.loadLatestPaymentAndPlaySound();
    
    // Hiển thị thông báo thành công
    this.message.success('Thanh toán thành công! Hệ thống đang xử lý đăng ký gói...');
    
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
      this.loadCurrentPackage();
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
