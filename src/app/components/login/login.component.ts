import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  isLoading = false;
  passwordVisible = false;
  Validators = Validators; // Expose to template

  // Add suffixTemplate for password visibility toggle
  suffixTemplate = '';

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private router: Router,
    private message: NzMessageService
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      twoFactorCode: [''],
      remember: [false]
    });
  }

  ngOnInit(): void {
    if (this.userService.isLoggedIn) {
      this.router.navigate(['/dashboard']);
    }
  }

  submitForm(): void {
    if (this.loginForm.valid) {
      this.isLoading = true;
      const { remember, ...loginData } = this.loginForm.value;
      
      this.userService.login(loginData).subscribe({
        next: (response) => {
          this.message.success(response.message);
          if (remember) {
            localStorage.setItem('remember_email', loginData.email);
          }
          this.router.navigate(['/dashboard']);
        },
        error: (error) => {
          if (error.error?.requireTwoFactor) {
            this.message.info('Vui lòng nhập mã xác thực hai yếu tố');
            this.loginForm.get('twoFactorCode')?.setValidators([Validators.required]);
            this.loginForm.get('twoFactorCode')?.updateValueAndValidity();
          } else {
            this.message.error(error.error?.message || 'Đăng nhập thất bại');
          }
        },
        complete: () => {
          this.isLoading = false;
        }
      });
    } else {
      Object.values(this.loginForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsTouched();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
    }
  }
}
