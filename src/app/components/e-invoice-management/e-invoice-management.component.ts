import { Component, OnInit } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { NzTabChangeEvent } from 'ng-zorro-antd/tabs';
import { InvoiceService } from '../../services/invoice.service';
import { EInvoiceProviderService, ProviderAccount } from '../../services/e-invoice-provider.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

interface EInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  customerName: string;
  totalAmount: number;
  status: 'draft' | 'issued' | 'cancelled';
  createdAt: Date;
  referenceCode?: string;
  trackingCode?: string;
  invoiceUrl?: string;
  pdfUrl?: string;
  sepayData?: any;
}

interface DraftInvoiceForm {
  template_code: string;
  invoice_series: string;
  issued_date: string;
  currency: string;
  provider_account_id: string;
  buyer: {
    name: string;
    tax_code?: string;
    address: string;
    email: string;
    phone?: string;
  };
  items: Array<{
    line_number: number;
    line_type: number;
    item_code?: string;
    item_name: string;
    unit: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    total_price: number;
  }>;
  notes?: string;
}

@Component({
  selector: 'app-e-invoice-management',
  templateUrl: './e-invoice-management.component.html',
  styleUrls: ['./e-invoice-management.component.css']
})
export class EInvoiceManagementComponent implements OnInit {
  loading = false;
  currentTab: 'drafts' | 'issued' = 'drafts';
  drafts: EInvoice[] = [];
  issuedInvoices: EInvoice[] = [];
  currentUser: any = null;
  
  // Pagination
  pageIndex = 1;
  pageSize = 10;
  totalDrafts = 0;
  totalIssued = 0;

  // Provider account management
  providerAccounts: ProviderAccount[] = [];
  selectedProvider: ProviderAccount | null = null;
  loadingProviders = false;
  loadingProviderDetails = false;
  showProviderModal = false;
  
  // Authentication status
  isAuthenticated = false;
  checkingAuth = false;
  authError: string | null = null;
  showLoginModal = false;
  loginForm = {
    username: '',
    password: ''
  };
  loggingIn = false;

  // Edit draft modal
  showEditDraftModal = false;
  editingDraft: EInvoice | null = null;
  draftForm: DraftInvoiceForm | null = null;
  loadingDraftDetails = false;
  savingDraft = false;
  issuingDraft = false;
  isViewMode = false; // true = chỉ xem, false = có thể chỉnh sửa
  showPdfModal = false;
  pdfUrl: string | null = null;
  safePdfUrl: SafeResourceUrl | null = null;
  loadingPdf = false;

  // Quota/Usage
  quotaRemaining: number | null = null;
  loadingQuota = false;
  quotaError: string | null = null;
  quotaTotal: number | null = null; // Tổng quota (cho admin/superadmin)
  quotaUsed: number | null = null; // Quota đã dùng (cho admin/superadmin)
  isAdminOrSuperadmin = false; // Flag để phân biệt role

  constructor(
    private http: HttpClient,
    private message: NzMessageService,
    private modal: NzModalService,
    private authService: AuthService,
    private invoiceService: InvoiceService,
    private providerService: EInvoiceProviderService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    
    // Kiểm tra role để phân biệt admin/superadmin và các role khác
    const userRole = this.currentUser?.role;
    this.isAdminOrSuperadmin = userRole === 'superadmin' || userRole === 'admin';
    
    // Load provider đã chọn
    this.selectedProvider = this.providerService.getSelectedProvider();
    
    // Subscribe để cập nhật khi provider thay đổi
    this.providerService.selectedProvider$.subscribe(provider => {
      this.selectedProvider = provider;
    });
    
    // Bước 1: Kiểm tra đăng nhập/token trước
    this.checkAuthentication();
    
    // Load drafts
    this.loadDrafts();
    
    // Listen for quota update events (khi đăng ký packages thành công)
    window.addEventListener('eInvoiceQuotaUpdated', () => {
      if (this.isAuthenticated) {
        this.loadQuota();
      }
    });
    
    // Nếu đã có provider được chọn, load lại chi tiết để đảm bảo có thông tin mới nhất
    if (this.selectedProvider && this.selectedProvider.id) {
      // Chờ một chút để đảm bảo authentication đã hoàn tất
      setTimeout(() => {
        if (this.isAuthenticated) {
          this.loadProviderDetails(this.selectedProvider!);
        }
      }, 1000);
    }
  }

  onTabChange(tab: 'drafts' | 'issued'): void {
    this.currentTab = tab;
    this.pageIndex = 1;
    if (tab === 'drafts') {
      this.loadDrafts();
    } else {
      this.loadIssuedInvoices();
    }
  }

  onTabChangeByIndex(event: NzTabChangeEvent): void {
    this.onTabChange(event.index === 0 ? 'drafts' : 'issued');
  }

