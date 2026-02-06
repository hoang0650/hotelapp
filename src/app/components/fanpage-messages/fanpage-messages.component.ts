import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { AuthService } from '../../services/auth.service';

interface FbMessage {
  tenant_id: string;
  page_id: string;
  sender_id: string;
  recipient_id?: string;
  text: string;
  direction: 'in' | 'out';
  timestamp: number;
  reply_text?: string;
}

@Component({
  selector: 'app-fanpage-messages',
  templateUrl: './fanpage-messages.component.html',
  styleUrls: ['./fanpage-messages.component.css']
})

export class FanpageMessagesComponent implements OnInit, OnDestroy {
  messages: FbMessage[] = [];
  pages: any[] = [];
  conversations: { sender_id: string; lastText: string; lastTime: number }[] = [];
  displayed: FbMessage[] = [];
  selectedPageId: string = '';
  selectedSenderId: string = '';
  replyText: string = '';
  loading: boolean = false;
  sending: boolean = false;
  isMobile = false;
  showSidebar = true;
  private pollTimer: any;

  private onWindowFocus = async () => {
    await this.refreshFacebookPages();
    // Nếu đã chọn page, refresh tin nhắn
    if (this.selectedPageId) {
      await this.loadMessages();
    }
  };

  constructor(private aiAssistant: AiAssistantService, private authService: AuthService) {}

  private getTenantId(): string {
    const u = this.authService.getCurrentUser();
    return (u?.hotelId || u?.businessId || 'default').toString();
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      this.isMobile = window.innerWidth <= 768;
      this.showSidebar = !this.isMobile;
      
      await this.refreshFacebookPages();
      
      if (this.pages.length > 0) {
        this.selectedPageId = this.pages[0].id;
        await this.loadMessages();
      }

      window.addEventListener('focus', this.onWindowFocus);
      
      // Polling tin nhắn mới mỗi 10 giây
      this.pollTimer = setInterval(() => {
        if (this.selectedPageId) {
          this.loadMessages();
        }
      }, 10000);

    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('focus', this.onWindowFocus);
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  async refreshFacebookPages(): Promise<void> {
    const tenantId = this.getTenantId();
    this.pages = await this.aiAssistant.getFacebookPages(tenantId);
  }

  async loadMessages(): Promise<void> {
    if (!this.selectedPageId) return;
    const tenantId = this.getTenantId();
    this.messages = await this.aiAssistant.getFacebookMessages(tenantId, this.selectedPageId);
    this.buildConversations();
  }

  private buildConversations(): void {
  const convMap = new Map<string, { sender_id: string; lastText: string; lastTime: number }>();
    
    // Sắp xếp tin nhắn mới nhất lên đầu
    const sorted = [...this.messages].sort((a, b) => b.timestamp - a.timestamp);
    
    sorted.forEach(m => {
      // SỬA LỖI TẠI ĐÂY:
      // Dùng toán tử || 'Unknown' để đảm bảo luôn trả về string, không bao giờ là undefined
      let partnerId = '';

      if (m.direction === 'in') {
        partnerId = m.sender_id; 
      } else {
        // Nếu là tin nhắn đi (out), lấy recipient_id, nếu không có thì lấy 'Unknown'
        partnerId = m.recipient_id || 'Unknown';
      }

      // Kiểm tra lần cuối: Nếu partnerId vẫn rỗng hoặc undefined (do dữ liệu lỗi), thì bỏ qua vòng lặp này
      if (!partnerId) return; 

      if (!convMap.has(partnerId)) {
        convMap.set(partnerId, {
          sender_id: partnerId,
          lastText: m.text,
          lastTime: m.timestamp
        });
      }
    });
    
    this.conversations = Array.from(convMap.values());
    
    if (this.selectedSenderId) {
      this.filterDisplayedMessages();
    }
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
      await this.loadMessages(); // Reload để thấy tin nhắn mới
    } catch (error) {
      console.error('Lỗi gửi tin nhắn:', error);
    } finally {
      this.sending = false;
    }
  }

  onEnterSend(event: any): void {
    this.sendReply();
  }

  toggleSidebar(): void {
    this.showSidebar = !this.showSidebar;
  }
}