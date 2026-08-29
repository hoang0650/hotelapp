import { Component, OnInit, OnDestroy } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';
import { EInvoiceProviderService, ProviderAccount } from '../../services/e-invoice-provider.service';
import { InvoiceService } from '../../services/invoice.service';
import { Subscription } from 'rxjs';
import {
  analyzeInvoiceTemplate,
  filterTemplatesByMode,
  InvoiceTemplateMeta,
  pickHotelRecommendedTemplate,
  sortTemplatesByRecommendation,
  TemplateFilterMode,
  TemplateComplianceLevel
} from './e-invoice-template.constants';

interface InvoiceTemplate {
  template_code: string;
  invoice_series: string;
  invoice_label: string;
  id?: string;
  name?: string;
  description?: string;
  previewImage?: string;
  isDefault?: boolean;
  meta?: InvoiceTemplateMeta;
}

@Component({
  selector: 'app-e-invoice-template',
  templateUrl: './e-invoice-template.component.html',
  styleUrls: ['./e-invoice-template.component.css']
})
export class EInvoiceTemplateComponent implements OnInit, OnDestroy {
  loading = false;
  templates: InvoiceTemplate[] = [];
  filteredTemplates: InvoiceTemplate[] = [];
  selectedTemplate: InvoiceTemplate | null = null;
  currentUser: any = null;
  templateFilter: TemplateFilterMode = 'recommended';
  readonly filterOptions: Array<{ value: TemplateFilterMode; labelKey: string }> = [
    { value: 'recommended', labelKey: 'E_INVOICE_TEMPLATE.FILTER.RECOMMENDED' },
    { value: 'mtt', labelKey: 'E_INVOICE_TEMPLATE.FILTER.MTT' },
    { value: 'vat', labelKey: 'E_INVOICE_TEMPLATE.FILTER.VAT' },
    { value: 'all', labelKey: 'E_INVOICE_TEMPLATE.FILTER.ALL' }
  ];
  private providerSubscription?: Subscription;

  constructor(
    private message: NzMessageService,
    private authService: AuthService,
    public providerService: EInvoiceProviderService,
    private invoiceService: InvoiceService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadTemplates();

    this.providerService.selectedVendor$.subscribe(() => {
      this.loadTemplates();
    });

    this.providerSubscription = this.providerService.selectedProvider$.subscribe(provider => {
      if (provider) {
        this.loadTemplates();
      } else {
        this.templates = [];
        this.filteredTemplates = [];
        this.selectedTemplate = null;
      }
    });
  }

  ngOnDestroy(): void {
    if (this.providerSubscription) {
      this.providerSubscription.unsubscribe();
    }
  }

  onFilterChange(mode: TemplateFilterMode): void {
    this.templateFilter = mode;
    this.applyFilter();
  }

  loadTemplates(): void {
    const selectedProvider = this.providerService.getSelectedProvider();

    if (!selectedProvider || !selectedProvider.id) {
      this.message.warning(this.translate.instant('E_INVOICE_TEMPLATE.MESSAGES.SELECT_PROVIDER_FIRST'));
      this.templates = [];
      this.filteredTemplates = [];
      return;
    }

    if (selectedProvider.templates && selectedProvider.templates.length > 0) {
      this.applyLoadedTemplates(selectedProvider.templates);
      return;
    }

    this.loading = true;
    this.invoiceService.getEInvoiceProviderAccountDetails(
      selectedProvider.id,
      this.providerService.getSelectedVendor()
    ).subscribe({
      next: (response: any) => {
        this.loading = false;

        if (response.success !== false) {
          const providerDetails = response.data || response;
          const templates = providerDetails.templates || [];

          if (templates.length === 0) {
            this.message.warning(this.translate.instant('E_INVOICE_TEMPLATE.MESSAGES.NO_TEMPLATES'));
            this.templates = [];
            this.filteredTemplates = [];
            return;
          }

          const updatedProvider: ProviderAccount = {
            ...selectedProvider,
            templates
          };
          this.providerService.setSelectedProvider(updatedProvider);
          this.applyLoadedTemplates(templates);
        } else {
          this.message.error(response.message || this.translate.instant('E_INVOICE_TEMPLATE.MESSAGES.LOAD_TEMPLATES_ERROR'));
          this.templates = [];
          this.filteredTemplates = [];
        }
      },
      error: (error) => {
        this.loading = false;
        console.error('Error loading templates:', error);
        this.message.error(this.translate.instant('E_INVOICE_TEMPLATE.MESSAGES.LOAD_TEMPLATES_ERROR_GENERIC'));
        this.templates = [];
        this.filteredTemplates = [];
      }
    });
  }

  private applyLoadedTemplates(rawTemplates: Array<{
    template_code: string;
    invoice_series: string;
    invoice_label: string;
    isDefault?: boolean;
  }>): void {
    this.templates = sortTemplatesByRecommendation(this.mapTemplates(rawTemplates));
    this.applyFilter();
    this.selectDefaultTemplate();
  }

  private applyFilter(): void {
    const filtered = filterTemplatesByMode(this.templates, this.templateFilter);
    this.filteredTemplates = filtered.length > 0 || this.templateFilter === 'all'
      ? filtered
      : this.templates;
  }

