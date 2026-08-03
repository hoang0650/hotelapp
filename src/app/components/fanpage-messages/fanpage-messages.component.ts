import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { AuthService } from '../../services/auth.service';
import { SessionContextService } from '../../services/session-context.service';
import { NzMessageService } from 'ng-zorro-antd/message';

interface FbMessage {
  tenant_id?: string;
  page_id: string;
  sender_id: string;
  recipient_id?: string;
  sender_name?: string;
  sender_avatar?: string;
  recipient_name?: string;
  recipient_avatar?: string;
  text: string;
  attachments?: any[];
  direction: 'in' | 'out';
  timestamp: number;
  mid?: string;
  is_bot?: boolean;
}

@Component({
  selector: 'app-fanpage-messages',
  templateUrl: './fanpage-messages.component.html',
  styleUrls: ['./fanpage-messages.component.css']
})

export class FanpageMessagesComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('threadList') private threadList!: ElementRef;

  messages: FbMessage[] = [];
  pages: any[] = [];
  conversations: { sender_id: string; sender_name?: string; sender_avatar?: string; lastText: string; lastTime: number }[] = [];
  displayed: FbMessage[] = [];
  selectedPageId: string = '';
  selectedSenderId: string = '';
  replyText: string = '';
  loading: boolean = false;
  sending: boolean = false;
  isBotActive: boolean = false;
  isMobile = false;
  showSidebar = true;
  private wsSubscription: any;
  private shouldScrollToBottom = false;

  private onWindowFocus = async () => {
    if (this.selectedPageId) {
      await this.loadMessages();
      await this.loadBotStatus();
    }
  };

  private onPopupMessage = async (event: MessageEvent) => {
    if (event.data === 'facebook_connected') {
      this.message.success('Đã kết nối Fanpage thành công');
    } else if (event.data === 'facebook_connect_failed') {
      this.message.error(
        'Kết nối Fanpage thất bại. Thường do App chưa duyệt Advanced Access (pages_show_list / pages_messaging) hoặc tài khoản không phải Admin Page.'
      );
    } else {
      return;
    }

    await this.refreshFacebookPages();
    if (this.pages && this.pages.length > 0 && !this.selectedPageId) {
      this.selectedPageId = this.pages[0].id;
      await this.loadMessages();
      await this.loadBotStatus();
    }
    this.cdr.detectChanges();
  };

  constructor(
    private aiAssistant: AiAssistantService,
    private authService: AuthService,
    private sessionContext: SessionContextService,
    private cdr: ChangeDetectorRef,
    private message: NzMessageService
  ) { }

  private getTenantId(): string {
    const u = this.authService.getCurrentUser();
    const direct = (u?.hotelId || '').toString();
    if (direct) return direct;
    return this.sessionContext.getSelectedHotelId() || '';
  }

  get botModeText(): string {
    return this.isBotActive
      ? 'Hotel Agent đang bật: OpenClaw là lớp xử lý chính, ChatEngine điều phối tư vấn, đặt phòng và chốt sale theo từng khách.'
      : 'Sale Agent đang tắt: chỉ trả lời thủ công.';
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      this.isMobile = window.innerWidth <= 768;
      this.showSidebar = !this.isMobile;

      window.addEventListener('focus', this.onWindowFocus);
      window.addEventListener('message', this.onPopupMessage);

      const tenantId = this.getTenantId();
      if (!tenantId) {
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }
      
      this.wsSubscription = this.aiAssistant.connectToWebSocket(tenantId).subscribe((msg: any) => {
        if (msg) {
          this.handleRealtimeMessage(msg);
        }
      });

      await this.refreshFacebookPages();

      if (this.pages && this.pages.length > 0) {
        this.selectedPageId = this.pages[0].id;
        await this.loadMessages();
        await this.loadBotStatus();
      }

    } catch (e) {
      console.error('Loi khoi tao:', e);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
    }
    window.removeEventListener('focus', this.onWindowFocus);
    window.removeEventListener('message', this.onPopupMessage);
  }

  private scrollToBottom(): void {
    try {
      if (this.threadList) {
        this.threadList.nativeElement.scrollTop = this.threadList.nativeElement.scrollHeight;
      }
    } catch (_) {}
  }

  handleRealtimeMessage(msg: FbMessage) {
    if (msg.mid && this.messages.some(m => m.mid === msg.mid)) {
      return;
    }

    if (msg.page_id !== this.selectedPageId) {
      return;
    }

    this.messages.push(msg);
    this.buildConversations();

    const partnerId = msg.direction === 'in' ? msg.sender_id : msg.recipient_id;
    if (partnerId === this.selectedSenderId) {
      this.filterDisplayedMessages();
      this.shouldScrollToBottom = true;
    }

    this.cdr.detectChanges();
  }


  async loadBotStatus(): Promise<void> {
    if (!this.selectedPageId) return;
    const tenantId = this.getTenantId();
    if (!tenantId) return; // <--- CHẶN NẾU RỖNG

    this.isBotActive = await this.aiAssistant.getBotStatus(tenantId, this.selectedPageId, 'facebook');
  }

  async toggleBot(checked: boolean): Promise<void> {
    if (!this.selectedPageId) return;
    const tenantId = this.getTenantId();
    if (!tenantId) {
      this.isBotActive = !checked; // Hoàn tác công tắc nếu không có ID
      return;
    }
    
    this.isBotActive = checked;
    try {
      await this.aiAssistant.toggleBot(tenantId, this.selectedPageId, checked, 'facebook');
    } catch (error) {
      console.error('Lỗi toggle bot:', error);
      this.isBotActive = !checked;
    }
  }

  async refreshData(): Promise<void> {
    this.loading = true;
    try {
      await this.refreshFacebookPages();
      if (this.selectedPageId) {
        await this.loadMessages();
        await this.loadBotStatus();
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async refreshFacebookPages(): Promise<void> {
    const tenantId = this.getTenantId();
    if (!tenantId) {
      this.pages = []; // <--- CHẶN NẾU RỖNG
      return;
    }
    try {
      const result = await this.aiAssistant.getFacebookPages(tenantId);
      // Log dữ liệu nhận được để debug
      console.log('API Response Pages:', result);

      this.pages = Array.isArray(result) ? result : [];
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Lỗi gọi API pages:', error);
      this.pages = [];
    }
  }

  async loadMessages(): Promise<void> {
    if (!this.selectedPageId) return;
    const tenantId = this.getTenantId();
    if (!tenantId) return; // <--- CHẶN NẾU RỖNG
    
    try {
      this.messages = await this.aiAssistant.getFacebookMessages(tenantId, this.selectedPageId);
      this.buildConversations();
      this.shouldScrollToBottom = true;
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Loi load tin nhan:', error);
    }
  }

  private buildConversations(): void {
    const convMap = new Map<string, any>();
    const nameMap = new Map<string, { name: string; avatar: string }>();

    this.messages.forEach(m => {
      if (m.direction === 'in' && m.sender_name && m.sender_name !== 'Khách hàng') {
        nameMap.set(m.sender_id, { name: m.sender_name, avatar: m.sender_avatar || '' });
      }
      if (m.direction === 'out' && m.recipient_id && (m as any).recipient_name) {
        const rName = (m as any).recipient_name;
        if (rName) {
          nameMap.set(m.recipient_id, { name: rName, avatar: (m as any).recipient_avatar || '' });
        }
      }
    });

    const sorted = [...this.messages].sort((a, b) => b.timestamp - a.timestamp);
    sorted.forEach(m => {
      const partnerId = m.direction === 'in' ? m.sender_id : (m.recipient_id || '');
      if (!partnerId) return;
      if (!convMap.has(partnerId)) {
        const resolved = nameMap.get(partnerId);
        convMap.set(partnerId, {
          sender_id: partnerId,
          sender_name: resolved?.name || partnerId,
          sender_avatar: resolved?.avatar || '',
          lastText: m.text || (m.attachments && m.attachments.length ? '[Dinh kem]' : ''),
          lastTime: m.timestamp
        });
      }
    });
    this.conversations = Array.from(convMap.values());
    if (this.selectedSenderId) this.filterDisplayedMessages();
  }

  selectConversation(senderId: string): void {
    this.selectedSenderId = senderId;
    this.filterDisplayedMessages();
    this.shouldScrollToBottom = true;
    if (this.isMobile) this.showSidebar = false;
  }

  private filterDisplayedMessages(): void {
    this.displayed = this.messages
      .filter(m => (m.direction === 'in' && m.sender_id === this.selectedSenderId) ||
        (m.direction === 'out' && m.recipient_id === this.selectedSenderId))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async changePage(pageId: string): Promise<void> {
    this.selectedPageId = pageId;
    this.selectedSenderId = '';
    this.displayed = [];
    await this.loadMessages();
    await this.loadBotStatus();
  }

  async connectFanpage(): Promise<void> {
    const tenantId = this.getTenantId();
    const url = await this.aiAssistant.getFacebookOAuthUrl(tenantId);
    if (url) {
      // Mở popup để login Facebook
      const width = 600, height = 700;
      const left = (window.innerWidth - width) / 2;
      const top = (window.innerHeight - height) / 2;
      window.open(url, 'FacebookLogin', `width=${width},height=${height},left=${left},top=${top}`);
    }
  }

  async sendReply(): Promise<void> {
    if (!this.replyText.trim() || !this.selectedSenderId || !this.selectedPageId) return;

    this.sending = true;
    try {
      const tenantId = this.getTenantId();
      await this.aiAssistant.sendFacebookMessage(
        tenantId,
        this.selectedPageId,
        this.selectedSenderId,
        this.replyText
      );
      this.replyText = '';
      this.shouldScrollToBottom = true;
    } catch (error) {
      console.error('Lỗi gửi tin nhắn:', error);
    } finally {
      this.sending = false;
      this.cdr.detectChanges();
    }
  }

  previewImage(url: string) {
    window.open(url, '_blank');
  }

  onEnterSend(event: any): void {
    this.sendReply();
  }

  toggleSidebar(): void {
    this.showSidebar = !this.showSidebar;
  }
}
