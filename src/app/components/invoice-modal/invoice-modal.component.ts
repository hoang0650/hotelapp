import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { InvoiceService, Invoice } from '../../services/invoice.service';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'app-invoice-modal',
  templateUrl: './invoice-modal.component.html',
  styleUrls: ['./invoice-modal.component.css']
})
export class InvoiceModalComponent implements OnInit, OnDestroy {
  isVisible = false;
  invoiceData: Invoice = {};
  isLoading = false;
  private destroy$ = new Subject<void>();

  constructor(
    private invoiceService: InvoiceService,
    private message: NzMessageService
  ) {}

  ngOnInit(): void {
    // Theo dõi trạng thái hiển thị modal
    this.invoiceService.isModalVisible()
      .pipe(takeUntil(this.destroy$))
      .subscribe((visible: boolean) => {
        this.isVisible = visible;
      });

    // Theo dõi dữ liệu hóa đơn hiện tại
    this.invoiceService.getCurrentInvoice()
      .pipe(takeUntil(this.destroy$))
      .subscribe((invoice: Invoice | null) => {
        if (invoice) {
          this.invoiceData = invoice;
          // Tải thêm thông tin chi tiết nếu cần
          this.loadInvoiceDetails(invoice.id || invoice.bookingId);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadInvoiceDetails(id?: string): void {
    if (!id) {
      this.message.warning('Không thể tải hóa đơn: Thiếu ID');
      return;
    }

    this.isLoading = true;
    this.invoiceService.getInvoiceById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        data => {
          if (data) {
            // Đảm bảo có mã hóa đơn 6 chữ số
            if (!data.invoiceNumber) {
              data.invoiceNumber = this.invoiceService.generateInvoiceNumber();
            }
            
            this.invoiceData = { ...this.invoiceData, ...data };
            
            // Đảm bảo luôn có thông tin cơ bản
            this.ensureInvoiceData();
          }
          this.isLoading = false;
        },
        error => {
          console.error('Lỗi khi tải thông tin hóa đơn:', error);
          this.message.error('Không thể tải thông tin hóa đơn');
          this.isLoading = false;
          
          // Vẫn đảm bảo có thông tin cơ bản khi gặp lỗi
          this.ensureInvoiceData();
        }
      );
  }
  
  // Đảm bảo hóa đơn luôn có dữ liệu hợp lệ để hiển thị
  ensureInvoiceData(): void {
    if (!this.invoiceData.date) {
      this.invoiceData.date = new Date();
    }
    
    if (!this.invoiceData.invoiceNumber) {
      this.invoiceData.invoiceNumber = this.invoiceService.generateInvoiceNumber();
    }
    
    if (!this.invoiceData.products) {
      this.invoiceData.products = [];
    }
    
    // Đảm bảo luôn có dữ liệu sản phẩm mặc định nếu không có
    if (this.invoiceData.products.length === 0 && this.invoiceData.roomNumber) {
      this.invoiceData.products.push({
        name: `Tiền phòng ${this.invoiceData.roomNumber}`,
        quantity: 1,
        price: this.invoiceData.amount || 0
      });
    }
  }

  handleCancel(): void {
    this.invoiceService.hideInvoiceModal();
  }

  printInvoice(): void {
    window.print();
  }

  downloadInvoice(): void {
    // Logic tải xuống hóa đơn
    this.message.info('Đang tải xuống hóa đơn');
  }

  sendInvoiceByEmail(): void {
    // Logic gửi email hóa đơn
    this.message.info('Chức năng gửi email đang được phát triển');
  }

  deleteInvoice(): void {
    if (!this.invoiceData.id) {
      this.message.warning('Không thể xóa hóa đơn: Thiếu ID');
      return;
    }

    this.isLoading = true;
    this.invoiceService.deleteInvoice(this.invoiceData.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        () => {
          this.message.success('Đã xóa hóa đơn thành công');
          this.handleCancel();
          this.isLoading = false;
        },
        error => {
          console.error('Lỗi khi xóa hóa đơn:', error);
          this.message.error('Không thể xóa hóa đơn');
          this.isLoading = false;
        }
      );
  }
} 