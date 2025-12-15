import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';
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

    // Staff được phép truy cập một số routes cơ bản
    if (user.role === 'staff') {
      // Staff được phép truy cập các routes sau:
      const allowedRoutes = [
        '/admin/room',
        '/admin/shift-handover',
        '/admin/shift-handover-history',
        '/admin/calendar',
        '/admin/bank-transfer-history' // Được xem lịch sử chuyển khoản (giao tiền)
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
        '/admin/electric-setting'
      ];
      
      if (blockedRoutes.includes(state.url)) {
        this.router.navigate(['/admin/unauthorized']);
        return false;
      }
      
      // Nếu route nằm trong allowedRoutes, cho phép
      if (allowedRoutes.includes(state.url)) {
        return true;
      }
    }

    // Kiểm tra permission cho route
    const routePath = state.url;
    const hasAccess = this.permissionService.canAccessRoute(routePath);

    if (!hasAccess) {
      // Chuyển đến trang unauthorized
      this.router.navigate(['/admin/unauthorized']);
      return false;
    }

    return true;
  }
}

