import { Component, OnInit } from '@angular/core';
import { PricingService } from '../../services/pricing.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { formatCurrency } from '@angular/common';
import { PermissionFeature } from '../../services/permission.service';

interface PricingPackage {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  yearlyDiscount: number;
  duration: number;
  features: string[];
  maxUsers: number | null; // -1 hoặc null = không giới hạn
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions?: string[];
}

interface PackageSubscriber {
  userId: string;
  username: string;
  email: string;
  packageId: string;
  packageName: string;
  expiryDate: Date;
}

@Component({
  selector: 'app-pricing-management',
  templateUrl: './pricing-management.component.html',
  styleUrls: ['./pricing-management.component.css']
})
export class PricingManagementComponent implements OnInit {
  packages: any[] = [];
  subscribers: any[] = [];
  loading = false;
  isModalVisible = false;
  editingPackageId: string | null = null;
  availablePermissions = ['view', 'edit', 'delete', 'manage'];
  availableFeatures: { value: PermissionFeature; label: string }[] = [
    { value: 'room_management', label: 'Quản lý phòng' },
    { value: 'hotel_management', label: 'Quản lý khách sạn' },
    { value: 'company_management', label: 'Quản lý doanh nghiệp' },
    { value: 'staff_management', label: 'Quản lý nhân viên' },
    { value: 'service_management', label: 'Quản lý dịch vụ' },
    { value: 'user_management', label: 'Quản lý người dùng' },
    { value: 'pricing_management', label: 'Quản lý gói giá' },
    { value: 'ota_management', label: 'Quản lý OTA' },
    { value: 'revenue_chart', label: 'Biểu đồ doanh thu' },
    { value: 'shift_handover', label: 'Giao ca' },
    { value: 'bank_transfer_history', label: 'Lịch sử chuyển khoản' },
    { value: 'calendar', label: 'Lịch' },
    { value: 'email_admin', label: 'Quản lý email' },
    { value: 'qr_payment', label: 'Thanh toán QR' },
    { value: 'visa_payment', label: 'Thanh toán Visa' },
    { value: 'electric_management', label: 'Quản lý điện' }
  ];
  packageForm!: FormGroup;

