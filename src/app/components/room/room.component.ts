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
import { RoomContentModalComponent } from '../room-content-modal/room-content-modal.component';

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
    { value: 'maintenance', label: 'Bảo trì', color: 'purple' },
    { value: 'booked', label: 'Đã đặt', color: 'geekblue' }
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
    // Load tất cả phòng, không filter theo tầng để hiển thị tất cả các tầng
    const params: any = { hotelId: this.selectedHotelId };
    
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
  }

  onRoomClick(room: Room, event: MouseEvent): void {
    if (!room || !room._id) {
      return;
    }
    
    event.preventDefault();
    event.stopPropagation();
    
    // Xác định loại modal dựa trên trạng thái
    let modalType = 'info';
    switch (room.status) {
      case 'vacant':
        modalType = 'checkin';
        break;
      case 'occupied':
        modalType = 'checkout';
        break;
      case 'dirty':
      case 'cleaning':
      case 'maintenance':
        modalType = 'cleaning';
        break;
      default:
        modalType = 'info';
    }
    
    try {
      // Mở modal trực tiếp
      const modalRef = this.modalService.create({
        nzTitle: `Phòng ${room.roomNumber}`,
        nzContent: RoomContentModalComponent,
        nzFooter: null,
        nzMaskClosable: false,
        nzClassName: 'room-detail-modal',
        nzWidth: 700,
        nzData: {
          roomData: room,
          modalType: modalType
        }
      });
      
      modalRef.afterClose.subscribe((result) => {
        this.roomsService.notifyRoomDataUpdated();
      });
    } catch (error) {
      console.error('Error creating modal:', error);
      this.message.error('Không thể mở modal. Vui lòng thử lại.');
    }
  }

  // Tính tổng tiền đặt trước từ tất cả các phòng đang có khách
  getTotalAdvancePayment(): number {
    let total = 0;
    this.rooms.forEach(room => {
      if (room.status === 'occupied') {
        const checkinInfo = this.getRoomCheckinInfo(room);
        if (checkinInfo && checkinInfo.advancePayment > 0) {
          total += checkinInfo.advancePayment;
        }
      }
    });
    return total;
  }

  // Nhóm phòng theo tầng
  getRoomsByFloor(): { [floor: string]: Room[] } {
    const grouped: { [floor: string]: Room[] } = {};
    this.rooms.forEach(room => {
      const floor = room.floor || '0';
      if (!grouped[floor]) {
        grouped[floor] = [];
      }
      grouped[floor].push(room);
    });
    // Sắp xếp các tầng
    const sortedFloors = Object.keys(grouped).sort((a, b) => {
      const numA = parseInt(a) || 0;
      const numB = parseInt(b) || 0;
      return numA - numB;
    });
    const sortedGrouped: { [floor: string]: Room[] } = {};
    sortedFloors.forEach(floor => {
      sortedGrouped[floor] = grouped[floor];
    });
    return sortedGrouped;
  }

  // Lấy danh sách tầng đã sắp xếp
  getSortedFloors(): string[] {
    const floors = new Set<string>();
    this.rooms.forEach(room => {
      if (room.floor) {
        floors.add(room.floor);
      }
    });
    return Array.from(floors).sort((a, b) => {
      const numA = parseInt(a) || 0;
      const numB = parseInt(b) || 0;
      return numA - numB;
    });
  }

  // Lấy thông tin chi tiết của phòng để hiển thị (giống hình)
  getRoomDisplayInfo(room: Room): {
    checkinTime: string;
    customerName: string;
    rateTypeLabel: string;
    totalAmount: number;
    advancePayment: number;
    remainingAmount: number;
  } | null {
    if (room.status !== 'occupied') {
      return null;
    }
    const checkinInfo = this.getRoomCheckinInfo(room);
    if (!checkinInfo) {
      return null;
    }
    
    const checkinTimeStr = checkinInfo.checkinTime 
      ? `${checkinInfo.checkinTime.getHours().toString().padStart(2, '0')}:${checkinInfo.checkinTime.getMinutes().toString().padStart(2, '0')} ${checkinInfo.checkinTime.getDate().toString().padStart(2, '0')}/${(checkinInfo.checkinTime.getMonth() + 1).toString().padStart(2, '0')}/${checkinInfo.checkinTime.getFullYear()}`
      : '';
    
    return {
      checkinTime: checkinTimeStr,
      customerName: checkinInfo.guestName,
      rateTypeLabel: checkinInfo.rateTypeLabel,
      totalAmount: checkinInfo.roomPrice,
      advancePayment: checkinInfo.advancePayment,
      remainingAmount: checkinInfo.remainingAmount
    };
  }

  // Lấy thông tin checkin của phòng đang có khách
  getRoomCheckinInfo(room: Room): { 
    guestName: string; 
    checkinTime: Date | null; 
    roomPrice: number; 
    advancePayment: number; 
    remainingAmount: number;
    rateType: string;
    rateTypeLabel: string;
  } | null {
    if (room.status !== 'occupied' || !room.events || room.events.length === 0) {
      return null;
    }

    // Tìm event checkin cuối cùng
    const checkinEvents = room.events.filter(e => e.type === 'checkin');
    if (checkinEvents.length === 0) return null;
    
    const lastCheckin = checkinEvents[checkinEvents.length - 1];
    const checkinTime = lastCheckin.checkinTime ? new Date(lastCheckin.checkinTime) : null;
    const rateType = lastCheckin.rateType || 'hourly';
    
    // Lấy label cho loại giá
    const rateTypeLabels: {[key: string]: string} = {
      'hourly': 'Theo giờ',
      'daily': 'Ngày đêm',
      'nightly': 'Qua đêm'
    };
    const rateTypeLabel = rateTypeLabels[rateType] || 'Theo giờ';
    
    // Tính tiền phòng dựa trên thời gian
    let roomPrice = 0;
    if (checkinTime) {
      const now = new Date();
      const durationInHours = Math.ceil((now.getTime() - checkinTime.getTime()) / (1000 * 60 * 60));
      const durationInDays = Math.ceil(durationInHours / 24);
      
      // Lấy giá từ room pricing
      const hourlyRate = room.pricing?.hourly || room.firstHourRate || 0;
      const dailyRate = room.pricing?.daily || 0;
      const nightlyRate = room.pricing?.nightly || 0;
      
      switch (rateType) {
        case 'hourly':
          if (room.firstHourRate && room.additionalHourRate) {
            roomPrice = room.firstHourRate;
            if (durationInHours > 1) {
              roomPrice += (durationInHours - 1) * room.additionalHourRate;
            }
            if (durationInHours > 6 && dailyRate > 0) {
              roomPrice = dailyRate;
            }
          } else {
            roomPrice = hourlyRate * durationInHours;
            if (durationInHours > 6 && dailyRate > 0 && roomPrice > dailyRate) {
              roomPrice = dailyRate;
            }
          }
          break;
        case 'daily':
          roomPrice = dailyRate * durationInDays;
          break;
        case 'nightly':
          roomPrice = nightlyRate;
          if (durationInDays > 1) {
            roomPrice += (durationInDays - 1) * dailyRate;
          }
          break;
        default:
          roomPrice = hourlyRate * durationInHours;
      }
    }
    
    const advancePayment = lastCheckin.advancePayment || 0;
    // Cho phép giá trị âm (khi đặt trước nhiều hơn tiền phòng)
    const remainingAmount = roomPrice - advancePayment;
    
    return {
      guestName: lastCheckin.guestInfo?.name || 'Khách lẻ',
      checkinTime: checkinTime,
      roomPrice: Math.round(roomPrice),
      advancePayment: advancePayment,
      remainingAmount: Math.round(remainingAmount),
      rateType: rateType,
      rateTypeLabel: rateTypeLabel
    };
  }
}


