import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { Observable, Subscription } from 'rxjs';
import { OtaService, ApiResponse } from '../../services/ota.service';
import { HotelService } from '../../services/hotel.service';
import { RoomsService } from '../../services/rooms.service';
import { 
    OtaIntegration, 
    OtaProvider, 
    ALL_OTA_PROVIDERS, 
    OtaIntegrationStatus, 
    OtaBooking,
    OtaRoomTypeMapping,
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

  otaProviders: OtaProvider[] = [...ALL_OTA_PROVIDERS];
  otaStatuses: OtaIntegrationStatus[] = ['active', 'inactive', 'error'];

  bookings: OtaBooking[] = [];
  selectedIntegration: OtaIntegration | null = null;
  isBookingsLoading = false;
  isSyncing = false;

  integrationForm!: FormGroup;
  modalTitle = '';

  startDate: Date | null = null;
  endDate: Date | null = null;

  constructor(
    private fb: FormBuilder,
    private otaService: OtaService,
    private hotelService: HotelService,
    private roomsService: RoomsService,
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
        // Provider specific fields
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
        currencyCode: ['USD'],
        languageCode: ['en']
      }),
      mappings: this.fb.group({
        roomTypes: this.fb.array([])
      })
    });

    this.integrationForm = this.fb.group({
      provider: ['', Validators.required],
      credentials: this.fb.group({
        clientId: ['', Validators.required],
        clientSecret: ['', Validators.required],
        username: ['', Validators.required],
        password: ['', Validators.required],
        hotelId: ['', Validators.required]
      }),
      settings: this.fb.group({
        autoAcceptBookings: [false],
        updateInventory: [true],
        updatePrices: [true],
        updateAvailability: [true],
        currencyCode: ['USD'],
        languageCode: ['en']
      })
    });
  }

  ngOnInit(): void {
    this.loadHotels();
    this.loadOtaIntegrations();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get roomTypeMappings(): FormArray {
    return this.otaForm.get('mappings.roomTypes') as FormArray;
  }

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

  loadHotels(): void {
    this.subscriptions.add(
      this.hotelService.getHotels().subscribe(
        (data: Hotel[]) => this.hotels = data,
        (err: any) => this.message.error('Không thể tải danh sách khách sạn.')
      )
    );
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

  loadOtaIntegrations(hotelId?: string): void {
    this.isLoading = true;
    this.subscriptions.add(
      this.otaService.getOtaIntegrations(hotelId).subscribe(
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
        credentials: { apiKey: '', apiSecret: '', username: '', password: '', hotelId: '', propertyId: '', agodaPartnerId: '', agodaApiKey: '', travelokaClientId: '', travelokaClientSecret: '', tripClientId: '', tripClientSecret: '', tripPartnerCode: '', expediaApiKey: '', expediaSecret: '', expediaHotelId: ''},
        settings: { autoAcceptBookings: false, updateInventory: true, updatePrices: true, updateAvailability: true },
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
    this.integrationForm.reset();
    this.isModalVisible = true;
  }

  showEditModal(integration: OtaIntegration): void {
    this.modalTitle = 'Chỉnh sửa tích hợp OTA';
    this.selectedIntegration = integration;
    
    const credentials = {
      username: integration.credentials?.username || '',
      password: integration.credentials?.password || '',
      hotelId: integration.credentials?.hotelId || '',
      propertyId: integration.credentials?.propertyId || '',
      apiKey: integration.credentials?.apiKey || '',
      apiSecret: integration.credentials?.apiSecret || '',
      // Provider specific fields
      agodaPartnerId: integration.credentials?.agodaPartnerId || '',
      agodaApiKey: integration.credentials?.agodaApiKey || '',
      travelokaClientId: integration.credentials?.travelokaClientId || '',
      travelokaClientSecret: integration.credentials?.travelokaClientSecret || '',
      tripClientId: integration.credentials?.tripClientId || '',
      tripClientSecret: integration.credentials?.tripClientSecret || '',
      tripPartnerCode: integration.credentials?.tripPartnerCode || '',
      expediaApiKey: integration.credentials?.expediaApiKey || '',
      expediaSecret: integration.credentials?.expediaSecret || '',
      expediaHotelId: integration.credentials?.expediaHotelId || ''
    };
    
    this.integrationForm.patchValue({
      provider: integration.provider,
      credentials: credentials,
      settings: integration.settings || {
        autoAcceptBookings: false,
        updateInventory: true,
        updatePrices: true,
        updateAvailability: true,
        currencyCode: 'USD',
        languageCode: 'en'
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

  loginToBooking(integration: OtaIntegration): void {
    const credentials = {
      username: integration.credentials?.username || '',
      password: integration.credentials?.password || '',
      apiKey: integration.credentials?.apiKey || '',
      apiSecret: integration.credentials?.apiSecret || '',
      provider: integration.provider,
      ...(integration.provider === 'Booking.com' && {
        accessToken: integration.credentials?.accessToken,
        refreshToken: integration.credentials?.refreshToken
      }),
      ...(integration.provider === 'Agoda' && {
        agodaPartnerId: integration.credentials?.agodaPartnerId,
        agodaApiKey: integration.credentials?.agodaApiKey
      }),
      ...(integration.provider === 'Traveloka' && {
        travelokaClientId: integration.credentials?.travelokaClientId,
        travelokaClientSecret: integration.credentials?.travelokaClientSecret
      }),
      ...(integration.provider === 'Trip.com' && {
        tripClientId: integration.credentials?.tripClientId,
        tripClientSecret: integration.credentials?.tripClientSecret,
        tripPartnerCode: integration.credentials?.tripPartnerCode
      }),
      ...(integration.provider === 'Expedia' && {
        expediaApiKey: integration.credentials?.expediaApiKey,
        expediaSecret: integration.credentials?.expediaSecret,
        expediaHotelId: integration.credentials?.expediaHotelId
      })
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
    this.isLoading = true;
    this.otaService.getBookings(integration, {
      startDate: this.startDate?.toISOString(),
      endDate: this.endDate?.toISOString()
    }).subscribe({
      next: (bookings: OtaBooking[]) => {
        this.bookings = bookings;
        this.isLoading = false;
      },
      error: (error: any) => {
        this.message.error(error.error?.message || 'Lỗi khi lấy danh sách đặt phòng');
        this.isLoading = false;
      }
    });
  }

  syncData(integration: OtaIntegration): void {
    this.isLoading = true;
    this.otaService.syncOtaData(integration._id)
      .subscribe({
        next: (response: ApiResponse) => {
          this.message.success('Đồng bộ dữ liệu thành công!');
          this.loadOtaIntegrations();
          this.isLoading = false;
        },
        error: (error: any) => {
          this.message.error(error.error?.message || 'Lỗi khi đồng bộ dữ liệu');
          this.isLoading = false;
        }
      });
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'active': return 'green';
      case 'inactive': return 'gray';
      case 'error': return 'red';
      default: return '';
    }
  }

  formatDate(date: string | Date): string {
    return new Date(date).toLocaleString();
  }
} 