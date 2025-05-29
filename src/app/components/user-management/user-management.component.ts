import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { UserService } from '../../services/user.service';
import { User } from '../../interfaces/user';

@Component({
  selector: 'app-user-management',
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.css']
})
export class UserManagementComponent implements OnInit {
  users: User[] = [];
  isLoading = false;
  isModalVisible = false;
  isVisible = false;
  userForm!: FormGroup;
  selectedUser: User | null = null;
  modalTitle = '';
  editingUser: User | null = null;
  total = 0;
  pageSize = 10;
  pageIndex = 1;

  readonly userRoles = [
    { label: 'Super Admin', value: 'superadmin' },
    { label: 'Admin', value: 'admin' },
    { label: 'Business', value: 'business' },
    { label: 'Hotel', value: 'hotel' },
    { label: 'Staff', value: 'staff' },
    { label: 'Guest', value: 'guest' }
  ];

  readonly userStatuses = [
    { label: 'Hoạt động', value: 'active' },
    { label: 'Không hoạt động', value: 'inactive' },
    { label: 'Tạm khóa', value: 'suspended' },
    { label: 'Đã xóa', value: 'deleted' }
  ];

  constructor(
    private userService: UserService,
    private fb: FormBuilder,
    private message: NzMessageService,
    private modal: NzModalService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.loadUsers();
  }

  private initForm(): void {
    this.userForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      fullName: [''],
      phone: [''],
      role: ['guest', Validators.required],
      status: ['active', Validators.required],
      password: [''],
      twoFactorEnabled: [false],
      permissions: [[]],
      preferences: this.fb.group({
        language: ['en'],
        theme: ['light'],
        notifications: this.fb.group({
          email: [true],
          sms: [false],
          push: [true]
        })
      })
    });
  }

  loadUsers(role: string = 'guest'): void {
    this.isLoading = true;
    this.userService.getUsersByRole(role).subscribe({
      next: (users) => {
        this.users = users;
        this.total = users.length;
        this.isLoading = false;
      },
      error: (error) => {
        this.message.error('Không thể tải danh sách người dùng');
        this.isLoading = false;
      }
    });
  }

  onPageIndexChange(index: number): void {
    this.pageIndex = index;
    this.loadUsers();
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.loadUsers();
  }

  showEditModal(user: User): void {
    this.modalTitle = 'Chỉnh sửa người dùng';
    this.selectedUser = user;
    this.editingUser = user;
    this.isVisible = true;
    this.userForm.patchValue({
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      status: user.status,
      twoFactorEnabled: user.twoFactorEnabled,
      permissions: user.permissions,
      preferences: user.preferences || {
        language: 'en',
        theme: 'light',
        notifications: {
          email: true,
          sms: false,
          push: true
        }
      }
    });
    this.userForm.get('password')?.clearValidators();
    this.userForm.get('password')?.updateValueAndValidity();
  }

  handleOk(): void {
    if (this.userForm.invalid) {
      Object.values(this.userForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsTouched();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      return;
    }

    const userData = this.userForm.value;
    if (!userData.password) {
      delete userData.password;
    }

    this.isLoading = true;
    if (this.selectedUser) {
      this.userService.updateUser(this.selectedUser._id, userData).subscribe({
        next: (response) => {
          this.message.success('Cập nhật người dùng thành công');
          this.loadUsers(userData.role);
          this.isVisible = false;
        },
        error: (error) => {
          this.message.error(error.error?.message || 'Lỗi khi cập nhật người dùng');
        },
        complete: () => {
          this.isLoading = false;
        }
      });
    } else {
      this.userService.signUp(userData).subscribe({
        next: (response) => {
          this.message.success('Thêm người dùng mới thành công');
          this.loadUsers(userData.role);
          this.isVisible = false;
        },
        error: (error) => {
          this.message.error(error.error?.message || 'Lỗi khi thêm người dùng');
        },
        complete: () => {
          this.isLoading = false;
        }
      });
    }
  }

  handleCancel(): void {
    this.isVisible = false;
    this.selectedUser = null;
    this.userForm.reset();
  }

  deleteUser(user: User): void {
    this.modal.confirm({
      nzTitle: 'Xác nhận xóa người dùng',
      nzContent: `Bạn có chắc chắn muốn xóa người dùng ${user.username}?`,
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => this.updateUserDisplayStatus(user, 'deleted'),
      nzCancelText: 'Hủy'
    });
  }

  updateUserDisplayStatus(user: User, status: User['status']): void {
    this.isLoading = true;
    this.userService.updateUserStatus(user._id, status).subscribe({
      next: (response) => {
        this.message.success(response.message);
        this.loadUsers(user.role);
      },
      error: (error) => {
        this.message.error(error.error?.message || 'Lỗi khi thay đổi trạng thái người dùng');
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'active': return 'success';
      case 'inactive': return 'default';
      case 'suspended': return 'warning';
      case 'deleted': return 'error';
      default: return '';
    }
  }

  formatDate(date: string | Date): string {
    return new Date(date).toLocaleString();
  }
} 