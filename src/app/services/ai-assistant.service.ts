import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { PricingService } from './pricing.service';

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

export interface OpenClawDirectUrlResponse {
  success: boolean;
  url?: string;
  payload?: any;
  message?: string;
}

export interface OpenClawApproveResponse {
  success: boolean;
  message?: string;
  result?: any;
}

// Đổi tên hoặc đảm bảo Interface trùng tên OpenClawDevicePairingItem mà Template sử dụng
export interface OpenClawDevicePairingItem {
  requestId?: string;
  clientId?: string;
  clientMode?: string;
  role?: string;
  roles?: string[];     
  scopes?: string[];    
  requestedAt?: string | Date;
  deviceId?: string;  
}

@Injectable({
  providedIn: 'root'
})
export class AiAssistantService {
  private messages = new BehaviorSubject<ChatMessage[]>([]);
  private isTyping = new BehaviorSubject<boolean>(false);
  private wsSubject = new BehaviorSubject<any>(null);
  private socket: WebSocket | null = null;
  private pingInterval: any; // Thêm biến lưu bộ đếm Heartbeat
  private chatHistoryLoaded = false;
  private packageScopeCache:
    | {
        userId: string;
        cachedAt: number;
        value: any;
      }
    | null = null;

  // URL tới Python Backend (FastAPI/Flask) - Nơi xử lý Facebook & AI
  private aiUrl = environment.aiUrl; 
  
