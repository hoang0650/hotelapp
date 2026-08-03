import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { UserService } from '../../services/user.service';
import { AuthService, PermissionRules } from '../../services/auth.service';
import { User } from '../../interfaces/user';
import { PermissionFeature } from '../../services/permission.service';
import { TranslateService } from '@ngx-translate/core';

type UserRole = 'superadmin' | 'admin' | 'business' | 'hotel' | 'staff' | 'guest';
type UserStatus = 'active' | 'inactive' | 'suspended' | 'deleted';

@Component({
  selector: 'app-user-management',
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.css']
})
export class UserManagementComponent implements OnInit {
  users: User[] = [];
  filteredUsers: User[] = [];
  isLoading = false;
  isVisible = false;
  userForm!: FormGroup;
  selectedUser: User | null = null;
  editingUser: User | null = null;
  currentUser: User | null = null;
  permissions: PermissionRules | null = null;
  
  // Pagination
  total = 0;
  pageSize = 10;
  pageIndex = 1;
  
  // Filters
  selectedRoleFilter: UserRole | 'all' = 'all';
  selectedStatusFilter: UserStatus | 'all' = 'all';
  searchText = '';
  passwordVisible = false;
  
  // Available features (tương tự pricing-management)
  availableFeatures: { value: PermissionFeature; label: string }[] = [];
  
  // Feature flags (tương tự pricing-management)
  availableFeatureFlags: { value: string; label: string; description: string }[] = [];

  // Role và Status options
  readonly userRoles: { label: string; value: UserRole }[] = [];
  readonly userStatuses: { label: string; value: UserStatus }[] = [];

  // Roles mà user hiện tại có thể quản lý
  manageableRoles: { label: string; value: UserRole }[] = [];

  constructor(
    private userService: UserService,
    private authService: AuthService,
    private fb: FormBuilder,
    private message: NzMessageService,
    private modal: NzModalService,
    private translate: TranslateService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.permissions = this.authService.getPermissionRules();
    this.initTranslationArrays();
    this.setupManageableRoles();
    this.loadUsers();
  }

