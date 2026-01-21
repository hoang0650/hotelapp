import { Component, OnInit } from '@angular/core';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { AuthService } from '../../services/auth.service';

interface FbMessage {
  tenant_id: string;
  page_id: string;
  sender_id: string;
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
export class FanpageMessagesComponent implements OnInit {
  messages: FbMessage[] = [];
  pages: any[] = [];
  conversations: { sender_id: string; lastText: string; lastTime: number }[] = [];
  displayed: FbMessage[] = [];
  selectedPageId: string = '';
  selectedSenderId: string = '';
  replyText: string = '';
  loading = false;
  sending = false;

  constructor(private aiAssistant: AiAssistantService, private authService: AuthService) {}

  private getTenantId(): string {
    const u = this.authService.getCurrentUser();
    return (u?.hotelId || u?.businessId || 'default').toString();
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      const tenantId = this.getTenantId();
      this.pages = await this.aiAssistant.getFacebookPages(tenantId);
      this.selectedPageId = this.pages?.[0]?.id || '';
      this.messages = await this.aiAssistant.getFacebookMessages(tenantId);
      this.buildConversations();
      if (this.conversations.length) {
        this.selectConversation(this.conversations[0].sender_id);
      }
    } finally {
      this.loading = false;
    }
  }

  private buildConversations(): void {
    const filtered = this.messages.filter(m => !this.selectedPageId || m.page_id === this.selectedPageId);
    const map: { [key: string]: FbMessage[] } = {};
    for (const m of filtered) {
      if (!map[m.sender_id]) map[m.sender_id] = [];
      map[m.sender_id].push(m);
    }
    const convs: { sender_id: string; lastText: string; lastTime: number }[] = [];
    Object.keys(map).forEach(sender => {
      const sorted = map[sender].slice().sort((a, b) => a.timestamp - b.timestamp);
      const last = sorted[sorted.length - 1];
      convs.push({ sender_id: sender, lastText: last.text, lastTime: last.timestamp });
    });
    convs.sort((a, b) => b.lastTime - a.lastTime);
    this.conversations = convs;
    this.displayed = [];
  }

  async changePage(pageId: string): Promise<void> {
    this.selectedPageId = pageId;
    this.buildConversations();
    if (this.conversations.length) {
      this.selectConversation(this.conversations[0].sender_id);
    } else {
      this.selectedSenderId = '';
      this.displayed = [];
    }
  }

  selectConversation(senderId: string): void {
    this.selectedSenderId = senderId;
    const thread = this.messages
      .filter(m => (!this.selectedPageId || m.page_id === this.selectedPageId) && m.sender_id === senderId)
      .sort((a, b) => a.timestamp - b.timestamp);
    this.displayed = thread;
  }

  async sendReply(): Promise<void> {
    if (!this.replyText.trim() || !this.selectedSenderId || !this.selectedPageId) return;
    const tenantId = this.getTenantId();
    this.sending = true;
    try {
      await this.aiAssistant.sendFacebookMessage(tenantId, this.selectedPageId, this.selectedSenderId, this.replyText.trim());
      const now = Date.now();
      const outgoing: FbMessage = {
        tenant_id: tenantId,
        page_id: this.selectedPageId,
        sender_id: this.selectedSenderId,
        text: this.replyText.trim(),
        direction: 'out',
        timestamp: now,
        reply_text: this.replyText.trim()
      };
      this.messages = [...this.messages, outgoing];
      this.replyText = '';
      this.selectConversation(this.selectedSenderId);
      this.buildConversations();
    } finally {
      this.sending = false;
    }
  }
}
