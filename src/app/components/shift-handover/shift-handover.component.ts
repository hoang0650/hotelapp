import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { Subscription } from 'rxjs';
import { ShiftHandoverService } from '../../services/shift-handover.service';
import { StaffService } from '../../services/staff.service';
import { AuthService } from '../../services/auth.service';
import { TranslateService } from '@ngx-translate/core';
import { 
  ShiftHandover, 
  ShiftHandoverCreateRequest,
  ShiftHandoverResponse,
  ShiftHandoverHistoryResponse,
  RevenueResponse
} from '../../interfaces/shift-handover';

@Component({
  selector: 'app-shift-handover',
  templateUrl: './shift-handover.component.html',
  styleUrls: ['./shift-handover.component.css']
})
export class ShiftHandoverComponent implements OnInit, OnDestroy {
  private subscriptions = new Subscription();
  
  // Form
  handoverForm!: FormGroup;
  
  // Data
  staffList: any[] = [];
  managerList: any[] = [];
  shiftHistory: ShiftHandover[] = [];
  currentStaff: any = null;
  
  // UI State
  isLoading = false;
  isModalVisible = false;
  isHistoryVisible = false;
  isManagerHandoverModalVisible = false;
  passwordVisible = false;
  
  // Manager handover form
  managerHandoverForm!: FormGroup;
  
  // Current shift data
  previousShiftAmount = 0;
  cashInShift = 0;
  managerHandoverAmount = 0;
  handoverAmount = 0;
  
  // Revenue data
  revenueData: any = null;
  
  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalItems = 0;
  
  // Permissions
  canViewHistory = false;
  
  constructor(
    private fb: FormBuilder,
    private shiftHandoverService: ShiftHandoverService,
    private staffService: StaffService,
    private authService: AuthService,
    private message: NzMessageService,
    private modal: NzModalService,
    private translate: TranslateService
  ) {
    this.initForm();
    this.initManagerHandoverForm();
  }

