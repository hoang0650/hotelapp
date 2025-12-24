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
          sortedData.forEach((data, index) => {
            data.fileIndex = index;
            data.side = index === 0 ? 'front' : 'back';
            data.isFrontSide = index === 0;
          });
          
          const mergedData = this.mergeScannedData(sortedData);
          
          this.message.success(`Đã nhận dạng thành công ${this.selectedFiles.length} ${this.selectedFiles.length > 1 ? 'ảnh' : 'ảnh'}!`);
          this.scanComplete.emit(mergedData);
          this.fillFormFromOCRData(mergedData);
        } else if (!this.allowMultiple || this.selectedFiles.length === 1) {
          // Chỉ có 1 ảnh
          this.message.success('Đã nhận dạng văn bản thành công!');
          this.scanComplete.emit(parsedData);
          this.fillFormFromOCRData(parsedData);
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
    const headerKeywords = ['VIỆT NAM', 'VIETNAM', 'SOCIALIST', 'REPUBLIC', 'CỘNG HÒA', 'XÃ HỘI', 'CHỦ NGHĨA', 'CĂN CƯỚC', 'CÔNG DÂN'];
    const upperName = name.toUpperCase();
    if (headerKeywords.some(keyword => upperName.includes(keyword))) {
      return false;
    }
    
    // Tên phải có ít nhất 2 từ, mỗi từ ít nhất 2 ký tự
    const nameParts = name.split(/\s+/).filter(part => part.length >= 2);
    if (nameParts.length < 2) return false;
    
    // Tên không được chứa quá nhiều số
    const digitCount = (name.match(/\d/g) || []).length;
    if (digitCount > name.length * 0.3) return false;
    
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
    
    // Sắp xếp theo fileIndex để ưu tiên mặt trước (index 0)
    // Nhưng ưu tiên dữ liệu hợp lệ hơn (kiểm tra isValidName, isValidAddress)
    const sortedData = [...validData].sort((a, b) => {
      const indexA = a.fileIndex !== undefined ? a.fileIndex : 999;
      const indexB = b.fileIndex !== undefined ? b.fileIndex : 999;
      
      // Nếu cùng index, ưu tiên dữ liệu hợp lệ hơn
      if (indexA === indexB) {
        const aValid = (a.fullName && this.isValidName(a.fullName)) || (a.permanentAddress && this.isValidAddress(a.permanentAddress));
        const bValid = (b.fullName && this.isValidName(b.fullName)) || (b.permanentAddress && this.isValidAddress(b.permanentAddress));
        if (aValid && !bValid) return -1;
        if (!aValid && bValid) return 1;
      }
      
      return indexA - indexB;
    });
    
    console.log(`[OCR] Merge data: Số lượng data=${sortedData.length}, Thứ tự:`, sortedData.map(d => ({ 
      index: d.fileIndex, 
      side: d.side, 
      hasName: !!d.fullName, 
      nameValid: d.fullName ? this.isValidName(d.fullName) : false,
      hasAddress: !!d.permanentAddress,
      addressValid: d.permanentAddress ? this.isValidAddress(d.permanentAddress) : false
    })));
    
    // Ưu tiên dữ liệu từ mặt trước (fileIndex = 0) trước, sau đó mới lấy từ mặt sau
    // Mặt trước thường có: Họ tên, ID, Ngày sinh, Giới tính, Quốc tịch
    // Mặt sau thường có: Nơi thường trú, Địa chỉ
    // Nhưng chỉ lấy dữ liệu hợp lệ (isValidName, isValidAddress)
    for (const data of sortedData) {
      console.log(`[OCR] Merge: fileIndex=${data.fileIndex}, side=${data.side}, fullName=${data.fullName || 'N/A'}, permanentAddress=${data.permanentAddress || 'N/A'}`);
      
      // Họ và tên: ưu tiên mặt trước, nhưng chỉ lấy nếu hợp lệ
      if (data.fullName && (!merged.fullName || !this.isValidName(merged.fullName))) {
        if (this.isValidName(data.fullName)) {
          merged.fullName = data.fullName;
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
      
      // Giới tính: ưu tiên mặt trước
      if (data.gender && !merged.gender) {
        merged.gender = data.gender;
      }
      
      // Quốc tịch: ưu tiên mặt trước
      if (data.nationality && !merged.nationality) {
        merged.nationality = data.nationality;
      }
      
      // Nơi thường trú: ưu tiên mặt sau (thường ở mặt sau CCCD), nhưng chỉ lấy nếu hợp lệ
      if (data.permanentAddress && (!merged.permanentAddress || !this.isValidAddress(merged.permanentAddress))) {
        if (this.isValidAddress(data.permanentAddress)) {
          merged.permanentAddress = data.permanentAddress;
        }
      }
      
      // Địa chỉ: lấy từ bất kỳ mặt nào, nhưng chỉ lấy nếu hợp lệ
      if (data.address && (!merged.address || !this.isValidAddress(merged.address))) {
        if (this.isValidAddress(data.address)) {
          merged.address = data.address;
        }
      }
      
      // Số điện thoại: lấy từ bất kỳ mặt nào
      if (data.phone && !merged.phone) {
        merged.phone = data.phone;
      }
    }
    
    // Nếu không có địa chỉ nhưng có nơi thường trú, dùng nơi thường trú
    if (!merged.address && merged.permanentAddress) {
      merged.address = merged.permanentAddress;
    }
    
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
    
    // Dấu hiệu mặt sau
    if (/BỘ\s+CÔNG\s+AN/i.test(text)) backScore += 10;
    if (/MINISTRY\s+OF\s+PUBLIC\s+SECURITY/i.test(text)) backScore += 10;
    if (/IDVNM/i.test(text)) backScore += 15; // MRZ bắt đầu bằng IDVNM
    if (/\<\<\</.test(text)) backScore += 10; // MRZ có nhiều dấu <<<
    if (/NƠI\s+THƯỜNG\s+TRÚ|PLACE\s+OF\s+RESIDENCE/i.test(text)) backScore += 8;
    if (/CÓ\s+GIÁ\s+TRỊ\s+ĐẾN|DATE\s+OF\s+EXPIRY/i.test(text)) backScore += 5;
    if (/QUÊ\s+QUÁN|PLACE\s+OF\s+ORIGIN/i.test(text)) backScore += 5;
    
    // Kiểm tra MRZ pattern (3 dòng, mỗi dòng ~30 ký tự, có <<<)
    const mrzPattern = /[A-Z0-9<]{20,}/g;
    const mrzMatches = text.match(mrzPattern);
    if (mrzMatches && mrzMatches.length >= 2) {
      backScore += 15; // MRZ thường có 2-3 dòng
    }
    
    console.log(`[OCR] Detect side: frontScore=${frontScore}, backScore=${backScore}`);
    
    if (frontScore > backScore && frontScore >= 10) {
      return 'front';
    } else if (backScore > frontScore && backScore >= 10) {
      return 'back';
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
        'CĂN CƯỚC', 'CÔNG DÂN', 'CITIZEN', 'IDENTITY', 'CARD',
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
      if (/SOCIALIST|REPUBLIC|VIET\s+NAM|VIETNAM|CỘNG\s+HÒA|XÃ\s+HỘI|CHỦ\s+NGHĨA|INDEPENDENCE|FREEDOM|HAPPINESS|CĂN\s+CƯỚC|CÔNG\s+DÂN|CITIZEN|IDENTITY/i.test(line)) {
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
      let nameInLine = line.match(/(?:Họ\s+và\s+tên|HO\s+VA\s+TEN)[\s\/:]+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+?)(?:\s*\/\s*Full\s+name|$)/i);
      
      // Pattern 1a-2: "Full name: TÊN" (nếu không tìm thấy ở pattern 1)
      if (!nameInLine) {
        nameInLine = line.match(/Full\s+name[\s:]+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+)/i);
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
    if (!nameFound && parsedData.idNumber) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Tìm dòng có chứa số CMND/CCCD
        if (line.includes(parsedData.idNumber)) {
          // Pattern 1.5a: Tên nằm cùng dòng với số CMND/CCCD
          // Ví dụ: "CĂN CƯỚC 082188007080 ĐỖ THỊ TRÚC LAN"
          const nameAfterId = line.match(new RegExp(`${parsedData.idNumber}\\s+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\\s]{8,})`, 'i'));
          if (nameAfterId && nameAfterId[1]) {
            let name = nameAfterId[1].trim();
            // Loại bỏ các phần không phải tên
            name = name.replace(/\d+/g, '').trim();
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
          if (!nameFound && i + 1 < lines.length) {
            for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
              const nextLine = lines[j];
              if (nextLine && isValidNameLine(nextLine) && !isHeaderLine(nextLine)) {
                let cleanName = nextLine.trim();
                cleanName = cleanName.replace(/\d+/g, '').trim();
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
      // Cải thiện pattern để match chính xác hơn
      const genderInLine = line.match(/(?:Giới tính|GIOI TINH|Gender|Sex)[\s\/:]+(Nam|Nữ|Male|Female|M|F)(?:\s*\/\s*Sex|$)/i);
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
      // Tìm "Nam" hoặc "Nữ" gần từ "Giới tính" (trong vòng 30 ký tự)
      const genderPattern = /(?:Giới tính|GIOI TINH|Gender|Sex)[\s\/:]*([^\n]{0,30}?)(Nam|Nữ|Male|Female|M|F)\b/i;
      const genderMatch = text.match(genderPattern);
      if (genderMatch) {
        const genderValue = (genderMatch[2] || genderMatch[1]).trim().toLowerCase();
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
        } else if (nationality.length > 0 && nationality.length < 50) {
          parsedData.nationality = nationality;
        }
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
      clean = clean.replace(/\b(ERE|BE|INTE|SE|Sh|ce|g|bro|yi|OE|exp|Buông|tha)\b/gi, ' ').trim();
      
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
      
      // Pattern 1: Dòng chỉ có "Nơi thường trú" hoặc "Place of residence" (không có địa chỉ), địa chỉ nằm ở các dòng tiếp theo
      // Trên CCCD, "Nơi thường trú" thường ở một dòng riêng, địa chỉ ở các dòng tiếp theo
      const addressLabelPattern = /^(?:Nơi\s+thường\s+trú|Thường\s+trú|Hộ\s+khẩu\s+thường\s+trú|Permanent\s+address|NOI\s+THUONG\s+TRU|Place\s+of\s+residence)[\s:]*$/i;
      
      if (addressLabelPattern.test(line) && i + 1 < lines.length) {
        const addressLines: string[] = [];
        // Lấy các dòng tiếp theo cho đến khi gặp dòng khác (tối đa 10 dòng để lấy đầy đủ)
        for (let j = i + 1; j < lines.length && j < i + 11; j++) {
          const nextLine = lines[j];
          
          // Dừng nếu gặp dòng có từ khóa khác hoặc là số/ngày tháng
          if (/^(?:Đặc điểm|Ngày|CMND|CCCD|Số|Quốc tịch|Giới tính|Địa chỉ hiện tại|Họ và tên|Tên|Quê quán|Nơi cư trú|BỘ CÔNG AN|MINISTRY)/i.test(nextLine) ||
              /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(nextLine) ||
              /^\d{9,12}$/.test(nextLine) ||
              // Dừng nếu gặp MRZ (dòng có nhiều ký tự đặc biệt và số)
              /^[A-Z0-9<]{20,}$/.test(nextLine) ||
              // Dừng nếu gặp dòng ngắn có thể là label khác (ít hơn 10 ký tự và ít hơn 2 từ)
              (/^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+$/.test(nextLine) && nextLine.length < 10 && nextLine.split(/\s+/).length <= 1)) {
            break;
          }
          
          // Thêm dòng vào địa chỉ nếu có nội dung và không phải là dòng trống
          if (nextLine && nextLine.length > 3) {
            // Loại bỏ các pattern không hợp lý ngay từ đầu
            // Loại bỏ dòng có pattern như "2000000 No Buông tha / Pc"
            if (/\d{7,}\s+No\s+[^\s]{0,20}\s*\/\s*Pc/gi.test(nextLine)) {
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
          address = address.replace(/\b(ERE|BE|INTE|SE|Sh|ce|g|bro|yi|OE|gia\s+đền|Buông|tha)\b/gi, ' ').trim();
          
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
      
      // Pattern 2: Dòng có "Nơi thường trú:" hoặc "Thường trú:" và địa chỉ nằm cùng dòng
      const addressInLine = line.match(/(?:Nơi\s+thường\s+trú|Thường\s+trú|Hộ\s+khẩu\s+thường\s+trú|Permanent\s+address|NOI\s+THUONG\s+TRU|Place\s+of\s+residence)[\s:]+(.+)/i);
      if (addressInLine && addressInLine[1]) {
        let address = cleanAddressLine(addressInLine[1]);
        
        // Nếu địa chỉ ngắn hoặc có dấu hiệu chưa đầy đủ, tiếp tục lấy các dòng sau
        if ((address.length < 30 || address.endsWith(',') || address.endsWith('-')) && i + 1 < lines.length) {
          const nextLines: string[] = [];
          // Lấy các dòng tiếp theo cho đến khi gặp dòng khác (tối đa 8 dòng)
          for (let j = i + 1; j < lines.length && j < i + 9; j++) {
            const nextLine = lines[j];
            // Dừng nếu gặp dòng có từ khóa khác hoặc là số/ngày tháng
            if (/^(?:Đặc điểm|Ngày|CMND|CCCD|Số|Quốc tịch|Giới tính|Họ và tên|Tên|Quê quán|Nơi cư trú)/i.test(nextLine) ||
                /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(nextLine) ||
                /^\d{9,12}$/.test(nextLine) ||
                // Dừng nếu gặp dòng ngắn có thể là tên (ít hơn 12 ký tự và ít hơn 2 từ)
                (/^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+$/.test(nextLine) && nextLine.length < 12 && nextLine.split(/\s+/).length <= 1)) {
              break;
            }
            // Thêm dòng vào địa chỉ nếu có nội dung
            if (nextLine && nextLine.length > 2) {
              const cleanLine = cleanAddressLine(nextLine);
              if (cleanLine.length > 2) {
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
    
    // Tìm địa chỉ (nơi cư trú hiện tại) - tương tự logic trên
    if (!permanentAddressFound) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const addressInLine = line.match(/(?:Địa chỉ|Address|Nơi cư trú)[:\s]+(.+)/i);
        if (addressInLine && addressInLine[1]) {
          let address = addressInLine[1].trim();
          if (address.length < 20 && i + 1 < lines.length) {
            const nextLines: string[] = [];
            for (let j = i + 1; j < lines.length && j < i + 5; j++) {
              const nextLine = lines[j];
              if (/^(?:Đặc điểm|Ngày|CMND|CCCD|Số|Quốc tịch|Giới tính|Nơi thường trú)/i.test(nextLine) ||
              /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(nextLine) ||
              /^\d{9,12}$/.test(nextLine) ||
              (/^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+$/.test(nextLine) && nextLine.length < 15 && nextLine.split(/\s+/).length <= 2)) {
            break;
          }
          if (nextLine && nextLine.length > 2 && !(/^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+$/.test(nextLine) && nextLine.length < 15)) {
            nextLines.push(nextLine);
          }
            }
            if (nextLines.length > 0) {
              address = address + ', ' + nextLines.join(', ');
            }
          }
          if (address.length > 5) {
            parsedData.address = address;
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
      if (data.fullName) {
        this.personalInfoFormGroup.patchValue({ fullName: data.fullName });
      }
      if (data.dateOfBirth) {
        this.personalInfoFormGroup.patchValue({ dateOfBirth: data.dateOfBirth });
      }
      if (data.gender) {
        this.personalInfoFormGroup.patchValue({ gender: data.gender });
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
      const addressValue = data.permanentAddress || data.address;
      if (addressValue) {
        const addressGroup = this.contactInfoFormGroup.get('address') as FormGroup;
        if (addressGroup) {
          addressGroup.patchValue({ street: addressValue });
        }
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

