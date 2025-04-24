import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Room } from '../../interfaces/rooms';
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
  floors: number[] = [];
  selectedHotelId: string | null = null;

  constructor(
    private fb: FormBuilder, 
    private roomService: RoomsService, 
    private hotelService: HotelService,
    private message: NzMessageService
  ) {
    this.roomForm = this.fb.group({
      hotelId: [null, Validators.required],
      roomNumber: [0, Validators.required],
      floor: [1, Validators.required],
      roomType: ['', Validators.required],
      roomStatus: ['available', Validators.required],
      hourlyRate: [0, Validators.required],
      firstHourRate: [0],
      additionalHourRate: [0],
      dailyRate: [0, Validators.required],
      nightlyRate: [0, Validators.required],
      maxcount: [0, Validators.required],
      description: ['', Validators.required],
      events: [[]],
      bookingHistory: [[]],
      rateType: ['hourly']
    });
  }

  ngOnInit(): void {
    this.loadRooms();
    this.loadHotels();
  }

  loadRooms(): void {
    this.roomService.getRooms().subscribe(
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
      },
      error => {
        console.error('Lỗi khi tải danh sách khách sạn:', error);
        this.message.error('Không thể tải danh sách khách sạn');
      }
    );
  }

  onHotelChange(hotelId: string): void {
    this.selectedHotelId = hotelId;
    if (hotelId) {
      this.roomService.getHotelFloors(hotelId).subscribe(
        data => {
          this.floors = data.floors;
          // Nếu không có tầng nào, mặc định tạo tầng 1
          if (this.floors.length === 0) {
            this.floors = [1];
          }
        },
        error => {
          console.error('Lỗi khi tải danh sách tầng:', error);
          this.message.error('Không thể tải danh sách tầng');
          // Mặc định tạo các tầng từ 1-5 nếu lỗi
          this.floors = [1, 2, 3, 4, 5];
        }
      );
    }
  }

  startEdit(id: string): void {
    this.editId = id;
    const roomToEdit = this.rooms.find(r => r._id === id);
    if (roomToEdit) {
      this.selectedRoom = { ...roomToEdit };
      this.roomForm.patchValue(roomToEdit);
      this.selectedHotelId = roomToEdit.hotelId;
      
      // Tải danh sách tầng khi bắt đầu chỉnh sửa
      if (roomToEdit.hotelId) {
        this.onHotelChange(roomToEdit.hotelId);
      }
    }
  }

  stopEdit(): void {
    this.editId = null;
    this.selectedRoom = null;
    this.roomForm.reset({
      roomStatus: 'available',
      floor: 1,
      rateType: 'hourly'
    });
    this.selectedHotelId = null;
  }

  createRoom(): void {
    if (this.roomForm.valid) {
      const newRoom: Room = this.roomForm.value;
      this.roomService.createRoom(newRoom).subscribe(
        (data: Room) => {
          this.rooms.push(data);
          this.message.success('Đã tạo phòng thành công');
          this.roomForm.reset({
            roomStatus: 'available',
            floor: 1,
            rateType: 'hourly'
          });
          this.selectedHotelId = null;
        },
        error => {
          console.error('Lỗi khi tạo phòng:', error);
          this.message.error('Không thể tạo phòng');
        }
      );
    } else {
      this.message.warning('Vui lòng điền đầy đủ thông tin phòng');
      Object.values(this.roomForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity();
        }
      });
    }
  }

  updateRoom(): void {
    if (this.selectedRoom && this.roomForm.valid) {
      this.roomService.updateRoom(this.selectedRoom._id, this.roomForm.value).subscribe(
        () => {
          this.loadRooms(); // Tải lại danh sách phòng
          this.message.success('Đã cập nhật phòng thành công');
          this.stopEdit();
        },
        error => {
          console.error('Lỗi khi cập nhật phòng:', error);
          this.message.error('Không thể cập nhật phòng');
        }
      );
    } else {
      this.message.warning('Vui lòng điền đầy đủ thông tin phòng');
      Object.values(this.roomForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity();
        }
      });
    }
  }

  deleteRoom(id: string): void {
    this.roomService.deleteRoom(id).subscribe(
      () => {
        this.rooms = this.rooms.filter(r => r._id !== id);
        this.message.success('Đã xóa phòng thành công');
      },
      error => {
        console.error('Lỗi khi xóa phòng:', error);
        this.message.error('Không thể xóa phòng');
      }
    );
  }

  // Lọc phòng theo tầng
  filterRoomsByFloor(floor: number): void {
    if (this.selectedHotelId) {
      this.roomService.getRoomsByFloor(this.selectedHotelId, floor).subscribe(
        data => {
          this.rooms = data;
        },
        error => {
          console.error('Lỗi khi lọc phòng theo tầng:', error);
          this.message.error('Không thể lọc phòng theo tầng');
        }
      );
    } else {
      this.message.warning('Vui lòng chọn khách sạn trước');
    }
  }
}
