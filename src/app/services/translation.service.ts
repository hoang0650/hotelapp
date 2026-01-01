import { Injectable, NgZone } from '@angular/core';
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

  constructor(
    private translate: TranslateService,
    private ngZone: NgZone
  ) {
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
    console.log(`Switching language to: ${lang}`);
    console.log(`Current language before switch: ${this.translate.currentLang}`);
    
    // Set default lang first to ensure fallback works
    this.translate.setDefaultLang('vi');
    
    // Use NgZone to ensure change detection runs
    this.ngZone.run(() => {
      this.translate.use(lang).subscribe({
        next: (translations) => {
          console.log(`✅ Language switched successfully to: ${lang}`);
          console.log(`Current language after switch: ${this.translate.currentLang}`);
          console.log(`Translations loaded:`, translations ? 'Yes' : 'No');
          
          // Check if translations are actually loaded
          if (translations && Object.keys(translations).length > 0) {
            console.log(`✅ Translations object has ${Object.keys(translations).length} keys`);
            console.log(`Sample keys:`, Object.keys(translations).slice(0, 5));
          } else {
            console.warn(`⚠️ Translations object is empty or null!`);
          }
          
          // Test translation immediately
          const testTranslation = this.translate.instant('NAVBAR.HOME');
          console.log(`Test translation (NAVBAR.HOME): "${testTranslation}"`);
          
          if (testTranslation === 'NAVBAR.HOME' || testTranslation === 'Trang chủ') {
            console.error(`❌ Translation not working! Got: "${testTranslation}"`);
            console.error(`This means translations are not loaded or language is not set correctly`);
          }
          
          // Verify the language was actually set
          if (this.translate.currentLang !== lang) {
            console.warn(`⚠️ Language mismatch! Expected: ${lang}, Actual: ${this.translate.currentLang}`);
            // Try to use the language again if there's a mismatch
            this.translate.use(lang).subscribe(() => {
              localStorage.setItem('language', lang);
              this.currentLangSubject.next(lang);
            });
          } else {
            localStorage.setItem('language', lang);
            this.currentLangSubject.next(lang);
            
            // Force change detection by triggering a zone run
            setTimeout(() => {
              this.ngZone.run(() => {
                // This ensures all components get notified
                console.log(`🔄 Forcing change detection for language: ${lang}`);
                // Trigger onLangChange manually if needed
                const currentLang = this.translate.currentLang;
                console.log(`Final currentLang: ${currentLang}`);
              });
            }, 100);
          }
        },
        error: (error) => {
          console.error(`Error switching language to ${lang}:`, error);
          console.error('Error details:', JSON.stringify(error, null, 2));
          // Fallback to Vietnamese if error occurs
          if (lang !== 'vi') {
            console.warn(`Falling back to Vietnamese`);
            this.translate.use('vi').subscribe(() => {
              localStorage.setItem('language', 'vi');
              this.currentLangSubject.next('vi');
            });
          }
        }
      });
    });
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

