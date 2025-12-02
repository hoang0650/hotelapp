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
      additionalHourRate: [0, Validators.min(0)],

      priceConfigId: [null],
      description: [''],
      notes: ['']
    });
  }

  ngOnInit(): void {
    this.loadHotels();
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
        firstHourRate: roomToEdit.firstHourRate || roomToEdit.pricing?.hourly || 0,
        additionalHourRate: roomToEdit.additionalHourRate || 0,
        priceConfigId: roomToEdit.priceConfigId,
        description: roomToEdit.description,
        notes: roomToEdit.notes
      });
    }
  }

  stopEdit(): void {
    this.editId = null;
    this.selectedRoom = null;
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
    const roomData: Partial<Room> = {
      ...formValue,
      hotelId: formValue.hotelId,
      roomNumber: String(formValue.roomNumber),
      floor: String(formValue.floor),
      type: formValue.type,
      status: formValue.status,
      capacity: {
        adults: Number(formValue.capacity?.adults),
        children: Number(formValue.capacity?.children)
      },
      amenities: formValue.amenities,
      images: formValue.images,
      pricing: {
        hourly: Number(formValue.pricing?.hourly),
        daily: Number(formValue.pricing?.daily),
        nightly: Number(formValue.pricing?.nightly),
        weekly: Number(formValue.pricing?.weekly),
        monthly: Number(formValue.pricing?.monthly),
        currency: formValue.pricing?.currency
      },
      firstHourRate: Number(formValue.firstHourRate),
      additionalHourRate: Number(formValue.additionalHourRate),
      priceConfigId: formValue.priceConfigId,
      description: formValue.description,
      notes: formValue.notes
    };

    if (this.editId && this.selectedRoom) {
      this.roomService.updateRoom(this.editId, { ...this.selectedRoom, ...roomData } as Room).subscribe(
        (updatedRoom: Room) => {
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
