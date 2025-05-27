import { Component, OnInit, OnDestroy, ViewChild, TemplateRef } from '@angular/core';
import { ProductService } from '../../services/product.service';
import { Subscription } from 'rxjs';
import { NzMarks } from 'ng-zorro-antd/slider';
import { RoomsService } from '../../services/rooms.service';
import { HotelService } from '../../services/hotel.service';
import { Room, ShiftHandover, BookingHistory, RoomStatus, Event as RoomEvent, GuestInfo, OrderedService } from '../../interfaces/rooms';
import { Hotel } from '../../interfaces/hotel';
import { NzModalService } from 'ng-zorro-antd/modal';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TableComponent } from '../table/table.component';
import { InvoiceService } from '../../services/invoice.service';
import { User } from '../../interfaces/user';

@Component({
  selector: 'app-room',
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.css']
})
export class RoomComponent implements OnInit, OnDestroy {
  @ViewChild(TableComponent) tableComponent!: TableComponent;
  @ViewChild('shiftHandoverContent') shiftHandoverContent!: TemplateRef<any>;
  
  rooms: Room[] = [];
  roomTableData: BookingHistory[] = [];
  selectedRoomId: string | null = null;
  hotels: Hotel[] = [];
  selectedHotelId: string | null = null;
  floors: string[] = [];
  selectedFloor: string | null = null;
  isLoading = false;
  
  totalPayment: number = 0;
  totalRoomCount: number = 0;
  chartLabels: string[] = [];
  chartRevenueData: number[] = [];
  chartPaymentData: number[] = [];
  
  shiftHandoverForm: FormGroup;
  private roomDataUpdatedSubscription: Subscription;

  roomStatusDisplayOptions: { value: RoomStatus, label: string, color: string }[] = [
    { value: 'vacant', label: 'Trống', color: 'green' },
    { value: 'occupied', label: 'Có khách', color: 'red' },
    { value: 'cleaning', label: 'Đang dọn', color: 'blue' },
    { value: 'dirty', label: 'Bẩn', color: 'orange' },
    { value: 'maintenance', label: 'Bảo trì', color: 'purple' }
  ];

  constructor(
    public productService: ProductService, 
    private roomsService: RoomsService,
    private hotelService: HotelService,
    private modalService: NzModalService,
    private fb: FormBuilder,
    private message: NzMessageService,
    private invoiceService: InvoiceService
  ) {
    this.roomDataUpdatedSubscription = this.roomsService.getRoomDataUpdated$().subscribe(() => {
      if (this.selectedHotelId) this.loadRooms();
    });
    
    this.shiftHandoverForm = this.fb.group({
      fromStaffId: ['', [Validators.required]],
      toStaffId: ['', [Validators.required]],
      cashAmount: [0, [Validators.required, Validators.min(0)]],
      notes: [''],
    });
  }

  ngOnInit(): void {
    this.loadHotels();
  }

  ngOnDestroy(): void {
    if (this.roomDataUpdatedSubscription) {
      this.roomDataUpdatedSubscription.unsubscribe();
    }
  }

  openShiftHandoverModal(contentTemplate: any): void {
    this.modalService.create({
      nzTitle: 'Giao ca',
      nzContent: contentTemplate,
      nzWidth: 600,
      nzFooter: [
        {
          label: 'Hủy',
          onClick: () => this.modalService.closeAll()
        },
        {
          label: 'Xác nhận giao ca',
          type: 'primary',
          disabled: () => this.shiftHandoverForm.invalid,
          onClick: () => this.submitShiftHandover()
        }
      ],
      nzMaskClosable: false
    });
  }
  
