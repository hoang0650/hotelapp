import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Debt, DebtQuery, DebtService, SettleDebtRequest } from '../../services/debt.service';
import { HotelService } from '../../services/hotel.service';
import { Hotel } from '../../interfaces/hotel';
import { AuthService } from '../../services/auth.service';
import { User } from '../../interfaces/user';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { TranslateService } from '@ngx-translate/core';

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
  suggestedLabels: Array<{ name: string; color: string }> = [];
  availableColors: Array<{ value: string; label: string }> = [];
  paymentMethods: Array<{ value: string; label: string }> = [];

  constructor(
    private debtService: DebtService,
    private hotelService: HotelService,
    public authService: AuthService,
    private message: NzMessageService,
    private modal: NzModalService,
    private fb: FormBuilder,
    private translate: TranslateService
  ) {
    this.settleForm = this.fb.group({
      amount: [0, [Validators.required, Validators.min(0.01)]],
      paymentMethod: ['cash', Validators.required],
      notes: ['']
    });
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.initTranslationArrays();

    const storedHotelId = this.hotelService.resolvePreferredHotelId(this.authService.getHotelId());
    if (storedHotelId) {
      this.selectedHotelId = storedHotelId;
    }

    this.hotelService.selectedHotelId$.subscribe((hotelId) => {
      const normalized = this.hotelService.normalizeHotelId(hotelId);
      if (normalized && !this.hotelService.sameHotelId(normalized, this.selectedHotelId)) {
        this.onHotelChange(normalized);
      }
    });

    this.loadHotels();
    this.loadDebts();

    this.translate.onLangChange.subscribe(() => {
      this.initTranslationArrays();
    });
  }

  private initTranslationArrays(): void {
    this.suggestedLabels = [
      { name: this.translate.instant('DEBT_MANAGEMENT.LABEL_OPTIONS.IMPORTANT'), color: 'red' },
      { name: this.translate.instant('DEBT_MANAGEMENT.LABEL_OPTIONS.NEED_FOLLOW_UP'), color: 'orange' },
      { name: this.translate.instant('DEBT_MANAGEMENT.LABEL_OPTIONS.VIP_GUEST'), color: 'purple' },
      { name: this.translate.instant('DEBT_MANAGEMENT.LABEL_OPTIONS.OVERDUE'), color: 'volcano' },
      { name: this.translate.instant('DEBT_MANAGEMENT.LABEL_OPTIONS.CONTACTED'), color: 'blue' },
      { name: this.translate.instant('DEBT_MANAGEMENT.LABEL_OPTIONS.PENDING_CONFIRMATION'), color: 'gold' }
    ];

    this.availableColors = [
      { value: 'default', label: this.translate.instant('DEBT_MANAGEMENT.COLORS.DEFAULT') },
      { value: 'red', label: this.translate.instant('DEBT_MANAGEMENT.COLORS.RED') },
      { value: 'orange', label: this.translate.instant('DEBT_MANAGEMENT.COLORS.ORANGE') },
      { value: 'gold', label: this.translate.instant('DEBT_MANAGEMENT.COLORS.GOLD') },
      { value: 'green', label: this.translate.instant('DEBT_MANAGEMENT.COLORS.GREEN') },
      { value: 'blue', label: this.translate.instant('DEBT_MANAGEMENT.COLORS.BLUE') },
      { value: 'purple', label: this.translate.instant('DEBT_MANAGEMENT.COLORS.PURPLE') },
      { value: 'volcano', label: this.translate.instant('DEBT_MANAGEMENT.COLORS.VOLCANO') },
      { value: 'cyan', label: this.translate.instant('DEBT_MANAGEMENT.COLORS.CYAN') },
      { value: 'magenta', label: this.translate.instant('DEBT_MANAGEMENT.COLORS.MAGENTA') }
    ];

    this.paymentMethods = [
      { value: 'cash', label: this.translate.instant('DEBT_MANAGEMENT.PAYMENT_METHODS.CASH') },
      { value: 'bank_transfer', label: this.translate.instant('DEBT_MANAGEMENT.PAYMENT_METHODS.BANK_TRANSFER') },
      { value: 'card', label: this.translate.instant('DEBT_MANAGEMENT.PAYMENT_METHODS.CARD') },
      { value: 'other', label: this.translate.instant('DEBT_MANAGEMENT.PAYMENT_METHODS.OTHER') }
    ];
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
    const cached = this.hotelService.getCachedHotels();
    if (cached.length > 0) {
      this.applyHotelsList(cached);
    }

    this.hotelService.getHotelsCached(undefined, undefined, { lite: true }).subscribe({
      next: (data) => this.applyHotelsList(data),
      error: (error) => {
        console.error('Lỗi khi tải danh sách khách sạn:', error);
        this.message.error(this.translate.instant('DEBT_MANAGEMENT.LOAD_HOTELS_ERROR'));
      }
    });
  }

  private applyHotelsList(data: Hotel[]): void {
    if (this.isAdmin) {
      this.hotels = data.filter(h => h.status === 'active' || !(h as any).status);
    } else if (this.isBusiness && this.currentUser?.businessId) {
      this.hotels = data.filter(h => {
        const hotelBusinessId = typeof h.businessId === 'object' ? h.businessId?._id : h.businessId;
        const userBusinessId = this.currentUser?.businessId;
        return hotelBusinessId && userBusinessId && hotelBusinessId.toString() === userBusinessId.toString()
          && (h.status === 'active' || !(h as any).status);
      });
    } else if (this.isHotelManager && this.currentUser?.hotelId) {
      this.hotels = data.filter(h => h._id === this.currentUser?.hotelId);
      if (!this.selectedHotelId && this.hotels.length === 1) {
        this.selectedHotelId = this.hotels[0]._id || null;
        this.loadDebts();
      }
    } else {
      this.hotels = [];
    }
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
        this.message.error(this.translate.instant('DEBT_MANAGEMENT.LOAD_DEBTS_ERROR'));
        this.isLoading = false;
      }
    });
  }

  onHotelChange(hotelId: string | null): void {
    this.selectedHotelId = hotelId;
    this.hotelService.setSelectedHotelId(hotelId);
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
      'pending': this.translate.instant('DEBT_MANAGEMENT.STATUS_OPTIONS.PENDING'),
      'partial': this.translate.instant('DEBT_MANAGEMENT.STATUS_OPTIONS.PARTIAL'),
      'settled': this.translate.instant('DEBT_MANAGEMENT.STATUS_OPTIONS.SETTLED'),
      'cancelled': this.translate.instant('DEBT_MANAGEMENT.STATUS_OPTIONS.CANCELLED')
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
      this.message.warning(this.translate.instant('DEBT_MANAGEMENT.FILL_REQUIRED_FIELDS'));
      return;
    }

    const formValue = this.settleForm.value;
    const amount = Number(formValue.amount);
    
    if (amount <= 0) {
      this.message.warning(this.translate.instant('DEBT_MANAGEMENT.AMOUNT_MUST_BE_GREATER_THAN_ZERO'));
      return;
    }

    if (amount > this.selectedDebt.remainingAmount) {
      this.message.warning(this.translate.instant('DEBT_MANAGEMENT.AMOUNT_EXCEEDS_REMAINING'));
      return;
    }

    this.isSettling = true;
    const userNote = (formValue.notes || '').trim();
    const request: SettleDebtRequest = {
      amount: amount,
      paymentMethod: formValue.paymentMethod,
      notes: userNote || ''
    };

    this.debtService.settleDebt(this.selectedDebt._id!, request).subscribe({
      next: (response) => {
        this.message.success(this.translate.instant('DEBT_MANAGEMENT.SETTLE_SUCCESS'));
        this.closeSettleModal();
        this.loadDebts();
        this.isSettling = false;
      },
      error: (error) => {
        console.error('Lỗi khi thanh toán công nợ:', error);
        this.message.error(error.error?.message || this.translate.instant('DEBT_MANAGEMENT.SETTLE_ERROR'));
        this.isSettling = false;
      }
    });
  }

  deleteDebt(debt: Debt): void {
    if (debt.paidAmount > 0) {
      this.message.warning(this.translate.instant('DEBT_MANAGEMENT.CANNOT_DELETE_WITH_PAYMENT'));
      return;
    }

    this.modal.confirm({
      nzTitle: this.translate.instant('DEBT_MANAGEMENT.CONFIRM_DELETE_TITLE'),
      nzContent: this.translate.instant('DEBT_MANAGEMENT.CONFIRM_DELETE_CONTENT', { customerName: debt.customerName }),
      nzOkText: this.translate.instant('COMMON.DELETE'),
      nzOkType: 'primary',
      nzOkDanger: true,
      nzCancelText: this.translate.instant('COMMON.CANCEL'),
      nzOnOk: () => {
        this.debtService.deleteDebt(debt._id!).subscribe({
          next: () => {
            this.message.success(this.translate.instant('DEBT_MANAGEMENT.DELETE_SUCCESS'));
            this.loadDebts();
          },
          error: (error) => {
            console.error('Lỗi khi xóa công nợ:', error);
            this.message.error(error.error?.message || this.translate.instant('DEBT_MANAGEMENT.DELETE_ERROR'));
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
        this.message.success(this.translate.instant('DEBT_MANAGEMENT.UPDATE_LABELS_SUCCESS'));
        this.closeLabelModal();
        this.loadDebts();
        this.isUpdatingLabels = false;
      },
      error: (error) => {
        console.error('Lỗi khi cập nhật nhãn:', error);
        this.message.error(error.error?.message || this.translate.instant('DEBT_MANAGEMENT.UPDATE_LABELS_ERROR'));
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
      [this.translate.instant('DEBT_MANAGEMENT.LABEL_OPTIONS.IMPORTANT')]: 'red',
      [this.translate.instant('DEBT_MANAGEMENT.LABEL_OPTIONS.NEED_FOLLOW_UP')]: 'orange',
      [this.translate.instant('DEBT_MANAGEMENT.LABEL_OPTIONS.VIP_GUEST')]: 'purple',
      [this.translate.instant('DEBT_MANAGEMENT.LABEL_OPTIONS.OVERDUE')]: 'volcano',
      [this.translate.instant('DEBT_MANAGEMENT.LABEL_OPTIONS.CONTACTED')]: 'blue',
      [this.translate.instant('DEBT_MANAGEMENT.LABEL_OPTIONS.PENDING_CONFIRMATION')]: 'gold'
    };
    return colorMap[labelName] || 'default';
  }
}

