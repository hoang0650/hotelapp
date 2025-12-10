import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import { TuyaService, TuyaDevice } from '../../services/tuya.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { interval, Subscription, forkJoin } from 'rxjs';
import { RoomsService } from '../../services/rooms.service';
import { HotelService } from '../../services/hotel.service';
import { TranslateService } from '@ngx-translate/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-tuya-switch',
  templateUrl: './tuya-switch.component.html',
  styleUrls: ['./tuya-switch.component.css']
})
export class TuyaSwitchComponent implements OnInit, OnDestroy {
  @Input() deviceId?: string;
  @Input() roomId?: string;
  @Input() roomNumber?: string;
  @Input() hotelId?: string;
  @Input() autoRefresh: boolean = true; // Tự động làm mới trạng thái
  @Input() refreshInterval: number = 5000; // 5 giây
  @Input() showByRoom: boolean = false; // Hiển thị theo phòng
  @Input() compactMode: boolean = false; // Chế độ compact (dùng trong room list)

  devices: TuyaDevice[] = [];
  devicesByRoom: { [roomId: string]: TuyaDevice[] } = {}; // Nhóm thiết bị theo phòng
  rooms: any[] = []; // Danh sách phòng có công tắc
  allRooms: any[] = []; // Tất cả phòng để chọn trong modal
  allHotels: any[] = []; // Tất cả khách sạn để chọn trong modal
  isLoading: boolean = false;
  isToggling: { [deviceId: string]: boolean } = {}; // Track trạng thái toggle cho từng thiết bị
  private refreshSubscription?: Subscription;
  
  // Modal state
  isModalVisible: boolean = false;
  isEditMode: boolean = false;
  currentDevice?: TuyaDevice;
  deviceForm: FormGroup;

