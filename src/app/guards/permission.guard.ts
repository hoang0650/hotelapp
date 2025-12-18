import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { map, take, first } from 'rxjs/operators';
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

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    const user = this.authService.getCurrentUser();
    
    // Nếu chưa đăng nhập, chuyển đến trang login
    if (!user) {
      this.router.navigate(['/login']);
      return false;
    }

    // Superadmin có toàn quyền
    if (user.role === 'superadmin') {
      return true;
    }

    // Admin có toàn quyền (không cần kiểm tra permission)
    if (user.role === 'admin') {
      return true;
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
        '/admin/settings' // Được xem settings
      ];
      
      // Chặn các routes quản lý cấp cao
      const blockedRoutes = [
        '/admin/room-management',
        '/admin/hotel',
        '/admin/company',
        '/admin/staff',
        '/admin/service-management',
        '/admin/users-management',
        '/admin/pricing-management',
        '/admin/ota-management',
        '/admin/chart',
        '/admin/email-admin',
        '/admin/qr-payment',
        '/admin/visa-payment',
        '/admin/electric-setting',
        '/admin/financial-summary-report'
      ];
      
      if (blockedRoutes.includes(state.url)) {
        this.router.navigate(['/admin/unauthorized']);
        return false;
      }
      
      // Nếu route nằm trong allowedRoutes, cho phép
      if (allowedRoutes.includes(state.url)) {
        return true;
      }
      
      // Nếu route không nằm trong allowedRoutes và không bị block, 
      // mặc định không cho phép (staff chỉ được truy cập routes được liệt kê rõ ràng)
      // Chuyển đến trang unauthorized
      this.router.navigate(['/admin/unauthorized']);
      return false;
    }

    // Kiểm tra permission cho route (cho business, hotel, và các role khác)
    // Đợi permissions được load xong trước khi kiểm tra
    return this.permissionService.permissions$.pipe(
      take(1),
      map(permissions => {
        const routePath = state.url;
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

