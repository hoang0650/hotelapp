import { Injectable } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { AuthService, UserRole } from './auth.service';
import { PricingService, PricingPackage } from './pricing.service';

// Định nghĩa các permission features tương ứng với routes
export type PermissionFeature = 
  | 'room_management'      // Quản lý phòng
  | 'hotel_management'     // Quản lý khách sạn
  | 'company_management'   // Quản lý doanh nghiệp
  | 'staff_management'     // Quản lý nhân viên
  | 'service_management'   // Quản lý dịch vụ
  | 'user_management'      // Quản lý người dùng
  | 'pricing_management'   // Quản lý gói giá
  | 'ota_management'       // Quản lý OTA
  | 'fanpage_messages'     // Tin nhắn Fanpage
  | 'revenue_chart'        // Biểu đồ doanh thu
  | 'financial_summary_report' // Báo cáo tổng hợp tài chính
  | 'shift_handover'       // Giao ca
  | 'bank_transfer_history' // Lịch sử chuyển khoản
  | 'calendar'             // Lịch
  | 'email_admin'          // Quản lý email
  | 'qr_payment'          // Thanh toán QR
  | 'visa_payment'        // Thanh toán Visa
  | 'electric_management' // Quản lý điện
  | 'zalo_messages'       // Tin nhắn Zalo OA
  | 'telegram_messages'   // Tin nhắn Telegram
  | 'settings_management'; // Quản lý cài đặt

// Map routes với permissions
export const ROUTE_PERMISSIONS: { [key: string]: PermissionFeature[] } = {
  '/admin/room': ['room_management'],
  '/admin/room-management': ['room_management'],
  '/admin/hotel': ['hotel_management'],
  '/admin/company': ['company_management'],
  '/admin/staff': ['staff_management'],
  '/admin/service-management': ['service_management'],
  '/admin/users-management': ['user_management'],
  '/admin/pricing-management': ['pricing_management'],
  '/admin/ota-management': ['ota_management'],
  '/admin/fanpage-messages': ['fanpage_messages'],
  '/admin/zalo-messages': ['zalo_messages'],
  '/admin/telegram-messages': ['telegram_messages'],
  '/admin/bot-setting': [],
  '/admin/chart': ['revenue_chart'],
  '/admin/shift-handover': ['shift_handover'],
  '/admin/shift-handover-history': ['shift_handover'],
  '/admin/bank-transfer-history': ['bank_transfer_history'],
  '/admin/calendar': ['calendar'],
  '/admin/email-admin': ['email_admin'],
  '/admin/qr-payment': ['qr_payment'],
  '/admin/visa-payment': ['visa_payment'],
  '/admin/electric-setting': ['electric_management'],
  '/admin/financial-summary-report': ['financial_summary_report', 'revenue_chart'],
  '/admin/profile': [], // Profile không cần permission đặc biệt, chỉ cần đăng nhập
  '/admin/settings': ['settings_management'],
  '/admin/guest-management': ['room_management'], // Guest management liên quan đến room management
  '/admin/debt-management': ['room_management'] // Debt management liên quan đến room management
};

@Injectable({
  providedIn: 'root'
})
export class PermissionService {
  private currentPackageSubject = new BehaviorSubject<PricingPackage | null>(null);
  public currentPackage$ = this.currentPackageSubject.asObservable();
  private permissionsSubject = new BehaviorSubject<string[]>([]);
  public permissions$ = this.permissionsSubject.asObservable();
  private readySubject = new BehaviorSubject<boolean>(true);
  public ready$ = this.readySubject.asObservable();
  private subscriptions = new Subscription();
  private currentUser: any = null;

  constructor(
    private authService: AuthService,
    private pricingService: PricingService
  ) {
    this.subscriptions.add(
      this.authService.currentUser$.subscribe(user => {
        this.currentUser = user;
        this.refreshPermissions();
      })
    );

    this.subscriptions.add(
      this.pricingService.subscriptionChanged$.subscribe(() => {
        this.refreshPermissions();
      })
    );
  }

