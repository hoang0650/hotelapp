import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Guest, GuestQuery } from '../../models/guest.model';
import { GuestsService } from '../../services/guests.service';
import { HotelService } from '../../services/hotel.service';
import { RoomsService } from '../../services/rooms.service';
import { Hotel } from '../../interfaces/hotel';
import { Room } from '../../interfaces/rooms';
import { AuthService, PermissionRules } from '../../services/auth.service';
import { User } from '../../interfaces/user';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

@Component({
  selector: 'app-guest-management',
  templateUrl: './guest-management.component.html',
  styleUrls: ['./guest-management.component.css']
})
export class GuestManagementComponent implements OnInit {
  guestForm!: FormGroup;
  guests: Guest[] = [];
  hotels: Hotel[] = [];
  rooms: Room[] = [];
  editId: string | null = null;
  selectedGuest: Guest | null = null;
  selectedHotelId: string | null = null;
  selectedGuestType: 'regular' | 'frequent' | 'group' | null = null;
  currentUser: User | null = null;
  permissions: PermissionRules | null = null;
  isLoading = false;
  isExporting = false;
  total = 0;
  pageIndex = 1;
  pageSize = 20;
  searchValue = '';
  isModalVisible = false;
  isAssignModalVisible = false;
  isBookingModalVisible = false;
  selectedRoomId: string | null = null;
  bookingForm!: FormGroup;

  // Lấy token xác thực
  get authToken(): string {
    return localStorage.getItem('token') || '';
  }

