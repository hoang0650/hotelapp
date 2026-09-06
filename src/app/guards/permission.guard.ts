import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, take, switchMap, filter, catchError, timeout } from 'rxjs/operators';
import { PermissionService } from '../services/permission.service';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class PermissionGuard implements CanActivate {
  private readonly roomGuardFallbackMs = 1500;

  constructor(
    private permissionService: PermissionService,
    private authService: AuthService,
    private router: Router
  ) {}

  private normalize(url: string): string {
    const base = url.split('?')[0];
    return base.replace(/\/+$/, '');
  }

  private canFastTrackRoomAccess(url: string): boolean {
    if (url !== '/admin/room') {
      return false;
    }

    const user = this.authService.getCurrentUser();
    if (!user) {
      return false;
    }

    return (
      user.role === 'superadmin' ||
      user.role === 'admin' ||
      user.role === 'business' ||
      user.role === 'hotel' ||
      user.role === 'staff'
    );
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
      if (!isAdminSubdomain && typeof window !== 'undefined') {
        window.location.href = 'https://admin.phhotel.vn/login';
      } else {
        this.router.navigate(['/login']);
      }
    };
    const user = this.authService.getCurrentUser();

    // Fast path: đã có user + vào /admin/room → cho vào ngay, không chờ package API
    if (user && this.canFastTrackRoomAccess(url)) {
      return true;
    }

    const evaluateAccess = (): boolean => {
      const u = this.authService.getCurrentUser();

      if (!u) {
        redirectToLogin();
        return false;
      }

      const isEmailAdminRoute = url === '/admin/email-admin' || url.endsWith('/email-admin');
      if (isEmailAdminRoute) {
        if (u.role === 'superadmin') {
          return true;
        }
        this.router.navigate([unauthorizedUrl]);
        return false;
      }

      const isAdminOnlyCmsRoute =
        url === '/admin/contact-management' ||
        url.endsWith('/contact-management') ||
        url === '/admin/blog-management' ||
        url.endsWith('/blog-management');
      if (isAdminOnlyCmsRoute) {
        if (u.role === 'superadmin' || u.role === 'admin') {
          return true;
        }
        this.router.navigate([unauthorizedUrl]);
        return false;
      }

      if (u.role === 'superadmin' || u.role === 'admin') {
        return true;
      }

      if (url === '/admin/settings') {
        return u.role === 'business' || u.role === 'hotel' || u.role === 'staff';
      }

      if (u.role === 'guest') {
        // Guest được vào shell /admin để xem UI và đăng ký gói (pricing-management + pricing public)
        if (
          url === '/admin/pricing-management' ||
          url === '/admin/pricing' ||
          url === '/admin/profile' ||
          url === '/pricing'
        ) {
          return true;
        }
        // /admin hoặc /admin/room → đưa về trang đăng ký gói thay vì 403
        this.router.navigate(['/admin/pricing-management']);
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
      const ready$ = this.permissionService.ready$.pipe(
        filter(ready => ready),
        take(1),
        map(() => evaluateAccess())
      );

      if (!this.canFastTrackRoomAccess(url)) {
        return ready$;
      }

      return ready$.pipe(
        timeout(this.roomGuardFallbackMs),
        catchError(() => of(true))
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

