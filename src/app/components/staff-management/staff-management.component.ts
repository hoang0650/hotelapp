import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { StaffService } from '../../services/staff.service';
import { Staff, getStaffFullName, getPositionLabel, getStatusLabel, getShiftLabel } from '../../interfaces/staff';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { AuthService } from '../../services/auth.service';
import { HotelService } from '../../services/hotel.service';
import { BusinessService } from '../../services/business.service';
import { UserService } from '../../services/user.service';
import { User } from '../../interfaces/user';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';

// Khai báo để TypeScript biết về biến toàn cục pdfMake
declare global {
  interface Window {
    pdfMake: any;
    pdfMake_vfs: any;
  }
}

@Component({
  selector: 'app-staff-management',
  templateUrl: './staff-management.component.html',
  styleUrls: ['./staff-management.component.css']
})
export class StaffManagementComponent implements OnInit, OnDestroy {
  private subscriptions = new Subscription();
  
  staffForm!: FormGroup;
  staffs: Staff[] = [];
  selectedStaff: Staff | null = null;
  hotels: any[] = [];
  users: User[] = [];  // Danh sách users để assign
  
  // Options
  positions = [
    { value: 'manager', label: 'Quản lý' },
    { value: 'receptionist', label: 'Lễ tân' },
    { value: 'housekeeper', label: 'Housekeeping' },
    { value: 'maintenance', label: 'Bảo trì' },
    { value: 'other', label: 'Khác' }
  ];
  
  statuses = [
    { value: 'active', label: 'Đang làm việc' },
    { value: 'on_leave', label: 'Nghỉ phép' },
    { value: 'terminated', label: 'Đã nghỉ việc' }
  ];
  
  shifts = [
    { value: 'morning', label: 'Ca sáng' },
    { value: 'afternoon', label: 'Ca chiều' },
    { value: 'night', label: 'Ca đêm' },
    { value: 'full-day', label: 'Cả ngày' }
  ];
  
  genders = [
    { value: 'male', label: 'Nam' },
    { value: 'female', label: 'Nữ' },
    { value: 'other', label: 'Khác' }
  ];
  
  permissions = [
    { value: 'view', label: 'Xem' },
    { value: 'create', label: 'Tạo mới' },
    { value: 'edit', label: 'Chỉnh sửa' },
    { value: 'delete', label: 'Xóa' },
    { value: 'manage_rooms', label: 'Quản lý phòng' },
    { value: 'manage_bookings', label: 'Quản lý đặt phòng' }
  ];
  
  // UI State
  editId: string | null = null;
  isLoading = false;
  isFormVisible = false;
  selectedHotelId: string = '';
  
  // Business info for salary slip
  businessInfo: any = null;
  businessLogo: string = '';

  constructor(
    private fb: FormBuilder, 
    private staffService: StaffService,
    private hotelService: HotelService,
    private businessService: BusinessService,
    private userService: UserService,
    private authService: AuthService,
    private message: NzMessageService,
    private modal: NzModalService
  ) {
    this.initForm();
    this.initSalaryForm();
  }

  ngOnInit(): void {
    this.loadHotels();
    this.loadBusinessInfo();
    
    // Auto-select hotel nếu user là hotel manager
    const hotelId = this.authService.getHotelId();
    if (hotelId) {
      this.selectedHotelId = hotelId;
      this.loadStaff(); // loadUsers sẽ được gọi sau khi loadStaff xong
    }
  }