  loadDrafts(): void {
    this.loading = true;
    this.http.get(`${environment.apiUrl}/e-invoice/drafts`, {
      params: {
        page: this.pageIndex.toString(),
        limit: this.pageSize.toString()
      }
    }).subscribe({
      next: (response: any) => {
        this.loading = false;
        if (response.success !== false) {
          // Backend đã tự động lọc theo hotelId, chỉ cần lấy dữ liệu
          const allDrafts = response.data?.drafts || response.drafts || [];
          // Đảm bảo chỉ lấy hóa đơn có status = 'draft' (backend đã filter nhưng double-check)
          this.drafts = allDrafts.filter((invoice: any) => {
            const status = invoice.status?.toLowerCase();
            return status === 'draft';
          });
          this.totalDrafts = response.data?.total || this.drafts.length;
        } else {
          this.message.error(response.message || 'Không thể tải danh sách bản nháp');
          this.drafts = [];
          this.totalDrafts = 0;
        }
      },
      error: (error) => {
        this.loading = false;
        console.error('Error loading drafts:', error);
        this.drafts = [];
        this.totalDrafts = 0;
      }
    });
  }

  loadIssuedInvoices(): void {
    this.loading = true;
    this.http.get(`${environment.apiUrl}/e-invoice/issued`, {
      params: {
        page: this.pageIndex.toString(),
        limit: this.pageSize.toString()
      }
    }).subscribe({
      next: (response: any) => {
        this.loading = false;
        if (response.success !== false) {
          // Backend đã tự động lọc theo hotelId, chỉ cần lấy dữ liệu
          const allInvoices = response.data?.invoices || response.invoices || [];
          // Đảm bảo chỉ lấy hóa đơn có status = 'issued' (backend đã filter nhưng double-check)
          this.issuedInvoices = allInvoices.filter((invoice: any) => {
            const status = invoice.status?.toLowerCase();
            return status === 'issued';
          });
          this.totalIssued = response.data?.total || this.issuedInvoices.length;
        } else {
          this.message.error(response.message || 'Không thể tải danh sách hóa đơn');
          this.issuedInvoices = [];
          this.totalIssued = 0;
        }
      },
      error: (error) => {
        this.loading = false;
        console.error('Error loading issued invoices:', error);
        this.issuedInvoices = [];
        this.totalIssued = 0;
      }
    });
  }

  onPageChange(page: number): void {
    this.pageIndex = page;
    if (this.currentTab === 'drafts') {
      this.loadDrafts();
    } else {
      this.loadIssuedInvoices();
    }
  }

  viewDraft(invoice: EInvoice): void {
    // Kiểm tra nếu có pdf_url, mở PDF trong tab mới
    const pdfUrl = invoice.pdfUrl || 
                   invoice.sepayData?.pdf_url ||
                   (invoice.sepayData && invoice.sepayData.pdf_url);
    
    if (pdfUrl) {
      // Fetch PDF qua HttpClient (có auth headers) rồi mở blob URL trong tab mới
      this.loadPdfAndOpenInNewTab(pdfUrl);
      return;
    }
    
    // Nếu không có pdf_url, mở modal xem hóa đơn (read-only)
    this.editingDraft = invoice;
    this.isViewMode = true; // Chế độ xem
    this.showEditDraftModal = true;
    this.loadingDraftDetails = true;
    
    // Lấy chi tiết hóa đơn từ Sepay
    const referenceCode = invoice.referenceCode || 
                          invoice.trackingCode || 
                          invoice.invoiceNumber || 
                          invoice.id ||
                          (invoice.sepayData && (invoice.sepayData.reference_code || invoice.sepayData.tracking_code || invoice.sepayData.invoice_number || invoice.sepayData.id));
    
    if (!referenceCode) {
      this.message.error('Không tìm thấy mã tham chiếu của hóa đơn');
      this.loadingDraftDetails = false;
      return;
    }

    this.invoiceService.getEInvoiceDetails(referenceCode).subscribe({
      next: (response: any) => {
        this.loadingDraftDetails = false;
        if (response.success !== false && response.data) {
          const invoiceData = response.data;
          
          // Nếu có pdf_url trong response, mở PDF trong tab mới
          if (invoiceData.pdf_url) {
            this.loadPdfAndOpenInNewTab(invoiceData.pdf_url);
            this.closeEditDraftModal();
            return;
          }
          
          // Map dữ liệu từ Sepay sang form (read-only)
          this.draftForm = {
            template_code: invoiceData.template_code || '',
            invoice_series: invoiceData.invoice_series || '',
            issued_date: invoiceData.issued_date || new Date().toISOString().split('T')[0],
            currency: invoiceData.currency || 'VND',
            provider_account_id: invoiceData.provider_account_id || this.selectedProvider?.id || '',
            buyer: {
              name: invoiceData.buyer?.name || invoice.customerName || '',
              tax_code: invoiceData.buyer?.tax_code || '',
              address: invoiceData.buyer?.address || '',
              email: invoiceData.buyer?.email || '',
              phone: invoiceData.buyer?.phone || ''
            },
            items: (invoiceData.items || []).map((item: any, index: number) => ({
              line_number: item.line_number || index + 1,
              line_type: item.line_type || 1,
              item_code: item.item_code || '',
              item_name: item.item_name || '',
              unit: item.unit || 'cái',
              quantity: item.quantity || 1,
              unit_price: item.unit_price || 0,
              tax_rate: item.tax_rate || 0,
              total_price: item.total_price || (item.unit_price || 0) * (item.quantity || 1)
            })),
            notes: invoiceData.notes || ''
          };
        } else {
          this.message.error('Không thể tải chi tiết hóa đơn');
          this.closeEditDraftModal();
        }
      },
      error: (error) => {
        this.loadingDraftDetails = false;
        console.error('Error loading invoice details:', error);
        this.message.error('Lỗi khi tải chi tiết hóa đơn: ' + (error.error?.error?.message || error.message));
        this.closeEditDraftModal();
      }
    });
  }

