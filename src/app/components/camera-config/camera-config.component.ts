import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Subscription, interval } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';

type CameraProviderId = 'hikvision' | 'kbvision';

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
    this.cameraForm.patchValue({
      name: cam?.name || 'Camera Quầy Lễ Tân',
      provider: cam?.provider || null,
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
      const blob = await this.http.get(`${environment.apiUrl}/cameras/${this.selectedCameraId}/snapshot`, { responseType: 'blob' as const }).toPromise();
      if (!blob) return;
      this.revokePreviewUrl();
      const url = URL.createObjectURL(blob);
      this.lastObjectUrl = url;
      this.previewImageUrl = url;
      if (showToast) this.message.success('Đã lấy snapshot thành công (RTSP OK)');
    } catch (err: any) {
      if (showToast) {
        const msg = await this.extractHttpErrorMessage(err);
        this.message.error(msg || 'Lấy snapshot thất bại (kiểm tra rtspPath/luồng RTSP/ffmpeg trên server)');
      }
    } finally {
      this.isPreviewLoading = false;
    }
  }

  private async extractHttpErrorMessage(err: any): Promise<string> {
    const direct = err?.error?.message || err?.message;
    if (typeof direct === 'string' && direct.trim()) return direct;

    const errorPayload = err?.error;
    if (errorPayload && typeof Blob !== 'undefined' && errorPayload instanceof Blob) {
      try {
        const text = await errorPayload.text();
        try {
          const json = JSON.parse(text);
          const parts = [json?.message, json?.hint].filter(Boolean);
          const details = json?.details ? String(json.details) : '';
          const tail = details ? details.slice(-280) : '';
          return [...parts, tail].filter(Boolean).join(' • ');
        } catch (_) {
          return text.slice(-280);
        }
      } catch (_) {
        return '';
      }
    }
    return '';
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

    const payload = {
      hotelId: this.selectedHotelId,
      name: this.cameraForm.value.name,
      provider: this.selectedProvider,
      ipAddress: this.cameraForm.value.ipAddress,
      port: Number(this.cameraForm.value.port || 554),
      username: this.cameraForm.value.username,
      password: this.cameraForm.value.password,
      rtspPath: this.cameraForm.value.rtspPath,
      status: this.cameraForm.value.status,
      aiConfig: this.aiConfigForm.value
    };

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
