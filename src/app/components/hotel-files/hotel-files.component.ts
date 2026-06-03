import { Component, OnInit, HostListener } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import * as XLSX from 'xlsx';
import { renderAsync } from 'docx-preview';
import { ViewChild, ElementRef } from '@angular/core';

type FileItem = {
  name: string;
  path: string;
  type: 'pdf' | 'doc' | 'docx' | 'xlsx' | 'other';
  inlineContent?: string;
};

@Component({
  selector: 'app-hotel-files',
  templateUrl: './hotel-files.component.html',
  styleUrls: ['./hotel-files.component.css']
})
export class HotelFilesComponent implements OnInit {
  searchText = '';
  selectedFile: FileItem | null = null;
  pdfUrl: SafeResourceUrl | null = null;
  officeUrl: SafeResourceUrl | null = null;
  xlsxRows: Array<Record<string, any>> = [];
  xlsxColumns: string[] = [];
  isDocx = false;
  @ViewChild('docxContainer') docxContainer!: ElementRef<HTMLDivElement>;
  isMobile = false;

  files: FileItem[] = [
    { name: 'BIÊN BẢN BÀN GIAO TÀI SẢN.docx', path: 'assets/Hotel/BIÊN BẢN BÀN GIAO TÀI SẢN.docx', type: 'docx' },
    { name: 'Báo cáo 06 tháng đầu năm cơ sở.doc', path: 'assets/Hotel/Báo cáo 06 tháng đầu năm cơ sở.doc', type: 'doc' },
    { name: 'Giấy Xác_Nhận_Trả_Phòng.docx', path: 'assets/Hotel/Giấy Xác_Nhận_Trả_Phòng.docx', type: 'docx' },
    { name: 'HĐ Cho Thuê Căn Hộ Tháng.docx', path: 'assets/Hotel/HĐ Cho Thuê Căn Hộ Tháng.docx', type: 'docx' },
    { name: 'HĐ Cho Thuê Tháng.docx', path: 'assets/Hotel/HĐ Cho Thuê Tháng.docx', type: 'docx' },
    { name: 'HĐ Cung Cấp Dịch Vụ Lưu Trú - Song Ngữ.docx', path: 'assets/Hotel/HĐ Cung Cấp Dịch Vụ Lưu Trú - Song Ngữ.docx', type: 'docx' },
    { name: 'MauDK26_TT422017.doc', path: 'assets/Hotel/MauDK26_TT422017.doc', type: 'doc' },
    { name: 'Mẫu HĐLĐ.docx', path: 'assets/Hotel/Mẫu HĐLĐ.docx', type: 'docx' },
    { name: 'Mẫu Quản Lý Khách Sạn.doc', path: 'assets/Hotel/Mẫu Quản Lý Khách Sạn.doc', type: 'doc' },
    { name: 'Phương Án ANTT.docx', path: 'assets/Hotel/Phương Án ANTT.docx', type: 'docx' },
    { name: 'Phụ lục Bàn giao Phòng - Song Ngữ.doc', path: 'assets/Hotel/Phụ lục Bàn giao Phòng - Song Ngữ.doc', type: 'doc' },
    { name: 'Phụ lục Bàn giao Tòa Nhà.doc', path: 'assets/Hotel/Phụ lục Bàn giao Tòa Nhà.doc', type: 'doc' },
    { name: 'THONG BAO TAM NGUNG KINH DOANH MAU 27.docx', path: 'assets/Hotel/THONG BAO TAM NGUNG KINH DOANH MAU 27.docx', type: 'docx' },
    { name: 'Thong bao thay doi dia diem kinh doanh 5 (1).docx', path: 'assets/Hotel/Thong bao thay doi dia diem kinh doanh 5 (1).docx', type: 'docx' },
    { name: 'quyet-dinh-tam-ngung-kinh-doanh.docx', path: 'assets/Hotel/quyet-dinh-tam-ngung-kinh-doanh.docx', type: 'docx' },
    { name: 'uyquyen.docx', path: 'assets/Hotel/uyquyen.docx', type: 'docx' },
    { name: 'Đề nghị thanh toán tiền cọc.doc', path: 'assets/Hotel/Đề nghị thanh toán tiền cọc.doc', type: 'doc' },
    { name: 'đơn cấp giấy an ninh trật tự.doc', path: 'assets/Hotel/đơn cấp giấy an ninh trật tự.doc', type: 'doc' }
  ];

  constructor(private message: NzMessageService, private sanitizer: DomSanitizer, private http: HttpClient) {}

  ngOnInit(): void {
    this.isMobile = window.innerWidth <= 768;
  }

  @HostListener('window:resize')
  onResize(): void {
    this.isMobile = window.innerWidth <= 768;
  }

  get filteredFiles(): FileItem[] {
    const q = (this.searchText || '').toLowerCase();
    if (!q) return this.files;
    return this.files.filter(f => f.name.toLowerCase().includes(q));
  }

