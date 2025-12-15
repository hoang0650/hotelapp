import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Service, ServiceCategory, ALL_SERVICE_CATEGORIES } from '../../interfaces/service';
import { ServiceService } from '../../services/service.service';
import { HotelService } from '../../services/hotel.service';
import { Hotel } from '../../interfaces/hotel';
import { AuthService, PermissionRules } from '../../services/auth.service';
import { User } from '../../interfaces/user';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzUploadFile, NzUploadChangeParam } from 'ng-zorro-antd/upload';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-service-management',
  templateUrl: './service-management.component.html',
  styleUrls: ['./service-management.component.css']
})
export class ServiceManagementComponent implements OnInit {
  serviceForm: FormGroup;
  services: Service[] = [];
  hotels: Hotel[] = [];
  editId: string | null = null;
  selectedService: Service | null = null;
  selectedHotelId: string | null = null;
  categories: string[] = [];
  currentUser: User | null = null;
  permissions: PermissionRules | null = null;

  // Sử dụng ALL_SERVICE_CATEGORIES cho dropdown
  serviceCategoryOptions = ALL_SERVICE_CATEGORIES.map(cat => ({ label: this.getCategoryLabel(cat), value: cat }));

  // Lấy token xác thực
  get authToken(): string {
    return localStorage.getItem('token') || '';
  }

  // Định dạng tiền tệ VND
  formatter = (value: number): string => `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} đ`;

  // Thêm lại các thuộc tính bị thiếu
  isLoading = false;
  imageUrl: string | ArrayBuffer | null = '';
  fileList: NzUploadFile[] = [];
  uploadUrl = 'https://api.cloudinary.com/v1_1/dxtigizsi/image/upload';
  cloudinaryPreset = 'ys0fssyu';

