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

export interface InvoiceTemplate {
  template_code: string;
  invoice_series: string;
  invoice_label: string;
}

@Injectable({
  providedIn: 'root'
})
export class EInvoiceProviderService {
  private selectedProviderSubject = new BehaviorSubject<ProviderAccount | null>(null);
  public selectedProvider$: Observable<ProviderAccount | null> = this.selectedProviderSubject.asObservable();

  private selectedTemplateSubject = new BehaviorSubject<InvoiceTemplate | null>(null);
  public selectedTemplate$: Observable<InvoiceTemplate | null> = this.selectedTemplateSubject.asObservable();

  private readonly STORAGE_KEY = 'e_invoice_selected_provider';
  private readonly TEMPLATE_STORAGE_KEY = 'e_invoice_selected_template';

  constructor() {
    // Load từ localStorage khi service khởi tạo
    this.loadFromStorage();
    this.loadTemplateFromStorage();
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
      
      // Kiểm tra template đã chọn có thuộc provider mới không
      const selectedTemplate = this.getSelectedTemplate();
      if (selectedTemplate && provider.templates && provider.templates.length > 0) {
        const templateExists = provider.templates.some(
          t => t.template_code === selectedTemplate.template_code && 
               t.invoice_series === selectedTemplate.invoice_series
        );
        // Nếu template không thuộc provider mới, xóa template đã chọn
        if (!templateExists) {
          this.setSelectedTemplate(null);
        }
      }
    } else {
      // Xóa khỏi localStorage
      localStorage.removeItem(this.STORAGE_KEY);
      // Xóa template đã chọn khi xóa provider
      this.setSelectedTemplate(null);
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
    this.setSelectedTemplate(null);
  }

  /**
   * Lấy template đã chọn
   */
  getSelectedTemplate(): InvoiceTemplate | null {
    return this.selectedTemplateSubject.value;
  }

  /**
   * Chọn template
   */
  setSelectedTemplate(template: InvoiceTemplate | null): void {
    this.selectedTemplateSubject.next(template);
    if (template) {
      // Lưu vào localStorage
      localStorage.setItem(this.TEMPLATE_STORAGE_KEY, JSON.stringify(template));
    } else {
      // Xóa khỏi localStorage
      localStorage.removeItem(this.TEMPLATE_STORAGE_KEY);
    }
  }

  /**
   * Load template từ localStorage
   */
  private loadTemplateFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.TEMPLATE_STORAGE_KEY);
      if (stored) {
        const template = JSON.parse(stored);
        this.selectedTemplateSubject.next(template);
      }
    } catch (error) {
      console.error('Error loading template from storage:', error);
      localStorage.removeItem(this.TEMPLATE_STORAGE_KEY);
    }
  }
}

