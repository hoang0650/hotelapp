import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { Room, RoomCategory } from '../../interfaces/rooms';
import { RoomsService } from '../../services/rooms.service';
import { RoomCategoryService } from '../../services/room-category.service';
import { HotelService } from '../../services/hotel.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-floor-plan',
  templateUrl: './floor-plan.component.html',
  styleUrls: ['./floor-plan.component.css']
})
export class FloorPlanComponent implements OnInit, OnChanges, OnDestroy {
  @Input() hotelId: string = '';

  rooms: Room[] = [];
  categories: RoomCategory[] = [];
  floors: string[] = [];

  newFloorNumber: number | null = null;
  newRoomData: { [floor: string]: { roomNumber: string; categoryId: string } } = {};
  private subscriptions = new Subscription();

  constructor(
    private roomService: RoomsService,
    private categoryService: RoomCategoryService,
    private hotelService: HotelService,
    private message: NzMessageService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    const resolved =
      this.hotelService.normalizeHotelId(this.hotelId) ||
      this.hotelService.resolvePreferredHotelId();
    if (resolved) {
      this.hotelId = resolved;
      this.loadData();
    }
    this.subscriptions.add(
      this.hotelService.selectedHotelId$.subscribe((hotelId) => {
        const normalized = this.hotelService.normalizeHotelId(hotelId);
        if (normalized && !this.hotelService.sameHotelId(normalized, this.hotelId)) {
          this.hotelId = normalized;
          this.loadData();
        }
      })
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['hotelId']) {
      const normalized = this.hotelService.normalizeHotelId(this.hotelId);
      if (normalized) {
        this.hotelId = normalized;
        this.loadData();
      }
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadData(): void {
    this.loadRooms();
    this.loadCategories();
    this.loadFloors();
  }

  loadRooms(): void {
    this.roomService.getRooms({ hotelId: this.hotelId }).subscribe(
      (data) => {
        this.rooms = data;
      },
      (error) => {
        console.error('Error loading rooms:', error);
        this.message.error('Lỗi khi tải danh sách phòng');
      }
    );
  }

  loadCategories(): void {
    this.categoryService.getCategories(this.hotelId).subscribe(
      (res: any) => {
        this.categories = res.data || res || [];
      },
      (error) => {
        console.error('Error loading categories:', error);
      }
    );
  }

  loadFloors(): void {
    this.roomService.getHotelFloors(this.hotelId).subscribe(
      (data) => {
        this.floors = data.floors.map(f => String(f)).sort((a, b) => Number(a) - Number(b));
        // Initialize newRoomData for each floor
        this.floors.forEach(floor => {
          if (!this.newRoomData[floor]) {
            this.newRoomData[floor] = { roomNumber: '', categoryId: '' };
          }
        });
      },
      (error) => {
        console.error('Error loading floors:', error);
      }
    );
  }

  getRoomsByFloor(floor: string): Room[] {
    return this.rooms.filter(r => String(r.floor) === String(floor));
  }

  getCategoryName(categoryIdOrType: string | undefined): string {
    if (!categoryIdOrType) return '';
    const cat = this.categories.find(c => c._id === categoryIdOrType);
    if (cat) return cat.name;
    return categoryIdOrType; // Fallback to type string
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'vacant': return 'green';
      case 'occupied': return 'red';
      case 'cleaning': return 'blue';
      case 'dirty': return 'orange';
      case 'maintenance': return 'purple';
      case 'booked': return 'cyan';
      default: return 'default';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'vacant': return 'Trống';
      case 'occupied': return 'Đang ở';
      case 'cleaning': return 'Dọn dẹp';
      case 'dirty': return 'Bẩn';
      case 'maintenance': return 'Bảo trì';
      case 'booked': return 'Đã đặt';
      default: return status;
    }
  }

  addFloor(): void {
    if (this.newFloorNumber === null || this.newFloorNumber === undefined) return;

    const floorStr = String(this.newFloorNumber);
    if (this.floors.includes(floorStr)) {
      this.message.warning(`Tầng ${floorStr} đã tồn tại`);
      return;
    }

    this.floors.push(floorStr);
    this.floors.sort((a, b) => Number(a) - Number(b));
    this.newRoomData[floorStr] = { roomNumber: '', categoryId: '' };
    this.message.success(`Đã thêm tầng ${floorStr}`);
    this.newFloorNumber = null;
  }

  addRoom(floor: string): void {
    const roomData = this.newRoomData[floor];
    if (!roomData || !roomData.roomNumber) {
      this.message.warning('Vui lòng nhập số phòng');
      return;
    }

    // Find selected category to copy pricing data
    const selectedCategory = this.categories.find(c => c._id === roomData.categoryId);

    const newRoom: any = {
      hotelId: this.hotelId,
      roomNumber: roomData.roomNumber,
      floor: floor,
      type: selectedCategory ? selectedCategory.name : 'Standard',
      status: 'vacant' as const,
      capacity: selectedCategory?.capacity || { adults: 2, children: 0 },
      pricing: selectedCategory?.pricing || { hourly: 0, daily: 0, nightly: 0, weekly: 0, monthly: 0, currency: 'VND' },
      firstHourRate: selectedCategory?.firstHourRate || 0,
      additionalHourRate: selectedCategory?.additionalHourRate || 0,
      amenities: selectedCategory?.amenities || [],
      images: []
    };
    if (selectedCategory && selectedCategory._id) {
      newRoom.roomCategoryId = selectedCategory._id;
    }

    this.roomService.createRoom(newRoom as Room).subscribe(
      (created) => {
        this.rooms.push(created);
        this.rooms = [...this.rooms];
        this.message.success(`Đã thêm phòng ${roomData.roomNumber} vào tầng ${floor}`);
        // Reset form
        this.newRoomData[floor] = { roomNumber: '', categoryId: roomData.categoryId };
        // Reload floors in case it's a new floor
        this.loadFloors();
      },
      (error) => {
        console.error('Error creating room:', error);
        this.message.error(error.error?.message || 'Lỗi khi tạo phòng');
      }
    );
  }

  deleteRoom(roomId: string): void {
    this.roomService.deleteRoom(roomId).subscribe(
      () => {
        this.rooms = this.rooms.filter(r => r._id !== roomId);
        this.message.success('Đã xóa phòng');
      },
      (error) => {
        console.error('Error deleting room:', error);
        this.message.error(error.error?.message || 'Lỗi khi xóa phòng');
      }
    );
  }

  trackByFloor(index: number, floor: string): string {
    return floor;
  }
}
