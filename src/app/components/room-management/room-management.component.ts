import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { Room, RoomCapacity, RoomPricing, SpecialPrice, RoomRevenue } from '../../interfaces/rooms';
import { Hotel } from '../../interfaces/hotel';
import { RoomsService } from '../../services/rooms.service';
import { HotelService } from '../../services/hotel.service';
import { AuthService } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { PricingPackage } from '../../services/pricing.service';
import { User } from '../../interfaces/user';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { CurrencyService } from '../../services/currency.service';

@Component({
  selector: 'app-room-management',
  templateUrl: './room-management.component.html',
  styleUrls: ['./room-management.component.css']
})
export class RoomManagementComponent implements OnInit, OnDestroy {
  roomForm!: FormGroup;
  rooms: Room[] = [];
  hotels: Hotel[] = [];
  editId: string | null = null;
  selectedRoom: Room | null = null;
  floors: string[] = [];
  selectedHotelId: string | null = null;

  // Phân trang
  pageIndex: number = 1;
  pageSize: number = 10; // Tối đa 10 phòng mỗi trang
  total: number = 0;

  roomStatusOptions: { label: string, value: Room['status'] }[] = [];
  timezoneOptions: { label: string, value: string }[] = [];

  priceConfigId: string | null = null;
  hasPriceConfig: boolean = false;
  currentUser: User | null = null;
  currentPackage: PricingPackage | null = null;
  
  private subscriptions = new Subscription();
  