  loadBusinessInfo(): void {
    // Lấy business info từ hotel hoặc business service
    const hotelId = this.authService.getHotelId() || this.selectedHotelId;
    if (hotelId) {
      this.subscriptions.add(
        this.hotelService.getHotelById(hotelId).subscribe(
          (hotel: any) => {
            if (hotel && hotel.businessId) {
              this.subscriptions.add(
                this.businessService.getBusinessById(hotel.businessId).subscribe(
                  (business: any) => {
                    this.businessInfo = business;
                    // Ưu tiên logoId, nếu không có thì dùng logo (URL)
                    const logoId = (business as any).logoId;
                    this.businessLogo = logoId ? `/files/${logoId}` : (business.logo || '');
                  },
                  (error) => {
                    console.error('Error loading business info:', error);
                    // Fallback: dùng hotel info
                    this.businessInfo = {
                      name: hotel.name || 'Khách sạn',
                      logo: ''
                    };
                  }
                )
              );
            } else {
              // Fallback: dùng hotel info
              this.businessInfo = {
                name: hotel?.name || 'Khách sạn',
                logo: ''
              };
            }
          },
          (error) => {
            console.error('Error loading hotel info:', error);
          }
        )
      );
    } else {
      // Thử lấy business info từ current user
      this.subscriptions.add(
        this.businessService.getBusinessInfoOfCurrentUser().subscribe(
          (business: any) => {
            this.businessInfo = business;
            // Ưu tiên logoId, nếu không có thì dùng logo (URL)
            const logoId = (business as any).logoId;
            this.businessLogo = logoId ? `/files/${logoId}` : (business.logo || '');
          },
          (error) => {
            console.error('Error loading business info:', error);
            this.businessInfo = { name: 'Khách sạn', logo: '' };
          }
        )
      );
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ============ FORM INITIALIZATION ============

  initForm(): void {
    this.staffForm = this.fb.group({
      userId: ['', Validators.required],
      hotelId: ['', Validators.required],
      personalInfo: this.fb.group({
        firstName: ['', Validators.required],
        lastName: ['', Validators.required],
        dateOfBirth: [null],
        gender: ['male'],
        nationality: [''],
        idType: ['CMND'],
        idNumber: [''],
        idExpiryDate: [null]
      }),
      contactInfo: this.fb.group({
        email: ['', [Validators.email]],
        phone: ['', Validators.required],
        emergencyContact: this.fb.group({
          name: [''],
          relationship: [''],
          phone: ['']
        }),
        address: this.fb.group({
          street: [''],
          city: [''],
          state: [''],
          country: ['Việt Nam'],
          postalCode: ['']
        })
      }),
      employmentInfo: this.fb.group({
        position: ['receptionist', Validators.required],
        department: [''],
        startDate: [new Date()],
        endDate: [null],
        status: ['active', Validators.required],
        salary: [0],
        allowance: [0], // Phụ cấp
        insurance: [0], // Bảo hiểm
        penalty: [0], // Phạt
        bonus: [0], // Thưởng
        bankAccount: this.fb.group({
          bankName: [''],
          accountNumber: [''],
          accountName: ['']
        }),
        taxId: ['']
      }),
      schedule: this.fb.array([]),
      permissions: [['view']],
      notes: ['']
    });
  }

  resetForm(): void {
    this.staffForm.reset({
      userId: '',
      hotelId: this.selectedHotelId,
      personalInfo: {
        firstName: '',
        lastName: '',
        dateOfBirth: null,
        gender: 'male',
        nationality: '',
        idType: 'CMND',
        idNumber: '',
        idExpiryDate: null
      },
      contactInfo: {
        email: '',
        phone: '',
        emergencyContact: { name: '', relationship: '', phone: '' },
        address: { street: '', city: '', state: '', country: 'Việt Nam', postalCode: '' }
      },
      employmentInfo: {
        position: 'receptionist',
        department: '',
        startDate: new Date(),
        endDate: null,
        status: 'active',
        salary: 0,
        allowance: 0,
        insurance: 0,
        penalty: 0,
        bonus: 0,
        bankAccount: { bankName: '', accountNumber: '', accountName: '' },
        taxId: ''
      },
      permissions: ['view'],
      notes: ''
    });
    
    // Clear schedule array
    while (this.scheduleArray.length > 0) {
      this.scheduleArray.removeAt(0);
    }
  }

  // ============ SCHEDULE ARRAY ============

  createScheduleItem(): FormGroup {
    return this.fb.group({
      date: [new Date(), Validators.required],
      shift: ['morning', Validators.required],
      startTime: ['08:00'],
      endTime: ['16:00'],
      status: ['scheduled']
    });
  }

  get scheduleArray(): FormArray {
    return this.staffForm.get('schedule') as FormArray;
  }

  addScheduleItem(): void {
    this.scheduleArray.push(this.createScheduleItem());
  }

  removeScheduleItem(index: number): void {
    this.scheduleArray.removeAt(index);
  }

  // ============ LOAD DATA ============

  loadHotels(): void {
    this.subscriptions.add(
      this.hotelService.getHotels().subscribe(
        (hotels) => {
          this.hotels = hotels;
        },
        (error) => {
          console.error('Error loading hotels:', error);
        }
      )
    );
  }

  loadStaff(): void {
    if (!this.selectedHotelId) {
      this.staffs = [];
      return;
    }
    
    this.isLoading = true;
    this.subscriptions.add(
      this.staffService.getStaffByHotel(this.selectedHotelId).subscribe(
        (data) => {
          this.staffs = data;
          this.isLoading = false;
          this.loadUsers(); // Reload users sau khi có danh sách staff
        },
        (error) => {
          this.message.error('Không thể tải danh sách nhân viên: ' + (error.error?.message || error.message));
          this.isLoading = false;
        }
      )
    );
  }

  onHotelChange(hotelId: string): void {
    this.selectedHotelId = hotelId;
    this.staffForm.patchValue({ hotelId: hotelId });
    this.loadStaff();
    this.loadUsers();
  }

  loadUsers(): void {
    if (!this.selectedHotelId) {
      this.users = [];
      return;
    }
    
    // Lấy danh sách user IDs đã được assign làm staff
    const assignedUserIds = this.staffs.map(s => s.userId);
    
    // Load tất cả users trước (để có users chưa được gán hotel)
    this.subscriptions.add(
      this.userService.getAllUsers().subscribe(
        (allUsers) => {
          // Lọc users:
          // 1. Chưa được assign làm staff
          // 2. Có role là 'staff' hoặc 'hotel' hoặc chưa có hotelId (có thể gán)
          // 3. Hoặc có hotelId trùng với hotel đang chọn
          this.users = allUsers.filter(u => {
            const isNotAssigned = !assignedUserIds.includes(u._id || '');
            const canBeAssigned = !u.hotelId || u.hotelId === this.selectedHotelId;
            const isValidRole = ['staff', 'hotel', 'receptionist'].includes(u.role || '') || !u.role;
            return isNotAssigned && (canBeAssigned || isValidRole);
          });
          
          console.log('Loaded users:', this.users.length, 'users available');
        },
        (error) => {
          console.error('Error loading all users:', error);
          // Fallback: thử load theo hotel
          this.userService.getUsersByHotel(this.selectedHotelId).subscribe(
            (hotelUsers) => {
              this.users = hotelUsers.filter(u => !assignedUserIds.includes(u._id || ''));
            },
            (err) => {
              console.error('Error loading hotel users:', err);
              this.users = [];
            }
          );
        }
      )
    );
  }

  // ============ CRUD OPERATIONS ============

  showAddForm(): void {
    this.selectedStaff = null;
    this.editId = null;
    this.resetForm();
    this.staffForm.patchValue({ hotelId: this.selectedHotelId });
    this.isFormVisible = true;
  }

  startEdit(staff: Staff): void {
    this.editId = staff._id || null;
    this.selectedStaff = { ...staff };
    this.isFormVisible = true;
    
    // Clear schedule array first
    while (this.scheduleArray.length > 0) {
      this.scheduleArray.removeAt(0);
    }

    // Add schedule items
    if (staff.schedule && staff.schedule.length > 0) {
      staff.schedule.forEach(scheduleItem => {
        this.scheduleArray.push(this.fb.group({
          date: [scheduleItem.date, Validators.required],
          shift: [scheduleItem.shift, Validators.required],
          startTime: [scheduleItem.startTime || '08:00'],
          endTime: [scheduleItem.endTime || '16:00'],
          status: [scheduleItem.status || 'scheduled']
        }));
      });
    }

    // Patch form values
    this.staffForm.patchValue({
      userId: staff.userId,
      hotelId: staff.hotelId,
      personalInfo: staff.personalInfo || {},
      contactInfo: staff.contactInfo || {},
      employmentInfo: {
        ...staff.employmentInfo,
        allowance: staff.employmentInfo?.allowance || 0,
        insurance: staff.employmentInfo?.insurance || 0,
        penalty: staff.employmentInfo?.penalty || 0,
        bonus: staff.employmentInfo?.bonus || 0
      },
      permissions: staff.permissions || ['view'],
      notes: staff.notes || ''
    });
    
    // Thêm user hiện tại vào danh sách để hiển thị khi edit
    if (staff.userId) {
      const existingUser = this.users.find(u => u._id === staff.userId);
      if (!existingUser) {
        // Tìm thông tin user từ userId
        this.userService.getAllUsers().subscribe(allUsers => {
          const user = allUsers.find(u => u._id === staff.userId);
          if (user && !this.users.find(u => u._id === user._id)) {
            this.users = [user, ...this.users];
          }
        });
      }
    }
  }

  stopEdit(): void {
    this.editId = null;
    this.selectedStaff = null;
    this.isFormVisible = false;
    this.resetForm();
  }

  createStaff(): void {
    if (this.staffForm.invalid) {
      this.markFormDirty();
      this.message.warning('Vui lòng điền đầy đủ thông tin bắt buộc');
      return;
    }

    this.isLoading = true;
    const newStaff: Staff = this.staffForm.value;
    
    this.subscriptions.add(
      this.staffService.createStaff(newStaff).subscribe(
        (data: Staff) => {
          this.message.success('Đã tạo nhân viên thành công!');
          this.staffs.push(data);
          this.stopEdit();
          this.isLoading = false;
        },
        (error) => {
          this.message.error('Lỗi khi tạo nhân viên: ' + (error.error?.message || error.message));
          this.isLoading = false;
        }
      )
    );
  }

  updateStaff(): void {
    if (!this.selectedStaff || this.staffForm.invalid) {
      this.markFormDirty();
      this.message.warning('Vui lòng điền đầy đủ thông tin bắt buộc');
      return;
    }

    this.isLoading = true;
    
    this.subscriptions.add(
      this.staffService.updateStaff(this.selectedStaff._id!, this.staffForm.value).subscribe(
        () => {
          this.message.success('Đã cập nhật nhân viên thành công!');
          this.loadStaff();
          this.stopEdit();
          this.isLoading = false;
        },
        (error) => {
          this.message.error('Lỗi khi cập nhật nhân viên: ' + (error.error?.message || error.message));
          this.isLoading = false;
        }
      )
    );
  }

  deleteStaff(staff: Staff): void {
    this.modal.confirm({
      nzTitle: 'Xác nhận xóa',
      nzContent: `Bạn có chắc muốn xóa nhân viên <b>${this.getFullName(staff)}</b>?`,
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        this.isLoading = true;
        this.subscriptions.add(
          this.staffService.deleteStaff(staff._id!).subscribe(
            () => {
              this.message.success('Đã xóa nhân viên thành công!');
              this.staffs = this.staffs.filter(s => s._id !== staff._id);
              this.isLoading = false;
            },
            (error) => {
              this.message.error('Lỗi khi xóa nhân viên: ' + (error.error?.message || error.message));
              this.isLoading = false;
            }
          )
        );
      }
    });
  }

  // ============ HELPERS ============

  private markFormDirty(): void {
    Object.values(this.staffForm.controls).forEach(control => {
      if (control.invalid) {
        control.markAsDirty();
        control.updateValueAndValidity();
      }
    });
  }

  getFullName(staff: Staff): string {
    return getStaffFullName(staff);
  }

  getPositionLabel(position: string): string {
    return getPositionLabel(position);
  }

  getStatusLabel(status: string): string {
    return getStatusLabel(status);
  }

  getShiftLabel(shift: string): string {
    return getShiftLabel(shift);
  }

  // Định dạng số tiền theo VNĐ
  formatterVND = (value: number): string => `${(value || 0).toLocaleString('vi-VN')}`;
  parserVND = (value: string): string => value.replace(/[^\d]/g, '');

  submitForm(): void {
    if (this.selectedStaff) {
      this.updateStaff();
    } else {
      this.createStaff();
    }
  }

  // ============ TÍNH LƯƠNG ============
  
  isSalaryModalVisible = false;
  selectedStaffForSalary: Staff | null = null;
  salaryCalculationForm!: FormGroup;
  salaryCalculationResult: any = null;

  // Payroll History
  isPayrollHistoryModalVisible = false;
  selectedStaffForPayrollHistory: Staff | null = null;
  payrollHistory: any[] = [];
  payrollFilterType: 'month' | 'quarter' | 'year' = 'month';
  payrollFilterMonth: number = new Date().getMonth() + 1;
  payrollFilterYear: number = new Date().getFullYear();
  payrollFilterQuarter: number = Math.floor((new Date().getMonth() + 3) / 3);

  // Export summary
  isExportSummaryModalVisible = false;
  exportSummaryFilterType: 'month' | 'quarter' | 'year' = 'month';
  exportSummaryFilterMonth: number = new Date().getMonth() + 1;
  exportSummaryFilterYear: number = new Date().getFullYear();
  exportSummaryFilterQuarter: number = Math.floor((new Date().getMonth() + 3) / 3);
  exportSummaryFormat: 'excel' | 'pdf' = 'excel';
  allStaffPayrollSummary: any[] = [];

  initSalaryForm(): void {
    this.salaryCalculationForm = this.fb.group({
      calculationDate: [new Date()],
      allowance: [0, [Validators.min(0)]],
      insurance: [0, [Validators.min(0)]],
      penalty: [0, [Validators.min(0)]],
      bonus: [0, [Validators.min(0)]],
      advancePayment: [0, [Validators.min(0)]] // Ứng lương
    });
  }

  openSalaryModal(staff: Staff): void {
    this.selectedStaffForSalary = staff;
    this.salaryCalculationResult = null;
    
    // Khởi tạo form nếu chưa có
    if (!this.salaryCalculationForm) {
      this.initSalaryForm();
    }
    
    // Set giá trị mặc định từ staff
    this.salaryCalculationForm.patchValue({
      calculationDate: new Date(),
      allowance: staff.employmentInfo?.allowance || 0,
      insurance: staff.employmentInfo?.insurance || 0,
      penalty: staff.employmentInfo?.penalty || 0,
      bonus: staff.employmentInfo?.bonus || 0,
      advancePayment: staff.employmentInfo?.advancePayment || 0
    });
    
    this.isSalaryModalVisible = true;
  }

  closeSalaryModal(): void {
    this.isSalaryModalVisible = false;
    this.selectedStaffForSalary = null;
    this.salaryCalculationResult = null;
  }

  calculateSalary(): void {
    if (!this.selectedStaffForSalary || !this.selectedStaffForSalary._id) {
      this.message.error('Không tìm thấy thông tin nhân viên');
      return;
    }

    if (this.salaryCalculationForm.invalid) {
      this.message.warning('Vui lòng kiểm tra lại thông tin');
      return;
    }

    this.isLoading = true;
    const formValue = this.salaryCalculationForm.value;

    const calculationData = {
      calculationDate: formValue.calculationDate,
      allowance: formValue.allowance || 0,
      insurance: formValue.insurance || 0,
      penalty: formValue.penalty || 0,
      bonus: formValue.bonus || 0,
      advancePayment: formValue.advancePayment || 0
    };

    this.subscriptions.add(
      this.staffService.calculateSalary(this.selectedStaffForSalary._id, calculationData).subscribe(
        (response) => {
          // Parse dates từ backend để đảm bảo hiển thị đúng
          if (response.data && response.data.breakdown) {
            const breakdown = response.data.breakdown;
            // Parse baseDate và calculationDate từ string hoặc Date object
            if (breakdown.baseDate) {
              breakdown.baseDate = this.parseDate(breakdown.baseDate) || breakdown.baseDate;
            }
            if (breakdown.calculationDate) {
              breakdown.calculationDate = this.parseDate(breakdown.calculationDate) || breakdown.calculationDate;
            }
          }
          this.salaryCalculationResult = response.data;
          this.message.success('Tính lương thành công!');
          this.isLoading = false;
          // KHÔNG reload staff vì chưa lưu vào payroll
        },
        (error) => {
          this.message.error('Lỗi khi tính lương: ' + (error.error?.message || error.message));
          this.isLoading = false;
        }
      )
    );
  }

  paySalary(): void {
    if (!this.selectedStaffForSalary || !this.selectedStaffForSalary._id || !this.salaryCalculationResult) {
      this.message.error('Vui lòng tính lương trước');
      return;
    }

    const staffId = this.selectedStaffForSalary._id;
    if (!staffId) {
      this.message.error('Không tìm thấy ID nhân viên');
      return;
    }

    this.modal.confirm({
      nzTitle: 'Xác nhận thanh toán',
      nzContent: `Bạn có chắc muốn lưu lương và đánh dấu đã thanh toán cho nhân viên <b>${this.getFullName(this.selectedStaffForSalary)}</b>?`,
      nzOkText: 'Xác nhận',
      nzOkType: 'primary',
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        this.isLoading = true;
        const breakdown = this.salaryCalculationResult.breakdown;

        // Sử dụng baseDate và calculationDate từ breakdown (kết quả tính lương)
        // KHÔNG dùng từ form vì form có thể đã thay đổi
        const payData = {
          calculationDate: breakdown.calculationDate, // Ngày tính lương từ kết quả
          baseDate: breakdown.baseDate, // Ngày cơ sở từ kết quả
          allowance: breakdown.allowance,
          insurance: breakdown.insurance,
          penalty: breakdown.penalty,
          bonus: breakdown.bonus,
          advancePayment: breakdown.advancePayment || 0, // Ứng lương từ kết quả
          paymentDate: new Date(),
          paymentReference: ''
        };

        this.subscriptions.add(
          this.staffService.paySalary(staffId, payData).subscribe(
            (response) => {
              this.message.success('Đã lưu lương và đánh dấu đã thanh toán thành công!');
              this.isLoading = false;
              // Reload danh sách staff để cập nhật payroll
              this.loadStaff();
              // Đóng modal
              this.closeSalaryModal();
            },
            (error) => {
              this.message.error('Lỗi khi lưu lương: ' + (error.error?.message || error.message));
              this.isLoading = false;
            }
          )
        );
      }
    });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
  }

