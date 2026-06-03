import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, take, switchMap, filter } from 'rxjs/operators';
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

    const evaluateAccess = (): boolean => {
      const u = this.authService.getCurrentUser();

      if (!u) {
        redirectToLogin();
        return false;
      }

      if (u.role === 'superadmin' || u.role === 'admin') {
        return true;
      }

      if (u.role === 'guest') {
        if (url === '/admin/pricing-management') return true;
        this.router.navigate([unauthorizedUrl]);
        return false;
      }

      const hasAccess = this.permissionService.canAccessRoute(url);
      if (!hasAccess) {
        this.router.navigate([unauthorizedUrl]);
        return false;
      }
      return true;
    };
    
    const waitPermissionsReady = (): Observable<boolean> => {
      return this.permissionService.ready$.pipe(
        filter(ready => ready),
        take(1),
        map(() => evaluateAccess())
      );
    };
    
    // Nếu chưa đăng nhập, chuyển đến trang login
    if (!user) {
      return this.authService.refreshAccessToken().pipe(
        switchMap(success => {
          if (!success) {
            redirectToLogin();
            return of(false);
          }
          return waitPermissionsReady();
        })
      );
    }

    return waitPermissionsReady();
  }
}

