import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from './services/auth.service';
import { Router } from '@angular/router';
import { environment } from '../environments/environment';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const authToken = this.authService.getToken();

    if (authToken) {
      const apiUrl = environment.apiUrl;
      const isApiRequest = request.url.startsWith(apiUrl) || 
                          request.url.includes('/pricing-packages') ||
                          request.url.includes('/users') ||
                          request.url.includes('/sessions') ||
                          request.url.includes('/rooms') ||
                          request.url.includes('/hotels') ||
                          request.url.includes('/bookings') ||
                          request.url.includes('/staffs') ||
                          request.url.includes('/transactions') ||
                          request.url.includes('/invoices') ||
                          request.url.includes('/e-invoice') ||
                          request.url.includes('/shift-handover') ||
                          request.url.includes('/services') ||
                          request.url.includes('/tuya') ||
                          request.url.includes('/ai-assistant');
      
      if (isApiRequest) {
        request = request.clone({
          setHeaders: {
            Authorization: `Bearer ${authToken}`
          }
        });
      }
    }
    
    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        const isRefreshEndpoint = typeof request.url === 'string' && request.url.includes('/users/refresh-token');
        const publicRoutes = ['/forgot-password', '/reset-password', '/signup', '/home', '/pricing', '/blog', '/contact', '/privacy-policy', '/terms-of-service', '/login', '/about-us'];
        const currentUrl = this.router.url || (typeof location !== 'undefined' ? location.pathname : '');
        const isOnPublicRoute = publicRoutes.some(r => (currentUrl || '').startsWith(r));
        const isPublicApi = typeof request.url === 'string' && (request.url.includes('/forgot-password') || request.url.includes('/reset-password'));

        if (error.status === 401 && !isRefreshEndpoint) {
          if (isOnPublicRoute || isPublicApi) {
            return throwError(() => error);
          }
          return this.authService.refreshAccessToken().pipe(
            switchMap((success) => {
              if (success) {
                const newToken = this.authService.getToken();
                if (newToken) {
                  const retried = request.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } });
                  return next.handle(retried);
                }
              }
              this.authService.logout();
              this.router.navigate(['/login']);
              return throwError(() => error);
            })
          );
        }

        if (error.status === 503 && error.error?.maintenance) {
          if (error.error.maintenanceMessage) {
            localStorage.setItem('maintenanceMessage', error.error.maintenanceMessage);
          }
          localStorage.setItem('maintenanceMode', 'true');
          const isAdmin = this.authService.isSuperAdmin() || this.authService.isAdmin();
          if (!isAdmin) {
            this.router.navigate(['/maintenance']);
          }
        }

        return throwError(() => error);
      })
    );
  }
} 