  // Helper để parse date từ backend (có thể là string hoặc Date object)
  parseDate(date: any): Date | null {
    if (!date) return null;
    if (date instanceof Date) {
      // Nếu đã là Date object, tạo mới để tránh mutation
      return new Date(date.getTime());
    }
    if (typeof date === 'string') {
      const parsed = new Date(date);
      // Kiểm tra xem date có hợp lệ không
      if (isNaN(parsed.getTime())) return null;
      return parsed;
    }
    return null;
  }

  // Helper để format date hiển thị
  formatDate(date: any): string {
    const parsedDate = this.parseDate(date);
    if (!parsedDate || isNaN(parsedDate.getTime())) return '-';
    
    // Format theo định dạng dd/MM/yyyy
    const day = String(parsedDate.getDate()).padStart(2, '0');
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const year = parsedDate.getFullYear();
    return `${day}/${month}/${year}`;
  }

  // Format số tiền theo định dạng K (thousands)
  formatCurrencyK(value: number): string {
    if (!value || value === 0) return '0';
    const thousands = Math.round(value / 1000);
    return `${thousands.toLocaleString('vi-VN')}K`;
  }

  // Lấy tháng/năm từ calculationDate
  getSalaryPeriod(): string {
    if (!this.salaryCalculationResult?.breakdown?.calculationDate) return '';
    const date = this.parseDate(this.salaryCalculationResult.breakdown.calculationDate);
    if (!date) return '';
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `${month}/${year}`;
  }

