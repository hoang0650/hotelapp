import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
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
    // OtaRatePlanMapping // Comment out nếu chưa dùng đến
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
  otaForm: FormGroup;
  isLoading = false;
  isModalVisible = false;
  editId: string | null = null;
  private subscriptions = new Subscription();

  hotels: Hotel[] = [];
  roomsForHotel: Room[] = []; // Danh sách phòng của khách sạn đang chọn để map
  selectedHotelForMapping: string | null = null;

  otaProviders: OtaProvider[] = [...ALL_OTA_PROVIDERS];
  otaStatuses: OtaIntegrationStatus[] = ['active', 'inactive', 'error'];

  // Dữ liệu mẫu cho đặt phòng từ OTA (để hiển thị khi test)
  currentOtaBookings: OtaBooking[] = [];
  isLoadingBookings = false;

  constructor(
    private fb: FormBuilder,
    private otaService: OtaService,
    private hotelService: HotelService,
    private roomsService: RoomsService,
    private message: NzMessageService
  ) {
    this.otaForm = this.fb.group({
      hotelId: [null, Validators.required],
      provider: [null, Validators.required],
      status: ['inactive' as OtaIntegrationStatus, Validators.required],
      syncFrequency: [60, Validators.min(5)], // Tần suất đồng bộ (phút)
      credentials: this.fb.group({
        apiKey: [''],
        apiSecret: [''],
        username: [''],
        password: [''],
        hotelCode: [''], 
        propertyCode: ['']
      }),
      settings: this.fb.group({
        autoAcceptBookings: [false],
        updateInventory: [true],
        updatePrices: [true],
        updateAvailability: [true]
      }),
      mappings: this.fb.group({
        roomTypes: this.fb.array([]),
        // ratePlans: this.fb.array([]) // Comment out nếu chưa dùng
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
    this.roomTypeMappings.clear(); // Xóa mapping cũ khi đổi hotel
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
        credentials: { apiKey: '', apiSecret: '', username: '', password: '', hotelCode: '', propertyCode: ''},
        settings: { autoAcceptBookings: false, updateInventory: true, updatePrices: true, updateAvailability: true },
        mappings: { roomTypes: [] } // Reset cả mappings
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
      // TODO: Validate FormArrays or nested FormGroups if any
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
          // Không reset form ở đây nếu muốn giữ lại hotelId đã chọn
          // this.otaForm.reset(); 
          // this.roomTypeMappings.clear();
          // this.editId = null;
        },
        (error: any) => {
          this.isLoading = false;
          this.message.error(error.error?.message || 'Đã có lỗi xảy ra.');
          console.error(error);
        }
      )
    );
  }

  deleteIntegration(id: string): void {
    this.isLoading = true;
    this.subscriptions.add(
      this.otaService.deleteOtaIntegration(id).subscribe(
        (res: ApiResponse) => {
          this.isLoading = false;
          this.message.success(res.message || 'Xóa cấu hình OTA thành công!');
          this.loadOtaIntegrations();
        },
        (error: any) => {
          this.isLoading = false;
          this.message.error(error.error?.message || 'Lỗi khi xóa cấu hình OTA.');
          console.error(error);
        }
      )
    );
  }

  loginProvider(integration: OtaIntegration): void {
    this.isLoading = true;
    this.subscriptions.add(
      this.otaService.loginOtaProvider(integration._id).subscribe(
        (res: ApiResponse<OtaIntegration>) => {
          this.isLoading = false;
          this.message.success(res.message || `Đã "đăng nhập" vào ${integration.provider}`);
          if (res.data) {
            const index = this.otaIntegrations.findIndex(item => item._id === res.data?._id);
            if (index > -1) this.otaIntegrations[index] = res.data;
            this.otaIntegrations = [...this.otaIntegrations]; // Trigger change detection
          }
        },
        (err: any) => {
          this.isLoading = false;
          this.message.error(err.error?.message || `Lỗi khi "đăng nhập" ${integration.provider}.`);
        }
      )
    );
  }

  fetchBookings(integration: OtaIntegration): void {
    this.isLoadingBookings = true;
    this.currentOtaBookings = [];
    this.subscriptions.add(
      this.otaService.getOtaBookings(integration._id).subscribe(
        (res: ApiResponse<OtaBooking[]>) => {
          this.isLoadingBookings = false;
          if (res.data) {
            this.currentOtaBookings = res.data;
            this.message.success(res.message || `Đã tải ${res.data.length} đặt phòng (mẫu) từ ${integration.provider}.`);
            console.log('OTA Bookings:', this.currentOtaBookings);
            // TODO: Pass this.currentOtaBookings to CalendarComponent or a shared service
          } else {
            this.message.info(`Không có đặt phòng (mẫu) nào từ ${integration.provider}.`);
          }
        },
        (err: any) => {
          this.isLoadingBookings = false;
          this.message.error(err.error?.message || `Lỗi khi tải đặt phòng từ ${integration.provider}.`);
        }
      )
    );
  }

  syncData(integration: OtaIntegration): void {
    this.isLoading = true;
    this.subscriptions.add(
      this.otaService.syncOtaData(integration._id).subscribe(
        (res: ApiResponse) => {
          this.isLoading = false;
          this.message.success(res.message || `Đã yêu cầu đồng bộ với ${integration.provider}.`);
          const updatedIntegration = res.data as OtaIntegration; // Giả định data trả về là OtaIntegration đã cập nhật
          const index = this.otaIntegrations.findIndex(item => item._id === integration._id);
          if (index > -1 && updatedIntegration?.lastSync) { 
             this.otaIntegrations[index].lastSync = updatedIntegration.lastSync; 
             this.otaIntegrations[index].status = updatedIntegration.status; // Cập nhật cả status nếu có
             this.otaIntegrations = [...this.otaIntegrations]; // Trigger change detection
          }
        },
        (err: any) => {
          this.isLoading = false;
          this.message.error(err.error?.message || `Lỗi khi đồng bộ với ${integration.provider}.`);
        }
      )
    );
  }

  getHotelName(hotelId: string | Hotel | undefined): string {
    if (!hotelId) return 'N/A';
    if (typeof hotelId === 'string') {
        const hotel = this.hotels.find(h => h._id === hotelId);
        return hotel ? hotel.name : hotelId;
    }
    return hotelId.name; 
  }

  getRoomName(roomId: string | Room | undefined): string {
    if (!roomId) return 'N/A';
    if (typeof roomId === 'string') {
        const room = this.roomsForHotel.find(r => r._id === roomId);
        return room ? `${room.roomNumber} (${room.type})` : roomId;
    }
    return `${roomId.roomNumber} (${roomId.type})`;
  }
} 