import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { ProductService } from '../../services/product.service';
import { Subscription } from 'rxjs';
import { NzMarks } from 'ng-zorro-antd/slider';
import { RoomsService } from '../../services/rooms.service';
import { HotelService } from '../../services/hotel.service';
import { Room, ShiftHandover } from '../../interfaces/rooms';
import { NzModalService } from 'ng-zorro-antd/modal';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TableComponent } from '../table/table.component';
import { InvoiceService } from '../../services/invoice.service';

@Component({
  selector: 'app-room',
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.css']
})
export class RoomComponent implements OnInit, OnDestroy {
  @ViewChild(TableComponent) tableComponent!: TableComponent;
  
  rooms: Room[] = [];
  roomTableData: any[] = [];
  selectedRoomId: string | null = null;
  hotels: any[] = [];
  selectedHotelId: string | null = null;
  floors: number[] = [];
  selectedFloor: number | null = null;
  isLoading = false;
  
  // Dữ liệu thống kê cho biểu đồ doanh thu
  totalPayment: number = 0;
  totalRoomCount: number = 0;
  chartLabels: string[] = [];
  chartRevenueData: number[] = [];
  chartPaymentData: number[] = [];
  
  // Form cho giao ca
  shiftHandoverForm: FormGroup;
  
  private roomDataUpdatedSubscription: Subscription;

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
      this.loadRooms();
    });
    
    // Khởi tạo form giao ca
    this.shiftHandoverForm = this.fb.group({
      fromStaffId: ['', [Validators.required]],
      toStaffId: ['', [Validators.required]],
      cashAmount: [0, [Validators.required, Validators.min(0)]],
      notes: [''],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit(): void {
    this.loadHotels();
    this.loadRooms();
  }

  ngOnDestroy(): void {
    if (this.roomDataUpdatedSubscription) {
      this.roomDataUpdatedSubscription.unsubscribe();
    }
  }

  // Phương thức mở modal giao ca
  openShiftHandoverModal(): void {
    this.modalService.create({
      nzTitle: 'Giao ca',
      nzContent: this.shiftHandoverModalContent(),
      nzWidth: 600,
      nzFooter: null,
      nzMaskClosable: false
    });
  }
  
  // Template cho modal giao ca
  shiftHandoverModalContent = (): string => {
    return `
      <form nz-form [formGroup]="shiftHandoverForm" (ngSubmit)="submitShiftHandover()">
        <nz-form-item>
          <nz-form-label [nzSpan]="8" nzRequired>Nhân viên giao ca</nz-form-label>
          <nz-form-control [nzSpan]="16" nzErrorTip="Vui lòng chọn nhân viên giao ca">
            <input nz-input formControlName="fromStaffId" placeholder="Nhập ID nhân viên giao ca" />
          </nz-form-control>
        </nz-form-item>
        
        <nz-form-item>
          <nz-form-label [nzSpan]="8" nzRequired>Nhân viên nhận ca</nz-form-label>
          <nz-form-control [nzSpan]="16" nzErrorTip="Vui lòng chọn nhân viên nhận ca">
            <input nz-input formControlName="toStaffId" placeholder="Nhập ID nhân viên nhận ca" />
          </nz-form-control>
        </nz-form-item>
        
        <nz-form-item>
          <nz-form-label [nzSpan]="8" nzRequired>Số tiền mặt giao ca</nz-form-label>
          <nz-form-control [nzSpan]="16" nzErrorTip="Vui lòng nhập số tiền">
            <nz-input-number formControlName="cashAmount" [nzMin]="0" [nzStep]="10000" [nzFormatter]="formatterVND" [nzParser]="parserVND" style="width: 100%"></nz-input-number>
          </nz-form-control>
        </nz-form-item>
        
        <nz-form-item>
          <nz-form-label [nzSpan]="8">Ghi chú</nz-form-label>
          <nz-form-control [nzSpan]="16">
            <textarea nz-input formControlName="notes" rows="3" placeholder="Nhập ghi chú"></textarea>
          </nz-form-control>
        </nz-form-item>
        
        <nz-form-item>
          <nz-form-label [nzSpan]="8" nzRequired>Xác nhận mật khẩu</nz-form-label>
          <nz-form-control [nzSpan]="16" nzErrorTip="Vui lòng nhập mật khẩu">
            <input nz-input formControlName="password" type="password" placeholder="Nhập mật khẩu xác nhận" />
          </nz-form-control>
        </nz-form-item>
        
        <div class="text-right">
          <button nz-button nzType="primary" type="submit" [disabled]="shiftHandoverForm.invalid">
            Xác nhận giao ca
          </button>
        </div>
      </form>
    `;
  }
  
  // Phương thức định dạng tiền Việt Nam
  formatterVND = (value: number): string => `${value} đ`;
  parserVND = (value: string): string => value.replace(' đ', '');
  
  // Phương thức xử lý khi submit form giao ca
  submitShiftHandover(): void {
    if (this.shiftHandoverForm.invalid) {
      Object.values(this.shiftHandoverForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity();
        }
      });
      return;
    }
    
    this.isLoading = true;
    
    const handoverData: ShiftHandover = {
      hotelId: this.selectedHotelId!,
      fromStaffId: this.shiftHandoverForm.get('fromStaffId')?.value,
      toStaffId: this.shiftHandoverForm.get('toStaffId')?.value,
      handoverTime: new Date(),
      notes: this.shiftHandoverForm.get('notes')?.value,
      cashAmount: this.shiftHandoverForm.get('cashAmount')?.value,
      confirmedByPassword: true
    };
    
    this.roomsService.createShiftHandover(handoverData).subscribe(
      (response) => {
        // Sau khi tạo giao ca thành công, xác nhận bằng mật khẩu
        if (response && response.id) {
          this.roomsService.confirmShiftHandover(
            response.id, 
            this.shiftHandoverForm.get('password')?.value
          ).subscribe(
            (confirmResponse) => {
              if (confirmResponse.success) {
                this.message.success('Giao ca thành công');
              } else {
                this.message.error(confirmResponse.message || 'Không thể xác nhận giao ca');
              }
              this.isLoading = false;
              this.modalService.closeAll();
            },
            (error) => {
              this.message.error('Lỗi xác nhận giao ca: ' + error.message);
              this.isLoading = false;
            }
          );
        } else {
          this.message.error('Không nhận được ID giao ca');
          this.isLoading = false;
        }
      },
      (error) => {
        this.message.error('Lỗi tạo giao ca: ' + error.message);
        this.isLoading = false;
      }
    );
  }
  
  // Hiển thị lịch sử phòng
  showRoomHistory(): void {
    if (!this.selectedHotelId) {
      this.message.warning('Vui lòng chọn khách sạn');
      return;
    }
    
    // Tải lịch sử phòng và hiện thị trong modal hoặc cập nhật component room-history
    this.roomsService.getRoomHistory(
      this.selectedHotelId,
      'all',
      1,
      20
    ).subscribe(
      (data) => {
        console.log('Lịch sử phòng:', data);
        this.roomTableData = data.history || [];
        
        // Cập nhật thống kê cho biểu đồ
        this.totalPayment = data.totalPayment || 0;
        this.totalRoomCount = this.roomTableData.length;
        
        // Chuẩn bị dữ liệu cho biểu đồ
        this.prepareChartData();
      },
      (error) => {
        this.message.error('Lỗi tải lịch sử phòng: ' + error.message);
      }
    );
  }
  
  // Chuẩn bị dữ liệu cho biểu đồ
  prepareChartData(): void {
    // Tạo nhóm dữ liệu theo ngày
    const groupedData = this.groupDataByDate(this.roomTableData);
    
    // Sắp xếp các ngày tăng dần
    const sortedDates = Object.keys(groupedData).sort((a, b) => {
      return new Date(a).getTime() - new Date(b).getTime();
    });
    
    // Giới hạn 7 ngày gần nhất nếu có nhiều hơn
    const recentDates = sortedDates.slice(-7);
    
    // Chuẩn bị dữ liệu cho biểu đồ
    this.chartLabels = recentDates.map(date => {
      const d = new Date(date);
      return `${d.getDate()}/${d.getMonth() + 1}`;
    });
    
    this.chartRevenueData = recentDates.map(date => groupedData[date].revenue);
    this.chartPaymentData = recentDates.map(date => groupedData[date].payment);
  }
  
  // Phân nhóm dữ liệu theo ngày
  groupDataByDate(data: any[]): { [key: string]: { revenue: number, payment: number, count: number } } {
    const result: { [key: string]: { revenue: number, payment: number, count: number } } = {};
    
    data.forEach(item => {
      if (!item.checkOutTime && !item.date) return;
      
      // Lấy ngày từ checkOutTime hoặc date
      const dateObj = new Date(item.checkOutTime || item.date);
      const dateStr = dateObj.toISOString().split('T')[0]; // Format YYYY-MM-DD
      
      if (!result[dateStr]) {
        result[dateStr] = { revenue: 0, payment: 0, count: 0 };
      }
      
      // Cộng dồn doanh thu và thanh toán
      const amount = item.amount || item.totalAmount || 0;
      result[dateStr].revenue += amount;
      result[dateStr].payment += amount;
      result[dateStr].count++;
    });
    
    return result;
  }

  loadHotels(): void {
    this.hotelService.getHotels().subscribe(
      (data) => {
        this.hotels = data;
        if (data.length > 0) {
          // Chọn khách sạn đầu tiên mặc định
          this.selectedHotelId = data[0]._id;
          this.onHotelChange(this.selectedHotelId);
        }
      },
      (error) => console.error('Lỗi khi tải danh sách khách sạn:', error)
    );
  }

  loadRooms(): void {
    this.isLoading = true;
    const params: any = {};
    
    if (this.selectedHotelId) {
      params.hotelId = this.selectedHotelId;
    }
    
    if (this.selectedFloor !== null) {
      params.floor = this.selectedFloor;
    }
    
    this.roomsService.getRooms(params).subscribe(
      (data) => {
        this.rooms = data;
        this.isLoading = false;
        // Cập nhật dữ liệu lịch sử phòng khi có thay đổi phòng
        this.showRoomHistory();
      },
      (error) => {
        console.error('Lỗi khi tải danh sách phòng:', error);
        this.isLoading = false;
      }
    );
  }

  onHotelChange(hotelId: string): void {
    this.selectedHotelId = hotelId;
    this.selectedFloor = null; // Reset lựa chọn tầng khi đổi khách sạn
    
    if (hotelId) {
      this.roomsService.getHotelFloors(hotelId).subscribe(
        (data) => {
          this.floors = data.floors;
          this.loadRooms();
        },
        (error) => console.error('Lỗi khi tải danh sách tầng:', error)
      );
    } else {
      this.floors = [];
      this.loadRooms();
    }
  }

  onFloorChange(floor: number): void {
    this.selectedFloor = floor;
    this.loadRooms();
  }

  viewInvoice(item: any): void {
    if (!item) {
      this.message.warning('Không thể hiển thị hóa đơn: Thiếu thông tin');
      return;
    }
    
    console.log('Hiển thị hóa đơn từ component phòng:', item.roomNumber);
    
    // Cập nhật thêm thông tin khách sạn nếu cần
    if (this.selectedHotelId && !item.hotelId) {
      item.hotelId = this.selectedHotelId;
      
      // Thêm tên khách sạn nếu có
      const hotel = this.hotels.find(h => h._id === this.selectedHotelId);
      if (hotel) {
        item.businessName = hotel.name;
        item.business_address = hotel.address;
        item.phoneNumber = hotel.phoneNumber;
      }
    }
    
    // Đảm bảo có ngày
    if (!item.date) {
      item.date = new Date();
    }
    
    // Sử dụng InvoiceService để hiển thị modal hóa đơn
    this.invoiceService.showInvoiceModal(item);
  }

  //antd
  hGutter = 16;
  vGutter = 16;
  count = 4;
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
    this.count = count;
  }

  getRoomStatusClass(roomStatus: string): string {
    switch (roomStatus) {
      case 'available':
        return 'inactive-room';
      case 'active':
      case 'occupied':
        return 'active-room';
      case 'dirty':
        return 'dirty-room';
      case 'maintenance':
        return 'maintenance-room';
      case 'cleaning':
        return 'cleaning-room';
      default:
        return 'inactive-room';
    }
  }

  getHotelName(hotelId: string): string {
    const hotel = this.hotels.find(h => h._id === hotelId);
    return hotel ? hotel.name : '';
  }

  switchValue = false;

  onSelect(roomId: string): void {
    this.selectedRoomId = roomId;
  }

  private loadData() {
    this.productService.loadUpdatedData();
  }
}