  // Xuất PDF phiếu tính lương
  exportSalaryPDF(): void {
    if (!this.salaryCalculationResult || !this.selectedStaffForSalary) {
      this.message.warning('Vui lòng tính lương trước khi xuất PDF');
      return;
    }

    const breakdown = this.salaryCalculationResult.breakdown;
    const staff = this.selectedStaffForSalary;
    const staffName = this.getFullName(staff);
    const period = this.getSalaryPeriod();
    const businessName = this.businessInfo?.name || 'Khách sạn';

    // Tính lương cơ bản tháng (nếu có)
    const baseSalaryMonthly = staff.employmentInfo?.salary || 0;
    const baseSalaryText = baseSalaryMonthly > 0 ? `THÁNG = ${this.formatCurrencyK(baseSalaryMonthly)}` : '';

    // Lấy ngày bắt đầu làm việc
    const startDate = breakdown.startDate || staff.employmentInfo?.startDate;
    const startDateText = startDate ? this.formatDate(startDate) : 'N/A';

    // Lấy chức vụ
    const position = staff.employmentInfo?.position || '';
    const positionLabel = this.getPositionLabel(position);

    // Tính các khoản phụ cấp
    const allowanceItems: any[] = [];
    if (breakdown.allowance > 0) {
      allowanceItems.push(`${this.formatCurrencyK(breakdown.allowance)} PHỤ CẤP`);
    }
    if (breakdown.bonus > 0) {
      allowanceItems.push(`${this.formatCurrencyK(breakdown.bonus)} THƯỞNG`);
    }

    // Lấy ỨNG LƯƠNG từ breakdown
    const advancePayment = breakdown.advancePayment || 0;

    const content: any[] = [];

    // Logo và tên công ty
    if (this.businessLogo) {
      const logoUrl = this.getImageUrl(this.businessLogo);
      content.push({
        columns: [
          {
            width: 60,
            image: logoUrl,
            fit: [60, 60],
            alignment: 'center'
          },
          {
            width: '*',
            text: businessName.toUpperCase(),
            fontSize: 14,
            bold: true,
            alignment: 'center',
            margin: [10, 20, 0, 0]
          }
        ],
        margin: [0, 0, 0, 20]
      });
    } else {
      content.push({
        text: businessName.toUpperCase(),
        fontSize: 14,
        bold: true,
        alignment: 'center',
        margin: [0, 0, 0, 20]
      });
    }

    const documentDefinition = {
      content: [
        ...content,

        // Tiêu đề
        {
          text: `PHIẾU TÍNH LƯƠNG ${period}`,
          fontSize: 18,
          bold: true,
          alignment: 'center',
          margin: [0, 0, 0, 30]
        },

        // Thông tin nhân viên và lương
        {
          columns: [
            {
              width: '*',
              text: [
                { text: 'Họ Và Tên: ', bold: true },
                { text: staffName.toUpperCase(), bold: true },
                { text: '\nChức vụ: ', bold: true },
                { text: positionLabel },
                { text: '\nLương Cơ Bản: ', bold: true },
                { text: baseSalaryText || 'N/A', bold: true },
                { text: '\nSố ngày làm việc thực tế: ', bold: true },
                { text: `${breakdown.daysWorked || 0} ngày` },
                { text: '\nNgày bắt đầu làm việc: ', bold: true },
                { text: startDateText },
                { text: '\n\nPHỤ CẤP:', bold: true, fontSize: 12 },
                ...allowanceItems.map(item => ({ text: `\n${item}`, fontSize: 10 })),
                { text: '\n\nPHẠT: ', bold: true, fontSize: 12 },
                { text: breakdown.penalty > 0 ? `${this.formatCurrencyK(breakdown.penalty)}` : '0', fontSize: 12, color: 'red' },
                { text: '\n\nỨNG LƯƠNG: ', bold: true, fontSize: 12 },
                { text: advancePayment > 0 ? `${this.formatCurrencyK(advancePayment)}` : '0', fontSize: 12, color: 'red' },
                { text: '\n\nLương Nhận: ', bold: true, fontSize: 14 },
                { text: `${this.formatCurrency(breakdown.netSalary || 0)}`, bold: true, fontSize: 14 }
              ],
              fontSize: 11
            }
          ],
          margin: [0, 0, 0, 30]
        },

        // Phần ký
        {
          columns: [
            {
              width: '*',
              text: 'NGƯỜI LẬP PHIẾU',
              fontSize: 10,
              bold: true,
              margin: [0, 30, 0, 0]
            },
            {
              width: '*',
              text: 'GIÁM ĐỐC',
              fontSize: 10,
              bold: true,
              alignment: 'right',
              margin: [0, 30, 0, 0]
            }
          ]
        }
      ],
      defaultStyle: {
        fontSize: 10,
        font: 'Roboto'
      }
    };

    if (window.pdfMake) {
      window.pdfMake.createPdf(documentDefinition).print();
    } else {
      this.message.error('PDF library chưa được tải. Vui lòng tải lại trang.');
    }
  }

