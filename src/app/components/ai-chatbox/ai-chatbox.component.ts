import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzUploadFile } from 'ng-zorro-antd/upload';
import { Subscription } from 'rxjs';
import { AiAssistantService, ChatMessage as ServiceChatMessage } from '../../services/ai-assistant.service';
import { SessionContextService } from '../../services/session-context.service';
import { AuthService } from '../../services/auth.service';
import { HotelService } from '../../services/hotel.service';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  fileUrl?: string;
  fileType?: string;
  fileName?: string;
  timestamp: Date | string;
}

export interface QuickAction {
  label: string;
  query: string;
}

@Component({
  selector: 'app-ai-chatbox',
  templateUrl: './ai-chatbox.component.html',
  styleUrls: ['./ai-chatbox.component.css']
})
export class AiChatboxComponent implements OnInit, OnDestroy {
  @ViewChild('messagesEnd') messagesEnd?: ElementRef<HTMLDivElement>;

  inputValue = '';
  selectedFile: File | null = null;
  selectedFileType = '';
  selectedFileName = '';
  selectedFilePreview: string | ArrayBuffer | null = null;
  isTyping = false;
  isApprovingDevice = false;

  minimized = false;
  canUseAiChatbox = true;
  chatboxModeTitle = 'AI Assistant';
  chatboxModeDescription = 'Trợ lý AI hỗ trợ vận hành';
  tenantId = '';

  hotels: Array<{ _id: string; name: string }> = [];
  selectedHotelId: string | null = null;
  isHotelSelectionDisabled = false;
  hotelLoading = false;

  messages: ChatMessage[] = [];

  canAskRevenue = false;
  revenueQuickActions: QuickAction[] = [];
  exportQuickActions: QuickAction[] = [];
  webQuickActions: QuickAction[] = [];

  openingOpenClaw = false;
  canOpenOpenClaw = true;
  isOpenClawModalVisible = false;
  openClawIframeUrl: SafeResourceUrl | null = null;

  private approvePollTimer: any = null;
  private approveDelayTimer: any = null;
  private subscriptions: Subscription[] = [];

  constructor(
    private sanitizer: DomSanitizer,
    private message: NzMessageService,
    private aiAssistantService: AiAssistantService,
    private sessionContext: SessionContextService,
    private authService: AuthService,
    private hotelService: HotelService
  ) {}

  ngOnInit(): void {
    this.initRevenuePermission();
    this.initQuickActions();
    this.bindServiceStreams();
    this.syncSelectedHotel();
    this.loadHotels();
    void this.aiAssistantService.loadChatHistory();
  }

  private initRevenuePermission(): void {
    const role = String(this.authService.getCurrentUser()?.role || '').toLowerCase();
    this.canAskRevenue = [
      'superadmin',
      'admin',
      'business',
      'hotel',
      'staff',
      'manager',
      'hotel_manager'
    ].includes(role);
  }

  private initQuickActions(): void {
    this.revenueQuickActions = [
      { label: 'Doanh thu hôm nay', query: 'Doanh thu hôm nay' },
      { label: 'Doanh thu hôm qua', query: 'Doanh thu hôm qua' },
      { label: 'Doanh thu tuần này', query: 'Doanh thu tuần này' },
      { label: 'Doanh thu tháng này', query: 'Doanh thu tháng này' },
      { label: 'Doanh thu năm nay', query: 'Doanh thu năm nay' }
    ];
    this.exportQuickActions = [
      { label: 'Xuất Excel', query: 'Xuất file Excel báo cáo doanh thu tháng này' },
      { label: 'Xuất Word', query: 'Xuất file Word báo cáo doanh thu tháng này' },
      { label: 'Xuất PDF', query: 'Xuất file PDF báo cáo doanh thu tháng này' }
    ];
    this.webQuickActions = [
      { label: 'Tóm tắt web', query: 'Tóm tắt nội dung link web này: https://vnexpress.net/' },
      { label: 'Tin tức mới', query: 'Tìm tin tức mới nhất về du lịch Việt Nam hôm nay và tóm tắt ngắn gọn' }
    ];
  }

  private bindServiceStreams(): void {
    this.subscriptions.push(
      this.aiAssistantService.getMessages().subscribe((msgs: ServiceChatMessage[]) => {
        this.messages = (msgs || []).map(msg => ({
          role: msg.role,
          content: msg.content,
          fileUrl: msg.fileUrl,
          fileType: msg.fileType,
          fileName: msg.fileName,
          timestamp: msg.timestamp
        }));
        this.scrollToBottom();
      }),
      this.aiAssistantService.getTypingStatus().subscribe(typing => {
        this.isTyping = typing;
        if (typing) {
          this.scrollToBottom();
        }
      })
    );
  }

