import { Component, OnInit } from '@angular/core';
import { SettingsService } from '../../services/settings.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-maintenance',
  templateUrl: './maintenance.component.html',
  styleUrls: ['./maintenance.component.css']
})
export class MaintenanceComponent implements OnInit {
  maintenanceMessage = 'Hệ thống đang bảo trì. Vui lòng quay lại sau.';
  isLoading = true;
  isAdmin = false;

  constructor(
    private settingsService: SettingsService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.checkUserRole();
    this.loadMaintenanceMessage();
  }

  private checkUserRole(): void {
    const currentUser = this.authService.getCurrentUser();
    this.isAdmin = this.authService.isSuperAdmin() || this.authService.isAdmin();
  }

  private loadMaintenanceMessage(): void {
    this.settingsService.getSettingsByType('general').subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const generalSettings = response.data as any;
          if (generalSettings.maintenanceMessage) {
            this.maintenanceMessage = generalSettings.maintenanceMessage;
          }
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading maintenance message:', error);
        this.isLoading = false;
      }
    });
  }

  goToLogin(): void {
    this.authService.logout();
  }
}

