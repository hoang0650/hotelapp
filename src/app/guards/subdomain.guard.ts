import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class SubdomainGuard implements CanActivate {
  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const isAdminSubdomain = hostname.startsWith('admin.');

      // Bỏ qua kiểm tra nếu bạn đang code ở máy ảo localhost để không làm hỏng môi trường Dev
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return true; 
      }

      // Nếu đang KHÔNG ở admin.phhotel.vn thì ép chuyển hướng (luôn HTTPS)
      if (!isAdminSubdomain) {
        window.location.href = `https://admin.phhotel.vn${state.url}`;
        return false;
      }
    }
    
    // Nếu đã ở admin subdomain rồi thì cho phép đi qua bình thường
    return true; 
  }
}