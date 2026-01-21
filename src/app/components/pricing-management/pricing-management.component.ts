import { Component, OnInit } from '@angular/core';
import { PricingService } from '../../services/pricing.service';
import { AuthService } from '../../services/auth.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { formatCurrency } from '@angular/common';
import { PermissionFeature } from '../../services/permission.service';
import { TranslateService } from '@ngx-translate/core';

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
  qrPaymentFeature?: boolean; // Tính năng QR thanh toán
  otaManagementFeature?: boolean; // Tính năng quản lý OTA
  emailManagementFeature?: boolean; // Tính năng quản lý email
  electricManagementFeature?: boolean; // Tính năng quản lý điện
  paypalPaymentFeature?: boolean; // Tính năng thanh toán PayPal
  cryptoPaymentFeature?: boolean; // Tính năng thanh toán Crypto
  draftInvoiceFeature?: boolean; // Tính năng xem hóa đơn nháp
  exportInvoiceFeature?: boolean; // Tính năng xuất hóa đơn
  aiChatboxFeature?: boolean; // Tính năng AI Chatbox
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

  numberFormatter = (value: number): string => {
    if (!value) return '0';
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

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
    // Initialize availableFeatures
    this.availableFeatures.push(
      { value: 'room_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.ROOM_MANAGEMENT') },
      { value: 'hotel_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.HOTEL_MANAGEMENT') },
      { value: 'company_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.COMPANY_MANAGEMENT') },
      { value: 'staff_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.STAFF_MANAGEMENT') },
      { value: 'service_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.SERVICE_MANAGEMENT') },
      { value: 'user_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.USER_MANAGEMENT') },
      { value: 'pricing_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.PRICING_MANAGEMENT') },
      { value: 'ota_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.OTA_MANAGEMENT') },
      { value: 'revenue_chart', label: this.translate.instant('USER_MANAGEMENT.FEATURES.REVENUE_CHART') },
      { value: 'shift_handover', label: this.translate.instant('USER_MANAGEMENT.FEATURES.SHIFT_HANDOVER') },
      { value: 'bank_transfer_history', label: this.translate.instant('USER_MANAGEMENT.FEATURES.BANK_TRANSFER_HISTORY') },
      { value: 'calendar', label: this.translate.instant('USER_MANAGEMENT.FEATURES.CALENDAR') },
      { value: 'email_admin', label: this.translate.instant('USER_MANAGEMENT.FEATURES.EMAIL_ADMIN') },
      { value: 'qr_payment', label: this.translate.instant('USER_MANAGEMENT.FEATURES.QR_PAYMENT') },
      { value: 'visa_payment', label: this.translate.instant('USER_MANAGEMENT.FEATURES.VISA_PAYMENT') },
      { value: 'electric_management', label: this.translate.instant('USER_MANAGEMENT.FEATURES.ELECTRIC_MANAGEMENT') }
    );
  }

  initForm(): void {
    this.packageForm = this.fb.group({
      name: ['', [Validators.required]],
      description: ['', [Validators.required]],
      monthlyPrice: [0, [Validators.required, Validators.min(0)]],
      yearlyPrice: [0, [Validators.required, Validators.min(0)]],
      yearlyDiscount: [0, [Validators.min(0), Validators.max(100)]],
      duration: [1, [Validators.required, Validators.min(1)]], // Giữ lại để tương thích
      monthlyDuration: [1, [Validators.required, Validators.min(1)]], // Thời hạn gói tháng (tháng)
      yearlyDuration: [12, [Validators.required, Validators.min(1)]], // Thời hạn gói năm (tháng)
      features: [[]],
      permissions: [['view'], [Validators.required]],
      maxUsers: [1, [Validators.required, Validators.min(0)]], // Cho phép nhập 0 (0 = không giới hạn ở backend)
      unlimitedUsers: [false], // Checkbox để chọn không giới hạn (0 = không giới hạn ở backend)
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
      isActive: [true]
    });
    
    // Theo dõi thay đổi của unlimitedUsers
    this.packageForm.get('unlimitedUsers')?.valueChanges.subscribe(unlimited => {
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
      const unlimitedUsersControl = this.packageForm.get('unlimitedUsers');
      if (value === 0 && !unlimitedUsersControl?.disabled) {
        // Nếu nhập 0 và checkbox chưa bị disable (tức là đang enable), tự động check
        unlimitedUsersControl?.setValue(true, { emitEvent: false });
      } else if (value > 0 && unlimitedUsersControl?.value) {
        // Nếu nhập giá trị > 0 và checkbox đang được check, bỏ check
        unlimitedUsersControl?.setValue(false, { emitEvent: false });
      }
    });
  }

  loadPackages(): void {
    this.loading = true;
    this.pricingService.getAllPackages().subscribe({
      next: (response) => {
        this.packages = response.data || [];
        
        // Đánh dấu gói free (giá = 0) bằng cách thêm flag isFree
        this.packages = this.packages.map((pkg: any) => ({
          ...pkg,
          isFree: (pkg.monthlyPrice === 0 && pkg.yearlyPrice === 0) || 
                  (pkg.monthlyPrice === 0 && !pkg.yearlyPrice)
        }));
        
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
        const packageData = response.data || response;
        if (packageData && packageData._id) {
          this.currentUserPackage = packageData;
          this.packages = [packageData]; // Chỉ hiển thị gói của user
        } else {
          this.packages = [];
          this.currentUserPackage = null;
        }
        this.loading = false;
      },
      error: (error) => {
        if (error.status !== 404) {
          this.message.error(this.translate.instant('PRICING_MANAGEMENT.MESSAGES.LOAD_USER_PACKAGE_ERROR'));
        }
        this.packages = [];
        this.currentUserPackage = null;
        this.loading = false;
      }
    });
  }

  loadSubscribers(): void {
    this.loading = true;
    this.pricingService.getAllSubscribers().subscribe({
      next: (response) => {
        this.subscribers = response.data || [];
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
    if (packageId) {
      const pkg = this.packages.find(p => p._id === packageId || p.id === packageId);
      if (pkg) {
        // Backend: 0 hoặc null = không giới hạn
        const isUnlimited = pkg.maxUsers === 0 || pkg.maxUsers === null || pkg.maxUsers === undefined;
        this.packageForm.patchValue({
          name: pkg.name,
          description: pkg.description,
          monthlyPrice: pkg.monthlyPrice || pkg.price || 0,
          yearlyPrice: pkg.yearlyPrice || (pkg.price ? pkg.price * 12 : 0),
          yearlyDiscount: pkg.yearlyDiscount || 0,
          duration: pkg.duration || 1, // Giữ lại để tương thích
          monthlyDuration: pkg.monthlyDuration || pkg.duration || 1, // Thời hạn gói tháng
          yearlyDuration: pkg.yearlyDuration || pkg.duration || 12, // Thời hạn gói năm
          features: pkg.features || [],
          permissions: pkg.permissions || ['view'],
          // Hiển thị: nếu không giới hạn thì hiển thị 0 (để người dùng có thể thấy và chỉnh sửa)
          // Nếu có giới hạn thì hiển thị giá trị thực
          maxUsers: isUnlimited ? 0 : (pkg.maxUsers >= 1 ? pkg.maxUsers : 1),
          unlimitedUsers: isUnlimited,
          qrPaymentFeature: pkg.qrPaymentFeature || false,
          otaManagementFeature: pkg.otaManagementFeature || false,
          emailManagementFeature: pkg.emailManagementFeature || false,
          electricManagementFeature: pkg.electricManagementFeature || false,
          paypalPaymentFeature: pkg.paypalPaymentFeature || false,
          cryptoPaymentFeature: pkg.cryptoPaymentFeature || false,
          draftInvoiceFeature: pkg.draftInvoiceFeature || false,
          exportInvoiceFeature: pkg.exportInvoiceFeature || false,
          aiChatboxFeature: pkg.aiChatboxFeature || false,
          isActive: pkg.isActive
        });
      }
    } else {
      this.packageForm.reset({
        name: '',
        description: '',
        monthlyPrice: 0,
        yearlyPrice: 0,
        yearlyDiscount: 0,
        duration: 1, // Giữ lại để tương thích
        monthlyDuration: 1, // Thời hạn gói tháng
        yearlyDuration: 12, // Thời hạn gói năm
        features: [],
        permissions: ['view'],
        maxUsers: 1,
        unlimitedUsers: false,
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
        isActive: true
      });
    }
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
      duration: 1, // Giữ lại để tương thích
      monthlyDuration: 1, // Thời hạn gói tháng
      yearlyDuration: 12, // Thời hạn gói năm
      features: [],
      permissions: ['view'],
      maxUsers: 1,
      unlimitedUsers: false,
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
      isActive: true
    });
    this.editingPackageId = null;
  }

  handleOk(): void {
    if (this.packageForm.valid) {
      this.loading = true;
      const formData = this.packageForm.value;

      // Nếu unlimitedUsers được chọn hoặc maxUsers = 0, gửi 0 lên backend (đại diện cho không giới hạn)
      // Nếu không, gửi giá trị thực (phải >= 1)
      const maxUsers = (formData.unlimitedUsers || formData.maxUsers === 0) ? 0 : (formData.maxUsers >= 1 ? formData.maxUsers : 1);

      const payload: any = {
        ...formData,
        maxUsers: maxUsers,
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

    // Non-admin chỉ có thể đăng ký cho chính mình
    const selectedPackage = this.packages.find(p => (p._id === packageId || p.id === packageId));
    const packageName = selectedPackage?.name || 'gói này';
    
    this.modal.confirm({
      nzTitle: 'Xác nhận đăng ký',
      nzContent: `Bạn có chắc chắn muốn đăng ký ${packageName} ${billingType === 'yearly' ? 'theo năm' : 'theo tháng'}?`,
      nzOkText: 'Đăng ký',
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        this.loading = true;
        // Non-admin chỉ có thể subscribe cho chính mình
        this.pricingService.subscribe(this.currentUser._id, packageId, billingType).subscribe({
          next: (response) => {
            if (response.success) {
              this.message.success(response.message || 'Đăng ký gói thành công');
              this.loadPackages();
              this.loadCurrentUserPackage();
            } else {
              this.message.error(response.message || 'Đăng ký gói thất bại');
            }
            this.loading = false;
          },
          error: (error) => {
            this.message.error(error.error?.message || 'Đăng ký gói thất bại');
            this.loading = false;
          }
        });
      }
    });
  }

  upgradeOrDowngradePackage(packageId: string, billingType: 'monthly' | 'yearly' = 'monthly'): void {
    if (!this.currentUser?._id) {
      this.message.error(this.translate.instant('PRICING_MANAGEMENT.MESSAGES.USER_NOT_FOUND'));
      return;
    }

    if (!this.currentUserPackage) {
      this.message.warning(this.translate.instant('PRICING_MANAGEMENT.MESSAGES.NO_PACKAGE_SUBSCRIBED'));
      return;
    }

    const selectedPackage = this.packages.find(p => (p._id === packageId || p.id === packageId));
    if (!selectedPackage) {
      this.message.error(this.translate.instant('PRICING_MANAGEMENT.MESSAGES.PACKAGE_NOT_FOUND'));
      return;
    }

    const currentPackageId = this.currentUserPackage._id || this.currentUserPackage.id;
    const isUpgrade = selectedPackage.monthlyPrice > (this.currentUserPackage.monthlyPrice || 0);
    const isDowngrade = selectedPackage.monthlyPrice < (this.currentUserPackage.monthlyPrice || 0);
    const isSamePackage = currentPackageId === packageId;
    
    let actionType: 'update' | 'upgrade' | 'downgrade' = 'update';
    if (isSamePackage && this.currentUserPackage.billingType !== billingType) {
      actionType = 'update';
    } else if (isUpgrade) {
      actionType = 'upgrade';
    } else if (isDowngrade) {
      actionType = 'downgrade';
    }

    const billingTypeText = billingType === 'yearly' 
      ? this.translate.instant('PRICING_MANAGEMENT.MESSAGES.YEARLY')
      : this.translate.instant('PRICING_MANAGEMENT.MESSAGES.MONTHLY');

    let titleKey = 'PRICING_MANAGEMENT.MESSAGES.CONFIRM_UPDATE_TITLE';
    let contentKey = 'PRICING_MANAGEMENT.MESSAGES.CONFIRM_UPDATE_CONTENT';
    let okTextKey = 'PRICING_MANAGEMENT.MESSAGES.UPDATE';

    if (actionType === 'upgrade') {
      titleKey = 'PRICING_MANAGEMENT.MESSAGES.CONFIRM_UPGRADE_TITLE';
      contentKey = 'PRICING_MANAGEMENT.MESSAGES.CONFIRM_UPGRADE_CONTENT';
      okTextKey = 'PRICING_MANAGEMENT.MESSAGES.UPGRADE';
    } else if (actionType === 'downgrade') {
      titleKey = 'PRICING_MANAGEMENT.MESSAGES.CONFIRM_DOWNGRADE_TITLE';
      contentKey = 'PRICING_MANAGEMENT.MESSAGES.CONFIRM_DOWNGRADE_CONTENT';
      okTextKey = 'PRICING_MANAGEMENT.MESSAGES.DOWNGRADE';
    }

    this.modal.confirm({
      nzTitle: this.translate.instant(titleKey),
      nzContent: `${this.translate.instant(contentKey)} ${selectedPackage.name} ${billingTypeText}?`,
      nzOkText: this.translate.instant(okTextKey),
      nzCancelText: this.translate.instant('COMMON.CANCEL'),
      nzOnOk: () => {
        this.loading = true;
        // Non-admin chỉ có thể subscribe cho chính mình (nâng cấp/hạ cấp cũng là subscribe)
        this.pricingService.subscribe(this.currentUser._id, packageId, billingType).subscribe({
          next: (response) => {
            if (response.success) {
              this.message.success(response.message || this.translate.instant('PRICING_MANAGEMENT.MESSAGES.UPGRADE_DOWNGRADE_SUCCESS'));
              this.loadPackages();
              this.loadCurrentUserPackage();
            } else {
              this.message.error(response.message || this.translate.instant('PRICING_MANAGEMENT.MESSAGES.UPGRADE_DOWNGRADE_ERROR'));
            }
            this.loading = false;
          },
          error: (error) => {
            this.message.error(error.error?.message || this.translate.instant('PRICING_MANAGEMENT.MESSAGES.UPGRADE_DOWNGRADE_ERROR'));
            this.loading = false;
          }
        });
      }
    });
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
} 