  ngOnInit(): void {
    this.checkPermissions();
    this.loadStaffList();
    this.loadManagerList();
    this.loadPreviousShiftAmount();
    this.loadRevenue();
    
    if (this.canViewHistory) {
      this.loadShiftHistory();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private initForm(): void {
    this.handoverForm = this.fb.group({
      toStaffId: [null, Validators.required],
      toUserPassword: ['', Validators.required],
      previousShiftAmount: [0],
      cashInShift: [0],
      managerHandoverAmount: [0],
      cashAmount: [0],
      bankTransferAmount: [0],
      cardPaymentAmount: [0],
      expenseAmount: [0],
      incomeAmount: [0],
      notes: [''],
      pendingIssues: [[]]
    });

    // Auto calculate handover amount when values change
    this.handoverForm.valueChanges.subscribe(() => {
      this.calculateHandoverAmount();
    });
  }

  private initManagerHandoverForm(): void {
    this.managerHandoverForm = this.fb.group({
      managerId: [null, Validators.required],
      amount: [0, [Validators.required, Validators.min(1)]],
      notes: ['']
    });
  }

  private checkPermissions(): void {
    this.canViewHistory = this.authService.canViewShiftHistory();
  }

  // ============ LOAD DATA ============

  private loadStaffList(): void {
    const hotelId = this.authService.getHotelId();
    if (!hotelId) return;

    this.subscriptions.add(
      this.staffService.getStaffByHotel(hotelId).subscribe(
        (staffList: any[]) => {
          // Lọc bỏ nhân viên hiện tại
          const currentUserId = this.authService.getUserId();
          this.staffList = staffList.filter(staff => staff.userId !== currentUserId);
        },
        (error) => {
          this.message.error(this.translate.instant('SHIFT_HANDOVER.LOAD_STAFF_ERROR'));
          console.error(error);
        }
      )
    );
  }

  private loadManagerList(): void {
    const hotelId = this.authService.getHotelId();
    if (!hotelId) return;

    this.subscriptions.add(
      this.staffService.getStaffByHotel(hotelId).subscribe(
        (staffList: any[]) => {
          this.managerList = staffList.filter(staff => {
            const role = staff.userId?.role || staff.role || '';
            return ['admin', 'superadmin', 'business', 'hotel_manager'].includes(role);
          });
        },
        (error) => {
          console.error('Error loading manager list:', error);
        }
      )
    );
  }

  private loadPreviousShiftAmount(): void {
    const hotelId = this.authService.getHotelId();
    if (!hotelId) return;

    this.subscriptions.add(
      this.shiftHandoverService.getPreviousShiftAmount(hotelId).subscribe(
        (response) => {
          this.previousShiftAmount = response.data.previousShiftAmount;
          this.handoverForm.patchValue({ previousShiftAmount: this.previousShiftAmount });
        },
        (error) => {
          console.error('Error loading previous shift amount:', error);
        }
      )
    );
  }

  private loadRevenue(): void {
    const hotelId = this.authService.getHotelId();
    if (!hotelId) return;

    this.subscriptions.add(
      this.shiftHandoverService.calculateRevenue({ hotelId }).subscribe(
        (response: RevenueResponse) => {
          this.revenueData = response.data;
          // Auto-populate form with revenue data from API
          if (this.revenueData) {
            this.handoverForm.patchValue({
              cashAmount: this.revenueData.cashTotal || 0,
              bankTransferAmount: this.revenueData.bankTransferTotal || 0,
              cardPaymentAmount: this.revenueData.cardTotal || 0,
              expenseAmount: this.revenueData.expenseTotal || 0,
              incomeAmount: this.revenueData.incomeTotal || 0
            });
            this.cashInShift = this.revenueData.cashTotal || 0;
            this.handoverForm.patchValue({ cashInShift: this.cashInShift });
          }
        },
        (error) => {
          console.error('Error loading revenue:', error);
        }
      )
    );
  }

  loadShiftHistory(): void {
    if (!this.canViewHistory) {
      this.message.warning(this.translate.instant('SHIFT_HANDOVER.HISTORY_TITLE'));
      return;
    }

    const hotelId = this.authService.getHotelId();
    this.isLoading = true;

    this.subscriptions.add(
      this.shiftHandoverService.getShiftHandoverHistory({
        hotelId: hotelId || undefined,
        page: this.currentPage,
        limit: this.pageSize
      }).subscribe(
        (response: ShiftHandoverHistoryResponse) => {
          this.shiftHistory = response.data;
          this.totalItems = response.pagination.totalItems;
          this.isLoading = false;
        },
        (error) => {
          this.isLoading = false;
          this.message.error(this.translate.instant('SHIFT_HANDOVER.HISTORY_TITLE'));
          console.error(error);
        }
      )
    );
  }

  // ============ CALCULATIONS ============

  private calculateHandoverAmount(): void {
    const values = this.handoverForm.value;
    // Công thức: Số tiền giao ca = Số tiền ca trước + Tiền mặt trong ca - Tiền giao quản lý
    this.handoverAmount = this.shiftHandoverService.calculateHandoverAmount(
      values.previousShiftAmount || 0,
      values.cashInShift || 0,
      values.managerHandoverAmount || 0
    );
  }

  getTotalRevenue(): number {
    if (this.revenueData) {
      const totalRoomRevenue = this.revenueData.totalRevenue || 0;
      const incomeAmount = this.revenueData.incomeTotal || 0;
      return totalRoomRevenue + incomeAmount;
    }
    const values = this.handoverForm.value;
    const cashAmount = values.cashAmount || 0;
    const bankTransferAmount = values.bankTransferAmount || 0;
    const cardPaymentAmount = values.cardPaymentAmount || 0;
    const expenseAmount = values.expenseAmount || 0;
    const incomeAmount = values.incomeAmount || 0;
    return cashAmount + bankTransferAmount + cardPaymentAmount + incomeAmount - expenseAmount;
  }

  // ============ GIAO CA ============

  openHandoverModal(): void {
    this.isModalVisible = true;
    this.handoverForm.patchValue({
      previousShiftAmount: this.previousShiftAmount
    });
  }

  closeModal(): void {
    this.isModalVisible = false;
    this.handoverForm.reset();
    this.handoverForm.patchValue({ previousShiftAmount: this.previousShiftAmount });
  }

  submitHandover(): void {
    if (this.handoverForm.invalid) {
      Object.values(this.handoverForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity();
        }
      });
      this.message.warning(this.translate.instant('SHIFT_HANDOVER.SELECT_STAFF_ERROR'));
      return;
    }

    this.modal.confirm({
      nzTitle: this.translate.instant('SHIFT_HANDOVER.SUBMIT'),
      nzContent: this.translate.instant('SHIFT_HANDOVER.HANDOVER_AMOUNT_CALCULATION') + ' ' + this.formatCurrency(this.handoverAmount) + '. ' + this.translate.instant('COMMON.CONTINUE'),
      nzOkText: this.translate.instant('SHIFT_HANDOVER.SUBMIT'),
      nzCancelText: this.translate.instant('SHIFT_HANDOVER.CANCEL'),
      nzOnOk: () => this.performHandover()
    });
  }

