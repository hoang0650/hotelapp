import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { UserService, LoginRequest } from '../../services/user.service';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';

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
    private message: NzMessageService,
    private translate: TranslateService,
    private authService: AuthService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    // 1. Kiểm tra nếu đã đăng nhập rồi thì redirect
    if (this.authService.isLoggedIn()) {
      this.executeFastRedirect();
      return;
    }

    // 2. TỰ ĐỘNG ĐIỀN nếu người dùng đã chọn Remember Me trước đó
    const saved = this.authService.getSavedCredentials();
    if (saved) {
      this.loginForm.patchValue({
        emailOrUsername: saved.username,
        password: saved.password,
        remember: true
      });
    }
  }

  private initForm(): void {
    this.loginForm = this.fb.group({
      emailOrUsername: ['', [Validators.required]],
      password: ['', [Validators.required]],
      twoFactorCode: [''],
      remember: [false]
    });
  }

  /**
   * Hard Redirect lập tức đến trang quản lý phòng
   */
  private executeFastRedirect(): void {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname || '';
      if (hostname.startsWith('admin.') || hostname === 'localhost' || hostname === '127.0.0.1') {
        this.router.navigateByUrl('/admin/room');
        return;
      }
      window.location.href = 'https://admin.phhotel.vn/admin/room';
    }
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
    const emailOrUsername = this.loginForm.get('emailOrUsername')?.value;
    const password = this.loginForm.get('password')?.value;
    const remember = this.loginForm.get('remember')?.value;

    const isEmail = emailOrUsername.includes('@');

    const loginData: LoginRequest = {
      password: password,
      remember: remember === true
    };

    if (isEmail) {
      loginData.email = emailOrUsername;
    } else {
      loginData.username = emailOrUsername;
    }

    if (this.showTwoFactorInput) {
      loginData.twoFactorCode = this.loginForm.get('twoFactorCode')?.value;
    }

    if (remember) {
      this.authService.saveCredentials(emailOrUsername, password);
    } else {
      this.authService.clearCredentials();
    }


    this.userService.login(loginData).subscribe({
      next: (response) => {
        if (response.requireTwoFactor) {
          this.showTwoFactorInput = true;
          this.userId = response.userId || null;
          this.message.info(this.translate.instant('LOGIN.ENTER_TWO_FACTOR'));
          this.isLoading = false;
        } else {
          this.message.success(this.translate.instant('COMMON.SUCCESS'));
          if (response.token && response.user) {
            this.authService.loginFromShiftHandover(response.token, response.user);
            this.authService.authResolved.next(true);
          }
          this.executeFastRedirect();
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.message.error(error.error?.message || this.translate.instant('COMMON.ERROR_OCCURRED'));
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }
}
