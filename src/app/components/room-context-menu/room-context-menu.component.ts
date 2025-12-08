import { Component, Output, EventEmitter, OnInit, Inject } from '@angular/core';
import { NzModalRef, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { Room } from '../../interfaces/rooms';

@Component({
  selector: 'app-room-context-menu',
  templateUrl: './room-context-menu.component.html',
  styleUrls: ['./room-context-menu.component.css']
})
export class RoomContextMenuComponent implements OnInit {
  room!: Room;
  @Output() actionSelected = new EventEmitter<string>();

  isOccupied = false;
  isVacant = false;
  isDirty = false;
  isBooked = false;

  constructor(
    @Inject(NZ_MODAL_DATA) public data: { room: Room },
    private modalRef: NzModalRef
  ) {
    this.room = data.room;
  }

  ngOnInit(): void {
    const status = this.room.status;
    this.isOccupied = status === 'occupied';
    this.isVacant = status === 'vacant';
    this.isDirty = status === 'dirty' || status === 'cleaning';
    this.isBooked = status === 'booked';
  }

  // Kiểm tra trạng thái khách
  get isGuestOut(): boolean {
    return this.room.guestStatus === 'out';
  }

  // Kiểm tra trạng thái khách trong phòng
  get isGuestIn(): boolean {
    return !this.room.guestStatus || this.room.guestStatus === 'in';
  }

  onActionClick(action: string): void {
    this.actionSelected.emit(action);
  }

  getStatusLabel(status: string): string {
    const labels: {[key: string]: string} = {
      'vacant': 'Trống',
      'occupied': 'Đang sử dụng',
      'dirty': 'Cần dọn dẹp',
      'cleaning': 'Đang dọn dẹp', 
      'maintenance': 'Bảo trì',
      'booked': 'Đã đặt'
    };
    return labels[status] || status;
  }
}
