import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  private apiUrl = 'https://nest-production-8106.up.railway.app/emails'; // Địa chỉ API của bạn

  constructor(private http: HttpClient) {}

  sendEmail(emailData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/send-email`, emailData);
  }

  sendOtp(to: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/send-otp`, { to });
  }

  loadOtp(): Observable<any> {
    return this.http.get(`${this.apiUrl}/load-otp`);
  }
}
