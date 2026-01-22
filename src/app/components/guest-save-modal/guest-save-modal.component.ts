import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzModalRef, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { GuestsService } from '../../services/guests.service';
import { Guest } from '../../models/guest.model';
import { Room } from '../../interfaces/rooms';
import { AuthService } from '../../services/auth.service';
import { RoomsService } from '../../services/rooms.service';

@Component({
  selector: 'app-guest-save-modal',
  templateUrl: './guest-save-modal.component.html',
  styleUrls: ['./guest-save-modal.component.css']
})
export class GuestSaveModalComponent implements OnInit, OnDestroy {
  guestForm!: FormGroup;
  room!: Room;
  guests: Guest[] = [];
  isLoading = false;
  selectedGuestId: string | null = null;
  showGuestList = false;
  searchValue = '';

  // OCR related - đã chuyển sang component riêng
  get personalInfoForm(): FormGroup {
    return this.guestForm.get('personalInfo') as FormGroup;
  }

  get contactInfoForm(): FormGroup {
    return this.guestForm.get('contactInfo') as FormGroup;
  }

  get addressForm(): FormGroup {
    return this.contactInfoForm.get('address') as FormGroup;
  }

  private parseDate(input: any): Date | null {
    if (!input) return null;
    if (input instanceof Date && !isNaN(input.getTime())) return input;
    if (typeof input === 'string') {
      const s = input.replace(/[\.\-\s]/g, '/').trim();
      const parts = s.split('/');
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          const dt = new Date(y, m - 1, d);
          if (!isNaN(dt.getTime())) return dt;
        }
      }
    }
    return null;
  }

  onOCRScanComplete(ocrData: any): void {
    if (!ocrData) return;
    
    console.log('[GuestSaveModal] OCR data received:', {
      fullName: ocrData.fullName,
      gender: ocrData.gender,
      nationality: ocrData.nationality,
      idNumber: ocrData.idNumber,
      dateOfBirth: ocrData.dateOfBirth,
      dateOfIssue: ocrData.dateOfIssue,
      dateOfExpiry: ocrData.dateOfExpiry,
      address: ocrData.address ? ocrData.address.substring(0, 50) + '...' : null
    });
    
    const rawLines: string[] = Array.isArray(ocrData.rawText)
      ? ocrData.rawText
      : typeof ocrData.rawText === 'string'
        ? ocrData.rawText.split(/\r?\n/)
        : [];
    const normLines = rawLines.map(l => (l || '').trim()).filter(l => l.length > 0);
    let parsedFullName = '';
    const nameLabelIdx = normLines.findIndex(l => /(họ\s*và\s*tên|ho\s*va\s*ten|full\s*name)/i.test(l));
    if (nameLabelIdx >= 0) {
      const line = normLines[nameLabelIdx];
      const afterColon = line.split(':').slice(1).join(':').trim();
      if (afterColon && !/^\d{9,12}$/.test(afterColon)) {
        parsedFullName = afterColon;
      } else {
        const next = normLines[nameLabelIdx + 1] || '';
        if (next && !/^\d{9,12}$/.test(next)) {
          parsedFullName = next;
        }
      }
    }
    if (!parsedFullName && typeof ocrData.fullName === 'string') {
      parsedFullName = String(ocrData.fullName).trim();
    }
    if (parsedFullName && !/khách\s*lẻ/i.test(parsedFullName)) {
      ocrData.fullName = parsedFullName;
    }
    
    const addressValue = typeof ocrData.address === 'string' ? ocrData.address : '';
    const placeBirthRegex = /\bplace\s*(?:of|ot|o[ft])\s*birth\b/iu;
    const vnBirthRegex = /(nơi\s*sinh|quê\s*quán|khai\s*sinh)/iu;
    let cleanedAddress = addressValue.replace(placeBirthRegex, '').replace(vnBirthRegex, '');
    const specificRemove = /Thù\s*Th(i|ị)êm,\s*TP\.\s*Th(ủ|ù)\s*Đ(ức|ửc),\s*TP\.\s*H(ồ|o)\s*Ch(i|í)\s*Minh/giu;
    cleanedAddress = cleanedAddress.replace(specificRemove, '');
    if (!cleanedAddress && normLines.length) {
      const addrLines = normLines.filter(l => !placeBirthRegex.test(l) && !vnBirthRegex.test(l));
      cleanedAddress = addrLines.join(' ');
    }
    cleanedAddress = cleanedAddress.replace(/\s+/g, ' ').trim();
    if (cleanedAddress) {
      ocrData.address = cleanedAddress;
    }
    
    // Điền vào personalInfo
    if (this.personalInfoForm) {
      if (ocrData.fullName) {
        this.personalInfoForm.patchValue({ fullName: ocrData.fullName });
        console.log('[GuestSaveModal] Set fullName:', ocrData.fullName);
      }
      if (ocrData.dateOfBirth) {
        const dob = this.parseDate(ocrData.dateOfBirth);
        this.personalInfoForm.patchValue({ dateOfBirth: dob });
        console.log('[GuestSaveModal] Set dateOfBirth:', dob);
      }
      if (ocrData.dateOfExpiry) {
        const doe = this.parseDate(ocrData.dateOfExpiry);
        this.personalInfoForm.patchValue({ idExpiryDate: doe });
        console.log('[GuestSaveModal] Set idExpiryDate:', doe);
      }
      if (ocrData.gender && (ocrData.gender === 'male' || ocrData.gender === 'female')) {
        this.personalInfoForm.patchValue({ gender: ocrData.gender });
        console.log('[GuestSaveModal] Set gender:', ocrData.gender);
      }
      const nationality = ocrData.nationality || 'Việt Nam';
      if (nationality) {
        this.personalInfoForm.patchValue({ nationality });
        console.log('[GuestSaveModal] Set nationality:', ocrData.nationality);
      }
      if (ocrData.idNumber) {
        const idNumber = String(ocrData.idNumber).replace(/\s+/g, '').trim();
        this.personalInfoForm.patchValue({ idNumber });
        console.log('[GuestSaveModal] Set idNumber:', ocrData.idNumber);
      }
    }
    
    // Điền vào contactInfo
    if (this.contactInfoForm) {
      const addr = ocrData.address;
      if (addr && this.addressForm) {
        const street = String(addr).replace(/\s+/g, ' ').trim();
        this.addressForm.patchValue({ street });
        console.log('[GuestSaveModal] Set address:', addr.substring(0, 50) + '...');
      }
    }
    
    this.message.success('Đã tự động điền thông tin từ OCR. Vui lòng kiểm tra và chỉnh sửa nếu cần.');
  }

  constructor(
    @Inject(NZ_MODAL_DATA) public data: { room: Room; guestInfo?: any; openWithOCR?: boolean },
    private modalRef: NzModalRef,
    private fb: FormBuilder,
    private guestsService: GuestsService,
    private roomsService: RoomsService,
    private message: NzMessageService,
    private authService: AuthService
  ) {
    this.room = data.room;
  }

  currentTabIndex = 1; // Tab mặc định là "Nhập thông tin mới"

  ngOnInit(): void {
    this.initForm();
    this.loadGuests();
    
    // Nếu có guestInfo từ room, điền vào form
    if (this.data.guestInfo) {
      this.fillFormFromGuestInfo(this.data.guestInfo);
    }
  }

  onTabChange(event: any): void {
    const index = typeof event === 'number' ? event : event.index;
    this.currentTabIndex = index;
    if (index === 0) {
      // Tab chọn khách đã có
      this.selectedGuestId = null;
      this.showGuestList = true;
    }
  }

  initForm(): void {
    this.guestForm = this.fb.group({
      hotelId: [this.room.hotelId, Validators.required],
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
      notes: ['']
    });
  }

  fillFormFromGuestInfo(guestInfo: any): void {
    if (!guestInfo) return;
    
    const personalInfo = this.guestForm.get('personalInfo') as FormGroup;
    const contactInfo = this.guestForm.get('contactInfo') as FormGroup;
    
    // Điền fullName từ guestInfo.name
    if (guestInfo.name) {
      personalInfo.patchValue({
        fullName: guestInfo.name
      });
    }
    
    if (guestInfo.phone) {
      contactInfo.patchValue({ phone: guestInfo.phone });
    }
    
    if (guestInfo.email) {
      contactInfo.patchValue({ email: guestInfo.email });
    }
    
    if (guestInfo.idNumber) {
      personalInfo.patchValue({ idNumber: guestInfo.idNumber });
    }
    
    if (guestInfo.address) {
      const addressGroup = contactInfo.get('address') as FormGroup;
      addressGroup.patchValue({
        street: guestInfo.address.street || '',
        city: guestInfo.address.city || '',
        state: guestInfo.address.state || '',
        country: guestInfo.address.country || '',
        postalCode: guestInfo.address.postalCode || ''
      });
    }
    
    if (guestInfo.notes) {
      this.guestForm.patchValue({ notes: guestInfo.notes });
    }
  }

  loadGuests(): void {
    if (!this.room.hotelId) return;
    
    this.isLoading = true;
    this.guestsService.getGuests({
      hotelId: this.room.hotelId,
      limit: 50,
      search: this.searchValue
    }).subscribe({
      next: (response) => {
        this.guests = response.guests;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading guests:', error);
        this.isLoading = false;
      }
    });
  }

  onSearchGuests(value: string): void {
    this.searchValue = value;
    this.loadGuests();
  }

  selectGuest(guest: Guest): void {
    this.selectedGuestId = guest._id!;
    this.showGuestList = false;
    
    // Điền form với thông tin khách đã chọn
    const personalInfo = this.guestForm.get('personalInfo') as FormGroup;
    const contactInfo = this.guestForm.get('contactInfo') as FormGroup;
    
    if (guest.personalInfo) {
      const fullName = guest.personalInfo.fullName || 
                       (guest.personalInfo.firstName && guest.personalInfo.lastName 
                         ? `${guest.personalInfo.firstName} ${guest.personalInfo.lastName}`.trim()
                         : guest.personalInfo.firstName || guest.personalInfo.lastName || '');
      
      personalInfo.patchValue({
        fullName: fullName,
        dateOfBirth: guest.personalInfo.dateOfBirth ? new Date(guest.personalInfo.dateOfBirth) : null,
        gender: guest.personalInfo.gender || '',
        nationality: guest.personalInfo.nationality || '',
        idType: guest.personalInfo.idType || 'id_card',
        idNumber: guest.personalInfo.idNumber || '',
        idExpiryDate: guest.personalInfo.idExpiryDate ? new Date(guest.personalInfo.idExpiryDate) : null
      });
    }
    
    if (guest.contactInfo) {
      contactInfo.patchValue({
        email: guest.contactInfo.email || '',
        phone: guest.contactInfo.phone || '',
        alternativePhone: guest.contactInfo.alternativePhone || ''
      });
      
      if (guest.contactInfo.address) {
        const addressGroup = contactInfo.get('address') as FormGroup;
        addressGroup.patchValue({
          street: guest.contactInfo.address.street || '',
          city: guest.contactInfo.address.city || '',
          state: guest.contactInfo.address.state || '',
          country: guest.contactInfo.address.country || '',
          postalCode: guest.contactInfo.address.postalCode || ''
        });
      }
    }
    
    if (guest.guestType) {
      this.guestForm.patchValue({ guestType: guest.guestType });
    }
    
    if (guest.notes) {
      this.guestForm.patchValue({ notes: guest.notes });
    }
  }

  ngOnDestroy(): void {
    // Cleanup nếu cần
  }

  handleOk(): void {
    if (this.currentTabIndex === 0) {
      // Tab chọn khách đã có
      if (!this.selectedGuestId) {
        this.message.warning('Vui lòng chọn khách từ danh sách');
        return;
      }
      this.assignGuestToRoom();
    } else {
      // Tab nhập thông tin mới
      this.saveAndAssignGuest();
    }
  }

  assignGuestToRoom(): void {
    if (!this.selectedGuestId) return;
    
    this.isLoading = true;
    
    // Kiểm tra số lượng người tối đa của phòng
    const maxCapacity = this.room.capacity?.adults || 2; // Mặc định 2 người
    
    // Lấy thông tin khách để cập nhật vào phòng
    this.guestsService.getGuestById(this.selectedGuestId).subscribe({
      next: (guest) => {
        // Lấy địa chỉ đầy đủ từ guest
        const addressParts: string[] = [];
        if (guest.contactInfo?.address?.street) {
          addressParts.push(guest.contactInfo.address.street);
        }
        if (guest.contactInfo?.address?.city) {
          addressParts.push(guest.contactInfo.address.city);
        }
        if (guest.contactInfo?.address?.state) {
          addressParts.push(guest.contactInfo.address.state);
        }
        const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : '';
        
        const guestInfo = {
          name: this.getGuestName(guest),
          phone: guest.contactInfo?.phone || '',
          email: guest.contactInfo?.email || '',
          idNumber: guest.personalInfo?.idNumber || '',
          address: fullAddress,
          guestSource: 'walkin' // Sử dụng 'walkin' vì khách được quản lý từ hệ thống guest management, enum values: ['walkin', 'booking', 'agoda', 'traveloka', 'expedia', 'trip', 'g2j', 'other']
        };
        
        console.log('[GuestSaveModal] Assigning existing guest to room:', {
          roomId: this.room._id,
          guestId: this.selectedGuestId,
          guestInfo: guestInfo
        });
        
        // Tự động cập nhật thông tin khách vào phòng (check-in luôn)
        this.roomsService.checkInRoom(this.room._id, {
          guestInfo: guestInfo,
          checkInTime: new Date(),
          rateType: 'hourly'
        }).subscribe({
          next: (response: any) => {
            console.log('[GuestSaveModal] Check-in existing guest successful');
            this.message.success(`Đã assign và check-in khách "${this.getGuestName(guest)}" vào phòng thành công`);
            this.modalRef.close({ success: true, guestId: this.selectedGuestId });
            this.isLoading = false;
          },
          error: (error: any) => {
            console.error('[GuestSaveModal] Check-in existing guest error:', error);
            const errorMessage = error.error?.message || error.error?.error || 'Lỗi assign khách vào phòng';
            
            // Kiểm tra lỗi về số lượng người tối đa
            if (errorMessage.includes('tối đa') || errorMessage.includes('đạt số lượng')) {
              this.message.error(errorMessage);
              this.isLoading = false;
              return;
            }
            
            // Nếu phòng đã có khách, vẫn cập nhật thông tin (nhưng không thêm khách mới)
            if (errorMessage.includes('đã có khách') || errorMessage.includes('occupied')) {
              // Nếu phòng đã occupied, chỉ update thông tin khách hiện tại, không thêm khách mới
              this.roomsService.updateRoomCheckinInfo(this.room._id, guestInfo, 0).subscribe({
                next: () => {
                  console.log('[GuestSaveModal] Update room check-in info for existing guest successful');
                  this.message.success(`Đã cập nhật thông tin khách "${this.getGuestName(guest)}" vào phòng thành công`);
                  this.modalRef.close({ success: true, guestId: this.selectedGuestId });
                  this.isLoading = false;
                },
                error: (err: any) => {
                  console.error('[GuestSaveModal] Update room check-in info error:', err);
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
      },
      error: (error: any) => {
        console.error('[GuestSaveModal] Get guest by ID error:', error);
        this.message.error('Không thể lấy thông tin khách');
        this.isLoading = false;
      }
    });
  }
  
  getGuestName(guest: Guest): string {
    if (guest.personalInfo?.fullName) {
      return guest.personalInfo.fullName;
    }
    // Fallback cho dữ liệu cũ
    if (guest.personalInfo?.firstName && guest.personalInfo?.lastName) {
      return `${guest.personalInfo.firstName} ${guest.personalInfo.lastName}`;
    }
    return guest.personalInfo?.firstName || guest.personalInfo?.lastName || 'Khách không tên';
  }

  saveAndAssignGuest(): void {
    if (this.guestForm.invalid) {
      this.markFormGroupTouched(this.guestForm);
      this.message.warning('Vui lòng điền đầy đủ thông tin bắt buộc');
      return;
    }
    
    this.isLoading = true;
    const formValue = this.guestForm.value;
    
    console.log('[GuestSaveModal] Saving guest with form data:', {
      fullName: formValue.personalInfo?.fullName,
      gender: formValue.personalInfo?.gender,
      nationality: formValue.personalInfo?.nationality,
      idNumber: formValue.personalInfo?.idNumber,
      dateOfBirth: formValue.personalInfo?.dateOfBirth,
      phone: formValue.contactInfo?.phone,
      address: formValue.contactInfo?.address
    });
    
    // Chuẩn bị dữ liệu gửi lên backend (giống như guest-management)
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
    
    // Upload ảnh CCCD/GPLX nếu có (sẽ xử lý sau)
    
    this.guestsService.createGuest(guestData).subscribe({
      next: (response) => {
        console.log('[GuestSaveModal] Guest created successfully:', response.guest._id);
        this.message.success('Lưu thông tin khách thành công');
        
        // Tự động cập nhật thông tin khách vào phòng (check-in luôn)
        if (response.guest._id) {
          // Lấy địa chỉ đầy đủ từ form
          const addressParts: string[] = [];
          if (formValue.contactInfo?.address?.street) {
            addressParts.push(formValue.contactInfo.address.street);
          }
          if (formValue.contactInfo?.address?.city) {
            addressParts.push(formValue.contactInfo.address.city);
          }
          if (formValue.contactInfo?.address?.state) {
            addressParts.push(formValue.contactInfo.address.state);
          }
          const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : '';
          
          const guestInfo = {
            name: formValue.personalInfo?.fullName || 'Khách lẻ',
            phone: formValue.contactInfo?.phone || '',
            email: formValue.contactInfo?.email || '',
            idNumber: formValue.personalInfo?.idNumber || '',
            address: fullAddress,
            guestSource: 'walkin' // Sử dụng 'walkin' vì khách được quản lý từ hệ thống guest management, enum values: ['walkin', 'booking', 'agoda', 'traveloka', 'expedia', 'trip', 'g2j', 'other']
          };
          
          console.log('[GuestSaveModal] Assigning guest to room:', {
            roomId: this.room._id,
            guestInfo: guestInfo
          });
          
          this.roomsService.checkInRoom(this.room._id, {
            guestInfo: guestInfo,
            checkInTime: new Date(),
            rateType: 'hourly'
          }).subscribe({
            next: (checkinResponse: any) => {
              console.log('[GuestSaveModal] Check-in successful');
              this.message.success('Đã lưu và check-in khách vào phòng thành công');
              this.modalRef.close({ success: true, guestId: response.guest._id });
              this.isLoading = false;
            },
            error: (checkinError: any) => {
              console.error('[GuestSaveModal] Check-in error:', checkinError);
              // Nếu phòng đã có khách, vẫn cập nhật thông tin
              if (checkinError.error?.message?.includes('đã có khách') || 
                  checkinError.error?.message?.includes('occupied') ||
                  checkinError.error?.error?.includes('occupied')) {
                this.roomsService.updateRoomCheckinInfo(this.room._id, guestInfo, 0).subscribe({
                  next: () => {
                    console.log('[GuestSaveModal] Update room check-in info successful');
                    this.message.success('Đã lưu và cập nhật thông tin khách vào phòng thành công');
                    this.modalRef.close({ success: true, guestId: response.guest._id });
                    this.isLoading = false;
                  },
                  error: (err: any) => {
                    console.error('[GuestSaveModal] Update room check-in info error:', err);
                    this.message.error(err.error?.message || 'Cập nhật thông tin khách thất bại');
                    this.isLoading = false;
                  }
                });
              } else {
                this.message.error(checkinError.error?.message || checkinError.error?.error || 'Lỗi check-in khách vào phòng');
                this.isLoading = false;
              }
            }
          });
        } else {
          this.modalRef.close({ success: true, guest: response.guest });
          this.isLoading = false;
        }
      },
      error: (error) => {
        console.error('[GuestSaveModal] Create guest error:', error);
        this.message.error(error.error?.message || 'Lỗi lưu thông tin khách');
        this.isLoading = false;
      }
    });
  }

  handleCancel(): void {
    this.modalRef.close();
  }

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

}

