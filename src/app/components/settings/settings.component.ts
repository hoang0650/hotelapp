import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { SettingsService, EmailSettings } from '../../services/settings.service';
import { NotificationsService, Announcement } from '../../services/notifications.service';
import { HotelService } from '../../services/hotel.service';
import { BusinessService } from '../../services/business.service';

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
  hotelQRPaymentForm!: FormGroup;
  hotelFeaturesForm!: FormGroup;
  hotelNotificationForm!: FormGroup;
  
  // Loading states
  loading = false;
  saving = false;
  
  // Current user
  currentUser: any = null;
  
  // Hotel settings
  hotels: any[] = [];
  selectedHotelId: string | null = null;
  currentHotelSettings: any = null;
  loadingHotels = false;
  
  // Announcements management
  announcements: Announcement[] = [];
  announcementForm!: FormGroup;
  isAnnouncementModalVisible = false;
  editingAnnouncement: Announcement | null = null;
  businesses: any[] = [];
  loadingAnnouncements = false;

  // QR Payment
  qrPaymentUrl: string = ''; // URL QR thanh toán SePay
  showQrPreview: boolean = false; // Hiển thị preview QR code
  qrBeneficiaryName: string = ''; // Tên người thụ hưởng cho QR code

  // Email providers
  emailProviders = [
    { value: 'resend', label: 'Resend (Khuyến nghị)', description: 'Miễn phí 3000 email/tháng, API đơn giản' },
    { value: 'sendgrid', label: 'SendGrid', description: 'Miễn phí 100 email/ngày' },
    { value: 'mailgun', label: 'Mailgun', description: 'Miễn phí 5000 email/tháng (3 tháng đầu)' },
    { value: 'aws-ses', label: 'AWS SES', description: 'Giá rẻ, scale tốt' },
    { value: 'nodemailer', label: 'Nodemailer (SMTP)', description: 'SMTP truyền thống (Gmail, Outlook, etc.)' }
  ];
  
  constructor(
    private fb: FormBuilder,
    private message: NzMessageService,
    private router: Router,
    public authService: AuthService,
    private userService: UserService,
    private settingsService: SettingsService,
    private notificationsService: NotificationsService,
    private hotelService: HotelService,
    private businessService: BusinessService
  ) {
    this.initForms();
  }

  ngOnInit(): void {
    this.loadCurrentUser();
    this.loadSettings();
    this.loadHotels();
    if (this.authService.isSuperAdmin() || this.authService.isAdmin()) {
      this.loadAnnouncements();
      this.loadBusinesses();
    }
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
      emailProvider: ['nodemailer', [Validators.required]],
      // Nodemailer/SMTP
      smtpHost: ['smtp.gmail.com'],
      smtpPort: [587, [Validators.min(1), Validators.max(65535)]],
      smtpSecure: [false],
      smtpUser: [''],
      smtpPassword: [''],
      // Resend
      resendApiKey: [''],
      // SendGrid
      sendgridApiKey: [''],
      // Mailgun
      mailgunApiKey: [''],
      mailgunDomain: [''],
      // AWS SES
      awsAccessKeyId: [''],
      awsSecretAccessKey: [''],
      awsRegion: ['us-east-1'],
      // Common
      emailFrom: ['', [Validators.required, Validators.email]],
      emailFromName: ['Hệ thống quản lý khách sạn'],
      emailReplyTo: [''],
      emailTestAddress: ['']
    });

    // Khi provider thay đổi, cập nhật validators
    this.emailForm.get('emailProvider')?.valueChanges.subscribe(provider => {
      this.updateEmailValidators(provider);
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
      paymentTimeout: [300, [Validators.min(30), Validators.max(3600)]],
      // Bank Account for QR Payment
      bankAccount: this.fb.group({
        bankName: [''],
        accountNumber: [''],
        accountHolderName: [''],
        beneficiaryName: [''], // Tên người thụ hưởng (hiển thị trên QR code)
        branch: [''],
        swiftCode: [''],
        iban: [''],
        qrPaymentUrl: [''] // Link QR thanh toán SePay
      })
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
    
    // Hotel QR Payment Form
    this.hotelQRPaymentForm = this.fb.group({
      enableQRPaymentForBankTransfer: [false]
    });
    
    // Hotel Features Form (OTA, Email, Electric, PayPal, Crypto, Draft Invoice, Export Invoice, AI Chatbox)
    this.hotelFeaturesForm = this.fb.group({
      enableOTAManagement: [false],
      enableEmailManagement: [false],
      enableElectricManagement: [false],
      enablePayPalPayment: [false],
      enableCryptoPayment: [false],
      enableDraftInvoice: [false],
      enableExportInvoice: [false],
      enableAiChatbox: [false]
    });
    
    // Hotel Notification Settings Form
    this.hotelNotificationForm = this.fb.group({
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
    
    // Announcement Form
    this.announcementForm = this.fb.group({
      type: ['info', Validators.required],
      title: ['', Validators.required],
      message: ['', Validators.required],
      priority: ['medium', Validators.required],
      startDate: [new Date()],
      endDate: [null],
      isActive: [true],
      targetType: ['system', Validators.required],
      targetRoles: [[]],
      targetBusinesses: [[]],
      targetHotels: [[]],
      notificationType: ['general', Validators.required] // Loại thông báo để map với notifyOn* settings
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
            const generalData = { ...settings.generalSettings };
            // Nếu có bankAccount, patch riêng để đảm bảo FormGroup được cập nhật đúng
            if (generalData.bankAccount) {
              const bankAccountData = generalData.bankAccount;
              delete generalData.bankAccount;
              // Patch các field khác trước
              this.generalForm.patchValue(generalData);
              // Sau đó patch bankAccount vào FormGroup con
              const bankAccountFormGroup = this.generalForm.get('bankAccount');
              if (bankAccountFormGroup) {
                bankAccountFormGroup.patchValue(bankAccountData);
              } else {
                // Nếu FormGroup chưa có, patch trực tiếp
                this.generalForm.patchValue({ bankAccount: bankAccountData });
              }
              
              console.log('Loaded bankAccount from settings:', {
                qrPaymentUrl: bankAccountData.qrPaymentUrl,
                beneficiaryName: bankAccountData.beneficiaryName,
                bankName: bankAccountData.bankName
              });
            } else {
              this.generalForm.patchValue(generalData);
            }
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
    const formValue = this.emailForm.value;
    
    // Chỉ gửi các trường liên quan đến provider được chọn
    const emailSettings: Partial<EmailSettings> = {
      emailEnabled: formValue.emailEnabled,
      emailProvider: formValue.emailProvider,
      emailFrom: formValue.emailFrom,
      emailFromName: formValue.emailFromName || 'Hệ thống quản lý khách sạn',
      emailReplyTo: formValue.emailReplyTo || '',
      emailTestAddress: formValue.emailTestAddress || ''
    };

    // Thêm các trường dựa trên provider được chọn
    switch (formValue.emailProvider) {
      case 'nodemailer':
        emailSettings.smtpHost = formValue.smtpHost || 'smtp.gmail.com';
        emailSettings.smtpPort = formValue.smtpPort || 587;
        emailSettings.smtpSecure = formValue.smtpSecure || false;
        emailSettings.smtpUser = formValue.smtpUser || '';
        // Chỉ gửi password nếu có giá trị (không gửi nếu rỗng để giữ nguyên password cũ)
        if (formValue.smtpPassword && formValue.smtpPassword.trim() !== '') {
          emailSettings.smtpPassword = formValue.smtpPassword;
        }
        break;
      case 'resend':
        // Chỉ gửi API key nếu có giá trị
        if (formValue.resendApiKey && formValue.resendApiKey.trim() !== '') {
          emailSettings.resendApiKey = formValue.resendApiKey;
        }
        break;
      case 'sendgrid':
        // Chỉ gửi API key nếu có giá trị
        if (formValue.sendgridApiKey && formValue.sendgridApiKey.trim() !== '') {
          emailSettings.sendgridApiKey = formValue.sendgridApiKey;
        }
        break;
      case 'mailgun':
        // Chỉ gửi API key và domain nếu có giá trị
        if (formValue.mailgunApiKey && formValue.mailgunApiKey.trim() !== '') {
          emailSettings.mailgunApiKey = formValue.mailgunApiKey;
        }
        if (formValue.mailgunDomain && formValue.mailgunDomain.trim() !== '') {
          emailSettings.mailgunDomain = formValue.mailgunDomain;
        }
        break;
      case 'aws-ses':
        // Chỉ gửi credentials nếu có giá trị
        if (formValue.awsAccessKeyId && formValue.awsAccessKeyId.trim() !== '') {
          emailSettings.awsAccessKeyId = formValue.awsAccessKeyId;
        }
        if (formValue.awsSecretAccessKey && formValue.awsSecretAccessKey.trim() !== '') {
          emailSettings.awsSecretAccessKey = formValue.awsSecretAccessKey;
        }
        emailSettings.awsRegion = formValue.awsRegion || 'us-east-1';
        break;
    }
    
    this.settingsService.updateEmailSettings(emailSettings).subscribe({
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
    const formValue = this.paymentForm.value;
    
    // Đảm bảo bankAccount được lưu đúng vào paymentSettings
    // Nếu có QR code đã tạo, lưu vào bankAccount
    const bankAccountData = {
      ...(formValue.bankAccount || {}),
      qrPaymentUrl: this.qrPaymentUrl || formValue.bankAccount?.qrPaymentUrl || '',
      beneficiaryName: this.qrBeneficiaryName || formValue.bankAccount?.beneficiaryName || ''
    };
    
    const settings = {
      ...formValue,
      // Đảm bảo bankAccount được giữ nguyên cấu trúc với QR code
      bankAccount: bankAccountData
    };
    
    console.log('Saving payment settings with bankAccount:', {
      hasBankAccount: !!settings.bankAccount,
      qrPaymentUrl: settings.bankAccount?.qrPaymentUrl,
      beneficiaryName: settings.bankAccount?.beneficiaryName
    });
    
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
        console.error('Error saving payment settings:', error);
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
    const formValue = this.generalForm.value;
    
    // Đảm bảo bankAccount được lưu đúng vào generalSettings
    // Nếu có QR code đã tạo, lưu vào bankAccount
    const bankAccountData = {
      ...(formValue.bankAccount || {}),
      qrPaymentUrl: this.qrPaymentUrl || formValue.bankAccount?.qrPaymentUrl || '',
      beneficiaryName: this.qrBeneficiaryName || formValue.bankAccount?.beneficiaryName || ''
    };
    
    const settings = {
      ...formValue,
      // Đảm bảo bankAccount được giữ nguyên cấu trúc với QR code
      bankAccount: bankAccountData
    };
    
    // Lấy giá trị maintenance mode hiện tại từ localStorage hoặc form
    const previousMaintenanceMode = localStorage.getItem('maintenanceMode') === 'true' || 
                                     this.generalForm.get('maintenanceMode')?.value === true;
    const newMaintenanceMode = settings.maintenanceMode;
    
    console.log('Saving general settings with bankAccount:', {
      hasBankAccount: !!settings.bankAccount,
      qrPaymentUrl: settings.bankAccount?.qrPaymentUrl,
      beneficiaryName: settings.bankAccount?.beneficiaryName
    });
    
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
        console.error('Error saving general settings:', error);
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
    const formValue = this.emailForm.value;
    
    // Chỉ gửi các trường liên quan đến provider được chọn
    const emailSettings: Partial<EmailSettings> = {
      emailProvider: formValue.emailProvider,
      emailFrom: formValue.emailFrom
    };

    // Thêm các trường dựa trên provider
    switch (formValue.emailProvider) {
      case 'nodemailer':
        emailSettings.smtpHost = formValue.smtpHost;
        emailSettings.smtpPort = formValue.smtpPort;
        emailSettings.smtpSecure = formValue.smtpSecure;
        emailSettings.smtpUser = formValue.smtpUser;
        emailSettings.smtpPassword = formValue.smtpPassword;
        break;
      case 'resend':
        emailSettings.resendApiKey = formValue.resendApiKey;
        break;
      case 'sendgrid':
        emailSettings.sendgridApiKey = formValue.sendgridApiKey;
        break;
      case 'mailgun':
        emailSettings.mailgunApiKey = formValue.mailgunApiKey;
        emailSettings.mailgunDomain = formValue.mailgunDomain;
        break;
      case 'aws-ses':
        emailSettings.awsAccessKeyId = formValue.awsAccessKeyId;
        emailSettings.awsSecretAccessKey = formValue.awsSecretAccessKey;
        emailSettings.awsRegion = formValue.awsRegion;
        break;
    }
    
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

  updateEmailValidators(provider: string): void {
    // Reset tất cả validators
    const fields = ['smtpHost', 'smtpPort', 'smtpUser', 'smtpPassword', 
                    'resendApiKey', 'sendgridApiKey', 'mailgunApiKey', 
                    'mailgunDomain', 'awsAccessKeyId', 'awsSecretAccessKey'];
    
    fields.forEach(field => {
      const control = this.emailForm.get(field);
      if (control) {
        control.clearValidators();
        control.updateValueAndValidity();
      }
    });

    // Thêm validators dựa trên provider
    switch (provider) {
      case 'nodemailer':
        this.emailForm.get('smtpHost')?.setValidators([Validators.required]);
        this.emailForm.get('smtpPort')?.setValidators([Validators.required]);
        this.emailForm.get('smtpUser')?.setValidators([Validators.required, Validators.email]);
        this.emailForm.get('smtpPassword')?.setValidators([Validators.required]);
        break;
      case 'resend':
        this.emailForm.get('resendApiKey')?.setValidators([Validators.required]);
        break;
      case 'sendgrid':
        this.emailForm.get('sendgridApiKey')?.setValidators([Validators.required]);
        break;
      case 'mailgun':
        this.emailForm.get('mailgunApiKey')?.setValidators([Validators.required]);
        this.emailForm.get('mailgunDomain')?.setValidators([Validators.required]);
        break;
      case 'aws-ses':
        this.emailForm.get('awsAccessKeyId')?.setValidators([Validators.required]);
        this.emailForm.get('awsSecretAccessKey')?.setValidators([Validators.required]);
        this.emailForm.get('awsRegion')?.setValidators([Validators.required]);
        break;
    }

    // Update validity
    fields.forEach(field => {
      this.emailForm.get(field)?.updateValueAndValidity({ emitEvent: false });
    });
  }

  getCurrentEmailProvider(): string {
    return this.emailForm.get('emailProvider')?.value || 'nodemailer';
  }

  showEmailField(field: string): boolean {
    const provider = this.getCurrentEmailProvider();
    
    switch (field) {
      case 'smtp':
        return provider === 'nodemailer';
      case 'resend':
        return provider === 'resend';
      case 'sendgrid':
        return provider === 'sendgrid';
      case 'mailgun':
        return provider === 'mailgun';
      case 'aws':
        return provider === 'aws-ses';
      default:
        return false;
    }
  }

  sendTestEmail(): void {
    const testAddress = this.emailForm.get('emailTestAddress')?.value;
    if (!testAddress) {
      this.message.error('Vui lòng nhập địa chỉ email test');
      return;
    }

    this.loading = true;
    const formValue = this.emailForm.value;
    
    // Chỉ gửi các trường liên quan đến provider được chọn
    const emailSettings: Partial<EmailSettings> = {
      emailProvider: formValue.emailProvider,
      emailFrom: formValue.emailFrom
    };

    // Thêm các trường dựa trên provider
    switch (formValue.emailProvider) {
      case 'nodemailer':
        emailSettings.smtpHost = formValue.smtpHost;
        emailSettings.smtpPort = formValue.smtpPort;
        emailSettings.smtpSecure = formValue.smtpSecure;
        emailSettings.smtpUser = formValue.smtpUser;
        emailSettings.smtpPassword = formValue.smtpPassword;
        break;
      case 'resend':
        emailSettings.resendApiKey = formValue.resendApiKey;
        break;
      case 'sendgrid':
        emailSettings.sendgridApiKey = formValue.sendgridApiKey;
        break;
      case 'mailgun':
        emailSettings.mailgunApiKey = formValue.mailgunApiKey;
        emailSettings.mailgunDomain = formValue.mailgunDomain;
        break;
      case 'aws-ses':
        emailSettings.awsAccessKeyId = formValue.awsAccessKeyId;
        emailSettings.awsSecretAccessKey = formValue.awsSecretAccessKey;
        emailSettings.awsRegion = formValue.awsRegion;
        break;
    }
    
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

  private loadHotels(): void {
    // Chỉ load hotels nếu user có quyền quản lý hotel
    if (!this.authService.isSuperAdmin() && !this.authService.isAdmin() && !this.authService.isBusiness() && !this.authService.isHotelManager()) {
      return;
    }
    
    this.loadingHotels = true;
    this.hotelService.getHotels().subscribe({
      next: (hotels) => {
        this.hotels = hotels;
        // Nếu user là hotel manager hoặc staff, chỉ hiển thị hotel của họ
        if (this.currentUser?.hotelId) {
          this.selectedHotelId = this.currentUser.hotelId;
          this.loadHotelSettings(this.currentUser.hotelId);
        } else if (hotels.length > 0) {
          // Nếu là admin/business, chọn hotel đầu tiên
          this.selectedHotelId = hotels[0]._id || null;
          if (hotels[0]._id) {
            this.loadHotelSettings(hotels[0]._id);
          }
        }
        this.loadingHotels = false;
      },
      error: (error) => {
        console.error('Error loading hotels:', error);
        this.loadingHotels = false;
      }
    });
  }
  
  onHotelChange(hotelId: string): void {
    this.selectedHotelId = hotelId;
    this.loadHotelSettings(hotelId);
  }
  
  private loadHotelSettings(hotelId: string): void {
    if (!hotelId) return;
    
    this.hotelService.getHotelById(hotelId).subscribe({
      next: (hotel) => {
        this.currentHotelSettings = hotel.settings || {};
        this.hotelQRPaymentForm.patchValue({
          enableQRPaymentForBankTransfer: this.currentHotelSettings.enableQRPaymentForBankTransfer || false
        });
        this.hotelFeaturesForm.patchValue({
          enableOTAManagement: this.currentHotelSettings.enableOTAManagement || false,
          enableEmailManagement: this.currentHotelSettings.enableEmailManagement || false,
          enableElectricManagement: this.currentHotelSettings.enableElectricManagement || false,
          enablePayPalPayment: this.currentHotelSettings.enablePayPalPayment || false,
          enableCryptoPayment: this.currentHotelSettings.enableCryptoPayment || false,
          enableDraftInvoice: this.currentHotelSettings.enableDraftInvoice || false,
          enableExportInvoice: this.currentHotelSettings.enableExportInvoice || false,
          enableAiChatbox: this.currentHotelSettings.enableAiChatbox || false
        });
        
        // Load hotel notification settings
        if (this.currentHotelSettings.notificationSettings) {
          this.hotelNotificationForm.patchValue(this.currentHotelSettings.notificationSettings);
        } else {
          // Nếu không có, sử dụng giá trị mặc định từ system notification settings
          this.settingsService.getAllSettings().subscribe({
            next: (response) => {
              if (response.success && response.data?.notificationSettings) {
                this.hotelNotificationForm.patchValue(response.data.notificationSettings);
              }
            }
          });
        }
      },
      error: (error) => {
        console.error('Error loading hotel settings:', error);
        this.message.error('Lỗi khi tải cài đặt khách sạn');
      }
    });
  }
  
  saveHotelQRPaymentSettings(): void {
    if (!this.selectedHotelId) {
      this.message.warning('Vui lòng chọn khách sạn');
      return;
    }
    
    this.saving = true;
    const settings = {
      ...this.currentHotelSettings,
      enableQRPaymentForBankTransfer: this.hotelQRPaymentForm.value.enableQRPaymentForBankTransfer
    };
    
    this.hotelService.updateHotelSettings(this.selectedHotelId, settings).subscribe({
      next: (response) => {
        this.saving = false;
        this.message.success(response.message || 'Đã lưu cài đặt QR thanh toán cho khách sạn');
        this.currentHotelSettings = response.settings || {};
      },
      error: (error) => {
        this.saving = false;
        this.message.error(error.error?.message || 'Lỗi khi lưu cài đặt QR thanh toán');
      }
    });
  }
  
  saveHotelFeaturesSettings(): void {
    if (!this.selectedHotelId) {
      this.message.warning('Vui lòng chọn khách sạn');
      return;
    }
    
    this.saving = true;
    const settings = {
      ...this.currentHotelSettings,
      enableOTAManagement: this.hotelFeaturesForm.value.enableOTAManagement,
      enableEmailManagement: this.hotelFeaturesForm.value.enableEmailManagement,
      enableElectricManagement: this.hotelFeaturesForm.value.enableElectricManagement,
      enablePayPalPayment: this.hotelFeaturesForm.value.enablePayPalPayment,
      enableCryptoPayment: this.hotelFeaturesForm.value.enableCryptoPayment,
      enableDraftInvoice: this.hotelFeaturesForm.value.enableDraftInvoice,
      enableExportInvoice: this.hotelFeaturesForm.value.enableExportInvoice,
      enableAiChatbox: this.hotelFeaturesForm.value.enableAiChatbox
    };
    
    this.hotelService.updateHotelSettings(this.selectedHotelId, settings).subscribe({
      next: (response) => {
        this.saving = false;
        this.message.success(response.message || 'Đã lưu cài đặt tính năng cho khách sạn');
        this.currentHotelSettings = response.settings || {};
      },
      error: (error) => {
        this.saving = false;
        this.message.error(error.error?.message || 'Lỗi khi lưu cài đặt tính năng');
      }
    });
  }
  
  toggleAllFeatures(value: boolean): void {
    this.hotelFeaturesForm.patchValue({
      enableOTAManagement: value,
      enableEmailManagement: value,
      enableElectricManagement: value,
      enablePayPalPayment: value,
      enableCryptoPayment: value,
      enableDraftInvoice: value,
      enableExportInvoice: value,
      enableAiChatbox: value
    });
  }
  
  saveHotelNotificationSettings(): void {
    if (!this.selectedHotelId) {
      this.message.warning('Vui lòng chọn khách sạn');
      return;
    }
    
    if (this.hotelNotificationForm.invalid) {
      this.markFormGroupTouched(this.hotelNotificationForm);
      this.message.error('Vui lòng kiểm tra lại các trường bắt buộc');
      return;
    }
    
    this.saving = true;
    const settings = {
      ...this.currentHotelSettings,
      notificationSettings: this.hotelNotificationForm.value
    };
    
    this.hotelService.updateHotelSettings(this.selectedHotelId, settings).subscribe({
      next: (response) => {
        this.saving = false;
        this.message.success(response.message || 'Đã lưu cài đặt thông báo cho khách sạn');
        this.currentHotelSettings = response.settings || {};
      },
      error: (error) => {
        this.saving = false;
        this.message.error(error.error?.message || 'Lỗi khi lưu cài đặt thông báo');
      }
    });
  }
  
  canManageHotelSettings(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() || 
           this.authService.isHotelManager();
  }
  
  // ============ ANNOUNCEMENTS MANAGEMENT ============
  
  loadAnnouncements(): void {
    this.loadingAnnouncements = true;
    this.notificationsService.getAnnouncements().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.announcements = response.data;
        }
        this.loadingAnnouncements = false;
      },
      error: (error) => {
        console.error('Error loading announcements:', error);
        this.loadingAnnouncements = false;
      }
    });
  }
  
  loadBusinesses(): void {
    this.businessService.getBusinesses().subscribe({
      next: (businesses) => {
        this.businesses = businesses;
      },
      error: (error) => {
        console.error('Error loading businesses:', error);
      }
    });
  }
  
  openAnnouncementModal(announcement?: Announcement): void {
    this.editingAnnouncement = announcement || null;
    
    if (announcement) {
      // Edit mode
      this.announcementForm.patchValue({
        type: announcement.type,
        title: announcement.title,
        message: announcement.message,
        priority: announcement.priority,
        startDate: announcement.startDate ? new Date(announcement.startDate) : new Date(),
        endDate: announcement.endDate ? new Date(announcement.endDate) : null,
        isActive: announcement.isActive,
        targetType: announcement.targetType || 'system',
        targetRoles: announcement.targetRoles || [],
        targetBusinesses: announcement.targetBusinesses || [],
        targetHotels: announcement.targetHotels || [],
        notificationType: announcement.notificationType || 'general'
      });
    } else {
      // Create mode
      this.announcementForm.reset({
        type: 'info',
        title: '',
        message: '',
        priority: 'medium',
        startDate: new Date(),
        endDate: null,
        isActive: true,
        targetType: 'system',
        targetRoles: [],
        targetBusinesses: [],
        targetHotels: [],
        notificationType: 'general'
      });
    }
    
    this.isAnnouncementModalVisible = true;
  }
  
  closeAnnouncementModal(): void {
    this.isAnnouncementModalVisible = false;
    this.editingAnnouncement = null;
    this.announcementForm.reset();
  }
  
  saveAnnouncement(): void {
    if (this.announcementForm.invalid) {
      this.markFormGroupTouched(this.announcementForm);
      this.message.error('Vui lòng điền đầy đủ thông tin bắt buộc');
      return;
    }
    
    const formValue = this.announcementForm.value;
    const announcementData: Partial<Announcement> = {
      type: formValue.type,
      title: formValue.title,
      message: formValue.message,
      priority: formValue.priority,
      startDate: formValue.startDate,
      endDate: formValue.endDate || null,
      isActive: formValue.isActive,
      targetType: formValue.targetType,
      targetRoles: formValue.targetRoles || [],
      targetBusinesses: formValue.targetBusinesses || [],
      targetHotels: formValue.targetHotels || [],
      notificationType: formValue.notificationType || 'general'
    };
    
    if (this.editingAnnouncement) {
      // Update
      this.notificationsService.updateAnnouncement(this.editingAnnouncement.id, announcementData).subscribe({
        next: () => {
          this.message.success('Đã cập nhật thông báo thành công');
          this.closeAnnouncementModal();
          this.loadAnnouncements();
        },
        error: (error) => {
          this.message.error(error.error?.message || 'Lỗi khi cập nhật thông báo');
        }
      });
    } else {
      // Create
      this.notificationsService.createAnnouncement(announcementData).subscribe({
        next: () => {
          this.message.success('Đã tạo thông báo thành công');
          this.closeAnnouncementModal();
          this.loadAnnouncements();
        },
        error: (error) => {
          this.message.error(error.error?.message || 'Lỗi khi tạo thông báo');
        }
      });
    }
  }
  
  deleteAnnouncement(announcement: Announcement): void {
    this.notificationsService.deleteAnnouncement(announcement.id).subscribe({
      next: () => {
        this.message.success('Đã xóa thông báo thành công');
        this.loadAnnouncements();
      },
      error: (error) => {
        this.message.error(error.error?.message || 'Lỗi khi xóa thông báo');
      }
    });
  }
  
  getAnnouncementTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      'maintenance': 'Bảo trì',
      'update': 'Cập nhật',
      'info': 'Thông tin',
      'warning': 'Cảnh báo',
      'success': 'Thành công'
    };
    return labels[type] || type;
  }
  
  getTargetTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      'system': 'Hệ thống (Tất cả)',
      'business': 'Doanh nghiệp',
      'hotel': 'Khách sạn'
    };
    return labels[type] || type;
  }
  
  getNotificationTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      'general': 'Chung',
      'booking': 'Đặt phòng',
      'checkin': 'Check-in',
      'checkout': 'Check-out',
      'payment': 'Thanh toán',
      'cancellation': 'Hủy đặt phòng',
      'lowInventory': 'Hết hàng',
      'systemError': 'Lỗi hệ thống'
    };
    return labels[type] || type;
  }
  
  onTargetTypeChange(targetType: string): void {
    // Reset selections when changing target type
    if (targetType === 'system') {
      this.announcementForm.patchValue({
        targetBusinesses: [],
        targetHotels: []
      });
    } else if (targetType === 'business') {
      this.announcementForm.patchValue({
        targetHotels: []
      });
    } else if (targetType === 'hotel') {
      this.announcementForm.patchValue({
        targetBusinesses: []
      });
    }
  }
  
  getBusinessName(businessId: string): string {
    const business = this.businesses.find(b => b._id === businessId);
    return business ? business.name : businessId;
  }
  
  getHotelName(hotelId: string): string {
    const hotel = this.hotels.find(h => h._id === hotelId);
    return hotel ? hotel.name : hotelId;
  }

  /**
   * Tạo QR thanh toán SePay từ số tài khoản và tên ngân hàng
   * Tương tự như trong profile component
   */
  generateQrPayment(): void {
    const bankAccountFormGroup = this.paymentForm.get('bankAccount');
    if (!bankAccountFormGroup) {
      this.message.warning('Không tìm thấy form thông tin ngân hàng');
      return;
    }

    const bankName = bankAccountFormGroup.get('bankName')?.value?.trim();
    const accountNumber = bankAccountFormGroup.get('accountNumber')?.value?.trim();
    const beneficiaryName = bankAccountFormGroup.get('beneficiaryName')?.value?.trim() || '';

    if (!bankName || !accountNumber) {
      this.message.warning('Vui lòng nhập tên ngân hàng và số tài khoản');
      return;
    }

    // Tạo URL QR thanh toán SePay
    // Format: https://qr.sepay.vn/img?acc=SO_TAI_KHOAN&bank=NGAN_HANG
    const encodedAccount = encodeURIComponent(accountNumber);
    const encodedBank = encodeURIComponent(bankName);
    this.qrPaymentUrl = `https://qr.sepay.vn/img?acc=${encodedAccount}&bank=${encodedBank}`;
    
    // Lưu tên người thụ hưởng
    this.qrBeneficiaryName = beneficiaryName || bankAccountFormGroup.get('accountHolderName')?.value?.trim() || '';
    
    // Cập nhật vào form
    bankAccountFormGroup.patchValue({
      qrPaymentUrl: this.qrPaymentUrl,
      beneficiaryName: this.qrBeneficiaryName
    });
    
    this.showQrPreview = true;
    this.message.success('Đã tạo QR thanh toán thành công. Vui lòng bấm "Lưu cài đặt" để lưu vào hệ thống.');
  }

  /**
   * Xóa QR preview
   */
  clearQrPreview(): void {
    this.qrPaymentUrl = '';
    this.qrBeneficiaryName = '';
    this.showQrPreview = false;
    
    // Xóa trong form
    const bankAccountFormGroup = this.paymentForm.get('bankAccount');
    if (bankAccountFormGroup) {
      bankAccountFormGroup.patchValue({
        qrPaymentUrl: '',
        beneficiaryName: ''
      });
    }
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

