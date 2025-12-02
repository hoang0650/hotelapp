import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { Subscription } from 'rxjs';
import { ShiftHandoverService } from '../../services/shift-handover.service';
import { StaffService } from '../../services/staff.service';
import { AuthService } from '../../services/auth.service';
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
  shiftHistory: ShiftHandover[] = [];
  currentStaff: any = null;
  
  // UI State
  isLoading = false;
  isModalVisible = false;
  isHistoryVisible = false;
  
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
    private modal: NzModalService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.checkPermissions();
    this.loadStaffList();
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
          this.message.error('Không thể tải danh sách nhân viên');
          console.error(error);
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
        },
        (error) => {
          console.error('Error loading revenue:', error);
        }
      )
    );
  }

  loadShiftHistory(): void {
    if (!this.canViewHistory) {
      this.message.warning('Bạn không có quyền xem lịch sử giao ca');
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
          this.message.error('Không thể tải lịch sử giao ca');
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
    const values = this.handoverForm.value;
    // Tổng doanh thu = Tiền mặt + Chuyển khoản + Cà thẻ - Tiền chi
    return this.shiftHandoverService.calculateTotalRevenue(
      values.cashAmount || 0,
      values.bankTransferAmount || 0,
      values.cardPaymentAmount || 0,
      values.expenseAmount || 0
    );
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
      this.message.warning('Vui lòng điền đầy đủ thông tin');
      return;
    }

    this.modal.confirm({
      nzTitle: 'Xác nhận giao ca',
      nzContent: `Bạn sắp giao ca với số tiền: ${this.formatCurrency(this.handoverAmount)}. Tiếp tục?`,
      nzOkText: 'Xác nhận',
      nzCancelText: 'Hủy',
      nzOnOk: () => this.performHandover()
    });
  }

  private performHandover(): void {
    const hotelId = this.authService.getHotelId();
    const fromStaffId = this.authService.getUserId();
    
    if (!hotelId || !fromStaffId) {
      this.message.error('Không tìm thấy thông tin nhân viên');
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
          this.message.success('Giao ca thành công!');
          
          // Nếu có thông tin login mới, cập nhật auth
          if (response.login) {
            this.authService.loginFromShiftHandover(response.login.token, response.login.user as any);
            this.message.info(`Đã đăng nhập với tài khoản: ${response.login.user.username}`);
          }
          
          // Reload data
          this.loadPreviousShiftAmount();
          if (this.canViewHistory) {
            this.loadShiftHistory();
          }
        },
        (error) => {
          this.isLoading = false;
          this.message.error(error.error?.message || 'Giao ca thất bại');
          console.error(error);
        }
      )
    );
  }

  // ============ GIAO TIỀN QUẢN LÝ ============

  openManagerHandoverModal(): void {
    this.modal.confirm({
      nzTitle: 'Giao tiền quản lý',
      nzContent: `
        <div>
          <p>Số tiền giao quản lý: <strong>${this.formatCurrency(this.handoverForm.value.managerHandoverAmount || 0)}</strong></p>
          <p>Nhập ghi chú (nếu có):</p>
          <input type="text" id="managerNotes" class="ant-input" placeholder="Ghi chú" />
        </div>
      `,
      nzOkText: 'Xác nhận giao tiền',
      nzCancelText: 'Hủy',
      nzOnOk: () => this.performManagerHandover()
    });
  }

  private performManagerHandover(): void {
    const hotelId = this.authService.getHotelId();
    const staffId = this.authService.getUserId();
    const amount = this.handoverForm.value.managerHandoverAmount || 0;
    
    if (!hotelId || !staffId || amount <= 0) {
      this.message.warning('Vui lòng nhập số tiền giao quản lý');
      return;
    }

    // TODO: Lấy managerId từ danh sách hoặc config
    const managerId = ''; // Cần implement logic chọn manager

    this.subscriptions.add(
      this.shiftHandoverService.createManagerHandover({
        hotelId,
        staffId,
        managerId,
        amount,
        notes: ''
      }).subscribe(
        (response) => {
          this.message.success('Giao tiền quản lý thành công');
        },
        (error) => {
          this.message.error('Giao tiền quản lý thất bại');
          console.error(error);
        }
      )
    );
  }

  // ============ HISTORY ============

  viewHistory(): void {
    if (!this.canViewHistory) {
      this.message.warning('Chỉ admin hoặc business mới được xem lịch sử giao ca');
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
}

