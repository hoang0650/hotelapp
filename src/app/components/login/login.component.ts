import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { UserService, LoginRequest } from '../../services/user.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  loginForm!: FormGroup;
  isLoading = false;
  showTwoFactorInput = false;
  userId: string | null = null;
  passwordVisible = false;
  suffixTemplate: any;
  Validators = Validators;

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private router: Router,
    private message: NzMessageService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    if (this.userService.isLoggedIn) {
      this.router.navigate(['/admin/room']);
    }
  }

  private initForm(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
      twoFactorCode: ['']
    });
  }

  submitForm(): void {
    if (this.loginForm.invalid) {
      Object.values(this.loginForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsTouched();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      return;
    }

    this.isLoading = true;
    const loginData: LoginRequest = {
      email: this.loginForm.get('email')?.value,
      password: this.loginForm.get('password')?.value
    };

    if (this.showTwoFactorInput) {
      loginData.twoFactorCode = this.loginForm.get('twoFactorCode')?.value;
    }

    this.userService.login(loginData).subscribe({
      next: (response) => {
        if (response.requireTwoFactor) {
          this.showTwoFactorInput = true;
          this.userId = response.userId || null;
          this.message.info('Vui lòng nhập mã xác thực hai yếu tố');
        } else {
          this.message.success('Đăng nhập thành công!');
          window.location.href = '/admin/room';
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.message.error(error.error?.message || 'Đăng nhập thất bại');
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }
}
