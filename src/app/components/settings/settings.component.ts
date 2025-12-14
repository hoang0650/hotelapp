import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { SettingsService } from '../../services/settings.service';
import { NotificationsService } from '../../services/notifications.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  // Tab hiện tại
  activeTab = 0;
  
  // Forms
  systemForm!: FormGroup;
  emailForm!: FormGroup;
  paymentForm!: FormGroup;
  notificationForm!: FormGroup;
  generalForm!: FormGroup;
  
  // Loading states
  loading = false;
  saving = false;
  
  // Current user
  currentUser: any = null;
  
  constructor(
    private fb: FormBuilder,
    private message: NzMessageService,
    private router: Router,
    private authService: AuthService,
    private userService: UserService,
    private settingsService: SettingsService,
    private notificationsService: NotificationsService
  ) {
    this.initForms();
  }

  ngOnInit(): void {
    this.loadCurrentUser();
    this.loadSettings();
  }

  private initForms(): void {
    // System Settings Form
    this.systemForm = this.fb.group({
      systemName: ['Hệ thống quản lý khách sạn', Validators.required],
      systemVersion: ['1.0.0'],
      timezone: ['Asia/Ho_Chi_Minh', Validators.required],
      language: ['vi', Validators.required],
      currency: ['VND', Validators.required],
      dateFormat: ['DD/MM/YYYY', Validators.required],
      timeFormat: ['24h', Validators.required],
      autoBackup: [true],
      backupFrequency: ['daily'],
      maxBackupFiles: [30, [Validators.min(1), Validators.max(365)]],
      sessionTimeout: [30, [Validators.min(5), Validators.max(480)]],
      enableLogging: [true],
      logLevel: ['info']
    });

    // Email Settings Form
    this.emailForm = this.fb.group({
      emailEnabled: [true],
      smtpHost: ['smtp.gmail.com'],
      smtpPort: [587, [Validators.min(1), Validators.max(65535)]],
      smtpSecure: [false],
      smtpUser: [''],
      smtpPassword: [''],
      emailFrom: [''],
      emailFromName: ['Hệ thống quản lý khách sạn'],
      emailReplyTo: [''],
      emailTestAddress: ['']
    });

    // Payment Settings Form
    this.paymentForm = this.fb.group({
      defaultPaymentMethod: ['cash', Validators.required],
      enableCash: [true],
      enableBankTransfer: [true],
      enableCard: [true],
      enableQR: [true],
      enableCrypto: [false],
      enablePayPal: [false],
      autoReconcile: [false],
      reconcileFrequency: ['daily'],
      minimumBalanceAlert: [0, [Validators.min(0)]],
      paymentTimeout: [300, [Validators.min(30), Validators.max(3600)]]
    });

    // Notification Settings Form
    this.notificationForm = this.fb.group({
      enableEmailNotifications: [true],
      enableSMSNotifications: [false],
      enablePushNotifications: [true],
      notifyOnBooking: [true],
      notifyOnCheckin: [true],
      notifyOnCheckout: [true],
      notifyOnPayment: [true],
      notifyOnCancellation: [true],
      notifyOnLowInventory: [true],
      notifyOnSystemError: [true],
      notificationEmail: ['', Validators.email]
    });

    // General Settings Form
    this.generalForm = this.fb.group({
      companyName: [''],
      companyAddress: [''],
      companyPhone: [''],
      companyEmail: ['', Validators.email],
      companyWebsite: [''],
      taxId: [''],
      businessLicense: [''],
      logo: [''],
      favicon: [''],
      maintenanceMode: [false],
      maintenanceMessage: ['Hệ thống đang bảo trì. Vui lòng quay lại sau.'],
      allowRegistration: [true],
      requireEmailVerification: [false],
      enable2FA: [false]
    });
  }

  private loadCurrentUser(): void {
    this.currentUser = this.authService.getCurrentUser();
  }

  private loadSettings(): void {
    this.loading = true;
    
    // Load từ API
    this.settingsService.getAllSettings().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const settings = response.data;
          
          // Load system settings
          if (settings.systemSettings) {
            this.systemForm.patchValue(settings.systemSettings);
          }
          
          // Load email settings
          if (settings.emailSettings) {
            const emailData = { ...settings.emailSettings };
            // Không load password nếu là '***'
            if (emailData.smtpPassword === '***') {
              emailData.smtpPassword = '';
            }
            this.emailForm.patchValue(emailData);
          }
          
          // Load payment settings
          if (settings.paymentSettings) {
            this.paymentForm.patchValue(settings.paymentSettings);
          }
          
          // Load notification settings
          if (settings.notificationSettings) {
            this.notificationForm.patchValue(settings.notificationSettings);
          }
          
          // Load general settings
          if (settings.generalSettings) {
            this.generalForm.patchValue(settings.generalSettings);
          }
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading settings:', error);
        this.message.error('Lỗi khi tải cài đặt');
        this.loading = false;
      }
    });
  }

  saveSystemSettings(): void {
    if (this.systemForm.invalid) {
      this.markFormGroupTouched(this.systemForm);
      this.message.error('Vui lòng kiểm tra lại các trường bắt buộc');
      return;
    }

    this.saving = true;
    const settings = this.systemForm.value;
    
    this.settingsService.updateSystemSettings(settings).subscribe({
      next: (response) => {
        this.saving = false;
        if (response.success) {
          this.message.success(response.message || 'Đã lưu cài đặt hệ thống');
        } else {
          this.message.error(response.message || 'Lỗi khi lưu cài đặt hệ thống');
        }
      },
      error: (error) => {
        this.saving = false;
        this.message.error(error.error?.message || 'Lỗi khi lưu cài đặt hệ thống');
      }
    });
  }

  saveEmailSettings(): void {
    if (this.emailForm.invalid) {
      this.markFormGroupTouched(this.emailForm);
      this.message.error('Vui lòng kiểm tra lại các trường bắt buộc');
      return;
    }

    this.saving = true;
    const settings = this.emailForm.value;
    
    this.settingsService.updateEmailSettings(settings).subscribe({
      next: (response) => {
        this.saving = false;
        if (response.success) {
          this.message.success(response.message || 'Đã lưu cài đặt email');
          // Cập nhật lại form với password đã được ẩn
          if (response.data) {
            this.emailForm.patchValue(response.data);
          }
        } else {
          this.message.error(response.message || 'Lỗi khi lưu cài đặt email');
        }
      },
      error: (error) => {
        this.saving = false;
        this.message.error(error.error?.message || 'Lỗi khi lưu cài đặt email');
      }
    });
  }

  savePaymentSettings(): void {
    if (this.paymentForm.invalid) {
      this.markFormGroupTouched(this.paymentForm);
      this.message.error('Vui lòng kiểm tra lại các trường bắt buộc');
      return;
    }

    this.saving = true;
    const settings = this.paymentForm.value;
    
    this.settingsService.updatePaymentSettings(settings).subscribe({
      next: (response) => {
        this.saving = false;
        if (response.success) {
          this.message.success(response.message || 'Đã lưu cài đặt thanh toán');
        } else {
          this.message.error(response.message || 'Lỗi khi lưu cài đặt thanh toán');
        }
      },
      error: (error) => {
        this.saving = false;
        this.message.error(error.error?.message || 'Lỗi khi lưu cài đặt thanh toán');
      }
    });
  }

  saveNotificationSettings(): void {
    if (this.notificationForm.invalid) {
      this.markFormGroupTouched(this.notificationForm);
      this.message.error('Vui lòng kiểm tra lại các trường bắt buộc');
      return;
    }

    this.saving = true;
    const settings = this.notificationForm.value;
    
    this.settingsService.updateNotificationSettings(settings).subscribe({
      next: (response) => {
        this.saving = false;
        if (response.success) {
          this.message.success(response.message || 'Đã lưu cài đặt thông báo');
        } else {
          this.message.error(response.message || 'Lỗi khi lưu cài đặt thông báo');
        }
      },
      error: (error) => {
        this.saving = false;
        this.message.error(error.error?.message || 'Lỗi khi lưu cài đặt thông báo');
      }
    });
  }

  saveGeneralSettings(): void {
    if (this.generalForm.invalid) {
      this.markFormGroupTouched(this.generalForm);
      this.message.error('Vui lòng kiểm tra lại các trường bắt buộc');
      return;
    }

    this.saving = true;
    const settings = this.generalForm.value;
    
    // Lấy giá trị maintenance mode hiện tại từ localStorage hoặc form
    const previousMaintenanceMode = localStorage.getItem('maintenanceMode') === 'true' || 
                                     this.generalForm.get('maintenanceMode')?.value === true;
    const newMaintenanceMode = settings.maintenanceMode;
    
    this.settingsService.updateGeneralSettings(settings).subscribe({
      next: (response) => {
        this.saving = false;
        if (response.success) {
          this.message.success(response.message || 'Đã lưu cài đặt chung');
          
          // Kiểm tra nếu maintenance mode được tắt
          if (previousMaintenanceMode === true && newMaintenanceMode === false) {
            // Maintenance mode đã được tắt
            this.handleMaintenanceModeDisabled();
          } else if (previousMaintenanceMode === false && newMaintenanceMode === true) {
            // Maintenance mode đã được bật
            this.handleMaintenanceModeEnabled(settings.maintenanceMessage);
          } else if (newMaintenanceMode === false) {
            // Đảm bảo xóa maintenance mode nếu đang tắt
            this.handleMaintenanceModeDisabled();
          }
        } else {
          this.message.error(response.message || 'Lỗi khi lưu cài đặt chung');
        }
      },
      error: (error) => {
        this.saving = false;
        this.message.error(error.error?.message || 'Lỗi khi lưu cài đặt chung');
      }
    });
  }

  private handleMaintenanceModeDisabled(): void {
    // Xóa maintenance mode flags từ localStorage
    localStorage.removeItem('maintenanceMode');
    localStorage.removeItem('maintenanceMessage');
    
    // Reload notifications để cập nhật trạng thái
    this.notificationsService.loadAnnouncements();
    
    // Broadcast event để các component khác biết
    window.dispatchEvent(new CustomEvent('maintenanceModeChanged', { 
      detail: { enabled: false } 
    }));
    
    this.message.success('Chế độ bảo trì đã được tắt. Người dùng có thể sử dụng hệ thống bình thường.');
  }

  private handleMaintenanceModeEnabled(maintenanceMessage?: string): void {
    // Lưu maintenance mode flags vào localStorage
    localStorage.setItem('maintenanceMode', 'true');
    if (maintenanceMessage) {
      localStorage.setItem('maintenanceMessage', maintenanceMessage);
    }
    
    // Reload notifications để cập nhật trạng thái
    this.notificationsService.loadAnnouncements();
    
    // Broadcast event để các component khác biết
    window.dispatchEvent(new CustomEvent('maintenanceModeChanged', { 
      detail: { enabled: true, message: maintenanceMessage } 
    }));
  }

  testEmailConnection(): void {
    if (this.emailForm.invalid) {
      this.message.error('Vui lòng điền đầy đủ thông tin email');
      return;
    }

    this.loading = true;
    const emailSettings = this.emailForm.value;
    
    this.settingsService.testEmailConnection(emailSettings).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success) {
          this.message.success(response.message || 'Kết nối email thành công');
        } else {
          this.message.error(response.message || 'Lỗi khi kiểm tra kết nối email');
        }
      },
      error: (error) => {
        this.loading = false;
        this.message.error(error.error?.message || 'Lỗi khi kiểm tra kết nối email');
      }
    });
  }

  sendTestEmail(): void {
    const testAddress = this.emailForm.get('emailTestAddress')?.value;
    if (!testAddress) {
      this.message.error('Vui lòng nhập địa chỉ email test');
      return;
    }

    this.loading = true;
    const emailSettings = this.emailForm.value;
    
    this.settingsService.sendTestEmail(emailSettings, testAddress).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success) {
          this.message.success(response.message || `Đã gửi email test đến ${testAddress}`);
        } else {
          this.message.error(response.message || 'Lỗi khi gửi email test');
        }
      },
      error: (error) => {
        this.loading = false;
        this.message.error(error.error?.message || 'Lỗi khi gửi email test');
      }
    });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
      control?.updateValueAndValidity();
    });
  }

  resetForm(form: FormGroup): void {
    form.reset();
    this.loadSettings();
    this.message.info('Đã khôi phục cài đặt mặc định');
  }

  // Helper functions for currency formatting
  formatterVND = (value: number): string => {
    if (!value) return '0';
    return new Intl.NumberFormat('vi-VN').format(value);
  };

  parserVND = (value: string): string => {
    if (!value) return '0';
    const numValue = value.replace(/\s?/g, '').replace(/,/g, '');
    return numValue;
  };
}

