import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzUploadFile } from 'ng-zorro-antd/upload';
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  fileUrl?: string;
  fileType?: string;
  timestamp: Date | string;
}

export interface QuickAction {
  label: string;
  query: string;
}

@Component({
  selector: 'app-ai-chatbox',
  templateUrl: './ai-chatbox.component.html',
  styleUrls: ['./ai-chatbox.component.scss']
})
export class AiChatboxComponent implements OnInit {
  inputValue: string = '';
  selectedFile: any = null; // Khai báo type cụ thể (ví dụ File hoặc NzUploadFile) nếu có
  selectedFileType: string = '';
  selectedFileName: string = '';
  selectedFilePreview: string | ArrayBuffer | null = null;
  isTyping: boolean = false;
  
  private readonly pyAiApiUrl = 'https://ai.phhotel.vn';
  // Visibility & Header Properties
  minimized = false;
  canUseAiChatbox = true;
  chatboxModeTitle = 'AI Assistant';
  chatboxModeDescription = 'Trợ lý AI hỗ trợ vận hành';
  tenantId: string = '';

  // Hotel Selection Properties
  hotels: Array<{ _id: string; name: string }> = [];
  selectedHotelId: string | null = null;
  isHotelSelectionDisabled = false;

  // Chat History & Inputs
  messages: ChatMessage[] = [];

  // Quick Action Lists
  canAskRevenue = true;
  revenueQuickActions: QuickAction[] = [];
  exportQuickActions: QuickAction[] = [];
  webQuickActions: QuickAction[] = [];

  // OpenClaw Modal & Actions
  openingOpenClaw = false;
  canOpenOpenClaw = true;
  isOpenClawModalVisible = false;
  openClawIframeUrl: SafeResourceUrl | null = null;

  // --- Methods referenced in template ---

  toggleMinimize(): void {
    this.minimized = !this.minimized;
  }

  onSelectHotel(hotelId: string): void {
    this.selectedHotelId = hotelId;
  }


  constructor(
    private sanitizer: DomSanitizer,
    private http: HttpClient,
    private message: NzMessageService
  ) {}

  ngOnInit(): void {}

