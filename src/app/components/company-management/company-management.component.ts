import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BusinessService } from '../../services/business.service'; 
import { Business, BusinessAddress, BusinessContactInfo } from '../../interfaces/business';
import { Hotel } from '../../interfaces/hotel';
import { HotelService } from '../../services/hotel.service';
import { AuthService, PermissionRules } from '../../services/auth.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { UserService } from '../../services/user.service';
import { User } from '../../interfaces/user';
import { NzUploadFile, NzUploadChangeParam } from 'ng-zorro-antd/upload';
import { HttpClient } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';

const businessStatusesList = ['pending', 'active', 'inactive', 'suspended'] as const;
type BusinessStatus = typeof businessStatusesList[number];

@Component({
  selector: 'app-company-management',
  templateUrl: './company-management.component.html',
  styleUrls: ['./company-management.component.css']
})
export class CompanyManagementComponent implements OnInit, OnDestroy {
  businessForm: FormGroup;
  businesses: Business[] = [];
  selectedBusiness: Business | null = null;
  availableHotels: Hotel[] = [];
  isLoading = false;
  editId: string | null = null;
  selectedViewBusiness: Business | null = null;
  currentUser: User | null = null;
  permissions: PermissionRules | null = null;
  apiBaseUrl = environment.apiUrl;
  uploadUrl = `${this.apiBaseUrl}/files/upload`;
  fileList: any[] = [];
  logoId: string | null = null;
  isLoadingUpload = false;

  // Trạng thái hiển thị - sẽ được khởi tạo trong ngOnInit
  statusOptions: { value: BusinessStatus, label: string }[] = [];

  readonly businessStatuses = businessStatusesList;
  
  private subscriptions = new Subscription();

  constructor(
    private businessService: BusinessService, 
    private hotelService: HotelService, 
    private fb: FormBuilder,
    private authService: AuthService,
    private message: NzMessageService,
    private modal: NzModalService,
    private userService: UserService,
    private http: HttpClient,
    private translate: TranslateService
  ) { 
    this.businessForm = this.fb.group({
      name: ['', Validators.required],
      legalName: [''],
      taxId: ['', Validators.required],
      address: this.fb.group({
        street: [''],
        city: [''],
        state: [''],
        country: [''],
        postalCode: ['']
      }),
      contactInfo: this.fb.group({
        phone: ['', Validators.required],
        email: ['', [Validators.required, Validators.email]],
        website: ['']
      }),
      hotels: [[]],
      status: ['pending' as BusinessStatus, Validators.required],
      logo: ['']
    });
  }

