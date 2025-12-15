import { Component, OnDestroy, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { AiAssistantService, ChatMessage as BaseChatMessage } from '../../services/ai-assistant.service';
import { AuthService } from '../../services/auth.service';
import { PricingService } from '../../services/pricing.service';
import { HotelService } from '../../services/hotel.service';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { NzUploadFile } from 'ng-zorro-antd/upload';

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
  
  // Kiểm tra tính năng AI Chatbox
  canUseAiChatbox: boolean = true; // Mặc định cho phép

  private msgSub?: Subscription;
  private typingSub?: Subscription;

  @ViewChild('messagesEnd') messagesEnd?: ElementRef;

  constructor(
    private aiService: AiAssistantService,
    private authService: AuthService,
    private pricingService: PricingService,
    private hotelService: HotelService
  ) {}

  ngOnInit(): void {
    this.msgSub = this.aiService.getMessages().subscribe(msgs => this.messages = msgs as ChatMessage[]);
    this.typingSub = this.aiService.getTypingStatus().subscribe(status => this.isTyping = status);
    this.checkAiChatboxPermission();
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
    await this.aiService.sendMessage(content, fileUrl, fileType);
    this.removeSelectedFile();
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
}
