import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';
import { SettingsService, EmailSettings } from '../../services/settings.service';
import { AuthService } from '../../services/auth.service';
import { EmailService, EmailData } from '../../services/email.service';

@Component({
  selector: 'app-email-admin',
  templateUrl: './email-admin.component.html',
  styleUrls: ['./email-admin.component.css']
})
export class EmailAdminComponent implements OnInit {
  emailForm!: FormGroup;
  sendEmailForm!: FormGroup;
  loading = false;
  saving = false;
  testing = false;
  sending = false;
  testEmailAddress = '';

  emailProviders = [
    { value: 'resend', label: '', description: '' },
    { value: 'sendgrid', label: '', description: '' },
    { value: 'mailgun', label: '', description: '' },
    { value: 'aws-ses', label: '', description: '' },
    { value: 'nodemailer', label: '', description: '' }
  ];

  constructor(
    private fb: FormBuilder,
    private message: NzMessageService,
    private translate: TranslateService,
    private settingsService: SettingsService,
    private authService: AuthService,
    private emailService: EmailService
  ) {
    this.initForm();
    this.initSendEmailForm();
    this.refreshEmailProviders();
  }

  ngOnInit(): void {
    // Kiểm tra quyền truy cập
    if (!this.canAccess()) {
      this.message.error(this.translate.instant('EMAIL_ADMIN.MESSAGES.NO_ACCESS'));
      return;
    }

    this.translate.onLangChange.subscribe(() => this.refreshEmailProviders());
    this.loadEmailSettings();
  }

  private refreshEmailProviders(): void {
    this.emailProviders = [
      { value: 'resend', label: this.translate.instant('SETTINGS.EMAIL_PROVIDER_RESEND'), description: this.translate.instant('SETTINGS.EMAIL_PROVIDER_RESEND_DESC') },
      { value: 'sendgrid', label: this.translate.instant('SETTINGS.EMAIL_PROVIDER_SENDGRID'), description: this.translate.instant('SETTINGS.EMAIL_PROVIDER_SENDGRID_DESC') },
      { value: 'mailgun', label: this.translate.instant('SETTINGS.EMAIL_PROVIDER_MAILGUN'), description: this.translate.instant('SETTINGS.EMAIL_PROVIDER_MAILGUN_DESC') },
      { value: 'aws-ses', label: this.translate.instant('SETTINGS.EMAIL_PROVIDER_AWS_SES'), description: this.translate.instant('SETTINGS.EMAIL_PROVIDER_AWS_SES_DESC') },
      { value: 'nodemailer', label: this.translate.instant('SETTINGS.EMAIL_PROVIDER_NODEMAILER'), description: this.translate.instant('SETTINGS.EMAIL_PROVIDER_NODEMAILER_DESC') }
    ];
  }

  canAccess(): boolean {
    return this.authService.isSuperAdmin();
  }

  initForm(): void {
    this.emailForm = this.fb.group({
      emailEnabled: [true],
      emailProvider: ['nodemailer', [Validators.required]],
      // Nodemailer/SMTP
      smtpHost: ['smtp.gmail.com'],
      smtpPort: [587],
      smtpSecure: [false],
      smtpUser: [''],
      smtpPassword: [''],
      // Resend
      resendApiKey: [''],
      resendTemplateResetId: [''],
      resendTemplateResetAlias: [''],
      resendTemplateSubscriptionId: [''],
      resendTemplateSubscriptionAlias: [''],
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
      emailFromName: [this.translate.instant('SETTINGS.EMAIL_FROM_NAME_PLACEHOLDER')],
      emailReplyTo: [''],
      emailTestAddress: ['']
    });

    // Khi provider thay đổi, cập nhật validators
    this.emailForm.get('emailProvider')?.valueChanges.subscribe(provider => {
      this.updateValidators(provider);
    });
  }

  initSendEmailForm(): void {
    this.sendEmailForm = this.fb.group({
      to: ['', [Validators.required, Validators.email]],
      subject: ['', [Validators.required]],
      body: ['', [Validators.required]]
    });
  }

