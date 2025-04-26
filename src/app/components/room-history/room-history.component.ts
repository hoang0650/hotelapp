import { Component, Input, OnInit, OnChanges, SimpleChanges, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { RoomsService } from '../../services/rooms.service';
import { BookingHistory } from '../../interfaces/rooms';
import { NzModalService } from 'ng-zorro-antd/modal';
import { InvoiceComponent } from '../invoice/invoice.component';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';

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
  };
  notes?: string;
  checkinTime?: Date; // Thêm để tương thích với dữ liệu từ API
  checkoutTime?: Date; // Thêm để tương thích với dữ liệu từ API
  amount?: number; // Đảm bảo có trường amount để tính toán
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

  constructor(
    private roomsService: RoomsService,
    private modalService: NzModalService,
    private message: NzMessageService,
    private router: Router,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef // Inject ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.initSettingForm();
    this.loadRoomHistory(); // Tải toàn bộ lịch sử ban đầu
    
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
      this.message.success('Xuất file Excel thành công!');
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
    const params: any = {};
    if (this.roomId) {
      params.roomId = this.roomId;
    }
    if (this.hotelId) {
      params.hotelId = this.hotelId;
    }

    // Thay đổi: Lấy hết lịch sử nếu có thể, hoặc cần API hỗ trợ lấy theo khoảng thời gian
    // Giả sử API getRoomHistory có thể trả về toàn bộ hoặc cần sửa đổi
    // Tạm thời vẫn dùng phân trang nhưng lấy một lượng lớn để tính toán chart
    params.page = 1;
    params.limit = 1000; // Lấy nhiều bản ghi để tính toán chart

    this.roomsService.getRoomHistory(params).subscribe({
      next: (data: { history: ExtendedBookingHistory[]; totalPages: number; currentPage: number; totalPayment: number; }) => {
        // Xử lý và chuẩn hóa dữ liệu gốc
        this.historyList = data.history.filter((item: any) => item.event === 'checkout').map((item: any) => {
          const checkInTime = item.checkInTime || item.checkinTime;
          const checkOutTime = item.checkOutTime || item.checkoutTime;
          return {
            ...item,
            customerName: this.getCustomerName(item),
            checkInTime: checkInTime ? new Date(checkInTime) : undefined,
            checkOutTime: checkOutTime ? new Date(checkOutTime) : undefined,
            paymentMethod: this.getPaymentMethod(item),
            guestInfo: item.guestInfo || {},
            amount: item.amount || item.totalAmount || 0 // Đảm bảo có trường amount
          };
        });

        // Lấy tổng số trang và trang hiện tại từ API
        this.totalPages = data.totalPages;
        this.currentPage = data.currentPage; // Cập nhật currentPage từ API
        // Tính toán totalHistoryCount (ước lượng nếu API không trả về)
        // TODO: Nên cập nhật API để trả về totalCount
        this.totalHistoryCount = data.totalPages * this.pageSize; 

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
        this.message.error('Lỗi khi tải lịch sử phòng.');
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
    return item.paymentMethod || 'N/A';
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

  viewInvoice(invoiceId: string | undefined): void {
    if (!invoiceId) {
      this.message.error('Không tìm thấy ID hóa đơn.');
      return;
    }
    this.isLoading = true;
    this.roomsService.getInvoiceDetails(invoiceId).subscribe({
      next: (invoiceData: any) => {
        if (invoiceData) {
          this.showInvoiceModal(invoiceData);
        } else {
          this.message.error('Không tìm thấy thông tin hóa đơn.');
        }
        this.isLoading = false;
      },
      error: (error: any) => {
        this.message.error('Lỗi khi tải thông tin hóa đơn.');
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
      'card': 'Thẻ tín dụng',
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
