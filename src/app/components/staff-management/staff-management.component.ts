import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { StaffService } from '../../services/staff.service';
import { Staff, getStaffFullName, getPositionLabel, getStatusLabel, getShiftLabel } from '../../interfaces/staff';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { AuthService } from '../../services/auth.service';
import { HotelService } from '../../services/hotel.service';
import { UserService } from '../../services/user.service';
import { User } from '../../interfaces/user';
import { Subscription } from 'rxjs';

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
  
  constructor(
    private fb: FormBuilder, 
    private staffService: StaffService,
    private hotelService: HotelService,
    private userService: UserService,
    private authService: AuthService,
    private message: NzMessageService,
    private modal: NzModalService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.loadHotels();
    
    // Auto-select hotel nếu user là hotel manager
    const hotelId = this.authService.getHotelId();
    if (hotelId) {
      this.selectedHotelId = hotelId;
      this.loadStaff(); // loadUsers sẽ được gọi sau khi loadStaff xong
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
      employmentInfo: staff.employmentInfo || {},
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
}
