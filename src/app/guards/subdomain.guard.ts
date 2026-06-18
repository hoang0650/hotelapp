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

      // Nếu đang KHÔNG ở admin.phhotel.vn thì ép chuyển hướng
      if (!isAdminSubdomain) {
        const protocol = window.location.protocol;
        const port = window.location.port ? `:${window.location.port}` : '';
        
        // state.url chứa đúng path mà người dùng muốn vào (vd: /login hoặc /reset-password/abc)
        window.location.href = `${protocol}//admin.phhotel.vn${port}${state.url}`;
        
        return false; // Chặn Angular load component ở domain hiện tại
      }
    }
    
    // Nếu đã ở admin subdomain rồi thì cho phép đi qua bình thường
    return true; 
  }
}