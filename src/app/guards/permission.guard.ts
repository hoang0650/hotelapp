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
    const debugGuardStartedAt = Date.now();
    // #region debug-point B:guard-enter
    try {
      fetch('http://127.0.0.1:7777/event', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: 'room-load-delay',
          runId: 'pre-fix',
          hypothesisId: 'B',
          location: 'permission.guard.ts:canActivate',
          msg: '[DEBUG] permission guard entered',
          data: { url, startedAt: debugGuardStartedAt },
          ts: debugGuardStartedAt
        })
      }).catch(() => {});
    } catch {}
    // #endregion
    const isAdminSubdomain = typeof window !== 'undefined' && window.location.hostname.startsWith('admin.');
    const unauthorizedUrl = isAdminSubdomain ? '/unauthorized' : '/admin/unauthorized';
    const redirectToLogin = () => {
      if (!isAdminSubdomain && typeof window !== 'undefined') {
        const protocol = window.location.protocol;
        const port = window.location.port ? `:${window.location.port}` : '';
        window.location.href = `${protocol}//admin.phhotel.vn${port}/login`;
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
      const ready$ = this.permissionService.ready$.pipe(
        filter(ready => ready),
        take(1),
        map(() => {
          // #region debug-point B:guard-ready
          try {
            const ts = Date.now();
            fetch('http://127.0.0.1:7777/event', {
              method: 'POST',
              body: JSON.stringify({
                sessionId: 'room-load-delay',
                runId: 'pre-fix',
                hypothesisId: 'B',
                location: 'permission.guard.ts:waitPermissionsReady',
                msg: '[DEBUG] permission ready emitted',
                data: { url, elapsedMs: ts - debugGuardStartedAt },
                ts
              })
            }).catch(() => {});
          } catch {}
          // #endregion
          return evaluateAccess();
        })
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

