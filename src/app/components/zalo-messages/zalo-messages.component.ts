import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { AuthService } from '../../services/auth.service';

interface ZaloMessage {
  tenant_id: string;
  platform: string;
  page_id: string;
  sender_id: string;
  recipient_id?: string;
  sender_name?: string;
  text: string;
  attachments?: any[];
  direction: 'in' | 'out';
  timestamp: number;
  mid?: string;
}

@Component({
  selector: 'app-zalo-messages',
  templateUrl: './zalo-messages.component.html',
  styleUrls: ['./zalo-messages.component.css']
})
export class ZaloMessagesComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('threadList') private threadList!: ElementRef;

  messages: ZaloMessage[] = [];
  oas: any[] = [];
  conversations: { sender_id: string; sender_name?: string; lastText: string; lastTime: number }[] = [];
  displayed: ZaloMessage[] = [];
  selectedOaId: string = '';
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
    if (this.selectedOaId) {
      await this.loadMessages();
      await this.loadBotStatus();
      this.cdr.detectChanges();
    }
  };

  private onPopupMessage = async (event: MessageEvent) => {
    if (event.data === 'zalo_connected') {
      await this.refreshOAs();
      if (this.oas && this.oas.length > 0 && !this.selectedOaId) {
        this.selectedOaId = this.oas[0].id;
      }
      if (this.selectedOaId) {
        await this.loadMessages();
        await this.loadBotStatus();
      }
      this.cdr.detectChanges();
    }
  };

  constructor(
    private aiAssistant: AiAssistantService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

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

      window.addEventListener('focus', this.onWindowFocus);
      window.addEventListener('message', this.onPopupMessage);

      this.wsSubscription = this.aiAssistant.connectToWebSocket(tenantId).subscribe((msg: any) => {
        if (msg && msg.platform === 'zalo') {
          this.handleRealtimeMessage(msg);
        }
      });

      await this.refreshOAs();

      if (this.oas.length > 0) {
        this.selectedOaId = this.oas[0].id;
        await this.loadMessages();
        await this.loadBotStatus();
      }
    } catch (e) {
      console.error('Lỗi khởi tạo Zalo:', e);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy(): void {
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
    }
    window.removeEventListener('focus', this.onWindowFocus);
    window.removeEventListener('message', this.onPopupMessage);
  }

  handleRealtimeMessage(msg: ZaloMessage) {
    if (msg.mid && this.messages.some(m => m.mid === msg.mid)) return;
    if (msg.page_id !== this.selectedOaId) return;

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
    if (!this.selectedOaId) return;
    const tenantId = this.getTenantId();
    this.isBotActive = await this.aiAssistant.getBotStatus(tenantId, this.selectedOaId);
  }

  async toggleBot(checked: boolean): Promise<void> {
    if (!this.selectedOaId) return;
    const tenantId = this.getTenantId();
    this.isBotActive = checked;
    try {
      await this.aiAssistant.toggleBot(tenantId, this.selectedOaId, checked);
    } catch (error) {
      console.error('Lỗi toggle bot:', error);
      this.isBotActive = !checked;
    }
  }

  async refreshData(): Promise<void> {
    this.loading = true;
    try {
      await this.refreshOAs();
      if (this.selectedOaId) {
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

  async refreshOAs(): Promise<void> {
    const tenantId = this.getTenantId();
    try {
      this.oas = await this.aiAssistant.getZaloOAs(tenantId);
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Lỗi gọi API OAs:', error);
      this.oas = [];
    }
  }

  async loadMessages(): Promise<void> {
    if (!this.selectedOaId) return;
    const tenantId = this.getTenantId();
    try {
      this.messages = await this.aiAssistant.getZaloMessages(tenantId, this.selectedOaId);
      this.buildConversations();
      this.shouldScrollToBottom = true;
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Lỗi load tin nhắn Zalo:', error);
    }
  }

  private buildConversations(): void {
    const convMap = new Map<string, any>();
    const sorted = [...this.messages].sort((a, b) => b.timestamp - a.timestamp);
    sorted.forEach(m => {
      const partnerId = m.direction === 'in' ? m.sender_id : (m.recipient_id || 'Unknown');
      if (!partnerId) return;
      if (!convMap.has(partnerId)) {
        convMap.set(partnerId, {
          sender_id: partnerId,
          sender_name: m.sender_name || partnerId,
          lastText: m.text || (m.attachments && m.attachments.length ? '[Đính kèm]' : ''),
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
      .filter(m =>
        (m.direction === 'in' && m.sender_id === this.selectedSenderId) ||
        (m.direction === 'out' && m.recipient_id === this.selectedSenderId)
      )
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async changeOA(oaId: string): Promise<void> {
    this.selectedOaId = oaId;
    this.selectedSenderId = '';
    this.displayed = [];
    await this.loadMessages();
    await this.loadBotStatus();
  }

  async connectZaloOA(): Promise<void> {
    const tenantId = this.getTenantId();
    const url = await this.aiAssistant.getZaloOAuthUrl(tenantId);
    if (url) {
      const width = 600, height = 700;
      const left = (window.innerWidth - width) / 2;
      const top = (window.innerHeight - height) / 2;
      window.open(url, 'ZaloLogin', `width=${width},height=${height},left=${left},top=${top}`);
    }
  }

  async sendReply(): Promise<void> {
    if (!this.replyText.trim() || !this.selectedSenderId || !this.selectedOaId) return;
    this.sending = true;
    try {
      const tenantId = this.getTenantId();
      await this.aiAssistant.sendZaloMessage(tenantId, this.selectedOaId, this.selectedSenderId, this.replyText);
      this.replyText = '';
    } catch (error) {
      console.error('Lỗi gửi tin nhắn Zalo:', error);
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

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  private scrollToBottom(): void {
    try {
      if (this.threadList) {
        this.threadList.nativeElement.scrollTop = this.threadList.nativeElement.scrollHeight;
      }
    } catch (_) {}
  }
}
