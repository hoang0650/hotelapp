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

@Component({
  selector: 'app-guest-management',
  templateUrl: './guest-management.component.html',
  styleUrls: ['./guest-management.component.css']
})
export class GuestManagementComponent implements OnInit {
  guestForm: FormGroup;
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
  total = 0;
  pageIndex = 1;
  pageSize = 20;
  searchValue = '';
  isModalVisible = false;
  isAssignModalVisible = false;
  isBookingModalVisible = false;
  selectedRoomId: string | null = null;
  bookingForm: FormGroup;

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
        firstName: ['', Validators.required],
        lastName: ['', Validators.required],
        dateOfBirth: [null],
        gender: [''],
        nationality: [''],
        idType: ['id_card'],
        idNumber: [''],
        idExpiryDate: [null]
      }),
      contactInfo: this.fb.group({
        email: ['', [Validators.email]],
        phone: ['', Validators.required],
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
            return hotelBusinessId === userBusinessId && h.status === 'active';
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
    this.guestForm.reset({
      hotelId: this.selectedHotelId,
      guestType: 'regular',
      personalInfo: {
        firstName: '',
        lastName: '',
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
      notes: ''
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
    
    this.guestForm.patchValue({
      hotelId: hotelId,
      guestType: guest.guestType || 'regular',
      personalInfo: {
        firstName: guest.personalInfo?.firstName || '',
        lastName: guest.personalInfo?.lastName || '',
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
    this.guestForm.reset();
  }

  handleOk(): void {
    if (this.guestForm.valid) {
      this.isLoading = true;
      const formValue = this.guestForm.value;

      const guestData: Partial<Guest> = {
        hotelId: formValue.hotelId,
        guestType: formValue.guestType,
        personalInfo: formValue.personalInfo,
        contactInfo: formValue.contactInfo,
        preferences: formValue.preferences,
        notes: formValue.notes
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
            this.message.error(error.error?.message || 'Cập nhật khách thất bại');
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
            this.message.error(error.error?.message || 'Tạo khách thất bại');
            this.isLoading = false;
          }
        });
      }
    } else {
      Object.values(this.guestForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
    }
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
    this.guestsService.assignGuestToRoom(this.selectedGuest._id!, {
      guestId: this.selectedGuest._id!,
      roomId: this.selectedRoomId,
      checkInTime: new Date()
    }).subscribe({
      next: (response) => {
        this.message.success('Thông tin khách đã được chuẩn bị. Vui lòng thực hiện check-in trong quản lý phòng.');
        this.handleAssignCancel();
        this.isLoading = false;
        // Có thể mở modal check-in ở đây nếu cần
      },
      error: (error) => {
        this.message.error(error.error?.message || 'Assign khách vào phòng thất bại');
        this.isLoading = false;
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

  // Disable dates trước hôm nay cho check-in
  disabledStartDate = (current: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return current && current < today;
  };

  // Disable dates trước check-in date cho check-out
  disabledEndDate = (current: Date): boolean => {
    const checkInDate = this.bookingForm?.get('checkInDate')?.value;
    if (!checkInDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return current && current < today;
    }
    const checkIn = new Date(checkInDate);
    checkIn.setHours(0, 0, 0, 0);
    return current && current < checkIn;
  };
}

