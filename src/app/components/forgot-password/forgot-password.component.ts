import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.css']
})
export class ForgotPasswordComponent implements OnInit {
  forgotPasswordForm!: FormGroup;
  isLoading = false;

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private router: Router,
    private message: NzMessageService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    // Giữ nguyên trạng thái đăng nhập, không redirect khỏi trang công khai
  }

  private initForm(): void {
    this.forgotPasswordForm = this.fb.group({
      emailOrUsername: ['', [Validators.required]]
    });
  }

  submitForm(): void {
    if (this.forgotPasswordForm.invalid) {
      Object.values(this.forgotPasswordForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsTouched();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      return;
    }

    this.isLoading = true;
    const emailOrUsername = this.forgotPasswordForm.get('emailOrUsername')?.value;
    
    // Kiểm tra xem input có phải là email không (chứa @)
    const isEmail = emailOrUsername.includes('@');
    
    const requestData: any = {};
    if (isEmail) {
      requestData.email = emailOrUsername;
    } else {
      requestData.username = emailOrUsername;
    }
    
    // Không gửi emailFrom; hệ thống sẽ dùng email cấu hình sẵn

    this.userService.forgotPassword(requestData).subscribe({
      next: (response) => {
        this.message.success(response.message || 'Chúng tôi đã gửi link đặt lại mật khẩu đến email của bạn. Vui lòng kiểm tra hộp thư.');
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

