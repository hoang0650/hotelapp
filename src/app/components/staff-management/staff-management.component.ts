import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { StaffService } from '../../services/staff.service';
import { Staff } from '../../interfaces/staff';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'app-staff-management',
  templateUrl: './staff-management.component.html',
  styleUrls: ['./staff-management.component.css']
})
export class StaffManagementComponent implements OnInit {
  staffForm!: FormGroup;
  staffs: Staff[] = [];
  selectedStaff: Staff | null = null;
  positions = ['manager', 'receptionist', 'housekeeper', 'maintenance', 'other'];
  shifts = ['morning', 'afternoon', 'night', 'full-day'];
  permissions = ['view', 'create', 'edit', 'delete', 'manage_rooms', 'manage_bookings'];
  
  constructor(
    private fb: FormBuilder, 
    private staffService: StaffService,
    private message: NzMessageService
  ) {
    this.initForm();
  }

  // Định dạng số tiền theo VNĐ
  formatterVND = (value: number): string => `${value.toLocaleString('vi-VN')} VNĐ`;

  initForm(): void {
    this.staffForm = this.fb.group({
      hotelId: ['', Validators.required],
      name: ['', Validators.required],
      position: ['', Validators.required],
      contact: this.fb.group({
        phone: ['', Validators.required],
        email: ['', [Validators.required, Validators.email]]
      }),
      schedule: this.fb.array([
        this.createScheduleItem()
      ]),
      permissions: [['view']],
      salary: this.fb.group({
        amount: [0, Validators.required]
      })
    });
  }

  createScheduleItem(): FormGroup {
    return this.fb.group({
      date: [new Date(), Validators.required],
      shift: ['', Validators.required]
    });
  }

  get scheduleArray(): FormArray {
    return this.staffForm.get('schedule') as FormArray;
  }

  addScheduleItem(): void {
    this.scheduleArray.push(this.createScheduleItem());
  }

  removeScheduleItem(index: number): void {
    if (this.scheduleArray.length > 1) {
      this.scheduleArray.removeAt(index);
    }
  }

  ngOnInit(): void {
    this.loadStaff();
  }

  editId: string | null = null;
  isLoading = false;

  startEdit(id: string): void {
    this.editId = id;
    const staffToEdit = this.staffs.find(s => s._id === id);
    if (staffToEdit) {
      this.selectedStaff = { ...staffToEdit };
      
      // Reset schedule form array
      while (this.scheduleArray.length > 0) {
        this.scheduleArray.removeAt(0);
      }

      // Add schedule items
      if (staffToEdit.schedule && staffToEdit.schedule.length > 0) {
        staffToEdit.schedule.forEach(scheduleItem => {
          this.scheduleArray.push(this.fb.group({
            date: [scheduleItem.date, Validators.required],
            shift: [scheduleItem.shift, Validators.required]
          }));
        });
      } else {
        // Add a default empty schedule item if none exists
        this.addScheduleItem();
      }

      // Patch the rest of the form
      this.staffForm.patchValue({
        hotelId: this.selectedStaff.hotelId,
        name: this.selectedStaff.name,
        position: this.selectedStaff.position,
        contact: {
          phone: this.selectedStaff.contact.phone,
          email: this.selectedStaff.contact.email
        },
        permissions: this.selectedStaff.permissions || ['view'],
        salary: {
          amount: this.selectedStaff.salary?.amount || 0
        }
      });
    }
  }

  stopEdit(): void {
    this.editId = null;
    this.selectedStaff = null;
    this.initForm();
  }

  loadStaff(): void {
    this.isLoading = true;
    this.staffService.getStaff().subscribe(
      (data) => {
        this.staffs = data;
        this.isLoading = false;
      },
      (error) => {
        this.message.error('Không thể tải danh sách nhân viên: ' + error.message);
        this.isLoading = false;
      }
    );
  }

  createStaff(): void {
    if (this.staffForm.valid) {
      this.isLoading = true;
      const newStaff: Staff = this.staffForm.value;
      this.staffService.createStaff(newStaff).subscribe(
        (data: Staff) => {
          this.message.success('Đã tạo nhân viên thành công!');
          this.staffs.push(data);
          this.initForm();
          this.isLoading = false;
        },
        (error) => {
          this.message.error('Lỗi khi tạo nhân viên: ' + error.message);
          this.isLoading = false;
        }
      );
    } else {
      Object.values(this.staffForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity();
        }
      });
    }
  }

  updateStaff(): void {
    if (this.selectedStaff && this.staffForm.valid) {
      this.isLoading = true;
      this.staffService.updateStaff(this.selectedStaff._id!, this.staffForm.value).subscribe(
        () => {
          this.message.success('Đã cập nhật nhân viên thành công!');
          this.loadStaff();
          this.stopEdit();
          this.isLoading = false;
        },
        (error) => {
          this.message.error('Lỗi khi cập nhật nhân viên: ' + error.message);
          this.isLoading = false;
        }
      );
    }
  }

  deleteStaff(staffId: string): void {
    this.isLoading = true;
    this.staffService.deleteStaff(staffId).subscribe(
      () => {
        this.message.success('Đã xóa nhân viên thành công!');
        this.staffs = this.staffs.filter(staff => staff._id !== staffId);
        this.isLoading = false;
      },
      (error) => {
        this.message.error('Lỗi khi xóa nhân viên: ' + error.message);
        this.isLoading = false;
      }
    );
  }
}
