import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, take, first, switchMap } from 'rxjs/operators';
import { PermissionService } from '../services/permission.service';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class PermissionGuard implements CanActivate {
  constructor(
    private permissionService: PermissionService,
    private authService: AuthService,
    private router: Router
  ) {}

  private normalize(url: string): string {
    const base = url.split('?')[0];
    return base.replace(/\/+$/, '');
  }

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    const url = this.normalize(state.url);
    const user = this.authService.getCurrentUser();
    
    // Nếu chưa đăng nhập, chuyển đến trang login
    if (!user) {
      return this.authService.refreshAccessToken().pipe(
        switchMap(success => {
          if (!success) {
            this.router.navigate(['/login']);
            return of(false);
          }
          const refreshedUser = this.authService.getCurrentUser();
          if (!refreshedUser) {
            this.router.navigate(['/login']);
            return of(false);
          }
          if (refreshedUser.role === 'superadmin' || refreshedUser.role === 'admin') {
            return of(true);
          }
          if (refreshedUser.role === 'business' || refreshedUser.role === 'hotel') {
            const allowedRoutes = [
              '/admin/room',
              '/admin/shift-handover',
              '/admin/shift-handover-history',
              '/admin/calendar',
              '/admin/bank-transfer-history',
              '/admin/room-management',
              '/admin/staff',
              '/admin/service-management',
              '/admin/guest-management',
              '/admin/debt-management',
              '/admin/profile',
              '/admin/settings',
              '/admin/pricing-management'
            ];
            const blockedRoutes = [
              '/admin/users-management',
              '/admin/ota-management',
              '/admin/chart',
              '/admin/email-admin',
              '/admin/qr-payment',
              '/admin/visa-payment',
              '/admin/electric-setting',
              '/admin/financial-summary-report',
              '/admin/contact-management',
              '/admin/blog-management'
            ];
            if (blockedRoutes.includes(url)) {
              this.router.navigate(['/admin/unauthorized']);
              return of(false);
            }
            if (allowedRoutes.includes(url) || allowedRoutes.some(r => url.startsWith(r))) {
              return of(true);
            }
          }
          if (refreshedUser.role === 'staff') {
            const allowedRoutes = [
              '/admin/room',
              '/admin/shift-handover',
              '/admin/shift-handover-history',
              '/admin/calendar',
              '/admin/bank-transfer-history',
              '/admin/profile',
              '/admin/settings',
              '/admin/pricing-management'
            ];
            const blockedRoutes = [
              '/admin/room-management',
              '/admin/hotel',
              '/admin/company',
              '/admin/staff',
              '/admin/service-management',
              '/admin/users-management',
              '/admin/ota-management',
              '/admin/chart',
              '/admin/email-admin',
              '/admin/qr-payment',
              '/admin/visa-payment',
              '/admin/electric-setting',
              '/admin/financial-summary-report',
              '/admin/contact-management'
            ];
            if (blockedRoutes.includes(url)) {
              this.router.navigate(['/admin/unauthorized']);
              return of(false);
            }
            if (allowedRoutes.includes(url) || allowedRoutes.some(r => url.startsWith(r))) {
              return of(true);
            }
            this.router.navigate(['/admin/unauthorized']);
            return of(false);
          }
          if (refreshedUser.role === 'guest') {
            if (url === '/admin/pricing-management') {
              return of(true);
            }
            this.router.navigate(['/admin/unauthorized']);
            return of(false);
          }
          return this.permissionService.permissions$.pipe(
            take(1),
            map(() => {
              const hasAccess = this.permissionService.canAccessRoute(url);
              if (!hasAccess) {
                this.router.navigate(['/admin/unauthorized']);
                return false;
              }
              return true;
            })
          );
        })
      );
    }

    // Superadmin có toàn quyền
    if (user.role === 'superadmin') {
      return true;
    }

    // Admin có toàn quyền (không cần kiểm tra permission)
    if (user.role === 'admin') {
      return true;
    }

    // Business và Hotel Manager được phép truy cập các routes quản lý của họ (chỉ xem)
    if (user.role === 'business' || user.role === 'hotel') {
      // Business được phép truy cập company để XEM business của mình (KHÔNG thể tạo/cập nhật)
      // Hotel Manager không được phép truy cập company
      if (user.role === 'business' && url === '/admin/company') {
        return true; // Business được XEM business của mình (backend sẽ filter)
      }
      
      // Hotel Manager không được phép truy cập company
      if (user.role === 'hotel' && url === '/admin/company') {
        this.router.navigate(['/admin/unauthorized']);
        return false;
      }
      
      // Hotel Manager được phép truy cập hotel để XEM hotel của mình (KHÔNG thể tạo/cập nhật)
      if (user.role === 'hotel' && url === '/admin/hotel') {
        return true; // Hotel Manager được XEM hotel của mình (backend sẽ filter)
      }
      
      // Business được phép truy cập hotel để XEM hotels thuộc business (KHÔNG thể tạo/cập nhật)
      if (user.role === 'business' && url === '/admin/hotel') {
        return true; // Business được XEM hotels thuộc business (backend sẽ filter)
      }
      
      // Business và Hotel Manager được phép truy cập các routes sau:
      const allowedRoutes = [
        '/admin/room',
        '/admin/shift-handover',
        '/admin/shift-handover-history',
        '/admin/calendar',
        '/admin/bank-transfer-history',
        '/admin/room-management',
        '/admin/staff',
        '/admin/service-management',
        '/admin/guest-management',
        '/admin/debt-management',
        '/admin/profile',
        '/admin/settings',
        '/admin/pricing-management' // Cho phép tất cả role truy cập
      ];
      
      // Chặn các routes quản lý cấp cao mà business/hotel không được phép
      const blockedRoutes = [
        '/admin/users-management', // User management - chỉ superadmin, admin, business (xem)
        '/admin/ota-management', // OTA management - business và hotel được phép
        '/admin/chart', // Revenue chart - business và hotel được phép
        '/admin/email-admin', // Email admin - chỉ superadmin và admin
        '/admin/qr-payment', // QR payment - business và hotel được phép
        '/admin/visa-payment', // Visa payment - business và hotel được phép
        '/admin/electric-setting', // Electric setting - business và hotel được phép
        '/admin/financial-summary-report', // Financial summary - chỉ superadmin và business
        '/admin/contact-management', // Contact management - chỉ superadmin và admin
        '/admin/blog-management' // Blog management - chỉ superadmin và admin
      ];
      
      if (blockedRoutes.includes(url)) {
        this.router.navigate(['/admin/unauthorized']);
        return false;
      }
      
      // Nếu route nằm trong allowedRoutes, cho phép
      if (allowedRoutes.includes(url) || allowedRoutes.some(r => url.startsWith(r))) {
        return true;
      }
      
      // Nếu route không nằm trong allowedRoutes và không bị block,
      // kiểm tra qua permission service
      // (sẽ fallback về permission service để kiểm tra)
    }

    // Staff được phép truy cập một số routes cơ bản
    if (user.role === 'staff') {
      // Staff được phép truy cập các routes sau:
      const allowedRoutes = [
        '/admin/room',
        '/admin/shift-handover',
        '/admin/shift-handover-history',
        '/admin/calendar',
        '/admin/bank-transfer-history', // Được xem lịch sử chuyển khoản (giao tiền)
        '/admin/profile', // Được xem profile của mình
        '/admin/settings', // Được xem settings
        '/admin/pricing-management' // Cho phép tất cả role truy cập
      ];
      
      // Chặn các routes quản lý cấp cao
      const blockedRoutes = [
        '/admin/room-management',
        '/admin/hotel',
        '/admin/company',
        '/admin/staff',
        '/admin/service-management',
        '/admin/users-management',
        '/admin/ota-management',
        '/admin/chart',
        '/admin/email-admin',
        '/admin/qr-payment',
        '/admin/visa-payment',
        '/admin/electric-setting',
        '/admin/financial-summary-report',
        '/admin/contact-management'
      ];
      
      if (blockedRoutes.includes(url)) {
        this.router.navigate(['/admin/unauthorized']);
        return false;
      }
      
      // Nếu route nằm trong allowedRoutes, cho phép
      if (allowedRoutes.includes(url) || allowedRoutes.some(r => url.startsWith(r))) {
        return true;
      }
      
      // Nếu route không nằm trong allowedRoutes và không bị block, 
      // mặc định không cho phép (staff chỉ được truy cập routes được liệt kê rõ ràng)
      // Chuyển đến trang unauthorized
      this.router.navigate(['/admin/unauthorized']);
      return false;
    }

    // Guest được phép truy cập pricing-management
    if (user.role === 'guest') {
      if (url === '/admin/pricing-management') {
        return true;
      }
      // Guest chỉ được truy cập pricing-management, các route khác bị chặn
      this.router.navigate(['/admin/unauthorized']);
      return false;
    }

    // Kiểm tra permission cho route (cho business, hotel, và các role khác)
    // Đợi permissions được load xong trước khi kiểm tra
    return this.permissionService.permissions$.pipe(
      take(1),
      map(permissions => {
        const routePath = url;
        const hasAccess = this.permissionService.canAccessRoute(routePath);

        if (!hasAccess) {
          // Chuyển đến trang unauthorized
          this.router.navigate(['/admin/unauthorized']);
          return false;
        }

        return true;
      })
    );
  }
}