  /**
   * Load permissions từ pricing package của user
   */
  private loadUserPermissions(userId: string, role: UserRole): void {
    this.pricingService.getCurrentUserPackage(userId).subscribe({
      next: (response: any) => {
        let pkg: any = null;
        if (response && response.success !== false) {
          pkg = response.data || response;
        }

        if (pkg && pkg.permissions && Array.isArray(pkg.permissions) && pkg.permissions.length > 0) {
          this.currentPackageSubject.next(pkg);
          const user = this.currentUser || this.authService.getCurrentUser();
          const delegatedPackagePermissions = (user as any)?.packagePermissions;
          if (Array.isArray(delegatedPackagePermissions) && delegatedPackagePermissions.length > 0) {
            const effective = pkg.permissions.filter((p: string) => delegatedPackagePermissions.includes(p));
            this.permissionsSubject.next(effective.length > 0 ? effective : ['view']);
          } else {
            this.permissionsSubject.next(pkg.permissions);
          }
          this.readySubject.next(true);
          return;
        }

        this.currentPackageSubject.next(pkg || null);
        this.setDefaultPermissionsByRole(role);
        this.readySubject.next(true);
      },
      error: (error) => {
        if (error.status !== 404 && error.status !== 400) {
          console.error('Error loading user package:', error);
        }
        this.currentPackageSubject.next(null);
        this.setDefaultPermissionsByRole(role);
        this.readySubject.next(true);
      }
    });
  }

  /**
   * Set permissions mặc định theo role
   */
  private setDefaultPermissionsByRole(role: UserRole): void {
    let defaultPermissions: string[] = [];
    
    switch (role) {
      case 'admin':
        defaultPermissions = ['view', 'edit', 'delete', 'manage'];
        break;
      case 'business':
        defaultPermissions = ['view', 'edit', 'manage'];
        break;
      case 'hotel':
        defaultPermissions = ['view', 'edit', 'manage']; // Hotel manager có quyền edit và manage
        break;
      case 'staff':
        defaultPermissions = ['view'];
        break;
      default:
        defaultPermissions = ['view'];
    }
    
    this.permissionsSubject.next(defaultPermissions);
  }

  /**
   * Kiểm tra user có permission cụ thể không
   */
  hasPermission(permission: string): boolean {
    const user = this.authService.getCurrentUser();
    
    // Superadmin có toàn quyền
    if (user?.role === 'superadmin') {
      return true;
    }

    const permissions = this.permissionsSubject.value;
    return permissions.includes(permission);
  }

