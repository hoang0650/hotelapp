import { Component, OnInit } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';

interface InvoiceTemplate {
  id: string;
  name: string;
  description: string;
  previewImage?: string;
  isDefault: boolean;
  createdAt: Date;
}

@Component({
  selector: 'app-e-invoice-template',
  templateUrl: './e-invoice-template.component.html',
  styleUrls: ['./e-invoice-template.component.css']
})
export class EInvoiceTemplateComponent implements OnInit {
  loading = false;
  templates: InvoiceTemplate[] = [];
  selectedTemplate: InvoiceTemplate | null = null;
  currentUser: any = null;

  constructor(
    private http: HttpClient,
    private message: NzMessageService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadTemplates();
  }

  loadTemplates(): void {
    this.loading = true;
    // TODO: Call API to load templates
    this.http.get(`${environment.apiUrl}/e-invoice/templates`).subscribe({
      next: (response: any) => {
        this.loading = false;
        if (response.success !== false) {
          this.templates = response.data?.templates || response.templates || [];
          // Set default template if exists
          const defaultTemplate = this.templates.find(t => t.isDefault);
          if (defaultTemplate) {
            this.selectedTemplate = defaultTemplate;
          }
        } else {
          this.message.error(response.message || 'Không thể tải danh sách mẫu');
          this.templates = [];
        }
      },
      error: (error) => {
        this.loading = false;
        console.error('Error loading templates:', error);
        // Mock data for development
        this.templates = [
          {
            id: '1',
            name: 'Mẫu chuẩn',
            description: 'Mẫu hóa đơn điện tử chuẩn theo quy định',
            isDefault: true,
            createdAt: new Date()
          },
          {
            id: '2',
            name: 'Mẫu đơn giản',
            description: 'Mẫu hóa đơn đơn giản, dễ đọc',
            isDefault: false,
            createdAt: new Date()
          },
          {
            id: '3',
            name: 'Mẫu chi tiết',
            description: 'Mẫu hóa đơn với đầy đủ thông tin chi tiết',
            isDefault: false,
            createdAt: new Date()
          }
        ];
      }
    });
  }

  selectTemplate(template: InvoiceTemplate): void {
    this.selectedTemplate = template;
  }

  setAsDefault(template: InvoiceTemplate): void {
    this.http.post(`${environment.apiUrl}/e-invoice/templates/${template.id}/set-default`, {}).subscribe({
      next: (response: any) => {
        if (response.success !== false) {
          this.message.success('Đặt mẫu mặc định thành công');
          this.loadTemplates();
        } else {
          this.message.error(response.message || 'Không thể đặt mẫu mặc định');
        }
      },
      error: (error) => {
        console.error('Error setting default template:', error);
        this.message.error('Có lỗi xảy ra khi đặt mẫu mặc định');
      }
    });
  }

  previewTemplate(template: InvoiceTemplate): void {
    // TODO: Open modal to preview template
    this.message.info(`Xem trước mẫu: ${template.name}`);
  }

  formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  }
}

