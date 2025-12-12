import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HotelService } from '../../services/hotel.service';
import { BusinessService } from '../../services/business.service';
import { RoomsService } from '../../services/rooms.service';
import { StaffService } from '../../services/staff.service';
import { UserService } from '../../services/user.service';
import { AuthService, PermissionRules } from '../../services/auth.service';
import { Hotel, HotelStatus, HotelAddress, HotelContactInfo, HotelSettings } from '../../interfaces/hotel';
import { Business } from '../../interfaces/business';
import { Room } from '../../interfaces/rooms';
import { User } from '../../interfaces/user';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';

type HotelStatusType = 'active' | 'inactive' | 'maintenance' | 'suspended';

@Component({
  selector: 'app-hotel-management',
  templateUrl: './hotel-management.component.html',
  styleUrls: ['./hotel-management.component.css']
})
export class HotelManagementComponent implements OnInit {
  hotelForm: FormGroup;
  hotels: Hotel[] = [];
  businesses: Business[] = [];
  availableManagers: User[] = [];
  selectedHotel: Hotel | null = null;
  editId: string | null = null;
  availableStaffs: User[] = [];
  availableRooms: Room[] = [];
  isLoading = false;
  selectedViewHotel: Hotel | null = null;
  currentUser: User | null = null;
  permissions: PermissionRules | null = null;
  
  // QR Payment
  qrPaymentUrl: string = '';
  showQrPreview: boolean = false;
  qrBeneficiaryName: string = '';

  hotelStatusOptions: { label: string, value: HotelStatusType }[] = [
    { label: 'Hoạt động', value: 'active' },
    { label: 'Không hoạt động', value: 'inactive' },
    { label: 'Bảo trì', value: 'maintenance' },
    { label: 'Bị đình chỉ', value: 'suspended' }
  ];

  constructor(
    private hotelService: HotelService,
    private businessService: BusinessService,
    private roomService: RoomsService,
    private staffService: StaffService,
    private userService: UserService,
    private authService: AuthService,
    private fb: FormBuilder,
    private message: NzMessageService,
    private modal: NzModalService
  ) {
    this.hotelForm = this.fb.group({
      name: ['', Validators.required],
      businessId: [null, Validators.required],
      address: this.fb.group({
        street: [''],
        city: [''],
        state: [''],
        country: [''],
        postalCode: ['']
      }),
      contactInfo: this.fb.group({
        phone: [''],
        email: ['', [Validators.email]],
        website: ['']
      }),
      description: [''],
      starRating: [null, [Validators.min(1), Validators.max(5)]],
      managerId: [null],
      status: ['active' as HotelStatusType, Validators.required],
      facilities: [[]],
      settings: this.fb.group({
        checkInTime: ['14:00'],
        checkOutTime: ['12:00'],
        currency: ['VND'],
        language: ['vi'],
        taxRate: [0]
      }),
      bankAccount: this.fb.group({
        bankName: [''],
        accountNumber: [''],
        accountHolderName: [''],
        beneficiaryName: [''],
        branch: [''],
        qrPaymentUrl: ['']
      })
    });
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.permissions = this.authService.getPermissionRules();
    this.loadHotels();
    this.loadBusinesses();
    this.loadAvailableManagers();
  }

  // ============ KIỂM TRA QUYỀN ============

  get isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  get isSuperAdmin(): boolean {
    return this.authService.isSuperAdmin();
  }

  get isBusiness(): boolean {
    return this.authService.isBusiness();
  }

  get isHotelManager(): boolean {
    return this.authService.isHotelManager();
  }

  get canManageHotels(): boolean {
    return this.permissions?.canManageHotels || false;
  }

  get canCreateHotel(): boolean {
    // Admin và Business có thể tạo hotel mới
    return this.isAdmin || this.isBusiness;
  }

  /**
   * Kiểm tra có thể quản lý hotel cụ thể không
   */
  canManage(hotelId?: string): boolean {
    if (!hotelId) return false;
    if (!this.currentUser) return false;
    
    // Admin có quyền quản lý tất cả
    if (this.isAdmin) return true;
    
    // Business chỉ quản lý được hotels thuộc business của mình
    if (this.isBusiness) {
      const hotel = this.hotels.find(h => h._id === hotelId);
      return !!hotel && hotel.businessId === this.currentUser.businessId;
    }
    
    // Hotel manager chỉ quản lý được hotel của mình
    if (this.isHotelManager) {
      return this.currentUser.hotelId === hotelId;
    }
    
    return false;
  }

  /**
   * Kiểm tra có thể xóa hotel không
   */
  canDelete(hotelId?: string): boolean {
    if (!this.isAdmin && !this.isBusiness) return false;
    return this.canManage(hotelId);
  }

