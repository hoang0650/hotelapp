import { Component, OnInit } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { NzTabChangeEvent } from 'ng-zorro-antd/tabs';
import { InvoiceService } from '../../services/invoice.service';
import { EInvoiceProviderService, ProviderAccount } from '../../services/e-invoice-provider.service';

interface EInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  customerName: string;
  totalAmount: number;
  status: 'draft' | 'issued' | 'cancelled';
  createdAt: Date;
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

  constructor(
    private http: HttpClient,
    private message: NzMessageService,
    private modal: NzModalService,
    private authService: AuthService,
    private invoiceService: InvoiceService,
    private providerService: EInvoiceProviderService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    
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
    // TODO: Call API to load drafts
    this.http.get(`${environment.apiUrl}/e-invoice/drafts`, {
      params: {
        page: this.pageIndex.toString(),
        limit: this.pageSize.toString()
      }
    }).subscribe({
      next: (response: any) => {
        this.loading = false;
        if (response.success !== false) {
          this.drafts = response.data?.drafts || response.drafts || [];
          this.totalDrafts = response.data?.total || response.total || 0;
        } else {
          this.message.error(response.message || 'Không thể tải danh sách bản nháp');
          this.drafts = [];
        }
      },
      error: (error) => {
        this.loading = false;
        console.error('Error loading drafts:', error);
        // Mock data for development
        this.drafts = [];
        this.totalDrafts = 0;
      }
    });
  }

  loadIssuedInvoices(): void {
    this.loading = true;
    // TODO: Call API to load issued invoices
    this.http.get(`${environment.apiUrl}/e-invoice/issued`, {
      params: {
        page: this.pageIndex.toString(),
        limit: this.pageSize.toString()
      }
    }).subscribe({
      next: (response: any) => {
        this.loading = false;
        if (response.success !== false) {
          this.issuedInvoices = response.data?.invoices || response.invoices || [];
          this.totalIssued = response.data?.total || response.total || 0;
        } else {
          this.message.error(response.message || 'Không thể tải danh sách hóa đơn');
          this.issuedInvoices = [];
        }
      },
      error: (error) => {
        this.loading = false;
        console.error('Error loading issued invoices:', error);
        // Mock data for development
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
    // TODO: Open modal or navigate to view draft
    this.message.info(`Xem bản nháp: ${invoice.invoiceNumber}`);
  }

  editDraft(invoice: EInvoice): void {
    // TODO: Navigate to edit draft
    this.message.info(`Chỉnh sửa bản nháp: ${invoice.invoiceNumber}`);
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
    // TODO: Open modal or navigate to view invoice
    this.message.info(`Xem hóa đơn: ${invoice.invoiceNumber}`);
  }

  downloadInvoice(invoice: EInvoice): void {
    // TODO: Download invoice PDF
    this.message.info(`Tải xuống hóa đơn: ${invoice.invoiceNumber}`);
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

