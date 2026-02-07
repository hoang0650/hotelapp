import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

// Interface cho sản phẩm (Dataset)
export interface Product {
  name: string;
  price: string;
  description: string;
  use_case?: string;
}

// Interface cho tin nhắn Chatbot nội bộ
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

  // URL tới Python Backend (FastAPI/Flask) - Nơi xử lý Facebook & AI
  private aiUrl = environment.aiUrl; 
  
  // URL tới Backend nội bộ (NodeJS/Java...) - Nơi lưu lịch sử chat nội bộ
  private apiUrl = environment.apiUrl; 

  constructor(private http: HttpClient) {
    // Load lịch sử chat nội bộ khi khởi tạo (nếu cần)
    this.loadChatHistory();
  }

  // --- 1. CÁC HÀM CHO CHATBOT NỘI BỘ (Angular Chat UI) ---

  getMessages(): Observable<ChatMessage[]> {
    return this.messages.asObservable();
  }

  getTypingStatus(): Observable<boolean> {
    return this.isTyping.asObservable();
  }

  async loadChatHistory(): Promise<void> {
    try {
      // Kiểm tra nếu chưa cấu hình apiUrl thì bỏ qua
      if (!this.apiUrl) return;

      const response = await firstValueFrom(
        this.http.get<ChatHistoryResponse>(`${this.apiUrl}/ai-assistant/history`)
      );

      if (response.success && response.messages && response.messages.length > 0) {
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
      console.warn('Không tải được lịch sử chat (có thể do chưa đăng nhập hoặc API chưa sẵn sàng).');
    }
  }

  async sendMessage(content: string, fileUrl?: string, fileType?: string): Promise<void> {
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
      const response = await firstValueFrom(
        this.http.post<ChatResponse>(
          `${this.apiUrl}/ai-assistant/chat`,
          { message: content, fileUrl, fileType }
        )
      );

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: response?.response || 'Xin lỗi, tôi không thể xử lý yêu cầu này.',
        role: 'assistant',
        timestamp: new Date()
      };

      this.addMessage(assistantMessage);
    } catch (error: any) {
      console.error('Error sending message:', error);
      
      let errorMessage = 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại sau.';
      if (error.status === 401) errorMessage = 'Bạn cần đăng nhập để sử dụng tính năng này.';
      else if (error.status === 403) errorMessage = 'Bạn không có quyền sử dụng tính năng này.';
      else if (error.error?.message) errorMessage = error.error.message;

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

  async clearChatHistory(): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`${this.apiUrl}/ai-assistant/history`));
      this.messages.next([]);
    } catch (error) {
      console.error('Error clearing chat history:', error);
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

  // --- 2. CÁC HÀM KẾT NỐI AI PYTHON (FastAPI/Flask) ---

  /**
   * Chat trực tiếp với AI Server (không qua backend nội bộ)
   */
  async sendMessageExternal(question: string, tenantId: string): Promise<void> {
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: question,
      role: 'user',
      timestamp: new Date()
    };
    this.addMessage(userMessage);
    this.isTyping.next(true);

    try {
      const response = await firstValueFrom(
        this.http.post<any>(`${this.aiUrl}/chat`, { tenant_id: tenantId, question })
      );
      const answerText = response?.answer || 'Xin lỗi, tôi chưa có dữ liệu để tư vấn.';
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: answerText,
        role: 'assistant',
        timestamp: new Date()
      };
      this.addMessage(assistantMessage);
    } catch (error: any) {
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: error?.error?.error || 'Lỗi gọi AI tư vấn.',
        role: 'assistant',
        timestamp: new Date()
      };
      this.addMessage(assistantMessage);
    } finally {
      this.isTyping.next(false);
    }
  }

  /**
   * Upload Dataset
   */
  async uploadDatasetExternal(tenantId: string, products: Product[], botContext?: any): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post<any>(`${this.aiUrl}/dataset`, { 
          tenant_id: tenantId, 
          products, 
          bot_context: botContext 
        })
      );
      this.addMessage({
        id: Date.now().toString(),
        content: `Đã cập nhật dataset cho tenant ${tenantId}.`,
        role: 'assistant',
        timestamp: new Date()
      });
    } catch (error: any) {
      this.addMessage({
        id: Date.now().toString(),
        content: error?.error?.error || 'Lỗi cập nhật dataset.',
        role: 'assistant',
        timestamp: new Date()
      });
    }
  }

  // --- 3. CÁC HÀM FACEBOOK INTEGRATION (Dành cho FanpageMessagesComponent) ---

  /**
   * Lấy URL login Facebook (OAuth)
   */
  async getFacebookOAuthUrl(tenantId: string): Promise<string> {
    try {
      const resp = await firstValueFrom(
        this.http.get<any>(`${this.aiUrl}/facebook/oauth-url`, { 
          params: { tenant_id: tenantId } 
        })
      );
      return resp?.url || '';
    } catch (error) {
      console.error('Lỗi lấy Facebook OAuth URL:', error);
      return '';
    }
  }

  /**
   * Lấy danh sách Fanpage đã kết nối
   */
  async getFacebookPages(tenantId: string): Promise<any[]> {
    try {
      const resp = await firstValueFrom(
        this.http.get<any>(`${this.aiUrl}/facebook/pages`, { 
          params: { tenant_id: tenantId } 
        })
      );
      return resp?.pages || [];
    } catch (error) {
      console.error('Lỗi lấy danh sách Pages:', error);
      return [];
    }
  }

  /**
   * Lấy tin nhắn Facebook từ DB của server Python
   */
  async getFacebookMessages(tenantId: string, pageId?: string): Promise<any[]> {
    try {
      const params: any = { tenant_id: tenantId };
      if (pageId) {
        params.page_id = pageId;
      }
      
      const resp = await firstValueFrom(
        this.http.get<any>(`${this.aiUrl}/facebook/messages`, { params })
      );
      return resp?.messages || [];
    } catch (error) {
      console.error('Lỗi lấy tin nhắn Facebook:', error);
      return [];
    }
  }

  /**
   * Gửi tin nhắn trả lời (Reply) tới khách hàng trên Facebook
   */
  async sendFacebookMessage(tenantId: string, pageId: string, recipientId: string, text: string): Promise<any> {
    return await firstValueFrom(
      this.http.post<any>(`${this.aiUrl}/facebook/send`, {
        tenant_id: tenantId,
        page_id: pageId,
        recipient_id: recipientId,
        text
      })
    );
  }

  /**
   * Bật/Tắt Bot cho Fanpage
   */
  async toggleBot(tenantId: string, pageId: string, active: boolean): Promise<any> {
    try {
      return await firstValueFrom(
        this.http.post<any>(`${this.aiUrl}/bot/toggle`, {
          tenant_id: tenantId,
          page_id: pageId,
          active
        })
      );
    } catch (error) {
      console.error('Lỗi bật/tắt bot:', error);
      throw error;
    }
  }

  /**
   * Lấy trạng thái Bot
   */
  async getBotStatus(tenantId: string, pageId: string): Promise<boolean> {
    try {
      const resp = await firstValueFrom(
        this.http.get<any>(`${this.aiUrl}/bot/status`, {
          params: { tenant_id: tenantId, page_id: pageId }
        })
      );
      return resp?.active || false;
    } catch (error) {
      console.error('Lỗi lấy trạng thái bot:', error);
      return false;
    }
  }
}