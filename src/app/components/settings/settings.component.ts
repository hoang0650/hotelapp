import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { SettingsService, EmailSettings } from '../../services/settings.service';
import {
  AiAssistantService,
  OpenClawDevicePairingItem
} from '../../services/ai-assistant.service';
import { NotificationsService, Announcement } from '../../services/notifications.service';
import { HotelService } from '../../services/hotel.service';
import { BusinessService } from '../../services/business.service';
import { PricingService } from '../../services/pricing.service';
import { PaymentSpeakerService } from '../../services/payment-speaker.service';
import { TranslateService } from '@ngx-translate/core';


@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit, OnDestroy {
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
  testingPaymentSpeaker = false;
  paymentSpeakerTestAmount = 100000;
  paymentSpeakerTestMessage = '';
  
  // Current user
  currentUser: any = null;
  
  // Hotel settings
  hotels: any[] = [];
  selectedHotelId: string | null = null;
  currentHotelSettings: any = null;
  loadingHotels = false;
  currentPackage: any = null; // Package đăng ký hiện tại
  packageFeatures: any = {}; // Các tính năng từ package (để disable checkbox)
  
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

  // Email providers - will be initialized in ngOnInit
  emailProviders: { value: string, label: string, description: string }[] = [];
  readonly systemAdminCapabilities: string[] = [
    'SETTINGS.CAP_ADMIN_1',
    'SETTINGS.CAP_ADMIN_2',
    'SETTINGS.CAP_ADMIN_3'
  ];
  readonly operatorCapabilities: string[] = [
    'SETTINGS.CAP_OPERATOR_1',
    'SETTINGS.CAP_OPERATOR_2',
    'SETTINGS.CAP_OPERATOR_3'
  ];
  readonly readonlyCapabilities: string[] = [
    'SETTINGS.CAP_READONLY_1',
    'SETTINGS.CAP_READONLY_2',
    'SETTINGS.CAP_READONLY_3'
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
    private businessService: BusinessService,
    private pricingService: PricingService,
    private paymentSpeakerService: PaymentSpeakerService,
    private translate: TranslateService,
    private aiAssistant: AiAssistantService
  ) {
    this.initForms();
  }

  ngOnInit(): void {
    this.initEmailProviders();
    this.paymentSpeakerTestMessage = this.translate.instant('SETTINGS.PAYMENT_SPEAKER_MESSAGE_PLACEHOLDER');
    if (!this.generalForm.get('maintenanceMessage')?.value) {
      this.generalForm.patchValue({
        maintenanceMessage: this.translate.instant('SETTINGS.MAINTENANCE_MESSAGE_PLACEHOLDER')
      });
    }
    this.loadCurrentUser();
    if (this.isManagementGroup()) {
      this.loadSettings();
    }
    this.loadHotels();
    if (this.authService.isSuperAdmin() || this.authService.isAdmin()) {
      this.loadAnnouncements();
      this.loadBusinesses();
    }
  }

  ngOnDestroy(): void {
    this.clearOpenClawApprovePoll();
  }

  private initEmailProviders(): void {
    this.emailProviders = [
      { value: 'resend', label: this.translate.instant('SETTINGS.EMAIL_PROVIDER_RESEND'), description: this.translate.instant('SETTINGS.EMAIL_PROVIDER_RESEND_DESC') },
      { value: 'sendgrid', label: this.translate.instant('SETTINGS.EMAIL_PROVIDER_SENDGRID'), description: this.translate.instant('SETTINGS.EMAIL_PROVIDER_SENDGRID_DESC') },
      { value: 'mailgun', label: this.translate.instant('SETTINGS.EMAIL_PROVIDER_MAILGUN'), description: this.translate.instant('SETTINGS.EMAIL_PROVIDER_MAILGUN_DESC') },
      { value: 'aws-ses', label: this.translate.instant('SETTINGS.EMAIL_PROVIDER_AWS_SES'), description: this.translate.instant('SETTINGS.EMAIL_PROVIDER_AWS_SES_DESC') },
      { value: 'nodemailer', label: this.translate.instant('SETTINGS.EMAIL_PROVIDER_NODEMAILER'), description: this.translate.instant('SETTINGS.EMAIL_PROVIDER_NODEMAILER_DESC') }
    ];
  }

  private initForms(): void {
    // System Settings Form
    this.systemForm = this.fb.group({
      systemName: ['Hotel Management System', Validators.required],
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
      emailFromName: ['Hotel Management System'],
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
      maintenanceMessage: [''],
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
      enablePaymentSpeaker: [false],
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
        this.message.error(this.translate.instant('SETTINGS.MESSAGES.LOAD_ERROR'));
        this.loading = false;
      }
    });
  }

  saveSystemSettings(): void {
    if (this.systemForm.invalid) {
      this.markFormGroupTouched(this.systemForm);
      this.message.error(this.translate.instant('SETTINGS.MESSAGES.REQUIRED_FIELDS'));
      return;
    }

    this.saving = true;
    const settings = this.systemForm.value;
    
    this.settingsService.updateSystemSettings(settings).subscribe({
      next: (response) => {
        this.saving = false;
        if (response.success) {
          this.message.success(response.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_SYSTEM_SUCCESS'));
        } else {
          this.message.error(response.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_SYSTEM_ERROR'));
        }
      },
      error: (error) => {
        this.saving = false;
        this.message.error(error.error?.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_SYSTEM_ERROR'));
      }
    });
  }

  saveEmailSettings(): void {
    if (this.emailForm.invalid) {
      this.markFormGroupTouched(this.emailForm);
      this.message.error(this.translate.instant('SETTINGS.MESSAGES.REQUIRED_FIELDS'));
      return;
    }

    this.saving = true;
    const formValue = this.emailForm.value;
    
    // Chỉ gửi các trường liên quan đến provider được chọn
    const emailSettings: Partial<EmailSettings> = {
      emailEnabled: formValue.emailEnabled,
      emailProvider: formValue.emailProvider,
      emailFrom: formValue.emailFrom,
      emailFromName: formValue.emailFromName || this.translate.instant('SETTINGS.EMAIL_FROM_NAME_PLACEHOLDER'),
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
          this.message.success(response.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_EMAIL_SUCCESS'));
          // Cập nhật lại form với password đã được ẩn
          if (response.data) {
            this.emailForm.patchValue(response.data);
          }
        } else {
          this.message.error(response.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_EMAIL_ERROR'));
        }
      },
      error: (error) => {
        this.saving = false;
        this.message.error(error.error?.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_EMAIL_ERROR'));
      }
    });
  }

  savePaymentSettings(): void {
    if (this.paymentForm.invalid) {
      this.markFormGroupTouched(this.paymentForm);
      this.message.error(this.translate.instant('SETTINGS.MESSAGES.REQUIRED_FIELDS'));
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
          this.message.success(response.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_PAYMENT_SUCCESS'));
        } else {
          this.message.error(response.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_PAYMENT_ERROR'));
        }
      },
      error: (error) => {
        this.saving = false;
        console.error('Error saving payment settings:', error);
        this.message.error(error.error?.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_PAYMENT_ERROR'));
      }
    });
  }

  saveNotificationSettings(): void {
    if (this.notificationForm.invalid) {
      this.markFormGroupTouched(this.notificationForm);
      this.message.error(this.translate.instant('SETTINGS.MESSAGES.REQUIRED_FIELDS'));
      return;
    }

    this.saving = true;
    const settings = this.notificationForm.value;
    
    this.settingsService.updateNotificationSettings(settings).subscribe({
      next: (response) => {
        this.saving = false;
        if (response.success) {
          this.message.success(response.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_NOTIFICATION_SUCCESS'));
        } else {
          this.message.error(response.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_NOTIFICATION_ERROR'));
        }
      },
      error: (error) => {
        this.saving = false;
        this.message.error(error.error?.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_NOTIFICATION_ERROR'));
      }
    });
  }

  saveGeneralSettings(): void {
    if (this.generalForm.invalid) {
      this.markFormGroupTouched(this.generalForm);
      this.message.error(this.translate.instant('SETTINGS.MESSAGES.REQUIRED_FIELDS'));
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
    
    // Lấy giá trị maintenance mode hiện tại từ in-memory hoặc form
    const previousMaintenanceMode = this.notificationsService.isMaintenanceMode() || 
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
          this.message.success(response.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_GENERAL_SUCCESS'));
          
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
          this.message.error(response.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_GENERAL_ERROR'));
        }
      },
      error: (error) => {
        this.saving = false;
        console.error('Error saving general settings:', error);
        this.message.error(error.error?.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_GENERAL_ERROR'));
      }
    });
  }

  private handleMaintenanceModeDisabled(): void {
    this.notificationsService.clearMaintenanceMode();
    
    // Reload notifications để cập nhật trạng thái
    this.notificationsService.loadAnnouncements();
    
    // Broadcast event để các component khác biết
    window.dispatchEvent(new CustomEvent('maintenanceModeChanged', { 
      detail: { enabled: false } 
    }));
    
    this.message.success(this.translate.instant('SETTINGS.MESSAGES.MAINTENANCE_OFF'));
  }

  private handleMaintenanceModeEnabled(maintenanceMessage?: string): void {
    this.notificationsService.setMaintenanceMode(true, maintenanceMessage || null);
    
    // Reload notifications để cập nhật trạng thái
    this.notificationsService.loadAnnouncements();
    
    // Broadcast event để các component khác biết
    window.dispatchEvent(new CustomEvent('maintenanceModeChanged', { 
      detail: { enabled: true, message: maintenanceMessage } 
    }));
  }

  testEmailConnection(): void {
    if (this.emailForm.invalid) {
      this.message.error(this.translate.instant('SETTINGS.MESSAGES.EMAIL_INFO_REQUIRED'));
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
          this.message.success(response.message || this.translate.instant('SETTINGS.MESSAGES.EMAIL_CONNECT_SUCCESS'));
        } else {
          this.message.error(response.message || this.translate.instant('SETTINGS.MESSAGES.EMAIL_CONNECT_ERROR'));
        }
      },
      error: (error) => {
        this.loading = false;
        this.message.error(error.error?.message || this.translate.instant('SETTINGS.MESSAGES.EMAIL_CONNECT_ERROR'));
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
      this.message.error(this.translate.instant('SETTINGS.MESSAGES.EMAIL_TEST_ADDRESS_REQUIRED'));
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
          this.message.success(response.message || this.translate.instant('SETTINGS.MESSAGES.EMAIL_TEST_SENT', { address: testAddress }));
        } else {
          this.message.error(response.message || this.translate.instant('SETTINGS.MESSAGES.EMAIL_TEST_ERROR'));
        }
      },
      error: (error) => {
        this.loading = false;
        this.message.error(error.error?.message || this.translate.instant('SETTINGS.MESSAGES.EMAIL_TEST_ERROR'));
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
    this.message.info(this.translate.instant('SETTINGS.MESSAGES.RESET_DEFAULT_SUCCESS'));
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
        
        // Load package info để kiểm tra tính năng
        this.loadPackageFeatures(hotel, () => {
          // Sau khi load package xong, mới load hotel features
          this.hotelQRPaymentForm.patchValue({
            enableQRPaymentForBankTransfer: this.currentHotelSettings.enableQRPaymentForBankTransfer || false
          });
          
          // Load hotel features với logic tự động bật từ package
          this.loadHotelFeaturesWithPackageLogic();
        });
        
        // Load hotel notification settings (giữ enablePaymentSpeaker tường minh)
        if (this.currentHotelSettings.notificationSettings) {
          this.patchHotelNotificationForm(this.currentHotelSettings.notificationSettings);
          this.paymentSpeakerService.setEnabled(
            hotelId,
            !!this.currentHotelSettings.notificationSettings.enablePaymentSpeaker
          );
        } else {
          // Nếu không có, dùng system defaults nhưng không ghi đè enablePaymentSpeaker
          this.paymentSpeakerService.setEnabled(hotelId, false);
          this.settingsService.getAllSettings().subscribe({
            next: (response) => {
              if (response.success && response.data?.notificationSettings) {
                this.patchHotelNotificationForm({
                  ...response.data.notificationSettings,
                  enablePaymentSpeaker: false
                });
              }
            }
          });
        }
      },
      error: (error) => {
        console.error('Error loading hotel settings:', error);
        this.message.error(this.translate.instant('SETTINGS.MESSAGES.LOAD_HOTEL_ERROR'));
      }
    });
  }
  
  private loadPackageFeatures(hotel: any, callback?: () => void): void {
    // Lấy userId từ hotel (có thể là ownerId, userId, hoặc từ currentUser)
    const userId = hotel.userId || hotel.ownerId || this.currentUser?._id;
    
    if (!userId) {
      this.currentPackage = null;
      this.packageFeatures = {};
      if (callback) callback();
      return;
    }
    
    // Load package của user
    this.pricingService.getCurrentUserPackage(userId).subscribe({
      next: (response: any) => {
        const packageData = response.data || response;
        if (packageData && (packageData._id || packageData.id)) {
          this.currentPackage = packageData;
          
          // Map các tính năng từ package
          this.packageFeatures = {
            enableOTAManagement: packageData.otaManagementFeature || false,
            enableEmailManagement: packageData.emailManagementFeature || false,
            enableElectricManagement: packageData.electricManagementFeature || false,
            enablePayPalPayment: packageData.paypalPaymentFeature || false,
            enableCryptoPayment: packageData.cryptoPaymentFeature || false,
            enableDraftInvoice: packageData.draftInvoiceFeature || false,
            enableExportInvoice: packageData.exportInvoiceFeature || false,
            enableAiChatbox: packageData.aiChatboxFeature || false,
            enableQRPaymentForBankTransfer: packageData.qrPaymentFeature || false
          };
        } else {
          this.currentPackage = null;
          this.packageFeatures = {};
        }
        if (callback) callback();
      },
      error: (error) => {
        // Nếu không có package, không có tính năng nào từ package
        console.log('No package found for user:', userId);
        this.currentPackage = null;
        this.packageFeatures = {};
        if (callback) callback();
      }
    });
  }
  
  private loadHotelFeaturesWithPackageLogic(): void {
    const settings = this.currentHotelSettings;
    
    // Nếu package có tính năng, tự động bật (override hotel settings)
    const features = {
      enableOTAManagement: this.packageFeatures.enableOTAManagement || settings.enableOTAManagement || false,
      enableEmailManagement: this.packageFeatures.enableEmailManagement || settings.enableEmailManagement || false,
      enableElectricManagement: this.packageFeatures.enableElectricManagement || settings.enableElectricManagement || false,
      enablePayPalPayment: this.packageFeatures.enablePayPalPayment || settings.enablePayPalPayment || false,
      enableCryptoPayment: this.packageFeatures.enableCryptoPayment || settings.enableCryptoPayment || false,
      enableDraftInvoice: this.packageFeatures.enableDraftInvoice || settings.enableDraftInvoice || false,
      enableExportInvoice: this.packageFeatures.enableExportInvoice || settings.enableExportInvoice || false,
      enableAiChatbox: this.packageFeatures.enableAiChatbox || settings.enableAiChatbox || false
    };
    
    this.hotelFeaturesForm.patchValue(features);
  }
  
  saveHotelQRPaymentSettings(): void {
    if (!this.selectedHotelId) {
      this.message.warning(this.translate.instant('SETTINGS.MESSAGES.SELECT_HOTEL_WARNING'));
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
        this.message.success(response.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_QR_SUCCESS'));
        this.currentHotelSettings = response.settings || {};
      },
      error: (error) => {
        this.saving = false;
        this.message.error(error.error?.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_QR_ERROR'));
      }
    });
  }
  
  saveHotelFeaturesSettings(): void {
    if (!this.selectedHotelId) {
      this.message.warning(this.translate.instant('SETTINGS.MESSAGES.SELECT_HOTEL_WARNING'));
      return;
    }
    
    this.saving = true;
    const formValue = this.hotelFeaturesForm.value;
    
    // Đảm bảo các tính năng từ package luôn được bật (không thể tắt)
    const settings = {
      ...this.currentHotelSettings,
      enableOTAManagement: this.packageFeatures.enableOTAManagement || formValue.enableOTAManagement,
      enableEmailManagement: this.packageFeatures.enableEmailManagement || formValue.enableEmailManagement,
      enableElectricManagement: this.packageFeatures.enableElectricManagement || formValue.enableElectricManagement,
      enablePayPalPayment: this.packageFeatures.enablePayPalPayment || formValue.enablePayPalPayment,
      enableCryptoPayment: this.packageFeatures.enableCryptoPayment || formValue.enableCryptoPayment,
      enableDraftInvoice: this.packageFeatures.enableDraftInvoice || formValue.enableDraftInvoice,
      enableExportInvoice: this.packageFeatures.enableExportInvoice || formValue.enableExportInvoice,
      enableAiChatbox: this.packageFeatures.enableAiChatbox || formValue.enableAiChatbox
    };
    
    this.hotelService.updateHotelSettings(this.selectedHotelId, settings).subscribe({
      next: (response) => {
        this.saving = false;
        this.message.success(response.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_HOTEL_FEATURES_SUCCESS'));
        this.currentHotelSettings = response.settings || {};
        window.dispatchEvent(new CustomEvent('paymentSettingsChanged', { detail: { enablePayPalPayment: settings.enablePayPalPayment, enableCryptoPayment: settings.enableCryptoPayment } }));
        // Reload để cập nhật UI
        this.loadHotelSettings(this.selectedHotelId!);
      },
      error: (error) => {
        this.saving = false;
      }
    });
  }
  
  toggleAllFeatures(value: boolean): void {
    // Chỉ toggle các tính năng không bắt buộc từ package
    const features: any = {};
    
    // Chỉ set value cho các tính năng không có trong package
    if (!this.packageFeatures.enableOTAManagement) {
      features.enableOTAManagement = value;
    }
    if (!this.packageFeatures.enableEmailManagement) {
      features.enableEmailManagement = value;
    }
    if (!this.packageFeatures.enableElectricManagement) {
      features.enableElectricManagement = value;
    }
    if (!this.packageFeatures.enablePayPalPayment) {
      features.enablePayPalPayment = value;
    }
    if (!this.packageFeatures.enableCryptoPayment) {
      features.enableCryptoPayment = value;
    }
    if (!this.packageFeatures.enableDraftInvoice) {
      features.enableDraftInvoice = value;
    }
    if (!this.packageFeatures.enableExportInvoice) {
      features.enableExportInvoice = value;
    }
    if (!this.packageFeatures.enableAiChatbox) {
      features.enableAiChatbox = value;
    }
    
    // Nếu bật tất cả, cũng bật các tính năng từ package
    if (value) {
      features.enableOTAManagement = this.packageFeatures.enableOTAManagement || value;
      features.enableEmailManagement = this.packageFeatures.enableEmailManagement || value;
      features.enableElectricManagement = this.packageFeatures.enableElectricManagement || value;
      features.enablePayPalPayment = this.packageFeatures.enablePayPalPayment || value;
      features.enableCryptoPayment = this.packageFeatures.enableCryptoPayment || value;
      features.enableDraftInvoice = this.packageFeatures.enableDraftInvoice || value;
      features.enableExportInvoice = this.packageFeatures.enableExportInvoice || value;
      features.enableAiChatbox = this.packageFeatures.enableAiChatbox || value;
    }
    
    this.hotelFeaturesForm.patchValue(features);
  }
  
  // Helper method để check xem tính năng có bị disable bởi package không
  isFeatureDisabledByPackage(featureName: string): boolean {
    return this.packageFeatures[featureName] === true;
  }
  
  private patchHotelNotificationForm(raw: any): void {
    const src = raw || {};
    this.hotelNotificationForm.patchValue({
      enableEmailNotifications: src.enableEmailNotifications !== false,
      enableSMSNotifications: !!src.enableSMSNotifications,
      enablePushNotifications: src.enablePushNotifications !== false,
      enablePaymentSpeaker: !!src.enablePaymentSpeaker,
      notifyOnBooking: src.notifyOnBooking !== false,
      notifyOnCheckin: src.notifyOnCheckin !== false,
      notifyOnCheckout: src.notifyOnCheckout !== false,
      notifyOnPayment: src.notifyOnPayment !== false,
      notifyOnCancellation: src.notifyOnCancellation !== false,
      notifyOnLowInventory: src.notifyOnLowInventory !== false,
      notifyOnSystemError: src.notifyOnSystemError !== false,
      notificationEmail: src.notificationEmail || ''
    });
  }

  private buildHotelNotificationSettingsPayload(): Record<string, any> {
    const formValue = this.hotelNotificationForm.getRawValue();
    return {
      enableEmailNotifications: !!formValue.enableEmailNotifications,
      enableSMSNotifications: !!formValue.enableSMSNotifications,
      enablePushNotifications: !!formValue.enablePushNotifications,
      enablePaymentSpeaker: !!formValue.enablePaymentSpeaker,
      notifyOnBooking: !!formValue.notifyOnBooking,
      notifyOnCheckin: !!formValue.notifyOnCheckin,
      notifyOnCheckout: !!formValue.notifyOnCheckout,
      notifyOnPayment: !!formValue.notifyOnPayment,
      notifyOnCancellation: !!formValue.notifyOnCancellation,
      notifyOnLowInventory: !!formValue.notifyOnLowInventory,
      notifyOnSystemError: !!formValue.notifyOnSystemError,
      notificationEmail: String(formValue.notificationEmail || '').trim()
    };
  }

  onPaymentSpeakerTestAmountChange(value: number | string): void {
    const amount = Math.round(Number(value) || 0);
    this.paymentSpeakerTestAmount = amount > 0 ? amount : 0;
    if (this.paymentSpeakerTestAmount > 0) {
      const formatted = this.paymentSpeakerTestAmount.toLocaleString('vi-VN');
      this.paymentSpeakerTestMessage = this.translate.instant('SETTINGS.PAYMENT_SPEAKER_TEST_TEMPLATE', { amount: formatted });
    }
  }

  testPaymentSpeaker(): void {
    const message = String(this.paymentSpeakerTestMessage || '').trim();
    if (!message) {
      this.message.warning(this.translate.instant('SETTINGS.MESSAGES.SPEAKER_MESSAGE_REQUIRED'));
      return;
    }

    this.testingPaymentSpeaker = true;
    this.message.loading(this.translate.instant('SETTINGS.MESSAGES.TTS_LOADING'), { nzDuration: 0 });
    this.paymentSpeakerService.testSpeakViaAiTts(message).subscribe({
      next: () => {
        this.testingPaymentSpeaker = false;
        this.message.remove();
        this.message.success(this.translate.instant('SETTINGS.MESSAGES.EDGE_TTS_OK'));
      },
      error: (error) => {
        this.testingPaymentSpeaker = false;
        this.message.remove();
        const detail =
          error?.error?.error ||
          error?.error?.detail ||
          error?.message ||
          this.translate.instant('SETTINGS.MESSAGES.TTS_UNREACHABLE');
        this.message.error(this.translate.instant('SETTINGS.MESSAGES.LISTEN_FAIL', { detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }));
      }
    });
  }

  saveHotelNotificationSettings(): void {
    if (!this.selectedHotelId) {
      this.message.warning(this.translate.instant('SETTINGS.MESSAGES.SELECT_HOTEL_WARNING'));
      return;
    }
    
    if (this.hotelNotificationForm.invalid) {
      this.markFormGroupTouched(this.hotelNotificationForm);
      this.message.error(this.translate.instant('SETTINGS.MESSAGES.REQUIRED_FIELDS'));
      return;
    }
    
    this.saving = true;
    const notificationSettings = this.buildHotelNotificationSettingsPayload();
    const settings = {
      ...(this.currentHotelSettings || {}),
      notificationSettings
    };
    
    this.hotelService.updateHotelSettings(this.selectedHotelId, settings).subscribe({
      next: (response) => {
        this.saving = false;
        this.message.success(response.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_HOTEL_NOTIFICATION_SUCCESS'));
        this.currentHotelSettings = response.settings || settings;
        const savedNotificationSettings =
          this.currentHotelSettings?.notificationSettings || notificationSettings;
        this.patchHotelNotificationForm(savedNotificationSettings);

        const enabled = !!savedNotificationSettings.enablePaymentSpeaker;
        this.paymentSpeakerService.setEnabled(this.selectedHotelId, enabled);
        window.dispatchEvent(new CustomEvent('hotelPaymentSpeakerChanged', {
          detail: {
            hotelId: this.selectedHotelId,
            enabled
          }
        }));
      },
      error: (error) => {
        this.saving = false;
        this.message.error(error.error?.message || this.translate.instant('SETTINGS.MESSAGES.SAVE_NOTIFICATION_ERROR'));
      }
    });
  }
  
  canManageHotelSettings(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() || 
           this.authService.isHotelManager();
  }

  canAccessScopedSettings(): boolean {
    return this.isManagementGroup() ||
      this.authService.isBusiness() ||
      this.authService.isHotelManager() ||
      this.authService.isStaff();
  }

  isManagementGroup(): boolean {
    return this.authService.isSuperAdmin() || this.authService.isAdmin();
  }

  isUserGroup(): boolean {
    return this.authService.isBusiness() ||
           this.authService.isHotelManager() ||
           this.authService.isStaff() ||
           this.authService.isGuest();
  }

  isReadOnlyUserGroup(): boolean {
    return this.authService.isStaff() || this.authService.isGuest();
  }

  canViewHotelSettingsTab(): boolean {
    return this.canManageHotelSettings() || this.isReadOnlyUserGroup();
  }

  getSettingsPageTitle(): string {
    return this.translate.instant(this.isManagementGroup() ? 'SETTINGS.TITLE' : 'SETTINGS.TITLE_SCOPED');
  }

  getSettingsPageSubtitle(): string {
    if (this.isManagementGroup()) {
      return this.translate.instant('SETTINGS.SUBTITLE_ADMIN');
    }

    if (this.canManageHotelSettings()) {
      return this.translate.instant('SETTINGS.SUBTITLE_HOTEL');
    }

    return this.translate.instant('SETTINGS.SUBTITLE_READONLY');
  }

  getRoleGroupLabel(): string {
    if (this.isManagementGroup()) {
      return this.translate.instant('SETTINGS.ROLE_GROUP_ADMIN');
    }

    if (this.isUserGroup()) {
      return this.translate.instant('SETTINGS.ROLE_GROUP_USER');
    }

    return this.translate.instant('SETTINGS.ROLE_GROUP_DEFAULT');
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
      this.message.error(this.translate.instant('SETTINGS.MESSAGES.ANNOUNCEMENT_REQUIRED'));
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
          this.message.success(this.translate.instant('SETTINGS.MESSAGES.ANNOUNCEMENT_UPDATE_SUCCESS'));
          this.closeAnnouncementModal();
          this.loadAnnouncements();
        },
        error: (error) => {
          this.message.error(error.error?.message || this.translate.instant('SETTINGS.MESSAGES.ANNOUNCEMENT_UPDATE_ERROR'));
        }
      });
    } else {
      // Create
      this.notificationsService.createAnnouncement(announcementData).subscribe({
        next: () => {
          this.message.success(this.translate.instant('SETTINGS.MESSAGES.ANNOUNCEMENT_CREATE_SUCCESS'));
          this.closeAnnouncementModal();
          this.loadAnnouncements();
        },
        error: (error) => {
          this.message.error(error.error?.message || this.translate.instant('SETTINGS.MESSAGES.ANNOUNCEMENT_CREATE_ERROR'));
        }
      });
    }
  }
  
  deleteAnnouncement(announcement: Announcement): void {
    this.notificationsService.deleteAnnouncement(announcement.id).subscribe({
      next: () => {
        this.message.success(this.translate.instant('SETTINGS.MESSAGES.ANNOUNCEMENT_DELETE_SUCCESS'));
        this.loadAnnouncements();
      },
      error: (error) => {
        this.message.error(error.error?.message || this.translate.instant('SETTINGS.MESSAGES.ANNOUNCEMENT_DELETE_ERROR'));
      }
    });
  }
  
  getAnnouncementTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      'maintenance': 'SETTINGS.ANNOUNCEMENT_TYPE_MAINTENANCE',
      'update': 'SETTINGS.ANNOUNCEMENT_TYPE_UPDATE',
      'info': 'SETTINGS.ANNOUNCEMENT_TYPE_INFO',
      'warning': 'SETTINGS.ANNOUNCEMENT_TYPE_WARNING',
      'success': 'SETTINGS.ANNOUNCEMENT_TYPE_SUCCESS'
    };
    return this.translate.instant(labels[type] || type);
  }
  
  getTargetTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      'system': 'SETTINGS.TARGET_SYSTEM_ALL',
      'business': 'SETTINGS.TARGET_BUSINESS',
      'hotel': 'SETTINGS.TARGET_HOTEL'
    };
    return this.translate.instant(labels[type] || type);
  }
  
  getNotificationTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      'general': 'SETTINGS.NOTIF_TYPE_GENERAL',
      'booking': 'SETTINGS.NOTIF_TYPE_BOOKING',
      'checkin': 'SETTINGS.NOTIF_TYPE_CHECKIN',
      'checkout': 'SETTINGS.NOTIF_TYPE_CHECKOUT',
      'payment': 'SETTINGS.NOTIF_TYPE_PAYMENT',
      'cancellation': 'SETTINGS.NOTIF_TYPE_CANCELLATION',
      'lowInventory': 'SETTINGS.NOTIF_TYPE_LOW_INVENTORY',
      'systemError': 'SETTINGS.NOTIF_TYPE_SYSTEM_ERROR'
    };
    return this.translate.instant(labels[type] || type);
  }

  getPriorityLabel(priority: string): string {
    const labels: { [key: string]: string } = {
      'low': 'SETTINGS.PRIORITY_LOW',
      'medium': 'SETTINGS.PRIORITY_MEDIUM',
      'high': 'SETTINGS.PRIORITY_HIGH',
      'urgent': 'SETTINGS.PRIORITY_URGENT'
    };
    return this.translate.instant(labels[priority] || priority);
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
      this.message.warning(this.translate.instant('SETTINGS.MESSAGES.BANK_FORM_NOT_FOUND'));
      return;
    }

    const bankName = bankAccountFormGroup.get('bankName')?.value?.trim();
    const accountNumber = bankAccountFormGroup.get('accountNumber')?.value?.trim();
    const beneficiaryName = bankAccountFormGroup.get('beneficiaryName')?.value?.trim() || '';

    if (!bankName || !accountNumber) {
      this.message.warning(this.translate.instant('SETTINGS.MESSAGES.BANK_INFO_REQUIRED'));
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
    this.message.success(this.translate.instant('SETTINGS.MESSAGES.QR_CREATED'));
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

  facebookPages: any[] = [];
  loadingFacebook = false;
  loadingOpenClawPairings = false;
  approvingOpenClawPairing = false;
  openingOpenClaw = false;
  openClawPendingPairings: OpenClawDevicePairingItem[] = [];
  openClawPairedDevices: OpenClawDevicePairingItem[] = [];
  private openClawApprovePollTimer: ReturnType<typeof setInterval> | null = null;

  private getTenantIdForAI(): string {
    const u = this.authService.getCurrentUser();
    return (u?.hotelId || '').toString();
  }

  connectFanpage(): void {
    const tenantId = this.getTenantIdForAI();
    if (!tenantId) {
      this.message.error(this.translate.instant('SETTINGS.MESSAGES.FANPAGE_SELECT_HOTEL_CONNECT'));
      return;
    }
    this.aiAssistant.getFacebookOAuthUrl(tenantId).then(url => {
      if (url) {
        window.open(url, '_blank');
      }
    });
  }

  loadFacebookPages(): void {
    const tenantId = this.getTenantIdForAI();
    if (!tenantId) {
      this.message.error(this.translate.instant('SETTINGS.MESSAGES.FANPAGE_SELECT_HOTEL_LOAD'));
      return;
    }
    this.loadingFacebook = true;
    this.aiAssistant.getFacebookPages(tenantId).then(pages => {
      this.facebookPages = pages || [];
      this.loadingFacebook = false;
      if (!this.facebookPages.length) {
        this.message.info(this.translate.instant('SETTINGS.MESSAGES.FANPAGE_NONE'));
      }
    }).catch(() => {
      this.loadingFacebook = false;
      this.message.error(this.translate.instant('SETTINGS.MESSAGES.FANPAGE_LOAD_ERROR'));
    });
  }

  /**
   * Mở OpenClaw Control UI với token_gateway sẵn + auto-approve pairing (cùng flow AI chatbox).
   */
  openOpenClawControlUi(): void {
    if (!this.isManagementGroup()) {
      this.message.warning(this.translate.instant('SETTINGS.MESSAGES.OPENCLAW_ADMIN_ONLY_OPEN'));
      return;
    }
    if (this.openingOpenClaw) {
      return;
    }
    this.openingOpenClaw = true;
    this.clearOpenClawApprovePoll();
    const newTab = window.open('about:blank', '_blank');

    this.aiAssistant.getOpenClawDirectUrl(this.authService.getUserId() || undefined).subscribe({
      next: (res) => {
        this.openingOpenClaw = false;
        if (res?.success && res.url) {
          if (newTab) {
            newTab.location.href = res.url;
          } else {
            window.open(res.url, '_blank');
          }
          this.message.info(this.translate.instant('SETTINGS.MESSAGES.OPENCLAW_OPENING'));
          this.startOpenClawAutoApprovePolling(30, 1000);
        } else {
          if (newTab) {
            newTab.close();
          }
          this.message.error(res?.message || this.translate.instant('SETTINGS.MESSAGES.OPENCLAW_URL_ERROR'));
        }
      },
      error: (error) => {
        this.openingOpenClaw = false;
        if (newTab) {
          newTab.close();
        }
        this.message.error(error?.error?.message || error?.error?.detail || this.translate.instant('SETTINGS.MESSAGES.OPENCLAW_URL_FETCH_ERROR'));
      }
    });
  }

  private startOpenClawAutoApprovePolling(maxAttempts = 20, intervalMs = 1500): void {
    this.clearOpenClawApprovePoll();
    let attempts = 0;
    this.approvingOpenClawPairing = true;

    const tick = () => {
      attempts++;
      this.aiAssistant.approveOpenClawPairing().subscribe({
        next: (response) => {
          if (response?.success) {
            this.message.success(response?.message || this.translate.instant('SETTINGS.MESSAGES.OPENCLAW_AUTO_APPROVE'));
            this.approvingOpenClawPairing = false;
            this.clearOpenClawApprovePoll();
            this.loadOpenClawDevicePairings();
            return;
          }
          if (attempts >= maxAttempts) {
            this.approvingOpenClawPairing = false;
            this.clearOpenClawApprovePoll();
            this.message.info(this.translate.instant('SETTINGS.MESSAGES.OPENCLAW_NO_PENDING_MAYBE'));
            this.loadOpenClawDevicePairings();
          }
        },
        error: () => {
          if (attempts >= maxAttempts) {
            this.approvingOpenClawPairing = false;
            this.clearOpenClawApprovePoll();
          }
        }
      });
    };

    tick();
    this.openClawApprovePollTimer = setInterval(() => {
      if (attempts >= maxAttempts) {
        this.clearOpenClawApprovePoll();
        this.approvingOpenClawPairing = false;
        return;
      }
      tick();
    }, intervalMs);
  }

  private clearOpenClawApprovePoll(): void {
    if (this.openClawApprovePollTimer) {
      clearInterval(this.openClawApprovePollTimer);
      this.openClawApprovePollTimer = null;
    }
  }

  loadOpenClawDevicePairings(): void {
    if (!this.isManagementGroup()) {
      this.message.warning(this.translate.instant('SETTINGS.MESSAGES.OPENCLAW_ADMIN_ONLY_MANAGE'));
      return;
    }

    this.loadingOpenClawPairings = true;
    this.aiAssistant.getOpenClawPendingPairings().subscribe({
      next: (response) => {
        this.loadingOpenClawPairings = false;
        const data = (response as any)?.data;
        if (Array.isArray(data)) {
          this.openClawPendingPairings = data;
          this.openClawPairedDevices = [];
        } else if (data && typeof data === 'object') {
          this.openClawPendingPairings = Array.isArray(data.pending) ? data.pending : [];
          this.openClawPairedDevices = Array.isArray(data.paired)
            ? data.paired
            : (Array.isArray(data.devices) ? data.devices : []);
        } else {
          this.openClawPendingPairings = [];
          this.openClawPairedDevices = [];
        }
        if (!this.openClawPendingPairings.length) {
          this.message.info(this.translate.instant('SETTINGS.MESSAGES.OPENCLAW_NO_PENDING_INFO'));
        } else {
          this.message.success(this.translate.instant('SETTINGS.MESSAGES.OPENCLAW_PENDING_LOADED', { count: this.openClawPendingPairings.length }));
        }
      },
      error: (error) => {
        this.loadingOpenClawPairings = false;
        this.message.error(error?.error?.message || this.translate.instant('SETTINGS.MESSAGES.OPENCLAW_PENDING_LOAD_ERROR'));
      }
    });
  }

  approveLatestOpenClawPairing(requestId?: string): void {
    if (!this.isManagementGroup()) {
      this.message.warning(this.translate.instant('SETTINGS.MESSAGES.OPENCLAW_ADMIN_ONLY_APPROVE'));
      return;
    }

    this.approvingOpenClawPairing = true;
    this.aiAssistant.approveOpenClawPairing(requestId).subscribe({
      next: (response) => {
        this.approvingOpenClawPairing = false;
        if (response?.success) {
          this.message.success(response?.message || this.translate.instant('SETTINGS.MESSAGES.OPENCLAW_APPROVE_SUCCESS'));
        } else {
          this.message.info(response?.message || this.translate.instant('SETTINGS.MESSAGES.OPENCLAW_NO_PENDING_APPROVE'));
        }
        this.loadOpenClawDevicePairings();
      },
      error: (error) => {
        this.approvingOpenClawPairing = false;
        this.message.error(error?.error?.message || this.translate.instant('SETTINGS.MESSAGES.OPENCLAW_APPROVE_ERROR'));
      }
    });
  }

  getOpenClawPairingRequestedAt(item: OpenClawDevicePairingItem): Date | null {
    const timestamp =
      Number((item as any)?.requestedAtMs || 0) ||
      Number((item as any)?.updatedAtMs || 0) ||
      Number((item as any)?.ts || 0);
    return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : null;
  }
}