  /**
   * Kiểm tra user có quyền truy cập feature không
   */
  hasFeatureAccess(feature: PermissionFeature): boolean {
    const user = this.authService.getCurrentUser();
    
    // Superadmin có toàn quyền
    if (user?.role === 'superadmin') {
      return true;
    }
    
    // Admin có toàn quyền
    if (user?.role === 'admin') {
      return true;
    }

    // Guest được phép truy cập pricing_management
    if (user?.role === 'guest' && feature === 'pricing_management') {
      return true;
    }

    if (user?.role === 'guest') {
      return false;
    }

    const roleAllowedFeaturesByRole: Partial<Record<UserRole, PermissionFeature[]>> = {
      business: [
        'room_management',
        'hotel_management',
        'company_management',
        'shift_handover',
        'calendar',
        'bank_transfer_history',
        'staff_management',
        'service_management',
        'ota_management',
        'fanpage_messages',
        'zalo_messages',
        'telegram_messages',
        'revenue_chart',
        'financial_summary_report',
        'qr_payment',
        'visa_payment',
        'electric_management',
        'pricing_management'
      ],
      hotel: [
        'room_management',
        'hotel_management',
        'shift_handover',
        'calendar',
        'bank_transfer_history',
        'staff_management',
        'service_management',
        'ota_management',
        'fanpage_messages',
        'zalo_messages',
        'telegram_messages',
        'revenue_chart',
        'financial_summary_report',
        'qr_payment',
        'visa_payment',
        'electric_management',
        'pricing_management'
      ],
      staff: [
        'room_management',
        'shift_handover',
        'calendar',
        'bank_transfer_history',
        'service_management',
        'ota_management',
        'fanpage_messages',
        'zalo_messages',
        'telegram_messages',
        'revenue_chart',
        'financial_summary_report',
        'qr_payment',
        'visa_payment',
        'electric_management',
        'pricing_management'
      ]
    };

    const roleBlockedFeaturesByRole: Partial<Record<UserRole, PermissionFeature[]>> = {
      business: ['user_management', 'email_admin', 'settings_management'],
      hotel: ['user_management', 'email_admin', 'settings_management', 'company_management'],
      staff: [
        'company_management',
        'staff_management',
        'user_management',
        'email_admin',
        'settings_management'
      ]
    };

    const role = (user?.role as UserRole) || 'guest';
    const blockedForRole = roleBlockedFeaturesByRole[role] || [];
    if (blockedForRole.includes(feature)) {
      return false;
    }

    const allowedForRole = roleAllowedFeaturesByRole[role] || [];
    if (!allowedForRole.includes(feature)) {
      return false;
    }

    const pkg = this.currentPackageSubject.value as any;
    if (feature !== 'pricing_management' && pkg?.features && Array.isArray(pkg.features) && pkg.features.length > 0) {
      if (!pkg.features.includes(feature)) {
        return false;
      }
    }

    const delegatedFeatures = (user as any)?.features;
    if (feature !== 'pricing_management' && Array.isArray(delegatedFeatures) && delegatedFeatures.length > 0) {
      if (!delegatedFeatures.includes(feature)) {
        return false;
      }
    }

    // Kiểm tra permissions từ package
    const permissions = this.permissionsSubject.value;
    
    // Nếu có 'manage' thì có toàn quyền
    if (permissions.includes('manage')) {
      return true;
    }

    // Map feature với permissions cần thiết
    const featurePermissionMap: { [key in PermissionFeature]: string[] } = {
      'room_management': ['view', 'edit', 'manage'],
      'hotel_management': ['view', 'edit', 'manage'],
      'company_management': ['view', 'edit', 'manage'],
      'staff_management': ['view', 'edit', 'manage'],
      'service_management': ['view', 'edit', 'manage'],
      'user_management': ['manage'],
      'pricing_management': ['manage'],
      'ota_management': ['view', 'edit', 'manage'],
      'fanpage_messages': ['view', 'manage'],
      'zalo_messages': ['view', 'manage'],
      'telegram_messages': ['view', 'manage'],
      'revenue_chart': ['view', 'manage'],
      'financial_summary_report': ['view', 'manage'],
      'shift_handover': ['view', 'edit', 'manage'],
      'bank_transfer_history': ['view', 'manage'],
      'calendar': ['view', 'edit', 'manage'],
      'email_admin': ['view', 'edit', 'manage'],
      'qr_payment': ['view', 'edit', 'manage'],
      'visa_payment': ['view', 'edit', 'manage'],
      'electric_management': ['view', 'edit', 'manage'],
      'settings_management': ['view', 'edit', 'manage']
    };

    const requiredPermissions = featurePermissionMap[feature] || ['view'];
    
    // Kiểm tra xem có ít nhất một permission cần thiết không
    return requiredPermissions.some(perm => permissions.includes(perm));
  }

  /**
   * Kiểm tra user có quyền truy cập route không
   */
  canAccessRoute(route: string): boolean {
    const base = route.split('?')[0].replace(/\/+$/, '');
    const exact = ROUTE_PERMISSIONS[base];
    const features = exact || Object.entries(ROUTE_PERMISSIONS).find(([key]) => base.startsWith(key))?.[1];
    if (!features || features.length === 0) {
      // Route không có permission requirement thì cho phép
      return true;
    }

    // Kiểm tra xem có ít nhất một feature được phép không
    return features.some(feature => this.hasFeatureAccess(feature));
  }

  /**
   * Lấy danh sách features mà user có quyền truy cập
   */
  getAccessibleFeatures(): PermissionFeature[] {
    const allFeatures: PermissionFeature[] = [
      'room_management',
      'hotel_management',
      'company_management',
      'staff_management',
      'service_management',
      'user_management',
      'pricing_management',
      'ota_management',
      'fanpage_messages',
      'zalo_messages',
      'telegram_messages',
      'revenue_chart',
      'financial_summary_report',
      'shift_handover',
      'bank_transfer_history',
      'calendar',
      'email_admin',
      'qr_payment',
      'visa_payment',
      'electric_management'
    ];

    return allFeatures.filter(feature => this.hasFeatureAccess(feature));
  }

  /**
   * Refresh permissions (gọi khi user đăng ký/hủy package)
   */
  refreshPermissions(): void {
    const user = this.currentUser || this.authService.getCurrentUser();
    if (!user) {
      this.permissionsSubject.next([]);
      this.currentPackageSubject.next(null);
      this.readySubject.next(true);
      return;
    }

    if (user.role === 'superadmin' || user.role === 'admin') {
      this.permissionsSubject.next(['view', 'edit', 'delete', 'manage']);
      this.currentPackageSubject.next(null);
      this.readySubject.next(true);
      return;
    }

    this.readySubject.next(false);
    this.loadUserPermissions(user._id, user.role);
  }
}

