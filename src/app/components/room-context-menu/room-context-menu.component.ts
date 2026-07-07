import { Component, Output, EventEmitter, OnInit, Inject, ChangeDetectionStrategy } from '@angular/core';
import { NzModalRef, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { Room } from '../../interfaces/rooms';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-room-context-menu',
  templateUrl: './room-context-menu.component.html',
  styleUrls: ['./room-context-menu.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomContextMenuComponent implements OnInit {
  room!: Room;
  @Output() actionSelected = new EventEmitter<string>();

  isOccupied = false;
  isVacant = false;
  isDirty = false;
  isBooked = false;
  guestOut = false;
  guestIn = true;
  private statusLabels: Record<string, string> = {};

  constructor(
    @Inject(NZ_MODAL_DATA) public data: { room: Room },
    private modalRef: NzModalRef,
    private translate: TranslateService
  ) {
    this.room = data.room;
  }

  ngOnInit(): void {
    const status = this.room.status;
    this.isOccupied = status === 'occupied';
    this.isVacant = status === 'vacant';
    this.isDirty = status === 'dirty' || status === 'cleaning';
    this.isBooked = status === 'booked';
    this.guestOut = this.room.guestStatus === 'out';
    this.guestIn = !this.room.guestStatus || this.room.guestStatus === 'in';
    this.statusLabels = {
      vacant: this.translate.instant('ROOM_CONTEXT_MENU.STATUS_OPTIONS.VACANT'),
      occupied: this.translate.instant('ROOM_CONTEXT_MENU.STATUS_OPTIONS.OCCUPIED'),
      dirty: this.translate.instant('ROOM_CONTEXT_MENU.STATUS_OPTIONS.DIRTY'),
      cleaning: this.translate.instant('ROOM_CONTEXT_MENU.STATUS_OPTIONS.CLEANING'),
      maintenance: this.translate.instant('ROOM_CONTEXT_MENU.STATUS_OPTIONS.MAINTENANCE'),
      booked: this.translate.instant('ROOM_CONTEXT_MENU.STATUS_OPTIONS.BOOKED')
    };
  }

  // Kiểm tra trạng thái khách
  get isGuestOut(): boolean {
    return this.guestOut;
  }

  // Kiểm tra trạng thái khách trong phòng
  get isGuestIn(): boolean {
    return this.guestIn;
  }

  onActionClick(action: string): void {
    this.actionSelected.emit(action);
  }

  getStatusLabel(status: string): string {
    return this.statusLabels[status] || status;
  }
}