  private syncSelectedHotel(): void {
    const storedId = this.sessionContext.getSelectedHotelId() || this.authService.getHotelId();
    if (storedId) {
      this.selectedHotelId = storedId;
      this.tenantId = storedId;
    }

    this.subscriptions.push(
      this.sessionContext.selectedHotelId$.subscribe(hotelId => {
        if (hotelId) {
          this.selectedHotelId = hotelId;
          this.tenantId = hotelId;
        }
      })
    );
  }

  private loadHotels(): void {
    this.hotelLoading = true;
    const currentUser = this.authService.getCurrentUser();
    const userRole = String(currentUser?.role || '').trim().toLowerCase();
    const userBusinessId = String(this.authService.getBusinessId() || '').trim() || undefined;
    // superadmin/admin: không filter businessId để lấy đủ danh sách KS
    const businessIdParam =
      userRole === 'superadmin' || userRole === 'admin' ? undefined : userBusinessId;

    this.subscriptions.push(
      this.hotelService.getHotels(businessIdParam, undefined, { lite: true }).subscribe({
        next: hotels => {
          this.hotels = (hotels || [])
            .map(hotel => ({
              _id: String((hotel as any)._id || (hotel as any).id || ''),
              name: hotel.name || 'Khách sạn'
            }))
            .filter(hotel => !!hotel._id);

          if (!this.selectedHotelId && this.hotels.length > 0) {
            this.onSelectHotel(this.hotels[0]._id);
          } else if (
            this.selectedHotelId &&
            this.hotels.length > 0 &&
            !this.hotels.some(h => h._id === this.selectedHotelId)
          ) {
            this.onSelectHotel(this.hotels[0]._id);
          }

          this.isHotelSelectionDisabled = this.hotels.length <= 1;
          this.hotelLoading = false;
        },
        error: () => {
          this.hotelLoading = false;
        }
      })
    );
  }

  toggleMinimize(): void {
    this.minimized = !this.minimized;
    if (!this.minimized) {
      this.scrollToBottom();
    }
  }

  onSelectHotel(hotelId: string): void {
    if (!hotelId) {
      return;
    }
    this.selectedHotelId = hotelId;
    this.tenantId = hotelId;
    this.sessionContext.setSelectedHotelId(hotelId, { persist: true });
  }

  get selectedHotelName(): string {
    if (this.hotelLoading) {
      return 'Đang tải khách sạn...';
    }
    const found = this.hotels.find(h => h._id === this.selectedHotelId);
    return found?.name || this.selectedHotelId || 'Chưa chọn khách sạn';
  }

  private getEffectiveHotelId(): string {
    return String(
      this.selectedHotelId ||
        this.sessionContext.getSelectedHotelId() ||
        this.authService.getHotelId() ||
        ''
    ).trim();
  }

  private getBusinessId(): string {
    return String(this.authService.getBusinessId() || '').trim();
  }

  private isRevenuePrompt(message: string): boolean {
    const normalized = message.toLowerCase();
    return [
      'doanh thu',
      'thu chi',
      'phiếu thu',
      'phiếu chi',
      'tiền mặt',
      'chuyển khoản',
      'cà thẻ',
      'giao ca',
      'profit',
      'revenue'
    ].some(keyword => normalized.includes(keyword));
  }

  private isWebPrompt(message: string): boolean {
    const normalized = message.toLowerCase();
    const hasUrl = /(https?:\/\/|www\.)/i.test(message);
    return (
      hasUrl ||
      [
        'đọc báo',
        'doc bao',
        'tin tức',
        'tin tuc',
        'bài báo',
        'bai bao',
        'tóm tắt web',
        'tom tat web',
        'tóm tắt bài',
        'tom tat bai',
        'tóm tắt link',
        'tom tat link',
        'đọc link',
        'doc link',
        'đọc web',
        'doc web',
        'website',
        'web',
        'news',
        'article',
        'search web',
        'web search'
      ].some(keyword => normalized.includes(keyword))
    );
  }