  editDraft(invoice: EInvoice): void {
    // Kiểm tra nếu hóa đơn đã xuất thì không cho chỉnh sửa
    if (invoice.status === 'issued') {
      this.message.warning('Hóa đơn đã xuất không thể chỉnh sửa. Vui lòng sử dụng chức năng "Xem" để xem chi tiết.');
      return;
    }
    
    this.editingDraft = invoice;
    this.isViewMode = false; // Chế độ chỉnh sửa
    this.showEditDraftModal = true;
    this.loadingDraftDetails = true;
    
    // Lấy chi tiết hóa đơn từ Sepay
    // Ưu tiên: referenceCode > trackingCode > invoiceNumber > id
    const referenceCode = invoice.referenceCode || 
                          invoice.trackingCode || 
                          invoice.invoiceNumber || 
                          invoice.id ||
                          (invoice.sepayData && (invoice.sepayData.reference_code || invoice.sepayData.tracking_code || invoice.sepayData.invoice_number || invoice.sepayData.id));
    
    if (!referenceCode) {
      this.message.error('Không tìm thấy mã tham chiếu của hóa đơn');
      this.loadingDraftDetails = false;
      return;
    }

    this.invoiceService.getEInvoiceDetails(referenceCode).subscribe({
      next: (response: any) => {
        this.loadingDraftDetails = false;
        if (response.success !== false && response.data) {
          const invoiceData = response.data;
          // Map dữ liệu từ Sepay sang form
          this.draftForm = {
            template_code: invoiceData.template_code || '',
            invoice_series: invoiceData.invoice_series || '',
            issued_date: invoiceData.issued_date || new Date().toISOString().split('T')[0],
            currency: invoiceData.currency || 'VND',
            provider_account_id: invoiceData.provider_account_id || this.selectedProvider?.id || '',
            buyer: {
              name: invoiceData.buyer?.name || invoice.customerName || '',
              tax_code: invoiceData.buyer?.tax_code || '',
              address: invoiceData.buyer?.address || '',
              email: invoiceData.buyer?.email || '',
              phone: invoiceData.buyer?.phone || ''
            },
            items: (invoiceData.items || []).map((item: any, index: number) => ({
              line_number: item.line_number || index + 1,
              line_type: item.line_type || 1,
              item_code: item.item_code || '',
              item_name: item.item_name || '',
              unit: item.unit || 'cái',
              quantity: item.quantity || 1,
              unit_price: item.unit_price || 0,
              tax_rate: item.tax_rate || 0,
              total_price: item.total_price || (item.unit_price || 0) * (item.quantity || 1)
            })),
            notes: invoiceData.notes || ''
          };
        } else {
          this.message.error('Không thể tải chi tiết hóa đơn');
          this.closeEditDraftModal();
        }
      },
      error: (error) => {
        this.loadingDraftDetails = false;
        console.error('Error loading draft details:', error);
        this.message.error('Lỗi khi tải chi tiết hóa đơn: ' + (error.error?.error?.message || error.message));
        this.closeEditDraftModal();
      }
    });
  }

  closeEditDraftModal(): void {
    this.showEditDraftModal = false;
    this.editingDraft = null;
    this.draftForm = null;
    this.isViewMode = false;
  }

