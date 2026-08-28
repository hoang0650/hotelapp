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
    OTA_PROVIDER_COLORS,
    ChannelAdapterDefinition,
    ChannelAdapterType,
    ChannelCredentialField
} from '../../interfaces/ota-integration';
import { Hotel } from '../../interfaces/hotel';
import { Room } from '../../interfaces/rooms';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-ota-management',
  templateUrl: './ota-management.component.html',
  styleUrls: ['./ota-management.component.css']
})
export class OtaManagementComponent implements OnInit, OnDestroy {
  otaIntegrations: OtaIntegration[] = [];
  channelAdapters: ChannelAdapterDefinition[] = [];
  selectedAdapter: ChannelAdapterDefinition | null = null;
  credentialFields: ChannelCredentialField[] = [];
  otaForm!: FormGroup;
  isLoading = false;
  isModalVisible = false;
  editId: string | null = null;
  private subscriptions = new Subscription();

  hotels: Hotel[] = [];
  roomsForHotel: Room[] = [];
  selectedHotelForMapping: string | null = null;
  currentHotelId: string | null = null;
  selectedHotelName = '';
  private currentUser: ReturnType<AuthService['getCurrentUser']> = null;

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
    byProvider: Record<string, number>;
  } | null = null;

  // Inventory sync
  isSyncingInventory = false;
  isSyncInventoryModalVisible = false;
  inventoryDateRange: [Date, Date] | null = null;
  selectedOtaForSync: string[] = [];
  inventorySyncResult: any = null;

  // Channex mappings
  channexRoomTypes: any[] = [];
  channexRatePlans: any[] = [];
  isLoadingMappings = false;
  mappingRoomTypes!: FormArray;

  constructor(
    private fb: FormBuilder,
    private otaService: OtaService,
    private hotelService: HotelService,
    private roomsService: RoomsService,
    private authService: AuthService,
    private message: NzMessageService,
    private modal: NzModalService,
    private translate: TranslateService
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
      adapterType: ['channex', Validators.required],
      provider: ['Channex'],
      status: ['inactive', Validators.required],
      credentials: this.fb.group({}),
      settings: this.fb.group({
        autoAcceptBookings: [false],
        updateInventory: [true],
        updatePrices: [true],
        updateAvailability: [true],
        currencyCode: ['VND'],
        languageCode: ['vi']
      }),
      mappings: this.fb.group({
        roomTypes: this.fb.array([]),
        ratePlans: this.fb.array([])
      })
    });
    this.mappingRoomTypes = this.integrationForm.get('mappings.roomTypes') as FormArray;
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.initializeHotelContext();
    this.loadChannelAdapters();
    this.loadHotels();

    this.subscriptions.add(
      this.hotelService.selectedHotelId$.subscribe((hotelId) => {
        const normalized = this.hotelService.normalizeHotelId(hotelId);
        if (normalized && !this.hotelService.sameHotelId(normalized, this.currentHotelId)) {
          this.onHotelChange(normalized, { persist: false });
        }
      })
    );
  }

  private initializeHotelContext(): void {
    const storedHotelId = this.hotelService.resolvePreferredHotelId(this.authService.getHotelId());
    if (!storedHotelId) return;

    this.currentHotelId = storedHotelId;
    this.hotels = this.hotelService.ensureSelectedHotelOption(
      this.hotelService.getCachedHotels(),
      storedHotelId,
      this.hotelService.getCachedHotelName(storedHotelId)
    );
    this.updateSelectedHotelName(storedHotelId);
    this.onHotelSelectedForForm(storedHotelId);
  }

  loadChannelAdapters(): void {
    this.subscriptions.add(
      this.otaService.getChannelAdapters().subscribe({
        next: (res) => {
          this.channelAdapters = res.data || [];
          if (this.channelAdapters.length > 0) {
            this.otaProviders = this.channelAdapters.map((a) => a.provider);
          }
          const channex = this.channelAdapters.find((a) => a.adapterType === 'channex');
          if (channex && !this.selectedAdapter) {
            this.onAdapterTypeChange('channex');
          }
        },
        error: () => {
          const fallbackMap: Record<string, ChannelAdapterType> = {
            'Channex': 'channex',
            'Booking.com': 'booking_com',
            'Agoda': 'agoda',
            'Traveloka': 'traveloka',
            'Trip.com': 'trip_com',
            'Expedia': 'expedia',
            'G2J': 'g2j',
          };
          this.channelAdapters = ALL_OTA_PROVIDERS.map((provider) => ({
            adapterType: fallbackMap[provider],
            channelCode: fallbackMap[provider],
            channelName: provider,
            provider,
            adapterKind: 'direct' as const,
            syncDirection: 'bidirectional' as const,
            supportedFunctions: ['pull_reservations', 'push_availability', 'test_connection'],
            color: OTA_PROVIDER_COLORS[provider],
            credentialFields: [],
          }));
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get mappingRatePlans(): FormArray {
    return this.integrationForm.get('mappings.ratePlans') as FormArray;
  }

  isChannexAdapter(): boolean {
    return this.selectedAdapter?.adapterType === 'channex';
  }

  addMappingRow(room?: Room, mapping?: OtaRoomTypeMapping): void {
    this.mappingRoomTypes.push(this.fb.group({
      localRoomTypeId: [mapping?.localRoomTypeId || room?._id || null, Validators.required],
      otaRoomTypeId: [mapping?.otaRoomTypeId || '', Validators.required],
      otaRoomTypeName: [mapping?.otaRoomTypeName || room?.type || ''],
      maxOccupancy: [mapping?.maxOccupancy || 2, Validators.required],
      baseRate: [mapping?.baseRate || room?.pricing?.daily || 0, Validators.required],
    }));
  }

  removeMappingRow(index: number): void {
    this.mappingRoomTypes.removeAt(index);
  }

  syncChannexMappings(integration: OtaIntegration): void {
    this.isLoadingMappings = true;
    this.subscriptions.add(
      this.otaService.syncChannexMappings(integration._id).subscribe({
        next: (res) => {
          this.isLoadingMappings = false;
          this.channexRoomTypes = res.data?.roomTypes || [];
          this.channexRatePlans = res.data?.ratePlans || [];
          this.message.success(`Đã lấy ${this.channexRoomTypes.length} room types từ Channex`);
        },
        error: (error) => {
          this.isLoadingMappings = false;
          this.message.error(error.error?.message || 'Lỗi khi lấy mappings từ Channex');
        }
      })
    );
  }

  autoFillMappingsFromChannex(): void {
    this.mappingRoomTypes.clear();
    this.mappingRatePlans.clear();

    const roomsByType = new Map<string, Room>();
    this.roomsForHotel.forEach((room) => {
      if (!roomsByType.has(room.type)) {
        roomsByType.set(room.type, room);
      }
    });

    this.channexRoomTypes.forEach((rt) => {
      const localRoom = [...roomsByType.values()].find((r) => r.type === rt.title) || [...roomsByType.values()][0];
      if (localRoom) {
        this.addMappingRow(localRoom, {
          localRoomTypeId: localRoom._id,
          otaRoomTypeId: rt.id,
          otaRoomTypeName: rt.title,
          maxOccupancy: rt.occAdults || 2,
          baseRate: localRoom.pricing?.daily || 0,
        });
      }
    });

    this.channexRatePlans.forEach((rp) => {
      const roomMapping = this.mappingRoomTypes.controls.find(
        (c) => c.value.otaRoomTypeId === rp.roomTypeId
      );
      if (roomMapping) {
        this.mappingRatePlans.push(this.fb.group({
          localRatePlanId: [roomMapping.value.localRoomTypeId, Validators.required],
          otaRatePlanId: [rp.id, Validators.required],
          otaRatePlanName: [rp.title],
          cancellationPolicy: this.fb.group({
            type: ['free'],
            deadlineDays: [1],
            penaltyAmount: [0],
          }),
        }));
      }
    });

    this.message.success('Đã tự động điền mapping từ Channex');
  }

  onAdapterTypeChange(adapterType: unknown): void {
    if (!adapterType || typeof adapterType !== 'string') return;
    const typedAdapterType = adapterType as ChannelAdapterType;
    const adapter = this.channelAdapters.find((a) => a.adapterType === typedAdapterType) || null;
    this.selectedAdapter = adapter;
    this.credentialFields = adapter?.credentialFields || [];

    const credentialsGroup = this.fb.group({});
    this.credentialFields.forEach((field) => {
      const validators = field.required ? [Validators.required] : [];
      credentialsGroup.addControl(field.key, this.fb.control(field.type === 'boolean' ? false : '', validators));
    });
    this.integrationForm.setControl('credentials', credentialsGroup);
    this.integrationForm.patchValue({
      provider: adapter?.provider || '',
    });
  }

  getAdapterForIntegration(integration: OtaIntegration): ChannelAdapterDefinition | null {
    if (integration.adapterType) {
      return this.channelAdapters.find((a) => a.adapterType === integration.adapterType) || null;
    }
    return this.channelAdapters.find((a) => a.provider === integration.provider) || null;
  }

  supportsFunction(integration: OtaIntegration, fn: string): boolean {
    const adapter = this.getAdapterForIntegration(integration);
    return adapter?.supportedFunctions?.includes(fn as any) ?? true;
  }

  testConnection(integration: OtaIntegration): void {
    this.isLoading = true;
    this.subscriptions.add(
      this.otaService.testChannelConnection(integration._id).subscribe({
        next: (res) => {
          this.isLoading = false;
          const connected = res.data?.connected;
          if (connected) {
            this.message.success(res.data?.message || this.translate.instant('OTA_MANAGEMENT.MESSAGES.LOGIN_SUCCESS'));
          } else {
            this.message.warning(res.data?.message || 'Không kết nối được channel');
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.message.error(error.error?.message || 'Lỗi khi test connection');
        }
      })
    );
  }

  get roomTypeMappings(): FormArray {
    return this.otaForm.get('mappings.roomTypes') as FormArray;
  }

  // ============ LOAD DATA ============

  loadHotels(): void {
    const preferred =
      this.hotelService.normalizeHotelId(this.currentHotelId) ||
      this.hotelService.resolvePreferredHotelId(this.authService.getHotelId());

    if (preferred && this.hotels.length === 0) {
      this.hotels = this.hotelService.ensureSelectedHotelOption(
        this.hotelService.getCachedHotels(),
        preferred,
        this.hotelService.getCachedHotelName(preferred)
      );
      this.currentHotelId = preferred;
      this.updateSelectedHotelName(preferred);
    }

    const cached = this.hotelService.getCachedHotels();
    if (cached.length > 0) {
      this.applyHotelsList(cached);
    }

    this.subscriptions.add(
      this.hotelService.getHotelsCached(undefined, undefined, { lite: true }).subscribe({
        next: (data) => this.applyHotelsList(data),
        error: () => {
          if (preferred) {
            this.hotels = this.hotelService.ensureSelectedHotelOption([], preferred);
            this.currentHotelId = preferred;
            this.updateSelectedHotelName(preferred);
            this.loadOtaIntegrations(preferred);
          } else {
            this.message.error(this.translate.instant('OTA_MANAGEMENT.MESSAGES.HOTELS_LOAD_ERROR'));
          }
        },
      })
    );
  }

  private applyHotelsList(data: Hotel[]): void {
    const user = this.currentUser || this.authService.getCurrentUser();
    const filtered = this.hotelService.filterHotelsForUser(data, user);
    const selected =
      this.hotelService.normalizeHotelId(this.currentHotelId) ||
      this.hotelService.resolvePreferredHotelId(this.authService.getHotelId());

    this.hotels = this.hotelService.ensureSelectedHotelOption(filtered, selected);

    if (!selected && this.hotels.length > 0) {
      const firstHotelId = this.hotelService.normalizeHotelId(this.hotels[0]._id);
      if (firstHotelId) {
        this.onHotelChange(firstHotelId);
      }
      return;
    }

    if (selected) {
      this.onHotelChange(selected, { persist: false, force: !this.currentHotelId });
    }
  }

  onHotelChange(hotelId: string | null, options?: { persist?: boolean; force?: boolean }): void {
    const normalized = this.hotelService.normalizeHotelId(hotelId);
    const same = this.hotelService.sameHotelId(normalized, this.currentHotelId);

    this.currentHotelId = normalized;
    if (normalized) {
      this.hotels = this.hotelService.ensureSelectedHotelOption(
        this.hotels,
        normalized,
        this.hotelService.getCachedHotelName(normalized)
      );
      this.updateSelectedHotelName(normalized);
      this.onHotelSelectedForForm(normalized);
    }

    if (options?.persist !== false && normalized) {
      this.hotelService.setSelectedHotelId(normalized);
    }

    if (!normalized) {
      this.otaIntegrations = [];
      this.bookings = [];
      this.calendarSummary = null;
      return;
    }

    if (same && !options?.force) {
      return;
    }

    this.loadOtaIntegrations(normalized);
  }

  private updateSelectedHotelName(hotelId: string | null): void {
    if (!hotelId) {
      this.selectedHotelName = '';
      return;
    }
    const found = this.hotels.find((h) => this.hotelService.sameHotelId(h._id, hotelId));
    if (found?.name) {
      this.selectedHotelName = found.name;
      this.hotelService.rememberHotelName(hotelId, found.name);
      return;
    }

    this.subscriptions.add(
      this.hotelService.resolveHotelDisplayName(hotelId).subscribe((name) => {
        this.selectedHotelName = name;
        const id = this.hotelService.normalizeHotelId(hotelId)!;
        this.hotels = this.hotelService.ensureSelectedHotelOption(this.hotels, id, name);
      })
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
          this.message.error(this.translate.instant('OTA_MANAGEMENT.MESSAGES.CONFIG_LOAD_ERROR'));
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
          this.message.success(this.translate.instant('OTA_MANAGEMENT.MESSAGES.BOOKINGS_FETCHED', { count: this.bookings.length, provider }));
        },
        (error: any) => {
          this.isBookingsLoading = false;
          this.message.error(this.translate.instant('OTA_MANAGEMENT.MESSAGES.BOOKINGS_FETCH_ERROR', { provider }));
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
          this.message.success(this.translate.instant('OTA_MANAGEMENT.MESSAGES.CALENDAR_FETCHED', { count: this.calendarEvents.length }));
        },
        (error: any) => {
          this.isBookingsLoading = false;
          this.message.error(this.translate.instant('OTA_MANAGEMENT.MESSAGES.CALENDAR_FETCH_ERROR'));
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
      this.message.error(this.translate.instant('OTA_MANAGEMENT.MESSAGES.BOOKING_ID_NOT_FOUND'));
      return;
    }

    this.isLoading = true;
    const staffId = this.authService.getUserId();

    this.subscriptions.add(
      this.otaService.assignOtaBookingToRoom(booking._id, roomId, staffId || undefined).subscribe(
        (response: ApiResponse) => {
          this.isLoading = false;
          this.message.success(this.translate.instant('OTA_MANAGEMENT.MESSAGES.ASSIGN_SUCCESS'));
          this.loadCalendarBookings(); // Refresh
        },
        (error: any) => {
          this.isLoading = false;
          this.message.error(error.error?.message || this.translate.instant('OTA_MANAGEMENT.MESSAGES.ASSIGN_ERROR'));
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
            this.message.error(this.translate.instant('OTA_MANAGEMENT.MESSAGES.ROOMS_LOAD_ERROR', { hotelId }));
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
      this.message.error(this.translate.instant('OTA_MANAGEMENT.MESSAGES.REQUIRED_FIELDS'));
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
          this.message.success(res.message || this.translate.instant(this.editId ? 'OTA_MANAGEMENT.MESSAGES.UPDATE_SUCCESS' : 'OTA_MANAGEMENT.MESSAGES.CREATE_SUCCESS'));
          this.loadOtaIntegrations();
        },
        (error: any) => {
          this.isLoading = false;
          this.message.error(error.error?.message || this.translate.instant('OTA_MANAGEMENT.MESSAGES.GENERIC_ERROR'));
          console.error(error);
        }
      )
    );
  }

  private findIntegrationForAdapter(
    hotelId: string | null | undefined,
    adapterType?: string | null,
    provider?: string | null
  ): OtaIntegration | undefined {
    if (!hotelId) return undefined;
    return this.otaIntegrations.find((integration) => {
      const integrationHotelId =
        typeof integration.hotelId === 'string'
          ? integration.hotelId
          : (integration.hotelId as Hotel)?._id;
      if (!this.hotelService.sameHotelId(integrationHotelId, hotelId)) {
        return false;
      }
      if (adapterType && integration.adapterType === adapterType) {
        return true;
      }
      if (provider && integration.provider === provider) {
        return true;
      }
      return false;
    });
  }

  showAddModal(): void {
    const defaultAdapterType = 'channex';
    const existing = this.findIntegrationForAdapter(this.currentHotelId, defaultAdapterType, 'Channex');
    if (existing) {
      this.message.info('Đã có kết nối Channex cho khách sạn này. Đang mở form chỉnh sửa.');
      this.showEditModal(existing);
      return;
    }

    this.modalTitle = 'Thêm channel connection mới';
    this.editId = null;
    this.selectedIntegration = null;
    this.channexRoomTypes = [];
    this.channexRatePlans = [];
    this.mappingRoomTypes.clear();
    this.mappingRatePlans.clear();

    this.integrationForm.reset({
      adapterType: 'channex',
      provider: 'Channex',
      status: 'inactive',
      settings: {
        autoAcceptBookings: false,
        updateInventory: true,
        updatePrices: true,
        updateAvailability: true,
        currencyCode: 'VND',
        languageCode: 'vi'
      }
    });
    this.onAdapterTypeChange('channex');
    if (this.currentHotelId) {
      this.onHotelSelectedForForm(this.currentHotelId);
    }
    this.isModalVisible = true;
  }

  showEditModal(integration: OtaIntegration): void {
    this.modalTitle = 'Chỉnh sửa channel connection';
    this.selectedIntegration = integration;
    this.editId = integration._id;
    const adapter = this.getAdapterForIntegration(integration);
    this.mappingRoomTypes.clear();
    this.mappingRatePlans.clear();

    if (adapter) {
      this.onAdapterTypeChange(adapter.adapterType);
    }

    const hotelId = typeof integration.hotelId === 'string' ? integration.hotelId : (integration.hotelId as Hotel)?._id;
    if (hotelId) {
      this.onHotelSelectedForForm(hotelId);
    }

    integration.mappings?.roomTypes?.forEach((m) => this.addMappingRow(undefined, m));
    integration.mappings?.ratePlans?.forEach((rp) => {
      this.mappingRatePlans.push(this.fb.group({
        localRatePlanId: [rp.localRatePlanId, Validators.required],
        otaRatePlanId: [rp.otaRatePlanId, Validators.required],
        otaRatePlanName: [rp.otaRatePlanName],
        cancellationPolicy: this.fb.group({
          type: [rp.cancellationPolicy?.type || 'free'],
          deadlineDays: [rp.cancellationPolicy?.deadlineDays || 1],
          penaltyAmount: [rp.cancellationPolicy?.penaltyAmount || 0],
        }),
      }));
    });

    this.integrationForm.patchValue({
      adapterType: integration.adapterType || adapter?.adapterType,
      provider: integration.provider,
      status: integration.status || 'inactive',
      credentials: integration.credentials || integration.config || {},
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
    if (this.integrationForm.invalid) {
      Object.values(this.integrationForm.controls).forEach(control => {
        if (control.invalid) control.markAsTouched();
      });
      this.message.error('Vui lòng điền đầy đủ thông tin bắt buộc');
      return;
    }

    const formData = {
      ...this.integrationForm.value,
      provider: this.selectedAdapter?.provider || this.integrationForm.value.provider,
      adapterType: this.selectedAdapter?.adapterType || this.integrationForm.value.adapterType,
      mappings: this.integrationForm.value.mappings || { roomTypes: [], ratePlans: [] },
    };

    if (this.selectedIntegration) {
      this.otaService.updateOtaIntegration(this.selectedIntegration._id, formData)
        .subscribe({
          next: () => {
            this.message.success(this.translate.instant('OTA_MANAGEMENT.MESSAGES.OTA_UPDATE_SUCCESS'));
            this.loadOtaIntegrations();
            this.isModalVisible = false;
          },
          error: (error) => {
            this.message.error(error.error?.message || this.translate.instant('OTA_MANAGEMENT.MESSAGES.OTA_UPDATE_ERROR'));
          }
        });
    } else {
      if (this.currentHotelId) {
        formData.hotelId = this.currentHotelId;
      }
      if (!formData.hotelId) {
        this.message.error('Không xác định được khách sạn. Vui lòng đăng nhập lại.');
        return;
      }

      const existing = this.findIntegrationForAdapter(
        formData.hotelId,
        formData.adapterType,
        formData.provider
      );

      const save$ = existing
        ? this.otaService.updateOtaIntegration(existing._id, formData)
        : this.otaService.createOtaIntegration(formData);

      save$.subscribe({
        next: () => {
          this.message.success(
            existing
              ? this.translate.instant('OTA_MANAGEMENT.MESSAGES.OTA_UPDATE_SUCCESS')
              : this.translate.instant('OTA_MANAGEMENT.MESSAGES.OTA_ADD_SUCCESS')
          );
          this.loadOtaIntegrations();
          this.isModalVisible = false;
          this.selectedIntegration = null;
        },
        error: (error) => {
          this.message.error(error.error?.message || this.translate.instant('OTA_MANAGEMENT.MESSAGES.OTA_ADD_ERROR'));
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
              this.message.success(this.translate.instant('OTA_MANAGEMENT.MESSAGES.OTA_DELETE_SUCCESS'));
              this.loadOtaIntegrations();
            },
            error: (error) => {
              this.message.error(this.translate.instant('OTA_MANAGEMENT.MESSAGES.OTA_DELETE_ERROR'));
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
          this.message.success(this.translate.instant('OTA_MANAGEMENT.MESSAGES.LOGIN_SUCCESS'));
          this.loadOtaIntegrations();
        },
        error: (error: any) => {
          this.message.error(error.error?.message || this.translate.instant('OTA_MANAGEMENT.MESSAGES.LOGIN_ERROR'));
        }
      });
  }

  getBookings(integration: OtaIntegration): void {
    this.selectedIntegration = integration;
    this.getBookingsByProvider(integration.provider, false);
  }

  syncData(integration: OtaIntegration): void {
    this.isSyncing = true;
    this.otaService.pullChannelReservations(integration._id)
      .subscribe({
        next: (response: OtaBookingsResponse) => {
          this.bookings = response.data || [];
          this.message.success(this.translate.instant('OTA_MANAGEMENT.MESSAGES.SYNC_SUCCESS'));
          this.loadOtaIntegrations();
          this.isSyncing = false;
        },
        error: (error: any) => {
          // Fallback legacy sync
          this.otaService.syncOtaData(integration._id).subscribe({
            next: () => {
              this.message.success(this.translate.instant('OTA_MANAGEMENT.MESSAGES.SYNC_SUCCESS'));
              this.loadOtaIntegrations();
              this.isSyncing = false;
            },
            error: (syncError: any) => {
              this.message.error(syncError.error?.message || this.translate.instant('OTA_MANAGEMENT.MESSAGES.SYNC_ERROR'));
              this.isSyncing = false;
            }
          });
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
    const adapter = this.channelAdapters.find((a) => a.provider === provider);
    return adapter?.color || OTA_PROVIDER_COLORS[provider] || '#888888';
  }

  getIntegrationLabel(integration: OtaIntegration): string {
    return integration.channelName || integration.provider;
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

  // ============ INVENTORY SYNC ============

  /**
   * Hiển thị modal đồng bộ inventory
   */
  showSyncInventoryModal(): void {
    this.isSyncInventoryModalVisible = true;
    this.inventoryDateRange = null;
    this.selectedOtaForSync = this.otaIntegrations
      .filter(i => i.status === 'active')
      .map(i => i._id);
    this.inventorySyncResult = null;
  }

  /**
   * Đóng modal đồng bộ inventory
   */
  handleSyncInventoryCancel(): void {
    this.isSyncInventoryModalVisible = false;
    this.inventoryDateRange = null;
    this.selectedOtaForSync = [];
    this.inventorySyncResult = null;
  }

  /**
   * Thực hiện đồng bộ inventory
   */
  handleSyncInventoryOk(): void {
    if (this.selectedOtaForSync.length === 0) {
      this.message.warning('Vui lòng chọn ít nhất một OTA để đồng bộ');
      return;
    }

    this.isSyncingInventory = true;
    this.inventorySyncResult = null;

    const startDate = this.inventoryDateRange?.[0] || new Date();
    const endDate = this.inventoryDateRange?.[1] || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    // Đồng bộ từng OTA đã chọn
    const syncPromises = this.selectedOtaForSync.map(integrationId => {
      return this.otaService.syncInventoryToOta(integrationId, startDate, endDate).toPromise();
    });

    Promise.all(syncPromises)
      .then(results => {
        this.isSyncingInventory = false;
        
        const syncResults = results.map((result, index) => {
          const integration = this.otaIntegrations.find(i => i._id === this.selectedOtaForSync[index]);
          return {
            provider: integration?.provider || 'Unknown',
            success: result && !result.error,
            syncedRooms: result?.data?.syncedRooms || 0,
            error: result?.error || result?.message
          };
        });

        this.inventorySyncResult = {
          results: syncResults,
          totalSuccess: syncResults.filter(r => r.success).length,
          totalFailed: syncResults.filter(r => !r.success).length
        };

        const successCount = this.inventorySyncResult.totalSuccess;
        if (successCount > 0) {
          this.message.success(this.translate.instant('OTA_MANAGEMENT.MESSAGES.INVENTORY_SYNC_PARTIAL', { successCount, total: syncResults.length }));
        } else {
          this.message.error(this.translate.instant('OTA_MANAGEMENT.MESSAGES.INVENTORY_SYNC_NONE'));
        }

        // Refresh integrations để cập nhật lastSync
        this.loadOtaIntegrations();
      })
      .catch(error => {
        this.isSyncingInventory = false;
        this.message.error(this.translate.instant('OTA_MANAGEMENT.MESSAGES.INVENTORY_SYNC_ERROR'));
        console.error('Sync inventory error:', error);
      });
  }

  /**
   * Đồng bộ inventory cho một OTA cụ thể
   */
  syncInventory(integration: OtaIntegration): void {
    if (integration.status !== 'active') {
      this.message.warning('OTA chưa được kích hoạt');
      return;
    }

    this.modal.confirm({
      nzTitle: `Đồng bộ phòng trống lên ${integration.provider}`,
      nzContent: 'Bạn có muốn đồng bộ số phòng trống và giá phòng lên OTA này không?',
      nzOkText: 'Đồng bộ',
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        this.isSyncingInventory = true;
        const startDate = new Date();
        const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

        this.subscriptions.add(
          this.otaService.syncInventoryToOta(integration._id, startDate, endDate).subscribe({
            next: (response: ApiResponse) => {
              this.isSyncingInventory = false;
              this.message.success(this.translate.instant('OTA_MANAGEMENT.MESSAGES.INVENTORY_SYNC_ROOMS', { count: response.data?.syncedRooms || 0, provider: integration.provider }));
              this.loadOtaIntegrations();
            },
            error: (error: any) => {
              this.isSyncingInventory = false;
              this.message.error(error.error?.message || this.translate.instant('OTA_MANAGEMENT.MESSAGES.INVENTORY_SYNC_ERROR'));
              console.error('Sync inventory error:', error);
            }
          })
        );
      }
    });
  }
}
