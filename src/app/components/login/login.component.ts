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
    if (this.authService.isLoggedIn()) {
      this.authService.checkSubdomainAndRedirect();
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('admin.')) {
          this.router.navigate(['/admin/room']);
        }
      }
      return;
    }

    // Lắng nghe trạng thái đăng nhập (để xử lý trường hợp refresh token chạy sau khi component load)
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.authService.checkSubdomainAndRedirect();
        if (typeof window !== 'undefined') {
          const hostname = window.location.hostname;
          if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('admin.')) {
            this.router.navigate(['/admin/room']);
          }
        }
      }
    });
  }

  private initForm(): void {
    this.loginForm = this.fb.group({
      emailOrUsername: ['', [Validators.required]],
      password: ['', [Validators.required]],
      twoFactorCode: [''],
      remember: [false]
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
    const emailOrUsername = this.loginForm.get('emailOrUsername')?.value;
    const password = this.loginForm.get('password')?.value;
    
    // Kiểm tra xem input có phải là email không (chứa @)
    const isEmail = emailOrUsername.includes('@');
    
    const loginData: LoginRequest = {
      password: password
    };
    
    // Gán email hoặc username tùy theo input
    if (isEmail) {
      loginData.email = emailOrUsername;
    } else {
      loginData.username = emailOrUsername;
    }

    if (this.showTwoFactorInput) {
      loginData.twoFactorCode = this.loginForm.get('twoFactorCode')?.value;
    }
    const remember = this.loginForm.get('remember')?.value === true;
    (loginData as any).remember = remember;

    this.userService.login(loginData).subscribe({
      next: (response) => {
        if (response.requireTwoFactor) {
          this.showTwoFactorInput = true;
          this.userId = response.userId || null;
          this.message.info(this.translate.instant('LOGIN.ENTER_TWO_FACTOR'));
        } else {
          this.message.success(this.translate.instant('COMMON.SUCCESS'));
          if (response.token && response.user) {
            this.authService.loginFromShiftHandover(response.token, response.user);
          }
          this.authService.checkSubdomainAndRedirect();
          if (typeof window !== 'undefined') {
            const hostname = window.location.hostname;
            if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('admin.')) {
              this.router.navigate(['/admin/room']);
            }
          }
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
