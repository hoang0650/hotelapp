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
  userForm: FormGroup;
  isLoading = false;
  editingUser: User | null = null;
  isVisible = false;
  selectedUser: User | null = null;
  
  // Phân trang
  pageSize = 10;
  pageIndex = 1;
  total = 0;

  constructor(
    private userService: UserService,
    private fb: FormBuilder,
    private message: NzMessageService,
    private modal: NzModalService
  ) {
    this.userForm = this.fb.group({
      username: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      role: ['', [Validators.required]],
      status: ['active']
    });
  }

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.isLoading = true;
    this.userService.getUsersByRole('guest').subscribe({
      next: (users) => {
        this.users = users;
        this.total = users.length;
      },
      error: (error: any) => {
        this.message.error(error.message || 'Lỗi khi tải danh sách người dùng');
        this.isLoading = false;
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  showEditModal(user: User): void {
    this.editingUser = user;
    this.selectedUser = user;
    this.userForm.patchValue({
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status
    });
    this.isVisible = true;
  }

  handleCancel(): void {
    this.isVisible = false;
    this.editingUser = null;
    this.selectedUser = null;
    this.userForm.reset({ status: 'active' });
  }

  handleOk(): void {
    if (this.userForm.valid && this.editingUser) {
      this.isLoading = true;
      const formValue = this.userForm.value;
      const updatedUser: Partial<User> = {
        username: formValue.username,
        email: formValue.email,
        role: formValue.role,
      };

      this.userService.updateUser(this.editingUser._id, updatedUser).subscribe({
        next: (responseUser) => {
          const index = this.users.findIndex(u => u._id === this.editingUser?._id);
          if (index !== -1) {
            this.users[index] = responseUser;
            this.users = [...this.users];
          }
          this.message.success('Cập nhật người dùng thành công');
          this.isVisible = false;
          this.handleCancel();
        },
        error: (error: any) => {
          console.error('Error updating user:', error);
          this.message.error(error.error?.message || error.message || 'Không thể cập nhật người dùng');
          this.isLoading = false;
        },
        complete: () => {
          this.isLoading = false;
        }
      });
    } else {
      Object.values(this.userForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
    }
  }

  deleteUser(user: User): void {
    this.modal.confirm({
      nzTitle: 'Xác nhận xóa',
      nzContent: `Bạn có chắc chắn muốn xóa người dùng ${user.username}? Hành động này sẽ đặt trạng thái người dùng thành 'deleted'.`,
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.isLoading = true;
        this.userService.updateUserStatus(user._id, 'deleted').subscribe({
          next: (response) => {
            const index = this.users.findIndex(u => u._id === user._id);
            if (index !== -1) {
                this.users.splice(index, 1);
                this.total = this.users.length;
                this.users = [...this.users];
            }
            this.message.success(response.message || 'Xóa người dùng thành công');
          },
          error: (error: any) => {
            console.error('Error deleting user:', error);
            this.message.error(error.error?.message || error.message || 'Không thể xóa người dùng');
            this.isLoading = false;
          },
          complete: () => {
            this.isLoading = false;
          }
        });
      }
    });
  }

  updateUserDisplayStatus(user: User, status: 'active' | 'inactive' | 'suspended'): void {
    if (!user._id) return;

    this.userService.updateUserStatus(user._id, status).subscribe({
      next: (response) => {
        const index = this.users.findIndex(u => u._id === user._id);
        if (index !== -1) {
          this.users[index] = response.user;
          this.users = [...this.users];
        }
        this.message.success(response.message);
      },
      error: (error: any) => {
        this.message.error(error.error?.message || error.message || 'Lỗi khi cập nhật trạng thái người dùng');
      }
    });
  }

  onPageIndexChange(index: number): void {
    this.pageIndex = index;
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
  }
} 