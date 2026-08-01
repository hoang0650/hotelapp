import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzUploadFile } from 'ng-zorro-antd/upload';
import { Subscription } from 'rxjs';
import { AiAssistantService, ChatMessage as ServiceChatMessage } from '../../services/ai-assistant.service';
import { SessionContextService } from '../../services/session-context.service';
import { AuthService } from '../../services/auth.service';
import { HotelService } from '../../services/hotel.service';
import { Hotel } from '../../interfaces/hotel';

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
  /** Tên KS đã resolve (tránh hiện raw hotelId khi list chưa có) */
  resolvedHotelName: string | null = null;
  isHotelSelectionDisabled = false;
  private hotelLabelHydrating = false;
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
    const storedId = this.hotelService.normalizeHotelId(
      this.sessionContext.getSelectedHotelId() || this.authService.getHotelId()
    );
    if (storedId) {
      this.selectedHotelId = storedId;
      this.tenantId = storedId;
      this.hydrateSelectedHotelLabel(storedId);
    }

    this.subscriptions.push(
      this.sessionContext.selectedHotelId$.subscribe(hotelId => {
        const id = this.hotelService.normalizeHotelId(hotelId);
        if (id) {
          this.selectedHotelId = id;
          this.tenantId = id;
          this.hydrateSelectedHotelLabel(id);
        }
      })
    );
  }

  private loadHotels(): void {
    this.hotelLoading = true;
    const currentUser = this.authService.getCurrentUser();
    const userRole = String(currentUser?.role || '').trim().toLowerCase();
    const userBusinessId = String(this.authService.getBusinessId() || '').trim() || undefined;
    const businessIdParam =
      userRole === 'superadmin' || userRole === 'admin' ? undefined : userBusinessId;

    const cached = this.hotelService.getCachedHotels();
    if (cached.length > 0) {
      this.applyHotels(cached);
      this.hotelLoading = false;
    }

    this.subscriptions.push(
      this.hotelService.getHotelsCached(businessIdParam, undefined, { lite: true }).subscribe({
        next: hotels => {
          this.applyHotels(hotels || []);
          this.hotelLoading = false;
        },
        error: () => {
          this.hotelLoading = false;
          this.hydrateSelectedHotelLabel(this.selectedHotelId);
        }
      })
    );
  }

  private applyHotels(hotels: Array<Hotel | { _id?: string; id?: string; name?: string }>): void {
    const selected =
      this.hotelService.normalizeHotelId(this.selectedHotelId) ||
      this.hotelService.resolvePreferredHotelId(this.authService.getHotelId());

    const normalized = this.hotelService.normalizeHotelsList((hotels || []) as Hotel[]);
    const ensured = this.hotelService.ensureSelectedHotelOption(normalized, selected, this.resolvedHotelName);

    this.hotels = ensured
      .map(hotel => ({
        _id: String(hotel._id || ''),
        name: hotel.name || 'Khách sạn'
      }))
      .filter(hotel => !!hotel._id);

    if (selected) {
      this.selectedHotelId = selected;
      this.tenantId = selected;
      const matched = this.hotels.find(h => this.hotelService.sameHotelId(h._id, selected));
      if (matched?.name && matched.name !== 'Khách sạn đang chọn') {
        this.resolvedHotelName = matched.name;
      }
    } else if (!this.selectedHotelId && this.hotels.length > 0) {
      this.onSelectHotel(this.hotels[0]._id);
    }

    this.isHotelSelectionDisabled = this.hotels.length <= 1;
    this.hydrateSelectedHotelLabel(this.selectedHotelId);
  }

  /** Lấy tên KS khi list trống / chỉ có stub — không hiện hotelId thô */
  private hydrateSelectedHotelLabel(hotelId: string | null): void {
    const id = this.hotelService.normalizeHotelId(hotelId);
    if (!id) return;

    const current = this.hotels.find(h => this.hotelService.sameHotelId(h._id, id));
    if (current?.name && current.name !== 'Khách sạn đang chọn' && !this.looksLikeObjectId(current.name)) {
      this.resolvedHotelName = current.name;
      return;
    }
    if (
      this.resolvedHotelName &&
      !this.looksLikeObjectId(this.resolvedHotelName) &&
      this.hotelService.sameHotelId(this.selectedHotelId, id)
    ) {
      return;
    }
    if (this.hotelLabelHydrating) return;

    this.hotelLabelHydrating = true;
    this.subscriptions.push(
      this.hotelService.getHotelInfo(id, { lite: true }).subscribe({
        next: (hotel) => {
          this.hotelLabelHydrating = false;
          if (!hotel) {
            if (!this.resolvedHotelName || this.looksLikeObjectId(this.resolvedHotelName)) {
              this.resolvedHotelName = 'Khách sạn';
            }
            return;
          }
          const hid = this.hotelService.normalizeHotelId(hotel._id) || id;
          const name = (hotel.name || '').trim() || 'Khách sạn';
          this.resolvedHotelName = name;
          const rest = this.hotels.filter(h => !this.hotelService.sameHotelId(h._id, hid));
          this.hotels = [{ _id: hid, name }, ...rest];
          this.selectedHotelId = hid;
        },
        error: () => {
          this.hotelLabelHydrating = false;
          if (!this.resolvedHotelName || this.looksLikeObjectId(this.resolvedHotelName)) {
            this.resolvedHotelName = 'Khách sạn';
          }
        }
      })
    );
  }

  private looksLikeObjectId(value: string): boolean {
    return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
  }

  toggleMinimize(): void {
    this.minimized = !this.minimized;
    if (!this.minimized) {
      this.scrollToBottom();
    }
  }

  onSelectHotel(hotelId: string): void {
    const id = this.hotelService.normalizeHotelId(hotelId);
    if (!id) {
      return;
    }
    this.selectedHotelId = id;
    this.tenantId = id;
    const found = this.hotels.find(h => this.hotelService.sameHotelId(h._id, id));
    if (found?.name && found.name !== 'Khách sạn đang chọn') {
      this.resolvedHotelName = found.name;
    } else {
      this.resolvedHotelName = null;
      this.hydrateSelectedHotelLabel(id);
    }
    this.sessionContext.setSelectedHotelId(id, { persist: true });
  }

  get selectedHotelName(): string {
    if (this.hotelLoading && !this.resolvedHotelName) {
      return 'Đang tải khách sạn...';
    }
    const found = this.hotels.find(h => this.hotelService.sameHotelId(h._id, this.selectedHotelId));
    const name = (found?.name || this.resolvedHotelName || '').trim();
    if (name && name !== 'Khách sạn đang chọn' && !this.looksLikeObjectId(name)) {
      return name;
    }
    if (this.selectedHotelId) {
      return 'Đang tải tên khách sạn...';
    }
    return 'Chưa chọn khách sạn';
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

    this.aiAssistantService.getOpenClawDirectUrl(this.authService.getUserId() || undefined).subscribe({
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
