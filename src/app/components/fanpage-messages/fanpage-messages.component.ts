import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { AuthService } from '../../services/auth.service';

interface FbMessage {
  tenant_id: string;
  page_id: string;
  sender_id: string;
  recipient_id?: string;
  sender_name?: string;
  sender_avatar?: string;
  text: string;
  attachments?: any[];
  direction: 'in' | 'out';
  timestamp: number;
  reply_text?: string;
  mid?: string;
}

@Component({
  selector: 'app-fanpage-messages',
  templateUrl: './fanpage-messages.component.html',
  styleUrls: ['./fanpage-messages.component.css']
})

export class FanpageMessagesComponent implements OnInit, OnDestroy {
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

  private onWindowFocus = async () => {
    await this.refreshFacebookPages();
    // Nếu đã chọn page, refresh tin nhắn (fallback)
    if (this.selectedPageId) {
      await this.loadMessages();
      await this.loadBotStatus();
    }
  };

  constructor(private aiAssistant: AiAssistantService, private authService: AuthService, private cdr: ChangeDetectorRef) { }

  private getTenantId(): string {
    const u = this.authService.getCurrentUser();
    return (u?.hotelId || u?.businessId || 'default').toString();
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      this.isMobile = window.innerWidth <= 768;
      this.showSidebar = !this.isMobile;

      const tenantId = this.getTenantId();
      
      // KẾT NỐI WEBSOCKET REALTIME
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
      } else {
        console.warn('Danh sách pages rỗng!');
      }

    } catch (e) {
      console.error('Lỗi khởi tạo:', e);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy(): void {
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
    }
  }

  handleRealtimeMessage(msg: FbMessage) {
    // 1. Kiểm tra duplicate bằng mid
    if (msg.mid && this.messages.some(m => m.mid === msg.mid)) {
      console.log('Duplicate message ignored:', msg.mid);
      return;
    }

    // 2. Kiểm tra có thuộc page hiện tại không
    if (msg.page_id !== this.selectedPageId) {
      return;
    }

    // 3. Thêm vào danh sách messages
    this.messages.push(msg);

    // 4. Cập nhật conversations
    this.buildConversations();

    // 5. Nếu đang chat với người này -> update displayed
    const partnerId = msg.direction === 'in' ? msg.sender_id : msg.recipient_id;
    if (partnerId === this.selectedSenderId) {
      this.filterDisplayedMessages();
      // Scroll to bottom logic if needed (UI usually handles auto-scroll or user manually scrolls)
    }

    this.cdr.detectChanges();
  }


  async loadBotStatus(): Promise<void> {
    if (!this.selectedPageId) return;
    const tenantId = this.getTenantId();
    this.isBotActive = await this.aiAssistant.getBotStatus(tenantId, this.selectedPageId);
  }

  async toggleBot(checked: boolean): Promise<void> {
    if (!this.selectedPageId) return;
    const tenantId = this.getTenantId();
    
    // Update UI immediately
    this.isBotActive = checked;
    
    try {
      await this.aiAssistant.toggleBot(tenantId, this.selectedPageId, checked);
    } catch (error) {
      console.error('Lỗi toggle bot:', error);
      // Revert nếu lỗi
      this.isBotActive = !checked;
    }
  }

  async refreshFacebookPages(): Promise<void> {
    const tenantId = this.getTenantId();
    try {
      const result = await this.aiAssistant.getFacebookPages(tenantId);
      // Log dữ liệu nhận được để debug
      console.log('API Response Pages:', result);

      // Đảm bảo gán đúng mảng (phòng trường hợp service trả về object bọc)
      this.pages = Array.isArray(result) ? result : [];

      // Kích hoạt change detection thủ công
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Lỗi gọi API pages:', error);
      this.pages = [];
    }
  }

  async loadMessages(): Promise<void> {
    if (!this.selectedPageId) return;
    const tenantId = this.getTenantId();
    try {
      this.messages = await this.aiAssistant.getFacebookMessages(tenantId, this.selectedPageId);
      this.buildConversations();
      this.cdr.detectChanges(); // Cập nhật UI tin nhắn
    } catch (error) {
      console.error('Lỗi load tin nhắn:', error);
    }
  }

  private buildConversations(): void {
    const convMap = new Map<string, any>();
    const sorted = [...this.messages].sort((a, b) => b.timestamp - a.timestamp);
    sorted.forEach(m => {
      let partnerId = m.direction === 'in' ? m.sender_id : (m.recipient_id || 'Unknown');
      if (!partnerId) return;
      if (!convMap.has(partnerId)) {
        convMap.set(partnerId, {
          sender_id: partnerId,
          sender_name: m.sender_name || partnerId,
          sender_avatar: m.sender_avatar || '',
          lastText: m.text || (m.attachments && m.attachments.length ? '[Đính kèm]' : ''),
          lastTime: m.timestamp
        });
      } else {
        const existing = convMap.get(partnerId);
        if ((!existing.sender_avatar || !existing.sender_name) && m.sender_name) {
          existing.sender_name = m.sender_name;
          existing.sender_avatar = m.sender_avatar;
        }
      }
    });
    this.conversations = Array.from(convMap.values());
    if (this.selectedSenderId) this.filterDisplayedMessages();
  }

  selectConversation(senderId: string): void {
    this.selectedSenderId = senderId;
    this.filterDisplayedMessages();
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
      // await this.loadMessages(); // Không cần reload, WebSocket sẽ trả về tin nhắn vừa gửi
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