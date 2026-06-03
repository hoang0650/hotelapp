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
    const rawUrl = this.normalize(state.url);
    const url = rawUrl.startsWith('/admin/') ? rawUrl : `/admin${rawUrl}`;
    const isAdminSubdomain = typeof window !== 'undefined' && window.location.hostname.startsWith('admin.');
    const unauthorizedUrl = isAdminSubdomain ? '/unauthorized' : '/admin/unauthorized';
    const redirectToLogin = () => {
      if (isAdminSubdomain) {
        const protocol = window.location.protocol;
        const port = window.location.port ? `:${window.location.port}` : '';
        window.location.href = `${protocol}//phhotel.vn${port}/login`;
      } else {
        this.router.navigate(['/login']);
      }
    };
    const user = this.authService.getCurrentUser();
    
    // Nếu chưa đăng nhập, chuyển đến trang login
    if (!user) {
      return this.authService.refreshAccessToken().pipe(
        switchMap(success => {
          if (!success) {
            redirectToLogin();
            return of(false);
          }
          const refreshedUser = this.authService.getCurrentUser();
          if (!refreshedUser) {
            redirectToLogin();
            return of(false);
          }
          if (refreshedUser.role === 'superadmin' || refreshedUser.role === 'admin') {
            return of(true);
          }

          if (refreshedUser.role === 'guest') {
            if (url === '/admin/pricing-management') return of(true);
            this.router.navigate([unauthorizedUrl]);
            return of(false);
          }

          return this.permissionService.permissions$.pipe(
            take(1),
            map(() => {
              const hasAccess = this.permissionService.canAccessRoute(url);
              if (!hasAccess) {
                this.router.navigate([unauthorizedUrl]);
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

    // Guest được phép truy cập pricing-management
    if (user.role === 'guest') {
      if (url === '/admin/pricing-management') {
        return true;
      }
      // Guest chỉ được truy cập pricing-management, các route khác bị chặn
      this.router.navigate([unauthorizedUrl]);
      return false;
    }

    return this.permissionService.permissions$.pipe(
      take(1),
      map(permissions => {
        const routePath = url;
        const hasAccess = this.permissionService.canAccessRoute(routePath);

        if (!hasAccess) {
          // Chuyển đến trang unauthorized
          this.router.navigate([unauthorizedUrl]);
          return false;
        }

        return true;
      })
    );
  }
}

