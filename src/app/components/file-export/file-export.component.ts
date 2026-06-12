import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-file-export',
  templateUrl: './file-export.component.html',
  styleUrls: ['./file-export.component.css']
})
export class FileExportComponent implements OnInit {
  fileName: string = '';
  fileExtension: string = '';
  fileUrl: string = ''; // Link tải trực tiếp
  previewUrl: SafeResourceUrl | null = null; // Link để nhúng iframe xem trước
  errorMessage: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    // 1. Lấy tên file từ URL
    this.fileName = this.route.snapshot.paramMap.get('filename') || '';

    if (!this.fileName) {
      this.errorMessage = 'Không tìm thấy tên file để tải/xem trước.';
      return;
    }

    // 2. Tạo đường dẫn gốc tới Backend
    this.fileUrl = `${environment.aiUrl}/exports/${this.fileName}`;
    this.fileExtension = this.fileName.split('.').pop()?.toLowerCase() || '';

    // 3. Xử lý link xem trước tuỳ theo định dạng file
    this.setupPreview();
  }

  setupPreview(): void {
    if (this.fileExtension === 'pdf' || this.fileExtension === 'txt') {
      // PDF hoặc Text thì trình duyệt tự đọc được
      this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.fileUrl);
    } 
    else if (['xlsx', 'xls', 'docx', 'doc'].includes(this.fileExtension)) {
      // Excel, Word: Mượn trình đọc của Microsoft Office Online (Yêu cầu fileUrl phải public trên internet)
      const msViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(this.fileUrl)}`;
      this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(msViewerUrl);
    } 
    else {
      // Không hỗ trợ xem trước
      this.previewUrl = null;
    }
  }

  triggerDownload(): void {
    // Kích hoạt tải file xuống máy
    const a = document.createElement('a');
    a.href = this.fileUrl;
    a.download = this.fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  
  goBack(): void {
    // Trở về trang trước đó
    window.history.back();
  }
}