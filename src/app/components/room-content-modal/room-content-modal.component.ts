import { Component, Inject } from '@angular/core';
import { NzModalRef, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';

@Component({
  selector: 'app-room-content-modal',
  templateUrl: './room-content-modal.component.html',
  styleUrls: ['./room-content-modal.component.css']
})
export class RoomContentModalComponent {
  roomData: any;
  listData: any[] = [];

  constructor(
    private modalRef: NzModalRef<RoomContentModalComponent>,
    @Inject(NZ_MODAL_DATA) private data: any // Nhận dữ liệu từ nzData
  ) {
    this.roomData = data.roomData;
  }

  ngOnInit(): void {
    this.fetchCurrentRoom();
  }

  fetchCurrentRoom(): void {
    if (this.roomData && this.roomData.roomNumber) {
      const lastEvents = this.roomData.events[this.roomData.events.length - 1];
      this.listData = [lastEvents];
    }
  }
}
