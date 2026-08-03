import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { getCookie, setCookie } from '../utils/cookie-storage';

export type AppTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'phhotel_theme';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly themeSubject: BehaviorSubject<AppTheme>;
  readonly theme$: Observable<AppTheme>;

  constructor(@Inject(PLATFORM_ID) private platformId: object) {
    const initial = this.readStoredTheme();
    this.themeSubject = new BehaviorSubject<AppTheme>(initial);
    this.theme$ = this.themeSubject.asObservable();
    this.applyTheme(initial);
  }

  get currentTheme(): AppTheme {
    return this.themeSubject.value;
  }

  get isDark(): boolean {
    return this.currentTheme === 'dark';
  }

  setTheme(theme: AppTheme): void {
    if (theme !== 'light' && theme !== 'dark') {
      return;
    }
    this.persistTheme(theme);
    this.applyTheme(theme);
    this.themeSubject.next(theme);
  }

  toggleTheme(): void {
    this.setTheme(this.isDark ? 'light' : 'dark');
  }

  private readStoredTheme(): AppTheme {
    if (!isPlatformBrowser(this.platformId)) {
      return 'light';
    }
    try {
      const stored = getCookie(THEME_STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') {
        return stored;
      }
    } catch {}
    return 'light';
  }

  private persistTheme(theme: AppTheme): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    setCookie(THEME_STORAGE_KEY, theme);
  }

  private applyTheme(theme: AppTheme): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    document.documentElement.setAttribute('data-theme', theme);
    document.body?.classList.toggle('theme-dark', theme === 'dark');
    document.body?.classList.toggle('theme-light', theme === 'light');
  }
}
