import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Debt, DebtQuery, DebtService, SettleDebtRequest } from '../../services/debt.service';
import { HotelService } from '../../services/hotel.service';
import { Hotel } from '../../interfaces/hotel';
import { AuthService } from '../../services/auth.service';
import { User } from '../../interfaces/user';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';

@Component({
  selector: 'app-debt-management',
  templateUrl: './debt-management.component.html',
  styleUrls: ['./debt-management.component.css']
})
export class DebtManagementComponent implements OnInit {
  debts: Debt[] = [];
  hotels: Hotel[] = [];
  selectedHotelId: string | null = null;
  selectedStatus: string | null = null;
  currentUser: User | null = null;
  isLoading = false;
  total = 0;
  pageIndex = 1;
  pageSize = 20;
  startDate: Date | null = null;
  endDate: Date | null = null;
  dateRange: [Date | null, Date | null] | null = null;
  
  // Formatters
  formatterVND = (value: number): string => `${value.toLocaleString('vi-VN')} đ`;
  parserVND = (value: string): string => value.replace(/[^\d]/g, '');
  
  // Modal states
  isSettleModalVisible = false;
  selectedDebt: Debt | null = null;
  settleForm!: FormGroup;
  isSettling = false;

  paymentMethods = [
    { value: 'cash', label: 'Tiền mặt' },
    { value: 'bank_transfer', label: 'Chuyển khoản' },
    { value: 'card', label: 'Thẻ ngân hàng' },
    { value: 'other', label: 'Khác' }
  ];

  constructor(
    private debtService: DebtService,
    private hotelService: HotelService,
    public authService: AuthService,
    private message: NzMessageService,
    private modal: NzModalService,
    private fb: FormBuilder
  ) {
    this.settleForm = this.fb.group({
      amount: [0, [Validators.required, Validators.min(0.01)]],
      paymentMethod: ['cash', Validators.required],
      notes: ['']
    });
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadHotels();
    this.loadDebts();
  }

  get isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  get isBusiness(): boolean {
    return this.authService.isBusiness();
  }

  get isHotelManager(): boolean {
    return this.authService.isHotelManager();
  }

  loadHotels(): void {
    this.hotelService.getHotels().subscribe({
      next: (data) => {
        if (this.isAdmin) {
          this.hotels = data.filter(h => h.status === 'active');
        } else if (this.isBusiness && this.currentUser?.businessId) {
          this.hotels = data.filter(h => {
            const hotelBusinessId = typeof h.businessId === 'object' ? h.businessId?._id : h.businessId;
            return hotelBusinessId === this.currentUser?.businessId && h.status === 'active';
          });
        } else if (this.isHotelManager && this.currentUser?.hotelId) {
          this.hotels = data.filter(h => h._id === this.currentUser?.hotelId);
          if (this.hotels.length === 1) {
            this.selectedHotelId = this.hotels[0]._id || null;
          }
        } else {
          this.hotels = [];
        }
      },
      error: (error) => {
        console.error('Lỗi khi tải danh sách khách sạn:', error);
        this.message.error('Không thể tải danh sách khách sạn.');
      }
    });
  }

  loadDebts(): void {
    this.isLoading = true;
    const query: DebtQuery = {
      page: this.pageIndex,
      pageSize: this.pageSize,
      hotelId: this.selectedHotelId || undefined,
      status: this.selectedStatus || undefined,
      startDate: this.startDate ? this.startDate.toISOString() : undefined,
      endDate: this.endDate ? this.endDate.toISOString() : undefined
    };

    this.debtService.getDebts(query).subscribe({
      next: (response) => {
        this.debts = response.debts;
        this.total = response.total;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Lỗi khi tải danh sách công nợ:', error);
        this.message.error('Không thể tải danh sách công nợ.');
        this.isLoading = false;
      }
    });
  }

  onHotelChange(hotelId: string | null): void {
    this.selectedHotelId = hotelId;
    this.pageIndex = 1;
    this.loadDebts();
  }