  numberFormatter = (value: number): string => {
    if (!value) return '0';
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  constructor(
    private fb: FormBuilder,
    private pricingService: PricingService,
    private message: NzMessageService,
    private modal: NzModalService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.loadPackages();
    this.loadSubscribers();
    this.pricingService.subscriptionChanged$.subscribe(() => {
      this.loadSubscribers();
    });
  }

  initForm(): void {
    this.packageForm = this.fb.group({
      name: ['', [Validators.required]],
      description: ['', [Validators.required]],
      monthlyPrice: [0, [Validators.required, Validators.min(0)]],
      yearlyPrice: [0, [Validators.required, Validators.min(0)]],
      yearlyDiscount: [0, [Validators.min(0), Validators.max(100)]],
      duration: [1, [Validators.required, Validators.min(1)]],
      features: [[]],
      permissions: [['view'], [Validators.required]],
      maxUsers: [1, [Validators.required]], // Cho phép -1 (không giới hạn)
      unlimitedUsers: [false], // Checkbox để chọn không giới hạn
      isActive: [true]
    });
    
    // Theo dõi thay đổi của unlimitedUsers
    this.packageForm.get('unlimitedUsers')?.valueChanges.subscribe(unlimited => {
      const maxUsersControl = this.packageForm.get('maxUsers');
      if (unlimited) {
        maxUsersControl?.setValue(-1, { emitEvent: false });
        maxUsersControl?.clearValidators();
      } else {
        maxUsersControl?.setValidators([Validators.required, Validators.min(1)]);
        if (maxUsersControl?.value === -1) {
          maxUsersControl?.setValue(1);
        }
      }
      maxUsersControl?.updateValueAndValidity();
    });
  }

  loadPackages(): void {
    this.loading = true;
    this.pricingService.getAllPackages().subscribe({
      next: (response) => {
        this.packages = response.data || [];
        this.loading = false;
      },
      error: (error) => {
        this.message.error('Không thể tải danh sách gói');
        this.loading = false;
      }
    });
  }

  loadSubscribers(): void {
    this.loading = true;
    this.pricingService.getAllSubscribers().subscribe({
      next: (response) => {
        this.subscribers = response.data || [];
        this.loading = false;
      },
      error: (error) => {
        this.message.error('Không thể tải danh sách người đăng ký');
        this.loading = false;
      }
    });
  }

  showModal(packageId?: string): void {
    this.editingPackageId = packageId || null;
    if (packageId) {
      const pkg = this.packages.find(p => p._id === packageId || p.id === packageId);
      if (pkg) {
        const isUnlimited = pkg.maxUsers === -1 || pkg.maxUsers === null;
        this.packageForm.patchValue({
          name: pkg.name,
          description: pkg.description,
          monthlyPrice: pkg.monthlyPrice || pkg.price || 0,
          yearlyPrice: pkg.yearlyPrice || (pkg.price ? pkg.price * 12 : 0),
          yearlyDiscount: pkg.yearlyDiscount || 0,
          duration: pkg.duration,
          features: pkg.features || [],
          permissions: pkg.permissions || ['view'],
          maxUsers: isUnlimited ? 1 : pkg.maxUsers,
          unlimitedUsers: isUnlimited,
          isActive: pkg.isActive
        });
      }
    } else {
      this.packageForm.reset({
        name: '',
        description: '',
        monthlyPrice: 0,
        yearlyPrice: 0,
        yearlyDiscount: 0,
        duration: 1,
        features: [],
        permissions: ['view'],
        maxUsers: 1,
        isActive: true
      });
    }
    this.isModalVisible = true;
  }

  handleCancel(): void {
    this.isModalVisible = false;
    this.packageForm.reset({
      name: '',
      description: '',
      monthlyPrice: 0,
      yearlyPrice: 0,
      yearlyDiscount: 0,
      duration: 1,
      features: [],
      permissions: ['view'],
      maxUsers: 1,
      unlimitedUsers: false,
      isActive: true
    });
    this.editingPackageId = null;
  }

  handleOk(): void {
    if (this.packageForm.valid) {
      this.loading = true;
      const formData = this.packageForm.value;

      // Nếu unlimitedUsers được chọn, set maxUsers = -1
      const maxUsers = formData.unlimitedUsers ? -1 : formData.maxUsers;

      const payload: any = {
        ...formData,
        maxUsers: maxUsers,
        features: formData.features || [],
        permissions: formData.permissions || ['view']
      };
      
      // Xóa unlimitedUsers khỏi payload vì không cần gửi lên backend
      delete payload.unlimitedUsers;

      if (this.editingPackageId) {
        this.pricingService.updatePackage(this.editingPackageId, payload).subscribe({
          next: (response) => {
            if (response.success) {
              this.message.success(response.message || 'Cập nhật gói thành công');
              this.loadPackages();
              this.handleCancel();
            } else {
              this.message.error(response.message || 'Cập nhật gói thất bại');
            }
          },
          error: (error) => {
            this.message.error(error.error?.message || 'Cập nhật gói thất bại');
          },
          complete: () => {
            this.loading = false;
          }
        });
      } else {
        this.pricingService.createPackage(payload).subscribe({
          next: (response) => {
            if (response.success) {
              this.message.success(response.message || 'Tạo gói thành công');
              this.loadPackages();
              this.handleCancel();
            } else {
              this.message.error(response.message || 'Tạo gói thất bại');
            }
          },
          error: (error) => {
            this.message.error(error.error?.message || 'Tạo gói thất bại');
          },
          complete: () => {
            this.loading = false;
          }
        });
      }
    } else {
      Object.values(this.packageForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  deletePackage(packageId: string): void {
    this.modal.confirm({
      nzTitle: 'Xác nhận xóa',
      nzContent: 'Bạn có chắc chắn muốn xóa gói này? Hành động này không thể hoàn tác.',
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        this.loading = true;
        this.pricingService.deletePackage(packageId).subscribe({
          next: (response) => {
            if (response.success) {
              this.message.success(response.message || 'Xóa gói thành công');
              this.loadPackages();
            } else {
              this.message.error(response.message || 'Xóa gói thất bại');
            }
          },
          error: (error) => {
            this.message.error(error.error?.message || 'Xóa gói thất bại');
          },
          complete: () => {
            this.loading = false;
          }
        });
      }
    });
  }

  addFeature(): void {
    const features = this.packageForm.get('features')?.value || [];
    features.push('');
    this.packageForm.patchValue({ features });
  }

  removeFeature(index: number): void {
    const features = this.packageForm.get('features')?.value || [];
    features.splice(index, 1);
    this.packageForm.patchValue({ features });
  }

  updateFeature(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const features = this.packageForm.get('features')?.value || [];
    features[index] = input.value;
    this.packageForm.patchValue({ features });
  }

  addPermission(): void {
    const permissions = this.packageForm.get('permissions')?.value || [];
    permissions.push('');
    this.packageForm.patchValue({ permissions });
  }

  removePermission(index: number): void {
    const permissions = this.packageForm.get('permissions')?.value || [];
    permissions.splice(index, 1);
    this.packageForm.patchValue({ permissions });
  }

  updatePermission(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const permissions = this.packageForm.get('permissions')?.value || [];
    permissions[index] = input.value;
    this.packageForm.patchValue({ permissions });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(value);
  }

  onAdminSubscribe(packageId: string) {
    const userId = 'USER_ID_TEST'; // Thay bằng userId thực tế khi test
    this.pricingService.subscribe(userId, packageId).subscribe({
      next: (res) => {
        this.message.success('Đăng ký gói thành công');
        this.loadSubscribers();
      },
      error: (err) => {
        this.message.error('Đăng ký gói thất bại');
      }
    });
  }
} 