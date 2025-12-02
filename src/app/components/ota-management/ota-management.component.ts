import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { Observable, Subscription } from 'rxjs';
import { OtaService, ApiResponse, OtaBookingsResponse } from '../../services/ota.service';
import { HotelService } from '../../services/hotel.service';
import { RoomsService } from '../../services/rooms.service';
import { AuthService } from '../../services/auth.service';
import { 
    OtaIntegration, 
    OtaProvider, 
    ALL_OTA_PROVIDERS, 
    OtaIntegrationStatus, 
    OtaBooking,
    OtaRoomTypeMapping,
    OtaCalendarEvent,
    OtaCalendarResponse,
    OTA_PROVIDER_COLORS
} from '../../interfaces/ota-integration';
import { Hotel } from '../../interfaces/hotel';
import { Room } from '../../interfaces/rooms';

@Component({
  selector: 'app-ota-management',
  templateUrl: './ota-management.component.html',
  styleUrls: ['./ota-management.component.css']
})
export class OtaManagementComponent implements OnInit, OnDestroy {
  otaIntegrations: OtaIntegration[] = [];
  otaForm!: FormGroup;
  isLoading = false;
  isModalVisible = false;
  editId: string | null = null;
  private subscriptions = new Subscription();

  hotels: Hotel[] = [];
  roomsForHotel: Room[] = [];
  selectedHotelForMapping: string | null = null;
  currentHotelId: string | null = null;

  otaProviders: OtaProvider[] = [...ALL_OTA_PROVIDERS];
  otaStatuses: OtaIntegrationStatus[] = ['active', 'inactive', 'error'];

  // Bookings
  bookings: OtaBooking[] = [];
  calendarEvents: OtaCalendarEvent[] = [];
  selectedIntegration: OtaIntegration | null = null;
  isBookingsLoading = false;
  isSyncing = false;
  selectedProvider: OtaProvider | 'all' = 'all';

  integrationForm!: FormGroup;
  modalTitle = '';

  // Date filters
  startDate: Date | null = null;
  endDate: Date | null = null;

  // View mode
  viewMode: 'list' | 'calendar' = 'list';

  // Calendar summary
  calendarSummary: {
    total: number;
    byProvider: Record<OtaProvider, number>;
  } | null = null;

  constructor(
    private fb: FormBuilder,
    private otaService: OtaService,
    private hotelService: HotelService,
    private roomsService: RoomsService,
    private authService: AuthService,
    private message: NzMessageService,
    private modal: NzModalService
  ) {
    this.initializeForms();
  }

  private initializeForms(): void {
    this.otaForm = this.fb.group({
      hotelId: [null, Validators.required],
      provider: [null, Validators.required],
      status: ['inactive' as OtaIntegrationStatus, Validators.required],
      syncFrequency: [60, Validators.min(5)],
      credentials: this.fb.group({
        apiKey: [''],
        apiSecret: [''],
        username: [''],
        password: [''],
        hotelId: [''],
        propertyId: [''],
        agodaPartnerId: [''],
        agodaApiKey: [''],
        travelokaClientId: [''],
        travelokaClientSecret: [''],
        tripClientId: [''],
        tripClientSecret: [''],
        tripPartnerCode: [''],
        expediaApiKey: [''],
        expediaSecret: [''],
        expediaHotelId: ['']
      }),
      settings: this.fb.group({
        autoAcceptBookings: [false],
        updateInventory: [true],
        updatePrices: [true],
        updateAvailability: [true],
        currencyCode: ['VND'],
        languageCode: ['vi']
      }),
      mappings: this.fb.group({
        roomTypes: this.fb.array([])
      })
    });

    this.integrationForm = this.fb.group({
      provider: ['', Validators.required],
      credentials: this.fb.group({
        clientId: [''],
        clientSecret: [''],
        username: [''],
        password: [''],
        hotelId: [''],
        propertyId: [''],
        agodaPartnerId: [''],
        agodaApiKey: [''],
        travelokaClientId: [''],
        travelokaClientSecret: [''],
        tripClientId: [''],
        tripClientSecret: [''],
        tripPartnerCode: [''],
        expediaApiKey: [''],
        expediaSecret: [''],
        expediaHotelId: ['']
      }),
      settings: this.fb.group({
        autoAcceptBookings: [false],
        updateInventory: [true],
        updatePrices: [true],
        updateAvailability: [true],
        currencyCode: ['VND'],
        languageCode: ['vi']
      })
    });
  }

