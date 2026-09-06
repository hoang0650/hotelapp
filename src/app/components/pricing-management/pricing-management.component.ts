import { Component, OnInit } from '@angular/core';
import { PricingService } from '../../services/pricing.service';
import { AuthService } from '../../services/auth.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { formatCurrency } from '@angular/common';
import { PermissionFeature } from '../../services/permission.service';
import { TranslateService } from '@ngx-translate/core';
import {
  RECOMMENDED_PRICING_PACKAGES,
  RecommendedPricingPackage,
  sortPackagesByRecommendedOrder
} from '../../constants/recommended-pricing-packages';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

interface PricingPackage {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  yearlyDiscount: number;
  duration: number;
  features: string[];
  maxUsers: number | null; // 0 hoặc null = không giới hạn
  isContactOnly?: boolean;
  contactLabel?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactUrl?: string;
  qrPaymentFeature?: boolean; // Tính năng QR thanh toán
  otaManagementFeature?: boolean; // Tính năng quản lý OTA
  emailManagementFeature?: boolean; // Tính năng quản lý email
  electricManagementFeature?: boolean; // Tính năng quản lý điện
  paypalPaymentFeature?: boolean; // Tính năng thanh toán PayPal
  cryptoPaymentFeature?: boolean; // Tính năng thanh toán Crypto
  draftInvoiceFeature?: boolean; // Tính năng xem hóa đơn nháp
  exportInvoiceFeature?: boolean; // Tính năng xuất hóa đơn
  aiChatboxFeature?: boolean; // Tính năng AI Chatbox
  hotelNotificationFeature?: boolean; // Tính năng thông báo khách sạn
  aiMonthlyQuota?: number; // Soft quota AI / tháng (turns)
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions?: string[];
}

interface PackageSubscriber {
  userId: string;
  username: string;
  email: string;
  packageId: string;
  packageName: string;
  expiryDate: Date;
}

@Component({
  selector: 'app-pricing-management',
  templateUrl: './pricing-management.component.html',
  styleUrls: ['./pricing-management.component.css']
})
export class PricingManagementComponent implements OnInit {
  packages: any[] = [];
  subscribers: any[] = [];
  loading = false;
  isModalVisible = false;
  editingPackageId: string | null = null;
  availablePermissions = ['view', 'edit', 'delete', 'manage'];
  currentUser: any = null;
  currentUserPackage: any = null;
  isAdmin = false;
  isSuperAdmin = false;
  availableFeatures: { value: PermissionFeature; label: string }[] = [];
  packageForm!: FormGroup;
  recommendedPackages = RECOMMENDED_PRICING_PACKAGES;
  syncingRecommended = false;
  selectedPresetName: string | null = null;