  constructor(
    private tuyaService: TuyaService,
    private message: NzMessageService,
    private modal: NzModalService,
    private roomsService: RoomsService,
    private hotelService: HotelService,
    private translate: TranslateService,
    private fb: FormBuilder
  ) {
    this.deviceForm = this.fb.group({
      deviceId: ['', [Validators.required]],
      name: ['', [Validators.required]],
      hotelId: ['', [Validators.required]],
      roomId: ['']
    });
    
    // Khi chọn khách sạn, load danh sách phòng
    this.deviceForm.get('hotelId')?.valueChanges.subscribe(hotelId => {
      if (hotelId) {
        this.loadRoomsByHotel(hotelId);
      } else {
        this.allRooms = [];
        this.deviceForm.patchValue({ roomId: '' }, { emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    // Nếu có hotelId hoặc showByRoom, tải theo khách sạn
    if (this.hotelId || this.showByRoom) {
      this.loadDevicesByHotel();
      this.loadAllRooms();
    } else {
      this.loadDevices();
    }
    
    if (this.autoRefresh) {
      this.startAutoRefresh();
    }
  }
  
  /**
   * Tải tất cả phòng để chọn trong modal
   */
  loadAllRooms(): void {
    const hotelId = this.hotelId || localStorage.getItem('selectedHotelId') || undefined;
    if (!hotelId) return;
    
    this.loadRoomsByHotel(hotelId);
  }
  
  /**
   * Tải phòng theo khách sạn
   */
  loadRoomsByHotel(hotelId: string): void {
    this.roomsService.getRooms({ hotelId }).subscribe({
      next: (rooms) => {
        this.allRooms = rooms;
      },
      error: (error) => {
        console.error('Error loading rooms:', error);
        this.allRooms = [];
      }
    });
  }
  
  /**
   * Tải danh sách khách sạn
   */
  loadAllHotels(): void {
    this.hotelService.getHotels().subscribe({
      next: (hotels) => {
        this.allHotels = hotels;
      },
      error: (error) => {
        console.error('Error loading hotels:', error);
        this.allHotels = [];
      }
    });
  }

  ngOnDestroy(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
  }

  /**
   * Tải danh sách thiết bị
   */
  loadDevices(): void {
    this.isLoading = true;
    const roomId = this.deviceId ? undefined : (this.roomId ? this.roomId : undefined);
    const hotelId = this.hotelId || localStorage.getItem('selectedHotelId') || undefined;
    
    this.tuyaService.getDevices(roomId, hotelId).subscribe({
      next: (response) => {
        this.devices = response.data || [];
        
        // Nếu có deviceId cụ thể, chỉ hiển thị thiết bị đó
        if (this.deviceId) {
          this.devices = this.devices.filter(d => d.id === this.deviceId);
        }
        
        // Nếu hiển thị theo phòng, nhóm thiết bị theo roomId
        if (this.showByRoom) {
          this.groupDevicesByRoom();
        }
        
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading devices:', error);
        this.message.error('Không thể tải danh sách thiết bị: ' + (error.error?.message || error.message));
        this.isLoading = false;
      }
    });
  }

  /**
   * Nhóm thiết bị theo phòng
   */
  groupDevicesByRoom(): void {
    this.devicesByRoom = {};
    this.rooms = [];
    
    this.devices.forEach(device => {
      const roomId = device.roomId || 'no-room';
      if (!this.devicesByRoom[roomId]) {
        this.devicesByRoom[roomId] = [];
        // Lấy thông tin phòng nếu có
        if (device.roomId && device.roomNumber) {
          this.rooms.push({
            roomId: device.roomId,
            roomNumber: device.roomNumber
          });
        }
      }
      this.devicesByRoom[roomId].push(device);
    });
  }

  /**
   * Tải thiết bị theo khách sạn
   */
  loadDevicesByHotel(): void {
    if (!this.hotelId) {
      // Lấy từ localStorage nếu không có input
      this.hotelId = localStorage.getItem('selectedHotelId') || localStorage.getItem('hotelId') || undefined;
    }
    
    if (!this.hotelId) {
      this.message.warning('Chưa chọn khách sạn');
      return;
    }
    
    this.isLoading = true;
    
    // Lấy danh sách phòng của khách sạn
    this.roomsService.getRooms({ hotelId: this.hotelId }).subscribe({
      next: (rooms) => {
        // Lấy công tắc cho tất cả phòng
        const roomIds = rooms.map(r => r._id).filter(id => id);
        
        if (roomIds.length === 0) {
          this.isLoading = false;
          return;
        }
        
        // Lấy thiết bị cho từng phòng
        const deviceRequests = roomIds.map(roomId => 
          this.tuyaService.getDevices(roomId, this.hotelId)
        );
        
        forkJoin(deviceRequests).subscribe({
          next: (responses) => {
            this.devices = [];
            responses.forEach((response, index) => {
              const roomDevices = response.data || [];
              roomDevices.forEach(device => {
                device.roomId = roomIds[index];
                device.roomNumber = rooms.find(r => r._id === roomIds[index])?.roomNumber;
              });
              this.devices.push(...roomDevices);
            });
            
            if (this.showByRoom) {
              this.groupDevicesByRoom();
            }
            
            this.isLoading = false;
          },
          error: (error) => {
            console.error('Error loading devices by hotel:', error);
            this.message.error('Không thể tải thiết bị: ' + (error.error?.message || error.message));
            this.isLoading = false;
          }
        });
      },
      error: (error) => {
        console.error('Error loading rooms:', error);
        this.message.error('Không thể tải danh sách phòng: ' + (error.error?.message || error.message));
        this.isLoading = false;
      }
    });
  }

  /**
   * Bật công tắc
   */
  turnOn(device: TuyaDevice): void {
    if (this.isToggling[device.id]) return;
    
    this.isToggling[device.id] = true;
    this.tuyaService.turnOn(device.id).subscribe({
      next: (response) => {
        if (response.success) {
          this.message.success(`Đã bật ${device.name}`);
          // Cập nhật trạng thái local
          const deviceIndex = this.devices.findIndex(d => d.id === device.id);
          if (deviceIndex !== -1) {
            this.devices[deviceIndex].state = true;
          }
        } else {
          this.message.error(response.message || 'Không thể bật công tắc');
        }
        this.isToggling[device.id] = false;
      },
      error: (error) => {
        console.error('Error turning on device:', error);
        this.message.error('Lỗi khi bật công tắc: ' + (error.error?.message || error.message));
        this.isToggling[device.id] = false;
      }
    });
  }

  /**
   * Tắt công tắc
   */
  turnOff(device: TuyaDevice): void {
    if (this.isToggling[device.id]) return;
    
    this.isToggling[device.id] = true;
    this.tuyaService.turnOff(device.id).subscribe({
      next: (response) => {
        if (response.success) {
          this.message.success(`Đã tắt ${device.name}`);
          // Cập nhật trạng thái local
          const deviceIndex = this.devices.findIndex(d => d.id === device.id);
          if (deviceIndex !== -1) {
            this.devices[deviceIndex].state = false;
          }
        } else {
          this.message.error(response.message || 'Không thể tắt công tắc');
        }
        this.isToggling[device.id] = false;
      },
      error: (error) => {
        console.error('Error turning off device:', error);
        this.message.error('Lỗi khi tắt công tắc: ' + (error.error?.message || error.message));
        this.isToggling[device.id] = false;
      }
    });
  }

  /**
   * Toggle công tắc (bật/tắt)
   */
  toggle(device: TuyaDevice): void {
    if (this.isToggling[device.id]) return;
    
    this.isToggling[device.id] = true;
    this.tuyaService.toggle(device.id).subscribe({
      next: (response) => {
        if (response.success) {
          const newState = response.data?.state ?? !device.state;
          this.message.success(`${newState ? 'Đã bật' : 'Đã tắt'} ${device.name}`);
          // Cập nhật trạng thái local
          const deviceIndex = this.devices.findIndex(d => d.id === device.id);
          if (deviceIndex !== -1) {
            this.devices[deviceIndex].state = newState;
          }
        } else {
          this.message.error(response.message || 'Không thể chuyển đổi công tắc');
        }
        this.isToggling[device.id] = false;
      },
      error: (error) => {
        console.error('Error toggling device:', error);
        this.message.error('Lỗi khi chuyển đổi công tắc: ' + (error.error?.message || error.message));
        this.isToggling[device.id] = false;
      }
    });
  }


  /**
   * Kiểm tra xem có thiết bị nào đang toggle không
   */
  isAnyDeviceToggling(): boolean {
    return Object.values(this.isToggling).some(toggling => toggling);
  }

  /**
   * Lấy trạng thái toggle của một thiết bị
   */
  isDeviceToggling(deviceId: string): boolean {
    return this.isToggling[deviceId] || false;
  }

  /**
   * Làm mới trạng thái thiết bị
   */
  refreshStatus(device: TuyaDevice): void {
    this.tuyaService.getStatus(device.id).subscribe({
      next: (response) => {
        const deviceIndex = this.devices.findIndex(d => d.id === device.id);
        if (deviceIndex !== -1) {
          this.devices[deviceIndex].state = response.data?.state ?? false;
          this.devices[deviceIndex].online = response.data?.online ?? false;
        }
      },
      error: (error) => {
        console.error('Error refreshing status:', error);
      }
    });
  }

  /**
   * Bắt đầu tự động làm mới
   */
  startAutoRefresh(): void {
    this.refreshSubscription = interval(this.refreshInterval).subscribe(() => {
      // Làm mới trạng thái tất cả thiết bị
      this.devices.forEach(device => {
        this.refreshStatus(device);
      });
    });
  }

  /**
   * Dừng tự động làm mới
   */
  stopAutoRefresh(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
      this.refreshSubscription = undefined;
    }
  }
  
  /**
   * Mở modal thêm thiết bị
   */
  openAddDeviceModal(): void {
    this.isEditMode = false;
    this.currentDevice = undefined;
    this.deviceForm.reset();
    this.allRooms = [];
    this.loadAllHotels();
    
    // Nếu có hotelId mặc định, set vào form
    const defaultHotelId = this.hotelId || localStorage.getItem('selectedHotelId') || undefined;
    if (defaultHotelId) {
      this.deviceForm.patchValue({ hotelId: defaultHotelId });
      this.loadRoomsByHotel(defaultHotelId);
    }
    
    this.isModalVisible = true;
  }
  
  /**
   * Mở modal sửa thiết bị
   */
  openEditDeviceModal(device: TuyaDevice): void {
    this.isEditMode = true;
    this.currentDevice = device;
    this.loadAllHotels();
    
    // Lấy hotelId từ device
    const deviceHotelId = device.hotelId || this.hotelId || localStorage.getItem('selectedHotelId') || '';
    
    this.deviceForm.patchValue({
      deviceId: device.id,
      name: device.name,
      hotelId: deviceHotelId,
      roomId: device.roomId || ''
    });
    
    // Load phòng nếu có hotelId
    if (deviceHotelId) {
      this.loadRoomsByHotel(deviceHotelId);
    }
    
    this.isModalVisible = true;
  }
  
  /**
   * Đóng modal
   */
  closeModal(): void {
    this.isModalVisible = false;
    this.deviceForm.reset();
    this.currentDevice = undefined;
    this.allRooms = [];
  }
  
  /**
   * Lưu thiết bị (thêm hoặc sửa)
   */
  saveDevice(): void {
    if (this.deviceForm.invalid) {
      this.translate.get('TUYA.REQUIRED_FIELDS').subscribe(msg => {
        this.message.warning(msg);
      });
      return;
    }
    
    const formValue = this.deviceForm.value;
    const selectedRoom = this.allRooms.find(r => r._id === formValue.roomId);
    
    const deviceData = {
      deviceId: formValue.deviceId,
      name: formValue.name,
      hotelId: formValue.hotelId,
      roomId: formValue.roomId || undefined,
      roomNumber: selectedRoom?.roomNumber || undefined
    };
    
    if (this.isEditMode && this.currentDevice) {
      // Cập nhật thiết bị
      this.tuyaService.updateDevice(this.currentDevice.id, deviceData).subscribe({
        next: (response) => {
          this.translate.get('TUYA.DEVICE_UPDATED').subscribe(msg => {
            this.message.success(msg);
          });
          this.closeModal();
          this.loadDevices();
        },
        error: (error) => {
          this.translate.get('TUYA.ERROR_UPDATING').subscribe(msg => {
            this.message.error(msg + ': ' + (error.error?.message || error.message));
          });
        }
      });
    } else {
      // Thêm thiết bị mới
      this.tuyaService.addDevice(deviceData).subscribe({
        next: (response) => {
          this.translate.get('TUYA.DEVICE_ADDED').subscribe(msg => {
            this.message.success(msg);
          });
          this.closeModal();
          this.loadDevices();
        },
        error: (error) => {
          this.translate.get('TUYA.ERROR_ADDING').subscribe(msg => {
            this.message.error(msg + ': ' + (error.error?.message || error.message));
          });
        }
      });
    }
  }
  
  /**
   * Xóa thiết bị
   */
  deleteDevice(device: TuyaDevice): void {
    this.translate.get(['TUYA.CONFIRM_DELETE', 'TUYA.DELETE', 'TUYA.CANCEL']).subscribe(translations => {
      this.modal.confirm({
        nzTitle: translations['TUYA.CONFIRM_DELETE'],
        nzContent: `<p>${device.name} (${device.id})</p>`,
        nzOkText: translations['TUYA.DELETE'],
        nzOkType: 'primary',
        nzOkDanger: true,
        nzCancelText: translations['TUYA.CANCEL'],
        nzOnOk: () => {
          this.tuyaService.deleteDevice(device.id).subscribe({
            next: () => {
              this.translate.get('TUYA.DEVICE_DELETED').subscribe(msg => {
                this.message.success(msg);
              });
              this.loadDevices();
            },
            error: (error) => {
              this.translate.get('TUYA.ERROR_DELETING').subscribe(msg => {
                this.message.error(msg + ': ' + (error.error?.message || error.message));
              });
            }
          });
        }
      });
    });
  }
  
  /**
   * Bật tất cả thiết bị trong phòng
   */
  turnOnByRoom(roomId: string): void {
    this.tuyaService.turnOnByRoom(roomId).subscribe({
      next: () => {
        this.translate.get('TUYA.TURN_ON_ALL').subscribe(msg => {
          this.message.success(msg);
        });
        setTimeout(() => this.loadDevices(), 1000);
      },
      error: (err) => {
        console.error('Error turning on devices by room:', err);
        this.message.error('Lỗi khi bật thiết bị: ' + (err.error?.message || err.message));
      }
    });
  }
  
  /**
   * Tắt tất cả thiết bị trong phòng
   */
  turnOffByRoom(roomId: string): void {
    this.tuyaService.turnOffByRoom(roomId).subscribe({
      next: () => {
        this.translate.get('TUYA.TURN_OFF_ALL').subscribe(msg => {
          this.message.success(msg);
        });
        setTimeout(() => this.loadDevices(), 1000);
      },
      error: (err) => {
        console.error('Error turning off devices by room:', err);
        this.message.error('Lỗi khi tắt thiết bị: ' + (err.error?.message || err.message));
      }
    });
  }
}

