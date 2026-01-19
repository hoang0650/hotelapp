import { Component } from '@angular/core';
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
};

@Component({
  selector: 'app-hotel-files',
  templateUrl: './hotel-files.component.html',
  styleUrls: ['./hotel-files.component.css']
})
export class HotelFilesComponent {
  searchText = '';
  selectedFile: FileItem | null = null;
  pdfUrl: SafeResourceUrl | null = null;
  officeUrl: SafeResourceUrl | null = null;
  xlsxRows: Array<Record<string, any>> = [];
  xlsxColumns: string[] = [];
  isDocx = false;
  @ViewChild('docxContainer') docxContainer!: ElementRef<HTMLDivElement>;

  files: FileItem[] = [
    { name: 'ACCOMMODATION SERVICE CONTRACT - GDS724 (1) (5) (2).docx', path: 'assets/Hotel/ACCOMMODATION SERVICE CONTRACT - GDS724 (1) (5) (2).docx', type: 'docx' },
    { name: 'BIÊN BẢN BÀN GIAO TÀI SẢN.docx', path: 'assets/Hotel/BIÊN BẢN BÀN GIAO TÀI SẢN.docx', type: 'docx' },
    { name: 'Bien_ban_cuoc_hop.pdf', path: 'assets/Hotel/Bien_ban_cuoc_hop.pdf', type: 'pdf' },
    { name: 'Báo cáo 06 tháng đầu năm cơ sở.doc', path: 'assets/Hotel/Báo cáo 06 tháng đầu năm cơ sở.doc', type: 'doc' },
    { name: 'Bảng giao-nhận tiền cọc và chi phí PPHOME.pdf', path: 'assets/Hotel/Bảng giao-nhận tiền cọc và chi phí PPHOME.pdf', type: 'pdf' },
    { name: 'Bảng theo dõi tiền đặt cọc và tiền thuê căn hộ PPHOME.pdf', path: 'assets/Hotel/Bảng theo dõi tiền đặt cọc và tiền thuê căn hộ PPHOME.pdf', type: 'pdf' },
    { name: 'CT01 Tờ khai thay đổi thông tin cư trú.doc', path: 'assets/Hotel/CT01 Tờ khai thay đổi thông tin cư trú.doc', type: 'doc' },
    { name: 'CongNo_TongHop_Diamond Boutique Hotel_16_06_2025_12_57_49.xlsx', path: 'assets/Hotel/CongNo_TongHop_Diamond Boutique Hotel_16_06_2025_12_57_49.xlsx', type: 'xlsx' },
    { name: 'DANH SÁCH THEO DÕI GOLDEN SUN 7.xlsx', path: 'assets/Hotel/DANH SÁCH THEO DÕI GOLDEN SUN 7.xlsx', type: 'xlsx' },
    { name: 'DOANH THU cf Gd1 THáng 03.25.xlsx', path: 'assets/Hotel/DOANH THU cf Gd1 THáng 03.25.xlsx', type: 'xlsx' },
    { name: 'Danh sách đặt phòng.xlsx', path: 'assets/Hotel/Danh sách đặt phòng.xlsx', type: 'xlsx' },
    { name: 'DoanhThuHoaDon_diamondboutiquehotel.xlsx', path: 'assets/Hotel/DoanhThuHoaDon_diamondboutiquehotel.xlsx', type: 'xlsx' },
    { name: 'GTGTQ12025.pdf', path: 'assets/Hotel/GTGTQ12025.pdf', type: 'pdf' },
    { name: 'Giấy Xác_Nhận_Trả_Phòng.docx', path: 'assets/Hotel/Giấy Xác_Nhận_Trả_Phòng.docx', type: 'docx' },
    { name: 'HĐ-Cho-Thue-Dai-Han.docx', path: 'assets/Hotel/HĐ-Cho-Thue-Dai-Han.docx', type: 'docx' },
    { name: 'Hợp đồng thuê phòng tháng_Chị Hồng Nga.docx', path: 'assets/Hotel/Hợp đồng thuê phòng tháng_Chị Hồng Nga.docx', type: 'docx' },
    { name: 'Mau-hop-dong-lao-dong-khong-xac-dinh-thoi-han.docx', path: 'assets/Hotel/Mau-hop-dong-lao-dong-khong-xac-dinh-thoi-han.docx', type: 'docx' },
    { name: 'MauDK26_TT422017.doc', path: 'assets/Hotel/MauDK26_TT422017.doc', type: 'doc' },
    { name: 'Phụ Lục.doc', path: 'assets/Hotel/Phụ Lục.doc', type: 'doc' },
    { name: 'Phụ lục Bàn giao NT PP home (1).doc', path: 'assets/Hotel/Phụ lục Bàn giao NT PP home (1).doc', type: 'doc' },
    { name: 'THONG BAO TAM NGUNG KINH DOANH MAU 27.docx', path: 'assets/Hotel/THONG BAO TAM NGUNG KINH DOANH MAU 27.docx', type: 'docx' },
    { name: 'TUYỂN DỤNG NHÂN VIÊN LỄ TÂN.docx', path: 'assets/Hotel/TUYỂN DỤNG NHÂN VIÊN LỄ TÂN.docx', type: 'docx' },
    { name: 'Thong bao thay doi dia diem kinh doanh 5 (1).docx', path: 'assets/Hotel/Thong bao thay doi dia diem kinh doanh 5 (1).docx', type: 'docx' },
    { name: 'TỔNG HỢP DOANH THU.xlsx', path: 'assets/Hotel/TỔNG HỢP DOANH THU.xlsx', type: 'xlsx' },
    { name: 'hợp đồng vie.docx', path: 'assets/Hotel/hợp đồng vie.docx', type: 'docx' },
    { name: 'mẫu quản lý khách sạn.doc', path: 'assets/Hotel/mẫu quản lý khách sạn.doc', type: 'doc' },
    { name: 'phương án tật tự.docx', path: 'assets/Hotel/phương án tật tự.docx', type: 'docx' },
    { name: 'quyet-dinh-tam-ngung-kinh-doanh.docx', path: 'assets/Hotel/quyet-dinh-tam-ngung-kinh-doanh.docx', type: 'docx' },
    { name: 'uyquyen.docx', path: 'assets/Hotel/uyquyen.docx', type: 'docx' },
    { name: 'Đề nghị thanh toán tiền cọc.doc', path: 'assets/Hotel/Đề nghị thanh toán tiền cọc.doc', type: 'doc' },
    { name: 'đơn cấp giấy an ninh trật tự q6.doc', path: 'assets/Hotel/đơn cấp giấy an ninh trật tự q6.doc', type: 'doc' }
  ];

  constructor(private message: NzMessageService, private sanitizer: DomSanitizer, private http: HttpClient) {}

  get filteredFiles(): FileItem[] {
    const q = (this.searchText || '').toLowerCase();
    if (!q) return this.files;
    return this.files.filter(f => f.name.toLowerCase().includes(q));
  }

  openInline(file: FileItem): void {
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

  download(file: FileItem): void {
    const a = document.createElement('a');
    a.href = file.path;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