  ngOnInit(): void { 
    this.initStatusOptions();
    this.currentUser = this.authService.getCurrentUser();
    this.permissions = this.authService.getPermissionRules();
    this.loadBusinesses();
    this.loadHotels();
    
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

  private initStatusOptions(): void {
    this.statusOptions = [
      { value: 'pending', label: this.translate.instant('COMPANY_MANAGEMENT.STATUS_PENDING') },
      { value: 'active', label: this.translate.instant('COMPANY_MANAGEMENT.STATUS_ACTIVE') },
      { value: 'inactive', label: this.translate.instant('COMPANY_MANAGEMENT.STATUS_INACTIVE') },
      { value: 'suspended', label: this.translate.instant('COMPANY_MANAGEMENT.STATUS_SUSPENDED') }
    ];
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

  get canManageBusinesses(): boolean {
    return this.permissions?.canManageBusinesses || false;
  }

  get canCreateBusiness(): boolean {
    // Chỉ admin mới có thể tạo business mới
    // Business KHÔNG thể tạo doanh nghiệp
    return this.isAdmin;
  }

  get canEditBusiness(): boolean {
    // Chỉ admin mới có thể sửa business
    // Business KHÔNG thể cập nhật doanh nghiệp, chỉ xem
    return this.isAdmin;
  }

  /**
   * Kiểm tra có thể quản lý business cụ thể không
   */
  canManage(businessId?: string): boolean {
    if (!businessId) return false;
    if (!this.currentUser) return false;
    
    // Admin có quyền quản lý tất cả
    if (this.isAdmin) return true;
    
    // Business chỉ quản lý được business của mình
    if (this.isBusiness) {
      return this.currentUser.businessId === businessId;
    }
    
    return false;
  }

  /**
   * Kiểm tra có thể block business không
   * - Admin không thể bị block
   * - Chỉ admin mới có quyền block
   */
  canBlockBusiness(business: Business): boolean {
    if (!this.isAdmin) return false;
    // Không thể block business đang active của admin
    return true;
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
          this.availableHotels = data;
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
          
          this.availableHotels = data.filter(hotel => {
            const hotelBusinessId = this.extractBusinessId(hotel);
            return hotelBusinessId && userBusinessIdStr && hotelBusinessId.toString() === userBusinessIdStr.toString();
          });
        } else {
          this.availableHotels = [];
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching hotels:', error);
        this.message.error(this.translate.instant('COMPANY_MANAGEMENT.LOAD_HOTELS_ERROR'));
        this.isLoading = false;
      }
    });
  }

  private getBusinessHotelIds(): string[] {
    const userBusiness = this.businesses.find(b => b._id === this.currentUser?.businessId);
    if (!userBusiness || !userBusiness.hotels) return [];
    
    return userBusiness.hotels
      .map(h => typeof h === 'string' ? h : (h as Hotel)._id)
      .filter((id): id is string => id !== undefined);
  }

  loadBusinesses(): void {
    this.isLoading = true;
    this.businessService.getBusinesses().subscribe({
      next: (data: Business[]) => {
        if (this.isAdmin) {
          // Admin thấy tất cả businesses
          this.businesses = data;
        } else if (this.isBusiness && this.currentUser?.businessId) {
          // Business chỉ thấy business của mình
          this.businesses = data.filter(business => 
            business._id === this.currentUser?.businessId
          );
        } else {
          this.businesses = [];
        }
        
        // Reload hotels sau khi load businesses (để filter đúng)
        if (!this.isAdmin) {
          this.loadHotels();
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching businesses:', error);
        this.message.error(error.message || this.translate.instant('COMPANY_MANAGEMENT.LOAD_BUSINESSES_ERROR'));
        this.isLoading = false;
      }
    });
  }

  // ============ FORM ACTIONS ============

  startEdit(businessId: string): void {
    if (!this.canManage(businessId)) {
      this.message.warning(this.translate.instant('COMPANY_MANAGEMENT.NO_EDIT_PERMISSION'));
      return;
    }

    this.editId = businessId;
    const businessToEdit = this.businesses.find(b => b._id === businessId);
    if (businessToEdit) {
      this.selectedBusiness = { ...businessToEdit };
      this.businessForm.patchValue({
        name: this.selectedBusiness.name,
        legalName: this.selectedBusiness.legalName,
        taxId: this.selectedBusiness.taxId,
        address: {
          street: this.selectedBusiness.address?.street,
          city: this.selectedBusiness.address?.city,
          state: this.selectedBusiness.address?.state,
          country: this.selectedBusiness.address?.country,
          postalCode: this.selectedBusiness.address?.postalCode
        },
        contactInfo: {
          phone: this.selectedBusiness.contactInfo?.phone,
          email: this.selectedBusiness.contactInfo?.email,
          website: this.selectedBusiness.contactInfo?.website
        },
        hotels: Array.isArray(this.selectedBusiness.hotels) 
          ? this.selectedBusiness.hotels.map(h => typeof h === 'string' ? h : (h as Hotel)._id) 
          : [],
        status: this.selectedBusiness.status || 'pending',
        logo: this.selectedBusiness.logo || ''
      });
      
      // Lưu logoId nếu có
      this.logoId = (this.selectedBusiness as any).logoId || null;
    }
  }
  
  stopEdit(): void {
    this.editId = null;
    this.selectedBusiness = null;
    this.businessForm.reset({
      name: '',
      legalName: '',
      taxId: '',
      status: 'pending' as BusinessStatus,
      address: { street: '', city: '', state: '', country: '', postalCode: '' },
      contactInfo: { phone: '', email: '', website: '' },
      hotels: [],
      logo: ''
    });
    this.logoId = null;
  }

  createBusiness(): void {
    if (!this.canCreateBusiness) {
      this.message.error(this.translate.instant('COMPANY_MANAGEMENT.NO_CREATE_PERMISSION'));
      return;
    }

    if (this.businessForm.invalid) {
      this.markFormGroupTouched(this.businessForm);
      this.message.warning(this.translate.instant('COMPANY_MANAGEMENT.FILL_REQUIRED_FIELDS'));
      return;
    }

    this.isLoading = true;
    const businessData: Partial<Business> = {
      ...this.businessForm.value,
      ownerId: this.currentUser?._id // Thêm ownerId từ user hiện tại
    };

    console.log('Creating business with data:', businessData);
    console.log('Current user:', this.currentUser);

    this.businessService.createBusiness(businessData).subscribe({
      next: (createdBusiness: Business) => {
        this.businesses = [...this.businesses, createdBusiness];
        this.stopEdit();
        this.message.success(this.translate.instant('COMPANY_MANAGEMENT.CREATE_SUCCESS'));
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error creating business:', error);
        // Hiển thị lỗi chi tiết hơn
        const errorMessage = error.error?.message || error.statusText || error.message || 'Không thể tạo doanh nghiệp';
        this.message.error(errorMessage);
        this.isLoading = false;
      }
    });
  }

  updateBusiness(): void {
    if (!this.editId || !this.selectedBusiness) {
      this.message.error(this.translate.instant('COMPANY_MANAGEMENT.NO_BUSINESS_SELECTED'));
      return;
    }

    if (!this.canManage(this.editId)) {
      this.message.error(this.translate.instant('COMPANY_MANAGEMENT.NO_UPDATE_PERMISSION'));
      return;
    }

    if (this.businessForm.invalid) {
      this.markFormGroupTouched(this.businessForm);
      this.message.warning(this.translate.instant('COMPANY_MANAGEMENT.FILL_REQUIRED_FIELDS'));
      return;
    }

    this.isLoading = true;
    const businessDataValue = this.businessForm.value;
    // Xử lý logo: nếu có logoId thì dùng, nếu không dùng logo (URL)
    const logoValue = businessDataValue.logo;
    const logoData: any = {};
    if (this.logoId) {
      logoData.logoId = this.logoId;
      logoData.logo = `${this.apiBaseUrl}/files/${this.logoId}`;
    } else if (logoValue) {
      logoData.logo = logoValue;
      // Nếu là URL từ /files/, extract imageId
      if (logoValue.includes('/files/')) {
        const imageId = logoValue.split('/files/')[1]?.split('?')[0];
        if (imageId) {
          logoData.logoId = imageId;
        }
      }
    }
    
    const updatedBusinessData: Partial<Business> = {
      name: businessDataValue.name,
      legalName: businessDataValue.legalName,
      taxId: businessDataValue.taxId,
      address: businessDataValue.address as BusinessAddress,
      contactInfo: businessDataValue.contactInfo as BusinessContactInfo,
      hotels: businessDataValue.hotels,
      status: this.isAdmin ? businessDataValue.status : undefined, // Chỉ admin mới có thể thay đổi status
      ...logoData
    };

    this.businessService.updateBusiness(this.editId, updatedBusinessData).subscribe({
      next: (updatedBusiness: Business) => {
        const index = this.businesses.findIndex(b => b._id === this.editId);
        if (index !== -1) {
          this.businesses[index] = updatedBusiness;
          this.businesses = [...this.businesses];
        }
        this.stopEdit();
        this.message.success(this.translate.instant('COMPANY_MANAGEMENT.UPDATE_SUCCESS'));
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error updating business:', error);
        this.message.error(error.error?.message || error.message || this.translate.instant('COMPANY_MANAGEMENT.UPDATE_ERROR'));
        this.isLoading = false;
      }
    });
  }

  deleteBusiness(id: string): void {
    if (!this.isAdmin) {
      this.message.error(this.translate.instant('COMPANY_MANAGEMENT.NO_DELETE_PERMISSION'));
      return;
    }

    this.modal.confirm({
      nzTitle: this.translate.instant('COMPANY_MANAGEMENT.CONFIRM_DELETE_TITLE'),
      nzContent: this.translate.instant('COMPANY_MANAGEMENT.CONFIRM_DELETE_MESSAGE'),
      nzOkText: this.translate.instant('COMPANY_MANAGEMENT.DELETE'),
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.businessService.deleteBusiness(id).subscribe({
          next: () => {
            this.businesses = this.businesses.filter((b: Business) => b._id !== id);
            this.message.success(this.translate.instant('COMPANY_MANAGEMENT.DELETE_SUCCESS'));
            if (this.selectedBusiness?._id === id) {
              this.stopEdit();
            }
            if (this.selectedViewBusiness?._id === id) {
              this.closeBusinessDetails();
            }
          },
          error: (error) => {
            console.error('Error deleting business:', error);
            this.message.error(error.error?.message || error.message || this.translate.instant('COMPANY_MANAGEMENT.DELETE_ERROR'));
          }
        });
      },
      nzCancelText: this.translate.instant('COMPANY_MANAGEMENT.CANCEL')
    });
  }

  // ============ STATUS MANAGEMENT ============

  /**
   * Block/Suspend business - cascade ảnh hưởng tất cả cấp dưới
   */
  blockBusiness(businessId: string): void {
    if (!this.isAdmin) {
      this.message.error(this.translate.instant('COMPANY_MANAGEMENT.NO_SUSPEND_PERMISSION'));
      return;
    }

    this.modal.confirm({
      nzTitle: this.translate.instant('COMPANY_MANAGEMENT.CONFIRM_SUSPEND_TITLE'),
      nzContent: this.translate.instant('COMPANY_MANAGEMENT.CONFIRM_SUSPEND_MESSAGE'),
      nzOkText: this.translate.instant('COMPANY_MANAGEMENT.SUSPEND'),
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.updateBusinessStatusLogic(businessId, 'suspended', this.translate.instant('COMPANY_MANAGEMENT.SUSPEND_SUCCESS'));
      },
      nzCancelText: this.translate.instant('COMPANY_MANAGEMENT.CANCEL')
    });
  }

  updateBusinessStatusLogic(businessId: string, status: BusinessStatus, successMessage?: string): void {
    if (!this.isAdmin) {
      this.message.error(this.translate.instant('COMPANY_MANAGEMENT.NO_STATUS_CHANGE_PERMISSION'));
      return;
    }

    this.isLoading = true;
    this.businessService.updateBusinessStatus(businessId, status).subscribe({
      next: (updatedBusiness: Business) => {
        const index = this.businesses.findIndex((b: Business) => b._id === businessId);
        if (index !== -1) {
          this.businesses[index] = updatedBusiness;
          this.businesses = [...this.businesses];
        }
        const successMsg = successMessage || this.translate.instant('COMPANY_MANAGEMENT.UPDATE_STATUS_SUCCESS', { status: this.getStatusLabel(status) });
        this.message.success(successMsg);
        this.isLoading = false;
        
        if (this.selectedViewBusiness?._id === businessId) {
          this.selectedViewBusiness = { ...this.selectedViewBusiness, status };
        }
        if (this.editId === businessId) {
          this.businessForm.get('status')?.setValue(status);
        }
      },
      error: (error) => {
        console.error('Error updating business status:', error);
        this.message.error(error.error?.message || error.message || this.translate.instant('COMPANY_MANAGEMENT.UPDATE_STATUS_ERROR'));
        this.isLoading = false;
      }
    });
  }

  // ============ VIEW HELPERS ============

  viewBusinessDetails(business: Business): void {
    if (!this.canManage(business._id)) {
      // Vẫn cho xem chi tiết nhưng không cho thao tác
    }
    this.selectedViewBusiness = business;
  }

  closeBusinessDetails(): void {
    this.selectedViewBusiness = null;
  }

  getHotelArray(business: Business): Hotel[] {
    if (business.hotels && Array.isArray(business.hotels)) {
      return business.hotels.map(hotelOrId => {
        if (typeof hotelOrId === 'object' && hotelOrId !== null && (hotelOrId as Hotel).name) {
          return hotelOrId as Hotel;
        } 
        const foundHotel = this.availableHotels.find(h => h._id === hotelOrId);
        return foundHotel || ({ _id: hotelOrId as string, name: 'Khách sạn không rõ (ID: ' + hotelOrId + ')' } as unknown as Hotel); 
      });
    }
    return [];
  }

  getHotelName(hotelIdOrObject: string | Hotel): string {
    if (typeof hotelIdOrObject === 'string') {
      const hotel = this.availableHotels.find(h => h._id === hotelIdOrObject);
      return hotel ? hotel.name : this.translate.instant('COMPANY_MANAGEMENT.NOT_FOUND');
    }
    return hotelIdOrObject.name; 
  }

  getStatusLabel(statusValue?: BusinessStatus): string {
    if (!statusValue) return this.translate.instant('COMPANY_MANAGEMENT.STATUS_UNKNOWN');
    const option = this.statusOptions.find((opt: { value: BusinessStatus, label: string }) => opt.value === statusValue);
    return option ? option.label : statusValue;
  }

  getStatusColor(status?: BusinessStatus): string {
    switch (status) {
      case 'active': return 'green';
      case 'pending': return 'gold';
      case 'inactive': return 'orange';
      case 'suspended': return 'red';
      default: return 'blue';
    }
  }

  getApproveSuccessMessage(): string {
    return this.translate.instant('COMPANY_MANAGEMENT.APPROVE_SUCCESS');
  }

  getRejectSuccessMessage(): string {
    return this.translate.instant('COMPANY_MANAGEMENT.REJECT_SUCCESS');
  }

  getReactivateSuccessMessage(): string {
    return this.translate.instant('COMPANY_MANAGEMENT.REACTIVATE_SUCCESS');
  }

  /**
   * Kiểm tra business có bị cascade block không
   */
  isCascadeBlocked(business: Business): boolean {
    return business.status === 'suspended' || business.status === 'inactive';
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      control.markAsDirty();
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  get uploadHeaders(): { [key: string]: string } {
    const token = localStorage.getItem('token');
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
        const imageUrl = response.imageUrl || `${this.apiBaseUrl}/files/${imageId}`;
        
        this.logoId = imageId;
        this.businessForm.patchValue({
          logo: imageUrl
        });
        this.message.success(this.translate.instant('COMPANY_MANAGEMENT.UPLOAD_SUCCESS'));
      }
      this.isLoadingUpload = false;
    } else if (info.file.status === 'error') {
      this.message.error(`${this.translate.instant('COMPANY_MANAGEMENT.UPLOAD_ERROR')} ${info.file.error?.message || this.translate.instant('COMPANY_MANAGEMENT.UPLOAD_ERROR_UNKNOWN')}`);
      console.error('Upload error:', info.file.error);
      this.isLoadingUpload = false;
    }
  }

  beforeUpload = (file: NzUploadFile): boolean => {
    const isImage = file.type?.startsWith('image/');
    if (!isImage) {
      this.message.error(this.translate.instant('COMPANY_MANAGEMENT.UPLOAD_IMAGE_ONLY'));
      return false;
    }
    const isLt5M = (file.size || 0) / 1024 / 1024 < 5;
    if (!isLt5M) {
      this.message.error(this.translate.instant('COMPANY_MANAGEMENT.IMAGE_SIZE_ERROR'));
      return false;
    }
    this.fileList = this.fileList.concat(file);
    return true;
  };

  getImageUrl(urlOrId: string | null | undefined): string {
    if (!urlOrId) return '';
    // Nếu là URL đầy đủ (http/https), trả về nguyên
    if (urlOrId.startsWith('http://') || urlOrId.startsWith('https://')) {
      return urlOrId;
    }
    // Nếu là imageId hoặc path, thêm base URL
    if (urlOrId.startsWith('/files/')) {
      return `${this.apiBaseUrl}${urlOrId}`;
    }
    // Nếu chỉ là ID, thêm /files/ prefix
    return `${this.apiBaseUrl}/files/${urlOrId}`;
  }
}
