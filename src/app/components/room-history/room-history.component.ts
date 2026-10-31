import { Component, Input, OnInit, OnChanges, SimpleChanges, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { RoomsService } from '../../services/rooms.service';
import { HotelService } from '../../services/hotel.service';
import { BookingHistory } from '../../interfaces/rooms';
import { NzModalService } from 'ng-zorro-antd/modal';
import { InvoiceComponent } from '../invoice/invoice.component';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { metadataPriceDetailsFromServer, normalizePrintedInvoice, productsFromServer } from '../../utils/checkout-quote';

// Mở rộng BookingHistory để thêm các trường cần thiết cho hiển thị
export interface ExtendedBookingHistory extends BookingHistory {
  customerName?: string;
  checkInTime?: Date;
  checkOutTime?: Date;
  paymentMethod?: string;
  disabled?: boolean;
  checked?: boolean;
  expand?: boolean;
  guestInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    idNumber?: string;
    address?: string;
  };
  notes?: string;
  checkinTime?: Date; // Thêm để tương thích với dữ liệu từ API
  checkoutTime?: Date; // Thêm để tương thích với dữ liệu từ API
  amount?: number; // Đảm bảo có trường amount để tính toán
  // Thêm các trường liên quan đến dịch vụ và hóa đơn
  invoiceNumber?: string;
  services?: Array<{
    serviceId?: string;
    serviceName?: string;
    name?: string;
    price?: number;
    quantity?: number;
    totalPrice?: number;
  }>;
  servicesTotal?: number;
  roomTotal?: number;
  advancePayment?: number;
  // Thêm các trường mới
  roomType?: string;
  rateType?: string;
  hotelId?: string;
}

@Component({
  selector: 'app-room-history',
  templateUrl: './room-history.component.html',
  styleUrls: ['./room-history.component.scss']
})
export class RoomHistoryComponent implements OnInit, OnChanges, OnDestroy {
  @Input() hotelId: string | null = null;
  @Input() roomId: string | null = null;

  historyList: ExtendedBookingHistory[] = []; // Danh sách lịch sử gốc từ API
  displayHistoryList: ExtendedBookingHistory[] = []; // Danh sách hiển thị trên bảng (sau phân trang)
  totalHistoryCount = 0; // Tổng số lượng bản ghi lịch sử

  totalPages = 0;
  currentPage = 1;
  pageSize = 20;
  isLoading = false;
  totalPayment = 0;
  totalRevenue = 0; // Thêm biến tổng doanh thu
  checkoutCount = 0; // Thêm biến đếm số lần checkout

  // Biến cho biểu đồ
  selectedPeriod: 'day' | 'week' | 'month' = 'day';
  chartLabels: string[] = [];
  chartRevenueData: number[] = [];
  chartPaymentData: number[] = [];

  // Các biến cài đặt bảng
  switchValue = false;
  settingForm!: FormGroup;
  listOfSwitch: Array<{ name: string; formControlName: string }> = [];
  listOfRadio: Array<{ name: string; formControlName: string; listOfOption: Array<{ value: string; label: string }> }> = [];
  settingValue: {
    bordered: boolean;
    loading: boolean;
    pagination: boolean;
    sizeChanger: boolean;
    title: boolean;
    header: boolean;
    footer: boolean;
    expandable: boolean;
    checkbox: boolean;
    fixHeader: boolean;
    noResult: boolean;
    ellipsis: boolean;
    simple: boolean;
    size: 'small' | 'middle' | 'default';
    tableLayout: 'auto' | 'fixed';
    tableScroll: string;
    position: 'top' | 'bottom' | 'both';
    paginationType: 'default' | 'small';
    totalPayment: boolean;
  } = {
    bordered: false,
    loading: false,
    pagination: true,
    sizeChanger: false,
    title: true,
    header: true,
    footer: false,
    expandable: true,
    checkbox: false,
    fixHeader: false,
    noResult: false,
    ellipsis: false,
    simple: false,
    size: 'default',
    tableLayout: 'fixed',
    tableScroll: '',
    position: 'bottom',
    paginationType: 'default',
    totalPayment: true
  };
  
