import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Service để quản lý translation toàn hệ thống
 * Đảm bảo tất cả component có thể sử dụng translate
 */
@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private currentLangSubject = new BehaviorSubject<string>('vi');
  public currentLang$: Observable<string> = this.currentLangSubject.asObservable();

  constructor(private translate: TranslateService) {
    // Khởi tạo ngôn ngữ mặc định
    const savedLang = localStorage.getItem('language') || 'vi';
    this.translate.setDefaultLang('vi');
    this.translate.use(savedLang);
    this.currentLangSubject.next(savedLang);
  }

  /**
   * Chuyển đổi ngôn ngữ
   */
  switchLanguage(lang: string): void {
    this.translate.use(lang);
    localStorage.setItem('language', lang);
    this.currentLangSubject.next(lang);
  }

  /**
   * Lấy ngôn ngữ hiện tại
   */
  getCurrentLang(): string {
    return this.translate.currentLang || 'vi';
  }

  /**
   * Translate một key
   */
  translateKey(key: string, params?: any): string {
    return this.translate.instant(key, params);
  }

  /**
   * Translate một key async
   */
  translateKeyAsync(key: string, params?: any): Observable<string> {
    return this.translate.get(key, params);
  }
}

