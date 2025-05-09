import { Component, OnDestroy, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { AiAssistantService, ChatMessage as BaseChatMessage } from '../../services/ai-assistant.service';
import { Subscription } from 'rxjs';
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

  private msgSub?: Subscription;
  private typingSub?: Subscription;

  @ViewChild('messagesEnd') messagesEnd?: ElementRef;

  constructor(private aiService: AiAssistantService) {}

  ngOnInit(): void {
    this.msgSub = this.aiService.getMessages().subscribe(msgs => this.messages = msgs as ChatMessage[]);
    this.typingSub = this.aiService.getTypingStatus().subscribe(status => this.isTyping = status);
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
