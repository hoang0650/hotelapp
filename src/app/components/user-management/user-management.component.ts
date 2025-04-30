import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { UserService, UserResponse } from '../../services/user.service';
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
      blocked: [false]
    });
  }

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.isLoading = true;
    const roles = ['admin', 'business', 'hotel', 'staff', 'customer'];
    
    Promise.all(roles.map(role => 
      this.userService.getUsersByRole(role).toPromise()
        .then((users: UserResponse[] | undefined) => {
          if (!users) return [];
          return users.map(user => ({
            ...user,
            _id: user.userId,
            businessId: user.businessId,
            hotelId: user.hotelId,
            permissions: user.permissions,
            lastLogin: user.loginHistory && user.loginHistory.length > 0 
              ? user.loginHistory[user.loginHistory.length - 1].loginDate 
              : undefined
          }));
        })
    )).then(results => {
      this.users = results.flat();
      this.total = this.users.length;
      this.isLoading = false;
    }).catch(error => {
      this.message.error('Có lỗi khi tải danh sách người dùng');
      this.isLoading = false;
    });
  }

  showEditModal(user: User): void {
    this.editingUser = user;
    this.userForm.patchValue({
      username: user.username,
      email: user.email,
      role: user.role,
      blocked: user.blocked
    });
    this.isVisible = true;
  }

  handleCancel(): void {
    this.isVisible = false;
    this.editingUser = null;
    this.userForm.reset();
  }

  handleOk(): void {
    if (this.userForm.valid && this.editingUser) {
      this.isLoading = true;
      const updatedUser: Partial<User> = {
        ...this.editingUser,
        ...this.userForm.value
      };

      this.userService.updateUser(this.editingUser._id, updatedUser).subscribe(
        (response: UserResponse) => {
          const updatedUserData: User = {
            ...response,
            _id: response.userId,
            businessId: response.businessId,
            hotelId: response.hotelId,
            permissions: response.permissions,
            lastLogin: this.editingUser?.lastLogin
          };
          
          const index = this.users.findIndex(u => u._id === this.editingUser?._id);
          if (index !== -1) {
            this.users[index] = updatedUserData;
          }
          this.message.success('Cập nhật người dùng thành công');
          this.isVisible = false;
          this.editingUser = null;
          this.userForm.reset();
          this.isLoading = false;
        },
        (error) => {
          console.error('Error updating user:', error);
          this.message.error('Không thể cập nhật người dùng');
          this.isLoading = false;
        }
      );
    }
  }

  deleteUser(user: User): void {
    this.modal.confirm({
      nzTitle: 'Xác nhận xóa',
      nzContent: `Bạn có chắc chắn muốn xóa người dùng ${user.username}?`,
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.isLoading = true;
        this.userService.deleteUser({ _id: user._id }).subscribe(
          () => {
            this.users = this.users.filter(u => u._id !== user._id);
            this.message.success('Xóa người dùng thành công');
            this.isLoading = false;
          },
          (error) => {
            console.error('Error deleting user:', error);
            this.message.error('Không thể xóa người dùng');
            this.isLoading = false;
          }
        );
      }
    });
  }

  toggleUserBlock(user: User): void {
    this.isLoading = true;
    this.userService.toggleUserBlock(user._id, !user.blocked).subscribe(
      (response: UserResponse) => {
        const updatedUserData: User = {
          ...response,
          _id: response.userId,
          businessId: response.businessId,
          hotelId: response.hotelId,
          permissions: response.permissions,
          lastLogin: user.lastLogin
        };
        
        const index = this.users.findIndex(u => u._id === user._id);
        if (index !== -1) {
          this.users[index] = updatedUserData;
        }
        this.message.success(`Đã ${updatedUserData.blocked ? 'khóa' : 'mở khóa'} người dùng thành công`);
        this.isLoading = false;
      },
      (error) => {
        console.error('Error toggling user block:', error);
        this.message.error('Không thể thay đổi trạng thái khóa người dùng');
        this.isLoading = false;
      }
    );
  }

  onPageIndexChange(index: number): void {
    this.pageIndex = index;
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
  }
} 