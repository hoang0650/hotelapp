import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { UserService, SignUpRequest, BusinessSignUpRequest, BusinessInfo } from '../../services/user.service';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.css']
})
export class SignupComponent implements OnInit {
  signupForm!: FormGroup;
  businessForm!: FormGroup;
  isLoading = false;
  passwordVisible = false;
  confirmPasswordVisible = false;
  businessPasswordVisible = false;
  businessConfirmPasswordVisible = false;
  currentTab = 0; // 0: normal signup, 1: business signup

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private router: Router,
    private message: NzMessageService
  ) {
    this.initForms();
  }

  ngOnInit(): void {}

  private initForms(): void {
    // Form đăng ký thường
    this.signupForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
      fullName: [''],
      phone: [''],
      acceptTerms: [false, [Validators.requiredTrue]]
    }, {
      validators: this.passwordMatchValidator
    });

    // Form đăng ký doanh nghiệp
    this.businessForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
      fullName: ['', [Validators.required]],
      phone: ['', [Validators.required]],
      acceptTerms: [false, [Validators.requiredTrue]],
      businessInfo: this.fb.group({
        name: ['', [Validators.required]],
        legalName: ['', [Validators.required]],
        taxId: ['', [Validators.required]],
        address: ['', [Validators.required]],
        contactInfo: this.fb.group({
          email: [''],
          phone: [''],
          website: ['']
        })
      })
    }, {
      validators: this.passwordMatchValidator
    });
  }

  private passwordMatchValidator(g: FormGroup) {
    return g.get('password')?.value === g.get('confirmPassword')?.value
      ? null
      : { mismatch: true };
  }

  onTabChange(index: number): void {
    this.currentTab = index;
  }

  submitNormalSignup(): void {
    if (this.signupForm.invalid) {
      Object.values(this.signupForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsTouched();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      return;
    }

    this.isLoading = true;
    const formData = this.signupForm.value;
    const userData: SignUpRequest = {
      username: formData.username,
      email: formData.email,
      password: formData.password,
      fullName: formData.fullName,
      phone: formData.phone
    };

    this.userService.signUp(userData).subscribe({
      next: () => {
        this.message.success('Đăng ký tài khoản thành công!');
        this.router.navigate(['/login']);
      },
      error: (error) => {
        this.isLoading = false;
        this.message.error(error.error?.message || 'Đăng ký thất bại');
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  submitBusinessSignup(): void {
    if (this.businessForm.invalid) {
      Object.values(this.businessForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsTouched();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      return;
    }

    this.isLoading = true;
    const formData = this.businessForm.value;
    const businessData: BusinessSignUpRequest = {
      username: formData.username,
      email: formData.email,
      password: formData.password,
      fullName: formData.fullName,
      phone: formData.phone,
      businessInfo: {
        name: formData.businessInfo.name,
        legalName: formData.businessInfo.legalName,
        taxId: formData.businessInfo.taxId,
        address: formData.businessInfo.address,
        contactInfo: {
          email: formData.businessInfo.contactInfo.email || formData.email,
          phone: formData.businessInfo.contactInfo.phone || formData.phone,
          website: formData.businessInfo.contactInfo.website
        }
      }
    };

    this.userService.signUpBusiness(businessData).subscribe({
      next: () => {
        this.message.success('Đăng ký tài khoản doanh nghiệp thành công!');
        this.router.navigate(['/login']);
      },
      error: (error) => {
        this.isLoading = false;
        this.message.error(error.error?.message || 'Đăng ký thất bại');
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }
}
