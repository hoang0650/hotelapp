import { Component, OnInit, OnDestroy, ViewChild, TemplateRef, ChangeDetectorRef } from '@angular/core';
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
import { TranslateService } from '@ngx-translate/core';

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
  
  // Compact mode for room display
  isCompactMode = false; // Chế độ rút gọn: chỉ hiển thị số phòng, thời gian lưu trú và loại phòng
  Math = Math; // Expose Math object to template for calculations
  
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
  
  // Cache để lưu roomPrice từ backend API cho mỗi room
  private roomPriceCache = new Map<string, number>();
  // Map để lưu roomPrice trực tiếp vào room object (để trigger change detection)
  private roomPriceMap = new Map<string, number>();

  roomStatusDisplayOptions: { value: RoomStatus, label: string, color: string }[] = [
    { value: 'vacant', label: '', color: 'green' }, // Label sẽ được translate trong getRoomStatusLabelAndColor
    { value: 'occupied', label: '', color: 'red' },
    { value: 'cleaning', label: '', color: 'blue' },
    { value: 'dirty', label: '', color: 'orange' },
    { value: 'maintenance', label: '', color: 'purple' },
    { value: 'booked', label: '', color: 'geekblue' }
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
    private router: Router,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService
  ) {
    this.roomDataUpdatedSubscription = this.roomsService.getRoomDataUpdated$().subscribe(() => {
      // Reload rooms khi có thay đổi dữ liệu
      if (this.selectedHotelId) {
        // Quick reload: chỉ reload rooms, không reload bookings và history
        // Delay một chút để đảm bảo backend đã cập nhật xong (đặc biệt là guestStatus và room status sau khi chuyển phòng)
        setTimeout(() => {
          this.loadRooms(true);
          // Reload events cho tất cả phòng occupied và dirty để cập nhật thông tin mới nhất
          // QUAN TRỌNG: Sau khi chuyển phòng, phòng nguồn chuyển sang dirty, phòng đích chuyển sang occupied
          // Cần reload events cho cả hai loại phòng này
          setTimeout(() => {
            this.loadEventsForOccupiedRooms(true); // Force reload events cho phòng occupied
            // Cũng reload events cho phòng dirty (phòng nguồn sau khi chuyển) nếu cần
            // Nhưng thường phòng dirty không cần hiển thị events, nên chỉ reload occupied là đủ
          }, 500); // Tăng delay lên 500ms để đảm bảo backend đã lưu xong events mới (đặc biệt sau khi checkout)
          // Reload lịch sử thanh toán sau khi có thay đổi (ví dụ: checkout)
          if (!this.isModalOpen) {
            setTimeout(() => {
              this.showRoomHistory();
            }, 400); // Đợi một chút để đảm bảo backend đã cập nhật xong
          }
        }, 300); // Tăng delay ban đầu lên 300ms để đảm bảo backend đã lưu xong room status và events (đặc biệt sau khi checkout)
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
    // Đọc selectedHotelId từ localStorage trước khi loadHotels
    const savedHotelId = localStorage.getItem('selectedHotelId');
    if (savedHotelId) {
      this.selectedHotelId = savedHotelId;
    }
    
    this.loadHotels();
    
    // KHÔNG đọc selectedFloor từ localStorage ở đây
    // selectedFloor sẽ được set sau khi load floors trong onHotelChange
    // để đảm bảo tầng đó tồn tại trong hotel hiện tại
    
    const savedCount = localStorage.getItem('roomColumnsCount');
    if (savedCount) {
      const count = parseInt(savedCount, 10);
      if (count >= 2 && count <= 12) {
        this.count = count;
      }
    }
    
    // Lắng nghe events từ admin component
    window.addEventListener('floorFilterChanged', ((event: CustomEvent) => {
      // Gọi onFloorChange để đảm bảo logic đầy đủ được thực thi (lưu localStorage, etc.)
      this.onFloorChange(event.detail);
      this.cdr.detectChanges();
    }) as EventListener);
    
    window.addEventListener('columnsCountChanged', ((event: CustomEvent) => {
      const newCount = event.detail;
      if (newCount >= 2 && newCount <= 12) {
        // Gọi reGenerateArray để đảm bảo logic đầy đủ được thực thi (lưu localStorage, etc.)
        this.reGenerateArray(newCount);
        this.cdr.detectChanges();
      }
    }) as EventListener);
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
      this.message.warning(this.translate.instant('COMMON.PLEASE_FILL_ALL'));
      return;
    }
    
    if (!this.selectedHotelId) {
      this.message.error(this.translate.instant('ROOM.SELECT_HOTEL'));
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
      this.message.warning(this.translate.instant('ROOM.SELECT_HOTEL'));
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
      this.message.warning(this.translate.instant('ROOM.SELECT_HOTEL'));
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
      this.message.warning(this.translate.instant('ROOM.SELECT_HOTEL'));
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
      this.message.warning(this.translate.instant('ROOM.SELECT_HOTEL'));
      return;
    }
    
    if (this.incomeForm.invalid) {
      this.message.warning(this.translate.instant('COMMON.PLEASE_FILL_ALL'));
      return;
    }
    
    const incomeData = {
      hotelId: this.selectedHotelId,
      ...this.incomeForm.value
    };
    
    this.incomeLoading = true;
    this.transactionService.createIncome(incomeData).subscribe(
      (response) => {
        this.message.success(this.translate.instant('COMMON.CREATE_SUCCESS'));
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
            this.message.success(this.translate.instant('COMMON.DELETE_SUCCESS'));
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
      this.message.warning(this.translate.instant('ROOM.SELECT_HOTEL'));
      return;
    }
    
    if (this.expenseForm.invalid) {
      this.message.warning(this.translate.instant('COMMON.PLEASE_FILL_ALL'));
      return;
    }
    
    const expenseData = {
      hotelId: this.selectedHotelId,
      ...this.expenseForm.value
    };
    
    this.expenseLoading = true;
    this.transactionService.createExpense(expenseData).subscribe(
      (response) => {
        this.message.success(this.translate.instant('COMMON.CREATE_SUCCESS'));
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
            this.message.success(this.translate.instant('COMMON.DELETE_SUCCESS'));
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

  // Helper function để extract businessId từ hotel (xử lý cả populated và non-populated)
  private extractBusinessId(hotel: Hotel): string | null {
    if (!hotel || !hotel.businessId) {
      return null;
    }
    
    // Nếu là string, trả về trực tiếp
    if (typeof hotel.businessId === 'string') {
      return hotel.businessId;
    }
    
    // Nếu là object
    if (typeof hotel.businessId === 'object' && hotel.businessId !== null) {
      const businessIdObj = hotel.businessId as { _id?: string | { toString(): string }; [key: string]: any };
      
      // Nếu có _id
      if ('_id' in businessIdObj && businessIdObj._id) {
        if (typeof businessIdObj._id === 'string') {
          return businessIdObj._id;
        } else if (typeof businessIdObj._id === 'object' && 'toString' in businessIdObj._id) {
          return businessIdObj._id.toString();
        }
      }
      
      // Nếu object có method toString
      if (typeof (businessIdObj as any).toString === 'function') {
        return (businessIdObj as any).toString();
      }
    }
    
    return null;
  }

  loadHotels(): void {
    this.isLoading = true;
    this.hotelService.getHotels().subscribe(data => {
      const currentUser = this.authService.getCurrentUser();
      
      // Filter hotels theo role
      if (this.authService.isAdmin() || this.authService.isSuperAdmin()) {
        // Admin/Superadmin thấy tất cả
        this.hotels = data;
      } else if (this.authService.isBusiness() && currentUser?.businessId) {
        // Business chỉ thấy hotels thuộc business của mình
        let userBusinessIdStr: string | null = null;
        
        if (typeof currentUser.businessId === 'string') {
          userBusinessIdStr = currentUser.businessId;
        } else if (typeof currentUser.businessId === 'object' && currentUser.businessId !== null) {
          const businessIdObj = currentUser.businessId as any;
          if (businessIdObj._id) {
            userBusinessIdStr = typeof businessIdObj._id === 'string' 
              ? businessIdObj._id 
              : businessIdObj._id.toString();
          } else if (typeof businessIdObj.toString === 'function') {
            userBusinessIdStr = businessIdObj.toString();
          }
        }
        
        console.log('Filtering hotels for business user:', {
          userBusinessId: currentUser.businessId,
          userBusinessIdStr: userBusinessIdStr,
          totalHotels: data.length,
          hotels: data.map(h => ({
            id: h._id,
            name: h.name,
            businessId: h.businessId,
            extractedBusinessId: this.extractBusinessId(h)
          }))
        });
        
        this.hotels = data.filter(hotel => {
          const hotelBusinessId = this.extractBusinessId(hotel);
          // So sánh string để đảm bảo đúng
          const match = hotelBusinessId && userBusinessIdStr && hotelBusinessId.toString() === userBusinessIdStr.toString();
          if (match) {
            console.log('Hotel matched:', {
              hotelName: hotel.name,
              hotelBusinessId: hotelBusinessId,
              userBusinessId: userBusinessIdStr
            });
          }
          return match;
        });
        
        console.log('Filtered hotels count:', this.hotels.length);
      } else if (this.authService.isHotelManager() && currentUser?.hotelId) {
        // Hotel manager chỉ thấy hotel của mình
        this.hotels = data.filter(hotel => hotel._id === currentUser.hotelId);
      } else if (this.authService.isStaff()) {
        // Staff chỉ thấy hotel của mình
        let staffHotelId: string | null = null;
        
        // Lấy hotelId từ currentUser
        if (currentUser?.hotelId) {
          if (typeof currentUser.hotelId === 'string') {
            staffHotelId = currentUser.hotelId;
          } else if (typeof currentUser.hotelId === 'object' && currentUser.hotelId !== null) {
            staffHotelId = (currentUser.hotelId as any)?._id?.toString() || (currentUser.hotelId as any).toString();
          }
        }
        
        console.log('Staff filtering hotels:', {
          currentUser: currentUser,
          hotelId: currentUser?.hotelId,
          staffHotelId: staffHotelId,
          totalHotels: data.length,
          hotels: data.map(h => ({ id: h._id, name: h.name }))
        });
        
        if (staffHotelId) {
          this.selectedHotelId = staffHotelId;
          this.hotels = data.filter(hotel => {
            let hotelIdStr: string | null = null;
            
            if (hotel._id) {
              if (typeof hotel._id === 'string') {
                hotelIdStr = hotel._id;
              } else if (typeof hotel._id === 'object' && hotel._id !== null) {
                const hotelIdObj = hotel._id as any;
                if (typeof hotelIdObj.toString === 'function') {
                  hotelIdStr = hotelIdObj.toString();
                }
              }
            }
            
            const match = hotelIdStr && hotelIdStr === staffHotelId;
            if (match) {
              console.log('Staff hotel matched:', {
                hotelName: hotel.name,
                hotelId: hotelIdStr,
                staffHotelId: staffHotelId
              });
            }
            return match;
          });
          
          console.log('Staff filtered hotels count:', this.hotels.length);
          
          // Auto load rooms nếu có hotel
          if (this.hotels.length > 0 && this.selectedHotelId) {
            this.onHotelChange(this.selectedHotelId);
          }
        } else {
          console.warn('Staff không có hotelId, kiểm tra lại thông tin nhân viên');
          this.selectedHotelId = null;
          this.rooms = [];
          this.floors = [];
          this.message.warning('Không tìm thấy khách sạn của bạn. Vui lòng liên hệ quản trị viên.');
          this.isLoading = false;
          return;
        }
      } else {
        this.hotels = [];
      }
      
      // Auto-select hotel hoặc load rooms cho hotel đã chọn
      if (this.hotels.length > 0) {
        if (!this.selectedHotelId) {
          // Nếu chưa có selectedHotelId, chọn hotel đầu tiên
          this.selectedHotelId = this.hotels[0]._id!;
          this.onHotelChange(this.selectedHotelId);
        } else {
          // Nếu đã có selectedHotelId (từ localStorage), kiểm tra xem hotel đó có trong danh sách không
          const hotelExists = this.hotels.some(h => {
            let hotelId: string | null = null;
            if (h._id) {
              if (typeof h._id === 'string') {
                hotelId = h._id;
              } else if (typeof h._id === 'object' && h._id !== null) {
                const hotelIdObj = h._id as any;
                hotelId = hotelIdObj._id ? String(hotelIdObj._id) : String(hotelIdObj);
              }
            }
            return hotelId === this.selectedHotelId;
          });
          if (hotelExists) {
            // Nếu hotel tồn tại, load rooms cho hotel đó
            this.onHotelChange(this.selectedHotelId);
          } else {
            // Nếu hotel không tồn tại, chọn hotel đầu tiên
            this.selectedHotelId = this.hotels[0]._id!;
            this.onHotelChange(this.selectedHotelId);
          }
        }
      } else if (this.hotels.length === 0) {
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
        this.message.warning(this.translate.instant('ROOM.STAFF_ONLY_HOTEL'));
        this.selectedHotelId = currentUser.hotelId;
        return;
      }
    }
    this.selectedHotelId = hotelId;
    // Lưu vào localStorage để admin component có thể đọc
    if (hotelId) {
      localStorage.setItem('selectedHotelId', hotelId);
    } else {
      localStorage.removeItem('selectedHotelId');
    }
    
    // Reset selectedFloor khi chuyển hotel (sẽ set lại sau khi load floors)
    const previousSelectedFloor = this.selectedFloor;
    this.selectedFloor = null;
    this.floors = [];
    
    if (hotelId) {
      this.isLoading = true;
      this.roomsService.getHotelFloors(hotelId).subscribe(
        (data) => {
          this.floors = data.floors.map(f => String(f));
          
          // Kiểm tra selectedFloor từ localStorage sau khi đã load floors
          const savedFloor = localStorage.getItem('selectedFloor');
          if (savedFloor) {
            // Normalize savedFloor để so sánh
            const normalizedSavedFloor = String(savedFloor);
            if (this.floors.includes(normalizedSavedFloor)) {
              // Chỉ set selectedFloor nếu tầng đó tồn tại trong hotel hiện tại
              this.selectedFloor = normalizedSavedFloor;
            } else {
              // Nếu tầng không tồn tại, xóa selectedFloor và localStorage
              this.selectedFloor = null;
              localStorage.removeItem('selectedFloor');
            }
          } else {
            this.selectedFloor = null;
          }
          
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
      // Xóa selectedFloor khi không có hotel
      this.selectedFloor = null;
      localStorage.removeItem('selectedFloor');
    }
  }

  onFloorChange(floor: string | null): void {
    this.selectedFloor = floor;
    // Lưu vào localStorage
    if (floor) {
      localStorage.setItem('selectedFloor', floor);
    } else {
      localStorage.removeItem('selectedFloor');
    }
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
    if (!status) return { label: this.translate.instant('COMMON.NO_DATA'), color: 'default' };
    const option = this.roomStatusDisplayOptions.find(opt => opt.value === status);
    // Sử dụng translate cho label
    if (option) {
      const translatedLabel = this.translate.instant(`ROOM.${option.value.toUpperCase()}`);
      return { label: translatedLabel, color: option.color };
    }
    return { label: status, color: 'default' };
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

  private normalizeGuestSource(source: any, booking?: any): string {
    let normalized = String(source || '').toLowerCase().trim();
    if ((!normalized || normalized === 'ota') && booking && booking.otaSource) {
      normalized = String(booking.otaSource).toLowerCase().trim();
    }
    if (
      normalized === 'walkin' ||
      normalized === 'walk-in' ||
      normalized === 'walk_in' ||
      normalized === 'direct' ||
      normalized === 'phone' ||
      normalized === 'regular' ||
      normalized === 'guest' ||
      normalized === 'khach le' ||
      normalized === 'khách lẻ'
    ) {
      return 'walkin';
    }
    if (normalized.includes('booking')) {
      return 'booking';
    }
    if (normalized.includes('agoda')) {
      return 'agoda';
    }
    if (normalized.includes('traveloka')) {
      return 'traveloka';
    }
    if (normalized.includes('expedia')) {
      return 'expedia';
    }
    if (normalized.includes('trip')) {
      return 'trip';
    }
    if (normalized.includes('g2j')) {
      return 'g2j';
    }
    if (!normalized) {
      return 'walkin';
    }
    return 'other';
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
    // Lưu vào localStorage
    localStorage.setItem('roomColumnsCount', count.toString());
  }

  getRoomColSpan(): number {
    if (this.isCompactMode) {
      // Với số cột lớn (6, 8, 12), giữ nguyên hoặc tăng nhẹ để phòng rộng hơn
      if (this.count >= 12) {
        // 12 cột: giữ nguyên để phòng rộng hơn
        return 24 / 12; // = 2
      }
      if (this.count >= 8) {
        // 8 cột: tăng nhẹ lên 9 cột thay vì 12 để phòng rộng hơn
        return Math.floor(24 / 9); // ≈ 2.67 → 2
      }
      if (this.count >= 6) {
        // 6 cột: tăng nhẹ lên 7 cột thay vì 9 để phòng rộng hơn
        return Math.floor(24 / 7); // ≈ 3.4 → 3
      }
      // Với số cột nhỏ hơn (2, 3, 4), tăng 1.5 lần như cũ
      const compactCount = Math.floor(this.count * 1.5);
      return Math.max(1, Math.floor(24 / compactCount));
    }
    return 24 / this.count;
  }

  // Responsive methods for different breakpoints
  getRoomColSpanXs(): number {
    // Mobile (<576px): luôn full width
    return 24;
  }

  getRoomColSpanSm(): number {
    // Tablet (≥576px): giảm số cột để phòng không bị chật
    if (this.isCompactMode) {
      // Compact mode: với số cột lớn, giữ rộng hơn
      if (this.count <= 3) return 8;   // 2-3 cột → 3 phòng/row
      if (this.count <= 4) return 6;  // 4 cột → 4 phòng/row
      if (this.count === 6) return 4; // 6 cột → 6 phòng/row (giữ nguyên)
      if (this.count === 8) return 3; // 8 cột → 8 phòng/row (giữ nguyên)
      if (this.count === 12) return 2; // 12 cột → 12 phòng/row (giữ nguyên)
      return 4; // default
    }
    // Normal mode: giảm số cột trên tablet để dễ nhìn hơn
    if (this.count <= 2) return 12; // 2 cột → 2 phòng/row
    if (this.count <= 3) return 8;  // 3 cột → 3 phòng/row
    if (this.count <= 4) return 6; // 4 cột → 4 phòng/row
    if (this.count <= 6) return 4; // 6 cột → 6 phòng/row
    if (this.count <= 8) return 3; // 8 cột → 8 phòng/row
    return 2; // 12 cột → 12 phòng/row
  }

  getRoomColSpanMd(): number {
    // Tablet landscape (≥768px): bắt đầu hiển thị đúng số cột nhưng vẫn điều chỉnh cho số cột lớn
    if (this.count <= 4) {
      return this.getRoomColSpan();
    }
    // Với số cột lớn (6, 8, 12), giảm một chút để không quá chật
    if (this.count === 6) return 4; // 6 cột → 6 phòng/row
    if (this.count === 8) return 3; // 8 cột → 8 phòng/row
    if (this.count === 12) return 2; // 12 cột → 12 phòng/row
    return this.getRoomColSpan();
  }

  getRoomColSpanLg(): number {
    // Desktop (≥992px): hiển thị đúng số cột
    return this.getRoomColSpan();
  }

  getRoomColSpanXl(): number {
    // Large desktop (≥1200px): hiển thị đúng số cột
    return this.getRoomColSpan();
  }

  // Điều chỉnh gutter (khoảng cách) dựa trên số cột để phòng không bị chật
  getRoomGutter(): [number, number] {
    // Khi số cột lớn, giảm gutter để tiết kiệm không gian
    if (this.count >= 12) {
      return [8, 8]; // Gutter nhỏ nhất cho 12 cột
    }
    if (this.count >= 8) {
      return [10, 10]; // Gutter nhỏ cho 8 cột
    }
    if (this.count >= 6) {
      return [12, 12]; // Gutter vừa cho 6 cột
    }
    // Gutter mặc định cho số cột nhỏ hơn
    return [this.hGutter, this.vGutter];
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
      this.message.error(this.translate.instant('COMMON.ERROR_OCCURRED'));
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
    
    // Normalize selectedFloor thành string để so sánh
    const normalizedSelectedFloor = this.selectedFloor ? String(this.selectedFloor) : null;
    
    // Filter rooms theo selectedFloor nếu có
    const filteredRooms = normalizedSelectedFloor 
      ? this.rooms.filter(room => {
          // Normalize room.floor thành string để so sánh
          const roomFloor = room.floor ? String(room.floor) : '0';
          return roomFloor === normalizedSelectedFloor;
        })
      : this.rooms;
    
    filteredRooms.forEach(room => {
      // Normalize floor thành string
      const floor = room.floor ? String(room.floor) : '0';
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
  // TrackBy functions để tối ưu performance
  trackByHotelId(index: number, hotel: Hotel): string {
    return hotel._id || index.toString();
  }

  trackByFloor(index: number, floor: string): string {
    return floor || index.toString();
  }

  trackByRoomId(index: number, room: Room): string {
    return room._id || index.toString();
  }

  // Filter function cho hotel select
  filterHotelOption = (input: string, option: any): boolean => {
    return option.nzLabel.toLowerCase().indexOf(input.toLowerCase()) >= 0;
  };

  getSortedFloors(): string[] {
    // Nếu đã chọn tầng, chỉ trả về tầng đó
    if (this.selectedFloor) {
      // Normalize selectedFloor thành string
      const normalizedSelectedFloor = String(this.selectedFloor);
      // Kiểm tra xem tầng đã chọn có phòng không
      const hasRooms = this.rooms.some(room => {
        const roomFloor = room.floor ? String(room.floor) : '0';
        return roomFloor === normalizedSelectedFloor;
      });
      return hasRooms ? [normalizedSelectedFloor] : [];
    }
    
    // Nếu chưa chọn tầng, trả về tất cả tầng có phòng
    const floors = new Set<string>();
    this.rooms.forEach(room => {
      // Normalize floor thành string
      const floor = room.floor ? String(room.floor) : '0';
      floors.add(floor);
    });
    return Array.from(floors).sort((a, b) => {
      const numA = parseInt(a) || 0;
      const numB = parseInt(b) || 0;
      return numA - numB;
    });
  }

  // Lấy tên hiển thị cho tầng
  getFloorDisplayName(floor: string): string {
    // Import TranslateService nếu chưa có
    // Sử dụng translate pipe trong template thay vì method này
    if (floor === '0' || floor === '') {
      return 'Trệt'; // Sẽ được translate trong template
    }
    return `Tầng ${floor}`; // Sẽ được translate trong template
  }

  // Cập nhật danh sách tầng từ phòng thực tế
  updateFloorsFromRooms(): void {
    const floorsSet = new Set<string>();
    this.rooms.forEach(room => {
      // Normalize floor thành string
      const floor = room.floor ? String(room.floor) : '0';
      floorsSet.add(floor);
    });
    this.floors = Array.from(floorsSet).sort((a, b) => {
      const numA = parseInt(a) || 0;
      const numB = parseInt(b) || 0;
      return numA - numB;
    });
    
    // Kiểm tra lại selectedFloor sau khi cập nhật floors từ rooms
    // Nếu selectedFloor không còn tồn tại trong floors, reset nó
    if (this.selectedFloor && !this.floors.includes(this.selectedFloor)) {
      this.selectedFloor = null;
      localStorage.removeItem('selectedFloor');
    }
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
      
      // Lấy rateType từ bookingType hoặc rateType (tương thích cả hai)
      const currentBooking = room.currentBooking as any;
      const rateType = currentBooking?.rateType || currentBooking?.bookingType || 'hourly';
      
      // Sử dụng translation thay vì hardcode
      const rateTypeLabels: {[key: string]: string} = {
        'hourly': this.translate.instant('ROOM.RATE_TYPE_HOURLY') || 'Theo giờ',
        'daily': this.translate.instant('ROOM.RATE_TYPE_DAILY') || 'Ngày đêm',
        'nightly': this.translate.instant('ROOM.RATE_TYPE_NIGHTLY') || 'Qua đêm',
        'weekly': this.translate.instant('ROOM.RATE_TYPE_WEEKLY') || 'Theo tuần',
        'monthly': this.translate.instant('ROOM.RATE_TYPE_MONTHLY') || 'Theo tháng'
      };
      const rateTypeLabel = rateTypeLabels[rateType] || this.translate.instant('ROOM.RATE_TYPE_HOURLY') || 'Theo giờ';
      
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
    
    // Lấy từ events (đã được load từ RoomEvent collection qua loadEventsForOccupiedRooms)
    // CHỈ SỬ DỤNG events từ RoomEvent collection, không sử dụng room.events trong rooms.js
    if (room.events && room.events.length > 0) {
      const bookingEvent = room.events.find(e => e.type === 'booking');
      if (bookingEvent) {
        const checkInDate = bookingEvent.checkinTime ? new Date(bookingEvent.checkinTime) : null;
        const expectedCheckoutTime = bookingEvent.expectedCheckoutTime ? new Date(bookingEvent.expectedCheckoutTime) : null;
        
        // Sử dụng translation thay vì hardcode
        const rateTypeLabels: {[key: string]: string} = {
          'hourly': this.translate.instant('ROOM.RATE_TYPE_HOURLY') || 'Theo giờ',
          'daily': this.translate.instant('ROOM.RATE_TYPE_DAILY') || 'Ngày đêm',
          'nightly': this.translate.instant('ROOM.RATE_TYPE_NIGHTLY') || 'Qua đêm',
          'weekly': this.translate.instant('ROOM.RATE_TYPE_WEEKLY') || 'Theo tuần',
          'monthly': this.translate.instant('ROOM.RATE_TYPE_MONTHLY') || 'Theo tháng'
        };
        const rateTypeLabel = rateTypeLabels[bookingEvent.rateType || 'hourly'] || this.translate.instant('ROOM.RATE_TYPE_HOURLY') || 'Theo giờ';
        
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
    additionalCharges: number;
    discount: number;
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
    
    // Lấy totalAmount từ room.totalPrice (được tính từ room-content-modal) nếu có
    // Nếu không có thì tính lại theo công thức cũ
    let totalAmount = 0;
    if (room._id) {
      const savedTotalPrice = localStorage.getItem(`room_${room._id}_totalPrice`);
      if (savedTotalPrice) {
        totalAmount = parseFloat(savedTotalPrice) || 0;
      }
    }
    
    // Nếu không có totalPrice từ modal, tính lại theo công thức
    if (totalAmount === 0) {
      // Công thức mới:
      // Tổng tiền = tiền phòng + phụ thu + tiền dịch vụ (KHÔNG trừ khuyến mãi và đặt trước)
      // ĐỒNG BỘ: Công thức này phải khớp với room-content-modal.component.ts:
      // totalPrice = roomPrice + totalAdditionalCharges + serviceTotal
      totalAmount = checkinInfo.roomPrice + checkinInfo.additionalCharges + checkinInfo.serviceAmount;
    }
    
    // Còn thu = Tổng tiền - đặt trước - khuyến mãi (cho phép số âm)
    // ĐỒNG BỘ: Công thức này phải khớp với room-content-modal.component.ts:
    // remainingAmount = totalPrice - advancePayment - totalDiscount
    const remainingAmount = totalAmount - checkinInfo.advancePayment - checkinInfo.discount;
    
    return {
      checkinTime: checkinTimeStr,
      customerName: checkinInfo.guestName,
      rateTypeLabel: checkinInfo.rateTypeLabel,
      totalAmount: totalAmount,
      advancePayment: checkinInfo.advancePayment,
      remainingAmount: remainingAmount,
      guestSource: checkinInfo.guestSource || 'walkin',
      additionalCharges: checkinInfo.additionalCharges || 0,
      discount: checkinInfo.discount || 0,
      transferredFrom: checkinInfo.transferredFrom,
      transferredAt: checkinInfo.transferredAt
    };
  }

  // Load events cho các phòng đang occupied và booked
  // QUAN TRỌNG: Sau khi chuyển phòng, phòng đích sẽ có status = 'occupied' và có event checkin mới với transferredFrom
  // Cần load events cho phòng này để hiển thị đúng thông tin từ phòng cũ
  loadEventsForOccupiedRooms(forceReload: boolean = false): void {
    // Nếu forceReload = true, reload events cho tất cả phòng occupied/booked
    // Nếu false, chỉ load cho phòng chưa có events
    const occupiedRooms = this.rooms.filter(room => {
      if (!room._id) return false;
      if (room.status !== 'occupied' && room.status !== 'booked') return false;
      if (forceReload) return true; // Reload tất cả nếu forceReload (quan trọng sau khi chuyển phòng)
      return !room.events || room.events.length === 0; // Chỉ load nếu chưa có events
    });
    
    if (occupiedRooms.length === 0) return;
    
    // Fetch events cho tất cả phòng occupied cùng lúc
    // Sử dụng excludeCheckedOut = true để chỉ lấy checkin events chưa checkout (từ RoomEvent collection)
    const eventRequests = occupiedRooms.map(room => {
      const eventType = room.status === 'occupied' ? 'checkin' : 'booking';
      return this.roomsService.getRoomEvents(room._id!, { 
        limit: 10, 
        type: eventType,
        excludeCheckedOut: room.status === 'occupied' // Chỉ excludeCheckedOut cho phòng occupied
      })
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
            // QUAN TRỌNG: Đảm bảo chỉ lấy events của phòng hiện tại (roomId)
            // Lọc bỏ events không thuộc về phòng này (tránh lấy nhầm events từ phòng khác khi chuyển phòng)
            const filteredEvents = events.filter(event => {
              // Kiểm tra roomId của event (nếu có)
              if (event.roomId) {
                const eventRoomId = typeof event.roomId === 'object' 
                  ? (event.roomId as any)?._id?.toString() || (event.roomId as any)?.toString()
                  : event.roomId.toString();
                const currentRoomId = roomId?.toString();
                if (eventRoomId !== currentRoomId) {
                  console.warn(`Filtered out event from different room:`, {
                    eventId: event._id,
                    eventType: event.type,
                    eventRoomId: eventRoomId,
                    currentRoomId: currentRoomId,
                    roomNumber: this.rooms[roomIndex].roomNumber
                  });
                  return false; // Bỏ qua events không thuộc phòng này
                }
              }
              return true; // Giữ lại events thuộc phòng này hoặc không có roomId (backward compatibility)
            });
            
            // Đảm bảo events có đầy đủ thông tin, bao gồm transferredFrom, transferredAt, additionalCharges, discount
            this.rooms[roomIndex].events = filteredEvents.map(event => {
              // Đảm bảo additionalCharges và discount được giữ nguyên từ RoomEvent
              const mappedEvent = {
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
                  : undefined,
                // Đảm bảo additionalCharges và discount được giữ nguyên từ RoomEvent
                additionalCharges: event.additionalCharges !== undefined && event.additionalCharges !== null
                  ? (typeof event.additionalCharges === 'number' ? event.additionalCharges : Number(event.additionalCharges) || 0)
                  : 0,
                discount: event.discount !== undefined && event.discount !== null
                  ? (typeof event.discount === 'number' ? event.discount : Number(event.discount) || 0)
                  : 0
              };
              
              // Log để debug nếu là checkin event
              if (event.type === 'checkin') {
                console.log(`Loaded checkin event for room ${this.rooms[roomIndex].roomNumber}:`, {
                  eventId: event._id,
                  eventRoomId: event.roomId,
                  currentRoomId: roomId,
                  additionalCharges: mappedEvent.additionalCharges,
                  discount: mappedEvent.discount,
                  transferredFrom: mappedEvent.transferredFrom
                });
              }
              
              return mappedEvent;
            });
            
            // Load roomPrice từ backend API cho phòng occupied (có checkin event)
            if (this.rooms[roomIndex].status === 'occupied' && filteredEvents.length > 0) {
              const checkinEvent = filteredEvents.find(e => e.type === 'checkin');
              if (checkinEvent && checkinEvent.checkinTime) {
                this.loadRoomPriceFromAPI(this.rooms[roomIndex], checkinEvent);
              }
            }
          }
        });
      },
      error: (error) => {
        console.error('Error loading events for occupied rooms:', error);
      }
    });
  }
  
  // Load roomPrice từ backend API (đồng bộ với room-content-modal)
  private loadRoomPriceFromAPI(room: Room, checkinEvent: any): void {
    if (!room._id || !checkinEvent.checkinTime) return;
    
    const checkinTime = new Date(checkinEvent.checkinTime);
    const checkoutTime = new Date(); // Thời gian hiện tại
    const rawRateType = (checkinEvent.rateType || 'hourly') as 'hourly' | 'daily' | 'nightly' | 'weekly' | 'monthly';
    
    // Tạo cache key dựa trên roomId, checkinTime và rateType
    const cacheKey = `${room._id}_${checkinTime.getTime()}_${rawRateType}`;
    
    // Kiểm tra cache trước
    if (this.roomPriceCache.has(cacheKey)) {
      console.log(`[loadRoomPriceFromAPI] Using cached price for room ${room.roomNumber}:`, this.roomPriceCache.get(cacheKey));
      return;
    }
    
    // Kiểm tra xem đang load chưa (tránh duplicate requests)
    const loadingKey = `loading_${cacheKey}`;
    if (this.roomPriceCache.has(loadingKey)) {
      console.log(`[loadRoomPriceFromAPI] Already loading price for room ${room.roomNumber}`);
      return;
    }
    
    // Nếu là weekly/monthly: không gọi API (backend chưa hỗ trợ), dùng luôn tính local
    if (rawRateType === 'weekly' || rawRateType === 'monthly') {
      const fallbackPrice = this.calculateRoomPriceLocal(room, checkinTime, rawRateType);
      this.roomPriceCache.set(cacheKey, fallbackPrice);
      this.roomPriceMap.set(cacheKey, fallbackPrice);
      this.cdr.detectChanges();
      return;
    }

    // Đánh dấu đang load
    this.roomPriceCache.set(loadingKey, 0);
    
    // Gọi API để tính giá phòng (chỉ hỗ trợ hourly/daily/nightly)
    const rateType = rawRateType as 'hourly' | 'daily' | 'nightly';
    this.roomsService.calculateRoomPrice(room._id, checkinTime, checkoutTime, rateType).subscribe({
      next: (priceResponse) => {
        const roomPrice = priceResponse.totalPrice || 0;
        // Lưu vào cache
        this.roomPriceCache.set(cacheKey, roomPrice);
        // Lưu vào roomPriceMap để UI có thể access
        this.roomPriceMap.set(cacheKey, roomPrice);
        // Xóa flag loading
        this.roomPriceCache.delete(loadingKey);
        
        console.log(`[loadRoomPriceFromAPI] Loaded price from API for room ${room.roomNumber}:`, {
          roomPrice,
          rateType,
          checkinTime: checkinTime.toISOString(),
          checkoutTime: checkoutTime.toISOString(),
          cacheKey
        });
        
        // Trigger change detection để cập nhật UI
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error(`[loadRoomPriceFromAPI] Error loading price for room ${room.roomNumber}:`, error);
        // Xóa flag loading
        this.roomPriceCache.delete(loadingKey);
        // Cache giá trị fallback local để tránh gọi lại API nhiều lần khi không có priceConfig
        const fallbackPrice = this.calculateRoomPriceLocal(room, checkinTime, rawRateType);
        this.roomPriceCache.set(cacheKey, fallbackPrice);
        this.roomPriceMap.set(cacheKey, fallbackPrice);
        this.cdr.detectChanges();
      }
    });
  }
  
  // Lấy roomPrice từ cache hoặc tính local (fallback)
  private getRoomPrice(room: Room, checkinTime: Date | null, rateType: string): number {
    if (!room._id || !checkinTime) return 0;
    
    // Tạo cache key
    const cacheKey = `${room._id}_${checkinTime.getTime()}_${rateType}`;
    
    // Kiểm tra cache trước
    if (this.roomPriceCache.has(cacheKey)) {
      const cachedPrice = this.roomPriceCache.get(cacheKey)!;
      console.log(`[getRoomPrice] Using cached price for room ${room.roomNumber}:`, cachedPrice);
      return cachedPrice;
    }

    // Fallback: tính local nếu chưa có trong cache
    const fallbackPrice = this.calculateRoomPriceLocal(room, checkinTime, rateType);
    console.warn(`[getRoomPrice] No cached price for room ${room.roomNumber}, using fallback:`, fallbackPrice);
    return fallbackPrice;
  }
  
  // Tính roomPrice local (fallback khi chưa có từ API)
  private calculateRoomPriceLocal(room: Room, checkinTime: Date, rateType: string): number {
    const now = new Date();
    const durationInHours = Math.ceil((now.getTime() - checkinTime.getTime()) / (1000 * 60 * 60));
    const durationInDays = Math.ceil(durationInHours / 24);
    
    const hourlyRate = room.pricing?.hourly || room.firstHourRate || 0;
    const dailyRate = room.pricing?.daily || 0;
    const nightlyRate = room.pricing?.nightly || 0;
    const weeklyRate = room.pricing?.weekly || 0;
    const monthlyRate = room.pricing?.monthly || 0;
    const additionalHourRate = room.additionalHourRate || (hourlyRate * 0.8);
    
    let roomPrice = 0;
    
    switch (rateType) {
      case 'hourly':
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
        const checkInDateOnly = new Date(checkinTime);
        checkInDateOnly.setHours(0, 0, 0, 0);
        const checkOutDateOnly = new Date();
        checkOutDateOnly.setHours(0, 0, 0, 0);
        const actualDays = Math.max(1, Math.ceil((checkOutDateOnly.getTime() - checkInDateOnly.getTime()) / (1000 * 60 * 60 * 24)));
        roomPrice = dailyRate * actualDays;
        break;
      case 'nightly':
        const checkInDateForNightly = new Date(checkinTime);
        checkInDateForNightly.setHours(0, 0, 0, 0);
        const checkOutDateForNightly = new Date();
        checkOutDateForNightly.setHours(0, 0, 0, 0);
        const actualNights = Math.max(1, Math.ceil((checkOutDateForNightly.getTime() - checkInDateForNightly.getTime()) / (1000 * 60 * 60 * 24)));
        roomPrice = nightlyRate * actualNights;
        break;
      case 'weekly':
        if (weeklyRate > 0) {
          const weeks = Math.max(1, Math.ceil(durationInDays / 7));
          roomPrice = weeklyRate * weeks;
        } else {
          const daysFromWeekly = Math.max(1, Math.ceil(durationInDays / 7) * 7);
          roomPrice = dailyRate * daysFromWeekly;
        }
        break;
      case 'monthly':
        if (monthlyRate > 0) {
          const months = Math.max(1, Math.ceil(durationInDays / 30));
          roomPrice = monthlyRate * months;
        } else {
          const daysFromMonthly = Math.max(1, Math.ceil(durationInDays / 30) * 30);
          roomPrice = dailyRate * daysFromMonthly;
        }
        break;
      default:
        roomPrice = hourlyRate * durationInHours;
    }
    
    return roomPrice;
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
    // CHỈ SỬ DỤNG events từ RoomEvent collection, không sử dụng room.events trong rooms.js
    if (!room.events || room.events.length === 0) {
      return null;
    }

    // Tìm event checkin cuối cùng CHƯA CHECKOUT (sắp xếp theo thời gian để lấy mới nhất)
    // Lọc các event check-in chưa có checkout tương ứng
    // Events đã được load từ RoomEvent collection và gán vào room.events
    const checkinEvents = room.events
      .filter(e => {
        if (e.type !== 'checkin') return false;
        
        // QUAN TRỌNG: Chỉ lấy events của phòng hiện tại (room._id)
        // Đảm bảo không lấy events từ phòng khác khi chuyển phòng
        // Kiểm tra xem event có thuộc về phòng này không (nếu có roomId trong event)
        if (e.roomId && e.roomId.toString() !== room._id?.toString()) {
          return false; // Bỏ qua events không thuộc phòng này
        }
        
        // Kiểm tra xem có event checkout nào tương ứng với checkin này không
        // QUAN TRỌNG: Chỉ kiểm tra checkout events của phòng hiện tại
        const hasCheckout = room.events?.some((checkoutEvent: any) => {
          if (checkoutEvent.type !== 'checkout') return false;
          
          // Đảm bảo checkout event thuộc về phòng hiện tại
          if (checkoutEvent.roomId && checkoutEvent.roomId.toString() !== room._id?.toString()) {
            return false; // Bỏ qua checkout events không thuộc phòng này
          }
          
          // So sánh checkinTime: chuyển về Date object và so sánh timestamp
          const checkoutCheckinTime = checkoutEvent.checkinTime ? new Date(checkoutEvent.checkinTime).getTime() : null;
          const eventCheckinTime = e.checkinTime ? new Date(e.checkinTime).getTime() : null;
          
          // Nếu có checkinTime và khớp chính xác (trong vòng 1 giây để tránh lỗi làm tròn)
          if (checkoutCheckinTime && eventCheckinTime) {
            return Math.abs(checkoutCheckinTime - eventCheckinTime) < 1000; // Trong vòng 1 giây
          }
          
          return false;
        }) || false;
        
        // Kiểm tra xem event checkin này đã được transfer đi chưa
        // Nếu có transferredFrom và transferredFrom khác room._id, đây là event từ phòng khác chuyển đến
        // Nếu có transferredTo trong checkout event, đây là event đã được chuyển đi
        const isTransferredOut = room.events?.some((checkoutEvent: any) => {
          if (checkoutEvent.type !== 'checkout') return false;
          if (checkoutEvent.roomId && checkoutEvent.roomId.toString() !== room._id?.toString()) {
            return false; // Chỉ kiểm tra checkout events của phòng này
          }
          // Kiểm tra xem có checkout event nào có transferredTo (đã chuyển sang phòng khác) không
          if (checkoutEvent.transferredTo) {
            const checkoutCheckinTime = checkoutEvent.checkinTime ? new Date(checkoutEvent.checkinTime).getTime() : null;
            const eventCheckinTime = e.checkinTime ? new Date(e.checkinTime).getTime() : null;
            if (checkoutCheckinTime && eventCheckinTime) {
              return Math.abs(checkoutCheckinTime - eventCheckinTime) < 1000; // Khớp checkinTime
            }
          }
          return false;
        }) || false;
        
        // Chỉ lấy event check-in chưa có checkout và chưa được transfer đi
        return !hasCheckout && !isTransferredOut;
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
      'nightly': 'Qua đêm',
      'weekly': 'Theo tuần',
      'monthly': 'Theo tháng'
    };
    const rateTypeLabel = rateTypeLabels[rateType] || 'Theo giờ';
    
    // Lấy roomPrice từ backend API (đồng bộ với room-content-modal)
    // Sử dụng cache nếu có, nếu không thì fallback về tính local
    // Kiểm tra roomPriceMap trước (giá đã được load và lưu vào room)
    const roomPriceKey = `${room._id}_${checkinTime?.getTime()}_${rateType}`;
    let roomPrice = this.roomPriceMap.get(roomPriceKey) || 0;
    
    if (roomPrice === 0) {
      // Nếu chưa có trong roomPriceMap, lấy từ cache hoặc tính local
      roomPrice = this.getRoomPrice(room, checkinTime, rateType);
    }
    
    // Lấy advancePayment từ event, đảm bảo parse đúng kiểu số
    let advancePayment = 0;
    if (lastCheckin.advancePayment !== undefined && lastCheckin.advancePayment !== null) {
      advancePayment = typeof lastCheckin.advancePayment === 'number' 
        ? lastCheckin.advancePayment 
        : Number(lastCheckin.advancePayment) || 0;
    }
    
    // Lấy tên khách hàng từ nhiều nguồn
    // Ưu tiên 1: Từ lastCheckin.guestInfo (RoomEvent collection) - đảm bảo lấy đúng từ phòng cũ khi chuyển phòng
    let guestName = 'Khách lẻ';
    if (lastCheckin.guestInfo) {
      // Lấy từ guestInfo trong RoomEvent (đã được chuyển từ phòng cũ)
      if (lastCheckin.guestInfo.name && lastCheckin.guestInfo.name !== 'Khách lẻ') {
        guestName = lastCheckin.guestInfo.name;
      } else if (lastCheckin.guestInfo.name === 'Khách lẻ' || !lastCheckin.guestInfo.name) {
        // Nếu là 'Khách lẻ' hoặc không có tên, giữ nguyên
        guestName = 'Khách lẻ';
      }
    }
    
    // Ưu tiên 2: Từ room.currentBooking nếu không có trong event (fallback)
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
    
    // Lấy nguồn khách từ event (ưu tiên từ RoomEvent - đã được chuyển từ phòng cũ)
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
    // Lấy từ RoomEvent collection (không phải từ room.events trong rooms.js)
    let additionalCharges = 0;
    if (lastCheckin.additionalCharges !== undefined && lastCheckin.additionalCharges !== null) {
      additionalCharges = typeof lastCheckin.additionalCharges === 'number' 
        ? lastCheckin.additionalCharges 
        : Number(lastCheckin.additionalCharges) || 0;
    }
    
    // Lấy chiết khấu nếu có, mặc định = 0 (đồng bộ với room-content-modal)
    // Lấy từ RoomEvent collection (không phải từ room.events trong rooms.js)
    const discount = lastCheckin.discount !== undefined && lastCheckin.discount !== null
      ? (typeof lastCheckin.discount === 'number'
        ? lastCheckin.discount
        : Number(lastCheckin.discount) || 0)
      : 0;
    
    // Log để debug
    console.log(`getRoomCheckinInfo for room ${room.roomNumber}:`, {
      lastCheckinEventId: lastCheckin._id,
      additionalCharges: additionalCharges,
      discount: discount,
      originalAdditionalCharges: lastCheckin.additionalCharges,
      originalDiscount: lastCheckin.discount,
      eventType: lastCheckin.type
    });
    
    // Công thức mới:
    // Tổng tiền = tiền phòng + phụ thu + tiền dịch vụ (KHÔNG trừ khuyến mãi và đặt trước)
    // ĐỒNG BỘ: Công thức này phải khớp với room-content-modal.component.ts:
    // totalPrice = roomPrice + totalAdditionalCharges + serviceTotal
    // Trong đó: totalAdditionalCharges = initialCharges + checkoutCharges
    // Khi chưa checkout: checkoutCharges = 0, nên totalAdditionalCharges = initialCharges = additionalCharges
    const totalAmount = roomPrice + additionalCharges + serviceAmount;
    
    // Còn thu = Tổng tiền - đặt trước - khuyến mãi (cho phép số âm)
    // ĐỒNG BỘ: Công thức này phải khớp với room-content-modal.component.ts:
    // remainingAmount = totalPrice - advancePayment - totalDiscount
    // Trong đó: totalDiscount = initialDiscount + checkoutDiscount
    // Khi chưa checkout: checkoutDiscount = 0, nên totalDiscount = initialDiscount = discount
    const remainingAmount = totalAmount - advancePayment - discount;
    
    // Log để debug và đảm bảo đồng bộ
    console.log(`[getRoomCheckinInfo] Room ${room.roomNumber} calculation:`, {
      roomPrice,
      additionalCharges,
      serviceAmount,
      discount,
      advancePayment,
      totalAmount,
      remainingAmount,
      formula: `${roomPrice} + ${additionalCharges} + ${serviceAmount} - ${discount} - ${advancePayment} = ${totalAmount}`
    });

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
    
    const checkinInfo = this.getRoomCheckinInfo(room);
    if (checkinInfo?.guestSource) {
      return this.normalizeGuestSource(checkinInfo.guestSource);
    }
    
    if (room.currentBooking) {
      const currentBooking = typeof room.currentBooking === 'object' ? room.currentBooking : null;
      const bookingAny = currentBooking as any;
      if (bookingAny?.guestInfo?.guestSource) {
        return this.normalizeGuestSource(bookingAny.guestInfo.guestSource, bookingAny);
      } else if (bookingAny?.guestDetails) {
        const rawSource = bookingAny.source || bookingAny.otaSource || '';
        return this.normalizeGuestSource(rawSource, bookingAny);
      }
    }
    
    return 'walkin';
  }

  // Tính và hiển thị thời gian lưu trú của khách (tương tự invoice component)
  getRoomDurationText(room: Room): string {
    if (room.status !== 'occupied') {
      return '';
    }

    const checkinInfo = this.getRoomCheckinInfo(room);
    if (!checkinInfo || !checkinInfo.checkinTime) {
      return '';
    }

    const checkInTime = checkinInfo.checkinTime instanceof Date
      ? checkinInfo.checkinTime
      : new Date(checkinInfo.checkinTime);
    const checkOutTime = new Date(); // Thời gian hiện tại (vì phòng đang occupied, chưa checkout)

    if (isNaN(checkInTime.getTime()) || isNaN(checkOutTime.getTime())) {
      return '';
    }

    // Tính chính xác thời gian lưu trú
    const durationInMs = checkOutTime.getTime() - checkInTime.getTime();
    const totalMinutes = Math.floor(durationInMs / (1000 * 60));

    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    // Hiển thị theo định dạng: X ngày Y giờ Z phút hoặc Y giờ Z phút
    const parts: string[] = [];

    if (days > 0) {
      parts.push(`${days} ngày`);
    }
    if (hours > 0) {
      parts.push(`${hours} giờ`);
    }
    if (minutes > 0 || (days === 0 && hours === 0)) {
      parts.push(`${minutes} phút`);
    }

    return parts.length > 0 ? parts.join(' ') : '0 phút';
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
    // CHỈ SỬ DỤNG events từ RoomEvent collection, không sử dụng room.events trong rooms.js
    if (room.status === 'occupied') {
      // Lấy checkin event từ room.events (đã được load từ RoomEvent collection)
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
    // CHỈ SỬ DỤNG events từ RoomEvent collection, không sử dụng room.events trong rooms.js
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

  // Kiểm tra quyền truy cập Settings
  canAccessSettings(): boolean {
    return this.authService.isSuperAdmin() || this.authService.isAdmin();
  }

  // Kiểm tra quyền truy cập Pricing Management
  canAccessPricingManagement(): boolean {
    return true; // Tất cả role đều có thể truy cập
  }

  // Kiểm tra quyền truy cập Electric Setting
  canAccessElectricSetting(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness() || 
           this.authService.isHotelManager();
  }

  // Navigate đến Settings
  navigateToSettings(): void {
    this.router.navigate(['/admin/settings']);
  }

  // Navigate đến Pricing Management
  navigateToPricing(): void {
    this.router.navigate(['/admin/pricing-management']);
  }

  // Navigate đến Electric Setting
  navigateToElectric(): void {
    this.router.navigate(['/admin/electric-setting']);
  }
}


