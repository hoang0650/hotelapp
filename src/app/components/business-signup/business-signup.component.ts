import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService, BusinessInfo, SignUpRequest } from '../../services/user.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-business-signup',
  templateUrl: './business-signup.component.html',
  styleUrl: './business-signup.component.css'
})
export class BusinessSignupComponent implements OnInit {
  businessForm: FormGroup;
  isLoading = false;
  hidePassword = true;
  
  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private router: Router,
    private message: NzMessageService,
    private translate: TranslateService
  ) {
    this.businessForm = this.createForm();
  }

  ngOnInit(): void {
  }

  /**
   * Tạo form đăng ký doanh nghiệp
   */
  createForm(): FormGroup {
    return this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      acceptTerms: [false, [Validators.requiredTrue]],
      businessInfo: this.fb.group({
        name: ['', [Validators.required]],
        legalName: ['', [Validators.required]],
        taxId: ['', [Validators.required, Validators.pattern(/^[0-9]+$/)]],
        address: ['', [Validators.required]],
        contactInfo: this.fb.group({
          phone: ['', [Validators.pattern(/^[0-9]+$/)]],
          email: ['', [Validators.email]],
          website: ['']
        })
      })
    });
  }

  /**
   * Xử lý đăng ký tài khoản doanh nghiệp
   */
  onSubmit(): void {
    if (this.businessForm.invalid) {
      this.markFormGroupTouched(this.businessForm);
      return;
    }

    this.isLoading = true;
    const formData: SignUpRequest & { businessInfo: BusinessInfo } = {
      username: this.businessForm.value.username,
      email: this.businessForm.value.email,
      password: this.businessForm.value.password,
      businessInfo: {
        name: this.businessForm.value.businessInfo.name,
        legalName: this.businessForm.value.businessInfo.legalName,
        taxId: this.businessForm.value.businessInfo.taxId,
        address: this.businessForm.value.businessInfo.address,
        contactInfo: {
          phone: this.businessForm.value.businessInfo.contactInfo?.phone,
          email: this.businessForm.value.businessInfo.contactInfo?.email,
          website: this.businessForm.value.businessInfo.contactInfo?.website
        }
      }
    };
    
    this.userService.signUpBusiness(formData).subscribe({
      next: (response) => {
        this.isLoading = false;
        this.message.success(this.translate.instant('SIGNUP.BUSINESS_SIGNUP_SUCCESS'));
        this.router.navigate(['/login'], { 
          queryParams: { registrationSuccess: true } 
        });
      },
      error: (error) => {
        this.isLoading = false;
        let errorMessage = this.translate.instant('SIGNUP.BUSINESS_SIGNUP_FAILED');
        if (error.error && error.error.message) {
          errorMessage = error.error.message;
        }
        this.message.error(errorMessage);
      }
    });
  }

  /**
   * Đánh dấu tất cả các trường trong form là đã chạm vào
   * để hiển thị validation errors
   */
  markFormGroupTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if ((control as FormGroup).controls) {
        this.markFormGroupTouched(control as FormGroup);
      }
    });
  }

  /**
   * Kiểm tra lỗi form control
   */
  hasError(controlName: string, errorName: string, formGroup: FormGroup = this.businessForm): boolean {
    const control = formGroup.get(controlName);
    return control !== null && control.touched && control.hasError(errorName);
  }

  /**
   * Kiểm tra lỗi ở form con
   */
  hasNestedError(parent: string, controlName: string, errorName: string): boolean {
    const parentControl = this.businessForm.get(parent);
    if (parentControl instanceof FormGroup) {
      return this.hasError(controlName, errorName, parentControl);
    }
    return false;
  }
}
