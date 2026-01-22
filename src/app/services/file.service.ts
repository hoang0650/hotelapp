import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

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

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token || ''}`
    });
  }

  /**
   * OCR ảnh bằng PaddleOCR (PHGroup-AI FastAPI)
   */
  async ocrWithPaddle(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('image', file);
    try {
      const response = await firstValueFrom(
        this.http.post<any>(
          `${this.aiUrl}/ocr`,
          formData
        )
      );
      return response;
    } catch (error: any) {
      console.error('Error calling PaddleOCR service:', error);
      throw error;
    }
  }

  async ocrCard(front: File | null, back: File | null): Promise<any> {
    const formData = new FormData();
    if (front) formData.append('front', front);
    if (back) formData.append('back', back);
    try {
      const response = await firstValueFrom(
        this.http.post<any>(`${this.aiUrl}/ocr-card`, formData)
      );
      return response;
    } catch (error: any) {
      console.error('Error calling OCR card service:', error);
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

