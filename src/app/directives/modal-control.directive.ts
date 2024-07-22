import { Directive, HostListener, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { NzModalService, NzModalRef } from 'ng-zorro-antd/modal';
import { RoomsService } from '../services/rooms.service';
import { take, takeUntil } from 'rxjs/operators';
import { Subject} from 'rxjs';
import { RoomContentModalComponent } from '../components/room-content-modal/room-content-modal.component';
import { InvoiceComponent } from '../components/invoice/invoice.component';


@Directive({
  selector: '[appModalControl]',
  exportAs: 'appModalControl'
})
export class ModalControlDirective implements OnInit, OnDestroy {
  @Input() room: any; // Assuming you pass the entire room object to the directive
  // @Output() roomSelected = new EventEmitter<any>();
  newRoom: any

  private destroy$ = new Subject<void>();
  private modalRef: NzModalRef | null = null;

  constructor(
    private modalService: NzModalService,
    private roomsService: RoomsService,
  ) {
    this.newRoom = { values: {} }
  }

  ngOnInit(): void {
    // Additional initialization logic if needed
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('click') onClick() {
    if (this.room) {
      this.newRoom = this.room
      this.showModal();
    }
  }

  showModal(): void {
    this.modalRef = this.modalService.create({
      nzTitle: this.handleTitle(),
      nzContent: RoomContentModalComponent,
      nzData:{
        roomData: this.room
      },
      nzFooter: [
        {
          label: this.handleLabel(),
          type: 'primary',
          onClick: () => this.handleCheck(),
        },
        {
          label: 'Hủy',
          type: 'dashed',
          onClick: ()=> this.modalRef?.close(),
        }
      ],
      // Add more modal options as needed
    });
  }

  handleTitle(): string{
    switch (this.room.roomStatus) {
      case 'available':
        return 'Nhận Phòng';
      case 'active':
        return 'Trả Phòng';
      case 'dirty':
        return 'Dọn Dẹp';
      default:
        return 'Nhận Phòng'; // Handle any other cases or return a default class
    }
  }

  handleLabel(): string{
    switch (this.room.roomStatus) {
      case 'available':
        return 'Nhận Phòng';
      case 'active':
        return 'Trả Phòng';
      case 'dirty':
        return 'Dọn Dẹp';
      default:
        return 'Nhận Phòng'; // Handle any other cases or return a default class
    }
  }


  handleCheck(): void {
    if (!this.room || !this.room._id) {
      console.warn('Invalid room or room ID provided.');
      this.modalRef?.close();
      return;
    }
  
    const lastEvent = this.room.events[this.room.events.length - 1];
  
    if (this.room.roomStatus === 'available') {
      
      // Room is available, perform check-in
      this.newRoom = {
        roomStatus: 'active',
        events: [
          ...this.room.events,
          {
            type: 'checkin',
            checkinTime: new Date(),
          },
        ],
      };
      this.roomsService.checkInRoom(this.room._id, this.newRoom)
      .pipe(take(1))
      .subscribe(
        (room) => {
          console.log('Check-in/out successful. Room:', room);
          this.roomsService.notifyRoomDataUpdated();
          this.modalRef?.close();
        },
        (error) => {
          console.error('Error during check-in/out:', error);
          this.modalRef?.close();
        }
      );
    } else if (this.room.roomStatus === 'active' && lastEvent.type === 'checkin') {
      // Room is active and last event is check-in, perform check-out    
      lastEvent.type = 'checkout';
      lastEvent.checkoutTime = new Date()
      lastEvent.payment = this.calculatePayment(lastEvent.checkinTime, lastEvent.checkoutTime, this.room.roomType);
  
      this.newRoom = {
        roomStatus: 'dirty',
        events: [...this.room.events,
        {
          type: lastEvent.type,
          checkoutTime: lastEvent.checkoutTime,
          payment: lastEvent.payment,
        },
      ]};
      this.roomsService.checkOutRoom(this.room._id, this.newRoom)
      .pipe(take(1))
      .subscribe(
        (room) => {
          console.log('Check-in/out successful. Room:', room);
          this.roomsService.notifyRoomDataUpdated();
          this.modalRef?.close();
          const invoiceData = this.generateInvoice(this.room.roomNumber);
          this.showInvoice(invoiceData);
        },
        (error) => {
          console.error('Error during check-in/out:', error);
          this.modalRef?.close();
        }
      );
    } else if(this.room.roomStatus === 'dirty' && lastEvent.type === 'checkout'){
      this.newRoom = {
        roomStatus: 'available',
      };
      this.roomsService.cleanRoom(this.room._id, this.newRoom)
      .pipe(take(1))
      .subscribe(
        (room) => {
          console.log('Clean successful. Room:', room);
          this.roomsService.notifyRoomDataUpdated();
          this.modalRef?.close();
        },
        (error) => {
          console.error('Error during check-in/out:', error);
          this.modalRef?.close();
        }
      );
    } else {
      // Handle other cases as needed
      console.warn('Invalid room status or room not in a check-in state for check-in/check-out.');
      this.modalRef?.close();
      return;
    }
  }

  calculatePayment(checkinTime: any, checkoutTime: any, roomType: any): number {
    if (checkinTime && checkoutTime) {
      // Chuyển đổi chuỗi ngày thành đối tượng Date
      const checkinDate = new Date(checkinTime);
      const checkoutDate = new Date(checkoutTime);
      const checkoutHour = checkinDate.getHours();
      
      const durationInHours = Math.ceil((checkoutDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60));
  
      let payment = 0;
      const checkOutHourLimit = 22;

      

      if(this.room.options.isNight || checkoutHour >= checkOutHourLimit){
        payment = this.room.nightlyRate;
      }

      if(this.room.options.isDay){
        payment = this.room.dailyRate;
      }
  
      // Giá cho giờ đầu là 50$
      payment += this.room.hourlyRate;
  
      // Nếu durationInHours < 8, cộng thêm 10$ cho mỗi giờ tiếp theo
      if(durationInHours<=1){
        payment = this.room.hourlyRate;
      } else if (durationInHours > 1 && durationInHours <= 8 && roomType === 'fan') {
        payment += (durationInHours - 1) * 10000;
      } else if (durationInHours > 1 && durationInHours <= 8 && roomType === 'single') {
        payment += (durationInHours - 1) * 15000;
      } else if (durationInHours > 1 && durationInHours <= 8 && roomType === 'double') {
        payment += (durationInHours - 1) * 20000;
      }
       else if (durationInHours > 8 && durationInHours<=12) {
        payment = this.room.nightlyRate;
      }  else if (durationInHours > 12 && durationInHours <= 24){
        payment = this.room.dailyRate
      } else {
        const nights = Math.ceil(durationInHours / 24);
        payment = this.room.dailyRate * nights;
      }
  
      return payment;
    } else {
      // Handle the case where checkinTime or checkoutTime is undefined
      return 0;
    }
  }

  generateInvoice(roomNumber: number): any {
    // Thực hiện logic tạo dữ liệu hóa đơn dựa trên thông tin phòng và checkout
    // ...

    return {
      invoiceNumber: 'INV-001',
      date: '2024-02-01',
      customerName: 'Phan Huy Hoang',
      customerPhone: +84931881584,
      customerAddress: 'Binh Duong',
      products: [
        { name: 'Tiền phòng 101', price: 260000 },
        { name: 'Nước ngọt', price: 15000 }
      ],
      totalAmount: 275000,
    };
  }

  showInvoice(invoiceData: any): void {
    const modalRef = this.modalService.create({
      nzTitle: 'Hóa Đơn',
      nzContent: InvoiceComponent,
      nzData: {
        invoiceData
      },
      nzFooter: null
    });

    modalRef.afterClose.subscribe(() => {
      // Xử lý sau khi đóng modal (nếu cần)
    });
  }
  
  
}