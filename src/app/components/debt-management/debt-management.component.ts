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

  // Label modal states
  isLabelModalVisible = false;
  currentLabels: Array<{ name: string; color: string }> = [];
  newLabelInput: string[] = [];
  isUpdatingLabels = false;
  selectedLabelColor: string = 'default';
  suggestedLabels = [
    { name: 'Quan trọng', color: 'red' },
    { name: 'Cần theo dõi', color: 'orange' },
    { name: 'Khách VIP', color: 'purple' },
    { name: 'Quá hạn', color: 'volcano' },
    { name: 'Đã liên hệ', color: 'blue' },
    { name: 'Chờ xác nhận', color: 'gold' }
  ];
  availableColors = [
    { value: 'default', label: 'Mặc định' },
    { value: 'red', label: 'Đỏ' },
    { value: 'orange', label: 'Cam' },
    { value: 'gold', label: 'Vàng' },
    { value: 'green', label: 'Xanh lá' },
    { value: 'blue', label: 'Xanh dương' },
    { value: 'purple', label: 'Tím' },
    { value: 'volcano', label: 'Đỏ cam' },
    { value: 'cyan', label: 'Xanh lơ' },
    { value: 'magenta', label: 'Hồng' }
  ];

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

  get isStaff(): boolean {
    return this.authService.isStaff();
  }

  get isGuest(): boolean {
    return this.authService.isGuest();
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
    // Chỉ superadmin, admin, business được xóa
    // Và chỉ được xóa khi chưa thanh toán
    return (this.isAdmin || this.isBusiness) && debt.paidAmount === 0;
  }

  canSettle(debt: Debt): boolean {
    // superadmin, admin, business, hotel-manager được thanh toán
    // staff và guest không được thanh toán
    if (this.isStaff || this.isGuest) {
      return false;
    }
    return debt.status !== 'settled' && debt.status !== 'cancelled';
  }

  canManageLabels(debt: Debt): boolean {
    // Tất cả role có quyền xem đều được quản lý nhãn
    return true;
  }

  // Label management methods
  openLabelModal(debt: Debt): void {
    this.selectedDebt = debt;
    // Chuyển đổi labels từ format cũ (string) sang format mới (object)
    this.currentLabels = (debt.labels || []).map(label => {
      if (typeof label === 'string') {
        return { name: label, color: this.getDefaultLabelColor(label) };
      }
      return { name: label.name, color: label.color || 'default' };
    });
    this.newLabelInput = [];
    this.selectedLabelColor = 'default';
    this.isLabelModalVisible = true;
  }

  closeLabelModal(): void {
    this.isLabelModalVisible = false;
    this.selectedDebt = null;
    this.currentLabels = [];
    this.newLabelInput = [];
    this.selectedLabelColor = 'default';
  }

  onNewLabelInput(value: string[]): void {
    // Khi người dùng thêm nhãn mới, thêm vào currentLabels với màu đã chọn
    if (value && value.length > 0) {
      value.forEach(labelName => {
        const trimmedLabel = labelName.trim();
        if (trimmedLabel && !this.currentLabels.some(l => l.name === trimmedLabel)) {
          this.currentLabels.push({
            name: trimmedLabel,
            color: this.selectedLabelColor
          });
        }
      });
    }
    // Clear input sau khi thêm
    setTimeout(() => {
      this.newLabelInput = [];
    }, 0);
  }

  addSuggestedLabel(label: { name: string; color: string }): void {
    if (!this.currentLabels.some(l => l.name === label.name)) {
      this.currentLabels.push({ ...label });
    }
  }

  removeLabel(label: { name: string; color: string }): void {
    const index = this.currentLabels.findIndex(l => l.name === label.name);
    if (index > -1) {
      this.currentLabels.splice(index, 1);
    }
  }

  updateLabelColor(label: { name: string; color: string }, newColor: string): void {
    const index = this.currentLabels.findIndex(l => l.name === label.name);
    if (index > -1) {
      this.currentLabels[index].color = newColor;
    }
  }

  saveLabels(): void {
    if (!this.selectedDebt) return;

    this.isUpdatingLabels = true;
    this.debtService.updateDebtLabels(this.selectedDebt._id!, this.currentLabels).subscribe({
      next: (response) => {
        this.message.success('Cập nhật nhãn thành công');
        this.closeLabelModal();
        this.loadDebts();
        this.isUpdatingLabels = false;
      },
      error: (error) => {
        console.error('Lỗi khi cập nhật nhãn:', error);
        this.message.error(error.error?.message || 'Lỗi khi cập nhật nhãn');
        this.isUpdatingLabels = false;
      }
    });
  }

  getLabelName(label: string | { name: string; color?: string }): string {
    if (!label) return '';
    if (typeof label === 'string') {
      return label;
    }
    if (typeof label === 'object' && label.name) {
      return label.name;
    }
    return '';
  }

  getLabelColor(label: string | { name: string; color?: string }): string {
    if (!label) return 'default';
    if (typeof label === 'string') {
      return this.getDefaultLabelColor(label);
    }
    if (typeof label === 'object' && label.name) {
      return label.color || this.getDefaultLabelColor(label.name);
    }
    return 'default';
  }

  getDefaultLabelColor(labelName: string): string {
    // Màu sắc mặc định dựa trên nhãn
    const colorMap: Record<string, string> = {
      'Quan trọng': 'red',
      'Cần theo dõi': 'orange',
      'Khách VIP': 'purple',
      'Quá hạn': 'volcano',
      'Đã liên hệ': 'blue',
      'Chờ xác nhận': 'gold'
    };
    return colorMap[labelName] || 'default';
  }
}

