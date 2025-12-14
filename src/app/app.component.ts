import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Router, NavigationEnd } from '@angular/router';
import { AuthService } from './services/auth.service';
import { SettingsService } from './services/settings.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'hotel';
  isMaintenanceMode = false;
  maintenanceMessage = 'Hệ thống đang bảo trì. Vui lòng quay lại sau.';

  constructor(
    private translate: TranslateService,
    private router: Router,
    private authService: AuthService,
    private settingsService: SettingsService
  ) {}

  ngOnInit(): void {
    // Set default language from localStorage or use 'vi'
    const savedLang = localStorage.getItem('language') || 'vi';
    this.translate.setDefaultLang('vi');
    this.translate.use(savedLang);
    
    // Kiểm tra maintenance mode từ localStorage
    this.checkMaintenanceMode();
    
    // Lắng nghe navigation để kiểm tra maintenance mode
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.checkMaintenanceMode();
    });
  }

  private checkMaintenanceMode(): void {
    const maintenanceMode = localStorage.getItem('maintenanceMode') === 'true';
    const maintenanceMsg = localStorage.getItem('maintenanceMessage');
    
    if (maintenanceMode) {
      const currentUser = this.authService.getCurrentUser();
      const isAdmin = this.authService.isSuperAdmin() || this.authService.isAdmin();
      
      // Nếu không phải admin và không đang ở trang maintenance, redirect
      if (!isAdmin && !this.router.url.startsWith('/maintenance')) {
        this.isMaintenanceMode = true;
        if (maintenanceMsg) {
          this.maintenanceMessage = maintenanceMsg;
        }
        this.router.navigate(['/maintenance']);
      } else if (isAdmin) {
        // Admin có thể truy cập, nhưng vẫn hiển thị thông báo
        this.isMaintenanceMode = false;
        localStorage.removeItem('maintenanceMode');
        localStorage.removeItem('maintenanceMessage');
      }
    } else {
      this.isMaintenanceMode = false;
    }
  }
}
