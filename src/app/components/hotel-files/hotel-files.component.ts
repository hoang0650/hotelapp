import { Component, OnInit, HostListener } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import * as XLSX from 'xlsx';
import { renderAsync } from 'docx-preview';
import { ViewChild, ElementRef } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { buildStoreZip, ZipEntry } from './zip-store';
import { TranslateService } from '@ngx-translate/core';

type FileItem = {
  name: string;
  path: string;
  type: 'pdf' | 'doc' | 'docx' | 'xlsx' | 'other';
  inlineContent?: string;
  group?: 'docs' | 'camera-agent';
};

const CAMERA_AGENT_FILES: Array<{ name: string; path: string }> = [
  { name: 'BAT_DAU.bat', path: 'assets/camera-agent/BAT_DAU.bat' },
  { name: 'HUONG_DAN.txt', path: 'assets/camera-agent/HUONG_DAN.txt' },
  { name: 'package.json', path: 'assets/camera-agent/package.json' },
  { name: 'env.example', path: 'assets/camera-agent/env.example' },
  { name: 'server.js', path: 'assets/camera-agent/server.js' },
  { name: 'frame-pump.js', path: 'assets/camera-agent/frame-pump.js' },
  { name: 'proxvn-tunnel.js', path: 'assets/camera-agent/proxvn-tunnel.js' },
  { name: 'ai-pipeline-loop.js', path: 'assets/camera-agent/ai-pipeline-loop.js' },
  { name: 'bin/proxvn-windows-amd64.exe', path: 'assets/camera-agent/bin/proxvn-windows-amd64.exe' },
];

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
  cameraZipLoading = false;

  files: FileItem[] = [
    { name: 'BIÊN BẢN BÀN GIAO TÀI SẢN.docx', path: 'assets/Hotel/BIÊN BẢN BÀN GIAO TÀI SẢN.docx', type: 'docx', group: 'docs' },
    { name: 'Báo cáo 06 tháng đầu năm cơ sở.doc', path: 'assets/Hotel/Báo cáo 06 tháng đầu năm cơ sở.doc', type: 'doc', group: 'docs' },
    { name: 'Giấy Xác_Nhận_Trả_Phòng.docx', path: 'assets/Hotel/Giấy Xác_Nhận_Trả_Phòng.docx', type: 'docx', group: 'docs' },
    { name: 'HĐ Cho Thuê Căn Hộ Tháng.docx', path: 'assets/Hotel/HĐ Cho Thuê Căn Hộ Tháng.docx', type: 'docx', group: 'docs' },
    { name: 'HĐ Cho Thuê Tháng.docx', path: 'assets/Hotel/HĐ Cho Thuê Tháng.docx', type: 'docx', group: 'docs' },
    { name: 'HĐ Cung Cấp Dịch Vụ Lưu Trú - Song Ngữ.docx', path: 'assets/Hotel/HĐ Cung Cấp Dịch Vụ Lưu Trú - Song Ngữ.docx', type: 'docx', group: 'docs' },
    { name: 'MauDK26_TT422017.doc', path: 'assets/Hotel/MauDK26_TT422017.doc', type: 'doc', group: 'docs' },
    { name: 'Mẫu HĐLĐ.docx', path: 'assets/Hotel/Mẫu HĐLĐ.docx', type: 'docx', group: 'docs' },
    { name: 'Mẫu Quản Lý Khách Sạn.doc', path: 'assets/Hotel/Mẫu Quản Lý Khách Sạn.doc', type: 'doc', group: 'docs' },
    { name: 'Phương Án ANTT.docx', path: 'assets/Hotel/Phương Án ANTT.docx', type: 'docx', group: 'docs' },
    { name: 'Phụ lục Bàn giao Phòng - Song Ngữ.doc', path: 'assets/Hotel/Phụ lục Bàn giao Phòng - Song Ngữ.doc', type: 'doc', group: 'docs' },
    { name: 'Phụ lục Bàn giao Tòa Nhà.doc', path: 'assets/Hotel/Phụ lục Bàn giao Tòa Nhà.doc', type: 'doc', group: 'docs' },
    { name: 'THONG BAO TAM NGUNG KINH DOANH MAU 27.docx', path: 'assets/Hotel/THONG BAO TAM NGUNG KINH DOANH MAU 27.docx', type: 'docx', group: 'docs' },
    { name: 'Thong bao thay doi dia diem kinh doanh 5 (1).docx', path: 'assets/Hotel/Thong bao thay doi dia diem kinh doanh 5 (1).docx', type: 'docx', group: 'docs' },
    { name: 'quyet-dinh-tam-ngung-kinh-doanh.docx', path: 'assets/Hotel/quyet-dinh-tam-ngung-kinh-doanh.docx', type: 'docx', group: 'docs' },
    { name: 'uyquyen.docx', path: 'assets/Hotel/uyquyen.docx', type: 'docx', group: 'docs' },
    { name: 'Đề nghị thanh toán tiền cọc.doc', path: 'assets/Hotel/Đề nghị thanh toán tiền cọc.doc', type: 'doc', group: 'docs' },
    { name: 'đơn cấp giấy an ninh trật tự.doc', path: 'assets/Hotel/đơn cấp giấy an ninh trật tự.doc', type: 'doc', group: 'docs' },
    ...CAMERA_AGENT_FILES.map((f) => ({
      name: `[Camera Agent] ${f.name}`,
      path: f.path,
      type: 'other' as const,
      group: 'camera-agent' as const,
    })),
  ];

  constructor(private message: NzMessageService, private sanitizer: DomSanitizer, private http: HttpClient, private translate: TranslateService) {}


  ngOnInit(): void {
    this.isMobile = window.innerWidth <= 768;
  }

  @HostListener('window:resize')
  onResize(): void {
    this.isMobile = window.innerWidth <= 768;
  }

  get filteredFiles(): FileItem[] {
    const q = (this.searchText || '').toLowerCase();
    const docs = this.files.filter((f) => f.group !== 'camera-agent');
    if (!q) return docs;
    return docs.filter((f) => f.name.toLowerCase().includes(q));
  }

  get cameraAgentFiles(): FileItem[] {
    return this.files.filter((f) => f.group === 'camera-agent');
  }

  shortName(file: FileItem): string {
    return String(file.name || '').replace(/^\[Camera Agent\]\s*/, '');
  }

  async downloadCameraAgentZip(): Promise<void> {
    if (this.cameraZipLoading) return;
    this.cameraZipLoading = true;
    try {
      const entries: ZipEntry[] = [];
      for (const f of CAMERA_AGENT_FILES) {
        const buf = await firstValueFrom(
          this.http.get(this.getAssetUrl(f.path), { responseType: 'arraybuffer' }),
        );
        entries.push({ name: `PHHotel-Camera-Agent/${f.name}`, data: new Uint8Array(buf) });
      }
      const blob = buildStoreZip(entries);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'PHHotel-Camera-Agent.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.message.success(this.translate.instant('HOTEL_FILES.MESSAGES.ZIP_DOWNLOAD_SUCCESS'));
    } catch {
      this.message.error(this.translate.instant('HOTEL_FILES.MESSAGES.ZIP_DOWNLOAD_ERROR'));
    } finally {
      this.cameraZipLoading = false;
    }
  }

  openInline(file: FileItem): void {
    if (file.group === 'camera-agent' || file.type === 'other') {
      this.message.info(this.translate.instant('HOTEL_FILES.TYPE_TECHNICAL'));
      this.download(file);
      return;
    }
    if (file.inlineContent) {
      this.message.info(this.translate.instant('HOTEL_FILES.TYPE_SCRIPT'));
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
    const p = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
    return `${origin}${p}`.replace(/([^:]\/)\/+/g, '$1');
  }

  openInNewTab(file: FileItem): void {
    if (file.group === 'camera-agent' || file.inlineContent || file.type === 'other') {
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
            this.xlsxColumns = headerRow.map((c, i) => c || this.translate.instant('HOTEL_FILES.COLUMN_N', { n: i + 1 }));
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
          this.message.error(this.translate.instant('HOTEL_FILES.MESSAGES.EXCEL_READ_ERROR'));
        }
      },
      error: () => {
        this.message.error(this.translate.instant('HOTEL_FILES.MESSAGES.EXCEL_LOAD_ERROR'));
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
      a.download = file.name.replace(/^\[Camera Agent\]\s*/, '');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
    const a = document.createElement('a');
    a.href = this.getAssetUrl(file.path);
    a.download = file.name.replace(/^\[Camera Agent\]\s*/, '');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
