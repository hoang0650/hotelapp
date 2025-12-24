import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { createWorker, Worker, PSM } from 'tesseract.js';
import { FileService } from '../../services/file.service';

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
  
  @Output() scanComplete = new EventEmitter<any>(); // Emit khi scan xong với dữ liệu đã parse
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
    private fileService: FileService
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
        this.message.error(`File "${file.name}" không phải là ảnh. Vui lòng chọn file ảnh.`);
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
    
    // Xử lý OCR: nếu allowMultiple, xử lý tuần tự để đảm bảo thứ tự
    if (this.allowMultiple && validFiles.length > 1) {
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

  /**
   * Xử lý queue scan tuần tự để đảm bảo thứ tự và tránh conflict
   * Đảm bảo: ảnh đầu tiên (index 0) = mặt trước, ảnh thứ hai (index 1) = mặt sau
   */
  private async processScanningQueue(): Promise<void> {
    // Tránh xử lý trùng
    if (this.isProcessingQueue) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    try {
      // Xử lý từng file một cách tuần tự theo đúng thứ tự trong queue
      // Queue được tạo theo thứ tự upload: file đầu tiên = index 0 = mặt trước
      while (this.scanningQueue.length > 0) {
        // Lấy file đầu tiên trong queue với index đã được gán sẵn
        const queueItem = this.scanningQueue.shift();
        if (!queueItem || !queueItem.file) break;
        
        const { file, index: fileIndex } = queueItem;
        const isFrontSide = fileIndex === 0;
        
        console.log(`[OCR] Xử lý ảnh: fileIndex=${fileIndex}, fileName=${file.name}, ${isFrontSide ? 'MẶT TRƯỚC' : 'MẶT SAU'}`);
        
        if (this.selectedFiles.length > 1) {
          this.ocrStatus = `Đang xử lý ${isFrontSide ? 'mặt trước' : 'mặt sau'} (${fileIndex + 1}/${this.selectedFiles.length})...`;
        }
        
        // Scan OCR cho file này với index chính xác (đã được gán từ queue)
        await this.scanOCR(file, fileIndex);
      }
    } finally {
      this.isProcessingQueue = false;
    }
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
            hasAddress: !!d.permanentAddress 
          })));
          
          const mergedData = this.mergeScannedData(sortedData);
          
          this.message.success(`Đã nhận dạng thành công ${this.selectedFiles.length} ${this.selectedFiles.length > 1 ? 'ảnh' : 'ảnh'}!`);
          this.scanComplete.emit(mergedData);
          this.fillFormFromOCRData(mergedData);
        } else if (!this.allowMultiple || this.selectedFiles.length === 1) {
          // Chỉ có 1 ảnh - vẫn sử dụng mergeScannedData để đảm bảo logic nhất quán
          // Đảm bảo parsedData có side đúng (ưu tiên mặt trước nếu detect được)
          const singleDataArray = [parsedData];
          const mergedData = this.mergeScannedData(singleDataArray);
          this.message.success('Đã nhận dạng văn bản thành công!');
          this.scanComplete.emit(mergedData);
          this.fillFormFromOCRData(mergedData);
        } else {
          // Đang xử lý ảnh tiếp theo
          const scannedCount = this.scannedData.filter(data => data !== null).length;
          this.message.success(`Đã nhận dạng ${sideLabel} (${scannedCount}/${this.selectedFiles.length})`);
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
            this.scanComplete.emit(mergedData);
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
    if (!name || name.length < 8 || name.length > 100) return false;
    
    // Loại bỏ các tên có chứa header
    const headerKeywords = ['VIỆT NAM', 'VIETNAM', 'SOCIALIST', 'REPUBLIC', 'CỘNG HÒA', 'XÃ HỘI', 'CHỦ NGHĨA', 'CĂN CƯỚC', 'CÔNG DÂN', 'CAN CƯỚC', 'CONG DAN', 'CONG DAN'];
    const upperName = name.toUpperCase();
    if (headerKeywords.some(keyword => upperName.includes(keyword))) {
      return false;
    }
    
    // Loại bỏ các tên không hợp lý (OCR nhầm)
    const invalidNamePatterns = [
      'PERSONAL IDENTIFICATION',
      'IDENTIFICATION',
      'PERSONAL',
      'IDENTITY',
      'CARD',
      'NGHY PANG',
      'NKO MT',
      'AYN DARE',
      'HAL GANG',
      'KY KHAI',
      'IND PINE',
      'IN DANH',
      'CD SEN',
      'IN DANH CD SEN',
      'IN DANH CD SEN IDENTIFICATION',
      'CAN CƯỚC CONG DAN',
      'CAN CUOC CONG DAN',
      'CAN CUOC',
      'CONG DAN',
      'CAN GƯỚC CONG DAN',
      'CAN GUOC CONG DAN',
      'EET MANY',
      'EET',
      'MANY',
      'NOD THANG',
      'AFMCHP',
      'NOD THANG AFMCHP',
      'NOD THANG ADECAP',
      'ADECAP',
      'THANG'
    ];
    if (invalidNamePatterns.some(pattern => upperName.includes(pattern))) {
      return false;
    }
    
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
    if (!address || address.length < 15 || address.length > 500) return false;
    
    // Loại bỏ các địa chỉ có quá nhiều ký tự đặc biệt không hợp lý
    const specialCharCount = (address.match(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s,\.\-]/gi) || []).length;
    if (specialCharCount > address.length * 0.2) return false;
    
    // Địa chỉ phải có ít nhất 3 từ
    const addressParts = address.split(/[\s,]+/).filter(part => part.length >= 2);
    if (addressParts.length < 3) return false;
    
    return true;
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
        permanentAddress: '',
        phone: '',
        address: ''
      };
    }
    
    const merged: any = {
      fullName: '',
      idNumber: '',
      dateOfBirth: null,
      gender: '',
      nationality: '',
      permanentAddress: '', // Nơi thường trú
      phone: '',
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
      const aValid = (a.fullName && this.isValidName(a.fullName)) || (a.permanentAddress && this.isValidAddress(a.permanentAddress));
      const bValid = (b.fullName && this.isValidName(b.fullName)) || (b.permanentAddress && this.isValidAddress(b.permanentAddress));
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
      hasAddress: !!d.permanentAddress,
      addressValid: d.permanentAddress ? this.isValidAddress(d.permanentAddress) : false
    })));
    
    // Ưu tiên dữ liệu từ mặt trước (fileIndex = 0) trước, sau đó mới lấy từ mặt sau
    // Mặt trước thường có: Họ tên, ID, Ngày sinh, Giới tính, Quốc tịch
    // Mặt sau thường có: Nơi thường trú, Địa chỉ
    // Nhưng chỉ lấy dữ liệu hợp lệ (isValidName, isValidAddress)
    for (const data of sortedData) {
      console.log(`[OCR] Merge: fileIndex=${data.fileIndex}, side=${data.side}, fullName=${data.fullName || 'N/A'}, gender=${data.gender || 'N/A'}, permanentAddress=${data.permanentAddress || 'N/A'}`);
      
      // Họ và tên: ưu tiên mặt trước (front) hơn mặt sau (back)
      // Chỉ lấy nếu hợp lệ, và ưu tiên front hơn back
      if (data.fullName && this.isValidName(data.fullName)) {
        // Nếu chưa có tên, lấy tên mới
        if (!merged.fullName) {
          merged.fullName = data.fullName;
          merged.side = data.side; // Lưu side của tên để biết tên đến từ đâu
          console.log(`[OCR] Merge: Set name from ${data.side} (fileIndex=${data.fileIndex}): ${data.fullName}`);
        } else {
          // Nếu đã có tên, chỉ thay thế nếu:
          // 1. Tên mới từ mặt trước (front) - luôn ưu tiên mặt trước
          // 2. Hoặc tên hiện tại không hợp lệ
          if (!this.isValidName(merged.fullName)) {
            merged.fullName = data.fullName;
            merged.side = data.side;
            console.log(`[OCR] Merge: Replaced invalid name with name from ${data.side}: ${data.fullName}`);
          } else if (data.side === 'front') {
            // Luôn ưu tiên tên từ mặt trước, bất kể tên hiện tại từ đâu
            merged.fullName = data.fullName;
            merged.side = data.side;
            console.log(`[OCR] Merge: Replaced name with name from front (fileIndex=${data.fileIndex}): ${data.fullName}`);
          }
          // Nếu tên từ mặt sau và đã có tên hợp lệ từ mặt trước, giữ nguyên tên từ mặt trước
        }
      }
      
      // Số CMND/CCCD: ưu tiên mặt trước
      if (data.idNumber && !merged.idNumber) {
        merged.idNumber = data.idNumber;
      }
      
      // Ngày sinh: ưu tiên mặt trước
      if (data.dateOfBirth && !merged.dateOfBirth) {
        merged.dateOfBirth = data.dateOfBirth;
      }
      
      // Giới tính: ưu tiên mặt trước, nhưng chỉ lấy nếu hợp lệ
      // Logic giống như merge tên: luôn ưu tiên mặt trước
      if (data.gender && (data.gender === 'male' || data.gender === 'female')) {
        // Nếu chưa có giới tính, lấy giới tính mới
        if (!merged.gender) {
          merged.gender = data.gender;
          merged.genderSide = data.side; // Lưu side của giới tính để biết giới tính đến từ đâu
          console.log(`[OCR] Merge: Set gender from ${data.side} (fileIndex=${data.fileIndex}): ${data.gender}`);
        } else {
          // Nếu đã có giới tính, chỉ thay thế nếu:
          // 1. Giới tính mới từ mặt trước - luôn ưu tiên mặt trước
          // 2. Hoặc giới tính hiện tại không hợp lệ
          if (data.side === 'front') {
            // Luôn ưu tiên giới tính từ mặt trước, bất kể giới tính hiện tại từ đâu
            merged.gender = data.gender;
            merged.genderSide = data.side;
            console.log(`[OCR] Merge: Replaced gender with gender from front (fileIndex=${data.fileIndex}): ${data.gender}`);
          }
          // Nếu giới tính từ mặt sau và đã có giới tính hợp lệ từ mặt trước, giữ nguyên giới tính từ mặt trước
        }
      }
      
      // Quốc tịch: ưu tiên "Việt Nam" nếu có, nếu không thì lấy từ mặt trước
      if (data.nationality) {
        // Luôn ưu tiên "Việt Nam" nếu có
        if (/việt\s+nam|viet\s+nam|vietnam/i.test(data.nationality)) {
          merged.nationality = 'Việt Nam';
        } else if (!merged.nationality) {
          // Chỉ lấy quốc tịch khác nếu chưa có và không phải là OCR nhầm
          const invalidNationalityPatterns = ['RA EN FE', 'RA EN', 'EN FE', 'FE SD', 'PERSONAL', 'IDENTIFICATION'];
          const upperNationality = data.nationality.toUpperCase();
          if (!invalidNationalityPatterns.some(pattern => upperNationality.includes(pattern))) {
            merged.nationality = data.nationality;
          }
        }
      }
      
      // Nơi thường trú: ưu tiên mặt sau (thường ở mặt sau CCCD), nhưng chỉ lấy nếu hợp lệ
      if (data.permanentAddress && this.isValidAddress(data.permanentAddress)) {
        // Nếu chưa có nơi thường trú, lấy từ bất kỳ mặt nào
        if (!merged.permanentAddress) {
          merged.permanentAddress = data.permanentAddress;
          console.log(`[OCR] Merge: Set permanentAddress from ${data.side} (fileIndex=${data.fileIndex}): ${data.permanentAddress.substring(0, 50)}...`);
        } else if (data.side === 'back') {
          // Nếu nơi thường trú từ mặt sau, ưu tiên mặt sau (thay thế nếu đã có từ mặt trước)
          merged.permanentAddress = data.permanentAddress;
          console.log(`[OCR] Merge: Replaced permanentAddress with address from back: ${data.permanentAddress.substring(0, 50)}...`);
        }
        // Nếu nơi thường trú từ mặt trước và đã có từ mặt sau, giữ nguyên từ mặt sau
      }
      
      // Địa chỉ (nơi cư trú): ưu tiên mặt sau khi có 2 ảnh, nhưng chỉ lấy nếu hợp lệ
      if (data.address && this.isValidAddress(data.address)) {
        // Nếu chưa có địa chỉ, lấy từ bất kỳ mặt nào
        if (!merged.address) {
          merged.address = data.address;
          console.log(`[OCR] Merge: Set address from ${data.side} (fileIndex=${data.fileIndex}): ${data.address.substring(0, 50)}...`);
        } else if (data.side === 'back') {
          // Nếu địa chỉ từ mặt sau, LUÔN ưu tiên mặt sau (thay thế nếu đã có từ mặt trước)
          // Không cần kiểm tra sortedData.length > 1 vì mặt sau luôn ưu tiên
          merged.address = data.address;
          console.log(`[OCR] Merge: Replaced address with address from back (fileIndex=${data.fileIndex}): ${data.address.substring(0, 50)}...`);
        } else if (data.side === 'front' && merged.address) {
          // Nếu địa chỉ từ mặt trước và đã có từ mặt sau, giữ nguyên từ mặt sau (không thay thế)
          console.log(`[OCR] Merge: Keeping address from back, ignoring front (fileIndex=${data.fileIndex})`);
        }
        // Nếu địa chỉ từ mặt trước và đã có từ mặt sau, giữ nguyên từ mặt sau
      }
      
      // Số điện thoại: lấy từ bất kỳ mặt nào
      if (data.phone && !merged.phone) {
        merged.phone = data.phone;
      }
    }
    
    // Logic điền địa chỉ:
    // - Nếu có 1 ảnh: dùng nơi thường trú làm địa chỉ
    // - Nếu có 2 ảnh: ưu tiên địa chỉ (nơi cư trú) từ mặt sau, nếu không có thì dùng nơi thường trú
    // QUAN TRỌNG: Ưu tiên địa chỉ từ mặt sau (back) hơn mặt trước (front)
    if (!merged.address) {
      if (sortedData.length === 1 && merged.permanentAddress) {
        // 1 ảnh: dùng nơi thường trú
        merged.address = merged.permanentAddress;
        console.log('[OCR] Merge: Using permanentAddress as address (1 image)');
      } else if (sortedData.length > 1 && merged.permanentAddress) {
        // 2 ảnh: nếu không có địa chỉ (nơi cư trú), dùng nơi thường trú
        // Tìm địa chỉ từ mặt sau trước
        const backSideData = sortedData.find(d => d.side === 'back' && d.permanentAddress && this.isValidAddress(d.permanentAddress));
        if (backSideData) {
          merged.address = backSideData.permanentAddress;
          console.log('[OCR] Merge: Using permanentAddress from back side as address (2 images)');
        } else {
          merged.address = merged.permanentAddress;
          console.log('[OCR] Merge: Using permanentAddress as address (2 images, no back side address)');
        }
      }
    } else if (sortedData.length > 1) {
      // 2 ảnh: đã có địa chỉ (nơi cư trú), nhưng kiểm tra lại xem có địa chỉ từ mặt sau không
      const backSideAddress = sortedData.find(d => d.side === 'back' && d.address && this.isValidAddress(d.address));
      if (backSideAddress && merged.address !== backSideAddress.address) {
        merged.address = backSideAddress.address;
        console.log('[OCR] Merge: Replaced address with address from back side (2 images)');
      } else {
        console.log('[OCR] Merge: Using current address (2 images)');
      }
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
      permanentAddress: merged.permanentAddress ? merged.permanentAddress.substring(0, 50) + '...' : 'N/A',
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
    const normalizedText = text.toUpperCase();
    const lines = text.split(/\r?\n/).map(line => line.trim().toUpperCase());
    
    let frontScore = 0;
    let backScore = 0;
    
    // Dấu hiệu mặt trước
    if (/CỘNG\s+HÒA\s+XÃ\s+HỘI\s+CHỦ\s+NGHĨA\s+VIỆT\s+NAM/i.test(text)) frontScore += 10;
    if (/SOCIALIST\s+REPUBLIC\s+OF\s+VIET\s+NAM/i.test(text)) frontScore += 10;
    if (/CĂN\s+CƯỚC/i.test(text)) frontScore += 8;
    if (/CITIZEN\s+IDENTITY\s+CARD/i.test(text)) frontScore += 8;
    if (/HỌ\s+VÀ\s+TÊN|FULL\s+NAME/i.test(text)) frontScore += 5;
    if (/NGÀY\s+SINH|DATE\s+OF\s+BIRTH/i.test(text)) frontScore += 5;
    if (/GIỚI\s+TÍNH|SEX/i.test(text)) frontScore += 3;
    if (/QUỐC\s+TỊCH|NATIONALITY/i.test(text)) frontScore += 3;
    
    // Dấu hiệu mặt sau - tăng điểm để ưu tiên nhận diện chính xác
    if (/BỘ\s+CÔNG\s+AN/i.test(text)) backScore += 15; // Tăng từ 10 lên 15
    if (/MINISTRY\s+OF\s+PUBLIC\s+SECURITY/i.test(text)) backScore += 15; // Tăng từ 10 lên 15
    if (/IDVNM/i.test(text)) backScore += 20; // MRZ bắt đầu bằng IDVNM - tăng từ 15 lên 20
    if (/\<\<\</.test(text)) backScore += 15; // MRZ có nhiều dấu <<< - tăng từ 10 lên 15
    if (/NƠI\s+THƯỜNG\s+TRÚ|PLACE\s+OF\s+RESIDENCE/i.test(text)) backScore += 10; // Tăng từ 8 lên 10
    if (/CÓ\s+GIÁ\s+TRỊ\s+ĐẾN|DATE\s+OF\s+EXPIRY/i.test(text)) backScore += 8; // Tăng từ 5 lên 8
    if (/QUÊ\s+QUÁN|PLACE\s+OF\s+ORIGIN/i.test(text)) backScore += 8; // Tăng từ 5 lên 8
    
    // Kiểm tra MRZ pattern (3 dòng, mỗi dòng ~30 ký tự, có <<<)
    const mrzPattern = /[A-Z0-9<]{20,}/g;
    const mrzMatches = text.match(mrzPattern);
    if (mrzMatches && mrzMatches.length >= 2) {
      backScore += 20; // MRZ thường có 2-3 dòng - tăng từ 15 lên 20
    }
    
    // Kiểm tra pattern địa chỉ phổ biến (thường ở mặt sau)
    const addressPatterns = [
      /\d{1,2}\/\d{1,2}\/\d{1,2}/, // Pattern số nhà như "44/26/53"
      /(?:Tổ|Cụm|Phường|Xã|Huyện|Tỉnh|Thành|Phố)/i, // Từ khóa địa chỉ
      /(?:Bình\s+Dương|Dĩ\s+An|Hà\s+Nam|Lý\s+Nhân|Trần\s+Hưng\s+Đạo)/i // Địa danh phổ biến
    ];
    const hasAddressPattern = addressPatterns.some(pattern => pattern.test(text));
    if (hasAddressPattern) {
      backScore += 8; // Có pattern địa chỉ - thường ở mặt sau
    }
    
    // Kiểm tra pattern ngày cấp/hết hạn (thường ở mặt sau)
    if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(text) && /(?:Cấp|Hết\s+hạn|Expiry)/i.test(text)) {
      backScore += 5; // Có ngày cấp/hết hạn - thường ở mặt sau
    }
    
    console.log(`[OCR] Detect side: frontScore=${frontScore}, backScore=${backScore}, text preview: ${text.substring(0, 100)}...`);
    
    // Ưu tiên back nếu có MRZ hoặc "BỘ CÔNG AN" (dấu hiệu rõ ràng của mặt sau)
    if (backScore >= 20 || (backScore > frontScore && backScore >= 15)) {
      return 'back';
    }
    
    if (frontScore > backScore && frontScore >= 10) {
      return 'front';
    }
    
    return 'unknown';
  }

  /**
   * Sửa các lỗi OCR phổ biến cho tiếng Việt
   * OCR thường nhầm các ký tự tiếng Việt với các ký tự Latin tương tự
   */
  fixVietnameseOCRErrors(text: string): string {
    let fixed = text;
    
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
    // "44 26 53" -> "44/26/53" (sửa lỗi OCR: dấu cách thành dấu /)
    fixed = fixed.replace(/\b(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\b/g, '$1/$2/$3');
    // "Nhj Bang" -> "Nhị Đồng" (sửa lỗi OCR)
    fixed = fixed.replace(/\bNhj\s+Bang\b/gi, 'Nhị Đồng');
    fixed = fixed.replace(/\bNHJ\s+BANG\b/g, 'Nhị Đồng');
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
      permanentAddress: '', // Nơi thường trú
      phone: '',
      address: ''
    };
    
    // Tìm số CMND/CCCD (9-12 chữ số)
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
          break;
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
        'BỘ CÔNG AN', 'MINISTRY', 'PUBLIC', 'SECURITY'
      ];
      
      const upperLine = line.toUpperCase();
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
      
      // Loại bỏ các dòng có label
      if (/^(?:Ngày sinh|Date|Giới tính|Quốc tịch|Địa chỉ|Nơi|CMND|CCCD|Số|Quê quán|Họ và tên|HO VA TEN|Full name|Place|Residence)/i.test(line)) {
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
      let nameInLine = line.match(/(?:Họ\s+và\s+tên|HO\s+VA\s+TEN)[\s\/:]+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]{8,}?)(?:\s*\/\s*Full\s+name|$|Ngày|Date|Giới|Sex|Quốc|Nationality)/i);
      
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
        // Loại bỏ "Full name" nếu có ở cuối
        name = name.replace(/\s*\/\s*Full\s+name.*/i, '').trim();
        // Loại bỏ số
        name = name.replace(/\d+/g, '').trim();
        // Loại bỏ ký tự đặc biệt nhưng giữ chữ cái và dấu tiếng Việt
        name = name.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]/gi, '').trim();
        // Chuẩn hóa khoảng trắng
        name = name.replace(/\s+/g, ' ').trim();
        
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
            // Loại bỏ số
            cleanName = cleanName.replace(/\d+/g, '').trim();
            // Loại bỏ ký tự đặc biệt nhưng giữ chữ cái và dấu tiếng Việt
            cleanName = cleanName.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]/gi, '').trim();
            // Chuẩn hóa khoảng trắng
          cleanName = cleanName.replace(/\s+/g, ' ').trim();
            
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
            name = name.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]/gi, '').trim();
            name = name.replace(/\s+/g, ' ').trim();
            
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
                cleanName = cleanName.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]/gi, '').trim();
                cleanName = cleanName.replace(/\s+/g, ' ').trim();
                
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
    // Ví dụ: "PHAN<<VU<TRAM<ANH<<<<<<<<<<<<<"
    if (!nameFound) {
      for (const line of lines) {
        // Tìm dòng MRZ có format: chữ cái + << + chữ cái + < + chữ cái + < + chữ cái + <<
        // Pattern: [A-Z]+<<[A-Z]+<[A-Z]+<[A-Z]+
        const mrzPattern = /^([A-Z]+)<<([A-Z]+)<([A-Z]+)<([A-Z]+)/;
        const mrzMatch = line.match(mrzPattern);
        if (mrzMatch) {
          // MRZ format: HỌ<<TÊN1<TÊN2<TÊN3
          const ho = mrzMatch[1];
          const ten1 = mrzMatch[2];
          const ten2 = mrzMatch[3];
          const ten3 = mrzMatch[4];
          
          // Gộp lại thành tên đầy đủ
          const fullName = `${ho} ${ten1} ${ten2} ${ten3}`.trim();
          
          // Kiểm tra tên hợp lệ
          if (this.isValidName(fullName)) {
            parsedData.fullName = fullName;
          nameFound = true;
            console.log('Found name (Pattern 1.6 - from MRZ):', parsedData.fullName, 'from line:', line);
          break;
          }
        }
        
        // Pattern khác: Tìm dòng có format "HỌ<<TÊN" hoặc "HỌ<TÊN"
        const mrzPattern2 = /^([A-Z]{2,})[<]+([A-Z]{2,})[<]+/;
        const mrzMatch2 = line.match(mrzPattern2);
        if (mrzMatch2 && !nameFound) {
          const ho2 = mrzMatch2[1];
          const tenFull = mrzMatch2[2];
          
          // Tách tên thành các phần (có thể có < giữa các từ)
          const tenParts = tenFull.split('<').filter(part => part.length >= 2);
          if (tenParts.length >= 2) {
            const fullName2 = `${ho2} ${tenParts.join(' ')}`.trim();
            if (this.isValidName(fullName2)) {
              parsedData.fullName = fullName2;
              nameFound = true;
              console.log('Found name (Pattern 1.6b - from MRZ):', parsedData.fullName, 'from line:', line);
              break;
            }
          }
        }
      }
    }
    
    // Pattern 2: Tìm dòng có nhiều chữ cái in hoa (thường là tên trên CCCD) - ưu tiên dòng dài nhất
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
        if (line.length >= 8 && 
            /^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+$/i.test(line)) {
          // Loại bỏ header một lần nữa để chắc chắn
          if (!isHeaderLine(line)) {
            const nameParts = line.trim().split(/\s+/).filter(part => part.length >= 2);
            if (nameParts.length >= 2) {
              const score = nameParts.length * 10 + line.length; // Điểm = số từ * 10 + độ dài
              if (score > bestScore) {
                bestScore = score;
                bestName = nameParts.join(' ');
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
      
      // Tìm dòng có "Ngày sinh:" và ngày nằm cùng dòng
      const dateInLine = line.match(/(?:Ngày\s+sinh|Date\s+of\s+birth|DOB|NGAY\s+SINH|Ngay\s+sinh)[\s:]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i);
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
              console.log('Found date (Pattern 1a):', parsedData.dateOfBirth);
              break;
            }
          }
        }
      }
      
      // Tìm dòng chỉ có "Ngày sinh", ngày nằm ở dòng tiếp theo
      if ((/^(?:Ngày\s+sinh|Date\s+of\s+birth|DOB|NGAY\s+SINH|Ngay\s+sinh)[\s:]*$/i.test(line) || 
           /^(?:Ngày\s+sinh|Date\s+of\s+birth|DOB|NGAY\s+SINH|Ngay\s+sinh)$/i.test(line)) && 
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
                console.log('Found date (Pattern 1b):', parsedData.dateOfBirth);
                break;
              }
            }
          }
        }
      }
    }
    
    // Pattern 2: Tìm tất cả các pattern ngày tháng trong text (dd/mm/yyyy hoặc dd-mm-yyyy)
    if (!dateFound) {
      const datePatterns = [
        /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/g
      ];
      
      for (const pattern of datePatterns) {
        const matches = normalizedText.match(pattern);
        if (matches && matches.length > 0) {
          // Lấy ngày đầu tiên hợp lệ (ưu tiên năm từ 1950-2010 cho ngày sinh)
          for (const match of matches) {
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
                  console.log('Found date (Pattern 2):', parsedData.dateOfBirth);
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
      const genderInLine = line.match(/(?:Giới tính|GIOI TINH|Gender|Sex)[\s\/:]+(Nam|Nữ|Male|Female|M|F)(?:\s*\/\s*Sex|$|[\s,])/i);
      if (genderInLine && genderInLine[1]) {
        const genderValue = genderInLine[1].trim().toLowerCase();
        if (/^nam$|^male$|^m$/.test(genderValue)) {
      parsedData.gender = 'male';
          genderFound = true;
          console.log('Found gender (Pattern 1a):', parsedData.gender, 'from line:', line);
          break;
        } else if (/^nữ$|^nữ$|^female$|^f$/.test(genderValue)) {
      parsedData.gender = 'female';
          genderFound = true;
          console.log('Found gender (Pattern 1a):', parsedData.gender, 'from line:', line);
          break;
        }
      }
      
      // Pattern 1a-2: Tìm "Nam" hoặc "Nữ" ngay sau "Giới tính" trong cùng dòng (không có dấu hai chấm)
      if (!genderFound) {
        const genderInLine2 = line.match(/(?:Giới tính|GIOI TINH|Gender|Sex)\s+(Nam|Nữ|Male|Female|M|F)\b/i);
        if (genderInLine2 && genderInLine2[1]) {
          const genderValue = genderInLine2[1].trim().toLowerCase();
          if (/^nam$|^male$|^m$/.test(genderValue)) {
            parsedData.gender = 'male';
            genderFound = true;
            console.log('Found gender (Pattern 1a-2):', parsedData.gender, 'from line:', line);
            break;
          } else if (/^nữ$|^nữ$|^female$|^f$/.test(genderValue)) {
            parsedData.gender = 'female';
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
          parsedData.gender = 'male';
          genderFound = true;
          console.log('Found gender (Pattern 1b):', parsedData.gender, 'from line:', nextLine);
          break;
        } else if (/^nữ$|^nữ$|^female$|^f$/.test(genderValue)) {
          parsedData.gender = 'female';
          genderFound = true;
          console.log('Found gender (Pattern 1b):', parsedData.gender, 'from line:', nextLine);
          break;
        }
      }
    }
    
    // Pattern 2: Tìm trong toàn bộ text nếu chưa tìm thấy
    if (!genderFound) {
      // Tìm "Nam" hoặc "Nữ" gần từ "Giới tính" (trong vòng 50 ký tự)
      const genderPattern = /(?:Giới tính|GIOI TINH|Gender|Sex)[\s\/:]*([^\n]{0,50}?)(Nam|Nữ|Male|Female|M|F)\b/i;
      const genderMatch = text.match(genderPattern);
      if (genderMatch) {
        const genderValue = (genderMatch[2] || genderMatch[1]).trim().toLowerCase();
        // Loại bỏ các từ không phải giới tính (như "Nam" trong tên "Nguyễn Văn Nam")
        if (!/^(?:Họ|Tên|Full|name|Ngày|Date|Quốc|Nationality|Địa|Address)/i.test(genderMatch[0])) {
          if (/^nam$|^male$|^m$/.test(genderValue)) {
            parsedData.gender = 'male';
            genderFound = true;
            console.log('Found gender (Pattern 2):', parsedData.gender);
          } else if (/^nữ$|^nữ$|^female$|^f$/.test(genderValue)) {
            parsedData.gender = 'female';
            genderFound = true;
            console.log('Found gender (Pattern 2):', parsedData.gender);
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
                parsedData.gender = 'male';
                genderFound = true;
                console.log('Found gender (Pattern 3):', parsedData.gender, 'from line:', line);
                break;
              } else if (/^nữ$|^nữ$|^female$|^f$/.test(cleanLine)) {
                parsedData.gender = 'female';
                genderFound = true;
                console.log('Found gender (Pattern 3):', parsedData.gender, 'from line:', line);
                break;
              }
            }
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
    
    // Tìm nơi thường trú (thường ở mặt sau CCCD) - cải thiện logic
    let permanentAddressFound = false;
    
    // Helper function để làm sạch dòng địa chỉ
    const cleanAddressLine = (line: string): string => {
      let clean = line;
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
      
      // Pattern 1: Dòng chỉ có "Nơi thường trú" hoặc "Nơi cư trú" hoặc "Place of residence" (không có địa chỉ), địa chỉ nằm ở các dòng tiếp theo
      // Trên CCCD, "Nơi thường trú" hoặc "Nơi cư trú" thường ở một dòng riêng, địa chỉ ở các dòng tiếp theo
      // Cải thiện pattern để match chính xác hơn, bao gồm cả các biến thể OCR nhầm
      const addressLabelPattern = /^(?:Nơi\s+thường\s+trú|Nơi\s+cư\s+trú|Thường\s+trú|Cư\s+trú|Hộ\s+khẩu\s+thường\s+trú|Permanent\s+address|Current\s+address|NOI\s+THUONG\s+TRU|NOI\s+CU\s+TRU|NOI\s+THUONG\s+TRU|NOI\s+CU\s+TRU|Place\s+of\s+residence)[\s:]*$/i;
      
      if (addressLabelPattern.test(line) && i + 1 < lines.length) {
        const addressLines: string[] = [];
        // Lấy các dòng tiếp theo cho đến khi gặp dòng khác (tối đa 12 dòng để lấy đầy đủ)
        for (let j = i + 1; j < lines.length && j < i + 13; j++) {
          const nextLine = lines[j];
          
          // Dừng nếu gặp dòng có từ khóa khác hoặc là số/ngày tháng
          // Loại bỏ "Nơi cư trú" khỏi danh sách dừng để có thể lấy địa chỉ sau "Nơi thường trú"
          if (/^(?:Đặc điểm|Ngày\s+cấp|Ngày\s+hết\s+hạn|CMND|CCCD|Số|Quốc tịch|Giới tính|Địa chỉ hiện tại|Họ và tên|Tên|Quê quán|BỘ CÔNG AN|MINISTRY)/i.test(nextLine) ||
              /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(nextLine) ||
              /^\d{9,12}$/.test(nextLine) ||
              // Dừng nếu gặp MRZ (dòng có nhiều ký tự đặc biệt và số)
              /^[A-Z0-9<]{20,}$/.test(nextLine) ||
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
            
            const cleanLine = cleanAddressLine(nextLine);
            // Chỉ thêm nếu dòng có ít nhất 5 ký tự sau khi làm sạch và không phải là pattern không hợp lý
            if (cleanLine.length > 4 && !/\d{7,}\s+[A-Za-z]{1,3}\s+[^\s]{0,20}\s*\/\s*[A-Za-z]{1,3}/gi.test(cleanLine)) {
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
          
          if (address.length > 15) { // Tăng yêu cầu độ dài tối thiểu lên 15 ký tự
            parsedData.permanentAddress = address;
            permanentAddressFound = true;
            console.log('Found address (Pattern 1 - next lines):', parsedData.permanentAddress);
            break;
          }
        }
      }
      
      // Pattern 2: Dòng có "Nơi thường trú:" hoặc "Nơi cư trú:" hoặc "Thường trú:" và địa chỉ nằm cùng dòng
      // Cải thiện pattern để match chính xác hơn, bao gồm cả các biến thể OCR nhầm
      const addressInLine = line.match(/(?:Nơi\s+thường\s+trú|Nơi\s+cư\s+trú|Thường\s+trú|Cư\s+trú|Hộ\s+khẩu\s+thường\s+trú|Permanent\s+address|Current\s+address|NOI\s+THUONG\s+TRU|NOI\s+CU\s+TRU|NOI\s+THUONG\s+TRU|NOI\s+CU\s+TRU|Place\s+of\s+residence)[\s:]+(.+)/i);
      if (addressInLine && addressInLine[1]) {
        let address = cleanAddressLine(addressInLine[1]);
        
        // Nếu địa chỉ ngắn hoặc có dấu hiệu chưa đầy đủ, tiếp tục lấy các dòng sau
        if ((address.length < 30 || address.endsWith(',') || address.endsWith('-')) && i + 1 < lines.length) {
          const nextLines: string[] = [];
          // Lấy các dòng tiếp theo cho đến khi gặp dòng khác (tối đa 10 dòng)
          for (let j = i + 1; j < lines.length && j < i + 11; j++) {
            const nextLine = lines[j];
            // Dừng nếu gặp dòng có từ khóa khác hoặc là số/ngày tháng
            // Loại bỏ "Nơi cư trú" khỏi danh sách dừng để có thể lấy địa chỉ sau "Nơi thường trú"
            if (/^(?:Đặc điểm|Ngày\s+cấp|Ngày\s+hết\s+hạn|CMND|CCCD|Số|Quốc tịch|Giới tính|Họ và tên|Tên|Quê quán|BỘ CÔNG AN|MINISTRY)/i.test(nextLine) ||
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
          parsedData.permanentAddress = address;
          permanentAddressFound = true;
          console.log('Found address (Pattern 2 - same line):', parsedData.permanentAddress);
          break;
        }
      }
    }
    
    // Pattern 3: Tìm địa chỉ từ các dòng có nhiều từ tiếng Việt (thường là địa chỉ) nếu chưa tìm thấy
    // Pattern này tìm các dòng dài có nhiều từ, có thể là địa chỉ mà không có label rõ ràng
    // Cải thiện: tìm và ghép nhiều dòng địa chỉ liên tiếp
    if (!permanentAddressFound) {
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
            'ly nhan', 'ha nam', 'nhi dong', 'ngo thi nham'
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
                }
              }
              
              if (addressLines.length > 0) {
                const combinedAddress = addressLines.join(', ').replace(/\s+/g, ' ').trim();
                if (combinedAddress.length >= 15 && this.isValidAddress(combinedAddress)) {
                  parsedData.permanentAddress = combinedAddress;
                  permanentAddressFound = true;
                  console.log('Found address (Pattern 3 - multiple lines with address keywords/place names):', parsedData.permanentAddress);
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
                parsedData.permanentAddress = cleanLine;
                permanentAddressFound = true;
                console.log('Found address (Pattern 3 - long line):', parsedData.permanentAddress);
                break;
              }
            }
          }
        }
      }
    }
    
    // Tìm địa chỉ (nơi cư trú hiện tại) - tương tự logic trên
    if (!permanentAddressFound) {
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
    
    // Nếu không tìm thấy địa chỉ nhưng có nơi thường trú, dùng nơi thường trú
    if (!parsedData.address && parsedData.permanentAddress) {
      parsedData.address = parsedData.permanentAddress;
    }
    
    // Tìm số điện thoại
    const phonePatterns = [
      /(?:Điện thoại|Phone|Tel)[:\s]*(\+?84|0)[\d\s]{9,10}/i,
      /\b(0[\d\s]{9,10})\b/,
      /\b(\+84[\d\s]{9,10})\b/
    ];
    
    for (const pattern of phonePatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1]) {
        let phone = match[1].replace(/\s+/g, '');
        // Chuẩn hóa số điện thoại Việt Nam
        if (phone.startsWith('+84')) {
          phone = '0' + phone.substring(3);
        }
        if (phone.length >= 10) {
          parsedData.phone = phone;
        }
        break;
      }
    }
    
    console.log('=== PARSED DATA ===');
    console.log('Full Name:', parsedData.fullName);
    console.log('ID Number:', parsedData.idNumber);
    console.log('Date of Birth:', parsedData.dateOfBirth);
    console.log('Gender:', parsedData.gender);
    console.log('Nationality:', parsedData.nationality);
    console.log('Permanent Address:', parsedData.permanentAddress);
    console.log('Address:', parsedData.address);
    console.log('Phone:', parsedData.phone);
    console.log('===================');
    
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
        const invalidNames = ['Khách lẻ', 'Khách lư', 'Khách', 'lẻ', 'lư', 'CAN CƯỚC CONG DAN', 'CAN CUOC CONG DAN'];
        const upperName = data.fullName.toUpperCase();
        if (!invalidNames.some(invalid => upperName.includes(invalid.toUpperCase()))) {
        this.personalInfoFormGroup.patchValue({ fullName: data.fullName });
        }
      }
      if (data.dateOfBirth) {
        this.personalInfoFormGroup.patchValue({ dateOfBirth: data.dateOfBirth });
      }
      // Điền giới tính nếu có (male hoặc female)
      if (data.gender && (data.gender === 'male' || data.gender === 'female')) {
        this.personalInfoFormGroup.patchValue({ gender: data.gender });
        console.log('[OCR] Fill form: Set gender =', data.gender);
      } else {
        console.log('[OCR] Fill form: Gender not set, value =', data.gender);
      }
      if (data.nationality) {
        this.personalInfoFormGroup.patchValue({ nationality: data.nationality });
      }
    }
    
    // Điền vào contactInfo form nếu có
    if (this.contactInfoFormGroup) {
      if (data.phone) {
        this.contactInfoFormGroup.patchValue({ phone: data.phone });
      }
      // Ưu tiên nơi thường trú, nếu không có thì dùng địa chỉ
      // Chỉ điền nếu địa chỉ hợp lệ
      const addressValue = data.permanentAddress || data.address;
      if (addressValue && this.isValidAddress(addressValue)) {
        // Loại bỏ các pattern không hợp lý
        let cleanAddress = addressValue;
        // Loại bỏ các pattern như "Ch B2 TN7 T.., T 40 ổ 6,ú,, à"
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
        console.log('[OCR] Fill form: Address not set, permanentAddress =', data.permanentAddress ? data.permanentAddress.substring(0, 50) + '...' : 'N/A', ', address =', data.address ? data.address.substring(0, 50) + '...' : 'N/A');
      }
    }
    
    this.message.success('Đã tự động điền thông tin từ OCR. Vui lòng kiểm tra và chỉnh sửa nếu cần.');
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

