import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzModalRef } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { UserService, UserResponse } from '../../../services/user.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-user-form-modal',
  template: `
    <form nz-form [formGroup]="userForm" (ngSubmit)="submitForm()">
      <nz-form-item>
        <nz-form-label [nzSm]="6" [nzXs]="24" nzRequired>Tên đăng nhập</nz-form-label>
        <nz-form-control [nzSm]="14" [nzXs]="24" [nzErrorTip]="usernameTpl">
          <input nz-input formControlName="username" placeholder="Nhập tên đăng nhập" />
          <ng-template #usernameTpl let-control>
            <ng-container *ngIf="control.hasError('required')">
              Vui lòng nhập tên đăng nhập!
            </ng-container>
          </ng-template>
        </nz-form-control>
      </nz-form-item>

      <nz-form-item>
        <nz-form-label [nzSm]="6" [nzXs]="24" nzRequired>Email</nz-form-label>
        <nz-form-control [nzSm]="14" [nzXs]="24" [nzErrorTip]="emailTpl">
          <input nz-input formControlName="email" placeholder="Nhập email" />
          <ng-template #emailTpl let-control>
            <ng-container *ngIf="control.hasError('required')">
              Vui lòng nhập email!
            </ng-container>
            <ng-container *ngIf="control.hasError('email')">
              Email không hợp lệ!
            </ng-container>
          </ng-template>
        </nz-form-control>
      </nz-form-item>

      <nz-form-item *ngIf="!isEdit">
        <nz-form-label [nzSm]="6" [nzXs]="24" nzRequired>Mật khẩu</nz-form-label>
        <nz-form-control [nzSm]="14" [nzXs]="24" [nzErrorTip]="passwordTpl">
          <nz-input-group [nzSuffix]="suffixTemplate">
            <input
              [type]="passwordVisible ? 'text' : 'password'"
              nz-input
              formControlName="password"
              placeholder="Nhập mật khẩu"
            />
          </nz-input-group>
          <ng-template #suffixTemplate>
            <i
              nz-icon
              [nzType]="passwordVisible ? 'eye-invisible' : 'eye'"
              (click)="passwordVisible = !passwordVisible"
            ></i>
          </ng-template>
          <ng-template #passwordTpl let-control>
            <ng-container *ngIf="control.hasError('required')">
              Vui lòng nhập mật khẩu!
            </ng-container>
            <ng-container *ngIf="control.hasError('minlength')">
              Mật khẩu phải có ít nhất 6 ký tự!
            </ng-container>
          </ng-template>
        </nz-form-control>
      </nz-form-item>

      <nz-form-item>
        <nz-form-label [nzSm]="6" [nzXs]="24" nzRequired>Vai trò</nz-form-label>
        <nz-form-control [nzSm]="14" [nzXs]="24" [nzErrorTip]="'Vui lòng chọn vai trò!'">
          <nz-select formControlName="role" nzPlaceHolder="Chọn vai trò">
            <nz-option nzValue="admin" nzLabel="Admin"></nz-option>
            <nz-option nzValue="business" nzLabel="Business"></nz-option>
            <nz-option nzValue="hotel" nzLabel="Hotel"></nz-option>
            <nz-option nzValue="staff" nzLabel="Staff"></nz-option>
            <nz-option nzValue="customer" nzLabel="Customer"></nz-option>
          </nz-select>
        </nz-form-control>
      </nz-form-item>

      <div *nzModalFooter>
        <button nz-button nzType="default" (click)="cancel()">Hủy</button>
        <button
          nz-button
          nzType="primary"
          [nzLoading]="isSubmitting"
          [disabled]="!userForm.valid || isSubmitting"
          (click)="submitForm()"
        >
          {{ isEdit ? 'Cập nhật' : 'Thêm mới' }}
        </button>
      </div>
    </form>
  `,
  styles: [`
    [nz-form] {
      max-width: 600px;
    }
    .ant-form-item {
      margin-bottom: 16px;
    }
  `]
})
export class UserFormModalComponent implements OnInit {
  @Input() user?: UserResponse;
  @Input() isEdit = false;
  userForm!: FormGroup;
  passwordVisible = false;
  isSubmitting = false;

  constructor(
    private fb: FormBuilder,
    private modalRef: NzModalRef,
    private message: NzMessageService,
    private userService: UserService
  ) {}

  ngOnInit(): void {
    this.userForm = this.fb.group({
      username: [this.user?.username || '', [Validators.required]],
      email: [this.user?.email || '', [Validators.required, Validators.email]],
      password: [this.isEdit ? null : '', this.isEdit ? [] : [Validators.required, Validators.minLength(6)]],
      role: [this.user?.role || 'customer', [Validators.required]]
    });
  }

  submitForm(): void {
    if (this.userForm.valid) {
      this.isSubmitting = true;
      const formData = this.userForm.value;
      
      let request: Observable<UserResponse>;
      if (this.isEdit && this.user) {
        request = this.userService.updateUser(this.user.userId, formData);
      } else {
        request = this.userService.signUp(formData);
      }

      request.subscribe({
        next: (response: UserResponse) => {
          this.message.success(
            this.isEdit ? 'Cập nhật người dùng thành công!' : 'Thêm người dùng mới thành công!'
          );
          this.modalRef.close(response);
        },
        error: (err: { error?: { message?: string } }) => {
          this.message.error(err.error?.message || 'Có lỗi xảy ra, vui lòng thử lại!');
          this.isSubmitting = false;
        }
      });
    } else {
      Object.values(this.userForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsTouched();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
    }
  }

  cancel(): void {
    this.modalRef.close();
  }
} 