import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'app-ai-chatbox',
  templateUrl: './ai-chatbox.component.html',
  styleUrls: ['./ai-chatbox.component.scss']
})
export class AiChatboxComponent implements OnInit {
  canUseAiChatbox = true;
  canOpenOpenClaw = true;
  openingOpenClaw = false;
  isOpenClawModalVisible = false;
  openClawIframeUrl: SafeResourceUrl | null = null;

  selectedHotelId: string | null = null;
  currentTenantId = 'default'; // Thay bằng biến lấy từ Auth state/Context thực tế của bạn

  // URL tới backend Python AI
  private readonly pyAiApiUrl = 'https://ai.phhotel.vn';

  constructor(
    private sanitizer: DomSanitizer,
    private http: HttpClient,
    private message: NzMessageService
  ) {}

  ngOnInit(): void {}

  /**
   * Mở modal và tự động điền Token đăng nhập vào OpenClaw Gateway Iframe
   */
  async openOpenClawGateway(): Promise<void> {
    this.openingOpenClaw = true;

    try {
      // 1. Chuẩn bị params và headers xác thực
      const params: any = { tenant_id: this.currentTenantId };
      if (this.selectedHotelId) {
        params.selected_hotel_id = this.selectedHotelId;
      }

      // Lấy JWT Token từ LocalStorage để đính kèm vào Authorization header
      const token = localStorage.getItem('access_token') || localStorage.getItem('token') || '';
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`
      });

      // 2. Gọi API /admin/openclaw/direct-url từ Backend Python
      const res: any = await this.http.get(`${this.pyAiApiUrl}/admin/openclaw/direct-url`, {
        params,
        headers
      }).toPromise();

      if (res && res.success && res.url) {
        // 3. Bypass Security để nhúng URL dạng https://{tenant}.phhotel.vn/#config=... vào iframe
        this.openClawIframeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(res.url);
        this.isOpenClawModalVisible = true;

        // 4. Gọi API Approve Device Pairing ngầm sau 2.5 giây
        setTimeout(() => {
          this.triggerAutoApproveDevicePairing();
        }, 2500);

      } else {
        this.message.error(res?.message || 'Không thể tạo liên kết kết nối OpenClaw Gateway.');
      }
    } catch (err: any) {
      console.error('Lỗi mở OpenClaw Gateway:', err);
      if (err?.status === 401) {
        this.message.error('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
      } else {
        this.message.error('Không thể mở kết nối tới OpenClaw Gateway.');
      }
    } finally {
      this.openingOpenClaw = false;
    }
  }

  /**
   * Tự động duyệt Device Pairing Request (Auto-Approve Login)
   */
  private triggerAutoApproveDevicePairing(): void {
    const token = localStorage.getItem('access_token') || localStorage.getItem('token') || '';
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    const params: any = { tenant_id: this.currentTenantId };
    if (this.selectedHotelId) {
      params.selected_hotel_id = this.selectedHotelId;
    }

    this.http.post(`${this.pyAiApiUrl}/admin/openclaw/device-pairings/approve`, {}, { params, headers })
      .subscribe({
        next: (res: any) => {
          if (res?.success) {
            console.log('✅ Auto-approved OpenClaw login session thành công!');
          }
        },
        error: (err) => {
          // Bỏ qua lỗi 404 nếu session đã được auto-approve bằng kết nối WebSocket nội bộ
          if (err?.status !== 404) {
            console.warn('⚠️ Auto-approve device pairing:', err);
          }
        }
      });
  }

  /**
   * Đóng Modal và hủy Iframe URL để dọn dẹp bộ nhớ
   */
  closeOpenClawModal(): void {
    this.isOpenClawModalVisible = false;
    setTimeout(() => {
      this.openClawIframeUrl = null;
    }, 300);
  }
}