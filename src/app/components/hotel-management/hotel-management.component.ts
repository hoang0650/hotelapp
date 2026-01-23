import { Component, OnInit, OnDestroy } from '@angular/core';
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
import { NzUploadFile, NzUploadChangeParam } from 'ng-zorro-antd/upload';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

type HotelStatusType = 'active' | 'inactive' | 'maintenance' | 'suspended';

@Component({
  selector: 'app-hotel-management',
  templateUrl: './hotel-management.component.html',
  styleUrls: ['./hotel-management.component.css']
})
export class HotelManagementComponent implements OnInit, OnDestroy {
  hotelForm!: FormGroup;
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
  
  // Logo upload
  apiBaseUrl = environment.apiUrl;
  uploadUrl = `${this.apiBaseUrl}/files/upload`;
  fileList: any[] = [];
  logoId: string | null = null;
  isLoadingUpload = false;

  hotelStatusOptions: { label: string, value: HotelStatusType }[] = [];
  
  private subscriptions = new Subscription();


  private initStatusOptions(): void {
    this.hotelStatusOptions = [
      { label: this.translate.instant('HOTEL_MANAGEMENT.STATUS_OPTIONS.ACTIVE'), value: 'active' },
      { label: this.translate.instant('HOTEL_MANAGEMENT.STATUS_OPTIONS.INACTIVE'), value: 'inactive' },
      { label: this.translate.instant('HOTEL_MANAGEMENT.STATUS_OPTIONS.MAINTENANCE'), value: 'maintenance' },
      { label: this.translate.instant('HOTEL_MANAGEMENT.STATUS_OPTIONS.SUSPENDED'), value: 'suspended' }
    ];
  }

