import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment'; 

@Component({
  selector: 'app-file-export',
  templateUrl: './file-export.component.html',
  styleUrls: ['./file-export.component.css']
})
export class FileExportComponent implements OnInit {
  fileName: string = '';
  errorMessage: string = '';
  isDownloading: boolean = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Lấy tên file từ thanh địa chỉ (ví dụ: tong_hop_2026...xlsx)
    this.fileName = this.route.snapshot.paramMap.get('filename') || '';

    if (!this.fileName) {
      this.errorMessage = 'Không tìm thấy tên file để tải xuống.';
      this.isDownloading = false;
      return;
    }

    this.triggerDownload();
  }

  triggerDownload(): void {
    // Gọi đến backend Python (aiUrl) nơi chứa thư mục public/exports
    const backendDownloadUrl = `${environment.aiUrl}/exports/${this.fileName}`;

    // Tạo một thẻ <a> ảo để ép trình duyệt tải file về máy
    const a = document.createElement('a');
    a.href = backendDownloadUrl;
    a.download = this.fileName; // Gợi ý tên file khi lưu
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Sau khi kích hoạt tải, đổi trạng thái và tự động quay về trang trước đó sau 3 giây
    setTimeout(() => {
      this.isDownloading = false;
      // Tuỳ chọn: Tự động đóng tab nếu nó được mở từ chatbox
      if (window.history.length > 1) {
         window.close();
      }
    }, 3000);
  }
  
  goBack(): void {
    this.router.navigate(['/admin']); // Hoặc đường dẫn trang chủ Dashboard của bạn
  }
}