import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BankTransferService } from '../../services/bank-transfer.service';
import { NzMessageService } from 'ng-zorro-antd/message';

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
    public router: Router, // Đổi thành public để sử dụng trong template
    private bankTransferService: BankTransferService,
    private messageService: NzMessageService
  ) {}

  ngOnInit(): void {
    // Lấy code và state từ query params
    const code = this.route.snapshot.queryParams['code'];
    const state = this.route.snapshot.queryParams['state'];
    const error = this.route.snapshot.queryParams['error'];
    const errorDescription = this.route.snapshot.queryParams['error_description'];

    // Kiểm tra lỗi từ SePay
    if (error) {
      this.handleError(error, errorDescription);
      return;
    }

    // Kiểm tra có code không
    if (!code) {
      this.handleError('missing_code', 'Không nhận được authorization code từ SePay');
      return;
    }

    // Lấy thông tin từ localStorage hoặc state
    const savedState = localStorage.getItem('sepay_oauth2_state');
    const clientId = localStorage.getItem('sepay_client_id');
    const clientSecret = localStorage.getItem('sepay_client_secret');
    const redirectUri = localStorage.getItem('sepay_oauth2_redirect_uri');

    // Verify state để tránh CSRF
    if (state && savedState && state !== savedState) {
      this.handleError('invalid_state', 'State không khớp. Có thể bị tấn công CSRF.');
      return;
    }

    // Kiểm tra có đủ thông tin không
    if (!clientId || !clientSecret || !redirectUri) {
      this.handleError('missing_credentials', 'Thiếu thông tin client_id, client_secret hoặc redirect_uri. Vui lòng đăng nhập lại.');
      return;
    }

    // Đổi code lấy access token
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
          // Lưu token vào localStorage
          localStorage.setItem('sepay_access_token', response.access_token);
          if (response.refresh_token) {
            localStorage.setItem('sepay_refresh_token', response.refresh_token);
          }
          if (clientId) {
            localStorage.setItem('sepay_client_id', clientId);
          }
          if (clientSecret) {
            localStorage.setItem('sepay_client_secret', clientSecret);
          }

          // Xóa state đã lưu
          localStorage.removeItem('sepay_oauth2_state');
          localStorage.removeItem('sepay_oauth2_redirect_uri');

          this.status = 'success';
          this.message = 'Đăng nhập thành công! Đang chuyển hướng...';
          this.messageService.success('Đăng nhập SePay thành công!');

          // Chuyển hướng về trang bank-transfer-history sau 2 giây
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

    // Xóa state và redirect_uri nếu có lỗi
    localStorage.removeItem('sepay_oauth2_state');
    localStorage.removeItem('sepay_oauth2_redirect_uri');

    // Chuyển hướng về trang bank-transfer-history sau 5 giây
    setTimeout(() => {
      this.router.navigate(['/admin/bank-transfer-history']);
    }, 5000);
  }
}

