import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface EmailData {
  to: string | string[];
  subject: string;
  body: string;
  html?: string;
  file?: {
    name: string;
    data: string;
  };
}

export interface OtpResponse {
  otp: string;
  message?: string;
}

export interface EmailHistory {
  email: string;
  subject?: string;
  otp?: string;
  date: Date | string;
  status?: 'sent' | 'failed' | 'pending';
}

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  private apiUrl = `${environment.apiUrl}/emails`;

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token || ''}`
    });
  }

  /**
   * Gửi email
   */
  sendEmail(emailData: EmailData): Observable<any> {
    return this.http.post(`${this.apiUrl}/send-email`, emailData, { 
      headers: this.getHeaders() 
    });
  }

  /**
   * Gửi OTP đến email
   */
  sendOtp(to: string): Observable<OtpResponse> {
    return this.http.post<OtpResponse>(`${this.apiUrl}/send-otp`, { to }, { 
      headers: this.getHeaders() 
    });
  }

  /**
   * Lấy danh sách OTP đã gửi (lịch sử email)
   */
  loadOtp(params?: { limit?: number; skip?: number; emailType?: string; status?: string }): Observable<EmailHistory[] | { success: boolean; data: EmailHistory[]; total: number }> {
    const queryParams: any = {};
    if (params?.limit) queryParams.limit = params.limit;
    if (params?.skip) queryParams.skip = params.skip;
    if (params?.emailType) queryParams.emailType = params.emailType;
    if (params?.status) queryParams.status = params.status;

    return this.http.get<EmailHistory[] | { success: boolean; data: EmailHistory[]; total: number }>(`${this.apiUrl}/load-otp`, { 
      headers: this.getHeaders(),
      params: queryParams
    });
  }
}
