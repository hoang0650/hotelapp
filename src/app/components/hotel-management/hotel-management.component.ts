import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HotelService } from '../../services/hotel.service';
import { BusinessService } from '../../services/business.service';
import { RoomsService } from '../../services/rooms.service';
import { StaffService } from '../../services/staff.service';
import { UserService } from '../../services/user.service';
import { Hotel, HotelStatus, HotelAddress, HotelContactInfo, HotelSettings } from '../../interfaces/hotel';
import { Business } from '../../interfaces/business';
import { Room } from '../../interfaces/rooms';
import { User } from '../../interfaces/user';
import { NzMessageService } from 'ng-zorro-antd/message';

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

  hotelStatusOptions: { label: string, value: HotelStatus }[] = [
    { label: 'Hoạt động', value: 'active' },
    { label: 'Không hoạt động', value: 'inactive' },
    { label: 'Bảo trì', value: 'maintenance' }
  ];

  constructor(
    private hotelService: HotelService,
    private businessService: BusinessService,
    private roomService: RoomsService,
    private staffService: StaffService,
    private userService: UserService,
    private fb: FormBuilder,
    private message: NzMessageService
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
      status: ['active' as HotelStatus, Validators.required],
      facilities: [[]],
      settings: this.fb.group({
        checkInTime: ['14:00'],
        checkOutTime: ['12:00'],
        currency: ['VND'],
        language: ['vi'],
        taxRate: [0]
      })
    });
  }

  ngOnInit(): void {
    this.loadHotels();
    this.loadBusinesses();
    this.loadAvailableManagers();
  }

  startEdit(hotel: Hotel): void {
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
      }
    });
  }
  
  stopEdit(): void {
    this.editId = null;
    this.selectedHotel = null;
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

  loadHotels(): void {
    this.hotelService.getHotels().subscribe(
      data => {
        this.hotels = data;
      },
      error => {
        console.error('Error fetching hotels:', error);
        this.message.error('Không thể tải danh sách khách sạn.');
      }
    );
  }

  loadBusinesses(): void {
    this.businessService.getBusinesses().subscribe(
      data => {
        this.businesses = data;
      },
      error => {
         console.error('Error fetching businesses:', error);
         this.message.error('Không thể tải danh sách doanh nghiệp.');
      }
    );
  }

  loadAvailableManagers(): void {
    this.userService.getUsersByRole('admin').subscribe(
      (data: User[]) => {
        this.availableManagers = data.filter((u: User) => this.canManageHotel(u)); 
      },
      (error: any) => {
        console.error('Error fetching users for managers:', error);
        this.message.error('Không thể tải danh sách quản lý tiềm năng.');
      }
    );
  }

  getBusinessName(businessId: string | undefined): string {
    if (!businessId) return 'N/A';
    const business = this.businesses.find(b => b._id === businessId);
    return business ? business.name : 'N/A';
  }

  getHotelStatusLabel(statusValue: HotelStatus | undefined): string {
    if (!statusValue) return 'N/A';
    const statusOption = this.hotelStatusOptions.find(s => s.value === statusValue);
    return statusOption ? statusOption.label : statusValue;
  }

  getManagerName(managerId: string | User | undefined): string {
    if (!managerId) return 'N/A';
    if (typeof managerId === 'object' && managerId !== null && '_id' in managerId) { // Nếu là User object đã populate
      return managerId.fullName || 'N/A';
    }
    if (typeof managerId === 'string') {
      const manager = this.availableManagers.find(m => m._id === managerId);
      return manager ? (manager.fullName || 'N/A') : 'N/A';
    }
    return 'N/A';
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

    const hotelData: Partial<Hotel> = this.hotelForm.value;

    if (this.editId && this.selectedHotel) {
      this.hotelService.updateHotel(this.editId, hotelData).subscribe(
        updatedHotel => {
          const index = this.hotels.findIndex(h => h._id === this.editId);
          if (index !== -1) {
            this.hotels[index] = updatedHotel;
            this.hotels = [...this.hotels];
          }
          this.stopEdit();
          this.message.success('Cập nhật khách sạn thành công!');
        },
        error => {
          console.error('Error updating hotel:', error);
          this.message.error(error.error?.message || 'Lỗi khi cập nhật khách sạn.');
        }
      );
    } else {
      this.hotelService.createHotel(hotelData).subscribe(
        newHotel => {
          this.hotels.push(newHotel);
          this.hotels = [...this.hotels];
          this.stopEdit();
          this.message.success('Tạo khách sạn mới thành công!');
        },
        error => {
          console.error('Error creating hotel:', error);
          this.message.error(error.error?.message || 'Lỗi khi tạo khách sạn.');
        }
      );
    }
  }

  deleteHotel(id: string): void {
    this.hotelService.deleteHotel(id).subscribe(
      () => {
        this.hotels = this.hotels.filter(h => h._id !== id);
        if (this.selectedHotel?._id === id) {
          this.stopEdit();
        }
        this.message.success('Xóa khách sạn thành công!');
      },
      error => {
        console.error('Error deleting hotel:', error);
        this.message.error(error.error?.message || 'Lỗi khi xóa khách sạn.');
      }
    );
  }

  canManageHotel(u: User): boolean {
    return u.role === 'superadmin' || u.role === 'hotel' || u.role === 'admin' || u.role === 'business';
  }
}