  openOpenClawGateway(): void {
    if (this.openingOpenClaw) {
      return;
    }
    this.openingOpenClaw = true;
    this.clearApproveTimers();

    const newTab = window.open('about:blank', '_blank');

    this.aiAssistantService.getOpenClawDirectUrl().subscribe({
      next: res => {
        this.openingOpenClaw = false;
        if (res && res.success && res.url) {
          if (newTab) {
            newTab.location.href = res.url;
          } else {
            window.open(res.url, '_blank');
          }
          this.message.info('Đang mở OpenClaw với token gateway... Tự động duyệt kết nối.');
          this.approveDelayTimer = setTimeout(() => {
            this.triggerAutoApproveDevicePairing(30, 1000);
          }, 800);
        } else {
          if (newTab) {
            newTab.close();
          }
          this.message.error(res?.message || 'Không lấy được đường dẫn OpenClaw Gateway.');
        }
      },
      error: err => {
        this.openingOpenClaw = false;
        if (newTab) {
          newTab.close();
        }
        this.message.error(
          'Lỗi khi lấy URL OpenClaw: ' + (err?.error?.detail || err?.error?.message || err.message)
        );
      }
    });
  }

  manualApprovePairing(): void {
    this.clearApproveTimers();
    this.triggerAutoApproveDevicePairing(8, 1500);
  }

  triggerAutoApproveDevicePairing(maxAttempts = 5, intervalMs = 2000): void {
    this.clearApproveTimers();
    let attempts = 0;
    this.isApprovingDevice = true;

    const tick = () => {
      attempts++;
      this.aiAssistantService.approveOpenClawPairing().subscribe({
        next: res => {
          if (res && res.success) {
            this.message.success('Đã tự động Approve kết nối OpenClaw!');
            this.isApprovingDevice = false;
            this.clearApproveTimers();
            return;
          }
          if (attempts >= maxAttempts) {
            this.isApprovingDevice = false;
            this.clearApproveTimers();
            this.message.warning(
              'Chưa duyệt được pairing. Bấm "Duyệt lại" sau khi OpenClaw hiện yêu cầu ghép đôi.'
            );
          }
        },
        error: () => {
          if (attempts >= maxAttempts) {
            this.isApprovingDevice = false;
            this.clearApproveTimers();
          }
        }
      });
    };

    tick();
    this.approvePollTimer = setInterval(() => {
      if (attempts >= maxAttempts) {
        this.clearApproveTimers();
        this.isApprovingDevice = false;
        return;
      }
      tick();
    }, intervalMs);
  }

  private clearApproveTimers(): void {
    if (this.approvePollTimer) {
      clearInterval(this.approvePollTimer);
      this.approvePollTimer = null;
    }
    if (this.approveDelayTimer) {
      clearTimeout(this.approveDelayTimer);
      this.approveDelayTimer = null;
    }
  }

  closeOpenClawModal(): void {
    this.isOpenClawModalVisible = false;
    setTimeout(() => {
      this.openClawIframeUrl = null;
    }, 300);
  }

  async clearChatHistory(): Promise<void> {
    await this.aiAssistantService.clearChatHistory();
    this.messages = [];
  }

  getFileIconType(msg: ChatMessage): string {
    if (!msg?.fileType) {
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

  getFileDisplayName(msg: ChatMessage): string {
    if (msg?.fileName) {
      return msg.fileName;
    }
    if (msg?.fileUrl) {
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
    void this.sendMessage();
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

  async sendMessage(): Promise<void> {
    const content = (this.inputValue || '').trim();
    if ((!content && !this.selectedFile) || this.isTyping) {
      return;
    }

    const webPrompt = this.isWebPrompt(content);
    const effectiveHotelId = this.getEffectiveHotelId();
    const businessId = this.getBusinessId();

    if (!effectiveHotelId && !businessId && !webPrompt) {
      this.message.warning('Vui lòng chọn khách sạn trước khi dùng AI.');
      return;
    }

    if (this.isRevenuePrompt(content) && !this.canAskRevenue) {
      this.message.warning('Bạn không có quyền hỏi dữ liệu doanh thu.');
      return;
    }

    if (effectiveHotelId) {
      this.sessionContext.setSelectedHotelId(effectiveHotelId, { persist: true });
      this.selectedHotelId = effectiveHotelId;
      this.tenantId = effectiveHotelId;
    }

    const outgoing = content;
    this.inputValue = '';
    const fileSnapshot = this.selectedFile;
    this.removeSelectedFile();

    try {
      // Gọi Nest `/ai-assistant/chat` → Python `/chat` với hotel_id/tenant_id hiện tại
      await this.aiAssistantService.sendMessage(
        outgoing || (fileSnapshot ? `[Đính kèm] ${fileSnapshot.name}` : ''),
        undefined,
        fileSnapshot?.type,
        { hotelId: effectiveHotelId || null }
      );
    } catch (error) {
      this.message.error('Lỗi khi kết nối với AI Assistant.');
      console.error('Chat error:', error);
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = this.messagesEnd?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }, 50);
  }

  ngOnDestroy(): void {
    this.clearApproveTimers();
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}
