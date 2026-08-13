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
  isLoading = false;

  newFloorNumber: number | null = null;
  newRoomData: { [floor: string]: { roomNumber: string; categoryId: string } } = {};
  private subscriptions = new Subscription();
  private loadedHotelId: string | null = null;
  private loadGen = 0;

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
    if (changes['hotelId'] && !changes['hotelId'].firstChange) {
      const normalized = this.hotelService.normalizeHotelId(this.hotelId);
      if (normalized && !this.hotelService.sameHotelId(normalized, this.loadedHotelId)) {
        this.hotelId = normalized;
        this.loadData();
      }
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadData(): void {
    const id = this.hotelService.normalizeHotelId(this.hotelId);
    if (!id) return;
    if (this.hotelService.sameHotelId(id, this.loadedHotelId) && this.rooms.length > 0) {
      return;
    }

    this.hotelId = id;
    this.loadedHotelId = id;
    const gen = ++this.loadGen;

    // Hiện cache ngay nếu có
    const cachedRooms = this.roomService.getCachedRooms(id);
    if (cachedRooms?.length) {
      this.rooms = cachedRooms;
      this.deriveFloorsFromRooms();
    }
    const cachedCats = this.categoryService.getCachedCategories(id);
    if (cachedCats?.length) {
      this.categories = cachedCats;
    }

    this.isLoading = !cachedRooms?.length;
    this.loadRooms(id, gen);
    this.loadCategories(id, gen);
    this.loadFloors(id, gen);
  }

  loadRooms(hotelId: string = this.hotelId, gen: number = this.loadGen): void {
    const id = this.hotelService.normalizeHotelId(hotelId);
    if (!id) return;

    this.roomService.getRooms({ hotelId: id, lite: true }).subscribe(
      (data) => {
        if (gen !== this.loadGen) return;
        this.rooms = data || [];
        this.isLoading = false;
        if (!this.floors.length) {
          this.deriveFloorsFromRooms();
        }
      },
      (error) => {
        if (gen !== this.loadGen) return;
        this.isLoading = false;
        console.error('Error loading rooms:', error);
        this.message.error(this.translate.instant('FLOOR_PLAN.MESSAGES.LOAD_ROOMS_ERROR'));
      }
    );
  }

  loadCategories(hotelId: string = this.hotelId, gen: number = this.loadGen): void {
    const id = this.hotelService.normalizeHotelId(hotelId);
    if (!id) return;

    this.categoryService.getCategories(id).subscribe(
      (res: any) => {
        if (gen !== this.loadGen) return;
        this.categories = Array.isArray(res) ? res : (res?.data || []);
      },
      (error) => {
        console.error('Error loading categories:', error);
      }
    );
  }

  loadFloors(hotelId: string = this.hotelId, gen: number = this.loadGen): void {
    const id = this.hotelService.normalizeHotelId(hotelId);
    if (!id) return;

    this.roomService.getHotelFloors(id).subscribe(
      (data) => {
        if (gen !== this.loadGen) return;
        this.floors = (data?.floors || []).map((f: any) => String(f)).sort((a, b) => Number(a) - Number(b));
        this.floors.forEach(floor => {
          if (!this.newRoomData[floor]) {
            this.newRoomData[floor] = { roomNumber: '', categoryId: '' };
          }
        });
      },
      (error) => {
        console.error('Error loading floors:', error);
        this.deriveFloorsFromRooms();
      }
    );
  }

  private deriveFloorsFromRooms(): void {
    const set = new Set<string>();
    (this.rooms || []).forEach((r) => {
      if (r?.floor !== undefined && r?.floor !== null) {
        set.add(String(r.floor));
      }
    });
    if (set.size > 0 && this.floors.length === 0) {
      this.floors = Array.from(set).sort((a, b) => Number(a) - Number(b));
      this.floors.forEach(floor => {
        if (!this.newRoomData[floor]) {
          this.newRoomData[floor] = { roomNumber: '', categoryId: '' };
        }
      });
    }
  }

  getRoomsByFloor(floor: string): Room[] {
    return this.rooms.filter(r => String(r.floor) === String(floor));
  }

  getCategoryName(categoryIdOrType: string | undefined): string {
    if (!categoryIdOrType) return '';
    const cat = this.categories.find(c => c._id === categoryIdOrType);
    if (cat) return cat.name;
    return categoryIdOrType;
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
    const keyMap: Record<string, string> = {
      vacant: 'FLOOR_PLAN.STATUS.VACANT',
      occupied: 'FLOOR_PLAN.STATUS.OCCUPIED',
      cleaning: 'FLOOR_PLAN.STATUS.CLEANING',
      dirty: 'FLOOR_PLAN.STATUS.DIRTY',
      maintenance: 'FLOOR_PLAN.STATUS.MAINTENANCE',
      booked: 'FLOOR_PLAN.STATUS.BOOKED'
    };
    return keyMap[status] ? this.translate.instant(keyMap[status]) : status;
  }

  addFloor(): void {
    if (this.newFloorNumber === null || this.newFloorNumber === undefined) return;

    const floorStr = String(this.newFloorNumber);
    if (this.floors.includes(floorStr)) {
      this.message.warning(this.translate.instant('FLOOR_PLAN.MESSAGES.FLOOR_EXISTS', { floor: floorStr }));
      return;
    }

    this.floors.push(floorStr);
    this.floors.sort((a, b) => Number(a) - Number(b));
    this.newRoomData[floorStr] = { roomNumber: '', categoryId: '' };
    this.message.success(this.translate.instant('FLOOR_PLAN.MESSAGES.FLOOR_ADDED', { floor: floorStr }));
    this.newFloorNumber = null;
  }

  addRoom(floor: string): void {
    const roomData = this.newRoomData[floor];
    if (!roomData || !roomData.roomNumber) {
      this.message.warning(this.translate.instant('FLOOR_PLAN.MESSAGES.ROOM_NUMBER_REQUIRED'));
      return;
    }

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
        this.message.success(this.translate.instant('FLOOR_PLAN.MESSAGES.ROOM_ADDED', {
          roomNumber: roomData.roomNumber,
          floor
        }));
        this.newRoomData[floor] = { roomNumber: '', categoryId: roomData.categoryId };
        this.loadFloors();
      },
      (error) => {
        console.error('Error creating room:', error);
        this.message.error(error.error?.message || this.translate.instant('FLOOR_PLAN.MESSAGES.CREATE_ROOM_ERROR'));
      }
    );
  }

  deleteRoom(roomId: string): void {
    this.roomService.deleteRoom(roomId).subscribe(
      () => {
        this.rooms = this.rooms.filter(r => r._id !== roomId);
        this.message.success(this.translate.instant('FLOOR_PLAN.MESSAGES.ROOM_DELETED'));
      },
      (error) => {
        console.error('Error deleting room:', error);
        this.message.error(error.error?.message || this.translate.instant('FLOOR_PLAN.MESSAGES.DELETE_ROOM_ERROR'));
      }
    );
  }

  trackByFloor(index: number, floor: string): string {
    return floor;
  }
}