  openInline(file: FileItem): void {
    if (file.inlineContent) {
      this.message.info('File script không hỗ trợ xem trực tiếp, vui lòng tải về.');
      this.download(file);
      return;
    }
    this.selectedFile = file;
    this.pdfUrl = null;
    this.officeUrl = null;
    this.xlsxRows = [];
    this.xlsxColumns = [];
    this.isDocx = false;

    if (file.type === 'pdf') {
      this.loadPdfInline(this.getAssetUrl(file.path));
    } else if (file.type === 'xlsx') {
      this.loadXlsx(this.getAssetUrl(file.path));
    } else if (file.type === 'doc' || file.type === 'docx') {
      if (file.type === 'docx') {
        this.isDocx = true;
        this.loadDocx(this.getAssetUrl(file.path));
      } else {
        const absolute = this.toAbsoluteUrl(this.getAssetUrl(file.path));
        const officeViewer = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(absolute)}`;
        this.officeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(officeViewer);
      }
    } else {
      const absolute = this.toAbsoluteUrl(this.getAssetUrl(file.path));
      const officeViewer = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(absolute)}`;
      this.officeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(officeViewer);
    }
  }

  private getAssetUrl(assetPath: string): string {
    const p = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
    return p.replace(/([^:]\/)\/+/g, '$1');
  }

  private toAbsoluteUrl(assetPath: string): string {
    const origin = window.location.origin;
    // Angular serves assets under /assets/...
    const p = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
    return `${origin}${p}`.replace(/([^:]\/)\/+/g, '$1');
  }
  
  openInNewTab(file: FileItem): void {
    if (file.inlineContent) {
      this.download(file);
      return;
    }
    const asset = this.getAssetUrl(file.path);
    if (file.type === 'doc' || file.type === 'docx') {
      const absolute = this.toAbsoluteUrl(asset);
      const officeViewer = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(absolute)}`;
      window.open(officeViewer, '_blank');
      return;
    }
    const absoluteUrl = this.toAbsoluteUrl(asset);
    window.open(absoluteUrl, '_blank');
  }

  private loadXlsx(path: string): void {
    this.http.get(path, { responseType: 'arraybuffer' }).subscribe({
      next: (buf) => {
        try {
          const wb = XLSX.read(buf, { type: 'array' });
          const wsName = wb.SheetNames[0];
          const ws = wb.Sheets[wsName];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          if (rows.length > 0) {
            const headerRow = rows[0] as string[];
            this.xlsxColumns = headerRow.map((c, i) => c || `Cột ${i + 1}`);
            this.xlsxRows = rows.slice(1).map(r => {
              const obj: Record<string, any> = {};
              this.xlsxColumns.forEach((col, idx) => {
                obj[col] = (r && r[idx] !== undefined) ? r[idx] : '';
              });
              return obj;
            });
          } else {
            this.xlsxColumns = [];
            this.xlsxRows = [];
          }
        } catch (e) {
          this.message.error('Không thể đọc file Excel');
        }
      },
      error: () => {
        this.message.error('Không tải được file Excel');
      }
    });
  }
  
  private loadDocx(path: string): void {
    this.http.get(path, { responseType: 'arraybuffer' }).subscribe({
      next: async (buf) => {
        try {
          if (this.docxContainer && this.docxContainer.nativeElement) {
            const container = this.docxContainer.nativeElement;
            container.innerHTML = '';
            await renderAsync(buf, container);
          }
        } catch (e) {
          const absolute = this.toAbsoluteUrl(path);
          const officeViewer = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(absolute)}`;
          this.officeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(officeViewer);
          this.isDocx = false;
        }
      },
      error: () => {
        const absolute = this.toAbsoluteUrl(path);
        const officeViewer = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(absolute)}`;
        this.officeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(officeViewer);
        this.isDocx = false;
      }
    });
  }

  private loadPdfInline(path: string): void {
    this.http.get(path, { 
      responseType: 'blob',
      headers: { 'Accept': 'application/pdf' }
    }).subscribe({
      next: (blob: Blob) => {
        let pdfBlob = blob;
        if (blob.type !== 'application/pdf' && blob.size > 0) {
          pdfBlob = new Blob([blob], { type: 'application/pdf' });
        }
        const blobUrl = URL.createObjectURL(pdfBlob);
        this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl);
      },
      error: () => {
        // Fallback hiển thị trực tiếp nếu không fetch được blob
        this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(path);
      }
    });
  }
  
  closeOverlay(): void {
    this.selectedFile = null;
    this.pdfUrl = null;
    this.officeUrl = null;
    this.xlsxRows = [];
    this.xlsxColumns = [];
    this.isDocx = false;
    if (this.docxContainer && this.docxContainer.nativeElement) {
      this.docxContainer.nativeElement.innerHTML = '';
    }
  }

  download(file: FileItem): void {
    if (file.inlineContent) {
      const blob = new Blob([file.inlineContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
    const a = document.createElement('a');
    a.href = this.getAssetUrl(file.path);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
