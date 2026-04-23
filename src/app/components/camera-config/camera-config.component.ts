import { Component, OnDestroy, OnInit } from '@angular/core';
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

  previewImageUrl: string | null = null;
  isPreviewLoading = false;
  isPreviewRunning = false;
  previewError: string | null = null;
  agentOnline: boolean | null = null;
  agentError: string | null = null;
  agentPort = 8787;
  agentHostInput = 'localhost';
  agentSuggestedUrls: string[] = [];
  agentDetectError: string | null = null;
  private previewSub: Subscription | null = null;
  private lastObjectUrl: string | null = null;

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
    this.stopPreview();
    this.revokePreviewUrl();
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
        autoCheckin: [false]
      })
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

  get aiConfigForm(): FormGroup {
    return this.cameraForm.get('aiConfig') as FormGroup;
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
    try {
      const resp = await fetch(`http://localhost:${this.agentPort}/info`, { method: 'GET' });
      if (!resp.ok) {
        this.agentDetectError = `Agent /info HTTP ${resp.status}`;
        return;
      }
      const data: any = await resp.json();
      const urls: string[] = Array.isArray(data?.urls) ? data.urls : [];
      this.agentSuggestedUrls = urls.filter(Boolean);
      if (!this.cameraForm.value.agentBaseUrl && this.agentSuggestedUrls.length > 0) {
        this.cameraForm.patchValue({ agentBaseUrl: this.agentSuggestedUrls[0] });
      }
    } catch (e: any) {
      this.agentDetectError = e?.message || 'Không thể kết nối agent local';
    }
  }

  testAgent(): void {
    const baseUrl = String(this.cameraForm.value.agentBaseUrl || '').trim();
    if (!baseUrl) {
      this.message.warning('Vui lòng nhập Agent URL');
      return;
    }
    if (/api\.phgrouptechs\.com$/i.test(baseUrl)) {
      this.agentOnline = false;
      this.agentError = 'Agent URL không được trỏ vào API production. Hãy dùng URL tunnel/agent riêng (VD: https://agent.phgrouptechs.com).';
      return;
    }
    this.agentOnline = null;
    this.agentError = null;
    const url = this.getAgentHealthUrl(baseUrl);
    const token = String(this.cameraForm.value.agentToken || '').trim();
    const headers: Record<string, string> = {};
    if (token) headers['x-agent-token'] = token;
    fetch(url, { method: 'GET', headers })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data: any = await r.json().catch(() => ({}));
        this.agentOnline = !!data?.ok;
        if (!this.agentOnline) {
          this.agentError = 'Agent trả phản hồi không hợp lệ';
        }
      })
      .catch((err: any) => {
        this.agentOnline = false;
        this.agentError = err?.message || 'Không thể kết nối agent';
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
      enableOcr: !!cam?.aiConfig?.enableOcr,
      enableFaceRecognition: !!cam?.aiConfig?.enableFaceRecognition,
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
    this.fetchSnapshotOnce(false);
    this.previewSub = interval(2000).subscribe(() => this.fetchSnapshotOnce(false));
  }

  stopPreview(): void {
    this.isPreviewRunning = false;
    this.previewSub?.unsubscribe();
    this.previewSub = null;
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
        this.previewError = 'Vui lòng nhập Agent URL trước khi xem snapshot.';
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
    this.http.post<any>(`${environment.apiUrl}/cameras/process-frame`, {
      cameraId: this.selectedCameraId,
      imageFrontBase64: this.testFrontImage,
      imageBackBase64: this.testBackImage
    }).subscribe({
      next: (res) => {
        this.pipelineResult = res;
        this.isTestingPipeline = false;
        this.message.success('Test AI Pipeline thành công');
        this.refreshStats();
      },
      error: (err) => {
        this.isTestingPipeline = false;
        this.message.error(err?.error?.message || 'Test AI Pipeline thất bại');
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
