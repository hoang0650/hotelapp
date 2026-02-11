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
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { TranslateService } from '@ngx-translate/core';

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
  
  // Options - sẽ được khởi tạo trong ngOnInit
  positions: { value: string, label: string }[] = [];
  statuses: { value: string, label: string }[] = [];
  
  shifts: { value: string, label: string }[] = [];
  genders: { value: string, label: string }[] = [];
  permissions: { value: string, label: string }[] = [];
  
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
    private modal: NzModalService,
    private http: HttpClient,
    private translate: TranslateService
  ) {
    this.initForm();
    this.initSalaryForm();
  }

  ngOnInit(): void {
    this.initTranslationArrays();
    this.loadHotels();
    this.loadBusinessInfo();
    
    // Auto-select hotel nếu user là hotel manager
    const hotelId = this.authService.getHotelId();
    if (hotelId) {
      this.selectedHotelId = hotelId;
      this.loadStaff(); // loadUsers sẽ được gọi sau khi loadStaff xong
    }

    // Subscribe to language changes
    this.translate.onLangChange.subscribe(() => {
      this.initTranslationArrays();
    });
  }

  private initTranslationArrays(): void {
    this.shifts = [
      { value: 'morning', label: this.translate.instant('STAFF_MANAGEMENT.SHIFTS.MORNING') },
      { value: 'afternoon', label: this.translate.instant('STAFF_MANAGEMENT.SHIFTS.AFTERNOON') },
      { value: 'night', label: this.translate.instant('STAFF_MANAGEMENT.SHIFTS.NIGHT') },
      { value: 'full-day', label: this.translate.instant('STAFF_MANAGEMENT.SHIFTS.FULL_DAY') }
    ];
    
    this.genders = [
      { value: 'male', label: this.translate.instant('STAFF_MANAGEMENT.GENDERS.MALE') },
      { value: 'female', label: this.translate.instant('STAFF_MANAGEMENT.GENDERS.FEMALE') },
      { value: 'other', label: this.translate.instant('STAFF_MANAGEMENT.GENDERS.OTHER') }
    ];
    
    this.positions = [
      { value: 'manager', label: this.translate.instant('STAFF_MANAGEMENT.POSITIONS.MANAGER') || 'Quản lý' },
      { value: 'receptionist', label: this.translate.instant('STAFF_MANAGEMENT.POSITIONS.RECEPTIONIST') || 'Lễ tân' },
      { value: 'housekeeper', label: this.translate.instant('STAFF_MANAGEMENT.POSITIONS.HOUSEKEEPER') || 'Housekeeping' },
      { value: 'maintenance', label: this.translate.instant('STAFF_MANAGEMENT.POSITIONS.MAINTENANCE') || 'Bảo trì' },
      { value: 'other', label: this.translate.instant('STAFF_MANAGEMENT.POSITIONS.OTHER') || 'Khác' }
    ];
    
    this.statuses = [
      { value: 'active', label: this.translate.instant('STAFF_MANAGEMENT.STATUSES.ACTIVE') || 'Đang làm việc' },
      { value: 'on_leave', label: this.translate.instant('STAFF_MANAGEMENT.STATUSES.ON_LEAVE') || 'Nghỉ phép' },
      { value: 'terminated', label: this.translate.instant('STAFF_MANAGEMENT.STATUSES.TERMINATED') || 'Đã nghỉ việc' }
    ];
    
    this.permissions = [
      { value: 'view', label: this.translate.instant('STAFF_MANAGEMENT.PERMISSIONS.VIEW') },
      { value: 'create', label: this.translate.instant('STAFF_MANAGEMENT.PERMISSIONS.CREATE') },
      { value: 'edit', label: this.translate.instant('STAFF_MANAGEMENT.PERMISSIONS.EDIT') },
      { value: 'delete', label: this.translate.instant('STAFF_MANAGEMENT.PERMISSIONS.DELETE') },
      { value: 'manage_rooms', label: this.translate.instant('STAFF_MANAGEMENT.PERMISSIONS.MANAGE_ROOMS') },
      { value: 'manage_bookings', label: this.translate.instant('STAFF_MANAGEMENT.PERMISSIONS.MANAGE_BOOKINGS') }
    ];
  }

  loadBusinessInfo(): void {
    // Lấy business info từ hotel hoặc business service
    const hotelId = this.authService.getHotelId() || this.selectedHotelId;
    if (hotelId) {
      this.subscriptions.add(
        this.hotelService.getHotelById(hotelId).subscribe(
          (hotel: any) => {
            const canLoadBusiness = this.authService.isAdmin() || this.authService.isBusiness();
            if (hotel && hotel.businessId && canLoadBusiness) {
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
                      name: hotel.name || this.translate.instant('STAFF_MANAGEMENT.DEFAULT_HOTEL'),
                      logo: ''
                    };
                  }
                )
              );
            } else {
              // Fallback: dùng hotel info
              this.businessInfo = {
                name: hotel?.name || this.translate.instant('STAFF_MANAGEMENT.DEFAULT_HOTEL'),
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
            this.businessInfo = { name: this.translate.instant('STAFF_MANAGEMENT.DEFAULT_HOTEL'), logo: '' };
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
          country: [this.translate.instant('STAFF_MANAGEMENT.DEFAULT_COUNTRY')],
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
        address: { street: '', city: '', state: '', country: this.translate.instant('STAFF_MANAGEMENT.DEFAULT_COUNTRY'), postalCode: '' }
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

  // Helper function để extract businessId từ hotel (xử lý cả populated và non-populated)
  private extractBusinessId(hotel: any): string | null {
    if (!hotel || !hotel.businessId) {
      return null;
    }
    
    // Nếu là string, trả về trực tiếp
    if (typeof hotel.businessId === 'string') {
      return hotel.businessId;
    }
    
    // Nếu là object
    if (typeof hotel.businessId === 'object' && hotel.businessId !== null) {
      const businessIdObj = hotel.businessId as { _id?: string | { toString(): string }; [key: string]: any };
      
      // Nếu có _id
      if ('_id' in businessIdObj && businessIdObj._id) {
        if (typeof businessIdObj._id === 'string') {
          return businessIdObj._id;
        } else if (typeof businessIdObj._id === 'object' && 'toString' in businessIdObj._id) {
          return businessIdObj._id.toString();
        }
      }
      
      // Nếu object có method toString
      if (typeof (businessIdObj as any).toString === 'function') {
        return (businessIdObj as any).toString();
      }
    }
    
    return null;
  }

  loadHotels(): void {
    this.subscriptions.add(
      this.hotelService.getHotels().subscribe(
        (hotels) => {
          const currentUser = this.authService.getCurrentUser();
          
          // Filter hotels theo role
          if (this.authService.isAdmin() || this.authService.isSuperAdmin()) {
            // Admin/Superadmin thấy tất cả
            this.hotels = hotels;
          } else if (this.authService.isBusiness() && currentUser?.businessId) {
            // Business chỉ thấy hotels thuộc business của mình
            let userBusinessIdStr: string | null = null;
            
            if (typeof currentUser.businessId === 'string') {
              userBusinessIdStr = currentUser.businessId;
            } else if (typeof currentUser.businessId === 'object' && currentUser.businessId !== null) {
              const businessIdObj = currentUser.businessId as any;
              if (businessIdObj._id) {
                userBusinessIdStr = typeof businessIdObj._id === 'string' 
                  ? businessIdObj._id 
                  : businessIdObj._id.toString();
              } else if (typeof businessIdObj.toString === 'function') {
                userBusinessIdStr = businessIdObj.toString();
              }
            }
            
            this.hotels = hotels.filter((hotel: any) => {
              const hotelBusinessId = this.extractBusinessId(hotel);
              return hotelBusinessId && userBusinessIdStr && hotelBusinessId.toString() === userBusinessIdStr.toString();
            });
          } else if (this.authService.isHotelManager() && currentUser?.hotelId) {
            // Hotel manager chỉ thấy hotel của mình
            this.hotels = hotels.filter((hotel: any) => hotel._id === currentUser.hotelId);
          } else {
            this.hotels = hotels; // Fallback: giữ nguyên nếu không match
          }
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
          this.message.error(this.translate.instant('STAFF_MANAGEMENT.LOAD_STAFF_ERROR') + ': ' + (error.error?.message || error.message));
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
      this.message.warning(this.translate.instant('STAFF_MANAGEMENT.FILL_REQUIRED_FIELDS'));
      return;
    }

    this.isLoading = true;
    const newStaff: Staff = this.staffForm.value;
    
    this.subscriptions.add(
      this.staffService.createStaff(newStaff).subscribe(
        (data: Staff) => {
          this.message.success(this.translate.instant('STAFF_MANAGEMENT.CREATE_SUCCESS'));
          this.staffs.push(data);
          this.stopEdit();
          this.isLoading = false;
        },
        (error) => {
          this.message.error(this.translate.instant('STAFF_MANAGEMENT.CREATE_ERROR') + ': ' + (error.error?.message || error.message));
          this.isLoading = false;
        }
      )
    );
  }

  updateStaff(): void {
    if (!this.selectedStaff || this.staffForm.invalid) {
      this.markFormDirty();
      this.message.warning(this.translate.instant('STAFF_MANAGEMENT.FILL_REQUIRED_FIELDS'));
      return;
    }

    this.isLoading = true;
    
    this.subscriptions.add(
      this.staffService.updateStaff(this.selectedStaff._id!, this.staffForm.value).subscribe(
        () => {
          this.message.success(this.translate.instant('STAFF_MANAGEMENT.UPDATE_SUCCESS'));
          this.loadStaff();
          this.stopEdit();
          this.isLoading = false;
        },
        (error) => {
          this.message.error(this.translate.instant('STAFF_MANAGEMENT.UPDATE_ERROR') + ': ' + (error.error?.message || error.message));
          this.isLoading = false;
        }
      )
    );
  }

  deleteStaff(staff: Staff): void {
    this.modal.confirm({
      nzTitle: this.translate.instant('STAFF_MANAGEMENT.CONFIRM_DELETE_TITLE'),
      nzContent: this.translate.instant('STAFF_MANAGEMENT.CONFIRM_DELETE_MESSAGE', { name: this.getFullName(staff) }),
      nzOkText: this.translate.instant('COMMON.DELETE'),
      nzOkType: 'primary',
      nzOkDanger: true,
      nzCancelText: this.translate.instant('COMMON.CANCEL'),
      nzOnOk: () => {
        this.isLoading = true;
        this.subscriptions.add(
          this.staffService.deleteStaff(staff._id!).subscribe(
            () => {
              this.message.success(this.translate.instant('STAFF_MANAGEMENT.DELETE_SUCCESS'));
              this.staffs = this.staffs.filter(s => s._id !== staff._id);
              this.isLoading = false;
            },
            (error) => {
              this.message.error(this.translate.instant('STAFF_MANAGEMENT.DELETE_ERROR') + ': ' + (error.error?.message || error.message));
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
      this.message.error(this.translate.instant('STAFF_MANAGEMENT.STAFF_NOT_FOUND'));
      return;
    }

    if (this.salaryCalculationForm.invalid) {
      this.message.warning(this.translate.instant('STAFF_MANAGEMENT.CHECK_INFO'));
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
          this.message.success(this.translate.instant('STAFF_MANAGEMENT.CALCULATE_SALARY_SUCCESS'));
          this.isLoading = false;
          // KHÔNG reload staff vì chưa lưu vào payroll
        },
        (error) => {
          this.message.error(this.translate.instant('STAFF_MANAGEMENT.CALCULATE_SALARY_ERROR') + ': ' + (error.error?.message || error.message));
          this.isLoading = false;
        }
      )
    );
  }

  paySalary(): void {
    if (!this.selectedStaffForSalary || !this.selectedStaffForSalary._id || !this.salaryCalculationResult) {
      this.message.error(this.translate.instant('STAFF_MANAGEMENT.CALCULATE_SALARY_FIRST'));
      return;
    }

    const staffId = this.selectedStaffForSalary._id;
    if (!staffId) {
      this.message.error(this.translate.instant('STAFF_MANAGEMENT.STAFF_ID_NOT_FOUND'));
      return;
    }

    this.modal.confirm({
      nzTitle: this.translate.instant('STAFF_MANAGEMENT.CONFIRM_PAYMENT_TITLE'),
      nzContent: this.translate.instant('STAFF_MANAGEMENT.CONFIRM_PAYMENT_MESSAGE', { name: this.getFullName(this.selectedStaffForSalary) }),
      nzOkText: this.translate.instant('COMMON.CONFIRM'),
      nzOkType: 'primary',
      nzCancelText: this.translate.instant('COMMON.CANCEL'),
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
              this.message.success(this.translate.instant('STAFF_MANAGEMENT.PAYMENT_SUCCESS'));
              this.isLoading = false;
              // Reload danh sách staff để cập nhật payroll
              this.loadStaff();
              // Đóng modal
              this.closeSalaryModal();
            },
            (error) => {
              this.message.error(this.translate.instant('STAFF_MANAGEMENT.PAYMENT_ERROR') + ': ' + (error.error?.message || error.message));
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
  async exportSalaryPDF(): Promise<void> {
    if (!this.salaryCalculationResult || !this.selectedStaffForSalary) {
      this.message.warning(this.translate.instant('STAFF_MANAGEMENT.CALCULATE_SALARY_BEFORE_PDF'));
      return;
    }

    const breakdown = this.salaryCalculationResult.breakdown;
    const staff = this.selectedStaffForSalary;
    const staffName = this.getFullName(staff);
    const period = this.getSalaryPeriod();
    const businessName = this.businessInfo?.name || this.translate.instant('STAFF_MANAGEMENT.DEFAULT_HOTEL');

    // Tính lương cơ bản tháng (nếu có)
    const baseSalaryMonthly = staff.employmentInfo?.salary || 0;
    const baseSalaryText = baseSalaryMonthly > 0 ? `${this.translate.instant('STAFF_MANAGEMENT.EXPORT.MONTHLY')} = ${this.formatCurrencyK(baseSalaryMonthly)}` : '';

    // Lấy ngày bắt đầu làm việc
    const startDate = breakdown.startDate || staff.employmentInfo?.startDate;
    const startDateText = startDate ? this.formatDate(startDate) : 'N/A';

    // Lấy chức vụ
    const position = staff.employmentInfo?.position || '';
    const positionLabel = this.getPositionLabel(position);

    // Tính các khoản phụ cấp
    const allowanceItems: any[] = [];
    if (breakdown.allowance > 0) {
      allowanceItems.push(`${this.formatCurrencyK(breakdown.allowance)} ${this.translate.instant('STAFF_MANAGEMENT.EXPORT.ALLOWANCE')}`);
    }
    if (breakdown.bonus > 0) {
      allowanceItems.push(`${this.formatCurrencyK(breakdown.bonus)} ${this.translate.instant('STAFF_MANAGEMENT.EXPORT.BONUS')}`);
    }

    // Lấy ỨNG LƯƠNG từ breakdown
    const advancePayment = breakdown.advancePayment || 0;

    const content: any[] = [];

    // Logo (không hiển thị tên công ty với background màu xanh)
    if (this.businessLogo) {
      try {
        const logoUrl = this.getImageUrl(this.businessLogo);
        const logoBase64 = await this.convertImageUrlToBase64(logoUrl);
        if (logoBase64) {
          content.push({
            image: logoBase64,
            fit: [120, 120],
            alignment: 'left',
            margin: [0, 0, 0, 20]
          });
        }
      } catch (error) {
        console.error('Error converting logo to base64:', error);
      }
    }

    const documentDefinition = {
      content: [
        ...content,

        // Tiêu đề
        {
          text: `${this.translate.instant('STAFF_MANAGEMENT.EXPORT.SALARY_SLIP')} ${period}`,
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
                { text: `${this.translate.instant('STAFF_MANAGEMENT.EXPORT.FULL_NAME')}: `, bold: true },
                { text: staffName.toUpperCase(), bold: true },
                { text: `\n${this.translate.instant('STAFF_MANAGEMENT.POSITION')}: `, bold: true },
                { text: positionLabel },
                { text: `\n${this.translate.instant('STAFF_MANAGEMENT.EXPORT.BASE_SALARY')}: `, bold: true },
                { text: baseSalaryText || 'N/A', bold: true },
                { text: `\n${this.translate.instant('STAFF_MANAGEMENT.EXPORT.WORKING_DAYS')}: `, bold: true },
                { text: `${breakdown.daysWorked || 0} ${this.translate.instant('STAFF_MANAGEMENT.EXPORT.DAYS')}` },
                { text: `\n${this.translate.instant('STAFF_MANAGEMENT.EXPORT.START_DATE')}: `, bold: true },
                { text: startDateText },
                { text: `\n\n${this.translate.instant('STAFF_MANAGEMENT.EXPORT.ALLOWANCES')}:`, bold: true, fontSize: 12 },
                ...allowanceItems.map(item => ({ text: `\n${item}`, fontSize: 10 })),
                { text: `\n\n${this.translate.instant('STAFF_MANAGEMENT.EXPORT.PENALTY')}: `, bold: true, fontSize: 12 },
                { text: breakdown.penalty > 0 ? `${this.formatCurrencyK(breakdown.penalty)}` : '0', fontSize: 12, color: 'red' },
                { text: `\n\n${this.translate.instant('STAFF_MANAGEMENT.EXPORT.ADVANCE_PAYMENT')}: `, bold: true, fontSize: 12 },
                { text: advancePayment > 0 ? `${this.formatCurrencyK(advancePayment)}` : '0', fontSize: 12, color: 'red' },
                { text: `\n\n${this.translate.instant('STAFF_MANAGEMENT.EXPORT.NET_SALARY')}: `, bold: true, fontSize: 14 },
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
              text: this.translate.instant('STAFF_MANAGEMENT.EXPORT.PREPARED_BY'),
              fontSize: 10,
              bold: true,
              margin: [0, 30, 0, 0]
            },
            {
              width: '*',
              text: this.translate.instant('STAFF_MANAGEMENT.EXPORT.DIRECTOR'),
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
      this.message.error(this.translate.instant('STAFF_MANAGEMENT.EXPORT.PDF_LIBRARY_ERROR'));
    }
  }

  // Xuất Excel phiếu tính lương
  exportSalaryExcel(): void {
    if (!this.salaryCalculationResult || !this.selectedStaffForSalary) {
      this.message.warning(this.translate.instant('STAFF_MANAGEMENT.CALCULATE_SALARY_BEFORE_EXCEL'));
      return;
    }

    const breakdown = this.salaryCalculationResult.breakdown;
    const staff = this.selectedStaffForSalary;
    const staffName = this.getFullName(staff);
    const period = this.getSalaryPeriod();
    const businessName = this.businessInfo?.name || this.translate.instant('STAFF_MANAGEMENT.DEFAULT_HOTEL');

    // Lấy ngày bắt đầu làm việc
    const startDate = breakdown.startDate || staff.employmentInfo?.startDate;
    const startDateText = startDate ? this.formatDate(startDate) : 'N/A';

    // Lấy chức vụ
    const position = staff.employmentInfo?.position || '';
    const positionLabel = this.getPositionLabel(position);

    // Tạo dữ liệu Excel
    const data: any[] = [
      [businessName.toUpperCase()],
      [`${this.translate.instant('STAFF_MANAGEMENT.EXPORT.SALARY_SLIP')} ${period}`],
      [],
      [this.translate.instant('STAFF_MANAGEMENT.EXPORT.FULL_NAME') + ':', staffName.toUpperCase()],
      [this.translate.instant('STAFF_MANAGEMENT.POSITION') + ':', positionLabel.toUpperCase()],
      [this.translate.instant('STAFF_MANAGEMENT.EXPORT.BASE_SALARY') + ':', breakdown.baseSalary ? this.formatCurrency(breakdown.baseSalary) : 'N/A'],
      [this.translate.instant('STAFF_MANAGEMENT.EXPORT.WORKING_DAYS') + ':', `${breakdown.daysWorked || 0} ${this.translate.instant('STAFF_MANAGEMENT.EXPORT.DAYS')}`],
      [this.translate.instant('STAFF_MANAGEMENT.EXPORT.START_DATE') + ':', startDateText],
      [],
      [this.translate.instant('STAFF_MANAGEMENT.EXPORT.ALLOWANCES') + ':'],
      [this.translate.instant('STAFF_MANAGEMENT.EXPORT.ALLOWANCE') + ':', breakdown.allowance ? this.formatCurrency(breakdown.allowance) : '0'],
      [this.translate.instant('STAFF_MANAGEMENT.EXPORT.BONUS') + ':', breakdown.bonus ? this.formatCurrency(breakdown.bonus) : '0'],
      [],
      [this.translate.instant('STAFF_MANAGEMENT.EXPORT.DEDUCTIONS') + ':'],
      [this.translate.instant('STAFF_MANAGEMENT.EXPORT.INSURANCE') + ':', breakdown.insurance ? this.formatCurrency(breakdown.insurance) : '0'],
      [this.translate.instant('STAFF_MANAGEMENT.EXPORT.PENALTY') + ':', breakdown.penalty ? this.formatCurrency(breakdown.penalty) : '0'],
      [],
      [this.translate.instant('STAFF_MANAGEMENT.EXPORT.ADVANCE_PAYMENT') + ':', breakdown.advancePayment ? this.formatCurrency(breakdown.advancePayment) : '0'],
      [],
      [this.translate.instant('STAFF_MANAGEMENT.EXPORT.NET_SALARY') + ':', breakdown.netSalary ? this.formatCurrency(breakdown.netSalary) : '0'],
      [],
      [this.translate.instant('STAFF_MANAGEMENT.EXPORT.BASE_DATE') + ':', this.formatDate(breakdown.baseDate)],
      [this.translate.instant('STAFF_MANAGEMENT.EXPORT.CALCULATION_DATE') + ':', this.formatDate(breakdown.calculationDate)]
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
    XLSX.utils.book_append_sheet(wb, ws, this.translate.instant('STAFF_MANAGEMENT.EXPORT.SALARY_SLIP'));
    
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
      this.message.warning(this.translate.instant('STAFF_MANAGEMENT.EXPORT.NO_DATA'));
      return;
    }

    const staff = this.selectedStaffForPayrollHistory;
    const staffName = this.getFullName(staff);
    const businessName = this.businessInfo?.name || this.translate.instant('STAFF_MANAGEMENT.DEFAULT_HOTEL');
    
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
      [`${this.translate.instant('STAFF_MANAGEMENT.EXPORT.PAYROLL_HISTORY')} - ${staffName.toUpperCase()}`],
      [`${this.translate.instant('STAFF_MANAGEMENT.POSITION')}: ${this.getPositionLabel(staff.employmentInfo?.position || '')}`],
      [this.payrollFilterType === 'month' ? `${this.translate.instant('STAFF_MANAGEMENT.EXPORT.MONTH')}: ${this.payrollFilterMonth}/${this.payrollFilterYear}` :
       this.payrollFilterType === 'quarter' ? `${this.translate.instant('STAFF_MANAGEMENT.EXPORT.QUARTER')}: ${this.payrollFilterQuarter}/${this.payrollFilterYear}` :
       `${this.translate.instant('STAFF_MANAGEMENT.EXPORT.YEAR')}: ${this.payrollFilterYear}`],
      []
    ];

    // Tạo header bảng
    const tableHeader = [
      this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.NO'),
      this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.PAYROLL_PERIOD'),
      this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.START_DATE'),
      this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.END_DATE'),
      this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.WORKING_DAYS'),
      this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.BASE_SALARY'),
      this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.ALLOWANCE'),
      this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.BONUS'),
      this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.INSURANCE'),
      this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.PENALTY'),
      this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.ADVANCE_PAYMENT'),
      this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.NET_SALARY'),
      this.translate.instant('STAFF_MANAGEMENT.PAYMENT_DATE'),
      this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.STATUS')
    ];

    // Tạo dữ liệu bảng
    const tableData = this.payrollHistory.map((payroll, index) => {
      const startDate = payroll.period?.startDate ? this.formatDate(payroll.period.startDate) : 'N/A';
      const endDate = payroll.period?.endDate ? this.formatDate(payroll.period.endDate) : 'N/A';
      const paymentDate = payroll.paymentDate ? this.formatDate(payroll.paymentDate) : 'N/A';
      const status = payroll.paymentStatus === 'paid' ? this.translate.instant('STAFF_MANAGEMENT.PAYMENT_STATUS.PAID') : this.translate.instant('STAFF_MANAGEMENT.PAYMENT_STATUS.UNPAID');
      
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
      this.translate.instant('STAFF_MANAGEMENT.EXPORT.TOTAL'),
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
    XLSX.utils.book_append_sheet(wb, ws, this.translate.instant('STAFF_MANAGEMENT.EXPORT.PAYROLL_HISTORY'));
    
    XLSX.writeFile(wb, fileName);
    
    this.message.success('Đã xuất file Excel thành công!');
  }

  // Xuất PDF lịch sử payroll
  async exportPayrollHistoryPDF(): Promise<void> {
    if (!this.selectedStaffForPayrollHistory || this.payrollHistory.length === 0) {
      this.message.warning('Không có dữ liệu để xuất PDF');
      return;
    }

    const staff = this.selectedStaffForPayrollHistory;
    const staffName = this.getFullName(staff);
    const businessName = this.businessInfo?.name || this.translate.instant('STAFF_MANAGEMENT.DEFAULT_HOTEL');
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

    // Logo (không hiển thị tên công ty với background màu xanh)
    if (this.businessLogo) {
      try {
        const logoUrl = this.getImageUrl(this.businessLogo);
        const logoBase64 = await this.convertImageUrlToBase64(logoUrl);
        if (logoBase64) {
          content.push({
            image: logoBase64,
            fit: [120, 120],
            alignment: 'left',
            margin: [0, 0, 0, 20]
          });
        }
      } catch (error) {
        console.error('Error converting logo to base64:', error);
      }
    }

    // Tiêu đề
    content.push({
      text: this.translate.instant('STAFF_MANAGEMENT.PAYROLL_HISTORY'),
      fontSize: 18,
      bold: true,
      alignment: 'center',
      margin: [0, 0, 0, 10]
    });

    // Thông tin nhân viên và filter
    content.push({
      text: [
        { text: `${this.translate.instant('STAFF_MANAGEMENT.EXPORT.STAFF')}: `, bold: true, fontSize: 11 },
        { text: staffName.toUpperCase(), fontSize: 11 },
        { text: `\n${this.translate.instant('STAFF_MANAGEMENT.POSITION')}: `, bold: true, fontSize: 11 },
        { text: positionLabel, fontSize: 11 },
        { text: `\n${this.translate.instant('STAFF_MANAGEMENT.EXPORT.PERIOD')}: `, bold: true, fontSize: 11 },
        { text: filterTitle, fontSize: 11 }
      ],
      margin: [0, 0, 0, 20]
    });

    // Tạo header bảng - cấu trúc mới với các khoản mục lương thành hàng
    const tableHeader = [
      { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.NO'), style: 'tableHeader', alignment: 'center' },
      { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.PAYROLL_PERIOD'), style: 'tableHeader' },
      { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.START_DATE'), style: 'tableHeader', alignment: 'center' },
      { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.END_DATE'), style: 'tableHeader', alignment: 'center' },
      { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.WORKING_DAYS'), style: 'tableHeader', alignment: 'center' },
      { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.ITEM'), style: 'tableHeader' },
      { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.AMOUNT'), style: 'tableHeader', alignment: 'right' },
      { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.NET_SALARY'), style: 'tableHeader', alignment: 'right' },
      { text: this.translate.instant('STAFF_MANAGEMENT.PAYMENT_DATE'), style: 'tableHeader', alignment: 'center' },
      { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.STATUS'), style: 'tableHeader', alignment: 'center' }
    ];

    // Tạo body bảng - mỗi kỳ lương có nhiều hàng cho các khoản mục
    const tableBody: any[] = [];
    this.payrollHistory.forEach((payroll: any, index: number) => {
      const startDate = payroll.period?.startDate ? this.formatDate(payroll.period.startDate) : 'N/A';
      const endDate = payroll.period?.endDate ? this.formatDate(payroll.period.endDate) : 'N/A';
      const paymentDate = payroll.paymentDate ? this.formatDate(payroll.paymentDate) : 'N/A';
      const status = payroll.paymentStatus === 'paid' ? this.translate.instant('STAFF_MANAGEMENT.PAYMENT_STATUS.PAID') : this.translate.instant('STAFF_MANAGEMENT.PAYMENT_STATUS.UNPAID');
      const daysWorked = `${payroll.daysWorked || 0} ${this.translate.instant('STAFF_MANAGEMENT.DAYS')}`;
      const netSalary = this.formatCurrency(payroll.netSalary || 0);

      // Các khoản mục lương
      const salaryItems = [
        { label: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.BASE_SALARY'), amount: payroll.baseSalary || 0 },
        { label: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.ALLOWANCE'), amount: payroll.allowance || 0 },
        { label: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.BONUS'), amount: payroll.bonus || 0 },
        { label: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.INSURANCE'), amount: payroll.insurance || 0 },
        { label: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.PENALTY'), amount: payroll.penalty || 0 },
        { label: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.ADVANCE_PAYMENT'), amount: payroll.advancePayment || 0 }
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
        isFirstRow ? { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT.TOTAL'), colSpan: 5, bold: true, fontSize: 9 } : '',
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
        { text: `${this.translate.instant('STAFF_MANAGEMENT.EXPORT.THANK_YOU')}\n`, alignment: 'center', fontSize: 10 },
        { text: `${this.translate.instant('STAFF_MANAGEMENT.EXPORT.PRINT_DATE')}: ${printDate}`, alignment: 'center', fontSize: 9, italics: true }
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
      this.message.error(this.translate.instant('STAFF_MANAGEMENT.EXPORT.PDF_LIBRARY_ERROR'));
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
            this.message.warning(this.translate.instant('STAFF_MANAGEMENT.EXPORT.NO_PAYROLL_DATA'));
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
          this.message.error(this.translate.instant('STAFF_MANAGEMENT.EXPORT.LOAD_PAYROLL_ERROR'));
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
      const status = payroll.paymentStatus === 'paid' ? this.translate.instant('STAFF_MANAGEMENT.PAYMENT_STATUS.PAID') : this.translate.instant('STAFF_MANAGEMENT.PAYMENT_STATUS.UNPAID');

      data.push({
        'STT': index + 1,
        [this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.STAFF')]: payroll.staffName,
        [this.translate.instant('STAFF_MANAGEMENT.POSITION')]: payroll.staffPosition,
        [this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.PAYROLL_PERIOD')]: `${startDate} - ${endDate}`,
        [this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.START_DATE')]: startDate,
        [this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.END_DATE')]: endDate,
        [this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.WORKING_DAYS')]: payroll.daysWorked || 0,
        [this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.BASE_SALARY')]: payroll.baseSalary || 0,
        [this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.ALLOWANCE')]: payroll.allowance || 0,
        [this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.BONUS')]: payroll.bonus || 0,
        [this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.INSURANCE')]: payroll.insurance || 0,
        [this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.PENALTY')]: payroll.penalty || 0,
        [this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.ADVANCE_PAYMENT')]: payroll.advancePayment || 0,
        [this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.NET_SALARY')]: payroll.netSalary || 0,
        [this.translate.instant('STAFF_MANAGEMENT.PAYMENT_DATE')]: paymentDate,
        [this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.STATUS')]: status
      });
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, this.translate.instant('STAFF_MANAGEMENT.PAYMENT_SUMMARY'));

    let fileName = '';
    if (this.exportSummaryFilterType === 'month') {
      fileName = `Tong_Hop_Thanh_Toan_Thang_${this.exportSummaryFilterMonth}_${this.exportSummaryFilterYear}.xlsx`;
    } else if (this.exportSummaryFilterType === 'quarter') {
      fileName = `Tong_Hop_Thanh_Toan_Quy_${this.exportSummaryFilterQuarter}_${this.exportSummaryFilterYear}.xlsx`;
    } else {
      fileName = `Tong_Hop_Thanh_Toan_Nam_${this.exportSummaryFilterYear}.xlsx`;
    }

    XLSX.writeFile(wb, fileName);
    this.message.success(this.translate.instant('STAFF_MANAGEMENT.EXPORT.EXCEL_SUCCESS'));
    this.closeExportSummaryModal();
  }

  exportSummaryPDF(): void {
    if (this.allStaffPayrollSummary.length === 0) {
      this.message.warning('Không có dữ liệu để xuất');
      return;
    }

    if (!window.pdfMake) {
      this.message.error(this.translate.instant('STAFF_MANAGEMENT.EXPORT.PDF_LIBRARY_ERROR'));
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
      filterTitle = `${this.translate.instant('STAFF_MANAGEMENT.EXPORT.MONTH')} ${this.exportSummaryFilterMonth}/${this.exportSummaryFilterYear}`;
    } else if (this.exportSummaryFilterType === 'quarter') {
      filterTitle = `${this.translate.instant('STAFF_MANAGEMENT.EXPORT.QUARTER')} ${this.exportSummaryFilterQuarter}/${this.exportSummaryFilterYear}`;
    } else {
      filterTitle = `${this.translate.instant('STAFF_MANAGEMENT.EXPORT.YEAR')} ${this.exportSummaryFilterYear}`;
    }

    content.push({
      text: [
        { text: `${this.translate.instant('STAFF_MANAGEMENT.EXPORT.PAYMENT_SUMMARY_TITLE')}\n`, fontSize: 16, bold: true, alignment: 'center' },
        { text: `${this.translate.instant('STAFF_MANAGEMENT.EXPORT.PERIOD')}: ${filterTitle}\n`, fontSize: 12, alignment: 'center' },
        { text: `${this.translate.instant('STAFF_MANAGEMENT.EXPORT.TOTAL_STAFF')}: ${this.allStaffPayrollSummary.length}\n\n`, fontSize: 11, alignment: 'center' }
      ],
      margin: [0, 0, 0, 20]
    });

    // Header bảng
    const tableHeader = [
      { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.NO'), style: 'tableHeader', alignment: 'center' },
      { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.STAFF'), style: 'tableHeader' },
      { text: this.translate.instant('STAFF_MANAGEMENT.POSITION'), style: 'tableHeader' },
      { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.PAYROLL_PERIOD'), style: 'tableHeader' },
      { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.WORKING_DAYS'), style: 'tableHeader', alignment: 'center' },
      { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.ITEM'), style: 'tableHeader' },
      { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.AMOUNT'), style: 'tableHeader', alignment: 'right' },
      { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.NET_SALARY'), style: 'tableHeader', alignment: 'right' },
      { text: this.translate.instant('STAFF_MANAGEMENT.PAYMENT_DATE'), style: 'tableHeader', alignment: 'center' },
      { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.STATUS'), style: 'tableHeader', alignment: 'center' }
    ];

    // Body bảng - nhóm theo nhân viên
    const tableBody: any[] = [];
    let currentStaffId = '';
    let staffIndex = 0;

    this.allStaffPayrollSummary.forEach((payroll: any) => {
      const startDate = payroll.period?.startDate ? this.formatDate(payroll.period.startDate) : 'N/A';
      const endDate = payroll.period?.endDate ? this.formatDate(payroll.period.endDate) : 'N/A';
      const paymentDate = payroll.paymentDate ? this.formatDate(payroll.paymentDate) : 'N/A';
      const status = payroll.paymentStatus === 'paid' ? this.translate.instant('STAFF_MANAGEMENT.PAYMENT_STATUS.PAID') : this.translate.instant('STAFF_MANAGEMENT.PAYMENT_STATUS.UNPAID');
      const daysWorked = `${payroll.daysWorked || 0} ${this.translate.instant('STAFF_MANAGEMENT.DAYS')}`;
      const netSalary = this.formatCurrency(payroll.netSalary || 0);

      // Nếu là nhân viên mới, tăng index
      if (payroll.staffId !== currentStaffId) {
        currentStaffId = payroll.staffId;
        staffIndex++;
      }

      const salaryItems = [
        { label: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.BASE_SALARY'), amount: payroll.baseSalary || 0 },
        { label: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.ALLOWANCE'), amount: payroll.allowance || 0 },
        { label: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.BONUS'), amount: payroll.bonus || 0 },
        { label: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.INSURANCE'), amount: payroll.insurance || 0 },
        { label: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.PENALTY'), amount: payroll.penalty || 0 },
        { label: this.translate.instant('STAFF_MANAGEMENT.EXPORT_HEADERS.ADVANCE_PAYMENT'), amount: payroll.advancePayment || 0 }
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
        isFirstRow ? { text: this.translate.instant('STAFF_MANAGEMENT.EXPORT.TOTAL'), colSpan: 5, bold: true, fontSize: 8 } : '',
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
        { text: `${this.translate.instant('STAFF_MANAGEMENT.EXPORT.THANK_YOU')}\n`, alignment: 'center', fontSize: 10 },
        { text: `${this.translate.instant('STAFF_MANAGEMENT.EXPORT.PRINT_DATE')}: ${printDate}`, alignment: 'center', fontSize: 9, italics: true }
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

  apiBaseUrl = environment.apiUrl;

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

  /**
   * Convert image URL to base64 for pdfMake
   */
  async convertImageUrlToBase64(imageUrl: string): Promise<string | null> {
    if (!imageUrl) return null;
    
    try {
      // Fetch image as blob
      const blob = await this.http.get(imageUrl, { responseType: 'blob' }).toPromise();
      if (!blob) return null;
      
      // Convert blob to base64
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          resolve(base64data);
        };
        reader.onerror = () => {
          console.error('Error reading blob');
          resolve(null);
        };
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting image to base64:', error);
      return null;
    }
  }

  handleLogoError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.src = '';
      img.style.display = 'none';
    }
  }
}
