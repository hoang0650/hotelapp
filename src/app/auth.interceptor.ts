import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
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

    // Clone request và thêm header nếu có token
    // Chỉ thêm token cho các request đến API của bạn, không phải các request bên ngoài
    if (authToken) {
      // Kiểm tra nếu URL bắt đầu bằng apiUrl từ environment hoặc localhost:3000
      const apiUrl = environment.apiUrl || 'https://nest-production-8106.up.railway.app';
      const isApiRequest = request.url.startsWith(apiUrl) || 
                          request.url.startsWith('https://nest-production-8106.up.railway.app') ||
                          request.url.includes('/pricing-packages') ||
                          request.url.includes('/users') ||
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
        // Kiểm tra lỗi maintenance mode (503)
        if (error.status === 503 && error.error?.maintenance) {
          // Lưu maintenance message vào localStorage
          if (error.error.maintenanceMessage) {
            localStorage.setItem('maintenanceMessage', error.error.maintenanceMessage);
          }
          localStorage.setItem('maintenanceMode', 'true');
          
          // Chỉ redirect nếu user không phải admin
          const currentUser = this.authService.getCurrentUser();
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