  private initTranslationArrays(): void {
    // Initialize userRoles
    this.userRoles.push(
      { label: this.translate.instant('USER_MANAGEMENT.ROLES.SUPERADMIN'), value: 'superadmin' },
      { label: this.translate.instant('USER_MANAGEMENT.ROLES.ADMIN'), value: 'admin' },
      { label: this.translate.instant('USER_MANAGEMENT.ROLES.BUSINESS'), value: 'business' },
      { label: this.translate.instant('USER_MANAGEMENT.ROLES.HOTEL'), value: 'hotel' },
      { label: this.translate.instant('USER_MANAGEMENT.ROLES.STAFF'), value: 'staff' },
      { label: this.translate.instant('USER_MANAGEMENT.ROLES.GUEST'), value: 'guest' }
    );

    // Initialize userStatuses
    this.userStatuses.push(
      { label: this.translate.instant('USER_MANAGEMENT.STATUSES.ACTIVE'), value: 'active' },
      { label: this.translate.instant('USER_MANAGEMENT.STATUSES.INACTIVE'), value: 'inactive' },
      { label: this.translate.instant('USER_MANAGEMENT.STATUSES.SUSPENDED'), value: 'suspended' },
      { label: this.translate.instant('USER_MANAGEMENT.STATUSES.DELETED'), value: 'deleted' }
    );

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

    // Initialize availableFeatureFlags
    this.availableFeatureFlags.push(
      { value: 'qrPaymentFeature', label: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.QR_PAYMENT'), description: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.QR_PAYMENT_DESC') },
      { value: 'otaManagementFeature', label: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.OTA_MANAGEMENT'), description: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.OTA_MANAGEMENT_DESC') },
      { value: 'emailManagementFeature', label: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.EMAIL_MANAGEMENT'), description: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.EMAIL_MANAGEMENT_DESC') },
      { value: 'electricManagementFeature', label: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.ELECTRIC_MANAGEMENT'), description: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.ELECTRIC_MANAGEMENT_DESC') },
      { value: 'paypalPaymentFeature', label: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.PAYPAL_PAYMENT'), description: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.PAYPAL_PAYMENT_DESC') },
      { value: 'cryptoPaymentFeature', label: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.CRYPTO_PAYMENT'), description: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.CRYPTO_PAYMENT_DESC') },
      { value: 'draftInvoiceFeature', label: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.DRAFT_INVOICE'), description: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.DRAFT_INVOICE_DESC') },
      { value: 'exportInvoiceFeature', label: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.EXPORT_INVOICE'), description: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.EXPORT_INVOICE_DESC') },
      { value: 'aiChatboxFeature', label: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.AI_CHATBOX'), description: this.translate.instant('USER_MANAGEMENT.FEATURE_FLAGS.AI_CHATBOX_DESC') }
    );
  }

  // ============ QUYỀN HẠN ============
  // Phân quyền theo cấp bậc: superadmin > admin > business > hotel > staff
  // Tương tự như pricing-management component

  get isAdmin(): boolean {
    return this.authService.isSuperAdmin() || this.authService.isAdmin();
  }

  get isSuperAdmin(): boolean {
    return this.authService.isSuperAdmin();
  }

  get isBusiness(): boolean {
    return this.authService.isBusiness();
  }

  get isHotelManager(): boolean {
    return this.authService.isHotelManager();
  }

  get canManageUsers(): boolean {
    // Chỉ admin (superadmin + admin) mới có thể quản lý users
    return this.isAdmin;
  }

  get canCreateUser(): boolean {
    // Chỉ admin (superadmin + admin) mới có thể tạo user mới
    // Business và Hotel Manager KHÔNG thể tạo user, chỉ xem
    return this.isAdmin;
  }

  get canEditUser(): boolean {
    // Chỉ admin (superadmin + admin) mới có thể chỉnh sửa user
    return this.isAdmin;
  }

  get canDeleteUserPermission(): boolean {
    // Chỉ admin (superadmin + admin) mới có thể xóa user
    return this.isAdmin;
  }

  /**
   * Setup roles mà user hiện tại có thể xem (filter)
   * - Superadmin: tất cả roles
   * - Admin: tất cả trừ superadmin
   * - Business: chỉ hotel, staff (chỉ xem, không quản lý)
   * - Hotel: chỉ staff (chỉ xem, không quản lý)
   */
  private setupManageableRoles(): void {
    if (this.isSuperAdmin) {
      this.manageableRoles = this.userRoles;
    } else if (this.isAdmin) {
      this.manageableRoles = this.userRoles.filter(r => r.value !== 'superadmin');
    } else if (this.isBusiness) {
      // Business chỉ xem hotel và staff, không quản lý
      this.manageableRoles = this.userRoles.filter(r => 
        r.value === 'hotel' || r.value === 'staff'
      );
    } else if (this.isHotelManager) {
      // Hotel manager chỉ xem staff, không quản lý
      this.manageableRoles = this.userRoles.filter(r => r.value === 'staff');
    } else {
      this.manageableRoles = [];
    }
  }

  /**
   * Kiểm tra có thể quản lý user cụ thể không
   * - Superadmin: Quản lý tất cả users bao gồm admin (có thể chỉnh sửa role, khóa, xóa admin)
   * - Admin: Quản lý tất cả users trừ superadmin (không thể xem/quản lý superadmin)
   * - Business: KHÔNG được phép quản lý người dùng
   */
  canManageUser(user: User): boolean {
    if (!this.currentUser) return false;
    
    // Business không được phép quản lý người dùng
    if (this.isBusiness || this.isHotelManager) {
      return false;
    }
    
    // Superadmin quản lý tất cả users (bao gồm admin, có thể chỉnh sửa role, khóa, xóa)
    if (this.isSuperAdmin) {
      return true; // Superadmin có thể quản lý tất cả, kể cả admin
    }
    
    // Admin quản lý tất cả users trừ superadmin
    if (this.authService.isAdmin() && !this.isSuperAdmin) {
      return user.role !== 'superadmin';
    }
    
    return false;
  }

  /**
   * Kiểm tra có thể block user không
   * - Superadmin: có thể block tất cả users (bao gồm admin)
   * - Admin: có thể block tất cả users trừ superadmin
   */
  canBlockUser(user: User): boolean {
    if (!this.isAdmin) return false;
    if (!this.canManageUser(user)) return false;
    
    // Superadmin có thể block tất cả
    if (this.isSuperAdmin) {
      return true;
    }
    
    // Admin không thể block superadmin
    return user.role !== 'superadmin';
  }

  /**
   * Kiểm tra có thể xóa user không
   * - Superadmin: có thể xóa tất cả users (bao gồm admin)
   * - Admin: có thể xóa tất cả users trừ superadmin và không thể tự xóa chính mình
   */
  canDeleteUser(user: User): boolean {
    if (!this.isAdmin) return false;
    if (!this.canManageUser(user)) return false;
    
    // Không thể tự xóa chính mình
    if (user._id === this.currentUser?._id) {
      return false;
    }
    
    // Superadmin có thể xóa tất cả (bao gồm admin)
    if (this.isSuperAdmin) {
      return true;
    }
    
    // Admin không thể xóa superadmin
    return user.role !== 'superadmin';
  }

  // ============ FORM ============

  private initForm(): void {
    this.userForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      fullName: [''],
      phone: [''],
      role: ['staff', Validators.required],
      status: ['active', Validators.required],
      password: [''],
      twoFactorEnabled: [false],
      businessId: [''],
      hotelId: [''],
      permissions: [[]],
      // Tính năng (features) - tương tự pricing-management
      features: [[]],
      // Feature flags - tương tự pricing-management
      qrPaymentFeature: [false],
      otaManagementFeature: [false],
      emailManagementFeature: [false],
      electricManagementFeature: [false],
      paypalPaymentFeature: [false],
      cryptoPaymentFeature: [false],
      draftInvoiceFeature: [false],
      exportInvoiceFeature: [false],
      aiChatboxFeature: [false],
      preferences: this.fb.group({
        language: ['vi'],
        theme: ['light'],
        notifications: this.fb.group({
          email: [true],
          sms: [false],
          push: [true]
        })
      })
    });
  }

  // ============ LOAD DATA ============

  loadUsers(): void {
    this.isLoading = true;
    
    // Chỉ superadmin và admin mới được phép quản lý người dùng
    // Business không được phép quản lý người dùng
    if (this.isAdmin) {
      // Admin load users (backend sẽ filter: superadmin xem tất cả, admin không xem superadmin)
      this.userService.getAllUsers().subscribe({
        next: (users) => this.handleUsersLoaded(users),
        error: (error) => this.handleError('Không thể tải danh sách người dùng', error)
      });
    } else {
      // Business và các role khác không được phép quản lý người dùng
      this.users = [];
      this.filteredUsers = [];
      this.isLoading = false;
      this.message.warning(this.translate.instant('USER_MANAGEMENT.MESSAGES.NO_PERMISSION'));
    }
  }

  private handleUsersLoaded(users: User[]): void {
    // Backend đã filter đúng, nhưng đảm bảo frontend cũng filter lại để chắc chắn
    // Superadmin: xem tất cả users (bao gồm admin)
    // Admin: không xem superadmin (backend đã filter, nhưng frontend cũng filter lại để chắc chắn)
    if (this.isSuperAdmin) {
      // Superadmin xem tất cả
      this.users = users;
    } else if (this.authService.isAdmin() && !this.isSuperAdmin) {
      // Admin không xem superadmin
      this.users = users.filter(user => user.role !== 'superadmin');
    } else {
      this.users = users;
    }
    this.applyFilters();
    this.isLoading = false;
  }

  private handleError(message: string, error: any): void {
    console.error(message, error);
    this.message.error(message);
    this.isLoading = false;
  }

  // ============ FILTERS ============

  applyFilters(): void {
    let result = [...this.users];
    
    // Filter by role
    if (this.selectedRoleFilter !== 'all') {
      result = result.filter(u => u.role === this.selectedRoleFilter);
    }
    
    // Filter by status
    if (this.selectedStatusFilter !== 'all') {
      result = result.filter(u => u.status === this.selectedStatusFilter);
    }
    
    // Search by username or email
    if (this.searchText.trim()) {
      const search = this.searchText.toLowerCase().trim();
      result = result.filter(u => 
        u.username.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search) ||
        (u.fullName && u.fullName.toLowerCase().includes(search))
      );
    }
    
    this.filteredUsers = result;
    this.total = result.length;
  }

  onRoleFilterChange(role: UserRole | 'all'): void {
    this.selectedRoleFilter = role;
    this.pageIndex = 1;
    this.applyFilters();
  }

  onStatusFilterChange(status: UserStatus | 'all'): void {
    this.selectedStatusFilter = status;
    this.pageIndex = 1;
    this.applyFilters();
  }

  onSearchChange(): void {
    this.pageIndex = 1;
    this.applyFilters();
  }

  clearFilters(): void {
    this.selectedRoleFilter = 'all';
    this.selectedStatusFilter = 'all';
    this.searchText = '';
    this.applyFilters();
  }

  // ============ PAGINATION ============

  onPageIndexChange(index: number): void {
    this.pageIndex = index;
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.pageIndex = 1;
  }

  // ============ MODAL ============

  showCreateModal(): void {
    if (!this.canCreateUser) {
      this.message.warning(this.translate.instant('USER_MANAGEMENT.MESSAGES.NO_CREATE_PERMISSION'));
      return;
    }
    
    this.editingUser = null;
    this.selectedUser = null;
    this.isVisible = true;
    this.userForm.reset({
      role: 'staff',
      status: 'active',
      twoFactorEnabled: false,
      preferences: {
        language: 'vi',
        theme: 'light',
        notifications: { email: true, sms: false, push: true }
      }
    });
    this.userForm.get('password')?.setValidators([Validators.required, Validators.minLength(6)]);
    this.userForm.get('password')?.updateValueAndValidity();
    
    // Chỉ admin mới có thể tạo user, không cần auto-set businessId/hotelId
    // Admin sẽ tự chọn businessId/hotelId khi tạo
  }

  showEditModal(user: User): void {
    if (!this.canManageUser(user)) {
      this.message.warning(this.translate.instant('USER_MANAGEMENT.MESSAGES.NO_EDIT_PERMISSION'));
      return;
    }
    
    this.editingUser = user;
    this.selectedUser = user;
    this.isVisible = true;
    
    this.userForm.patchValue({
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      status: user.status,
      twoFactorEnabled: user.twoFactorEnabled,
      businessId: user.businessId,
      hotelId: user.hotelId,
      permissions: user.permissions || [],
      // Tính năng (features) - từ user hoặc từ pricing package
      features: user.features || [],
      // Feature flags - từ user hoặc từ pricing package
      qrPaymentFeature: user.qrPaymentFeature || false,
      otaManagementFeature: user.otaManagementFeature || false,
      emailManagementFeature: user.emailManagementFeature || false,
      electricManagementFeature: user.electricManagementFeature || false,
      paypalPaymentFeature: user.paypalPaymentFeature || false,
      cryptoPaymentFeature: user.cryptoPaymentFeature || false,
      draftInvoiceFeature: user.draftInvoiceFeature || false,
      exportInvoiceFeature: user.exportInvoiceFeature || false,
      aiChatboxFeature: user.aiChatboxFeature || false,
      preferences: user.preferences || {
        language: 'vi',
        theme: 'light',
        notifications: { email: true, sms: false, push: true }
      }
    });
    
    // Password không bắt buộc khi edit
    this.userForm.get('password')?.clearValidators();
    this.userForm.get('password')?.updateValueAndValidity();
  }

  handleOk(): void {
    if (this.userForm.invalid) {
      Object.values(this.userForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsTouched();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      return;
    }

    const formValue = this.userForm.value;
    
    // Lọc bỏ các giá trị null/undefined/empty string
    const userData: any = {};
    Object.keys(formValue).forEach(key => {
      const value = formValue[key];
      if (value !== null && value !== undefined && value !== '') {
        userData[key] = value;
      }
    });
    
    // Xóa password nếu rỗng (khi edit)
    if (!userData.password) {
      delete userData.password;
    }
    
    // Xóa permissions nếu là array rỗng
    if (Array.isArray(userData.permissions) && userData.permissions.length === 0) {
      delete userData.permissions;
    }
    
    // Xóa features nếu là array rỗng (chỉ khi không phải admin)
    if (!this.isAdmin && Array.isArray(userData.features) && userData.features.length === 0) {
      delete userData.features;
    }
    
    // Giữ lại các feature flags nếu là admin (cho phép phân quyền trực tiếp)
    // Nếu không phải admin, xóa các feature flags (không được phép phân quyền)
    if (!this.isAdmin) {
      delete userData.qrPaymentFeature;
      delete userData.otaManagementFeature;
      delete userData.emailManagementFeature;
      delete userData.electricManagementFeature;
      delete userData.paypalPaymentFeature;
      delete userData.cryptoPaymentFeature;
      delete userData.draftInvoiceFeature;
      delete userData.exportInvoiceFeature;
      delete userData.aiChatboxFeature;
    }

    console.log('Sending user data:', userData);

    this.isLoading = true;
    
    if (this.selectedUser) {
      // Update
      this.userService.updateUser(this.selectedUser._id, userData).subscribe({
        next: () => {
          this.message.success(this.translate.instant('USER_MANAGEMENT.MESSAGES.UPDATE_SUCCESS'));
          this.loadUsers();
          this.handleCancel();
        },
        error: (error) => {
          console.error('Update user error:', error);
          const errorMessage = error.error?.message || 'Lỗi khi cập nhật người dùng';
          this.message.error(errorMessage);
          // Nếu là lỗi về giới hạn user, hiển thị thông báo rõ ràng hơn
          if (errorMessage.includes('giới hạn số lượng người dùng') || errorMessage.includes('nâng cấp gói')) {
            this.modal.warning({
              nzTitle: 'Đã đạt giới hạn người dùng',
              nzContent: errorMessage,
              nzOkText: 'Đóng'
            });
          }
          this.isLoading = false;
        }
      });
    } else {
      // Create
      this.userService.signUp(userData).subscribe({
        next: () => {
          this.message.success(this.translate.instant('USER_MANAGEMENT.MESSAGES.CREATE_SUCCESS'));
          this.loadUsers();
          this.handleCancel();
        },
        error: (error) => {
          console.error('Create user error:', error);
          const errorMessage = error.error?.message || 'Lỗi khi thêm người dùng';
          this.message.error(errorMessage);
          // Nếu là lỗi về giới hạn user, hiển thị thông báo rõ ràng hơn
          if (errorMessage.includes('giới hạn số lượng người dùng') || errorMessage.includes('nâng cấp gói')) {
            this.modal.warning({
              nzTitle: 'Đã đạt giới hạn người dùng',
              nzContent: errorMessage,
              nzOkText: 'Đóng'
            });
          }
          this.isLoading = false;
        }
      });
    }
  }

  handleCancel(): void {
    this.isVisible = false;
    this.selectedUser = null;
    this.editingUser = null;
    this.userForm.reset();
    this.isLoading = false;
  }

  // ============ USER ACTIONS ============

  /**
   * Block user - cascade ảnh hưởng nếu là business/hotel
   */
  blockUser(user: User): void {
    if (!this.canBlockUser(user)) {
      this.message.error(this.translate.instant('USER_MANAGEMENT.MESSAGES.NO_BLOCK_PERMISSION'));
      return;
    }

    const cascadeWarning = user.role === 'business' 
      ? 'Tất cả khách sạn và nhân viên thuộc business này sẽ bị tạm ngưng hoạt động.'
      : user.role === 'hotel'
        ? 'Tất cả nhân viên thuộc hotel này sẽ bị tạm ngưng hoạt động.'
        : '';

    this.modal.confirm({
      nzTitle: 'Xác nhận khóa tài khoản',
      nzContent: `Bạn có chắc chắn muốn khóa tài khoản ${user.username}?<br/><span style="color: red;">${cascadeWarning}</span>`,
      nzOkText: 'Khóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => this.updateUserStatus(user, 'suspended'),
      nzCancelText: 'Hủy'
    });
  }

  /**
   * Kích hoạt lại user
   */
  activateUser(user: User): void {
    if (!this.canManageUser(user)) {
      this.message.error(this.translate.instant('USER_MANAGEMENT.MESSAGES.NO_ACTION_PERMISSION'));
      return;
    }

    this.updateUserStatus(user, 'active');
  }

  /**
   * Xóa user
   */
  deleteUser(user: User): void {
    if (!this.canDeleteUser(user)) {
      this.message.error(this.translate.instant('USER_MANAGEMENT.MESSAGES.NO_DELETE_PERMISSION'));
      return;
    }

    this.modal.confirm({
      nzTitle: 'Xác nhận xóa người dùng',
      nzContent: `Bạn có chắc chắn muốn xóa người dùng <b>${user.username}</b>?`,
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => this.updateUserStatus(user, 'deleted'),
      nzCancelText: 'Hủy'
    });
  }

  updateUserStatus(user: User, status: UserStatus): void {
    this.isLoading = true;
    this.userService.updateUserStatus(user._id, status).subscribe({
      next: (response) => {
        const statusLabels: Record<UserStatus, string> = {
          'active': 'kích hoạt',
          'inactive': 'vô hiệu hóa',
          'suspended': 'khóa',
          'deleted': 'xóa'
        };
        this.message.success(`Đã ${statusLabels[status]} tài khoản ${user.username}`);
        this.loadUsers();
      },
      error: (error) => {
        this.message.error(error.error?.message || this.translate.instant('USER_MANAGEMENT.MESSAGES.STATUS_CHANGE_ERROR'));
        this.isLoading = false;
      }
    });
  }

  // ============ HELPERS ============

  getRoleLabel(role: UserRole): string {
    const found = this.userRoles.find(r => r.value === role);
    return found ? found.label : role;
  }

  getRoleColor(role: UserRole): string {
    const colors: Record<UserRole, string> = {
      'superadmin': 'magenta',
      'admin': 'red',
      'business': 'blue',
      'hotel': 'purple',
      'staff': 'orange',
      'guest': 'green'
    };
    return colors[role] || 'default';
  }

  getStatusLabel(status: UserStatus): string {
    const found = this.userStatuses.find(s => s.value === status);
    return found ? found.label : status;
  }

  getStatusColor(status: UserStatus): string {
    const colors: Record<UserStatus, string> = {
      'active': 'success',
      'inactive': 'default',
      'suspended': 'warning',
      'deleted': 'error'
    };
    return colors[status] || 'default';
  }

  formatDate(date: string | Date | undefined): string {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '-';
    // Luôn hiển thị theo giờ Việt Nam (UTC+7), không phụ thuộc timezone máy client
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }

  /**
   * Kiểm tra user có bị cascade block không
   */
  isCascadeBlocked(user: User): boolean {
    // Logic này sẽ được xử lý ở backend
    // Frontend chỉ hiển thị trạng thái
    return user.status === 'suspended' || user.status === 'inactive';
  }
}