  // Biến cho checkbox
  allChecked = false;
  indeterminate = false;
  
  // Subscription để quản lý unsubscribe
  private roomDataSubscription: Subscription | null = null;
  
  // Thông tin khách sạn để hiển thị trên hóa đơn
  hotelInfo: any = null;

  constructor(
    private roomsService: RoomsService,
    private hotelService: HotelService,
    private modalService: NzModalService,
    private message: NzMessageService,
    private router: Router,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef, // Inject ChangeDetectorRef
    private translate: TranslateService
  ) { }

  ngOnInit(): void {
    this.initSettingForm();
    this.loadRoomHistory(); // Tải toàn bộ lịch sử ban đầu
    this.loadHotelInfo(); // Tải thông tin khách sạn
    
    // Đăng ký lắng nghe sự kiện cập nhật dữ liệu phòng
    this.roomDataSubscription = this.roomsService.getRoomDataUpdated$().subscribe(() => {
      this.loadRoomHistory(); // Tải lại khi có cập nhật
    });
  }
  
  ngOnDestroy(): void {
    if (this.roomDataSubscription) {
      this.roomDataSubscription.unsubscribe();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['hotelId'] || changes['roomId']) {
      this.loadRoomHistory(); // Tải lại nếu input thay đổi
    }
    if (changes['hotelId']) {
      this.loadHotelInfo(); // Tải lại thông tin khách sạn khi hotelId thay đổi
    }
  }
  
  // Tải thông tin khách sạn
  private loadHotelInfo(): void {
    if (this.hotelId) {
      const hotelIdStr = typeof this.hotelId === 'object' ? (this.hotelId as any)?._id : this.hotelId;
      if (hotelIdStr && hotelIdStr !== '[object Object]') {
        this.hotelService.getHotelById(hotelIdStr).pipe(take(1)).subscribe({
          next: (hotel: any) => {
            this.hotelInfo = hotel;
            console.log('Loaded hotel info:', this.hotelInfo);
          },
          error: (err) => {
            console.error('Error loading hotel info:', err);
          }
        });
      }
    }
  }
  
  // Khởi tạo form cài đặt
  initSettingForm(): void {
    this.listOfSwitch = [
      { name: 'Viền', formControlName: 'bordered' },
      { name: 'Tải', formControlName: 'loading' },
      { name: 'Phân trang', formControlName: 'pagination' },
      { name: 'Đổi kích thước', formControlName: 'sizeChanger' },
      { name: 'Tiêu đề', formControlName: 'title' },
      { name: 'Tiêu đề cột', formControlName: 'header' },
      { name: 'Chân trang', formControlName: 'footer' },
      { name: 'Mở rộng', formControlName: 'expandable' },
      { name: 'Checkbox', formControlName: 'checkbox' },
      { name: 'Tổng thanh toán', formControlName: 'totalPayment' }
    ];
    
    this.listOfRadio = [
      {
        name: 'Kích thước',
        formControlName: 'size',
        listOfOption: [
          { value: 'default', label: 'Mặc định' },
          { value: 'middle', label: 'Vừa' },
          { value: 'small', label: 'Nhỏ' }
        ]
      },
      {
        name: 'Vị trí phân trang',
        formControlName: 'position',
        listOfOption: [
          { value: 'top', label: 'Trên' },
          { value: 'bottom', label: 'Dưới' },
          { value: 'both', label: 'Cả hai' }
        ]
      },
      {
        name: 'Kiểu phân trang',
        formControlName: 'paginationType',
        listOfOption: [
          { value: 'default', label: 'Mặc định' },
          { value: 'small', label: 'Nhỏ' }
        ]
      }
    ];
    
    const formObj: { [key: string]: any } = {};
    this.listOfSwitch.forEach(item => {
      formObj[item.formControlName] = [this.settingValue[item.formControlName as keyof typeof this.settingValue]];
    });
    
    this.listOfRadio.forEach(item => {
      formObj[item.formControlName] = [this.settingValue[item.formControlName as keyof typeof this.settingValue]];
    });
    
    this.settingForm = this.fb.group(formObj);
    
    const formChange$ = this.settingForm.valueChanges.subscribe(value => {
      this.settingValue = { ...this.settingValue, ...value };
    });
  }
  