  updateValidators(provider: string): void {
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

  loadEmailSettings(): void {
    this.loading = true;
    this.settingsService.getSettingsByType('email').subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const emailData = { ...response.data } as EmailSettings;
          
          // Không load password/API keys nếu là '***'
          if (emailData.smtpPassword === '***') {
            emailData.smtpPassword = '';
          }
          if (emailData.resendApiKey === '***') {
            emailData.resendApiKey = '';
          }
          if (emailData.sendgridApiKey === '***') {
            emailData.sendgridApiKey = '';
          }
          if (emailData.mailgunApiKey === '***') {
            emailData.mailgunApiKey = '';
          }
          if (emailData.awsSecretAccessKey === '***') {
            emailData.awsSecretAccessKey = '';
          }
          
          // Đảm bảo emailProvider có giá trị mặc định
          if (!emailData.emailProvider) {
            emailData.emailProvider = 'nodemailer';
          }
          
          this.emailForm.patchValue(emailData);
          this.updateValidators(emailData.emailProvider);
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading email settings:', error);
        this.message.error(this.translate.instant('EMAIL_ADMIN.MESSAGES.LOAD_SETTINGS_ERROR'));
        this.loading = false;
      }
    });
  }

  saveEmailSettings(): void {
    if (this.emailForm.invalid) {
      Object.values(this.emailForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      this.message.warning(this.translate.instant('EMAIL_ADMIN.MESSAGES.REQUIRED_FIELDS'));
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
    // Chỉ gửi các trường của provider hiện tại, không gửi các trường của provider khác
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
        if (formValue.resendTemplateResetId && formValue.resendTemplateResetId.trim() !== '') {
          emailSettings.resendTemplateResetId = formValue.resendTemplateResetId;
        }
        if (formValue.resendTemplateResetAlias && formValue.resendTemplateResetAlias.trim() !== '') {
          emailSettings.resendTemplateResetAlias = formValue.resendTemplateResetAlias;
        }
        if (formValue.resendTemplateSubscriptionId && formValue.resendTemplateSubscriptionId.trim() !== '') {
          emailSettings.resendTemplateSubscriptionId = formValue.resendTemplateSubscriptionId;
        }
        if (formValue.resendTemplateSubscriptionAlias && formValue.resendTemplateSubscriptionAlias.trim() !== '') {
          emailSettings.resendTemplateSubscriptionAlias = formValue.resendTemplateSubscriptionAlias;
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
        if (response.success) {
          this.message.success(this.translate.instant('EMAIL_ADMIN.MESSAGES.SAVE_SUCCESS'));
          this.loadEmailSettings(); // Reload để có dữ liệu mới nhất
        } else {
          this.message.error(response.message || this.translate.instant('EMAIL_ADMIN.MESSAGES.SAVE_ERROR'));
        }
        this.saving = false;
      },
      error: (error) => {
        console.error('Error saving email settings:', error);
        this.message.error(this.translate.instant('EMAIL_ADMIN.MESSAGES.SAVE_ERROR'));
        this.saving = false;
      }
    });
  }

  testConnection(): void {
    if (this.emailForm.invalid) {
      this.message.warning(this.translate.instant('EMAIL_ADMIN.MESSAGES.REQUIRED_BEFORE_TEST'));
      return;
    }

    this.testing = true;
    const formValue = this.emailForm.value;
    
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
        if (response.success) {
          this.message.success(response.message || this.translate.instant('EMAIL_ADMIN.MESSAGES.CONNECT_SUCCESS'));
        } else {
          this.message.error(response.message || this.translate.instant('EMAIL_ADMIN.MESSAGES.CONNECT_ERROR'));
        }
        this.testing = false;
      },
      error: (error) => {
        console.error('Error testing email connection:', error);
        this.message.error(error.error?.message || this.translate.instant('EMAIL_ADMIN.MESSAGES.CONNECT_ERROR'));
        this.testing = false;
      }
    });
  }

  sendTestEmail(): void {
    if (!this.testEmailAddress || !this.testEmailAddress.includes('@')) {
      this.message.warning(this.translate.instant('EMAIL_ADMIN.MESSAGES.INVALID_TEST_EMAIL'));
      return;
    }

    if (this.emailForm.invalid) {
      this.message.warning(this.translate.instant('EMAIL_ADMIN.MESSAGES.REQUIRED_BEFORE_SEND_TEST'));
      return;
    }

    this.testing = true;
    const formValue = this.emailForm.value;
    
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

    this.settingsService.sendTestEmail(emailSettings, this.testEmailAddress).subscribe({
      next: (response) => {
        if (response.success) {
          this.message.success(response.message || this.translate.instant('EMAIL_ADMIN.MESSAGES.TEST_SEND_SUCCESS'));
        } else {
          this.message.error(response.message || this.translate.instant('EMAIL_ADMIN.MESSAGES.TEST_SEND_ERROR'));
        }
        this.testing = false;
      },
      error: (error) => {
        console.error('Error sending test email:', error);
        this.message.error(error.error?.message || this.translate.instant('EMAIL_ADMIN.MESSAGES.TEST_SEND_ERROR'));
        this.testing = false;
      }
    });
  }

  getCurrentProvider(): string {
    return this.emailForm.get('emailProvider')?.value || 'nodemailer';
  }

  showField(field: string): boolean {
    const provider = this.getCurrentProvider();
    
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

  sendEmail(): void {
    if (this.sendEmailForm.invalid) {
      Object.values(this.sendEmailForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      this.message.warning(this.translate.instant('EMAIL_ADMIN.MESSAGES.FILL_SEND_FORM'));
      return;
    }

    this.sending = true;
    const formValue = this.sendEmailForm.value;
    
    const emailData: EmailData = {
      to: formValue.to,
      subject: formValue.subject,
      body: formValue.body
    };

    this.emailService.sendEmail(emailData).subscribe({
      next: (response) => {
        this.sending = false;
        if (response.success || response.messageId) {
          this.message.success(this.translate.instant('EMAIL_ADMIN.MESSAGES.SEND_SUCCESS'));
          this.sendEmailForm.reset();
        } else {
          this.message.error(this.translate.instant('EMAIL_ADMIN.MESSAGES.SEND_ERROR'));
        }
      },
      error: (error) => {
        console.error('Error sending email:', error);
        this.message.error(error.error?.message || this.translate.instant('EMAIL_ADMIN.MESSAGES.SEND_ERROR'));
        this.sending = false;
      }
    });
  }
}
