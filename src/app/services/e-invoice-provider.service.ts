import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ProviderAccount {
  id: string;
  provider: string;
  active: boolean;
  templates?: Array<{
    template_code: string;
    invoice_series: string;
    invoice_label: string;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class EInvoiceProviderService {
  private selectedProviderSubject = new BehaviorSubject<ProviderAccount | null>(null);
  public selectedProvider$: Observable<ProviderAccount | null> = this.selectedProviderSubject.asObservable();

  private readonly STORAGE_KEY = 'e_invoice_selected_provider';

  constructor() {
    // Load từ localStorage khi service khởi tạo
    this.loadFromStorage();
  }

  /**
   * Lấy provider đã chọn
   */
  getSelectedProvider(): ProviderAccount | null {
    return this.selectedProviderSubject.value;
  }

  /**
   * Chọn provider
   */
  setSelectedProvider(provider: ProviderAccount | null): void {
    this.selectedProviderSubject.next(provider);
    if (provider) {
      // Lưu vào localStorage
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(provider));
    } else {
      // Xóa khỏi localStorage
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  /**
   * Load provider từ localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const provider = JSON.parse(stored);
        this.selectedProviderSubject.next(provider);
      }
    } catch (error) {
      console.error('Error loading provider from storage:', error);
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  /**
   * Kiểm tra đã chọn provider chưa
   */
  hasSelectedProvider(): boolean {
    return this.selectedProviderSubject.value !== null;
  }

  /**
   * Xóa provider đã chọn
   */
  clearSelectedProvider(): void {
    this.setSelectedProvider(null);
  }
}

