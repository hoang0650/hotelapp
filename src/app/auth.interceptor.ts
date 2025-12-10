import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './services/auth.service';
import { environment } from '../environments/environment';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(private authService: AuthService) {}

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
                          request.url.includes('/shift-handover') ||
                          request.url.includes('/services') ||
                          request.url.includes('/tuya');
      
      if (isApiRequest) {
        request = request.clone({
          setHeaders: {
            Authorization: `Bearer ${authToken}`
          }
        });
      }
    }
    return next.handle(request);
  }
} 