  submitShiftHandover(): void {
    if (this.shiftHandoverForm.invalid) {
      Object.values(this.shiftHandoverForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      this.message.warning('Vui lòng điền đầy đủ thông tin giao ca.');
      return;
    }
    
    if (!this.selectedHotelId) {
      this.message.error('Chưa chọn khách sạn để giao ca.');
      return;
    }

    this.isLoading = true;
    const handoverData: Omit<ShiftHandover, 'id' | 'createdAt' | 'confirmedByPassword'> = {
      hotelId: this.selectedHotelId,
      fromStaffId: this.shiftHandoverForm.value.fromStaffId,
      toStaffId: this.shiftHandoverForm.value.toStaffId,
      handoverTime: new Date(),
      notes: this.shiftHandoverForm.value.notes,
      cashAmount: this.shiftHandoverForm.value.cashAmount,
    };
    
    this.roomsService.createShiftHandover(handoverData).subscribe(
      (response) => {
        this.message.success('Yêu cầu giao ca đã được tạo. Vui lòng xác nhận bằng mật khẩu.');
        this.isLoading = false;
        this.modalService.closeAll(); 
        if (response && response.id) {
            this.message.success(`Giao ca (ID: ${response.id}) thành công!`);
        } else {
            this.message.info('Giao ca đã được ghi nhận.');
        }
      },
      (error) => {
        this.message.error('Lỗi tạo giao ca: ' + (error.error?.message || error.message));
        this.isLoading = false;
      }
    );
  }
  
  showRoomHistory(): void {
    if (!this.selectedHotelId) {
      this.message.warning('Vui lòng chọn khách sạn');
      return;
    }
    
    this.isLoading = true;
    this.roomsService.getRoomHistory(this.selectedHotelId, 'all', 1, 100)
    .subscribe(
      (data) => {
        this.roomTableData = data.history || [];
        this.totalPayment = data.totalPayment || 0;
        this.totalRoomCount = data.totalItems || 0;
        this.prepareChartData();
        this.isLoading = false;
      },
      (error) => {
        this.message.error('Lỗi tải lịch sử phòng: ' + (error.error?.message || error.message));
        this.isLoading = false;
      }
    );
  }
  
  prepareChartData(): void {
    const groupedData = this.groupDataByDate(this.roomTableData);
    const sortedDates = Object.keys(groupedData).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const recentDates = sortedDates.slice(-7);
    
    this.chartLabels = recentDates.map(date => {
      const d = new Date(date);
      return `${d.getDate()}/${d.getMonth() + 1}`;
    });
    
    this.chartRevenueData = recentDates.map(date => groupedData[date].revenue);
    this.chartPaymentData = recentDates.map(date => groupedData[date].payment);
  }
  
  groupDataByDate(data: BookingHistory[]): { [key: string]: { revenue: number, payment: number, count: number } } {
    const result: { [key: string]: { revenue: number, payment: number, count: number } } = {};
    data.forEach(item => {
      const dateObj = new Date(item.date);
      const dateStr = dateObj.toISOString().split('T')[0];
      
      if (!result[dateStr]) {
        result[dateStr] = { revenue: 0, payment: 0, count: 0 };
      }
      if (item.event === 'check-out' && item.totalAmount) {
        result[dateStr].revenue += item.totalAmount; 
        result[dateStr].payment += item.totalAmount;
      }
      result[dateStr].count++;
    });
    return result;
  }

  loadHotels(): void {
    this.isLoading = true;
    this.hotelService.getHotels().subscribe(data => {
      this.hotels = data;
      if (data && data.length > 0) {
        this.selectedHotelId = data[0]._id!;
        this.onHotelChange(this.selectedHotelId);
      } else {
        this.selectedHotelId = null;
        this.rooms = [];
        this.floors = [];
      }
      this.isLoading = false;
    }, error => {
      this.message.error('Lỗi khi tải danh sách khách sạn: ' + (error.error?.message || error.message));
      this.isLoading = false;
    });
  }

  loadRooms(): void {
    if (!this.selectedHotelId) {
      this.rooms = [];
      return;
    }
    this.isLoading = true;
    const params: any = { hotelId: this.selectedHotelId };    
    if (this.selectedFloor) {
      params.floor = this.selectedFloor;
    }
    
    this.roomsService.getRooms(params).subscribe(
      (data) => {
        this.rooms = data;
        this.isLoading = false;
        this.showRoomHistory();
      },
      (error) => {
        this.message.error('Lỗi khi tải danh sách phòng: ' + (error.error?.message || error.message));
        this.isLoading = false;
      }
    );
  }

  onHotelChange(hotelId: string | null): void {
    this.selectedHotelId = hotelId;
    this.selectedFloor = null;
    this.floors = [];
    
    if (hotelId) {
      this.isLoading = true;
      this.roomsService.getHotelFloors(hotelId).subscribe(
        (data) => {
          this.floors = data.floors.map(f => String(f));
          this.loadRooms();
        },
        (error) => {
          this.message.error('Lỗi khi tải danh sách tầng: ' + (error.error?.message || error.message));
          this.isLoading = false;
          this.loadRooms();
        }
      );
    } else {
      this.rooms = [];
      this.roomTableData = [];
    }
  }

  onFloorChange(floor: string | null): void {
    this.selectedFloor = floor;
    this.loadRooms();
  }

  viewInvoice(item: BookingHistory): void {
    if (!item || !item.roomId) {
      this.message.warning('Không thể hiển thị hóa đơn: Thiếu thông tin phòng.');
      return;
    }
    const roomForInvoice = this.rooms.find(r => r._id === item.roomId);

    const invoiceData = {
        invoiceNumber: item._id || new Date().getTime().toString(),
        date: item.date || new Date(),
        customerName: item.customerName || 'Khách lẻ',
        staffName: item.staffName || 'Nhân viên',
        roomNumber: item.roomNumber || roomForInvoice?.roomNumber,
        checkInTime: item.checkInTime || new Date(new Date(item.date).getTime() - 3600000),
        checkOutTime: item.event === 'check-out' ? item.date : new Date(),
        products: [
            { name: `Tiền phòng ${item.roomNumber || roomForInvoice?.roomNumber}`, price: item.totalAmount || item.amount || 0, quantity: 1, totalPrice: item.totalAmount || item.amount || 0 }
        ],
        totalAmount: item.totalAmount || item.amount || 0,
        paymentMethod: item.paymentMethod || 'cash',
        hotelId: this.selectedHotelId ?? undefined,
        businessName: this.selectedHotelId ? this.hotels.find(h => h._id === this.selectedHotelId)?.name : 'Khách sạn',
    };
    this.invoiceService.showInvoiceModal(invoiceData);
  }

  getRoomStatusClass(status: RoomStatus | undefined): string {
    if (!status) return 'inactive-room';
    const option = this.roomStatusDisplayOptions.find(opt => opt.value === status);
    return option ? `${option.value}-room` : 'inactive-room';
  }

  getRoomStatusLabelAndColor(status: RoomStatus | undefined): { label: string, color: string } {
    if (!status) return { label: 'Không xác định', color: 'default' };
    const option = this.roomStatusDisplayOptions.find(opt => opt.value === status);
    return option ? { label: option.label, color: option.color } : { label: status, color: 'default' };
  }

  getHotelName(hotelId: string | undefined): string {
    if (!hotelId) return '';
    const hotel = this.hotels.find(h => h._id === hotelId);
    return hotel ? hotel.name : '';
  }

  hGutter = 16;
  vGutter = 16;
  count = 4;
  marksHGutter: NzMarks = { 8: '8', 16: '16', 24: '24', 32: '32', 40: '40', 48: '48' };
  marksVGutter: NzMarks = { 8: '8', 16: '16', 24: '24', 32: '32', 40: '40', 48: '48' };
  marksCount: NzMarks = { 2: '2', 3: '3', 4: '4', 6: '6', 8: '8', 12: '12' };

  reGenerateArray(count: number): void {
    this.count = count;
  }

  switchValue = false;

  onSelectRoom(room: Room): void {
    this.selectedRoomId = room._id;
    console.log('Selected room:', room);
  }
}