  constructor(
    private fb: FormBuilder,
    private serviceService: ServiceService,
    private hotelService: HotelService,
    public authService: AuthService,
    private message: NzMessageService
  ) {
    this.serviceForm = this.fb.group({
      hotelId: [null, Validators.required],
      name: ['', Validators.required],
      description: [''],
      price: [0, [Validators.required, Validators.min(0)]],
      category: ['custom' as ServiceCategory, Validators.required],
      image: [''],
      isActive: [true, Validators.required],
      currency: ['VND'],
      isCustom: [false],
      // Quản lý kho
      costPrice: [0, [Validators.min(0)]],
      importQuantity: [0, [Validators.min(0)]],
      salesQuantity: [0, [Validators.min(0)]]
    });
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.permissions = this.authService.getPermissionRules();
    this.loadHotels();
    
    // Nếu là business và không có hotel được chọn, load tất cả dịch vụ của business
    if (this.isBusiness && !this.isAdmin && !this.selectedHotelId) {
      this.loadServices(); // Load tất cả dịch vụ của business (không truyền hotelId)
    }
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

  get canCreateService(): boolean {
    return this.isAdmin || this.isBusiness || this.isHotelManager;
  }

  canManage(service: Service): boolean {
    if (!this.currentUser) return false;
    if (this.isAdmin || this.isSuperAdmin) return true;
    
    // Business chỉ quản lý dịch vụ của hotels thuộc business mình
    if (this.isBusiness) {
      const hotel = this.hotels.find(h => h._id === service.hotelId);
      if (!hotel) return false;
      const hotelBusinessId = this.extractBusinessId(hotel);
      return hotelBusinessId === this.currentUser.businessId;
    }
    
    // Hotel manager chỉ quản lý dịch vụ của hotel mình
    if (this.isHotelManager) {
      return service.hotelId === this.currentUser.hotelId;
    }
    
    return false;
  }

  canDelete(service: Service): boolean {
    return this.canManage(service);
  }

  getCategoryLabel(category: ServiceCategory): string {
    switch (category) {
      case 'room_service': return 'Dịch vụ phòng';
      case 'food': return 'Đồ ăn';
      case 'beverage': return 'Đồ uống';
      case 'spa': return 'Spa/Massage';
      case 'transport': return 'Di chuyển';
      case 'custom': return 'Khác';
      default: return category;
    }
  }

  // Helper function để extract businessId từ hotel (xử lý cả populated và non-populated)
  private extractBusinessId(hotel: Hotel): string | null {
    if (!hotel || !hotel.businessId) {
      return null;
    }
    
    if (typeof hotel.businessId === 'object' && hotel.businessId !== null && '_id' in hotel.businessId) {
      return hotel.businessId._id;
    } else if (typeof hotel.businessId === 'string') {
      return hotel.businessId;
    }
    
    return null;
  }

  loadServices(hotelId?: string): void {
    this.isLoading = true;
    this.serviceService.getServices(hotelId).subscribe({
      next: (data) => {
        this.services = data;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Lỗi khi tải danh sách dịch vụ:', error);
        this.message.error('Không thể tải danh sách dịch vụ.');
        this.isLoading = false;
      }
    });
  }

  loadHotels(): void {
    this.hotelService.getHotels().subscribe({
      next: (data) => {
        if (this.isAdmin) {
          this.hotels = data.filter(h => h.status === 'active');
        } else if (this.isBusiness && this.currentUser?.businessId) {
          // Business chỉ thấy hotels thuộc business mình
          this.hotels = data.filter(h => {
            const hotelBusinessId = this.extractBusinessId(h);
            const userBusinessId = this.currentUser?.businessId;
            return hotelBusinessId === userBusinessId && h.status === 'active';
          });
        } else if (this.isHotelManager && this.currentUser?.hotelId) {
          this.hotels = data.filter(h => h._id === this.currentUser?.hotelId);
        } else {
          this.hotels = [];
        }
        
        // Auto-select hotel for hotel manager (chỉ có 1 hotel)
        if (this.isHotelManager && this.hotels.length === 1 && !this.selectedHotelId) {
          const hotelId = this.hotels[0]._id!;
          this.selectedHotelId = hotelId;
          this.serviceForm.patchValue({ hotelId }, { emitEvent: false });
          this.loadServices(hotelId);
          this.loadServiceCategories(hotelId);
        }
      },
      error: (error) => {
        console.error('Lỗi khi tải danh sách khách sạn:', error);
        this.message.error('Không thể tải danh sách khách sạn.');
      }
    });
  }

  loadServiceCategories(hotelId: string): void {
    this.serviceService.getServiceCategories(hotelId).subscribe(
      data => {
        this.categories = data;
      },
      error => {
        console.error('Lỗi khi tải danh mục dịch vụ:', error);
        this.serviceCategoryOptions = ALL_SERVICE_CATEGORIES.map(cat => ({ label: this.getCategoryLabel(cat), value: cat }));
      }
    );
  }

  onHotelChange(hotelId: string | null, fromFilter: boolean = true): void {
    // Tránh request trùng lặp nếu hotelId không thay đổi
    if (hotelId === this.selectedHotelId) {
      return;
    }
    
    // Kiểm tra quyền: Business chỉ có thể chọn hotels thuộc business mình
    if (hotelId && this.isBusiness && !this.isAdmin && this.currentUser?.businessId) {
      const selectedHotel = this.hotels.find(h => h._id === hotelId);
      if (!selectedHotel) {
        this.message.warning('Bạn không có quyền xem dịch vụ của khách sạn này');
        return;
      }
      const hotelBusinessId = this.extractBusinessId(selectedHotel);
      if (hotelBusinessId !== this.currentUser.businessId) {
        this.message.warning('Bạn không có quyền xem dịch vụ của khách sạn này');
        return;
      }
    }
    
    this.selectedHotelId = hotelId;
    this.services = [];
    
    // Chỉ sync form nếu thay đổi từ bộ lọc
    if (fromFilter) {
      this.serviceForm.patchValue({ hotelId }, { emitEvent: false });
    }
    
    if (hotelId) {
      this.loadServices(hotelId);
      this.loadServiceCategories(hotelId);
    } else {
      // Nếu là business và không chọn hotel, load tất cả dịch vụ của business
      if (this.isBusiness && !this.isAdmin) {
        this.loadServices(); // Load tất cả dịch vụ của business
      }
      this.categories = [];
      this.serviceCategoryOptions = ALL_SERVICE_CATEGORIES.map(cat => ({ label: this.getCategoryLabel(cat), value: cat }));
    }
  }
  
  // Handler riêng cho form khi chọn hotel
  onFormHotelChange(hotelId: string | null): void {
    this.onHotelChange(hotelId, false);
  }

  startEdit(id: string): void {
    this.editId = id;
    const serviceToEdit = this.services.find(s => s._id === id);
    if (serviceToEdit) {
      this.selectedService = { ...serviceToEdit };
      this.selectedHotelId = serviceToEdit.hotelId;

      this.serviceForm.patchValue({
        hotelId: serviceToEdit.hotelId,
        name: serviceToEdit.name,
        description: serviceToEdit.description,
        price: serviceToEdit.price,
        category: serviceToEdit.category,
        image: serviceToEdit.image,
        isActive: serviceToEdit.isActive,
        currency: serviceToEdit.currency || 'VND',
        isCustom: serviceToEdit.isCustom || false,
        costPrice: serviceToEdit.costPrice || 0,
        importQuantity: serviceToEdit.importQuantity || 0,
        salesQuantity: serviceToEdit.salesQuantity || 0
      });
      if(this.selectedHotelId) this.loadServiceCategories(this.selectedHotelId);
    }
  }

  stopEdit(): void {
    this.editId = null;
    this.selectedService = null;
    this.serviceForm.reset({
      hotelId: this.selectedHotelId,
      name: '',
      description: '',
      price: 0,
      category: 'custom' as ServiceCategory,
      image: '',
      isActive: true,
      currency: 'VND',
      isCustom: false,
      costPrice: 0,
      importQuantity: 0,
      salesQuantity: 0
    });
  }

  submitForm(): void {
    if (this.serviceForm.invalid) {
      this.message.warning('Vui lòng điền đầy đủ thông tin bắt buộc.');
      Object.values(this.serviceForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      return;
    }

    const formValue = this.serviceForm.value;
    const serviceData: Service = {
      hotelId: formValue.hotelId,
      name: formValue.name,
      description: formValue.description,
      price: Number(formValue.price),
      category: formValue.category as ServiceCategory,
      image: formValue.image,
      isActive: formValue.isActive,
      currency: formValue.currency,
      isCustom: formValue.isCustom,
      costPrice: Number(formValue.costPrice || 0),
      importQuantity: Number(formValue.importQuantity || 0),
      salesQuantity: Number(formValue.salesQuantity || 0)
    };

    if (this.editId && this.selectedService) {
      serviceData._id = this.editId;
      this.serviceService.updateService(this.editId, serviceData).subscribe(
        (updatedService: Service) => {
          const index = this.services.findIndex(s => s._id === this.editId);
          if (index !== -1) {
            this.services[index] = updatedService;
            this.services = [...this.services];
          }
          this.message.success('Đã cập nhật dịch vụ thành công');
          this.stopEdit();
        },
        error => {
          console.error('Lỗi khi cập nhật dịch vụ:', error);
          this.message.error(error.error?.message || 'Không thể cập nhật dịch vụ.');
        }
      );
    } else {
      this.serviceService.createService(serviceData).subscribe(
        (newService: Service) => {
          this.services.push(newService);
          this.services = [...this.services];
          this.message.success('Đã tạo dịch vụ thành công');
          this.stopEdit();
        },
        error => {
          console.error('Lỗi khi tạo dịch vụ:', error);
          this.message.error(error.error?.message || 'Không thể tạo dịch vụ.');
        }
      );
    }
  }

  deleteService(id: string): void {
    this.serviceService.deleteService(id).subscribe(
      () => {
        this.services = this.services.filter(s => s._id !== id);
        this.message.success('Đã xóa dịch vụ thành công');
        if (this.editId === id) {
          this.stopEdit();
        }
      },
      error => {
        console.error('Lỗi khi xóa dịch vụ:', error);
        this.message.error(error.error?.message || 'Không thể xóa dịch vụ.');
      }
    );
  }

  getHotelName(hotelId: string): string {
    const hotel = this.hotels.find(h => h._id === hotelId);
    return hotel ? hotel.name : 'N/A';
  }

  handleImageChange(info: NzUploadChangeParam): void {
    if (info.file.status === 'uploading') {
      this.isLoading = true;
      return;
    }
    
    if (info.file.status === 'done') {
      // Xử lý khi upload thành công từ Cloudinary
      if (info.file.response) {
        const imageUrl = info.file.response.secure_url;
        this.imageUrl = imageUrl;
        this.serviceForm.patchValue({
          image: imageUrl
        });
        this.message.success('Tải lên hình ảnh thành công');
      }
      this.isLoading = false;
    } else if (info.file.status === 'error') {
      this.message.error(`Lỗi khi tải lên hình ảnh: ${info.file.error?.status || 'Không xác định'}`);
      console.error('Upload error:', info.file.error);
      this.isLoading = false;
    }
  }

  beforeUpload = (file: NzUploadFile): boolean => {
    const isImage = file.type?.startsWith('image/');
    if (!isImage) {
      this.message.error('Bạn chỉ có thể tải lên file hình ảnh!');
      return false;
    }
    const isLt2M = (file.size || 0) / 1024 / 1024 < 2;
    if (!isLt2M) {
      this.message.error('Hình ảnh phải nhỏ hơn 2MB!');
      return false;
    }
    this.fileList = this.fileList.concat(file);
    this.handleUpload(file);
    return false;
  };

  handleChange(info: { file: NzUploadFile }): void {
    switch (info.file.status) {
      case 'uploading':
        this.isLoading = true;
        break;
      case 'done':
        this.isLoading = false;
        this.imageUrl = info.file.response?.secure_url;
        this.serviceForm.patchValue({ image: this.imageUrl });
        this.message.success(`${info.file.name} file uploaded successfully`);
        break;
      case 'error':
        this.isLoading = false;
        this.message.error(`${info.file.name} file upload failed.`);
        break;
    }
  }
  
  handleUpload(file: NzUploadFile): void {
    const formData = new FormData();
    formData.append('file', file as any);
    formData.append('upload_preset', this.cloudinaryPreset);

    this.message.info('Hàm handleUpload cần được implement với HttpClient hoặc cấu hình nz-upload.');
  }

  // Cập nhật số lượng nhập
  updateImportQuantity(serviceId: string, quantity: number): void {
    const service = this.services.find(s => s._id === serviceId);
    if (!service) return;

    const newImportQuantity = (service.importQuantity || 0) + quantity;
    if (newImportQuantity < 0) {
      this.message.warning('Số lượng nhập không thể âm');
      return;
    }

    // Chỉ cập nhật importQuantity, backend sẽ tự động tính inventory
    const updateData: Partial<Service> = {
      importQuantity: newImportQuantity
    };

    this.serviceService.updateService(serviceId, updateData as Service).subscribe({
      next: (updatedService) => {
        const index = this.services.findIndex(s => s._id === serviceId);
        if (index !== -1) {
          this.services[index] = updatedService;
          this.services = [...this.services];
        }
        this.message.success('Đã cập nhật số lượng nhập');
      },
      error: (error) => {
        console.error('Lỗi khi cập nhật số lượng nhập:', error);
        this.message.error(error.error?.message || 'Không thể cập nhật số lượng nhập.');
      }
    });
  }

  // Tính tồn kho
  calculateInventory(service: Service): number {
    return Math.max(0, (service.importQuantity || 0) - (service.salesQuantity || 0));
  }

  // Nhóm dịch vụ theo category
  getGroupedCategories(): ServiceCategory[] {
    const categories = new Set<ServiceCategory>();
    this.services.forEach(service => {
      if (service.category) {
        categories.add(service.category);
      }
    });
    return Array.from(categories).sort();
  }

  // Lấy dịch vụ theo category
  getServicesByCategory(category: ServiceCategory): Service[] {
    return this.services.filter(s => s.category === category).sort((a, b) => {
      return (a.name || '').localeCompare(b.name || '');
    });
  }
} 