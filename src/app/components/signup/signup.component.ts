import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { UserService, BusinessInfo } from '../../services/user.service';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.css']
})
export class SignupComponent implements OnInit {
  signupForm: FormGroup;
  isLoading = false;
  passwordVisible = false;
  isBusiness = false;

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private router: Router,
    private message: NzMessageService
  ) {
    this.signupForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      fullName: [''],
      phone: [''],
      role: ['guest'],
      businessInfo: this.fb.group({
        name: [''],
        legalName: [''],
        taxId: [''],
        address: [''],
        contactInfo: this.fb.group({
          email: [''],
          phone: [''],
          website: ['']
        })
      })
    });
  }

  ngOnInit(): void {
    if (this.userService.isLoggedIn) {
      this.router.navigate(['/dashboard']);
    }
  }

  onBusinessToggle(checked: boolean): void {
    this.isBusiness = checked;
    const businessInfoGroup = this.signupForm.get('businessInfo') as FormGroup;
    
    if (checked) {
      this.signupForm.patchValue({ role: 'business' });
      businessInfoGroup?.get('name')?.setValidators([Validators.required]);
      businessInfoGroup?.get('legalName')?.setValidators([Validators.required]);
      businessInfoGroup?.get('taxId')?.setValidators([Validators.required]);
      businessInfoGroup?.get('address')?.setValidators([Validators.required]);
    } else {
      this.signupForm.patchValue({ role: 'guest' });
      businessInfoGroup?.get('name')?.clearValidators();
      businessInfoGroup?.get('legalName')?.clearValidators();
      businessInfoGroup?.get('taxId')?.clearValidators();
      businessInfoGroup?.get('address')?.clearValidators();
    }

    if (businessInfoGroup) {
      Object.values(businessInfoGroup.controls).forEach((control: any) => {
        if (control && typeof control.updateValueAndValidity === 'function') {
          control.updateValueAndValidity();
        }
      });
    }
  }

  submitForm(): void {
    if (this.signupForm.valid) {
      this.isLoading = true;
      
      if (this.isBusiness) {
        this.userService.signUpBusiness(this.signupForm.value).subscribe({
          next: (response) => {
            this.message.success('Đăng ký tài khoản doanh nghiệp thành công');
            this.router.navigate(['/login']);
          },
          error: (error) => {
            this.message.error(error.error?.message || 'Đăng ký thất bại');
          },
          complete: () => {
            this.isLoading = false;
          }
        });
      } else {
        const userData = { ...this.signupForm.value };
        delete userData.businessInfo;
        
        this.userService.signUp(userData).subscribe({
          next: (response) => {
            this.message.success('Đăng ký tài khoản thành công');
            this.router.navigate(['/login']);
          },
          error: (error) => {
            this.message.error(error.error?.message || 'Đăng ký thất bại');
          },
          complete: () => {
            this.isLoading = false;
          }
        });
      }
    } else {
      Object.values(this.signupForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsTouched();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
    }
  }
}