  // Chức năng xuất Excel
  exportToExcel(): void {
    this.message.info('Đang xuất file Excel...');
    // Implement Excel export functionality here
    
    setTimeout(() => {
      this.message.success(this.translate.instant('ROOM_HISTORY.MESSAGES.EXPORT_EXCEL_SUCCESS'));
    }, 1000);
  }
  
  // Các phương thức xử lý checkbox
  refreshStatus(): void {
    const validData = this.historyList.filter(value => !value.disabled);
    const allChecked = validData.length > 0 && validData.every(value => value.checked);
    const allUnchecked = validData.every(value => !value.checked);
    this.allChecked = allChecked;
    this.indeterminate = !allChecked && !allUnchecked;
  }
  
  checkAll(value: boolean): void {
    this.historyList.forEach(item => {
      if (!item.disabled) {
        item.checked = value;
      }
    });
    this.refreshStatus();
  }

  // Tải toàn bộ lịch sử (không phân trang ở đây nữa)
  loadRoomHistory() {
    this.isLoading = true;
    
    // Đảm bảo hotelId là string hợp lệ
    let hotelIdStr: string | undefined;
    if (this.hotelId) {
      hotelIdStr = typeof this.hotelId === 'object' ? (this.hotelId as any)?._id || String(this.hotelId) : this.hotelId;
      if (hotelIdStr === '[object Object]') {
        console.error('Invalid hotelId:', this.hotelId);
        this.isLoading = false;
        return;
      }
    }

    // Gọi API với params đúng format (hotelId, filterType, page, limit)
    this.roomsService.getRoomHistory(hotelIdStr, 'all', 1, 1000).subscribe({
      next: (data: { history: ExtendedBookingHistory[]; totalPages: number; currentPage: number; totalPayment: number; }) => {
        console.log('API Response:', data);
        // Lọc chỉ lấy các bản ghi đã thanh toán (check-out hoặc paymentStatus = paid)
        this.historyList = data.history
          .filter((item: any) => item.event === 'check-out' || item.paymentStatus === 'paid')
          .map((item: any) => {
            // Tìm thời gian nhận phòng từ nhiều nguồn
            let checkInTime = item.checkInTime || item.checkinTime;
            let checkOutTime = item.checkOutTime || item.checkoutTime || item.date;
            let paymentMethod = item.paymentMethod;
            let guestInfo = item.guestInfo || {};
            let additionalCharges = item.additionalCharges || 0;
            let discount = item.discount || 0;
            let advancePayment = item.advancePayment || 0;
            
            // Nếu có events, lấy thông tin từ event checkin và checkout
            if (item.events && Array.isArray(item.events)) {
              const checkinEvent = item.events.find((e: any) => e.type === 'checkin');
              const checkoutEvent = item.events.find((e: any) => e.type === 'checkout');
              
              if (checkinEvent) {
                checkInTime = checkInTime || checkinEvent.checkinTime;
                guestInfo = checkinEvent.guestInfo || guestInfo;
                paymentMethod = paymentMethod || checkinEvent.paymentMethod;
                advancePayment = advancePayment || checkinEvent.advancePayment || 0;
                additionalCharges = additionalCharges || checkinEvent.additionalCharges || 0;
                discount = discount || checkinEvent.discount || 0;
              }
              
              if (checkoutEvent) {
                checkOutTime = checkOutTime || checkoutEvent.checkoutTime;
                paymentMethod = paymentMethod || checkoutEvent.paymentMethod;
              }
            }
            
            // Xử lý dữ liệu dịch vụ
            let services: any[] = [];
            let servicesTotal = 0;
            
            if (item.services && Array.isArray(item.services)) {
              services = item.services;
              servicesTotal = services.reduce((sum: number, s: any) => {
                return sum + (s.totalPrice || (s.price || 0) * (s.quantity || 1));
              }, 0);
            } else if (item.serviceDetails?.amount) {
              servicesTotal = item.serviceDetails.amount;
            }
            
            return {
              ...item,
              customerName: this.getCustomerName(item),
              checkInTime: checkInTime ? new Date(checkInTime) : undefined,
              checkOutTime: checkOutTime ? new Date(checkOutTime) : undefined,
              paymentMethod: paymentMethod || 'cash',
              guestInfo: {
                name: guestInfo.name || item.customerName,
                phone: guestInfo.phone || item.customerPhone,
                email: guestInfo.email || '',
                idNumber: guestInfo.idNumber || '',
                address: guestInfo.address || ''
              },
              amount: item.amount || item.totalAmount || 0,
              services: services,
              servicesTotal: item.servicesTotal || servicesTotal,
              roomTotal: item.roomTotal || 0,
              advancePayment: advancePayment,
              additionalCharges: additionalCharges,
              discount: discount,
              invoiceNumber: item.invoiceNumber || undefined,
              roomType: item.roomType || '',
              rateType: item.rateType || 'hourly'
            };
          });
        console.log('Processed History List (Paid/Checkout only):', this.historyList);

        // Lấy tổng số trang và trang hiện tại từ API
        this.totalPages = data.totalPages;
        this.currentPage = data.currentPage; // Cập nhật currentPage từ API
        // Tính toán totalHistoryCount (ước lượng nếu API không trả về)
        // TODO: Nên cập nhật API để trả về totalCount
        this.totalHistoryCount = this.historyList.length; // Tính lại totalHistoryCount dựa trên list mới

        // Tính toán các giá trị tổng hợp ban đầu
        this.calculateSummary(data.totalPayment); // Truyền totalPayment từ API
        // Tính toán dữ liệu biểu đồ ban đầu (theo ngày)
        this.aggregateChartData();
        // Cập nhật danh sách hiển thị cho trang hiện tại
        this.updateDisplayHistoryList();

        this.isLoading = false;
        this.cdr.detectChanges(); // Trigger change detection
      },
      error: (error) => {
        this.message.error(this.translate.instant('ROOM_HISTORY.MESSAGES.LOAD_ERROR'));
        console.error('Error loading room history:', error);
        this.isLoading = false;
      }
    });
  }

