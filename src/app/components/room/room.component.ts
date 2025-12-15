import { Component, OnInit, OnDestroy, ViewChild, TemplateRef } from '@angular/core';
import { ProductService } from '../../services/product.service';
import { Subscription, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { NzMarks } from 'ng-zorro-antd/slider';
import { RoomsService } from '../../services/rooms.service';
import { HotelService } from '../../services/hotel.service';
import { Room, ShiftHandover, BookingHistory, RoomStatus, Event as RoomEvent, GuestInfo, OrderedService } from '../../interfaces/rooms';
import { Hotel } from '../../interfaces/hotel';
import { NzModalService, NzModalRef } from 'ng-zorro-antd/modal';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TableComponent } from '../table/table.component';
import { InvoiceService } from '../../services/invoice.service';
import { User } from '../../interfaces/user';
import { RoomContentModalComponent } from '../room-content-modal/room-content-modal.component';
import { TransactionService } from '../../services/transaction.service';
import { BookingModalComponent } from '../booking-modal/booking-modal.component';
import { CalendarComponent } from '../calendar/calendar.component';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-room',
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.css']
})
export class RoomComponent implements OnInit, OnDestroy {
  @ViewChild(TableComponent) tableComponent!: TableComponent;
  @ViewChild(CalendarComponent) calendarComponent!: CalendarComponent;
  @ViewChild('shiftHandoverContent') shiftHandoverContent!: TemplateRef<any>;
  
  // Subscription để theo dõi thay đổi totalPayment từ table
  private tableTotalPaymentSubscription: Subscription | null = null;
  
  rooms: Room[] = [];
  roomTableData: BookingHistory[] = [];
  selectedRoomId: string | null = null;
  hotels: Hotel[] = [];
  selectedHotelId: string | null = null;
  floors: string[] = [];
  selectedFloor: string | null = null;
  isLoading = false;
  private isModalOpen = false; // Flag để tránh mở nhiều modal cùng lúc
  private isReloading = false; // Flag để tránh mở modal khi đang reload
  bookings: any[] = []; // Danh sách bookings để hiển thị trên calendar
  
  totalPayment: number = 0;
  totalRevenue: number = 0; // Tổng doanh thu
  totalExpense: number = 0; // Tổng chi
  totalRoomCount: number = 0;
  chartLabels: string[] = [];
  chartRevenueData: number[] = [];
  chartPaymentData: number[] = [];
  chartExpenseData: number[] = []; // Dữ liệu chi cho biểu đồ
  selectedPeriod: 'day' | 'week' | 'month' = 'day'; // Khoảng thời gian cho biểu đồ
  
  // Collapse panel states
  isRevenuePanelActive = true; // Mở mặc định
  isCalendarPanelActive = false;
  isHistoryPanelActive = false;
  
  // Phiếu chi
  isExpenseModalVisible = false;
  expenseForm: FormGroup;
  expenseList: any[] = [];
  expenseLoading = false;
  
