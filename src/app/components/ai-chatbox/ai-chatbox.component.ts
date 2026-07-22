import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzUploadFile } from 'ng-zorro-antd/upload';
import { AiAssistantService } from '../../services/ai-assistant.service';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  fileUrl?: string;
  fileType?: string;
  timestamp: Date | string;
}

export interface QuickAction {
  label: string;
  query: string;
}

@Component({
  selector: 'app-ai-chatbox',
  templateUrl: './ai-chatbox.component.html',
  styleUrls: ['./ai-chatbox.component.scss']
})
export class AiChatboxComponent implements OnInit, OnDestroy {
  inputValue: string = '';
  selectedFile: any = null;
  selectedFileType: string = '';
  selectedFileName: string = '';
  selectedFilePreview: string | ArrayBuffer | null = null;
  isTyping: boolean = false;
  isApprovingDevice = false;
  private readonly pyAiApiUrl = 'https://ai.phhotel.vn';

  // Visibility & Header Properties
  minimized = false;
  canUseAiChatbox = true;
  chatboxModeTitle = 'AI Assistant';
  chatboxModeDescription = 'Trợ lý AI hỗ trợ vận hành';
  tenantId: string = '';

  // Hotel Selection Properties
  hotels: Array<{ _id: string; name: string }> = [];
  selectedHotelId: string | null = null;
  isHotelSelectionDisabled = false;

  // Chat History & Inputs
  messages: ChatMessage[] = [];

  // Quick Action Lists
  canAskRevenue = true;
  revenueQuickActions: QuickAction[] = [];
  exportQuickActions: QuickAction[] = [];
  webQuickActions: QuickAction[] = [];

  // OpenClaw Modal & Actions
  openingOpenClaw = false;
  canOpenOpenClaw = true;
  isOpenClawModalVisible = false;
  openClawIframeUrl: SafeResourceUrl | null = null;

  // === SỬA: Thêm biến quản lý auto-approve polling ===
  private approvePollTimer: any = null;
  private approveDelayTimer: any = null;

  toggleMinimize(): void {
    this.minimized = !this.minimized;
  }

  onSelectHotel(hotelId: string): void {
    this.selectedHotelId = hotelId;
  }

  constructor(
    private sanitizer: DomSanitizer,
    private http: HttpClient,
    private message: NzMessageService,
    private aiAssistantService: AiAssistantService
  ) { }

  ngOnInit(): void {
    this.initTenantId();
    this.loadHotels();
  }

