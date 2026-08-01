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
import { TranslateService } from '@ngx-translate/core';

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
    return this.authService.getToken() || '';
  }

  constructor(
    private fb: FormBuilder,
    private guestsService: GuestsService,
    private hotelService: HotelService,
    private roomsService: RoomsService,
    public authService: AuthService,
    private message: NzMessageService,
    private modal: NzModalService,
    private translate: TranslateService
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
        email: [''],
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
    const apply = (data: Hotel[]) => {
      const normalized = this.hotelService.normalizeHotelsList(data || []);
      let filtered: Hotel[] = [];

      if (this.isAdmin || this.isSuperAdmin) {
        filtered = normalized;
      } else if (this.isBusiness && this.currentUser?.businessId) {
        const userBusinessId = this.hotelService.normalizeHotelId(this.currentUser.businessId);
        filtered = normalized.filter(h => {
          const hotelBusinessId = this.hotelService.normalizeHotelId(this.extractBusinessId(h));
          return !!hotelBusinessId && !!userBusinessId && hotelBusinessId === userBusinessId
            && h.status === 'active';
        });
      } else if ((this.isHotelManager || this.isStaff)) {
        const userHotelId = this.hotelService.normalizeHotelId(this.currentUser?.hotelId)
          || this.hotelService.resolvePreferredHotelId();
        filtered = userHotelId
          ? normalized.filter(h => this.hotelService.sameHotelId(h._id, userHotelId) && h.status === 'active')
          : [];
      }

      const selected = this.hotelService.normalizeHotelId(this.selectedHotelId)
        || this.hotelService.resolvePreferredHotelId(this.authService.getHotelId())
        || this.hotelService.normalizeHotelId(this.currentUser?.hotelId);

      this.hotels = this.hotelService.ensureSelectedHotelOption(filtered, selected);

      const prev = this.hotelService.normalizeHotelId(this.selectedHotelId);
      if (selected && !this.hotelService.sameHotelId(prev, selected)) {
        this.onHotelChange(selected);
      } else if (selected) {
        this.selectedHotelId = selected;
      } else if (this.hotels.length > 0 && !this.selectedHotelId) {
        this.onHotelChange(this.hotels[0]._id!);
      }

      this.hydrateSelectedHotelLabel(selected);
      this.isLoading = false;
    };

    const cached = this.hotelService.getCachedHotels();
    if (cached.length > 0) {
      apply(cached);
    }

    this.hotelService.getHotelsCached(undefined, undefined, { lite: true }).subscribe({
      next: (data) => apply(data),
      error: (error) => {
        console.error('Error fetching hotels:', error);
        this.message.error(this.translate.instant('GUEST_MANAGEMENT.LOAD_HOTELS_ERROR'));
        this.isLoading = false;
      }
    });
  }

  private hydrateSelectedHotelLabel(hotelId: string | null): void {
    if (!hotelId) return;
    const current = this.hotels.find((h) => this.hotelService.sameHotelId(h._id, hotelId));
    if (current?.name && current.name !== 'Khách sạn đang chọn') return;

    this.hotelService.getHotelInfo(hotelId, { lite: true }).subscribe((hotel) => {
      if (!hotel) return;
      const id = this.hotelService.normalizeHotelId(hotel._id) || hotelId;
      const rest = this.hotels.filter((h) => !this.hotelService.sameHotelId(h._id, id));
      this.hotels = [{ ...hotel, _id: id, name: hotel.name || 'Khách sạn' } as Hotel, ...rest];
      this.selectedHotelId = id;
    });
  }

  onHotelChange(hotelId: string | null): void {
    this.selectedHotelId = this.hotelService.normalizeHotelId(hotelId);
    this.hotelService.setSelectedHotelId(this.selectedHotelId);
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
        this.message.error(this.translate.instant('GUEST_MANAGEMENT.LOAD_GUESTS_ERROR'));
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
        this.message.error(this.translate.instant('GUEST_MANAGEMENT.LOAD_ROOMS_ERROR'));
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
      this.message.warning(this.translate.instant('GUEST_MANAGEMENT.NO_PERMISSION_EDIT'));
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
        errors.push(this.translate.instant('GUEST_MANAGEMENT.REQUIRED_HOTEL'));
      }
      if (this.guestForm.get('guestType')?.invalid) {
        errors.push(this.translate.instant('GUEST_MANAGEMENT.REQUIRED_GUEST_TYPE'));
      }
      
      const personalInfo = this.guestForm.get('personalInfo') as FormGroup;
      if (personalInfo) {
        if (personalInfo.get('fullName')?.invalid) {
          errors.push(this.translate.instant('GUEST_MANAGEMENT.REQUIRED_FULL_NAME'));
        }
      }
      
      const contactInfo = this.guestForm.get('contactInfo') as FormGroup;
      if (contactInfo) {
        if (contactInfo.get('email')?.invalid) {
          errors.push(this.translate.instant('GUEST_MANAGEMENT.INVALID_EMAIL'));
        }
      }
      
      if (errors.length > 0) {
        this.message.warning(errors[0]);
      } else {
        this.message.warning(this.translate.instant('GUEST_MANAGEMENT.FILL_REQUIRED_FIELDS'));
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
          this.message.success(response.message || this.translate.instant('GUEST_MANAGEMENT.UPDATE_SUCCESS'));
          this.loadGuests();
          this.handleCancel();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error updating guest:', error);
          const errorMessage = error.error?.message || error.message || this.translate.instant('GUEST_MANAGEMENT.UPDATE_FAILED');
          this.message.error(errorMessage);
          this.isLoading = false;
        }
      });
    } else {
      // Create
      this.guestsService.createGuest(guestData).subscribe({
        next: (response) => {
          this.message.success(response.message || this.translate.instant('GUEST_MANAGEMENT.CREATE_SUCCESS'));
          this.loadGuests();
          this.handleCancel();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error creating guest:', error);
          const errorMessage = error.error?.message || error.message || this.translate.instant('GUEST_MANAGEMENT.CREATE_FAILED');
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
      this.message.warning(this.translate.instant('GUEST_MANAGEMENT.NO_PERMISSION_DELETE'));
      return;
    }

    this.modal.confirm({
      nzTitle: this.translate.instant('GUEST_MANAGEMENT.CONFIRM_DELETE'),
      nzContent: this.translate.instant('GUEST_MANAGEMENT.CONFIRM_DELETE_MESSAGE', { name: this.getGuestName(guest) }),
      nzOkText: this.translate.instant('GUEST_MANAGEMENT.DELETE_BUTTON'),
      nzOkDanger: true,
      nzCancelText: this.translate.instant('GUEST_MANAGEMENT.CANCEL'),
      nzOnOk: () => {
        this.isLoading = true;
        this.guestsService.deleteGuest(guest._id!).subscribe({
          next: (response) => {
            this.message.success(response.message || this.translate.instant('GUEST_MANAGEMENT.DELETE_SUCCESS'));
            this.loadGuests();
            this.isLoading = false;
          },
          error: (error) => {
            this.message.error(error.error?.message || this.translate.instant('GUEST_MANAGEMENT.DELETE_FAILED'));
            this.isLoading = false;
          }
        });
      }
    });
  }

  // ============ ASSIGN TO ROOM ============

  openAssignModal(guest: Guest): void {
    if (!this.canAssign(guest)) {
      this.message.warning(this.translate.instant('GUEST_MANAGEMENT.NO_PERMISSION_ASSIGN'));
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
      this.message.warning(this.translate.instant('GUEST_MANAGEMENT.REQUIRED_ROOM'));
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
        this.message.success(this.translate.instant('GUEST_MANAGEMENT.ASSIGN_SUCCESS', { name: this.getGuestName(this.selectedGuest!) }));
        this.handleAssignCancel();
        this.isLoading = false;
        // Reload danh sách phòng để cập nhật trạng thái
        this.loadRooms();
      },
      error: (error) => {
        const errorMessage = error.error?.message || error.error?.error || this.translate.instant('GUEST_MANAGEMENT.ASSIGN_ERROR');
        
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
              this.message.success(this.translate.instant('GUEST_MANAGEMENT.UPDATE_GUEST_INFO_SUCCESS', { name: this.getGuestName(this.selectedGuest!) }));
              this.handleAssignCancel();
              this.isLoading = false;
            },
            error: (err) => {
              this.message.error(err.error?.message || this.translate.instant('GUEST_MANAGEMENT.UPDATE_GUEST_INFO_FAILED'));
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
      this.message.warning(this.translate.instant('GUEST_MANAGEMENT.NO_PERMISSION_BOOK'));
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
        this.message.warning(this.translate.instant('GUEST_MANAGEMENT.GUEST_NOT_FOUND'));
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
          this.message.success(response.message || this.translate.instant('GUEST_MANAGEMENT.BOOKING_SUCCESS'));
          this.handleBookingCancel();
          this.isLoading = false;
        },
        error: (error) => {
          this.message.error(error.error?.message || this.translate.instant('GUEST_MANAGEMENT.BOOKING_FAILED'));
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
    return this.translate.instant('GUEST_MANAGEMENT.NO_NAME_GUEST');
  }

  getGuestTypeLabel(guestType?: string): string {
    switch (guestType) {
      case 'regular': return this.translate.instant('GUEST_MANAGEMENT.REGULAR_GUEST');
      case 'frequent': return this.translate.instant('GUEST_MANAGEMENT.FREQUENT_GUEST');
      case 'group': return this.translate.instant('GUEST_MANAGEMENT.GROUP_GUEST');
      default: return this.translate.instant('GUEST_MANAGEMENT.REGULAR_GUEST');
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
      case 'male': return this.translate.instant('GUEST_MANAGEMENT.MALE');
      case 'female': return this.translate.instant('GUEST_MANAGEMENT.FEMALE');
      case 'other': return this.translate.instant('GUEST_MANAGEMENT.OTHER');
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

  private getOcrSourceData(ocrData: any): Record<string, any> {
    if (ocrData?.result?.data && typeof ocrData.result.data === 'object') {
      return ocrData.result.data;
    }
    if (ocrData?.data && typeof ocrData.data === 'object') {
      return ocrData.data;
    }
    return ocrData || {};
  }

  private getOcrValue(ocrData: any, keys: string[]): string {
    const source = this.getOcrSourceData(ocrData);
    for (const key of keys) {
      const value = source?.[key] ?? ocrData?.[key];
      if (value !== undefined && value !== null && `${value}`.trim() !== '') {
        return `${value}`.trim();
      }
    }
    return '';
  }

  private normalizeOcrGender(value: string): string {
    const raw = (value || '').toLowerCase();
    if (raw === 'male' || raw.includes('nam')) return 'male';
    if (raw === 'female' || raw.includes('nữ') || raw === 'nu') return 'female';
    if (raw === 'other' || raw.includes('khác')) return 'other';
    return '';
  }

  private parseOcrDate(value: string): Date | null {
    if (!value) return null;
    const normalized = value.replace(/[\.\-\s]/g, '/').trim();
    const parts = normalized.split('/');
    if (parts.length === 3) {
      const isYearFirst = parts[0].length === 4;
      const day = parseInt(isYearFirst ? parts[2] : parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(isYearFirst ? parts[0] : parts[2], 10);
      if (year >= 1900 && year <= 2100 && day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        const dt = new Date(year, month, day);
        if (!isNaN(dt.getTime())) return dt;
      }
    }
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

 onOCRScanComplete(response: any): void {
    console.log('[GuestSaveModal] Raw OCR response:', response);

    if (!response) {
      console.error('[GuestSaveModal] Dữ liệu trả về rỗng');
      return;
    }

    // 1. Trích xuất ocrData linh hoạt cho mọi trường hợp emit
    let ocrData: any = null;
    let cardType = '';

    if (response.result && response.result.data) {
      // Dạng 1: Có wrapper { success: true, result: { type: '...', data: {...} } }
      ocrData = response.result.data;
      cardType = response.result.type || '';
    } else if (response.data) {
      // Dạng 2: Truyền thẳng { type: '...', data: {...} } (Như trong ảnh console của bạn)
      ocrData = response.data;
      cardType = response.type || '';
    } else {
      // Fallback
      ocrData = response;
    }

    if (!ocrData || Object.keys(ocrData).length === 0) {
      console.error('[GuestSaveModal] Invalid OCR response format:', response);
      this.message.error('Không tìm thấy thông tin hợp lệ từ ảnh scan');
      return;
    }

    console.log('[GuestSaveModal] Processing OCR data fields:', Object.keys(ocrData));

    // 2. Map dữ liệu từ tiếng Việt sang format của Angular Form
    const mappedData = {
      fullName: ocrData['Họ tên'] || ocrData['Họ và tên'] || '',
      idNumber: ocrData['Số ID'] || ocrData['Số CCCD'] || '',
      dob: ocrData['Ngày sinh'] || '',
      gender: ocrData['Giới tính'] || '',
      address: ocrData['Địa chỉ thường trú'] || ocrData['Địa chỉ'] || ocrData['Quê quán'] || '',
      nationality: ocrData['Quốc tịch'] || 'Việt Nam'
    };

    // 3. Patch data vào personalInfoForm
    if (this.personalInfoForm) {
      const pForm = this.personalInfoForm;

      if (mappedData.fullName) {
        pForm.patchValue({ fullName: mappedData.fullName.trim() });
      }

      if (mappedData.idNumber) {
        pForm.patchValue({ idNumber: mappedData.idNumber.replace(/\s+/g, '') });
      }

      if (mappedData.dob) {
        const parsedDob = this.parseOcrDate(mappedData.dob);
        pForm.patchValue({ birthday: parsedDob });
      }

      if (mappedData.gender) {
        const g = mappedData.gender.toLowerCase();
        let genderValue = '';
        if (g.includes('nam') || g === 'male') genderValue = 'male';
        else if (g.includes('nữ') || g.includes('nu') || g === 'female') genderValue = 'female';
        
        if (genderValue) {
          pForm.patchValue({ gender: genderValue });
        }
      }

      pForm.patchValue({ nationality: mappedData.nationality });
    }

    // 4. Patch data vào addressForm
    if (this.addressForm && mappedData.address) {
      let cleanAddress = mappedData.address.replace(/\s+/g, ' ').trim();
      
      const labelsToRemove = [/địa\s*chỉ\s*thường\s*trú:?/iu, /quê\s*quán:?/iu, /nơi\s*thường\s*trú:?/iu];
      labelsToRemove.forEach(regex => {
        cleanAddress = cleanAddress.replace(regex, '');
      });

      // Loại bỏ dấu phẩy rác ở đầu chuỗi (nếu có)
      cleanAddress = cleanAddress.replace(/^[,.\s]+/, '');

      this.addressForm.patchValue({ 
        street: cleanAddress,
        country: mappedData.nationality
      });
    }

    this.message.success(`Đã tự động điền thông tin từ ${cardType || 'AI'}. Vui lòng kiểm tra lại.`);
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
          this.message.warning(this.translate.instant('GUEST_MANAGEMENT.NO_DATA_EXPORT'));
          this.isExporting = false;
          return;
        }

        // Chuẩn bị dữ liệu cho Excel
        const excelData = allGuests.map(guest => ({
          [this.translate.instant('GUEST_MANAGEMENT.GUEST_NAME_COLUMN')]: this.getGuestName(guest),
          [this.translate.instant('GUEST_MANAGEMENT.GENDER_COLUMN')]: this.getGenderLabel(guest.personalInfo?.gender),
          [this.translate.instant('GUEST_MANAGEMENT.DATE_OF_BIRTH_COLUMN')]: this.formatDate(guest.personalInfo?.dateOfBirth),
          [this.translate.instant('GUEST_MANAGEMENT.GUEST_TYPE_COLUMN')]: this.getGuestTypeLabel(guest.guestType),
          [this.translate.instant('GUEST_MANAGEMENT.ID_NUMBER_COLUMN')]: guest.personalInfo?.idNumber || '',
          [this.translate.instant('GUEST_MANAGEMENT.PHONE_COLUMN')]: guest.contactInfo?.phone || '',
          [this.translate.instant('GUEST_MANAGEMENT.ALTERNATIVE_PHONE_COLUMN')]: guest.contactInfo?.alternativePhone || '',
          [this.translate.instant('GUEST_MANAGEMENT.EMAIL_COLUMN')]: guest.contactInfo?.email || '',
          [this.translate.instant('GUEST_MANAGEMENT.ADDRESS_COLUMN')]: this.getAddress(guest),
          [this.translate.instant('GUEST_MANAGEMENT.HOTEL_COLUMN')]: this.getHotelName(guest),
          [this.translate.instant('GUEST_MANAGEMENT.NATIONALITY_COLUMN')]: guest.personalInfo?.nationality || '',
          [this.translate.instant('GUEST_MANAGEMENT.ID_TYPE_COLUMN')]: guest.personalInfo?.idType === 'id_card' ? this.translate.instant('GUEST_MANAGEMENT.ID_CARD') : 
                         guest.personalInfo?.idType === 'passport' ? this.translate.instant('GUEST_MANAGEMENT.PASSPORT') :
                         guest.personalInfo?.idType === 'driver_license' ? this.translate.instant('GUEST_MANAGEMENT.DRIVER_LICENSE') : '',
          [this.translate.instant('GUEST_MANAGEMENT.ID_EXPIRY_DATE_COLUMN')]: this.formatDate(guest.personalInfo?.idExpiryDate),
          [this.translate.instant('GUEST_MANAGEMENT.LOYALTY_POINTS_COLUMN')]: guest.loyaltyPoints || 0,
          [this.translate.instant('GUEST_MANAGEMENT.NOTES_COLUMN')]: guest.notes || ''
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
          Sheets: { [this.translate.instant('GUEST_MANAGEMENT.EXCEL_SHEET_NAME')]: worksheet }, 
          SheetNames: [this.translate.instant('GUEST_MANAGEMENT.EXCEL_SHEET_NAME')] 
        };

        // Tạo tên file
        const dateStr = format(new Date(), 'ddMMyyyy_HHmmss');
        const fileName = `Danh_sach_khach_${dateStr}`;

        // Xuất file
        XLSX.writeFile(workbook, `${fileName}.xlsx`);
        this.message.success(this.translate.instant('GUEST_MANAGEMENT.EXPORT_SUCCESS', { count: allGuests.length }));
        this.isExporting = false;
      },
      error: (error) => {
        this.message.error(error.error?.message || this.translate.instant('GUEST_MANAGEMENT.EXPORT_ERROR'));
        this.isExporting = false;
      }
    });
  }
}

