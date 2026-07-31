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
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { TranslateService } from '@ngx-translate/core';

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

  // Sử dụng ALL_SERVICE_CATEGORIES cho dropdown - sẽ được khởi tạo trong ngOnInit
  serviceCategoryOptions: { label: string, value: ServiceCategory }[] = [];

  // Lấy token xác thực
  get authToken(): string {
    return this.authService.getToken() || '';
  }

  // Định dạng tiền tệ VND
  formatter = (value: number): string => `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} đ`;

  // Thêm lại các thuộc tính bị thiếu
  isLoading = false;
  imageUrl: string | ArrayBuffer | null = '';
  fileList: NzUploadFile[] = [];
  uploadUrl = 'https://api.cloudinary.com/v1_1/dxtigizsi/image/upload';
  cloudinaryPreset = 'ys0fssyu';

  // Thống kê
  isStatisticsModalVisible = false;
  isLoadingStatistics = false;
  isExportingStatistics = false;
  statisticsData: any = null;
  statisticsFilter: {
    hotelId?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
  } = {};

  constructor(
    private fb: FormBuilder,
    private serviceService: ServiceService,
    private hotelService: HotelService,
    public authService: AuthService,
    private message: NzMessageService,
    private translate: TranslateService
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
    this.initServiceCategoryOptions();

    const storedHotelId = this.hotelService.resolvePreferredHotelId(this.authService.getHotelId());
    if (storedHotelId) {
      this.selectedHotelId = storedHotelId;
      this.serviceForm.patchValue({ hotelId: storedHotelId }, { emitEvent: false });
      this.loadServices(storedHotelId);
      this.loadServiceCategories(storedHotelId);
    } else if (this.isBusiness && !this.isAdmin) {
      this.loadServices();
    }

    this.hotelService.selectedHotelId$.subscribe((hotelId) => {
      const normalized = this.hotelService.normalizeHotelId(hotelId);
      if (normalized && !this.hotelService.sameHotelId(normalized, this.selectedHotelId)) {
        this.onHotelChange(normalized, true);
      }
    });

    this.loadHotels();
  }

  private initServiceCategoryOptions(): void {
    this.serviceCategoryOptions = ALL_SERVICE_CATEGORIES.map(cat => ({ 
      label: this.getCategoryLabel(cat), 
      value: cat 
    }));
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

  getCategoryLabel(category: any): string {
    let key: string = 'custom';
    if (category) {
      if (typeof category === 'string') {
        key = category;
      } else if (typeof category === 'object') {
        if (typeof category.category === 'string') {
          key = category.category;
        } else if (typeof (category as any).type === 'string') {
          key = (category as any).type;
        } else if (typeof (category as any).key === 'string') {
          key = (category as any).key;
        }
      }
    }
    switch (key) {
      case 'room_service': return this.translate.instant('SERVICE_MANAGEMENT.CATEGORY_LABELS.ROOM_SERVICE');
      case 'food': return this.translate.instant('SERVICE_MANAGEMENT.CATEGORY_LABELS.FOOD');
      case 'beverage': return this.translate.instant('SERVICE_MANAGEMENT.CATEGORY_LABELS.BEVERAGE');
      case 'spa': return this.translate.instant('SERVICE_MANAGEMENT.CATEGORY_LABELS.SPA');
      case 'transport': return this.translate.instant('SERVICE_MANAGEMENT.CATEGORY_LABELS.TRANSPORT');
      case 'custom': return this.translate.instant('SERVICE_MANAGEMENT.CATEGORY_LABELS.CUSTOM');
      default: return this.translate.instant('SERVICE_MANAGEMENT.CATEGORY_LABELS.CUSTOM');
    }
  }

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

  loadServices(hotelId?: string): void {
    this.isLoading = true;
    this.serviceService.getServices(hotelId).subscribe({
      next: (data) => {
        this.services = data;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Lỗi khi tải danh sách dịch vụ:', error);
        this.message.error(this.translate.instant('SERVICE_MANAGEMENT.LOAD_SERVICES_ERROR'));
        this.isLoading = false;
      }
    });
  }

  loadHotels(): void {
    const cached = this.hotelService.getCachedHotels();
    if (cached.length > 0) {
      this.applyHotelsList(cached);
    }

    this.hotelService.getHotelsCached(undefined, undefined, { lite: true }).subscribe({
      next: (data) => this.applyHotelsList(data),
      error: (error) => {
        console.error('Lỗi khi tải danh sách khách sạn:', error);
        this.message.error(this.translate.instant('SERVICE_MANAGEMENT.LOAD_HOTELS_ERROR'));
      }
    });
  }

  private applyHotelsList(data: Hotel[]): void {
    if (this.isAdmin) {
      this.hotels = data.filter(h => h.status === 'active' || !(h as any).status);
    } else if (this.isBusiness && this.currentUser?.businessId) {
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

      this.hotels = data.filter(h => {
        const hotelBusinessId = this.extractBusinessId(h);
        return hotelBusinessId && userBusinessIdStr && hotelBusinessId.toString() === userBusinessIdStr.toString()
          && (h.status === 'active' || !(h as any).status);
      });
    } else if (this.isHotelManager && this.currentUser?.hotelId) {
      this.hotels = data.filter(h => h._id === this.currentUser?.hotelId);
    } else {
      this.hotels = [];
    }

    if (!this.selectedHotelId && this.hotels.length === 1) {
      const hotelId = this.hotels[0]._id!;
      this.selectedHotelId = hotelId;
      this.serviceForm.patchValue({ hotelId }, { emitEvent: false });
      this.loadServices(hotelId);
      this.loadServiceCategories(hotelId);
    } else if (!this.selectedHotelId && this.isHotelManager && this.hotels.length > 0) {
      const hotelId = this.hotels[0]._id!;
      this.selectedHotelId = hotelId;
      this.serviceForm.patchValue({ hotelId }, { emitEvent: false });
      this.loadServices(hotelId);
      this.loadServiceCategories(hotelId);
    }
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
        this.message.warning(this.translate.instant('SERVICE_MANAGEMENT.NO_PERMISSION'));
        return;
      }
      const hotelBusinessId = this.extractBusinessId(selectedHotel);
      if (hotelBusinessId !== this.currentUser.businessId) {
        this.message.warning(this.translate.instant('SERVICE_MANAGEMENT.NO_PERMISSION'));
        return;
      }
    }
    
    this.selectedHotelId = hotelId;
    this.hotelService.setSelectedHotelId(hotelId);
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
      this.message.warning(this.translate.instant('SERVICE_MANAGEMENT.FILL_REQUIRED_FIELDS'));
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
          this.message.success(this.translate.instant('SERVICE_MANAGEMENT.UPDATE_SUCCESS'));
          this.stopEdit();
        },
        error => {
          console.error('Lỗi khi cập nhật dịch vụ:', error);
          this.message.error(error.error?.message || this.translate.instant('SERVICE_MANAGEMENT.UPDATE_ERROR'));
        }
      );
    } else {
      this.serviceService.createService(serviceData).subscribe(
        (newService: Service) => {
          this.services.push(newService);
          this.services = [...this.services];
          this.message.success(this.translate.instant('SERVICE_MANAGEMENT.CREATE_SUCCESS'));
          this.stopEdit();
        },
        error => {
          console.error('Lỗi khi tạo dịch vụ:', error);
          this.message.error(error.error?.message || this.translate.instant('SERVICE_MANAGEMENT.CREATE_ERROR'));
        }
      );
    }
  }

  deleteService(id: string): void {
    this.serviceService.deleteService(id).subscribe(
      () => {
        this.services = this.services.filter(s => s._id !== id);
        this.message.success(this.translate.instant('SERVICE_MANAGEMENT.DELETE_SUCCESS'));
        if (this.editId === id) {
          this.stopEdit();
        }
      },
      error => {
        console.error('Lỗi khi xóa dịch vụ:', error);
        this.message.error(error.error?.message || this.translate.instant('SERVICE_MANAGEMENT.DELETE_ERROR'));
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

  // ============ THỐNG KÊ DOANH THU DỊCH VỤ ============

  openStatisticsModal(): void {
    this.isStatisticsModalVisible = true;
    // Set default filter
    this.statisticsFilter = {
      hotelId: this.selectedHotelId || null,
      startDate: null,
      endDate: null
    };
    this.statisticsData = null;
  }

  closeStatisticsModal(): void {
    this.isStatisticsModalVisible = false;
    this.statisticsData = null;
  }

  loadStatistics(): void {
    if (!this.statisticsFilter.hotelId) {
      this.message.warning('Vui lòng chọn khách sạn');
      return;
    }

    this.isLoadingStatistics = true;
    
    // Lấy tất cả service orders
    this.serviceService.getAllServiceOrdersForStatistics(
      this.statisticsFilter.hotelId,
      this.statisticsFilter.startDate || undefined,
      this.statisticsFilter.endDate || undefined
    ).subscribe({
      next: (orders) => {
        console.log('📊 Service Orders received:', orders.length);
        console.log('📊 All orders:', orders);
        if (orders.length > 0) {
          console.log('📊 Sample order:', JSON.stringify(orders[0], null, 2));
          console.log('📊 Sample order items:', orders[0].items);
          console.log('📊 Sample order totalAmount:', orders[0].totalAmount);
        }
        console.log('📊 Filter params:', {
          hotelId: this.statisticsFilter.hotelId,
          startDate: this.statisticsFilter.startDate,
          endDate: this.statisticsFilter.endDate
        });
        
        // Backend đã filter theo ngày rồi, không cần filter lại ở frontend
        // Nhưng vẫn giữ logic filter để đảm bảo tính chính xác
        let filteredOrders = orders;
        
        // Nếu backend đã filter, có thể không cần filter lại
        // Nhưng để đảm bảo, vẫn filter lại nếu có ngày
        if (this.statisticsFilter.startDate || this.statisticsFilter.endDate) {
          filteredOrders = orders.filter(order => {
            const orderTime = (order as any).orderTime ? new Date((order as any).orderTime) : null;
            const createdAt = order.createdAt ? new Date(order.createdAt) : null;
            const deliveryTime = (order as any).deliveryTime ? new Date((order as any).deliveryTime) : null;
            const updatedAt = (order as any).updatedAt ? new Date((order as any).updatedAt) : null;
            
            // Lấy ngày đầu tiên có giá trị (ưu tiên orderTime)
            const orderDate = orderTime || createdAt || deliveryTime || updatedAt;
            if (!orderDate) return false;
            
            if (this.statisticsFilter.startDate) {
              const start = new Date(this.statisticsFilter.startDate);
              start.setHours(0, 0, 0, 0);
              if (orderDate < start) return false;
            }
            
            if (this.statisticsFilter.endDate) {
              const end = new Date(this.statisticsFilter.endDate);
              end.setHours(23, 59, 59, 999);
              if (orderDate > end) return false;
            }
            
            return true;
          });
        }
        
        console.log('📊 Orders after date filter:', filteredOrders.length);

        // Tính tất cả ServiceOrder có totalAmount > 0 hoặc có items (giống logic trong getFinancialSummary)
        // Backend không filter paymentStatus vì có thể ServiceOrder đã được tạo và có giá trị nhưng paymentStatus chưa được set
        filteredOrders = filteredOrders.filter(order => {
          const status = order.status;
          const totalAmount = (order as any).totalAmount || 0;
          const items = (order as any).items || [];
          
          // Bỏ qua các đơn đã hủy
          if (status === 'cancelled') {
            return false;
          }
          
          // Phải có totalAmount > 0 hoặc có items
          const hasAmount = totalAmount > 0 || items.length > 0;
          if (!hasAmount) {
            return false;
          }
          
          return true;
        });

        // Tính toán thống kê
        const serviceStatsMap = new Map<string, any>();
        const categoryStatsMap = new Map<string, any>();
        // Map để lưu các orderId đã đếm cho mỗi service (tránh đếm trùng)
        const serviceOrderIdsMap = new Map<string, Set<string>>();
        let totalRevenue = 0;
        let totalQuantity = 0;
        let totalOrders = filteredOrders.length;

        console.log('📊 Filtered orders:', filteredOrders.length);
        
        filteredOrders.forEach(order => {
          const orderId = (order as any)._id?.toString() || (order as any).id?.toString() || '';
          const orderTotalAmount = (order as any).totalAmount || 0;
          // Backend model dùng items (serviceOrder.js)
          const items = (order as any).items || [];
          
          // Tính doanh thu từ totalAmount của order hoặc tính từ items (giống backend)
          let orderTotal = 0;
          if (orderTotalAmount > 0) {
            orderTotal = orderTotalAmount;
          } else if (items && items.length > 0) {
            items.forEach((item: any) => {
              let itemTotal = 0;
              if (item.total) {
                itemTotal = item.total;
              } else if (item.price && item.quantity) {
                itemTotal = (item.price * item.quantity);
              }
              orderTotal += itemTotal;
            });
          }
          
          // Nếu order không có totalAmount và không có items, bỏ qua
          if (orderTotal <= 0) {
            return;
          }
          
          // Nếu có items, tính chi tiết theo từng dịch vụ
          if (items && items.length > 0) {
            items.forEach((item: any) => {
              // Xử lý serviceId có thể là ObjectId hoặc populated object
              const serviceId = item.serviceId?._id?.toString() || item.serviceId?.toString() || 'unknown';
              const serviceName = item.name || item.serviceName || item.serviceId?.name || 'Dịch vụ không tên';
              // Lấy category từ populated serviceId (nếu có populate)
              // Nếu không có, sẽ dùng 'custom' và có thể lookup sau
              const category = item.serviceId?.category || 
                              (item.serviceId && typeof item.serviceId === 'object' ? item.serviceId.category : 'custom') ||
                              'custom';
              // Đảm bảo quantity là số và > 0
              const quantity = Number(item.quantity) || 0;
              const price = Number(item.price) || 0;
              // Backend model dùng total, controller cũ có thể dùng totalPrice
              const totalPrice = Number(item.total) || Number(item.totalPrice) || (price * quantity);

              // Bỏ qua nếu quantity <= 0 hoặc totalPrice <= 0
              if (quantity <= 0 || totalPrice <= 0) {
                return;
              }

            // Thống kê theo dịch vụ
            if (!serviceStatsMap.has(serviceId)) {
              serviceStatsMap.set(serviceId, {
                serviceId,
                serviceName,
                category,
                quantity: 0,
                revenue: 0,
                orderCount: 0
              });
              serviceOrderIdsMap.set(serviceId, new Set<string>());
            }
            const serviceStat = serviceStatsMap.get(serviceId);
            const orderIdsSet = serviceOrderIdsMap.get(serviceId)!;
            
            // Cộng dồn số lượng và doanh thu
            serviceStat.quantity += quantity;
            serviceStat.revenue += totalPrice;
            
            // Đếm số đơn duy nhất chứa service này (mỗi order chỉ đếm 1 lần)
            if (orderId && !orderIdsSet.has(orderId)) {
              orderIdsSet.add(orderId);
              serviceStat.orderCount += 1;
            }

            // Thống kê theo danh mục
            if (!categoryStatsMap.has(category)) {
              categoryStatsMap.set(category, {
                category,
                quantity: 0,
                revenue: 0
              });
            }
            const categoryStat = categoryStatsMap.get(category);
            categoryStat.quantity += quantity;
            categoryStat.revenue += totalPrice;

            totalRevenue += totalPrice;
            totalQuantity += quantity;
            });
          } else {
            // Nếu không có items nhưng có totalAmount, tính vào doanh thu chung
            // Không thể phân loại theo dịch vụ nên chỉ cộng vào tổng
            totalRevenue += orderTotal;
          }
        });

        // Tính giá trị đơn trung bình
        const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        // Tính tỷ lệ theo danh mục
        const categoryStats = Array.from(categoryStatsMap.values()).map(stat => ({
          ...stat,
          percentage: totalRevenue > 0 ? (stat.revenue / totalRevenue) * 100 : 0
        }));

        // Tính giá bán trung bình cho từng dịch vụ
        const serviceStats = Array.from(serviceStatsMap.values()).map(stat => ({
          ...stat,
          averagePrice: stat.quantity > 0 ? stat.revenue / stat.quantity : 0
        }));

        console.log('📊 Statistics calculated:', {
          totalRevenue,
          totalOrders,
          totalQuantity,
          serviceStatsCount: serviceStats.length,
          categoryStatsCount: categoryStats.length
        });

        this.statisticsData = {
          totalRevenue,
          totalOrders,
          totalQuantity,
          averageOrderValue,
          serviceStats: serviceStats.sort((a, b) => b.revenue - a.revenue),
          categoryStats: categoryStats.sort((a, b) => b.revenue - a.revenue)
        };

        this.isLoadingStatistics = false;
      },
      error: (error) => {
        console.error('Lỗi khi tải thống kê:', error);
        this.message.error(error.error?.message || 'Lỗi khi tải thống kê');
        this.isLoadingStatistics = false;
      }
    });
  }

  exportStatisticsToExcel(): void {
    if (!this.statisticsData) {
      this.message.warning(this.translate.instant('SERVICE_MANAGEMENT.EXPORT.VIEW_STATS_FIRST'));
      return;
    }

    this.isExportingStatistics = true;

    try {
      // Tạo workbook với nhiều sheets
      const workbook: XLSX.WorkBook = { Sheets: {}, SheetNames: [] };

      // Sheet 1: Tổng quan
      const summaryData = [
        [this.translate.instant('SERVICE_MANAGEMENT.EXPORT.TITLE')],
        [''],
        [this.translate.instant('SERVICE_MANAGEMENT.EXPORT.TOTAL_REVENUE'), this.statisticsData.totalRevenue],
        [this.translate.instant('SERVICE_MANAGEMENT.EXPORT.TOTAL_ORDERS'), this.statisticsData.totalOrders],
        [this.translate.instant('SERVICE_MANAGEMENT.EXPORT.TOTAL_QUANTITY'), this.statisticsData.totalQuantity],
        [this.translate.instant('SERVICE_MANAGEMENT.EXPORT.AVERAGE_ORDER_VALUE'), this.statisticsData.averageOrderValue],
        [''],
        [this.translate.instant('SERVICE_MANAGEMENT.EXPORT.STATISTICS_PERIOD'), 
          this.statisticsFilter.startDate ? format(new Date(this.statisticsFilter.startDate), 'dd/MM/yyyy') : this.translate.instant('SERVICE_MANAGEMENT.EXPORT.ALL'),
          this.translate.instant('SERVICE_MANAGEMENT.EXPORT.TO'),
          this.statisticsFilter.endDate ? format(new Date(this.statisticsFilter.endDate), 'dd/MM/yyyy') : this.translate.instant('SERVICE_MANAGEMENT.EXPORT.ALL')
        ],
        [this.translate.instant('SERVICE_MANAGEMENT.EXPORT.HOTEL'), this.statisticsFilter.hotelId ? this.getHotelName(this.statisticsFilter.hotelId) : this.translate.instant('SERVICE_MANAGEMENT.EXPORT.ALL')]
      ];

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      summarySheet['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 10 }, { wch: 20 }];
      workbook.Sheets[this.translate.instant('SERVICE_MANAGEMENT.EXPORT.SUMMARY_SHEET')] = summarySheet;
      workbook.SheetNames.push(this.translate.instant('SERVICE_MANAGEMENT.EXPORT.SUMMARY_SHEET'));

      // Sheet 2: Thống kê theo dịch vụ
      const serviceData = this.statisticsData.serviceStats.map((stat: any) => ({
        [this.translate.instant('SERVICE_MANAGEMENT.EXPORT.SERVICE_NAME')]: stat.serviceName,
        [this.translate.instant('SERVICE_MANAGEMENT.EXPORT.CATEGORY')]: this.getCategoryLabel(stat.category),
        [this.translate.instant('SERVICE_MANAGEMENT.EXPORT.QUANTITY_SOLD')]: stat.quantity,
        [this.translate.instant('SERVICE_MANAGEMENT.EXPORT.REVENUE')]: stat.revenue,
        [this.translate.instant('SERVICE_MANAGEMENT.EXPORT.AVERAGE_PRICE')]: stat.averagePrice,
        [this.translate.instant('SERVICE_MANAGEMENT.EXPORT.ORDER_COUNT')]: stat.orderCount
      }));

      if (serviceData.length > 0) {
        const serviceSheet = XLSX.utils.json_to_sheet(serviceData);
        serviceSheet['!cols'] = [
          { wch: 30 }, // Tên dịch vụ
          { wch: 15 }, // Danh mục
          { wch: 12 }, // Số lượng bán
          { wch: 15 }, // Doanh thu
          { wch: 15 }, // Giá bán TB
          { wch: 10 }  // Số đơn
        ];
        workbook.Sheets[this.translate.instant('SERVICE_MANAGEMENT.EXPORT.SERVICE_STATS_SHEET')] = serviceSheet;
        workbook.SheetNames.push(this.translate.instant('SERVICE_MANAGEMENT.EXPORT.SERVICE_STATS_SHEET'));
      }

      // Sheet 3: Thống kê theo danh mục
      const categoryData = this.statisticsData.categoryStats.map((stat: any) => ({
        [this.translate.instant('SERVICE_MANAGEMENT.EXPORT.CATEGORY')]: this.getCategoryLabel(stat.category),
        [this.translate.instant('SERVICE_MANAGEMENT.EXPORT.QUANTITY_SOLD')]: stat.quantity,
        [this.translate.instant('SERVICE_MANAGEMENT.EXPORT.REVENUE')]: stat.revenue,
        [this.translate.instant('SERVICE_MANAGEMENT.EXPORT.PERCENTAGE')]: stat.percentage
      }));

      if (categoryData.length > 0) {
        const categorySheet = XLSX.utils.json_to_sheet(categoryData);
        categorySheet['!cols'] = [
          { wch: 20 }, // Danh mục
          { wch: 15 }, // Số lượng bán
          { wch: 15 }, // Doanh thu
          { wch: 12 }  // Tỷ lệ
        ];
        workbook.Sheets[this.translate.instant('SERVICE_MANAGEMENT.EXPORT.CATEGORY_STATS_SHEET')] = categorySheet;
        workbook.SheetNames.push(this.translate.instant('SERVICE_MANAGEMENT.EXPORT.CATEGORY_STATS_SHEET'));
      }

      // Tạo tên file
      const dateStr = format(new Date(), 'ddMMyyyy_HHmmss');
      const hotelName = this.statisticsFilter.hotelId ? 
        this.getHotelName(this.statisticsFilter.hotelId).replace(/\s+/g, '_') : 'Tat_ca';
      const fileName = `Thong_ke_doanh_thu_dich_vu_${hotelName}_${dateStr}`;

      // Xuất file
      XLSX.writeFile(workbook, `${fileName}.xlsx`);
      this.message.success(this.translate.instant('SERVICE_MANAGEMENT.EXPORT.SUCCESS'));
      this.isExportingStatistics = false;
    } catch (error) {
      console.error('Lỗi khi xuất Excel:', error);
      this.message.error(this.translate.instant('SERVICE_MANAGEMENT.EXPORT.ERROR'));
      this.isExportingStatistics = false;
    }
  }
} 
