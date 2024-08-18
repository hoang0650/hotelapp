import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'sortRooms'
})
export class SortRoomsPipe implements PipeTransform {

  transform(rooms: any[], key: string = 'roomNumber'): any[] {
    if (!rooms || rooms.length <= 1) {
      return rooms;
    }

    return rooms.sort((a, b) => {
      const roomNumberA = parseInt(a[key], 10);
      const roomNumberB = parseInt(b[key], 10);
      return roomNumberA - roomNumberB;
    });
  }
}
