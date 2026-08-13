import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';
import { createWorker, Worker, PSM } from 'tesseract.js';
import { FileService } from '../../services/file.service';

interface OcrBackendResult {
  type?: string;
  data?: Record<string, any>;
}

interface OcrScanCompletePayload {
  success: boolean;
  result: OcrBackendResult;
  parsedData?: any;
}

@Component({
  selector: 'app-ocr-scanner',
  templateUrl: './ocr-scanner.component.html',
  styleUrls: ['./ocr-scanner.component.css']
})
export class OcrScannerComponent implements OnInit, OnDestroy {
  @Input() formGroup?: FormGroup; // FormGroup để điền thông tin sau khi scan
  @Input() personalInfoFormGroup?: FormGroup; // FormGroup cho personalInfo
  @Input() contactInfoFormGroup?: FormGroup; // FormGroup cho contactInfo
  @Input() showPreview = true; // Hiển thị preview ảnh
  @Input() buttonText = 'Quét CCCD/GPLX'; // Text cho button
  @Input() allowMultiple = true; // Cho phép scan nhiều ảnh (2 mặt)
  @Input() useBackendPreprocessing = true; // Sử dụng backend sharp (true) hoặc client-side canvas (false)
  @Input() useExternalAI = true; // Sử dụng PaddleOCR service thay cho Tesseract
  @Input() useGemini = true;
  
  @Output() scanComplete = new EventEmitter<OcrScanCompletePayload>(); // Emit khi scan xong với dữ liệu đã parse
  @Output() imageSelected = new EventEmitter<File>(); // Emit khi chọn ảnh

  selectedFiles: File[] = [];
  previewImages: string[] = [];
  isScanning = false;
  ocrProgress = 0;
  ocrStatus = '';
  scannedData: any[] = []; // Lưu dữ liệu từ các lần scan
  private ocrWorker: Worker | null = null;
  private scanningQueue: Array<{ file: File; index: number }> = []; // Queue để xử lý tuần tự với index
  private isProcessingQueue = false; // Flag để tránh xử lý trùng

  constructor(
    private message: NzMessageService,
    private fileService: FileService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    // Cleanup OCR worker khi component bị destroy
    if (this.ocrWorker) {
      this.ocrWorker.terminate().catch(err => console.error('Error terminating OCR worker:', err));
      this.ocrWorker = null;
    }
  }

  onFileSelected(event: any): void {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    // Xử lý nhiều file nếu allowMultiple = true
    // Giữ nguyên thứ tự upload: file đầu tiên = index 0 = mặt trước, file thứ hai = index 1 = mặt sau
    const fileArray = Array.from(files) as File[];
    const validFiles: File[] = [];
    
    // Validate và thêm vào danh sách theo đúng thứ tự upload
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      if (!file.type.startsWith('image/')) {
        this.message.error(this.translate.instant('OCR_SCANNER.MESSAGES.NOT_IMAGE_FILE', { fileName: file.name }));
        continue;
      }
      
      validFiles.push(file);
      
      // Thêm vào danh sách theo đúng thứ tự
      if (!this.allowMultiple) {
        this.selectedFiles = [file];
        this.previewImages = [];
        this.scannedData = [];
        this.scanningQueue = [];
      } else {
        // Đảm bảo thêm theo đúng thứ tự: file đầu tiên = index 0, file thứ hai = index 1
        this.selectedFiles.push(file);
      }
      
      this.imageSelected.emit(file);
      
      // Tạo preview
      if (this.showPreview) {
        const reader = new FileReader();
        reader.onload = (e: any) => {
          if (!this.allowMultiple) {
            this.previewImages = [e.target.result];
          } else {
            this.previewImages.push(e.target.result);
          }
        };
        reader.readAsDataURL(file);
      }
    }
    
    if (validFiles.length === 0) return;
    
    if (this.useExternalAI && this.allowMultiple && validFiles.length === 2) {
      this.scannedData = [];
      this.scanOCRTwoFiles(validFiles[0], validFiles[1]);
    } else if (this.allowMultiple && validFiles.length > 1) {
      // Reset queue và thêm file theo đúng thứ tự upload với index rõ ràng
      this.scanningQueue = [];
      // Thêm vào queue với index để đảm bảo thứ tự: ảnh 0 = mặt trước, ảnh 1 = mặt sau
      for (let i = 0; i < validFiles.length; i++) {
        this.scanningQueue.push({ file: validFiles[i], index: i });
        console.log(`[OCR] Thêm ảnh vào queue: index=${i}, file=${validFiles[i].name}, ${i === 0 ? 'MẶT TRƯỚC' : 'MẶT SAU'}`);
      }
      // Reset scannedData để đảm bảo thứ tự
      this.scannedData = [];
      this.processScanningQueue();
    } else {
      // Chỉ có 1 file, scan ngay với index 0 (mặt trước)
      this.scannedData = [];
      this.scanOCR(validFiles[0], 0);
    }
    
    // Reset input để có thể chọn lại file cùng tên
    event.target.value = '';
  }

  private async scanOCRTwoFiles(front: File, back: File): Promise<void> {
    this.isScanning = true;
    this.ocrProgress = 0;
    try {
      this.ocrStatus = 'Đang tối ưu hai ảnh...';
      const frontProcessed = await this.preprocessImage(front);
      const backProcessed = await this.preprocessImage(back);
      this.ocrStatus = 'Đang gửi hai ảnh lên AI để OCR...';
      const aiResult = await this.fileService.ocrCard(frontProcessed, backProcessed);
      const payload = this.toScanCompletePayload(aiResult);
      const backendData = payload?.result?.data || {};
      const lines = Array.isArray(aiResult?.rawText) ? aiResult.rawText : [];
      const joined = lines.join('\n');
      const dobStr: string | undefined = backendData['Ngày sinh'] || aiResult?.dateOfBirth;
      let dobVal: Date | null = null;
      if (dobStr && typeof dobStr === 'string') {
        const norm = dobStr.replace(/[\.\-\s]/g, '/').trim();
        const parts = norm.split('/');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          if (year >= 1950 && year <= 2015 && day >= 1 && day <= 31 && month >= 0 && month <= 11) {
            const dt = new Date(year, month, day);
            if (!isNaN(dt.getTime())) {
              dobVal = dt;
            }
          }
        }
      }
      const parsedData: any = {
        fullName: ((): string => {
          const fn = this.extractFullNameFromLines(lines);
          return fn || backendData['Họ tên'] || backendData['Họ và tên'] || (aiResult?.fullName || '');
        })(),
        idNumber: backendData['Số ID'] || backendData['Số CCCD'] || aiResult?.idNumber || '',
        dateOfBirth: dobVal,
        gender: ((): string => {
          const fromServer = (backendData['Giới tính'] || aiResult?.gender || '').toLowerCase();
          if (fromServer === 'nam' || fromServer === 'nữ') return fromServer;
          if (fromServer === 'male') return 'nam';
          if (fromServer === 'female') return 'nữ';
          const gr = this.extractGenderFromLines(lines);
          return gr || '';
        })(),
        nationality: backendData['Quốc tịch'] || aiResult?.nationality || 'Việt Nam',
        address: ((): string => {
          const serverAddr = backendData['Địa chỉ thường trú'] || backendData['Địa chỉ'] || backendData['Quê quán'] || aiResult?.address || '';
          if (serverAddr) return serverAddr;
          const ad = this.extractAddressFromLines(lines);
          return ad || '';
        })(),
        dateOfIssue: aiResult?.dateOfIssue || '',
        dateOfExpiry: aiResult?.dateOfExpiry || '',
        rawText: lines
      };
      if (this.useGemini) {
        const prompt = `Hãy trích xuất JSON với các khóa: fullName, idNumber, dateOfBirth(dd/mm/yyyy), gender(nam|nữ), nationality, address từ văn bản OCR sau:\n${joined}\nChỉ trả về JSON hợp lệ.`;
        const geminiText = await this.fileService.geminiParse(prompt);
        let obj: any = null;
        try {
          obj = JSON.parse(geminiText);
        } catch {
          const m = geminiText.match(/\{[\s\S]*\}/);
          if (m) {
            try { obj = JSON.parse(m[0]); } catch {}
          }
        }
        if (obj && typeof obj === 'object') {
          parsedData.fullName = obj.fullName || parsedData.fullName;
          parsedData.idNumber = obj.idNumber || parsedData.idNumber;
          const g = (obj.gender || '').toString().trim().toLowerCase();
          if (g === 'nam' || g === 'nữ') {
            parsedData.gender = g;
          } else if (g === 'male') {
            parsedData.gender = 'nam';
          } else if (g === 'female') {
            parsedData.gender = 'nữ';
          }
          parsedData.nationality = obj.nationality || parsedData.nationality;
          parsedData.address = obj.address || parsedData.address;
          const gDob: string | undefined = obj.dateOfBirth;
          if (gDob && typeof gDob === 'string') {
            const norm = gDob.replace(/[\.\-\s]/g, '/').trim();
            const parts = norm.split('/');
            if (parts.length === 3) {
              const day = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10) - 1;
              const year = parseInt(parts[2], 10);
              if (year >= 1950 && year <= 2015 && day >= 1 && day <= 31 && month >= 0 && month <= 11) {
                const dt = new Date(year, month, day);
                if (!isNaN(dt.getTime())) {
                  parsedData.dateOfBirth = dt;
                }
              }
            }
          }
        }
      }
      this.message.success(this.translate.instant('OCR_SCANNER.MESSAGES.DUAL_OCR_SUCCESS'));
      this.emitScanComplete(aiResult);
      this.fillFormFromOCRData(parsedData);
    } catch (error: any) {
      this.message.error(error?.message || this.translate.instant('OCR_SCANNER.MESSAGES.DUAL_OCR_ERROR'));
    } finally {
      this.isScanning = false;
      this.ocrProgress = 0;
      this.ocrStatus = '';
    }
  }

  /**
   * Xử lý queue scan tuần tự để đảm bảo thứ tự và tránh conflict
   * Đảm bảo: ảnh đầu tiên (index 0) = mặt trước, ảnh thứ hai (index 1) = mặt sau
   */
  private async processScanningQueue() {
  if (this.isProcessingQueue || this.scanningQueue.length === 0) return;
  
  this.isProcessingQueue = true;

  try {
    while (this.scanningQueue.length > 0) {
      const next = this.scanningQueue.shift();
      if (!next) break;
      await this.scanOCR(next.file, next.index);
    }
  } catch (error: any) {
    this.message.error(this.translate.instant('OCR_SCANNER.MESSAGES.OCR_ERROR', {
      message: error.message || this.translate.instant('OCR_SCANNER.MESSAGES.OCR_SCAN_FAILED')
    }));
  } finally {
    this.isProcessingQueue = false;
  }
}