  constructor(
    private hotelService: HotelService,
    private businessService: BusinessService,
    private roomService: RoomsService,
    private staffService: StaffService,
    private userService: UserService,
    private authService: AuthService,
    private fb: FormBuilder,
    private message: NzMessageService,
    private modal: NzModalService,
    private http: HttpClient,
    private translate: TranslateService
  ) {
    this.initStatusOptions();
    this.hotelForm = this.fb.group({
      name: ['', Validators.required],
      businessId: [null, Validators.required],
      taxId: ['', [Validators.pattern(/^\d{10,15}$/)]],
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
      starRating: [null, [Validators.min(0), Validators.max(5)]],
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
      }),
      logo: ['']
    });
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.permissions = this.authService.getPermissionRules();
    this.loadHotels();
    this.loadBusinesses();
    this.loadAvailableManagers();
    
    // Subscribe to language changes to update statusOptions
    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => {
        this.initStatusOptions();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
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
    // Chỉ admin mới có thể tạo hotel mới
    // Business KHÔNG thể tạo khách sạn, chỉ xem
    return this.isAdmin;
  }

  /**
   * Kiểm tra có thể quản lý hotel cụ thể không
   * Business KHÔNG thể cập nhật hotel, chỉ xem
   */
  canManage(hotelId?: string): boolean {
    if (!hotelId) return false;
    if (!this.currentUser) return false;
    
    // Admin có quyền quản lý tất cả
    if (this.isAdmin) return true;
    
    // Business KHÔNG thể cập nhật hotel, chỉ xem
    if (this.isBusiness) {
      return false;
    }
    
    // Hotel manager chỉ quản lý được hotel của mình
    if (this.isHotelManager) {
      return this.currentUser.hotelId === hotelId;
    }
    
    return false;
  }

  /**
   * Kiểm tra có thể xóa hotel không
   * Business KHÔNG thể xóa hotel
   */
  canDelete(hotelId?: string): boolean {
    if (!this.isAdmin) return false;
    return this.canManage(hotelId);
  }

  /**
   * Kiểm tra có thể block hotel không
   * Business KHÔNG thể block hotel
   */
  canBlockHotel(hotel: Hotel): boolean {
    if (!this.isAdmin) return false;
    return this.canManage(hotel._id);
  }

  // ============ LOAD DATA ============

  // Helper function để extract businessId từ hotel (xử lý cả populated và non-populated)
  private extractBusinessId(hotel: Hotel): string | null {
    if (!hotel || !hotel.businessId) {
      return null;
    }
    
    // Nếu là string, trả về trực tiếp
    if (typeof hotel.businessId === 'string') {
      return hotel.businessId;
    }
    
    // Nếu là object
    if (typeof hotel.businessId === 'object' && hotel.businessId !== null) {
      const businessIdObj = hotel.businessId as { _id?: string | { toString(): string }; [key: string]: any };
      
      // Nếu có _id
      if ('_id' in businessIdObj && businessIdObj._id) {
        if (typeof businessIdObj._id === 'string') {
          return businessIdObj._id;
        } else if (typeof businessIdObj._id === 'object' && 'toString' in businessIdObj._id) {
          return businessIdObj._id.toString();
        }
      }
      
      // Nếu object có method toString
      if (typeof (businessIdObj as any).toString === 'function') {
        return (businessIdObj as any).toString();
      }
    }
    
    return null;
  }

  loadHotels(): void {
    this.isLoading = true;
    this.hotelService.getHotels().subscribe({
      next: (data) => {
        if (this.isAdmin) {
          // Admin thấy tất cả hotels
          this.hotels = data;
        } else if (this.isBusiness && this.currentUser?.businessId) {
          // Business chỉ thấy hotels thuộc business của mình
          let userBusinessIdStr: string | null = null;
          
          if (typeof this.currentUser.businessId === 'string') {
            userBusinessIdStr = this.currentUser.businessId;
          } else if (typeof this.currentUser.businessId === 'object' && this.currentUser.businessId !== null) {
            const businessIdObj = this.currentUser.businessId as any;
            if (businessIdObj._id) {
              userBusinessIdStr = typeof businessIdObj._id === 'string' 
                ? businessIdObj._id 
                : businessIdObj._id.toString();
            } else if (typeof businessIdObj.toString === 'function') {
              userBusinessIdStr = businessIdObj.toString();
            }
          }
          
          this.hotels = data.filter(hotel => {
            const hotelBusinessId = this.extractBusinessId(hotel);
            return hotelBusinessId && userBusinessIdStr && hotelBusinessId.toString() === userBusinessIdStr.toString();
          });
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
        this.message.error(this.translate.instant('HOTEL_MANAGEMENT.LOAD_HOTELS_ERROR'));
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
        this.message.error(this.translate.instant('HOTEL_MANAGEMENT.LOAD_BUSINESSES_ERROR'));
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
        this.message.warning(this.translate.instant('HOTEL_MANAGEMENT.NO_EDIT_PERMISSION'));
        return;
      }
      
      this.editId = hotel._id!;
      this.selectedHotel = { ...hotel };
      this.hotelForm.patchValue({
        name: hotel.name,
        businessId: hotel.businessId,
        taxId: (hotel as any).taxId || '',
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
        },
        logo: (hotel as any).logo || ''
      });
      
      // Lưu logoId nếu có
      this.logoId = (hotel as any).logoId || null;
      
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
        this.message.warning(this.translate.instant('HOTEL_MANAGEMENT.NO_CREATE_PERMISSION'));
        return;
      }
      
      this.editId = 'new';
      this.selectedHotel = {} as Hotel;
      this.hotelForm.reset({
        status: 'active',
        taxId: '',
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
    this.logoId = null;
    this.fileList = [];
    this.hotelForm.reset({
      status: 'active',
      taxId: '',
      settings: {
        checkInTime: '14:00',
        checkOutTime: '12:00',
        currency: 'VND',
        language: 'vi',
        taxRate: 0
      },
      facilities: [],
      logo: ''
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
      this.message.warning(this.translate.instant('HOTEL_MANAGEMENT.BANK_INFO_REQUIRED'));
      return;
    }

    // Tạo URL QR thanh toán SePay
    const encodedAccount = encodeURIComponent(accountNumber);
    const encodedBank = encodeURIComponent(bankName);
    this.qrPaymentUrl = `https://qr.sepay.vn/img?acc=${encodedAccount}&bank=${encodedBank}`;
    
    // Lưu tên người thụ hưởng
    this.qrBeneficiaryName = beneficiaryName || bankAccountGroup?.get('accountHolderName')?.value?.trim() || '';
    
    this.showQrPreview = true;
    this.message.success(this.translate.instant('HOTEL_MANAGEMENT.QR_SUCCESS'));
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
      Object.values(this.hotelForm.controls).forEach((control: any) => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
        if (control instanceof FormGroup) {
          Object.values(control.controls).forEach((innerControl: any) => {
            if (innerControl.invalid) {
              innerControl.markAsDirty();
              innerControl.updateValueAndValidity({ onlySelf: true });
            }
          });
        }
      });
      this.message.warning(this.translate.instant('HOTEL_MANAGEMENT.FILL_REQUIRED_FIELDS'));
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
    
    // Xử lý logo: nếu có logoId thì dùng, nếu không dùng logo (URL)
    if (this.logoId) {
      hotelData.logoId = this.logoId;
      hotelData.logo = this.getImageUrl(this.logoId);
    } else if (hotelData.logo) {
      if (hotelData.logo.includes('/files/')) {
        const extractedId = hotelData.logo.split('/files/')[1]?.split('?')[0];
        if (extractedId) {
          hotelData.logoId = extractedId;
        } else {
          hotelData.logoId = null;
        }
      } else {
        hotelData.logoId = null;
      }
    } else {
      hotelData.logo = '';
      hotelData.logoId = null;
    }
    
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
          this.message.success(this.translate.instant('HOTEL_MANAGEMENT.UPDATE_SUCCESS'));
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error updating hotel:', error);
          this.message.error(error.error?.message || this.translate.instant('HOTEL_MANAGEMENT.UPDATE_ERROR'));
          this.isLoading = false;
        }
      });
    } else {
      this.hotelService.createHotel(hotelData).subscribe({
        next: (newHotel) => {
          this.hotels = [...this.hotels, newHotel];
          this.stopEdit();
          this.message.success(this.translate.instant('HOTEL_MANAGEMENT.CREATE_SUCCESS'));
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error creating hotel:', error);
          this.message.error(error.error?.message || this.translate.instant('HOTEL_MANAGEMENT.CREATE_ERROR'));
          this.isLoading = false;
        }
      });
    }
  }

  deleteHotel(id: string): void {
    if (!this.canDelete(id)) {
      this.message.error(this.translate.instant('HOTEL_MANAGEMENT.NO_DELETE_PERMISSION'));
      return;
    }

    this.modal.confirm({
      nzTitle: this.translate.instant('HOTEL_MANAGEMENT.CONFIRM_DELETE_TITLE'),
      nzContent: this.translate.instant('HOTEL_MANAGEMENT.CONFIRM_DELETE_MESSAGE'),
      nzOkText: this.translate.instant('HOTEL_MANAGEMENT.DELETE'),
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
            this.message.success(this.translate.instant('HOTEL_MANAGEMENT.DELETE_SUCCESS'));
          },
          error: (error) => {
            console.error('Error deleting hotel:', error);
            this.message.error(error.error?.message || this.translate.instant('HOTEL_MANAGEMENT.DELETE_ERROR'));
          }
        });
      },
      nzCancelText: this.translate.instant('HOTEL_MANAGEMENT.CANCEL')
    });
  }

  // ============ STATUS MANAGEMENT ============

  /**
   * Block/Suspend hotel - cascade ảnh hưởng tất cả staff
   */
  blockHotel(hotelId: string): void {
    if (!this.canBlockHotel(this.hotels.find(h => h._id === hotelId)!)) {
      this.message.error(this.translate.instant('HOTEL_MANAGEMENT.NO_SUSPEND_PERMISSION'));
      return;
    }

    this.modal.confirm({
      nzTitle: this.translate.instant('HOTEL_MANAGEMENT.CONFIRM_SUSPEND_TITLE'),
      nzContent: `<b style="color: red;">${this.translate.instant('COMMON.WARNING')}:</b> ${this.translate.instant('HOTEL_MANAGEMENT.CONFIRM_SUSPEND_MESSAGE')}`,
      nzOkText: this.translate.instant('HOTEL_MANAGEMENT.SUSPEND'),
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.updateHotelStatusLogic(hotelId, 'suspended', this.translate.instant('HOTEL_MANAGEMENT.SUSPEND_SUCCESS'));
      },
      nzCancelText: this.translate.instant('HOTEL_MANAGEMENT.CANCEL')
    });
  }

  getActivatedMessage(): string {
    return this.translate.instant('HOTEL_MANAGEMENT.ACTIVATED');
  }

  getActivateSuccessMessage(): string {
    return this.translate.instant('HOTEL_MANAGEMENT.ACTIVATE_SUCCESS');
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
        this.message.error(error.error?.message || this.translate.instant('HOTEL_MANAGEMENT.UPDATE_STATUS_ERROR'));
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

  getBusinessName(businessId: string | { _id: string; [key: string]: any } | undefined): string {
    if (!businessId) return this.translate.instant('COMMON.N_A');
    
    // Extract businessId nếu là object
    const id = typeof businessId === 'object' && businessId !== null && '_id' in businessId 
      ? businessId._id 
      : businessId;
    
    if (!id || typeof id !== 'string') return this.translate.instant('COMMON.N_A');
    const business = this.businesses.find((b: Business) => b._id === id);
    return business ? business.name : this.translate.instant('COMMON.N_A');
  }

  getHotelStatusLabel(statusValue: HotelStatusType | undefined): string {
    if (!statusValue) return this.translate.instant('COMMON.N_A');
    const statusMap: { [key: string]: string } = {
      'active': this.translate.instant('HOTEL_MANAGEMENT.STATUS_OPTIONS.ACTIVE'),
      'inactive': this.translate.instant('HOTEL_MANAGEMENT.STATUS_OPTIONS.INACTIVE'),
      'maintenance': this.translate.instant('HOTEL_MANAGEMENT.STATUS_OPTIONS.MAINTENANCE'),
      'suspended': this.translate.instant('HOTEL_MANAGEMENT.STATUS_OPTIONS.SUSPENDED')
    };
    return statusMap[statusValue] || statusValue;
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
    if (!managerId) return this.translate.instant('HOTEL_MANAGEMENT.NO_MANAGER');
    if (typeof managerId === 'object' && managerId !== null && '_id' in managerId) {
      return managerId.fullName || managerId.username || this.translate.instant('COMMON.N_A');
    }
    if (typeof managerId === 'string') {
      const manager = this.availableManagers.find((m: User) => m._id === managerId);
      return manager ? (manager.fullName || manager.username || this.translate.instant('COMMON.N_A')) : this.translate.instant('COMMON.N_A');
    }
    return this.translate.instant('COMMON.N_A');
  }

  /**
   * Kiểm tra hotel có bị cascade block không
   */
  isCascadeBlocked(hotel: Hotel): boolean {
    return hotel.status === 'suspended' || hotel.status === 'inactive';
  }

  // ============ LOGO UPLOAD ============

  get uploadHeaders(): { [key: string]: string } {
    const token = this.authService.getToken();
    return {
      'Authorization': token || ''
    };
  }

  handleLogoChange(info: NzUploadChangeParam): void {
    if (info.file.status === 'uploading') {
      this.isLoadingUpload = true;
      return;
    }
    
    if (info.file.status === 'done') {
      if (info.file.response) {
        const response = info.file.response;
        const imageId = response.imageId;
        const imageUrl = response.imageUrl || this.getImageUrl(imageId);
        
        this.logoId = imageId;
        this.hotelForm.patchValue({
          logo: imageUrl
        });
        this.message.success(this.translate.instant('HOTEL_MANAGEMENT.UPLOAD_LOGO_SUCCESS'));
      }
      this.isLoadingUpload = false;
    } else if (info.file.status === 'error') {
      this.message.error(`${this.translate.instant('HOTEL_MANAGEMENT.UPLOAD_LOGO_ERROR')} ${info.file.error?.message || this.translate.instant('COMMON.ERROR')}`);
      console.error('Upload error:', info.file.error);
      this.isLoadingUpload = false;
    }
  }

  beforeUpload = (file: NzUploadFile): boolean => {
    const isImage = file.type?.startsWith('image/');
    if (!isImage) {
      this.message.error(this.translate.instant('HOTEL_MANAGEMENT.IMAGE_ONLY'));
      return false;
    }
    const isLt5M = (file.size || 0) / 1024 / 1024 < 5;
    if (!isLt5M) {
      this.message.error(this.translate.instant('HOTEL_MANAGEMENT.IMAGE_SIZE_LIMIT'));
      return false;
    }
    this.fileList = this.fileList.concat(file);
    return true;
  };

  getImageUrl(urlOrId: string | null | undefined): string {
    if (!urlOrId) return '';
    if (urlOrId.startsWith('http://') || urlOrId.startsWith('https://')) {
      return urlOrId;
    }
    if (urlOrId.startsWith('/files/')) {
      return `${this.apiBaseUrl}${urlOrId}`;
    }
    return `${this.apiBaseUrl}/files/${urlOrId}`;
  }

  handleLogoError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.src = 'assets/images/default-logo.png'; // Fallback logo
      img.style.display = 'block'; // Ensure it's visible
    }
  }
}
