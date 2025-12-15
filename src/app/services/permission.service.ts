import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
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
  | 'revenue_chart'        // Biểu đồ doanh thu
  | 'shift_handover'       // Giao ca
  | 'bank_transfer_history' // Lịch sử chuyển khoản
  | 'calendar'             // Lịch
  | 'email_admin'          // Quản lý email
  | 'qr_payment'          // Thanh toán QR
  | 'visa_payment'        // Thanh toán Visa
  | 'electric_management' // Quản lý điện
  | 'settings_management'; // Quản lý cài đặt

// Map routes với permissions
export const ROUTE_PERMISSIONS: { [key: string]: PermissionFeature[] } = {
  '/admin/room': ['room_management'],
  '/admin/room-management': ['room_management'],
  '/admin/hotel': ['hotel_management'],
  '/admin/company': ['company_management'],
  '/admin/staff': ['staff_management'],
  '/service-management': ['service_management'],
  '/admin/users-management': ['user_management'],
  '/admin/pricing-management': ['pricing_management'],
  '/admin/ota-management': ['ota_management'],
  '/admin/chart': ['revenue_chart'],
  '/admin/shift-handover': ['shift_handover'],
  '/admin/shift-handover-history': ['shift_handover'],
  '/admin/bank-transfer-history': ['bank_transfer_history'],
  '/admin/calendar': ['calendar'],
  '/admin/email-admin': ['email_admin'],
  '/admin/qr-payment': ['qr_payment'],
  '/admin/visa-payment': ['visa_payment'],
  '/admin/electric-setting': ['electric_management']
};

@Injectable({
  providedIn: 'root'
})
export class PermissionService {
  private currentPackageSubject = new BehaviorSubject<PricingPackage | null>(null);
  public currentPackage$ = this.currentPackageSubject.asObservable();
  private permissionsSubject = new BehaviorSubject<string[]>([]);
  public permissions$ = this.permissionsSubject.asObservable();

  constructor(
    private authService: AuthService,
    private pricingService: PricingService
  ) {
    this.loadUserPermissions();
  }

  /**
   * Load permissions từ pricing package của user
   */
  private loadUserPermissions(): void {
    this.authService.currentUser$.subscribe(user => {
      if (!user) {
        this.permissionsSubject.next([]);
        this.currentPackageSubject.next(null);
        return;
      }

      // Superadmin có toàn quyền
      if (user.role === 'superadmin') {
        this.permissionsSubject.next(['view', 'edit', 'delete', 'manage']);
        this.currentPackageSubject.next(null);
        return;
      }

      // Load package của user
      this.pricingService.getCurrentUserPackage(user._id).subscribe({
        next: (response: any) => {
          // Xử lý response có thể là { success: true, data: {...} } hoặc trực tiếp là package object
          let pkg = null;
          if (response && response.success !== false) {
            pkg = response.data || response;
          }
          
          if (pkg && pkg.permissions && Array.isArray(pkg.permissions) && pkg.permissions.length > 0) {
            this.currentPackageSubject.next(pkg);
            this.permissionsSubject.next(pkg.permissions);
          } else {
            // Nếu không có package, dùng permissions mặc định từ role
            this.setDefaultPermissionsByRole(user.role);
          }
        },
        error: (error) => {
          // Không log error nếu là 404 (user chưa có package)
          if (error.status !== 404 && error.status !== 400) {
            console.error('Error loading user package:', error);
          }
          // Nếu không có package, dùng permissions mặc định từ role
          this.setDefaultPermissionsByRole(user.role);
        }
      });
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
        defaultPermissions = ['view', 'edit'];
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

    // Staff được phép truy cập một số tính năng cơ bản
    if (user?.role === 'staff') {
      // Staff được phép truy cập các features sau:
      const allowedFeatures: PermissionFeature[] = [
        'room_management', // Được xem và thao tác với phòng
        'shift_handover', // Được giao ca và xem lịch sử giao ca
        'calendar', // Được xem lịch
        'bank_transfer_history' // Được xem lịch sử chuyển khoản (giao tiền)
      ];
      
      // Chặn các features quản lý cấp cao
      const blockedFeatures: PermissionFeature[] = [
        'hotel_management',
        'company_management',
        'staff_management',
        'service_management',
        'user_management',
        'pricing_management',
        'ota_management',
        'revenue_chart',
        'email_admin',
        'qr_payment',
        'visa_payment',
        'electric_management'
      ];
      
      if (blockedFeatures.includes(feature)) {
        return false;
      }
      
      // Nếu feature nằm trong allowedFeatures, cho phép
      if (allowedFeatures.includes(feature)) {
        return true;
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
      'revenue_chart': ['view', 'manage'],
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
    const features = ROUTE_PERMISSIONS[route];
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
      'revenue_chart',
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
    this.loadUserPermissions();
  }
}