  constructor(
    private fb: FormBuilder,
    private guestsService: GuestsService,
    private hotelService: HotelService,
    private roomsService: RoomsService,
    public authService: AuthService,
    private message: NzMessageService,
    private modal: NzModalService
  ) {
    this.guestForm = this.fb.group({
      hotelId: [null, Validators.required],
      guestType: ['regular', Validators.required],
      personalInfo: this.fb.group({
        fullName: ['', Validators.required],
        dateOfBirth: [null],
        gender: [''],
        nationality: [''],
        idType: ['id_card'],
        idNumber: [''],
        idExpiryDate: [null]
      }),
      contactInfo: this.fb.group({
        email: ['', [Validators.email]],
        phone: [''],
        alternativePhone: [''],
        address: this.fb.group({
          street: [''],
          city: [''],
          state: [''],
          country: [''],
          postalCode: ['']
        })
      }),
      preferences: this.fb.group({
        roomType: [''],
        floor: [''],
        specialRequests: [[]],
        dietaryRestrictions: [[]]
      }),
      notes: [''],
      isGroupLeader: [false],
      groupSize: [1, [Validators.min(1)]]
    });
    
    // Form đặt phòng trước
    this.bookingForm = this.fb.group({
      roomId: [null, Validators.required],
      checkInDate: [null, Validators.required],
      checkOutDate: [null],
      rateType: ['hourly', Validators.required],
      advancePayment: [0, [Validators.min(0)]],
      notes: [''],
      adults: [1, [Validators.min(1)]],
      children: [0, [Validators.min(0)]]
    });
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.permissions = this.authService.getPermissionRules();
    this.loadHotels();
    
    // Nếu là business và không có hotel được chọn, load tất cả khách của business
    if (this.isBusiness && !this.isAdmin && !this.selectedHotelId) {
      this.loadGuests(); // Load tất cả khách của business (không truyền hotelId)
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

  get isStaff(): boolean {
    return this.authService.isStaff();
  }

  get canCreateGuest(): boolean {
    return this.isAdmin || this.isBusiness || this.isHotelManager || this.isStaff;
  }

  canManage(guest: Guest): boolean {
    if (!this.currentUser) return false;
    if (this.isAdmin || this.isSuperAdmin) return true;
    
    // Business chỉ quản lý khách của hotels thuộc business mình
    if (this.isBusiness) {
      const hotel = this.hotels.find(h => {
        const hotelId = typeof guest.hotelId === 'string' ? guest.hotelId : guest.hotelId?._id;
        return h._id === hotelId;
      });
      if (!hotel) return false;
      const hotelBusinessId = this.extractBusinessId(hotel);
      return hotelBusinessId === this.currentUser.businessId;
    }
    
    // Hotel manager chỉ quản lý khách của hotel mình
    if (this.isHotelManager) {
      const hotelId = typeof guest.hotelId === 'string' ? guest.hotelId : guest.hotelId?._id;
      return hotelId === this.currentUser.hotelId;
    }
    
    return false;
  }

  canEdit(guest: Guest): boolean {
    // Staff không có quyền chỉnh sửa
    if (this.isStaff) return false;
    return this.canManage(guest);
  }

  canDelete(guest: Guest): boolean {
    // Staff không có quyền xóa
    if (this.isStaff) return false;
    return this.canManage(guest);
  }

  canAssign(guest: Guest): boolean {
    return this.canCreateGuest;
  }

  // Helper function để extract businessId từ hotel
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

  // ============ LOAD DATA ============

  loadHotels(): void {
    this.isLoading = true;
    this.hotelService.getHotels().subscribe({
      next: (data) => {
        if (this.isAdmin || this.isSuperAdmin) {
          this.hotels = data;
        } else if (this.isBusiness && this.currentUser?.businessId) {
          this.hotels = data.filter(h => {
            const hotelBusinessId = this.extractBusinessId(h);
            const userBusinessId = this.currentUser?.businessId;
            return hotelBusinessId && userBusinessId && hotelBusinessId.toString() === userBusinessId.toString() && h.status === 'active';
          });
        } else if (this.isHotelManager && this.currentUser?.hotelId) {
          this.hotels = data.filter(h => h._id === this.currentUser?.hotelId && h.status === 'active');
        } else if (this.isStaff && this.currentUser?.hotelId) {
          this.hotels = data.filter(h => h._id === this.currentUser?.hotelId && h.status === 'active');
        } else {
          this.hotels = [];
        }
        
        // Nếu là hotel manager hoặc staff, tự động chọn hotel của mình
        if ((this.isHotelManager || this.isStaff) && this.currentUser?.hotelId && this.hotels.length > 0) {
          this.selectedHotelId = this.currentUser.hotelId;
          this.onHotelChange(this.selectedHotelId);
        } else if (this.hotels.length > 0 && !this.selectedHotelId) {
          this.selectedHotelId = this.hotels[0]._id!;
          this.onHotelChange(this.selectedHotelId);
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

  onHotelChange(hotelId: string | null): void {
    this.selectedHotelId = hotelId;
    this.loadGuests();
    this.loadRooms();
  }

  onGuestTypeChange(guestType: 'regular' | 'frequent' | null): void {
    this.selectedGuestType = guestType;
    this.loadGuests();
  }

  loadGuests(): void {
    if (!this.selectedHotelId && !this.isBusiness) {
      this.guests = [];
      return;
    }

    this.isLoading = true;
    const query: GuestQuery = {
      page: this.pageIndex,
      limit: this.pageSize
    };

    if (this.selectedHotelId) {
      query.hotelId = this.selectedHotelId;
    }

    if (this.searchValue) {
      query.search = this.searchValue;
    }

    if (this.selectedGuestType) {
      query.guestType = this.selectedGuestType;
    }

    this.guestsService.getGuests(query).subscribe({
      next: (response) => {
        this.guests = response.guests;
        this.total = response.total;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching guests:', error);
        this.message.error('Không thể tải danh sách khách.');
        this.isLoading = false;
      }
    });
  }

  loadRooms(): void {
    if (!this.selectedHotelId) {
      this.rooms = [];
      return;
    }

    this.roomsService.getRooms({ hotelId: this.selectedHotelId }).subscribe({
      next: (data) => {
        // Chỉ lấy phòng trống (vacant)
        this.rooms = data.filter(room => room.status === 'vacant');
      },
      error: (error) => {
        console.error('Error fetching rooms:', error);
        this.message.error('Không thể tải danh sách phòng.');
      }
    });
  }

  // ============ CRUD OPERATIONS ============

  openCreateModal(): void {
    this.editId = null;
    this.selectedGuest = null;
    
    // Reset form với đầy đủ cấu trúc nested
    this.guestForm.reset({
      hotelId: this.selectedHotelId,
      guestType: 'regular',
      personalInfo: {
        fullName: '',
        dateOfBirth: null,
        gender: '',
        nationality: '',
        idType: 'id_card',
        idNumber: '',
        idExpiryDate: null
      },
      contactInfo: {
        email: '',
        phone: '',
        alternativePhone: '',
        address: {
          street: '',
          city: '',
          state: '',
          country: '',
          postalCode: ''
        }
      },
      preferences: {
        roomType: '',
        floor: '',
        specialRequests: [],
        dietaryRestrictions: []
      },
      notes: '',
      isGroupLeader: false,
      groupSize: 1
    });
    
    // Đảm bảo các nested FormGroup được reset đúng cách
    (this.guestForm.get('personalInfo') as FormGroup)?.reset({
      firstName: '',
      lastName: '',
      dateOfBirth: null,
      gender: '',
      nationality: '',
      idType: 'id_card',
      idNumber: '',
      idExpiryDate: null
    });
    
    (this.guestForm.get('contactInfo') as FormGroup)?.reset({
      email: '',
      phone: '',
      alternativePhone: '',
      address: {
        street: '',
        city: '',
        state: '',
        country: '',
        postalCode: ''
      }
    });
    
    (this.guestForm.get('contactInfo.address') as FormGroup)?.reset({
      street: '',
      city: '',
      state: '',
      country: '',
      postalCode: ''
    });
    
    (this.guestForm.get('preferences') as FormGroup)?.reset({
      roomType: '',
      floor: '',
      specialRequests: [],
      dietaryRestrictions: []
    });
    
    this.isModalVisible = true;
  }

  openEditModal(guest: Guest): void {
    if (!this.canEdit(guest)) {
      this.message.warning('Bạn không có quyền chỉnh sửa khách này');
      return;
    }

    this.editId = guest._id!;
    this.selectedGuest = guest;
    
    const hotelId = typeof guest.hotelId === 'string' ? guest.hotelId : guest.hotelId?._id;
    
    // Gộp firstName và lastName thành fullName
    const fullName = guest.personalInfo?.fullName || 
                     (guest.personalInfo?.firstName && guest.personalInfo?.lastName 
                       ? `${guest.personalInfo.firstName} ${guest.personalInfo.lastName}`.trim()
                       : guest.personalInfo?.firstName || guest.personalInfo?.lastName || '');
    
    this.guestForm.patchValue({
      hotelId: hotelId,
      guestType: guest.guestType || 'regular',
      personalInfo: {
        fullName: fullName,
        dateOfBirth: guest.personalInfo?.dateOfBirth ? new Date(guest.personalInfo.dateOfBirth) : null,
        gender: guest.personalInfo?.gender || '',
        nationality: guest.personalInfo?.nationality || '',
        idType: guest.personalInfo?.idType || 'id_card',
        idNumber: guest.personalInfo?.idNumber || '',
        idExpiryDate: guest.personalInfo?.idExpiryDate ? new Date(guest.personalInfo.idExpiryDate) : null
      },
      contactInfo: {
        email: guest.contactInfo?.email || '',
        phone: guest.contactInfo?.phone || '',
        alternativePhone: guest.contactInfo?.alternativePhone || '',
        address: {
          street: guest.contactInfo?.address?.street || '',
          city: guest.contactInfo?.address?.city || '',
          state: guest.contactInfo?.address?.state || '',
          country: guest.contactInfo?.address?.country || '',
          postalCode: guest.contactInfo?.address?.postalCode || ''
        }
      },
      preferences: {
        roomType: guest.preferences?.roomType || '',
        floor: guest.preferences?.floor || '',
        specialRequests: guest.preferences?.specialRequests || [],
        dietaryRestrictions: guest.preferences?.dietaryRestrictions || []
      },
      notes: guest.notes || ''
    });
    
    this.isModalVisible = true;
  }

  handleCancel(): void {
    this.isModalVisible = false;
    this.editId = null;
    this.selectedGuest = null;
    
    // Reset form với đầy đủ cấu trúc nested để tránh lỗi
    this.guestForm.reset({
      hotelId: null,
      guestType: 'regular',
      personalInfo: {
        fullName: '',
        dateOfBirth: null,
        gender: '',
        nationality: '',
        idType: 'id_card',
        idNumber: '',
        idExpiryDate: null
      },
      contactInfo: {
        email: '',
        phone: '',
        alternativePhone: '',
        address: {
          street: '',
          city: '',
          state: '',
          country: '',
          postalCode: ''
        }
      },
      preferences: {
        roomType: '',
        floor: '',
        specialRequests: [],
        dietaryRestrictions: []
      },
      notes: '',
      isGroupLeader: false,
      groupSize: 1
    });
    
    // Đảm bảo các nested FormGroup được reset đúng cách
    (this.guestForm.get('personalInfo') as FormGroup)?.reset({
      firstName: '',
      lastName: '',
      dateOfBirth: null,
      gender: '',
      nationality: '',
      idType: 'id_card',
      idNumber: '',
      idExpiryDate: null
    });
    
    (this.guestForm.get('contactInfo') as FormGroup)?.reset({
      email: '',
      phone: '',
      alternativePhone: '',
      address: {
        street: '',
        city: '',
        state: '',
        country: '',
        postalCode: ''
      }
    });
    
    (this.guestForm.get('contactInfo.address') as FormGroup)?.reset({
      street: '',
      city: '',
      state: '',
      country: '',
      postalCode: ''
    });
    
    (this.guestForm.get('preferences') as FormGroup)?.reset({
      roomType: '',
      floor: '',
      specialRequests: [],
      dietaryRestrictions: []
    });
  }

  handleOk(): void {
    // Validate form và nested FormGroups
    this.markFormGroupTouched(this.guestForm);
    
    if (!this.guestForm.valid) {
      // Hiển thị lỗi validation
      const errors: string[] = [];
      
      if (this.guestForm.get('hotelId')?.invalid) {
        errors.push('Vui lòng chọn khách sạn');
      }
      if (this.guestForm.get('guestType')?.invalid) {
        errors.push('Vui lòng chọn loại khách');
      }
      
      const personalInfo = this.guestForm.get('personalInfo') as FormGroup;
      if (personalInfo) {
        if (personalInfo.get('fullName')?.invalid) {
          errors.push('Vui lòng nhập họ và tên');
        }
      }
      
      const contactInfo = this.guestForm.get('contactInfo') as FormGroup;
      if (contactInfo) {
        if (contactInfo.get('email')?.invalid) {
          errors.push('Email không hợp lệ');
        }
      }
      
      if (errors.length > 0) {
        this.message.warning(errors[0]);
      } else {
        this.message.warning('Vui lòng điền đầy đủ thông tin bắt buộc');
      }
      return;
    }

    this.isLoading = true;
    const formValue = this.guestForm.value;

    // Chuẩn bị dữ liệu gửi lên backend
    const guestData: Partial<Guest> = {
      hotelId: formValue.hotelId,
      guestType: formValue.guestType || 'regular',
      personalInfo: {
        fullName: formValue.personalInfo?.fullName || '',
        dateOfBirth: formValue.personalInfo?.dateOfBirth || null,
        gender: formValue.personalInfo?.gender || '',
        nationality: formValue.personalInfo?.nationality || '',
        idType: formValue.personalInfo?.idType || 'id_card',
        idNumber: formValue.personalInfo?.idNumber || '',
        idExpiryDate: formValue.personalInfo?.idExpiryDate || null
      },
      contactInfo: {
        email: formValue.contactInfo?.email || '',
        phone: formValue.contactInfo?.phone || '',
        alternativePhone: formValue.contactInfo?.alternativePhone || '',
        address: formValue.contactInfo?.address || {}
      },
      preferences: formValue.preferences || {},
      notes: formValue.notes || ''
    };

    // Thêm thông tin khách đoàn nếu là group
    if (formValue.guestType === 'group') {
      guestData.isGroupLeader = true;
      guestData.groupSize = formValue.groupSize || 1;
    }

    if (this.editId) {
      // Update
      this.guestsService.updateGuest(this.editId, guestData).subscribe({
        next: (response) => {
          this.message.success(response.message || 'Cập nhật khách thành công');
          this.loadGuests();
          this.handleCancel();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error updating guest:', error);
          const errorMessage = error.error?.message || error.message || 'Cập nhật khách thất bại';
          this.message.error(errorMessage);
          this.isLoading = false;
        }
      });
    } else {
      // Create
      this.guestsService.createGuest(guestData).subscribe({
        next: (response) => {
          this.message.success(response.message || 'Tạo khách thành công');
          this.loadGuests();
          this.handleCancel();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error creating guest:', error);
          const errorMessage = error.error?.message || error.message || 'Tạo khách thất bại';
          this.message.error(errorMessage);
          this.isLoading = false;
        }
      });
    }
  }

  // Helper method để mark tất cả controls trong FormGroup là touched
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      if (control) {
        control.markAsTouched();
        if (control instanceof FormGroup) {
          this.markFormGroupTouched(control);
        }
      }
    });
  }

  deleteGuest(guest: Guest): void {
    if (!this.canDelete(guest)) {
      this.message.warning('Bạn không có quyền xóa khách này');
      return;
    }

    this.modal.confirm({
      nzTitle: 'Xác nhận xóa',
      nzContent: `Bạn có chắc chắn muốn xóa khách "${this.getGuestName(guest)}"?`,
      nzOkText: 'Xóa',
      nzOkDanger: true,
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        this.isLoading = true;
        this.guestsService.deleteGuest(guest._id!).subscribe({
          next: (response) => {
            this.message.success(response.message || 'Xóa khách thành công');
            this.loadGuests();
            this.isLoading = false;
          },
          error: (error) => {
            this.message.error(error.error?.message || 'Xóa khách thất bại');
            this.isLoading = false;
          }
        });
      }
    });
  }

  // ============ ASSIGN TO ROOM ============

  openAssignModal(guest: Guest): void {
    if (!this.canAssign(guest)) {
      this.message.warning('Bạn không có quyền assign khách này');
      return;
    }

    this.selectedGuest = guest;
    this.selectedRoomId = null;
    this.loadRooms();
    this.isAssignModalVisible = true;
  }

  handleAssignCancel(): void {
    this.isAssignModalVisible = false;
    this.selectedGuest = null;
    this.selectedRoomId = null;
  }

  handleAssignOk(): void {
    if (!this.selectedGuest || !this.selectedRoomId) {
      this.message.warning('Vui lòng chọn phòng');
      return;
    }

    this.isLoading = true;
    
    // Tự động cập nhật thông tin khách vào phòng (check-in luôn)
    const guestInfo = {
      name: this.getGuestName(this.selectedGuest),
      phone: this.selectedGuest.contactInfo?.phone || '',
      email: this.selectedGuest.contactInfo?.email || '',
      idNumber: this.selectedGuest.personalInfo?.idNumber || '',
      address: this.selectedGuest.contactInfo?.address?.street || 
               (this.selectedGuest.contactInfo?.address ? 
                 `${this.selectedGuest.contactInfo.address.street || ''}, ${this.selectedGuest.contactInfo.address.city || ''}, ${this.selectedGuest.contactInfo.address.state || ''}`.replace(/^,\s*|,\s*$/g, '') : ''),
      guestSource: 'walkin' // Sử dụng 'walkin' vì khách được quản lý từ hệ thống guest management, enum values: ['walkin', 'booking', 'agoda', 'traveloka', 'expedia', 'trip', 'g2j', 'other']
    };
    
    // Gọi API để check-in khách vào phòng
    this.roomsService.checkInRoom(this.selectedRoomId, {
      guestInfo: guestInfo,
      checkinTime: new Date(),
      rateType: 'hourly' // Mặc định theo giờ, có thể để user chọn sau
    }).subscribe({
      next: (response) => {
        this.message.success(`Đã assign và check-in khách "${this.getGuestName(this.selectedGuest!)}" vào phòng thành công`);
        this.handleAssignCancel();
        this.isLoading = false;
        // Reload danh sách phòng để cập nhật trạng thái
        this.loadRooms();
      },
      error: (error) => {
        const errorMessage = error.error?.message || error.error?.error || 'Lỗi assign khách vào phòng';
        
        // Kiểm tra lỗi về số lượng người tối đa
        if (errorMessage.includes('tối đa') || errorMessage.includes('đạt số lượng')) {
          this.message.error(errorMessage);
          this.isLoading = false;
          return;
        }
        
        // Nếu phòng đã có khách, vẫn cập nhật thông tin (nhưng không thêm khách mới)
        if (errorMessage.includes('đã có khách') || errorMessage.includes('occupied')) {
          // Cập nhật thông tin khách vào phòng đã occupied
          this.roomsService.updateRoomCheckinInfo(this.selectedRoomId!, guestInfo, 0).subscribe({
            next: () => {
              this.message.success(`Đã cập nhật thông tin khách "${this.getGuestName(this.selectedGuest!)}" vào phòng thành công`);
              this.handleAssignCancel();
              this.isLoading = false;
            },
            error: (err) => {
              this.message.error(err.error?.message || 'Cập nhật thông tin khách thất bại');
              this.isLoading = false;
            }
          });
        } else {
          this.message.error(errorMessage);
          this.isLoading = false;
        }
      }
    });
  }

  // ============ BOOKING (ĐẶT PHÒNG TRƯỚC) ============

  openBookingModal(guest: Guest): void {
    if (!this.canAssign(guest)) {
      this.message.warning('Bạn không có quyền đặt phòng cho khách này');
      return;
    }

    this.selectedGuest = guest;
    this.loadRooms();
    this.bookingForm.reset({
      roomId: null,
      checkInDate: null,
      checkOutDate: null,
      rateType: 'hourly',
      advancePayment: 0,
      notes: '',
      adults: guest.guestType === 'group' ? (guest.groupSize || 1) : 1,
      children: 0
    });
    this.isBookingModalVisible = true;
  }

  handleBookingCancel(): void {
    this.isBookingModalVisible = false;
    this.selectedGuest = null;
    this.bookingForm.reset();
  }

  handleBookingOk(): void {
    if (this.bookingForm.valid) {
      if (!this.selectedGuest) {
        this.message.warning('Không tìm thấy thông tin khách');
        return;
      }

      this.isLoading = true;
      const formValue = this.bookingForm.value;
      
      this.guestsService.createBookingForGuest(this.selectedGuest._id!, {
        roomId: formValue.roomId,
        checkInDate: formValue.checkInDate,
        checkOutDate: formValue.checkOutDate,
        rateType: formValue.rateType,
        advancePayment: formValue.advancePayment || 0,
        notes: formValue.notes || '',
        adults: formValue.adults || 1,
        children: formValue.children || 0
      }).subscribe({
        next: (response) => {
          this.message.success(response.message || 'Đặt phòng thành công');
          this.handleBookingCancel();
          this.isLoading = false;
        },
        error: (error) => {
          this.message.error(error.error?.message || 'Đặt phòng thất bại');
          this.isLoading = false;
        }
      });
    } else {
      Object.values(this.bookingForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
    }
  }

  // ============ HELPER METHODS ============

  getGuestName(guest: Guest): string {
    if (guest.personalInfo?.fullName) {
      return guest.personalInfo.fullName;
    }
    if (guest.personalInfo?.firstName && guest.personalInfo?.lastName) {
      return `${guest.personalInfo.firstName} ${guest.personalInfo.lastName}`;
    }
    return 'Khách không tên';
  }

  getGuestTypeLabel(guestType?: string): string {
    switch (guestType) {
      case 'regular': return 'Khách lưu';
      case 'frequent': return 'Khách quen';
      case 'group': return 'Khách đoàn';
      default: return 'Khách lưu';
    }
  }

  getHotelName(guest: Guest): string {
    if (typeof guest.hotelId === 'object' && guest.hotelId?.name) {
      return guest.hotelId.name;
    }
    const hotel = this.hotels.find(h => h._id === (typeof guest.hotelId === 'string' ? guest.hotelId : guest.hotelId?._id));
    return hotel?.name || 'N/A';
  }

  getGenderLabel(gender?: string): string {
    switch (gender) {
      case 'male': return 'Nam';
      case 'female': return 'Nữ';
      case 'other': return 'Khác';
      default: return '-';
    }
  }

  formatDate(date: Date | string | null | undefined): string {
    if (!date) return '-';
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(dateObj.getTime())) return '-';
      return format(dateObj, 'dd/MM/yyyy');
    } catch (e) {
      return '-';
    }
  }

  getAddress(guest: Guest): string {
    const address = guest.contactInfo?.address;
    if (!address) return '-';
    
    const parts: string[] = [];
    if (address.street) parts.push(address.street);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.country) parts.push(address.country);
    
    return parts.length > 0 ? parts.join(', ') : '-';
  }

  onSearch(): void {
    this.pageIndex = 1;
    this.loadGuests();
  }

  onPageChange(page: number): void {
    this.pageIndex = page;
    this.loadGuests();
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize = pageSize;
    this.pageIndex = 1;
    this.loadGuests();
  }

  // Getter methods để truy cập nested FormGroups (tránh lỗi 'as' trong template)
  get personalInfoForm(): FormGroup {
    return this.guestForm.get('personalInfo') as FormGroup;
  }

  get contactInfoForm(): FormGroup {
    return this.guestForm.get('contactInfo') as FormGroup;
  }

  get addressForm(): FormGroup {
    const contactInfo = this.guestForm.get('contactInfo') as FormGroup;
    return contactInfo?.get('address') as FormGroup;
  }

  // Xử lý khi OCR scan hoàn thành
  onOCRScanComplete(ocrData: any): void {
    if (!ocrData) return;
    
    // OCR scanner component đã tự động điền vào form thông qua Input bindings
    // Nhưng có thể cần xử lý thêm logic nếu cần
    this.message.success('Đã tự động điền thông tin từ OCR. Vui lòng kiểm tra và chỉnh sửa nếu cần.');
  }

  // Disable dates trước hôm nay cho check-in
  disabledStartDate = (current: Date): boolean => {
    if (!current) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return current < today;
  };

  // Disable dates trước check-in date cho check-out
  disabledEndDate = (current: Date): boolean => {
    if (!current) return false;
    if (!this.bookingForm) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return current < today;
    }
    const checkInDate = this.bookingForm.get('checkInDate')?.value;
    if (!checkInDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return current < today;
    }
    try {
      const checkIn = new Date(checkInDate);
      checkIn.setHours(0, 0, 0, 0);
      return current < checkIn;
    } catch (e) {
      return false;
    }
  };