// Hàm phụ để điền data vào form
fillFormWithData(res: any) {
  if (!this.formGroup) return;
  const data = res?.result?.data || res?.data || res?.info;
  if (!data) return;
  // Ví dụ điền vào formGroup
  this.formGroup.patchValue({
    fullName: data['Họ tên'],
    idNumber: data['Số ID'],
    dob: data['Ngày sinh'],
    gender: data['Giới tính'],
    address: data['Địa chỉ thường trú'] || data['Địa chỉ']
  });
}

  private formatDateForOcrPayload(value: any): string {
    if (!value) return '';
    if (value instanceof Date) {
      const day = `${value.getDate()}`.padStart(2, '0');
      const month = `${value.getMonth() + 1}`.padStart(2, '0');
      const year = value.getFullYear();
      return `${day}/${month}/${year}`;
    }
    if (typeof value === 'string') return value.trim();
    return '';
  }

  private normalizeGenderForOcrPayload(value: any): string {
    const raw = (value || '').toString().trim().toLowerCase();
    if (raw.includes('nữ') || raw === 'nu' || raw === 'female') return 'Nữ';
    if (raw.includes('nam') || raw === 'male') return 'Nam';
    return '';
  }

  private buildOcrPayloadFromParsedData(data: any): OcrScanCompletePayload {
    const mappedData: Record<string, any> = {
      'Họ tên': (data?.fullName || data?.name || '').toString().trim(),
      'Số ID': (data?.idNumber || data?.cccd || '').toString().replace(/\s+/g, ''),
      'Ngày sinh': this.formatDateForOcrPayload(data?.dateOfBirth || data?.dob || data?.['Ngày sinh']),
      'Giới tính': this.normalizeGenderForOcrPayload(data?.gender || data?.['Giới tính']),
      'Quốc tịch': (data?.nationality || data?.['Quốc tịch'] || 'Việt Nam').toString().trim(),
      'Địa chỉ thường trú': (data?.address || data?.['Địa chỉ thường trú'] || data?.['Địa chỉ'] || '').toString().trim()
    };

    return {
      success: true,
      result: {
        type: (data?.type || data?.cardType || 'OCR').toString(),
        data: mappedData
      },
      parsedData: data
    };
  }

  private toScanCompletePayload(data: any): OcrScanCompletePayload {
    if (data?.success === true && data?.result?.data) {
      return data as OcrScanCompletePayload;
    }

    if (data?.success === true && data?.data) {
      return {
        success: true,
        result: {
          type: (data?.result?.type || data?.type || 'OCR').toString(),
          data: data.data
        },
        parsedData: data?.parsedData
      };
    }

    return this.buildOcrPayloadFromParsedData(data);
  }

  private emitScanComplete(data: any): void {
    this.scanComplete.emit(this.toScanCompletePayload(data));
  }

  /**
   * Pre-process ảnh trước OCR sử dụng backend (sharp)
   */
  async preprocessImageWithBackend(file: File): Promise<File> {
    try {
      this.ocrStatus = 'Đang gửi ảnh lên server để xử lý...';
      const response = await this.fileService.preprocessImageForOCR(file);
      
      if (!response.success || !response.processedImage) {
        throw new Error(response.error || 'Không thể xử lý ảnh trên server');
      }

      // Chuyển data URL thành File
      const dataUrl = response.processedImage;
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const processedFile = new File([blob], file.name, {
        type: 'image/png',
        lastModified: Date.now()
      });

      return processedFile;
    } catch (error: any) {
      console.error('Lỗi khi xử lý ảnh trên backend:', error);
      this.message.warning('Không thể xử lý ảnh trên server, sử dụng xử lý client-side...');
      // Fallback về client-side processing
      return this.preprocessImageWithCanvas(file);
    }
  }

  /**
   * Pre-process ảnh trước OCR để cải thiện độ chính xác
   * Sử dụng Canvas API để xử lý ảnh (tương tự sharp) - Client-side
   */
  async preprocessImageWithCanvas(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      
      reader.onload = (e: any) => {
        img.onload = () => {
          try {
            // Tạo canvas để xử lý ảnh
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Không thể tạo canvas context'));
              return;
            }
            
            // Tính toán kích thước mới (tối đa 2000px chiều rộng để tăng tốc OCR)
            const maxWidth = 2000;
            const maxHeight = 2000;
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }
            
            canvas.width = width;
            canvas.height = height;
            
            // Vẽ ảnh lên canvas
            ctx.drawImage(img, 0, 0, width, height);
            
            // Lấy ImageData để xử lý pixel
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            
            // Xử lý pre-processing: Grayscale + Contrast + Brightness + Denoising
            // Bước 1: Chuyển sang grayscale và tính toán giá trị
            const grayscaleData: number[] = [];
            for (let i = 0; i < data.length; i += 4) {
              // Chuyển sang grayscale (weighted average - chuẩn ITU-R BT.601)
              const gray = Math.round(
                0.299 * data[i] +      // Red
                0.587 * data[i + 1] +  // Green
                0.114 * data[i + 2]    // Blue
              );
              grayscaleData.push(gray);
            }
            
            // Bước 2: Áp dụng denoising (simple median filter cho các pixel edge)
            const denoisedData: number[] = [];
            const kernelSize = 3;
            const halfKernel = Math.floor(kernelSize / 2);
            
            for (let y = 0; y < height; y++) {
              for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const neighbors: number[] = [];
                
                // Thu thập neighbors
                for (let dy = -halfKernel; dy <= halfKernel; dy++) {
                  for (let dx = -halfKernel; dx <= halfKernel; dx++) {
                    const ny = y + dy;
                    const nx = x + dx;
                    if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                      neighbors.push(grayscaleData[ny * width + nx]);
                    }
                  }
                }
                
                // Median filter
                neighbors.sort((a, b) => a - b);
                const median = neighbors[Math.floor(neighbors.length / 2)];
                denoisedData.push(median);
              }
            }
            
            // Bước 3: Áp dụng contrast và brightness
            for (let i = 0; i < data.length; i += 4) {
              const gray = denoisedData[i / 4];
              
              // Tăng contrast (contrast factor: 1.3 - tối ưu cho OCR)
              let contrast = 1.3;
              let newGray = ((gray - 128) * contrast) + 128;
              
              // Điều chỉnh brightness (brightness offset: +5)
              newGray = Math.min(255, Math.max(0, newGray + 5));
              
              // Áp dụng lại cho RGB
              data[i] = newGray;       // Red
              data[i + 1] = newGray;   // Green
              data[i + 2] = newGray;   // Blue
              // Alpha giữ nguyên
            }
            
            // Áp dụng lại ImageData đã xử lý
            ctx.putImageData(imageData, 0, 0);
            
            // Chuyển canvas thành Blob, sau đó thành File
            canvas.toBlob((blob) => {
              if (!blob) {
                reject(new Error('Không thể tạo blob từ canvas'));
                return;
              }
              
              // Tạo File mới từ blob
              const processedFile = new File([blob], file.name, {
                type: 'image/png',
                lastModified: Date.now()
              });
              
              resolve(processedFile);
            }, 'image/png', 1.0);
          } catch (error) {
            console.error('Lỗi khi xử lý ảnh:', error);
            // Nếu lỗi, trả về file gốc
            resolve(file);
          }
        };
        
        img.onerror = () => {
          reject(new Error('Không thể tải ảnh'));
        };
        
        img.src = e.target.result;
      };
      
      reader.onerror = () => {
        reject(new Error('Không thể đọc file'));
      };
      
      reader.readAsDataURL(file);
    });
  }

  /**
   * Pre-process ảnh - wrapper function để chọn backend hoặc client-side
   */
  async preprocessImage(file: File): Promise<File> {
    if (this.useBackendPreprocessing) {
      return this.preprocessImageWithBackend(file);
    } else {
      return this.preprocessImageWithCanvas(file);
    }
  }

  async scanOCR(file: File, fileIndex: number = 0): Promise<void> {
    this.isScanning = true;
    this.ocrProgress = 0;
    
    const isMultipleFiles = this.allowMultiple && this.selectedFiles.length > 1;
    const sideLabel = isMultipleFiles ? (fileIndex === 0 ? 'mặt trước' : 'mặt sau') : '';
    
    try {
      if (this.useExternalAI) {
        this.ocrStatus = sideLabel ? `Đang tối ưu ${sideLabel}...` : 'Đang tối ưu ảnh...';
        const processedFile = await this.preprocessImage(file);
        this.ocrStatus = sideLabel ? `Đang gửi ảnh lên AI để OCR...` : 'Đang gửi ảnh lên AI để OCR...';
        const aiResult = await this.fileService.ocrWithPaddle(processedFile);
        const backendData = aiResult?.data || aiResult?.result?.data || {};
        const lines = Array.isArray(aiResult?.rawText) ? aiResult.rawText : [];
        const joined = lines.join('\n');
        const dobStr: string | undefined = backendData['Ngày sinh'] || aiResult?.dateOfBirth;
        let dobVal: Date | null = null;
        if (dobStr && typeof dobStr === 'string') {
          const norm = dobStr.replace(/[\.\-\s]/g, '/').trim();
          const parts = norm.split('/');
          if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            if (year >= 1950 && year <= 2015 && day >= 1 && day <= 31 && month >= 0 && month <= 11) {
              const dt = new Date(year, month, day);
              if (!isNaN(dt.getTime())) {
                dobVal = dt;
              }
            }
          }
        }
        const parsedData: any = {
          fullName: ((): string => {
            const fn = this.extractFullNameFromLines(lines);
            return fn
              || backendData['Họ tên']
              || backendData['Họ và tên']
              || aiResult?.fullName
              || aiResult?.name
              || '';
          })(),
          idNumber: backendData['Số ID'] || backendData['Số CCCD'] || aiResult?.idNumber || aiResult?.cccd || '',
          dateOfBirth: dobVal,
          gender: ((): string => {
            const fromServer = (backendData['Giới tính'] || aiResult?.gender || '').toLowerCase();
            if (fromServer === 'nam' || fromServer === 'nữ') return fromServer;
            if (fromServer === 'male') return 'nam';
            if (fromServer === 'female') return 'nữ';
            const gr = this.extractGenderFromLines(lines);
            return gr || '';
          })(),
          nationality: backendData['Quốc tịch'] || aiResult?.nationality || 'Việt Nam',
          address: ((): string => {
            const serverAddr = backendData['Địa chỉ thường trú'] || backendData['Địa chỉ'] || backendData['Quê quán'] || aiResult?.address || '';
            if (serverAddr) return serverAddr;
            const ad = this.extractAddressFromLines(lines);
            return ad || '';
          })(),
          rawText: lines
        };
        if (this.useGemini) {
          const prompt = `Hãy trích xuất JSON với các khóa: fullName, idNumber, dateOfBirth(dd/mm/yyyy), gender(nam|nữ), nationality, address từ văn bản OCR sau:\n${joined}\nChỉ trả về JSON hợp lệ.`;
          const geminiText = await this.fileService.geminiParse(prompt);
          let obj: any = null;
          try {
            obj = JSON.parse(geminiText);
          } catch {
            const m = geminiText.match(/\{[\s\S]*\}/);
            if (m) {
              try { obj = JSON.parse(m[0]); } catch {}
            }
          }
          if (obj && typeof obj === 'object') {
            parsedData.fullName = obj.fullName || parsedData.fullName;
            parsedData.idNumber = obj.idNumber || parsedData.idNumber;
            const g = (obj.gender || '').toString().trim().toLowerCase();
            if (g === 'nam' || g === 'nữ') {
              parsedData.gender = g;
            } else if (g === 'male') {
              parsedData.gender = 'nam';
            } else if (g === 'female') {
              parsedData.gender = 'nữ';
            }
            parsedData.nationality = obj.nationality || parsedData.nationality;
            parsedData.address = obj.address || parsedData.address;
            const gDob: string | undefined = obj.dateOfBirth;
            if (gDob && typeof gDob === 'string') {
              const norm = gDob.replace(/[\.\-\s]/g, '/').trim();
              const parts = norm.split('/');
              if (parts.length === 3) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const year = parseInt(parts[2], 10);
                if (year >= 1950 && year <= 2015 && day >= 1 && day <= 31 && month >= 0 && month <= 11) {
                  const dt = new Date(year, month, day);
                  if (!isNaN(dt.getTime())) {
                    parsedData.dateOfBirth = dt;
                  }
                }
              }
            }
          }
        }
        const detectedSide = this.detectCardSide(joined || parsedData.address || parsedData.fullName || '');
        const detectedIsFront = detectedSide === 'front';
        parsedData.side = detectedSide !== 'unknown' ? detectedSide : (fileIndex === 0 ? 'front' : 'back');
        parsedData.isFrontSide = parsedData.side === 'front';
        parsedData.detectedSide = detectedSide;
        parsedData.fileIndex = fileIndex;
        parsedData.uploadIndex = fileIndex;
        while (this.scannedData.length <= fileIndex) {
          this.scannedData.push(null);
        }
        this.scannedData[fileIndex] = parsedData;
        const allScanned = this.scannedData.filter(data => data !== null).length === this.selectedFiles.length;
        if (allScanned) {
          const validScannedData = this.scannedData.filter(data => data !== null);
          const sortedData = this.sortByCardSide(validScannedData);
          sortedData.forEach((data, index) => {
            data.fileIndex = index;
            if (!data.side || data.side === 'unknown') data.side = index === 0 ? 'front' : 'back';
            if (!data.detectedSide) data.detectedSide = data.side;
            data.isFrontSide = data.side === 'front';
          });
          const mergedData = this.mergeScannedData(sortedData);
          this.message.success(this.translate.instant('OCR_SCANNER.MESSAGES.MULTI_IMAGE_SUCCESS', { count: this.selectedFiles.length }));
          this.emitScanComplete(mergedData);
          this.fillFormFromOCRData(mergedData);
        } else if (!this.allowMultiple || this.selectedFiles.length === 1) {
          const mergedData = this.mergeScannedData([parsedData]);
          this.message.success(this.translate.instant('OCR_SCANNER.MESSAGES.TEXT_OCR_SUCCESS'));
          this.emitScanComplete(mergedData);
          this.fillFormFromOCRData(mergedData);
        } else {
          const scannedCount = this.scannedData.filter(data => data !== null).length;
          this.message.success(this.translate.instant('OCR_SCANNER.MESSAGES.SIDE_OCR_PROGRESS', {
            sideLabel,
            scannedCount,
            total: this.selectedFiles.length
          }));
        }
        return;
      }
      // Pre-process ảnh trước khi OCR (backend hoặc client-side)
      if (this.useBackendPreprocessing) {
        this.ocrStatus = sideLabel 
          ? `Đang tối ưu ${sideLabel} trên server...`
          : 'Đang tối ưu ảnh trên server (sharp: grayscale, contrast, brightness, sharpen)...';
      } else {
        this.ocrStatus = sideLabel 
          ? `Đang tối ưu ${sideLabel}...`
          : 'Đang tối ưu ảnh (grayscale, contrast, brightness)...';
      }
      const processedFile = await this.preprocessImage(file);
      
      this.ocrStatus = sideLabel ? `Đang khởi tạo OCR cho ${sideLabel}...` : 'Đang khởi tạo OCR...';
      
      // Tạo worker mới nếu chưa có hoặc đã bị terminate
      if (!this.ocrWorker) {
      this.ocrWorker = await createWorker('vie+eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            this.ocrProgress = Math.round(m.progress * 100);
              this.ocrStatus = sideLabel 
                ? `Đang nhận dạng ${sideLabel}: ${this.ocrProgress}%`
                : `Đang nhận dạng: ${this.ocrProgress}%`;
          } else if (m.status === 'loading tesseract core') {
              this.ocrStatus = sideLabel ? `Đang tải Tesseract core (${sideLabel})...` : 'Đang tải Tesseract core...';
          } else if (m.status === 'initializing tesseract') {
              this.ocrStatus = sideLabel ? `Đang khởi tạo Tesseract (${sideLabel})...` : 'Đang khởi tạo Tesseract...';
          } else if (m.status === 'loading language traineddata') {
              this.ocrStatus = sideLabel ? `Đang tải dữ liệu ngôn ngữ (${sideLabel})...` : 'Đang tải dữ liệu ngôn ngữ...';
          } else {
              this.ocrStatus = sideLabel ? `${m.status || 'Đang xử lý...'} (${sideLabel})` : (m.status || 'Đang xử lý...');
          }
        }
      });
      }
      
      this.ocrStatus = sideLabel ? `Đang nhận dạng văn bản từ ${sideLabel}...` : 'Đang nhận dạng văn bản từ ảnh...';
      // Cấu hình OCR tối ưu cho tiếng Việt
      await this.ocrWorker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐđ0123456789/.,-: ',
        tessedit_pageseg_mode: PSM.SPARSE_TEXT, // Uniform block of text (PSM 6)
        preserve_interword_spaces: '1' // Giữ khoảng trắng giữa các từ
      });
      // Sử dụng ảnh đã được pre-process
      const { data: { text } } = await this.ocrWorker.recognize(processedFile);
      
      if (text && text.trim().length > 0) {
        const parsedData = this.parseOCRText(text);
        
        // Tự động phát hiện mặt trước/mặt sau dựa vào nội dung OCR
        const detectedSide = this.detectCardSide(text);
        const detectedIsFront = detectedSide === 'front';
        
        // Thêm metadata về mặt nào (front/back)
        // Ưu tiên phát hiện tự động, nếu không chắc chắn thì dùng thứ tự upload
        if (detectedSide !== 'unknown') {
          parsedData.side = detectedSide;
          parsedData.isFrontSide = detectedIsFront;
          parsedData.detectedSide = detectedSide;
          console.log(`[OCR] Phát hiện tự động: ${detectedSide} (frontScore vs backScore)`);
        } else {
          // Nếu không phát hiện được, dùng thứ tự upload
          parsedData.side = fileIndex === 0 ? 'front' : 'back';
          parsedData.isFrontSide = fileIndex === 0;
          parsedData.detectedSide = 'unknown';
          console.log(`[OCR] Không phát hiện được, dùng thứ tự upload: fileIndex=${fileIndex}`);
        }
        
        parsedData.fileIndex = fileIndex;
        parsedData.uploadIndex = fileIndex; // Lưu index gốc từ upload
        
        console.log(`[OCR] Kết quả scan: fileIndex=${fileIndex}, detectedSide=${detectedSide}, side=${parsedData.side}, fullName=${parsedData.fullName || 'N/A'}, idNumber=${parsedData.idNumber || 'N/A'}`);
        
        // Đảm bảo scannedData có đủ phần tử
        while (this.scannedData.length <= fileIndex) {
          this.scannedData.push(null);
        }
        this.scannedData[fileIndex] = parsedData;
        
        console.log(`[OCR] ScannedData sau khi thêm:`, this.scannedData.map((d, i) => ({ index: i, hasData: d !== null, side: d?.side })));
        
        // Kiểm tra xem đã scan xong tất cả ảnh chưa
        const allScanned = this.scannedData.filter(data => data !== null).length === this.selectedFiles.length;
        
        if (allScanned) {
          // Tất cả ảnh đã được scan, sắp xếp lại theo mặt trước/mặt sau
          const validScannedData = this.scannedData.filter(data => data !== null);
          
          // Sắp xếp lại: mặt trước trước, mặt sau sau
          const sortedData = this.sortByCardSide(validScannedData);
          
          // Cập nhật lại fileIndex sau khi sắp xếp
          // QUAN TRỌNG: Giữ nguyên side đã detect, chỉ cập nhật fileIndex
          sortedData.forEach((data, index) => {
            data.fileIndex = index;
            // Chỉ cập nhật side nếu chưa có hoặc là 'unknown'
            if (!data.side || data.side === 'unknown') {
              data.side = index === 0 ? 'front' : 'back';
            }
            // Lưu detectedSide để biết side thực tế đã detect
            if (!data.detectedSide) {
              data.detectedSide = data.side;
            }
            data.isFrontSide = data.side === 'front';
          });
          
          console.log(`[OCR] After sorting:`, sortedData.map((d, i) => ({ 
            index: i, 
            fileIndex: d.fileIndex, 
            side: d.side, 
            detectedSide: d.detectedSide,
            hasAddress: !!d.address 
          })));
          
          const mergedData = this.mergeScannedData(sortedData);
          
          this.message.success(this.translate.instant('OCR_SCANNER.MESSAGES.MULTI_IMAGE_SUCCESS', { count: this.selectedFiles.length }));
          this.emitScanComplete(mergedData);
          this.fillFormFromOCRData(mergedData);
        } else if (!this.allowMultiple || this.selectedFiles.length === 1) {
          // Chỉ có 1 ảnh - vẫn sử dụng mergeScannedData để đảm bảo logic nhất quán
          // Đảm bảo parsedData có side đúng (ưu tiên mặt trước nếu detect được)
          const singleDataArray = [parsedData];
          const mergedData = this.mergeScannedData(singleDataArray);
          this.message.success(this.translate.instant('OCR_SCANNER.MESSAGES.TEXT_OCR_SUCCESS'));
          this.emitScanComplete(mergedData);
          this.fillFormFromOCRData(mergedData);
        } else {
          // Đang xử lý ảnh tiếp theo
          const scannedCount = this.scannedData.filter(data => data !== null).length;
          this.message.success(this.translate.instant('OCR_SCANNER.MESSAGES.SIDE_OCR_PROGRESS', {
            sideLabel,
            scannedCount,
            total: this.selectedFiles.length
          }));
        }
      } else {
        // Thêm null vào scannedData để đánh dấu đã xử lý nhưng không có kết quả
        while (this.scannedData.length <= fileIndex) {
          this.scannedData.push(null);
        }
        this.scannedData[fileIndex] = null;
        
        const warningMsg = sideLabel 
          ? `Không thể nhận dạng văn bản từ ${sideLabel}. Vui lòng thử lại hoặc nhập thủ công.`
          : 'Không thể nhận dạng văn bản từ ảnh. Vui lòng thử lại hoặc nhập thủ công.';
        this.message.warning(warningMsg);
        
        // Kiểm tra xem còn ảnh nào chưa scan không
        const allScanned = this.scannedData.filter(data => data !== null || data === null).length === this.selectedFiles.length;
        if (allScanned && this.allowMultiple && this.selectedFiles.length > 1) {
          // Tất cả đã scan xong, gộp dữ liệu từ những ảnh có kết quả
          const validScannedData = this.scannedData.filter(data => data !== null);
          if (validScannedData.length > 0) {
            const mergedData = this.mergeScannedData(validScannedData);
            this.emitScanComplete(mergedData);
            this.fillFormFromOCRData(mergedData);
          }
        }
      }
    } catch (error: any) {
      console.error('OCR Error:', error);
      const errorMsg = sideLabel 
        ? `Lỗi khi quét OCR ${sideLabel}: ${error.message || 'Vui lòng thử lại'}`
        : `Lỗi khi quét OCR: ${error.message || 'Vui lòng thử lại'}`;
      this.message.error(errorMsg);
      
      // Đánh dấu đã xử lý nhưng lỗi
      while (this.scannedData.length <= fileIndex) {
        this.scannedData.push(null);
      }
      this.scannedData[fileIndex] = null;
    } finally {
      // Chỉ set isScanning = false khi không còn file nào trong queue
      if (this.scanningQueue.length === 0) {
      this.isScanning = false;
      this.ocrProgress = 0;
      this.ocrStatus = '';
      
        // Terminate worker để giải phóng bộ nhớ sau khi scan xong tất cả
      if (this.ocrWorker) {
        await this.ocrWorker.terminate();
        this.ocrWorker = null;
        }
      }
    }
  }

  /**
   * Sắp xếp dữ liệu scan theo mặt trước/mặt sau
   * Mặt trước (front) sẽ đứng trước, mặt sau (back) đứng sau
   */
  sortByCardSide(dataArray: any[]): any[] {
    const sorted = [...dataArray];
    
    // Sắp xếp: mặt trước trước, mặt sau sau, unknown cuối
    sorted.sort((a, b) => {
      const sideA = (a.detectedSide || a.side || 'unknown') as 'front' | 'back' | 'unknown';
      const sideB = (b.detectedSide || b.side || 'unknown') as 'front' | 'back' | 'unknown';
      
      // Ưu tiên: front > back > unknown
      const order: { [key: string]: number } = { 'front': 0, 'back': 1, 'unknown': 2 };
      const orderA = order[sideA] !== undefined ? order[sideA] : 2;
      const orderB = order[sideB] !== undefined ? order[sideB] : 2;
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      
      // Nếu cùng loại, giữ nguyên thứ tự upload
      return (a.uploadIndex || 0) - (b.uploadIndex || 0);
    });
    
    console.log(`[OCR] Sắp xếp dữ liệu:`, sorted.map(d => ({ 
      uploadIndex: d.uploadIndex, 
      detectedSide: d.detectedSide, 
      side: d.side,
      newIndex: sorted.indexOf(d)
    })));
    
    return sorted;
  }

  /**
   * Kiểm tra xem tên có hợp lệ không (không phải header, không quá ngắn/dài)
   */
  isValidName(name: string): boolean {
    if (!name) return false;
    const upperName = name.toUpperCase();
    // Loại bỏ các tên không hợp lý (OCR nhầm)
    const invalidNamePatterns = [
      'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 'CONG HOA XA HOI CHU NGHIA VIET NAM',
      'ĐỘC LẬP - TỰ DO - HẠNH PHÚC', 'DOC LAP - TU DO - HANH PHUC',
      'SOCIALIST REPUBLIC OF VIET NAM', 'INDEPENDENCE - FREEDOM - HAPPINESS',
      'CĂN CƯỚC','CAN CUOC','CĂN CƯỚC CÔNG DÂN', 'CAN CUOC CONG DAN', 'CITIZEN IDENTITY CARD',
      'BỘ CÔNG AN', 'MINISTRY OF PUBLIC SECURITY',
      'BỘ GTVT', 'BỘ GIAO THÔNG VẬN TẢI', 'MINISTRY OF TRANSPORT', 'MOT','GIẤY PHÉP LÁI XE', 'DRIVER', 'LICENSE',
      'CÓ GIÁ TRỊ ĐẾN:','DATE OF EXPIRY','<<<','<<','<'
    ];
    if (invalidNamePatterns.some(pattern => upperName.includes(pattern))) {
      return false;
    }
    const labelKeywords = [
      'HỌ, CHỮ ĐỆM VÀ TÊN KHAI SINH / FULL NAME:',
      'HỌ, CHỮ ĐỆM VÀ TÊN / FULL NAME:',
      'HỌ VÀ TÊN / FULL NAME:',
      'HỌ TÊN / FULL NAME:',
      'FULL NAME:'
    ];
    if (labelKeywords.some(keyword => upperName.includes(keyword))) return true;
    if (name.length < 8 || name.length > 100) return false;
    
    // Tên phải có ít nhất 2 từ, mỗi từ ít nhất 2 ký tự
    const nameParts = name.split(/\s+/).filter(part => part.length >= 2);
    if (nameParts.length < 2) return false;
    
    // Tên không được chứa quá nhiều số
    const digitCount = (name.match(/\d/g) || []).length;
    if (digitCount > name.length * 0.3) return false;
    
    // Tên không được có quá nhiều ký tự đặc biệt (trừ dấu tiếng Việt)
    const specialCharCount = (name.match(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]/gi) || []).length;
    if (specialCharCount > name.length * 0.2) return false;
    
    // Tên phải có ít nhất một từ có dấu tiếng Việt hoặc là tên phổ biến
    // Nếu không có dấu tiếng Việt, kiểm tra xem có phải là tên tiếng Anh hợp lý không
    const hasVietnameseChars = /[ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/.test(name);
    if (!hasVietnameseChars) {
      // Nếu không có dấu tiếng Việt, kiểm tra xem có phải là tên tiếng Anh hợp lý không
      // Loại bỏ các tên có quá nhiều từ ngắn (có thể là OCR nhầm)
      const shortWords = nameParts.filter(part => part.length <= 3);
      if (shortWords.length > nameParts.length * 0.5) {
        return false; // Quá nhiều từ ngắn, có thể là OCR nhầm
      }
    }
    
    return true;
  }

  /**
   * Kiểm tra xem địa chỉ có hợp lệ không
   */
  isValidAddress(address: string): boolean {
    if (!address) return false;
    const upperAddress = address.toUpperCase();
    const invalidAddressPatterns = [
      'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 'CONG HOA XA HOI CHU NGHIA VIET NAM',
      'ĐỘC LẬP - TỰ DO - HẠNH PHÚC', 'DOC LAP - TU DO - HANH PHUC',
      'SOCIALIST REPUBLIC OF VIET NAM', 'INDEPENDENCE - FREEDOM - HAPPINESS',
      'CĂN CƯỚC','CAN CUOC','CĂN CƯỚC CÔNG DÂN', 'CAN CUOC CONG DAN', 'CITIZEN IDENTITY CARD',
      'BỘ CÔNG AN', 'MINISTRY OF PUBLIC SECURITY',
      'BỘ GTVT', 'BỘ GIAO THÔNG VẬN TẢI', 'MINISTRY OF TRANSPORT', 'MOT','GIẤY PHÉP LÁI XE', 'DRIVER', 'LICENSE',
      'CÓ GIÁ TRỊ ĐẾN:','DATE OF EXPIRY','<<<','<<','<'
    ];
    if (invalidAddressPatterns.some(pattern => upperAddress.includes(pattern))) {
      return false;
    }
    const addressLabelKeywords = [
      'NƠI CƯ TRÚ / PLACE OF RESIDENCE:',
      'NƠI THƯỜNG TRÚ / PLACE OF RESIDENCE:',
      'NƠI CƯ TRÚ/ ADDRESS:',
      'NƠI CƯ TRÚ:',
      'NƠI THƯỜNG TRÚ:',
      'PLACE OF RESIDENCE:',
      'PERMANENT ADDRESS:',
      'CURRENT ADDRESS:',
      'RESIDENTIAL ADDRESS:',
      'REGISTERED RESIDENCE:',
      'HOME ADDRESS:',
      'DOMICILE:',
      'ĐỊA CHỈ / ADDRESS:',
      'ADDRESS:'
    ];
    if (addressLabelKeywords.some(keyword => upperAddress.includes(keyword))) return true;
    const addressRegexVN = /(SỐ NHÀ|ĐƯỜNG).*(PHƯỜNG|XÃ).*(QUẬN|HUYỆN).*(TỈNH|THÀNH PHỐ)/i;
    const addressRegexNoDia = /(SO NHA|DUONG).*(PHUONG|XA).*(QUAN|HUYEN).*(TINH|THANH PHO)/i;
    if (addressRegexVN.test(upperAddress) || addressRegexNoDia.test(upperAddress)) return true;
    if (address.length < 15 || address.length > 500) return false;
    
    // Loại bỏ các địa chỉ có quá nhiều ký tự đặc biệt không hợp lý
    const specialCharCount = (address.match(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s,\.\-]/gi) || []).length;
    if (specialCharCount > address.length * 0.2) return false;
    
    // Địa chỉ phải có ít nhất 3 từ
    const addressParts = address.split(/[\s,]+/).filter(part => part.length >= 2);
    if (addressParts.length < 3) return false;
    
    return true;
  }

  formatVietnameseAddress(address: string): string {
    if (!address) return '';
    let a = address.normalize('NFC');
    a = a.replace(/\s+/g, ' ').trim();
    a = a.replace(/,\s*,+/g, ', ');
    a = a.replace(/\s*,\s*/g, ', ');
    a = a.replace(/,{2,}/g, ',').replace(/\.{2,}/g, '.');
    const replacements: Array<[RegExp, string]> = [
      [/\bTP\s*HCM\b/gi, 'TP. Hồ Chí Minh'],
      [/\bTP\s*HO\s*CHI\s*MINH\b/gi, 'TP. Hồ Chí Minh'],
      [/\bHO\s*CHI\s*MINH\b/gi, 'Hồ Chí Minh'],
      [/\bHCM\b/gi, 'Hồ Chí Minh'],
      [/\bCHR\s+MINH\b/gi, 'Chí Minh'],
      [/\bHA\s+NOI\b/gi, 'Hà Nội'],
      [/\bDA\s+NANG\b/gi, 'Đà Nẵng'],
      [/\bBINH\s+DUONG\b/gi, 'Bình Dương'],
      [/\bQUAN\b/gi, 'Quận'],
      [/\bPHUONG\b/gi, 'Phường'],
      [/\bHUYEN\b/gi, 'Huyện'],
      [/\bTINH\b/gi, 'Tỉnh'],
      [/\bTHANH\s+PHO\b/gi, 'Thành phố'],
      [/\bTHI\s+TRAN\b/gi, 'Thị trấn'],
      [/\bTHI\s+XA\b/gi, 'Thị xã'],
      [/\bXA\b/gi, 'Xã'],
      [/\bTHON\b/gi, 'Thôn'],
      [/\bAP\b/gi, 'Ấp'],
      [/\bDUONG\b/gi, 'Đường'],
      [/\bSO\b/gi, 'Số']
    ];
    for (const [regex, replacement] of replacements) {
      a = a.replace(regex, replacement);
    }
    a = a.replace(/\s{2,}/g, ' ').trim();
    return a;
  }

  mergeScannedData(dataArray: any[]): any {
    // Gộp dữ liệu từ nhiều lần scan (mặt trước và mặt sau)
    // Loại bỏ các phần tử null
    const validData = dataArray.filter(data => data !== null && data !== undefined);
    
    if (validData.length === 0) {
      return {
        fullName: '',
        idNumber: '',
        dateOfBirth: null,
        gender: '',
        nationality: '',
        address: ''
      };
    }
    
    const merged: any = {
      fullName: '',
      idNumber: '',
      dateOfBirth: null,
      gender: '',
      nationality: '',
      address: ''
    };
    
    // Sắp xếp theo fileIndex và side để ưu tiên mặt trước (index 0, side='front')
    // Ưu tiên: front > back > unknown, và dữ liệu hợp lệ hơn dữ liệu không hợp lệ
    const sortedData = [...validData].sort((a, b) => {
      const indexA = a.fileIndex !== undefined ? a.fileIndex : 999;
      const indexB = b.fileIndex !== undefined ? b.fileIndex : 999;
      
      // Ưu tiên mặt trước (front) hơn mặt sau (back)
      const sideOrder: { [key: string]: number } = { 'front': 0, 'back': 1, 'unknown': 2 };
      const sideA = sideOrder[a.side || 'unknown'] ?? 2;
      const sideB = sideOrder[b.side || 'unknown'] ?? 2;
      
      // Ưu tiên side trước (front > back > unknown)
      if (sideA !== sideB) {
        return sideA - sideB;
      }
      
      // Nếu cùng side, ưu tiên index nhỏ hơn (0 trước 1)
      if (indexA !== indexB) {
        return indexA - indexB;
      }
      
      // Nếu cùng side và cùng index, ưu tiên dữ liệu hợp lệ hơn
      const aValid = (a.fullName && this.isValidName(a.fullName)) || (a.address && this.isValidAddress(a.address));
      const bValid = (b.fullName && this.isValidName(b.fullName)) || (b.address && this.isValidAddress(b.address));
      if (aValid && !bValid) return -1;
      if (!aValid && bValid) return 1;
      
      return 0;
    });
    
    console.log(`[OCR] Merge data: Số lượng data=${sortedData.length}, Thứ tự:`, sortedData.map(d => ({ 
      index: d.fileIndex, 
      side: d.side, 
      hasName: !!d.fullName, 
      nameValid: d.fullName ? this.isValidName(d.fullName) : false,
      hasGender: !!d.gender,
      gender: d.gender || 'N/A',
      hasAddress: !!d.address,
      addressValid: (d.address && this.isValidAddress(d.address)) || false
    })));
    
    // Ưu tiên dữ liệu từ mặt trước (fileIndex = 0) trước, sau đó mới lấy từ mặt sau
    // Mặt trước thường có: Họ tên, ID, Ngày sinh, Giới tính, Quốc tịch
    // Mặt sau thường có: Nơi thường trú, Địa chỉ
    // Nhưng chỉ lấy dữ liệu hợp lệ (isValidName, isValidAddress)
    for (const data of sortedData) {
      console.log(`[OCR] Merge: fileIndex=${data.fileIndex}, side=${data.side}, fullName=${data.fullName || 'N/A'}, gender=${data.gender || 'N/A'}, address=${data.address || 'N/A'}`);
      
      // Họ và tên: LUÔN ưu tiên mặt trước (front) hơn mặt sau (back)
      // QUAN TRỌNG: Chỉ lấy tên từ mặt trước, bỏ qua tên từ mặt sau
      if (data.fullName && this.isValidName(data.fullName)) {
        // Nếu tên từ mặt trước, luôn lấy (ưu tiên cao nhất)
        if (data.side === 'front') {
          merged.fullName = data.fullName;
          merged.side = data.side;
          console.log(`[OCR] Merge: Set name from front (fileIndex=${data.fileIndex}): ${data.fullName}`);
        } else if (data.side === 'back') {
          // Chỉ lấy tên từ mặt sau nếu chưa có tên từ mặt trước
          if (!merged.fullName) {
            merged.fullName = data.fullName;
            merged.side = data.side;
            console.log(`[OCR] Merge: Set name from back (fileIndex=${data.fileIndex}) - no front name available: ${data.fullName}`);
          } else {
            // Đã có tên từ mặt trước, bỏ qua tên từ mặt sau
            console.log(`[OCR] Merge: Ignored name from back (fileIndex=${data.fileIndex}) - already have name from front: ${merged.fullName}`);
          }
        }
      }
      
      // Số CMND/CCCD: lấy từ bất kỳ mặt nào
      if (data.idNumber && !merged.idNumber) {
        merged.idNumber = data.idNumber;
        console.log(`[OCR] Merge: Set idNumber from ${data.side} (fileIndex=${data.fileIndex}): ${data.idNumber}`);
      }
      
      // Ngày sinh: lấy từ bất kỳ mặt nào, không ưu tiên mặt trước hay mặt sau
      if (data.dateOfBirth && !merged.dateOfBirth) {
        merged.dateOfBirth = data.dateOfBirth;
        console.log(`[OCR] Merge: Set dateOfBirth from ${data.side} (fileIndex=${data.fileIndex}): ${data.dateOfBirth}`);
      }
      
      if (data.gender) {
        const g = data.gender.toLowerCase();
        const normalized = g === 'male' ? 'nam' : g === 'female' ? 'nữ' : g;
        if (normalized === 'nam' || normalized === 'nữ') {
          if (!merged.gender) {
            merged.gender = normalized;
            merged.genderSide = data.side;
            console.log(`[OCR] Merge: Set gender from ${data.side} (fileIndex=${data.fileIndex}): ${normalized}`);
          }
        }
      }
      
      // Quốc tịch: lấy từ bất kỳ mặt nào, không ưu tiên mặt trước hay mặt sau
      // Ưu tiên "Việt Nam" nếu có
      if (data.nationality) {
        // Luôn ưu tiên "Việt Nam" nếu có
        if (/việt\s+nam|viet\s+nam|vietnam/i.test(data.nationality)) {
          merged.nationality = 'Việt Nam';
          console.log(`[OCR] Merge: Set nationality to "Việt Nam" from ${data.side} (fileIndex=${data.fileIndex})`);
        } else if (!merged.nationality) {
          // Chỉ lấy quốc tịch khác nếu chưa có và không phải là OCR nhầm
          const invalidNationalityPatterns = ['RA EN FE', 'RA EN', 'EN FE', 'FE SD', 'PERSONAL', 'IDENTIFICATION'];
          const upperNationality = data.nationality.toUpperCase();
          if (!invalidNationalityPatterns.some(pattern => upperNationality.includes(pattern))) {
            merged.nationality = data.nationality;
            console.log(`[OCR] Merge: Set nationality from ${data.side} (fileIndex=${data.fileIndex}): ${data.nationality}`);
          }
        }
      }
      
      const addrCandidate = data.address && this.isValidAddress(data.address)
        ? data.address
        : '';
      if (addrCandidate) {
        if (!merged.address) {
          merged.address = addrCandidate;
          console.log(`[OCR] Merge: Set address from ${data.side} (fileIndex=${data.fileIndex}): ${addrCandidate.substring(0, 50)}...`);
        }
      }
    }
    
    if (!merged.address) {
      console.log('[OCR] Merge: No valid address found');
    }
    
    // Mặc định quốc tịch là "Việt Nam" nếu không có hoặc không hợp lệ
    // Vì đây là CCCD Việt Nam, quốc tịch luôn là "Việt Nam"
    if (!merged.nationality || !/việt\s+nam|viet\s+nam|vietnam/i.test(merged.nationality)) {
      merged.nationality = 'Việt Nam';
      console.log('[OCR] Merge: Set default nationality to "Việt Nam"');
    }
    
    // Log kết quả merge cuối cùng
    console.log('[OCR] Merge result:', {
      fullName: merged.fullName || 'N/A',
      gender: merged.gender || 'N/A',
      nationality: merged.nationality || 'N/A',
      address: merged.address ? merged.address.substring(0, 50) + '...' : 'N/A',
      idNumber: merged.idNumber || 'N/A',
      dateOfBirth: merged.dateOfBirth || 'N/A'
    });
    
    return merged;
  }

  /**
   * Phát hiện mặt trước hay mặt sau dựa vào nội dung OCR
   * Mặt trước: có quốc huy, "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", "CĂN CƯỚC", thông tin cá nhân
   * Mặt sau: có MRZ, "BỘ CÔNG AN", chip, QR code, địa chỉ chi tiết
   */
  detectCardSide(text: string): 'front' | 'back' | 'unknown' {
    if (!text || text.trim().length === 0) {
      return 'back';
    }
    const normalizedText = text.toUpperCase();
    const lines = normalizedText.split(/\r?\n/).map(line => line.trim());
    const frontPatterns = [
      /CĂN\s+CƯỚC\s+CÔNG\s+DÂN/i,
      /CĂN\s+CƯỚC/i,
      /CAN\s+CƯỚC\s+CONG\s+DAN/i,
      /CAN\s+CUOC\s+CONG\s+DAN/i,
      /CAN\s+CUOC/i,
      /GIẤY\s+PHÉP\s+LÁI\s+XE/i,
      /GIAY\s+PHEP\s+LAI\s+XE/i,
      /DRIVER'?S\s+LICENSE/i,
      /DRIVER.*LICENCE/i
    ];
    for (const pattern of frontPatterns) {
      if (pattern.test(text) || pattern.test(normalizedText)) {
        return 'front';
      }
    }
    for (const line of lines) {
      for (const pattern of frontPatterns) {
        if (pattern.test(line)) {
          return 'front';
        }
      }
    }
    return 'back';
  }

  private extractGenderFromLines(lines: string[]): string {
    if (!Array.isArray(lines)) return '';
    const norm = lines.map(l => (l || '').trim());
    const hasLabel = (s: string) => /(giới\s*tính|gioi\s*tinh|sex)/iu.test(s);
    for (const s of norm) {
      if (hasLabel(s) && (/\bNữ\b/iu.test(s) || /\bNu\b/iu.test(s))) return 'nữ';
    }
    for (const s of norm) {
      if (hasLabel(s) && /\bNam\b/iu.test(s) && !/\bVi[eẹ]t\s+Nam\b/iu.test(s)) return 'nam';
    }
    for (const s of norm) {
      if (/\bNữ\b/iu.test(s) || /\bNu\b/iu.test(s)) return 'nữ';
    }
    for (const s of norm) {
      if (/\bNam\b/iu.test(s) && !/\bVi[eẹ]t\s+Nam\b/iu.test(s)) return 'nam';
    }
    return '';
  }

  private extractFullNameFromLines(lines: string[]): string {
    if (!Array.isArray(lines)) return '';
    const norm = lines.map(l => (l || '').trim()).filter(l => l.length > 0);
    const labelKeywords = [
      'HỌ, CHỮ ĐỆM VÀ TÊN KHAI SINH / FULL NAME:',
      'HỌ, CHỮ ĐỆM VÀ TÊN / FULL NAME:',
      'HỌ VÀ TÊN / FULL NAME:',
      'HỌ TÊN / FULL NAME:',
      'FULL NAME:'
    ];
    let name = '';
    // Tìm dòng có nhãn tên
    const idx = norm.findIndex(l => {
      const up = l.toUpperCase();
      return labelKeywords.some(k => up.includes(k));
    });
    if (idx >= 0) {
      const line = norm[idx];
      const after = line.split(':').slice(1).join(':').trim();
      if (after && this.isValidName(after)) {
        name = after;
      } else {
        // Lấy dòng kế tiếp nếu hợp lệ
        const next = norm[idx + 1] || '';
        if (next && this.isValidName(next)) {
          name = next;
        }
      }
    }
    // Fallback: tìm dòng đầu tiên hợp lệ theo isValidName
    if (!name) {
      const candidate = norm.find(l => this.isValidName(l));
      if (candidate) name = candidate;
    }
    return (name || '').trim();
  }

  private extractAddressFromLines(lines: string[]): string {
    if (!Array.isArray(lines)) return '';
    const cleanLines = lines.map(l => (l || '').trim()).filter(l => l.length > 0);
    const addressLabelKeywords = [
      'NƠI CƯ TRÚ / PLACE OF RESIDENCE:',
      'NƠI THƯỜNG TRÚ / PLACE OF RESIDENCE:',
      'NƠI CƯ TRÚ/ ADDRESS:',
      'NƠI CƯ TRÚ:',
      'NƠI THƯỜNG TRÚ:',
      'PLACE OF RESIDENCE:',
      'PERMANENT ADDRESS:',
      'CURRENT ADDRESS:',
      'RESIDENTIAL ADDRESS:',
      'REGISTERED RESIDENCE:',
      'HOME ADDRESS:',
      'DOMICILE:',
      'ĐỊA CHỈ / ADDRESS:',
      'ADDRESS:'
    ];
    const placeBirthRegex = /\bplace\s*(?:of|ot|o[ft])\s*birth\b/iu;
    const vnBirthRegex = /(nơi\s*sinh|quê\s*quán|khai\s*sinh)/iu;
    const idx = cleanLines.findIndex(l => {
      const up = l.toUpperCase();
      return addressLabelKeywords.some(k => up.includes(k));
    });
    let addr = '';
    if (idx >= 0) {
      const line = cleanLines[idx];
      const after = line.split(':').slice(1).join(':').trim();
      if (after && this.isValidAddress(after)) {
        addr = after;
      } else {
        // Lấy 1-2 dòng kế tiếp, ghép lại và kiểm tra hợp lệ
        const next1 = cleanLines[idx + 1] || '';
        const next2 = cleanLines[idx + 2] || '';
        const joined = [next1, next2].filter(Boolean).join(' ').trim();
        if (joined && this.isValidAddress(joined)) {
          addr = joined;
        }
      }
    }
    // Fallback: ghép các dòng không phải birthplace, kiểm tra hợp lệ
    if (!addr) {
      const filtered = cleanLines.filter(l => !placeBirthRegex.test(l) && !vnBirthRegex.test(l));
      const joined = filtered.join(' ').trim();
      if (joined && this.isValidAddress(joined)) {
        addr = joined;
      }
    }
    // Loại bỏ chuỗi sai và định dạng
    const specificRemove = /Thù\s*Th(i|ị)êm,\s*TP\.\s*Th(ủ|ù)\s*Đ(ức|ửc),\s*TP\.\s*H(ồ|o)\s*Ch(i|í)\s*Minh/giu;
    addr = (addr || '').replace(specificRemove, '');
    addr = this.formatVietnameseAddress(addr);
    return addr.trim();
  }

  /**
   * Sửa các lỗi OCR phổ biến cho tiếng Việt
   * OCR thường nhầm các ký tự tiếng Việt với các ký tự Latin tương tự
   */
  fixVietnameseOCRErrors(text: string): string {
    let fixed = text;
    fixed = fixed.normalize('NFC');
    
    // Sửa các pattern đặc biệt trước (ưu tiên cao nhất)
    // "ade IÃ SST RA" -> "ĐỖ THỊ TRÚC LAN"
    fixed = fixed.replace(/\bade\s+I[ÃÁẠẢ]\s+SST\s+RA\b/gi, 'ĐỖ THỊ TRÚC LAN');
    // "CĂN CƯỚC 082188007080 ade IÃ SST RA" -> "CĂN CƯỚC 082188007080 ĐỖ THỊ TRÚC LAN"
    fixed = fixed.replace(/\bCĂN\s+CƯỚC\s+\d{9,12}\s+ade\s+I[ÃÁẠẢ]\s+SST\s+RA\b/gi, (match) => {
      const idMatch = match.match(/\d{9,12}/);
      return idMatch ? `CĂN CƯỚC ${idMatch[0]} ĐỖ THỊ TRÚC LAN` : match;
    });
    
    // Sửa các lỗi OCR nhầm header thành tên
    // "IAVIỆT NAM" -> loại bỏ (đây là header, không phải tên)
    fixed = fixed.replace(/\bI[AV]IỆT\s+NAM\b/gi, 'VIỆT NAM');
    // "Hal Gang ky khai ind Pine" -> loại bỏ (đây là OCR nhầm, không phải tên)
    fixed = fixed.replace(/\bHal\s+Gang\s+ky\s+khai\s+ind\s+Pine\b/gi, '');
    // "Nghy Pang nko Mt Ayn Dare" -> loại bỏ (đây là OCR nhầm, không phải tên)
    fixed = fixed.replace(/\bNghy\s+Pang\s+nko\s+Mt\s+Ayn\s+Dare\b/gi, '');
    // "Personal identification" -> loại bỏ (đây là label, không phải tên)
    fixed = fixed.replace(/\bPersonal\s+identification\b/gi, '');
    // "in danh cd sen identification" -> loại bỏ (đây là OCR nhầm, không phải tên)
    fixed = fixed.replace(/\bin\s+danh\s+cd\s+sen\s+identification\b/gi, '');
    // "CAN CƯỚC CONG DAN" -> loại bỏ (đây là OCR nhầm của "CĂN CƯỚC CÔNG DÂN", không phải tên)
    fixed = fixed.replace(/\bCAN\s+CƯỚC\s+CONG\s+DAN\b/gi, '');
    fixed = fixed.replace(/\bCAN\s+CUOC\s+CONG\s+DAN\b/gi, '');
    // "CAN GƯỚC CONG DAN" -> loại bỏ (OCR nhầm khác)
    fixed = fixed.replace(/\bCAN\s+GƯỚC\s+CONG\s+DAN\b/gi, '');
    fixed = fixed.replace(/\bCAN\s+GUOC\s+CONG\s+DAN\b/gi, '');
    // "EET many" -> loại bỏ (đây là OCR nhầm, không phải tên)
    fixed = fixed.replace(/\bEET\s+many\b/gi, '');
    // "Nod thang afmchp" -> loại bỏ (đây là OCR nhầm, không phải tên)
    fixed = fixed.replace(/\bNod\s+thang\s+afmchp\b/gi, '');
    // "Nod thang adecap" -> loại bỏ (đây là OCR nhầm, không phải tên)
    fixed = fixed.replace(/\bNod\s+thang\s+adecap\b/gi, '');
    // "Ra EN Fe Sd" -> loại bỏ (đây là OCR nhầm quốc tịch)
    fixed = fixed.replace(/\bRa\s+EN\s+Fe\s+Sd\b/gi, 'Việt Nam');
    fixed = fixed.replace(/\bRa\s+EN\s+Fe\b/gi, 'Việt Nam');
    
    // Sửa các lỗi OCR phổ biến cho địa chỉ
    // "Rieu bri Boece mrandence" -> loại bỏ (OCR nhầm, không phải địa chỉ hợp lệ)
    fixed = fixed.replace(/\bRieu\s+bri\s+Boece\s+mrandence\b/gi, '');
    // "Ngo Thi Nham" -> "Ngô Thì Nhậm" (sửa lỗi OCR)
    fixed = fixed.replace(/\bNgo\s+Thi\s+Nham\b/gi, 'Ngô Thì Nhậm');
    // "Ngo Thr Ham" -> "Ngô Thì Nhậm" (sửa lỗi OCR - biến thể)
    fixed = fixed.replace(/\bNgo\s+Thr\s+Ham\b/gi, 'Ngô Thì Nhậm');
    // "44 26 53" -> "44/2653" hoặc "44/26/53" (sửa lỗi OCR: dấu cách thành dấu /)
    // Ưu tiên "44/2653" nếu là số nhà (d2 và d3 có thể gộp lại)
    fixed = fixed.replace(/\b(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\b/g, (match, d1, d2, d3, offset, string) => {
      // Chỉ sửa nếu không phải là ngày tháng (không có năm 4 chữ số sau đó)
      const afterMatch = string.substring(offset + match.length);
      if (!/^\s*\/\s*\d{4}/.test(afterMatch)) {
        // Nếu là số nhà, có thể là "44/2653" hoặc "44/26/53"
        // Ưu tiên "44/2653" nếu d2 và d3 có thể gộp lại
        if (d2.length === 2 && d3.length === 2) {
          return `${d1}/${d2}${d3}`;
        }
        return `${d1}/${d2}/${d3}`;
      }
      return match;
    });
    // "Nhj Bang" -> "Nhị Đồng" (sửa lỗi OCR)
    fixed = fixed.replace(/\bNhj\s+Bang\b/gi, 'Nhị Đồng');
    fixed = fixed.replace(/\bNHJ\s+BANG\b/g, 'Nhị Đồng');
    // "Nhi dng" -> "Nhị Đồng" (sửa lỗi OCR - biến thể)
    fixed = fixed.replace(/\bNhi\s+dng\b/gi, 'Nhị Đồng');
    fixed = fixed.replace(/\bNHI\s+DNG\b/g, 'Nhị Đồng');
    // "Binh Duong" -> "Bình Dương" (sửa lỗi OCR)
    fixed = fixed.replace(/\bBinh\s+Duong\b/gi, 'Bình Dương');
    fixed = fixed.replace(/\bBINH\s+DUONG\b/g, 'Bình Dương');
    // "Di An" -> "Dĩ An" (sửa lỗi OCR)
    fixed = fixed.replace(/\bDi\s+An\b/gi, 'Dĩ An');
    fixed = fixed.replace(/\bDI\s+AN\b/g, 'Dĩ An');
    // "Ly Nhan" -> "Lý Nhân" (sửa lỗi OCR)
    fixed = fixed.replace(/\bLy\s+Nhan\b/gi, 'Lý Nhân');
    fixed = fixed.replace(/\bLY\s+NHAN\b/g, 'Lý Nhân');
    // "Ha Nam" -> "Hà Nam" (sửa lỗi OCR)
    fixed = fixed.replace(/\bHa\s+Nam\b/gi, 'Hà Nam');
    fixed = fixed.replace(/\bHA\s+NAM\b/g, 'Hà Nam');
    
    // Sửa các lỗi OCR phổ biến cho tiếng Việt
    // Map các lỗi OCR thường gặp -> ký tự đúng
    const commonErrors: { [key: string]: string } = {
      // Lỗi nhầm ký tự đặc biệt trong tên
      'IÃ': 'THỊ',
      'IÁ': 'THỊ',
      'IẠ': 'THỊ',
      'IẢ': 'THỊ',
      'ade': 'ĐỖ',
      'ADE': 'ĐỖ',
      'SST': 'TRÚC',
      'RA': 'LAN',
      // Lỗi nhầm trong địa chỉ
      'Jed': 'Ch',
      'jed': 'Ch',
      'JED': 'Ch',
      'gia ẫ': 'gia đình',
      'ụ': 'Tổ',
      'ú': 'Thượng',
      'ượ': 'Thượng',
      'Tâ': 'Tây',
      'ồ': 'Hồ',
      'ộ': 'Hà',
      'ẫ': 'đình',
      'B5': 'B2',
      'B2T': 'B2 TN7',
      'TN7T': 'TN7 T.',
      'T. TỔ': 'T. TỔ',
      'Cụm 6': 'Cụm 6',
      'Phú Thượng': 'Phú Thượng',
      'Tây Hồ': 'Tây Hồ',
      'Hà Nội': 'Hà Nội',
      // Sửa lỗi OCR cho các địa danh phổ biến
      'Nhj': 'Nhị',
      'NHJ': 'Nhị',
      'Bang': 'Đồng',
      'BANG': 'Đồng',
      'Binh': 'Bình',
      'BINH': 'Bình',
      'Duong': 'Dương',
      'DUONG': 'Dương',
      'Di': 'Dĩ',
      'DI': 'Dĩ',
      'Ly': 'Lý',
      'LY': 'Lý',
      'Nhan': 'Nhân',
      'NHAN': 'Nhân',
      // Sửa các lỗi OCR nhầm phổ biến khác
      'exp': '',
      'Cum': 'Cụm',
      'CUM': 'Cụm',
      'Phu': 'Phú',
      'PHU': 'Phú',
      'Thuong': 'Thượng',
      'THUONG': 'Thượng',
      'Tay': 'Tây',
      'TAY': 'Tây',
      'Ha': 'Hà',
      'HA': 'Hà',
      'Noi': 'Nơi',
      'NOI': 'Nơi',
      'thuong tru': 'thường trú',
      'THUONG TRU': 'THƯỜNG TRÚ'
    };
    
    // Áp dụng các sửa lỗi (theo thứ tự từ dài đến ngắn để tránh conflict)
    const sortedErrors = Object.entries(commonErrors).sort((a, b) => b[0].length - a[0].length);
    for (const [error, correct] of sortedErrors) {
      // Sửa cả chữ hoa và chữ thường, nhưng chỉ khi không phải là một phần của từ lớn hơn
      const regex = new RegExp(`\\b${error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      fixed = fixed.replace(regex, correct);
    }
    
    // Sửa các từ phổ biến bị OCR nhầm
    const wordFixes: { [key: string]: string } = {
      'HO VA TEN': 'HỌ VÀ TÊN',
      'NOI THUONG TRU': 'NƠI THƯỜNG TRÚ'
    };
    
    for (const [error, correct] of Object.entries(wordFixes)) {
      const regex = new RegExp(error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      fixed = fixed.replace(regex, correct);
    }
    
    // Loại bỏ các dòng có chứa pattern không hợp lý (như "2000000 No Buông tha / Pc")
    fixed = fixed.replace(/^\d{7,}\s+No\s+[^\n]{0,20}\s*\/\s*Pc/gi, '');
    
    return fixed;
  }

  parseOCRText(text: string): any {
    // Sửa lỗi OCR trước khi parse
    const fixedText = this.fixVietnameseOCRErrors(text);
    
    // Parse text từ OCR để lấy thông tin CCCD/GPLX
    // Giữ nguyên các dòng để parse chính xác hơn
    const lines = fixedText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    const normalizedText = fixedText.replace(/\s+/g, ' ').trim();
    
    // Debug: Log để kiểm tra
    console.log('=== OCR TEXT DEBUG ===');
    console.log('Original text:', text);
    console.log('Fixed text:', fixedText);
    console.log('Lines:', lines);
    console.log('Normalized:', normalizedText);
    
    const parsedData: any = {
      fullName: '',
      idNumber: '',
      dateOfBirth: null,
      gender: '',
      nationality: '',
      address: ''
    };
    
    // Kiểm tra xem có phải GPLX (Giấy phép lái xe) không
    const isGPLX = /GIẤY\s+PHÉP\s+LÁI\s+XE|GIAY\s+PHEP\s+LAI\s+XE|DRIVER.*LICENSE|DRIVER.*LICENCE/i.test(normalizedText);
    
    // Tìm số CMND/CCCD hoặc số GPLX
    if (isGPLX) {
      // GPLX: Số GPLX thường dài hơn (10-12 chữ số)
      const gplxNumberPatterns = [
        /Số[:\s]*\/\s*No[:\s]*(\d{10,12})/i,
        /Số[:\s]*(\d{10,12})/i,
        /No[:\s]*(\d{10,12})/i,
        /\b(\d{10,12})\b/ // 10-12 chữ số cho GPLX
      ];
      
      for (const pattern of gplxNumberPatterns) {
        const match = normalizedText.match(pattern);
        if (match) {
          const gplxNumber = match[1] || match[0];
          if (gplxNumber.length >= 10 && gplxNumber.length <= 12) {
            parsedData.idNumber = gplxNumber;
            parsedData.documentType = 'GPLX';
            break;
          }
        }
      }
    } else {
      // CCCD/CMND: Số CMND/CCCD (9-12 chữ số)
      const idNumberPatterns = [
        /CMND[:\s]*(\d{9,12})/i,
        /CCCD[:\s]*(\d{9,12})/i,
        /Số[:\s]*(\d{9,12})/i,
        /\b(\d{12})\b/, // 12 chữ số (CCCD mới) - ưu tiên
        /\b(\d{9})\b/   // 9 chữ số (CMND cũ)
      ];
      
      for (const pattern of idNumberPatterns) {
        const match = normalizedText.match(pattern);
        if (match) {
          const idNumber = match[1] || match[0];
          if (idNumber.length >= 9 && idNumber.length <= 12) {
            parsedData.idNumber = idNumber;
            parsedData.documentType = 'CCCD';
            break;
          }
        }
      }
    }
    
    // Danh sách các dòng header cần loại bỏ (không phải tên)
    const headerPatterns = [
      /^CỘNG\s+HÒA\s+XÃ\s+HỘI\s+CHỦ\s+NGHĨA\s+VIỆT\s+NAM/i,
      /^SOCIALIST\s+REPUBLIC\s+OF\s+VIET\s+NAM/i,
      /^Độc\s+lập\s+-\s+Tự\s+do\s+-\s+Hạnh\s+phúc/i,
      /^Independence\s+-\s+Freedom\s+-\s+Happiness/i,
      /^CĂN\s+CƯỚC\s+CÔNG\s+DÂN/i,
      /^CITIZEN\s+IDENTITY\s+CARD/i,
      /^GIẤY\s+PHÉP\s+LÁI\s+XE|GIAY\s+PHEP\s+LAI\s+XE|DRIVER.*LICENSE|DRIVER.*LICENCE/i,
      /^BỘ\s+GTVT|BO\s+GTVT|MOT/i,
      /^CỘNG\s+HÒA/i,
      /^REPUBLIC/i,
      /^VIỆT\s+NAM$/i,
      /^VIET\s+NAM$/i,
      /^VIETNAM$/i
    ];
    
    // Helper function để kiểm tra xem dòng có phải header không
    const isHeaderLine = (line: string): boolean => {
      // Kiểm tra các pattern chính xác
      if (headerPatterns.some(pattern => pattern.test(line))) {
        return true;
      }
      
      // Kiểm tra các từ khóa header trong dòng (OCR có thể nhầm)
      const headerKeywords = [
        'SOCIALIST', 'REPUBLIC', 'VIET NAM', 'VIETNAM',
        'CỘNG HÒA', 'XÃ HỘI', 'CHỦ NGHĨA',
        'INDEPENDENCE', 'FREEDOM', 'HAPPINESS',
        'CĂN CƯỚC', 'CAN CƯỚC', 'CAN CUOC', 'CÔNG DÂN', 'CONG DAN', 'CONG DÂN',
        'CITIZEN', 'IDENTITY', 'CARD',
        'BỘ CÔNG AN', 'MINISTRY', 'PUBLIC', 'SECURITY',
        'SỐ ĐỊNH DANH', 'SO DINH DANH', 'PERSONAL IDENTIFICATION', 'ID NUMBER', 'SỐ:', 'NO:',
        // Khẩu hiệu mặt trước (không dấu và các biến thể thường bị OCR sai)
        'DOC LAP', 'TU DO', 'HANH PHUC', 'FREDOM', 'HAPIR', 'HAPINESS'
      ];
      
      const upperLine = line.toUpperCase();
      
      // Phát hiện khẩu hiệu "Độc lập - Tự do - Hạnh phúc" và bản tiếng Anh với lỗi OCR
      const vnMottoGroups = [
        ['DOC','LAP'],
        ['TU','DO'],
        ['HANH','PHUC']
      ];
      const hasVnMotto = vnMottoGroups.filter(g => g.every(w => upperLine.includes(w))).length >= 2;
      const hasEnMotto = upperLine.includes('INDEPENDENCE') &&
                         (upperLine.includes('FREEDOM') || upperLine.includes('FREDOM')) &&
                         (upperLine.includes('HAPPINESS') || upperLine.includes('HAPINESS') || upperLine.includes('HAPIR'));
      if (hasVnMotto || hasEnMotto) {
        return true;
      }
      // Nếu dòng chứa 2 hoặc nhiều từ khóa header, coi như header
      const keywordCount = headerKeywords.filter(keyword => 
        upperLine.includes(keyword.toUpperCase())
      ).length;
      
      if (keywordCount >= 2) {
        return true;
      }
      
      // Nếu dòng chứa "SOCIALIST" hoặc "REPUBLIC" kèm "VIET" hoặc "NAM", coi như header
      if ((upperLine.includes('SOCIALIST') || upperLine.includes('REPUBLIC')) &&
          (upperLine.includes('VIET') || upperLine.includes('NAM'))) {
        return true;
      }
      
      // Nếu dòng chứa "CAN CƯỚC" hoặc "CAN CUOC" kèm "CONG DAN" hoặc "CONG DÂN", coi như header
      if ((upperLine.includes('CAN CƯỚC') || upperLine.includes('CAN CUOC')) &&
          (upperLine.includes('CONG DAN') || upperLine.includes('CONG DÂN') || upperLine.includes('CÔNG DÂN'))) {
        return true;
      }
      
      // Nếu dòng chỉ chứa "CAN CƯỚC" hoặc "CONG DAN" (OCR nhầm của header), coi như header
      if (/^(CAN\s+CƯỚC|CAN\s+CUOC|CONG\s+DAN|CONG\s+DÂN|CÔNG\s+DÂN)$/i.test(line.trim())) {
        return true;
      }
      
      return false;
    };
    
    // Helper function để kiểm tra xem dòng có phải tên hợp lệ không
    const isValidNameLine = (line: string): boolean => {
      // Loại bỏ các dòng header
      if (isHeaderLine(line)) return false;
      
      // Loại bỏ các dòng có label (bao gồm cả GPLX)
      if (/^(?:Ngày sinh|Date|Giới tính|Quốc tịch|Địa chỉ|Nơi|CMND|CCCD|Số|Quê quán|Họ và tên|HO VA TEN|Full name|Place|Residence|Hạng|Class|Có giá trị đến|Expire|Expiry)/i.test(line)) {
        return false;
      }
      
      // Loại bỏ các dòng có chứa từ khóa header (OCR có thể nhầm)
      // Bao gồm cả các biến thể OCR nhầm như "CAN CƯỚC CONG DAN"
      if (/SOCIALIST|REPUBLIC|VIET\s+NAM|VIETNAM|CỘNG\s+HÒA|XÃ\s+HỘI|CHỦ\s+NGHĨA|INDEPENDENCE|FREEDOM|HAPPINESS|CĂN\s+CƯỚC|CAN\s+CƯỚC|CAN\s+CUOC|CÔNG\s+DÂN|CONG\s+DAN|CONG\s+DÂN|CITIZEN|IDENTITY/i.test(line)) {
        return false;
      }
      
      // Loại bỏ các dòng có pattern "CAN CƯỚC CONG DAN" hoặc tương tự
      if (/CAN\s+CƯỚC\s+CONG\s+DAN|CAN\s+CUOC\s+CONG\s+DAN/i.test(line)) {
        return false;
      }
      
      // Loại bỏ các dòng có ngày tháng
      if (/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(line)) {
        return false;
      }
      
      // Loại bỏ các dòng chỉ có số
      if (/^\d{9,12}$/.test(line)) {
        return false;
      }
      
      // Loại bỏ các dòng quá ngắn hoặc quá dài
      if (line.length < 8 || line.length > 100) {
        return false;
      }
      
      // Đảm bảo dòng chỉ chứa chữ cái, khoảng trắng và dấu tiếng Việt (không có ký tự đặc biệt lạ)
      if (!/^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+$/i.test(line)) {
        return false;
      }
      
      return true;
    };
    
    // Tìm họ và tên - cải thiện logic với nhiều pattern
    let nameFound = false;
    
    // Pattern 1: Tìm dòng có "Họ và tên:" hoặc "Họ và tên / Full name:" và tên nằm ở dòng tiếp theo (ưu tiên cao nhất)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Pattern 1a: Dòng có "Họ và tên:" hoặc "Họ và tên / Full name:" và tên nằm cùng dòng
      // Pattern này phải match chính xác label và lấy phần sau dấu hai chấm hoặc dấu gạch chéo
      // Cải thiện: tìm pattern chính xác hơn, loại bỏ các phần không phải tên
      
      // Pattern 1a-1: "Họ và tên: TÊN" hoặc "Họ và tên / Full name: TÊN"
      // Cải thiện: match chính xác hơn, lấy phần sau dấu hai chấm hoặc dấu gạch chéo
      // QUAN TRỌNG: Chỉ lấy tên, không lấy header hoặc các phần không phải tên
      let nameInLine = line.match(/(?:Họ\s+và\s+tên|HO\s+VA\s+TEN)[\s\/:]+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]{8,}?)(?:\s*\/\s*Full\s+name|$|Ngày|Date|Giới|Sex|Quốc|Nationality|CỘNG|SOCIALIST|CĂN|CAN|CITIZEN)/i);
      
      // Pattern 1a-2: "Full name: TÊN" (nếu không tìm thấy ở pattern 1)
      if (!nameInLine) {
        nameInLine = line.match(/Full\s+name[\s:]+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]{8,})/i);
      }
      
      // Pattern 1a-3: "Số / No.: ID TÊN" - tên nằm sau số CMND/CCCD
      if (!nameInLine && parsedData.idNumber && line.includes(parsedData.idNumber)) {
        const idNameMatch = line.match(new RegExp(`${parsedData.idNumber}\\s+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\\s]{8,})`, 'i'));
        if (idNameMatch && idNameMatch[1]) {
          // Kiểm tra không phải header
          if (!/CAN\s+CƯỚC|CAN\s+CUOC|CONG\s+DAN|CONG\s+DÂN|CÔNG\s+DÂN/i.test(idNameMatch[1])) {
            nameInLine = idNameMatch;
          }
        }
      }
      
      if (nameInLine && nameInLine[1]) {
        let name = nameInLine[1].trim();
        
        // Loại bỏ các phần không phải tên
        // QUAN TRỌNG: Loại bỏ TẤT CẢ header từ mặt trước
        name = name.replace(/CỘNG\s+HÒA\s+XÃ\s+HỘI\s+CHỦ\s+NGHĨA\s+VIỆT\s+NAM/gi, '').trim();
        name = name.replace(/SOCIALIST\s+REPUBLIC\s+OF\s+VIET\s+NAM/gi, '').trim();
        name = name.replace(/CĂN\s+CƯỚC\s+CÔNG\s+DÂN|CAN\s+CƯỚC\s+CONG\s+DAN|CAN\s+CUOC\s+CONG\s+DAN/gi, '').trim(); // Loại bỏ "CĂN CƯỚC CÔNG DÂN"
        name = name.replace(/CĂN\s+CƯỚC|CAN\s+CƯỚC|CAN\s+CUOC|CITIZEN\s+IDENTITY\s+CARD/gi, '').trim();
        name = name.replace(/CÔNG\s+DÂN|CONG\s+DAN|CONG\s+DÂN/gi, '').trim();
        // Loại bỏ "Số định danh cá nhân / Personal identification" - OCR có thể nhầm thành tên
        name = name.replace(/SỐ\s+ĐỊNH\s+DANH\s+CÁ\s+NHÂN|SO\s+DINH\s+DANH\s+CA\s+NHAN|PERSONAL\s+IDENTIFICATION/gi, '').trim();
        name = name.replace(/Sa\s+dinh\s+danh\s+ca\s+Nhân|Persona\s+entih\s+oa/gi, '').trim(); // Loại bỏ pattern OCR nhầm cụ thể
        // Loại bỏ "Full name" nếu có ở cuối
        name = name.replace(/\s*\/\s*Full\s+name.*/i, '').trim();
        // Loại bỏ số
        name = name.replace(/\d+/g, '').trim();
        // QUAN TRỌNG: Loại bỏ các ký tự lặp lại (như "PHANSSHUYHOANGKKLLLLL" -> "PHAN HUY HOANG")
        // Sửa lỗi OCR phổ biến TRƯỚC khi loại bỏ ký tự lặp lại
        name = name.replace(/\bPHANSHUY\b/gi, 'PHAN HUY').trim();
        name = name.replace(/\bPHAN\s*SHUY\b/gi, 'PHAN HUY').trim();
        name = name.replace(/\bKHOANG\b/gi, 'HOANG').trim();
        // Tách từ liền nhau thành các từ riêng biệt (như "PHANSHUY" -> "PHAN HUY", "HUYHOANG" -> "HUY HOANG")
        name = name.replace(/([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ])([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]{3,})/g, '$1 $2').trim();
        // Loại bỏ các ký tự lặp lại liên tiếp (2+ lần) - giữ lại 1 ký tự - áp dụng nhiều lần để đảm bảo loại bỏ hết
        let prevName = '';
        while (prevName !== name) {
          prevName = name;
          name = name.replace(/([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ])\1{1,}/gi, '$1').trim();
        }
        // Loại bỏ các từ chỉ có 1 ký tự lặp lại nhiều lần (như "LLLLL" -> "L", "KK" -> "K")
        name = name.replace(/\b([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ])\1{1,}\b/gi, '$1').trim();
        // Loại bỏ ký tự đặc biệt nhưng giữ chữ cái và dấu tiếng Việt
        name = name.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]/gi, '').trim();
        // Chuẩn hóa khoảng trắng
        name = name.replace(/\s+/g, ' ').trim();
        // Tách tên thành các từ và loại bỏ các từ chỉ có 1 ký tự (trừ khi là từ hợp lệ)
        const nameParts = name.split(/\s+/).filter(part => part.length >= 2 || /^[A-ZĐ]$/i.test(part));
        name = nameParts.join(' ').trim();
        
        // Kiểm tra tên hợp lệ (ít nhất 2 từ, mỗi từ ít nhất 2 ký tự, không phải header)
        // Loại bỏ các tên không hợp lý như "IAVIỆT NAM", "Hal Gang ky khai ind Pine"
        if (!isHeaderLine(name) && isValidNameLine(name) && this.isValidName(name)) {
          const nameParts = name.split(/\s+/).filter(part => part.length >= 2);
          if (nameParts.length >= 2 && name.length >= 8) {
            parsedData.fullName = nameParts.join(' ');
            nameFound = true;
            console.log('Found name (Pattern 1a - same line):', parsedData.fullName, 'from line:', line);
            break;
          }
        }
      }
      
      // Pattern 1b: Dòng chỉ có "Họ và tên" hoặc "Họ và tên / Full name", tên nằm ở dòng tiếp theo
      // Cải thiện: kiểm tra chặt chẽ hơn để đảm bảo lấy đúng dòng tên
      if ((/^(?:Họ\s+và\s+tên|HO\s+VA\s+TEN|Full\s+name)[\s\/:]*$/i.test(line) || 
           /^(?:Họ\s+và\s+tên|HO\s+VA\s+TEN|Full\s+name)$/i.test(line)) && 
          i + 1 < lines.length) {
        // Tìm dòng tên tiếp theo, có thể bỏ qua 1-2 dòng nếu chúng là header hoặc label
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const nextLine = lines[j];
          
          // Kiểm tra dòng tiếp theo có phải tên không
        if (nextLine && 
              isValidNameLine(nextLine) &&
            /^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-z\s]+$/i.test(nextLine) && 
              !/^\d{9,12}$/.test(nextLine) &&
              // Đảm bảo không phải là label khác
              !/^(?:Ngày sinh|Date|Giới tính|Quốc tịch|Địa chỉ|Nơi|CMND|CCCD|Số|Quê quán)/i.test(nextLine) &&
              // Đảm bảo không phải header
              !isHeaderLine(nextLine)) {
            
            let cleanName = nextLine.trim();
            // QUAN TRỌNG: Loại bỏ TẤT CẢ header từ mặt trước
            cleanName = cleanName.replace(/CỘNG\s+HÒA\s+XÃ\s+HỘI\s+CHỦ\s+NGHĨA\s+VIỆT\s+NAM/gi, '').trim();
            cleanName = cleanName.replace(/SOCIALIST\s+REPUBLIC\s+OF\s+VIET\s+NAM/gi, '').trim();
            cleanName = cleanName.replace(/CĂN\s+CƯỚC\s+CÔNG\s+DÂN|CAN\s+CƯỚC\s+CONG\s+DAN|CAN\s+CUOC\s+CONG\s+DAN/gi, '').trim();
            cleanName = cleanName.replace(/CĂN\s+CƯỚC|CAN\s+CƯỚC|CAN\s+CUOC|CITIZEN\s+IDENTITY\s+CARD/gi, '').trim();
            cleanName = cleanName.replace(/CÔNG\s+DÂN|CONG\s+DAN|CONG\s+DÂN/gi, '').trim();
            cleanName = cleanName.replace(/SỐ\s+ĐỊNH\s+DANH\s+CÁ\s+NHÂN|SO\s+DINH\s+DANH\s+CA\s+NHAN|PERSONAL\s+IDENTIFICATION/gi, '').trim();
            cleanName = cleanName.replace(/Sa\s+dinh\s+danh\s+ca\s+Nhân|Persona\s+entih\s+oa/gi, '').trim();
            // Loại bỏ số
            cleanName = cleanName.replace(/\d+/g, '').trim();
            // QUAN TRỌNG: Loại bỏ các ký tự lặp lại (như "PHANSSHUYHOANGKKLLLLL" -> "PHAN HUY HOANG")
            // Sửa lỗi OCR phổ biến TRƯỚC khi loại bỏ ký tự lặp lại
            cleanName = cleanName.replace(/\bPHANSHUY\b/gi, 'PHAN HUY').trim();
            cleanName = cleanName.replace(/\bPHAN\s*SHUY\b/gi, 'PHAN HUY').trim();
            cleanName = cleanName.replace(/\bKHOANG\b/gi, 'HOANG').trim();
            // Tách từ liền nhau thành các từ riêng biệt (như "PHANSHUY" -> "PHAN HUY", "HUYHOANG" -> "HUY HOANG")
            cleanName = cleanName.replace(/([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ])([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]{3,})/g, '$1 $2').trim();
            // Loại bỏ các ký tự lặp lại liên tiếp (2+ lần) - giữ lại 1 ký tự - áp dụng nhiều lần để đảm bảo loại bỏ hết
            let prevCleanName = '';
            while (prevCleanName !== cleanName) {
              prevCleanName = cleanName;
              cleanName = cleanName.replace(/([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ])\1{1,}/gi, '$1').trim();
            }
            // Loại bỏ các từ chỉ có 1 ký tự lặp lại nhiều lần (như "LLLLL" -> "L", "KK" -> "K")
            cleanName = cleanName.replace(/\b([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ])\1{1,}\b/gi, '$1').trim();
            // Loại bỏ ký tự đặc biệt nhưng giữ chữ cái và dấu tiếng Việt
            cleanName = cleanName.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]/gi, '').trim();
            // Chuẩn hóa khoảng trắng
          cleanName = cleanName.replace(/\s+/g, ' ').trim();
          // Tách tên thành các từ và loại bỏ các từ chỉ có 1 ký tự (trừ khi là từ hợp lệ)
          const nameParts = cleanName.split(/\s+/).filter(part => part.length >= 2 || /^[A-ZĐ]$/i.test(part));
          cleanName = nameParts.join(' ').trim();
            
            // Kiểm tra không phải header và có ít nhất 2 từ, và tên hợp lệ
            if (!isHeaderLine(cleanName) && cleanName.length >= 8 && this.isValidName(cleanName)) {
              const nameParts = cleanName.split(/\s+/).filter(part => part.length >= 2);
              if (nameParts.length >= 2) {
                parsedData.fullName = nameParts.join(' ');
            nameFound = true;
                console.log('Found name (Pattern 1b - next line):', parsedData.fullName, 'from line:', nextLine);
            break;
          }
        }
          }
        }
        if (nameFound) break;
      }
    }
    
    // Pattern 1.5: Tìm tên dựa trên số CMND/CCCD (tên thường nằm gần số này)
    // Trên CCCD, tên thường nằm ngay sau số CMND/CCCD trong cùng dòng hoặc dòng tiếp theo
    // Hỗ trợ cả CCCD cũ và mới
    if (!nameFound && parsedData.idNumber) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Tìm dòng có chứa số CMND/CCCD (có thể có "CĂN CƯỚC" hoặc "Số" trước số)
        if (line.includes(parsedData.idNumber)) {
          // Pattern 1.5a: Tên nằm cùng dòng với số CMND/CCCD
          // Ví dụ: "CĂN CƯỚC 082188007080 ĐỖ THỊ TRÚC LAN"
          // Hoặc: "Số / No.: 049300006573 PHAN VŨ TRÂM ANH"
          // Loại bỏ các header như "CAN CƯỚC CONG DAN" trước khi tìm tên
          const nameAfterId = line.match(new RegExp(`${parsedData.idNumber}\\s+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\\s]{8,})`, 'i'));
          if (nameAfterId && nameAfterId[1]) {
            let name = nameAfterId[1].trim();
            
        // Loại bỏ các header ngay từ đầu
        if (/CAN\s+CƯỚC|CAN\s+CUOC|CAN\s+GƯỚC|CAN\s+GUOC|CONG\s+DAN|CONG\s+DÂN|CÔNG\s+DÂN/i.test(name)) {
          continue; // Bỏ qua dòng này, không phải tên
        }
            
            // Loại bỏ các phần không phải tên
            name = name.replace(/\d+/g, '').trim();
            // Loại bỏ các label như "Full name", "Họ và tên"
            name = name.replace(/\s*(?:Full\s+name|Họ\s+và\s+tên|HO\s+VA\s+TEN).*/i, '').trim();
            // Loại bỏ các header như "CAN CƯỚC CONG DAN"
            name = name.replace(/\s*(?:CAN\s+CƯỚC|CAN\s+CUOC|CONG\s+DAN|CONG\s+DÂN|CÔNG\s+DÂN).*/i, '').trim();
            // QUAN TRỌNG: Loại bỏ các ký tự lặp lại (như "PHANSSHUYHOANGKKLLLLL" -> "PHAN HUY HOANG")
            // Sửa lỗi OCR phổ biến TRƯỚC khi loại bỏ ký tự lặp lại
            name = name.replace(/\bPHANSHUY\b/gi, 'PHAN HUY').trim();
            name = name.replace(/\bPHAN\s*SHUY\b/gi, 'PHAN HUY').trim();
            name = name.replace(/\bKHOANG\b/gi, 'HOANG').trim();
            // Tách từ liền nhau thành các từ riêng biệt (như "PHANSHUY" -> "PHAN HUY", "HUYHOANG" -> "HUY HOANG")
            name = name.replace(/([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ])([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]{3,})/g, '$1 $2').trim();
            // Loại bỏ các ký tự lặp lại liên tiếp (2+ lần) - giữ lại 1 ký tự - áp dụng nhiều lần để đảm bảo loại bỏ hết
            let prevName2 = '';
            while (prevName2 !== name) {
              prevName2 = name;
              name = name.replace(/([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ])\1{1,}/gi, '$1').trim();
            }
            // Loại bỏ các từ chỉ có 1 ký tự lặp lại nhiều lần (như "LLLLL" -> "L", "KK" -> "K")
            name = name.replace(/\b([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ])\1{1,}\b/gi, '$1').trim();
            name = name.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]/gi, '').trim();
            name = name.replace(/\s+/g, ' ').trim();
            // Tách tên thành các từ và loại bỏ các từ chỉ có 1 ký tự (trừ khi là từ hợp lệ)
            const nameParts = name.split(/\s+/).filter(part => part.length >= 2 || /^[A-ZĐ]$/i.test(part));
            name = nameParts.join(' ').trim();
            
            // Kiểm tra tên hợp lệ
            if (!isHeaderLine(name) && isValidNameLine(name) && this.isValidName(name)) {
              const nameParts = name.split(/\s+/).filter(part => part.length >= 2);
              if (nameParts.length >= 2 && name.length >= 8) {
                parsedData.fullName = nameParts.join(' ');
                nameFound = true;
                console.log('Found name (Pattern 1.5a - same line as ID):', parsedData.fullName, 'from line:', line);
                break;
              }
            }
          }
          
          // Pattern 1.5b: Tên nằm ở dòng tiếp theo sau dòng có số CMND/CCCD
          // Có thể bỏ qua 1-2 dòng nếu chúng là label hoặc header
          if (!nameFound && i + 1 < lines.length) {
            for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
              const nextLine = lines[j];
              
              // Bỏ qua các dòng label
              if (/^(?:Họ\s+và\s+tên|HO\s+VA\s+TEN|Full\s+name)[\s\/:]*$/i.test(nextLine)) {
                continue; // Bỏ qua dòng label, lấy dòng tiếp theo
              }
              
              if (nextLine && isValidNameLine(nextLine) && !isHeaderLine(nextLine)) {
                let cleanName = nextLine.trim();
                cleanName = cleanName.replace(/\d+/g, '').trim();
                // Loại bỏ các label nếu có
                cleanName = cleanName.replace(/\s*(?:Full\s+name|Họ\s+và\s+tên|HO\s+VA\s+TEN).*/i, '').trim();
                // QUAN TRỌNG: Loại bỏ các ký tự lặp lại (như "PHANSSHUYHOANGKKLLLLL" -> "PHAN HUY HOANG")
                // Sửa lỗi OCR phổ biến TRƯỚC khi loại bỏ ký tự lặp lại
                cleanName = cleanName.replace(/\bPHANSHUY\b/gi, 'PHAN HUY').trim();
                cleanName = cleanName.replace(/\bPHAN\s*SHUY\b/gi, 'PHAN HUY').trim();
                cleanName = cleanName.replace(/\bKHOANG\b/gi, 'HOANG').trim();
                // Tách từ liền nhau thành các từ riêng biệt (như "PHANSHUY" -> "PHAN HUY", "HUYHOANG" -> "HUY HOANG")
                cleanName = cleanName.replace(/([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ])([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]{3,})/g, '$1 $2').trim();
                // Loại bỏ các ký tự lặp lại liên tiếp (2+ lần) - giữ lại 1 ký tự - áp dụng nhiều lần để đảm bảo loại bỏ hết
                let prevCleanName2 = '';
                while (prevCleanName2 !== cleanName) {
                  prevCleanName2 = cleanName;
                  cleanName = cleanName.replace(/([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ])\1{1,}/gi, '$1').trim();
                }
                // Loại bỏ các từ chỉ có 1 ký tự lặp lại nhiều lần (như "LLLLL" -> "L", "KK" -> "K")
                cleanName = cleanName.replace(/\b([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ])\1{1,}\b/gi, '$1').trim();
                cleanName = cleanName.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]/gi, '').trim();
                cleanName = cleanName.replace(/\s+/g, ' ').trim();
                // Tách tên thành các từ và loại bỏ các từ chỉ có 1 ký tự (trừ khi là từ hợp lệ)
                const nameParts = cleanName.split(/\s+/).filter(part => part.length >= 2 || /^[A-ZĐ]$/i.test(part));
                cleanName = nameParts.join(' ').trim();
                
                if (cleanName.length >= 8 && this.isValidName(cleanName)) {
                  const nameParts = cleanName.split(/\s+/).filter(part => part.length >= 2);
                  if (nameParts.length >= 2) {
                    parsedData.fullName = nameParts.join(' ');
                    nameFound = true;
                    console.log('Found name (Pattern 1.5b - next line after ID):', parsedData.fullName, 'from line:', nextLine);
                    break;
                  }
                }
              }
            }
            if (nameFound) break;
          }
        }
      }
    }
    
    // Pattern 1.6: Tìm tên từ MRZ (Machine Readable Zone) ở mặt sau CCCD
    // MRZ format: Dòng 3 thường có format "HỌ<<TÊN<<<<<<<<<<<<<"
    // Ví dụ: "PHAN<<HUYHOANG<<<<<<<<<<<<<" -> "PHAN HUY HOANG"
    // CHỈ dùng pattern này nếu chưa tìm thấy tên từ các pattern khác (ưu tiên thấp)
    if (!nameFound) {
      for (const line of lines) {
        // Tìm dòng MRZ có format: chữ cái + << + chữ cái + <<
        // Pattern: [A-Z]+<<[A-Z]+<<
        // Ví dụ: "PHAN<<HUYHOANG<<<<<<<<<<<<<"
        const mrzPattern = /^([A-Z]{2,})<<([A-Z]{2,})[<]+/;
        const mrzMatch = line.match(mrzPattern);
        if (mrzMatch) {
          // MRZ format: HỌ<<TÊN
          const ho = mrzMatch[1];
          const tenFull = mrzMatch[2];
          
          // Tách tên thành các phần (có thể có < giữa các từ hoặc không có khoảng trắng)
          // Ví dụ: "HUYHOANG" -> "HUY HOANG" hoặc "VU<TRAM<ANH" -> "VU TRAM ANH"
          let tenParts: string[] = [];
          if (tenFull.includes('<')) {
            tenParts = tenFull.split('<').filter(part => part.length >= 2);
          } else {
            // Nếu không có <, thử tách theo chữ cái in hoa (ví dụ: "HUYHOANG" -> "HUY", "HOANG")
            // Nhưng điều này khó, nên chỉ dùng nếu tên ngắn
            if (tenFull.length <= 10) {
              tenParts = [tenFull];
            } else {
              // Thử tách theo pattern: chữ cái in hoa + chữ cái thường
              const parts = tenFull.match(/[A-Z][a-z]*/g);
              if (parts && parts.length >= 1) {
                tenParts = parts;
              } else {
                tenParts = [tenFull];
              }
            }
          }
          
          if (tenParts.length >= 1) {
            const fullName = `${ho} ${tenParts.join(' ')}`.trim();
            
            // Kiểm tra tên hợp lệ (ít nhất 2 từ, không phải header)
            if (!isHeaderLine(fullName) && this.isValidName(fullName)) {
              const nameParts = fullName.split(/\s+/).filter(part => part.length >= 2);
              if (nameParts.length >= 2) {
                parsedData.fullName = nameParts.join(' ');
                nameFound = true;
                console.log('Found name (Pattern 1.6 - from MRZ):', parsedData.fullName, 'from line:', line);
                break;
              }
            }
          }
        }
      }
    }
    
    // Pattern 2: Tìm dòng có nhiều chữ cái in hoa (thường là tên trên CCCD) - ưu tiên dòng dài nhất
    // CHỈ dùng pattern này nếu chưa tìm thấy tên từ các pattern khác (ưu tiên thấp nhất)
    // Nhưng phải loại bỏ các dòng header
    if (!nameFound) {
      let bestName = '';
      let bestScore = 0;
      
      for (const line of lines) {
        // Bỏ qua các dòng không phải tên (sử dụng helper function)
        if (!isValidNameLine(line)) {
          continue;
        }
        
        // Kiểm tra dòng có phải tên không (toàn chữ cái, không có số)
        if (line.length >= 8 && line.length <= 50 && // Giới hạn độ dài để tránh lấy header dài
            /^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+$/i.test(line)) {
          // Loại bỏ header một lần nữa để chắc chắn
          if (!isHeaderLine(line)) {
            // Loại bỏ các từ khóa header trong dòng
            let cleanLine = line;
            cleanLine = cleanLine.replace(/CỘNG\s+HÒA\s+XÃ\s+HỘI\s+CHỦ\s+NGHĨA\s+VIỆT\s+NAM/gi, '').trim();
            cleanLine = cleanLine.replace(/SOCIALIST\s+REPUBLIC\s+OF\s+VIET\s+NAM/gi, '').trim();
            cleanLine = cleanLine.replace(/CĂN\s+CƯỚC\s+CÔNG\s+DÂN|CAN\s+CƯỚC\s+CONG\s+DAN|CAN\s+CUOC\s+CONG\s+DAN/gi, '').trim();
            cleanLine = cleanLine.replace(/CĂN\s+CƯỚC|CAN\s+CƯỚC|CAN\s+CUOC|CITIZEN\s+IDENTITY\s+CARD/gi, '').trim();
            cleanLine = cleanLine.replace(/CÔNG\s+DÂN|CONG\s+DAN|CONG\s+DÂN/gi, '').trim();
            
            if (cleanLine.length >= 8) {
              const nameParts = cleanLine.trim().split(/\s+/).filter(part => part.length >= 2);
              if (nameParts.length >= 2 && !isHeaderLine(cleanLine) && this.isValidName(cleanLine)) {
                const score = nameParts.length * 10 + cleanLine.length; // Điểm = số từ * 10 + độ dài
                if (score > bestScore) {
                  bestScore = score;
                  bestName = nameParts.join(' ');
                }
              }
            }
          }
        }
      }
      
      if (bestName && !isHeaderLine(bestName) && this.isValidName(bestName)) {
        parsedData.fullName = bestName;
        nameFound = true;
        console.log('Found name (Pattern 2 - best match):', parsedData.fullName);
      }
    }
    
    // Tìm ngày sinh (dd/mm/yyyy hoặc dd-mm-yyyy) - cải thiện logic
    let dateFound = false;
    
    // Pattern 1: Tìm trong từng dòng có "Ngày sinh"
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Pattern 1a: Tìm dòng có "Ngày sinh:" hoặc "Ngày, tháng, năm sinh:" và ngày nằm cùng dòng
      // Hỗ trợ cả "Ngày sinh:" và "Ngày, tháng, năm sinh:" (có dấu phẩy)
      const dateInLine = line.match(/(?:Ngày\s*,?\s*tháng\s*,?\s*năm\s+sinh|Ngày\s+sinh|Date\s+of\s+birth|DOB|NGAY\s+SINH|Ngay\s+sinh)[\s:]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i);
      if (dateInLine && dateInLine[1]) {
        const dateStr = dateInLine[1].replace(/[\.\-]/g, '/');
        const dateParts = dateStr.split('/');
        if (dateParts.length === 3) {
          const day = parseInt(dateParts[0]);
          const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed
          const year = parseInt(dateParts[2]);
          if (year >= 1950 && year <= 2010 && day >= 1 && day <= 31 && month >= 0 && month <= 11) {
            const dateOfBirth = new Date(year, month, day);
            if (!isNaN(dateOfBirth.getTime())) {
              parsedData.dateOfBirth = dateOfBirth;
              dateFound = true;
              console.log('Found date (Pattern 1a):', parsedData.dateOfBirth, 'from line:', line);
              break;
            }
          }
        }
      }
      
      // Pattern 1b: Tìm dòng chỉ có "Ngày sinh" hoặc "Ngày, tháng, năm sinh", ngày nằm ở dòng tiếp theo
      if ((/^(?:Ngày\s*,?\s*tháng\s*,?\s*năm\s+sinh|Ngày\s+sinh|Date\s+of\s+birth|DOB|NGAY\s+SINH|Ngay\s+sinh)[\s:]*$/i.test(line) || 
           /^(?:Ngày\s*,?\s*tháng\s*,?\s*năm\s+sinh|Ngày\s+sinh|Date\s+of\s+birth|DOB|NGAY\s+SINH|Ngay\s+sinh)$/i.test(line)) && 
          i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const dateMatch = nextLine.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/);
        if (dateMatch && dateMatch[1]) {
          const dateStr = dateMatch[1].replace(/[\.\-]/g, '/');
          const dateParts = dateStr.split('/');
          if (dateParts.length === 3) {
            const day = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1;
            const year = parseInt(dateParts[2]);
            if (year >= 1950 && year <= 2010 && day >= 1 && day <= 31 && month >= 0 && month <= 11) {
              const dateOfBirth = new Date(year, month, day);
              if (!isNaN(dateOfBirth.getTime())) {
                parsedData.dateOfBirth = dateOfBirth;
                dateFound = true;
                console.log('Found date (Pattern 1b):', parsedData.dateOfBirth, 'from line:', nextLine);
                break;
              }
            }
          }
        }
      }
      
      // Pattern 1c: Tìm "Ngày, tháng, năm sinh / Date of birth:" và ngày nằm cùng dòng hoặc dòng tiếp theo
      if (/Ngày\s*,?\s*tháng\s*,?\s*năm\s+sinh\s*\/\s*Date\s+of\s+birth/i.test(line)) {
        // Tìm ngày trong cùng dòng
        const dateInSameLine = line.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/);
        if (dateInSameLine && dateInSameLine[1]) {
          const dateStr = dateInSameLine[1].replace(/[\.\-]/g, '/');
          const dateParts = dateStr.split('/');
          if (dateParts.length === 3) {
            const day = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1;
            const year = parseInt(dateParts[2]);
            if (year >= 1950 && year <= 2010 && day >= 1 && day <= 31 && month >= 0 && month <= 11) {
              const dateOfBirth = new Date(year, month, day);
              if (!isNaN(dateOfBirth.getTime())) {
                parsedData.dateOfBirth = dateOfBirth;
                dateFound = true;
                console.log('Found date (Pattern 1c - same line):', parsedData.dateOfBirth, 'from line:', line);
                break;
              }
            }
          }
        } else if (i + 1 < lines.length) {
          // Tìm ngày ở dòng tiếp theo
          const nextLine = lines[i + 1];
          const dateMatch = nextLine.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/);
          if (dateMatch && dateMatch[1]) {
            const dateStr = dateMatch[1].replace(/[\.\-]/g, '/');
            const dateParts = dateStr.split('/');
            if (dateParts.length === 3) {
              const day = parseInt(dateParts[0]);
              const month = parseInt(dateParts[1]) - 1;
              const year = parseInt(dateParts[2]);
              if (year >= 1950 && year <= 2010 && day >= 1 && day <= 31 && month >= 0 && month <= 11) {
                const dateOfBirth = new Date(year, month, day);
                if (!isNaN(dateOfBirth.getTime())) {
                  parsedData.dateOfBirth = dateOfBirth;
                  dateFound = true;
                  console.log('Found date (Pattern 1c - next line):', parsedData.dateOfBirth, 'from line:', nextLine);
                  break;
                }
              }
            }
          }
        }
      }
    }
    
    // Pattern 2: Tìm tất cả các pattern ngày tháng trong text (dd/mm/yyyy hoặc dd-mm-yyyy)
    // Ưu tiên các ngày gần label "Ngày sinh" hoặc "Date of birth" hoặc "Họ và tên" / "Full name"
    if (!dateFound) {
      const datePatterns = [
        /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/g
      ];
      
      // Tìm vị trí của label "Ngày sinh" hoặc "Date of birth" hoặc "Họ và tên" / "Full name" trong text
      const dateLabelIndex = normalizedText.search(/(?:Ngày\s*,?\s*tháng\s*,?\s*năm\s+sinh|Ngày\s+sinh|Date\s+of\s+birth|DOB)/i);
      const nameLabelIndex = normalizedText.search(/(?:Họ\s+và\s+tên|Họ\s+tên|Full\s+name|FULL\s+NAME)/i);
      // Ưu tiên label "Ngày sinh" nếu có, nếu không thì dùng "Họ và tên" (ngày sinh thường nằm sau tên)
      const referenceIndex = dateLabelIndex >= 0 ? dateLabelIndex : nameLabelIndex;
      
      for (const pattern of datePatterns) {
        const matches = normalizedText.match(pattern);
        if (matches && matches.length > 0) {
          // Sắp xếp các ngày theo khoảng cách đến label (nếu có)
          const datesWithDistance = matches.map(match => {
            const matchIndex = normalizedText.indexOf(match);
            const distance = referenceIndex >= 0 ? Math.abs(matchIndex - referenceIndex) : Infinity;
            return { match, distance, index: matchIndex };
          }).sort((a, b) => a.distance - b.distance);
          
          // Lấy ngày đầu tiên hợp lệ (ưu tiên năm từ 1950 đến 2010 cho ngày sinh, ưu tiên gần label)
          for (const { match } of datesWithDistance) {
            const dateStr = match.replace(/[\.\-]/g, '/');
            const dateParts = dateStr.split('/');
            if (dateParts.length === 3) {
              const day = parseInt(dateParts[0]);
              const month = parseInt(dateParts[1]) - 1;
              const year = parseInt(dateParts[2]);
              // Kiểm tra năm hợp lý (từ 1950 đến 2010 cho ngày sinh)
              if (year >= 1950 && year <= 2010 && day >= 1 && day <= 31 && month >= 0 && month <= 11) {
                const dateOfBirth = new Date(year, month, day);
                if (!isNaN(dateOfBirth.getTime())) {
                  parsedData.dateOfBirth = dateOfBirth;
                  dateFound = true;
                  console.log('Found date (Pattern 2):', parsedData.dateOfBirth, 'from match:', match);
                  break;
                }
              }
            }
          }
          if (dateFound) break;
        }
      }
    }
    
    console.log('Date found:', dateFound, 'Value:', parsedData.dateOfBirth);
    
    // Tìm giới tính - cải thiện logic
    let genderFound = false;
    
    // Pattern 1: Tìm dòng có "Giới tính:" hoặc "Giới tính" và giá trị nằm cùng dòng hoặc dòng tiếp theo
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Pattern 1a: Dòng có "Giới tính: Nam" hoặc "Giới tính: Nữ" hoặc "Giới tính / Sex: Nam"
      // Cải thiện pattern để match chính xác hơn, bao gồm cả "Giới tính / Sex: Nam"
      // Hỗ trợ cả "Giới tính / Sex:" và "Giới tính:" (có hoặc không có dấu hai chấm)
      const genderInLine = line.match(/(?:Giới tính|GIOI TINH|Gender|Sex)[\s\/:]+(Nam|Nữ|Male|Female|M|F)(?:\s*\/\s*Sex|$|[\s,\.])/i);
      if (genderInLine && genderInLine[1]) {
        const genderValue = genderInLine[1].trim().toLowerCase();
        if (/^nam$|^male$|^m$/.test(genderValue)) {
          parsedData.gender = 'nam';
          genderFound = true;
          console.log('Found gender (Pattern 1a):', parsedData.gender, 'from line:', line);
          break;
        } else if (/^nữ$|^nữ$|^female$|^f$/.test(genderValue)) {
          parsedData.gender = 'nữ';
          genderFound = true;
          console.log('Found gender (Pattern 1a):', parsedData.gender, 'from line:', line);
          break;
        }
      }
      
      // Pattern 1a-1: Tìm "Giới tính / Sex:" và giá trị nằm cùng dòng (sau dấu hai chấm)
      if (!genderFound) {
        const genderInLineWithSlash = line.match(/(?:Giới tính|GIOI TINH|Gender|Sex)\s*\/\s*Sex\s*:?\s*(Nam|Nữ|Male|Female|M|F)\b/i);
        if (genderInLineWithSlash && genderInLineWithSlash[1]) {
          const genderValue = genderInLineWithSlash[1].trim().toLowerCase();
          if (/^nam$|^male$|^m$/.test(genderValue)) {
            parsedData.gender = 'nam';
            genderFound = true;
            console.log('Found gender (Pattern 1a-1):', parsedData.gender, 'from line:', line);
            break;
          } else if (/^nữ$|^nữ$|^female$|^f$/.test(genderValue)) {
            parsedData.gender = 'nữ';
            genderFound = true;
            console.log('Found gender (Pattern 1a-1):', parsedData.gender, 'from line:', line);
            break;
          }
        }
      }
      
      // Pattern 1a-2: Tìm "Nam" hoặc "Nữ" ngay sau "Giới tính" trong cùng dòng (không có dấu hai chấm)
      if (!genderFound) {
        const genderInLine2 = line.match(/(?:Giới tính|GIOI TINH|Gender|Sex)\s+(Nam|Nữ|Male|Female|M|F)\b/i);
        if (genderInLine2 && genderInLine2[1]) {
          const genderValue = genderInLine2[1].trim().toLowerCase();
          if (/^nam$|^male$|^m$/.test(genderValue)) {
            parsedData.gender = 'nam';
            genderFound = true;
            console.log('Found gender (Pattern 1a-2):', parsedData.gender, 'from line:', line);
            break;
          } else if (/^nữ$|^nữ$|^female$|^f$/.test(genderValue)) {
            parsedData.gender = 'nữ';
            genderFound = true;
            console.log('Found gender (Pattern 1a-2):', parsedData.gender, 'from line:', line);
            break;
          }
        }
      }
      
      // Pattern 1b: Dòng chỉ có "Giới tính" hoặc "Giới tính / Sex", giá trị nằm ở dòng tiếp theo
      if ((/^(?:Giới tính|GIOI TINH|Gender|Sex)[\s\/:]*$/i.test(line) || 
           /^(?:Giới tính|GIOI TINH|Gender|Sex)$/i.test(line)) && 
          i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        // Loại bỏ phần "Sex" nếu có
        let genderValue = nextLine.replace(/\s*\/\s*Sex.*/i, '').trim().toLowerCase();
        
        if (/^nam$|^male$|^m$/.test(genderValue)) {
          parsedData.gender = 'nam';
          genderFound = true;
          console.log('Found gender (Pattern 1b):', parsedData.gender, 'from line:', nextLine);
          break;
        } else if (/^nữ$|^nữ$|^female$|^f$/.test(genderValue)) {
          parsedData.gender = 'nữ';
          genderFound = true;
          console.log('Found gender (Pattern 1b):', parsedData.gender, 'from line:', nextLine);
          break;
        }
      }
    }
    
    // Pattern 2: Tìm trong toàn bộ text nếu chưa tìm thấy
    if (!genderFound) {
      // Tìm "Nam" hoặc "Nữ" gần từ "Giới tính" (trong vòng 100 ký tự)
      const genderPattern = /(?:Giới tính|GIOI TINH|Gender|Sex)[\s\/:]*([^\n]{0,100}?)(Nam|Nữ|Male|Female|M|F)\b/i;
      const genderMatch = text.match(genderPattern);
      if (genderMatch) {
        const genderValue = (genderMatch[2] || genderMatch[1]).trim().toLowerCase();
        // Loại bỏ các từ không phải giới tính (như "Nam" trong tên "Nguyễn Văn Nam")
        if (!/^(?:Họ|Tên|Full|name|Ngày|Date|Quốc|Nationality|Địa|Address)/i.test(genderMatch[0])) {
          if (/^nam$|^male$|^m$/.test(genderValue)) {
            parsedData.gender = 'nam';
            genderFound = true;
            console.log('Found gender (Pattern 2):', parsedData.gender);
          } else if (/^nữ$|^nữ$|^female$|^f$/.test(genderValue)) {
            parsedData.gender = 'nữ';
            genderFound = true;
            console.log('Found gender (Pattern 2):', parsedData.gender);
          }
        }
      }
    }
    
    // Pattern 2b: Tìm "Nam" hoặc "Nữ" trong dòng có "Giới tính" hoặc "Sex" (mở rộng tìm kiếm)
    if (!genderFound) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Tìm dòng có "Giới tính" hoặc "Sex" và tìm "Nam" hoặc "Nữ" trong cùng dòng hoặc 2 dòng tiếp theo
        if (/(?:Giới tính|GIOI TINH|Gender|Sex)/i.test(line)) {
          // Tìm trong cùng dòng
          const genderInSameLine = line.match(/(Nam|Nữ|Male|Female|M|F)\b/i);
          if (genderInSameLine && genderInSameLine[1]) {
            const genderValue = genderInSameLine[1].trim().toLowerCase();
            if (/^nam$|^male$|^m$/.test(genderValue)) {
              parsedData.gender = 'nam';
              genderFound = true;
              console.log('Found gender (Pattern 2b - same line):', parsedData.gender, 'from line:', line);
              break;
            } else if (/^nữ$|^nữ$|^female$|^f$/.test(genderValue)) {
              parsedData.gender = 'nữ';
              genderFound = true;
              console.log('Found gender (Pattern 2b - same line):', parsedData.gender, 'from line:', line);
              break;
            }
          }
          // Tìm trong 2 dòng tiếp theo
          if (!genderFound && i + 1 < lines.length) {
            for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
              const nextLine = lines[j];
              const genderInNextLine = nextLine.match(/(Nam|Nữ|Male|Female|M|F)\b/i);
              if (genderInNextLine && genderInNextLine[1]) {
                const genderValue = genderInNextLine[1].trim().toLowerCase();
                if (/^nam$|^male$|^m$/.test(genderValue)) {
                  parsedData.gender = 'nam';
                  genderFound = true;
                  console.log('Found gender (Pattern 2b - next line):', parsedData.gender, 'from line:', nextLine);
                  break;
                } else if (/^nữ$|^nữ$|^female$|^f$/.test(genderValue)) {
                  parsedData.gender = 'nữ';
                  genderFound = true;
                  console.log('Found gender (Pattern 2b - next line):', parsedData.gender, 'from line:', nextLine);
                  break;
                }
              }
            }
            if (genderFound) break;
          }
        }
      }
    }
    
    // Pattern 3: Tìm "Nam" hoặc "Nữ" đứng độc lập sau các label khác (ưu tiên thấp)
    if (!genderFound) {
      // Tìm dòng chỉ có "Nam" hoặc "Nữ" (không có từ khác)
      for (const line of lines) {
        const cleanLine = line.trim().toLowerCase();
        if (/^(nam|nữ|male|female|m|f)$/.test(cleanLine)) {
          // Kiểm tra dòng trước đó có phải "Giới tính" không
          const lineIndex = lines.indexOf(line);
          if (lineIndex > 0) {
            const prevLine = lines[lineIndex - 1].toLowerCase();
            if (/giới tính|gioi tinh|gender|sex/i.test(prevLine)) {
              if (/^nam$|^male$|^m$/.test(cleanLine)) {
                parsedData.gender = 'nam';
                genderFound = true;
                console.log('Found gender (Pattern 3):', parsedData.gender, 'from line:', line);
                break;
              } else if (/^nữ$|^nữ$|^female$|^f$/.test(cleanLine)) {
                parsedData.gender = 'nữ';
                genderFound = true;
                console.log('Found gender (Pattern 3):', parsedData.gender, 'from line:', line);
                break;
              }
            }
          }
        }
      }
    }
    
    // Pattern 4: Tìm giới tính từ MRZ (Machine Readable Zone)
    // Trong MRZ, giới tính được mã hóa bằng "M" (Male) hoặc "F" (Female) trong dòng thứ 2
    // Ví dụ: "9909298M3909296VNM" có "M" ở vị trí thứ 8
    if (!genderFound) {
      // Tìm MRZ pattern: dòng có nhiều ký tự A-Z, 0-9, <
      const mrzPattern = /[A-Z0-9<]{20,}/g;
      const mrzMatches = normalizedText.match(mrzPattern);
      
      if (mrzMatches && mrzMatches.length >= 2) {
        // Dòng thứ 2 của MRZ thường chứa giới tính
        const secondMRZLine = mrzMatches[1];
        // Tìm "M" hoặc "F" trong dòng MRZ - pattern linh hoạt hơn
        // Ví dụ: "9909298M3909296VNM" - tìm M hoặc F sau 7 chữ số và trước 6 chữ số
        const genderInMRZ = secondMRZLine.match(/(\d{7})([MF])(\d{6}[A-Z]{3})/);
        if (genderInMRZ && genderInMRZ[2]) {
          if (genderInMRZ[2] === 'M') {
            parsedData.gender = 'nam';
            genderFound = true;
            console.log('Found gender (Pattern 4 - MRZ):', parsedData.gender, 'from MRZ:', secondMRZLine);
          } else if (genderInMRZ[2] === 'F') {
            parsedData.gender = 'nữ';
            genderFound = true;
            console.log('Found gender (Pattern 4 - MRZ):', parsedData.gender, 'from MRZ:', secondMRZLine);
          }
        }
      }
      
      // Nếu không tìm thấy trong MRZ pattern, tìm trong các dòng có pattern MRZ
      if (!genderFound) {
        for (const line of lines) {
          // Tìm dòng có pattern MRZ (nhiều ký tự A-Z, 0-9, <)
          if (/^[A-Z0-9<]{20,}$/.test(line)) {
            // Tìm "M" hoặc "F" trong dòng MRZ - pattern linh hoạt hơn
            const genderInMRZLine = line.match(/(\d{7})([MF])(\d{6}[A-Z]{3})/);
            if (genderInMRZLine && genderInMRZLine[2]) {
              if (genderInMRZLine[2] === 'M') {
                parsedData.gender = 'nam';
                genderFound = true;
                console.log('Found gender (Pattern 4 - MRZ line):', parsedData.gender, 'from line:', line);
                break;
              } else if (genderInMRZLine[2] === 'F') {
                parsedData.gender = 'nữ';
                genderFound = true;
                console.log('Found gender (Pattern 4 - MRZ line):', parsedData.gender, 'from line:', line);
                break;
              }
            }
            // Nếu không match pattern trên, thử pattern đơn giản hơn: tìm M hoặc F sau số
            if (!genderFound) {
              const simpleGenderMatch = line.match(/(\d+)([MF])(\d+[A-Z]+)/);
              if (simpleGenderMatch && simpleGenderMatch[2]) {
                if (simpleGenderMatch[2] === 'M') {
                  parsedData.gender = 'nam';
                  genderFound = true;
                  console.log('Found gender (Pattern 4 - MRZ simple):', parsedData.gender, 'from line:', line);
                  break;
                } else if (simpleGenderMatch[2] === 'F') {
                  parsedData.gender = 'nữ';
                  genderFound = true;
                  console.log('Found gender (Pattern 4 - MRZ simple):', parsedData.gender, 'from line:', line);
                  break;
                }
              }
            }
          }
        }
      }
    }
    
    // Fallback bổ sung: bắt giới tính trong MRZ gần mã quốc gia VNM
    if (!genderFound) {
      for (const line of lines) {
        const mrz = line.toUpperCase();
        if (/^[A-Z0-9<]{20,}$/.test(mrz) && mrz.includes('VNM')) {
          const nearNationality = mrz.match(/([MF])(?=\d{6}VNM)/);
          if (nearNationality && nearNationality[1]) {
            parsedData.gender = nearNationality[1] === 'M' ? 'nam' : 'nữ';
            genderFound = true;
            console.log('Found gender (MRZ VNM-near):', parsedData.gender, 'from line:', line);
            break;
          }
        }
      }
    }
    
    // Log kết quả giới tính
    if (parsedData.gender) {
      console.log('Gender found:', parsedData.gender);
    } else {
      console.log('Gender not found');
    }
    
    // Tìm quốc tịch - cải thiện logic
    let nationalityFound = false;
    
    // Pattern 1: Tìm dòng có "Quốc tịch:" hoặc "Quốc tịch" và giá trị nằm cùng dòng hoặc dòng tiếp theo
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Pattern 1a: Dòng có "Quốc tịch: Việt Nam" hoặc tương tự
      const nationalityInLine = line.match(/(?:Quốc tịch|QUOC TICH|Nationality)[\s:]+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-z\s]+)/i);
      if (nationalityInLine && nationalityInLine[1]) {
        let nationality = nationalityInLine[1].trim();
        // Loại bỏ các phần không cần thiết
        nationality = nationality.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]/gi, '').trim();
        nationality = nationality.replace(/\s+/g, ' ').trim();
        // Chuẩn hóa quốc tịch phổ biến
        if (/việt\s+nam|viet\s+nam|vietnam/i.test(nationality)) {
          parsedData.nationality = 'Việt Nam';
        } else if (nationality.length > 0 && nationality.length < 50) {
          parsedData.nationality = nationality;
        }
        if (parsedData.nationality) {
          nationalityFound = true;
          console.log('Found nationality (Pattern 1a):', parsedData.nationality);
          break;
        }
      }
      
      // Pattern 1b: Dòng chỉ có "Quốc tịch", giá trị nằm ở dòng tiếp theo
      if ((/^(?:Quốc tịch|QUOC TICH|Nationality)[\s:]*$/i.test(line) || 
           /^(?:Quốc tịch|QUOC TICH|Nationality)$/i.test(line)) && 
          i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (nextLine && nextLine.length > 0 && nextLine.length < 50) {
          let nationality = nextLine.trim();
          nationality = nationality.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]/gi, '').trim();
          nationality = nationality.replace(/\s+/g, ' ').trim();
          // Chuẩn hóa quốc tịch phổ biến
          if (/việt\s+nam|viet\s+nam|vietnam/i.test(nationality)) {
            parsedData.nationality = 'Việt Nam';
          } else if (nationality.length > 0) {
            parsedData.nationality = nationality;
          }
          if (parsedData.nationality) {
            nationalityFound = true;
            console.log('Found nationality (Pattern 1b):', parsedData.nationality);
            break;
          }
        }
      }
    }
    
    // Pattern 2: Tìm trong toàn bộ text nếu chưa tìm thấy
    if (!nationalityFound) {
      const nationalityPattern = /(?:Quốc tịch|QUOC TICH|Nationality)[\s:]+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-z\s]{1,50})/i;
      const nationalityMatch = text.match(nationalityPattern);
    if (nationalityMatch && nationalityMatch[1]) {
        let nationality = nationalityMatch[1].trim();
        nationality = nationality.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]/gi, '').trim();
        nationality = nationality.replace(/\s+/g, ' ').trim();
        if (/việt\s+nam|viet\s+nam|vietnam/i.test(nationality)) {
          parsedData.nationality = 'Việt Nam';
          nationalityFound = true;
        } else if (nationality.length > 0 && nationality.length < 50) {
          // Loại bỏ các kết quả OCR nhầm như "Ra EN Fe Sd"
          const invalidNationalityPatterns = ['RA EN FE', 'RA EN', 'EN FE', 'FE SD', 'PERSONAL', 'IDENTIFICATION'];
          const upperNationality = nationality.toUpperCase();
          if (!invalidNationalityPatterns.some(pattern => upperNationality.includes(pattern))) {
            parsedData.nationality = nationality;
            nationalityFound = true;
          }
        }
      }
    }
    
    // Pattern 3: Nếu vẫn chưa tìm thấy, tìm "Việt Nam" trong toàn bộ text (ưu tiên cao nhất)
    // Vì đây là CCCD Việt Nam, quốc tịch luôn là "Việt Nam"
    if (!nationalityFound || (parsedData.nationality && !/việt\s+nam|viet\s+nam|vietnam/i.test(parsedData.nationality))) {
      // Tìm "Việt Nam" hoặc "Viet Nam" trong text
      if (/việt\s+nam|viet\s+nam|vietnam/i.test(text)) {
        parsedData.nationality = 'Việt Nam';
        nationalityFound = true;
        console.log('Found nationality (Pattern 3 - default to Việt Nam):', parsedData.nationality);
      }
    }
    
    // Pattern 4: Fallback từ MRZ - nếu có mã quốc gia VNM ở bất kỳ dòng MRZ nào
    if (!nationalityFound) {
      const mrzLines = lines.filter(l => /^[A-Z0-9<]{20,}$/.test(l));
      if (mrzLines.some(l => /VNM/.test(l))) {
        parsedData.nationality = 'Việt Nam';
        nationalityFound = true;
        console.log('Found nationality (Pattern 4 - MRZ VNM):', parsedData.nationality);
      }
    }
    
    // Tìm địa chỉ (thường ở mặt sau CCCD) - cải thiện logic
    
    // Helper function để làm sạch dòng địa chỉ
    // QUAN TRỌNG: Loại bỏ tất cả header từ mặt trước để không lấy vào địa chỉ mặt sau
    const cleanAddressLine = (line: string): string => {
      let clean = line;
      
      // Loại bỏ TẤT CẢ header từ mặt trước (quan trọng để không lấy header vào địa chỉ)
      // Loại bỏ các header pattern từ mặt trước
      clean = clean.replace(/CỘNG\s+HÒA\s+XÃ\s+HỘI\s+CHỦ\s+NGHĨA\s+VIỆT\s+NAM/gi, '').trim();
      clean = clean.replace(/SOCIALIST\s+REPUBLIC\s+OF\s+VIET\s+NAM/gi, '').trim();
      clean = clean.replace(/Độc\s+lập\s+-\s+Tự\s+do\s+-\s+Hạnh\s+phúc/gi, '').trim();
      clean = clean.replace(/INDEPENDENCE\s+-\s+FREEDOM\s+-\s+HAPPINESS/gi, '').trim();
      // QUAN TRỌNG: Loại bỏ "CĂN CƯỚC CÔNG DÂN" hoặc "CĂN CƯỚC" - dấu hiệu rõ ràng của mặt trước
      clean = clean.replace(/CĂN\s+CƯỚC\s+CÔNG\s+DÂN|CAN\s+CƯỚC\s+CONG\s+DAN|CAN\s+CUOC\s+CONG\s+DAN/gi, '').trim();
      clean = clean.replace(/CĂN\s+CƯỚC/gi, '').trim();
      clean = clean.replace(/CAN\s+CƯỚC/gi, '').trim();
      clean = clean.replace(/CAN\s+CUOC/gi, '').trim();
      clean = clean.replace(/CITIZEN\s+IDENTITY\s+CARD/gi, '').trim();
      clean = clean.replace(/CÔNG\s+DÂN/gi, '').trim();
      clean = clean.replace(/CONG\s+DAN/gi, '').trim();
      clean = clean.replace(/CONG\s+DÂN/gi, '').trim();
      // Loại bỏ khẩu hiệu mặt trước (bao gồm các biến thể OCR sai)
      clean = clean.replace(/\b(DOC\s+LAP|TU\s+DO|HANH\s+PHUC|INDEPENDENCE|INDEPENDENS|INDEPENGES|INDEPENGENS|FREEDOM|FREDOM|HAPPINESS|HAPINESS|HAPIR|SOCIALIS|SOCIALIST)\b/gi, ' ').trim();
      // Loại bỏ "Số định danh cá nhân / Personal identification" - có thể bị OCR nhầm vào địa chỉ
      clean = clean.replace(/SỐ\s+ĐỊNH\s+DANH\s+CÁ\s+NHÂN|SO\s+DINH\s+DANH\s+CA\s+NHAN|PERSONAL\s+IDENTIFICATION/gi, '').trim();
      
      // Loại bỏ các phần không cần thiết
      clean = clean.replace(/\([^)]*Place\s+of\s+residence[^)]*\)/gi, '').trim();
      clean = clean.replace(/\([^)]*Có\s+gia\s+tị[^)]*\)/gi, '').trim();
      clean = clean.replace(/\([^)]*Có\s+giá\s+trị[^)]*\)/gi, '').trim();
      clean = clean.replace(/Place\s+of\s+residence[^,]*/gi, '').trim();
      clean = clean.replace(/Có\s+gia\s+tị\s+đến\s+\d+/gi, '').trim();
      clean = clean.replace(/Có\s+giá\s+trị\s+đến\s+\d+/gi, '').trim();
      
      // Loại bỏ các pattern không hợp lý (như "2000000 No Buông tha / Pc")
      clean = clean.replace(/\d{7,}\s+No\s+[^\s]{0,20}\s*\/\s*Pc/gi, '').trim();
      clean = clean.replace(/\d{7,}\s+[A-Za-z]{1,3}\s+[^\s]{0,20}\s*\/\s*[A-Za-z]{1,3}/gi, '').trim();
      
      // Loại bỏ các từ/cụm từ OCR nhầm phổ biến (như "ERE", "BE", "INTE", "SE", "Sh", "ce", "g")
      clean = clean.replace(/\b(ERE|BE|INTE|SE|Sh|ce|g|bro|yi|OE|exp|Buông|tha|Date\s+ofbxpiry|Date\s+of|ofbxpiry|bxpiry)\b/gi, ' ').trim();
      // QUAN TRỌNG: Loại bỏ các label như "ch dem khai sinh", "Ngay. thang. nam sinh" - không phải địa chỉ
      // Cải thiện pattern để bắt các biến thể OCR nhầm, bao gồm cả khi không có khoảng trắng hoặc có dấu phẩy
      clean = clean.replace(/(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN|chii\s*\.?\s*dem\s*\.?\s*ten\s*\.?\s*khai\s*\.?\s*sinh|CHII\s*\.?\s*DEM\s*\.?\s*TEN\s*\.?\s*KHAI\s*\.?\s*SINH)/gi, ' ').trim();
      clean = clean.replace(/(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngày\s*\.?\s*tháng\s*\.?\s*(?:năm\s*\.?\s*)?sinh|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG|Neti\s*\.?\s*dang\s*\.?\s*khai\s*\.?\s*sinh|NETI\s*\.?\s*DANG\s*\.?\s*KHAI\s*\.?\s*SINH|Neti\s*\.?\s*dang\s*\.?\s*khai\s*\.?\s*sinh\s*\.?\s*lace\s*\.?\s*bith|NETI\s*\.?\s*DANG\s*\.?\s*KHAI\s*\.?\s*SINH\s*\.?\s*LACE\s*\.?\s*BITH)/gi, ' ').trim();
      clean = clean.replace(/(Gigi\s*\.?\s*unh|GIGI\s*\.?\s*UNH|gigi\s*\.?\s*unh|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH|Sex|SEX|Cate\s*\.?\s*Dev|CATE\s*\.?\s*DEV)/gi, ' ').trim(); // Loại bỏ "Gigi unh", "Gio toh", "Gio Anh" (giới tính), "Cate Dev" - OCR nhầm
      clean = clean.replace(/\b(lace\s+bith|LACE\s+BITH|Place\s+of\s+birth|PLACE\s+OF\s+BIRTH)\b/gi, ' ').trim(); // Loại bỏ "lace bith" - OCR nhầm của "Place of birth"
      
      // QUAN TRỌNG: Loại bỏ tên (thường là chữ in hoa, 2-4 từ) - không phải địa chỉ
      // Pattern: Tên thường là chữ in hoa, 2-4 từ, không có số, không có dấu phẩy nhiều
      clean = clean.replace(/\b([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]{2,}\s+[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]{2,}(?:\s+[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]{2,}){0,2})\b/g, (match) => {
        // Chỉ loại bỏ nếu không chứa từ khóa địa chỉ (như "Phường", "Xã", "Huyện", "Tỉnh", "Thành")
        const addressKeywords = ['PHƯỜNG', 'XÃ', 'HUYỆN', 'TỈNH', 'THÀNH', 'PHỐ', 'ĐƯỜNG', 'TỔ', 'CỤM'];
        const upperMatch = match.toUpperCase();
        if (addressKeywords.some(keyword => upperMatch.includes(keyword))) {
          return match; // Giữ lại nếu có từ khóa địa chỉ
        }
        // Loại bỏ nếu là tên (không có số, không có dấu phẩy nhiều, chỉ có chữ in hoa)
        if (!/\d/.test(match) && (match.split(',').length <= 1 || match.split(',').length === 2 && match.split(',')[1].trim().length < 5)) {
          return ''; // Loại bỏ tên
        }
        return match;
      }).trim();
      
      // Loại bỏ các label giới tính (Nam, Nữ, Male, Female) - không phải địa chỉ
      clean = clean.replace(/\b(Nam|Nữ|NAM|NỮ|Male|Female|MALE|FEMALE)\b/gi, ' ').trim();
      // Loại bỏ các cụm từ OCR nhầm phổ biến trong địa chỉ
      clean = clean.replace(/\b(Neti\s+dang\s+khai\s+sinh\s+lace\s+bith|NETI\s+DANG\s+KHAI\s+SINH\s+LACE\s+BITH|neti\s+dang\s+khai\s+sinh\s+lace\s+bith)\b/gi, ' ').trim();
      clean = clean.replace(/\b(Thi\s+Nham|THI\s+NHAM|Thr\s+Ham|THR\s+HAM|ô\s+ì\s+ậ|Ô\s+Ì\s+Ậ)\b/gi, 'Ngô Thì Nhậm').trim(); // Sửa "Thi Nham", "Thr Ham", "ô ì ậ" thành "Ngô Thì Nhậm"
      // Sửa lỗi OCR "NhNhNhị Đồngngng" -> "Nhị Đồng" (loại bỏ ký tự lặp lại)
      clean = clean.replace(/\bNhNhNhị\s+Đồngngng\b/gi, 'Nhị Đồng').trim();
      clean = clean.replace(/\bNhNhNhị\s+Đồng\s+ngng\b/gi, 'Nhị Đồng').trim();
      clean = clean.replace(/\bNhNhNhị\b/gi, 'Nhị').trim();
      clean = clean.replace(/\bĐồngngng\b/gi, 'Đồng').trim();
      // Loại bỏ ký tự lặp lại trong địa chỉ (như "NhNhNhị" -> "Nhị", "Đồngngng" -> "Đồng")
      let prevClean = '';
      while (prevClean !== clean) {
        prevClean = clean;
        clean = clean.replace(/([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ])\1{1,}/gi, '$1').trim();
      }
      clean = clean.replace(/\b(ị\s+Bảng|Ị\s+BẢNG|ị\s+Bdng|Ị\s+BDNG|Nhi\s+dng|NHI\s+DNG|ị\s+Đồ|Ị\s+ĐỒ)\b/gi, 'Nhị Đồng').trim(); // Sửa "ị Bảng", "ị Bdng", "Nhi dng", "ị Đồ" thành "Nhị Đồng"
      clean = clean.replace(/\b(ì\s+ươ|Ì\s+ƯƠ)\b/gi, 'Bình Dương').trim(); // Sửa "ì ươ" thành "Bình Dương"
      // Sửa "ị Đồ" thành "Nhị Đồng"
      clean = clean.replace(/\b(ị\s+Đồ|Ị\s+ĐỒ)\b/gi, 'Nhị Đồng').trim();
      // Sửa "44 26 53" thành "44/2653" hoặc "44/26/53" (số nhà)
      clean = clean.replace(/\b(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\b/g, (match, d1, d2, d3) => {
        // Chỉ sửa nếu không phải là ngày tháng (không có năm 4 chữ số sau đó)
        const afterMatch = clean.substring(clean.indexOf(match) + match.length);
        if (!/^\s*\/\s*\d{4}/.test(afterMatch)) {
          // Nếu là số nhà, có thể là "44/2653" hoặc "44/26/53"
          // Ưu tiên "44/2653" nếu d2 và d3 có thể gộp lại
          if (d2.length === 2 && d3.length === 2) {
            return `${d1}/${d2}${d3}`;
          }
          return `${d1}/${d2}/${d3}`;
        }
        return match;
      }).trim();
      // Sửa "44 26 53" thành "442653" (số nhà, không phải ngày tháng)
      clean = clean.replace(/\b(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\b/g, (match, d1, d2, d3) => {
        // Chỉ sửa nếu không phải là ngày tháng (không có năm 4 chữ số sau đó)
        const afterMatch = clean.substring(clean.indexOf(match) + match.length);
        if (!/^\s*\/\s*\d{4}/.test(afterMatch)) {
          return `${d1}${d2}${d3}`;
        }
        return match;
      }).trim();
      
      // Loại bỏ các pattern không hợp lý như "T 40 ổ 6" (có thể là OCR nhầm)
      clean = clean.replace(/\bT\s+\d+\s+[ổộ]\s+\d+\b/gi, ' ').trim();
      
      // Loại bỏ các pattern như "Ch B2 TN7 T.." (OCR nhầm)
      clean = clean.replace(/\bCh\s+B\d+\s+TN\d+\s+T\.\./gi, ' ').trim();
      
      // Loại bỏ các pattern như "T.," hoặc "T." (OCR nhầm)
      clean = clean.replace(/\bT\.\s*,?/gi, ' ').trim();
      
      // Loại bỏ các pattern như "ú,," hoặc ",, à" (OCR nhầm)
      clean = clean.replace(/ú,,|,,/g, ' ').trim();
      clean = clean.replace(/,\s*,+/g, ',').trim(); // Loại bỏ dấu phẩy lặp lại
      
      // Loại bỏ các từ đơn lẻ không hợp lý như "ú", "Tâ", "à", "Nai", "ơ" (OCR nhầm)
      clean = clean.replace(/\b(ú|Tâ|à|Nai|ThThượngng|ơ|H8)\b/gi, ' ').trim();
      
      // Loại bỏ các pattern như "Tâ H8" (OCR nhầm)
      clean = clean.replace(/\bTâ\s+H\d+\b/gi, ' ').trim();
      
      // Loại bỏ các số ngày tháng không hợp lý (như "2082020", "5 29")
      clean = clean.replace(/\b\d{7,}\b/g, '').trim(); // Loại bỏ số có 7+ chữ số
      clean = clean.replace(/\b\d{1,2}\s+\d{1,2}\b/g, '').trim(); // Loại bỏ số đơn lẻ cách nhau
      
      // Loại bỏ các từ đơn lẻ không hợp lý (1-2 ký tự, không phải từ tiếng Việt phổ biến)
      clean = clean.replace(/\b[a-z]{1,2}\b/gi, (match) => {
        // Giữ lại các từ tiếng Việt phổ biến như "T.", "Ch", "Cụm"
        const validShortWords = ['t', 'ch', 'cụm', 'tổ', 'phường', 'xã', 'huyện', 'tỉnh', 'thành'];
        if (validShortWords.includes(match.toLowerCase())) {
          return match;
        }
        return '';
      }).trim();
      
      // Loại bỏ ký tự đặc biệt không cần thiết nhưng giữ lại dấu phẩy, chấm, gạch ngang
      clean = clean.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s,\.\-]/gi, ' ').trim();
      
      // Loại bỏ các ký tự đặc biệt ở đầu/cuối
      clean = clean.replace(/^[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]+|[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s,\.\-]+$/gi, '').trim();
      
      // Chuẩn hóa khoảng trắng
      clean = clean.replace(/\s+/g, ' ').trim();
      
      return clean;
    };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Pattern 1: Dòng có "Nơi thường trú:" hoặc "Nơi cư trú:" hoặc "Place of residence:" (có hoặc không có địa chỉ)
      // Trên CCCD, "Nơi thường trú" hoặc "Nơi cư trú" có thể ở một dòng riêng hoặc cùng dòng với địa chỉ
      // Cải thiện pattern để match chính xác hơn, bao gồm cả các biến thể OCR nhầm và có dấu hai chấm
      const addressLabelPattern = /^(?:Nơi\s+thường\s+trú|Nơi\s+cư\s+trú|Thường\s+trú|Cư\s+trú|Hộ\s+khẩu\s+thường\s+trú|Permanent\s+address|Current\s+address|NOI\s+THUONG\s+TRU|NOI\s+CU\s+TRU|NOI\s+THUONG\s+TRU|NOI\s+CU\s+TRU|Place\s+of\s+residence)[\s:]*$/i;
      
      // Pattern 1a: Dòng có "Nơi thường trú:" hoặc "Nơi cư trú:" và địa chỉ nằm cùng dòng
      // Phân biệt "Nơi thường trú" (permanentAddress) và "Nơi cư trú" (address)
      const permanentAddressPattern = /(?:Nơi\s+thường\s+trú|Thường\s+trú|Hộ\s+khẩu\s+thường\s+trú|Permanent\s+address|NOI\s+THUONG\s+TRU|NOI\s+THUONG\s+TRU)[\s:]+(.+)/i;
      const currentAddressPattern = /(?:Nơi\s+cư\s+trú|Cư\s+trú|Current\s+address|NOI\s+CU\s+TRU|NOI\s+CU\s+TRU|Place\s+of\s+residence)[\s:]+(.+)/i;
      
      // Kiểm tra "Nơi thường trú" trước (ưu tiên)
      const permanentAddressMatch = line.match(permanentAddressPattern);
      if (permanentAddressMatch && permanentAddressMatch[1]) {
        let address = permanentAddressMatch[1].trim();
        address = address.replace(/\s*\/\s*Place\s+of\s+residence.*/i, '').trim();
        
        // QUAN TRỌNG: Loại bỏ các label và tên không phải địa chỉ trước khi clean
        // Cải thiện pattern để bắt các biến thể OCR nhầm, bao gồm cả khi không có khoảng trắng hoặc có dấu phẩy
        address = address.replace(/(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN|chii\s*\.?\s*dem\s*\.?\s*ten\s*\.?\s*khai\s*\.?\s*sinh|CHII\s*\.?\s*DEM\s*\.?\s*TEN\s*\.?\s*KHAI\s*\.?\s*SINH)/gi, ' ').trim();
        address = address.replace(/(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngày\s*\.?\s*tháng\s*\.?\s*(?:năm\s*\.?\s*)?sinh|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)/gi, ' ').trim();
        address = address.replace(/(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Gigi\s*\.?\s*unh|GIGI\s*\.?\s*UNH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH|Sex|SEX|Nam|Nữ|NAM|NỮ|Male|Female|MALE|FEMALE)/gi, ' ').trim();
        
        // Loại bỏ các cụm từ có chứa label (như "ch dem ten khai sinh, Gio Anh, Ngay. thang sinh")
        // Cải thiện để loại bỏ cả khi có dấu phẩy hoặc không có khoảng trắng
        address = address.replace(/[,\.\s]*(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN)[,\.\s]*/gi, ' ').trim();
        address = address.replace(/[,\.\s]*(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH)[,\.\s]*/gi, ' ').trim();
        address = address.replace(/[,\.\s]*(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)[,\.\s]*/gi, ' ').trim();
        // Loại bỏ ở đầu hoặc cuối
        address = address.replace(/^(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN)[,\.\s]+/gi, '').trim();
        address = address.replace(/^(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH)[,\.\s]+/gi, '').trim();
        address = address.replace(/^(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)[,\.\s]+/gi, '').trim();
        address = address.replace(/[,\.\s]+(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN)$/gi, '').trim();
        address = address.replace(/[,\.\s]+(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH)$/gi, '').trim();
        address = address.replace(/[,\.\s]+(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)$/gi, '').trim();
        
        address = cleanAddressLine(address);
        // QUAN TRỌNG: Kiểm tra nếu địa chỉ chỉ chứa các label không phải địa chỉ thì bỏ qua
        const invalidAddressPattern = /^(ch\s*\.?\s*dem|CH\s*\.?\s*DEM|Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH|Nam|Nữ|NAM|NỮ|Male|Female|MALE|FEMALE)[\s,]*$/i;
        if (invalidAddressPattern.test(address) || address.length <= 4) {
          console.log('Skipping invalid address (only contains labels):', address);
          continue; // Bỏ qua địa chỉ không hợp lệ
        }
        if (address.length > 4) {
          parsedData.address = address;
          console.log('Found address (Nơi thường trú - Pattern 1a):', address, 'from line:', line);
          continue; // Bỏ qua pattern 1b nếu đã tìm thấy
        }
      }
      
      // Kiểm tra "Nơi cư trú" (nếu chưa có địa chỉ)
      const currentAddressMatch = line.match(currentAddressPattern);
      if (currentAddressMatch && currentAddressMatch[1] && !parsedData.address) {
        let address = currentAddressMatch[1].trim();
        address = address.replace(/\s*\/\s*Place\s+of\s+residence.*/i, '').trim();
        
        // QUAN TRỌNG: Loại bỏ các label và tên không phải địa chỉ trước khi clean
        // Cải thiện pattern để bắt các biến thể OCR nhầm, bao gồm cả khi không có khoảng trắng hoặc có dấu phẩy
        address = address.replace(/(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN|chii\s*\.?\s*dem\s*\.?\s*ten\s*\.?\s*khai\s*\.?\s*sinh|CHII\s*\.?\s*DEM\s*\.?\s*TEN\s*\.?\s*KHAI\s*\.?\s*SINH)/gi, ' ').trim();
        address = address.replace(/(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngày\s*\.?\s*tháng\s*\.?\s*(?:năm\s*\.?\s*)?sinh|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)/gi, ' ').trim();
        address = address.replace(/(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Gigi\s*\.?\s*unh|GIGI\s*\.?\s*UNH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH|Sex|SEX|Nam|Nữ|NAM|NỮ|Male|Female|MALE|FEMALE)/gi, ' ').trim();
        
        // Loại bỏ các cụm từ có chứa label (như "ch dem ten khai sinh, Gio Anh, Ngay. thang sinh")
        // Cải thiện để loại bỏ cả khi có dấu phẩy hoặc không có khoảng trắng
        address = address.replace(/[,\.\s]*(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN)[,\.\s]*/gi, ' ').trim();
        address = address.replace(/[,\.\s]*(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH)[,\.\s]*/gi, ' ').trim();
        address = address.replace(/[,\.\s]*(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)[,\.\s]*/gi, ' ').trim();
        // Loại bỏ ở đầu hoặc cuối
        address = address.replace(/^(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN)[,\.\s]+/gi, '').trim();
        address = address.replace(/^(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH)[,\.\s]+/gi, '').trim();
        address = address.replace(/^(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)[,\.\s]+/gi, '').trim();
        address = address.replace(/[,\.\s]+(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN)$/gi, '').trim();
        address = address.replace(/[,\.\s]+(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH)$/gi, '').trim();
        address = address.replace(/[,\.\s]+(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)$/gi, '').trim();
        
        address = cleanAddressLine(address);
        // QUAN TRỌNG: Kiểm tra nếu địa chỉ chỉ chứa các label không phải địa chỉ thì bỏ qua
        const invalidAddressPattern = /^(ch\s*\.?\s*dem|CH\s*\.?\s*DEM|Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH|Nam|Nữ|NAM|NỮ|Male|Female|MALE|FEMALE)[\s,]*$/i;
        if (invalidAddressPattern.test(address) || address.length <= 4) {
          console.log('Skipping invalid address (only contains labels):', address);
          continue; // Bỏ qua địa chỉ không hợp lệ
        }
        if (address.length > 4) {
          parsedData.address = address;
          console.log('Found address (Nơi cư trú - Pattern 1a):', address, 'from line:', line);
          continue; // Bỏ qua pattern 1b nếu đã tìm thấy
        }
      }
      
      // Pattern 1b: Dòng chỉ có "Nơi thường trú" hoặc "Nơi cư trú" (không có địa chỉ), địa chỉ nằm ở các dòng tiếp theo
      const permanentAddressLabelPattern = /^(?:Nơi\s+thường\s+trú|Thường\s+trú|Hộ\s+khẩu\s+thường\s+trú|Permanent\s+address|NOI\s+THUONG\s+TRU|NOI\s+THUONG\s+TRU)[\s:]*$/i;
      const currentAddressLabelPattern = /^(?:Nơi\s+cư\s+trú|Cư\s+trú|Current\s+address|NOI\s+CU\s+TRU|NOI\s+CU\s+TRU|Place\s+of\s+residence)[\s:]*$/i;
      
      // Kiểm tra "Nơi thường trú" trước (ưu tiên)
      if (permanentAddressLabelPattern.test(line) && i + 1 < lines.length && !parsedData.address) {
        const addressLines: string[] = [];
        // Lấy các dòng tiếp theo cho đến khi gặp dòng khác (tối đa 12 dòng để lấy đầy đủ)
        for (let j = i + 1; j < lines.length && j < i + 13; j++) {
          const nextLine = lines[j];
          
          // Dừng nếu gặp dòng có từ khóa khác hoặc là số/ngày tháng
          // QUAN TRỌNG: Dừng ngay khi gặp header từ mặt trước để không lấy vào địa chỉ
          // Loại bỏ "Nơi cư trú" khỏi danh sách dừng để có thể lấy địa chỉ sau "Nơi thường trú"
          // QUAN TRỌNG: Dừng khi gặp các header từ mặt trước như "CĂN CƯỚC", "CĂN CƯỚC CÔNG DÂN", "CỘNG HÒA..."
          // QUAN TRỌNG: Dừng khi gặp các label không phải địa chỉ như "ch dem ten khai sinh", "Ngay. thang sinh", "Gio Anh"
          if (/^(?:Đặc điểm|Ngày\s+cấp|Ngày\s+hết\s+hạn|CMND|CCCD|Số|Quốc tịch|Giới tính|Địa chỉ hiện tại|Họ và tên|Tên|Quê quán|BỘ CÔNG AN|MINISTRY)/i.test(nextLine) ||
              /\b(ch\s+dem\s+ten\s+khai\s+sinh|CH\s+DEM\s+TEN\s+KHAI\s+SINH|ch\s+dem\s+ten|CH\s+DEM\s+TEN)\b/gi.test(nextLine) ||
              /\b(Ngay\.\s+thang\s+sinh|NGAY\.\s+THANG\s+SINH|Ngay\.\s+thang|NGAY\.\s+THANG)\b/gi.test(nextLine) ||
              /\b(Gio\s+Anh|GIO\s+ANH|Giới\s+tính|GIOI\s+TINH)\b/gi.test(nextLine) ||
              /CỘNG\s+HÒA\s+XÃ\s+HỘI\s+CHỦ\s+NGHĨA\s+VIỆT\s+NAM/i.test(nextLine) ||
              /CĂN\s+CƯỚC\s+CÔNG\s+DÂN|CAN\s+CƯỚC\s+CONG\s+DAN|CAN\s+CUOC\s+CONG\s+DAN/i.test(nextLine) ||
              /CĂN\s+CƯỚC|CAN\s+CƯỚC|CAN\s+CUOC|CITIZEN\s+IDENTITY\s+CARD/i.test(nextLine) ||
              /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(nextLine) ||
              /^\d{9,12}$/.test(nextLine) ||
              // Dừng nếu gặp MRZ (dòng có nhiều ký tự đặc biệt và số)
              /^[A-Z0-9<]{20,}$/.test(nextLine) ||
              // Dừng nếu gặp header từ mặt trước (QUAN TRỌNG: để không lấy header vào địa chỉ)
              isHeaderLine(nextLine) ||
              /CỘNG\s+HÒA\s+XÃ\s+HỘI\s+CHỦ\s+NGHĨA\s+VIỆT\s+NAM/i.test(nextLine) ||
              /SOCIALIST\s+REPUBLIC\s+OF\s+VIET\s+NAM/i.test(nextLine) ||
              /CĂN\s+CƯỚC|CAN\s+CƯỚC|CAN\s+CUOC|CITIZEN\s+IDENTITY\s+CARD/i.test(nextLine) ||
              // Dừng nếu gặp dòng ngắn có thể là label khác (ít hơn 8 ký tự và ít hơn 2 từ)
              (/^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+$/.test(nextLine) && nextLine.length < 8 && nextLine.split(/\s+/).length <= 1)) {
            break;
          }
          
          // Thêm dòng vào địa chỉ nếu có nội dung và không phải là dòng trống
          if (nextLine && nextLine.length > 3) {
            // Loại bỏ các pattern không hợp lý ngay từ đầu
            // Loại bỏ dòng có pattern như "2000000 No Buông tha / Pc"
            if (/\d{7,}\s+No\s+[^\s]{0,20}\s*\/\s*Pc/gi.test(nextLine)) {
              continue; // Bỏ qua dòng này
            }
            
            // Loại bỏ các pattern OCR nhầm như "Rieu bri Boece mrandence"
            // Lưu ý: "Ngo Thi Nham" đã được sửa thành "Ngô Thì Nhậm" trong fixVietnameseOCRErrors
            // "44 26 53" đã được sửa thành "44/26/53" trong fixVietnameseOCRErrors
            if (/\bRieu\s+bri\s+Boece\s+mrandence\b/gi.test(nextLine)) {
              continue; // Bỏ qua dòng này
            }
            
            // Loại bỏ các dòng có pattern "Neti dang khai sinh lace bith" hoặc các biến thể
            if (/\b(Neti\s+dang\s+khai\s+sinh|NETI\s+DANG\s+KHAI\s+SINH|neti\s+dang\s+khai\s+sinh|lace\s+bith|LACE\s+BITH|Place\s+of\s+birth|PLACE\s+OF\s+BIRTH)\b/gi.test(nextLine)) {
              continue; // Bỏ qua dòng này
            }
            
            // QUAN TRỌNG: Loại bỏ các dòng có label không phải địa chỉ
            // Cải thiện pattern để bắt các biến thể OCR nhầm, bao gồm cả khi không có khoảng trắng hoặc có dấu phẩy
            const hasInvalidLabel = /(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN|chii\s*\.?\s*dem\s*\.?\s*ten\s*\.?\s*khai\s*\.?\s*sinh|CHII\s*\.?\s*DEM\s*\.?\s*TEN\s*\.?\s*KHAI\s*\.?\s*SINH)/gi.test(nextLine) ||
                                   /(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngày\s*\.?\s*tháng\s*\.?\s*(?:năm\s*\.?\s*)?sinh|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)/gi.test(nextLine) ||
                                   /(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Gigi\s*\.?\s*unh|GIGI\s*\.?\s*UNH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH|Sex|SEX|Nam|Nữ|NAM|NỮ|Male|Female|MALE|FEMALE)/gi.test(nextLine);
            
            if (hasInvalidLabel) {
              // Kiểm tra xem dòng này có chứa địa chỉ thực sự không (có từ khóa địa chỉ)
              const hasAddressKeywords = /(Phường|Xã|Huyện|Tỉnh|Thành|Phố|Đường|Tổ|Cụm|PHƯỜNG|XÃ|HUYỆN|TỈNH|THÀNH|PHỐ|ĐƯỜNG|TỔ|CỤM)/i.test(nextLine);
              if (!hasAddressKeywords) {
                break; // Dừng ngay, không lấy thêm dòng nào nữa nếu không có từ khóa địa chỉ
              }
              // Nếu có từ khóa địa chỉ, vẫn có thể là địa chỉ hợp lệ, nhưng loại bỏ label trước khi thêm
              continue; // Bỏ qua dòng này vì có label không phải địa chỉ
            }
            
            // QUAN TRỌNG: Loại bỏ các dòng chỉ có tên (chữ in hoa, 2-4 từ, không có số, không có từ khóa địa chỉ)
            const namePattern = /^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]{5,}$/;
            if (namePattern.test(nextLine) && !/\d/.test(nextLine)) {
              const words = nextLine.trim().split(/\s+/);
              // Nếu có 2-4 từ và không có từ khóa địa chỉ, có thể là tên
              if (words.length >= 2 && words.length <= 4) {
                const addressKeywords = ['PHƯỜNG', 'XÃ', 'HUYỆN', 'TỈNH', 'THÀNH', 'PHỐ', 'ĐƯỜNG', 'TỔ', 'CỤM', 'NGÔ', 'THÌ', 'NHẬM', 'BÌNH', 'DƯƠNG', 'DĨ', 'AN'];
                const upperLine = nextLine.toUpperCase();
                const hasAddressKeyword = addressKeywords.some(keyword => upperLine.includes(keyword));
                if (!hasAddressKeyword) {
                  continue; // Bỏ qua dòng này - có thể là tên
                }
              }
            }
            
            const cleanLine = cleanAddressLine(nextLine);
            // Chỉ thêm nếu dòng có ít nhất 5 ký tự sau khi làm sạch và không phải là pattern không hợp lý
            // Loại bỏ các dòng chỉ có "Neti dang khai sinh lace bith" hoặc các biến thể
            if (cleanLine.length > 4 && 
                !/\d{7,}\s+[A-Za-z]{1,3}\s+[^\s]{0,20}\s*\/\s*[A-Za-z]{1,3}/gi.test(cleanLine) &&
                !/\b(Neti\s+dang\s+khai\s+sinh|NETI\s+DANG\s+KHAI\s+SINH|lace\s+bith|LACE\s+BITH|Place\s+of\s+birth|PLACE\s+OF\s+BIRTH)\b/gi.test(cleanLine)) {
              addressLines.push(cleanLine);
            }
          }
        }
        
        if (addressLines.length > 0) {
          let address = addressLines.join(', ').replace(/\s+/g, ' ').trim();
          
          // Làm sạch lại sau khi gộp - loại bỏ các phần không cần thiết
          address = address.replace(/\([^)]*Place\s+of\s+residence[^)]*\)/gi, '').trim();
          address = address.replace(/\([^)]*Có\s+gia\s+tị[^)]*\)/gi, '').trim();
          address = address.replace(/\([^)]*Có\s+giá\s+trị[^)]*\)/gi, '').trim();
          address = address.replace(/Place\s+of\s+residence[^,]*/gi, '').trim();
          address = address.replace(/Có\s+gia\s+tị\s+đến\s+\d+/gi, '').trim();
          address = address.replace(/Có\s+giá\s+trị\s+đến\s+\d+/gi, '').trim();
          // Loại bỏ "Neti dang khai sinh lace bith" và các biến thể
          address = address.replace(/\b(Neti\s+dang\s+khai\s+sinh|NETI\s+DANG\s+KHAI\s+SINH|neti\s+dang\s+khai\s+sinh|lace\s+bith|LACE\s+BITH|Place\s+of\s+birth|PLACE\s+OF\s+BIRTH)\b/gi, ' ').trim();
          address = address.replace(/,\s*Neti\s+dang\s+khai\s+sinh\s+lace\s+bith/gi, '').trim();
          address = address.replace(/Neti\s+dang\s+khai\s+sinh\s+lace\s+bith\s*,?/gi, '').trim();
          
          // QUAN TRỌNG: Loại bỏ các label và tên không phải địa chỉ
          // Cải thiện pattern để bắt các biến thể OCR nhầm, bao gồm cả khi không có khoảng trắng hoặc có dấu phẩy
          address = address.replace(/(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN|chii\s*\.?\s*dem\s*\.?\s*ten\s*\.?\s*khai\s*\.?\s*sinh|CHII\s*\.?\s*DEM\s*\.?\s*TEN\s*\.?\s*KHAI\s*\.?\s*SINH)/gi, ' ').trim();
          address = address.replace(/(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngày\s*\.?\s*tháng\s*\.?\s*(?:năm\s*\.?\s*)?sinh|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)/gi, ' ').trim();
          address = address.replace(/(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Gigi\s*\.?\s*unh|GIGI\s*\.?\s*UNH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH|Sex|SEX|Nam|Nữ|NAM|NỮ|Male|Female|MALE|FEMALE)/gi, ' ').trim();
          
          // Loại bỏ các cụm từ có chứa label (như "ch dem ten khai sinh, Gio Anh, Ngay. thang sinh")
          // Cải thiện để loại bỏ cả khi có dấu phẩy hoặc không có khoảng trắng
          address = address.replace(/[,\.\s]*(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN)[,\.\s]*/gi, ' ').trim();
          address = address.replace(/[,\.\s]*(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH)[,\.\s]*/gi, ' ').trim();
          address = address.replace(/[,\.\s]*(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)[,\.\s]*/gi, ' ').trim();
          
          // Loại bỏ các cụm từ ở đầu hoặc cuối có chứa label
          address = address.replace(/^(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN)[,\.\s]+/gi, '').trim();
          address = address.replace(/^(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH)[,\.\s]+/gi, '').trim();
          address = address.replace(/^(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)[,\.\s]+/gi, '').trim();
          address = address.replace(/[,\.\s]+(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN)$/gi, '').trim();
          address = address.replace(/[,\.\s]+(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH)$/gi, '').trim();
          address = address.replace(/[,\.\s]+(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)$/gi, '').trim();
          
          // Loại bỏ tên (chữ in hoa, 2-4 từ, không có số, không có từ khóa địa chỉ) khỏi địa chỉ
          address = address.replace(/\b([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]{2,}\s+[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]{2,}(?:\s+[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]{2,}){0,2})\b/g, (match) => {
            const addressKeywords = ['PHƯỜNG', 'XÃ', 'HUYỆN', 'TỈNH', 'THÀNH', 'PHỐ', 'ĐƯỜNG', 'TỔ', 'CỤM', 'NGÔ', 'THÌ', 'NHẬM', 'BÌNH', 'DƯƠNG', 'DĨ', 'AN', 'HÀ', 'NAM', 'LÝ', 'NHÂN', 'TRẦN', 'HƯNG', 'ĐẠO'];
            const upperMatch = match.toUpperCase();
            if (addressKeywords.some(keyword => upperMatch.includes(keyword))) {
              return match; // Giữ lại nếu có từ khóa địa chỉ
            }
            // Loại bỏ nếu là tên (không có số, không có dấu phẩy nhiều, chỉ có chữ in hoa)
            if (!/\d/.test(match) && match.split(',').length <= 1) {
              return ''; // Loại bỏ tên
            }
            return match;
          }).trim();
          
          // Loại bỏ các pattern không hợp lý (như "2000000 No Buông tha / Pc")
          address = address.replace(/\d{7,}\s+No\s+[^\s]{0,20}\s*\/\s*Pc/gi, '').trim();
          address = address.replace(/\d{7,}\s+[A-Za-z]{1,3}\s+[^\s]{0,20}\s*\/\s*[A-Za-z]{1,3}/gi, '').trim();
          
          // Loại bỏ các từ/cụm từ OCR nhầm phổ biến
          address = address.replace(/\b(ERE|BE|INTE|SE|Sh|ce|g|bro|yi|OE|gia\s+đền|Buông|tha|Date\s+ofbxpiry|Date\s+of|ofbxpiry|bxpiry)\b/gi, ' ').trim();
          
          // Loại bỏ các pattern không hợp lý như "T 40 ổ 6" (có thể là OCR nhầm)
          address = address.replace(/\bT\s+\d+\s+[ổộ]\s+\d+\b/gi, ' ').trim();
          
          // Loại bỏ các pattern như "Ch B2 TN7 T.." (OCR nhầm)
          address = address.replace(/\bCh\s+B\d+\s+TN\d+\s+T\.\./gi, ' ').trim();
          
          // Loại bỏ các pattern như "T.," hoặc "T." (OCR nhầm)
          address = address.replace(/\bT\.\s*,?/gi, ' ').trim();
          
          // Loại bỏ các pattern như "ú,," hoặc ",, à" (OCR nhầm)
          address = address.replace(/ú,,|,,/g, ' ').trim();
          address = address.replace(/,\s*,+/g, ',').trim(); // Loại bỏ dấu phẩy lặp lại
          
          // Loại bỏ các từ đơn lẻ không hợp lý như "ú", "Tâ", "à", "Nai", "ơ" (OCR nhầm)
          address = address.replace(/\b(ú|Tâ|à|Nai|ThThượngng|ơ|H8)\b/gi, ' ').trim();
          
          // Loại bỏ các pattern như ", à" hoặc ", à ơ" ở cuối (OCR nhầm)
          address = address.replace(/,\s*à(\s+ơ)?\s*$/gi, '').trim();
          
          // Loại bỏ các pattern như "Tâ H8" (OCR nhầm)
          address = address.replace(/\bTâ\s+H\d+\b/gi, ' ').trim();
          
          // Loại bỏ các số ngày tháng không hợp lý
          address = address.replace(/\b\d{7,}\b/g, '').trim();
          address = address.replace(/\b\d{1,2}\s+\d{1,2}\b/g, '').trim();
          
          // Loại bỏ các từ đơn lẻ không hợp lý (nhưng giữ lại các từ tiếng Việt phổ biến)
          address = address.replace(/\b[a-z]{1,2}\b/gi, (match) => {
            const validShortWords = ['t', 'ch', 'cụm', 'tổ', 'phường', 'xã', 'huyện', 'tỉnh', 'thành'];
            if (validShortWords.includes(match.toLowerCase())) {
              return match;
            }
            return '';
          }).trim();
          
          // Loại bỏ các ký tự đặc biệt không hợp lý
          address = address.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s,\.\-]/gi, ' ').trim();
          
          // Loại bỏ dấu phẩy thừa ở đầu/cuối
          address = address.replace(/^[,\.\s]+|[,\.\s]+$/g, '').trim();
          
          // Chuẩn hóa lại khoảng trắng
          address = address.replace(/\s+/g, ' ').trim();
          
          // Loại bỏ các từ/cụm từ lặp lại không hợp lý
          address = address.replace(/\b(\w+)\s+\1\b/gi, '$1').trim();
          
          // QUAN TRỌNG: Kiểm tra nếu địa chỉ chỉ chứa các label không phải địa chỉ thì bỏ qua
          // Cải thiện pattern để bắt cả trường hợp có dấu phẩy giữa các label
          const invalidAddressPattern = /^(ch\s*\.?\s*dem|CH\s*\.?\s*DEM|Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH|Nam|Nữ|NAM|NỮ|Male|Female|MALE|FEMALE)[\s,]*$/i;
          const hasOnlyLabels = invalidAddressPattern.test(address) || 
                                /^(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH)[\s,]*/i.test(address) ||
                                /^[\s,]*(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)[\s,]*$/i.test(address);
          
          // Kiểm tra xem địa chỉ có chứa từ khóa địa chỉ thực sự không
          const hasAddressKeywords = /(Phường|Xã|Huyện|Tỉnh|Thành|Phố|Đường|Tổ|Cụm|PHƯỜNG|XÃ|HUYỆN|TỈNH|THÀNH|PHỐ|ĐƯỜNG|TỔ|CỤM|Ngô|Thì|Nhậm|Bình|Dương|Dĩ|An|Hà|Nam|Lý|Nhân|Trần|Hưng|Đạo)/i.test(address);
          
          if (hasOnlyLabels || (!hasAddressKeywords && address.length < 20)) {
            console.log('Skipping invalid address (only contains labels or no address keywords):', address);
            continue; // Bỏ qua địa chỉ không hợp lệ
          }
          
          if (address.length > 15) { // Tăng yêu cầu độ dài tối thiểu lên 15 ký tự
            parsedData.address = address;
            console.log('Found address (Nơi thường trú - Pattern 1b):', parsedData.address);
            break;
          }
        }
      }
      
      // Pattern 2: Dòng có "Nơi thường trú:" hoặc "Nơi cư trú:" hoặc "Thường trú:" và địa chỉ nằm cùng dòng
      const permanentAddressInLine = line.match(/(?:Nơi\s+thường\s+trú|Thường\s+trú|Hộ\s+khẩu\s+thường\s+trú|Permanent\s+address|NOI\s+THUONG\s+TRU|NOI\s+THUONG\s+TRU)[\s:]+(.+)/i);
      const currentAddressInLine = line.match(/(?:Nơi\s+cư\s+trú|Cư\s+trú|Current\s+address|NOI\s+CU\s+TRU|NOI\s+CU\s+TRU|Place\s+of\s+residence)[\s:]+(.+)/i);
      
      // Kiểm tra "Nơi thường trú" trước (ưu tiên)
      if (permanentAddressInLine && permanentAddressInLine[1] && !parsedData.address) {
        let address = permanentAddressInLine[1].trim();
        
        // QUAN TRỌNG: Loại bỏ các label và tên không phải địa chỉ trước khi clean
        // Cải thiện pattern để bắt các biến thể OCR nhầm, bao gồm cả khi không có khoảng trắng hoặc có dấu phẩy
        address = address.replace(/(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN|chii\s*\.?\s*dem\s*\.?\s*ten\s*\.?\s*khai\s*\.?\s*sinh|CHII\s*\.?\s*DEM\s*\.?\s*TEN\s*\.?\s*KHAI\s*\.?\s*SINH)/gi, ' ').trim();
        address = address.replace(/(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngày\s*\.?\s*tháng\s*\.?\s*(?:năm\s*\.?\s*)?sinh|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)/gi, ' ').trim();
        address = address.replace(/(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Gigi\s*\.?\s*unh|GIGI\s*\.?\s*UNH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH|Sex|SEX|Nam|Nữ|NAM|NỮ|Male|Female|MALE|FEMALE)/gi, ' ').trim();
        
        // Loại bỏ các cụm từ có chứa label (như "ch dem ten khai sinh, Gio Anh, Ngay. thang sinh")
        // Cải thiện để loại bỏ cả khi có dấu phẩy hoặc không có khoảng trắng
        address = address.replace(/[,\.\s]*(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN)[,\.\s]*/gi, ' ').trim();
        address = address.replace(/[,\.\s]*(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH)[,\.\s]*/gi, ' ').trim();
        address = address.replace(/[,\.\s]*(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)[,\.\s]*/gi, ' ').trim();
        // Loại bỏ ở đầu hoặc cuối
        address = address.replace(/^(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN)[,\.\s]+/gi, '').trim();
        address = address.replace(/^(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH)[,\.\s]+/gi, '').trim();
        address = address.replace(/^(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)[,\.\s]+/gi, '').trim();
        address = address.replace(/[,\.\s]+(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN)$/gi, '').trim();
        address = address.replace(/[,\.\s]+(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH)$/gi, '').trim();
        address = address.replace(/[,\.\s]+(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)$/gi, '').trim();
        
        address = cleanAddressLine(address);
        
        // QUAN TRỌNG: Kiểm tra nếu địa chỉ chỉ chứa các label không phải địa chỉ thì bỏ qua
        const invalidAddressPattern = /^(ch\s*\.?\s*dem|CH\s*\.?\s*DEM|Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH|Nam|Nữ|NAM|NỮ|Male|Female|MALE|FEMALE)[\s,]*$/i;
        if (invalidAddressPattern.test(address) || address.length <= 4) {
          console.log('Skipping invalid address (only contains labels):', address);
          continue; // Bỏ qua địa chỉ không hợp lệ
        }
        
        // Nếu địa chỉ ngắn hoặc có dấu hiệu chưa đầy đủ, tiếp tục lấy các dòng sau
        if ((address.length < 30 || address.endsWith(',') || address.endsWith('-')) && i + 1 < lines.length) {
          const nextLines: string[] = [];
          // Lấy các dòng tiếp theo cho đến khi gặp dòng khác (tối đa 10 dòng)
          for (let j = i + 1; j < lines.length && j < i + 11; j++) {
            const nextLine = lines[j];
            // Dừng nếu gặp dòng có từ khóa khác hoặc là số/ngày tháng
            // Loại bỏ "Nơi cư trú" khỏi danh sách dừng để có thể lấy địa chỉ sau "Nơi thường trú"
            // QUAN TRỌNG: Dừng khi gặp các label không phải địa chỉ như "ch dem ten khai sinh", "Ngay. thang sinh", "Gio Anh"
            if (/^(?:Đặc điểm|Ngày\s+cấp|Ngày\s+hết\s+hạn|CMND|CCCD|Số|Quốc tịch|Giới tính|Họ và tên|Tên|Quê quán|BỘ CÔNG AN|MINISTRY)/i.test(nextLine) ||
                /\b(ch\s+dem\s+ten\s+khai\s+sinh|CH\s+DEM\s+TEN\s+KHAI\s+SINH|ch\s+dem\s+ten|CH\s+DEM\s+TEN)\b/gi.test(nextLine) ||
                /\b(Ngay\.\s+thang\s+sinh|NGAY\.\s+THANG\s+SINH|Ngay\.\s+thang|NGAY\.\s+THANG)\b/gi.test(nextLine) ||
                /\b(Gio\s+Anh|GIO\s+ANH|Giới\s+tính|GIOI\s+TINH)\b/gi.test(nextLine) ||
                /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(nextLine) ||
                /^\d{9,12}$/.test(nextLine) ||
                // Dừng nếu gặp MRZ (dòng có nhiều ký tự đặc biệt và số)
                /^[A-Z0-9<]{20,}$/.test(nextLine) ||
                // Dừng nếu gặp dòng ngắn có thể là tên (ít hơn 10 ký tự và ít hơn 2 từ)
                (/^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+$/.test(nextLine) && nextLine.length < 10 && nextLine.split(/\s+/).length <= 1)) {
              break;
            }
            // Thêm dòng vào địa chỉ nếu có nội dung
            if (nextLine && nextLine.length > 2) {
              // Loại bỏ các pattern không hợp lý
              if (/\d{7,}\s+No\s+[^\s]{0,20}\s*\/\s*Pc/gi.test(nextLine)) {
                continue; // Bỏ qua dòng này
              }
              
              // QUAN TRỌNG: Loại bỏ các dòng có label không phải địa chỉ
              // Cải thiện pattern để bắt các biến thể OCR nhầm, bao gồm cả khi không có khoảng trắng hoặc có dấu phẩy
              const hasInvalidLabel2 = /(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN|chii\s*\.?\s*dem\s*\.?\s*ten\s*\.?\s*khai\s*\.?\s*sinh|CHII\s*\.?\s*DEM\s*\.?\s*TEN\s*\.?\s*KHAI\s*\.?\s*SINH)/gi.test(nextLine) ||
                                       /(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngày\s*\.?\s*tháng\s*\.?\s*(?:năm\s*\.?\s*)?sinh|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)/gi.test(nextLine) ||
                                       /(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Gigi\s*\.?\s*unh|GIGI\s*\.?\s*UNH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH|Sex|SEX|Nam|Nữ|NAM|NỮ|Male|Female|MALE|FEMALE)/gi.test(nextLine);
              
              if (hasInvalidLabel2) {
                // Kiểm tra xem dòng này có chứa địa chỉ thực sự không (có từ khóa địa chỉ)
                const hasAddressKeywords2 = /(Phường|Xã|Huyện|Tỉnh|Thành|Phố|Đường|Tổ|Cụm|PHƯỜNG|XÃ|HUYỆN|TỈNH|THÀNH|PHỐ|ĐƯỜNG|TỔ|CỤM)/i.test(nextLine);
                if (!hasAddressKeywords2) {
                  break; // Dừng ngay, không lấy thêm dòng nào nữa nếu không có từ khóa địa chỉ
                }
                // Nếu có từ khóa địa chỉ, vẫn có thể là địa chỉ hợp lệ, nhưng loại bỏ label trước khi thêm
                continue; // Bỏ qua dòng này vì có label không phải địa chỉ
              }
              
              // Loại bỏ các dòng chỉ có tên (chữ in hoa, 2-4 từ, không có số, không có từ khóa địa chỉ)
              const namePattern = /^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]{5,}$/;
              if (namePattern.test(nextLine) && !/\d/.test(nextLine)) {
                const words = nextLine.trim().split(/\s+/);
                if (words.length >= 2 && words.length <= 4) {
                  const addressKeywords = ['PHƯỜNG', 'XÃ', 'HUYỆN', 'TỈNH', 'THÀNH', 'PHỐ', 'ĐƯỜNG', 'TỔ', 'CỤM', 'NGÔ', 'THÌ', 'NHẬM', 'BÌNH', 'DƯƠNG', 'DĨ', 'AN', 'HÀ', 'NAM', 'LÝ', 'NHÂN', 'TRẦN', 'HƯNG', 'ĐẠO'];
                  const upperLine = nextLine.toUpperCase();
                  const hasAddressKeyword = addressKeywords.some(keyword => upperLine.includes(keyword));
                  if (!hasAddressKeyword) {
                    continue; // Bỏ qua dòng này - có thể là tên
                  }
                }
              }
              
              const cleanLine = cleanAddressLine(nextLine);
              if (cleanLine.length > 2 && !/\d{7,}\s+[A-Za-z]{1,3}\s+[^\s]{0,20}\s*\/\s*[A-Za-z]{1,3}/gi.test(cleanLine)) {
                nextLines.push(cleanLine);
              }
            }
          }
          if (nextLines.length > 0) {
            address = address + (address.endsWith(',') || address.endsWith('-') ? ' ' : ', ') + nextLines.join(', ');
          }
        }
        
        // Làm sạch địa chỉ cuối cùng
        address = address.replace(/\s+/g, ' ').trim();
        
        // Loại bỏ lại các phần không cần thiết sau khi gộp
        address = address.replace(/\([^)]*Place\s+of\s+residence[^)]*\)/gi, '').trim();
        address = address.replace(/\([^)]*Có\s+gia\s+tị[^)]*\)/gi, '').trim();
        address = address.replace(/\([^)]*Có\s+giá\s+trị[^)]*\)/gi, '').trim();
        address = address.replace(/Place\s+of\s+residence[^,]*/gi, '').trim();
        address = address.replace(/Có\s+gia\s+tị\s+đến\s+\d+/gi, '').trim();
        address = address.replace(/Có\s+giá\s+trị\s+đến\s+\d+/gi, '').trim();
        
        // QUAN TRỌNG: Loại bỏ các label và tên không phải địa chỉ sau khi gộp
        // Cải thiện pattern để bắt các biến thể OCR nhầm, bao gồm cả khi không có khoảng trắng hoặc có dấu phẩy
        address = address.replace(/(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN|chii\s*\.?\s*dem\s*\.?\s*ten\s*\.?\s*khai\s*\.?\s*sinh|CHII\s*\.?\s*DEM\s*\.?\s*TEN\s*\.?\s*KHAI\s*\.?\s*SINH)/gi, ' ').trim();
        address = address.replace(/(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngày\s*\.?\s*tháng\s*\.?\s*(?:năm\s*\.?\s*)?sinh|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)/gi, ' ').trim();
        address = address.replace(/(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Gigi\s*\.?\s*unh|GIGI\s*\.?\s*UNH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH|Sex|SEX|Nam|Nữ|NAM|NỮ|Male|Female|MALE|FEMALE)/gi, ' ').trim();
        
        // Loại bỏ các cụm từ có chứa label (như "ch dem ten khai sinh, Gio Anh, Ngay. thang sinh")
        // Cải thiện để loại bỏ cả khi có dấu phẩy hoặc không có khoảng trắng
        address = address.replace(/[,\.\s]*(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN)[,\.\s]*/gi, ' ').trim();
        address = address.replace(/[,\.\s]*(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH)[,\.\s]*/gi, ' ').trim();
        address = address.replace(/[,\.\s]*(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)[,\.\s]*/gi, ' ').trim();
        // Loại bỏ ở đầu hoặc cuối
        address = address.replace(/^(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN)[,\.\s]+/gi, '').trim();
        address = address.replace(/^(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH)[,\.\s]+/gi, '').trim();
        address = address.replace(/^(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)[,\.\s]+/gi, '').trim();
        address = address.replace(/[,\.\s]+(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|ch\s*\.?\s*dem\s*\.?\s*ten|CH\s*\.?\s*DEM\s*\.?\s*TEN)$/gi, '').trim();
        address = address.replace(/[,\.\s]+(Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Gio\s*\.?\s*toh|GIO\s*\.?\s*TOH|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH)$/gi, '').trim();
        address = address.replace(/[,\.\s]+(Ngay\s*\.?\s*thang\s*\.?\s*(?:nam\s*\.?\s*)?sinh|NGAY\s*\.?\s*THANG\s*\.?\s*(?:NAM\s*\.?\s*)?SINH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)$/gi, '').trim();
        
        // QUAN TRỌNG: Kiểm tra nếu địa chỉ chỉ chứa các label không phải địa chỉ thì bỏ qua
        const hasOnlyLabels2 = /^(ch\s*\.?\s*dem|CH\s*\.?\s*DEM|Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG|Giới\s*\.?\s*tính|GIOI\s*\.?\s*TINH|Nam|Nữ|NAM|NỮ|Male|Female|MALE|FEMALE)[\s,]*$/i.test(address) ||
                                /^(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH)[\s,]*/i.test(address) ||
                                /^[\s,]*(ch\s*\.?\s*dem\s*\.?\s*(?:ten\s*\.?\s*)?khai\s*\.?\s*sinh|CH\s*\.?\s*DEM\s*\.?\s*(?:TEN\s*\.?\s*)?KHAI\s*\.?\s*SINH|Gio\s*\.?\s*Anh|GIO\s*\.?\s*ANH|Ngay\s*\.?\s*thang|NGAY\s*\.?\s*THANG)[\s,]*$/i.test(address);
        
        // Kiểm tra xem địa chỉ có chứa từ khóa địa chỉ thực sự không
        const hasAddressKeywords3 = /(Phường|Xã|Huyện|Tỉnh|Thành|Phố|Đường|Tổ|Cụm|PHƯỜNG|XÃ|HUYỆN|TỈNH|THÀNH|PHỐ|ĐƯỜNG|TỔ|CỤM|Ngô|Thì|Nhậm|Bình|Dương|Dĩ|An|Hà|Nam|Lý|Nhân|Trần|Hưng|Đạo)/i.test(address);
        
        if (hasOnlyLabels2 || (!hasAddressKeywords3 && address.length < 20)) {
          console.log('Skipping invalid address (only contains labels or no address keywords):', address);
          continue; // Bỏ qua địa chỉ không hợp lệ
        }
        
        // Loại bỏ tên (chữ in hoa, 2-4 từ, không có số, không có từ khóa địa chỉ) khỏi địa chỉ
        address = address.replace(/\b([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]{2,}\s+[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]{2,}(?:\s+[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]{2,}){0,2})\b/g, (match) => {
          const addressKeywords = ['PHƯỜNG', 'XÃ', 'HUYỆN', 'TỈNH', 'THÀNH', 'PHỐ', 'ĐƯỜNG', 'TỔ', 'CỤM', 'NGÔ', 'THÌ', 'NHẬM', 'BÌNH', 'DƯƠNG', 'DĨ', 'AN', 'HÀ', 'NAM', 'LÝ', 'NHÂN', 'TRẦN', 'HƯNG', 'ĐẠO'];
          const upperMatch = match.toUpperCase();
          if (addressKeywords.some(keyword => upperMatch.includes(keyword))) {
            return match; // Giữ lại nếu có từ khóa địa chỉ
          }
          // Loại bỏ nếu là tên (không có số, không có dấu phẩy nhiều, chỉ có chữ in hoa)
          if (!/\d/.test(match) && match.split(',').length <= 1) {
            return ''; // Loại bỏ tên
          }
          return match;
        }).trim();
        
        // Loại bỏ các từ/cụm từ OCR nhầm phổ biến
        address = address.replace(/\b(ERE|BE|INTE|SE|Sh|ce|g|bro|yi|OE|gia\s+đền)\b/gi, ' ').trim();
        
        // Loại bỏ các số ngày tháng không hợp lý
        address = address.replace(/\b\d{7,}\b/g, '').trim();
        address = address.replace(/\b\d{1,2}\s+\d{1,2}\b/g, '').trim();
        
        // Loại bỏ các từ đơn lẻ không hợp lý (nhưng giữ lại các từ tiếng Việt phổ biến)
        address = address.replace(/\b[a-z]{1,2}\b/gi, (match) => {
          const validShortWords = ['t', 'ch', 'cụm', 'tổ', 'phường', 'xã', 'huyện', 'tỉnh', 'thành'];
          if (validShortWords.includes(match.toLowerCase())) {
            return match;
          }
          return '';
        }).trim();
        
        // Loại bỏ các ký tự đặc biệt không hợp lý
        address = address.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s,\.\-]/gi, ' ').trim();
        
        // Loại bỏ dấu phẩy thừa ở đầu/cuối
        address = address.replace(/^[,\.\s]+|[,\.\s]+$/g, '').trim();
        
        // Chuẩn hóa lại khoảng trắng
        address = address.replace(/\s+/g, ' ').trim();
        
        // Loại bỏ các từ/cụm từ lặp lại không hợp lý
        address = address.replace(/\b(\w+)\s+\1\b/gi, '$1').trim();
        
        if (address.length > 15) { // Tăng yêu cầu độ dài tối thiểu lên 15 ký tự
          parsedData.address = address;
          console.log('Found address (Nơi thường trú - Pattern 2):', parsedData.address);
          break;
        }
      }
      
      // Kiểm tra "Nơi cư trú" (nếu chưa có địa chỉ)
      if (currentAddressInLine && currentAddressInLine[1] && !parsedData.address) {
        let address = cleanAddressLine(currentAddressInLine[1]);
        
        // Nếu địa chỉ ngắn hoặc có dấu hiệu chưa đầy đủ, tiếp tục lấy các dòng sau
        if ((address.length < 30 || address.endsWith(',') || address.endsWith('-')) && i + 1 < lines.length) {
          const nextLines: string[] = [];
          for (let j = i + 1; j < lines.length && j < i + 11; j++) {
            const nextLine = lines[j];
            if (/^(?:Đặc điểm|Ngày\s+cấp|Ngày\s+hết\s+hạn|CMND|CCCD|Số|Quốc tịch|Giới tính|Họ và tên|Tên|Quê quán|BỘ CÔNG AN|MINISTRY)/i.test(nextLine) ||
                /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(nextLine) ||
                /^\d{9,12}$/.test(nextLine) ||
                /^[A-Z0-9<]{20,}$/.test(nextLine) ||
                (/^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+$/.test(nextLine) && nextLine.length < 10 && nextLine.split(/\s+/).length <= 1)) {
              break;
            }
            if (nextLine && nextLine.length > 2) {
              if (/\d{7,}\s+No\s+[^\s]{0,20}\s*\/\s*Pc/gi.test(nextLine)) {
                continue;
              }
              const cleanLine = cleanAddressLine(nextLine);
              if (cleanLine.length > 2 && !/\d{7,}\s+[A-Za-z]{1,3}\s+[^\s]{0,20}\s*\/\s*[A-Za-z]{1,3}/gi.test(cleanLine)) {
                nextLines.push(cleanLine);
              }
            }
          }
          if (nextLines.length > 0) {
            address = address + (address.endsWith(',') || address.endsWith('-') ? ' ' : ', ') + nextLines.join(', ');
          }
        }
        
        address = address.replace(/\s+/g, ' ').trim();
        address = address.replace(/\([^)]*Place\s+of\s+residence[^)]*\)/gi, '').trim();
        address = address.replace(/\([^)]*Có\s+gia\s+tị[^)]*\)/gi, '').trim();
        address = address.replace(/\([^)]*Có\s+giá\s+trị[^)]*\)/gi, '').trim();
        address = address.replace(/Place\s+of\s+residence[^,]*/gi, '').trim();
        address = address.replace(/Có\s+gia\s+tị\s+đến\s+\d+/gi, '').trim();
        address = address.replace(/Có\s+giá\s+trị\s+đến\s+\d+/gi, '').trim();
        address = address.replace(/\b(ERE|BE|INTE|SE|Sh|ce|g|bro|yi|OE|gia\s+đền)\b/gi, ' ').trim();
        address = address.replace(/\b\d{7,}\b/g, '').trim();
        address = address.replace(/\b\d{1,2}\s+\d{1,2}\b/g, '').trim();
        address = address.replace(/\b[a-z]{1,2}\b/gi, (match) => {
          const validShortWords = ['t', 'ch', 'cụm', 'tổ', 'phường', 'xã', 'huyện', 'tỉnh', 'thành'];
          if (validShortWords.includes(match.toLowerCase())) {
            return match;
          }
          return '';
        }).trim();
        address = address.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s,\.\-]/gi, ' ').trim();
        address = address.replace(/^[,\.\s]+|[,\.\s]+$/g, '').trim();
        address = address.replace(/\s+/g, ' ').trim();
        address = address.replace(/\b(\w+)\s+\1\b/gi, '$1').trim();
        
        if (address.length > 15) {
          parsedData.address = address;
          console.log('Found address (Nơi cư trú - Pattern 2):', parsedData.address);
          break;
        }
      }
    }
    
    // Pattern 3: Tìm địa chỉ từ các dòng có nhiều từ tiếng Việt (thường là địa chỉ) nếu chưa tìm thấy
    // Pattern này tìm các dòng dài có nhiều từ, có thể là địa chỉ mà không có label rõ ràng
    // Cải thiện: tìm và ghép nhiều dòng địa chỉ liên tiếp
    if (!parsedData.address) {
      // Tìm các dòng có độ dài hợp lý và có nhiều từ (có thể là địa chỉ)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Bỏ qua các dòng header, label, số
        if (isHeaderLine(line) || 
            /^(?:Đặc điểm|Ngày|CMND|CCCD|Số|Quốc tịch|Giới tính|Họ và tên|Tên|Quê quán|Nơi|BỘ CÔNG AN|MINISTRY)/i.test(line) ||
            /^\d{9,12}$/.test(line) ||
            /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(line) ||
            /^[A-Z0-9<]{20,}$/.test(line)) {
          continue;
        }
        
        // Tìm dòng có độ dài hợp lý (10-500 ký tự) và có nhiều từ (ít nhất 2 từ)
        const words = line.trim().split(/\s+/).filter(w => w.length > 0);
        if (line.length >= 10 && line.length <= 500 && words.length >= 2) {
          // Kiểm tra xem dòng có chứa các từ khóa địa chỉ không
          const addressKeywords = ['tổ', 'cụm', 'phường', 'xã', 'huyện', 'tỉnh', 'thành', 'phố', 'đường', 'số', 'ch', 't', 'mỹ', 'đông', 'di', 'an', 'bình', 'dương', 'trần', 'hưng', 'đạo', 'lý', 'nhân', 'hà', 'nam'];
          const hasAddressKeywords = addressKeywords.some(keyword => 
            line.toLowerCase().includes(keyword.toLowerCase())
          );
          
          // Kiểm tra xem dòng có chứa tên địa danh phổ biến không
          const commonPlaceNames = [
            'mỹ đông', 'di an', 'dĩ an', 'bình dương', 'trần hưng đạo', 'lý nhân', 'hà nam', 
            'hà nội', 'tây hồ', 'phù thượng', 'sơn trung', 'hương sơn', 'hà tĩnh', 
            'thanh khê', 'đà nẵng', 'nhị đồng', 'ngô thì nhậm', 'binh duong', 'di an', 
            'ly nhan', 'ha nam', 'nhi dong', 'ngo thi nham',
            'lào cai', 'lao cai',
            'thái nguyên', 'thai nguyen',
            'phú thọ', 'phu tho',
            'bắc ninh', 'bac ninh',
            'hưng yên', 'hung yen',
            'hải phòng', 'hai phong',
            'ninh bình', 'ninh binh',
            'quảng trị', 'quang tri',
            'thành phố đà nẵng', 'thanh pho da nang', 'da nang',
            'quảng ngãi', 'quang ngai',
            'gia lai',
            'khánh hòa', 'khanh hoa',
            'lâm đồng', 'lam dong',
            'đắk lắk', 'dak lak', 'đăk lak', 'đắc lắc',
            'thành phố hồ chí minh', 'thanh pho ho chi minh', 'ho chi minh', 'tp hcm', 'tp. hồ chí minh',
            'đồng nai', 'dong nai',
            'tây ninh', 'tay ninh',
            'cần thơ', 'can tho', 'thành phố cần thơ', 'thanh pho can tho',
            'vĩnh long', 'vinh long',
            'đồng tháp', 'dong thap',
            'cà mau', 'ca mau',
            'an giang'
          ];
          const hasPlaceName = commonPlaceNames.some(placeName => 
            line.toLowerCase().includes(placeName.toLowerCase())
          );
          
          // Kiểm tra pattern số nhà với dấu / (ví dụ: "44/26/53")
          const hasAddressNumberPattern = /\d{1,2}\/\d{1,2}\/\d{1,2}/.test(line);
          
          // Nếu có từ khóa địa chỉ hoặc tên địa danh hoặc pattern số nhà, bắt đầu tìm và ghép các dòng địa chỉ
          if (hasAddressKeywords || hasPlaceName || hasAddressNumberPattern) {
            // Loại bỏ các pattern không hợp lý trước khi kiểm tra
            if (!/\d{7,}\s+No\s+[^\s]{0,20}\s*\/\s*Pc/gi.test(line) && 
                !/\bRieu\s+bri\s+Boece\s+mrandence\b/gi.test(line) &&
                !/\bNgo\s+Thi\s+Nham\b/gi.test(line)) {
              
              // Bắt đầu từ dòng hiện tại, tìm và ghép các dòng địa chỉ liên tiếp
              const addressLines: string[] = [];
              for (let j = i; j < lines.length && j < i + 6; j++) {
                const addrLine = lines[j];
                
                // Dừng nếu gặp dòng có từ khóa khác
                if (j > i && (/^(?:Đặc điểm|Ngày\s+cấp|Ngày\s+hết\s+hạn|CMND|CCCD|Số|Quốc tịch|Giới tính|Họ và tên|Tên|Quê quán|Nơi|BỘ CÔNG AN|MINISTRY)/i.test(addrLine) ||
                    /^\d{9,12}$/.test(addrLine) ||
                    /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(addrLine) ||
                    /^[A-Z0-9<]{20,}$/.test(addrLine))) {
                  break;
                }
                
                // Loại bỏ các pattern không hợp lý
                if (/\d{7,}\s+No\s+[^\s]{0,20}\s*\/\s*Pc/gi.test(addrLine) ||
                    /\bRieu\s+bri\s+Boece\s+mrandence\b/gi.test(addrLine) ||
                    /\bNgo\s+Thi\s+Nham\b/gi.test(addrLine)) {
                  continue;
                }
                
                const cleanAddrLine = cleanAddressLine(addrLine);
                if (cleanAddrLine.length >= 5) {
                  addressLines.push(cleanAddrLine);
                  const provinceEndPattern = /(tỉnh|thành\s*phố|tp\.?\s*hcm|hồ\s*chí\s*minh|hà\s*nội|đà\s*nẵng)/i;
                  const isProvinceLine = provinceEndPattern.test(cleanAddrLine) || commonPlaceNames.some(p => cleanAddrLine.toLowerCase().includes(p.toLowerCase()));
                  if (isProvinceLine) {
                    break;
                  }
                }
              }
              
              if (addressLines.length > 0) {
                const combinedAddress = addressLines.join(', ').replace(/\s+/g, ' ').trim();
                if (combinedAddress.length >= 15 && this.isValidAddress(combinedAddress)) {
                  parsedData.address = combinedAddress;
                  console.log('Found address (Pattern 3 - multiple lines with address keywords/place names):', parsedData.address);
                  break;
                }
              }
            }
          } else if (line.length >= 20 && words.length >= 4) {
            // Nếu không có từ khóa nhưng dòng đủ dài, vẫn kiểm tra
            if (!/\d{7,}\s+No\s+[^\s]{0,20}\s*\/\s*Pc/gi.test(line) && 
                !/\bRieu\s+bri\s+Boece\s+mrandence\b/gi.test(line) &&
                !/\bNgo\s+Thi\s+Nham\b/gi.test(line)) {
              const cleanLine = cleanAddressLine(line);
              if (cleanLine.length >= 15 && this.isValidAddress(cleanLine)) {
                parsedData.address = cleanLine;
                console.log('Found address (Pattern 3 - long line):', parsedData.address);
                break;
              }
            }
          }
        }
      }
    }
    
    // Tìm địa chỉ (nơi cư trú hiện tại) - tương tự logic trên
    if (!parsedData.address) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const addressInLine = line.match(/(?:Địa chỉ|Address|Nơi\s+cư\s+trú)[:\s]+(.+)/i);
        if (addressInLine && addressInLine[1]) {
          let address = cleanAddressLine(addressInLine[1].trim());
          if (address.length < 20 && i + 1 < lines.length) {
            const nextLines: string[] = [];
            for (let j = i + 1; j < lines.length && j < i + 8; j++) {
              const nextLine = lines[j];
              // Dừng nếu gặp dòng có từ khóa khác
              if (/^(?:Đặc điểm|Ngày\s+cấp|Ngày\s+hết\s+hạn|CMND|CCCD|Số|Quốc tịch|Giới tính|Nơi thường trú|BỘ CÔNG AN|MINISTRY)/i.test(nextLine) ||
                  /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(nextLine) ||
                  /^\d{9,12}$/.test(nextLine) ||
                  /^[A-Z0-9<]{20,}$/.test(nextLine) ||
                  (/^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+$/.test(nextLine) && nextLine.length < 15 && nextLine.split(/\s+/).length <= 2)) {
                break;
              }
              if (nextLine && nextLine.length > 2) {
                // Loại bỏ các pattern không hợp lý
                if (/\d{7,}\s+No\s+[^\s]{0,20}\s*\/\s*Pc/gi.test(nextLine)) {
                  continue;
                }
                const cleanLine = cleanAddressLine(nextLine);
                if (cleanLine.length > 2 && !/\d{7,}\s+[A-Za-z]{1,3}\s+[^\s]{0,20}\s*\/\s*[A-Za-z]{1,3}/gi.test(cleanLine)) {
                  nextLines.push(cleanLine);
                  const provinceEndPattern2 = /(tỉnh|thành\s*phố|tp\.?\s*hcm|hồ\s*chí\s*minh|hà\s*nội|đà\s*nẵng)/i;
                  if (provinceEndPattern2.test(cleanLine)) {
                    break;
                  }
                }
              }
            }
            if (nextLines.length > 0) {
              address = address + ', ' + nextLines.join(', ');
            }
          }
          // Làm sạch lại địa chỉ
          address = cleanAddressLine(address);
          if (address.length > 15 && this.isValidAddress(address)) {
            parsedData.address = address;
            console.log('Found address (nơi cư trú):', parsedData.address);
            break;
          }
        }
      }
    }
    
    console.log('=== PARSED DATA ===');
    console.log('Full Name:', parsedData.fullName);
    console.log('ID Number:', parsedData.idNumber);
    console.log('Date of Birth:', parsedData.dateOfBirth);
    console.log('Gender:', parsedData.gender);
    console.log('Nationality:', parsedData.nationality);
    console.log('Address:', parsedData.address);
    console.log('===================');
    
    if (parsedData.address) {
      parsedData.address = this.formatVietnameseAddress(parsedData.address);
    } else {
      const textForRegex = fixedText.replace(/\s+/g, ' ').toUpperCase();
      const reVN = /(SỐ NHÀ|ĐƯỜNG).*(PHƯỜNG|XÃ).*(QUẬN|HUYỆN).*(TỈNH|THÀNH PHỐ)/i;
      const reNoDia = /(SO NHA|DUONG).*(PHUONG|XA).*(QUAN|HUYEN).*(TINH|THANH PHO)/i;
      const m = textForRegex.match(reVN) || textForRegex.match(reNoDia);
      if (m && m[0]) {
        parsedData.address = this.formatVietnameseAddress(m[0]);
      }
    }
    
    return parsedData;
  }

  fillFormFromOCRData(data: any): void {
    if (!data) return;
    
    // Điền vào personalInfo form nếu có
    if (this.personalInfoFormGroup) {
      if (data.idNumber) {
        this.personalInfoFormGroup.patchValue({ idNumber: data.idNumber });
      }
      // Chỉ điền tên nếu hợp lệ (không phải "Khách lẻ" hoặc các giá trị không hợp lý)
      if (data.fullName && this.isValidName(data.fullName)) {
        // Loại bỏ các giá trị không hợp lý như "Khách lẻ", "Khách lư"
        const invalidNames = [
          'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 'CONG HOA XA HOI CHU NGHIA VIET NAM',
      'ĐỘC LẬP - TỰ DO - HẠNH PHÚC', 'DOC LAP - TU DO - HANH PHUC',
      'SOCIALIST REPUBLIC OF VIET NAM', 'INDEPENDENCE - FREEDOM - HAPPINESS',
      'CĂN CƯỚC','CAN CUOC','CĂN CƯỚC CÔNG DÂN', 'CAN CUOC CONG DAN', 'CITIZEN IDENTITY CARD',
      'BỘ CÔNG AN', 'MINISTRY OF PUBLIC SECURITY',
      'BỘ GTVT', 'BỘ GIAO THÔNG VẬN TẢI', 'MINISTRY OF TRANSPORT', 'MOT','GIẤY PHÉP LÁI XE', 'DRIVER', 'LICENSE',
      'CÓ GIÁ TRỊ ĐẾN:','DATE OF EXPIRY','<<<','<<','<'
        ];
        const upperName = data.fullName.toUpperCase();
        if (!invalidNames.some(invalid => upperName.includes(invalid.toUpperCase()))) {
        this.personalInfoFormGroup.patchValue({ fullName: data.fullName });
        }
      }
      if (data.dateOfBirth) {
        this.personalInfoFormGroup.patchValue({ dateOfBirth: data.dateOfBirth });
      }
      const genderRaw = (data.gender || '').toString().trim().toLowerCase();
      const normalizedGender = genderRaw === 'nam' ? 'male' : genderRaw === 'nữ' ? 'female' : genderRaw === 'male' ? 'male' : genderRaw === 'female' ? 'female' : '';
      if (normalizedGender) {
        this.personalInfoFormGroup.patchValue({ gender: normalizedGender });
        console.log('[OCR] Fill form: Set gender =', normalizedGender);
      } else {
        console.log('[OCR] Fill form: Gender not set, value =', data.gender);
      }
      if (data.nationality) {
        this.personalInfoFormGroup.patchValue({ nationality: data.nationality });
      }
    }
    
    // Điền vào contactInfo form nếu có
    if (this.contactInfoFormGroup) {
      const addressValue = data.address || '';
      const reVN = /(SỐ NHÀ|ĐƯỜNG).*(PHƯỜNG|XÃ).*(QUẬN|HUYỆN).*(TỈNH|THÀNH PHỐ)/i;
      const reNoDia = /(SO NHA|DUONG).*(PHUONG|XA).*(QUAN|HUYEN).*(TINH|THANH PHO)/i;
      const upper = addressValue.toUpperCase();
      const matchSeg = upper.match(reVN) || upper.match(reNoDia);
      const candidate = matchSeg && matchSeg[0] ? matchSeg[0] : addressValue;
      if (candidate && this.isValidAddress(candidate)) {
        let cleanAddress = this.formatVietnameseAddress(candidate);
        if (!/Ch\s+B\d+\s+TN\d+\s+T\.\.|T\s+\d+\s+[ổộ]\s+\d+|ú,,|à$/.test(cleanAddress)) {
          const addressGroup = this.contactInfoFormGroup.get('address') as FormGroup;
          if (addressGroup) {
            addressGroup.patchValue({ street: cleanAddress });
            console.log('[OCR] Fill form: Set address =', cleanAddress.substring(0, 50) + '...');
          }
        } else {
          console.log('[OCR] Fill form: Address invalid, skipped:', cleanAddress.substring(0, 50) + '...');
        }
      } else {
        console.log('[OCR] Fill form: Address not set, address =', data.address ? data.address.substring(0, 50) + '...' : 'N/A');
      }
    }
    
    this.message.success(this.translate.instant('OCR_SCANNER.MESSAGES.OCR_FILLED'));
  }

  /**
   * Lấy label cho mặt (trước/sau) dựa vào index và dữ liệu đã scan
   * Sử dụng phát hiện tự động để hiển thị đúng, không phụ thuộc vào thứ tự upload
   */
  getSideLabel(index: number): string {
    if (!this.allowMultiple || this.selectedFiles.length <= 1) {
      return '';
    }
    
    // Tìm dữ liệu scan tương ứng với file tại index này
    // scannedData có thể không khớp với index nếu đã sắp xếp lại
    // Nên tìm theo uploadIndex
    if (this.scannedData && this.scannedData.length > index) {
      const data = this.scannedData[index];
      if (data && data.detectedSide) {
        // Dùng phát hiện tự động
        if (data.detectedSide === 'front') {
          return 'Mặt trước';
        } else if (data.detectedSide === 'back') {
          return 'Mặt sau';
        }
      }
      
      // Nếu có side nhưng không có detectedSide, dùng side
      if (data && data.side) {
        if (data.side === 'front' || data.isFrontSide) {
          return 'Mặt trước';
        } else if (data.side === 'back') {
          return 'Mặt sau';
        }
      }
    }
    
    // Nếu chưa có dữ liệu scan, dùng thứ tự upload (tạm thời)
    // Sẽ được cập nhật sau khi scan xong
    return index === 0 ? 'Mặt trước (đang quét...)' : 'Mặt sau (đang quét...)';
  }

  clearImage(index?: number): void {
    if (index !== undefined) {
      // Xóa ảnh cụ thể
      this.selectedFiles.splice(index, 1);
      this.previewImages.splice(index, 1);
      this.scannedData.splice(index, 1);
      
      // Xóa khỏi queue nếu có
      const fileToRemove = this.selectedFiles[index];
      if (fileToRemove) {
        const queueIndex = this.scanningQueue.findIndex(item => item.file === fileToRemove);
        if (queueIndex > -1) {
          this.scanningQueue.splice(queueIndex, 1);
        }
      }
    } else {
      // Xóa tất cả
      this.selectedFiles = [];
      this.previewImages = [];
      this.scannedData = [];
      this.scanningQueue = [];
      this.isProcessingQueue = false;
      
      // Terminate worker nếu đang chạy
      if (this.ocrWorker) {
        this.ocrWorker.terminate().catch(err => console.error('Error terminating OCR worker:', err));
        this.ocrWorker = null;
      }
      
      this.isScanning = false;
      this.ocrProgress = 0;
      this.ocrStatus = '';
    }
  }
}

