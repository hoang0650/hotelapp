import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Subscription, interval, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';

type CameraProviderId = 'hikvision' | 'kbvision';
type CameraAccessMode = 'cloud' | 'agent';

interface CameraProviderOption {
  id: CameraProviderId;
  name: string;
  icon: string;
  color: string;
}

type FrameOverlay = {
  id: string;
  label: string;
  color: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

@Component({
  selector: 'app-camera-config',
  templateUrl: './camera-config.component.html',
  styleUrl: './camera-config.component.css'
})
export class CameraConfigComponent implements OnInit, OnDestroy {
  currentStep = 0;
  selectedProvider: CameraProviderId | null = null;
  userId: string | null = null;
  selectedHotelId: string | null = null;
  selectedCameraId: string | null = null;
  cameras: any[] = [];
  hotels: any[] = [];
  isLoadingHotels = false;
  cameraForm!: FormGroup;
  isTestingConnection = false;
  isLoadingConfig = false;
  isSavingConfig = false;
  passwordVisible = false;

  backendOnline: boolean | null = null;
  aiOnline: boolean | null = null;

  statsPeriod: 'day' | 'week' | 'month' = 'day';
  stats: any = null;
  isLoadingStats = false;
  private statsSub: Subscription | null = null;
  private userSub: Subscription | null = null;

  testFrontImage: string | null = null;
  testBackImage: string | null = null;
  isTestingPipeline = false;
  pipelineResult: any = null;
  pipelineStages: Array<{ name: string; detail: string; ok: boolean; warn: boolean; err: boolean }> = [];

  previewImageUrl: string | null = null;
  liveStreamUrl: string | null = null;
  isPreviewLoading = false;
  isPreviewRunning = false;
  previewError: string | null = null;
  useLiveStream = true;
  agentOnline: boolean | null = null;
  agentError: string | null = null;
  agentPort = 8787;
  agentHostInput = 'localhost';
  agentSuggestedUrls: string[] = [];
  agentPublicUrl: string | null = null;
  agentDetectError: string | null = null;
  frameOverlays: FrameOverlay[] = [];
  liveLabel: any = null;
  private previewSub: Subscription | null = null;
  private overlaySub: Subscription | null = null;
  private overlayBusy = false;
  private lastObjectUrl: string | null = null;
  @ViewChild('previewImg') previewImg?: ElementRef<HTMLImageElement>;
  @ViewChild('previewBox') previewBox?: ElementRef<HTMLDivElement>;

  providers: CameraProviderOption[] = [
    { id: 'hikvision', name: 'Hikvision', icon: 'video-camera', color: '#ff4d4f' },
    { id: 'kbvision', name: 'KBVision', icon: 'camera', color: '#1890ff' }
  ];

  constructor(
    private http: HttpClient,
    private fb: FormBuilder,
    private message: NzMessageService,
    private authService: AuthService
  ) { }

  ngOnInit(): void {
    this.initForm();
    this.bindUserContext();
    this.checkBackend();
    this.checkAi();
    this.detectLocalAgent();
  }

  ngOnDestroy(): void {
    this.statsSub?.unsubscribe();
    this.userSub?.unsubscribe();
    this.overlaySub?.unsubscribe();
    this.stopPreview();
    this.revokePreviewUrl();
  }

  get aiConfigForm(): FormGroup {
    return this.cameraForm.get('aiConfig') as FormGroup;
  }

  private initForm(): void {
    this.cameraForm = this.fb.group({
      name: ['Camera Quầy Lễ Tân', [Validators.required]],
      provider: [null, [Validators.required]],
      accessMode: ['cloud'],
      agentBaseUrl: [''],
      agentToken: [''],
      ipAddress: ['', [Validators.required, Validators.pattern('^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$')]],
      port: [554, [Validators.required]], // Port RTSP mặc định thường là 554
      username: ['admin', [Validators.required]],
      password: ['', [Validators.required]],
      rtspPath: ['/Streaming/Channels/101', [Validators.required]],
      status: ['active', [Validators.required]],
      aiConfig: this.fb.group({
        enableOcr: [true],
        enableFaceRecognition: [false],
        enableGuestLabels: [true],
        enableStayEstimate: [true],
        autoCheckin: [false]
      })
    });

    this.cameraForm.get('aiConfig.enableGuestLabels')?.valueChanges.subscribe((on: boolean) => {
      if (!this.isPreviewRunning) return;
      if (on) this.startOverlayPolling();
      else {
        this.overlaySub?.unsubscribe();
        this.overlaySub = null;
        this.frameOverlays = [];
        this.liveLabel = null;
      }
    });

    this.cameraForm.get('accessMode')?.valueChanges.subscribe((mode: CameraAccessMode) => {
      const agentBaseUrlCtrl = this.cameraForm.get('agentBaseUrl');
      if (!agentBaseUrlCtrl) return;
      if (mode === 'agent') {
        agentBaseUrlCtrl.setValidators([Validators.required]);
      } else {
        agentBaseUrlCtrl.clearValidators();
      }
      agentBaseUrlCtrl.updateValueAndValidity({ emitEvent: false });
      this.agentOnline = null;
      this.agentError = null;
    });
  }

  private bindUserContext(): void {
    const current = this.authService.getCurrentUser();
    if (current) {
      this.userId = (current as any)?._id || null;
      this.resolveHotelId(this.userId, (current as any)?.hotelId || null);
      return;
    }
    this.userSub = this.authService.currentUser$.subscribe(user => {
      if (!user) return;
      this.userId = (user as any)?._id || null;
      this.resolveHotelId(this.userId, (user as any).hotelId || null);
    });
  }

  private resolveHotelId(userId: string | null, hotelId: any): void {
    const directHotelId = typeof hotelId === 'string' ? hotelId : (hotelId?._id || null);
    if (directHotelId) {
      this.selectedHotelId = directHotelId;
      this.loadCameras();
      this.startStatsPolling();
      return;
    }

    if (!userId) {
      this.selectedHotelId = null;
      this.loadHotelsOptions();
      return;
    }

    this.http.get<any>(`${environment.apiUrl}/sessions/selected-hotel`, { params: { userId } }).subscribe({
      next: (res) => {
        this.selectedHotelId = res?.selectedHotelId || null;
        if (this.selectedHotelId) {
          this.loadCameras();
          this.startStatsPolling();
        } else {
          this.loadHotelsOptions();
        }
      },
      error: () => {
        this.selectedHotelId = null;
        this.loadHotelsOptions();
      }
    });
  }

  onSelectHotel(hotelId: string): void {
    this.selectedHotelId = hotelId || null;
    if (this.userId && this.selectedHotelId) {
      this.http.post(`${environment.apiUrl}/sessions/selected-hotel`, { userId: this.userId, hotelId: this.selectedHotelId }).subscribe({
        next: () => {},
        error: () => {}
      });
    }
    this.loadCameras();
    this.startStatsPolling();
  }

  private loadHotelsOptions(): void {
    if (this.isLoadingHotels) return;
    this.isLoadingHotels = true;
    this.http.get<any>(`${environment.apiUrl}/hotels`).subscribe({
      next: (res) => {
        this.hotels = res?.hotels || res?.data || res || [];
        this.isLoadingHotels = false;
      },
      error: () => {
        this.isLoadingHotels = false;
      }
    });
  }

  // Chọn nhà cung cấp
  selectProvider(providerId: CameraProviderId): void {
    this.selectedProvider = providerId;
    this.cameraForm.patchValue({ provider: providerId });
    const currentPath = String(this.cameraForm.value.rtspPath || '').trim();
    if (!currentPath) {
      this.cameraForm.patchValue({ rtspPath: this.getDefaultRtspPath(providerId) });
    }
  }

  private getDefaultRtspPath(providerId: CameraProviderId): string {
    if (providerId === 'kbvision') {
      return '/cam/realmonitor?channel=1&subtype=0';
    }
    return '/Streaming/Channels/101';
  }

  applyRtspTemplate(): void {
    if (!this.selectedProvider) return;
    this.cameraForm.patchValue({ rtspPath: this.getDefaultRtspPath(this.selectedProvider) });
  }

  private normalizeAgentBaseUrl(input: string): string {
    let value = String(input || '').trim();
    if (!value) return '';
    value = value.replace(/:+$/, '');
    value = value.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(value)) {
      value = `https://${value}`;
    }
    return value;
  }

  private getAgentHealthUrl(baseUrlOrHealthUrl: string): string {
    const normalized = this.normalizeAgentBaseUrl(baseUrlOrHealthUrl);
    if (/\/health$/i.test(normalized)) return normalized;
    return `${normalized}/health`;
  }

  private buildAgentBaseUrlFromHost(hostOrUrl: string): string {
    const raw = String(hostOrUrl || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
    const host = raw.replace(/\/+$/, '');
    if (/:\d+$/.test(host)) return `http://${host}`;
    return `http://${host}:${this.agentPort}`;
  }

  applyAgentHost(): void {
    const baseUrl = this.buildAgentBaseUrlFromHost(this.agentHostInput);
    if (!baseUrl) {
      this.message.warning('Vui lòng nhập IP hoặc hostname máy chạy agent');
      return;
    }
    this.cameraForm.patchValue({ agentBaseUrl: baseUrl });
    this.cameraForm.get('agentBaseUrl')?.markAsDirty();
    this.agentOnline = null;
    this.agentError = null;
  }

  useLocalhostAgent(): void {
    this.agentHostInput = 'localhost';
    this.applyAgentHost();
  }

  openAgentHealth(): void {
    const baseUrl = String(this.cameraForm.value.agentBaseUrl || '').trim();
    const url = baseUrl ? this.getAgentHealthUrl(baseUrl) : this.getAgentHealthUrl(this.buildAgentBaseUrlFromHost('localhost'));
    try {
      window.open(url, '_blank');
    } catch (_) {}
  }

  async detectLocalAgent(): Promise<void> {
    this.agentDetectError = null;
    this.agentSuggestedUrls = [];
    this.agentPublicUrl = null;
    try {
      const token = String(this.cameraForm?.value?.agentToken || '').trim();
      const headers: Record<string, string> = {};
      if (token) headers['x-agent-token'] = token;

      // /health không cần token — lấy publicUrl ProxVN nếu agent đã auto-tunnel
      const healthResp = await fetch(`http://localhost:${this.agentPort}/health`, { method: 'GET' });
      if (healthResp.ok) {
        const health: any = await healthResp.json().catch(() => ({}));
        if (health?.publicUrl) {
          this.agentPublicUrl = String(health.publicUrl).replace(/\/+$/, '');
        }
      }

      const resp = await fetch(`http://localhost:${this.agentPort}/info`, { method: 'GET', headers });
      if (!resp.ok) {
        // Không có token thì /info 401 — vẫn dùng publicUrl từ /health
        if (this.agentPublicUrl) {
          this.agentSuggestedUrls = [this.agentPublicUrl];
          if (!this.cameraForm.value.agentBaseUrl) {
            this.cameraForm.patchValue({ agentBaseUrl: this.agentPublicUrl });
            this.cameraForm.get('agentBaseUrl')?.markAsDirty();
          }
          return;
        }
        this.agentDetectError = `Agent /info HTTP ${resp.status}`;
        return;
      }
      const data: any = await resp.json();
      const publicUrl = String(data?.publicUrl || data?.proxvn?.publicUrl || this.agentPublicUrl || '').replace(/\/+$/, '');
      this.agentPublicUrl = publicUrl || null;
      const urls: string[] = Array.isArray(data?.urls) ? data.urls.filter(Boolean) : [];
      // Ưu tiên URL ProxVN HTTPS công khai lên đầu danh sách gợi ý
      this.agentSuggestedUrls = publicUrl
        ? [publicUrl, ...urls.filter((u) => u !== publicUrl)]
        : urls;
      const preferred = this.agentSuggestedUrls[0];
      if (preferred && !this.cameraForm.value.agentBaseUrl) {
        this.cameraForm.patchValue({ agentBaseUrl: preferred });
        this.cameraForm.get('agentBaseUrl')?.markAsDirty();
      }
    } catch (e: any) {
      this.agentDetectError = e?.message || 'Không thể kết nối agent local';
    }
  }

  /** Nhãn dán AI — khớp PHGroup-AI / guestsController */
  getLabelVi(label: any): string {
    if (!label) return 'Chưa xác định';
    const raw = String(label.labelVi || '').trim();
    if (raw) return raw;
    const t = String(label.personType || '').trim();
    if (label.isEmployee || t === 'employee') return 'Nhân viên';
    if (label.isReturning || t === 'returning_guest') return 'Khách quen';
    if (label.isNewGuest || t === 'new_guest') return 'Khách mới';
    if (label.isWalkIn || t === 'walk_in') return 'Khách vãng lai';
    return 'Chưa xác định';
  }

  getLabelBadgeColor(label: any): string {
    if (!label) return 'default';
    const c = String(label.badgeColor || '').trim();
    if (c) return c;
    const t = String(label.personType || '').trim();
    if (label.isEmployee || t === 'employee') return 'purple';
    if (label.isReturning || t === 'returning_guest') return 'blue';
    if (label.isNewGuest || t === 'new_guest') return 'green';
    if (label.isWalkIn || t === 'walk_in') return 'orange';
    return 'default';
  }

  useProxvnPublicUrl(): void {
    if (!this.agentPublicUrl) {
      this.message.warning('Chưa có URL công khai. Hãy chạy BAT_DAU.bat trên máy khách sạn (có ProxVN).');
      return;
    }
    this.cameraForm.patchValue({ agentBaseUrl: this.agentPublicUrl });
    this.cameraForm.get('agentBaseUrl')?.markAsDirty();
    this.testAgent();
  }

  testAgent(): void {
    const baseUrl = String(this.cameraForm.value.agentBaseUrl || '').trim();
    if (!baseUrl) {
      this.message.warning('Vui lòng nhập địa chỉ Agent (URL công khai)');
      return;
    }
    if (/api\.phgrouptechs\.com$/i.test(baseUrl) || /api\.phhotel\.vn$/i.test(baseUrl)) {
      this.agentOnline = false;
      this.agentError = 'Không dùng URL API production. Hãy dán URL https://….tunnel… mà BAT_DAU.bat in ra.';
      return;
    }
    this.agentOnline = null;
    this.agentError = null;
    const token = String(this.cameraForm.value.agentToken || '').trim();
    // Test qua backend (bỏ qua self-signed Traefik DEFAULT CERT trên trình duyệt)
    this.http.post<any>(`${environment.apiUrl}/cameras/agent-health`, {
      agentBaseUrl: this.normalizeAgentBaseUrl(baseUrl),
      agentToken: token || undefined
    }).subscribe({
      next: (res) => {
        this.agentOnline = !!res?.ok;
        if (!this.agentOnline) {
          this.agentError = res?.message || 'Agent offline / không hợp lệ';
        } else {
          this.agentError = null;
          this.message.success('Agent online');
        }
      },
      error: (err) => {
        this.agentOnline = false;
        this.agentError = err?.error?.message || err?.message || 'Không thể kết nối agent';
      }
    });
  }

  onSelectCamera(cameraId: string): void {
    const cam = this.cameras.find(c => String(c._id) === String(cameraId));
    if (!cam) return;
    this.applyCameraToForm(cam);
  }

  private loadCameras(): void {
    if (!this.selectedHotelId) return;
    this.isLoadingConfig = true;
    this.http.get<any>(`${environment.apiUrl}/cameras`, { params: { hotelId: this.selectedHotelId } }).subscribe({
      next: (res) => {
        this.cameras = res?.data || [];
        const active = this.cameras.find(c => c.status === 'active') || this.cameras[0] || null;
        if (active) {
          this.applyCameraToForm(active);
        } else {
          this.selectedCameraId = null;
          this.selectedProvider = null;
          this.cameraForm.patchValue({ provider: null });
        }
        this.isLoadingConfig = false;
      },
      error: () => {
        this.isLoadingConfig = false;
        this.message.error('Không thể tải cấu hình camera từ backend');
      }
    });
  }

  private applyCameraToForm(cam: any): void {
    this.selectedCameraId = cam?._id || null;
    this.selectedProvider = cam?.provider || null;
    this.revokePreviewUrl();
    this.previewError = null;
    this.cameraForm.patchValue({
      name: cam?.name || 'Camera Quầy Lễ Tân',
      provider: cam?.provider || null,
      accessMode: (cam?.accessMode as CameraAccessMode) || 'cloud',
      agentBaseUrl: cam?.agentBaseUrl || '',
      agentToken: cam?.agentToken || '',
      ipAddress: cam?.ipAddress || '',
      port: cam?.port || 554,
      username: cam?.username || 'admin',
      password: cam?.password || '',
      rtspPath: cam?.rtspPath || this.getDefaultRtspPath((cam?.provider as CameraProviderId) || 'hikvision'),
      status: cam?.status || 'active'
    });
    this.aiConfigForm.patchValue({
      enableOcr: cam?.aiConfig?.enableOcr !== false,
      enableFaceRecognition: !!cam?.aiConfig?.enableFaceRecognition,
      enableGuestLabels: cam?.aiConfig?.enableGuestLabels !== false,
      enableStayEstimate: cam?.aiConfig?.enableStayEstimate !== false,
      autoCheckin: !!cam?.aiConfig?.autoCheckin
    });
  }

  // Chuyển bước tiếp theo
  next(): void {
    if (this.currentStep === 0 && !this.selectedProvider) {
      this.message.warning('Vui lòng chọn nhà cung cấp Camera!');
      return;
    }

    if (this.currentStep === 1) {
      if (this.cameraForm.invalid) {
        Object.values(this.cameraForm.controls).forEach(control => {
          if (control.invalid) {
            control.markAsDirty();
            control.updateValueAndValidity({ onlySelf: true });
          }
        });
        this.message.warning('Vui lòng điền đầy đủ thông tin đăng nhập!');
        return;
      }
    }

    this.currentStep += 1;
  }

  // Quay lại bước trước
  pre(): void {
    this.currentStep -= 1;
  }

  // Nút test kết nối giả lập
  testConnection(): void {
    if (!this.selectedHotelId) {
      this.message.warning('Vui lòng chọn khách sạn trước khi kiểm tra');
      return;
    }
    if (!this.selectedCameraId) {
      this.message.warning('Vui lòng lưu cấu hình và chọn camera trước khi kiểm tra');
      return;
    }

    this.isTestingConnection = true;
    this.previewError = null;
    this.fetchSnapshotOnce(true).finally(() => {
      this.isTestingConnection = false;
    });
  }

  startPreview(): void {
    if (!this.selectedCameraId) {
      this.message.warning('Vui lòng chọn camera trước khi xem');
      return;
    }
    if (this.isPreviewRunning) return;
    this.isPreviewRunning = true;
    this.previewError = null;

    if (this.useLiveStream) {
      this.startLiveStream();
      return;
    }

    this.fetchSnapshotOnce(false);
    this.previewSub = interval(800).subscribe(() => this.fetchSnapshotOnce(false));
  }

  private startLiveStream(): void {
    const token = this.authService.getToken();
    if (!token || !this.selectedCameraId) {
      this.previewError = 'Thiếu token hoặc camera — fallback snapshot nhanh.';
      this.startFastSnapshotLive();
      return;
    }

    // Agent + ProxVN: multipart MJPEG hay vỡ → chỉ poll JPEG từ frame-buffer (~2–3 fps)
    if (this.cameraForm.value.accessMode === 'agent') {
      this.liveStreamUrl = null;
      this.startFastSnapshotLive();
      this.message.success('Đang xem trực tuyến + nhãn dán');
      return;
    }

    const ts = Date.now();
    this.liveStreamUrl =
      `${environment.apiUrl}/cameras/${this.selectedCameraId}/stream?access_token=${encodeURIComponent(token)}&t=${ts}`;
    this.previewImageUrl = null;
    this.startOverlayPolling();
    this.message.success('Đang mở luồng realtime + nhãn dán');
  }

  private startFastSnapshotLive(): void {
    this.previewSub?.unsubscribe();
    // Overlay poll đã cập nhật snapshot; giảm poll JPEG trùng
    if (this.aiConfigForm?.value?.enableGuestLabels) {
      this.startOverlayPolling();
      return;
    }
    this.fetchSnapshotOnce(false);
    this.previewSub = interval(350).subscribe(() => this.fetchSnapshotOnce(false));
  }

  onLiveStreamError(): void {
    // MJPEG fail → giữ snapshot live
    this.liveStreamUrl = null;
    if (this.isPreviewRunning && !this.previewSub) {
      this.startFastSnapshotLive();
    }
    this.previewError = null;
  }

  stopPreview(): void {
    this.isPreviewRunning = false;
    this.previewSub?.unsubscribe();
    this.previewSub = null;
    this.overlaySub?.unsubscribe();
    this.overlaySub = null;
    this.liveStreamUrl = null;
    this.frameOverlays = [];
  }

  private startOverlayPolling(): void {
    this.overlaySub?.unsubscribe();
    if (!this.aiConfigForm?.value?.enableGuestLabels) {
      this.frameOverlays = [];
      return;
    }
    void this.refreshLiveOverlays();
    // Live sticker: nhẹ hơn OCR full pipeline
    this.overlaySub = interval(2500).subscribe(() => void this.refreshLiveOverlays());
  }

  private async blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  private async refreshLiveOverlays(): Promise<void> {
    if (!this.isPreviewRunning || !this.selectedCameraId) return;
    if (!this.aiConfigForm?.value?.enableGuestLabels) {
      this.frameOverlays = [];
      this.liveLabel = null;
      return;
    }
    if (this.overlayBusy) return;
    this.overlayBusy = true;
    try {
      const blob = await firstValueFrom(
        this.http.get(`${environment.apiUrl}/cameras/${this.selectedCameraId}/snapshot`, {
          responseType: 'blob' as const,
        }),
      );
      if (!blob || !blob.size) return;
      const dataUrl = await this.blobToDataUrl(blob);
      if (!dataUrl) return;

      // Đồng bộ khung hình với frame vừa phân tích
      this.revokePreviewUrl();
      const url = URL.createObjectURL(blob);
      this.lastObjectUrl = url;
      this.previewImageUrl = url;

      const res = await firstValueFrom(
        this.http.post<any>(`${environment.apiUrl}/cameras/process-frame`, {
          cameraId: this.selectedCameraId,
          imageFrontBase64: dataUrl,
          liveMode: true,
        }),
      );
      this.liveLabel = res?.label || null;
      this.frameOverlays = this.buildFrameOverlays(res);
      // Cho ảnh render xong rồi map lại % (object-fit: contain)
      setTimeout(() => {
        this.frameOverlays = this.buildFrameOverlays(res);
      }, 40);
    } catch (_) {
      // Giữ overlay cũ nếu một nhịp lỗi
    } finally {
      this.overlayBusy = false;
    }
  }

  private buildFrameOverlays(res: any): FrameOverlay[] {
    const persons: any[] = Array.isArray(res?.persons) ? res.persons : [];
    const faces: any[] = Array.isArray(res?.faces) ? res.faces : [];
    const frameW = Number(res?.frameWidth) || this.previewImg?.nativeElement?.naturalWidth || 0;
    const frameH = Number(res?.frameHeight) || this.previewImg?.nativeElement?.naturalHeight || 0;
    if (!frameW || !frameH) return [];

    const box = this.previewBox?.nativeElement;
    const img = this.previewImg?.nativeElement;
    if (!box || !img) return [];

    const boxW = box.clientWidth || 1;
    const boxH = box.clientHeight || 1;
    const scale = Math.min(boxW / frameW, boxH / frameH);
    const dispW = frameW * scale;
    const dispH = frameH * scale;
    const offsetX = (boxW - dispW) / 2;
    const offsetY = (boxH - dispH) / 2;

    const overlays: FrameOverlay[] = [];
    persons.forEach((p, idx) => {
      const bbox = Array.isArray(p?.bbox) ? p.bbox.map(Number) : null;
      if (!bbox || bbox.length < 4) return;
      const [x1, y1, x2, y2] = bbox;
      const face = faces.find((f) => f?.trackId != null && f.trackId === p?.trackId) || faces[idx];
      let labelText = 'Đang nhận diện';
      let color = '#8c8c8c';
      if (face?.matched) {
        if (this.liveLabel && String(this.liveLabel.guestId || '') === String(face.guestId || '')) {
          labelText = this.getLabelVi(this.liveLabel);
          color = this.badgeHex(this.getLabelBadgeColor(this.liveLabel));
        } else {
          labelText = 'Đã nhận diện';
          color = this.badgeHex('blue');
        }
      } else if (this.liveLabel && persons.length === 1) {
        labelText = this.getLabelVi(this.liveLabel);
        color = this.badgeHex(this.getLabelBadgeColor(this.liveLabel));
      }

      overlays.push({
        id: String(p?.trackId ?? idx),
        label: labelText,
        color,
        left: offsetX + (x1 / frameW) * dispW,
        top: offsetY + (y1 / frameH) * dispH,
        width: Math.max(24, ((x2 - x1) / frameW) * dispW),
        height: Math.max(24, ((y2 - y1) / frameH) * dispH),
      });
    });

    // Không có person bbox nhưng có face bbox
    if (!overlays.length && faces.length) {
      faces.forEach((f, idx) => {
        const bbox = Array.isArray(f?.bbox) ? f.bbox.map(Number) : null;
        if (!bbox || bbox.length < 4) return;
        const [x1, y1, x2, y2] = bbox;
        const labelText = f?.matched
          ? (this.liveLabel ? this.getLabelVi(this.liveLabel) : 'Đã nhận diện')
          : 'Đang nhận diện';
        const color = f?.matched
          ? this.badgeHex(this.getLabelBadgeColor(this.liveLabel || { personType: 'returning_guest' }))
          : '#8c8c8c';
        overlays.push({
          id: `face-${f?.trackId ?? idx}`,
          label: labelText,
          color,
          left: offsetX + (x1 / frameW) * dispW,
          top: offsetY + (y1 / frameH) * dispH,
          width: Math.max(24, ((x2 - x1) / frameW) * dispW),
          height: Math.max(24, ((y2 - y1) / frameH) * dispH),
        });
      });
    }

    return overlays;
  }

  private badgeHex(color: string): string {
    switch (String(color || '').toLowerCase()) {
      case 'purple': return '#722ed1';
      case 'blue': return '#1677ff';
      case 'green': return '#52c41a';
      case 'orange': return '#fa8c16';
      case 'red': return '#ff4d4f';
      default: return '#595959';
    }
  }

  trackOverlay(_index: number, o: FrameOverlay): string {
    return o.id;
  }

  private revokePreviewUrl(): void {
    if (this.lastObjectUrl) {
      try {
        URL.revokeObjectURL(this.lastObjectUrl);
      } catch (_) {}
      this.lastObjectUrl = null;
    }
  }

  private async fetchSnapshotOnce(showToast: boolean): Promise<void> {
    if (!this.selectedCameraId) return;
    if (this.isPreviewLoading) return;
    this.isPreviewLoading = true;
    try {
      await this.ensureCameraConfigSyncedForSnapshot(showToast);
      const blob = await firstValueFrom(
        this.http.get(`${environment.apiUrl}/cameras/${this.selectedCameraId}/snapshot`, { responseType: 'blob' as const })
      );
      if (!blob) return;
      this.revokePreviewUrl();
      const url = URL.createObjectURL(blob);
      this.lastObjectUrl = url;
      this.previewImageUrl = url;
      this.previewError = null;
      if (showToast) this.message.success('Đã lấy snapshot thành công (RTSP OK)');
    } catch (err: any) {
      const msg = await this.extractHttpErrorMessage(err);
      this.previewError = msg || 'Lấy snapshot thất bại (kiểm tra rtspPath/luồng RTSP/ffmpeg trên server)';
      if (showToast) this.message.error(this.previewError);
    } finally {
      this.isPreviewLoading = false;
    }
  }

  private buildCameraPayload(): any {
    return {
      hotelId: this.selectedHotelId,
      name: this.cameraForm.value.name,
      provider: this.selectedProvider,
      accessMode: this.cameraForm.value.accessMode,
      agentBaseUrl: this.normalizeAgentBaseUrl(this.cameraForm.value.agentBaseUrl || ''),
      agentToken: this.cameraForm.value.agentToken,
      ipAddress: this.cameraForm.value.ipAddress,
      port: Number(this.cameraForm.value.port || 554),
      username: this.cameraForm.value.username,
      password: this.cameraForm.value.password,
      rtspPath: this.cameraForm.value.rtspPath,
      status: this.cameraForm.value.status,
      aiConfig: this.aiConfigForm.value
    };
  }

  private async ensureCameraConfigSyncedForSnapshot(showToast: boolean): Promise<void> {
    if (!this.selectedCameraId || !this.selectedHotelId) return;

    const accessMode: CameraAccessMode = this.cameraForm.value.accessMode;
    if (accessMode === 'agent') {
      const baseUrl = this.normalizeAgentBaseUrl(this.cameraForm.value.agentBaseUrl || '');
      if (!baseUrl) {
        this.previewError = 'Vui lòng nhập địa chỉ Agent (URL công khai) trước khi xem snapshot.';
        if (showToast) this.message.error(this.previewError);
        throw new Error(this.previewError);
      }
    }

    if (!this.cameraForm.dirty) return;
    if (this.isSavingConfig) return;

    if (this.cameraForm.invalid) {
      Object.values(this.cameraForm.controls).forEach(control => {
        control.markAsDirty();
        control.updateValueAndValidity({ onlySelf: true });
      });
      const msg = 'Vui lòng điền đủ cấu hình camera trước khi test snapshot.';
      this.previewError = msg;
      if (showToast) this.message.error(msg);
      throw new Error(msg);
    }

    this.isSavingConfig = true;
    try {
      const payload = this.buildCameraPayload();
      await firstValueFrom(this.http.put<any>(`${environment.apiUrl}/cameras/${this.selectedCameraId}`, payload));
      this.cameraForm.markAsPristine();
    } finally {
      this.isSavingConfig = false;
    }
  }

  private async extractHttpErrorMessage(err: any): Promise<string> {
    const errorPayload = err?.error;
    if (errorPayload && typeof Blob !== 'undefined' && errorPayload instanceof Blob) {
      try {
        const text = await errorPayload.text();
        try {
          const json = JSON.parse(text);
          const parts = [json?.message, json?.hint].filter(Boolean);
          if (json?.error) parts.push(String(json.error));
          if (json?.ipAddress) parts.push(`IP: ${json.ipAddress}`);
          if (json?.port) parts.push(`Port: ${json.port}`);
          if (json?.rtspPath) parts.push(`RTSP Path: ${json.rtspPath}`);
          if (json?.rtsp) parts.push(`RTSP: ${json.rtsp}`);
          const details = json?.details ? String(json.details) : '';
          const tail = details ? details.slice(-280) : '';
          const status = err?.status ? `HTTP ${err.status}` : '';
          return [status, ...parts, tail].filter(Boolean).join(' • ');
        } catch (_) {
          const status = err?.status ? `HTTP ${err.status}` : '';
          const tail = text ? text.slice(-280) : '';
          return [status, tail].filter(Boolean).join(' • ');
        }
      } catch (_) {
        const status = err?.status ? `HTTP ${err.status}` : '';
        return status || '';
      }
    }

    const direct = err?.error?.message || err?.message;
    if (typeof direct === 'string' && direct.trim()) {
      return direct.replace(/snapshot:/g, 'snapshot').trim();
    }

    const status = err?.status ? `HTTP ${err.status}` : '';
    const url = err?.url ? String(err.url) : '';
    return [status, url].filter(Boolean).join(' • ');
  }

  isPrivateCameraIp(): boolean {
    const ip = String(this.cameraForm?.value?.ipAddress || '').trim();
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    const nums = parts.map(p => Number(p));
    if (nums.some(n => Number.isNaN(n) || n < 0 || n > 255)) return false;
    const [a, b] = nums;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }

  onSelectTestImage(type: 'front' | 'back', event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!dataUrl) return;
      if (type === 'front') {
        this.testFrontImage = dataUrl;
      } else {
        this.testBackImage = dataUrl;
      }
    };
    reader.readAsDataURL(file);
  }

  clearTestImages(): void {
    this.testFrontImage = null;
    this.testBackImage = null;
    this.pipelineResult = null;
    this.pipelineStages = [];
  }

  private buildPipelineStages(res: any): Array<{ name: string; detail: string; ok: boolean; warn: boolean; err: boolean }> {
    const st = res?.stages || {};
    const detectCount = st.detect?.count ?? res?.persons?.length ?? 0;
    const trackCount = Array.isArray(st.track?.tracks) ? st.track.tracks.length : detectCount;
    const faceMatched = (res?.faces || []).filter((f: any) => f?.matched).length;
    const faceStatus = String(st.face?.status || '');
    const ocrOk = !!(res?.ocrRawData?.idNumber || st.ocr?.data?.idNumber);
    const pmsOk = !!res?.guestInfo || !!res?.label?.guestId || !!res?.label?.personType;
    const mk = (name: string, detail: string, status: string, forceOk?: boolean) => {
      const s = String(status || '').toLowerCase();
      const err = s.includes('error') || s === 'fail';
      const warn = !err && (s.includes('skip') || s.includes('empty') || s.includes('no_') || s === 'pending');
      const ok = forceOk === true || (!err && !warn && (s === 'ok' || s === 'success' || !!forceOk));
      return { name, detail, ok, warn: warn && !ok, err };
    };
    return [
      mk('1. Camera', 'Frame đã nhận', 'ok', true),
      mk('2. YOLO người', detectCount ? `${detectCount} người` : (st.detect?.error || 'không phát hiện'), st.detect?.status || (detectCount ? 'ok' : 'empty'), detectCount > 0),
      mk('3. ByteTrack', trackCount ? `${trackCount} track` : 'chưa track', st.track?.status || (trackCount ? 'ok' : 'empty'), trackCount > 0),
      mk('4. Face', faceMatched ? `${faceMatched} khớp` : (faceStatus || 'chưa khớp'), faceStatus || (faceMatched ? 'ok' : 'empty'), faceMatched > 0),
      mk('5. OCR CCCD', ocrOk ? (res?.ocrRawData?.idNumber || st.ocr?.data?.idNumber) : (st.ocr?.status || 'chưa đọc'), st.ocr?.status || (ocrOk ? 'ok' : 'empty'), ocrOk),
      mk('6. PMS', pmsOk ? (res?.label?.labelVi || 'đã ghi') : 'chưa ghi guest', pmsOk ? 'ok' : 'empty', pmsOk),
      mk('7. Dashboard', 'Hiển thị kết quả', 'ok', true)
    ];
  }

  testAiPipeline(): void {
    if (!this.selectedHotelId) {
      this.message.warning('Chưa xác định khách sạn để test');
      return;
    }
    if (!this.selectedCameraId) {
      this.message.warning('Vui lòng chọn camera để test');
      return;
    }
    if (!this.testFrontImage) {
      this.message.warning('Vui lòng chọn ảnh mặt trước (CCCD/Passport) để test');
      return;
    }

    this.isTestingPipeline = true;
    this.pipelineResult = null;
    this.pipelineStages = [];
    this.http.post<any>(`${environment.apiUrl}/cameras/process-frame`, {
      cameraId: this.selectedCameraId,
      imageFrontBase64: this.testFrontImage,
      imageBackBase64: this.testBackImage,
      documentMode: true
    }).subscribe({
      next: (res) => {
        this.pipelineResult = res;
        this.pipelineStages = this.buildPipelineStages(res);
        this.isTestingPipeline = false;
        if (res?.ocrError && !res?.ocrRawData?.idNumber) {
          this.message.warning(res.message || res.ocrError);
        } else {
          this.message.success(res?.message || 'Test AI Pipeline thành công');
        }
        this.refreshStats();
      },
      error: (err) => {
        this.isTestingPipeline = false;
        const details = err?.error?.details;
        const detailMsg = details?.error || details?.message || '';
        this.message.error(err?.error?.message || detailMsg || 'Test AI Pipeline thất bại');
      }
    });
  }

  // Hoàn tất cấu hình
  done(): void {
    if (!this.selectedHotelId) {
      this.message.warning('Chưa xác định khách sạn để lưu cấu hình');
      return;
    }
    if (!this.selectedProvider) {
      this.message.warning('Vui lòng chọn nhà cung cấp Camera!');
      return;
    }
    if (this.cameraForm.invalid) {
      this.message.warning('Vui lòng điền đầy đủ thông tin cấu hình');
      return;
    }

    const payload = this.buildCameraPayload();

    this.isSavingConfig = true;
    const req$ = this.selectedCameraId
      ? this.http.put<any>(`${environment.apiUrl}/cameras/${this.selectedCameraId}`, payload)
      : this.http.post<any>(`${environment.apiUrl}/cameras`, payload);

    req$.subscribe({
      next: (res) => {
        this.isSavingConfig = false;
        const saved = res?.data;
        if (saved?._id) {
          this.selectedCameraId = saved._id;
        }
        this.message.success('Đã đồng bộ cấu hình Camera với backend');
        this.loadCameras();
      },
      error: () => {
        this.isSavingConfig = false;
        this.message.error('Lưu cấu hình camera thất bại');
      }
    });
  }

  private checkBackend(): void {
    this.http.get<any>(`${environment.apiUrl}/users/info`).subscribe({
      next: () => { this.backendOnline = true; },
      error: () => { this.backendOnline = false; }
    });
  }

  private checkAi(): void {
    this.http.get<any>(`${environment.aiUrl}/openapi.json`).subscribe({
      next: () => { this.aiOnline = true; },
      error: () => { this.aiOnline = false; }
    });
  }

  refreshStats(): void {
    if (!this.selectedHotelId) return;
    this.isLoadingStats = true;
    this.http.get<any>(`${environment.apiUrl}/guests/camera-dashboard`, { params: { hotelId: this.selectedHotelId, period: this.statsPeriod } }).subscribe({
      next: (res) => {
        this.stats = res;
        // Hiển thị stages gần nhất từ agent loop nếu chưa có kết quả test thủ công
        if (!this.pipelineResult && res?.lastPipeline?.stages) {
          this.pipelineStages = this.buildPipelineStages({
            stages: res.lastPipeline.stages,
            label: res.lastPipeline.label,
            persons: res.lastPipeline.stages?.detect?.persons,
            faces: res.lastPipeline.stages?.face?.faces,
            ocrRawData: res.lastPipeline.stages?.ocr?.data
          });
        }
        this.isLoadingStats = false;
      },
      error: () => {
        this.isLoadingStats = false;
      }
    });
  }

  private startStatsPolling(): void {
    this.statsSub?.unsubscribe();
    if (!this.selectedHotelId) return;
    this.refreshStats();
    this.statsSub = interval(15000).subscribe(() => this.refreshStats());
  }
}