  private performHandover(): void {
    const hotelId = this.authService.getHotelId();
    const fromStaffId = this.authService.getUserId();
    
    if (!hotelId || !fromStaffId) {
      this.message.error(this.translate.instant('SHIFT_HANDOVER.SELECT_STAFF_ERROR'));
      return;
    }

    const request: ShiftHandoverCreateRequest = {
      hotelId,
      fromStaffId,
      ...this.handoverForm.value
    };

    this.isLoading = true;
    
    this.subscriptions.add(
      this.shiftHandoverService.createShiftHandover(request).subscribe(
        (response: ShiftHandoverResponse) => {
          this.isLoading = false;
          this.isModalVisible = false;
          this.message.success(this.translate.instant('SHIFT_HANDOVER.SUBMIT'));
          
          // Nếu có thông tin login mới, cập nhật auth
          if (response.login) {
            this.authService.loginFromShiftHandover(response.login.token, response.login.user as any);
            this.message.info(this.translate.instant('COMMON.LOGGED_IN_AS', { username: response.login.user.username }));
          }
          
          // Reload data
          this.loadPreviousShiftAmount();
          if (this.canViewHistory) {
            this.loadShiftHistory();
          }
        },
        (error) => {
          this.isLoading = false;
          this.message.error(error.error?.message || this.translate.instant('SHIFT_HANDOVER.SUBMIT'));
          console.error(error);
        }
      )
    );
  }

  // ============ GIAO TIỀN QUẢN LÝ ============

  openManagerHandoverModal(): void {
    this.managerHandoverForm.reset({
      managerId: null,
      amount: this.handoverForm.value.managerHandoverAmount || 0,
      notes: ''
    });
    this.isManagerHandoverModalVisible = true;
  }

  closeManagerHandoverModal(): void {
    this.isManagerHandoverModalVisible = false;
  }

  submitManagerHandover(): void {
    if (this.managerHandoverForm.invalid) {
      Object.values(this.managerHandoverForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity();
        }
      });
      this.message.warning(this.translate.instant('COMMON.PLEASE_FILL_ALL'));
      return;
    }

    const hotelId = this.authService.getHotelId();
    const staffId = this.authService.getUserId();
    const formValues = this.managerHandoverForm.value;
    
    if (!hotelId || !staffId) {
      this.message.error(this.translate.instant('SHIFT_HANDOVER.SELECT_STAFF_ERROR'));
      return;
    }

    this.isLoading = true;
    this.subscriptions.add(
      this.shiftHandoverService.createManagerHandover({
        hotelId,
        staffId,
        managerId: formValues.managerId,
        amount: formValues.amount,
        notes: formValues.notes || ''
      }).subscribe(
        (response) => {
          this.isLoading = false;
          this.isManagerHandoverModalVisible = false;
          this.message.success(this.translate.instant('SHIFT_HANDOVER.MANAGER_HANDOVER_SUCCESS') || 'Giao tiền quản lý thành công');
          // Update the form with the new manager handover amount
          const currentManagerAmount = this.handoverForm.value.managerHandoverAmount || 0;
          this.handoverForm.patchValue({
            managerHandoverAmount: currentManagerAmount + formValues.amount
          });
          this.managerHandoverAmount = this.handoverForm.value.managerHandoverAmount;
        },
        (error) => {
          this.isLoading = false;
          this.message.error(error.error?.message || this.translate.instant('SHIFT_HANDOVER.MANAGER_HANDOVER_ERROR') || 'Lỗi giao tiền quản lý');
          console.error(error);
        }
      )
    );
  }

  // ============ HISTORY ============

  viewHistory(): void {
    if (!this.canViewHistory) {
      this.message.warning(this.translate.instant('SHIFT_HANDOVER.HISTORY_TITLE'));
      return;
    }
    this.isHistoryVisible = true;
    this.loadShiftHistory();
  }

  closeHistory(): void {
    this.isHistoryVisible = false;
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadShiftHistory();
  }

  // ============ HELPERS ============

  formatCurrency(amount: number): string {
    return this.shiftHandoverService.formatCurrency(amount);
  }

  getStatusLabel(status: string): string {
    return this.shiftHandoverService.getStatusLabel(status);
  }

  getStatusColor(status: string): string {
    return this.shiftHandoverService.getStatusColor(status);
  }

  formatDate(date: Date | string): string {
    return new Date(date).toLocaleString('vi-VN');
  }

  // Currency formatter and parser for nz-input-number
  currencyFormatter = (value: number): string => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  currencyParser = (value: string): string => value.replace(/,/g, '');
}