  // URL tới Backend nội bộ (NodeJS/Java...) - Nơi lưu lịch sử chat nội bộ
  private apiUrl = environment.apiUrl; 

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private pricingService: PricingService
  ) {}

  private normalizeId(value: any): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value._id) return String(value._id);
    if (typeof value === 'object' && value.id) return String(value.id);
    return String(value);
  }

  private normalizeStringArray(values: any): string[] {
    if (!Array.isArray(values)) {
      return [];
    }
    const normalized = values
      .map(value => String(value || '').trim())
      .filter(Boolean);
    return Array.from(new Set(normalized));
  }

  private async resolveCurrentPackageSnapshot(userId: string | null): Promise<any | null> {
    if (!userId) {
      return null;
    }

    const now = Date.now();
    if (
      this.packageScopeCache &&
      this.packageScopeCache.userId === userId &&
      now - this.packageScopeCache.cachedAt < 30000
    ) {
      return this.packageScopeCache.value;
    }

    try {
      const response = await firstValueFrom(this.pricingService.getCurrentUserPackage(userId));
      const pkg = response && (response as any).success !== false
        ? (response as any).data || response
        : response;
      this.packageScopeCache = {
        userId,
        cachedAt: now,
        value: pkg || null
      };
      return pkg || null;
    } catch {
      this.packageScopeCache = {
        userId,
        cachedAt: now,
        value: null
      };
      return null;
    }
  }

  public getEffectiveTenantId(): string {
    const currentHotelId = localStorage.getItem('current_hotel_id');
    const selectedHotelId = localStorage.getItem('selectedHotelId');
    const hotelId = localStorage.getItem('hotel_id');

    return (currentHotelId || selectedHotelId || hotelId || '').trim();
  }

  private async buildAiScopePayload(): Promise<{
    selectedHotelId: string | null;
    hotelId: string | null;
    businessId: string | null;
    aiScope: {
      role: string;
      businessId?: string;
      hotelId?: string;
      allowedTargets: string[];
    };
    packageId: string | null;
    packageFeatures: string[];
    packagePermissions: string[];
    maxUsers: number | null;
    maxRooms: number | null;
    source: string;
  }> {
    const currentUser = this.authService.getCurrentUser();
    const userId = this.normalizeId(currentUser?._id);
    const selectedHotelId = this.normalizeId(await this.resolveHotelIdForAi());
    const aiScope = this.authService.getAIScope();
    const packageSnapshot = await this.resolveCurrentPackageSnapshot(userId);

    const packageFeatures = this.normalizeStringArray(packageSnapshot?.features);
    const packagePermissions = this.normalizeStringArray(packageSnapshot?.permissions);
    const delegatedFeatures = this.normalizeStringArray((currentUser as any)?.features);
    const delegatedPackagePermissions = this.normalizeStringArray((currentUser as any)?.packagePermissions);

    const effectiveFeatures = delegatedFeatures.length
      ? packageFeatures.filter(feature => delegatedFeatures.includes(feature))
      : packageFeatures;
    const effectivePackagePermissions = delegatedPackagePermissions.length
      ? packagePermissions.filter(permission => delegatedPackagePermissions.includes(permission))
      : packagePermissions;

    const businessId = this.normalizeId(aiScope.businessId || currentUser?.businessId || null);
    const hotelId = this.normalizeId(selectedHotelId || aiScope.hotelId || currentUser?.hotelId || null);

    return {
      selectedHotelId: hotelId,
      hotelId,
      businessId,
      aiScope: {
        role: aiScope.role || currentUser?.role || 'guest',
        ...(businessId ? { businessId } : {}),
        ...(hotelId ? { hotelId } : {}),
        allowedTargets: this.normalizeStringArray(aiScope.allowedTargets)
      },
      packageId: this.normalizeId(packageSnapshot?._id || packageSnapshot?.id || null),
      packageFeatures: effectiveFeatures,
      packagePermissions: effectivePackagePermissions,
      maxUsers: typeof packageSnapshot?.maxUsers === 'number' ? packageSnapshot.maxUsers : null,
      maxRooms: typeof packageSnapshot?.maxRooms === 'number' ? packageSnapshot.maxRooms : null,
      source: 'hotelapp-management'
    };
  }

  // --- WEBSOCKET FOR REALTIME UPDATES ---
  connectToWebSocket(tenantId: string): Observable<any> {
    // Nếu socket đang mở hoặc đang kết nối, dùng lại
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return this.wsSubject.asObservable();
    }

    // Đóng socket cũ và dọn dẹp bộ đếm nếu có
    this.disconnectWebSocket();

    const wsUrl = this.aiUrl.replace('http', 'ws') + `/ws/messages/${tenantId}`;
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log('Connected to WebSocket:', wsUrl);
      
      // Khởi tạo Heartbeat: Gửi "ping" mỗi 30 giây để tránh lỗi 499 trên Railway
      this.pingInterval = setInterval(() => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send('ping');
        }
      }, 30000);
    };

    this.socket.onmessage = (event) => {
      // Bỏ qua tin nhắn "pong" trả về từ server, không đưa vào xử lý JSON
      if (event.data === 'pong') {
        return;
      }
      
      try {
        const data = JSON.parse(event.data);
        this.wsSubject.next(data);
      } catch (e) {
        console.error('Error parsing WebSocket message:', e);
      }
    };

    this.socket.onclose = () => {
      console.log('WebSocket connection closed');
      this.clearHeartbeat();
      this.socket = null; // Reset socket để có thể reconnect sau này
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.clearHeartbeat();
    };

    return this.wsSubject.asObservable();
  }

  getWebSocketMessages(): Observable<any> {
    return this.wsSubject.asObservable();
  }

  // Hàm hỗ trợ ngắt kết nối chủ động
  disconnectWebSocket(): void {
    this.clearHeartbeat();
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {
        console.error('Error closing old socket:', e);
      }
      this.socket = null;
    }
  }

  private clearHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }


  // --- 1. CÁC HÀM CHO CHATBOT NỘI BỘ (Angular Chat UI) ---

  getMessages(): Observable<ChatMessage[]> {
    return this.messages.asObservable();
  }

  getTypingStatus(): Observable<boolean> {
    return this.isTyping.asObservable();
  }

  async loadChatHistory(force = false): Promise<void> {
    try {
      // Kiểm tra nếu chưa cấu hình apiUrl thì bỏ qua
      if (!this.apiUrl) return;
      if (!this.authService.getCurrentUser() || !this.authService.getToken()) {
        this.messages.next([]);
        this.chatHistoryLoaded = false;
        return;
      }
      if (this.chatHistoryLoaded && !force) {
        return;
      }

      const scopePayload = await this.buildAiScopePayload();
      const response = await firstValueFrom(
        this.http.get<ChatHistoryResponse>(`${this.apiUrl}/ai-assistant/history`, {
          params: {
            selectedHotelId: scopePayload.selectedHotelId || '',
            source: scopePayload.source
          }
        })
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
      this.chatHistoryLoaded = true;
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
      const scopePayload = await this.buildAiScopePayload();
      const response = await firstValueFrom(
        this.http.post<ChatResponse>(
          `${this.apiUrl}/ai-assistant/chat`,
          {
            message: content,
            fileUrl,
            fileType,
            selectedHotelId: scopePayload.selectedHotelId,
            hotelId: scopePayload.hotelId,
            businessId: scopePayload.businessId,
            aiScope: scopePayload.aiScope,
            packageId: scopePayload.packageId,
            packageFeatures: scopePayload.packageFeatures,
            packagePermissions: scopePayload.packagePermissions,
            maxUsers: scopePayload.maxUsers,
            maxRooms: scopePayload.maxRooms,
            source: scopePayload.source
          }
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
      const scopePayload = await this.buildAiScopePayload();
      await firstValueFrom(this.http.delete(`${this.apiUrl}/ai-assistant/history`, {
        body: {
          selectedHotelId: scopePayload.selectedHotelId,
          source: scopePayload.source
        }
      }));
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
    this.chatHistoryLoaded = false;
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
    const scopePayload = await this.buildAiScopePayload();
    const normalizedTenantId = this.normalizeId(tenantId) || tenantId;

    try {
      const response = await firstValueFrom(
        this.http.post<any>(`${this.apiUrl}/ai-assistant/chat`, {
          message: question,
          tenantId: normalizedTenantId,
          selectedHotelId: scopePayload.selectedHotelId,
          hotelId: scopePayload.hotelId || normalizedTenantId || null,
          businessId: scopePayload.businessId,
          aiScope: scopePayload.aiScope,
          packageId: scopePayload.packageId,
          packageFeatures: scopePayload.packageFeatures,
          packagePermissions: scopePayload.packagePermissions,
          maxUsers: scopePayload.maxUsers,
          maxRooms: scopePayload.maxRooms,
          apiUrl: this.apiUrl,
          source: scopePayload.source
        })
      );
      const answerText =
        response?.response || response?.answer || 'Xin lỗi, tôi chưa có dữ liệu để tư vấn.';
      
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

  private async resolveHotelIdForAi(): Promise<string | null> {
    const direct = this.authService.getHotelId();
    if (direct) return direct;

    const userId = this.authService.getUserId();
    if (!userId) return null;
    if (!this.apiUrl) return null;

    try {
      const resp = await firstValueFrom(
        this.http.get<any>(`${this.apiUrl}/sessions/selected-hotel`, { params: { userId } })
      );
      return resp?.selectedHotelId || null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Lấy Bearer Token từ LocalStorage để đính kèm vào Header
   */
  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('access_token') || localStorage.getItem('token') || '';
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
    });
  }

  /**
   * Gọi API sinh URL Auto-Login kèm Hash Token cho OpenClaw
   */
  getOpenClawDirectUrl(userId?: string): Observable<OpenClawDirectUrlResponse> {
    const currentHotelId = localStorage.getItem('current_hotel_id') || '';
    const selectedHotelId = localStorage.getItem('selectedHotelId') || '';
    const effectiveTenantId = this.getEffectiveTenantId();

    let params = new HttpParams()
      .set('tenant_id', effectiveTenantId)
      .set('current_hotel_id', currentHotelId)
      .set('selected_hotel_id', selectedHotelId);

    if (userId) {
      params = params.set('user_id', userId);
    }

    return this.http.get<OpenClawDirectUrlResponse>(
      `${this.aiUrl}/admin/openclaw/direct-url`,
      { params }
    );
  }
  /**
   * Gọi API tự động Approve phiên đăng nhập Device Pairing
   */
 approveOpenClawPairing(requestId?: string): Observable<OpenClawApproveResponse> {
        const currentHotelId = localStorage.getItem('current_hotel_id') || '';
        const selectedHotelId = localStorage.getItem('selectedHotelId') || '';
        const effectiveTenantId = this.getEffectiveTenantId();
        const params = new HttpParams()
          .set('tenant_id', effectiveTenantId)
          .set('current_hotel_id', currentHotelId)
          .set('selected_hotel_id', selectedHotelId);
        const body = {
          requestId: requestId || null,
          tenant_id: effectiveTenantId,
          current_hotel_id: currentHotelId,
          selected_hotel_id: selectedHotelId
        };
        return this.http.post<OpenClawApproveResponse>(
          `${this.aiUrl}/admin/openclaw/device-pairings/approve`,
          body,
          { params }
        );
      }

  // Add the missing method
  getOpenClawPendingPairings(): Observable<{ success: boolean; data?: OpenClawDevicePairingItem[]; message?: string }> {
    const currentHotelId = localStorage.getItem('current_hotel_id') || '';
    const selectedHotelId = localStorage.getItem('selectedHotelId') || '';
    const effectiveTenantId = this.getEffectiveTenantId();

    const params = new HttpParams()
      .set('tenant_id', effectiveTenantId)
      .set('current_hotel_id', currentHotelId)
      .set('selected_hotel_id', selectedHotelId);

    return this.http.get<{ success: boolean; data?: OpenClawDevicePairingItem[]; message?: string }>(
      `${this.aiUrl}/admin/openclaw/device-pairings`,
      { params }
    );
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
  async toggleBot(
    tenantId: string,
    pageId: string,
    active: boolean,
    platform?: 'facebook' | 'zalo' | 'telegram'
  ): Promise<any> {
    try {
      return await firstValueFrom(
        this.http.post<any>(`${this.aiUrl}/bot/toggle`, {
          tenant_id: tenantId,
          page_id: pageId,
          active,
          platform
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
  async getBotStatus(
    tenantId: string,
    pageId: string,
    platform?: 'facebook' | 'zalo' | 'telegram'
  ): Promise<boolean> {
    try {
      const params: Record<string, string> = {
        tenant_id: tenantId,
        page_id: pageId
      };
      if (platform) {
        params['platform'] = platform;
      }
      const resp = await firstValueFrom<{ active?: boolean }>(
        this.http.get<{ active?: boolean }>(`${this.aiUrl}/bot/status`, {
          params
        })
      );
      return resp?.active || false;
    } catch (error) {
      console.error('Lỗi lấy trạng thái bot:', error);
      return false;
    }
  }

  // --- 4. ZALO OA INTEGRATION ---

  async getZaloOAuthUrl(tenantId: string): Promise<string> {
    try {
      const resp = await firstValueFrom(
        this.http.get<any>(`${this.aiUrl}/zalo/oauth-url`, { params: { tenant_id: tenantId } })
      );
      return resp?.url || '';
    } catch (error) {
      console.error('Lỗi lấy Zalo OAuth URL:', error);
      return '';
    }
  }

  async getZaloOAs(tenantId: string): Promise<any[]> {
    try {
      const resp = await firstValueFrom(
        this.http.get<any>(`${this.aiUrl}/zalo/oas`, { params: { tenant_id: tenantId } })
      );
      return resp?.oas || [];
    } catch (error) {
      console.error('Lỗi lấy danh sách Zalo OA:', error);
      return [];
    }
  }

  async getZaloMessages(tenantId: string, oaId?: string): Promise<any[]> {
    try {
      const params: any = { tenant_id: tenantId };
      if (oaId) params.oa_id = oaId;
      const resp = await firstValueFrom(
        this.http.get<any>(`${this.aiUrl}/zalo/messages`, { params })
      );
      return resp?.messages || [];
    } catch (error) {
      console.error('Lỗi lấy tin nhắn Zalo:', error);
      return [];
    }
  }

  async sendZaloMessage(tenantId: string, oaId: string, recipientId: string, text: string): Promise<any> {
    return await firstValueFrom(
      this.http.post<any>(`${this.aiUrl}/zalo/send`, {
        tenant_id: tenantId, oa_id: oaId, recipient_id: recipientId, text
      })
    );
  }

  // --- 5. TELEGRAM INTEGRATION ---

  async connectTelegramBot(tenantId: string, botToken?: string): Promise<any> {
    try {
      const body: any = { tenant_id: tenantId };
      if (botToken) body.bot_token = botToken;
      return await firstValueFrom(
        this.http.post<any>(`${this.aiUrl}/telegram/connect`, body)
      );
    } catch (error) {
      console.error('Lỗi kết nối Telegram bot:', error);
      throw error;
    }
  }

  async getTelegramBots(tenantId: string): Promise<any[]> {
    try {
      const resp = await firstValueFrom(
        this.http.get<any>(`${this.aiUrl}/telegram/bots`, { params: { tenant_id: tenantId } })
      );
      return resp?.bots || [];
    } catch (error) {
      console.error('Lỗi lấy danh sách Telegram bots:', error);
      return [];
    }
  }

  async getTelegramMessages(tenantId: string, botId?: string): Promise<any[]> {
    try {
      const params: any = { tenant_id: tenantId };
      if (botId) params.bot_id = botId;
      const resp = await firstValueFrom(
        this.http.get<any>(`${this.aiUrl}/telegram/messages`, { params })
      );
      return resp?.messages || [];
    } catch (error) {
      console.error('Lỗi lấy tin nhắn Telegram:', error);
      return [];
    }
  }

  async sendTelegramMessage(tenantId: string, botId: string, chatId: string, text: string): Promise<any> {
    return await firstValueFrom(
      this.http.post<any>(`${this.aiUrl}/telegram/send`, {
        tenant_id: tenantId, bot_id: botId, chat_id: chatId, text
      })
    );
  }
  

}
