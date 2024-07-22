import { Component, OnInit } from '@angular/core';
import { ProductService } from '../../services/product.service';
import { Subscription } from 'rxjs';
import { NzMarks } from 'ng-zorro-antd/slider';
import { RoomsService } from '../../services/rooms.service';

@Component({
  selector: 'app-room',
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.css']
})
export class RoomComponent implements OnInit {
  roomNumber!: number // Replace with actual room number
  rooms: any[] = [];
  selectedRoomId: string | null = null;
  private roomDataUpdatedSubscription: Subscription;

  constructor(public productService: ProductService, private roomsService:RoomsService) {
    this.roomDataUpdatedSubscription = this.roomsService.getRoomDataUpdated$().subscribe(() => {
      // Call method to reload or update data
      this.loadData();
    });
  }


  ngOnInit(): void {
  }

  ngOnDestroy(): void {
    this.roomDataUpdatedSubscription.unsubscribe();
  }

  //antd

  hGutter = 16;
  vGutter = 16;
  count = 4;
  array = new Array(this.count);
  marksHGutter: NzMarks = {
    8: '8',
    16: '16',
    24: '24',
    32: '32',
    40: '40',
    48: '48'
  };
  marksVGutter: NzMarks = {
    8: '8',
    16: '16',
    24: '24',
    32: '32',
    40: '40',
    48: '48'
  };
  marksCount: NzMarks = {
    2: '2',
    3: '3',
    4: '4',
    6: '6',
    8: '8',
    12: '12'
  };
  reGenerateArray(count: number): void {
    this.rooms = Array.from({ length: count }, (_, index) => ({ id: index + 1, name: `Room ${index + 1}` }));
  }

  getRoomStatusClass(roomStatus: any): string {
    switch (roomStatus) {
      case 'available':
        return 'inactive-room';
      case 'active':
        return 'active-room';
      case 'dirty':
        return 'dirty-room';
      default:
        return 'inactive-room'; // Handle any other cases or return a default class
    }
  }

  switchValue = false;

  onSelect(roomId: any): void {
    this.selectedRoomId = roomId;
  }

  private loadData() {
    // Update or reload your data here
    // For example, you can call productService method to fetch updated data
    this.productService.loadUpdatedData();
  }



}


