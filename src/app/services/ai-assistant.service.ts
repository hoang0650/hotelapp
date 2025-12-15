import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { firstValueFrom } from 'rxjs';

export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  isTyping?: boolean;
  fileUrl?: string;
  fileType?: string;
}

interface ChatResponse {
  success: boolean;
  response: string;
  context?: {
    dataScope: string;
    summary: string;
  };
}

interface ChatHistoryResponse {
  success: boolean;
  messages: ChatMessage[];
}

@Injectable({
  providedIn: 'root'
})
export class AiAssistantService {
  private messages = new BehaviorSubject<ChatMessage[]>([]);
  private isTyping = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClient) {
    // Load lịch sử chat khi khởi tạo
    this.loadChatHistory();
  }

  getMessages(): Observable<ChatMessage[]> {
    return this.messages.asObservable();
  }

  getTypingStatus(): Observable<boolean> {
    return this.isTyping.asObservable();
  }

  /**
   * Load lịch sử chat từ server
   */
  async loadChatHistory(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<ChatHistoryResponse>(`${environment.apiUrl}/ai-assistant/history`)
      );

      if (response.success && response.messages && response.messages.length > 0) {
        // Chuyển đổi messages từ server format sang ChatMessage format
        const chatMessages: ChatMessage[] = response.messages.map((msg: any, index: number) => ({
          id: msg._id || index.toString(),
          content: msg.content,
          role: msg.role,
          timestamp: new Date(msg.timestamp),
          ...(msg.fileUrl ? { fileUrl: msg.fileUrl } : {}),
          ...(msg.fileType ? { fileType: msg.fileType } : {})
        }));

        this.messages.next(chatMessages);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
      // Không hiển thị lỗi nếu không có lịch sử (có thể là lần đầu sử dụng)
    }
  }

  /**
   * Gửi tin nhắn đến AI Assistant
   */
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
      // Gọi API AI Assistant với authentication token (được thêm tự động bởi interceptor)
      const response = await firstValueFrom(
        this.http.post<ChatResponse>(
          `${environment.apiUrl}/ai-assistant/chat`,
          { message: content, fileUrl, fileType }
        )
      );

      // Thêm tin nhắn từ AI
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: response?.response || 'Xin lỗi, tôi không thể xử lý yêu cầu này.',
        role: 'assistant',
        timestamp: new Date()
      };

      this.addMessage(assistantMessage);
    } catch (error: any) {
      console.error('Error sending message:', error);
      
      // Xử lý lỗi cụ thể
      let errorMessage = 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại sau.';
      
      if (error.status === 401) {
        errorMessage = 'Bạn cần đăng nhập để sử dụng tính năng này.';
      } else if (error.status === 403) {
        errorMessage = 'Bạn không có quyền sử dụng tính năng này.';
      } else if (error.error?.message) {
        errorMessage = error.error.message;
      }

      // Thêm tin nhắn lỗi
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: errorMessage,
        role: 'assistant',
        timestamp: new Date()
      };
      this.addMessage(errorMsg);
    } finally {
      this.isTyping.next(false);
    }
  }

  /**
   * Xóa lịch sử chat
   */
  async clearChatHistory(): Promise<void> {
    try {
      await firstValueFrom(
        this.http.delete(`${environment.apiUrl}/ai-assistant/history`)
      );
      this.messages.next([]);
    } catch (error) {
      console.error('Error clearing chat history:', error);
      // Vẫn xóa local messages ngay cả khi API call thất bại
      this.messages.next([]);
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