  // Xuất Excel phiếu tính lương
  exportSalaryExcel(): void {
    if (!this.salaryCalculationResult || !this.selectedStaffForSalary) {
      this.message.warning('Vui lòng tính lương trước khi xuất Excel');
      return;
    }

    const breakdown = this.salaryCalculationResult.breakdown;
    const staff = this.selectedStaffForSalary;
    const staffName = this.getFullName(staff);
    const period = this.getSalaryPeriod();
    const businessName = this.businessInfo?.name || 'Khách sạn';

    // Lấy ngày bắt đầu làm việc
    const startDate = breakdown.startDate || staff.employmentInfo?.startDate;
    const startDateText = startDate ? this.formatDate(startDate) : 'N/A';

    // Lấy chức vụ
    const position = staff.employmentInfo?.position || '';
    const positionLabel = this.getPositionLabel(position);

    // Tạo dữ liệu Excel
    const data: any[] = [
      [businessName.toUpperCase()],
      [`PHIẾU TÍNH LƯƠNG ${period}`],
      [],
      ['Họ Và Tên:', staffName.toUpperCase()],
      ['Chức vụ:', positionLabel.toUpperCase()],
      ['Lương Cơ Bản:', breakdown.baseSalary ? this.formatCurrency(breakdown.baseSalary) : 'N/A'],
      ['Số ngày làm việc thực tế:', `${breakdown.daysWorked || 0} ngày`],
      ['Ngày bắt đầu làm việc:', startDateText],
      [],
      ['PHỤ CẤP:'],
      ['Phụ cấp:', breakdown.allowance ? this.formatCurrency(breakdown.allowance) : '0'],
      ['Thưởng:', breakdown.bonus ? this.formatCurrency(breakdown.bonus) : '0'],
      [],
      ['TRỪ:'],
      ['Bảo hiểm:', breakdown.insurance ? this.formatCurrency(breakdown.insurance) : '0'],
      ['Phạt:', breakdown.penalty ? this.formatCurrency(breakdown.penalty) : '0'],
      [],
      ['ỨNG LƯƠNG:', breakdown.advancePayment ? this.formatCurrency(breakdown.advancePayment) : '0'],
      [],
      ['Lương Nhận:', breakdown.netSalary ? this.formatCurrency(breakdown.netSalary) : '0'],
      [],
      ['Ngày cơ sở:', this.formatDate(breakdown.baseDate)],
      ['Ngày tính lương:', this.formatDate(breakdown.calculationDate)]
    ];

    // Tạo workbook
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 20 },
      { wch: 30 }
    ];

    // Tạo workbook và xuất file
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Phiếu tính lương');
    
    const fileName = `Phieu_Tinh_Luong_${staffName.replace(/\s+/g, '_')}_${period.replace('/', '_')}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    this.message.success('Đã xuất file Excel thành công!');
  }

  // ============ LỊCH SỬ PAYROLL ============

  openPayrollHistoryModal(staff: Staff): void {
    this.selectedStaffForPayrollHistory = staff;
    this.loadPayrollHistory();
    this.isPayrollHistoryModalVisible = true;
  }

  closePayrollHistoryModal(): void {
    this.isPayrollHistoryModalVisible = false;
    this.selectedStaffForPayrollHistory = null;
    this.payrollHistory = [];
  }

  loadPayrollHistory(): void {
    if (!this.selectedStaffForPayrollHistory || !this.selectedStaffForPayrollHistory.payroll) {
      this.payrollHistory = [];
      return;
    }

    // Lấy tất cả payroll records
    let allPayrolls = [...this.selectedStaffForPayrollHistory.payroll];

    // Sắp xếp theo thời gian tính lương (mới nhất trước)
    allPayrolls.sort((a, b) => {
      const dateA = a.calculatedAt ? new Date(a.calculatedAt).getTime() : 
                   (a.period?.endDate ? new Date(a.period.endDate).getTime() : 0);
      const dateB = b.calculatedAt ? new Date(b.calculatedAt).getTime() : 
                   (b.period?.endDate ? new Date(b.period.endDate).getTime() : 0);
      return dateB - dateA;
    });

    // Filter theo tháng/quý/năm
    if (this.payrollFilterType === 'month') {
      this.payrollHistory = allPayrolls.filter(p => {
        const payrollDate = p.calculatedAt ? new Date(p.calculatedAt) : 
                           (p.period?.endDate ? new Date(p.period.endDate) : null);
        if (!payrollDate) return false;
        return payrollDate.getMonth() + 1 === this.payrollFilterMonth && 
               payrollDate.getFullYear() === this.payrollFilterYear;
      });
    } else if (this.payrollFilterType === 'quarter') {
      this.payrollHistory = allPayrolls.filter(p => {
        const payrollDate = p.calculatedAt ? new Date(p.calculatedAt) : 
                           (p.period?.endDate ? new Date(p.period.endDate) : null);
        if (!payrollDate) return false;
        const quarter = Math.floor(payrollDate.getMonth() / 3) + 1;
        return quarter === this.payrollFilterQuarter && 
               payrollDate.getFullYear() === this.payrollFilterYear;
      });
    } else if (this.payrollFilterType === 'year') {
      this.payrollHistory = allPayrolls.filter(p => {
        const payrollDate = p.calculatedAt ? new Date(p.calculatedAt) : 
                           (p.period?.endDate ? new Date(p.period.endDate) : null);
        if (!payrollDate) return false;
        return payrollDate.getFullYear() === this.payrollFilterYear;
      });
    } else {
      this.payrollHistory = allPayrolls;
    }
  }

  onPayrollFilterChange(): void {
    this.loadPayrollHistory();
  }

  // Xuất Excel lịch sử payroll
  exportPayrollHistoryExcel(): void {
    if (!this.selectedStaffForPayrollHistory || this.payrollHistory.length === 0) {
      this.message.warning('Không có dữ liệu để xuất Excel');
      return;
    }

    const staff = this.selectedStaffForPayrollHistory;
    const staffName = this.getFullName(staff);
    const businessName = this.businessInfo?.name || 'Khách sạn';
    
    // Tạo tên file dựa trên filter
    let fileName = '';
    if (this.payrollFilterType === 'month') {
      fileName = `Lich_Su_Luong_${staffName.replace(/\s+/g, '_')}_Thang_${this.payrollFilterMonth}_${this.payrollFilterYear}.xlsx`;
    } else if (this.payrollFilterType === 'quarter') {
      fileName = `Lich_Su_Luong_${staffName.replace(/\s+/g, '_')}_Quy_${this.payrollFilterQuarter}_${this.payrollFilterYear}.xlsx`;
    } else {
      fileName = `Lich_Su_Luong_${staffName.replace(/\s+/g, '_')}_Nam_${this.payrollFilterYear}.xlsx`;
    }

    // Tạo header
    const header = [
      [businessName.toUpperCase()],
      [`LỊCH SỬ LƯƠNG - ${staffName.toUpperCase()}`],
      [`Chức vụ: ${this.getPositionLabel(staff.employmentInfo?.position || '')}`],
      [this.payrollFilterType === 'month' ? `Tháng: ${this.payrollFilterMonth}/${this.payrollFilterYear}` :
       this.payrollFilterType === 'quarter' ? `Quý: ${this.payrollFilterQuarter}/${this.payrollFilterYear}` :
       `Năm: ${this.payrollFilterYear}`],
      []
    ];

    // Tạo header bảng
    const tableHeader = [
      'STT',
      'Kỳ lương',
      'Ngày bắt đầu',
      'Ngày kết thúc',
      'Số ngày làm việc',
      'Lương cơ bản',
      'Phụ cấp',
      'Thưởng',
      'Bảo hiểm',
      'Phạt',
      'Ứng lương',
      'Lương thực nhận',
      'Ngày thanh toán',
      'Trạng thái'
    ];

    // Tạo dữ liệu bảng
    const tableData = this.payrollHistory.map((payroll, index) => {
      const startDate = payroll.period?.startDate ? this.formatDate(payroll.period.startDate) : 'N/A';
      const endDate = payroll.period?.endDate ? this.formatDate(payroll.period.endDate) : 'N/A';
      const paymentDate = payroll.paymentDate ? this.formatDate(payroll.paymentDate) : 'N/A';
      const status = payroll.paymentStatus === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán';
      
      return [
        index + 1,
        `${startDate} - ${endDate}`,
        startDate,
        endDate,
        payroll.daysWorked || 0,
        this.formatCurrency(payroll.baseSalary || 0),
        this.formatCurrency(payroll.allowance || 0),
        this.formatCurrency(payroll.bonus || 0),
        this.formatCurrency(payroll.insurance || 0),
        this.formatCurrency(payroll.penalty || 0),
        this.formatCurrency(payroll.advancePayment || 0),
        this.formatCurrency(payroll.netSalary || 0),
        paymentDate,
        status
      ];
    });

    // Tính tổng
    const totals = [
      '',
      'TỔNG CỘNG',
      '',
      '',
      this.payrollHistory.reduce((sum, p) => sum + (p.daysWorked || 0), 0),
      this.formatCurrency(this.payrollHistory.reduce((sum, p) => sum + (p.baseSalary || 0), 0)),
      this.formatCurrency(this.payrollHistory.reduce((sum, p) => sum + (p.allowance || 0), 0)),
      this.formatCurrency(this.payrollHistory.reduce((sum, p) => sum + (p.bonus || 0), 0)),
      this.formatCurrency(this.payrollHistory.reduce((sum, p) => sum + (p.insurance || 0), 0)),
      this.formatCurrency(this.payrollHistory.reduce((sum, p) => sum + (p.penalty || 0), 0)),
      this.formatCurrency(this.payrollHistory.reduce((sum, p) => sum + (p.advancePayment || 0), 0)),
      this.formatCurrency(this.payrollHistory.reduce((sum, p) => sum + (p.netSalary || 0), 0)),
      '',
      ''
    ];

    // Kết hợp dữ liệu
    const data = [
      ...header,
      tableHeader,
      ...tableData,
      totals
    ];

    // Tạo worksheet
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 5 },   // STT
      { wch: 25 },  // Kỳ lương
      { wch: 12 },  // Ngày bắt đầu
      { wch: 12 },  // Ngày kết thúc
      { wch: 15 },  // Số ngày làm việc
      { wch: 15 },  // Lương cơ bản
      { wch: 12 },  // Phụ cấp
      { wch: 12 },  // Thưởng
      { wch: 12 },  // Bảo hiểm
      { wch: 12 },  // Phạt
      { wch: 12 },  // Ứng lương
      { wch: 15 },  // Lương thực nhận
      { wch: 12 },  // Ngày thanh toán
      { wch: 15 }   // Trạng thái
    ];

    // Tạo workbook và xuất file
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lịch sử lương');
    
    XLSX.writeFile(wb, fileName);
    
    this.message.success('Đã xuất file Excel thành công!');
  }

  // Xuất PDF lịch sử payroll
  exportPayrollHistoryPDF(): void {
    if (!this.selectedStaffForPayrollHistory || this.payrollHistory.length === 0) {
      this.message.warning('Không có dữ liệu để xuất PDF');
      return;
    }

    const staff = this.selectedStaffForPayrollHistory;
    const staffName = this.getFullName(staff);
    const businessName = this.businessInfo?.name || 'Khách sạn';
    const positionLabel = this.getPositionLabel(staff.employmentInfo?.position || '');

    // Tạo tiêu đề filter
    let filterTitle = '';
    if (this.payrollFilterType === 'month') {
      filterTitle = `Tháng ${this.payrollFilterMonth}/${this.payrollFilterYear}`;
    } else if (this.payrollFilterType === 'quarter') {
      filterTitle = `Quý ${this.payrollFilterQuarter}/${this.payrollFilterYear}`;
    } else {
      filterTitle = `Năm ${this.payrollFilterYear}`;
    }

    const content: any[] = [];

    // Logo và tên công ty
    if (this.businessLogo) {
      const logoUrl = this.getImageUrl(this.businessLogo);
      content.push({
        columns: [
          {
            width: 60,
            image: logoUrl,
            fit: [60, 60],
            alignment: 'center'
          },
          {
            width: '*',
            text: businessName.toUpperCase(),
            fontSize: 14,
            bold: true,
            alignment: 'center',
            margin: [10, 20, 0, 0]
          }
        ],
        margin: [0, 0, 0, 20]
      });
    } else {
      content.push({
        text: businessName.toUpperCase(),
        fontSize: 14,
        bold: true,
        alignment: 'center',
        margin: [0, 0, 0, 20]
      });
    }

    // Tiêu đề
    content.push({
      text: 'LỊCH SỬ LƯƠNG',
      fontSize: 18,
      bold: true,
      alignment: 'center',
      margin: [0, 0, 0, 10]
    });

    // Thông tin nhân viên và filter
    content.push({
      text: [
        { text: 'Nhân viên: ', bold: true, fontSize: 11 },
        { text: staffName.toUpperCase(), fontSize: 11 },
        { text: '\nChức vụ: ', bold: true, fontSize: 11 },
        { text: positionLabel, fontSize: 11 },
        { text: '\nKỳ: ', bold: true, fontSize: 11 },
        { text: filterTitle, fontSize: 11 }
      ],
      margin: [0, 0, 0, 20]
    });

    // Tạo header bảng - cấu trúc mới với các khoản mục lương thành hàng
    const tableHeader = [
      { text: 'STT', style: 'tableHeader', alignment: 'center' },
      { text: 'Kỳ lương', style: 'tableHeader' },
      { text: 'Ngày bắt đầu', style: 'tableHeader', alignment: 'center' },
      { text: 'Ngày kết thúc', style: 'tableHeader', alignment: 'center' },
      { text: 'Ngày làm việc', style: 'tableHeader', alignment: 'center' },
      { text: 'Khoản mục', style: 'tableHeader' },
      { text: 'Số tiền', style: 'tableHeader', alignment: 'right' },
      { text: 'Lương thực nhận', style: 'tableHeader', alignment: 'right' },
      { text: 'Ngày thanh toán', style: 'tableHeader', alignment: 'center' },
      { text: 'Trạng thái', style: 'tableHeader', alignment: 'center' }
    ];

    // Tạo body bảng - mỗi kỳ lương có nhiều hàng cho các khoản mục
    const tableBody: any[] = [];
    this.payrollHistory.forEach((payroll: any, index: number) => {
      const startDate = payroll.period?.startDate ? this.formatDate(payroll.period.startDate) : 'N/A';
      const endDate = payroll.period?.endDate ? this.formatDate(payroll.period.endDate) : 'N/A';
      const paymentDate = payroll.paymentDate ? this.formatDate(payroll.paymentDate) : 'N/A';
      const status = payroll.paymentStatus === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán';
      const daysWorked = `${payroll.daysWorked || 0} ngày`;
      const netSalary = this.formatCurrency(payroll.netSalary || 0);

      // Các khoản mục lương
      const salaryItems = [
        { label: 'Lương cơ bản', amount: payroll.baseSalary || 0 },
        { label: 'Phụ cấp', amount: payroll.allowance || 0 },
        { label: 'Thưởng', amount: payroll.bonus || 0 },
        { label: 'Bảo hiểm', amount: payroll.insurance || 0 },
        { label: 'Phạt', amount: payroll.penalty || 0 },
        { label: 'Ứng lương', amount: payroll.advancePayment || 0 }
      ];

      // Thêm các hàng cho từng khoản mục
      salaryItems.forEach((item, itemIndex) => {
        const isFirstRow = itemIndex === 0;
        tableBody.push([
          isFirstRow ? { text: (index + 1).toString(), alignment: 'center', fontSize: 8, rowSpan: salaryItems.length } : '',
          isFirstRow ? { text: `${startDate} - ${endDate}`, fontSize: 8, rowSpan: salaryItems.length } : '',
          isFirstRow ? { text: startDate, alignment: 'center', fontSize: 8, rowSpan: salaryItems.length } : '',
          isFirstRow ? { text: endDate, alignment: 'center', fontSize: 8, rowSpan: salaryItems.length } : '',
          isFirstRow ? { text: daysWorked, alignment: 'center', fontSize: 8, rowSpan: salaryItems.length } : '',
          { text: item.label, fontSize: 8 },
          { text: this.formatCurrency(item.amount), alignment: 'right', fontSize: 8 },
          isFirstRow ? { text: netSalary, alignment: 'right', fontSize: 8, bold: true, rowSpan: salaryItems.length } : '',
          isFirstRow ? { text: paymentDate, alignment: 'center', fontSize: 8, rowSpan: salaryItems.length } : '',
          isFirstRow ? { text: status, alignment: 'center', fontSize: 8, rowSpan: salaryItems.length } : ''
        ]);
      });
    });

    // Tính tổng - hiển thị dưới dạng hàng
    const totalBaseSalary = this.payrollHistory.reduce((sum: number, p: any) => sum + (p.baseSalary || 0), 0);
    const totalAllowance = this.payrollHistory.reduce((sum: number, p: any) => sum + (p.allowance || 0), 0);
    const totalBonus = this.payrollHistory.reduce((sum: number, p: any) => sum + (p.bonus || 0), 0);
    const totalInsurance = this.payrollHistory.reduce((sum: number, p: any) => sum + (p.insurance || 0), 0);
    const totalPenalty = this.payrollHistory.reduce((sum: number, p: any) => sum + (p.penalty || 0), 0);
    const totalAdvancePayment = this.payrollHistory.reduce((sum: number, p: any) => sum + (p.advancePayment || 0), 0);
    const totalNetSalary = this.payrollHistory.reduce((sum: number, p: any) => sum + (p.netSalary || 0), 0);

    const totalItems = [
      { label: 'Lương cơ bản', amount: totalBaseSalary },
      { label: 'Phụ cấp', amount: totalAllowance },
      { label: 'Thưởng', amount: totalBonus },
      { label: 'Bảo hiểm', amount: totalInsurance },
      { label: 'Phạt', amount: totalPenalty },
      { label: 'Ứng lương', amount: totalAdvancePayment }
    ];

    // Thêm hàng tổng cộng
    totalItems.forEach((item, itemIndex) => {
      const isFirstRow = itemIndex === 0;
      tableBody.push([
        isFirstRow ? { text: 'TỔNG CỘNG', colSpan: 5, bold: true, fontSize: 9 } : '',
        '',
        '',
        '',
        '',
        { text: item.label, fontSize: 8, bold: true },
        { text: this.formatCurrency(item.amount), alignment: 'right', fontSize: 8, bold: true },
        isFirstRow ? { text: this.formatCurrency(totalNetSalary), alignment: 'right', fontSize: 9, bold: true, rowSpan: totalItems.length } : '',
        '',
        ''
      ]);
    });

    // Thêm bảng vào content - sử dụng landscape và điều chỉnh độ rộng cột (10 cột)
    content.push({
      table: {
        headerRows: 1,
        widths: [25, 80, 60, 60, 50, 100, 80, 90, 70, 60], // 10 cột
        body: [tableHeader, ...tableBody]
      },
      layout: {
        hLineWidth: function (i: number, node: any) {
          return i === 0 || i === node.table.body.length ? 1 : 0.5;
        },
        vLineWidth: function (i: number, node: any) {
          return i === 0 || i === node.table.widths.length ? 1 : 0.5;
        },
        hLineColor: function (i: number, node: any) {
          return i === 0 || i === node.table.body.length ? '#000' : '#aaa';
        },
        vLineColor: function (i: number, node: any) {
          return i === 0 || i === node.table.widths.length ? '#000' : '#aaa';
        }
      },
      margin: [0, 0, 0, 20]
    });

    // Footer
    const printDate = new Date().toLocaleDateString('vi-VN') + ' ' + 
      new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    
    content.push({
      text: [
        { text: 'Cảm ơn quý khách đã sử dụng dịch vụ!\n', alignment: 'center', fontSize: 10 },
        { text: `Ngày in: ${printDate}`, alignment: 'center', fontSize: 9, italics: true }
      ],
      alignment: 'center',
      margin: [0, 20, 0, 0]
    });

    const documentDefinition = {
      pageOrientation: 'landscape', // Xoay ngang để bảng vừa trang
      pageSize: 'A4',
      content: content,
      styles: {
        tableHeader: {
          bold: true,
          fontSize: 8,
          color: 'black'
        }
      },
      defaultStyle: {
        fontSize: 9
      }
    };

    if (window.pdfMake) {
      window.pdfMake.createPdf(documentDefinition).print();
    } else {
      this.message.error('PDF library chưa được tải. Vui lòng tải lại trang.');
    }
  }

  // Lấy danh sách tháng
  getMonths(): number[] {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }

  // Lấy danh sách quý
  getQuarters(): number[] {
    return [1, 2, 3, 4];
  }

  // Lấy danh sách năm (từ năm hiện tại trở về trước 5 năm)
  getYears(): number[] {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let i = 0; i < 6; i++) {
      years.push(currentYear - i);
    }
    return years;
  }

  // ============ EXPORT SUMMARY ============

  openExportSummaryModal(filterType: 'month' | 'quarter' | 'year', format: 'excel' | 'pdf'): void {
    this.exportSummaryFilterType = filterType;
    this.exportSummaryFormat = format;
    this.exportSummaryFilterMonth = new Date().getMonth() + 1;
    this.exportSummaryFilterYear = new Date().getFullYear();
    this.exportSummaryFilterQuarter = Math.floor((new Date().getMonth() + 3) / 3);
    this.isExportSummaryModalVisible = true;
  }

  closeExportSummaryModal(): void {
    this.isExportSummaryModalVisible = false;
    this.allStaffPayrollSummary = [];
  }

  loadAllStaffPayrollSummary(): void {
    if (!this.selectedHotelId) {
      this.message.error('Vui lòng chọn khách sạn');
      return;
    }

    this.isLoading = true;
    this.allStaffPayrollSummary = [];

    // Lấy tất cả nhân viên của khách sạn
    this.subscriptions.add(
      this.staffService.getStaffByHotel(this.selectedHotelId).subscribe(
        (staffs: Staff[]) => {
          const allPayrolls: any[] = [];

          staffs.forEach((staff: Staff) => {
            if (staff.payroll && Array.isArray(staff.payroll)) {
              staff.payroll.forEach((payroll: any) => {
                const payrollDate = payroll.calculatedAt ? new Date(payroll.calculatedAt) :
                                   (payroll.period?.endDate ? new Date(payroll.period.endDate) : null);
                
                if (!payrollDate) return;

                let shouldInclude = false;

                if (this.exportSummaryFilterType === 'month') {
                  shouldInclude = payrollDate.getMonth() + 1 === this.exportSummaryFilterMonth &&
                                 payrollDate.getFullYear() === this.exportSummaryFilterYear;
                } else if (this.exportSummaryFilterType === 'quarter') {
                  const quarter = Math.floor(payrollDate.getMonth() / 3) + 1;
                  shouldInclude = quarter === this.exportSummaryFilterQuarter &&
                                 payrollDate.getFullYear() === this.exportSummaryFilterYear;
                } else if (this.exportSummaryFilterType === 'year') {
                  shouldInclude = payrollDate.getFullYear() === this.exportSummaryFilterYear;
                }

                if (shouldInclude) {
                  allPayrolls.push({
                    ...payroll,
                    staffId: staff._id,
                    staffName: this.getFullName(staff),
                    staffPosition: this.getPositionLabel(staff.employmentInfo?.position || 'other')
                  });
                }
              });
            }
          });

          // Sắp xếp theo tên nhân viên và ngày tính lương
          allPayrolls.sort((a, b) => {
            const nameCompare = a.staffName.localeCompare(b.staffName);
            if (nameCompare !== 0) return nameCompare;
            const dateA = a.calculatedAt ? new Date(a.calculatedAt).getTime() :
                         (a.period?.endDate ? new Date(a.period.endDate).getTime() : 0);
            const dateB = b.calculatedAt ? new Date(b.calculatedAt).getTime() :
                         (b.period?.endDate ? new Date(b.period.endDate).getTime() : 0);
            return dateB - dateA;
          });

          this.allStaffPayrollSummary = allPayrolls;
          this.isLoading = false;

          if (this.allStaffPayrollSummary.length === 0) {
            this.message.warning('Không có dữ liệu lương cho khoảng thời gian đã chọn');
          } else {
            if (this.exportSummaryFormat === 'excel') {
              this.exportSummaryExcel();
            } else {
              this.exportSummaryPDF();
            }
          }
        },
        (error) => {
          console.error('Error loading staff payroll summary:', error);
          this.isLoading = false;
          this.message.error('Lỗi khi tải dữ liệu lương');
        }
      )
    );
  }

  exportSummaryExcel(): void {
    if (this.allStaffPayrollSummary.length === 0) {
      this.message.warning('Không có dữ liệu để xuất');
      return;
    }

    const data: any[] = [];
    
    this.allStaffPayrollSummary.forEach((payroll: any, index: number) => {
      const startDate = payroll.period?.startDate ? this.formatDate(payroll.period.startDate) : 'N/A';
      const endDate = payroll.period?.endDate ? this.formatDate(payroll.period.endDate) : 'N/A';
      const paymentDate = payroll.paymentDate ? this.formatDate(payroll.paymentDate) : 'N/A';
      const status = payroll.paymentStatus === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán';

      data.push({
        'STT': index + 1,
        'Nhân viên': payroll.staffName,
        'Chức vụ': payroll.staffPosition,
        'Kỳ lương': `${startDate} - ${endDate}`,
        'Ngày bắt đầu': startDate,
        'Ngày kết thúc': endDate,
        'Số ngày làm việc': payroll.daysWorked || 0,
        'Lương cơ bản': payroll.baseSalary || 0,
        'Phụ cấp': payroll.allowance || 0,
        'Thưởng': payroll.bonus || 0,
        'Bảo hiểm': payroll.insurance || 0,
        'Phạt': payroll.penalty || 0,
        'Ứng lương': payroll.advancePayment || 0,
        'Lương thực nhận': payroll.netSalary || 0,
        'Ngày thanh toán': paymentDate,
        'Trạng thái': status
      });
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tổng hợp thanh toán');

    let fileName = '';
    if (this.exportSummaryFilterType === 'month') {
      fileName = `Tong_Hop_Thanh_Toan_Thang_${this.exportSummaryFilterMonth}_${this.exportSummaryFilterYear}.xlsx`;
    } else if (this.exportSummaryFilterType === 'quarter') {
      fileName = `Tong_Hop_Thanh_Toan_Quy_${this.exportSummaryFilterQuarter}_${this.exportSummaryFilterYear}.xlsx`;
    } else {
      fileName = `Tong_Hop_Thanh_Toan_Nam_${this.exportSummaryFilterYear}.xlsx`;
    }

    XLSX.writeFile(wb, fileName);
    this.message.success('Xuất Excel thành công!');
    this.closeExportSummaryModal();
  }

  exportSummaryPDF(): void {
    if (this.allStaffPayrollSummary.length === 0) {
      this.message.warning('Không có dữ liệu để xuất');
      return;
    }

    if (!window.pdfMake) {
      this.message.error('PDF library chưa được tải. Vui lòng tải lại trang.');
      return;
    }

    const content: any[] = [];

    // Header với logo
    if (this.businessLogo) {
      const logoUrl = this.getImageUrl(this.businessLogo);
      content.push({
        image: logoUrl,
        width: 60,
        alignment: 'center',
        margin: [0, 0, 0, 10]
      });
    }

    // Tiêu đề
    let filterTitle = '';
    if (this.exportSummaryFilterType === 'month') {
      filterTitle = `Tháng ${this.exportSummaryFilterMonth}/${this.exportSummaryFilterYear}`;
    } else if (this.exportSummaryFilterType === 'quarter') {
      filterTitle = `Quý ${this.exportSummaryFilterQuarter}/${this.exportSummaryFilterYear}`;
    } else {
      filterTitle = `Năm ${this.exportSummaryFilterYear}`;
    }

    content.push({
      text: [
        { text: 'TỔNG HỢP THANH TOÁN LƯƠNG\n', fontSize: 16, bold: true, alignment: 'center' },
        { text: `Kỳ: ${filterTitle}\n`, fontSize: 12, alignment: 'center' },
        { text: `Tổng số nhân viên: ${this.allStaffPayrollSummary.length}\n\n`, fontSize: 11, alignment: 'center' }
      ],
      margin: [0, 0, 0, 20]
    });

    // Header bảng
    const tableHeader = [
      { text: 'STT', style: 'tableHeader', alignment: 'center' },
      { text: 'Nhân viên', style: 'tableHeader' },
      { text: 'Chức vụ', style: 'tableHeader' },
      { text: 'Kỳ lương', style: 'tableHeader' },
      { text: 'Ngày làm việc', style: 'tableHeader', alignment: 'center' },
      { text: 'Khoản mục', style: 'tableHeader' },
      { text: 'Số tiền', style: 'tableHeader', alignment: 'right' },
      { text: 'Lương thực nhận', style: 'tableHeader', alignment: 'right' },
      { text: 'Ngày thanh toán', style: 'tableHeader', alignment: 'center' },
      { text: 'Trạng thái', style: 'tableHeader', alignment: 'center' }
    ];

    // Body bảng - nhóm theo nhân viên
    const tableBody: any[] = [];
    let currentStaffId = '';
    let staffIndex = 0;

    this.allStaffPayrollSummary.forEach((payroll: any) => {
      const startDate = payroll.period?.startDate ? this.formatDate(payroll.period.startDate) : 'N/A';
      const endDate = payroll.period?.endDate ? this.formatDate(payroll.period.endDate) : 'N/A';
      const paymentDate = payroll.paymentDate ? this.formatDate(payroll.paymentDate) : 'N/A';
      const status = payroll.paymentStatus === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán';
      const daysWorked = `${payroll.daysWorked || 0} ngày`;
      const netSalary = this.formatCurrency(payroll.netSalary || 0);

      // Nếu là nhân viên mới, tăng index
      if (payroll.staffId !== currentStaffId) {
        currentStaffId = payroll.staffId;
        staffIndex++;
      }

      const salaryItems = [
        { label: 'Lương cơ bản', amount: payroll.baseSalary || 0 },
        { label: 'Phụ cấp', amount: payroll.allowance || 0 },
        { label: 'Thưởng', amount: payroll.bonus || 0 },
        { label: 'Bảo hiểm', amount: payroll.insurance || 0 },
        { label: 'Phạt', amount: payroll.penalty || 0 },
        { label: 'Ứng lương', amount: payroll.advancePayment || 0 }
      ];

      salaryItems.forEach((item, itemIndex) => {
        const isFirstRow = itemIndex === 0;
        tableBody.push([
          isFirstRow ? { text: staffIndex.toString(), alignment: 'center', fontSize: 7, rowSpan: salaryItems.length } : '',
          isFirstRow ? { text: payroll.staffName, fontSize: 7, rowSpan: salaryItems.length } : '',
          isFirstRow ? { text: payroll.staffPosition, fontSize: 7, rowSpan: salaryItems.length } : '',
          isFirstRow ? { text: `${startDate} - ${endDate}`, fontSize: 7, rowSpan: salaryItems.length } : '',
          isFirstRow ? { text: daysWorked, alignment: 'center', fontSize: 7, rowSpan: salaryItems.length } : '',
          { text: item.label, fontSize: 7 },
          { text: this.formatCurrency(item.amount), alignment: 'right', fontSize: 7 },
          isFirstRow ? { text: netSalary, alignment: 'right', fontSize: 7, bold: true, rowSpan: salaryItems.length } : '',
          isFirstRow ? { text: paymentDate, alignment: 'center', fontSize: 7, rowSpan: salaryItems.length } : '',
          isFirstRow ? { text: status, alignment: 'center', fontSize: 7, rowSpan: salaryItems.length } : ''
        ]);
      });
    });

    // Tính tổng
    const totalBaseSalary = this.allStaffPayrollSummary.reduce((sum: number, p: any) => sum + (p.baseSalary || 0), 0);
    const totalAllowance = this.allStaffPayrollSummary.reduce((sum: number, p: any) => sum + (p.allowance || 0), 0);
    const totalBonus = this.allStaffPayrollSummary.reduce((sum: number, p: any) => sum + (p.bonus || 0), 0);
    const totalInsurance = this.allStaffPayrollSummary.reduce((sum: number, p: any) => sum + (p.insurance || 0), 0);
    const totalPenalty = this.allStaffPayrollSummary.reduce((sum: number, p: any) => sum + (p.penalty || 0), 0);
    const totalAdvancePayment = this.allStaffPayrollSummary.reduce((sum: number, p: any) => sum + (p.advancePayment || 0), 0);
    const totalNetSalary = this.allStaffPayrollSummary.reduce((sum: number, p: any) => sum + (p.netSalary || 0), 0);

    const totalItems = [
      { label: 'Lương cơ bản', amount: totalBaseSalary },
      { label: 'Phụ cấp', amount: totalAllowance },
      { label: 'Thưởng', amount: totalBonus },
      { label: 'Bảo hiểm', amount: totalInsurance },
      { label: 'Phạt', amount: totalPenalty },
      { label: 'Ứng lương', amount: totalAdvancePayment }
    ];

    totalItems.forEach((item, itemIndex) => {
      const isFirstRow = itemIndex === 0;
      tableBody.push([
        isFirstRow ? { text: 'TỔNG CỘNG', colSpan: 5, bold: true, fontSize: 8 } : '',
        '',
        '',
        '',
        '',
        { text: item.label, fontSize: 7, bold: true },
        { text: this.formatCurrency(item.amount), alignment: 'right', fontSize: 7, bold: true },
        isFirstRow ? { text: this.formatCurrency(totalNetSalary), alignment: 'right', fontSize: 8, bold: true, rowSpan: totalItems.length } : '',
        '',
        ''
      ]);
    });

    content.push({
      table: {
        headerRows: 1,
        widths: [25, 80, 60, 60, 50, 100, 80, 90, 70, 60],
        body: [tableHeader, ...tableBody]
      },
      layout: {
        hLineWidth: function (i: number, node: any) {
          return i === 0 || i === node.table.body.length ? 1 : 0.5;
        },
        vLineWidth: function (i: number, node: any) {
          return i === 0 || i === node.table.widths.length ? 1 : 0.5;
        },
        hLineColor: function (i: number, node: any) {
          return i === 0 || i === node.table.body.length ? '#000' : '#aaa';
        },
        vLineColor: function (i: number, node: any) {
          return i === 0 || i === node.table.widths.length ? '#000' : '#aaa';
        }
      },
      margin: [0, 0, 0, 20]
    });

    // Footer
    const printDate = new Date().toLocaleDateString('vi-VN') + ' ' +
      new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    content.push({
      text: [
        { text: 'Cảm ơn quý khách đã sử dụng dịch vụ!\n', alignment: 'center', fontSize: 10 },
        { text: `Ngày in: ${printDate}`, alignment: 'center', fontSize: 9, italics: true }
      ],
      alignment: 'center',
      margin: [0, 20, 0, 0]
    });

    const documentDefinition = {
      pageOrientation: 'landscape',
      content: content,
      styles: {
        tableHeader: {
          bold: true,
          fontSize: 8,
          color: 'black',
          fillColor: '#f0f0f0',
          alignment: 'left'
        }
      },
      defaultStyle: {
        fontSize: 9
      }
    };

    let fileName = '';
    if (this.exportSummaryFilterType === 'month') {
      fileName = `Tong_Hop_Thanh_Toan_Thang_${this.exportSummaryFilterMonth}_${this.exportSummaryFilterYear}.pdf`;
    } else if (this.exportSummaryFilterType === 'quarter') {
      fileName = `Tong_Hop_Thanh_Toan_Quy_${this.exportSummaryFilterQuarter}_${this.exportSummaryFilterYear}.pdf`;
    } else {
      fileName = `Tong_Hop_Thanh_Toan_Nam_${this.exportSummaryFilterYear}.pdf`;
    }

    window.pdfMake.createPdf(documentDefinition).download(fileName);
    this.message.success('Xuất PDF thành công!');
    this.closeExportSummaryModal();
  }

  onExportSummaryFilterChange(): void {
    // Có thể thêm logic validation nếu cần
  }

  apiBaseUrl = 'https://nest-production-8106.up.railway.app';

  getImageUrl(urlOrId: string | null | undefined): string {
    if (!urlOrId) return '';
    // Nếu là URL đầy đủ (http/https), trả về nguyên
    if (urlOrId.startsWith('http://') || urlOrId.startsWith('https://')) {
      return urlOrId;
    }
    // Nếu là imageId hoặc path, thêm base URL
    if (urlOrId.startsWith('/files/')) {
      return `${this.apiBaseUrl}${urlOrId}`;
    }
    // Nếu chỉ là ID, thêm /files/ prefix
    return `${this.apiBaseUrl}/files/${urlOrId}`;
  }

  handleLogoError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.src = '';
      img.style.display = 'none';
    }
  }
}
