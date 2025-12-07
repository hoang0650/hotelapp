import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { Room, RoomCapacity, RoomPricing, SpecialPrice, RoomRevenue } from '../../interfaces/rooms';
import { Hotel } from '../../interfaces/hotel';
import { RoomsService } from '../../services/rooms.service';
import { HotelService } from '../../services/hotel.service';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'app-room-management',
  templateUrl: './room-management.component.html',
  styleUrls: ['./room-management.component.css']
})
export class RoomManagementComponent implements OnInit {
  roomForm: FormGroup;
  rooms: Room[] = [];
  hotels: Hotel[] = [];
  editId: string | null = null;
  selectedRoom: Room | null = null;
  floors: string[] = [];
  selectedHotelId: string | null = null;

  roomStatusOptions: { label: string, value: Room['status'] }[] = [
    { label: 'Trống', value: 'vacant' },
    { label: 'Có khách', value: 'occupied' },
    { label: 'Đang dọn', value: 'cleaning' },
    { label: 'Bẩn', value: 'dirty' },
    { label: 'Bảo trì', value: 'maintenance' }
  ];

  constructor(
    private fb: FormBuilder, 
    private roomService: RoomsService, 
    private hotelService: HotelService,
    private message: NzMessageService
  ) {
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
        nightlyEndTime: ['06:00'], // Giờ kết thúc tính qua đêm (HH:mm)
        dailyStartTime: ['06:00'], // Giờ bắt đầu tính theo ngày (HH:mm)
        dailyEndTime: ['22:00'], // Giờ kết thúc tính theo ngày (HH:mm)
        autoNightlyHours: [8, [Validators.min(1)]], // Số giờ tự động chuyển sang qua đêm
        gracePeriodMinutes: [15, [Validators.min(0), Validators.max(60)]], // Thời gian miễn phí sau giờ thứ 2 (phút)
        timezone: ['UTC+7'] // Múi giờ (UTC+7 cho Việt Nam)
      }),
      description: [''],
      notes: ['']
    });
  }

  priceConfigId: string | null = null;
  hasPriceConfig: boolean = false;

  ngOnInit(): void {
    this.loadHotels();
    
    // Lắng nghe thay đổi priceConfigId để disable/enable các field giá
    this.roomForm.get('priceConfigId')?.valueChanges.subscribe((priceConfigId) => {
      this.priceConfigId = priceConfigId;
      this.hasPriceConfig = !!priceConfigId && priceConfigId !== '';
      this.updatePriceFieldsDisabledState();
    });
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
      },
      error => {
        console.error('Lỗi khi tải danh sách phòng:', error);
        this.message.error('Không thể tải danh sách phòng');
      }
    );
  }

  loadHotels(): void {
    this.hotelService.getHotels().subscribe(
      data => {
        this.hotels = data;
        if (data && data.length > 0 && !this.selectedHotelId) {
        }
      },
      error => {
        console.error('Lỗi khi tải danh sách khách sạn:', error);
        this.message.error('Không thể tải danh sách khách sạn');
      }
    );
  }

  onHotelChange(hotelId: string | null): void {
    this.selectedHotelId = hotelId;
    this.floors = [];
    this.rooms = [];
    this.roomForm.get('floor')?.reset(1);

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
              nightlyEndTime: (fullRoom as any).priceSettings?.nightlyEndTime || '06:00',
              dailyStartTime: (fullRoom as any).priceSettings?.dailyStartTime || '06:00',
              dailyEndTime: (fullRoom as any).priceSettings?.dailyEndTime || '22:00',
              autoNightlyHours: (fullRoom as any).priceSettings?.autoNightlyHours || 8,
              gracePeriodMinutes: (fullRoom as any).priceSettings?.gracePeriodMinutes || 15,
              timezone: (fullRoom as any).priceSettings?.timezone || 'UTC+7'
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
              nightlyEndTime: (roomToEdit as any).priceSettings?.nightlyEndTime || '06:00',
              dailyStartTime: (roomToEdit as any).priceSettings?.dailyStartTime || '06:00',
              dailyEndTime: (roomToEdit as any).priceSettings?.dailyEndTime || '22:00',
              autoNightlyHours: (roomToEdit as any).priceSettings?.autoNightlyHours || 8,
              gracePeriodMinutes: (roomToEdit as any).priceSettings?.gracePeriodMinutes || 15,
              timezone: (roomToEdit as any).priceSettings?.timezone || 'UTC+7'
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
        nightlyEndTime: '06:00',
        dailyStartTime: '06:00',
        dailyEndTime: '22:00',
        autoNightlyHours: 8,
        gracePeriodMinutes: 15,
        timezone: 'UTC+7'
      }
    });
    
    // Enable lại tất cả các field giá sau khi reset
    this.updatePriceFieldsDisabledState();
  }

  submitForm(): void {
    if (this.roomForm.invalid) {
      this.message.warning('Vui lòng điền đầy đủ thông tin bắt buộc.');
      Object.values(this.roomForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
        if (control instanceof FormGroup) {
          Object.values(control.controls).forEach(innerControl => {
            if (innerControl.invalid) {
              innerControl.markAsDirty();
              innerControl.updateValueAndValidity({ onlySelf: true });
            }
          });
        }
      });
      return;
    }

    const formValue = this.roomForm.value;
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
        nightlyEndTime: formValue.priceSettings.nightlyEndTime || '06:00',
        dailyStartTime: formValue.priceSettings.dailyStartTime || '06:00',
        dailyEndTime: formValue.priceSettings.dailyEndTime || '22:00',
        autoNightlyHours: Number(formValue.priceSettings.autoNightlyHours) || 8,
        gracePeriodMinutes: Number(formValue.priceSettings.gracePeriodMinutes) || 15,
        timezone: formValue.priceSettings.timezone || 'UTC+7'
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
      this.roomService.updateRoom(this.editId, roomData as Room).subscribe(
        (updatedRoom: Room) => {
          console.log('Received updated room:', {
            additionalHourRate: updatedRoom.additionalHourRate,
            firstHourRate: updatedRoom.firstHourRate
          });
          const index = this.rooms.findIndex(r => r._id === this.editId);
          if (index !== -1) {
            this.rooms[index] = updatedRoom;
            this.rooms = [...this.rooms];
          }
          this.message.success('Đã cập nhật phòng thành công');
          this.stopEdit();
        },
        error => {
          console.error('Lỗi khi cập nhật phòng:', error);
          this.message.error(error.error?.message || 'Không thể cập nhật phòng');
        }
      );
    } else {
      const { _id, ...dataToSend } = roomData;
      this.roomService.createRoom(dataToSend as Room).subscribe(
        (newRoom: Room) => {
          this.rooms.push(newRoom);
          this.rooms = [...this.rooms];
          this.message.success('Đã tạo phòng thành công');
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
            this.roomService.getHotelFloors(this.selectedHotelId).subscribe(
              data => {
                this.floors = data.floors.map(f => String(f));
              }
            );
          }
        },
        error => {
          console.error('Lỗi khi tạo phòng:', error);
          this.message.error(error.error?.message || 'Không thể tạo phòng');
        }
      );
    }
  }

  deleteRoom(id: string): void {
    this.roomService.deleteRoom(id).subscribe(
      () => {
        this.rooms = this.rooms.filter(r => r._id !== id);
        this.message.success('Đã xóa phòng thành công');
        if (this.editId === id) {
          this.stopEdit();
        }
      },
      error => {
        console.error('Lỗi khi xóa phòng:', error);
        this.message.error(error.error?.message || 'Không thể xóa phòng');
      }
    );
  }

  filterRoomsByFloor(floor: number | string | null): void {
    if (this.selectedHotelId) {
      if (floor !== null && floor !== '') {
        this.roomService.getRoomsByFloor(this.selectedHotelId, Number(floor)).subscribe(
          data => {
            this.rooms = data;
          },
          error => {
            console.error('Lỗi khi lọc phòng theo tầng:', error);
            this.message.error('Không thể lọc phòng theo tầng');
          }
        );
      } else {
        this.loadRooms(this.selectedHotelId);
      }
    } else {
      this.message.warning('Vui lòng chọn khách sạn trước');
      this.rooms = [];
    }
  }

  getHotelName(hotelId: string): string {
    const hotel = this.hotels.find(h => h._id === hotelId);
    return hotel ? hotel.name : 'Không rõ';
  }

  getRoomStatusLabel(statusValue: Room['status'] | undefined): string {
    if (!statusValue) return 'Không xác định';
    const option = this.roomStatusOptions.find(opt => opt.value === statusValue);
    return option ? option.label : statusValue;
  }
}