  loadPdfForViewing(pdfUrl: string): void {
    this.loadingPdf = true;
    this.pdfUrl = pdfUrl;
    this.showPdfModal = true;
    
    // Sử dụng proxy endpoint từ backend để fetch PDF
    const proxyUrl = `${environment.apiUrl}/e-invoice/pdf-proxy?url=${encodeURIComponent(pdfUrl)}`;
    
    console.log('[EInvoice Management] Loading PDF via proxy:', proxyUrl);
    
    this.http.get(proxyUrl, { 
      responseType: 'blob',
      headers: {
        'Accept': 'application/pdf'
      }
    }).subscribe({
      next: (blob: Blob) => {
        console.log('[EInvoice Management] PDF blob received, size:', blob.size, 'type:', blob.type);
        
        // Đảm bảo blob có type là application/pdf
        let pdfBlob = blob;
        if (blob.type !== 'application/pdf' && blob.size > 0) {
          // Nếu không phải PDF nhưng có data, tạo blob với type PDF
          pdfBlob = new Blob([blob], { type: 'application/pdf' });
        }
        
        // Tạo blob URL
        const blobUrl = URL.createObjectURL(pdfBlob);
        this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl);
        
        this.loadingPdf = false;
        console.log('[EInvoice Management] PDF URL created:', blobUrl);
      },
      error: (error) => {
        console.error('[EInvoice Management] Error loading PDF via proxy:', error);
        console.error('[EInvoice Management] Error status:', error.status);
        console.error('[EInvoice Management] Error details:', error.error);
        
        // Nếu proxy thất bại, thử dùng URL trực tiếp với object tag
        this.message.warning('Không thể tải PDF qua proxy, đang thử cách khác...');
        this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(pdfUrl + '#toolbar=0&navpanes=0');
        this.loadingPdf = false;
      }
    });
  }

  closePdfModal(): void {
    this.showPdfModal = false;
    this.pdfUrl = null;
    // Revoke blob URL để giải phóng memory
    if (this.safePdfUrl) {
      const url = this.safePdfUrl.toString();
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    }
    this.safePdfUrl = null;
    this.loadingPdf = false;
  }

  saveDraft(): void {
    if (!this.draftForm || !this.editingDraft) {
      return;
    }

    // Validate form
    if (!this.draftForm.template_code || !this.draftForm.invoice_series || !this.draftForm.buyer.name) {
      this.message.error('Vui lòng điền đầy đủ thông tin bắt buộc');
      return;
    }

    if (!this.draftForm.items || this.draftForm.items.length === 0) {
      this.message.error('Hóa đơn phải có ít nhất một sản phẩm/dịch vụ');
      return;
    }

    this.savingDraft = true;

    // Chuẩn bị dữ liệu để tạo lại draft
    const invoiceData = {
      ...this.draftForm,
      is_draft: true
    };

    this.invoiceService.createEInvoice(invoiceData).subscribe({
      next: (response: any) => {
        this.savingDraft = false;
        if (response.success !== false) {
          this.message.success('Lưu hóa đơn nháp thành công');
          this.closeEditDraftModal();
          this.loadDrafts(); // Reload danh sách
        } else {
          this.message.error(response.error?.message || 'Lỗi khi lưu hóa đơn nháp');
        }
      },
      error: (error) => {
        this.savingDraft = false;
        console.error('Error saving draft:', error);
        this.message.error('Lỗi khi lưu hóa đơn nháp: ' + (error.error?.error?.message || error.message));
      }
    });
  }

  issueDraft(): void {
    if (!this.editingDraft) {
      return;
    }

    // Lấy reference code từ hóa đơn đang chỉnh sửa
    // Ưu tiên: referenceCode > trackingCode > invoiceNumber > id
    const referenceCode = this.editingDraft.referenceCode || 
                          this.editingDraft.trackingCode || 
                          this.editingDraft.invoiceNumber || 
                          this.editingDraft.id ||
                          (this.editingDraft.sepayData && (this.editingDraft.sepayData.reference_code || this.editingDraft.sepayData.tracking_code || this.editingDraft.sepayData.invoice_number || this.editingDraft.sepayData.id));
    
    if (!referenceCode) {
      this.message.error('Không tìm thấy mã tham chiếu của hóa đơn');
      return;
    }

    this.modal.confirm({
      nzTitle: 'Xác nhận xuất hóa đơn',
      nzContent: `Bạn có chắc chắn muốn xuất hóa đơn "${this.editingDraft.invoiceNumber}"? Hóa đơn sẽ không thể chỉnh sửa sau khi xuất.`,
      nzOkText: 'Xuất hóa đơn',
      nzOkType: 'primary',
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        this.issuingDraft = true;
        this.invoiceService.issueEInvoice({ reference_code: referenceCode }).subscribe({
          next: (response: any) => {
            this.issuingDraft = false;
            if (response.success !== false) {
              this.message.success('Đã gửi yêu cầu xuất hóa đơn. Đang xử lý...');
              this.closeEditDraftModal();
              // Chuyển sang tab hóa đơn đã xuất
              this.currentTab = 'issued';
              this.loadIssuedInvoices();
            } else {
              this.message.error(response.error?.message || 'Lỗi khi xuất hóa đơn');
            }
          },
          error: (error) => {
            this.issuingDraft = false;
            console.error('Error issuing draft:', error);
            this.message.error('Lỗi khi xuất hóa đơn: ' + (error.error?.error?.message || error.message));
          }
        });
      }
    });
  }

  deleteDraft(invoice: EInvoice): void {
    this.modal.confirm({
      nzTitle: 'Xác nhận xóa',
      nzContent: `Bạn có chắc chắn muốn xóa bản nháp "${invoice.invoiceNumber}"?`,
      nzOkText: 'Xóa',
      nzOkDanger: true,
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        this.http.delete(`${environment.apiUrl}/e-invoice/drafts/${invoice.id}`).subscribe({
          next: (response: any) => {
            if (response.success !== false) {
              this.message.success('Xóa bản nháp thành công');
              this.loadDrafts();
            } else {
              this.message.error(response.message || 'Không thể xóa bản nháp');
            }
          },
          error: (error) => {
            console.error('Error deleting draft:', error);
            this.message.error('Có lỗi xảy ra khi xóa bản nháp');
          }
        });
      }
    });
  }

  viewInvoice(invoice: EInvoice): void {
    // Kiểm tra nếu có pdf_url, mở PDF trong tab mới (giống viewDraft)
    const pdfUrl = invoice.pdfUrl || 
                   invoice.sepayData?.pdf_url ||
                   (invoice.sepayData && invoice.sepayData.pdf_url);
    
    if (pdfUrl) {
      // Mở PDF trong tab mới với token trong URL (tạm thời) hoặc fetch và mở blob URL
      // Vì window.open không tự động gửi auth headers, ta cần fetch trước rồi mở blob URL
      this.loadPdfAndOpenInNewTab(pdfUrl);
      return;
    }
    
    // Nếu không có pdf_url, mở modal xem hóa đơn (read-only) - giống viewDraft
    this.viewDraft(invoice);
  }

  loadPdfAndOpenInNewTab(pdfUrl: string): void {
    // Fetch PDF qua proxy với authentication
    const proxyUrl = `${environment.apiUrl}/e-invoice/pdf-proxy?url=${encodeURIComponent(pdfUrl)}`;
    
    this.http.get(proxyUrl, { responseType: 'blob' }).subscribe({
      next: (blob: Blob) => {
        // Tạo blob URL và mở trong tab mới
        const blobUrl = URL.createObjectURL(blob);
        const newWindow = window.open(blobUrl, '_blank');
        
        if (!newWindow) {
          this.message.error('Trình duyệt đã chặn popup. Vui lòng cho phép popup để xem PDF.');
          URL.revokeObjectURL(blobUrl);
          return;
        }
        
        // Revoke URL sau khi window đóng (nếu có thể detect)
        newWindow.addEventListener('beforeunload', () => {
          URL.revokeObjectURL(blobUrl);
        });
      },
      error: (error) => {
        console.error('Error loading PDF:', error);
        // Nếu proxy thất bại, thử mở URL trực tiếp
        window.open(pdfUrl, '_blank');
        this.message.warning('Đang mở PDF trực tiếp từ URL gốc...');
      }
    });
  }

  downloadInvoice(invoice: EInvoice): void {
    // Lấy PDF URL từ invoice
    const pdfUrl = invoice.pdfUrl || 
                   invoice.sepayData?.pdf_url ||
                   (invoice.sepayData && invoice.sepayData.pdf_url);
    
    if (!pdfUrl) {
      this.message.error('Không tìm thấy PDF để tải xuống');
      return;
    }
    
    // Sử dụng proxy endpoint để tải PDF
    const proxyUrl = `${environment.apiUrl}/e-invoice/pdf-proxy?url=${encodeURIComponent(pdfUrl)}`;
    
    // Fetch PDF và tải xuống
    this.http.get(proxyUrl, { responseType: 'blob' }).subscribe({
      next: (blob: Blob) => {
        // Tạo blob URL và tải xuống
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `HoaDon_${invoice.invoiceNumber || invoice.id}_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        
        this.message.success('Đã tải xuống hóa đơn thành công');
      },
      error: (error) => {
        console.error('Error downloading PDF:', error);
        // Nếu proxy thất bại, thử tải trực tiếp từ URL
        const link = document.createElement('a');
        link.href = pdfUrl;
        link.download = `HoaDon_${invoice.invoiceNumber || invoice.id}_${new Date().toISOString().split('T')[0]}.pdf`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.message.success('Đang tải xuống hóa đơn...');
      }
    });
  }

  cancelInvoice(invoice: EInvoice): void {
    this.modal.confirm({
      nzTitle: 'Xác nhận hủy',
      nzContent: `Bạn có chắc chắn muốn hủy hóa đơn "${invoice.invoiceNumber}"?`,
      nzOkText: 'Hủy hóa đơn',
      nzOkDanger: true,
      nzCancelText: 'Đóng',
      nzOnOk: () => {
        this.http.post(`${environment.apiUrl}/e-invoice/${invoice.id}/cancel`, {}).subscribe({
          next: (response: any) => {
            if (response.success !== false) {
              this.message.success('Hủy hóa đơn thành công');
              this.loadIssuedInvoices();
            } else {
              this.message.error(response.message || 'Không thể hủy hóa đơn');
            }
          },
          error: (error) => {
            console.error('Error cancelling invoice:', error);
            this.message.error('Có lỗi xảy ra khi hủy hóa đơn');
          }
        });
      }
    });
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('vi-VN').format(price);
  }

  calculateTotalAmount(): number {
    if (!this.draftForm || !this.draftForm.items) {
      return 0;
    }
    return this.draftForm.items.reduce((sum, item) => sum + (item.total_price || 0), 0);
  }

  formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'draft':
        return 'default';
      case 'issued':
        return 'success';
      case 'cancelled':
        return 'error';
      default:
        return 'default';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'draft':
        return 'Bản nháp';
      case 'issued':
        return 'Đã xuất';
      case 'cancelled':
        return 'Đã hủy';
      default:
        return status;
    }
  }

  // ============ AUTHENTICATION ============

  /**
   * Kiểm tra đăng nhập/token bằng cách thử gọi API getProviderAccounts
   * Nếu thành công => đã có token, cho phép chọn provider
   * Nếu lỗi auth => chưa có token hoặc token hết hạn, yêu cầu đăng nhập
   */
  checkAuthentication(): void {
    this.checkingAuth = true;
    this.authError = null;
    
    // Thử gọi API getProviderAccounts để kiểm tra token
    this.invoiceService.getEInvoiceProviderAccounts().subscribe({
      next: (response: any) => {
        this.checkingAuth = false;
        if (response.success !== false) {
          // Token hợp lệ, đã đăng nhập thành công
          this.isAuthenticated = true;
          this.authError = null;
          
          // Load danh sách provider accounts
          this.loadProviderAccounts();
          // Load hạn ngạch khi đăng nhập thành công
          this.loadQuota();
        } else {
          this.isAuthenticated = false;
          this.authError = response.message || 'Không thể xác thực với Sepay eInvoice API';
        }
      },
      error: (error: any) => {
        this.checkingAuth = false;
        this.isAuthenticated = false;
        
        // Xử lý các loại lỗi
        if (error.error?.error?.code === 'EINVOICE_CONFIG_MISSING') {
          this.authError = 'Chưa cấu hình Sepay eInvoice API. Vui lòng đăng nhập với username và password từ Sepay.';
        } else if (error.error?.error?.code === 'EINVOICE_AUTH_FAILED' || error.status === 401) {
          this.authError = 'Chưa đăng nhập hoặc token đã hết hạn. Vui lòng đăng nhập lại.';
        } else {
          this.authError = error.error?.error?.message || error.error?.message || 'Không thể kết nối với Sepay eInvoice API';
        }
        
        console.error('Authentication error:', error);
      }
    });
  }

  /**
   * Load hạn ngạch từ Sepay API
   */
  loadQuota(): void {
    if (!this.isAuthenticated) {
      return;
    }

    this.loadingQuota = true;
    this.quotaError = null;

    this.invoiceService.getEInvoiceUsage().subscribe({
      next: (response: any) => {
        this.loadingQuota = false;
        
        if (response.success !== false && response.data) {
          // Phân biệt theo role
          if (this.isAdminOrSuperadmin) {
            // Admin/Superadmin: Hiển thị tổng quota từ Sepay
            const quotaRemaining = response.data.quota_remaning || response.data.quota_remaining;
            this.quotaRemaining = quotaRemaining ? parseInt(quotaRemaining, 10) : null;
            this.quotaTotal = response.data.totalQuota || null;
            this.quotaUsed = response.data.usedQuota || null;
            
            if (this.quotaRemaining === null) {
              this.quotaError = 'Không thể lấy thông tin hạn ngạch';
            }
          } else {
            // Hotel/Staff/Business: Hiển thị quota đã đăng ký của mình
            const quotaRemaining = response.data.quota_remaning || response.data.quota_remaining;
            const allocatedQuota = response.data.allocatedQuota || 0;
            
            // Nếu chưa đăng ký (allocatedQuota = 0), hiển thị 0/0
            if (allocatedQuota === 0) {
              this.quotaRemaining = 0;
              this.quotaTotal = 0;
              this.quotaUsed = 0;
            } else {
              // Đã đăng ký: hiển thị remaining/allocated
              this.quotaRemaining = quotaRemaining ? parseInt(quotaRemaining, 10) : 0;
              this.quotaTotal = allocatedQuota;
              this.quotaUsed = response.data.usedQuota || 0;
              
              // Đảm bảo remaining không âm
              if (this.quotaRemaining < 0) {
                this.quotaRemaining = 0;
              }
            }
          }
        } else {
          this.quotaError = response.message || 'Không thể lấy thông tin hạn ngạch';
          // Nếu không phải admin và không có data, mặc định là 0
          if (!this.isAdminOrSuperadmin) {
            this.quotaRemaining = 0;
            this.quotaTotal = 0;
            this.quotaUsed = 0;
          }
        }
      },
      error: (error: any) => {
        this.loadingQuota = false;
        console.error('Error loading quota:', error);
        
        // Xử lý các loại lỗi
        if (error.error?.error?.code === 'EINVOICE_CONFIG_MISSING') {
          this.quotaError = 'Chưa cấu hình Sepay eInvoice API';
        } else if (error.error?.error?.code === 'EINVOICE_AUTH_FAILED' || error.status === 401) {
          this.quotaError = 'Chưa đăng nhập hoặc token đã hết hạn';
        } else {
          this.quotaError = error.error?.error?.message || error.error?.message || 'Không thể kết nối với Sepay eInvoice API';
        }
        
        // Nếu không phải admin và có lỗi, mặc định là 0
        if (!this.isAdminOrSuperadmin) {
          this.quotaRemaining = 0;
          this.quotaTotal = 0;
          this.quotaUsed = 0;
        }
      }
    });
  }

  /**
   * Mở modal đăng nhập
   */
  openLoginModal(): void {
    this.showLoginModal = true;
    this.loginForm = {
      username: '',
      password: ''
    };
  }

  /**
   * Đóng modal đăng nhập
   */
  closeLoginModal(): void {
    this.showLoginModal = false;
    this.loginForm = {
      username: '',
      password: ''
    };
  }

  /**
   * Đăng nhập Sepay eInvoice
   */
  login(): void {
    if (!this.loginForm.username || !this.loginForm.password) {
      this.message.warning('Vui lòng nhập đầy đủ username và password');
      return;
    }

    this.loggingIn = true;
    this.invoiceService.loginEInvoice(this.loginForm.username, this.loginForm.password).subscribe({
      next: (response: any) => {
        this.loggingIn = false;
        if (response.success !== false) {
          this.message.success('Đăng nhập thành công');
          this.closeLoginModal();
          // Kiểm tra lại authentication và load provider accounts
          this.checkAuthentication();
        } else {
          this.message.error(response.message || 'Đăng nhập thất bại');
        }
      },
      error: (error: any) => {
        this.loggingIn = false;
        console.error('Login error:', error);
        const errorMessage = error.error?.error?.message || error.error?.message || error.message || 'Đăng nhập thất bại';
        this.message.error('Lỗi đăng nhập: ' + errorMessage);
      }
    });
  }

  /**
   * Đăng xuất
   */
  logout(): void {
    this.invoiceService.logoutEInvoice().subscribe({
      next: (response: any) => {
        if (response.success !== false) {
          this.message.success('Đăng xuất thành công');
          this.isAuthenticated = false;
          this.selectedProvider = null;
          this.providerService.clearSelectedProvider();
          this.providerAccounts = [];
        }
      },
      error: (error: any) => {
        console.error('Logout error:', error);
        // Vẫn đặt isAuthenticated = false ngay cả khi logout API lỗi
        this.isAuthenticated = false;
        this.selectedProvider = null;
        this.providerService.clearSelectedProvider();
        this.providerAccounts = [];
      }
    });
  }

  /**
   * Thử đăng nhập lại
   */
  retryAuthentication(): void {
    this.checkAuthentication();
  }

  // ============ PROVIDER ACCOUNT MANAGEMENT ============

  /**
   * Load danh sách provider accounts
   */
  loadProviderAccounts(): void {
    this.loadingProviders = true;
    console.log('[EInvoice Management] Loading provider accounts...');
    
    this.invoiceService.getEInvoiceProviderAccounts().subscribe({
      next: (response: any) => {
        this.loadingProviders = false;
        console.log('[EInvoice Management] Provider accounts response:', response);
        
        if (response && response.success !== false) {
          // Backend trả về: { success: true, data: [...], paging: {...} }
          let accounts = [];
          
          if (response.data) {
            // response.data có thể là array hoặc object
            if (Array.isArray(response.data)) {
              accounts = response.data;
            } else if (response.data.items && Array.isArray(response.data.items)) {
              // Nếu data có items (format từ Sepay)
              accounts = response.data.items;
            } else if (response.data.accounts && Array.isArray(response.data.accounts)) {
              accounts = response.data.accounts;
            }
          } else if (Array.isArray(response)) {
            // Fallback: response là array trực tiếp
            accounts = response;
          }
          
          this.providerAccounts = accounts;
          console.log('[EInvoice Management] Loaded provider accounts:', this.providerAccounts.length);
          
          // Nếu chưa có provider được chọn và có danh sách, tự động chọn provider active đầu tiên
          if (!this.selectedProvider && this.providerAccounts.length > 0) {
            const activeProvider = this.providerAccounts.find(p => p.active !== false) || this.providerAccounts[0];
            this.selectProvider(activeProvider);
          }
          
          if (this.providerAccounts.length === 0) {
            console.warn('[EInvoice Management] No provider accounts found in response');
            this.message.warning('Không tìm thấy tài khoản nhà cung cấp nào');
          }
        } else {
          console.error('[EInvoice Management] Error response:', response);
          this.message.error(response?.message || response?.error?.message || 'Không thể tải danh sách tài khoản nhà cung cấp');
          this.providerAccounts = [];
        }
      },
      error: (error) => {
        this.loadingProviders = false;
        console.error('[EInvoice Management] Error loading provider accounts:', error);
        console.error('[EInvoice Management] Error details:', error.error || error);
        this.message.error('Có lỗi xảy ra khi tải danh sách tài khoản nhà cung cấp');
        this.providerAccounts = [];
      }
    });
  }

  /**
   * Mở modal chọn provider
   */
  openProviderModal(): void {
    // Kiểm tra đã đăng nhập chưa
    if (!this.isAuthenticated) {
      this.message.warning('Vui lòng đăng nhập trước khi chọn tài khoản nhà cung cấp');
      this.checkAuthentication();
      return;
    }
    
    if (this.providerAccounts.length === 0) {
      this.loadProviderAccounts();
    }
    this.showProviderModal = true;
  }

  /**
   * Đóng modal chọn provider
   */
  closeProviderModal(): void {
    this.showProviderModal = false;
  }

  /**
   * Chọn provider
   */
  selectProvider(provider: ProviderAccount): void {
    // Lưu provider cơ bản trước
    this.providerService.setSelectedProvider(provider);
    this.selectedProvider = provider;
    
    // Tự động load chi tiết (templates) từ API
    this.loadProviderDetails(provider);
    
    this.message.success(`Đã chọn tài khoản: ${provider.provider}`);
    this.closeProviderModal();
  }

  /**
   * Xóa provider đã chọn
   */
  clearProvider(): void {
    this.providerService.clearSelectedProvider();
    this.selectedProvider = null;
    this.message.info('Đã xóa tài khoản đã chọn');
  }

  /**
   * Lấy chi tiết provider (templates)
   */
  loadProviderDetails(provider: ProviderAccount): void {
    if (!provider || !provider.id) {
      console.warn('Provider ID is required to load details');
      return;
    }
    
    this.loadingProviderDetails = true;
    
    this.invoiceService.getEInvoiceProviderAccountDetails(provider.id).subscribe({
      next: (response: any) => {
        this.loadingProviderDetails = false;
        
        if (response.success !== false) {
          // Xử lý format response từ backend
          // Backend trả về: { success: true, data: { id, provider, active, templates, ... } }
          const details = response.data || response;
          
          // Cập nhật provider với thông tin chi tiết (templates, ...)
          const updatedProvider: ProviderAccount = {
            ...provider,
            ...details,
            // Đảm bảo giữ lại các field cơ bản
            id: details.id || provider.id,
            provider: details.provider || provider.provider,
            active: details.active !== undefined ? details.active : provider.active,
            templates: details.templates || provider.templates || []
          };
          
          // Cập nhật trong service và component
          this.providerService.setSelectedProvider(updatedProvider);
          this.selectedProvider = updatedProvider;
          
          // Cập nhật trong danh sách provider accounts nếu có
          const index = this.providerAccounts.findIndex(p => p.id === provider.id);
          if (index !== -1) {
            this.providerAccounts[index] = updatedProvider;
          }
          
          console.log('Provider details loaded:', updatedProvider);
        } else {
          console.error('Failed to load provider details:', response);
          this.message.warning('Không thể tải chi tiết tài khoản nhà cung cấp');
        }
      },
      error: (error) => {
        this.loadingProviderDetails = false;
        console.error('Error loading provider details:', error);
        this.message.error('Có lỗi xảy ra khi tải chi tiết tài khoản nhà cung cấp');
      }
    });
  }
}

