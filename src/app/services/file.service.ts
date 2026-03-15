import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface PreprocessImageResponse {
  success: boolean;
  processedImage: string; // data URL
  metadata?: {
    originalWidth: number;
    originalHeight: number;
    processedWidth: number;
    processedHeight: number;
    format: string;
  };
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FileService {
  private apiUrl = `${environment.apiUrl}/files`;
  private aiUrl = `${environment.aiUrl}`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Authorization': `Bearer ${token || ''}`
    });
  }

  /**
 * Quét 1 mặt (CCCD mặt trước hoặc Passport)
 */
async ocrSingleSide(file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file); // Backend mới dùng key là 'file'

  try {
    const response = await firstValueFrom(
      this.http.post<any>(`${this.aiUrl}/ocr`, formData)
    );
    return response;
  } catch (error: any) {
    console.error('OCR Single Side Error:', error);
    throw error;
  }
}

 /**
 * Quét 2 mặt (CCCD/GPLX Mặt trước + Mặt sau)
 */
async ocrTwoSides(front: File, back: File): Promise<any> {
  const formData = new FormData();
  formData.append('front', front); // Key 'front' khớp với FastAPI
  formData.append('back', back);   // Key 'back' khớp với FastAPI

  try {
    const response = await firstValueFrom(
      this.http.post<any>(`${this.aiUrl}/ocr-card`, formData)
    );
    return response;
  } catch (error: any) {
    console.error('OCR Two Sides Error:', error);
    throw error;
  }
}

  async geminiParse(prompt: string, tenantId: string = 'default'): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.post<any>(`${this.aiUrl}/chat`, {
          tenant_id: tenantId,
          question: prompt
        })
      );
      if (response && typeof response.answer === 'string') {
        return response.answer;
      }
      // Backward compatibility if server returns {text}
      return response?.text || '';
    } catch (error: any) {
      console.error('Error calling chat parsing service:', error);
      // Fallback: return empty string to continue OCR pipeline without hard failure
      return '';
    }
  }

  /**
   * Pre-process ảnh cho OCR sử dụng sharp trên backend
   * @param file File ảnh cần xử lý
   * @returns Promise với data URL của ảnh đã xử lý
   */
  async preprocessImageForOCR(file: File): Promise<PreprocessImageResponse> {
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await firstValueFrom(
        this.http.post<PreprocessImageResponse>(
          `${this.aiUrl}/preprocess-ocr`,
          formData
        )
      );

      return response;
    } catch (error: any) {
      console.error('Error preprocessing image:', error);
      return {
        success: false,
        processedImage: '',
        error: error.error?.error || error.message || 'Lỗi khi xử lý ảnh'
      };
    }
  }

  /**
   * Upload ảnh lên server
   */
  uploadImage(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('image', file);

    return this.http.post(`${this.apiUrl}/upload`, formData, {
      headers: this.getHeaders()
    });
  }

  /**
   * Lấy ảnh theo ID
   */
  getImageById(imageId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${imageId}`, {
      headers: this.getHeaders(),
      responseType: 'blob'
    });
  }
}

