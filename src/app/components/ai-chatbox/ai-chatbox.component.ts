import { Component, OnDestroy, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { AiAssistantService, ChatMessage as BaseChatMessage } from '../../services/ai-assistant.service';
import { AuthService } from '../../services/auth.service';
import { PricingService } from '../../services/pricing.service';
import { HotelService } from '../../services/hotel.service';
import { ApiService } from '../../services/api.service';
import { Hotel } from '../../interfaces/hotel';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { NzUploadFile } from 'ng-zorro-antd/upload';
import { NzModalService } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';

// Mở rộng ChatMessage để hỗ trợ file
interface ChatMessage extends BaseChatMessage {
  fileUrl?: string;
  fileType?: string;
}

@Component({
  selector: 'app-ai-chatbox',
  templateUrl: './ai-chatbox.component.html',
  styleUrls: ['./ai-chatbox.component.css']
})
export class AiChatboxComponent implements OnInit, OnDestroy, AfterViewChecked {
  messages: ChatMessage[] = [];
  isTyping = false;
  inputValue = '';
  minimized = true;
  openingOpenClaw = false;

  hotels: Hotel[] = [];
  selectedHotelId: string | null = null;
  loadingHotels = false;

  get isHotelSelectionDisabled(): boolean {
    return this.authService.isHotelManager() || this.authService.isStaff();
  }

  get canOpenOpenClaw(): boolean {
    return this.canUseAiChatbox && this.isOpenClawRoleEligible();
  }

  get chatboxModeTitle(): string {
    return this.isManagementAssistantMode()
      ? 'Trợ lý quản lý OpenClaw'
      : 'AI Chatbox';
  }

  get chatboxModeDescription(): string {
    if (this.authService.isBusiness()) {
      return 'Dùng OpenClaw để hỗ trợ chủ doanh nghiệp quản lý chuỗi khách sạn, doanh thu, vận hành và ra quyết định.';
    }
    if (this.authService.isHotelManager()) {
      return 'Dùng OpenClaw để hỗ trợ quản lý khách sạn theo phạm vi khách sạn đang chọn.';
    }
    if (this.authService.isSuperAdmin() || this.authService.isAdmin()) {
      return 'Dùng OpenClaw để giám sát và hỗ trợ quản trị toàn hệ thống.';
    }
    return 'Dùng AI theo phạm vi gói và quyền hiện tại.';
  }

  selectedFile?: File;
  selectedFileType?: string;
  selectedFilePreview?: string;
  selectedFileName?: string;
  revenueQuickActions = [
    { label: 'Doanh thu hôm nay', query: 'Doanh thu hôm nay' },
    { label: 'Doanh thu hôm qua', query: 'Doanh thu hôm qua' },
    { label: 'Doanh thu tuần này', query: 'Doanh thu tuần này' },
    { label: 'Doanh thu tháng này', query: 'Doanh thu tháng này' },
    { label: 'Doanh thu năm nay', query: 'Doanh thu năm nay' }
  ];
  exportQuickActions = [
    { label: 'Xuất Excel', query: 'Xuất file Excel báo cáo doanh thu tháng này' },
    { label: 'Xuất Word', query: 'Xuất file Word báo cáo doanh thu tháng này' },
    { label: 'Xuất PDF', query: 'Xuất file PDF báo cáo doanh thu tháng này' }
  ];
  webQuickActions = [
    { label: 'Tóm tắt web', query: 'Tóm tắt nội dung link web này: https://vnexpress.net/' },
    { label: 'Tin tức mới', query: 'Tìm tin tức mới nhất về du lịch Việt Nam hôm nay và tóm tắt ngắn gọn' }
  ];
  
  // Kiểm tra tính năng AI Chatbox
  canUseAiChatbox: boolean = true; // Mặc định cho phép
  canAskRevenue: boolean = false;

  private msgSub?: Subscription;
  private typingSub?: Subscription;

  @ViewChild('messagesEnd') messagesEnd?: ElementRef;

  constructor(
    private aiService: AiAssistantService,
    private authService: AuthService,
    private pricingService: PricingService,
    private hotelService: HotelService,
    private apiService: ApiService,
    private modal: NzModalService,
    private message: NzMessageService,
    private translate: TranslateService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.msgSub = this.aiService.getMessages().subscribe(msgs => {
      this.messages = (msgs as ChatMessage[]).map(msg => this.processMessageLinks(msg));
    });

    this.typingSub = this.aiService.getTypingStatus().subscribe(status => this.isTyping = status);
    
    this.initHotelSelector();
    this.checkAiChatboxPermission();
    this.refreshRoleCapabilities();
    if (this.authService.getCurrentUser() && this.authService.getToken()) {
      this.aiService.loadChatHistory();
    }
    
    this.authService.currentUser$.pipe(take(1)).subscribe(() => {
      this.initHotelSelector();
      this.checkAiChatboxPermission();
      this.refreshRoleCapabilities();
    });
    
    this.authService.currentUser$.subscribe(user => {
      this.initHotelSelector();
      this.checkAiChatboxPermission();
      this.refreshRoleCapabilities();
      if (user && this.authService.getToken()) {
        this.aiService.loadChatHistory();
      } else {
        this.aiService.clearMessages();
      }
    });
  }

  /**
   * Hàm tự động nhận diện link xuất file từ AI và chuyển thành giao diện đính kèm
   */
  private processMessageLinks(msg: ChatMessage): ChatMessage {
    if (msg.role === 'assistant' && msg.content && typeof msg.content === 'string') {
      
      // Regex cực mạnh: Bắt mọi link bắt đầu bằng http và kết thúc bằng xlsx/docx/pdf
      const urlRegex = /(?:Link tải:\s*)?(https?:\/\/[^\s]+?\.(?:xlsx|docx|pdf))/i;
      const match = msg.content.match(urlRegex);
      
      if (match && match[1] && !msg.fileUrl) {
        const newMsg = { ...msg };
        newMsg.fileUrl = match[1]; // Gán link để hiện nút File
        
        // Cắt lấy đuôi file để phân loại
        const ext = match[1].split('.').pop()?.toLowerCase() || '';
        newMsg.fileType = 'application/' + ext;
        
        // Xóa sạch dấu vết của cái link thô kệch trong đoạn chat
        newMsg.content = newMsg.content.replace(match[0], '').trim();
        
        // Dọn dẹp nốt mấy câu văn dư thừa của AI
        newMsg.content = newMsg.content.replace('Đã xuất file Excel thành công.', '').trim();
        newMsg.content = newMsg.content.replace('Đã tạo file Word thành công.', '').trim();
        newMsg.content = newMsg.content.replace('Đã tạo file PDF thành công.', '').trim();
        
        return newMsg;
      }
    }
    return msg;
  }

  private normalizeHotelList(data: any): Hotel[] {
    const arr = (data?.data || data?.hotels || data) as any;
    return Array.isArray(arr) ? (arr as Hotel[]) : [];
  }

  private initHotelSelector(): void {
    const u = this.authService.getCurrentUser();
    if (!u) {
      this.hotels = [];
      this.selectedHotelId = null;
      return;
    }

    const directHotelId = (u.hotelId || '').toString();
    if (directHotelId) {
      this.selectedHotelId = directHotelId;
      this.hotelService.getHotelInfo(directHotelId).pipe(take(1)).subscribe({
        next: (hotel) => {
          this.hotels = hotel ? [hotel] : [];
        },
        error: () => {
          this.hotels = [];
        }
      });
      return;
    }

    if (this.loadingHotels) return;
    this.loadingHotels = true;

    const businessId = this.authService.getBusinessId();
    const getHotels$ = this.authService.isBusiness() && businessId
      ? this.hotelService.getHotels(businessId)
      : this.hotelService.getHotels();

    getHotels$.pipe(take(1)).subscribe({
      next: (data: any) => {
        const hotels = this.normalizeHotelList(data).filter(h => !h.status || h.status === 'active');
        this.hotels = hotels;

        const stored = (typeof window !== 'undefined' ? localStorage.getItem('selectedHotelId') : null) || null;
        if (stored && hotels.some(h => String(h._id) === String(stored))) {
          this.selectedHotelId = stored;
          this.persistSelectedHotel(stored);
        } else if (hotels.length > 0) {
          this.selectedHotelId = String(hotels[0]._id || '');
          if (this.selectedHotelId) {
            this.persistSelectedHotel(this.selectedHotelId);
          }
        } else {
          this.selectedHotelId = null;
        }

        this.loadingHotels = false;
      },
      error: () => {
        this.hotels = [];
        this.selectedHotelId = null;
        this.loadingHotels = false;
      }
    });

    const userId = (u._id || '').toString();
    if (userId) {
      this.apiService.getSelectedHotel(userId).pipe(take(1)).subscribe({
        next: (res) => {
          const sessionSelected = (res?.selectedHotelId || '').toString();
          if (!sessionSelected) return;
          if (this.selectedHotelId && String(this.selectedHotelId) === String(sessionSelected)) return;
          if (this.hotels.length > 0 && this.hotels.some(h => String(h._id) === String(sessionSelected))) {
            this.selectedHotelId = sessionSelected;
          } else if (!this.selectedHotelId) {
            this.selectedHotelId = sessionSelected;
          }
          if (this.selectedHotelId) {
            try {
              localStorage.setItem('selectedHotelId', this.selectedHotelId);
            } catch {}
          }
        },
        error: () => {}
      });
    }
  }

  onSelectHotel(hotelId: string): void {
    const id = (hotelId || '').toString();
    if (!id) return;
    if (this.selectedHotelId && String(this.selectedHotelId) === String(id)) return;

    this.selectedHotelId = id;
    this.persistSelectedHotel(id);
    this.aiService.clearMessages();
    this.checkAiChatboxPermission();
  }

  private persistSelectedHotel(hotelId: string): void {
    const u = this.authService.getCurrentUser();
    const userId = (u?._id || '').toString();
    try {
      localStorage.setItem('selectedHotelId', hotelId);
    } catch {}
    if (userId) {
      this.apiService.saveSelectedHotel(userId, hotelId).pipe(take(1)).subscribe({
        next: () => {},
        error: () => {}
      });
    }
  }

  private refreshRoleCapabilities(): void {
    const rules = this.authService.getPermissionRules();
    this.canAskRevenue =
      this.authService.isSuperAdmin() ||
      this.authService.isAdmin() ||
      rules.canAskAIAboutHotel === true ||
      rules.canViewShiftHistory === true;
  }

  private isManagementAssistantMode(): boolean {
    return this.authService.isBusiness() || this.authService.isHotelManager();
  }

  private isOpenClawRoleEligible(): boolean {
    return (
      this.authService.isSuperAdmin() ||
      this.authService.isAdmin() ||
      this.authService.isBusiness() ||
      this.authService.isHotelManager()
    );
  }
  
  /**
   * Kiểm tra quyền sử dụng AI Chatbox từ hotel settings hoặc pricing package
   */
  checkAiChatboxPermission(): void {
    // Nếu là superadmin hoặc admin, luôn cho phép
    if (this.authService.isSuperAdmin() || this.authService.isAdmin()) {
      this.canUseAiChatbox = true;
      return;
    }
    
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      this.canUseAiChatbox = false;
      return;
    }
    
    const hotelId = this.getTenantIdForAI();
    if (hotelId) {
      this.hotelService.getHotelInfo(hotelId).pipe(take(1)).subscribe({
        next: (hotel: any) => {
          if (hotel && hotel.settings?.enableAiChatbox === true) {
            this.canUseAiChatbox = true;
          } else {
            this.checkPricingPackagePermission();
          }
        },
        error: () => {
          this.checkPricingPackagePermission();
        }
      });
    } else {
      // Nếu không có hotelId, kiểm tra từ pricing package
      this.checkPricingPackagePermission();
    }
  }
  
  /**
   * Kiểm tra tính năng từ pricing package
   */
  checkPricingPackagePermission(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser || !currentUser._id) {
      this.canUseAiChatbox = false;
      return;
    }
    
    this.pricingService.getCurrentUserPackage(currentUser._id).pipe(take(1)).subscribe({
      next: (response: any) => {
        if (response && response.success !== false) {
          const packageData = response.data || response;
          // Kiểm tra từ package hoặc từ packages list
          if (packageData.aiChatboxFeature !== undefined) {
            this.canUseAiChatbox = packageData.aiChatboxFeature === true;
          } else {
            // Nếu không có trong response, mặc định tắt
            this.canUseAiChatbox = false;
          }
        } else {
          this.canUseAiChatbox = false;
        }
      },
      error: () => {
        this.canUseAiChatbox = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.msgSub?.unsubscribe();
    this.typingSub?.unsubscribe();
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  private scrollToBottom() {
    try {
      this.messagesEnd?.nativeElement.scrollTo({
        top: this.messagesEnd.nativeElement.scrollHeight,
        behavior: 'smooth'
      });
    } catch (err) {}
  }

  beforeUpload = (file: NzUploadFile): boolean => {
    // Lấy file gốc từ NzUploadFile
    const realFile = (file as any).originFileObj as File;
    if (realFile) {
      this.selectedFile = realFile;
      this.selectedFileType = realFile.type;
      this.selectedFileName = realFile.name;
      if (realFile.type.startsWith('image')) {
        const reader = new FileReader();
        reader.onload = (e: any) => {
          this.selectedFilePreview = e.target.result;
        };
        reader.readAsDataURL(realFile);
      } else {
        this.selectedFilePreview = '';
      }
    }
    return false; // Không upload tự động
  };

  async sendMessage() {
    const content = this.inputValue.trim();
    if (!content && !this.selectedFile) return;
    this.inputValue = '';
    let fileUrl = '';
    let fileType = '';
    if (this.selectedFile) {
      fileType = this.selectedFile.type;
      fileUrl = this.selectedFilePreview || '';
    }
    
    const tenantId = this.getTenantIdForAI();
    if (!tenantId) {
      this.message.error('Vui lòng chọn đúng khách sạn trước khi dùng AI.');
      this.removeSelectedFile();
      return;
    }
    if (this.selectedFile && this.selectedFile.type.includes('application/json')) {
      try {
        const text = await this.readFileText(this.selectedFile);
        const json = JSON.parse(text);
        const products = Array.isArray(json.products) ? json.products : (Array.isArray(json) ? json : []);
        if (!Array.isArray(products) || products.length === 0) {
          this.message.warning('Dataset JSON không hợp lệ hoặc trống.');
        } else {
          await this.aiService.uploadDatasetExternal(tenantId, products);
          this.message.success('Đã tải dataset lên AI.');
        }
      } catch (e) {
        console.error('Dataset parse error:', e);
        this.message.error('Không thể đọc dataset JSON.');
      }
      this.removeSelectedFile();
    } else {
      await this.aiService.sendMessageExternal(content, tenantId);
    }
    this.removeSelectedFile();
  }

  async sendQuickMessage(content: string) {
    const message = content.trim();
    if (!message || this.isTyping) return;
    const isRevenueQuery = message.toLowerCase().includes('doanh thu');
    if (isRevenueQuery && !this.canAskRevenue) {
      this.message.warning('Bạn không có quyền hỏi về doanh thu.');
      return;
    }
    const tenantId = this.getTenantIdForAI();
    if (!tenantId) {
      this.message.error('Vui lòng chọn đúng khách sạn trước khi dùng AI.');
      return;
    }
    await this.aiService.sendMessageExternal(message, tenantId);
  }

  getFileDisplayName(msg: ChatMessage): string {
    if (!msg.fileUrl) return 'AI generated file';
    return msg.fileUrl.split('/').pop() || 'AI generated file';
  }

  getFileIconType(msg: ChatMessage): string {
    const fileType = (msg.fileType || '').toLowerCase();
    if (fileType.includes('sheet') || fileType.includes('xlsx')) {
      return 'file-excel';
    }
    if (fileType.includes('word') || fileType.includes('doc')) {
      return 'file-word';
    }
    return 'file-pdf';
  }

  toggleMinimize() {
    this.minimized = !this.minimized;
  }

  removeSelectedFile() {
    this.selectedFile = undefined;
    this.selectedFileType = undefined;
    this.selectedFilePreview = undefined;
    this.selectedFileName = undefined;
  }
  
  private getTenantIdForAI(): string {
    const u = this.authService.getCurrentUser();
    const direct = (u?.hotelId || '').toString();
    if (direct) return direct;
    return (this.selectedHotelId || '').toString();
  }
  
  private readFileText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string) || '');
      reader.onerror = (e) => reject(e);
      reader.readAsText(file, 'utf-8');
    });
  }

  connectFanpage(): void {
    const tenantId = this.getTenantIdForAI();
    if (!tenantId) {
      this.message.error('Vui lòng chọn đúng khách sạn trước khi kết nối Fanpage.');
      return;
    }
    this.aiService.getFacebookOAuthUrl(tenantId).then(url => {
      if (url) {
        window.open(url, '_blank');
      }
    });
  }

  /**
   * Xóa lịch sử chat với xác nhận
   */
  clearChatHistory(): void {
    if (this.messages.length === 0) {
      this.message.info(this.translate.instant('AI_CHATBOX.NO_HISTORY'));
      return;
    }

    this.modal.confirm({
      nzTitle: this.translate.instant('AI_CHATBOX.CONFIRM_CLEAR_TITLE'),
      nzContent: this.translate.instant('AI_CHATBOX.CONFIRM_CLEAR_MESSAGE'),
      nzOkText: this.translate.instant('COMMON.DELETE'),
      nzOkType: 'primary',
      nzOkDanger: true,
      nzCancelText: this.translate.instant('COMMON.CANCEL'),
      nzOnOk: async () => {
        try {
          await this.aiService.clearChatHistory();
          this.message.success(this.translate.instant('AI_CHATBOX.CLEAR_SUCCESS'));
        } catch (error) {
          console.error('Error clearing chat history:', error);
          this.message.error(this.translate.instant('AI_CHATBOX.CLEAR_ERROR'));
        }
      }
    });
  }

  openFanpageMessages(): void {
    this.router.navigate(['/admin/fanpage-messages']);
  }

  openOpenClawGateway(): void {
    if (this.openingOpenClaw) return;
    if (!this.canOpenOpenClaw) {
      this.message.warning('Role hiện tại hoặc gói dịch vụ của bạn chưa được phép mở OpenClaw.');
      return;
    }

    const initialOpenClawUrl = this.resolveOpenClawDashboardBaseUrl();
    const popup =
      typeof window !== 'undefined'
        ? window.open(initialOpenClawUrl, '_blank')
        : null;

    this.openingOpenClaw = true;
    this.aiService.getOpenClawSetupCode().pipe(take(1)).subscribe({
      next: (response) => {
        const setupCode = String(response?.setupCode || '').trim();
        const decoded = this.decodeOpenClawSetupCode(setupCode);
        const gatewayUrl = decoded?.gatewayUrl || String(response?.gatewayUrl || '').trim();
        const bootstrapToken = decoded?.bootstrapToken || '';

        if (!gatewayUrl || !bootstrapToken) {
          if (popup && !popup.closed) {
            popup.close();
          }
          this.openingOpenClaw = false;
          this.message.error('Không lấy được bootstrap token hợp lệ để đăng nhập OpenClaw.');
          return;
        }

        const openClawUrl = this.buildOpenClawDashboardUrl(gatewayUrl, bootstrapToken);
        if (popup && !popup.closed) {
          popup.location.replace(openClawUrl);
        } else if (typeof window !== 'undefined') {
          window.open(openClawUrl, '_blank');
        }

        const accessLabel = response?.access === 'limited' ? 'quyền giới hạn' : 'quyền đầy đủ';
        const modeLabel = this.isManagementAssistantMode()
          ? 'Trợ lý quản lý cho business/hotel đã sẵn sàng trên OpenClaw.'
          : 'OpenClaw đã sẵn sàng cho vận hành AI.';
        this.message.success(`Đã mở OpenClaw gateway với ${accessLabel}. ${modeLabel}`);
        this.openingOpenClaw = false;
      },
      error: (error) => {
        console.error('OpenClaw setup error:', error);
        if (popup && !popup.closed) {
          popup.close();
        }
        this.openingOpenClaw = false;
        this.message.error(error?.error?.message || 'Không thể mở OpenClaw gateway.');
      }
    });
  }

  private decodeOpenClawSetupCode(setupCode: string): { gatewayUrl: string; bootstrapToken: string } | null {
    const value = String(setupCode || '').trim();
    if (!value || typeof window === 'undefined') {
      return null;
    }

    try {
      const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
      const binary = window.atob(normalized + padding);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const json = typeof TextDecoder !== 'undefined'
        ? new TextDecoder().decode(bytes)
        : binary;
      const parsed = JSON.parse(json);
      const gatewayUrl = String(parsed?.url || '').trim();
      const bootstrapToken = String(parsed?.bootstrapToken || '').trim();

      if (!gatewayUrl || !bootstrapToken) {
        return null;
      }

      return { gatewayUrl, bootstrapToken };
    } catch (error) {
      console.error('OpenClaw setup decode error:', error);
      return null;
    }
  }

  private buildOpenClawDashboardUrl(gatewayUrl: string, bootstrapToken: string): string {
    const baseUrl = this.resolveOpenClawDashboardBaseUrl();
    const hashParams = new URLSearchParams();
    hashParams.set('gatewayUrl', gatewayUrl);
    hashParams.set('bootstrapToken', bootstrapToken);
    hashParams.set('session', 'main');
    return `${baseUrl.replace(/\/$/, '')}/#${hashParams.toString()}`;
  }

  private resolveOpenClawDashboardBaseUrl(): string {
    return 'https://openclaw.phhotel.vn';
  }
}
