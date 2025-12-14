import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SystemSettings {
  systemName: string;
  systemVersion: string;
  timezone: string;
  language: string;
  currency: string;
  dateFormat: string;
  timeFormat: string;
  autoBackup: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  maxBackupFiles: number;
  sessionTimeout: number;
  enableLogging: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface EmailSettings {
  emailEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword?: string;
  emailFrom: string;
  emailFromName: string;
  emailReplyTo: string;
  emailTestAddress: string;
}

export interface PaymentSettings {
  defaultPaymentMethod: 'cash' | 'bank_transfer' | 'card' | 'qr';
  enableCash: boolean;
  enableBankTransfer: boolean;
  enableCard: boolean;
  enableQR: boolean;
  enableCrypto: boolean;
  enablePayPal: boolean;
  autoReconcile: boolean;
  reconcileFrequency: 'hourly' | 'daily' | 'weekly';
  minimumBalanceAlert: number;
  paymentTimeout: number;
}

export interface NotificationSettings {
  enableEmailNotifications: boolean;
  enableSMSNotifications: boolean;
  enablePushNotifications: boolean;
  notifyOnBooking: boolean;
  notifyOnCheckin: boolean;
  notifyOnCheckout: boolean;
  notifyOnPayment: boolean;
  notifyOnCancellation: boolean;
  notifyOnLowInventory: boolean;
  notifyOnSystemError: boolean;
  notificationEmail: string;
}

export interface GeneralSettings {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  taxId: string;
  businessLicense: string;
  logo: string;
  favicon: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  allowRegistration: boolean;
  requireEmailVerification: boolean;
  enable2FA: boolean;
}

export interface SettingsResponse {
  success: boolean;
  message?: string;
  data: SystemSettings | EmailSettings | PaymentSettings | NotificationSettings | GeneralSettings | any;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private apiUrl = `${environment.apiUrl}/api/settings`;

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    // authenticateToken middleware expects "Bearer <token>" format
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    });
  }

  // Lấy tất cả settings
  getAllSettings(): Observable<SettingsResponse> {
    return this.http.get<SettingsResponse>(this.apiUrl, { headers: this.getHeaders() });
  }

  // Lấy settings theo loại
  getSettingsByType(type: 'system' | 'email' | 'payment' | 'notification' | 'general'): Observable<SettingsResponse> {
    return this.http.get<SettingsResponse>(`${this.apiUrl}/${type}`, { headers: this.getHeaders() });
  }

  // Cập nhật system settings
  updateSystemSettings(settings: Partial<SystemSettings>): Observable<SettingsResponse> {
    return this.http.put<SettingsResponse>(`${this.apiUrl}/system`, settings, { headers: this.getHeaders() });
  }

  // Cập nhật email settings
  updateEmailSettings(settings: Partial<EmailSettings>): Observable<SettingsResponse> {
    return this.http.put<SettingsResponse>(`${this.apiUrl}/email`, settings, { headers: this.getHeaders() });
  }

  // Cập nhật payment settings
  updatePaymentSettings(settings: Partial<PaymentSettings>): Observable<SettingsResponse> {
    return this.http.put<SettingsResponse>(`${this.apiUrl}/payment`, settings, { headers: this.getHeaders() });
  }

  // Cập nhật notification settings
  updateNotificationSettings(settings: Partial<NotificationSettings>): Observable<SettingsResponse> {
    return this.http.put<SettingsResponse>(`${this.apiUrl}/notification`, settings, { headers: this.getHeaders() });
  }

  // Cập nhật general settings
  updateGeneralSettings(settings: Partial<GeneralSettings>): Observable<SettingsResponse> {
    return this.http.put<SettingsResponse>(`${this.apiUrl}/general`, settings, { headers: this.getHeaders() });
  }

  // Test email connection
  testEmailConnection(emailSettings: Partial<EmailSettings>): Observable<SettingsResponse> {
    return this.http.post<SettingsResponse>(`${this.apiUrl}/email/test-connection`, emailSettings, { headers: this.getHeaders() });
  }

  // Send test email
  sendTestEmail(emailSettings: Partial<EmailSettings>, testAddress: string): Observable<SettingsResponse> {
    return this.http.post<SettingsResponse>(`${this.apiUrl}/email/send-test`, {
      emailSettings,
      testAddress
    }, { headers: this.getHeaders() });
  }
}

