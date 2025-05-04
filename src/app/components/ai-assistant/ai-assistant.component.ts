import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { AiAssistantService, ChatMessage } from '../../services/ai-assistant.service';
import { FormControl } from '@angular/forms';

@Component({
  selector: 'app-ai-assistant',
  templateUrl: './ai-assistant.component.html',
  styleUrls: ['./ai-assistant.component.css']
})
export class AiAssistantComponent implements OnInit, AfterViewChecked {
  @ViewChild('messageContainer') private messageContainer!: ElementRef;
  
  messages: ChatMessage[] = [];
  messageInput = new FormControl('');
  isTyping = false;

  constructor(private aiService: AiAssistantService) {}

  ngOnInit(): void {
    this.aiService.getMessages().subscribe(messages => {
      this.messages = messages;
      this.scrollToBottom();
    });

    this.aiService.getTypingStatus().subscribe(status => {
      this.isTyping = status;
    });
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  async sendMessage(): Promise<void> {
    const message = this.messageInput.value?.trim();
    if (!message) return;

    await this.aiService.sendMessage(message);
    this.messageInput.reset();
  }

  private scrollToBottom(): void {
    try {
      this.messageContainer.nativeElement.scrollTop = this.messageContainer.nativeElement.scrollHeight;
    } catch (err) {
      console.error('Error scrolling to bottom:', err);
    }
  }

  getMessageTime(timestamp: Date): string {
    return new Date(timestamp).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
} 