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

