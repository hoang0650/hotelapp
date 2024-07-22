import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'sortByCheckinTime'
})
export class SortByCheckinTimePipe implements PipeTransform {

  // transform(events: any[]): any[] {
  //   return events.sort((a, b) => new Date(b.checkinTime).getTime() - new Date(a.checkinTime).getTime());
  // }
  transform(items: any[]): any[] {
    if (!items) {
      return [];
    }
    return items.sort((a, b) => {
      const checkoutTimeA = a.events.length > 0 ? a.events[a.events.length - 1].checkoutTime : new Date(0);
      const checkoutTimeB = b.events.length > 0 ? b.events[b.events.length - 1].checkoutTime : new Date(0);
      return checkoutTimeB.getTime() - checkoutTimeA.getTime();
    });
  }

}
