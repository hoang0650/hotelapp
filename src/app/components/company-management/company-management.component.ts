import { Component, OnInit } from '@angular/core';
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

const businessStatusesList = ['pending', 'active', 'inactive', 'suspended'] as const;
type BusinessStatus = typeof businessStatusesList[number];

@Component({
  selector: 'app-company-management',
  templateUrl: './company-management.component.html',
  styleUrls: ['./company-management.component.css']
})
export class CompanyManagementComponent implements OnInit {
  businessForm: FormGroup;
  businesses: Business[] = [];
  selectedBusiness: Business | null = null;
  availableHotels: Hotel[] = [];
  isLoading = false;
  editId: string | null = null;
  selectedViewBusiness: Business | null = null;
  currentUser: User | null = null;
  permissions: PermissionRules | null = null;
  apiBaseUrl = 'https://nest-production-8106.up.railway.app';
  uploadUrl = `${this.apiBaseUrl}/files/upload`;
  fileList: any[] = [];
  logoId: string | null = null;
  isLoadingUpload = false;

  // Trạng thái hiển thị
  statusOptions: { value: BusinessStatus, label: string }[] = [
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'active', label: 'Hoạt động' },
    { value: 'inactive', label: 'Không hoạt động' },
    { value: 'suspended', label: 'Bị đình chỉ' }
  ];

  readonly businessStatuses = businessStatusesList;

  constructor(
    private businessService: BusinessService, 
    private hotelService: HotelService, 
    private fb: FormBuilder,
    private authService: AuthService,
    private message: NzMessageService,
    private modal: NzModalService,
    private userService: UserService,
    private http: HttpClient
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
    this.currentUser = this.authService.getCurrentUser();
    this.permissions = this.authService.getPermissionRules();
    this.loadBusinesses();
    this.loadHotels();
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

  loadHotels(): void {
    this.isLoading = true;
    this.hotelService.getHotels().subscribe({
      next: (data) => {
        if (this.isAdmin) {
          this.availableHotels = data;
        } else if (this.isBusiness && this.currentUser?.businessId) {
          // Business chỉ thấy hotels thuộc business của mình
          const businessHotelIds = this.getBusinessHotelIds();
          this.availableHotels = data.filter(hotel => 
            hotel._id && businessHotelIds.includes(hotel._id)
          );
        } else {
          this.availableHotels = [];
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching hotels:', error);
        this.message.error('Không thể tải danh sách khách sạn');
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
        this.message.error(error.message || 'Không thể tải danh sách doanh nghiệp');
        this.isLoading = false;
      }
    });
  }

  // ============ FORM ACTIONS ============

  startEdit(businessId: string): void {
    if (!this.canManage(businessId)) {
      this.message.warning('Bạn không có quyền chỉnh sửa doanh nghiệp này');
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
      this.message.error('Bạn không có quyền tạo doanh nghiệp mới');
      return;
    }

    if (this.businessForm.invalid) {
      this.markFormGroupTouched(this.businessForm);
      this.message.warning('Vui lòng điền đầy đủ thông tin bắt buộc.');
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
        this.message.success('Đã tạo doanh nghiệp thành công');
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
      this.message.error('Không có doanh nghiệp nào được chọn để cập nhật.');
      return;
    }

    if (!this.canManage(this.editId)) {
      this.message.error('Bạn không có quyền cập nhật doanh nghiệp này');
      return;
    }

    if (this.businessForm.invalid) {
      this.markFormGroupTouched(this.businessForm);
      this.message.warning('Vui lòng điền đầy đủ thông tin bắt buộc.');
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
        this.message.success('Đã cập nhật doanh nghiệp thành công');
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error updating business:', error);
        this.message.error(error.error?.message || error.message || 'Không thể cập nhật doanh nghiệp');
        this.isLoading = false;
      }
    });
  }

  deleteBusiness(id: string): void {
    if (!this.isAdmin) {
      this.message.error('Chỉ admin mới có quyền xóa doanh nghiệp');
      return;
    }

    this.modal.confirm({
      nzTitle: 'Xác nhận xóa doanh nghiệp',
      nzContent: 'Bạn có chắc chắn muốn xóa doanh nghiệp này? Hành động này sẽ ảnh hưởng đến tất cả khách sạn và nhân viên thuộc doanh nghiệp.',
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.businessService.deleteBusiness(id).subscribe({
          next: () => {
            this.businesses = this.businesses.filter(b => b._id !== id);
            this.message.success('Đã xóa doanh nghiệp thành công');
            if (this.selectedBusiness?._id === id) {
              this.stopEdit();
            }
            if (this.selectedViewBusiness?._id === id) {
              this.closeBusinessDetails();
            }
          },
          error: (error) => {
            console.error('Error deleting business:', error);
            this.message.error(error.error?.message || error.message || 'Không thể xóa doanh nghiệp');
          }
        });
      },
      nzCancelText: 'Hủy'
    });
  }

  // ============ STATUS MANAGEMENT ============

  /**
   * Block/Suspend business - cascade ảnh hưởng tất cả cấp dưới
   */
  blockBusiness(businessId: string): void {
    if (!this.isAdmin) {
      this.message.error('Chỉ admin mới có quyền đình chỉ doanh nghiệp');
      return;
    }

    this.modal.confirm({
      nzTitle: 'Xác nhận đình chỉ doanh nghiệp',
      nzContent: `<b style="color: red;">Cảnh báo:</b> Khi đình chỉ doanh nghiệp, tất cả khách sạn, phòng và nhân viên thuộc doanh nghiệp này sẽ không thể hoạt động.`,
      nzOkText: 'Đình chỉ',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.updateBusinessStatusLogic(businessId, 'suspended', 'Doanh nghiệp và tất cả cấp dưới đã bị đình chỉ.');
      },
      nzCancelText: 'Hủy'
    });
  }

  updateBusinessStatusLogic(businessId: string, status: BusinessStatus, successMessage: string): void {
    if (!this.isAdmin) {
      this.message.error('Bạn không có quyền thay đổi trạng thái doanh nghiệp');
      return;
    }

    this.isLoading = true;
    this.businessService.updateBusinessStatus(businessId, status).subscribe({
      next: (updatedBusiness: Business) => {
        const index = this.businesses.findIndex(b => b._id === businessId);
        if (index !== -1) {
          this.businesses[index] = updatedBusiness;
          this.businesses = [...this.businesses];
        }
        this.message.success(successMessage || `Trạng thái doanh nghiệp được cập nhật thành ${this.getStatusLabel(status)}`);
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
        this.message.error(error.error?.message || error.message || 'Không thể cập nhật trạng thái doanh nghiệp');
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
      return hotel ? hotel.name : 'Không tìm thấy';
    }
    return hotelIdOrObject.name; 
  }

  getStatusLabel(statusValue?: BusinessStatus): string {
    if (!statusValue) return 'Không xác định';
    const option = this.statusOptions.find(opt => opt.value === statusValue);
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
        this.message.success('Tải lên logo thành công');
      }
      this.isLoadingUpload = false;
    } else if (info.file.status === 'error') {
      this.message.error(`Lỗi khi tải lên logo: ${info.file.error?.message || 'Không xác định'}`);
      console.error('Upload error:', info.file.error);
      this.isLoadingUpload = false;
    }
  }

  beforeUpload = (file: NzUploadFile): boolean => {
    const isImage = file.type?.startsWith('image/');
    if (!isImage) {
      this.message.error('Bạn chỉ có thể tải lên file hình ảnh!');
      return false;
    }
    const isLt5M = (file.size || 0) / 1024 / 1024 < 5;
    if (!isLt5M) {
      this.message.error('Hình ảnh phải nhỏ hơn 5MB!');
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
