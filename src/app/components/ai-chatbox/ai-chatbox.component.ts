import { Component, OnDestroy, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { AiAssistantService, ChatMessage as BaseChatMessage } from '../../services/ai-assistant.service';
import { AuthService } from '../../services/auth.service';
import { PricingService } from '../../services/pricing.service';
import { HotelService } from '../../services/hotel.service';
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
    private modal: NzModalService,
    private message: NzMessageService,
    private translate: TranslateService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.msgSub = this.aiService.getMessages().subscribe(msgs => this.messages = msgs as ChatMessage[]);
    this.typingSub = this.aiService.getTypingStatus().subscribe(status => this.isTyping = status);
    this.checkAiChatboxPermission();
    this.refreshRoleCapabilities();
    this.authService.currentUser$.pipe(take(1)).subscribe(() => {
      this.checkAiChatboxPermission();
      this.refreshRoleCapabilities();
    });
    this.authService.currentUser$.subscribe(() => {
      this.checkAiChatboxPermission();
      this.refreshRoleCapabilities();
    });
  }

  private refreshRoleCapabilities(): void {
    const rules = this.authService.getPermissionRules();
    this.canAskRevenue =
      this.authService.isSuperAdmin() ||
      this.authService.isAdmin() ||
      rules.canAskAIAboutHotel === true ||
      rules.canViewShiftHistory === true;
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
    
    // Kiểm tra từ hotel settings nếu có hotelId
    if (currentUser.hotelId) {
      this.hotelService.getHotelInfo(currentUser.hotelId).pipe(take(1)).subscribe({
        next: (hotel: any) => {
          if (hotel && hotel.settings) {
            this.canUseAiChatbox = hotel.settings.enableAiChatbox === true;
          } else {
            // Nếu không có hotel settings, kiểm tra từ pricing package
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
    return (u?.hotelId || '').toString();
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
}