  /**
   * Kiểm tra có thể block hotel không
   */
  canBlockHotel(hotel: Hotel): boolean {
    if (!this.isAdmin && !this.isBusiness) return false;
    return this.canManage(hotel._id);
  }

  // ============ LOAD DATA ============

  loadHotels(): void {
    this.isLoading = true;
    this.hotelService.getHotels().subscribe({
      next: (data) => {
        if (this.isAdmin) {
          // Admin thấy tất cả hotels
          this.hotels = data;
        } else if (this.isBusiness && this.currentUser?.businessId) {
          // Business chỉ thấy hotels thuộc business của mình
          this.hotels = data.filter(hotel => 
            hotel.businessId === this.currentUser?.businessId
          );
        } else if (this.isHotelManager && this.currentUser?.hotelId) {
          // Hotel manager chỉ thấy hotel của mình
          this.hotels = data.filter(hotel => 
            hotel._id === this.currentUser?.hotelId
          );
        } else {
          this.hotels = [];
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching hotels:', error);
        this.message.error('Không thể tải danh sách khách sạn.');
        this.isLoading = false;
      }
    });
  }

  loadBusinesses(): void {
    this.businessService.getBusinesses().subscribe({
      next: (data) => {
        if (this.isAdmin) {
          this.businesses = data.filter(b => b.status === 'active');
        } else if (this.isBusiness && this.currentUser?.businessId) {
          this.businesses = data.filter(b => b._id === this.currentUser?.businessId);
        } else {
          this.businesses = [];
        }
      },
      error: (error) => {
        console.error('Error fetching businesses:', error);
        this.message.error('Không thể tải danh sách doanh nghiệp.');
      }
    });
  }

  loadAvailableManagers(): void {
    // Lấy users có thể làm manager (role hotel hoặc chưa có hotelId)
    this.userService.getAllUsers().subscribe({
      next: (data: User[]) => {
        this.availableManagers = data.filter((u: User) => 
          (u.role === 'hotel' || u.role === 'admin' || u.role === 'business') &&
          u.status === 'active'
        );
      },
      error: (error: any) => {
        console.error('Error fetching users for managers:', error);
      }
    });
  }

  // ============ FORM ACTIONS ============

  startEdit(hotel: Hotel | null): void {
    if (hotel) {
      if (!this.canManage(hotel._id)) {
        this.message.warning('Bạn không có quyền chỉnh sửa khách sạn này');
        return;
      }
      
      this.editId = hotel._id!;
      this.selectedHotel = { ...hotel };
      this.hotelForm.patchValue({
        name: hotel.name,
        businessId: hotel.businessId,
        address: {
          street: hotel.address?.street || '',
          city: hotel.address?.city || '',
          state: hotel.address?.state || '',
          country: hotel.address?.country || '',
          postalCode: hotel.address?.postalCode || ''
        },
        contactInfo: {
          phone: hotel.contactInfo?.phone || '',
          email: hotel.contactInfo?.email || '',
          website: hotel.contactInfo?.website || ''
        },
        description: hotel.description || '',
        starRating: hotel.starRating,
        managerId: typeof hotel.managerId === 'string' ? hotel.managerId : hotel.managerId?._id,
        status: hotel.status || 'active',
        facilities: hotel.facilities || [],
        settings: {
          checkInTime: hotel.settings?.checkInTime || '14:00',
          checkOutTime: hotel.settings?.checkOutTime || '12:00',
          currency: hotel.settings?.currency || 'VND',
          language: hotel.settings?.language || 'vi',
          taxRate: hotel.settings?.taxRate || 0
        },
        bankAccount: {
          bankName: hotel.bankAccount?.bankName || '',
          accountNumber: hotel.bankAccount?.accountNumber || '',
          accountHolderName: hotel.bankAccount?.accountHolderName || '',
          beneficiaryName: hotel.bankAccount?.beneficiaryName || '',
          branch: hotel.bankAccount?.branch || '',
          qrPaymentUrl: hotel.bankAccount?.qrPaymentUrl || ''
        }
      });
      
      // Load QR code nếu có
      if (hotel.bankAccount?.qrPaymentUrl) {
        this.qrPaymentUrl = hotel.bankAccount.qrPaymentUrl;
        this.qrBeneficiaryName = hotel.bankAccount.beneficiaryName || '';
        this.showQrPreview = false; // Đã lưu, không hiển thị preview
      } else {
        this.qrPaymentUrl = '';
        this.qrBeneficiaryName = '';
        this.showQrPreview = false;
      }
    } else {
      // Tạo mới
      if (!this.canCreateHotel) {
        this.message.warning('Bạn không có quyền tạo khách sạn mới');
        return;
      }
      
      this.editId = 'new';
      this.selectedHotel = {} as Hotel;
      this.hotelForm.reset({
        status: 'active',
        settings: {
          checkInTime: '14:00',
          checkOutTime: '12:00',
          currency: 'VND',
          language: 'vi',
          taxRate: 0
        },
        facilities: []
      });
      
      // Auto-set businessId cho business user
      if (this.isBusiness && this.currentUser?.businessId) {
        this.hotelForm.patchValue({ businessId: this.currentUser.businessId });
      }
    }
  }
  
  stopEdit(): void {
    this.editId = null;
    this.selectedHotel = null;
    this.qrPaymentUrl = '';
    this.qrBeneficiaryName = '';
    this.showQrPreview = false;
    this.hotelForm.reset({
      status: 'active',
      settings: {
        checkInTime: '14:00',
        checkOutTime: '12:00',
        currency: 'VND',
        language: 'vi',
        taxRate: 0
      },
      facilities: []
    });
  }
  
  /**
   * Tạo QR thanh toán SePay từ số tài khoản và tên ngân hàng
   */
  generateQrPayment(): void {
    const bankAccountGroup = this.hotelForm.get('bankAccount') as FormGroup;
    const bankName = bankAccountGroup?.get('bankName')?.value?.trim();
    const accountNumber = bankAccountGroup?.get('accountNumber')?.value?.trim();
    const beneficiaryName = bankAccountGroup?.get('beneficiaryName')?.value?.trim() || '';

    if (!bankName || !accountNumber) {
      this.message.warning('Vui lòng nhập tên ngân hàng và số tài khoản');
      return;
    }

    // Tạo URL QR thanh toán SePay
    const encodedAccount = encodeURIComponent(accountNumber);
    const encodedBank = encodeURIComponent(bankName);
    this.qrPaymentUrl = `https://qr.sepay.vn/img?acc=${encodedAccount}&bank=${encodedBank}`;
    
    // Lưu tên người thụ hưởng
    this.qrBeneficiaryName = beneficiaryName || bankAccountGroup?.get('accountHolderName')?.value?.trim() || '';
    
    this.showQrPreview = true;
    this.message.success('Đã tạo QR thanh toán thành công. Vui lòng bấm "Cập nhật" để lưu vào hệ thống.');
  }

  /**
   * Xóa QR preview
   */
  clearQrPreview(): void {
    this.qrPaymentUrl = '';
    this.qrBeneficiaryName = '';
    this.showQrPreview = false;
  }

  submitForm(): void {
    if (this.hotelForm.invalid) {
      Object.values(this.hotelForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
        if (control instanceof FormGroup) {
          Object.values(control.controls).forEach(innerControl => {
            if (innerControl.invalid) {
              innerControl.markAsDirty();
              innerControl.updateValueAndValidity({ onlySelf: true });
            }
          });
        }
      });
      this.message.warning('Vui lòng điền đầy đủ thông tin bắt buộc.');
      return;
    }

    // Lọc bỏ giá trị null/undefined
    const formValue = this.hotelForm.value;
    const hotelData: any = {};
    Object.keys(formValue).forEach(key => {
      const value = formValue[key];
      if (value !== null && value !== undefined && value !== '') {
        hotelData[key] = value;
      }
    });
    
    // Cập nhật bankAccount với QR payment URL nếu có
    if (hotelData.bankAccount) {
      if (this.qrPaymentUrl) {
        hotelData.bankAccount.qrPaymentUrl = this.qrPaymentUrl;
      }
      if (this.qrBeneficiaryName) {
        hotelData.bankAccount.beneficiaryName = this.qrBeneficiaryName;
      }
    }

    this.isLoading = true;

    if (this.editId && this.editId !== 'new' && this.selectedHotel) {
      this.hotelService.updateHotel(this.editId, hotelData).subscribe({
        next: (updatedHotel) => {
          const index = this.hotels.findIndex(h => h._id === this.editId);
          if (index !== -1) {
            this.hotels[index] = updatedHotel;
            this.hotels = [...this.hotels];
          }
          this.stopEdit();
          this.message.success('Cập nhật khách sạn thành công!');
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error updating hotel:', error);
          this.message.error(error.error?.message || 'Lỗi khi cập nhật khách sạn.');
          this.isLoading = false;
        }
      });
    } else {
      this.hotelService.createHotel(hotelData).subscribe({
        next: (newHotel) => {
          this.hotels = [...this.hotels, newHotel];
          this.stopEdit();
          this.message.success('Tạo khách sạn mới thành công!');
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error creating hotel:', error);
          this.message.error(error.error?.message || 'Lỗi khi tạo khách sạn.');
          this.isLoading = false;
        }
      });
    }
  }