  // Currency & exchange rate
  selectedCurrency: string = 'VND';
  exchangeRateToUSD: number = 1;
  availableCurrencies: Array<{ code: string; name: string; symbol: string }> = [
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'GBP', name: 'British Pound', symbol: '£' },
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
    { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
    { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
    { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr' },
    { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
    { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
    { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
    { code: 'THB', name: 'Thai Baht', symbol: '฿' },
    { code: 'VND', name: 'Vietnamese Dong', symbol: '₫' }
  ];


  private initStatusOptions(): void {
    this.roomStatusOptions = [
      { label: this.translate.instant('ROOM_MANAGEMENT.STATUS_OPTIONS.VACANT'), value: 'vacant' },
      { label: this.translate.instant('ROOM_MANAGEMENT.STATUS_OPTIONS.OCCUPIED'), value: 'occupied' },
      { label: this.translate.instant('ROOM_MANAGEMENT.STATUS_OPTIONS.CLEANING'), value: 'cleaning' },
      { label: this.translate.instant('ROOM_MANAGEMENT.STATUS_OPTIONS.DIRTY'), value: 'dirty' },
      { label: this.translate.instant('ROOM_MANAGEMENT.STATUS_OPTIONS.MAINTENANCE'), value: 'maintenance' }
    ];
  }

  private initTimezoneOptions(): void {
    this.timezoneOptions = [
      { label: this.translate.instant('ROOM_MANAGEMENT.TIMEZONE_UTC7'), value: 'UTC+7' },
      { label: this.translate.instant('ROOM_MANAGEMENT.TIMEZONE_UTC8'), value: 'UTC+8' },
      { label: this.translate.instant('ROOM_MANAGEMENT.TIMEZONE_UTC9'), value: 'UTC+9' },
      { label: this.translate.instant('ROOM_MANAGEMENT.TIMEZONE_UTC0'), value: 'UTC+0' },
      { label: this.translate.instant('ROOM_MANAGEMENT.TIMEZONE_UTC_MINUS5'), value: 'UTC-5' },
      { label: this.translate.instant('ROOM_MANAGEMENT.TIMEZONE_UTC_MINUS8'), value: 'UTC-8' }
    ];
  }

  constructor(
    private fb: FormBuilder, 
    private roomService: RoomsService, 
    private hotelService: HotelService,
    private authService: AuthService,
    private permissionService: PermissionService,
    private message: NzMessageService,
    private translate: TranslateService,
    public currencyService: CurrencyService
  ) {
    this.initStatusOptions();
    this.initTimezoneOptions();
    this.roomForm = this.fb.group({
      hotelId: [null, Validators.required],
      roomNumber: ['', Validators.required],
      floor: [1, [Validators.required, Validators.min(0)]],
      type: ['', Validators.required],
      status: ['vacant' as Room['status'], Validators.required],
      
      capacity: this.fb.group({
        adults: [2, [Validators.required, Validators.min(1)]],
        children: [0, [Validators.min(0)]]
      }),
      amenities: [[]],
      images: [[]],
      
      pricing: this.fb.group({
        hourly: [0, Validators.min(0)],
        daily: [0, [Validators.required, Validators.min(0)]],
        nightly: [0, [Validators.required, Validators.min(0)]],
        weekly: [0, Validators.min(0)],
        monthly: [0, Validators.min(0)],
        currency: ['VND']
      }),
      firstHourRate: [0, Validators.min(0)],
      additionalHourRate: [null, Validators.min(0)], // Khởi tạo null để phân biệt "chưa nhập" và "đã nhập 0"

      priceConfigId: [null],
      // Cấu hình tính giá
      priceSettings: this.fb.group({
        nightlyStartTime: ['22:00'], // Giờ bắt đầu tính qua đêm (HH:mm)
        nightlyEndTime: ['12:00'], // Giờ kết thúc tính qua đêm (HH:mm) - cập nhật từ 06:00 thành 12:00
        dailyStartTime: ['06:00'], // Giờ bắt đầu tính theo ngày (HH:mm)
        dailyEndTime: ['22:00'], // Giờ kết thúc tính theo ngày (HH:mm)
        autoNightlyHours: [8, [Validators.min(1)]], // Số giờ tự động chuyển sang qua đêm
        autoDailyHours: [24, [Validators.min(1)]], // Số giờ tự động chuyển từ nightly sang daily (mặc định 24 giờ)
        gracePeriodMinutes: [15, [Validators.min(0), Validators.max(60)]], // Thời gian miễn phí sau giờ thứ 2 (phút)
        timezone: ['UTC+7'], // Múi giờ (UTC+7 cho Việt Nam)
        // Phụ thu cho daily rates
        dailyEarlyCheckinSurcharge: [0, [Validators.min(0)]], // Phụ thu check-in sớm cho thuê theo ngày (số tiền/giờ)
        dailyLateCheckoutFee: [0, [Validators.min(0)]], // Phí trả phòng muộn cho thuê theo ngày (số tiền/giờ)
        // Phụ thu cho nightly rates
        nightlyEarlyCheckinSurcharge: [0, [Validators.min(0)]], // Phụ thu check-in sớm cho thuê qua đêm (số tiền/giờ)
        nightlyLateCheckoutSurcharge: [0, [Validators.min(0)]] // Phụ thu check-out trễ cho thuê qua đêm (số tiền/giờ)
      }),
      description: [''],
      notes: ['']
    });
    
    // Lắng nghe thay đổi priceConfigId để disable/enable các field giá
    this.roomForm.get('priceConfigId')?.valueChanges.subscribe((priceConfigId) => {
      this.priceConfigId = priceConfigId;
      this.hasPriceConfig = !!priceConfigId && priceConfigId !== '';
      this.updatePriceFieldsDisabledState();
    });
    
    // Theo dõi currency để cập nhật tỷ giá và hiển thị quy đổi USD
    const currencyControl = this.roomForm.get('pricing.currency');
    currencyControl?.valueChanges.subscribe((cur: string) => {
      this.selectedCurrency = (cur || 'VND').toUpperCase();
      this.updateExchangeRateToUSD();
    });
    // Khởi tạo theo giá trị mặc định
    this.selectedCurrency = String(currencyControl?.value || 'VND').toUpperCase();
    this.updateExchangeRateToUSD();

    // Theo dõi gói hiện tại của người dùng (để lấy maxRooms)
    this.subscriptions.add(
      this.permissionService.currentPackage$.subscribe(pkg => {
        this.currentPackage = pkg;
      })
    );
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadHotels();
    
    // Subscribe to language changes to update statusOptions and timezoneOptions
    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => {
        this.initStatusOptions();
        this.initTimezoneOptions();
      })
    );
  }
  
  private updateExchangeRateToUSD(): void {
    if (!this.selectedCurrency || this.selectedCurrency === 'USD') {
      this.exchangeRateToUSD = 1;
      return;
    }
    this.currencyService.getExchangeRate(this.selectedCurrency, 'USD').subscribe({
      next: (rate) => {
        this.exchangeRateToUSD = rate || 1;
      },
      error: () => {
        this.exchangeRateToUSD = 1;
      }
    });
  }
  
  formatUSD(amount: number | null | undefined): string {
    const value = Number(amount || 0) * (this.exchangeRateToUSD || 1);
    const rounded = this.currencyService.roundAmount(value, 'USD');
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rounded);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ============ KIỂM TRA QUYỀN ============

  get isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  get isBusiness(): boolean {
    return this.authService.isBusiness();
  }

  get isHotelManager(): boolean {
    return this.authService.isHotelManager();
  }

  get canCreateRoom(): boolean {
    // Chỉ admin và hotel manager có thể tạo phòng
    // Business KHÔNG thể tạo phòng, chỉ xem
    return this.isAdmin || this.isHotelManager;
  }

  get canEditRoom(): boolean {
    // Chỉ admin và hotel manager có thể cập nhật phòng
    // Business KHÔNG thể cập nhật phòng, chỉ xem
    return this.isAdmin || this.isHotelManager;
  }

  canManage(roomId?: string): boolean {
    if (!roomId) return false;
    if (!this.currentUser) return false;
    
    // Admin có quyền quản lý tất cả
    if (this.isAdmin) return true;
    
    // Business KHÔNG thể quản lý phòng, chỉ xem
    if (this.isBusiness) {
      return false;
    }
    
    // Hotel manager chỉ quản lý được phòng thuộc hotel của mình
    if (this.isHotelManager) {
      const room = this.rooms.find(r => r._id === roomId);
      return !!room && room.hotelId === this.currentUser.hotelId;
    }
    
    return false;
  }

  // Cập nhật trạng thái disable của các field giá
  updatePriceFieldsDisabledState(): void {
    const isDisabled = this.hasPriceConfig;
    
    // Disable các field giá khi có priceConfig
    if (isDisabled) {
      this.roomForm.get('pricing.hourly')?.disable();
      this.roomForm.get('pricing.daily')?.disable();
      this.roomForm.get('pricing.nightly')?.disable();
      this.roomForm.get('firstHourRate')?.disable();
      this.roomForm.get('additionalHourRate')?.disable();
    } else {
      this.roomForm.get('pricing.hourly')?.enable();
      this.roomForm.get('pricing.daily')?.enable();
      this.roomForm.get('pricing.nightly')?.enable();
      this.roomForm.get('firstHourRate')?.enable();
      this.roomForm.get('additionalHourRate')?.enable();
    }
  }

  loadRooms(hotelId?: string): void {
    const params = hotelId ? { hotelId: hotelId } : {};
    this.roomService.getRooms(params).subscribe(
      data => {
        this.rooms = data;
        this.total = data.length;
        // Reset về trang 1 khi load lại
        this.pageIndex = 1;
      },
      error => {
        console.error('Lỗi khi tải danh sách phòng:', error);
        this.message.error(this.translate.instant('ROOM_MANAGEMENT.LOAD_ROOMS_ERROR'));
      }
    );
  }

  /**
   * Lấy danh sách phòng hiển thị trên trang hiện tại
   */
  get paginatedRooms(): Room[] {
    const startIndex = (this.pageIndex - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    return this.rooms.slice(startIndex, endIndex);
  }

  /**
   * Xử lý thay đổi trang
   */
  onPageIndexChange(pageIndex: number): void {
    this.pageIndex = pageIndex;
  }

  /**
   * Xử lý thay đổi số lượng mỗi trang (không cho phép thay đổi, giữ cố định 10)
   */
  onPageSizeChange(pageSize: number): void {
    // Không cho phép thay đổi, giữ cố định 10
    this.pageSize = 10;
    this.pageIndex = 1;
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

  loadHotels(): void {
    this.hotelService.getHotels().subscribe(
      data => {
        // Filter hotels theo role
        if (this.isAdmin) {
          // Admin thấy tất cả
          this.hotels = data;
        } else if (this.isBusiness && this.currentUser?.businessId) {
          // Business chỉ thấy hotels thuộc business của mình
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
          
          this.hotels = data.filter(hotel => {
            const hotelBusinessId = this.extractBusinessId(hotel);
            return hotelBusinessId && userBusinessIdStr && hotelBusinessId.toString() === userBusinessIdStr.toString();
          });
        } else if (this.isHotelManager && this.currentUser?.hotelId) {
          // Hotel manager chỉ thấy hotel của mình
          this.hotels = data.filter(hotel => hotel._id === this.currentUser?.hotelId);
        } else {
          this.hotels = [];
        }
        
        // Auto-select hotel nếu chỉ có 1
        if (this.hotels.length === 1 && !this.selectedHotelId) {
          this.selectedHotelId = this.hotels[0]._id!;
          this.onHotelChange(this.selectedHotelId);
        } else if (this.hotels.length > 0 && !this.selectedHotelId) {
          this.selectedHotelId = this.hotels[0]._id!;
        }
      },
      error => {
        console.error('Lỗi khi tải danh sách khách sạn:', error);
        this.message.error(this.translate.instant('ROOM_MANAGEMENT.LOAD_HOTELS_ERROR'));
      }
    );
  }

  onHotelChange(hotelId: string | null): void {
    this.selectedHotelId = hotelId;
    this.floors = [];
    this.rooms = [];
    this.roomForm.get('floor')?.reset(1);
    // Reset phân trang về trang 1
    this.pageIndex = 1;
    this.total = 0;

    if (hotelId) {
      this.loadRooms(hotelId);
      this.roomService.getHotelFloors(hotelId).subscribe(
        data => {
          this.floors = data.floors.map(f => String(f));
        },
        error => {
          console.error('Lỗi khi tải danh sách tầng:', error);
          // Không cần báo lỗi vì người dùng có thể nhập tầng mới
        }
      );
    }
  }

  startEdit(id: string): void {
    if (!this.canManage(id)) {
      this.message.warning(this.translate.instant('ROOM_MANAGEMENT.NO_EDIT_PERMISSION'));
      return;
    }
    
    this.editId = id;
    const roomToEdit = this.rooms.find(r => r._id === id);
    if (roomToEdit) {
      this.selectedRoom = { ...roomToEdit };
      this.selectedHotelId = roomToEdit.hotelId;
      this.onHotelChange(this.selectedHotelId);
      
      // Load đầy đủ thông tin phòng từ API để đảm bảo có đầy đủ dữ liệu
      this.roomService.getRoomById(id, { limit: 1000 }).subscribe(
        (fullRoom: Room) => {
          this.selectedRoom = fullRoom;
          this.roomForm.patchValue({
            hotelId: fullRoom.hotelId,
            roomNumber: fullRoom.roomNumber,
            floor: Number(fullRoom.floor) || 1,
            type: fullRoom.type,
            status: fullRoom.status,
            capacity: {
              adults: fullRoom.capacity?.adults || 2,
              children: fullRoom.capacity?.children || 0
            },
            amenities: fullRoom.amenities || [],
            images: fullRoom.images || [],
            pricing: {
              hourly: fullRoom.pricing?.hourly || fullRoom.firstHourRate || 0,
              daily: fullRoom.pricing?.daily || 0,
              nightly: fullRoom.pricing?.nightly || 0,
              weekly: fullRoom.pricing?.weekly || 0,
              monthly: fullRoom.pricing?.monthly || 0,
              currency: fullRoom.pricing?.currency || 'VND'
            },
            // Sử dụng giá trị từ database, không set default 0 nếu không có
            firstHourRate: fullRoom.firstHourRate !== undefined && fullRoom.firstHourRate !== null 
              ? fullRoom.firstHourRate 
              : (fullRoom.pricing?.hourly || 0),
            // Nếu additionalHourRate là 0, set null để form hiển thị empty (người dùng có thể nhập 0 nếu muốn)
            // Nếu có giá trị khác 0, hiển thị giá trị đó
            additionalHourRate: fullRoom.additionalHourRate !== undefined && fullRoom.additionalHourRate !== null && fullRoom.additionalHourRate !== 0
              ? fullRoom.additionalHourRate 
              : null, // Set null để form hiển thị empty, người dùng có thể nhập giá trị mới
            priceConfigId: fullRoom.priceConfigId,
            priceSettings: {
              nightlyStartTime: (fullRoom as any).priceSettings?.nightlyStartTime || '22:00',
              nightlyEndTime: (fullRoom as any).priceSettings?.nightlyEndTime || '12:00',
              dailyStartTime: (fullRoom as any).priceSettings?.dailyStartTime || '06:00',
              dailyEndTime: (fullRoom as any).priceSettings?.dailyEndTime || '22:00',
              autoNightlyHours: (fullRoom as any).priceSettings?.autoNightlyHours || 8,
              autoDailyHours: (fullRoom as any).priceSettings?.autoDailyHours || 24,
              gracePeriodMinutes: (fullRoom as any).priceSettings?.gracePeriodMinutes || 15,
              timezone: (fullRoom as any).priceSettings?.timezone || 'UTC+7',
              dailyEarlyCheckinSurcharge: (fullRoom as any).priceSettings?.dailyEarlyCheckinSurcharge || 0,
              dailyLateCheckoutFee: (fullRoom as any).priceSettings?.dailyLateCheckoutFee || 0,
              nightlyEarlyCheckinSurcharge: (fullRoom as any).priceSettings?.nightlyEarlyCheckinSurcharge || 0,
              nightlyLateCheckoutSurcharge: (fullRoom as any).priceSettings?.nightlyLateCheckoutSurcharge || 0
            },
            description: fullRoom.description,
            notes: fullRoom.notes
          });
          
          // Cập nhật trạng thái disable sau khi load dữ liệu
          setTimeout(() => {
            this.priceConfigId = fullRoom.priceConfigId || null;
            this.hasPriceConfig = !!fullRoom.priceConfigId && fullRoom.priceConfigId !== '';
            this.updatePriceFieldsDisabledState();
          }, 0);
        },
        error => {
          console.error('Error loading room details:', error);
          // Fallback: sử dụng dữ liệu từ danh sách nếu không load được chi tiết
          this.roomForm.patchValue({
            hotelId: roomToEdit.hotelId,
            roomNumber: roomToEdit.roomNumber,
            floor: Number(roomToEdit.floor) || 1,
            type: roomToEdit.type,
            status: roomToEdit.status,
            capacity: {
              adults: roomToEdit.capacity?.adults || 2,
              children: roomToEdit.capacity?.children || 0
            },
            amenities: roomToEdit.amenities || [],
            images: roomToEdit.images || [],
            pricing: {
              hourly: roomToEdit.pricing?.hourly || roomToEdit.firstHourRate || 0,
              daily: roomToEdit.pricing?.daily || 0,
              nightly: roomToEdit.pricing?.nightly || 0,
              weekly: roomToEdit.pricing?.weekly || 0,
              monthly: roomToEdit.pricing?.monthly || 0,
              currency: roomToEdit.pricing?.currency || 'VND'
            },
            firstHourRate: roomToEdit.firstHourRate !== undefined && roomToEdit.firstHourRate !== null 
              ? roomToEdit.firstHourRate 
              : (roomToEdit.pricing?.hourly || 0),
            // Nếu additionalHourRate là 0, set null để form hiển thị empty
            additionalHourRate: roomToEdit.additionalHourRate !== undefined && roomToEdit.additionalHourRate !== null && roomToEdit.additionalHourRate !== 0
              ? roomToEdit.additionalHourRate 
              : null,
            priceConfigId: roomToEdit.priceConfigId,
            priceSettings: {
              nightlyStartTime: (roomToEdit as any).priceSettings?.nightlyStartTime || '22:00',
              nightlyEndTime: (roomToEdit as any).priceSettings?.nightlyEndTime || '12:00',
              dailyStartTime: (roomToEdit as any).priceSettings?.dailyStartTime || '06:00',
              dailyEndTime: (roomToEdit as any).priceSettings?.dailyEndTime || '22:00',
              autoNightlyHours: (roomToEdit as any).priceSettings?.autoNightlyHours || 8,
              autoDailyHours: (roomToEdit as any).priceSettings?.autoDailyHours || 24,
              gracePeriodMinutes: (roomToEdit as any).priceSettings?.gracePeriodMinutes || 15,
              timezone: (roomToEdit as any).priceSettings?.timezone || 'UTC+7',
              dailyEarlyCheckinSurcharge: (roomToEdit as any).priceSettings?.dailyEarlyCheckinSurcharge || 0,
              dailyLateCheckoutFee: (roomToEdit as any).priceSettings?.dailyLateCheckoutFee || 0,
              nightlyEarlyCheckinSurcharge: (roomToEdit as any).priceSettings?.nightlyEarlyCheckinSurcharge || 0,
              nightlyLateCheckoutSurcharge: (roomToEdit as any).priceSettings?.nightlyLateCheckoutSurcharge || 0
            },
            description: roomToEdit.description,
            notes: roomToEdit.notes
          });
          
          // Cập nhật trạng thái disable sau khi load dữ liệu (fallback)
          setTimeout(() => {
            this.priceConfigId = roomToEdit.priceConfigId || null;
            this.hasPriceConfig = !!roomToEdit.priceConfigId && roomToEdit.priceConfigId !== '';
            this.updatePriceFieldsDisabledState();
          }, 0);
        }
      );
    }
  }

  stopEdit(): void {
    this.editId = null;
    this.selectedRoom = null;
    this.priceConfigId = null;
    this.hasPriceConfig = false;
    
    this.roomForm.reset({
      hotelId: this.selectedHotelId,
      status: 'vacant',
      floor: 1,
      capacity: { adults: 2, children: 0 },
      amenities: [],
      images: [],
      pricing: { hourly: 0, daily: 0, nightly: 0, weekly: 0, monthly: 0, currency: 'VND' },
      firstHourRate: 0,
      additionalHourRate: null, // Reset về null thay vì 0
      priceConfigId: null,
      priceSettings: {
        nightlyStartTime: '22:00',
        nightlyEndTime: '12:00',
        dailyStartTime: '06:00',
        dailyEndTime: '22:00',
        autoNightlyHours: 8,
        autoDailyHours: 24,
        gracePeriodMinutes: 15,
        timezone: 'UTC+7',
        dailyEarlyCheckinSurcharge: 0,
        dailyLateCheckoutFee: 0,
        nightlyEarlyCheckinSurcharge: 0,
        nightlyLateCheckoutSurcharge: 0
      }
    });
    
    // Enable lại tất cả các field giá sau khi reset
    this.updatePriceFieldsDisabledState();
  }

  submitForm(): void {
    // Kiểm tra quyền trước khi submit
    if (this.editId && this.editId !== 'new') {
      if (!this.canEditRoom || !this.canManage(this.editId)) {
        this.message.warning(this.translate.instant('ROOM_MANAGEMENT.NO_UPDATE_PERMISSION'));
        return;
      }
    } else {
      if (!this.canCreateRoom) {
        this.message.warning(this.translate.instant('ROOM_MANAGEMENT.NO_CREATE_PERMISSION'));
        return;
      }
    }

    if (this.roomForm.invalid) {
      this.message.warning(this.translate.instant('ROOM_MANAGEMENT.FILL_REQUIRED_FIELDS'));
      Object.values(this.roomForm.controls).forEach((control: any) => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
        if (control instanceof FormGroup) {
          Object.values(control.controls).forEach((innerControl: any) => {
            if (innerControl.invalid) {
              innerControl.markAsDirty();
              innerControl.updateValueAndValidity({ onlySelf: true });
            }
          });
        }
      });
      return;
    }

    const formValue = this.roomForm!.value;
    const hasPriceConfig = formValue.priceConfigId && formValue.priceConfigId !== '';
    
    const roomData: any = {
      hotelId: formValue.hotelId,
      roomNumber: String(formValue.roomNumber),
      floor: String(formValue.floor),
      type: formValue.type,
      status: formValue.status,
      capacity: {
        adults: Number(formValue.capacity?.adults),
        children: Number(formValue.capacity?.children)
      },
      amenities: formValue.amenities || [],
      images: formValue.images || [],
      priceConfigId: hasPriceConfig ? formValue.priceConfigId : null,
      priceSettings: formValue.priceSettings ? {
        nightlyStartTime: formValue.priceSettings.nightlyStartTime || '22:00',
        nightlyEndTime: formValue.priceSettings.nightlyEndTime || '12:00',
        dailyStartTime: formValue.priceSettings.dailyStartTime || '06:00',
        dailyEndTime: formValue.priceSettings.dailyEndTime || '22:00',
        autoNightlyHours: Number(formValue.priceSettings.autoNightlyHours) || 8,
        autoDailyHours: Number(formValue.priceSettings.autoDailyHours) || 24,
        gracePeriodMinutes: Number(formValue.priceSettings.gracePeriodMinutes) || 15,
        timezone: formValue.priceSettings.timezone || 'UTC+7',
        dailyEarlyCheckinSurcharge: Number(formValue.priceSettings.dailyEarlyCheckinSurcharge) || 0,
        dailyLateCheckoutFee: Number(formValue.priceSettings.dailyLateCheckoutFee) || 0,
        nightlyEarlyCheckinSurcharge: Number(formValue.priceSettings.nightlyEarlyCheckinSurcharge) || 0,
        nightlyLateCheckoutSurcharge: Number(formValue.priceSettings.nightlyLateCheckoutSurcharge) || 0
      } : undefined,
      description: formValue.description,
      notes: formValue.notes
    };
    
    // ========== NẾU CÓ priceConfigId: KHÔNG GỬI GIÁ LÊN (backend sẽ tự động lấy từ priceConfig) ==========
    if (!hasPriceConfig) {
      // Chỉ gửi pricing nếu KHÔNG có priceConfig
      roomData.pricing = {
        hourly: Number(formValue.pricing?.hourly) || 0,
        daily: Number(formValue.pricing?.daily) || 0,
        nightly: Number(formValue.pricing?.nightly) || 0,
        weekly: Number(formValue.pricing?.weekly) || 0,
        monthly: Number(formValue.pricing?.monthly) || 0,
        currency: formValue.pricing?.currency || 'VND'
      };
      
      // Chỉ thêm firstHourRate nếu có giá trị
      if (formValue.firstHourRate !== null && formValue.firstHourRate !== undefined && formValue.firstHourRate !== '') {
        roomData.firstHourRate = Number(formValue.firstHourRate) || 0;
      }
      
      // Chỉ thêm additionalHourRate nếu người dùng đã nhập giá trị (kể cả 0)
      if (formValue.additionalHourRate !== null && formValue.additionalHourRate !== undefined && formValue.additionalHourRate !== '') {
        const value = Number(formValue.additionalHourRate);
        if (!isNaN(value)) {
          roomData.additionalHourRate = value;
        }
      }
    } else {
      // Nếu có priceConfigId, backend sẽ tự động lấy giá từ priceConfig
      // Không cần gửi pricing, firstHourRate, additionalHourRate
      console.log('Có priceConfigId, backend sẽ tự động lấy giá từ PriceConfig');
    }

    if (this.editId && this.selectedRoom) {
      // Debug: Log dữ liệu trước khi gửi
      console.log('Sending roomData to update:', {
        additionalHourRate: roomData.additionalHourRate,
        firstHourRate: roomData.firstHourRate,
        priceConfigId: roomData.priceConfigId
      });
      
      // Chỉ gửi roomData, không merge với selectedRoom để tránh gửi các trường không cần thiết
      this.roomService.updateRoom(this.editId!, roomData as Room).subscribe(
        (updatedRoom: Room) => {
          console.log('Received updated room:', {
            additionalHourRate: updatedRoom.additionalHourRate,
            firstHourRate: updatedRoom.firstHourRate
          });
          const index = this.rooms.findIndex((r: Room) => r._id === this.editId);
          if (index !== -1) {
            this.rooms[index] = updatedRoom;
            this.rooms = [...this.rooms];
            // Cập nhật total sau khi cập nhật
            this.total = this.rooms.length;
          }
          this.message.success(this.translate.instant('ROOM_MANAGEMENT.UPDATE_SUCCESS'));
          this.stopEdit();
        },
        (error: any) => {
          console.error('Lỗi khi cập nhật phòng:', error);
          this.message.error(error.error?.message || this.translate.instant('ROOM_MANAGEMENT.UPDATE_ERROR'));
        }
      );
    } else {
      // Kiểm tra giới hạn số phòng theo gói
      if (!this.authService.isSuperAdmin()) {
        const maxRooms = (this.currentPackage?.maxRooms ?? 0);
        if (maxRooms && maxRooms > 0) {
          const currentHotelId = this.selectedHotelId || roomData.hotelId;
          const currentCount = this.rooms.filter(r => r.hotelId === currentHotelId).length;
          if (currentCount >= maxRooms) {
            this.message.warning(`Gói hiện tại chỉ cho phép tạo tối đa ${maxRooms} phòng. Vui lòng nâng cấp gói để tạo thêm phòng.`);
            return;
          }
        }
      }
      const { _id, ...dataToSend } = roomData;
      this.roomService.createRoom(dataToSend as Room).subscribe(
        (newRoom: Room) => {
          this.rooms.push(newRoom);
          this.rooms = [...this.rooms];
          // Cập nhật total sau khi tạo mới
          this.total = this.rooms.length;
          // Nếu số phòng vượt quá pageSize, chuyển sang trang cuối
          const totalPages = Math.ceil(this.total / this.pageSize);
          if (totalPages > 0) {
            this.pageIndex = totalPages;
          }
          this.message.success(this.translate.instant('ROOM_MANAGEMENT.CREATE_SUCCESS'));
          this.stopEdit();
          this.roomForm.reset({
            hotelId: this.selectedHotelId,
            status: 'vacant',
            floor: 1,
            capacity: { adults: 2, children: 0 },
            amenities: [],
            images: [],
            pricing: { hourly: 0, daily: 0, nightly: 0, weekly: 0, monthly: 0, currency: 'VND' },
            firstHourRate: 0,
            additionalHourRate: 0
          });
          // Reload floors để cập nhật danh sách tầng mới
          if (this.selectedHotelId) {
            this.roomService.getHotelFloors(this.selectedHotelId!).subscribe(
              (data: any) => {
                this.floors = data.floors.map((f: any) => String(f));
              }
            );
          }
        },
        (error: any) => {
          console.error('Lỗi khi tạo phòng:', error);
          this.message.error(error.error?.message || this.translate.instant('ROOM_MANAGEMENT.CREATE_ERROR'));
        }
      );
    }
  }

  deleteRoom(id: string): void {
    if (!this.canManage(id)) {
      this.message.warning(this.translate.instant('ROOM_MANAGEMENT.NO_DELETE_PERMISSION'));
      return;
    }
    
    this.roomService.deleteRoom(id).subscribe(
      () => {
        this.rooms = this.rooms.filter((r: Room) => r._id !== id);
        // Cập nhật total sau khi xóa
        this.total = this.rooms.length;
        // Nếu trang hiện tại không còn dữ liệu, chuyển về trang trước
        const totalPages = Math.ceil(this.total / this.pageSize);
        if (this.pageIndex > totalPages && totalPages > 0) {
          this.pageIndex = totalPages;
        } else if (totalPages === 0) {
          this.pageIndex = 1;
        }
        this.message.success(this.translate.instant('ROOM_MANAGEMENT.DELETE_SUCCESS'));
        if (this.editId === id) {
          this.stopEdit();
        }
      },
      (error: any) => {
        console.error('Lỗi khi xóa phòng:', error);
        this.message.error(error.error?.message || this.translate.instant('ROOM_MANAGEMENT.DELETE_ERROR'));
      }
    );
  }

  filterRoomsByFloor(floor: number | string | null): void {
    if (this.selectedHotelId) {
      // Reset phân trang về trang 1 khi filter
      this.pageIndex = 1;
      
      if (floor !== null && floor !== '') {
        this.roomService.getRoomsByFloor(this.selectedHotelId!, Number(floor)).subscribe(
          (data: Room[]) => {
            this.rooms = data;
            this.total = data.length;
          },
          (error: any) => {
            console.error('Lỗi khi lọc phòng theo tầng:', error);
            this.message.error(this.translate.instant('ROOM_MANAGEMENT.FILTER_FLOOR_ERROR'));
          }
        );
      } else {
        this.loadRooms(this.selectedHotelId!);
      }
    } else {
      this.message.warning(this.translate.instant('ROOM_MANAGEMENT.SELECT_HOTEL_FIRST'));
      this.rooms = [];
      this.total = 0;
    }
  }

  getHotelName(hotelId: string): string {
    const hotel = this.hotels.find((h: Hotel) => h._id === hotelId);
    return hotel ? hotel.name : this.translate.instant('COMMON.UNKNOWN');
  }

  getRoomStatusLabel(statusValue: Room['status'] | undefined): string {
    if (!statusValue) return this.translate.instant('ROOM_MANAGEMENT.STATUS_OPTIONS.UNKNOWN');
    const option = this.roomStatusOptions.find((opt: { label: string, value: Room['status'] }) => opt.value === statusValue);
    return option ? option.label : statusValue;
  }

  getFloorLabel(floor: string | number): string {
    return `${this.translate.instant('ROOM_MANAGEMENT.FLOOR_PREFIX')} ${floor}`;
  }
}
