import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BusinessService } from '../../services/business.service'; 
import { Business, BusinessAddress, BusinessContactInfo } from '../../interfaces/business';
import { Hotel } from '../../interfaces/hotel';
import { HotelService } from '../../services/hotel.service';
import { AuthService } from '../../services/auth.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { UserService } from '../../services/user.service';
import { User } from '../../interfaces/user';

// Define BusinessStatus type here, before it's used in statusOptions
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
  isAdmin = false;
  editId: string | null = null;
  selectedViewBusiness: Business | null = null;
  
  // Use the globally defined BusinessStatus type
  statusOptions: { value: BusinessStatus, label: string }[] = [
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'active', label: 'Hoạt động' },
    { value: 'inactive', label: 'Không hoạt động' },
    { value: 'suspended', label: 'Bị đình chỉ' }
  ];

  // Make businessStatusesList available to the component instance if needed, e.g., for template
  readonly businessStatuses = businessStatusesList;

  constructor(
    private businessService: BusinessService, 
    private hotelService: HotelService, 
    private fb: FormBuilder,
    private authService: AuthService,
    private message: NzMessageService,
    private userService: UserService
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
      status: ['pending' as BusinessStatus, Validators.required]
    });
  }

  ngOnInit(): void { 
    this.userService.getUserInfo().subscribe(
      (user: User) => {
        this.isAdmin = user && (user.role === 'admin' || user.role === 'superadmin');
        this.loadBusinesses();
        this.loadHotels();
      },
      (error: any) => {
        console.error('Error getting user info:', error);
        this.message.error('Không thể xác thực người dùng, một số chức năng có thể bị hạn chế.');
        this.loadBusinesses();
        this.loadHotels();
      }
    );
  }

  startEdit(businessId: string): void {
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
        hotels: Array.isArray(this.selectedBusiness.hotels) ? this.selectedBusiness.hotels.map(h => typeof h === 'string' ? h : (h as Hotel)._id) : [],
        status: this.selectedBusiness.status || 'pending'
      });
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
      hotels: []
    });
  }
 
  loadHotels(): void {
    this.isLoading = true;
    this.hotelService.getHotels().subscribe(
      data => {
        if (this.isAdmin) {
          this.availableHotels = data;
        } else {
          const currentUserId = this.authService.getCurrentUser()?._id;
          if (currentUserId) {
            const ownerBusinesses = this.businesses.filter(b => 
              b.ownerId === currentUserId || 
              (typeof b.ownerId === 'object' && b.ownerId?._id === currentUserId)
            );

            if (this.selectedBusiness && 
                (this.selectedBusiness.ownerId === currentUserId || 
                 (typeof this.selectedBusiness.ownerId === 'object' && this.selectedBusiness.ownerId?._id === currentUserId))) {
              
              const selectedBusinessHotelIds = (this.selectedBusiness.hotels || [])
                .map(h => typeof h === 'string' ? h : (h as Hotel)._id)
                .filter(id => id !== undefined) as string[]; // Lọc undefined và ép kiểu

              this.availableHotels = data.filter(hotel => 
                hotel._id && selectedBusinessHotelIds.includes(hotel._id)
              );

            } else if (ownerBusinesses.length > 0) {
              const ownedHotelIds = ownerBusinesses.reduce((acc, curr) => {
                const hotelIdsForCurrentBusiness = (curr.hotels || [])
                  .map(h => typeof h === 'string' ? h : (h as Hotel)._id)
                  .filter(id => id !== undefined) as string[]; // Lọc undefined và ép kiểu
                return acc.concat(hotelIdsForCurrentBusiness);
              }, [] as string[]);
              
              this.availableHotels = data.filter(hotel => 
                hotel._id && ownedHotelIds.includes(hotel._id)
              );
            } else {
              this.availableHotels = []; 
            }
          } else {
            this.availableHotels = [];
          }
        }
        this.isLoading = false;
      },
      (error: any) => {
        console.error('Error fetching hotels:', error);
        this.message.error('Không thể tải danh sách khách sạn');
        this.isLoading = false;
      }
    );
  }
  
  loadBusinesses(): void {
    this.isLoading = true;
    this.businessService.getBusinesses().subscribe(
      (data: Business[]) => {
        if (this.isAdmin) {
          this.businesses = data;
        } else {
          const currentUser = this.authService.getCurrentUser();
          if (currentUser && currentUser._id) {
            this.businesses = data.filter(business => business.ownerId === currentUser._id || (typeof business.ownerId === 'object' && business.ownerId?._id === currentUser._id) );
          } else {
            this.businesses = [];
          }
        }
        // After businesses are loaded, reload hotels to apply filtering based on loaded businesses if necessary
        // This ensures hotel list is correct for non-admin users if their view depends on their businesses.
        if (!this.isAdmin) {
            this.loadHotels(); 
        }
        this.isLoading = false;
      },
      (error: any) => {
        console.error('Error fetching businesses:', error);
        this.message.error(error.message || 'Không thể tải danh sách doanh nghiệp');
        this.isLoading = false;
      }
    );
  }

  createBusiness(): void {
    if (this.businessForm.invalid) {
      this.markFormGroupTouched(this.businessForm);
      this.message.warning('Vui lòng điền đầy đủ thông tin bắt buộc.');
      return;
    }
    this.isLoading = true;
    const businessData: Partial<Business> = this.businessForm.value;

    this.businessService.createBusiness(businessData).subscribe(
      (createdBusiness: Business) => {
        this.businesses.push(createdBusiness);
        this.businesses = [...this.businesses];
        this.stopEdit();
        this.message.success('Đã tạo doanh nghiệp thành công');
        this.isLoading = false;
      },
      (error: any) => {
        console.error('Error creating business:', error);
        this.message.error(error.error?.message || error.message || 'Không thể tạo doanh nghiệp');
        this.isLoading = false;
      }
    );
  }

  updateBusiness(): void {
    if (!this.editId || !this.selectedBusiness) {
      this.message.error('Không có doanh nghiệp nào được chọn để cập nhật.');
      return;
    }
    if (this.businessForm.invalid) {
      this.markFormGroupTouched(this.businessForm);
      this.message.warning('Vui lòng điền đầy đủ thông tin bắt buộc.');
      return;
    }

    this.isLoading = true;
    const businessDataValue = this.businessForm.value;
    const updatedBusinessData: Partial<Business> = {
        name: businessDataValue.name,
        legalName: businessDataValue.legalName,
        taxId: businessDataValue.taxId,
        address: businessDataValue.address as BusinessAddress,
        contactInfo: businessDataValue.contactInfo as BusinessContactInfo,
        hotels: businessDataValue.hotels,
        status: businessDataValue.status
    };

    this.businessService.updateBusiness(this.editId, updatedBusinessData).subscribe(
      (updatedBusiness: Business) => {
        const index = this.businesses.findIndex(b => b._id === this.editId);
        if (index !== -1) {
          this.businesses[index] = updatedBusiness;
          this.businesses = [...this.businesses];
        }
        this.stopEdit();
        this.message.success('Đã cập nhật doanh nghiệp thành công');
        this.isLoading = false;
      },
      (error: any) => {
        console.error('Error updating business:', error);
        this.message.error(error.error?.message || error.message ||'Không thể cập nhật doanh nghiệp');
        this.isLoading = false;
      }
    );
  }

  deleteBusiness(id: string): void {
    this.businessService.deleteBusiness(id).subscribe(
      () => {
        this.businesses = this.businesses.filter(b => b._id !== id);
        this.businesses = [...this.businesses];
        this.message.success('Đã xóa doanh nghiệp thành công');
        if (this.selectedBusiness?._id === id) {
          this.stopEdit();
        }
      },
      (error: any) => {
        console.error('Error deleting business:', error);
        this.message.error(error.error?.message || error.message || 'Không thể xóa doanh nghiệp');
      }
    );
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

  canManage(businessId?: string): boolean {
    if (!businessId) return false;
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) return false;
    if (this.isAdmin) return true;
    const business = this.businesses.find(b => b._id === businessId);
    return !!business && (business.ownerId === currentUser._id || (typeof business.ownerId === 'object' && business.ownerId?._id === currentUser._id));
  }

  viewBusinessDetails(business: Business): void {
    this.selectedViewBusiness = business;
  }

  closeBusinessDetails(): void {
    this.selectedViewBusiness = null;
  }

  approveBusiness(businessId: string): void {
    this.updateBusinessStatusLogic(businessId, 'active', 'Doanh nghiệp đã được duyệt.');
  }

  rejectBusiness(businessId: string): void {
    this.updateBusinessStatusLogic(businessId, 'inactive', 'Doanh nghiệp đã bị từ chối.'); 
  }

  getStatusLabel(statusValue?: BusinessStatus): string {
    if (!statusValue) return 'Không xác định';
    const option = this.statusOptions.find(opt => opt.value === statusValue);
    return option ? option.label : statusValue;
  }

  updateBusinessStatusLogic(businessId: string, status: BusinessStatus, successMessage: string): void {
    this.isLoading = true;
    this.businessService.updateBusinessStatus(businessId, status).subscribe(
      (updatedBusiness: Business) => {
        const index = this.businesses.findIndex(b => b._id === businessId);
        if (index !== -1) {
          this.businesses[index] = updatedBusiness;
          this.businesses = [...this.businesses];
        }
        this.message.success(successMessage || `Trạng thái doanh nghiệp được cập nhật thành ${this.getStatusLabel(status)}`);
        this.isLoading = false;
        if (this.selectedViewBusiness?._id === businessId) {
          this.selectedViewBusiness.status = status;
        }
        if (this.editId === businessId && this.businessForm.get('status')) {
          this.businessForm.get('status')?.setValue(status);
        }
      },
      (error: any) => {
        console.error('Error updating business status:', error);
        this.message.error(error.error?.message || error.message || 'Không thể cập nhật trạng thái doanh nghiệp');
        this.isLoading = false;
      }
    );
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      control.markAsDirty();
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }
}
