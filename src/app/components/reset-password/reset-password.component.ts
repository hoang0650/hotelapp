import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';
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
    private message: NzMessageService,
    private translate: TranslateService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    // Lấy token từ URL params
    this.token = this.route.snapshot.paramMap.get('token');
    
    if (!this.token) {
      this.message.error(this.translate.instant('RESET_PASSWORD.MESSAGES.INVALID_TOKEN_REDIRECT'));
      this.router.navigate(['/forgot-password']);
      return;
    }

    // Giữ nguyên trạng thái đăng nhập, không redirect khỏi trang công khai
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
      this.message.error(this.translate.instant('RESET_PASSWORD.MESSAGES.INVALID_TOKEN'));
      return;
    }

    this.isLoading = true;
    const password = this.resetPasswordForm.get('password')?.value;

    this.userService.resetPassword({ token: this.token, password }).subscribe({
      next: (response) => {
        this.message.success(response.message || this.translate.instant('RESET_PASSWORD.MESSAGES.SUCCESS'));
        // Chuyển về trang login sau 2 giây
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 2000);
      },
      error: (error) => {
        this.isLoading = false;
        this.message.error(error.error?.message || this.translate.instant('RESET_PASSWORD.MESSAGES.ERROR'));
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
