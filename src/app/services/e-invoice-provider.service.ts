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

  constructor() {}

  /**
   * Lấy provider đã chọn
   */
  getSelectedProvider(): ProviderAccount | null {
    return this.selectedProviderSubject.value;
  }

  /**
   * Chọn provider (in-memory only)
   */
  setSelectedProvider(provider: ProviderAccount | null): void {
    this.selectedProviderSubject.next(provider);
    if (provider) {
      const selectedTemplate = this.getSelectedTemplate();
      if (selectedTemplate && provider.templates && provider.templates.length > 0) {
        const templateExists = provider.templates.some(
          t => t.template_code === selectedTemplate.template_code && 
               t.invoice_series === selectedTemplate.invoice_series
        );
        if (!templateExists) {
          this.setSelectedTemplate(null);
        }
      }
    } else {
      this.setSelectedTemplate(null);
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
   * Chọn template (in-memory only)
   */
  setSelectedTemplate(template: InvoiceTemplate | null): void {
    this.selectedTemplateSubject.next(template);
  }
}
