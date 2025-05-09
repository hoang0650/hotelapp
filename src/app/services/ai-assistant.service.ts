import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  isTyping?: boolean;
  fileUrl?: string;
  fileType?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AiAssistantService {
  private messages = new BehaviorSubject<ChatMessage[]>([]);
  private isTyping = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClient) {}

  getMessages(): Observable<ChatMessage[]> {
    return this.messages.asObservable();
  }

  getTypingStatus(): Observable<boolean> {
    return this.isTyping.asObservable();
  }

  async sendMessage(content: string, fileUrl?: string, fileType?: string): Promise<void> {
    // Thêm tin nhắn của user
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content,
      role: 'user',
      timestamp: new Date(),
      ...(fileUrl ? { fileUrl } : {}),
      ...(fileType ? { fileType } : {})
    };
    
    this.addMessage(userMessage);
    this.isTyping.next(true);

    try {
      // Gọi API AI Assistant (tạm thời chỉ gửi message, có thể mở rộng gửi file sau)
      const response = await this.http.post<{response: string}>(
        `${environment.apiUrl}/ai-assistant/chat`,
        { message: content, fileUrl, fileType }
      ).toPromise();

      // Thêm tin nhắn từ AI
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: response?.response || 'Xin lỗi, tôi không thể xử lý yêu cầu này.',
        role: 'assistant',
        timestamp: new Date()
      };

      this.addMessage(assistantMessage);
    } catch (error) {
      console.error('Error sending message:', error);
      // Thêm tin nhắn lỗi
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại sau.',
        role: 'assistant',
        timestamp: new Date()
      };
      this.addMessage(errorMessage);
    } finally {
      this.isTyping.next(false);
    }
  }

  private addMessage(message: ChatMessage): void {
    const currentMessages = this.messages.value;
    this.messages.next([...currentMessages, message]);
  }

  clearMessages(): void {
    this.messages.next([]);
  }
} 