  initTenantId() {
    try {
      const storedId = localStorage.getItem('selectedHotelId');
      if (storedId && storedId !== 'undefined' && storedId !== 'null' && storedId.trim() !== '') {
        this.selectedHotelId = storedId.replace(/['"]+/g, '');
      }
    } catch (e) {
      console.error('Lỗi khi đọc selectedHotelId từ localStorage:', e);
    }
  }

  loadHotels() {
    if (this.hotels && this.hotels.length > 0 && !this.selectedHotelId) {
      this.selectedHotelId = this.hotels[0]._id;
      localStorage.setItem('selectedHotelId', this.selectedHotelId as string);
    }
  }

  /**
   * Mở giao diện OpenClaw Gateway với Token tự động
   * SỬA: Thêm delay trước khi bắt đầu auto-approve polling
   */
  openOpenClawGateway(): void {
    if (this.openingOpenClaw) return;
    this.openingOpenClaw = true;

    // 1. Mở trước  tab trống để tránh trình duyệt chặn Popup
    const newTab = window.open('about:blank', '_blank');

    this.aiAssistantService.getOpenClawDirectUrl().subscribe({
      next: (res) => {
        this.openingOpenClaw = false;
        if (res && res.success && res.url) {
          // 2. Nạp URL chứa đầy đủ Token & Query Params vào Tab mới
          if (newTab) {
            newTab.location.href = res.url;
          } else {
            window.open(res.url, '_blank');
          }
          this.message.info('Đang mở OpenClaw... Tự động duyệt kết nối sau 5 giây.');

          // 3. SỬA: Delay 5 giây rồi mới bắt đầu poll auto-approve
          //    Lý do: OpenClaw UI cần thời gian load + tạo device pairing request
          this.approveDelayTimer = setTimeout(() => {
            this.triggerAutoApproveDevicePairing(10, 3000);
          }, 5000);
        } else {
          if (newTab) newTab.close();
          this.message.error('Không lấy được đường dẫn OpenClaw Gateway.');
        }
      },
      error: (err) => {
        this.openingOpenClaw = false;
        if (newTab) newTab.close();
        this.message.error('Lỗi khi lấy URL OpenClaw: ' + (err?.error?.detail || err.message));
      }
    });
  }

  manualApprovePairing(): void {
    this.triggerAutoApproveDevicePairing(3, 2000);
  }

  /**
   * Tự động duyệt Device Pairing Request (Auto-Approve Login)
   * SỬA: Tăng số lần thử, tăng interval, kiểm tra result chặt hơn
   */
  triggerAutoApproveDevicePairing(maxAttempts = 5, intervalMs = 2000): void {
    let attempts = 0;
    this.isApprovingDevice = true;

    const pollInterval = setInterval(() => {
      attempts++;

      this.aiAssistantService.approveOpenClawPairing().subscribe({
        next: (res) => {
          if (res && res.success) {
            this.message.success('Đã tự động Approve kết nối OpenClaw!');
            this.isApprovingDevice = false;
            clearInterval(pollInterval);
          } else {
            // Nếu chưa có request kết nối từ UI mới mở, tiếp tục thử lại cho đến khi hết maxAttempts
            console.log(`[Auto-Approve] Lần thử ${attempts}/${maxAttempts}: Đang đợi thiết bị kết nối...`);
            if (attempts >= maxAttempts) {
              this.isApprovingDevice = false;
              clearInterval(pollInterval);
            }
          }
        },
        error: (err) => {
          console.warn(`[Auto-Approve] Lỗi kết nối lần ${attempts}:`, err);
          if (attempts >= maxAttempts) {
            this.isApprovingDevice = false;
            clearInterval(pollInterval);
          }
        }
      });
    }, intervalMs);
  }

  closeOpenClawModal(): void {
    this.isOpenClawModalVisible = false;
    setTimeout(() => {
      this.openClawIframeUrl = null;
    }, 300);
  }

  clearChatHistory(): void {
    this.messages = [];
  }

  getFileIconType(msg: any): string {
    if (!msg || !msg.fileType) {
      return 'file';
    }
    const type = msg.fileType.toLowerCase();
    if (type.includes('pdf')) return 'file-pdf';
    if (type.includes('word') || type.includes('document')) return 'file-word';
    if (type.includes('excel') || type.includes('sheet')) return 'file-excel';
    if (type.includes('zip') || type.includes('compressed')) return 'file-zip';
    if (type.includes('image')) return 'picture';
    return 'file';
  }

  getFileDisplayName(msg: any): string {
    if (msg && msg.fileName) {
      return msg.fileName;
    }
    if (msg && msg.fileUrl) {
      const urlParts = msg.fileUrl.split('/');
      return urlParts[urlParts.length - 1] || 'Tài liệu tải về';
    }
    return 'Tài liệu tải về';
  }

  removeSelectedFile(): void {
    this.selectedFile = null;
    this.selectedFileType = '';
    this.selectedFileName = '';
    this.selectedFilePreview = null;
  }

  sendQuickMessage(query: string): void {
    this.inputValue = query;
    this.sendMessage();
  }

  beforeUpload = (file: NzUploadFile): boolean => {
    const nativeFile = file as any as File;
    this.selectedFile = nativeFile;
    this.selectedFileName = nativeFile.name;
    this.selectedFileType = nativeFile.type;
    if (nativeFile.type && nativeFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.selectedFilePreview = e.target.result;
      };
      reader.readAsDataURL(nativeFile);
    } else {
      this.selectedFilePreview = null;
    }
    return false;
  };

  sendMessage(): void {
    if ((!this.inputValue && !this.selectedFile) || this.isTyping) {
      return;
    }
    if (!this.selectedHotelId) {
      this.message.warning('Không tìm thấy thông tin Khách sạn (Tenant ID). Vui lòng tải lại trang.');
      return;
    }
    const userMessage = this.inputValue;
    this.inputValue = '';
    this.messages.push({ role: 'user', content: userMessage, timestamp: new Date() });
    this.isTyping = true;
    try {
      this.aiAssistantService.sendMessage(this.selectedHotelId, userMessage);
      this.messages.push({ role: 'assistant', content: userMessage, timestamp: new Date() });
    } catch (error) {
      this.message.error('Lỗi khi kết nối với AI Assistant.');
      console.error('Chat error:', error);
    } finally {
      this.isTyping = false;
    }
  }

  ngOnDestroy(): void {
    if (this.approvePollTimer) {
      clearInterval(this.approvePollTimer);
      this.approvePollTimer = null;
    }
    if (this.approveDelayTimer) {
      clearTimeout(this.approveDelayTimer);
      this.approveDelayTimer = null;
    }
  }
}