  // Phiếu thu
  isIncomeModalVisible = false;
  incomeForm: FormGroup;
  incomeList: any[] = [];
  incomeLoading = false;
  
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
    private invoiceService: InvoiceService,
    private transactionService: TransactionService,
    public authService: AuthService, // Đổi thành public để sử dụng trong template
    private router: Router
  ) {
    this.roomDataUpdatedSubscription = this.roomsService.getRoomDataUpdated$().subscribe(() => {
      // Reload rooms khi có thay đổi dữ liệu
      if (this.selectedHotelId) {
        // Quick reload: chỉ reload rooms, không reload bookings và history
        // Delay một chút để đảm bảo backend đã cập nhật xong (đặc biệt là guestStatus)
        setTimeout(() => {
          this.loadRooms(true);
          // Reload events cho tất cả phòng occupied để cập nhật thông tin mới nhất (bao gồm guestSource)
          setTimeout(() => {
            this.loadEventsForOccupiedRooms(true); // Force reload events
          }, 200); // Đợi một chút để đảm bảo rooms đã được reload
          // Reload lịch sử thanh toán sau khi có thay đổi (ví dụ: checkout)
          if (!this.isModalOpen) {
            setTimeout(() => {
              this.showRoomHistory();
            }, 300); // Đợi một chút để đảm bảo backend đã cập nhật xong
          }
        }, 150); // Delay ban đầu để đảm bảo backend đã lưu guestStatus
      }
    });
    
    this.shiftHandoverForm = this.fb.group({
      fromStaffId: ['', [Validators.required]],
      toStaffId: ['', [Validators.required]],
      cashAmount: [0, [Validators.required, Validators.min(0)]],
      notes: [''],
    });
    
    this.expenseForm = this.fb.group({
      amount: [0, [Validators.required, Validators.min(1)]],
      method: ['cash', [Validators.required]],
      expenseCategory: ['other', [Validators.required]],
      description: ['', [Validators.required]],
      notes: [''],
      recipient: ['']
    });
    
    this.incomeForm = this.fb.group({
      amount: [0, [Validators.required, Validators.min(1)]],
      method: ['cash', [Validators.required]],
      incomeCategory: ['other', [Validators.required]],
      description: ['', [Validators.required]],
      notes: [''],
      payer: ['']
    });
  }

  ngOnInit(): void {
    this.loadHotels();
  }

  // Collapse panel change handlers
  onRevenuePanelChange(active: boolean): void {
    this.isRevenuePanelActive = active;
  }
  
  onCalendarPanelChange(active: boolean): void {
    this.isCalendarPanelActive = active;
  }
  
  onHistoryPanelChange(active: boolean): void {
    this.isHistoryPanelActive = active;
  }
  
  // Expand/Collapse all functions
  expandAllCollapse(): void {
    this.isRevenuePanelActive = true;
    this.isCalendarPanelActive = true;
    this.isHistoryPanelActive = true;
  }
  
  collapseAllCollapse(): void {
    this.isRevenuePanelActive = false;
    this.isCalendarPanelActive = false;
    this.isHistoryPanelActive = false;
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
    
    // Không set isLoading = true để không block UI khi quick reload
    // Chỉ load history, không block UI
    this.roomsService.getRoomHistory(this.selectedHotelId, 'all', 1, 100)
    .subscribe(
      (data) => {
        this.roomTableData = data.history || [];
        this.totalPayment = data.totalPayment || 0;
        this.totalRoomCount = data.totalItems || 0;
        this.loadExpenses();
        // Đợi table component tính toán xong, sau đó lấy totalPayment từ table
        setTimeout(() => {
          this.updateRevenueFromTable();
        }, 100);
        // Load chart data sau (không block)
        setTimeout(() => {
          this.loadChartDataFromAPI();
        }, 0);
      },
      (error) => {
        console.error('Lỗi tải lịch sử phòng:', error);
        // Không hiển thị error message để không làm phiền user
      }
    );
  }
  
  // Load danh sách phiếu chi
  loadExpenses(): void {
    if (!this.selectedHotelId) return;
    
    this.expenseLoading = true;
    this.transactionService.getExpenses({
      hotelId: this.selectedHotelId,
      page: 1,
      limit: 1000
    }).subscribe(
      (data) => {
        this.expenseList = data.data || [];
        this.totalExpense = this.expenseList.reduce((sum, expense) => sum + (expense.amount || 0), 0);
        this.expenseLoading = false;
      },
      (error) => {
        console.error('Error loading expenses:', error);
        this.expenseLoading = false;
      }
    );
  }
  
  // Mở modal phiếu chi
  openExpenseModal(): void {
    if (!this.selectedHotelId) {
      this.message.warning('Vui lòng chọn khách sạn');
      return;
    }
    this.expenseForm.reset({
      amount: 0,
      method: 'cash',
      expenseCategory: 'other',
      description: '',
      notes: '',
      recipient: ''
    });
    this.isExpenseModalVisible = true;
    this.loadExpenses();
  }
  
  // Mở modal phiếu thu
  openIncomeModal(): void {
    if (!this.selectedHotelId) {
      this.message.warning('Vui lòng chọn khách sạn');
      return;
    }
    this.incomeForm.reset({
      amount: 0,
      method: 'cash',
      incomeCategory: 'other',
      description: '',
      notes: '',
      payer: ''
    });
    this.isIncomeModalVisible = true;
    this.loadIncomes();
  }
  
  // Load danh sách phiếu thu
  loadIncomes(): void {
    if (!this.selectedHotelId) return;
    
    this.incomeLoading = true;
    this.transactionService.getIncomes({
      hotelId: this.selectedHotelId,
      page: 1,
      limit: 1000
    }).subscribe(
      (data) => {
        this.incomeList = data.data || [];
        this.incomeLoading = false;
      },
      (error) => {
        console.error('Error loading incomes:', error);
        this.incomeLoading = false;
      }
    );
  }
  
  // Tạo phiếu thu
  submitIncome(): void {
    if (!this.selectedHotelId) {
      this.message.warning('Vui lòng chọn khách sạn');
      return;
    }
    
    if (this.incomeForm.invalid) {
      this.message.warning('Vui lòng điền đầy đủ thông tin');
      return;
    }
    
    const incomeData = {
      hotelId: this.selectedHotelId,
      ...this.incomeForm.value
    };
    
    this.incomeLoading = true;
    this.transactionService.createIncome(incomeData).subscribe(
      (response) => {
        this.message.success('Tạo phiếu thu thành công');
        this.isIncomeModalVisible = false;
        this.loadIncomes();
        this.showRoomHistory(); // Reload để cập nhật biểu đồ
        // Cập nhật lại totalRevenue từ table sau khi tạo phiếu thu
        setTimeout(() => {
          this.updateRevenueFromTable();
        }, 200);
        this.incomeLoading = false;
      },
      (error) => {
        this.message.error('Lỗi tạo phiếu thu: ' + (error.error?.message || error.message));
        this.incomeLoading = false;
      }
    );
  }
  
  // Xóa phiếu thu
  deleteIncome(incomeId: string): void {
    this.modalService.confirm({
      nzTitle: 'Xác nhận xóa',
      nzContent: 'Bạn có chắc chắn muốn xóa phiếu thu này?',
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.transactionService.deleteIncome(incomeId).subscribe(
          () => {
            this.message.success('Xóa phiếu thu thành công');
            this.loadIncomes();
            this.showRoomHistory(); // Reload để cập nhật biểu đồ
            // Cập nhật lại totalRevenue từ table sau khi xóa phiếu thu
            setTimeout(() => {
              this.updateRevenueFromTable();
            }, 200);
          },
          (error) => {
            this.message.error('Lỗi xóa phiếu thu: ' + (error.error?.message || error.message));
          }
        );
      }
    });
  }
  
  // Tạo phiếu chi
  submitExpense(): void {
    if (!this.selectedHotelId) {
      this.message.warning('Vui lòng chọn khách sạn');
      return;
    }
    
    if (this.expenseForm.invalid) {
      this.message.warning('Vui lòng điền đầy đủ thông tin');
      return;
    }
    
    const expenseData = {
      hotelId: this.selectedHotelId,
      ...this.expenseForm.value
    };
    
    this.expenseLoading = true;
    this.transactionService.createExpense(expenseData).subscribe(
      (response) => {
        this.message.success('Tạo phiếu chi thành công');
        this.isExpenseModalVisible = false;
        this.loadExpenses();
        this.showRoomHistory(); // Reload để cập nhật biểu đồ
        // Cập nhật lại totalRevenue từ table sau khi tạo phiếu chi
        setTimeout(() => {
          this.updateRevenueFromTable();
        }, 200);
        this.expenseLoading = false;
      },
      (error) => {
        this.message.error('Lỗi tạo phiếu chi: ' + (error.error?.message || error.message));
        this.expenseLoading = false;
      }
    );
  }
  
  // Xóa phiếu chi
  deleteExpense(expenseId: string): void {
    this.modalService.confirm({
      nzTitle: 'Xác nhận xóa',
      nzContent: 'Bạn có chắc chắn muốn xóa phiếu chi này?',
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.transactionService.deleteExpense(expenseId).subscribe(
          () => {
            this.message.success('Xóa phiếu chi thành công');
            this.loadExpenses();
            this.showRoomHistory(); // Reload để cập nhật biểu đồ
            // Cập nhật lại totalRevenue từ table sau khi xóa phiếu chi
            setTimeout(() => {
              this.updateRevenueFromTable();
            }, 200);
          },
          (error) => {
            this.message.error('Lỗi xóa phiếu chi: ' + (error.error?.message || error.message));
          }
        );
      }
    });
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
      
      // Nếu là staff, tự động set hotelId từ currentUser và không cho phép thay đổi
      if (this.authService.isStaff()) {
        const currentUser = this.authService.getCurrentUser();
        // Lấy hotelId từ user hoặc từ hotels list (nếu backend đã filter)
        const staffHotelId = currentUser?.hotelId || (data.length > 0 ? data[0]._id : null);
        
        if (staffHotelId) {
          this.selectedHotelId = staffHotelId;
          // Chỉ load hotel của staff (backend đã filter, nhưng đảm bảo frontend cũng filter)
          this.hotels = data.filter(hotel => hotel._id === staffHotelId);
          if (this.selectedHotelId) {
            // Load rooms ngay sau khi set hotelId
            this.onHotelChange(this.selectedHotelId);
          }
        } else {
          // Nếu không có hotelId, thử load lại từ API
          console.warn('Staff không có hotelId, kiểm tra lại thông tin nhân viên');
          this.selectedHotelId = null;
          this.rooms = [];
          this.floors = [];
          this.message.warning('Không tìm thấy khách sạn của bạn. Vui lòng liên hệ quản trị viên.');
        }
      } else if (data && data.length > 0) {
        // Các role khác: chọn hotel đầu tiên
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

  loadRooms(quickReload: boolean = false): void {
    if (!this.selectedHotelId) {
      this.rooms = [];
      return;
    }
    
    // Quick reload: chỉ reload rooms, không reload bookings và history
    if (quickReload) {
      this.isReloading = true;
      const params: any = { hotelId: this.selectedHotelId };
      
      this.roomsService.getRooms(params).subscribe(
        (data) => {
          // Đảm bảo guestStatus được giữ nguyên từ backend
          this.rooms = data.map(room => ({
            ...room,
            guestStatus: room.guestStatus || undefined // Đảm bảo guestStatus được set đúng
          }));
          this.updateFloorsFromRooms();
          this.isReloading = false;
          
          // Fetch events cho các phòng đang occupied và booked
          this.loadEventsForOccupiedRooms();
        },
        (error) => {
          console.error('Error reloading rooms:', error);
          this.isReloading = false;
        }
      );
      return;
    }
    
    // Full reload: reload tất cả
    this.isLoading = true;
    this.isReloading = true;
    const params: any = { hotelId: this.selectedHotelId };
    
    // Chạy các API calls song song để tăng tốc
    const roomsRequest = this.roomsService.getRooms(params);
    const bookingsRequest = this.roomsService.getBookings({ hotelId: this.selectedHotelId });
    
    // Sử dụng forkJoin để chạy song song
    forkJoin({
      rooms: roomsRequest,
      bookings: bookingsRequest
    }).subscribe({
      next: (results: any) => {
        // Đảm bảo guestStatus được giữ nguyên từ backend
        this.rooms = results.rooms.map((room: Room) => ({
          ...room,
          guestStatus: room.guestStatus || undefined // Đảm bảo guestStatus được set đúng
        }));
        this.updateFloorsFromRooms();
        this.bookings = results.bookings.bookings || [];
        this.isLoading = false;
        this.isReloading = false;
        
        // Fetch events cho các phòng đang occupied và booked để hiển thị thông tin
        this.loadEventsForOccupiedRooms();
        
        // Load history và chart sau (không block UI)
        setTimeout(() => {
          this.showRoomHistory();
        }, 0);
      },
      error: (error: any) => {
        this.message.error('Lỗi khi tải danh sách phòng: ' + (error.error?.message || error.message));
        this.isLoading = false;
        this.isReloading = false;
      }
    });
  }

  // Load danh sách bookings
  loadBookings(): void {
    if (!this.selectedHotelId) return;
    
    this.roomsService.getBookings({ hotelId: this.selectedHotelId }).subscribe(
      (data) => {
        this.bookings = data.bookings || [];
      },
      (error) => {
        console.error('Error loading bookings:', error);
      }
    );
  }

  onHotelChange(hotelId: string | null): void {
    // Staff không được phép thay đổi hotel
    if (this.authService.isStaff()) {
      const currentUser = this.authService.getCurrentUser();
      if (currentUser?.hotelId && hotelId !== currentUser.hotelId) {
        this.message.warning('Bạn chỉ có thể xem khách sạn của mình');
        this.selectedHotelId = currentUser.hotelId;
        return;
      }
    }
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
    // Không cần reload rooms, chỉ cần filter ở frontend
  }

  // Xử lý thay đổi khoảng thời gian biểu đồ
  onPeriodChange(period: 'day' | 'week' | 'month'): void {
    this.selectedPeriod = period;
    // Reload dữ liệu biểu đồ khi thay đổi khoảng thời gian
    if (this.selectedHotelId) {
      this.loadChartDataFromAPI();
    }
  }
  
  // Cập nhật tổng doanh thu từ table component
  updateRevenueFromTable(): void {
    if (this.tableComponent && this.tableComponent.totalPayment !== undefined) {
      // Lấy totalPayment từ table component (tổng tiền phòng đã thanh toán trong lịch sử)
      // Đây chính là tổng doanh thu từ các phòng đã checkout và thanh toán
      this.totalRevenue = this.tableComponent.totalPayment || 0;
    }
  }
  
  // Load dữ liệu biểu đồ từ API
  loadChartDataFromAPI(): void {
    if (!this.selectedHotelId) return;
    
    this.hotelService.getHotelRevenueByPeriod(this.selectedHotelId, this.selectedPeriod).subscribe(
      (data) => {
        this.chartLabels = data.labels;
        this.chartRevenueData = data.revenueData;
        this.chartPaymentData = data.paymentData;
        this.chartExpenseData = data.expenseData || [];
        // Không cập nhật totalRevenue từ API, giữ nguyên từ table
        // this.totalRevenue = data.totalRevenue;
        this.totalPayment = data.totalPayment;
        this.totalExpense = data.totalExpense || 0;
        
        // Cập nhật lại totalRevenue từ table sau khi load xong
        setTimeout(() => {
          this.updateRevenueFromTable();
        }, 100);
      },
      (error) => {
        console.error('Error loading chart data:', error);
      }
    );
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

  getRoomStatusClass(status: RoomStatus | undefined, guestStatus?: string): string {
    if (!status) return 'inactive-room';
    
    // Nếu phòng occupied và khách ra ngoài, dùng class đặc biệt
    if (status === 'occupied' && guestStatus === 'out') {
      return 'occupied-guest-out-room';
    }
    
    const option = this.roomStatusDisplayOptions.find(opt => opt.value === status);
    return option ? `${option.value}-room` : 'inactive-room';
  }

  getRoomStatusLabelAndColor(status: RoomStatus | undefined): { label: string, color: string } {
    if (!status) return { label: 'Không xác định', color: 'default' };
    const option = this.roomStatusDisplayOptions.find(opt => opt.value === status);
    return option ? { label: option.label, color: option.color } : { label: status, color: 'default' };
  }

  // Lấy label và màu cho nguồn khách
  getGuestSourceLabelAndColor(guestSource: string | undefined): { label: string, color: string } {
    if (!guestSource) return { label: 'Walk-in', color: 'default' };
    
    const sourceMap: { [key: string]: { label: string, color: string } } = {
      'walkin': { label: 'Walk-in', color: 'blue' },
      'booking': { label: 'Booking', color: 'green' },
      'agoda': { label: 'Agoda', color: 'orange' },
      'traveloka': { label: 'Traveloka', color: 'purple' },
      'expedia': { label: 'Expedia', color: 'cyan' },
      'trip': { label: 'Trip.com', color: 'magenta' },
      'g2j': { label: 'G2J', color: 'gold' },
      'other': { label: 'Khác', color: 'default' }
    };
    
    return sourceMap[guestSource] || { label: guestSource, color: 'default' };
  }

  getHotelName(hotelId: string | undefined): string {
    if (!hotelId) return '';
    const hotel = this.hotels.find(h => h._id === hotelId);
    return hotel ? hotel.name : '';
  }
  
  // Format số cho input number
  formatNumber = (value: number): string => {
    if (value == null) return '';
    return new Intl.NumberFormat('vi-VN', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    }).format(value);
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
    
    // Tránh mở nhiều modal cùng lúc hoặc khi đang reload
    if (this.isModalOpen || this.isReloading) {
      return;
    }
    
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation(); // Ngăn các handler khác
    
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
      this.isModalOpen = true;
      
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
        // Reset flag trước
        this.isModalOpen = false;
        
        // Delay notify để tránh trigger mở modal lại
        setTimeout(() => {
          // Chỉ notify nếu không có modal mới được mở
          if (!this.isModalOpen) {
            this.roomsService.notifyRoomDataUpdated();
          }
        }, 300);
      });
    } catch (error) {
      console.error('Error creating modal:', error);
      this.isModalOpen = false;
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

  // Đếm số lượng phòng trống
  getVacantRoomCount(): number {
    return this.rooms.filter(room => room.status === 'vacant').length;
  }

  // Đếm số lượng phòng đang ở
  getOccupiedRoomCount(): number {
    return this.rooms.filter(room => room.status === 'occupied').length;
  }

  // Đếm số lượng phòng đang bẩn
  getDirtyRoomCount(): number {
    return this.rooms.filter(room => room.status === 'dirty').length;
  }

  // Đếm số lượng phòng sửa chữa
  getMaintenanceRoomCount(): number {
    return this.rooms.filter(room => room.status === 'maintenance').length;
  }

  // Đếm số lượng phòng đã đặt
  getBookedRoomCount(): number {
    return this.rooms.filter(room => room.status === 'booked').length;
  }

  // Đếm số lượng phòng có khách ra ngoài
  getGuestOutRoomCount(): number {
    return this.rooms.filter(room => room.status === 'occupied' && room.guestStatus === 'out').length;
  }

  // Lấy icon phòng theo trạng thái
  getRoomIcon(room: Room): string {
    // Nếu phòng đang occupied và khách ra ngoài
    if (room.status === 'occupied' && room.guestStatus === 'out') {
      return 'logout';
    }
    
    // Icon theo trạng thái phòng
    switch (room.status) {
      case 'vacant':
        return 'home';
      case 'occupied':
        return 'user';
      case 'dirty':
        return 'clear';
      case 'maintenance':
        return 'setting';
      case 'booked':
        return 'calendar';
      case 'cleaning':
        return 'clear';
      default:
        return 'home';
    }
  }

  // Nhóm phòng theo tầng (có filter theo selectedFloor nếu có)
  getRoomsByFloor(): { [floor: string]: Room[] } {
    const grouped: { [floor: string]: Room[] } = {};
    
    // Filter rooms theo selectedFloor nếu có
    const filteredRooms = this.selectedFloor 
      ? this.rooms.filter(room => (room.floor || '0') === this.selectedFloor)
      : this.rooms;
    
    filteredRooms.forEach(room => {
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

  // Lấy danh sách tầng đã sắp xếp (có filter theo selectedFloor nếu có)
  getSortedFloors(): string[] {
    // Nếu đã chọn tầng, chỉ trả về tầng đó
    if (this.selectedFloor) {
      // Kiểm tra xem tầng đã chọn có phòng không
      const hasRooms = this.rooms.some(room => (room.floor || '0') === this.selectedFloor);
      return hasRooms ? [this.selectedFloor] : [];
    }
    
    // Nếu chưa chọn tầng, trả về tất cả tầng có phòng
    const floors = new Set<string>();
    this.rooms.forEach(room => {
      if (room.floor) {
        floors.add(room.floor);
      } else {
        floors.add('0');
      }
    });
    return Array.from(floors).sort((a, b) => {
      const numA = parseInt(a) || 0;
      const numB = parseInt(b) || 0;
      return numA - numB;
    });
  }

  // Lấy tên hiển thị cho tầng
  getFloorDisplayName(floor: string): string {
    if (floor === '0' || floor === '') {
      return 'Trệt';
    }
    return `Tầng ${floor}`;
  }

  // Cập nhật danh sách tầng từ phòng thực tế
  updateFloorsFromRooms(): void {
    const floorsSet = new Set<string>();
    this.rooms.forEach(room => {
      const floor = room.floor || '0';
      floorsSet.add(floor);
    });
    this.floors = Array.from(floorsSet).sort((a, b) => {
      const numA = parseInt(a) || 0;
      const numB = parseInt(b) || 0;
      return numA - numB;
    });
  }

  // Lấy thông tin chuyển phòng từ Booking
  getBookingTransferInfo(room: Room): {
    fromRoomId?: string;
    fromRoomNumber?: string;
    toRoomId?: string;
    toRoomNumber?: string;
    transferredAt?: Date;
    transferredBy?: string;
    transferHistory?: any[];
  } | null {
    if (!room.currentBooking) return null;
    
    // Nếu currentBooking là Booking đầy đủ
    const booking = room.currentBooking as any;
    
    // Kiểm tra từ transferHistory trước (nếu có nhiều lần chuyển)
    if (booking.transferHistory && Array.isArray(booking.transferHistory) && booking.transferHistory.length > 0) {
      const firstTransfer = booking.transferHistory[0];
      const lastTransfer = booking.transferHistory[booking.transferHistory.length - 1];
      
      return {
        fromRoomId: firstTransfer.fromRoomId?.toString() || booking.transferredFrom?.toString(),
        fromRoomNumber: firstTransfer.fromRoomNumber || this.getRoomNumberById(firstTransfer.fromRoomId?.toString() || booking.transferredFrom?.toString() || '') || 'N/A',
        toRoomId: lastTransfer.toRoomId?.toString() || booking.transferredTo?.toString() || room._id?.toString(),
        toRoomNumber: lastTransfer.toRoomNumber || this.getRoomNumberById(lastTransfer.toRoomId?.toString() || booking.transferredTo?.toString() || '') || room.roomNumber || 'N/A',
        transferredAt: lastTransfer.transferredAt ? new Date(lastTransfer.transferredAt) : (booking.transferredAt ? new Date(booking.transferredAt) : undefined),
        transferredBy: lastTransfer.transferredBy || booking.transferredBy,
        transferHistory: booking.transferHistory
      };
    }
    
    // Nếu không có transferHistory, lấy từ transferredFrom/transferredTo
    if (booking.transferredFrom || booking.transferredTo) {
      return {
        fromRoomId: booking.transferredFrom?.toString(),
        fromRoomNumber: this.getRoomNumberById(booking.transferredFrom?.toString() || '') || 'N/A',
        toRoomId: booking.transferredTo?.toString() || room._id?.toString(),
        toRoomNumber: this.getRoomNumberById(booking.transferredTo?.toString() || '') || room.roomNumber || 'N/A',
        transferredAt: booking.transferredAt ? new Date(booking.transferredAt) : undefined,
        transferredBy: booking.transferredBy,
        transferHistory: booking.transferHistory || []
      };
    }
    
    return null;
  }

  // Lấy thông tin booking của phòng
  getRoomBookingInfo(room: Room): {
    guestName: string;
    checkInDate: string;
    checkOutDate: string;
    rateTypeLabel: string;
  } | null {
    if (room.status !== 'booked') {
      return null;
    }
    
    // Lấy từ currentBooking nếu có (ưu tiên)
    if (room.currentBooking) {
      const checkInDate = room.currentBooking.checkInDate 
        ? new Date(room.currentBooking.checkInDate)
        : null;
      const checkOutDate = room.currentBooking.checkOutDate 
        ? new Date(room.currentBooking.checkOutDate)
        : null;
      
      const rateTypeLabels: {[key: string]: string} = {
        'hourly': 'Theo giờ',
        'daily': 'Ngày đêm',
        'nightly': 'Qua đêm'
      };
      // Lấy rateType từ bookingType hoặc rateType (tương thích cả hai)
      const currentBooking = room.currentBooking as any;
      const rateType = currentBooking?.rateType || currentBooking?.bookingType || 'hourly';
      const rateTypeLabel = rateTypeLabels[rateType] || 'Theo giờ';
      
      const checkInDateStr = checkInDate 
        ? `${checkInDate.getHours().toString().padStart(2, '0')}:${checkInDate.getMinutes().toString().padStart(2, '0')} ${checkInDate.getDate().toString().padStart(2, '0')}/${(checkInDate.getMonth() + 1).toString().padStart(2, '0')}/${checkInDate.getFullYear()}`
        : '';
      
      const checkOutDateStr = checkOutDate 
        ? `${checkOutDate.getHours().toString().padStart(2, '0')}:${checkOutDate.getMinutes().toString().padStart(2, '0')} ${checkOutDate.getDate().toString().padStart(2, '0')}/${(checkOutDate.getMonth() + 1).toString().padStart(2, '0')}/${checkOutDate.getFullYear()}`
        : '';
      
      // Lấy guestName từ guestInfo hoặc guestDetails (tương thích cả hai)
      const guestName = currentBooking?.guestInfo?.name 
        || currentBooking?.guestDetails?.name 
        || 'Khách đặt trước';
      
      return {
        guestName: guestName,
        checkInDate: checkInDateStr,
        checkOutDate: checkOutDateStr,
        rateTypeLabel: rateTypeLabel
      };
    }
    
    // Lấy từ events nếu có
    if (room.events && room.events.length > 0) {
      const bookingEvent = room.events.find(e => e.type === 'booking');
      if (bookingEvent) {
        const checkInDate = bookingEvent.checkinTime ? new Date(bookingEvent.checkinTime) : null;
        const expectedCheckoutTime = bookingEvent.expectedCheckoutTime ? new Date(bookingEvent.expectedCheckoutTime) : null;
        
        const rateTypeLabels: {[key: string]: string} = {
          'hourly': 'Theo giờ',
          'daily': 'Ngày đêm',
          'nightly': 'Qua đêm'
        };
        const rateTypeLabel = rateTypeLabels[bookingEvent.rateType || 'hourly'] || 'Theo giờ';
        
        const checkInDateStr = checkInDate 
          ? `${checkInDate.getHours().toString().padStart(2, '0')}:${checkInDate.getMinutes().toString().padStart(2, '0')} ${checkInDate.getDate().toString().padStart(2, '0')}/${(checkInDate.getMonth() + 1).toString().padStart(2, '0')}/${checkInDate.getFullYear()}`
          : '';
        
        const checkOutDateStr = expectedCheckoutTime 
          ? `${expectedCheckoutTime.getHours().toString().padStart(2, '0')}:${expectedCheckoutTime.getMinutes().toString().padStart(2, '0')} ${expectedCheckoutTime.getDate().toString().padStart(2, '0')}/${(expectedCheckoutTime.getMonth() + 1).toString().padStart(2, '0')}/${expectedCheckoutTime.getFullYear()}`
          : '';
        
        return {
          guestName: bookingEvent.guestInfo?.name || 'Khách đặt trước',
          checkInDate: checkInDateStr,
          checkOutDate: checkOutDateStr,
          rateTypeLabel: rateTypeLabel
        };
      }
    }
    
    return null;
  }

  // Lấy thông tin chi tiết của phòng để hiển thị (giống hình)
  getRoomDisplayInfo(room: Room): {
    checkinTime: string;
    customerName: string;
    rateTypeLabel: string;
    totalAmount: number;
    advancePayment: number;
    remainingAmount: number;
    guestSource: string;
    transferredFrom?: string;
    transferredAt?: Date;
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
    
    // Tổng tiền = tiền phòng + tiền dịch vụ + phụ thu - chiết khấu (đồng bộ với room-content-modal)
    const subtotal = checkinInfo.roomPrice + checkinInfo.serviceAmount;
    const totalAmount = Math.max(0, subtotal + checkinInfo.additionalCharges - checkinInfo.discount);
    
    return {
      checkinTime: checkinTimeStr,
      customerName: checkinInfo.guestName,
      rateTypeLabel: checkinInfo.rateTypeLabel,
      totalAmount: totalAmount,
      advancePayment: checkinInfo.advancePayment,
      remainingAmount: checkinInfo.remainingAmount,
      guestSource: checkinInfo.guestSource || 'walkin',
      transferredFrom: checkinInfo.transferredFrom,
      transferredAt: checkinInfo.transferredAt
    };
  }

  // Load events cho các phòng đang occupied và booked
  loadEventsForOccupiedRooms(forceReload: boolean = false): void {
    // Nếu forceReload = true, reload events cho tất cả phòng occupied/booked
    // Nếu false, chỉ load cho phòng chưa có events
    const occupiedRooms = this.rooms.filter(room => {
      if (!room._id) return false;
      if (room.status !== 'occupied' && room.status !== 'booked') return false;
      if (forceReload) return true; // Reload tất cả nếu forceReload
      return !room.events || room.events.length === 0; // Chỉ load nếu chưa có events
    });
    
    if (occupiedRooms.length === 0) return;
    
    // Fetch events cho tất cả phòng occupied cùng lúc
    const eventRequests = occupiedRooms.map(room => {
      const eventType = room.status === 'occupied' ? 'checkin' : 'booking';
      return this.roomsService.getRoomEvents(room._id!, { limit: 10, type: eventType })
        .pipe(
          // Map kết quả với roomId để biết events thuộc phòng nào
          map(events => ({ roomId: room._id, events }))
        );
    });
    
    // Chạy tất cả requests song song
    forkJoin(eventRequests).subscribe({
      next: (results) => {
        results.forEach(({ roomId, events }) => {
          const roomIndex = this.rooms.findIndex(r => r._id === roomId);
          if (roomIndex !== -1) {
            // Đảm bảo events có đầy đủ thông tin, bao gồm transferredFrom và transferredAt
            this.rooms[roomIndex].events = events.map(event => ({
              ...event,
              // Đảm bảo transferredFrom được convert đúng sang string (có thể là ObjectId)
              transferredFrom: event.transferredFrom 
                ? (typeof event.transferredFrom === 'object' 
                  ? (event.transferredFrom as any)?._id?.toString() || (event.transferredFrom as any)?.toString()
                  : event.transferredFrom.toString())
                : undefined,
              transferredAt: event.transferredAt ? new Date(event.transferredAt) : undefined,
              transferredBy: event.transferredBy
                ? (typeof event.transferredBy === 'object'
                  ? (event.transferredBy as any)?._id?.toString() || (event.transferredBy as any)?.toString()
                  : event.transferredBy.toString())
                : undefined
            }));
          }
        });
      },
      error: (error) => {
        console.error('Error loading events for occupied rooms:', error);
      }
    });
  }

  // Lấy thông tin checkin của phòng đang có khách
  getRoomCheckinInfo(room: Room): { 
    guestName: string; 
    checkinTime: Date | null; 
    roomPrice: number; 
    serviceAmount: number;
    additionalCharges: number;
    advancePayment: number;
    discount: number;
    remainingAmount: number;
    rateType: string;
    rateTypeLabel: string;
    guestSource: string;
    transferredFrom?: string;
    transferredAt?: Date;
  } | null {
    if (room.status !== 'occupied') {
      return null;
    }
    
    // Nếu không có events, return null (events sẽ được load bởi loadEventsForOccupiedRooms)
    if (!room.events || room.events.length === 0) {
      return null;
    }

    // Tìm event checkin cuối cùng CHƯA CHECKOUT (sắp xếp theo thời gian để lấy mới nhất)
    // Lọc các event check-in chưa có checkout tương ứng
    if (!room.events || room.events.length === 0) {
      return null;
    }
    
    const checkinEvents = room.events
      .filter(e => {
        if (e.type !== 'checkin') return false;
        
        // Kiểm tra xem có event checkout nào tương ứng với checkin này không
        const hasCheckout = room.events?.some((checkoutEvent: any) => {
          if (checkoutEvent.type !== 'checkout') return false;
          
          // So sánh checkinTime: chuyển về Date object và so sánh timestamp
          const checkoutCheckinTime = checkoutEvent.checkinTime ? new Date(checkoutEvent.checkinTime).getTime() : null;
          const eventCheckinTime = e.checkinTime ? new Date(e.checkinTime).getTime() : null;
          
          // Nếu có checkinTime và khớp chính xác (trong vòng 1 giây để tránh lỗi làm tròn)
          if (checkoutCheckinTime && eventCheckinTime) {
            return Math.abs(checkoutCheckinTime - eventCheckinTime) < 1000; // Trong vòng 1 giây
          }
          
          return false;
        }) || false;
        
        // Chỉ lấy event check-in chưa có checkout
        return !hasCheckout;
      })
      .sort((a, b) => {
        const timeA = a.checkinTime ? new Date(a.checkinTime).getTime() : 0;
        const timeB = b.checkinTime ? new Date(b.checkinTime).getTime() : 0;
        return timeB - timeA; // Sắp xếp giảm dần (mới nhất trước)
      });
    
    if (checkinEvents.length === 0) return null;
    
    const lastCheckin = checkinEvents[0]; // Lấy event mới nhất chưa checkout
    const checkinTime = lastCheckin.checkinTime ? new Date(lastCheckin.checkinTime) : null;
    const rateType = lastCheckin.rateType || 'hourly';
    
    // Lấy label cho loại giá
    const rateTypeLabels: {[key: string]: string} = {
      'hourly': 'Theo giờ',
      'daily': 'Ngày đêm',
      'nightly': 'Qua đêm'
    };
    const rateTypeLabel = rateTypeLabels[rateType] || 'Theo giờ';
    
    // Tính tiền phòng dựa trên thời gian (ước tính đơn giản để hiển thị)
    // Tính toán chính xác sẽ được thực hiện bởi backend khi checkout
    let roomPrice = 0;
    if (checkinTime) {
      const now = new Date();
      const durationInHours = Math.ceil((now.getTime() - checkinTime.getTime()) / (1000 * 60 * 60));
      const durationInDays = Math.ceil(durationInHours / 24);
      
      // Lấy giá từ room pricing (đã được backend cập nhật từ priceConfig nếu có)
      const hourlyRate = room.pricing?.hourly || room.firstHourRate || 0;
      const dailyRate = room.pricing?.daily || 0;
      const nightlyRate = room.pricing?.nightly || 0;
      const additionalHourRate = room.additionalHourRate || (hourlyRate * 0.8);
      
      // Tính giá ước tính để hiển thị (theo logic backend priceConfig.js)
      // Logic chính xác sẽ được backend xử lý khi checkout
      switch (rateType) {
        case 'hourly':
          // Tính giá giờ đầu + các giờ tiếp theo (ước tính)
          if (room.firstHourRate && room.additionalHourRate) {
            roomPrice = room.firstHourRate;
            if (durationInHours > 1) {
              roomPrice += (durationInHours - 1) * room.additionalHourRate;
            }
          } else {
            roomPrice = hourlyRate * durationInHours;
          }
          break;
        case 'daily':
          // Theo backend: tính số ngày dựa trên ngày thực tế (qua đêm)
          const checkInDateOnly = checkinTime ? new Date(checkinTime) : new Date();
          checkInDateOnly.setHours(0, 0, 0, 0);
          const checkOutDateOnly = new Date();
          checkOutDateOnly.setHours(0, 0, 0, 0);
          const actualDays = Math.max(1, Math.ceil((checkOutDateOnly.getTime() - checkInDateOnly.getTime()) / (1000 * 60 * 60 * 24)));
          const dailyDays = actualDays;
          roomPrice = dailyRate * dailyDays;
          
          // Tính phụ thu check-in sớm (nếu có)
          const priceConfigDaily = (room as any)?.priceConfig;
          const dailyCheckInTime = priceConfigDaily?.dailyRates?.checkInTime || room.priceSettings?.dailyStartTime || '14:00';
          const dailyCheckOutTime = priceConfigDaily?.dailyRates?.checkOutTime || room.priceSettings?.dailyEndTime || '12:00';
          // Ưu tiên lấy từ priceConfig, fallback về room.priceSettings
          const dailyEarlyCheckinSurcharge = priceConfigDaily?.dailyRates?.earlyCheckinSurcharge || 
                                            room.priceSettings?.dailyEarlyCheckinSurcharge || 0;
          const dailyLateCheckoutFee = priceConfigDaily?.dailyRates?.latecheckOutFee || 
                                      room.priceSettings?.dailyLateCheckoutFee || 0;
          
          if (checkinTime && dailyEarlyCheckinSurcharge > 0) {
            const [checkInHour, checkInMinute] = dailyCheckInTime.split(':').map(Number);
            const checkInMinutes = checkinTime.getHours() * 60 + checkinTime.getMinutes();
            const standardCheckInMinutes = checkInHour * 60 + checkInMinute;
            if (checkInMinutes < standardCheckInMinutes) {
              const earlyHours = Math.ceil((standardCheckInMinutes - checkInMinutes) / 60);
              roomPrice += earlyHours * dailyEarlyCheckinSurcharge;
            }
          }
          
          // Tính phụ thu check-out trễ (nếu có)
          if (dailyLateCheckoutFee > 0) {
            const [checkOutHour, checkOutMinute] = dailyCheckOutTime.split(':').map(Number);
            const checkOutMinutes = now.getHours() * 60 + now.getMinutes();
            const standardCheckOutMinutes = checkOutHour * 60 + checkOutMinute;
            if (checkOutMinutes > standardCheckOutMinutes) {
              const lateHours = Math.ceil((checkOutMinutes - standardCheckOutMinutes) / 60);
              roomPrice += lateHours * dailyLateCheckoutFee;
            }
          }
          break;
        case 'nightly':
          // Theo backend: tính số đêm dựa trên đêm thực tế (qua đêm)
          const checkInDateForNightly = checkinTime ? new Date(checkinTime) : new Date();
          checkInDateForNightly.setHours(0, 0, 0, 0);
          const checkOutDateForNightly = new Date();
          checkOutDateForNightly.setHours(0, 0, 0, 0);
          const actualNights = Math.max(1, Math.ceil((checkOutDateForNightly.getTime() - checkInDateForNightly.getTime()) / (1000 * 60 * 60 * 24)));
          const nightlyNights = actualNights;
          roomPrice = nightlyRate * nightlyNights;
          
          // Lấy priceConfig để tính surcharges nếu có
          const priceConfigNightly = (room as any)?.priceConfig;
          const nightlyStartTime = priceConfigNightly?.nightlyRates?.startTime || room.priceSettings?.nightlyStartTime || '22:00';
          const nightlyEndTime = priceConfigNightly?.nightlyRates?.endTime || room.priceSettings?.nightlyEndTime || '12:00';
          // Ưu tiên lấy từ priceConfig, fallback về room.priceSettings
          const earlyCheckinSurcharge = priceConfigNightly?.nightlyRates?.earlyCheckinSurcharge || 
                                       room.priceSettings?.nightlyEarlyCheckinSurcharge || 0;
          const lateCheckoutSurcharge = priceConfigNightly?.nightlyRates?.lateCheckoutSurcharge || 
                                       room.priceSettings?.nightlyLateCheckoutSurcharge || 0;
          
          // Tính phụ thu check-in sớm (nếu check-in trước nightlyStartTime)
          if (checkinTime && earlyCheckinSurcharge > 0) {
            const [startHour, startMinute] = nightlyStartTime.split(':').map(Number);
            const checkInMinutes = checkinTime.getHours() * 60 + checkinTime.getMinutes();
            const startTimeMinutes = startHour * 60 + startMinute;
            if (checkInMinutes < startTimeMinutes) {
              const earlyHours = Math.ceil((startTimeMinutes - checkInMinutes) / 60);
              roomPrice += earlyHours * earlyCheckinSurcharge;
            }
          }
          
          // Tính phụ thu check-out trễ (nếu check-out sau nightlyEndTime)
          if (lateCheckoutSurcharge > 0) {
            const [endHour, endMinute] = nightlyEndTime.split(':').map(Number);
            const checkOutMinutes = now.getHours() * 60 + now.getMinutes();
            const endTimeMinutes = endHour * 60 + endMinute;
            if (checkOutMinutes > endTimeMinutes) {
              const lateHours = Math.ceil((checkOutMinutes - endTimeMinutes) / 60);
              roomPrice += lateHours * lateCheckoutSurcharge;
            }
          }
          break;
        default:
          roomPrice = hourlyRate * durationInHours;
      }
    }
    
    // Lấy advancePayment từ event, đảm bảo parse đúng kiểu số
    let advancePayment = 0;
    if (lastCheckin.advancePayment !== undefined && lastCheckin.advancePayment !== null) {
      advancePayment = typeof lastCheckin.advancePayment === 'number' 
        ? lastCheckin.advancePayment 
        : Number(lastCheckin.advancePayment) || 0;
    }
    
    // Lấy tên khách hàng từ nhiều nguồn
    let guestName = 'Khách lẻ';
    
    // Ưu tiên 1: Từ lastCheckin.guestInfo
    if (lastCheckin.guestInfo?.name && lastCheckin.guestInfo.name !== 'Khách lẻ') {
      guestName = lastCheckin.guestInfo.name;
    }
    
    // Ưu tiên 2: Từ room.currentBooking nếu có
    if ((!guestName || guestName === 'Khách lẻ') && room.currentBooking) {
      const currentBooking = typeof room.currentBooking === 'object' ? room.currentBooking : null;
      const bookingAny = currentBooking as any;
      // Kiểm tra guestInfo trước (tương thích với code cũ)
      if (bookingAny?.guestInfo?.name && bookingAny.guestInfo.name !== 'Khách lẻ') {
        guestName = bookingAny.guestInfo.name;
      } else if (bookingAny?.guestDetails?.name && bookingAny.guestDetails.name !== 'Khách lẻ') {
        // Kiểm tra guestDetails (từ Booking model)
        guestName = bookingAny.guestDetails.name;
      }
    }
    
    // Lấy nguồn khách từ event
    const guestSource = lastCheckin.guestInfo?.guestSource || 'walkin';
    
    // Tính tiền dịch vụ từ selectedServices (đồng bộ với room-content-modal)
    let serviceAmount = 0;
    if (lastCheckin.selectedServices && Array.isArray(lastCheckin.selectedServices)) {
      serviceAmount = lastCheckin.selectedServices.reduce((sum: number, service: any) => {
        // Sử dụng totalPrice nếu có (giống room-content-modal), nếu không thì tính từ price và quantity
        const serviceAmount = service.totalPrice !== undefined 
          ? service.totalPrice 
          : (service.price || service.unitPrice || 0) * (service.quantity || 1);
        return sum + serviceAmount;
      }, 0);
    }
    
    // Lấy phụ thu từ event (đồng bộ với room-content-modal)
    let additionalCharges = 0;
    if (lastCheckin.additionalCharges !== undefined && lastCheckin.additionalCharges !== null) {
      additionalCharges = typeof lastCheckin.additionalCharges === 'number' 
        ? lastCheckin.additionalCharges 
        : Number(lastCheckin.additionalCharges) || 0;
    }
    
    // Lấy chiết khấu nếu có, mặc định = 0 (đồng bộ với room-content-modal)
    const discount = lastCheckin.discount !== undefined && lastCheckin.discount !== null
      ? (typeof lastCheckin.discount === 'number'
        ? lastCheckin.discount
        : Number(lastCheckin.discount) || 0)
      : 0;
    
    // Tính tổng tiền = tiền phòng + tiền dịch vụ + phụ thu - chiết khấu (đồng bộ với room-content-modal)
    // Công thức: subtotal = roomPrice + serviceAmount, totalAmount = subtotal + additionalCharges - discount
    const subtotal = roomPrice + serviceAmount;
    const totalAmount = Math.max(0, subtotal + additionalCharges - discount);

    // Cho phép giá trị âm (khi đặt trước nhiều hơn tổng tiền)
    const remainingAmount = totalAmount - advancePayment;

    // Lấy thông tin chuyển phòng từ nhiều nguồn
    let transferredFrom: string | undefined = undefined;
    let transferredAt: Date | undefined = undefined;
    
    // Ưu tiên 1: Từ checkin event (RoomEvent collection)
    if (lastCheckin.transferredFrom) {
      // Đảm bảo convert đúng sang string (có thể là ObjectId hoặc string)
      transferredFrom = typeof lastCheckin.transferredFrom === 'object' 
        ? (lastCheckin.transferredFrom as any)?._id?.toString() || (lastCheckin.transferredFrom as any)?.toString()
        : lastCheckin.transferredFrom.toString();
      transferredAt = lastCheckin.transferredAt ? new Date(lastCheckin.transferredAt) : undefined;
    }
    
    // Ưu tiên 2: Từ currentBooking nếu không có trong event
    if (!transferredFrom && room.currentBooking) {
      const currentBooking = typeof room.currentBooking === 'object' ? room.currentBooking : null;
      const bookingAny = currentBooking as any;
      
      // Kiểm tra transferHistory trước (nếu có nhiều lần chuyển)
      if (bookingAny?.transferHistory && Array.isArray(bookingAny.transferHistory) && bookingAny.transferHistory.length > 0) {
        const lastTransfer = bookingAny.transferHistory[bookingAny.transferHistory.length - 1];
        if (lastTransfer.fromRoomId) {
          transferredFrom = typeof lastTransfer.fromRoomId === 'object'
            ? (lastTransfer.fromRoomId as any)?._id?.toString() || (lastTransfer.fromRoomId as any)?.toString()
            : lastTransfer.fromRoomId.toString();
          transferredAt = lastTransfer.transferredAt ? new Date(lastTransfer.transferredAt) : undefined;
        }
      }
      
      // Nếu không có trong transferHistory, lấy từ transferredFrom trực tiếp
      if (!transferredFrom && bookingAny?.transferredFrom) {
        transferredFrom = typeof bookingAny.transferredFrom === 'object'
          ? (bookingAny.transferredFrom as any)?._id?.toString() || (bookingAny.transferredFrom as any)?.toString()
          : bookingAny.transferredFrom.toString();
        transferredAt = bookingAny.transferredAt ? new Date(bookingAny.transferredAt) : undefined;
      }
    }
    
    return {
      guestName: guestName,
      checkinTime: checkinTime,
      discount: discount,
      roomPrice: Math.round(roomPrice),
      serviceAmount: Math.round(serviceAmount),
      additionalCharges: Math.round(additionalCharges),
      advancePayment: advancePayment,
      remainingAmount: Math.round(remainingAmount),
      rateType: rateType,
      rateTypeLabel: rateTypeLabel,
      guestSource: guestSource,
      transferredFrom: transferredFrom,
      transferredAt: transferredAt
    };
  }

  // Lấy số phòng theo ID
  getRoomNumberById(roomId: string): string | null {
    const room = this.rooms.find(r => r._id === roomId);
    return room ? room.roomNumber : null;
  }

  // Lấy nguồn khách từ phòng
  getRoomGuestSource(room: Room): string {
    if (room.status !== 'occupied') return 'walkin';
    
    // Ưu tiên 1: Từ events (checkin event)
    const checkinInfo = this.getRoomCheckinInfo(room);
    if (checkinInfo?.guestSource) {
      return checkinInfo.guestSource;
    }
    
    // Ưu tiên 2: Từ currentBooking nếu có
    if (room.currentBooking) {
      const currentBooking = typeof room.currentBooking === 'object' ? room.currentBooking : null;
      const bookingAny = currentBooking as any;
      // Kiểm tra guestInfo trước (tương thích với code cũ)
      if (bookingAny?.guestInfo?.guestSource) {
        return bookingAny.guestInfo.guestSource;
      } else if (bookingAny?.guestDetails) {
        // Booking model không có guestSource trong guestDetails, nhưng có thể có trong metadata
        // Hoặc có thể lấy từ source field
        return bookingAny.source === 'walk_in' ? 'walkin' : (bookingAny.source || 'walkin');
      }
    }
    
    // Mặc định
    return 'walkin';
  }

  // Xử lý khi chọn ngày từ calendar để đặt phòng
  onCalendarDateSelected(event: { date: Date, roomId?: string }): void {
    // Tìm phòng nếu có roomId, nếu không thì mở modal chọn phòng
    if (event.roomId) {
      const room = this.rooms.find(r => r._id === event.roomId);
      if (room && room.status === 'vacant') {
        // Mở modal đặt phòng cho phòng cụ thể
        this.openBookingModal(room, event.date);
      }
    } else {
      // Mở modal chọn phòng và đặt phòng
      this.openBookingModalForDate(event.date);
    }
  }

  // Kiểm tra phòng có thể đặt được vào ngày cụ thể
  isRoomAvailableForDate(room: Room, checkInDate: Date, checkOutDate?: Date): boolean {
    // Nếu phòng đang occupied, kiểm tra xem ngày đặt có trùng không
    if (room.status === 'occupied') {
      const lastCheckinEvent = room.events?.filter(e => e.type === 'checkin').pop();
      if (lastCheckinEvent && lastCheckinEvent.checkinTime) {
        const occupiedCheckIn = new Date(lastCheckinEvent.checkinTime);
        const now = new Date();
        
        // Nếu ngày đặt trong quá khứ hoặc trùng với thời gian occupied, không thể đặt
        if (checkOutDate) {
          if (new Date(checkOutDate) <= occupiedCheckIn) {
            return true; // Ngày đặt trước thời gian occupied
          }
        }
        if (checkInDate >= now && checkInDate > occupiedCheckIn) {
          return true; // Ngày đặt trong tương lai và sau thời gian occupied
        }
        return false; // Trùng với thời gian occupied
      }
      return false; // Đang occupied và không có thông tin checkin
    }
    
    // Kiểm tra conflict với bookings khác
    if (room.events && room.events.length > 0) {
      const bookingEvents = room.events.filter(e => e.type === 'booking');
      for (const booking of bookingEvents) {
        if (booking.checkinTime && booking.expectedCheckoutTime) {
          const existingCheckIn = new Date(booking.checkinTime);
          const existingCheckOut = new Date(booking.expectedCheckoutTime);
          
          const hasOverlap = (
            (checkInDate >= existingCheckIn && checkInDate < existingCheckOut) ||
            (checkOutDate && new Date(checkOutDate) > existingCheckIn && new Date(checkOutDate) <= existingCheckOut) ||
            (checkInDate <= existingCheckIn && checkOutDate && new Date(checkOutDate) >= existingCheckOut)
          );
          
          if (hasOverlap) {
            return false;
          }
        }
      }
    }
    
    // Kiểm tra currentBooking
    if (room.currentBooking && room.status === 'booked' && room.currentBooking.checkInDate) {
      const currentCheckIn = new Date(room.currentBooking.checkInDate);
      const currentCheckOut = room.currentBooking.checkOutDate ? new Date(room.currentBooking.checkOutDate) : null;
      
      if (currentCheckOut) {
        const hasOverlap = (
          (checkInDate >= currentCheckIn && checkInDate < currentCheckOut) ||
          (checkOutDate && new Date(checkOutDate) > currentCheckIn && new Date(checkOutDate) <= currentCheckOut) ||
          (checkInDate <= currentCheckIn && checkOutDate && new Date(checkOutDate) >= currentCheckOut)
        );
        
        if (hasOverlap) {
          return false;
        }
      }
    }
    
    return true;
  }

  // Mở modal đặt phòng cho phòng cụ thể
  openBookingModalForDate(date: Date): void {
    const modalRef: NzModalRef = this.modalService.create({
      nzTitle: `Đặt phòng cho ngày ${date.toLocaleDateString('vi-VN')}`,
      nzContent: BookingModalComponent,
      nzData: {
        selectedDate: date,
        hotelId: this.selectedHotelId,
        rooms: this.rooms
      },
      nzFooter: [
        {
          label: 'Hủy',
          onClick: () => modalRef.close()
        },
        {
          label: 'Xuất PDF xác nhận',
          onClick: () => {
            const instance = modalRef.getContentComponent() as BookingModalComponent;
            if (instance) {
              instance.exportConfirmationPDF();
            }
          }
        },
        {
          label: 'Đặt phòng',
          type: 'primary',
          onClick: () => {
            const instance = modalRef.getContentComponent() as BookingModalComponent;
            if (instance) {
              instance.onSubmit();
            }
          }
        }
      ],
      nzWidth: 800,
      nzMaskClosable: false
    });
    
    modalRef.afterClose.subscribe((result) => {
      if (result?.success) {
        this.loadRooms();
        this.loadBookings();
        // Reload calendar nếu có
        if (this.calendarComponent) {
          this.calendarComponent.loadBookings();
        }
      }
    });
  }

  // Mở modal đặt phòng
  openBookingModal(room: Room, selectedDate?: Date): void {
    const modalRef: NzModalRef = this.modalService.create({
      nzTitle: `Đặt phòng ${room.roomNumber}`,
      nzContent: BookingModalComponent,
      nzData: {
        selectedDate: selectedDate,
        hotelId: this.selectedHotelId,
        roomId: room._id,
        rooms: this.rooms
      },
      nzFooter: [
        {
          label: 'Hủy',
          onClick: () => modalRef.close()
        },
        {
          label: 'Xuất PDF xác nhận',
          onClick: () => {
            const instance = modalRef.getContentComponent() as BookingModalComponent;
            if (instance) {
              instance.exportConfirmationPDF();
            }
          }
        },
        {
          label: 'Đặt phòng',
          type: 'primary',
          onClick: () => {
            const instance = modalRef.getContentComponent() as BookingModalComponent;
            if (instance) {
              instance.onSubmit();
            }
          }
        }
      ],
      nzWidth: 800,
      nzMaskClosable: false
    });
    
    modalRef.afterClose.subscribe((result) => {
      if (result?.success) {
        this.loadRooms();
        this.loadBookings();
        // Reload calendar nếu có
        if (this.calendarComponent) {
          this.calendarComponent.loadBookings();
        }
      }
    });
  }
}


