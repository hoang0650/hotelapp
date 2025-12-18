import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { User } from '../../interfaces/user';
import { NzUploadFile, NzUploadChangeParam } from 'ng-zorro-antd/upload';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  profileForm: FormGroup;
  bankAccountForm: FormGroup;
  personalInfoForm: FormGroup;
  loading = false;
  currentUser: User | null = null;
  saving = false;
  qrPaymentUrl: string = ''; // URL QR thanh toán SePay
  showQrPreview: boolean = false; // Hiển thị preview QR code
  qrBeneficiaryName: string = ''; // Tên người thụ hưởng cho QR code
  apiBaseUrl = 'https://nest-production-8106.up.railway.app';
  uploadUrl = `${this.apiBaseUrl}/files/upload`;
  fileList: any[] = [];
  avatarId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private authService: AuthService,
    private message: NzMessageService,
    private http: HttpClient
  ) {
    // Form thông tin cơ bản
    this.profileForm = this.fb.group({
      username: [{ value: '', disabled: true }], // Username không thể thay đổi
      email: [{ value: '', disabled: true }], // Email không thể thay đổi
      fullName: [''],
      phone: ['', [Validators.pattern(/^[0-9+\-\s()]+$/)]],
      avatar: ['']
    });

    // Form thông tin ngân hàng
    this.bankAccountForm = this.fb.group({
      bankName: [''],
      accountNumber: [''],
      accountHolderName: [''],
      beneficiaryName: [''], // Tên người thụ hưởng cho QR code
      branch: [''],
      swiftCode: [''],
      iban: ['']
    });

    // Form thông tin cá nhân
    this.personalInfoForm = this.fb.group({
      dateOfBirth: [null],
      gender: [''],
      nationality: [''],
      idCard: [''],
      idCardIssueDate: [null],
      idCardIssuePlace: [''],
      address: this.fb.group({
        street: [''],
        ward: [''],
        district: [''],
        city: [''],
        country: [''],
        postalCode: ['']
      })
    });
  }

  ngOnInit(): void {
    this.loadProfile();
  }

  /**
   * Load thông tin profile từ API
   */
  loadProfile(): void {
    this.loading = true;
    this.userService.getProfile().subscribe({
      next: (user: User) => {
        this.currentUser = user;
        this.populateForms(user);
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading profile:', error);
        this.message.error('Không thể tải thông tin hồ sơ');
        this.loading = false;
      }
    });
  }

  /**
   * Điền dữ liệu vào các form
   */
  populateForms(user: User): void {
    // Thông tin cơ bản
    this.profileForm.patchValue({
      username: user.username || '',
      email: user.email || '',
      fullName: user.fullName || '',
      phone: user.phone || '',
      avatar: user.avatar || ''
    });
    
    // Lưu avatarId nếu có
    this.avatarId = (user as any).avatarId || null;

    // Thông tin ngân hàng
    if (user.bankAccount) {
      this.bankAccountForm.patchValue({
        bankName: user.bankAccount.bankName || '',
        accountNumber: user.bankAccount.accountNumber || '',
        accountHolderName: user.bankAccount.accountHolderName || '',
        beneficiaryName: user.bankAccount.beneficiaryName || '',
        branch: user.bankAccount.branch || '',
        swiftCode: user.bankAccount.swiftCode || '',
        iban: user.bankAccount.iban || ''
      });
      // Load QR payment URL nếu có
      if (user.bankAccount.qrPaymentUrl) {
        this.qrPaymentUrl = user.bankAccount.qrPaymentUrl;
        this.qrBeneficiaryName = user.bankAccount.beneficiaryName || '';
        this.showQrPreview = true;
      }
    }

    // Thông tin cá nhân
    if (user.personalInfo) {
      this.personalInfoForm.patchValue({
        dateOfBirth: user.personalInfo.dateOfBirth ? new Date(user.personalInfo.dateOfBirth) : null,
        gender: user.personalInfo.gender || '',
        nationality: user.personalInfo.nationality || '',
        idCard: user.personalInfo.idCard || '',
        idCardIssueDate: user.personalInfo.idCardIssueDate ? new Date(user.personalInfo.idCardIssueDate) : null,
        idCardIssuePlace: user.personalInfo.idCardIssuePlace || '',
        address: {
          street: user.personalInfo.address?.street || '',
          ward: user.personalInfo.address?.ward || '',
          district: user.personalInfo.address?.district || '',
          city: user.personalInfo.address?.city || '',
          country: user.personalInfo.address?.country || '',
          postalCode: user.personalInfo.address?.postalCode || ''
        }
      });
    }
  }

  /**
   * Lưu hồ sơ
   */
  saveProfile(): void {
    if (this.profileForm.invalid || this.bankAccountForm.invalid || this.personalInfoForm.invalid) {
      this.message.warning('Vui lòng kiểm tra lại thông tin đã nhập');
      return;
    }

    this.saving = true;

    // Xử lý avatar: nếu có avatarId thì dùng, nếu không dùng avatar (URL)
    const avatarValue = this.profileForm.get('avatar')?.value;
    const avatarData: any = {};
    if (this.avatarId) {
      avatarData.avatarId = this.avatarId;
      avatarData.avatar = `${this.apiBaseUrl}/files/${this.avatarId}`;
    } else if (avatarValue) {
      avatarData.avatar = avatarValue;
      // Nếu là URL từ /files/, extract imageId
      if (avatarValue.includes('/files/')) {
        const imageId = avatarValue.split('/files/')[1]?.split('?')[0];
        if (imageId) {
          avatarData.avatarId = imageId;
        }
      }
    }
    
    const profileData = {
      fullName: this.profileForm.get('fullName')?.value,
      phone: this.profileForm.get('phone')?.value,
      ...avatarData,
      bankAccount: {
        bankName: this.bankAccountForm.get('bankName')?.value || undefined,
        accountNumber: this.bankAccountForm.get('accountNumber')?.value || undefined,
        accountHolderName: this.bankAccountForm.get('accountHolderName')?.value || undefined,
        beneficiaryName: this.qrBeneficiaryName || undefined, // Lưu tên người thụ hưởng
        branch: this.bankAccountForm.get('branch')?.value || undefined,
        swiftCode: this.bankAccountForm.get('swiftCode')?.value || undefined,
        iban: this.bankAccountForm.get('iban')?.value || undefined,
        qrPaymentUrl: this.qrPaymentUrl || undefined // Lưu QR payment URL
      },
      personalInfo: {
        dateOfBirth: this.personalInfoForm.get('dateOfBirth')?.value || undefined,
        gender: this.personalInfoForm.get('gender')?.value || undefined,
        nationality: this.personalInfoForm.get('nationality')?.value || undefined,
        idCard: this.personalInfoForm.get('idCard')?.value || undefined,
        idCardIssueDate: this.personalInfoForm.get('idCardIssueDate')?.value || undefined,
        idCardIssuePlace: this.personalInfoForm.get('idCardIssuePlace')?.value || undefined,
        address: {
          street: this.personalInfoForm.get('address.street')?.value || undefined,
          ward: this.personalInfoForm.get('address.ward')?.value || undefined,
          district: this.personalInfoForm.get('address.district')?.value || undefined,
          city: this.personalInfoForm.get('address.city')?.value || undefined,
          country: this.personalInfoForm.get('address.country')?.value || undefined,
          postalCode: this.personalInfoForm.get('address.postalCode')?.value || undefined
        }
      }
    };

    // Loại bỏ các trường undefined
    Object.keys(profileData.bankAccount).forEach(key => {
      if (profileData.bankAccount[key as keyof typeof profileData.bankAccount] === undefined) {
        delete profileData.bankAccount[key as keyof typeof profileData.bankAccount];
      }
    });

    Object.keys(profileData.personalInfo).forEach(key => {
      if (key === 'address') {
        Object.keys(profileData.personalInfo.address).forEach(addrKey => {
          if (profileData.personalInfo.address[addrKey as keyof typeof profileData.personalInfo.address] === undefined) {
            delete profileData.personalInfo.address[addrKey as keyof typeof profileData.personalInfo.address];
          }
        });
      } else if (profileData.personalInfo[key as keyof typeof profileData.personalInfo] === undefined) {
        delete profileData.personalInfo[key as keyof typeof profileData.personalInfo];
      }
    });

    this.userService.updateProfile(profileData).subscribe({
      next: (response) => {
        if (response.success || response.data || response.user) {
          this.message.success(response.message || 'Cập nhật hồ sơ thành công');
          // Cập nhật current user trong AuthService
          const updatedUser = response.data || response.user;
          if (updatedUser) {
            this.authService.setCurrentUser(updatedUser);
          }
          this.loadProfile(); // Reload để hiển thị dữ liệu mới
        } else {
          this.message.error(response.error || response.message || 'Cập nhật hồ sơ thất bại');
        }
        this.saving = false;
      },
      error: (error) => {
        console.error('Error updating profile:', error);
        this.message.error(error.error?.message || 'Có lỗi xảy ra khi cập nhật hồ sơ');
        this.saving = false;
      }
    });
  }

  /**
   * Reset form về giá trị ban đầu
   */
  resetForm(): void {
    if (this.currentUser) {
      this.populateForms(this.currentUser);
    }
  }

  /**
   * Tạo QR thanh toán SePay từ số tài khoản và tên ngân hàng
   */
  generateQrPayment(): void {
    const bankName = this.bankAccountForm.get('bankName')?.value?.trim();
    const accountNumber = this.bankAccountForm.get('accountNumber')?.value?.trim();
    const beneficiaryName = this.bankAccountForm.get('beneficiaryName')?.value?.trim() || '';

    if (!bankName || !accountNumber) {
      this.message.warning('Vui lòng nhập tên ngân hàng và số tài khoản');
      return;
    }

    // Tạo URL QR thanh toán SePay
    // Format: https://qr.sepay.vn/img?acc=SO_TAI_KHOAN&bank=NGAN_HANG
    const encodedAccount = encodeURIComponent(accountNumber);
    const encodedBank = encodeURIComponent(bankName);
    this.qrPaymentUrl = `https://qr.sepay.vn/img?acc=${encodedAccount}&bank=${encodedBank}`;
    
    // Lưu tên người thụ hưởng
    this.qrBeneficiaryName = beneficiaryName || this.bankAccountForm.get('accountHolderName')?.value?.trim() || '';
    
    this.showQrPreview = true;
    this.message.success('Đã tạo QR thanh toán thành công. Vui lòng bấm "Lưu thay đổi" để lưu vào hệ thống.');
  }

  /**
   * Xóa QR preview
   */
  clearQrPreview(): void {
    this.qrPaymentUrl = '';
    this.qrBeneficiaryName = '';
    this.showQrPreview = false;
  }

  get uploadHeaders(): { [key: string]: string } {
    const token = localStorage.getItem('token');
    return {
      'Authorization': token || ''
    };
  }

  handleAvatarChange(info: NzUploadChangeParam): void {
    if (info.file.status === 'uploading') {
      this.loading = true;
      return;
    }
    
    if (info.file.status === 'done') {
      if (info.file.response) {
        const response = info.file.response;
        const imageId = response.imageId;
        const imageUrl = response.imageUrl || `${this.apiBaseUrl}/files/${imageId}`;
        
        this.avatarId = imageId;
        this.profileForm.patchValue({
          avatar: imageUrl
        });
        this.message.success('Tải lên ảnh đại diện thành công');
      }
      this.loading = false;
    } else if (info.file.status === 'error') {
      this.message.error(`Lỗi khi tải lên ảnh: ${info.file.error?.message || 'Không xác định'}`);
      console.error('Upload error:', info.file.error);
      this.loading = false;
    }
  }

  beforeUpload = (file: NzUploadFile): boolean => {
    const isImage = file.type?.startsWith('image/');
    if (!isImage) {
      this.message.error('Bạn chỉ có thể tải lên file hình ảnh!');
      return false;
    }
    const isLt5M = (file.size || 0) / 1024 / 1024 < 5;
    if (!isLt5M) {
      this.message.error('Hình ảnh phải nhỏ hơn 5MB!');
      return false;
    }
    this.fileList = this.fileList.concat(file);
    return true;
  };

  getImageUrl(urlOrId: string | null | undefined): string {
    if (!urlOrId) return '';
    // Nếu là URL đầy đủ (http/https), trả về nguyên
    if (urlOrId.startsWith('http://') || urlOrId.startsWith('https://')) {
      return urlOrId;
    }
    // Nếu là imageId hoặc path, thêm base URL
    if (urlOrId.startsWith('/files/')) {
      return `${this.apiBaseUrl}${urlOrId}`;
    }
    // Nếu chỉ là ID, thêm /files/ prefix
    return `${this.apiBaseUrl}/files/${urlOrId}`;
  }
}