  onStatusChange(status: string | null): void {
    this.selectedStatus = status;
    this.pageIndex = 1;
    this.loadDebts();
  }

  onDateRangeChange(dates: [Date | null, Date | null] | null): void {
    if (dates && dates[0] && dates[1]) {
      this.startDate = dates[0];
      this.endDate = dates[1];
      this.dateRange = dates;
    } else {
      this.startDate = null;
      this.endDate = null;
      this.dateRange = null;
    }
    this.pageIndex = 1;
    this.loadDebts();
  }

  onPageChange(page: number): void {
    this.pageIndex = page;
    this.loadDebts();
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize = pageSize;
    this.pageIndex = 1;
    this.loadDebts();
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'pending': 'Chưa thanh toán',
      'partial': 'Thanh toán một phần',
      'settled': 'Đã quyết toán',
      'cancelled': 'Đã hủy'
    };
    return labels[status] || status;
  }

  getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      'pending': 'red',
      'partial': 'orange',
      'settled': 'green',
      'cancelled': 'default'
    };
    return colors[status] || 'default';
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  }

  formatDate(date: Date | string | null | undefined): string {
    if (!date) return '-';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('vi-VN');
  }

  openSettleModal(debt: Debt): void {
    this.selectedDebt = debt;
    this.settleForm.patchValue({
      amount: debt.remainingAmount,
      paymentMethod: 'cash',
      notes: ''
    });
    this.isSettleModalVisible = true;
  }

  closeSettleModal(): void {
    this.isSettleModalVisible = false;
    this.selectedDebt = null;
    this.settleForm.reset({
      amount: 0,
      paymentMethod: 'cash',
      notes: ''
    });
  }

  handleSettle(): void {
    if (this.settleForm.invalid || !this.selectedDebt) {
      this.message.warning('Vui lòng điền đầy đủ thông tin');
      return;
    }

    const formValue = this.settleForm.value;
    const amount = Number(formValue.amount);
    
    if (amount <= 0) {
      this.message.warning('Số tiền thanh toán phải lớn hơn 0');
      return;
    }

    if (amount > this.selectedDebt.remainingAmount) {
      this.message.warning('Số tiền thanh toán không được vượt quá số tiền còn lại');
      return;
    }

    this.isSettling = true;
    const request: SettleDebtRequest = {
      amount: amount,
      paymentMethod: formValue.paymentMethod,
      notes: formValue.notes || ''
    };

    this.debtService.settleDebt(this.selectedDebt._id!, request).subscribe({
      next: (response) => {
        this.message.success('Thanh toán công nợ thành công');
        this.closeSettleModal();
        this.loadDebts();
        this.isSettling = false;
      },
      error: (error) => {
        console.error('Lỗi khi thanh toán công nợ:', error);
        this.message.error(error.error?.message || 'Lỗi khi thanh toán công nợ');
        this.isSettling = false;
      }
    });
  }

  deleteDebt(debt: Debt): void {
    if (debt.paidAmount > 0) {
      this.message.warning('Không thể xóa công nợ đã có thanh toán');
      return;
    }

    this.modal.confirm({
      nzTitle: 'Xác nhận xóa công nợ',
      nzContent: `Bạn có chắc muốn xóa công nợ của ${debt.customerName}?`,
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        this.debtService.deleteDebt(debt._id!).subscribe({
          next: () => {
            this.message.success('Xóa công nợ thành công');
            this.loadDebts();
          },
          error: (error) => {
            console.error('Lỗi khi xóa công nợ:', error);
            this.message.error(error.error?.message || 'Lỗi khi xóa công nợ');
          }
        });
      }
    });
  }

  canDelete(debt: Debt): boolean {
    return (this.isAdmin || this.isBusiness) && debt.paidAmount === 0;
  }

  canSettle(debt: Debt): boolean {
    return debt.status !== 'settled' && debt.status !== 'cancelled';
  }
}

