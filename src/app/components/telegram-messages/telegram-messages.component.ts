import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { AuthService } from '../../services/auth.service';

interface TgMessage {
  tenant_id?: string;
  platform?: string;
  page_id: string;
  sender_id: string;
  recipient_id?: string;
  sender_name?: string;
  text: string;
  direction: 'in' | 'out';
  timestamp: number;
  mid?: string;
  is_bot?: boolean;
}

@Component({
  selector: 'app-telegram-messages',
  templateUrl: './telegram-messages.component.html',
  styleUrls: ['./telegram-messages.component.css']
})
export class TelegramMessagesComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('threadList') private threadList!: ElementRef;

  messages: TgMessage[] = [];
  bots: any[] = [];
  conversations: { sender_id: string; sender_name?: string; lastText: string; lastTime: number }[] = [];
  displayed: TgMessage[] = [];
  selectedBotId: string = '';
  selectedSenderId: string = '';
  replyText: string = '';
  botTokenInput: string = '';
  loading: boolean = false;
  sending: boolean = false;
  connecting: boolean = false;
  isBotActive: boolean = false;
  isMobile = false;
  showSidebar = true;
  showConnectModal = false;
  private wsSubscription: any;
  private shouldScrollToBottom = false;

  constructor(
    private aiAssistant: AiAssistantService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  private getTenantId(): string {
    const u = this.authService.getCurrentUser();
    const direct = (u?.hotelId || '').toString();
    if (direct) return direct;
    
    if (typeof window !== 'undefined') {
      return localStorage.getItem('selectedHotelId') || '';
    }
    return '';
  }

  get botModeText(): string {
    return this.isBotActive
      ? 'Hotel Agent đang bật: OpenClaw là lớp xử lý chính, ChatEngine điều phối tư vấn, đặt phòng và chốt sale trên Telegram.'
      : 'Sale Agent đang tắt: chỉ trả lời thủ công.';
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      this.isMobile = window.innerWidth <= 768;
      this.showSidebar = !this.isMobile;

      const tenantId = this.getTenantId();
      if (!tenantId) {
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      this.wsSubscription = this.aiAssistant.connectToWebSocket(tenantId).subscribe((msg: any) => {
        if (msg && msg.platform === 'telegram') {
          this.handleRealtimeMessage(msg);
        }
      });

      await this.refreshBots();

      if (this.bots.length > 0) {
        this.selectedBotId = this.bots[0].id;
        await this.loadMessages();
        await this.loadBotStatus();
      }
    } catch (e) {
      console.error('Lỗi khởi tạo Telegram:', e);
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
  }

  private scrollToBottom(): void {
    try {
      if (this.threadList) {
        this.threadList.nativeElement.scrollTop = this.threadList.nativeElement.scrollHeight;
      }
    } catch (_) {}
  }

  handleRealtimeMessage(msg: TgMessage) {
    if (msg.mid && this.messages.some(m => m.mid === msg.mid)) return;
    if (msg.page_id !== this.selectedBotId) return;

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
    if (!this.selectedBotId) return;
    const tenantId = this.getTenantId();
    if (!tenantId) return; // <--- Chặn rỗng

    this.isBotActive = await this.aiAssistant.getBotStatus(tenantId, this.selectedBotId, 'telegram');
  }

  async toggleBot(checked: boolean): Promise<void> {
    if (!this.selectedBotId) return;
    const tenantId = this.getTenantId();
    if (!tenantId) {
      this.isBotActive = !checked; // Hoàn tác
      return;
    }
    
    this.isBotActive = checked;
    try {
      await this.aiAssistant.toggleBot(tenantId, this.selectedBotId, checked, 'telegram');
    } catch (error) {
      console.error('Lỗi toggle bot:', error);
      this.isBotActive = !checked;
    }
  }

  async refreshData(): Promise<void> {
    this.loading = true;
    try {
      await this.refreshBots();
      if (this.selectedBotId) {
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

  async refreshBots(): Promise<void> {
    const tenantId = this.getTenantId();
    if (!tenantId) {
      this.bots = [];
      return;
    }
    try {
      this.bots = await this.aiAssistant.getTelegramBots(tenantId);
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Lỗi gọi API bots:', error);
      this.bots = [];
    }
  }

  async loadMessages(): Promise<void> {
    if (!this.selectedBotId) return;
    const tenantId = this.getTenantId();
    if (!tenantId) return;

    try {
      this.messages = await this.aiAssistant.getTelegramMessages(tenantId, this.selectedBotId);
      this.buildConversations();
      this.shouldScrollToBottom = true;
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Loi load tin nhan Telegram:', error);
    }
  }

  private buildConversations(): void {
    const convMap = new Map<string, any>();
    const nameMap = new Map<string, string>();

    this.messages.forEach(m => {
      if (m.direction === 'in' && m.sender_name) {
        nameMap.set(m.sender_id, m.sender_name);
      }
    });

    const sorted = [...this.messages].sort((a, b) => b.timestamp - a.timestamp);
    sorted.forEach(m => {
      const partnerId = m.direction === 'in' ? m.sender_id : (m.recipient_id || '');
      if (!partnerId) return;
      if (!convMap.has(partnerId)) {
        convMap.set(partnerId, {
          sender_id: partnerId,
          sender_name: nameMap.get(partnerId) || partnerId,
          lastText: m.text || '',
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

  async changeBot(botId: string): Promise<void> {
    this.selectedBotId = botId;
    this.selectedSenderId = '';
    this.displayed = [];
    await this.loadMessages();
    await this.loadBotStatus();
  }

  openConnectModal(): void {
    this.showConnectModal = true;
    this.botTokenInput = '';
  }

  async connectBot(): Promise<void> {
    if (!this.botTokenInput.trim()) return;
    
    const tenantId = this.getTenantId();
    if (!tenantId) return;

    this.connecting = true;
    try {
      await this.aiAssistant.connectTelegramBot(tenantId, this.botTokenInput.trim());
      this.showConnectModal = false;
      this.botTokenInput = '';
      await this.refreshBots();
      if (this.bots.length > 0) {
        this.selectedBotId = this.bots[this.bots.length - 1].id;
        await this.loadMessages();
        await this.loadBotStatus();
      }
    } catch (error) {
      console.error('Lỗi kết nối bot:', error);
    } finally {
      this.connecting = false;
      this.cdr.detectChanges();
    }
  }

  async sendReply(): Promise<void> {
    if (!this.replyText.trim() || !this.selectedSenderId || !this.selectedBotId) return;
    
    const tenantId = this.getTenantId();
    if (!tenantId) return;

    this.sending = true;
    try {
      await this.aiAssistant.sendTelegramMessage(tenantId, this.selectedBotId, this.selectedSenderId, this.replyText);
      this.replyText = '';
      this.shouldScrollToBottom = true;
    } catch (error) {
      console.error('Lỗi gửi tin nhắn Telegram:', error);
    } finally {
      this.sending = false;
      this.cdr.detectChanges();
    }
  }

  onEnterSend(event: any): void {
    this.sendReply();
  }

  toggleSidebar(): void {
    this.showSidebar = !this.showSidebar;
  }
}