  deleteHotel(id: string): void {
    if (!this.canDelete(id)) {
      this.message.error('Bạn không có quyền xóa khách sạn này');
      return;
    }

    this.modal.confirm({
      nzTitle: 'Xác nhận xóa khách sạn',
      nzContent: 'Bạn có chắc chắn muốn xóa khách sạn này? Hành động này sẽ ảnh hưởng đến tất cả phòng và nhân viên thuộc khách sạn.',
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.hotelService.deleteHotel(id).subscribe({
          next: () => {
            this.hotels = this.hotels.filter(h => h._id !== id);
            if (this.selectedHotel?._id === id) {
              this.stopEdit();
            }
            if (this.selectedViewHotel?._id === id) {
              this.closeHotelDetails();
            }
            this.message.success('Xóa khách sạn thành công!');
          },
          error: (error) => {
            console.error('Error deleting hotel:', error);
            this.message.error(error.error?.message || 'Lỗi khi xóa khách sạn.');
          }
        });
      },
      nzCancelText: 'Hủy'
    });
  }

  // ============ STATUS MANAGEMENT ============

  /**
   * Block/Suspend hotel - cascade ảnh hưởng tất cả staff
   */
  blockHotel(hotelId: string): void {
    if (!this.canBlockHotel(this.hotels.find(h => h._id === hotelId)!)) {
      this.message.error('Bạn không có quyền đình chỉ khách sạn này');
      return;
    }

    this.modal.confirm({
      nzTitle: 'Xác nhận đình chỉ khách sạn',
      nzContent: `<b style="color: red;">Cảnh báo:</b> Khi đình chỉ khách sạn, tất cả phòng và nhân viên thuộc khách sạn này sẽ không thể hoạt động.`,
      nzOkText: 'Đình chỉ',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.updateHotelStatusLogic(hotelId, 'suspended', 'Khách sạn và tất cả nhân viên đã bị đình chỉ.');
      },
      nzCancelText: 'Hủy'
    });
  }

  updateHotelStatusLogic(hotelId: string, status: HotelStatusType, successMessage: string): void {
    this.isLoading = true;
    this.hotelService.updateHotelStatus(hotelId, status).subscribe({
      next: (response: any) => {
        const updatedHotel = response.hotel || response;
        const index = this.hotels.findIndex(h => h._id === hotelId);
        if (index !== -1) {
          this.hotels[index] = updatedHotel;
          this.hotels = [...this.hotels];
        }
        this.message.success(successMessage);
        this.isLoading = false;
        
        if (this.selectedViewHotel?._id === hotelId) {
          this.selectedViewHotel = { ...this.selectedViewHotel, status };
        }
      },
      error: (error) => {
        console.error('Error updating hotel status:', error);
        this.message.error(error.error?.message || 'Không thể cập nhật trạng thái khách sạn');
        this.isLoading = false;
      }
    });
  }

  // ============ VIEW HELPERS ============

  viewHotelDetails(hotel: Hotel): void {
    this.selectedViewHotel = hotel;
  }

  closeHotelDetails(): void {
    this.selectedViewHotel = null;
  }

  getBusinessName(businessId: string | undefined): string {
    if (!businessId) return 'N/A';
    const business = this.businesses.find(b => b._id === businessId);
    return business ? business.name : 'N/A';
  }

  getHotelStatusLabel(statusValue: HotelStatusType | undefined): string {
    if (!statusValue) return 'N/A';
    const statusOption = this.hotelStatusOptions.find(s => s.value === statusValue);
    return statusOption ? statusOption.label : statusValue;
  }

  getStatusColor(status?: HotelStatusType): string {
    switch (status) {
      case 'active': return 'green';
      case 'inactive': return 'orange';
      case 'maintenance': return 'blue';
      case 'suspended': return 'red';
      default: return 'default';
    }
  }

  getManagerName(managerId: string | User | undefined): string {
    if (!managerId) return 'Chưa có';
    if (typeof managerId === 'object' && managerId !== null && '_id' in managerId) {
      return managerId.fullName || managerId.username || 'N/A';
    }
    if (typeof managerId === 'string') {
      const manager = this.availableManagers.find(m => m._id === managerId);
      return manager ? (manager.fullName || manager.username || 'N/A') : 'N/A';
    }
    return 'N/A';
  }

  /**
   * Kiểm tra hotel có bị cascade block không
   */
  isCascadeBlocked(hotel: Hotel): boolean {
    return hotel.status === 'suspended' || hotel.status === 'inactive';
  }
}