  numberFormatter = (value: number): string => {
    if (!value) return '0';
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  numberParser = (value: string): string => value.replace(/,/g, '');

  constructor(
    private fb: FormBuilder,
    private pricingService: PricingService,
    private authService: AuthService,
    private message: NzMessageService,
    private modal: NzModalService,
    private translate: TranslateService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.isAdmin = this.authService.isSuperAdmin() || this.authService.isAdmin();
    this.isSuperAdmin = this.authService.isSuperAdmin();
    this.initTranslationArrays();
    
    if (this.isAdmin) {
      this.loadPackages();
      this.loadSubscribers();
    } else {
      // Non-admin: load tất cả packages để có thể đăng ký/nâng cấp/hạ cấp
      this.loadPackages();
      this.loadCurrentUserPackage();
    }
    // Khóa các controls theo quyền
    // - maxUsers/unlimitedUsers: chỉ superadmin được chỉnh
    if (!this.isSuperAdmin) {
      this.packageForm.get('unlimitedUsers')?.disable({ emitEvent: false });
      this.packageForm.get('maxUsers')?.disable({ emitEvent: false });
    }
    // - maxRooms/unlimitedRooms: admin và superadmin được chỉnh
    if (!this.isAdmin) {
      this.packageForm.get('unlimitedRooms')?.disable({ emitEvent: false });
      this.packageForm.get('maxRooms')?.disable({ emitEvent: false });
    } else {
      // Đảm bảo bật lại cho admin nếu trước đó bị disable
      this.packageForm.get('unlimitedRooms')?.enable({ emitEvent: false });
      // maxRooms enable/disable phụ thuộc vào trạng thái unlimitedRooms
      const unlimitedRooms = this.packageForm.get('unlimitedRooms')?.value;
      if (unlimitedRooms) {
        this.packageForm.get('maxRooms')?.disable({ emitEvent: false });
      } else {
        this.packageForm.get('maxRooms')?.enable({ emitEvent: false });
      }
    }
    
    this.pricingService.subscriptionChanged$.subscribe(() => {
      if (this.isAdmin) {
        this.loadSubscribers();
      } else {
        this.loadPackages();
        this.loadCurrentUserPackage();
      }
    });
  }

  private initTranslationArrays(): void {
    this.refreshAvailableFeatures();
    this.translate.onLangChange.subscribe(() => {
      this.refreshAvailableFeatures();
    });
  }

  private refreshAvailableFeatures(): void {
    this.availableFeatures = [
      { value: 'room_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.ROOM_MANAGEMENT') },
      { value: 'hotel_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.HOTEL_MANAGEMENT') },
      { value: 'company_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.COMPANY_MANAGEMENT') },
      { value: 'staff_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.STAFF_MANAGEMENT') },
      { value: 'service_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.SERVICE_MANAGEMENT') },
      { value: 'user_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.USER_MANAGEMENT') },
      { value: 'pricing_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.PRICING_MANAGEMENT') },
      { value: 'ota_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.OTA_MANAGEMENT') },
      { value: 'revenue_chart', label: this.translate.instant('USER_MANAGEMENT.FEATURES.REVENUE_CHART') },
      { value: 'financial_summary_report', label: this.translate.instant('USER_MANAGEMENT.FEATURES.FINANCIAL_SUMMARY_REPORT') },
      { value: 'shift_handover', label: this.translate.instant('USER_MANAGEMENT.FEATURES.SHIFT_HANDOVER') },
      { value: 'bank_transfer_history', label: this.translate.instant('USER_MANAGEMENT.FEATURES.BANK_TRANSFER_HISTORY') },
      { value: 'calendar', label: this.translate.instant('USER_MANAGEMENT.FEATURES.CALENDAR') },
      { value: 'email_admin', label: this.translate.instant('USER_MANAGEMENT.FEATURES.EMAIL_ADMIN') },
      { value: 'qr_payment', label: this.translate.instant('USER_MANAGEMENT.FEATURES.QR_PAYMENT') },
      { value: 'visa_payment', label: this.translate.instant('USER_MANAGEMENT.FEATURES.VISA_PAYMENT') },
      { value: 'electric_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.ELECTRIC_MANAGEMENT') },
      { value: 'fanpage_messages', label: this.translate.instant('USER_MANAGEMENT.FEATURES.FANPAGE_MESSAGES') },
      { value: 'zalo_messages', label: this.translate.instant('USER_MANAGEMENT.FEATURES.ZALO_MESSAGES') },
      { value: 'telegram_messages', label: this.translate.instant('USER_MANAGEMENT.FEATURES.TELEGRAM_MESSAGES') }
    ];
  }

  getPresetOptionLabel(preset: RecommendedPricingPackage): string {
    if (!preset) {
      return '';
    }
    if (preset.isContactOnly) {
      return `${preset.name} — ${this.translate.instant('PRICING_MANAGEMENT.CONTACT')}`;
    }
    const price = Number(preset.monthlyPrice || 0).toLocaleString('vi-VN');
    return `${preset.name} — ${price}đ${this.translate.instant('PRICING_MANAGEMENT.PRESET_PER_MONTH')}`;
  }

  initForm(): void {
    this.packageForm = this.fb.group({
      name: ['', [Validators.required]],
      description: ['', [Validators.required]],
      monthlyPrice: [0, [Validators.required, Validators.min(0)]],
      yearlyPrice: [0, [Validators.required, Validators.min(0)]],
      yearlyDiscount: [0, [Validators.min(0), Validators.max(100)]],
      isContactOnly: [false],
      contactLabel: [''],
      contactPhone: [''],
      contactEmail: [''],
      contactUrl: [''],
      duration: [1, [Validators.required, Validators.min(1)]], // Giữ lại để tương thích
      monthlyDuration: [1, [Validators.required, Validators.min(1)]], // Thời hạn gói tháng (tháng)
      yearlyDuration: [12, [Validators.required, Validators.min(1)]], // Thời hạn gói năm (tháng)
      features: [[]],
      permissions: [['view'], [Validators.required]],
      maxUsers: [1, [Validators.required, Validators.min(0)]], // Cho phép nhập 0 (0 = không giới hạn ở backend)
      unlimitedUsers: [false], // Checkbox để chọn không giới hạn (0 = không giới hạn ở backend)
      maxRooms: [20, [Validators.min(0)]],
      unlimitedRooms: [false],
      qrPaymentFeature: [false], // Tính năng QR thanh toán
      otaManagementFeature: [false], // Tính năng quản lý OTA
      emailManagementFeature: [false], // Tính năng quản lý email
      electricManagementFeature: [false], // Tính năng quản lý điện
      paypalPaymentFeature: [false], // Tính năng thanh toán PayPal
      cryptoPaymentFeature: [false], // Tính năng thanh toán Crypto
      draftInvoiceFeature: [false], // Tính năng xem hóa đơn nháp
      exportInvoiceFeature: [false], // Tính năng xuất hóa đơn
      aiChatboxFeature: [false], // Tính năng AI Chatbox
      hotelNotificationFeature: [false], // Tính năng thông báo khách sạn
      aiMonthlyQuota: [0, [Validators.min(0)]],
      isActive: [true]
    });

    this.packageForm.get('isContactOnly')?.valueChanges.subscribe((isContactOnly) => {
      const monthlyPriceCtrl = this.packageForm.get('monthlyPrice');
      const yearlyPriceCtrl = this.packageForm.get('yearlyPrice');
      const yearlyDiscountCtrl = this.packageForm.get('yearlyDiscount');

      if (isContactOnly) {
        monthlyPriceCtrl?.setValue(0, { emitEvent: false });
        yearlyPriceCtrl?.setValue(0, { emitEvent: false });
        yearlyDiscountCtrl?.setValue(0, { emitEvent: false });

        monthlyPriceCtrl?.clearValidators();
        yearlyPriceCtrl?.clearValidators();
        yearlyDiscountCtrl?.clearValidators();

        monthlyPriceCtrl?.disable({ emitEvent: false });
        yearlyPriceCtrl?.disable({ emitEvent: false });
        yearlyDiscountCtrl?.disable({ emitEvent: false });
      } else {
        monthlyPriceCtrl?.enable({ emitEvent: false });
        yearlyPriceCtrl?.enable({ emitEvent: false });
        yearlyDiscountCtrl?.enable({ emitEvent: false });

        monthlyPriceCtrl?.setValidators([Validators.required, Validators.min(0)]);
        yearlyPriceCtrl?.setValidators([Validators.required, Validators.min(0)]);
        yearlyDiscountCtrl?.setValidators([Validators.min(0), Validators.max(100)]);
      }

      monthlyPriceCtrl?.updateValueAndValidity({ emitEvent: false });
      yearlyPriceCtrl?.updateValueAndValidity({ emitEvent: false });
      yearlyDiscountCtrl?.updateValueAndValidity({ emitEvent: false });
    });
    
    // Theo dõi thay đổi của unlimitedUsers
    this.packageForm.get('unlimitedUsers')?.valueChanges.subscribe(unlimited => {
      if (!this.isSuperAdmin) return;
      const maxUsersControl = this.packageForm.get('maxUsers');
      if (unlimited) {
        // Khi chọn không giới hạn, set giá trị là 0 (sẽ gửi 0 lên backend)
        maxUsersControl?.setValue(0, { emitEvent: false });
        maxUsersControl?.clearValidators();
        maxUsersControl?.disable({ emitEvent: false });
      } else {
        // Khi bỏ chọn không giới hạn, bật lại validation và enable input
        maxUsersControl?.enable({ emitEvent: false });
        maxUsersControl?.setValidators([Validators.required, Validators.min(0)]);
        // Nếu giá trị hiện tại là 0, set về 1
        if (maxUsersControl?.value === 0) {
          maxUsersControl?.setValue(1, { emitEvent: false });
        }
      }
      maxUsersControl?.updateValueAndValidity();
    });

    // Theo dõi thay đổi của maxUsers - nếu nhập 0 thì tự động check "không giới hạn"
    this.packageForm.get('maxUsers')?.valueChanges.subscribe(value => {
      if (!this.isSuperAdmin) return;
      const unlimitedUsersControl = this.packageForm.get('unlimitedUsers');
      if (value === 0 && !unlimitedUsersControl?.disabled) {
        // Nếu nhập 0 và checkbox chưa bị disable (tức là đang enable), tự động check
        unlimitedUsersControl?.setValue(true, { emitEvent: false });
      } else if (value > 0 && unlimitedUsersControl?.value) {
        // Nếu nhập giá trị > 0 và checkbox đang được check, bỏ check
        unlimitedUsersControl?.setValue(false, { emitEvent: false });
      }
    });

    // Theo dõi thay đổi của unlimitedRooms
    this.packageForm.get('unlimitedRooms')?.valueChanges.subscribe(unlimited => {
      const maxRoomsControl = this.packageForm.get('maxRooms');
      if (!this.isAdmin) return;

      if (unlimited) {
        maxRoomsControl?.setValue(0, { emitEvent: false });
        maxRoomsControl?.clearValidators();
        maxRoomsControl?.disable({ emitEvent: false });
      } else {
        maxRoomsControl?.enable({ emitEvent: false });
        maxRoomsControl?.setValidators([Validators.min(0)]);
        if (maxRoomsControl?.value === 0) {
          maxRoomsControl?.setValue(20, { emitEvent: false });
        }
      }
      maxRoomsControl?.updateValueAndValidity();
    });

    // Theo dõi thay đổi của maxRooms - nếu nhập 0 thì tự động check "không giới hạn"
    this.packageForm.get('maxRooms')?.valueChanges.subscribe(value => {
      if (!this.isAdmin) return;
      const unlimitedRoomsControl = this.packageForm.get('unlimitedRooms');
      if (value === 0 && !unlimitedRoomsControl?.disabled) {
        unlimitedRoomsControl?.setValue(true, { emitEvent: false });
      } else if (value > 0 && unlimitedRoomsControl?.value) {
        unlimitedRoomsControl?.setValue(false, { emitEvent: false });
      }
    });
  }

  loadPackages(): void {
    const cached = this.pricingService.getCachedPackages();
    if (cached?.payload) {
      this.packages = sortPackagesByRecommendedOrder(
        (cached.payload.data || cached.payload || []).map((pkg: any) => this.normalizePackageLimits(pkg))
      );
      this.loading = false;
      this.pricingService.getAllPackages({ force: true }).subscribe({
        next: (response) => {
          this.packages = sortPackagesByRecommendedOrder(
            (response.data || []).map((pkg: any) => this.normalizePackageLimits(pkg))
          );
        },
        error: () => {}
      });
      return;
    }

    this.loading = true;
    this.pricingService.getAllPackages().subscribe({
      next: (response) => {
        this.packages = sortPackagesByRecommendedOrder(
          (response.data || []).map((pkg: any) => this.normalizePackageLimits(pkg))
        );
        
        this.loading = false;
      },
      error: (error) => {
        this.message.error(this.translate.instant('PRICING_MANAGEMENT.MESSAGES.LOAD_PACKAGES_ERROR'));
        this.loading = false;
      }
    });
  }

  loadCurrentUserPackage(): void {
    if (!this.currentUser?._id) {
      this.message.error(this.translate.instant('PRICING_MANAGEMENT.MESSAGES.USER_NOT_FOUND'));
      return;
    }
    
    this.loading = true;
    this.pricingService.getCurrentUserPackage(this.currentUser._id).subscribe({
      next: (response: any) => {
        const packageData = this.normalizePackageLimits(response.data || response);
        if (packageData && packageData._id) {
          this.currentUserPackage = packageData;
        } else {
          this.currentUserPackage = null;
        }
        this.loading = false;
      },
      error: (error) => {
        if (error.status !== 404) {
          this.message.error(this.translate.instant('PRICING_MANAGEMENT.MESSAGES.LOAD_USER_PACKAGE_ERROR'));
        }
        this.currentUserPackage = null;
        this.loading = false;
      }
    });
  }

  loadSubscribers(): void {
    this.loading = true;
    this.pricingService.getAllSubscribers().subscribe({
      next: (response) => {
        this.subscribers = (response.data || []).map((subscriber: any) => this.normalizeSubscriberLimits(subscriber));
        this.loading = false;
      },
      error: (error) => {
        this.message.error(this.translate.instant('PRICING_MANAGEMENT.MESSAGES.LOAD_SUBSCRIBERS_ERROR'));
        this.loading = false;
      }
    });
  }

  showModal(packageId?: string): void {
    this.editingPackageId = packageId || null;
    this.selectedPresetName = null;
    if (packageId) {
      const pkg = this.packages.find(p => p._id === packageId || p.id === packageId);
      if (pkg) {
        const normalizedPkg = this.normalizePackageLimits(pkg);
        // Backend: 0 hoặc null = không giới hạn
        const isUnlimited = normalizedPkg.maxUsers === 0 || normalizedPkg.maxUsers === null || normalizedPkg.maxUsers === undefined;
        const isUnlimitedRooms = normalizedPkg.maxRooms === 0 || normalizedPkg.maxRooms === null || normalizedPkg.maxRooms === undefined;
        this.packageForm.patchValue({
          name: normalizedPkg.name,
          description: normalizedPkg.description,
          monthlyPrice: normalizedPkg.monthlyPrice || normalizedPkg.price || 0,
          yearlyPrice: normalizedPkg.yearlyPrice || (normalizedPkg.price ? normalizedPkg.price * 12 : 0),
          yearlyDiscount: normalizedPkg.yearlyDiscount || 0,
          isContactOnly: !!normalizedPkg.isContactOnly,
          contactLabel: normalizedPkg.contactLabel || '',
          contactPhone: normalizedPkg.contactPhone || '',
          contactEmail: normalizedPkg.contactEmail || '',
          contactUrl: normalizedPkg.contactUrl || '',
          duration: normalizedPkg.duration || 1, // Giữ lại để tương thích
          monthlyDuration: normalizedPkg.monthlyDuration || normalizedPkg.duration || 1, // Thời hạn gói tháng
          yearlyDuration: normalizedPkg.yearlyDuration || normalizedPkg.duration || 12, // Thời hạn gói năm
          features: normalizedPkg.features || [],
          permissions: normalizedPkg.permissions || ['view'],
          // Hiển thị: nếu không giới hạn thì hiển thị 0 (để người dùng có thể thấy và chỉnh sửa)
          // Nếu có giới hạn thì hiển thị giá trị thực
          maxUsers: isUnlimited ? 0 : (normalizedPkg.maxUsers >= 1 ? normalizedPkg.maxUsers : 1),
          unlimitedUsers: isUnlimited,
          maxRooms: isUnlimitedRooms ? 0 : (normalizedPkg.maxRooms >= 1 ? normalizedPkg.maxRooms : 20),
          unlimitedRooms: isUnlimitedRooms,
          qrPaymentFeature: normalizedPkg.qrPaymentFeature || false,
          otaManagementFeature: normalizedPkg.otaManagementFeature || false,
          emailManagementFeature: normalizedPkg.emailManagementFeature || false,
          electricManagementFeature: normalizedPkg.electricManagementFeature || false,
          paypalPaymentFeature: normalizedPkg.paypalPaymentFeature || false,
          cryptoPaymentFeature: normalizedPkg.cryptoPaymentFeature || false,
          draftInvoiceFeature: normalizedPkg.draftInvoiceFeature || false,
          exportInvoiceFeature: normalizedPkg.exportInvoiceFeature || false,
          aiChatboxFeature: normalizedPkg.aiChatboxFeature || false,
          hotelNotificationFeature: normalizedPkg.hotelNotificationFeature || false,
          aiMonthlyQuota: Number(normalizedPkg.aiMonthlyQuota) || 0,
          isActive: normalizedPkg.isActive
        });
        // Bật checkbox cho admin (để người dùng có thể chuyển trạng thái không giới hạn)
        if (this.isAdmin) {
          this.packageForm.get('unlimitedRooms')?.enable({ emitEvent: false });
        }
      }
    } else {
      this.packageForm.reset({
        name: '',
        description: '',
        monthlyPrice: 0,
        yearlyPrice: 0,
        yearlyDiscount: 0,
        isContactOnly: false,
        contactLabel: '',
        contactPhone: '',
        contactEmail: '',
        contactUrl: '',
        duration: 1, // Giữ lại để tương thích
        monthlyDuration: 1, // Thời hạn gói tháng
        yearlyDuration: 12, // Thời hạn gói năm
        features: [],
        permissions: ['view'],
        maxUsers: 1,
        unlimitedUsers: false,
        maxRooms: 20,
        unlimitedRooms: false,
        qrPaymentFeature: false,
        otaManagementFeature: false,
        emailManagementFeature: false,
        electricManagementFeature: false,
        paypalPaymentFeature: false,
        cryptoPaymentFeature: false,
        draftInvoiceFeature: false,
        exportInvoiceFeature: false,
        aiChatboxFeature: false,
        hotelNotificationFeature: false,
        aiMonthlyQuota: 0,
        isActive: true
      });
      // Bật checkbox cho admin
      if (this.isAdmin) {
        this.packageForm.get('unlimitedRooms')?.enable({ emitEvent: false });
      }
    }
    this.syncMaxRoomsControls();
    this.isModalVisible = true;
  }

  handleCancel(): void {
    this.isModalVisible = false;
    this.packageForm.reset({
      name: '',
      description: '',
      monthlyPrice: 0,
      yearlyPrice: 0,
      yearlyDiscount: 0,
      isContactOnly: false,
      contactLabel: '',
      contactPhone: '',
      contactEmail: '',
      contactUrl: '',
      duration: 1, // Giữ lại để tương thích
      monthlyDuration: 1, // Thời hạn gói tháng
      yearlyDuration: 12, // Thời hạn gói năm
      features: [],
      permissions: ['view'],
      maxUsers: 1,
      unlimitedUsers: false,
      maxRooms: 20,
      unlimitedRooms: false,
      qrPaymentFeature: false,
      otaManagementFeature: false,
      emailManagementFeature: false,
      electricManagementFeature: false,
      paypalPaymentFeature: false,
      cryptoPaymentFeature: false,
      draftInvoiceFeature: false,
      exportInvoiceFeature: false,
      aiChatboxFeature: false,
      hotelNotificationFeature: false,
      aiMonthlyQuota: 0,
      isActive: true
    });
    this.syncMaxRoomsControls();
    this.editingPackageId = null;
  }

  private syncMaxRoomsControls(): void {
    const unlimitedRoomsControl = this.packageForm.get('unlimitedRooms');
    const maxRoomsControl = this.packageForm.get('maxRooms');
    if (!unlimitedRoomsControl || !maxRoomsControl) return;

    if (!this.isAdmin) {
      unlimitedRoomsControl.disable({ emitEvent: false });
      maxRoomsControl.disable({ emitEvent: false });
      return;
    }

    unlimitedRoomsControl.enable({ emitEvent: false });
    const unlimited = !!unlimitedRoomsControl.value;
    if (unlimited) {
      maxRoomsControl.disable({ emitEvent: false });
    } else {
      maxRoomsControl.enable({ emitEvent: false });
    }
  }

  handleOk(): void {
    if (this.packageForm.valid) {
      this.loading = true;
      const formData = this.packageForm.value;

      // Tính maxUsers/maxRooms:
      // - Superadmin: lấy từ form (cho phép chỉnh sửa)
      // - Khác: giữ nguyên giá trị gói đang sửa (nếu có), tránh bị set 1 mặc định khi controls bị disable
      const editingPkg = this.editingPackageId
        ? this.normalizePackageLimits(this.packages.find(p => p._id === this.editingPackageId || p.id === this.editingPackageId) || {})
        : {};
      const computeMaxUsers = () => {
        if (this.isSuperAdmin) {
          return (formData.unlimitedUsers || formData.maxUsers === 0) ? 0 : (formData.maxUsers >= 1 ? formData.maxUsers : 1);
        }
        const cur = editingPkg.maxUsers;
        return (cur === 0 || cur === null || cur === undefined) ? 0 : (cur >= 1 ? cur : 1);
      };
      const computeMaxRooms = () => {
        if (this.isAdmin) {
          return (formData.unlimitedRooms || formData.maxRooms === 0) ? 0 : (formData.maxRooms >= 1 ? formData.maxRooms : 1);
        }
        const cur = editingPkg.maxRooms;
        return (cur === 0 || cur === null || cur === undefined) ? 0 : (cur >= 1 ? cur : 1);
      };
      const maxUsers = computeMaxUsers();
      const maxRooms = computeMaxRooms();

      const payload: any = {
        ...formData,
        monthlyPrice: formData.isContactOnly ? 0 : formData.monthlyPrice,
        yearlyPrice: formData.isContactOnly ? 0 : formData.yearlyPrice,
        yearlyDiscount: formData.isContactOnly ? 0 : formData.yearlyDiscount,
        maxUsers: maxUsers,
        maxRooms: maxRooms,
        features: formData.features || [],
        permissions: formData.permissions || ['view'],
        // Nếu là superadmin, gửi monthlyDuration và yearlyDuration
        // Nếu không, giữ lại duration để tương thích
        ...(this.authService.isSuperAdmin() ? {
          monthlyDuration: formData.monthlyDuration || formData.duration || 1,
          yearlyDuration: formData.yearlyDuration || formData.duration || 12
        } : {
          duration: formData.duration || 1
        })
      };
      
      // Xóa unlimitedUsers khỏi payload vì không cần gửi lên backend
      delete payload.unlimitedUsers;
      delete payload.unlimitedRooms;

      if (this.editingPackageId) {
        this.pricingService.updatePackage(this.editingPackageId, payload).subscribe({
          next: (response) => {
            if (response.success) {
              this.message.success(response.message || this.translate.instant('PRICING_MANAGEMENT.MESSAGES.UPDATE_SUCCESS'));
              this.loadPackages();
              this.handleCancel();
            } else {
              this.message.error(response.message || this.translate.instant('PRICING_MANAGEMENT.MESSAGES.UPDATE_ERROR'));
            }
          },
          error: (error) => {
            this.message.error(error.error?.message || this.translate.instant('PRICING_MANAGEMENT.MESSAGES.UPDATE_ERROR'));
          },
          complete: () => {
            this.loading = false;
          }
        });
      } else {
        this.pricingService.createPackage(payload).subscribe({
          next: (response) => {
            if (response.success) {
              this.message.success(response.message || this.translate.instant('PRICING_MANAGEMENT.MESSAGES.CREATE_SUCCESS'));
              this.loadPackages();
              this.handleCancel();
            } else {
              this.message.error(response.message || this.translate.instant('PRICING_MANAGEMENT.MESSAGES.CREATE_ERROR'));
            }
          },
          error: (error) => {
            this.message.error(error.error?.message || this.translate.instant('PRICING_MANAGEMENT.MESSAGES.CREATE_ERROR'));
          },
          complete: () => {
            this.loading = false;
          }
        });
      }
    } else {
      Object.values(this.packageForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  deletePackage(packageId: string): void {
    this.modal.confirm({
      nzTitle: 'Xác nhận xóa',
      nzContent: 'Bạn có chắc chắn muốn xóa gói này? Hành động này không thể hoàn tác.',
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        this.loading = true;
        this.pricingService.deletePackage(packageId).subscribe({
          next: (response) => {
            if (response.success) {
              this.message.success(response.message || this.translate.instant('PRICING_MANAGEMENT.MESSAGES.DELETE_SUCCESS'));
              this.loadPackages();
            } else {
              this.message.error(response.message || this.translate.instant('PRICING_MANAGEMENT.MESSAGES.DELETE_ERROR'));
            }
          },
          error: (error) => {
            this.message.error(error.error?.message || this.translate.instant('PRICING_MANAGEMENT.MESSAGES.DELETE_ERROR'));
          },
          complete: () => {
            this.loading = false;
          }
        });
      }
    });
  }

  addFeature(): void {
    const features = this.packageForm.get('features')?.value || [];
    features.push('');
    this.packageForm.patchValue({ features });
  }

  removeFeature(index: number): void {
    const features = this.packageForm.get('features')?.value || [];
    features.splice(index, 1);
    this.packageForm.patchValue({ features });
  }

  updateFeature(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const features = this.packageForm.get('features')?.value || [];
    features[index] = input.value;
    this.packageForm.patchValue({ features });
  }

  addPermission(): void {
    const permissions = this.packageForm.get('permissions')?.value || [];
    permissions.push('');
    this.packageForm.patchValue({ permissions });
  }

  removePermission(index: number): void {
    const permissions = this.packageForm.get('permissions')?.value || [];
    permissions.splice(index, 1);
    this.packageForm.patchValue({ permissions });
  }

  updatePermission(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const permissions = this.packageForm.get('permissions')?.value || [];
    permissions[index] = input.value;
    this.packageForm.patchValue({ permissions });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(value);
  }

  contactPackage(pkg: any): void {
    const label = (pkg?.contactLabel || 'Liên hệ').toString().trim();
    const phone = (pkg?.contactPhone || '').toString().trim();
    const email = (pkg?.contactEmail || '').toString().trim();
    const url = (pkg?.contactUrl || '').toString().trim();

    if (url) {
      window.open(url, '_blank');
      return;
    }

    const lines: string[] = [];
    if (phone) lines.push(`SĐT: ${phone}`);
    if (email) lines.push(`Email: ${email}`);

    this.modal.info({
      nzTitle: label,
      nzContent: lines.length > 0 ? lines.join('<br/>') : 'Vui lòng liên hệ để được tư vấn gói này.',
      nzOkText: 'Đóng',
      nzMaskClosable: true
    });
  }

  onAdminSubscribe(packageId: string) {
    const userId = 'USER_ID_TEST'; // Thay bằng userId thực tế khi test
    this.pricingService.subscribe(userId, packageId).subscribe({
      next: (res) => {
        this.message.success(this.translate.instant('PRICING_MANAGEMENT.MESSAGES.SUBSCRIBE_SUCCESS'));
        this.loadSubscribers();
      },
      error: (err) => {
        this.message.error(this.translate.instant('PRICING_MANAGEMENT.MESSAGES.SUBSCRIBE_ERROR'));
      }
    });
  }

  subscribeToPackage(packageId: string, billingType: 'monthly' | 'yearly' = 'monthly'): void {
    if (!this.currentUser?._id) {
      this.message.error(this.translate.instant('PRICING_MANAGEMENT.MESSAGES.USER_NOT_FOUND'));
      return;
    }

    const selectedPackage = this.packages.find(p => (p._id === packageId || p.id === packageId));
    if (!selectedPackage) {
      this.message.error(this.translate.instant('PRICING_MANAGEMENT.MESSAGES.PACKAGE_NOT_FOUND'));
      return;
    }

    this.redirectToPricing(packageId, billingType);
  }

  upgradeOrDowngradePackage(packageId: string, billingType: 'monthly' | 'yearly' = 'monthly'): void {
    this.redirectToPricing(packageId, billingType);
  }

  private redirectToPricing(packageId: string, billingType: 'monthly' | 'yearly'): void {
    const target = `/pricing?packageId=${encodeURIComponent(packageId)}&billingType=${encodeURIComponent(billingType)}`;
    window.location.href = target;
  }

  canEditPackage(): boolean {
    return this.isAdmin;
  }

  canDeletePackage(): boolean {
    return this.isAdmin;
  }

  canCreatePackage(): boolean {
    return this.isAdmin;
  }

  applyRecommendedPreset(presetName: string | null): void {
    if (!presetName) {
      return;
    }
    const preset = this.recommendedPackages.find((p) => p.name === presetName);
    if (!preset) {
      return;
    }
    this.selectedPresetName = presetName;
    this.patchFormFromRecommended(preset);
  }

  private patchFormFromRecommended(preset: RecommendedPricingPackage): void {
    const unlimitedUsers = !preset.maxUsers;
    const unlimitedRooms = !preset.maxRooms;
    this.packageForm.patchValue({
      name: preset.name,
      description: preset.description,
      monthlyPrice: preset.monthlyPrice,
      yearlyPrice: preset.yearlyPrice,
      yearlyDiscount: preset.yearlyDiscount,
      isContactOnly: !!preset.isContactOnly,
      contactLabel: preset.contactLabel || (preset.isContactOnly ? 'Liên hệ' : ''),
      contactPhone: '',
      contactEmail: '',
      contactUrl: '',
      duration: preset.duration,
      monthlyDuration: preset.monthlyDuration,
      yearlyDuration: preset.yearlyDuration,
      features: [...(preset.features || [])],
      permissions: [...(preset.permissions || ['view'])],
      maxUsers: unlimitedUsers ? 0 : preset.maxUsers,
      unlimitedUsers,
      maxRooms: unlimitedRooms ? 0 : preset.maxRooms,
      unlimitedRooms,
      qrPaymentFeature: !!preset.qrPaymentFeature,
      otaManagementFeature: !!preset.otaManagementFeature,
      emailManagementFeature: !!preset.emailManagementFeature,
      electricManagementFeature: !!preset.electricManagementFeature,
      paypalPaymentFeature: !!preset.paypalPaymentFeature,
      cryptoPaymentFeature: !!preset.cryptoPaymentFeature,
      draftInvoiceFeature: !!preset.draftInvoiceFeature,
      exportInvoiceFeature: !!preset.exportInvoiceFeature,
      aiChatboxFeature: !!preset.aiChatboxFeature,
      hotelNotificationFeature: !!preset.hotelNotificationFeature,
      aiMonthlyQuota: Number(preset.aiMonthlyQuota) || 0,
      isActive: preset.isActive !== false
    });
    this.syncMaxRoomsControls();
  }

  private buildRecommendedPayload(preset: RecommendedPricingPackage): any {
    return {
      name: preset.name,
      description: preset.description,
      monthlyPrice: preset.monthlyPrice,
      yearlyPrice: preset.yearlyPrice,
      yearlyDiscount: preset.yearlyDiscount,
      isContactOnly: !!preset.isContactOnly,
      contactLabel: preset.contactLabel || (preset.isContactOnly ? 'Liên hệ' : ''),
      duration: preset.duration,
      monthlyDuration: preset.monthlyDuration,
      yearlyDuration: preset.yearlyDuration,
      features: [...(preset.features || [])],
      permissions: [...(preset.permissions || ['view'])],
      maxUsers: preset.maxUsers,
      maxRooms: preset.maxRooms,
      qrPaymentFeature: !!preset.qrPaymentFeature,
      otaManagementFeature: !!preset.otaManagementFeature,
      emailManagementFeature: !!preset.emailManagementFeature,
      electricManagementFeature: !!preset.electricManagementFeature,
      paypalPaymentFeature: !!preset.paypalPaymentFeature,
      cryptoPaymentFeature: !!preset.cryptoPaymentFeature,
      draftInvoiceFeature: !!preset.draftInvoiceFeature,
      exportInvoiceFeature: !!preset.exportInvoiceFeature,
      aiChatboxFeature: !!preset.aiChatboxFeature,
      hotelNotificationFeature: !!preset.hotelNotificationFeature,
      aiMonthlyQuota: Number(preset.aiMonthlyQuota) || 0,
      isActive: preset.isActive !== false
    };
  }

  syncRecommendedPackages(): void {
    if (!this.isAdmin) {
      return;
    }
    this.modal.confirm({
      nzTitle: this.translate.instant('PRICING_MANAGEMENT.SYNC_RECOMMENDED_CONFIRM_TITLE'),
      nzContent: this.translate.instant('PRICING_MANAGEMENT.SYNC_RECOMMENDED_CONFIRM_CONTENT'),
      nzOkText: this.translate.instant('PRICING_MANAGEMENT.SYNC_RECOMMENDED'),
      nzCancelText: 'Hủy',
      nzOnOk: () =>
        new Promise<void>((resolve) => {
          this.syncingRecommended = true;
          const existingByName = new Map(
            (this.packages || []).map((pkg: any) => [String(pkg?.name || '').trim().toLowerCase(), pkg])
          );

          const requests = this.recommendedPackages.map((preset) => {
            const payload = this.buildRecommendedPayload(preset);
            const existing = existingByName.get(preset.name.toLowerCase());
            const existingId = existing?._id || existing?.id;
            if (existingId) {
              return this.pricingService.updatePackage(String(existingId), payload).pipe(
                map(() => ({ status: 'updated' as const })),
                catchError(() => of({ status: 'failed' as const }))
              );
            }
            return this.pricingService.createPackage(payload as any).pipe(
              map(() => ({ status: 'created' as const })),
              catchError(() => of({ status: 'failed' as const }))
            );
          });

          forkJoin(requests).subscribe({
            next: (results) => {
              const created = results.filter((r) => r.status === 'created').length;
              const updated = results.filter((r) => r.status === 'updated').length;
              const failed = results.filter((r) => r.status === 'failed').length;
              this.syncingRecommended = false;
              this.loadPackages();
              if (failed > 0) {
                this.message.warning(
                  this.translate.instant('PRICING_MANAGEMENT.SYNC_RECOMMENDED_PARTIAL', {
                    created,
                    updated,
                    failed
                  })
                );
              } else {
                this.message.success(
                  this.translate.instant('PRICING_MANAGEMENT.SYNC_RECOMMENDED_SUCCESS', {
                    created,
                    updated
                  })
                );
              }
              resolve();
            },
            error: () => {
              this.syncingRecommended = false;
              this.message.error(this.translate.instant('PRICING_MANAGEMENT.SYNC_RECOMMENDED_ERROR'));
              resolve();
            }
          });
        })
    });
  }

  canViewSubscribers(): boolean {
    return this.isAdmin;
  }
  
  toggleAllFeatures(value: boolean): void {
    this.packageForm.patchValue({
      qrPaymentFeature: value,
      otaManagementFeature: value,
      emailManagementFeature: value,
      electricManagementFeature: value,
      paypalPaymentFeature: value,
      cryptoPaymentFeature: value,
      draftInvoiceFeature: value,
      exportInvoiceFeature: value,
      aiChatboxFeature: value,
      hotelNotificationFeature: value
    });
  }

  getAiOpenClawSummary(pkg: any): string {
    const parts: string[] = [];
    if (pkg?.aiChatboxFeature) {
      parts.push(this.translate.instant('PRICING_PAGE.OPENCLAW_HIGHLIGHTS.AI_CHATBOX'));
    }
    if (pkg?.features?.includes('fanpage_messages')) {
      parts.push(this.translate.instant('PRICING_PAGE.OPENCLAW_HIGHLIGHTS.FANPAGE'));
    }
    if (pkg?.features?.includes('zalo_messages')) {
      parts.push(this.translate.instant('PRICING_PAGE.OPENCLAW_HIGHLIGHTS.ZALO'));
    }
    if (pkg?.features?.includes('telegram_messages')) {
      parts.push(this.translate.instant('PRICING_PAGE.OPENCLAW_HIGHLIGHTS.TELEGRAM'));
    }
    return parts.join(' | ');
  }

  sendPaymentReminder(subscriber: any): void {
    if (!subscriber.userId) {
      this.message.error(this.translate.instant('PRICING_MANAGEMENT.MESSAGES.USER_NOT_FOUND'));
      return;
    }

    // Set loading state
    subscriber.sendingReminder = true;

    this.pricingService.sendPaymentReminder(subscriber.userId).subscribe({
      next: (response) => {
        if (response.success) {
          this.message.success(this.translate.instant('PRICING_MANAGEMENT.MESSAGES.SEND_NOTIFICATION_SUCCESS') + ' ' + subscriber.username);
        } else {
          this.message.error(response.message || this.translate.instant('PRICING_MANAGEMENT.MESSAGES.SEND_NOTIFICATION_ERROR'));
        }
        subscriber.sendingReminder = false;
      },
      error: (error) => {
        console.error('Error sending payment reminder:', error);
        this.message.error(error.error?.message || this.translate.instant('PRICING_MANAGEMENT.MESSAGES.SEND_NOTIFICATION_ERROR'));
        subscriber.sendingReminder = false;
      }
    });
  }

  cancelUserSubscription(): void {
    if (!this.currentUser?._id) {
      this.message.error(this.translate.instant('PRICING_MANAGEMENT.MESSAGES.USER_NOT_FOUND'));
      return;
    }
    this.message.warning(this.translate.instant('PRICING_MANAGEMENT.MESSAGES.CANCEL_NOT_ALLOWED_BEFORE_EXPIRY'));
  }

  getCurrentUserPackageId(): string {
    return String(this.currentUserPackage?._id || this.currentUserPackage?.id || '').trim();
  }

  isUserCurrentPackage(pkg: any): boolean {
    const packageId = String(pkg?._id || pkg?.id || '').trim();
    return !!packageId && packageId === this.getCurrentUserPackageId();
  }

  hasActiveCurrentPackage(): boolean {
    const expiryDate = this.currentUserPackage?.expiryDate || this.currentUserPackage?.packageExpiryDate;
    if (!expiryDate) {
      return false;
    }
    const expiry = new Date(expiryDate);
    return !Number.isNaN(expiry.getTime()) && expiry.getTime() > Date.now();
  }

  getCurrentPackageDisplayPrice(): number {
    if (!this.currentUserPackage) {
      return 0;
    }
    const isYearly = this.currentUserPackage?.billingType === 'yearly';
    if (isYearly) {
      return Number(this.currentUserPackage?.yearlyPrice || (this.currentUserPackage?.monthlyPrice || this.currentUserPackage?.price || 0) * 12 || 0);
    }
    return Number(this.currentUserPackage?.monthlyPrice || this.currentUserPackage?.price || 0);
  }

  getPackagePriceByBilling(pkg: any, billingType: 'monthly' | 'yearly'): number {
    if (!pkg || pkg.isContactOnly) {
      return 0;
    }
    if (billingType === 'yearly') {
      const yearlyPrice = Number(pkg.yearlyPrice || ((pkg.monthlyPrice || pkg.price || 0) * 12));
      const discount = Number(pkg.yearlyDiscount || 0);
      return Math.round(yearlyPrice * (1 - discount / 100));
    }
    return Number(pkg.monthlyPrice || pkg.price || 0);
  }

  getUpgradeDelta(pkg: any, billingType: 'monthly' | 'yearly'): number {
    const targetPrice = this.getPackagePriceByBilling(pkg, billingType);
    const currentPrice = this.hasActiveCurrentPackage() ? this.getCurrentPackageDisplayPrice() : 0;
    return Math.max(0, targetPrice - currentPrice);
  }

  isDowngradeBlocked(pkg: any, billingType: 'monthly' | 'yearly'): boolean {
    if (!this.hasActiveCurrentPackage() || !this.currentUserPackage) {
      return false;
    }
    const targetPrice = this.getPackagePriceByBilling(pkg, billingType);
    const currentPrice = this.getCurrentPackageDisplayPrice();
    return currentPrice > 0 && targetPrice <= currentPrice && !this.isUserCurrentPackage(pkg);
  }

  getPackageActionLabel(pkg: any, billingType: 'monthly' | 'yearly'): string {
    if (this.isUserCurrentPackage(pkg)) {
      return this.translate.instant('PRICING_MANAGEMENT.CURRENT_PLAN');
    }
    if (this.isDowngradeBlocked(pkg, billingType)) {
      return this.translate.instant('PRICING_MANAGEMENT.WAIT_UNTIL_EXPIRY');
    }
    if (this.hasActiveCurrentPackage() && this.getUpgradeDelta(pkg, billingType) > 0) {
      return this.translate.instant('PRICING_MANAGEMENT.UPGRADE_PAY_DIFF', {
        amount: this.formatCurrency(this.getUpgradeDelta(pkg, billingType))
      });
    }
    return this.translate.instant(
      billingType === 'yearly'
        ? 'PRICING_MANAGEMENT.SUBSCRIBE_YEARLY'
        : 'PRICING_MANAGEMENT.SUBSCRIBE_MONTHLY'
    );
  }

  isUnlimitedUsers(pkg: any): boolean {
    return this.getDisplayMaxUsers(pkg) === 0;
  }

  getDisplayMaxUsers(pkg: any): number {
    const normalizedPkg = this.normalizePackageLimits(pkg);
    const maxUsers = normalizedPkg?.maxUsers;
    return maxUsers === null || maxUsers === undefined ? 0 : maxUsers;
  }

  isUnlimitedSubscriber(subscriber: any): boolean {
    return this.getSubscriberDisplayMaxUsers(subscriber) === 0;
  }

  getSubscriberDisplayMaxUsers(subscriber: any): number {
    const normalizedSubscriber = this.normalizeSubscriberLimits(subscriber);
    const maxUsers = normalizedSubscriber?.maxUsers;
    return maxUsers === null || maxUsers === undefined ? 0 : maxUsers;
  }

  private normalizePackageLimits(pkg: any): any {
    if (!pkg) {
      return pkg;
    }

    const isFree = this.isFreePackage(pkg);
    const rawMaxUsers = pkg.maxUsers;
    const normalizedMaxUsers = isFree && (rawMaxUsers === null || rawMaxUsers === undefined || rawMaxUsers === 0)
      ? 1
      : rawMaxUsers;

    return {
      ...pkg,
      isFree,
      maxUsers: normalizedMaxUsers
    };
  }

  private normalizeSubscriberLimits(subscriber: any): any {
    if (!subscriber) {
      return subscriber;
    }

    const packageName = String(subscriber.packageName || '').trim().toUpperCase();
    const isFreeSubscriber =
      packageName === 'FREE' ||
      packageName === 'DÙNG THỬ' ||
      packageName === 'DUNG THU' ||
      packageName.includes('THỬ') ||
      packageName.includes('TRIAL');
    const rawMaxUsers = subscriber.maxUsers;
    // Chỉ coi 0 là không giới hạn; null/undefined với gói free/trial lấy từ gói (fallback 2)
    let normalizedMaxUsers = rawMaxUsers;
    if (rawMaxUsers === null || rawMaxUsers === undefined) {
      normalizedMaxUsers = isFreeSubscriber ? 2 : 0;
    }

    return {
      ...subscriber,
      maxUsers: normalizedMaxUsers
    };
  }

  private isFreePackage(pkg: any): boolean {
    if (!pkg || pkg.isContactOnly) {
      return false;
    }

    const monthlyPrice = Number(pkg.monthlyPrice ?? pkg.price ?? 0);
    const yearlyPrice = Number(pkg.yearlyPrice ?? (pkg.price ? pkg.price * 12 : 0));
    const packageName = String(pkg.name || '').trim().toUpperCase();

    return packageName === 'FREE' || (monthlyPrice === 0 && yearlyPrice === 0);
  }
} 
