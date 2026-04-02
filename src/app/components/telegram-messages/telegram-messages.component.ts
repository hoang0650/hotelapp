import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { AuthService } from '../../services/auth.service';

interface TgMessage {
  tenant_id: string;
  platform: string;
  page_id: string;
  sender_id: string;
  recipient_id?: string;
  sender_name?: string;
  text: string;
  direction: 'in' | 'out';
  timestamp: number;
  mid?: string;
}

@Component({
  selector: 'app-telegram-messages',
  templateUrl: './telegram-messages.component.html',
  styleUrls: ['./telegram-messages.component.css']
})
export class TelegramMessagesComponent implements OnInit, OnDestroy {
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

  ngOnDestroy(): void {
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
    }
  }

  handleRealtimeMessage(msg: TgMessage) {
    if (msg.mid && this.messages.some(m => m.mid === msg.mid)) return;
    if (msg.page_id !== this.selectedBotId) return;

    this.messages.push(msg);
    this.buildConversations();

    const partnerId = msg.direction === 'in' ? msg.sender_id : msg.recipient_id;
    if (partnerId === this.selectedSenderId) {
      this.filterDisplayedMessages();
    }
    this.cdr.detectChanges();
  }

  async loadBotStatus(): Promise<void> {
    if (!this.selectedBotId) return;
    const tenantId = this.getTenantId();
    this.isBotActive = await this.aiAssistant.getBotStatus(tenantId, this.selectedBotId);
  }

  async toggleBot(checked: boolean): Promise<void> {
    if (!this.selectedBotId) return;
    const tenantId = this.getTenantId();
    this.isBotActive = checked;
    try {
      await this.aiAssistant.toggleBot(tenantId, this.selectedBotId, checked);
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
    try {
      this.messages = await this.aiAssistant.getTelegramMessages(tenantId, this.selectedBotId);
      this.buildConversations();
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Lỗi load tin nhắn Telegram:', error);
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
          lastText: m.text || '',
          lastTime: m.timestamp
        });
      } else {
        const existing = convMap.get(partnerId);
        if (!existing.sender_name && m.sender_name) {
          existing.sender_name = m.sender_name;
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
    this.connecting = true;
    try {
      const tenantId = this.getTenantId();
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
    this.sending = true;
    try {
      const tenantId = this.getTenantId();
      await this.aiAssistant.sendTelegramMessage(tenantId, this.selectedBotId, this.selectedSenderId, this.replyText);
      this.replyText = '';
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
