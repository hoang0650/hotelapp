import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BusinessUser, UserService } from '../../services/user.service';
import { NzMessageService } from 'ng-zorro-antd/message';

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
    private message: NzMessageService
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
      businessInfo: this.fb.group({
        name: ['', [Validators.required]],
        address: ['', [Validators.required]],
        tax_code: ['', [Validators.required, Validators.pattern(/^[0-9]+$/)]],
        contact: this.fb.group({
          phone: ['', [Validators.pattern(/^[0-9]+$/)]],
          email: ['', [Validators.email]]
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
    const formData: BusinessUser = this.businessForm.value;
    
    this.userService.signUpBusiness(formData).subscribe({
      next: (response) => {
        this.isLoading = false;
        this.message.success('Đăng ký tài khoản doanh nghiệp thành công!');
        this.router.navigate(['/login'], { 
          queryParams: { registrationSuccess: true } 
        });
      },
      error: (error) => {
        this.isLoading = false;
        let errorMessage = 'Đã xảy ra lỗi khi đăng ký tài khoản doanh nghiệp';
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