  ngOnInit(): void {
    this.currentHotelId = this.authService.getHotelId();
    this.loadHotels();
    this.loadOtaIntegrations();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get roomTypeMappings(): FormArray {
    return this.otaForm.get('mappings.roomTypes') as FormArray;
  }

  // ============ LOAD DATA ============

  loadHotels(): void {
    this.subscriptions.add(
      this.hotelService.getHotels().subscribe(
        (data: Hotel[]) => this.hotels = data,
        (err: any) => this.message.error('Không thể tải danh sách khách sạn.')
      )
    );
  }

  loadOtaIntegrations(hotelId?: string): void {
    this.isLoading = true;
    const queryHotelId = hotelId || this.currentHotelId || undefined;
    
    this.subscriptions.add(
      this.otaService.getOtaIntegrations(queryHotelId).subscribe(
        (data: OtaIntegration[]) => {
          this.otaIntegrations = data;
          this.isLoading = false;
        },
        (error: any) => {
          this.isLoading = false;
          this.message.error('Lỗi khi tải danh sách cấu hình OTA.');
          console.error(error);
        }
      )
    );
  }

  // ============ API RIÊNG TỪNG OTA ============

  /**
   * Lấy bookings theo provider cụ thể
   */
  getBookingsByProvider(provider: OtaProvider, sync: boolean = false): void {
    if (!this.currentHotelId) {
      this.message.warning('Vui lòng chọn khách sạn');
      return;
    }

    this.isBookingsLoading = true;
    this.selectedProvider = provider;

    this.subscriptions.add(
      this.otaService.getBookingsByProvider(provider, this.currentHotelId, sync).subscribe(
        (response: OtaBookingsResponse) => {
          this.bookings = response.data || [];
          this.isBookingsLoading = false;
          this.message.success(`Đã lấy ${this.bookings.length} đặt phòng từ ${provider}`);
        },
        (error: any) => {
          this.isBookingsLoading = false;
          this.message.error(`Lỗi khi lấy đặt phòng từ ${provider}`);
          console.error(error);
        }
      )
    );
  }

  /**
   * Lấy tất cả bookings cho calendar
   */
  loadCalendarBookings(): void {
    if (!this.currentHotelId) {
      this.message.warning('Vui lòng chọn khách sạn');
      return;
    }

    this.isBookingsLoading = true;
    this.viewMode = 'calendar';

    this.subscriptions.add(
      this.otaService.getAllOtaBookingsForCalendar(
        this.currentHotelId,
        this.startDate || undefined,
        this.endDate || undefined
      ).subscribe(
        (response: OtaCalendarResponse) => {
          this.calendarEvents = response.data || [];
          this.calendarSummary = response.summary;
          this.isBookingsLoading = false;
          this.message.success(`Đã lấy ${this.calendarEvents.length} đặt phòng cho calendar`);
        },
        (error: any) => {
          this.isBookingsLoading = false;
          this.message.error('Lỗi khi lấy đặt phòng cho calendar');
          console.error(error);
        }
      )
    );
  }

  /**
   * Sync bookings từ một provider cụ thể
   */
  syncProviderBookings(provider: OtaProvider): void {
    this.getBookingsByProvider(provider, true);
  }

  // ============ ASSIGN BOOKING VÀO PHÒNG ============

  /**
   * Assign OTA booking vào phòng cụ thể
   */
  assignBookingToRoom(booking: OtaBooking, roomId: string): void {
    if (!booking._id) {
      this.message.error('Không tìm thấy booking ID');
      return;
    }

    this.isLoading = true;
    const staffId = this.authService.getUserId();

    this.subscriptions.add(
      this.otaService.assignOtaBookingToRoom(booking._id, roomId, staffId || undefined).subscribe(
        (response: ApiResponse) => {
          this.isLoading = false;
          this.message.success('Đã assign booking vào phòng thành công');
          this.loadCalendarBookings(); // Refresh
        },
        (error: any) => {
          this.isLoading = false;
          this.message.error(error.error?.message || 'Lỗi khi assign booking');
          console.error(error);
        }
      )
    );
  }

  // ============ MODAL HANDLERS ============

  addRoomTypeMapping(mapping?: OtaRoomTypeMapping): void {
    const mappingForm = this.fb.group({
      localRoomTypeId: [mapping?.localRoomTypeId || null, Validators.required],
      otaRoomTypeId: [mapping?.otaRoomTypeId || ''],
      otaRoomTypeName: [mapping?.otaRoomTypeName || '']
    });
    this.roomTypeMappings.push(mappingForm);
  }

  removeRoomTypeMapping(index: number): void {
    this.roomTypeMappings.removeAt(index);
  }

  onHotelSelectedForForm(hotelId: string | null): void {
    this.selectedHotelForMapping = hotelId;
    this.roomTypeMappings.clear();
    if (hotelId) {
      this.subscriptions.add(
        this.roomsService.getRooms({ hotelId: hotelId }).subscribe(
          (rooms: Room[]) => this.roomsForHotel = rooms,
          (err: any) => {
            this.roomsForHotel = [];
            this.message.error(`Không thể tải danh sách phòng cho khách sạn ID: ${hotelId}`);
          }
        )
      );
    } else {
      this.roomsForHotel = [];
    }
  }

  openModal(integration?: OtaIntegration): void {
    this.isModalVisible = true;
    this.editId = null;
    this.selectedHotelForMapping = null;
    this.roomsForHotel = [];
    this.roomTypeMappings.clear();

    if (integration) {
      this.editId = integration._id;
      this.selectedHotelForMapping = typeof integration.hotelId === 'string' ? integration.hotelId : (integration.hotelId as Hotel)?._id || null;
      if(this.selectedHotelForMapping) this.onHotelSelectedForForm(this.selectedHotelForMapping);
      
      this.otaForm.patchValue(integration);
      integration.mappings?.roomTypes?.forEach(map => this.addRoomTypeMapping(map));
    } else {
      this.otaForm.reset({
        status: 'inactive',
        syncFrequency: 60,
        credentials: {},
        settings: { 
          autoAcceptBookings: false, 
          updateInventory: true, 
          updatePrices: true, 
          updateAvailability: true,
          currencyCode: 'VND',
          languageCode: 'vi'
        },
        mappings: { roomTypes: [] }
      });
    }
  }

  handleCancel(): void {
    this.isModalVisible = false;
    this.otaForm.reset();
    this.roomTypeMappings.clear();
    this.editId = null;
    this.selectedHotelForMapping = null;
    this.roomsForHotel = [];
  }

  submitForm(): void {
    if (this.otaForm.invalid) {
      this.message.error('Vui lòng điền đầy đủ thông tin bắt buộc.');
      Object.values(this.otaForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      return;
    }

    this.isLoading = true;
    const formData = this.otaForm.value as Partial<OtaIntegration>;

    let requestObservable: Observable<ApiResponse<OtaIntegration>>;
    if (this.editId) {
      requestObservable = this.otaService.updateOtaIntegration(this.editId, formData);
    } else {
      requestObservable = this.otaService.createOtaIntegration(formData);
    }

    this.subscriptions.add(
      requestObservable.subscribe(
        (res: ApiResponse<OtaIntegration>) => {
          this.isLoading = false;
          this.isModalVisible = false;
          this.message.success(res.message || (this.editId ? 'Cập nhật thành công!' : 'Tạo mới thành công!'));
          this.loadOtaIntegrations();
        },
        (error: any) => {
          this.isLoading = false;
          this.message.error(error.error?.message || 'Đã có lỗi xảy ra.');
          console.error(error);
        }
      )
    );
  }

  showAddModal(): void {
    this.modalTitle = 'Thêm tích hợp OTA mới';
    this.integrationForm.reset({
      settings: {
        autoAcceptBookings: false,
        updateInventory: true,
        updatePrices: true,
        updateAvailability: true,
        currencyCode: 'VND',
        languageCode: 'vi'
      }
    });
    this.selectedIntegration = null;
    this.isModalVisible = true;
  }

  showEditModal(integration: OtaIntegration): void {
    this.modalTitle = 'Chỉnh sửa tích hợp OTA';
    this.selectedIntegration = integration;
    
    this.integrationForm.patchValue({
      provider: integration.provider,
      credentials: integration.credentials || {},
      settings: integration.settings || {
        autoAcceptBookings: false,
        updateInventory: true,
        updatePrices: true,
        updateAvailability: true,
        currencyCode: 'VND',
        languageCode: 'vi'
      }
    });
    
    this.isModalVisible = true;
  }

  handleModalOk(): void {
    if (this.integrationForm.valid) {
      const formData = this.integrationForm.value;
      
      if (this.selectedIntegration) {
        this.otaService.updateOtaIntegration(this.selectedIntegration._id, formData)
          .subscribe({
            next: (response) => {
              this.message.success('Cập nhật tích hợp OTA thành công');
              this.loadOtaIntegrations();
              this.isModalVisible = false;
            },
            error: (error) => {
              this.message.error('Lỗi khi cập nhật tích hợp OTA');
              console.error('Update integration error:', error);
            }
          });
      } else {
        // Thêm hotelId nếu có
        if (this.currentHotelId) {
          formData.hotelId = this.currentHotelId;
        }
        
        this.otaService.createOtaIntegration(formData)
          .subscribe({
            next: (response) => {
              this.message.success('Thêm tích hợp OTA thành công');
              this.loadOtaIntegrations();
              this.isModalVisible = false;
            },
            error: (error) => {
              this.message.error('Lỗi khi thêm tích hợp OTA');
              console.error('Create integration error:', error);
            }
          });
      }
    } else {
      Object.values(this.integrationForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  handleModalCancel(): void {
    this.isModalVisible = false;
    this.selectedIntegration = null;
    this.integrationForm.reset();
  }

  deleteIntegration(integration: OtaIntegration): void {
    this.modal.confirm({
      nzTitle: 'Xác nhận xóa',
      nzContent: `Bạn có chắc chắn muốn xóa tích hợp ${integration.provider} không?`,
      nzOkText: 'Xóa',
      nzOkDanger: true,
      nzOnOk: () => {
        this.otaService.deleteOtaIntegration(integration._id)
          .subscribe({
            next: () => {
              this.message.success('Xóa tích hợp OTA thành công');
              this.loadOtaIntegrations();
            },
            error: (error) => {
              this.message.error('Lỗi khi xóa tích hợp OTA');
              console.error('Delete integration error:', error);
            }
          });
      }
    });
  }

  // ============ OTA OPERATIONS ============

  loginToBooking(integration: OtaIntegration): void {
    const credentials = {
      ...integration.credentials,
      provider: integration.provider
    };

    this.otaService.loginOtaProvider(integration._id, integration.provider, credentials)
      .subscribe({
        next: (response: ApiResponse<OtaIntegration>) => {
          this.message.success('Đăng nhập thành công!');
          this.loadOtaIntegrations();
        },
        error: (error: any) => {
          this.message.error(error.error?.message || 'Đăng nhập thất bại');
        }
      });
  }

  getBookings(integration: OtaIntegration): void {
    this.selectedIntegration = integration;
    this.getBookingsByProvider(integration.provider, false);
  }

  syncData(integration: OtaIntegration): void {
    this.isSyncing = true;
    this.otaService.syncOtaData(integration._id)
      .subscribe({
        next: (response: ApiResponse) => {
          this.message.success('Đồng bộ dữ liệu thành công!');
          this.loadOtaIntegrations();
          this.isSyncing = false;
        },
        error: (error: any) => {
          this.message.error(error.error?.message || 'Lỗi khi đồng bộ dữ liệu');
          this.isSyncing = false;
        }
      });
  }

  // ============ HELPER METHODS ============

  getStatusColor(status: string): string {
    switch (status) {
      case 'active': return 'green';
      case 'inactive': return 'gray';
      case 'error': return 'red';
      case 'pending': return 'orange';
      default: return 'default';
    }
  }

  getBookingStatusColor(status: string): string {
    return this.otaService.getStatusColor(status);
  }

  getBookingStatusLabel(status: string): string {
    return this.otaService.getStatusLabel(status);
  }

  getProviderColor(provider: OtaProvider): string {
    return OTA_PROVIDER_COLORS[provider] || '#888888';
  }

  formatDate(date: string | Date): string {
    return new Date(date).toLocaleString('vi-VN');
  }

  formatCurrency(amount: number, currency: string = 'VND'): string {
    return this.otaService.formatCurrency(amount, currency);
  }

  // ============ VIEW TOGGLE ============

  toggleView(mode: 'list' | 'calendar'): void {
    this.viewMode = mode;
    if (mode === 'calendar') {
      this.loadCalendarBookings();
    }
  }

  // ============ FILTER ============

  onDateRangeChange(dates: [Date, Date] | null): void {
    if (dates) {
      this.startDate = dates[0];
      this.endDate = dates[1];
    } else {
      this.startDate = null;
      this.endDate = null;
    }
    
    if (this.viewMode === 'calendar') {
      this.loadCalendarBookings();
    }
  }

  onProviderFilter(provider: OtaProvider | 'all'): void {
    this.selectedProvider = provider;
    
    if (provider === 'all') {
      this.loadCalendarBookings();
    } else {
      this.getBookingsByProvider(provider, false);
    }
  }
}
