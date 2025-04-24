import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BusinessService } from '../../services/business.service'; 
import { Business } from '../../interfaces/business';
import { Hotel } from '../../interfaces/hotel';
import { HotelService } from '../../services/hotel.service';
import { AuthService } from '../../services/auth.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { UserService } from '../../services/user.service';

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
  statusOptions = [
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'active', label: 'Hoạt động' },
    { value: 'inactive', label: 'Không hoạt động' },
    { value: 'block', label: 'Bị khóa' },
    { value: 'reject', label: 'Bị từ chối' },
    { value: 'unactive', label: 'Chưa kích hoạt' }
  ];
  businessStatuses = ['pending', 'active', 'inactive', 'block', 'reject', 'unactive'] as const;

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
      address: ['', Validators.required], 
      tax_code: [0, [Validators.required, Validators.min(1)]],
      contact: this.fb.group({
        phone: ['', Validators.required],
        email: ['', [Validators.required, Validators.email]]
      }),
      hotels: [[]],
      status: ['pending']
    });
  }

  ngOnInit(): void { 
    // Kiểm tra quyền admin bằng cách lấy thông tin người dùng
    this.userService.getUserInfor().subscribe(
      (user) => {
        this.isAdmin = user && user.role === 'admin';
        this.loadBusinesses();
        this.loadHotels();
      },
      (error) => {
        console.error('Error getting user info:', error);
        this.loadBusinesses();
        this.loadHotels();
      }
    );
  }

  startEdit(id: string): void {
    this.editId = id;
    const businessToEdit = this.businesses.find(b => b._id === id);
    if (businessToEdit) {
      this.selectedBusiness = { ...businessToEdit };
      this.businessForm.patchValue({
        name: this.selectedBusiness.name,
        tax_code: this.selectedBusiness.tax_code,
        address: this.selectedBusiness.address,
        contact: {
          phone: this.selectedBusiness.contact.phone,
          email: this.selectedBusiness.contact.email
        },
        hotels: this.selectedBusiness.hotels || [],
        status: this.selectedBusiness.status || 'pending'
      });
    }
  }
  
  stopEdit(): void {
    this.editId = null;
    this.selectedBusiness = null;
    this.businessForm.reset();
  }
 
  loadHotels(): void {
    this.isLoading = true;
    this.hotelService.getHotels().subscribe(
      data => {
        // Nếu là admin, lấy tất cả khách sạn
        if (this.isAdmin) {
          this.availableHotels = data;
        } else {
          // Nếu là business, chỉ lấy khách sạn của business đó
          const businessId = this.authService.getBusinessId();
          if (businessId) {
            this.availableHotels = data.filter(hotel => hotel.businessId === businessId);
          }
        }
        this.isLoading = false;
      },
      error => {
        console.error('Error fetching hotels:', error);
        this.message.error('Không thể tải danh sách khách sạn');
        this.isLoading = false;
      }
    );
  }
  
  loadBusinesses(): void {
    this.isLoading = true;
    this.businessService.getBusinesses().subscribe(
      data => {
        // Nếu là admin, lấy tất cả doanh nghiệp
        if (this.isAdmin) {
          this.businesses = data;
        } else {
          // Nếu là business, chỉ lấy doanh nghiệp của mình
          const businessId = this.authService.getBusinessId();
          if (businessId) {
            this.businesses = data.filter(business => business._id === businessId);
          } else {
            this.businesses = [];
          }
        }
        
        // Xử lý danh sách hotels để hiển thị đúng trong template
        this.businesses.forEach(business => {
          // Kiểm tra xem hotels có phải là mảng đối tượng
          if (business.hotels && business.hotels.length > 0 && typeof business.hotels[0] !== 'string') {
            // Nếu là mảng đối tượng, chuyển đổi thành mảng ID
            business._hotelObjects = [...business.hotels];
            business.hotels = business._hotelObjects.map((hotel: any) => hotel._id);
          }
        });
        
        this.isLoading = false;
      },
      error => {
        console.error('Error fetching businesses:', error);
        this.message.error('Không thể tải danh sách doanh nghiệp');
        this.isLoading = false;
      }
    );
  }

  createBusiness(): void {
    if (this.businessForm.valid) {
      this.isLoading = true;
      const newBusiness: Business = this.businessForm.value;

      this.businessService.createBusiness(newBusiness).subscribe(
        (data: Business) => {
          this.businesses.push(data);
          this.businessForm.reset();
          this.message.success('Đã tạo doanh nghiệp thành công');
          this.isLoading = false;
        },
        error => {
          console.error('Error creating business:', error);
          this.message.error('Không thể tạo doanh nghiệp');
          this.isLoading = false;
        }
      );
    } else {
      this.message.warning('Vui lòng điền đầy đủ thông tin doanh nghiệp');
      Object.values(this.businessForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity();
        }
      });
    }
  }

  updateBusiness(): void {
    if (this.selectedBusiness && this.businessForm.valid) {
      this.isLoading = true;
      this.businessService.updateBusiness(this.selectedBusiness._id!, this.businessForm.value).subscribe(
        () => {
          this.loadBusinesses();
          this.loadHotels();
          this.businessForm.reset();
          this.selectedBusiness = null;
          this.message.success('Đã cập nhật doanh nghiệp thành công');
          this.isLoading = false;
        },
        error => {
          console.error('Error updating business:', error);
          this.message.error('Không thể cập nhật doanh nghiệp');
          this.isLoading = false;
        }
      );
    }
  }

  deleteBusiness(id: string): void {
    this.isLoading = true;
    this.businessService.deleteBusiness(id).subscribe(
      () => {
        this.businesses = this.businesses.filter(b => b._id !== id);
        this.selectedBusiness = null;
        this.message.success('Đã xóa doanh nghiệp thành công');
        this.isLoading = false;
      },
      error => {
        console.error('Error deleting business:', error);
        this.message.error('Không thể xóa doanh nghiệp');
        this.isLoading = false;
      }
    );
  }

  // Trả về mảng an toàn để hiển thị trong template
  getHotelArray(business: Business): any[] {
    if (!business.hotels || !Array.isArray(business.hotels)) {
      return [];
    }
    
    // Kiểm tra nếu hotels đã là mảng đối tượng
    if (business.hotels.length > 0 && typeof business.hotels[0] !== 'string') {
      return business.hotels as any[];
    }
    
    // Nếu là mảng ID, trả về các ID
    return business.hotels as string[];
  }

  // Lấy tên khách sạn từ ID
  getHotelName(hotelIdOrObject: string | any): string {
    // Kiểm tra nếu đầu vào là một đối tượng (Hotel object) hay một chuỗi (ID)
    if (typeof hotelIdOrObject === 'string') {
      // Nếu là ID, tìm khách sạn tương ứng
      const hotel = this.availableHotels.find(h => h._id === hotelIdOrObject);
      return hotel ? hotel.name : 'Không xác định';
    } else if (hotelIdOrObject && hotelIdOrObject._id) {
      // Nếu là đối tượng Hotel, trả về tên của nó
      return hotelIdOrObject.name || 'Không xác định';
    }
    return 'Không xác định';
  }

  // Kiểm tra quyền để hiển thị nút thao tác
  canManage(businessId: string): boolean {
    return this.isAdmin || this.authService.canAccessResource(businessId);
  }

  /**
   * Mở chi tiết doanh nghiệp khi click vào dòng
   */
  viewBusinessDetails(business: Business): void {
    this.selectedViewBusiness = business;
  }
  
  /**
   * Đóng drawer chi tiết
   */
  closeBusinessDetails(): void {
    this.selectedViewBusiness = null;
  }

  /**
   * Duyệt doanh nghiệp
   */
  approveBusiness(businessId: string): void {
    this.updateBusinessStatus(businessId, 'active');
  }

  /**
   * Từ chối doanh nghiệp
   */
  rejectBusiness(businessId: string): void {
    this.updateBusinessStatus(businessId, 'inactive');
  }

  // Thêm hàm để lấy tên hiển thị của trạng thái
  getStatusLabel(status: string | undefined): string {
    if (!status) return 'Không xác định';
    const statusObj = this.statusOptions.find(opt => opt.value === status);
    return statusObj ? statusObj.label : 'Không xác định';
  }

  // Cập nhật trạng thái doanh nghiệp
  updateBusinessStatus(businessId: string, status: 'pending' | 'active' | 'inactive' | 'block' | 'reject' | 'unactive'): void {
    this.isLoading = true;
    this.businessService.updateBusinessStatus(businessId, status).subscribe(
      (updatedBusiness) => {
        // Cập nhật doanh nghiệp trong danh sách
        const index = this.businesses.findIndex(b => b._id === businessId);
        if (index !== -1) {
          this.businesses[index].status = status;
          // Cập nhật selectedViewBusiness nếu đang xem
          if (this.selectedViewBusiness && this.selectedViewBusiness._id === businessId) {
            this.selectedViewBusiness.status = status;
          }
        }
        this.message.success('Đã cập nhật trạng thái doanh nghiệp thành công');
        this.isLoading = false;
      },
      error => {
        console.error('Error updating business status:', error);
        this.message.error('Không thể cập nhật trạng thái doanh nghiệp');
        this.isLoading = false;
      }
    );
  }
}
