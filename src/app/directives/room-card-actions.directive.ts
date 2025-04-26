import { Directive, HostListener, Input, OnInit, OnDestroy } from '@angular/core';
import { NzModalService } from 'ng-zorro-antd/modal';
import { RoomsService } from '../services/rooms.service';
import { take, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { RoomContentModalComponent } from '../components/room-content-modal/room-content-modal.component';
import { Room } from '../interfaces/rooms';

@Directive({
  selector: '[appRoomCardActions]',
  exportAs: 'appRoomCardActions'
})
export class RoomCardActionsDirective implements OnInit, OnDestroy {
  @Input() room!: Room;
  
  private destroy$ = new Subject<void>();
  
  constructor(
    private modalService: NzModalService,
    private roomsService: RoomsService
  ) {}
  
  ngOnInit(): void {
    // Khởi tạo directive
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  @HostListener('click')
  onClick(): void {
    if (!this.room) {
      console.error('Không có dữ liệu phòng');
      return;
    }
    
    this.openRoomActionModal();
  }
  
  openRoomActionModal(): void {
    this.roomsService.getRoomById(this.room._id)
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe(
        (updatedRoom: Room) => {
          const modalType = this.determineModalType(updatedRoom);
          this.showModal(updatedRoom, modalType);
        },
        (error: unknown) => {
          console.error('Lỗi khi tải dữ liệu phòng:', error);
        }
      );
  }
  
  private determineModalType(room: Room): string {
    switch(room.roomStatus) {
      case 'available':
        return 'checkin';
      case 'occupied':
      case 'active':
        return 'checkout';
      case 'cleaning':
        return 'cleaning';
      case 'maintenance':
        return 'maintenance';
      default:
        return 'details';
    }
  }
  
  private showModal(room: Room, type: string): void {
    this.modalService.create({
      nzTitle: `Phòng ${room.roomNumber} - Tầng ${room.floor}`,
      nzContent: RoomContentModalComponent,
      nzWidth: '800px',
      nzData: {
        roomData: room,
        modalType: type
      },
      nzFooter: null,
      nzMaskClosable: false,
      nzClosable: true
    });
  }
} 