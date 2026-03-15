import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzModalRef, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { GuestsService } from '../../services/guests.service';
import { Guest } from '../../models/guest.model';
import { Room } from '../../interfaces/rooms';
import { AuthService } from '../../services/auth.service';
import { RoomsService } from '../../services/rooms.service';

interface OcrScanPayload {
  success?: boolean;
  result?: {
    type?: string;
    data?: Record<string, any>;
  };
  parsedData?: any;
  data?: Record<string, any>;
}

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

  private isValidName(name: string): boolean {
    const s = (name || '').trim();
    if (!s) return false;
    if (/\d|\/|\\|[,;|.]/.test(s)) return false;
    const tokens = s.split(/\s+/).filter(Boolean);
    if (tokens.length < 2 || tokens.length > 6) return false;
    for (const t of tokens) {
      if (!/^[A-Za-zÀ-Ỵà-ỵĐđ\-]+$/.test(t)) return false;
    }
    return true;
  }

  private buildAddressFromRaw(lines: string[]): string {
    const norm = lines.map(l => (l || '').trim()).filter(l => l.length > 0);
    const drop = /(họ\s*và\s*tên|ho\s*va\s*ten|full\s*name|giới\s*tính|gender|quốc\s*tịch|nationality|date\s*of|ngày|bộ\s*công\s*an|ministry|căn\s*cước|identity|^\d{9,12}$|<<)/iu;
    const stop = /(TP\.?\s*Hồ\s*Chí\s*Minh|Hà\s*Nội|Đà\s*Nẵng|Cần\s*Thơ|TP\.?|Thành\s*phố|Tỉnh)/iu;
    const hasKw = /(Thôn|Ấp|Xã|Phường|P\.?|Quận|Q\.?|Huyện|Đường|Số|Khu|KP|Khu\s*phố|Tổ|Block|Residence|Chung\s*cư|Apartment|Ward|District|Street|Road|City|Province|TP\.?|Thành\s*phố|Tỉnh)/iu;
    const parts: string[] = [];
    let started = false;
    for (let i = 0; i < norm.length; i++) {
      const l = norm[i];
      if (drop.test(l)) continue;
      if (!started && hasKw.test(l)) started = true;
      if (!started) continue;
      parts.push(l);
      if (stop.test(l)) break;
      if (/\bTP\.?\s*[A-ZÀÁẠẢÃÂĂÈÉẸẺẼÊÌÍỊỈĨÒÓỌỎÕÔƠÙÚỤỦŨƯỲÝỴỶỸ]/.test(l)) break;
      if (/\bTỉnh\b/i.test(l)) break;
    }
    let s = parts.join(', ');
    s = s.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
    s = s.replace(/Th(ù|ủ)\s*Thi(e|ê)m.*?TP\.\s*H(ồ|o)\s*Ch(i|í)\s*Minh/giu, '').trim();
    return s;
  }

  private parseDate(dateStr: string): any {
  if (!dateStr) return null;
  
  // Xử lý các định dạng phổ biến: 15/05/1995 hoặc 15-05-1995 hoặc 15.05.1995
  const cleanStr = dateStr.replace(/[-.]/g, '/');
  const parts = cleanStr.split('/');
  
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    
    const date = new Date(year, month, day);
    // Kiểm tra xem date có hợp lệ không
    return isNaN(date.getTime()) ? dateStr : date;
  }
  return dateStr;
}

  private extractOcrData(response: OcrScanPayload | any): { ocrData: Record<string, any>; parsedData: any } | null {
    if (response?.result?.data && typeof response.result.data === 'object') {
      return { ocrData: response.result.data, parsedData: response?.parsedData || null };
    }

    if (response?.data && typeof response.data === 'object') {
      return { ocrData: response.data, parsedData: response?.parsedData || null };
    }

    if (response && typeof response === 'object') {
      const parsed = response?.parsedData && typeof response.parsedData === 'object'
        ? response.parsedData
        : response;
      if (parsed?.fullName || parsed?.idNumber || parsed?.address || parsed?.dateOfBirth) {
        return {
          ocrData: {
            'Họ tên': parsed.fullName || '',
            'Số ID': parsed.idNumber || '',
            'Ngày sinh': parsed.dateOfBirth || '',
            'Giới tính': parsed.gender || '',
            'Quốc tịch': parsed.nationality || 'Việt Nam',
            'Địa chỉ thường trú': parsed.address || ''
          },
          parsedData: parsed
        };
      }
    }

    return null;
  }

  onOCRScanComplete(response: OcrScanPayload | any): void {
    const extracted = this.extractOcrData(response);
    if (!extracted) {
      console.warn('[GuestSaveModal] Invalid OCR response:', response);
      return;
    }

    const { ocrData, parsedData } = extracted;
    const fallbackAddress = Array.isArray(parsedData?.rawText) ? this.buildAddressFromRaw(parsedData.rawText) : '';
    const mappedData = {
      fullName: (ocrData['Họ tên'] || ocrData['Họ và tên'] || ocrData['fullName'] || '').toString().trim(),
      idNumber: (ocrData['Số ID'] || ocrData['Số CCCD'] || ocrData['idNumber'] || '').toString(),
      dob: ocrData['Ngày sinh'] || ocrData['dateOfBirth'] || '',
      gender: (ocrData['Giới tính'] || ocrData['gender'] || '').toString(),
      address: (ocrData['Địa chỉ thường trú'] || ocrData['Địa chỉ'] || ocrData['Quê quán'] || fallbackAddress || '').toString(),
      nationality: (ocrData['Quốc tịch'] || ocrData['nationality'] || 'Việt Nam').toString()
    };

    if (this.personalInfoForm) {
      const pForm = this.personalInfoForm;
      if (mappedData.fullName && this.isValidName(mappedData.fullName)) {
        pForm.patchValue({ fullName: mappedData.fullName });
      }

      if (mappedData.idNumber) {
        pForm.patchValue({ idNumber: mappedData.idNumber.replace(/\s+/g, '') });
      }

      if (mappedData.dob) {
        const parsedDob = this.parseDate(mappedData.dob.toString());
        pForm.patchValue({ dateOfBirth: parsedDob });
      }

      if (mappedData.gender) {
        const g = mappedData.gender.toLowerCase();
        let genderValue = '';
        if (g.includes('nam') || g === 'male') genderValue = 'nam';
        else if (g.includes('nữ') || g.includes('nu') || g === 'female') genderValue = 'nữ';
        if (genderValue) {
          pForm.patchValue({ gender: genderValue });
        }
      }

      pForm.patchValue({ nationality: mappedData.nationality || 'Việt Nam' });
    }

    if (this.addressForm) {
      let cleanAddress = mappedData.address.replace(/\s+/g, ' ').trim();
      const labelsToRemove = [/địa\s*chỉ\s*thường\s*trú:?/iu, /quê\s*quán:?/iu, /nơi\s*thường\s*trú:?/iu];
      labelsToRemove.forEach(regex => {
        cleanAddress = cleanAddress.replace(regex, '');
      });

      if (cleanAddress) {
        this.addressForm.patchValue({
          street: cleanAddress.trim(),
          country: mappedData.nationality || 'Việt Nam'
        });
      }
    }

    this.message.success('Đã tự động điền thông tin từ AI. Vui lòng kiểm tra lại.');
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
        if (this.room.status === 'occupied') {
          this.roomsService.updateRoomCheckinInfo(this.room._id, guestInfo, 0).subscribe({
            next: () => {
              console.log('[GuestSaveModal] Update room info for occupied room successful');
              this.message.success(`Đã cập nhật thông tin khách "${this.getGuestName(guest)}" vào phòng`);
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
          const guestId = this.selectedGuestId!;
          this.guestsService.assignGuestToRoom(guestId, {
            guestId: guestId,
            roomId: this.room._id,
            guestInfo: guestInfo
          }).subscribe({
            next: () => {
              console.log('[GuestSaveModal] Assign guest to vacant room successful');
              this.message.success(`Đã assign khách "${this.getGuestName(guest)}" vào phòng`);
              this.modalRef.close({ success: true, guestId: guestId });
              this.isLoading = false;
            },
            error: (err: any) => {
              console.error('[GuestSaveModal] Assign guest to room error:', err);
              this.message.error(err.error?.message || 'Lỗi assign khách vào phòng');
              this.isLoading = false;
            }
          });
        }
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
          if (this.room.status === 'occupied') {
            this.roomsService.updateRoomCheckinInfo(this.room._id, guestInfo, 0).subscribe({
              next: () => {
                console.log('[GuestSaveModal] Update room info for occupied room successful');
                this.message.success('Đã lưu và cập nhật thông tin khách vào phòng');
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
            this.guestsService.assignGuestToRoom(response.guest._id, {
              guestId: response.guest._id,
              roomId: this.room._id,
              guestInfo: guestInfo
            }).subscribe({
              next: () => {
                console.log('[GuestSaveModal] Assign new guest to vacant room successful');
                this.message.success('Đã lưu và assign khách vào phòng');
                this.modalRef.close({ success: true, guestId: response.guest._id });
                this.isLoading = false;
              },
              error: (err: any) => {
                console.error('[GuestSaveModal] Assign guest to room error:', err);
                this.message.error(err.error?.message || 'Lỗi assign khách vào phòng');
                this.isLoading = false;
              }
            });
          }
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