  // Cập nhật danh sách hiển thị trên bảng dựa trên trang hiện tại
  updateDisplayHistoryList(): void {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    this.displayHistoryList = this.historyList.slice(start, end);
    console.log('Display History List:', this.displayHistoryList);
    this.refreshStatus(); // Cập nhật trạng thái checkbox
  }

  // Cập nhật calculateSummary để nhận totalPayment từ API (nếu có)
  calculateSummary(apiTotalPayment?: number): void {
    if (apiTotalPayment !== undefined) {
      this.totalPayment = apiTotalPayment;
    } else {
      // Tính lại nếu API không cung cấp
      this.totalPayment = this.historyList.reduce((sum, item) => sum + (item.amount || 0), 0);
    }
    // Giả sử totalRevenue = totalPayment trong trường hợp này, cần làm rõ nếu khác
    this.totalRevenue = this.totalPayment;
    this.checkoutCount = this.historyList.length; // Đếm số lượng checkout events
  }

  // Xử lý khi chuyển trang trong bảng
  onPageChange(page: number): void {
    this.currentPage = page;
    this.updateDisplayHistoryList(); // Chỉ cập nhật lại danh sách hiển thị
  }

  // Xử lý khi người dùng thay đổi khoảng thời gian trên biểu đồ
  onPeriodChange(period: 'day' | 'week' | 'month'): void {
    this.selectedPeriod = period;
    this.aggregateChartData(); // Tính toán lại dữ liệu biểu đồ
  }

