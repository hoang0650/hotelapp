import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BankTransferService } from '../../services/bank-transfer.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { getCookie, removeCookie, setCookie } from '../../utils/cookie-storage';

@Component({
  selector: 'app-sepay-oauth2-callback',
  templateUrl: './sepay-oauth2-callback.component.html',
  styleUrls: ['./sepay-oauth2-callback.component.css']
})
export class SepayOAuth2CallbackComponent implements OnInit {
  isLoading = true;
  status: 'processing' | 'success' | 'error' = 'processing';
  message = 'Đang xử lý...';

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private bankTransferService: BankTransferService,
    private messageService: NzMessageService
  ) {}

  ngOnInit(): void {
    const code = this.route.snapshot.queryParams['code'];
    const state = this.route.snapshot.queryParams['state'];
    const error = this.route.snapshot.queryParams['error'];
    const errorDescription = this.route.snapshot.queryParams['error_description'];

    if (error) {
      this.handleError(error, errorDescription);
      return;
    }

    if (!code) {
      this.handleError('missing_code', 'Không nhận được authorization code từ SePay');
      return;
    }

    const savedState = getCookie('sepay_oauth2_state');
    const clientId = getCookie('sepay_client_id');
    const clientSecret = getCookie('sepay_client_secret');
    const redirectUri = getCookie('sepay_oauth2_redirect_uri');

    if (state && savedState && state !== savedState) {
      this.handleError('invalid_state', 'State không khớp. Có thể bị tấn công CSRF.');
      return;
    }

    if (!clientId || !clientSecret || !redirectUri) {
      this.handleError('missing_credentials', 'Thiếu thông tin client_id, client_secret hoặc redirect_uri. Vui lòng đăng nhập lại.');
      return;
    }

    this.exchangeToken(code, clientId, clientSecret, redirectUri);
  }

  private exchangeToken(code: string, clientId: string, clientSecret: string, redirectUri: string): void {
    this.status = 'processing';
    this.message = 'Đang đổi authorization code lấy access token...';

    this.bankTransferService.exchangeOAuth2Token({
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    }).subscribe({
      next: (response) => {
        if (response.success && response.access_token) {
          setCookie('sepay_access_token', response.access_token, { maxAgeSec: 7 * 24 * 60 * 60 });
          if (response.refresh_token) {
            setCookie('sepay_refresh_token', response.refresh_token, { maxAgeSec: 30 * 24 * 60 * 60 });
          }
          if (clientId) {
            setCookie('sepay_client_id', clientId);
          }
          if (clientSecret) {
            setCookie('sepay_client_secret', clientSecret);
          }

          removeCookie('sepay_oauth2_state');
          removeCookie('sepay_oauth2_redirect_uri');

          this.status = 'success';
          this.message = 'Đăng nhập thành công! Đang chuyển hướng...';
          this.messageService.success('Đăng nhập SePay thành công!');

          setTimeout(() => {
            this.router.navigate(['/admin/bank-transfer-history']);
          }, 2000);
        } else {
          this.handleError('invalid_response', 'Không nhận được access token từ SePay');
        }
      },
      error: (error) => {
        console.error('Error exchanging token:', error);
        const errorMsg = error.error?.error || error.error?.detail || error.message || 'Lỗi không xác định';
        this.handleError('exchange_failed', errorMsg);
      }
    });
  }

  private handleError(error: string, description?: string): void {
    this.status = 'error';
    this.message = description || `Lỗi: ${error}`;
    this.isLoading = false;
    this.messageService.error(this.message);

    removeCookie('sepay_oauth2_state');
    removeCookie('sepay_oauth2_redirect_uri');

    setTimeout(() => {
      this.router.navigate(['/admin/bank-transfer-history']);
    }, 5000);
  }
}
