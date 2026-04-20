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

  private readonly scriptCloudflaredPs1 = `$ErrorActionPreference = "Stop"

$tunnelId = $env:TUNNEL_ID
if ([string]::IsNullOrWhiteSpace($tunnelId)) {
  $tunnelId = Read-Host "Nhập Tunnel UUID (VD: f5c82bfd-be27-4709-864c-f1e11df3820b)"
}

$hostname = $env:TUNNEL_HOSTNAME
if ([string]::IsNullOrWhiteSpace($hostname)) {
  $hostname = "camera-agent.phgrouptechs.com"
}

$localPort = $env:CAMERA_AGENT_PORT
if ([string]::IsNullOrWhiteSpace($localPort)) {
  $localPort = "8787"
}

$localUrl = $env:TUNNEL_LOCAL_URL
if ([string]::IsNullOrWhiteSpace($localUrl)) {
  $localUrl = "http://localhost:$localPort"
}

$token = $env:CAMERA_AGENT_TOKEN

function Assert-Command($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Không tìm thấy '$name' trong PATH. Hãy cài $name và mở lại terminal."
  }
}

Assert-Command "node"
Assert-Command "cloudflared"

$cloudflaredDir = Join-Path $env:USERPROFILE ".cloudflared"
New-Item -ItemType Directory -Force -Path $cloudflaredDir | Out-Null

$credFile = Join-Path $cloudflaredDir "$tunnelId.json"
$configFile = Join-Path $cloudflaredDir "config.yml"

if (-not (Test-Path $credFile)) {
  Write-Host "Không thấy credentials file: $credFile"
  Write-Host "Hãy chắc chắn bạn đã chạy: cloudflared tunnel create <name> trên đúng user Windows, hoặc copy file .json vào đây."
  throw "Missing tunnel credentials."
}

$yaml = @"
tunnel: $tunnelId
credentials-file: $credFile

ingress:
  - hostname: $hostname
    service: $localUrl
  - service: http_status:404
"@

Set-Content -Path $configFile -Value $yaml -Encoding UTF8
Write-Host "Đã tạo config: $configFile"

$shouldRouteDns = $env:ROUTE_DNS
if ($shouldRouteDns -eq "1" -or $shouldRouteDns -eq "true") {
  Write-Host "Đang route DNS: $hostname -> tunnel $tunnelId"
  & cloudflared tunnel route dns $tunnelId $hostname
}

Write-Host "Đang chạy camera-agent (PORT=$localPort)..."
$agentEnv = New-Object System.Collections.Generic.Dictionary[string,string]
$agentEnv["PORT"] = $localPort
if (-not [string]::IsNullOrWhiteSpace($token)) {
  $agentEnv["CAMERA_AGENT_TOKEN"] = $token
}

$agentProc = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory (Split-Path -Parent $MyInvocation.MyCommand.Path) -PassThru -NoNewWindow -Environment $agentEnv
Start-Sleep -Seconds 1
Write-Host "camera-agent PID: $($agentProc.Id)"
Write-Host "Test: $localUrl/health"

Write-Host "Đang chạy cloudflared tunnel run (Ctrl+C để dừng)..."
& cloudflared tunnel run $tunnelId
`;

  private readonly scriptCloudflaredSh = `#!/usr/bin/env bash
set -euo pipefail

TUNNEL_ID="\${TUNNEL_ID:-}"
if [[ -z "\$TUNNEL_ID" ]]; then
  read -r -p "Nhập Tunnel UUID (VD: f5c82bfd-be27-4709-864c-f1e11df3820b): " TUNNEL_ID
fi

TUNNEL_HOSTNAME="\${TUNNEL_HOSTNAME:-camera-agent.phgrouptechs.com}"
CAMERA_AGENT_PORT="\${CAMERA_AGENT_PORT:-8787}"
TUNNEL_LOCAL_URL="\${TUNNEL_LOCAL_URL:-http://localhost:\${CAMERA_AGENT_PORT}}"

command -v node >/dev/null 2>&1 || { echo "Thiếu node trong PATH"; exit 1; }
command -v cloudflared >/dev/null 2>&1 || { echo "Thiếu cloudflared trong PATH"; exit 1; }

CLOUDFLARED_DIR="\${HOME}/.cloudflared"
mkdir -p "\${CLOUDFLARED_DIR}"

CRED_FILE="\${CLOUDFLARED_DIR}/\${TUNNEL_ID}.json"
CONFIG_FILE="\${CLOUDFLARED_DIR}/config.yml"

if [[ ! -f "\${CRED_FILE}" ]]; then
  echo "Không thấy credentials file: \${CRED_FILE}"
  echo "Hãy chạy: cloudflared tunnel create <name> (hoặc copy file .json vào thư mục này)."
  exit 1
fi

cat > "\${CONFIG_FILE}" <<YAML
tunnel: \${TUNNEL_ID}
credentials-file: \${CRED_FILE}

ingress:
  - hostname: \${TUNNEL_HOSTNAME}
    service: \${TUNNEL_LOCAL_URL}
  - service: http_status:404
YAML

echo "Đã tạo config: \${CONFIG_FILE}"

if [[ "\${ROUTE_DNS:-}" == "1" || "\${ROUTE_DNS:-}" == "true" ]]; then
  echo "Đang route DNS: \${TUNNEL_HOSTNAME} -> tunnel \${TUNNEL_ID}"
  cloudflared tunnel route dns "\${TUNNEL_ID}" "\${TUNNEL_HOSTNAME}"
fi

echo "Đang chạy camera-agent (PORT=\${CAMERA_AGENT_PORT})..."
(
  export PORT="\${CAMERA_AGENT_PORT}"
  if [[ -n "\${CAMERA_AGENT_TOKEN:-}" ]]; then
    export CAMERA_AGENT_TOKEN
  fi
  node server.js
) &
AGENT_PID=\$!
sleep 1
echo "camera-agent PID: \${AGENT_PID}"
echo "Test: \${TUNNEL_LOCAL_URL}/health"

echo "Đang chạy cloudflared tunnel run (Ctrl+C để dừng)..."
cloudflared tunnel run "\${TUNNEL_ID}"
`;

  files: FileItem[] = [
    { name: 'setup-cloudflared.ps1', path: 'inline:setup-cloudflared.ps1', type: 'other', inlineContent: this.scriptCloudflaredPs1 },
    { name: 'setup-cloudflared.sh', path: 'inline:setup-cloudflared.sh', type: 'other', inlineContent: this.scriptCloudflaredSh },
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
