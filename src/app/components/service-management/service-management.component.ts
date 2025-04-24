import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Service } from '../../interfaces/service';
import { ServiceService } from '../../services/service.service';
import { HotelService } from '../../services/hotel.service';
import { Hotel } from '../../interfaces/hotel';
import { AuthService } from '../../services/auth.service';
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
  categories: string[] = [
    'Ẩm thực', 'Đồ uống', 'Tiện nghi', 'Spa', 'Vui chơi', 'Giải trí', 'Vận chuyển'
  ];
  selectedService: Service | null = null;
  selectedHotelId: string = '';
  selectedCategory: string = '';
  isLoading = false;
  editMode = false;
  isAdmin = false;
  imageUrl: string = '';
  fileList: NzUploadFile[] = [];
  uploadUrl = 'https://api.cloudinary.com/v1_1/dxtigizsi/image/upload';
  cloudinaryPreset = 'ys0fssyu';

  // Lấy token xác thực
  get authToken(): string {
    return localStorage.getItem('token') || '';
  }

  // Định dạng tiền tệ VND
  formatter = (value: number): string => `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} đ`;

  constructor(
    private fb: FormBuilder,
    private serviceService: ServiceService,
    private hotelService: HotelService,
    public authService: AuthService,
    private message: NzMessageService
  ) {
    this.serviceForm = this.fb.group({
      name: ['', [Validators.required]],
      description: ['', [Validators.required]],
      price: [0, [Validators.required, Validators.min(0)]],
      category: ['', [Validators.required]],
      hotelId: ['', [Validators.required]],
      image: [''],
      isAvailable: [true]
    });
  }

  ngOnInit(): void {
    this.loadHotels();
  }

  loadHotels(): void {
    this.isLoading = true;
    this.hotelService.getHotels().subscribe(
      (hotels) => {
        this.hotels = hotels;
        if (this.hotels.length > 0) {
          // Mặc định chọn khách sạn đầu tiên
          this.selectedHotelId = this.hotels[0]._id!;
          this.serviceForm.get('hotelId')?.setValue(this.selectedHotelId);
          this.loadServices();
          this.loadCategories();
        }
        this.isLoading = false;
      },
      (error) => {
        console.error('Error loading hotels:', error);
        this.message.error('Không thể tải danh sách khách sạn');
        this.isLoading = false;
      }
    );
  }

  loadServices(): void {
    if (!this.selectedHotelId) return;

    this.isLoading = true;
    this.serviceService.getServices(this.selectedHotelId, this.selectedCategory).subscribe(
      (services) => {
        this.services = services;
        this.isLoading = false;
      },
      (error) => {
        console.error('Error loading services:', error);
        this.message.error('Không thể tải danh sách dịch vụ');
        this.isLoading = false;
      }
    );
  }

  loadCategories(): void {
    if (!this.selectedHotelId) return;

    this.isLoading = true;
    this.serviceService.getServiceCategories(this.selectedHotelId).subscribe(
      (categories) => {
        this.categories = categories;
        this.isLoading = false;
      },
      (error) => {
        console.error('Error loading categories:', error);
        this.message.error('Không thể tải danh mục dịch vụ');
        this.isLoading = false;
      }
    );
  }

  onHotelChange(hotelId: string): void {
    this.selectedHotelId = hotelId;
    this.serviceForm.get('hotelId')?.setValue(hotelId);
    this.loadServices();
    this.loadCategories();
  }

  onCategoryChange(category: string): void {
    this.selectedCategory = category;
    this.loadServices();
  }

  resetForm(): void {
    this.serviceForm.reset({
      hotelId: this.selectedHotelId,
      isAvailable: true,
      price: 0
    });
    this.selectedService = null;
    this.editMode = false;
    this.imageUrl = '';
    this.fileList = [];
  }

  submitForm(): void {
    if (this.serviceForm.valid) {
      const serviceData: Service = this.serviceForm.value;

      if (this.editMode && this.selectedService) {
        this.updateService(serviceData);
      } else {
        this.createService(serviceData);
      }
    } else {
      // Đánh dấu tất cả các trường là đã chạm vào để hiển thị lỗi
      Object.values(this.serviceForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity();
        }
      });
      this.message.warning('Vui lòng điền đầy đủ thông tin');
    }
  }

  createService(serviceData: Service): void {
    this.isLoading = true;
    this.serviceService.createService(serviceData).subscribe(
      (response) => {
        this.message.success('Đã tạo dịch vụ thành công');
        this.resetForm();
        this.loadServices();
        this.isLoading = false;
      },
      (error) => {
        console.error('Error creating service:', error);
        this.message.error('Không thể tạo dịch vụ');
        this.isLoading = false;
      }
    );
  }

  updateService(serviceData: Service): void {
    if (!this.selectedService || !this.selectedService._id) return;

    this.isLoading = true;
    this.serviceService.updateService(this.selectedService._id, serviceData).subscribe(
      (response) => {
        this.message.success('Đã cập nhật dịch vụ thành công');
        this.resetForm();
        this.loadServices();
        this.isLoading = false;
      },
      (error) => {
        console.error('Error updating service:', error);
        this.message.error('Không thể cập nhật dịch vụ');
        this.isLoading = false;
      }
    );
  }

  editService(service: Service): void {
    this.selectedService = { ...service };
    this.editMode = true;
    this.serviceForm.patchValue({
      name: service.name,
      description: service.description,
      price: service.price,
      category: service.category,
      hotelId: service.hotelId,
      image: service.image || '',
      isAvailable: service.isAvailable
    });
    this.imageUrl = service.image || '';
  }

  deleteService(id: string): void {
    this.isLoading = true;
    this.serviceService.deleteService(id).subscribe(
      () => {
        this.message.success('Đã xóa dịch vụ thành công');
        this.loadServices();
        this.isLoading = false;
      },
      (error) => {
        console.error('Error deleting service:', error);
        this.message.error('Không thể xóa dịch vụ');
        this.isLoading = false;
      }
    );
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

  getHotelName(hotelId: string): string {
    const hotel = this.hotels.find(h => h._id === hotelId);
    return hotel ? hotel.name : 'Unknown Hotel';
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
    return true;
  };
} 