  // Xuất Excel danh sách khách
  exportToExcel(): void {
    this.isExporting = true;
    
    // Lấy tất cả khách (không phân trang) để xuất Excel
    const query: GuestQuery = {
      page: 1,
      limit: 10000, // Lấy tất cả
      hotelId: this.selectedHotelId || undefined,
      guestType: this.selectedGuestType || undefined,
      search: this.searchValue || undefined
    };

    this.guestsService.getGuests(query).subscribe({
      next: (response) => {
        const allGuests = response.guests || [];
        
        if (allGuests.length === 0) {
          this.message.warning('Không có dữ liệu để xuất Excel');
          this.isExporting = false;
          return;
        }

        // Chuẩn bị dữ liệu cho Excel
        const excelData = allGuests.map(guest => ({
          'Tên khách': this.getGuestName(guest),
          'Giới tính': this.getGenderLabel(guest.personalInfo?.gender),
          'Ngày sinh': this.formatDate(guest.personalInfo?.dateOfBirth),
          'Loại khách': this.getGuestTypeLabel(guest.guestType),
          'CMND/CCCD': guest.personalInfo?.idNumber || '',
          'Số điện thoại': guest.contactInfo?.phone || '',
          'Số điện thoại dự phòng': guest.contactInfo?.alternativePhone || '',
          'Email': guest.contactInfo?.email || '',
          'Địa chỉ': this.getAddress(guest),
          'Khách sạn': this.getHotelName(guest),
          'Quốc tịch': guest.personalInfo?.nationality || '',
          'Loại giấy tờ': guest.personalInfo?.idType === 'id_card' ? 'CMND/CCCD' : 
                         guest.personalInfo?.idType === 'passport' ? 'Hộ chiếu' :
                         guest.personalInfo?.idType === 'driver_license' ? 'Bằng lái xe' : '',
          'Ngày hết hạn': this.formatDate(guest.personalInfo?.idExpiryDate),
          'Điểm tích lũy': guest.loyaltyPoints || 0,
          'Ghi chú': guest.notes || ''
        }));

        // Tạo worksheet
        const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(excelData);
        
        // Set column widths
        const colWidths = [
          { wch: 25 }, // Tên khách
          { wch: 10 }, // Giới tính
          { wch: 12 }, // Ngày sinh
          { wch: 12 }, // Loại khách
          { wch: 15 }, // CMND/CCCD
          { wch: 15 }, // Số điện thoại
          { wch: 15 }, // Số điện thoại dự phòng
          { wch: 25 }, // Email
          { wch: 40 }, // Địa chỉ
          { wch: 20 }, // Khách sạn
          { wch: 15 }, // Quốc tịch
          { wch: 15 }, // Loại giấy tờ
          { wch: 12 }, // Ngày hết hạn
          { wch: 12 }, // Điểm tích lũy
          { wch: 30 }  // Ghi chú
        ];
        worksheet['!cols'] = colWidths;

        const workbook: XLSX.WorkBook = { 
          Sheets: { 'Danh sách khách': worksheet }, 
          SheetNames: ['Danh sách khách'] 
        };

        // Tạo tên file
        const dateStr = format(new Date(), 'ddMMyyyy_HHmmss');
        const fileName = `Danh_sach_khach_${dateStr}`;

        // Xuất file
        XLSX.writeFile(workbook, `${fileName}.xlsx`);
        this.message.success(`Đã xuất ${allGuests.length} khách hàng ra file Excel thành công!`);
        this.isExporting = false;
      },
      error: (error) => {
        this.message.error(error.error?.message || 'Lỗi khi xuất file Excel');
        this.isExporting = false;
      }
    });
  }
}

