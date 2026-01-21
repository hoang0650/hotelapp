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
  loading = false;

  constructor(private aiAssistant: AiAssistantService, private authService: AuthService) {}

  private getTenantId(): string {
    const u = this.authService.getCurrentUser();
    return (u?.hotelId || u?.businessId || 'default').toString();
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      const tenantId = this.getTenantId();
      this.messages = await this.aiAssistant.getFacebookMessages(tenantId);
    } finally {
      this.loading = false;
    }
  }
}
