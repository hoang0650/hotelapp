import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type EInvoiceVendor = 'sepay' | 'easyinvoice';

export interface ProviderAccount {
  id: string;
  provider: EInvoiceVendor | string;
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

export interface EInvoiceVendorOption {
  id: EInvoiceVendor;
  name: string;
  description?: string;
}

@Injectable({
  providedIn: 'root'
})
export class EInvoiceProviderService {
  private readonly STORAGE_VENDOR_KEY = 'phhotel.einvoice.vendor';

  private selectedVendorSubject = new BehaviorSubject<EInvoiceVendor>(this.readStoredVendor());
  public selectedVendor$: Observable<EInvoiceVendor> = this.selectedVendorSubject.asObservable();

  private selectedProviderSubject = new BehaviorSubject<ProviderAccount | null>(null);
  public selectedProvider$: Observable<ProviderAccount | null> = this.selectedProviderSubject.asObservable();

  private selectedTemplateSubject = new BehaviorSubject<InvoiceTemplate | null>(null);
  public selectedTemplate$: Observable<InvoiceTemplate | null> = this.selectedTemplateSubject.asObservable();

  readonly vendorOptions: EInvoiceVendorOption[] = [
    { id: 'sepay', name: 'Sepay eInvoice', description: 'Nền tảng hóa đơn điện tử Sepay' },
    { id: 'easyinvoice', name: 'EasyInvoice', description: 'Hóa đơn điện tử EasyInvoice (Softdreams)' }
  ];

  constructor() {}

  private readStoredVendor(): EInvoiceVendor {
    const stored = localStorage.getItem(this.STORAGE_VENDOR_KEY);
    return stored === 'easyinvoice' ? 'easyinvoice' : 'sepay';
  }

  getSelectedVendor(): EInvoiceVendor {
    return this.selectedVendorSubject.value;
  }

  setSelectedVendor(vendor: EInvoiceVendor): void {
    const normalized = vendor === 'easyinvoice' ? 'easyinvoice' : 'sepay';
    localStorage.setItem(this.STORAGE_VENDOR_KEY, normalized);
    this.selectedVendorSubject.next(normalized);
    this.clearSelectedProvider();
  }

  getSelectedProvider(): ProviderAccount | null {
    return this.selectedProviderSubject.value;
  }

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

  hasSelectedProvider(): boolean {
    return this.selectedProviderSubject.value !== null;
  }

  clearSelectedProvider(): void {
    this.setSelectedProvider(null);
    this.setSelectedTemplate(null);
  }

  getSelectedTemplate(): InvoiceTemplate | null {
    return this.selectedTemplateSubject.value;
  }

  setSelectedTemplate(template: InvoiceTemplate | null): void {
    this.selectedTemplateSubject.next(template);
  }

  getVendorLabel(vendor?: EInvoiceVendor | string): string {
    const id = vendor || this.getSelectedVendor();
    return this.vendorOptions.find(v => v.id === id)?.name || 'Sepay eInvoice';
  }
}