  /**
   * Mở modal và tự động điền Token đăng nhập vào OpenClaw Gateway Iframe
   */
  async openOpenClawGateway(): Promise<void> {
    this.openingOpenClaw = true;

    try {
      // 1. Chuẩn bị params và headers xác thực
      const params: any = { tenant_id: this.tenantId };
      if (this.selectedHotelId) {
        params.selected_hotel_id = this.selectedHotelId;
      }

      // Lấy JWT Token từ LocalStorage để đính kèm vào Authorization header
      const token = localStorage.getItem('access_token') || localStorage.getItem('token') || '';
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`
      });

      // 2. Gọi API /admin/openclaw/direct-url từ Backend Python
      const res: any = await this.http.get(`${this.pyAiApiUrl}/admin/openclaw/direct-url`, {
        params,
        headers
      }).toPromise();

      if (res && res.success && res.url) {
        // 3. Bypass Security để nhúng URL dạng https://{tenant}.phhotel.vn/#config=... vào iframe
        this.openClawIframeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(res.url);
        this.isOpenClawModalVisible = true;

        // 4. Gọi API Approve Device Pairing ngầm sau 2.5 giây
        setTimeout(() => {
          this.triggerAutoApproveDevicePairing();
        }, 2500);

      } else {
        this.message.error(res?.message || 'Không thể tạo liên kết kết nối OpenClaw Gateway.');
      }
    } catch (err: any) {
      console.error('Lỗi mở OpenClaw Gateway:', err);
      if (err?.status === 401) {
        this.message.error('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
      } else {
        this.message.error('Không thể mở kết nối tới OpenClaw Gateway.');
      }
    } finally {
      this.openingOpenClaw = false;
    }
  }

  /**
   * Tự động duyệt Device Pairing Request (Auto-Approve Login)
   */
  private triggerAutoApproveDevicePairing(): void {
    const token = localStorage.getItem('access_token') || localStorage.getItem('token') || '';
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    const params: any = { tenant_id: this.tenantId };
    if (this.selectedHotelId) {
      params.selected_hotel_id = this.selectedHotelId;
    }

    this.http.post(`${this.pyAiApiUrl}/admin/openclaw/device-pairings/approve`, {}, { params, headers })
      .subscribe({
        next: (res: any) => {
          if (res?.success) {
            console.log('✅ Auto-approved OpenClaw login session thành công!');
          }
        },
        error: (err) => {
          // Bỏ qua lỗi 404 nếu session đã được auto-approve bằng kết nối WebSocket nội bộ
          if (err?.status !== 404) {
            console.warn('⚠️ Auto-approve device pairing:', err);
          }
        }
      });
  }

  /**
   * Đóng Modal và hủy Iframe URL để dọn dẹp bộ nhớ
   */
  closeOpenClawModal(): void {
    this.isOpenClawModalVisible = false;
    setTimeout(() => {
      this.openClawIframeUrl = null;
    }, 300);
  }

  clearChatHistory(): void {
    this.messages = []; // Xóa mảng chứa tin nhắn
  }

  /**
   * 2. Xử lý lỗi getFileIconType
   * Hàm này trả về loại icon của ng-zorro dựa trên định dạng file
   */
  getFileIconType(msg: any): string {
    if (!msg || !msg.fileType) {
      return 'file'; // Icon mặc định
    }
    
    const type = msg.fileType.toLowerCase();
    if (type.includes('pdf')) return 'file-pdf';
    if (type.includes('word') || type.includes('document')) return 'file-word';
    if (type.includes('excel') || type.includes('sheet')) return 'file-excel';
    if (type.includes('zip') || type.includes('compressed')) return 'file-zip';
    if (type.includes('image')) return 'picture';
    
    return 'file';
  }

  /**
   * 3. Xử lý lỗi getFileDisplayName
   * Hàm này trả về tên file để hiển thị trên giao diện
   */
  getFileDisplayName(msg: any): string {
    // Nếu object msg có sẵn trường fileName
    if (msg && msg.fileName) {
      return msg.fileName;
    }
    
    // Nếu không có fileName, thử cắt tên file từ cuối chuỗi fileUrl
    if (msg && msg.fileUrl) {
      const urlParts = msg.fileUrl.split('/');
      return urlParts[urlParts.length - 1] || 'Tài liệu tải về';
    }
    
    return 'Tài liệu tải về';
  }

  /**
   * Xử lý lỗi removeSelectedFile
   * Xóa file đính kèm đang được chọn khỏi UI
   */
  removeSelectedFile(): void {
    this.selectedFile = null;
    this.selectedFileType = '';
    this.selectedFileName = '';
    this.selectedFilePreview = null;
  }

  /**
   * Xử lý lỗi sendQuickMessage
   * Gắn nội dung từ các nút gợi ý vào ô chat và gửi đi
   */
  sendQuickMessage(query: string): void {
    this.inputValue = query;
    this.sendMessage();
  }

  /**
   * Xử lý lỗi beforeUpload
   * Chặn hành vi tự động upload của ng-zorro và lưu file vào biến để gửi sau
   * Lưu ý: Sử dụng arrow function (= (file) =>) để giữ nguyên context của 'this'
   */
  beforeUpload = (file: NzUploadFile): boolean => {
    const nativeFile = file as any as File;
    
    this.selectedFile = nativeFile;
    this.selectedFileName = nativeFile.name;
    this.selectedFileType = nativeFile.type;

    // Nếu file là ảnh, tạo preview để hiển thị lên UI
    if (nativeFile.type && nativeFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.selectedFilePreview = e.target.result;
      };
      reader.readAsDataURL(nativeFile);
    } else {
      this.selectedFilePreview = null;
    }

    // Return false để chặn nz-upload tự động gọi API upload
    return false;
  };

  /**
   * Xử lý lỗi sendMessage
   * Xử lý logic gửi tin nhắn văn bản và file
   */
  sendMessage(): void {
    // Không làm gì nếu input trống, không có file, hoặc AI đang trả lời
    if ((!this.inputValue.trim() && !this.selectedFile) || this.isTyping) {
      return;
    }

    // TODO: Thêm tin nhắn của User vào mảng this.messages tại đây

    const textToSend = this.inputValue;
    const fileToSend = this.selectedFile;

    // Xóa trắng ô input và file đính kèm chuẩn bị cho tin nhắn tiếp theo
    this.inputValue = '';
    this.removeSelectedFile(); 
    this.isTyping = true; // Hiển thị trạng thái đang nhập (typing)

    // TODO: Gọi API đến AI Assistant Service tại đây
    // Sau khi API trả về kết quả thành công hoặc lỗi, nhớ set lại: this.isTyping = false;
  }
}