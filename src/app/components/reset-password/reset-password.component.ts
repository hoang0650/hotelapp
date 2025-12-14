import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.css']
})
export class ResetPasswordComponent implements OnInit {
  resetPasswordForm!: FormGroup;
  isLoading = false;
  token: string | null = null;
  passwordVisible = false;
  confirmPasswordVisible = false;

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private router: Router,
    private route: ActivatedRoute,
    private message: NzMessageService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    // Lấy token từ URL params
    this.token = this.route.snapshot.paramMap.get('token');
    
    if (!this.token) {
      this.message.error('Token không hợp lệ. Vui lòng yêu cầu đặt lại mật khẩu mới.');
      this.router.navigate(['/forgot-password']);
      return;
    }

    if (this.userService.isLoggedIn) {
      this.router.navigate(['/admin/room']);
    }
  }

  private initForm(): void {
    this.resetPasswordForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required, this.passwordMatchValidator]]
    });
  }

  // Custom validator để kiểm tra mật khẩu khớp
  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.parent?.get('password')?.value;
    const confirmPassword = control.value;
    
    if (password && confirmPassword && password !== confirmPassword) {
      return { passwordMismatch: true };
    }
    return null;
  }

  submitForm(): void {
    if (this.resetPasswordForm.invalid) {
      Object.values(this.resetPasswordForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsTouched();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      return;
    }

    if (!this.token) {
      this.message.error('Token không hợp lệ');
      return;
    }

    this.isLoading = true;
    const password = this.resetPasswordForm.get('password')?.value;

    this.userService.resetPassword({ token: this.token, password }).subscribe({
      next: (response) => {
        this.message.success(response.message || 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập với mật khẩu mới.');
        // Chuyển về trang login sau 2 giây
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 2000);
      },
      error: (error) => {
        this.isLoading = false;
        this.message.error(error.error?.message || 'Có lỗi xảy ra. Vui lòng thử lại sau.');
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}