  private selectDefaultTemplate(): void {
    const savedTemplate = this.providerService.getSelectedTemplate();
    let defaultTemplate: InvoiceTemplate | null = null;

    if (savedTemplate) {
      defaultTemplate = this.templates.find(
        t => t.template_code === savedTemplate.template_code &&
          t.invoice_series === savedTemplate.invoice_series
      ) || null;
    }

    if (!defaultTemplate) {
      defaultTemplate =
        this.templates.find(t => t.isDefault && t.meta?.isHotelRecommended) ||
        pickHotelRecommendedTemplate(this.templates) ||
        this.templates.find(t => t.isDefault) ||
        this.templates[0] ||
        null;
    }

    if (defaultTemplate) {
      this.selectedTemplate = defaultTemplate;
      this.providerService.setSelectedTemplate(defaultTemplate);

      if (!savedTemplate) {
        if (defaultTemplate.meta?.isHotelRecommended) {
          this.message.info(this.translate.instant('E_INVOICE_TEMPLATE.MESSAGES.AUTO_SELECTED_HOTEL', {
            name: this.getTemplateDisplayName(defaultTemplate)
          }));
        } else if (defaultTemplate.meta?.complianceLevel === 'warning') {
          this.message.warning(this.translate.instant('E_INVOICE_TEMPLATE.MESSAGES.WARN_NOT_MTT'));
        }
      }
    }
  }

  private mapTemplates(
    providerTemplates: Array<{ template_code: string; invoice_series: string; invoice_label: string; isDefault?: boolean }>
  ): InvoiceTemplate[] {
    return providerTemplates.map((template, index) => {
      const meta = analyzeInvoiceTemplate(template.template_code, template.invoice_series);
      return {
        template_code: template.template_code,
        invoice_series: template.invoice_series,
        invoice_label: template.invoice_label,
        id: `${template.template_code}_${template.invoice_series}`,
        name: template.invoice_label || `Mẫu ${template.template_code}`,
        description: this.buildDescription(meta, template),
        isDefault: template.isDefault === true || (index === 0 && meta.isHotelRecommended),
        meta
      };
    });
  }

  private buildDescription(
    meta: InvoiceTemplateMeta,
    template: { template_code: string; invoice_series: string; invoice_label?: string }
  ): string {
    const pattern = this.translate.instant(meta.patternLabelKey);
    const seriesKind = this.translate.instant(meta.seriesKindLabelKey);
    return `${pattern} · ${seriesKind} · ${template.invoice_series}`;
  }

  selectTemplate(template: InvoiceTemplate): void {
    if (template.meta?.complianceLevel === 'warning' || template.meta?.complianceLevel === 'not_suitable') {
      this.message.warning(this.translate.instant(template.meta.complianceNoteKey));
    }

    this.selectedTemplate = template;
    this.providerService.setSelectedTemplate(template);
    this.message.success(this.translate.instant('E_INVOICE_TEMPLATE.MESSAGES.SELECTED_TEMPLATE', {
      name: template.name || template.invoice_label
    }));
  }

  setAsDefault(template: InvoiceTemplate): void {
    this.templates.forEach(t => { t.isDefault = false; });
    template.isDefault = true;
    this.selectedTemplate = template;
    this.providerService.setSelectedTemplate(template);
    this.message.success(this.translate.instant('E_INVOICE_TEMPLATE.MESSAGES.SET_DEFAULT'));
  }

  previewTemplate(template: InvoiceTemplate): void {
    const note = template.meta
      ? this.translate.instant(template.meta.complianceNoteKey)
      : '';
    this.message.info(
      `${this.getTemplateDisplayName(template)} | ${this.translate.instant('E_INVOICE_TEMPLATE.LABEL.PATTERN')}: ${template.template_code} | ${this.translate.instant('E_INVOICE_TEMPLATE.LABEL.SERIES')}: ${template.invoice_series}${note ? ` — ${note}` : ''}`,
      { nzDuration: 6000 }
    );
  }

  getTemplateDisplayName(template: InvoiceTemplate): string {
    return template.name || template.invoice_label || template.template_code;
  }

  getTemplateDescription(template: InvoiceTemplate): string {
    if (template.meta) {
      return this.translate.instant(template.meta.complianceNoteKey);
    }
    return template.description || `Mã: ${template.template_code} | Series: ${template.invoice_series}`;
  }

  getPatternLabel(template: InvoiceTemplate): string {
    return template.meta
      ? this.translate.instant(template.meta.patternLabelKey)
      : template.template_code;
  }

  getSeriesKindLabel(template: InvoiceTemplate): string {
    return template.meta
      ? this.translate.instant(template.meta.seriesKindLabelKey)
      : '';
  }

  getComplianceTagColor(level?: TemplateComplianceLevel): string {
    switch (level) {
      case 'recommended': return 'green';
      case 'acceptable': return 'blue';
      case 'warning': return 'orange';
      case 'not_suitable': return 'red';
      default: return 'default';
    }
  }

  getComplianceTagLabel(level?: TemplateComplianceLevel): string {
    switch (level) {
      case 'recommended': return this.translate.instant('E_INVOICE_TEMPLATE.COMPLIANCE_TAG.RECOMMENDED');
      case 'acceptable': return this.translate.instant('E_INVOICE_TEMPLATE.COMPLIANCE_TAG.ACCEPTABLE');
      case 'warning': return this.translate.instant('E_INVOICE_TEMPLATE.COMPLIANCE_TAG.WARNING');
      case 'not_suitable': return this.translate.instant('E_INVOICE_TEMPLATE.COMPLIANCE_TAG.NOT_SUITABLE');
      default: return '';
    }
  }

  hasRecommendedTemplates(): boolean {
    return this.templates.some(t => t.meta?.isHotelRecommended);
  }
}
