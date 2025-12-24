import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { createWorker, Worker } from 'tesseract.js';
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
    const fileArray = Array.from(files) as File[];
    
    for (const file of fileArray) {
      if (!file.type.startsWith('image/')) {
        this.message.error('Vui lòng chọn file ảnh');
        continue;
      }
      
      // Thêm vào danh sách
      if (!this.allowMultiple) {
        this.selectedFiles = [file];
        this.previewImages = [];
        this.scannedData = [];
      } else {
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
      
      // Tự động scan OCR
      this.scanOCR(file);
    }
    
    // Reset input để có thể chọn lại file cùng tên
    event.target.value = '';
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

  async scanOCR(file: File): Promise<void> {
    this.isScanning = true;
    this.ocrProgress = 0;
    this.ocrStatus = 'Đang xử lý ảnh trước OCR...';
    
    try {
      // Pre-process ảnh trước khi OCR (backend hoặc client-side)
      if (this.useBackendPreprocessing) {
        this.ocrStatus = 'Đang tối ưu ảnh trên server (sharp: grayscale, contrast, brightness, sharpen)...';
      } else {
        this.ocrStatus = 'Đang tối ưu ảnh (grayscale, contrast, brightness)...';
      }
      const processedFile = await this.preprocessImage(file);
      
      this.ocrStatus = 'Đang khởi tạo OCR...';
      // Tạo worker với ngôn ngữ tiếng Việt và tiếng Anh
      this.ocrWorker = await createWorker('vie+eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            this.ocrProgress = Math.round(m.progress * 100);
            this.ocrStatus = `Đang nhận dạng: ${this.ocrProgress}%`;
          } else if (m.status === 'loading tesseract core') {
            this.ocrStatus = 'Đang tải Tesseract core...';
          } else if (m.status === 'initializing tesseract') {
            this.ocrStatus = 'Đang khởi tạo Tesseract...';
          } else if (m.status === 'loading language traineddata') {
            this.ocrStatus = 'Đang tải dữ liệu ngôn ngữ...';
          } else {
            this.ocrStatus = m.status || 'Đang xử lý...';
          }
        }
      });
      
      this.ocrStatus = 'Đang nhận dạng văn bản từ ảnh...';
      // Sử dụng ảnh đã được pre-process
      const { data: { text } } = await this.ocrWorker.recognize(processedFile);
      
      if (text && text.trim().length > 0) {
        this.message.success('Đã nhận dạng văn bản thành công!');
        const parsedData = this.parseOCRText(text);
        this.scannedData.push(parsedData);
        
        // Nếu scan nhiều ảnh, gộp dữ liệu lại
        if (this.allowMultiple && this.selectedFiles.length > 1 && this.scannedData.length === this.selectedFiles.length) {
          // Gộp tất cả dữ liệu từ các lần scan
          const mergedData = this.mergeScannedData(this.scannedData);
          this.scanComplete.emit(mergedData);
          this.fillFormFromOCRData(mergedData);
        } else if (!this.allowMultiple || this.selectedFiles.length === 1) {
          // Chỉ scan 1 ảnh hoặc đã scan xong tất cả
          const finalData = this.allowMultiple && this.scannedData.length > 1 
            ? this.mergeScannedData(this.scannedData)
            : parsedData;
          this.scanComplete.emit(finalData);
          this.fillFormFromOCRData(finalData);
        }
      } else {
        this.message.warning('Không thể nhận dạng văn bản từ ảnh. Vui lòng thử lại hoặc nhập thủ công.');
      }
    } catch (error: any) {
      console.error('OCR Error:', error);
      this.message.error('Lỗi khi quét OCR: ' + (error.message || 'Vui lòng thử lại'));
    } finally {
      this.isScanning = false;
      this.ocrProgress = 0;
      this.ocrStatus = '';
      
      // Terminate worker để giải phóng bộ nhớ
      if (this.ocrWorker) {
        await this.ocrWorker.terminate();
        this.ocrWorker = null;
      }
    }
  }

  mergeScannedData(dataArray: any[]): any {
    // Gộp dữ liệu từ nhiều lần scan (mặt trước và mặt sau)
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
    
    // Ưu tiên dữ liệu từ lần scan đầu (mặt trước thường có đầy đủ thông tin hơn)
    for (const data of dataArray) {
      if (data.fullName && !merged.fullName) merged.fullName = data.fullName;
      if (data.idNumber && !merged.idNumber) merged.idNumber = data.idNumber;
      if (data.dateOfBirth && !merged.dateOfBirth) merged.dateOfBirth = data.dateOfBirth;
      if (data.gender && !merged.gender) merged.gender = data.gender;
      if (data.nationality && !merged.nationality) merged.nationality = data.nationality;
      if (data.permanentAddress && !merged.permanentAddress) merged.permanentAddress = data.permanentAddress;
      if (data.address && !merged.address) merged.address = data.address;
      if (data.phone && !merged.phone) merged.phone = data.phone;
    }
    
    return merged;
  }

  parseOCRText(text: string): any {
    // Parse text từ OCR để lấy thông tin CCCD/GPLX
    // Giữ nguyên các dòng để parse chính xác hơn
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    
    // Debug: Log để kiểm tra
    console.log('=== OCR TEXT DEBUG ===');
    console.log('Full text:', text);
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
    
    // Tìm họ và tên - cải thiện logic: bỏ qua dòng "Họ và tên" và lấy dòng tiếp theo
    let nameFound = false;
    
    // Pattern 1: Tìm dòng có "Họ và tên" hoặc "Tên" và tên nằm ở dòng tiếp theo (ưu tiên - phù hợp với CCCD)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Pattern 1: Dòng chỉ có "Họ và tên" hoặc "Tên" (có thể có dấu hai chấm hoặc không), tên nằm ở dòng tiếp theo
      // Trên CCCD, "Họ và tên" thường ở một dòng, tên ở dòng tiếp theo
      if ((/^(?:Họ\s+và\s+tên|Tên|Name|HO\s+VA\s+TEN|HO\s+VA\s+TEN|Full\s+name)[\s:]*$/i.test(line) || 
           /^(?:Họ\s+và\s+tên|Tên|Name|HO\s+VA\s+TEN|Full\s+name)$/i.test(line) ||
           /^(?:Họ\s+và\s+tên|Tên|Name|HO\s+VA\s+TEN|Full\s+name)[\s:]+$/i.test(line)) && 
          i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        // Kiểm tra dòng tiếp theo có phải là tên không (toàn chữ cái, không có số, không phải ngày tháng)
        if (nextLine && 
            /^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-z\s]+$/i.test(nextLine) && 
            !/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(nextLine) && 
            !/^(?:Ngày|Giới|Quốc|Địa|CMND|CCCD|Số|Nơi|Quê|Đặc)/i.test(nextLine) &&
            nextLine.length > 5 && 
            nextLine.split(/\s+/).length >= 2 &&
            // Đảm bảo không phải là số CMND/CCCD
            !/^\d{9,12}$/.test(nextLine)) {
          // Loại bỏ số và ký tự đặc biệt
          let cleanName = nextLine.replace(/\d+/g, '').replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]/gi, '').trim();
          cleanName = cleanName.replace(/\s+/g, ' ').trim();
          if (cleanName.length > 5 && cleanName.split(/\s+/).length >= 2) {
            parsedData.fullName = cleanName;
            nameFound = true;
            console.log('Found name (Pattern 1 - next line):', parsedData.fullName, 'from line:', nextLine);
            break;
          }
        }
      }
    }
    
    // Pattern 2: Nếu chưa tìm thấy, tìm dòng có nhiều chữ cái in hoa (thường là tên trên CCCD)
    if (!nameFound) {
      for (const line of lines) {
        // Tìm dòng có ít nhất 8 ký tự, toàn chữ cái in hoa (hoặc có dấu), có ít nhất 2 từ
        // Trên CCCD, tên thường viết in hoa
        if (line.length >= 8 && 
            /^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+$/i.test(line) &&
            !/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(line) &&
            !/^(?:Ngày sinh|Date|Giới tính|Quốc tịch|Địa chỉ|Nơi|CMND|CCCD|Số|Quê quán)/i.test(line) &&
            line.split(/\s+/).length >= 2 &&
            // Đảm bảo không phải là số CMND/CCCD
            !/^\d{9,12}$/.test(line)) {
          parsedData.fullName = line.trim();
          nameFound = true;
          break;
        }
      }
    }
    
    // Pattern 3: Tìm dòng có chữ cái thường (nếu không tìm thấy in hoa)
    if (!nameFound) {
      for (const line of lines) {
        if (line.length >= 8 && 
            /^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐa-z\s]+$/i.test(line) &&
            !/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(line) &&
            !/^(?:Ngày sinh|Date|Giới tính|Quốc tịch|Địa chỉ|Nơi|CMND|CCCD|Số|Quê quán)/i.test(line) &&
            line.split(/\s+/).length >= 2 &&
            !/^\d{9,12}$/.test(line)) {
          parsedData.fullName = line.trim();
          break;
        }
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
    
    // Tìm giới tính
    if (/Nam|Male|M/i.test(normalizedText)) {
      parsedData.gender = 'male';
    } else if (/Nữ|Female|F/i.test(normalizedText)) {
      parsedData.gender = 'female';
    }
    
    // Tìm quốc tịch
    const nationalityPattern = /(?:Quốc tịch|Nationality)[:\s]+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+)/i;
    const nationalityMatch = normalizedText.match(nationalityPattern);
    if (nationalityMatch && nationalityMatch[1]) {
      parsedData.nationality = nationalityMatch[1].trim();
    }
    
    // Tìm nơi thường trú (thường ở mặt sau CCCD) - cải thiện logic
    let permanentAddressFound = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Pattern 1: Dòng chỉ có "Nơi thường trú" hoặc "Place of residence" (không có địa chỉ), địa chỉ nằm ở các dòng tiếp theo
      // Trên CCCD, "Nơi thường trú" thường ở một dòng riêng, địa chỉ ở các dòng tiếp theo
      const addressLabelPattern = /^(?:Nơi\s+thường\s+trú|Thường\s+trú|Hộ\s+khẩu\s+thường\s+trú|Permanent\s+address|NOI\s+THUONG\s+TRU|Place\s+of\s+residence)[\s:]*$/i;
      
      if (addressLabelPattern.test(line) && i + 1 < lines.length) {
        const addressLines: string[] = [];
        // Lấy các dòng tiếp theo cho đến khi gặp dòng khác
        for (let j = i + 1; j < lines.length && j < i + 6; j++) {
          const nextLine = lines[j];
          // Dừng nếu gặp dòng có từ khóa khác hoặc là số/ngày tháng
          if (/^(?:Đặc điểm|Ngày|CMND|CCCD|Số|Quốc tịch|Giới tính|Địa chỉ hiện tại|Họ và tên|Tên|Quê quán)/i.test(nextLine) ||
              /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(nextLine) ||
              /^\d{9,12}$/.test(nextLine) ||
              // Dừng nếu gặp dòng ngắn có thể là tên (ít hơn 15 ký tự và ít hơn 3 từ)
              (/^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+$/.test(nextLine) && nextLine.length < 15 && nextLine.split(/\s+/).length <= 2)) {
            break;
          }
          // Thêm dòng vào địa chỉ nếu có nội dung
          if (nextLine && nextLine.length > 2) {
            // Loại bỏ các phần không cần thiết
            let cleanLine = nextLine;
            cleanLine = cleanLine.replace(/\([^)]*Place\s+of\s+residence[^)]*\)/gi, '').trim();
            cleanLine = cleanLine.replace(/\([^)]*Có\s+gia\s+tị[^)]*\)/gi, '').trim();
            cleanLine = cleanLine.replace(/\([^)]*Có\s+giá\s+trị[^)]*\)/gi, '').trim();
            cleanLine = cleanLine.replace(/Place\s+of\s+residence[^,]*/gi, '').trim();
            cleanLine = cleanLine.replace(/Có\s+gia\s+tị\s+đến\s+\d+/gi, '').trim();
            cleanLine = cleanLine.replace(/Có\s+giá\s+trị\s+đến\s+\d+/gi, '').trim();
            
            // Loại bỏ ký tự đặc biệt không cần thiết
            cleanLine = cleanLine.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s,\.\-]/gi, '').trim();
            // Loại bỏ các ký tự đặc biệt ở đầu/cuối
            cleanLine = cleanLine.replace(/^[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]+|[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s,\.\-]+$/gi, '').trim();
            if (cleanLine.length > 2) {
              addressLines.push(cleanLine);
            }
          }
        }
        if (addressLines.length > 0) {
          let address = addressLines.join(', ').replace(/\s+/g, ' ').trim();
          // Loại bỏ lại các phần không cần thiết sau khi gộp
          address = address.replace(/\([^)]*Place\s+of\s+residence[^)]*\)/gi, '').trim();
          address = address.replace(/\([^)]*Có\s+gia\s+tị[^)]*\)/gi, '').trim();
          address = address.replace(/\([^)]*Có\s+giá\s+trị[^)]*\)/gi, '').trim();
          address = address.replace(/Place\s+of\s+residence[^,]*/gi, '').trim();
          address = address.replace(/Có\s+gia\s+tị\s+đến\s+\d+/gi, '').trim();
          address = address.replace(/Có\s+giá\s+trị\s+đến\s+\d+/gi, '').trim();
          // Loại bỏ các phần có chứa "ô i a" hoặc các ký tự lạ
          address = address.replace(/[^,\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s\.\-]+/gi, ' ').trim();
          // Loại bỏ các từ đơn lẻ không hợp lý
          address = address.replace(/\b[ôioa]\b/gi, '').trim();
          // Loại bỏ các ký tự đặc biệt còn sót lại
          address = address.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s,\.\-]/gi, '').trim();
          // Loại bỏ dấu phẩy thừa ở đầu/cuối
          address = address.replace(/^[,\.\s]+|[,\.\s]+$/g, '').trim();
          // Chuẩn hóa lại khoảng trắng
          address = address.replace(/\s+/g, ' ').trim();
          
          if (address.length > 5) {
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
        let address = addressInLine[1].trim();
        
        // Loại bỏ các phần không cần thiết như "(Place of residence...", "Có gia tị đến...", etc.
        address = address.replace(/\([^)]*Place\s+of\s+residence[^)]*\)/gi, '').trim();
        address = address.replace(/\([^)]*Có\s+gia\s+tị[^)]*\)/gi, '').trim();
        address = address.replace(/\([^)]*Có\s+giá\s+trị[^)]*\)/gi, '').trim();
        address = address.replace(/Place\s+of\s+residence[^,]*/gi, '').trim();
        address = address.replace(/Có\s+gia\s+tị\s+đến\s+\d+/gi, '').trim();
        address = address.replace(/Có\s+giá\s+trị\s+đến\s+\d+/gi, '').trim();
        
        // Loại bỏ các ký tự đặc biệt không cần thiết ở cuối (như >, |, /, etc.)
        address = address.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s,\.\-]+$/gi, '').trim();
        // Loại bỏ các ký tự đặc biệt ở đầu
        address = address.replace(/^[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]+/gi, '').trim();
        
        // Nếu địa chỉ ngắn hoặc có dấu hiệu chưa đầy đủ, tiếp tục lấy các dòng sau
        if ((address.length < 30 || address.endsWith(',') || address.endsWith('-')) && i + 1 < lines.length) {
          const nextLines: string[] = [];
          // Lấy các dòng tiếp theo cho đến khi gặp dòng khác
          for (let j = i + 1; j < lines.length && j < i + 6; j++) {
            const nextLine = lines[j];
            // Dừng nếu gặp dòng có từ khóa khác hoặc là số/ngày tháng
            if (/^(?:Đặc điểm|Ngày|CMND|CCCD|Số|Quốc tịch|Giới tính|Họ và tên|Tên|Quê quán)/i.test(nextLine) ||
                /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(nextLine) ||
                /^\d{9,12}$/.test(nextLine) ||
                // Dừng nếu gặp dòng ngắn có thể là tên (ít hơn 15 ký tự và ít hơn 3 từ)
                (/^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+$/.test(nextLine) && nextLine.length < 15 && nextLine.split(/\s+/).length <= 2)) {
              break;
            }
            // Thêm dòng vào địa chỉ nếu có nội dung
            if (nextLine && nextLine.length > 2) {
              // Loại bỏ các phần không cần thiết
              let cleanLine = nextLine;
              cleanLine = cleanLine.replace(/\([^)]*Place\s+of\s+residence[^)]*\)/gi, '').trim();
              cleanLine = cleanLine.replace(/\([^)]*Có\s+gia\s+tị[^)]*\)/gi, '').trim();
              cleanLine = cleanLine.replace(/\([^)]*Có\s+giá\s+trị[^)]*\)/gi, '').trim();
              cleanLine = cleanLine.replace(/Place\s+of\s+residence[^,]*/gi, '').trim();
              cleanLine = cleanLine.replace(/Có\s+gia\s+tị\s+đến\s+\d+/gi, '').trim();
              cleanLine = cleanLine.replace(/Có\s+giá\s+trị\s+đến\s+\d+/gi, '').trim();
              
              // Loại bỏ ký tự đặc biệt không cần thiết
              cleanLine = cleanLine.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s,\.\-]/gi, '').trim();
              // Loại bỏ các ký tự đặc biệt ở đầu/cuối
              cleanLine = cleanLine.replace(/^[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]+|[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s,\.\-]+$/gi, '').trim();
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
        // Loại bỏ các ký tự đặc biệt còn sót lại
        address = address.replace(/[^\wÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s,\.\-]/gi, '').trim();
        // Loại bỏ dấu phẩy thừa ở đầu/cuối
        address = address.replace(/^[,\.\s]+|[,\.\s]+$/g, '').trim();
        
        if (address.length > 5) {
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
    console.log('Date of Birth:', parsedData.dateOfBirth);
    console.log('Permanent Address:', parsedData.permanentAddress);
    console.log('ID Number:', parsedData.idNumber);
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

  clearImage(index?: number): void {
    if (index !== undefined) {
      // Xóa ảnh cụ thể
      this.selectedFiles.splice(index, 1);
      this.previewImages.splice(index, 1);
      this.scannedData.splice(index, 1);
    } else {
      // Xóa tất cả
      this.selectedFiles = [];
      this.previewImages = [];
      this.scannedData = [];
    }
  }
}