  // Tổng hợp dữ liệu cho biểu đồ
  aggregateChartData(): void {
    const now = new Date();
    let startDate: Date;
    let aggregationFormat: 'YYYY-MM-DD' | 'YYYY-WW' | 'YYYY-MM';
    let labelFormat: (date: Date) => string;
    const periodData: { [key: string]: { revenue: number; payment: number } } = {};

    switch (this.selectedPeriod) {
      case 'day':
        startDate = new Date(now.setDate(now.getDate() - 6)); // Lấy 7 ngày gần nhất
        aggregationFormat = 'YYYY-MM-DD';
        labelFormat = (d) => `${d.getDate()}/${d.getMonth() + 1}`;
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - (7 * 4 - 1))); // Lấy 4 tuần gần nhất
        aggregationFormat = 'YYYY-WW'; // Format năm-tuần
        labelFormat = (d) => `Tuần ${this.getWeekNumber(d)}/${d.getFullYear()}`;
        break;
      case 'month':
      default:
        startDate = new Date(now.setMonth(now.getMonth() - 11)); // Lấy 12 tháng gần nhất
        startDate.setDate(1); // Bắt đầu từ ngày 1 của tháng
        aggregationFormat = 'YYYY-MM';
        labelFormat = (d) => `${d.getMonth() + 1}/${d.getFullYear()}`;
        break;
    }

    startDate.setHours(0, 0, 0, 0);

    // Lọc và tổng hợp dữ liệu
    this.historyList
      .filter(item => item.checkOutTime && item.checkOutTime >= startDate)
      .forEach(item => {
        const date = item.checkOutTime!;
        let key: string;

        switch (aggregationFormat) {
          case 'YYYY-MM-DD':
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            break;
          case 'YYYY-WW':
            key = `${date.getFullYear()}-${String(this.getWeekNumber(date)).padStart(2, '0')}`;
            break;
          case 'YYYY-MM':
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            break;
        }

        if (!periodData[key]) {
          periodData[key] = { revenue: 0, payment: 0 };
        }
        const paymentAmount = item.amount || 0;
        periodData[key].payment += paymentAmount;
        // Giả định revenue = payment, cần điều chỉnh nếu khác
        periodData[key].revenue += paymentAmount;
      });

    // Tạo labels và data cho biểu đồ
    const sortedKeys = Object.keys(periodData).sort();
    this.chartLabels = sortedKeys.map(key => {
        // Chuyển key về Date để format label
        const parts = key.split('-');
        if(this.selectedPeriod === 'week') {
            // Cần logic phức tạp hơn để lấy ngày đại diện cho tuần từ YYYY-WW
             return `Tuần ${parts[1]}/${parts[0]}`; // Tạm thời
        } else {
             const year = parseInt(parts[0]);
             const month = parseInt(parts[1]) -1;
             const day = this.selectedPeriod === 'day' ? parseInt(parts[2]) : 1;
             return labelFormat(new Date(year, month, day));
        }
    });
    this.chartRevenueData = sortedKeys.map(key => periodData[key].revenue);
    this.chartPaymentData = sortedKeys.map(key => periodData[key].payment);

    this.cdr.detectChanges(); // Cập nhật view sau khi tính toán xong
  }

  // Hàm helper lấy số tuần trong năm (ISO 8601)
  getWeekNumber(d: Date): number {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
  }

  // Helper methods để lấy dữ liệu từ response API
  private getCustomerName(item: any): string {
    return item?.guestInfo?.name || item?.customerName || 'Khách lẻ';
  }

  private getCheckInTime(item: any): Date | undefined {
    const time = item.checkInTime || item.checkinTime;
    return time ? new Date(time) : undefined;
  }

  private getCheckOutTime(item: any): Date | undefined {
    const time = item.checkOutTime || item.checkoutTime;
    return time ? new Date(time) : undefined;
  }

  private getPaymentMethod(item: any): string {
    // Ưu tiên lấy từ các nguồn khác nhau
    return item.paymentMethod || 
           item.payment?.method || 
           item.paymentDetails?.paymentMethod ||
           'cash';
  }

  // Xác định màu sắc theo loại sự kiện
  getEventColor(event: string | undefined): string {
    if (!event) return 'default';
    
    switch (event) {
      case 'check-in':
        return 'green';
      case 'check-out':
        return 'blue';
      case 'payment':
        return 'purple';
      case 'maintenance':
        return 'orange';
      case 'cleaning':
        return 'cyan';
      case 'service':
        return 'magenta';
      default:
        return 'default';
    }
  }

  // Lấy nhãn hiển thị cho loại sự kiện
  getEventLabel(event: string | undefined): string {
    if (!event) return 'Không xác định';
    
    switch (event) {
      case 'check-in':
        return 'Nhận phòng';
      case 'check-out':
        return 'Trả phòng';
      case 'payment':
        return 'Thanh toán';
      case 'maintenance':
        return 'Bảo trì';
      case 'cleaning':
        return 'Dọn dẹp';
      case 'service':
        return 'Dịch vụ';
      default:
        return event;
    }
  }

  // Hàm xử lý sự kiện từ app-table
  viewInvoiceFromTable(historyItem: any): void {
    console.log('=== viewInvoiceFromTable được gọi ===');
    console.log('historyItem received:', historyItem);
    
    if (historyItem) {
      // Tạo dữ liệu hóa đơn từ history item
      this.showInvoiceFromHistoryItem(historyItem);
    } else {
      this.message.error(this.translate.instant('ROOM_HISTORY.MESSAGES.INVOICE_INFO_NOT_FOUND'));
      console.error('Invalid history item passed to viewInvoiceFromTable:', historyItem);
    }
  }

  // Tạo và hiển thị hóa đơn từ history item
  private showInvoiceFromHistoryItem(historyItem: ExtendedBookingHistory): void {
    console.log('=== showInvoiceFromHistoryItem ===');
    console.log('Input historyItem:', historyItem);
    
    // Tạo products array từ dữ liệu history
    const products: any[] = [];
    
    // Lấy các giá trị từ historyItem
    const totalAmount = historyItem.totalAmount || historyItem.amount || 0;
    const additionalCharges = historyItem.additionalCharges || 0;
    const discount = historyItem.discount || 0;
    const advancePayment = historyItem.advancePayment || 0;
    
    // Lấy tiền phòng trực tiếp từ historyItem.roomTotal
    let roomAmount = historyItem.roomTotal || 0;
    
    // Xử lý dịch vụ
    let servicesTotal = historyItem.servicesTotal || 0;
    const services: any[] = [];
    
    // Nếu có services array, lấy chi tiết
    if (historyItem.services && Array.isArray(historyItem.services) && historyItem.services.length > 0) {
      historyItem.services.forEach(service => {
        const serviceName = service.serviceName || service.name || 'Dịch vụ';
        const servicePrice = service.price || 0;
        const serviceQuantity = service.quantity || 1;
        const serviceTotal = service.totalPrice || (servicePrice * serviceQuantity);
        
        services.push({
          name: serviceName,
          price: servicePrice,
          quantity: serviceQuantity,
          totalPrice: serviceTotal
        });
      });
      
      // Tính lại servicesTotal từ services array nếu chưa có
      if (!servicesTotal) {
        servicesTotal = services.reduce((sum, s) => sum + (s.totalPrice || 0), 0);
      }
    } else if (historyItem.serviceDetails?.amount) {
      // Fallback: lấy từ serviceDetails
      servicesTotal = historyItem.serviceDetails.amount;
      services.push({
        name: 'Dịch vụ',
        price: servicesTotal,
        quantity: 1,
        totalPrice: servicesTotal
      });
    } else if (servicesTotal > 0 && services.length === 0) {
      // Nếu có servicesTotal nhưng không có chi tiết services
      services.push({
        name: 'Dịch vụ sử dụng',
        price: servicesTotal,
        quantity: 1,
        totalPrice: servicesTotal
      });
    }
    
    // Nếu không có roomTotal, tính từ totalAmount
    if (!roomAmount && totalAmount > 0) {
      roomAmount = totalAmount - servicesTotal - additionalCharges + discount;
    }
    
    console.log('Calculated values:', {
      roomAmount,
      servicesTotal,
      additionalCharges,
      discount,
      advancePayment,
      totalAmount
    });
    
    // Thêm tiền phòng vào products
    products.push({
      name: `Tiền phòng ${historyItem.roomNumber || ''}`,
      price: Math.max(0, roomAmount),
      quantity: 1
    });
    
    // Thêm dịch vụ vào products
    services.forEach(service => {
      products.push({
        name: service.name,
        price: service.price,
        quantity: service.quantity
      });
    });
    
    // Thêm phụ thu vào products nếu có
    if (additionalCharges > 0) {
      products.push({
        name: 'Phụ thu',
        price: additionalCharges,
        quantity: 1
      });
    }
    
    console.log('Products array:', products);
    console.log('Services array:', services);
    
    // Tính toán thời gian lưu trú
    const checkInTime = historyItem.checkInTime || historyItem.checkinTime;
    const checkOutTime = historyItem.checkOutTime || historyItem.checkoutTime || historyItem.date;
    let durationHours = 0;
    let durationDays = 0;
    
    if (checkInTime && checkOutTime) {
      const checkIn = new Date(checkInTime);
      const checkOut = new Date(checkOutTime);
      durationHours = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60));
      durationDays = Math.ceil(durationHours / 24);
    }
    
    // Tạo số hóa đơn format chuẩn
    const checkOutDate = checkOutTime ? new Date(checkOutTime) : new Date();
    const invoiceNumber = historyItem.invoiceNumber || `INV-${checkOutDate.getTime()}`;
    
    // Lấy thông tin khách hàng từ guestInfo
    const guestInfo = historyItem.guestInfo || {};
    
    const invoiceData = {
      // Số hóa đơn và ngày
      invoiceNumber: invoiceNumber,
      date: checkOutTime || new Date(),
      
      // Thông tin khách sạn
      businessName: this.hotelInfo?.name || 'Khách sạn',
      business_address: this.hotelInfo?.address || '',
      phoneNumber: this.hotelInfo?.phone || this.hotelInfo?.phoneNumber || '',
      
      // Thông tin khách hàng
      customerName: historyItem.customerName || guestInfo.name || 'Khách lẻ',
      customerPhone: historyItem.customerPhone || guestInfo.phone || '',
      customerEmail: guestInfo.email || '',
      customerIdNumber: guestInfo.idNumber || '',
      customerAddress: guestInfo.address || '',
      guestInfo: guestInfo,
      
      // Thông tin nhân viên
      staffName: historyItem.staffName || 'Nhân viên',
      
      // Thông tin phòng
      roomNumber: historyItem.roomNumber || 'N/A',
      roomType: historyItem.roomType || 'Phòng thường',
      rateType: historyItem.rateType || 'hourly',
      hotelId: this.hotelId || historyItem.hotelId,
      
      // Thời gian
      checkInTime: checkInTime,
      checkOutTime: checkOutTime,
      duration: {
        hours: durationHours,
        days: durationDays
      },
      
      // Sản phẩm và dịch vụ
      products: products,
      services: services,
      
      // Chi tiết thanh toán
      roomTotal: Math.max(0, roomAmount),
      servicesTotal: servicesTotal,
      additionalCharges: additionalCharges,
      discount: discount,
      advancePayment: advancePayment,
      totalAmount: totalAmount,
      
      // Còn lại phải trả
      remainingAmount: totalAmount - advancePayment,
      
      // Hình thức thanh toán
      paymentMethod: historyItem.paymentMethod || 'cash',
      paymentStatus: 'paid',
      
      // Ghi chú
      notes: historyItem.notes || ''
    };
    
    const serverProducts = productsFromServer(historyItem);
    const priceDetails = metadataPriceDetailsFromServer(historyItem);
    if (serverProducts) {
      invoiceData.products = serverProducts;
    }
    if (priceDetails) {
      (invoiceData as any).priceDetails = priceDetails;
      (invoiceData as any).metadata = {
        ...((historyItem as any).metadata || {}),
        priceDetails
      };
    }

    console.log('=== Final invoiceData ===');
    console.log('invoiceData:', invoiceData);
    console.log('products:', invoiceData.products);
    console.log('roomTotal:', invoiceData.roomTotal);
    console.log('servicesTotal:', invoiceData.servicesTotal);
    console.log('additionalCharges:', invoiceData.additionalCharges);
    console.log('discount:', invoiceData.discount);
    console.log('totalAmount:', invoiceData.totalAmount);
    
    this.showInvoiceModal(invoiceData);
  }

  // Hàm xem hóa đơn gốc (được gọi bởi viewInvoiceFromTable)
  viewInvoice(invoiceId: string | undefined): void {
    if (!invoiceId) {
      this.message.error(this.translate.instant('ROOM_HISTORY.MESSAGES.INVOICE_ID_NOT_FOUND'));
      return;
    }
    this.isLoading = true;
    // Giả định getInvoiceDetails có thể lấy hóa đơn từ ID của bản ghi history (_id)
    // Hoặc cần một API endpoint khác nếu ID hóa đơn khác với _id
    this.roomsService.getInvoiceDetails(invoiceId).subscribe({ 
      next: (invoiceData: any) => {
        if (invoiceData) {
          this.showInvoiceModal(normalizePrintedInvoice(invoiceData));
        } else {
          this.message.error(this.translate.instant('ROOM_HISTORY.MESSAGES.INVOICE_NOT_FOUND'));
        }
        this.isLoading = false;
      },
      error: (error: any) => {
        this.message.error(this.translate.instant('ROOM_HISTORY.MESSAGES.INVOICE_LOAD_ERROR'));
        console.error('Error fetching invoice:', error);
        this.isLoading = false;
      }
    });
  }

  private showInvoiceModal(invoiceData: any): void {
    this.modalService.create({
      nzTitle: 'Hóa đơn thanh toán',
      nzContent: InvoiceComponent,
      nzData: {
        invoiceData: invoiceData
      },
      nzWidth: 800,
      nzFooter: null,
      nzMaskClosable: false
    });
  }

  getPaymentMethodLabel(method: string): string {
    if (!method) return 'Tiền mặt';
    
    const methodMap: {[key: string]: string} = {
      'cash': 'Tiền mặt',
      'card': 'Thẻ ngân hàng',
      'transfer': 'Chuyển khoản',
      'banking': 'Chuyển khoản',
      'qr': 'Quét mã QR',
      'visa': 'Visa/Mastercard'
    };
    
    return methodMap[method.toLowerCase()] || method;
  }

  formatCurrency(amount: number | undefined): string {
    if (amount === undefined) return '0 đ';
    return amount.toLocaleString('vi-VN') + ' đ';
  }
}
