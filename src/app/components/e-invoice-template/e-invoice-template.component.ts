import { Component, OnInit, OnDestroy } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { EInvoiceProviderService, ProviderAccount } from '../../services/e-invoice-provider.service';
import { InvoiceService } from '../../services/invoice.service';
import { Subscription } from 'rxjs';

interface InvoiceTemplate {
  template_code: string;
  invoice_series: string;
  invoice_label: string;
  id?: string; // Dùng template_code làm id
  name?: string; // Dùng invoice_label làm name
  description?: string; // Mô tả từ template
  previewImage?: string; // Hình ảnh preview (nếu có)
  isDefault?: boolean;
}

@Component({
  selector: 'app-e-invoice-template',
  templateUrl: './e-invoice-template.component.html',
  styleUrls: ['./e-invoice-template.component.css']
})
export class EInvoiceTemplateComponent implements OnInit, OnDestroy {
  loading = false;
  templates: InvoiceTemplate[] = [];
  selectedTemplate: InvoiceTemplate | null = null;
  currentUser: any = null;
  private providerSubscription?: Subscription;

  constructor(
    private http: HttpClient,
    private message: NzMessageService,
    private authService: AuthService,
    public providerService: EInvoiceProviderService, // Public để dùng trong template
    private invoiceService: InvoiceService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadTemplates();
    
    // Lắng nghe thay đổi provider để reload templates
    this.providerSubscription = this.providerService.selectedProvider$.subscribe(provider => {
      if (provider) {
        // Reload templates khi provider thay đổi
        this.loadTemplates();
      } else {
        // Xóa templates nếu không có provider
        this.templates = [];
        this.selectedTemplate = null;
      }
    });
  }

  ngOnDestroy(): void {
    if (this.providerSubscription) {
      this.providerSubscription.unsubscribe();
    }
  }

  loadTemplates(): void {
    // Lấy provider đã chọn
    const selectedProvider = this.providerService.getSelectedProvider();
    
    if (!selectedProvider || !selectedProvider.id) {
      this.message.warning('Vui lòng chọn tài khoản nhà cung cấp trước');
      this.templates = [];
      return;
    }

    // Nếu provider đã có templates trong cache, sử dụng luôn
    if (selectedProvider.templates && selectedProvider.templates.length > 0) {
      this.templates = this.mapTemplates(selectedProvider.templates);
      // Set default template: ưu tiên template đã lưu, sau đó là template có isDefault, cuối cùng là template đầu tiên
      const savedTemplate = this.providerService.getSelectedTemplate();
      let defaultTemplate: InvoiceTemplate | null = null;
      
      if (savedTemplate) {
        // Tìm template đã lưu trong danh sách templates
        defaultTemplate = this.templates.find(
          t => t.template_code === savedTemplate.template_code && 
               t.invoice_series === savedTemplate.invoice_series
        ) || null;
      }
      
      if (!defaultTemplate) {
        defaultTemplate = this.templates.find(t => t.isDefault) || this.templates[0] || null;
      }
      
      if (defaultTemplate) {
        this.selectedTemplate = defaultTemplate;
        // Lưu template mặc định vào service
        this.providerService.setSelectedTemplate(defaultTemplate);
      }
      return;
    }

    // Nếu chưa có templates, gọi API để lấy chi tiết provider
    this.loading = true;
    this.invoiceService.getEInvoiceProviderAccountDetails(selectedProvider.id).subscribe({
      next: (response: any) => {
        this.loading = false;
        
        if (response.success !== false) {
          const providerDetails = response.data || response;
          const templates = providerDetails.templates || [];
          
          if (templates.length === 0) {
            this.message.warning('Tài khoản nhà cung cấp không có mẫu hóa đơn nào');
            this.templates = [];
            return;
          }

          // Map templates từ format Sepay sang format hiển thị
          this.templates = this.mapTemplates(templates);
          
          // Cập nhật provider trong service với templates mới
          const updatedProvider: ProviderAccount = {
            ...selectedProvider,
            templates: templates
          };
          this.providerService.setSelectedProvider(updatedProvider);
          
          // Set default template: ưu tiên template đã lưu, sau đó là template đầu tiên
          if (this.templates.length > 0) {
            const savedTemplate = this.providerService.getSelectedTemplate();
            if (savedTemplate) {
              // Tìm template đã lưu trong danh sách templates
              const foundTemplate = this.templates.find(
                t => t.template_code === savedTemplate.template_code && 
                     t.invoice_series === savedTemplate.invoice_series
              );
              this.selectedTemplate = foundTemplate || this.templates[0];
            } else {
              this.selectedTemplate = this.templates[0];
            }
            // Lưu template mặc định vào service
            if (this.selectedTemplate) {
              this.providerService.setSelectedTemplate(this.selectedTemplate);
            }
          }
          
          console.log('[EInvoice Template] Loaded templates:', this.templates);
        } else {
          this.message.error(response.message || 'Không thể tải danh sách mẫu');
          this.templates = [];
        }
      },
      error: (error) => {
        this.loading = false;
        console.error('Error loading templates:', error);
        this.message.error('Có lỗi xảy ra khi tải danh sách mẫu hóa đơn');
        this.templates = [];
      }
    });
  }

  /**
   * Map templates từ format Sepay sang format hiển thị
   */
  private mapTemplates(sepayTemplates: Array<{template_code: string; invoice_series: string; invoice_label: string}>): InvoiceTemplate[] {
    return sepayTemplates.map((template, index) => ({
      template_code: template.template_code,
      invoice_series: template.invoice_series,
      invoice_label: template.invoice_label,
      id: template.template_code, // Dùng template_code làm id
      name: template.invoice_label || `Mẫu ${template.template_code}`, // Dùng invoice_label làm name
      description: `Mẫu hóa đơn: ${template.invoice_series} - ${template.invoice_label || template.template_code}`,
      isDefault: index === 0 // Template đầu tiên là mặc định
    }));
  }

  selectTemplate(template: InvoiceTemplate): void {
    this.selectedTemplate = template;
    // Lưu template đã chọn vào service để dùng làm mặc định khi tạo hóa đơn
    this.providerService.setSelectedTemplate(template);
    this.message.success(`Đã chọn mẫu: ${template.name || template.invoice_label}`);
  }

  setAsDefault(template: InvoiceTemplate): void {
    // Sepay không hỗ trợ API để set default template
    // Chỉ cập nhật local state
    this.templates.forEach(t => t.isDefault = false);
    template.isDefault = true;
    this.selectedTemplate = template;
    this.message.success('Đã đặt mẫu mặc định');
  }

  previewTemplate(template: InvoiceTemplate): void {
    // Hiển thị thông tin chi tiết template
    this.message.info(`Mẫu: ${template.invoice_label || template.name} | Mã: ${template.template_code} | Series: ${template.invoice_series}`);
  }

  /**
   * Lấy thông tin template để hiển thị
   */
  getTemplateDisplayName(template: InvoiceTemplate): string {
    return template.name || template.invoice_label || template.template_code;
  }

  /**
   * Lấy mô tả template
   */
  getTemplateDescription(template: InvoiceTemplate): string {
    return template.description || `Mã: ${template.template_code} | Series: ${template.invoice_series}`;
  }
}

