import { Component, OnInit, NgModule, Input, Output, EventEmitter, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { FormControl, FormGroup, NonNullableFormBuilder, Validators } from '@angular/forms';
import { NzTableLayout, NzTablePaginationPosition, NzTablePaginationType, NzTableSize } from 'ng-zorro-antd/table';
import { ProductService } from '../../services/product.service';
import { RoomsService } from '../../services/rooms.service';
import { ItemData, Setting } from '../../interfaces/room';
import * as XLSX from 'xlsx';
import { NzMessageService } from 'ng-zorro-antd/message';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { format } from 'date-fns';
import { finalize, catchError, takeUntil, debounceTime } from 'rxjs/operators';
import { throwError, Subject, Subscription } from 'rxjs';
import { InvoiceService } from '../../services/invoice.service';
import { StaffService } from '../../services/staff.service';
import { ShiftHandoverService } from '../../services/shift-handover.service';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { Staff, getStaffFullName } from '../../interfaces/staff';
import { NzModalService } from 'ng-zorro-antd/modal';
import { InvoiceComponent } from '../invoice/invoice.component';
import { HotelService } from '../../services/hotel.service';
import { BusinessService } from '../../services/business.service';
import { TransactionService } from '../../services/transaction.service';
import { take } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { CurrencyService } from '../../services/currency.service';
import { User } from '../../interfaces/user';

type TableScroll = 'unset' | 'scroll' | 'fixed';

interface TableSetting {
  totalPayment: boolean;
  bordered: boolean;
  loading: boolean;
  pagination: boolean;
  sizeChanger: boolean;
  title: boolean;
  footer: boolean;
  expandable: boolean;
  checkbox: boolean;
  fixedHeader: boolean;
  tableLayout: 'auto' | 'fixed';
  ellipsis: boolean;
  simple: boolean;
  size: NzTableSize;
  position: NzTablePaginationPosition;
  paginationType: NzTablePaginationType;
}

interface SettingSwitch {
  name: string;
  formControlName: keyof TableSetting;
}

interface SettingRadio {
  name: string;
  formControlName: keyof TableSetting;
  listOfOption: Array<{ value: string; label: string }>;
}

@Component({
  selector: 'app-table',
  templateUrl: './table.component.html',
  styleUrls: ['./table.component.css']
})
export class TableComponent implements OnInit, OnChanges, OnDestroy {
  @Input() listOfData: any[] = [];
  @Input() hotelId: string | null = null;
  @Input() fixedColumn: boolean = true;
  @Input() totalExpense: number = 0; // Tổng chi từ revenue-chart
  @Output() onViewInvoice = new EventEmitter<any>();

  // Bộ lọc
  currentFilterType = 'checkout'; // Giá trị mặc định là checkout
  paymentStatusFilter: 'all' | 'paid' | 'pending' | 'unpaid' = 'all'; // Bộ lọc trạng thái thanh toán
  
  // Phân trang
  currentPage: number = 1;
  pageSize: number = 10; // Hiển thị 10 phòng mỗi trang
  totalItems: number = 0;
  totalPages: number = 0;
  lastFilterType: string = ''; // Lưu filterType cuối cùng để tránh load lại không cần thiết
  processedPaidData: any[] = []; 
  displayData: any[] = [];
  
  // Subscription để tự động reload khi có cập nhật dữ liệu phòng
  private roomDataUpdateSubscription?: Subscription;
  
  private getNormalizedPaymentStatus(item: any): string {
    const paymentStatus = item.paymentStatus || item.payment?.status || item.payment?.paymentStatus || item.status || 'unpaid';
    return paymentStatus === 'completed' ? 'paid' : paymentStatus;
  }

  getDisplayTotalAmount(item: any): number {
    const hasTotal = item?.totalAmount !== undefined && item?.totalAmount !== null;
    if (hasTotal) {
      return this.parseMoneyValue(item.totalAmount);
    }

    const value = item?.amount ?? item?.payment?.amount;
    const direct = this.parseMoneyValue(value);
    if (direct > 0) {
      return direct;
    }

    const e = this.getCheckoutEvent(item);
    if (e) {
      const eTotal = this.parseMoneyValue(e?.totalAmount ?? e?.amount);
      if (eTotal > 0) {
        return eTotal;
      }
      const roomAmount = this.parseMoneyValue(e?.roomAmount ?? e?.roomTotal ?? item?.roomAmount ?? item?.roomTotal ?? 0);
      const serviceAmount = this.parseMoneyValue(e?.serviceAmount ?? e?.servicesTotal ?? item?.serviceAmount ?? item?.servicesTotal ?? 0);
      const additionalCharges = this.parseMoneyValue(e?.additionalCharges ?? item?.additionalCharges ?? 0);
      const discount = this.parseMoneyValue(e?.discount ?? item?.discount ?? 0);
      const advancePayment = this.parseMoneyValue(e?.advancePayment ?? item?.advancePayment ?? 0);
      const calc = roomAmount + serviceAmount + additionalCharges - discount - advancePayment;
      return Number.isFinite(calc) ? Math.max(0, calc) : 0;
    }

    const roomAmount = this.parseMoneyValue(item?.roomAmount ?? item?.roomTotal ?? 0);
    const serviceAmount = this.parseMoneyValue(item?.serviceAmount ?? item?.servicesTotal ?? 0);
    const additionalCharges = this.parseMoneyValue(item?.additionalCharges ?? 0);
    const discount = this.parseMoneyValue(item?.discount ?? 0);
    const advancePayment = this.parseMoneyValue(item?.advancePayment ?? 0);
    const calc = roomAmount + serviceAmount + additionalCharges - discount - advancePayment;
    return Number.isFinite(calc) ? Math.max(0, calc) : 0;
  }

  private parseMoneyValue(value: any): number {
    if (value === null || value === undefined) {
      return 0;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
      const firstPart = value.split('(')[0] || '';
      const cleaned = firstPart.replace(/[^\d\-]/g, '');
      if (!cleaned || cleaned === '-' || cleaned === '--') {
        return 0;
      }
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : 0;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  private getCheckoutEvent(item: any): any | null {
    if (!item?.events || !Array.isArray(item.events) || item.events.length === 0) {
      return null;
    }
    const events = item.events as any[];
    const checkoutEvents = events.filter(e => {
      const t = (e?.type || e?.event || '').toString().toLowerCase();
      return t === 'checkout' || t === 'check-out' || t === 'check_out';
    });
    if (checkoutEvents.length === 0) {
      return null;
    }
    const sorted = checkoutEvents.slice().sort((a, b) => {
      const ta = new Date(a?.checkOutTime || a?.checkoutTime || a?.date || 0).getTime();
      const tb = new Date(b?.checkOutTime || b?.checkoutTime || b?.date || 0).getTime();
      return tb - ta;
    });
    return sorted[0] || null;
  }
  
  private isPaidTransaction(item: any): boolean {
    const normalizedStatus = this.getNormalizedPaymentStatus(item);
    return normalizedStatus === 'paid';
  }
// TỐI ƯU: Hàm này chỉ chạy đúng 1 lần khi có dữ liệu mới, không chạy liên tục như getter
  processTableData(): void {
    if (!this.listOfData) {
      this.processedPaidData = [];
      this.updateDisplayData();
      return;
    }

    this.processedPaidData = this.listOfData.filter(item => {
      const excludedEvents = [
        'cleaning', 'clean', 'maintenance', 'check-in', 'checkin', 
        'service', 'transfer', 'booking', 'checked_in', 'cancel_booking'
      ];
      
      let eventType = (item.event || item.type || '').toLowerCase();
      if (!eventType && item?.events && Array.isArray(item.events)) {
        const hasCheckout = item.events.some((e: any) => {
          const t = (e?.type || e?.event || '').toString().toLowerCase();
          return t === 'checkout' || t === 'check-out' || t === 'check_out';
        });
        eventType = hasCheckout ? 'checkout' : ((item.events[0]?.type || item.events[0]?.event || '').toString().toLowerCase());
      }
      
      if (excludedEvents.includes(eventType)) return false;
      if (item.status === 'booked' || item.status === 'pending' || 
          item.bookingStatus === 'booked' || item.bookingStatus === 'pending') {
        return false;
      }
      
      const hasCheckoutTime = !!item.checkOutTime || !!item.checkoutTime ||
        (Array.isArray(item?.events) && item.events.some((e: any) => !!(e?.checkOutTime || e?.checkoutTime || e?.date)));
      if (!hasCheckoutTime) return false;
      
      const isCheckout = eventType === 'check-out' || eventType === 'checkout';
      if (!isCheckout) return false;
      
      if (this.paymentStatusFilter !== 'all') {
        const normalizedStatus = this.getNormalizedPaymentStatus(item);
        if (this.paymentStatusFilter === 'paid' && normalizedStatus !== 'paid') return false;
        if (this.paymentStatusFilter === 'pending' && normalizedStatus !== 'pending') return false;
        if (this.paymentStatusFilter === 'unpaid' && (normalizedStatus === 'paid' || normalizedStatus === 'pending')) return false;
      }
      
      const roomAmount = item.roomAmount || item.roomTotal || 0;
      const serviceAmount = item.serviceAmount || item.servicesTotal || 0;
      const additionalCharges = item.additionalCharges || 0;
      const discount = item.discount || 0;
      const advancePayment = item.advancePayment || 0;
      
      if (roomAmount > 0 || serviceAmount > 0 || additionalCharges > 0 || discount > 0 || advancePayment > 0) {
        const calculatedTotal = roomAmount + serviceAmount + additionalCharges - discount - advancePayment;
        if (!item.totalAmount || Math.abs(item.totalAmount - calculatedTotal) > 0.01) {
          item.totalAmount = calculatedTotal;
        }
      }
      
      if (!item.roomTotal && item.roomAmount) item.roomTotal = item.roomAmount;
      if (!item.servicesTotal && item.serviceAmount) item.servicesTotal = item.serviceAmount;
      
      return true;
    });

    // Cập nhật thông số phân trang
    this.totalItems = this.processedPaidData.length;
    this.totalPages = Math.ceil(this.totalItems / this.pageSize);
    if (this.currentPage > this.totalPages && this.totalPages > 0) this.currentPage = this.totalPages;
    if (this.currentPage < 1) this.currentPage = 1;

    this.updateDisplayData();
  }

  // TỐI ƯU: Hàm cắt trang chạy cực nhẹ
  updateDisplayData(): void {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.displayData = this.processedPaidData.slice(startIndex, endIndex);
  }
  
  searchText: string = '';
  exported: boolean = false;
  switchValue = false;
  allChecked = false;
  indeterminate = false;
  totalPayment = 0;
  today = new Date();
  // Currency handling
  baseCurrency: string = 'VND';
  usdRate: number = 0;
  
  // Giao ca variables
  isShiftHandoverModalVisible = false;
  isSubmitting = false;
  shiftHandoverForm!: FormGroup;
  handoverMessage: string | null = null;
  handoverMessageType: 'error' | 'success' | 'warning' | 'info' = 'info';
  defaultShiftId = '8bacd72a-f6a0-461b-be9f-f3924c7cb640';
  
  // Staff list for shift handover
  staffList: Staff[] = [];
  currentStaffId: string = '';
  previousShiftAmount: number = 0;
  isLoadingStaff = false;
  passwordVisible = false;
  
  // Giao tiền quản lý
  isManagerHandoverModalVisible = false;
  managerHandoverForm!: FormGroup;
  isSubmittingManagerHandover = false;
  managerList: Staff[] = []; // Danh sách quản lý
  managerPasswordVisible = false;
  lastManagerHandoverTime: Date | null = null; // Thời điểm giao tiền quản lý cuối cùng
  currentShiftStartTime: Date | null = null; // Thời điểm bắt đầu ca hiện tại (từ giao ca gần nhất)
  
  // Lịch sử giao ca
  isShiftHandoverHistoryVisible = false;
  
  scrollX: string | null = null;
  scrollY: string | null = null;

  settingForm!: FormGroup;
  settingValue: TableSetting = {
    totalPayment: true,
    bordered: false,
    loading: false,
    pagination: true,
    sizeChanger: true,
    title: true,
    footer: true,
    expandable: true,
    checkbox: true,
    fixedHeader: false,
    tableLayout: 'auto',
    ellipsis: false,
    simple: false,
    size: 'default',
    position: 'bottom',
    paginationType: 'default'
  };

  listOfSwitch: SettingSwitch[] = [
    { name: 'Hiển thị tổng tiền', formControlName: 'totalPayment' },
    { name: 'Hiển thị viền', formControlName: 'bordered' },
    { name: 'Hiển thị tiêu đề', formControlName: 'title' },
    { name: 'Hiển thị chân trang', formControlName: 'footer' },
    { name: 'Cho phép mở rộng', formControlName: 'expandable' },
    { name: 'Cho phép chọn', formControlName: 'checkbox' },
    { name: 'Cố định header', formControlName: 'fixedHeader' },
    { name: 'Co chữ quá dài', formControlName: 'ellipsis' }
  ];
  
  listOfRadio: SettingRadio[] = [
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

  paymentMethodOptions = [
    { value: 'cash', label: 'Tiền mặt', color: 'green' },
    { value: 'card', label: 'Thẻ ngân hàng', color: 'blue' },
    { value: 'transfer', label: 'Chuyển khoản', color: 'purple' },
    { value: 'banking', label: 'Chuyển khoản', color: 'purple' },
    { value: 'qr', label: 'Quét mã QR', color: 'cyan' },
    { value: 'visa', label: 'Visa/Mastercard', color: 'magenta' }
  ];

  paymentStatusOptions = [
    { value: 'paid', label: 'Đã thanh toán', color: 'success' },
    { value: 'pending', label: 'Chờ thanh toán', color: 'processing' },
    { value: 'unpaid', label: 'Chưa thanh toán', color: 'warning' },
    { value: 'refunded', label: 'Đã hoàn tiền', color: 'cyan' },
    { value: 'cancelled', label: 'Đã hủy', color: 'error' }
  ];

  constructor(
    private fb: NonNullableFormBuilder, 
    private productService: ProductService, 
    private roomService: RoomsService,
    private staffService: StaffService,
    private shiftHandoverService: ShiftHandoverService,
    private authService: AuthService,
    private userService: UserService,
    private message: NzMessageService,
    private http: HttpClient,
    private invoiceService: InvoiceService,
    private modalService: NzModalService,
    private hotelService: HotelService,
    private businessService: BusinessService,
    private transactionService: TransactionService,
    public translate: TranslateService,
    private currencyService: CurrencyService
  ) {}

  ngOnInit(): void {
    this.settingForm = this.fb.group({});
    this.listOfSwitch.forEach(item => {
      this.settingForm.addControl(item.formControlName, new FormControl(this.settingValue[item.formControlName]));
    });
    this.listOfRadio.forEach(item => {
      this.settingForm.addControl(item.formControlName, new FormControl(this.settingValue[item.formControlName]));
    });
    
    this.settingForm.valueChanges.subscribe(values => {
      this.settingValue = { ...this.settingValue, ...(values as Partial<TableSetting>) };
      this.setScrollSize();
      this.calculateTotalPayment();
    });
    
    this.initShiftHandoverForm();
    this.initManagerHandoverForm();
    this.setScrollSize();
    this.calculateTotalPayment();

    // TRÌ HOÃN TẢI: Đẩy lùi việc gọi API lịch sử checkout xuống 1.5s
    if (this.hotelId && this.listOfData.length === 0) {
      setTimeout(() => {
        this.loadHistory(this.currentFilterType);
      }, 1500); 
    }
    
    // Subscribe vào roomDataUpdated$ để tự động reload khi có cập nhật
    this.roomDataUpdateSubscription = this.roomService.getRoomDataUpdated$().subscribe(() => {
      if (this.hotelId) {
        // Đợi một chút để đảm bảo backend đã cập nhật xong
        setTimeout(() => {
          this.loadHistory(this.currentFilterType);
        }, 500);
      }
    });
    
    // Tỷ giá VND -> USD cho hiển thị quy đổi
    this.currencyService.getExchangeRate(this.baseCurrency, 'USD').subscribe({
      next: (rate) => { this.usdRate = rate || 0; },
      error: () => { this.usdRate = 0; }
    });
  }
  
  ngOnDestroy(): void {
    // Unsubscribe để tránh memory leak
    if (this.roomDataUpdateSubscription) {
      this.roomDataUpdateSubscription.unsubscribe();
    }
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['listOfData']) {
      this.calculateTotalPayment();
    }
    
    if (changes['hotelId'] && this.hotelId && !changes['listOfData']) {
      // Nếu hotelId thay đổi mà không có dữ liệu được truyền vào
      this.loadHistory(this.currentFilterType);
    }
    
    // Cập nhật expenseAmount từ totalExpense khi totalExpense thay đổi
    if (changes['totalExpense'] && this.shiftHandoverForm) {
      const expenseAmount = changes['totalExpense'].currentValue || 0;
      this.shiftHandoverForm.patchValue({
        expenseAmount: expenseAmount
      }, { emitEvent: false }); // Không emit event để tránh trigger valueChanges
    }
  }
  
  setScrollSize(): void {
    this.scrollX = this.settingValue.fixedHeader ? '1200px' : null;
    this.scrollY = this.settingValue.fixedHeader ? '600px' : null;
  }
  
  countByStatus(status: 'paid' | 'pending' | 'cancelled' | 'refunded'): number {
    if (!this.listOfData) return 0;
    
    return this.listOfData.filter(item => {
      // Lấy paymentStatus từ nhiều nguồn
      const paymentStatus = item.paymentStatus || item.payment?.status || item.payment?.paymentStatus || item.status || 'unpaid';
      // Chuẩn hóa: 'completed' từ SePay = 'paid'
      const normalizedStatus = (paymentStatus === 'completed') ? 'paid' : paymentStatus;
      
      if (status === 'paid') {
        return normalizedStatus === 'paid' || (item.amount > 0 || item.payment?.amount > 0);
      } else if (status === 'pending') {
        return normalizedStatus === 'pending' || (item.amount === 0 && (!item.payment || item.payment.amount === 0));
      } else {
        return normalizedStatus === status;
      }
    }).length;
  }
  
  getPaymentStatusText(status: string): string {
    // Chuẩn hóa: 'completed' từ SePay = 'paid'
    const normalizedStatus = (status === 'completed') ? 'paid' : status;
    
    const found = this.paymentStatusOptions.find(option => option.value === normalizedStatus);
    if (found) {
      return found.label;
    }
    // Nếu không tìm thấy trong options, kiểm tra trực tiếp
    if (normalizedStatus === 'paid') return 'Đã thanh toán';
    if (normalizedStatus === 'pending') return 'Chờ thanh toán';
    if (normalizedStatus === 'unpaid') return 'Chưa thanh toán';
    return 'Chưa thanh toán'; // Default
  }

  getPaymentStatusColor(status: string): string {
    // Chuẩn hóa: 'completed' từ SePay = 'paid'
    const normalizedStatus = (status === 'completed') ? 'paid' : status;
    
    const found = this.paymentStatusOptions.find(option => option.value === normalizedStatus);
    return found ? found.color : 'warning';
  }

  // Kiểm tra quyền
  get canRecheckin(): boolean {
    return this.authService.isSuperAdmin() || 
           this.authService.isAdmin() || 
           this.authService.isBusiness();
  }

  get canDelete(): boolean {
    return this.authService.isSuperAdmin();
  }

  // Check-in lại (undo checkout)
  recheckin(item: any): void {
    // Lấy roomId từ nhiều nguồn
    const roomId = item.roomId || item.room?._id || item.room?._id?.toString();
    
    if (!roomId) {
      this.message.error('Không tìm thấy thông tin phòng');
      console.error('Item data:', item);
      return;
    }

    // Lấy invoiceId từ nhiều nguồn
    const invoiceId = item.invoiceId || item.invoice?._id || item.invoiceNumber;
    
    // Lấy historyId (là _id của bookingHistory entry)
    const historyId = item._id || item.bookingId;

    this.modalService.confirm({
      nzTitle: 'Xác nhận check-in lại',
      nzContent: `Bạn có chắc chắn muốn check-in lại phòng ${item.roomNumber || 'N/A'}? Hành động này sẽ hoàn tác checkout và khôi phục lại trạng thái phòng như trước khi checkout.`,
      nzOkText: 'Xác nhận',
      nzOkType: 'primary',
      nzOkDanger: false,
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        const payload: any = {
          roomId: roomId.toString()
        };
        
        // Chỉ thêm invoiceId nếu có
        if (invoiceId) {
          payload.invoiceId = invoiceId.toString();
        }
        
        // Chỉ thêm historyId nếu có
        if (historyId) {
          payload.historyId = historyId.toString();
        }

        console.log('Recheckin payload:', payload);

        this.roomService.recheckinRoom(payload).subscribe(
          (response) => {
            this.message.success('Check-in lại thành công');
            
            // Lưu thông tin checkin event vào localStorage nếu có trong response
            if (response.checkinEvent && response.room?._id) {
              try {
                const checkinEvent = response.checkinEvent;
                const checkinData = {
                  checkinTime: checkinEvent.checkinTime,
                  guestInfo: checkinEvent.guestInfo || {},
                  rateType: checkinEvent.rateType || 'hourly',
                  advancePayment: checkinEvent.advancePayment || 0,
                  additionalCharges: checkinEvent.additionalCharges || 0,
                  discount: checkinEvent.discount || 0,
                  selectedServices: checkinEvent.selectedServices || [],
                  paymentMethod: checkinEvent.paymentMethod || 'cash',
                  expectedCheckoutTime: checkinEvent.expectedCheckoutTime,
                  transferredFrom: checkinEvent.transferredFrom,
                  transferredAt: checkinEvent.transferredAt,
                  roomId: response.room._id,
                  roomNumber: response.room.roomNumber
                };
                localStorage.setItem(`checkin_${response.room._id}`, JSON.stringify(checkinData));
                console.log('Saved recheckin event data to localStorage:', checkinData);
              } catch (e) {
                console.error('Error saving recheckin event data:', e);
              }
            }
            
            // Reload history
            if (this.hotelId) {
              setTimeout(() => {
                this.loadHistory(this.currentFilterType);
                // Notify room component để reload rooms với force reload
                this.roomService.notifyRoomDataUpdated();
              }, 300);
            }
          },
          (error) => {
            console.error('Recheckin error:', error);
            const errorMessage = error.error?.error || error.error?.message || error.message || 'Lỗi không xác định';
            this.message.error('Lỗi khi check-in lại: ' + errorMessage);
            
            // Hiển thị thông tin chi tiết nếu có
            if (error.error?.details) {
              console.error('Error details:', error.error.details);
            }
          }
        );
      }
    });
  }

  // Xóa lịch sử checkout
  deleteHistory(item: any): void {
    // Lấy roomId từ nhiều nguồn
    const roomId = item.roomId || item.room?._id || item.room?._id?.toString();
    
    // Lấy historyId (là _id của bookingHistory entry)
    const historyId = item._id || item.bookingId;
    
    if (!roomId || !historyId) {
      this.message.error('Không tìm thấy thông tin cần thiết');
      console.error('Item data:', item);
      return;
    }

    // Lấy invoiceId từ nhiều nguồn
    const invoiceId = item.invoiceId || item.invoice?._id || item.invoiceNumber;

    this.modalService.confirm({
      nzTitle: 'Xác nhận xóa',
      nzContent: `Bạn có chắc chắn muốn xóa lịch sử checkout này? Hành động này không thể hoàn tác.`,
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        const payload: any = {
          roomId: roomId.toString(),
          historyId: historyId.toString()
        };
        
        // Chỉ thêm invoiceId nếu có
        if (invoiceId) {
          payload.invoiceId = invoiceId.toString();
        }

        console.log('Delete history payload:', payload);

        this.roomService.deleteCheckoutHistory(payload).subscribe(
          (response) => {
            this.message.success('Xóa lịch sử thành công');
            // Reload history
            if (this.hotelId) {
              setTimeout(() => {
                this.loadHistory(this.currentFilterType);
                // Notify room component để reload rooms và cập nhật tổng tiền
                this.roomService.notifyRoomDataUpdated();
              }, 300);
            }
          },
          (error) => {
            console.error('Delete history error:', error);
            const errorMessage = error.error?.error || error.error?.message || error.message || 'Lỗi không xác định';
            this.message.error('Lỗi khi xóa lịch sử: ' + errorMessage);
          }
        );
      }
    });
  }

  viewInvoice(item: any): void {
    if (!item) {
      this.message.warning('Không thể hiển thị hóa đơn: Thiếu thông tin phòng');
      return;
    }
    
    // Đảm bảo item có hotelId - lấy từ item hoặc localStorage
    if (!item.hotelId) {
      item.hotelId = localStorage.getItem('selectedHotelId') || localStorage.getItem('hotelId') || '';
    }
    
    // Lấy thông tin để tìm invoice từ database
    const roomId = item.roomId || item._id;
    const checkOutTime = item.checkOutTime || item.checkoutTime || item.date;
    const invoiceId = item.invoiceId || item.invoice?._id;
    
    if (!roomId && !invoiceId) {
      this.message.warning('Không thể tìm hóa đơn: Thiếu thông tin phòng hoặc ID hóa đơn');
      return;
    }
    
    // Nếu có invoiceId, lấy trực tiếp từ database
    if (invoiceId) {
      this.loadInvoiceById(invoiceId);
      return;
    }
    
    // Nếu không có invoiceId, tìm invoice theo roomId và checkOutTime
    if (roomId && checkOutTime) {
      this.loadInvoiceByRoomAndDate(roomId, checkOutTime, item);
      return;
    }
    
    // Fallback: sử dụng dữ liệu từ item (nếu không tìm thấy trong database)
    this.message.warning('Không tìm thấy hóa đơn trong database. Hiển thị từ dữ liệu hiện tại.');
    this.showInvoiceModal(item);
  }

  // Sửa thông tin hóa đơn (chỉnh sửa trước khi xuất hóa đơn nháp)
  editInvoice(item: any): void {
    if (!item) {
      this.message.warning('Không thể chỉnh sửa hóa đơn: Thiếu thông tin phòng');
      return;
    }
    
    // Đảm bảo item có hotelId - lấy từ item hoặc localStorage
    if (!item.hotelId) {
      item.hotelId = localStorage.getItem('selectedHotelId') || localStorage.getItem('hotelId') || '';
    }
    
    // Lấy thông tin để tìm invoice từ database
    const roomId = item.roomId || item._id;
    const checkOutTime = item.checkOutTime || item.checkoutTime || item.date;
    const invoiceId = item.invoiceId || item.invoice?._id;
    
    if (!roomId && !invoiceId) {
      this.message.warning('Không thể tìm hóa đơn: Thiếu thông tin phòng hoặc ID hóa đơn');
      return;
    }
    
    // Nếu có invoiceId, lấy trực tiếp từ database
    if (invoiceId) {
      this.loadInvoiceForEdit(invoiceId);
      return;
    }
    
    // Nếu không có invoiceId, tìm invoice theo roomId và checkOutTime
    if (roomId && checkOutTime) {
      this.loadInvoiceByRoomAndDateForEdit(roomId, checkOutTime, item);
      return;
    }
    
    // Fallback: sử dụng dữ liệu từ item
    this.showInvoiceModalForEdit(item);
  }

  // Lấy hóa đơn theo ID để chỉnh sửa
  loadInvoiceForEdit(invoiceId: string): void {
    this.settingValue.loading = true;
    this.invoiceService.getInvoiceByIdNew(invoiceId).subscribe({
      next: (response: any) => {
        this.settingValue.loading = false;
        if (response && response.data) {
          const invoiceData = this.mapInvoiceToInvoiceData(response.data);
          // Đảm bảo hotelId có trong invoiceData
          if (!invoiceData.hotelId) {
            invoiceData.hotelId = this.hotelId || 
                                  localStorage.getItem('selectedHotelId') || 
                                  localStorage.getItem('hotelId') || '';
          }
          this.showInvoiceModalForEdit(invoiceData);
        } else {
          this.message.error('Không tìm thấy hóa đơn trong database');
        }
      },
      error: (error: any) => {
        this.settingValue.loading = false;
        console.error('Error loading invoice for edit:', error);
        this.message.error('Lỗi khi tải hóa đơn: ' + (error.error?.message || error.message));
      }
    });
  }

  // Lấy hóa đơn theo roomId và checkOutTime để chỉnh sửa
  loadInvoiceByRoomAndDateForEdit(roomId: string, checkOutTime: any, fallbackItem: any): void {
    this.settingValue.loading = true;
    
    // Đảm bảo fallbackItem có hotelId
    if (fallbackItem && !fallbackItem.hotelId) {
      fallbackItem.hotelId = this.hotelId || 
                             localStorage.getItem('selectedHotelId') || 
                             localStorage.getItem('hotelId') || '';
    }
    
    // Tìm invoice theo roomId và checkOutTime
    const checkOutDate = new Date(checkOutTime);
    const startDate = new Date(checkOutDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(checkOutDate);
    endDate.setHours(23, 59, 59, 999);
    
    const hotelId = fallbackItem?.hotelId || this.hotelId || 
                    localStorage.getItem('selectedHotelId') || 
                    localStorage.getItem('hotelId');
    
    const queryParams: any = {
      roomId: roomId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      limit: 10
    };
    
    if (hotelId) {
      queryParams.hotelId = hotelId;
    }
    
    this.invoiceService.getInvoices(queryParams).subscribe({
      next: (response: any) => {
        this.settingValue.loading = false;
        if (response && response.data && response.data.length > 0) {
          // Lấy invoice đầu tiên (hoặc tìm chính xác theo checkOutTime)
          const invoice = response.data[0];
          const invoiceData = this.mapInvoiceToInvoiceData(invoice);
          if (!invoiceData.hotelId) {
            invoiceData.hotelId = hotelId || '';
          }
          this.showInvoiceModalForEdit(invoiceData);
        } else {
          // Không tìm thấy trong database, sử dụng fallbackItem
          this.showInvoiceModalForEdit(fallbackItem);
        }
      },
      error: (error: any) => {
        this.settingValue.loading = false;
        console.error('Error loading invoice for edit:', error);
        // Fallback: sử dụng dữ liệu từ item
        this.showInvoiceModalForEdit(fallbackItem);
      }
    });
  }

  // Hiển thị modal chỉnh sửa hóa đơn
  showInvoiceModalForEdit(invoiceData: any): void {
    // Đảm bảo hotelId luôn có trong invoiceData
    if (!invoiceData.hotelId) {
      invoiceData.hotelId = localStorage.getItem('selectedHotelId') || localStorage.getItem('hotelId') || '';
    }
    
    const modal = this.modalService.create({
      nzTitle: 'Chỉnh sửa thông tin hóa đơn',
      nzContent: InvoiceComponent,
      nzWidth: '90%',
      nzStyle: { top: '20px' },
      nzFooter: null,
      nzMaskClosable: false,
      nzClassName: 'invoice-modal-edit',
      nzData: {
        invoiceData: invoiceData,
        businessInfo: invoiceData.businessInfo || null,
        isEditMode: true // Đánh dấu là chế độ chỉnh sửa
      }
    });
    
    // Lắng nghe khi modal đóng để reload dữ liệu nếu cần
    modal.afterClose.subscribe((result) => {
      if (result === 'updated') {
        // Reload dữ liệu nếu hóa đơn đã được cập nhật
        this.reloadData();
      }
    });
  }
  
  // Lấy hóa đơn theo ID
  loadInvoiceById(invoiceId: string): void {
    this.settingValue.loading = true;
    this.invoiceService.getInvoiceByIdNew(invoiceId).subscribe({
      next: (response: any) => {
        this.settingValue.loading = false;
        if (response && response.data) {
          const invoiceData = this.mapInvoiceToInvoiceData(response.data);
          // Đảm bảo hotelId có trong invoiceData (nếu không có từ database)
          if (!invoiceData.hotelId) {
            invoiceData.hotelId = this.hotelId || 
                                  localStorage.getItem('selectedHotelId') || 
                                  localStorage.getItem('hotelId') || '';
          }
          this.showInvoiceModal(invoiceData);
        } else {
          this.message.error('Không tìm thấy hóa đơn trong database');
        }
      },
      error: (error: any) => {
        this.settingValue.loading = false;
        console.error('Error loading invoice:', error);
        this.message.error('Lỗi khi tải hóa đơn: ' + (error.error?.message || error.message));
      }
    });
  }
  
  // Lấy hóa đơn theo roomId và checkOutTime
  loadInvoiceByRoomAndDate(roomId: string, checkOutTime: any, fallbackItem: any): void {
    this.settingValue.loading = true;
    
    // Đảm bảo fallbackItem có hotelId
    if (fallbackItem && !fallbackItem.hotelId) {
      fallbackItem.hotelId = this.hotelId || 
                             localStorage.getItem('selectedHotelId') || 
                             localStorage.getItem('hotelId') || '';
    }
    
    // Tìm invoice theo roomId và checkOutTime (trong khoảng thời gian gần)
    const checkOutDate = new Date(checkOutTime);
    const startDate = new Date(checkOutDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(checkOutDate);
    endDate.setHours(23, 59, 59, 999);
    
    // Lấy hotelId từ fallbackItem hoặc từ component
    const hotelId = fallbackItem?.hotelId || this.hotelId || 
                    localStorage.getItem('selectedHotelId') || 
                    localStorage.getItem('hotelId');
    
    const queryParams: any = {
      roomId: roomId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      limit: 10
    };
    
    // Thêm hotelId vào query nếu có
    if (hotelId) {
      queryParams.hotelId = hotelId;
    }
    
    this.invoiceService.getInvoices(queryParams).subscribe({
      next: (response: any) => {
        this.settingValue.loading = false;
        
        if (response && response.data && response.data.length > 0) {
          // Tìm invoice có checkOutTime gần nhất với checkOutTime của item
          let matchedInvoice = response.data.find((inv: any) => {
            const invCheckOut = new Date(inv.checkOutTime);
            const itemCheckOut = new Date(checkOutTime);
            // So sánh trong vòng 1 phút (để tránh lệch thời gian)
            return Math.abs(invCheckOut.getTime() - itemCheckOut.getTime()) < 60000;
          });
          
          // Nếu không tìm thấy chính xác, lấy invoice đầu tiên (mới nhất)
          if (!matchedInvoice && response.data.length > 0) {
            matchedInvoice = response.data[0];
          }
          
          if (matchedInvoice) {
            const invoiceData = this.mapInvoiceToInvoiceData(matchedInvoice);
            // Đảm bảo hotelId có trong invoiceData (nếu không có từ database)
            if (!invoiceData.hotelId) {
              invoiceData.hotelId = fallbackItem?.hotelId || 
                                    this.hotelId || 
                                    localStorage.getItem('selectedHotelId') || 
                                    localStorage.getItem('hotelId') || '';
            }
            this.showInvoiceModal(invoiceData);
          } else {
            // Fallback về dữ liệu từ item
            this.message.warning('Không tìm thấy hóa đơn chính xác. Hiển thị từ dữ liệu hiện tại.');
            this.showInvoiceModal(fallbackItem);
          }
        } else {
          // Fallback về dữ liệu từ item
          this.message.warning('Không tìm thấy hóa đơn trong database. Hiển thị từ dữ liệu hiện tại.');
          this.showInvoiceModal(fallbackItem);
        }
      },
      error: (error: any) => {
        this.settingValue.loading = false;
        console.error('Error loading invoice:', error);
        // Fallback về dữ liệu từ item
        this.message.warning('Lỗi khi tải hóa đơn. Hiển thị từ dữ liệu hiện tại.');
        this.showInvoiceModal(fallbackItem);
      }
    });
  }
  
  // Map invoice từ database sang format InvoiceData
  mapInvoiceToInvoiceData(invoice: any): any {
    // Format địa chỉ business
    const formatBusinessAddress = (address: any): string => {
      if (!address) return '';
      if (typeof address === 'string') return address;
      const parts = [];
      if (address.street) parts.push(address.street);
      if (address.city) parts.push(address.city);
      if (address.state) parts.push(address.state);
      if (address.postalCode) parts.push(address.postalCode);
      if (address.country) parts.push(address.country);
      return parts.join(', ') || '';
    };
    
    // Xử lý hotelId - có thể là object {_id: ...} hoặc string
    let hotelId = '';
    if (invoice.hotelId) {
      if (typeof invoice.hotelId === 'object' && invoice.hotelId._id) {
        hotelId = invoice.hotelId._id;
      } else if (typeof invoice.hotelId === 'string') {
        hotelId = invoice.hotelId;
      }
    }
    
    // Nếu không có hotelId từ invoice, thử lấy từ localStorage
    if (!hotelId) {
      hotelId = localStorage.getItem('selectedHotelId') || localStorage.getItem('hotelId') || '';
    }
    
    return {
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.issuedDate || invoice.createdAt,
      businessName: invoice.hotelInfo?.name || invoice.hotelId?.name || invoice.businessInfo?.name || invoice.businessInfo?.legalName || '',
      business_address: formatBusinessAddress(invoice.hotelInfo?.address) || formatBusinessAddress(invoice.hotelId?.address) || formatBusinessAddress(invoice.businessInfo?.address) || '',
      phoneNumber: invoice.hotelInfo?.contactInfo?.phone || invoice.hotelId?.contactInfo?.phone || invoice.businessInfo?.contactInfo?.phone || '',
      staffName: invoice.staffName || '',
      customerName: invoice.customerName || invoice.guestDetails?.name || '',
      customerPhone: invoice.customerPhone || invoice.guestDetails?.phone || '',
      customerEmail: invoice.customerEmail || invoice.guestDetails?.email || '',
      roomNumber: invoice.roomNumber || '',
      roomType: invoice.roomType || '',
      checkInTime: invoice.checkInTime,
      checkOutTime: invoice.checkOutTime,
      duration: invoice.duration || { hours: 0, days: 0 },
      products: invoice.products || [],
      // Xử lý services: đảm bảo mỗi service có trường 'name'
      services: (invoice.services || []).map((service: any) => ({
        name: service.serviceName || service.name || 'Dịch vụ',
        price: service.price || 0,
        quantity: service.quantity || 1,
        totalPrice: service.totalPrice || (service.price || 0) * (service.quantity || 1)
      })),
      roomAmount: invoice.roomAmount || 0,
      serviceAmount: invoice.serviceAmount || 0,
      // Map roomAmount và serviceAmount thành roomTotal và servicesTotal để hiển thị
      roomTotal: invoice.roomAmount || invoice.roomTotal || 0,
      servicesTotal: invoice.serviceAmount || invoice.serviceAmount || invoice.servicesTotal || 0,
      additionalCharges: invoice.additionalCharges || 0,
      discount: invoice.discount || 0,
      advancePayment: invoice.advancePayment || 0,
      // Tính totalAmount theo công thức: tiền phòng + tiền dịch vụ + phụ thu - khuyến mãi - đặt trước
      totalAmount: ((invoice.roomAmount || 0) + (invoice.serviceAmount || 0) + (invoice.additionalCharges || 0) - (invoice.discount || 0) - (invoice.advancePayment || 0)),
      paymentMethod: invoice.paymentMethod || 'cash',
      paymentStatus: invoice.paymentStatus || 'paid',
      notes: invoice.notes || '',
      guestDetails: invoice.guestDetails || invoice.guestInfo || {},
      guestInfo: invoice.guestInfo || invoice.guestDetails || {},
      guestSource: invoice.guestSource || invoice.guestInfo?.guestSource || invoice.guestDetails?.guestSource || 'walkin',
      hotelId: hotelId, // Đảm bảo hotelId luôn là string
      rateType: invoice.rateType || 'hourly',
      businessInfo: invoice.businessInfo || null // Truyền businessInfo đầy đủ để component có thể sử dụng
    };
  }
  
  // Helper function để normalize services (đảm bảo mỗi service có trường 'name')
  private normalizeServices(services: any[]): any[] {
    if (!services || !Array.isArray(services)) return [];
    return services.map((service: any) => ({
      name: service.serviceName || service.name || 'Dịch vụ',
      price: service.price || 0,
      quantity: service.quantity || 1,
      totalPrice: service.totalPrice || (service.price || 0) * (service.quantity || 1)
    }));
  }

  // Hiển thị modal hóa đơn
  showInvoiceModal(invoiceData: any): void {
    // Normalize services nếu có
    if (invoiceData.services) {
      invoiceData.services = this.normalizeServices(invoiceData.services);
    }
    
    // Đảm bảo có businessInfo trước khi hiển thị
    if (!invoiceData.businessInfo && invoiceData.hotelId) {
      // Load business info từ hotelId
      this.loadBusinessInfoForInvoice(invoiceData).then((updatedInvoiceData) => {
        // Normalize services lại sau khi load business info
        if (updatedInvoiceData.services) {
          updatedInvoiceData.services = this.normalizeServices(updatedInvoiceData.services);
        }
        this.createInvoiceModal(updatedInvoiceData);
      }).catch(() => {
        // Vẫn hiển thị modal ngay cả khi không load được business info
        this.createInvoiceModal(invoiceData);
      });
    } else {
      this.createInvoiceModal(invoiceData);
    }
  }
  
  // Load thông tin khách sạn cho invoice
  private async loadBusinessInfoForInvoice(invoiceData: any): Promise<any> {
    try {
      // Thử lấy hotelId từ nhiều nguồn
      let hotelId = invoiceData.hotelId || invoiceData['hotelId'];
      
      // Nếu không có, thử lấy từ localStorage
      if (!hotelId) {
        hotelId = localStorage.getItem('selectedHotelId') || localStorage.getItem('hotelId') || '';
        invoiceData.hotelId = hotelId; // Cập nhật lại vào invoiceData
      }
      
      if (!hotelId) {
        console.warn('Không có hotelId để load thông tin khách sạn');
        return invoiceData;
      }
      
      const hotel = await this.hotelService.getHotelInfo(hotelId).pipe(take(1)).toPromise();
      if (!hotel) {
        console.warn('Không tìm thấy thông tin khách sạn');
        return invoiceData;
      }
      
      // Format địa chỉ
      const formatAddress = (address: any): string => {
        if (!address) return '';
        if (typeof address === 'string') return address;
        const parts = [];
        if (address.street) parts.push(address.street);
        if (address.city) parts.push(address.city);
        if (address.state) parts.push(address.state);
        if (address.postalCode) parts.push(address.postalCode);
        if (address.country) parts.push(address.country);
        return parts.join(', ') || '';
      };
      
      // Cập nhật invoiceData với thông tin khách sạn
      invoiceData.hotelInfo = hotel;
      invoiceData.businessName = hotel.name || 'Khách sạn';
      invoiceData.business_address = formatAddress(hotel.address);
      invoiceData.phoneNumber = hotel.contactInfo?.phone || '';
      
      // Giữ lại businessInfo để tương thích (nếu có)
      if (hotel.businessId && typeof hotel.businessId === 'object') {
        invoiceData.businessInfo = hotel.businessId;
      }
      
      return invoiceData;
    } catch (error) {
      console.error('Error loading hotel info:', error);
      return invoiceData;
    }
  }
  
  // Tạo modal hóa đơn
  private createInvoiceModal(invoiceData: any): void {
    // Đảm bảo hotelId luôn có trong invoiceData
    if (!invoiceData.hotelId) {
      invoiceData.hotelId = localStorage.getItem('selectedHotelId') || localStorage.getItem('hotelId') || '';
    }
    
    this.modalService.create({
      nzTitle: 'Hóa Đơn Thanh Toán',
      nzContent: InvoiceComponent,
      nzData: {
        invoiceData: invoiceData,
        businessInfo: invoiceData.businessInfo || null
      },
      nzWidth: 800,
      nzFooter: null,
      nzMaskClosable: false,
      nzClassName: 'invoice-modal'
    });
  }

  currentPageDataChange(listOfCurrentPageData: readonly any[]): void {
    this.refreshStatus();
  }

  refreshStatus(): void {
    const validData = this.listOfData.filter(item => !item.disabled);
    this.allChecked = validData.length > 0 && validData.every(item => item.checked);
    this.indeterminate = validData.some(item => item.checked) && !this.allChecked;
  }

  checkAll(checked: boolean): void {
    this.listOfData.forEach(item => {
      if (!item.disabled) {
        item.checked = checked;
      }
    });
    this.refreshStatus();
  }
  
  calculateTotalPayment(): void {
    const search = (this.searchText || '').toString().trim().toLowerCase();
    const filtered = this.processedPaidData.filter((item: any) => {
      if (!search) {
        return true;
      }
      const roomNumber = (item?.roomNumber ?? '').toString().toLowerCase();
      const customerName = (item?.customerName ?? '').toString().toLowerCase();
      return roomNumber.includes(search) || customerName.includes(search);
    });

    const sum = filtered.reduce((acc: number, cur: any) => acc + this.getDisplayTotalAmount(cur), 0);
    this.totalPayment = Math.max(0, sum);
  }
  
  exportToExcel(): void {
    this.exported = true;

    try {
      // Chỉ xuất các bản ghi đã thanh toán
      const data = this.processedPaidData.map(item => {
        // Lấy thông tin khách hàng
        const customerName = item.customerName || item.guestInfo?.name || this.translate.instant('TABLE_EXPORT.WALK_IN_GUEST');
        const customerPhone = item.customerPhone || item.guestInfo?.phone || '';
        const customerIdNumber = item.customerIdNumber || item.guestInfo?.idNumber || '';
        
        // Lấy thời gian
        const checkInTime = item.checkInTime || item.checkinTime;
        const checkOutTime = item.checkOutTime || item.checkoutTime;
        
        // Tính thời gian lưu trú
        let duration = '';
        if (checkInTime && checkOutTime) {
          const diffMs = new Date(checkOutTime).getTime() - new Date(checkInTime).getTime();
          const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
          const days = Math.floor(diffHours / 24);
          const hours = diffHours % 24;
          duration = days > 0 ? `${days} ngày ${hours} giờ` : `${diffHours} giờ`;
        }
        
        // Lấy danh sách dịch vụ
        let servicesList = '';
        if (item.services && Array.isArray(item.services) && item.services.length > 0) {
          servicesList = item.services.map((s: any) => 
            `${s.serviceName || s.name} x${s.quantity || 1}`
          ).join(', ');
        }
        
        // Lấy hình thức thanh toán
        const paymentMethod = this.getPaymentMethodLabel(item.paymentMethod || 'cash');
        
        // Lấy nguồn khách
        const guestSource = this.getGuestSourceLabel(item.guestInfo?.guestSource || item.guestSource || 'walkin');
        
        return {
          [this.translate.instant('TABLE_EXPORT.ROOM')]: item.roomNumber || '',
          [this.translate.instant('TABLE_EXPORT.CUSTOMER')]: customerName,
          [this.translate.instant('TABLE_EXPORT.SOURCE')]: guestSource,
          [this.translate.instant('TABLE_EXPORT.PHONE')]: customerPhone,
          [this.translate.instant('TABLE_EXPORT.ID_NUMBER')]: customerIdNumber,
          [this.translate.instant('TABLE_EXPORT.CHECK_IN')]: checkInTime ? this.formatDateTime(checkInTime) : '',
          [this.translate.instant('TABLE_EXPORT.CHECK_OUT')]: checkOutTime ? this.formatDateTime(checkOutTime) : '',
          [this.translate.instant('TABLE_EXPORT.DURATION')]: duration,
          [this.translate.instant('TABLE_EXPORT.ROOM_TOTAL')]: item.roomTotal || 0,
          [this.translate.instant('TABLE_EXPORT.SERVICES')]: servicesList,
          [this.translate.instant('TABLE_EXPORT.SERVICES_TOTAL')]: item.servicesTotal || 0,
          [this.translate.instant('TABLE_EXPORT.ADDITIONAL_CHARGES')]: item.additionalCharges || 0,
          [this.translate.instant('TABLE_EXPORT.DISCOUNT')]: item.discount || 0,
          [this.translate.instant('TABLE_EXPORT.ADVANCE_PAYMENT')]: item.advancePayment || 0,
          [this.translate.instant('TABLE_EXPORT.TOTAL_AMOUNT')]: this.getDisplayTotalAmount(item),
          [this.translate.instant('TABLE_EXPORT.PAYMENT_METHOD')]: paymentMethod,
          [this.translate.instant('TABLE_EXPORT.STATUS')]: this.translate.instant('TABLE_EXPORT.PAID'),
          [this.translate.instant('TABLE_EXPORT.NOTES')]: item.notes || ''
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, this.translate.instant('TABLE_EXPORT.PAYMENT_HISTORY'));

      // Thiết lập độ rộng cột
      const columnWidths = [
        { wch: 8 },   // Phòng
        { wch: 20 },  // Khách hàng
        { wch: 12 },  // Nguồn
        { wch: 12 },  // SĐT
        { wch: 15 },  // CCCD
        { wch: 18 },  // Nhận phòng
        { wch: 18 },  // Trả phòng
        { wch: 15 },  // Thời gian lưu trú
        { wch: 12 },  // Tiền phòng
        { wch: 25 },  // Dịch vụ
        { wch: 12 },  // Tiền dịch vụ
        { wch: 10 },  // Phụ thu
        { wch: 10 },  // Khuyến mãi
        { wch: 10 },  // Đặt trước
        { wch: 12 },  // Tổng tiền
        { wch: 12 },  // Hình thức TT
        { wch: 12 },  // Trạng thái
        { wch: 25 }   // Ghi chú
      ];
      worksheet['!cols'] = columnWidths;

      // Tạo tên file với ngày
      const fileName = `lich_su_thanh_toan_${format(new Date(), 'dd-MM-yyyy_HH-mm')}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      
      this.message.success(this.translate.instant('TABLE_EXPORT.EXPORT_SUCCESS', { fileName }));
    } catch (error) {
      console.error('Lỗi xuất Excel:', error);
      this.message.error(this.translate.instant('TABLE_EXPORT.EXPORT_ERROR'));
    } finally {
      setTimeout(() => {
        this.exported = false;
      }, 1000);
    }
  }

  getPaymentMethodLabel(method: string): string {
    const m = (method || 'cash').toLowerCase();
    const found = this.paymentMethodOptions.find(option => option.value === m);
    if (found) {
      return found.label;
    }
    if (m === 'bank_transfer' || m === 'banking' || m === 'transfer') {
      return 'Chuyển khoản';
    }
    if (m === 'card' || m === 'credit_card' || m === 'virtual_card' || m === 'visa') {
      return 'Thẻ ngân hàng';
    }
    return 'Tiền mặt';
  }
 
  getPaymentMethodColor(method: string): string {
    const m = (method || 'cash').toLowerCase();
    const found = this.paymentMethodOptions.find(option => option.value === m);
    if (found) {
      return found.color;
    }
    if (m === 'bank_transfer' || m === 'banking' || m === 'transfer') {
      return 'purple';
    }
    if (m === 'card' || m === 'credit_card' || m === 'virtual_card' || m === 'visa') {
      return 'blue';
    }
    return 'green';
  }

  // Lấy label cho nguồn khách
  getGuestSourceLabel(guestSource: string | undefined): string {
    if (!guestSource) return 'Walk-in';
    
    const sourceMap: { [key: string]: string } = {
      'walkin': 'Walk-in',
      'booking': 'Booking',
      'agoda': 'Agoda',
      'traveloka': 'Traveloka',
      'expedia': 'Expedia',
      'trip': 'Trip.com',
      'g2j': 'G2J',
      'other': 'Khác'
    };
    
    return sourceMap[guestSource] || guestSource;
  }

  // Lấy màu cho nguồn khách
  getGuestSourceColor(guestSource: string | undefined): string {
    if (!guestSource) return 'default';
    
    const colorMap: { [key: string]: string } = {
      'walkin': 'blue',
      'booking': 'green',
      'agoda': 'orange',
      'traveloka': 'purple',
      'expedia': 'cyan',
      'trip': 'magenta',
      'g2j': 'gold',
      'other': 'default'
    };
    
    return colorMap[guestSource] || 'default';
  }

  formatDateTime(date: Date | string, onlyDate = false): string {
    if (!date) return '--';
    
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      
      if (onlyDate) {
        return format(dateObj, 'dd/MM/yyyy');
      }
      
      return format(dateObj, 'HH:mm - dd/MM/yyyy');
    } catch (error) {
      console.error('Lỗi khi định dạng ngày tháng:', error, date);
      return '--';
    }
  }
  
  calculateDuration(checkIn: string | Date, checkOut: string | Date): string {
    if (!checkIn || !checkOut) return '';
    
    const start = typeof checkIn === 'string' ? new Date(checkIn) : checkIn;
    const end = typeof checkOut === 'string' ? new Date(checkOut) : checkOut;
    
    const diffMs = end.getTime() - start.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHrs >= 24) {
      const days = Math.floor(diffHrs / 24);
      const hours = diffHrs % 24;
      return `${days} ngày ${hours > 0 ? `${hours} giờ` : ''}`;
    }
    
    return `${diffHrs} giờ ${diffMins > 0 ? `${diffMins} phút` : ''}`;
  }
  
  initShiftHandoverForm(): void {
    this.shiftHandoverForm = this.fb.group({
      fromStaffId: ['', Validators.required],
      toStaffId: ['', Validators.required],
      toUserPassword: ['', Validators.required],
      previousShiftAmount: [0],
      cashInShift: [0, [Validators.required, Validators.min(0)]],
      managerHandoverAmount: [0],
      cashAmount: [0],
      bankTransferAmount: [0],
      cardPaymentAmount: [0],
      expenseAmount: [this.totalExpense || 0], // Khởi tạo với totalExpense từ revenue-chart
      incomeAmount: [0],
      notes: [''],
      shiftId: [this.defaultShiftId]
    });

    const toNumber = (v: any): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const calculateShiftTotalRevenue = (values: any): number => {
      const cash = toNumber(values?.cashAmount);
      const bankTransfer = toNumber(values?.bankTransferAmount);
      const card = toNumber(values?.cardPaymentAmount);
      const income = toNumber(values?.incomeAmount);
      const expense = toNumber(values?.expenseAmount);
      return cash + bankTransfer + card + income - expense;
    };

    // Tính số tiền giao ca = Số tiền ca trước + Tiền mặt trong ca - Tiền giao quản lý
    this.shiftHandoverForm.valueChanges.subscribe(values => {
      const handoverAmount = (values.previousShiftAmount || 0) + (values.cashInShift || 0) - (values.managerHandoverAmount || 0);
      const totalRevenue = calculateShiftTotalRevenue(values);
      
      if (handoverAmount >= 0) {
        this.handoverMessage = `${this.translate.instant('TABLE.SHIFT_HANDOVER_MODAL.HANDOVER_AMOUNT_LABEL')} ${this.formatterVND(handoverAmount)} đ | ${this.translate.instant('TABLE.SHIFT_HANDOVER_MODAL.TOTAL_REVENUE_LABEL')} ${this.formatterVND(totalRevenue)} đ`;
        this.handoverMessageType = handoverAmount > 0 ? 'success' : 'info';
      } else {
        this.handoverMessage = `${this.translate.instant('TABLE.SHIFT_HANDOVER_MODAL.HANDOVER_AMOUNT_LABEL')} ${this.formatterVND(handoverAmount)} đ${this.translate.instant('TABLE.SHIFT_HANDOVER_MODAL.HANDOVER_AMOUNT_NEGATIVE')}`;
        this.handoverMessageType = 'warning';
      }
    });
  }

  getShiftTotalRevenue(): number {
    const toNumber = (v: any): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const values = this.shiftHandoverForm?.value;
    const cash = toNumber(values?.cashAmount);
    const bankTransfer = toNumber(values?.bankTransferAmount);
    const card = toNumber(values?.cardPaymentAmount);
    const income = toNumber(values?.incomeAmount);
    const expense = toNumber(values?.expenseAmount);
    return cash + bankTransfer + card + income - expense;
  }
  
  // Load danh sách nhân viên cho giao ca
  loadStaffList(): void {
    if (!this.hotelId) return;
    
    this.isLoadingStaff = true;
    this.staffService.getStaffByHotel(this.hotelId).subscribe(
      (staffs) => {
        this.staffList = staffs;
        this.isLoadingStaff = false;
        
        // Tìm staff ID của user hiện tại
        const currentUserId = this.authService.getUserId();
        
        // Thử lấy từ localStorage trước
        const savedStaffId = localStorage.getItem('staffId');
        if (savedStaffId && savedStaffId.trim()) {
          const savedStaff = staffs.find(s => s._id === savedStaffId);
          if (savedStaff) {
            this.currentStaffId = savedStaffId.trim();
            this.shiftHandoverForm.patchValue({ fromStaffId: this.currentStaffId });
            return;
          }
        }
        
        // Nếu không có trong localStorage, tìm theo userId
        const currentStaff = staffs.find(s => s.userId === currentUserId);
        if (currentStaff && currentStaff._id) {
          this.currentStaffId = currentStaff._id.trim();
          this.shiftHandoverForm.patchValue({ fromStaffId: this.currentStaffId });
          // Lưu vào localStorage để dùng sau
          localStorage.setItem('staffId', this.currentStaffId);
        } else {
          console.warn('Không tìm thấy staff ID cho user hiện tại');
          this.currentStaffId = '';
        }
      },
      (error) => {
        console.error('Error loading staff list:', error);
        this.isLoadingStaff = false;
        this.message.error('Không thể tải danh sách nhân viên');
      }
    );
  }
  
  // Load số tiền ca trước
  loadPreviousShiftAmount(callback?: () => void): void {
    if (!this.hotelId) return;
    
    this.shiftHandoverService.getPreviousShiftAmount(this.hotelId).subscribe(
      (response) => {
        this.previousShiftAmount = response.data.previousShiftAmount;
        this.shiftHandoverForm.patchValue({ previousShiftAmount: this.previousShiftAmount });
        const lastTime = response.data?.lastShiftHandover?.handoverTime ? new Date(response.data.lastShiftHandover.handoverTime) : null;
        this.currentShiftStartTime = lastTime && !isNaN(lastTime.getTime()) ? lastTime : null;
        if (callback) callback();
      },
      (error) => {
        console.error('Error loading previous shift amount:', error);
        if (callback) callback();
      }
    );
  }

  private getShiftStartDateIso(): string {
    if (this.currentShiftStartTime && !isNaN(this.currentShiftStartTime.getTime())) {
      return this.currentShiftStartTime.toISOString();
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.toISOString();
  }
  
  // Helper để lấy tên nhân viên
  getStaffName(staff: Staff): string {
    return getStaffFullName(staff);
  }
  
  // Lọc danh sách nhân viên nhận ca (không bao gồm nhân viên đang giao)
  getReceivingStaffList(): Staff[] {
    const fromStaffId = this.shiftHandoverForm.get('fromStaffId')?.value;
    return this.staffList.filter(s => s._id !== fromStaffId);
  }
  
  openShiftHandoverModal(): void {
    this.isShiftHandoverModalVisible = true;
    this.handoverMessage = '';
    
    // Load staff list và previous shift amount
    this.loadStaffList();
    this.loadPreviousShiftAmount(() => {
      this.loadLastManagerHandoverTime(() => {
        const paidItems = this.processedPaidData.filter(item => this.isPaidTransaction(item));
        
        let totalCash = paidItems
          .filter(item => item.paymentMethod === 'cash')
          .reduce((sum, item) => sum + this.getDisplayTotalAmount(item), 0);
        let totalBankTransfer = paidItems
          .filter(item => ['transfer', 'bank_transfer', 'banking'].includes(item.paymentMethod))
          .reduce((sum, item) => sum + this.getDisplayTotalAmount(item), 0);
        let totalCard = paidItems
          .filter(item => ['card', 'credit_card', 'visa'].includes(item.paymentMethod))
          .reduce((sum, item) => sum + this.getDisplayTotalAmount(item), 0);
        
        // Tính từ đặt trước (advancePayment) theo hình thức thanh toán
        this.listOfData.forEach(item => {
          const advancePayment = item?.advancePayment || 0;
          if (advancePayment > 0) {
            const eventType = (item.event || item.type || '').toLowerCase();
            if (eventType === 'check-in' || eventType === 'checkin') {
              const advancePaymentMethod = (item?.advancePaymentMethod || item.paymentMethod || 'cash') as string;
              if (advancePaymentMethod === 'cash') {
                totalCash += advancePayment;
              } else if (['transfer', 'bank_transfer', 'banking'].includes(advancePaymentMethod)) {
                totalBankTransfer += advancePayment;
              } else if (['card', 'credit_card', 'visa'].includes(advancePaymentMethod)) {
                totalCard += advancePayment;
              }
            }
          }
        });
        
        // Lấy phiếu chi/thu từ database và tính tiền mặt chi (trong ca)
        this.loadExpensesAndUpdateCash(totalCash, totalBankTransfer, totalCard);
      });
    });
  }
  
  // Load thời điểm giao tiền quản lý cuối cùng
  loadLastManagerHandoverTime(callback?: () => void): void {
    if (!this.hotelId) {
      this.lastManagerHandoverTime = null;
      if (callback) callback();
      return;
    }
    
    // Lấy shift handover gần nhất có managerHandoverAmount > 0
    this.shiftHandoverService.getShiftHandoverHistory({
      hotelId: this.hotelId,
      page: 1,
      limit: 10 // Lấy 10 records gần nhất
    }).subscribe({
      next: (response) => {
        const shiftHandovers = response.data || [];
        
        // Tìm record gần nhất có managerHandoverAmount > 0
        const lastManagerHandover = shiftHandovers.find(record => 
          record.managerHandoverAmount && record.managerHandoverAmount > 0
        );
        
        if (lastManagerHandover && lastManagerHandover.handoverTime) {
          this.lastManagerHandoverTime = new Date(lastManagerHandover.handoverTime);
        } else {
          this.lastManagerHandoverTime = null;
        }
        
        if (callback) callback();
      },
      error: (error) => {
        console.error('Error loading last manager handover time:', error);
        this.lastManagerHandoverTime = null;
        if (callback) callback();
      }
    });
  }
  
  // Load phiếu chi và phiếu thu từ database và cập nhật tiền mặt
  loadExpensesAndUpdateCash(totalCash: number, totalBankTransfer: number, totalCard: number): void {
    if (!this.hotelId) {
      // Nếu không có hotelId, chỉ cập nhật với dữ liệu hiện có
      this.shiftHandoverForm.patchValue({
        shiftId: this.defaultShiftId,
        cashAmount: totalCash,
        bankTransferAmount: totalBankTransfer,
        cardPaymentAmount: totalCard,
        cashInShift: totalCash
      });
      return;
    }
    
    const startDate = this.getShiftStartDateIso();
    const endDate = new Date().toISOString();
    
    // Lấy tất cả phiếu chi và phiếu thu trong ca
    forkJoin({
      expenses: this.transactionService.getExpenses({
        hotelId: this.hotelId,
        startDate: startDate,
        endDate: endDate,
        page: 1,
        limit: 1000
      }),
      incomes: this.transactionService.getIncomes({
        hotelId: this.hotelId,
        startDate: startDate,
        endDate: endDate,
        page: 1,
        limit: 1000
      })
    }).subscribe({
      next: ({ expenses: expenseResponse, incomes: incomeResponse }) => {
        const expenses = expenseResponse.data || [];
        const incomes = incomeResponse.data || [];
        
        // Lọc chỉ lấy phiếu chi và phiếu thu SAU thời điểm giao tiền quản lý cuối cùng (nếu có)
        const filteredExpenses = this.lastManagerHandoverTime 
          ? expenses.filter(expense => {
              const expenseTime = expense.createdAt ? new Date(expense.createdAt) : (expense.updatedAt ? new Date(expense.updatedAt) : new Date());
              return expenseTime > this.lastManagerHandoverTime!;
            })
          : expenses;
        
        const filteredIncomes = this.lastManagerHandoverTime 
          ? incomes.filter((income: any) => {
              const incomeTime = income.createdAt ? new Date(income.createdAt) : (income.updatedAt ? new Date(income.updatedAt) : new Date());
              return incomeTime > this.lastManagerHandoverTime!;
            })
          : incomes;
        
        // Tính tổng tiền chi theo từng phương thức thanh toán
        let cashExpense = 0; // Tiền mặt chi
        let bankTransferExpense = 0; // Chuyển khoản chi
        let cardExpense = 0; // Thẻ tín dụng chi
        let totalExpenseAmount = 0; // Tổng chi (tất cả phương thức)
        
        filteredExpenses.forEach(expense => {
          if (expense.status === 'completed' && expense.amount > 0) {
            totalExpenseAmount += expense.amount;
            
            // Phân loại theo phương thức thanh toán
            const method = expense.method?.toLowerCase() || '';
            if (method === 'cash') {
              cashExpense += expense.amount;
            } else if (method === 'bank_transfer' || method === 'transfer') {
              bankTransferExpense += expense.amount;
            } else if (method === 'card' || method === 'credit_card') {
              cardExpense += expense.amount;
            }
          }
        });
        
        // Tính tổng tiền thu theo từng phương thức thanh toán
        let cashIncome = 0; // Tiền mặt thu
        let bankTransferIncome = 0; // Chuyển khoản thu
        let cardIncome = 0; // Thẻ tín dụng thu
        let totalIncomeAmount = 0; // Tổng thu (tất cả phương thức)
        
        filteredIncomes.forEach((income: any) => {
          if (income.status === 'completed' && income.amount > 0) {
            totalIncomeAmount += income.amount;
            
            // Phân loại theo phương thức thanh toán
            const method = income.method?.toLowerCase() || '';
            if (method === 'cash') {
              cashIncome += income.amount;
            } else if (method === 'bank_transfer' || method === 'transfer') {
              bankTransferIncome += income.amount;
            } else if (method === 'card' || method === 'credit_card') {
              cardIncome += income.amount;
            }
          }
        });
        
        // Lưu tiền mặt chi và thu để sử dụng trong getActualCashInShift
        this.cashExpenseAmount = cashExpense;
        this.cashIncomeAmount = cashIncome;
        
        // Tiền mặt trong ca = Tiền mặt thu được - Tiền mặt chi + Tiền mặt thu từ phiếu thu
        const actualCashInShift = Math.max(0, totalCash - cashExpense + cashIncome);
        
        // Cập nhật form với dữ liệu đã tính toán
        this.shiftHandoverForm.patchValue({
          shiftId: this.defaultShiftId,
          cashAmount: totalCash, // Tiền mặt thu được trong ca (từ thanh toán/đặt cọc)
          bankTransferAmount: totalBankTransfer,
          cardPaymentAmount: totalCard,
          cashInShift: actualCashInShift, // Tiền mặt trong ca = tiền mặt thu - tiền mặt chi + tiền mặt thu từ phiếu thu
          expenseAmount: totalExpenseAmount, // Tổng chi (tất cả phương thức)
          incomeAmount: totalIncomeAmount // Tổng thu (tất cả phương thức)
        });
      },
      error: (error) => {
        console.error('Error loading expenses/incomes:', error);
        // Nếu lỗi, vẫn cập nhật với dữ liệu hiện có
        this.shiftHandoverForm.patchValue({
          shiftId: this.defaultShiftId,
          cashAmount: totalCash,
          bankTransferAmount: totalBankTransfer,
          cardPaymentAmount: totalCard,
          cashInShift: totalCash,
          expenseAmount: this.totalExpense || 0,
          incomeAmount: 0
        });
      }
    });
  }
  
  closeShiftHandoverModal(): void {
    this.isShiftHandoverModalVisible = false;
    this.shiftHandoverForm.reset();
    this.handoverMessage = '';
  }
  
  submitShiftHandover(): void {
    if (this.shiftHandoverForm.invalid) {
      Object.values(this.shiftHandoverForm.controls).forEach(control => {
        control.markAsDirty();
        control.updateValueAndValidity();
      });
      this.message.warning('Vui lòng điền đầy đủ thông tin bắt buộc');
      return;
    }

    this.isSubmitting = true;

    const formData = this.shiftHandoverForm.value;
    
    // Tính số tiền giao ca
    const handoverAmount = (formData.previousShiftAmount || 0) + (formData.cashInShift || 0) - (formData.managerHandoverAmount || 0);
    
    const totalRevenue = this.getShiftTotalRevenue();
    
    const roomHistory = this.processedPaidData
      .filter(item => this.isPaidTransaction(item))
      .map(item => {
      // Lấy guestSource từ nhiều nguồn theo thứ tự ưu tiên
      let guestSource = 'walkin';
      if (item.guestSource) {
        guestSource = item.guestSource;
      } else if (item.guestInfo?.guestSource) {
        guestSource = item.guestInfo.guestSource;
      } else if (item.event?.guestInfo?.guestSource) {
        guestSource = item.event.guestInfo.guestSource;
      } else if (item.bookingId && typeof item.bookingId === 'object') {
        guestSource = item.bookingId.guestSource || 
                     item.bookingId.guestInfo?.guestSource || 
                     item.bookingId.guestDetails?.guestSource || 
                     'walkin';
      }
      
      return {
        roomId: item.roomId || item._id,
        roomNumber: item.roomNumber,
        bookingId: item.bookingId,
        action: 'check_out',
        guestName: item.guestInfo?.name || item.customerName || 'Khách lẻ',
        guestSource: guestSource, // Lấy từ nhiều nguồn
        amount: this.getDisplayTotalAmount(item),
        paymentMethod: item.paymentMethod || 'cash',
        timestamp: item.checkOutTime || item.checkoutTime || new Date(),
        notes: item.notes || '',
        // Các trường bổ sung
        roomTotal: item.roomTotal || 0,
        additionalCharges: item.additionalCharges || 0,
        discount: item.discount || 0,
        serviceAmount: item.servicesTotal || item.serviceDetails?.amount || 0,
        advancePayment: item.advancePayment || 0,
        advancePaymentMethod: (item.advancePaymentMethod || item.paymentMethod || 'cash') as string,
        checkinTime: item.checkInTime || item.checkinTime || null
      };
    });
    
    const depositHistory = this.listOfData
      .filter(item => {
        const adv = item?.advancePayment || 0;
        if (!(adv > 0)) return false;
        const eventType = (item.event || item.type || '').toLowerCase();
        if (!(eventType === 'check-in' || eventType === 'checkin')) return false;
        if (this.lastManagerHandoverTime) {
          const ct = item.checkInTime || item.checkinTime;
          if (!ct) return true;
          return new Date(ct) > this.lastManagerHandoverTime!;
        }
        return true;
      })
      .map(item => {
        const guestSource = item.guestInfo?.guestSource || item.event?.guestInfo?.guestSource || 'walkin';
        const methodRaw = (item?.advancePaymentMethod || item.paymentMethod || 'cash') as string;
        const m = String(methodRaw || '').toLowerCase().trim();
        const method = m === 'bank_transfer' || m === 'transfer' || m === 'banking' ? 'bank_transfer' : (m === 'card' || m === 'credit_card' || m === 'visa' ? 'card' : 'cash');
        return {
          roomId: item.roomId || item._id,
          roomNumber: item.roomNumber,
          bookingId: item.bookingId,
          action: 'check_in',
          guestName: item.guestInfo?.name || item.customerName || 'Khách lẻ',
          guestSource: guestSource,
          amount: item.advancePayment || 0,
          paymentMethod: method,
          timestamp: item.checkInTime || item.checkinTime || new Date(),
          notes: 'Đặt cọc',
          roomTotal: item.roomTotal || 0,
          additionalCharges: item.additionalCharges || 0,
          discount: item.discount || 0,
          serviceAmount: item.servicesTotal || item.serviceDetails?.amount || 0,
          advancePayment: item.advancePayment || 0,
          advancePaymentMethod: method,
          checkinTime: item.checkInTime || item.checkinTime || null
        };
      });
    
    const invoices = this.processedPaidData
      .filter(item => this.isPaidTransaction(item))
      .map(item => ({
      invoiceNumber: item.invoiceNumber,
      bookingId: item.bookingId,
      roomId: item.roomId,
      roomNumber: item.roomNumber,
      guestName: item.guestInfo?.name || item.customerName || 'Khách lẻ',
      amount: this.getDisplayTotalAmount(item),
      paymentMethod: item.paymentMethod || 'cash',
      type: 'room',
      timestamp: item.checkOutTime || item.checkoutTime || new Date()
    }));
    
    this.loadExpensesForShiftHandover([...roomHistory, ...depositHistory], invoices, formData, handoverAmount, totalRevenue);
  }
  
  // Load expenses và incomes từ database và gửi dữ liệu giao ca
  loadExpensesForShiftHandover(roomHistory: any[], invoices: any[], formData: any, handoverAmount: number, totalRevenue: number): void {
    if (!this.hotelId) {
      // Nếu không có hotelId, gửi với expenses và incomes rỗng
      this.sendShiftHandoverDataWithExpenses([], [], roomHistory, invoices, formData, handoverAmount, totalRevenue);
      return;
    }
    
    const startDate = this.getShiftStartDateIso();
    const endDate = new Date().toISOString();
    
    // Lấy tất cả phiếu chi và phiếu thu trong ca
    forkJoin({
      expenses: this.transactionService.getExpenses({
        hotelId: this.hotelId,
        startDate: startDate,
        endDate: endDate,
        page: 1,
        limit: 1000
      }),
      incomes: this.transactionService.getIncomes({
        hotelId: this.hotelId,
        startDate: startDate,
        endDate: endDate,
        page: 1,
        limit: 1000
      })
    }).subscribe({
      next: ({ expenses: expenseResponse, incomes: incomeResponse }) => {
        const expenses = expenseResponse.data || [];
        const incomes = incomeResponse.data || [];
        
        // Chuyển đổi expenses thành format cho shift handover
        const expensesForHandover = expenses
          .filter(expense => expense.status === 'completed' && expense.amount > 0)
          .map(expense => ({
            expenseId: expense._id,
            description: expense.description || expense.notes || 'Phiếu chi',
            amount: expense.amount,
            category: expense.expenseCategory || 'other',
            recipient: (expense as any).details?.recipient || expense.recipient || '',
            method: expense.method || 'cash', // Thêm method để biết phương thức thanh toán
            approvedBy: (expense as any).approvedBy || null,
            timestamp: expense.createdAt || (expense as any).processedAt || new Date()
          }));
        
        // Chuyển đổi incomes thành format cho shift handover
        const incomesForHandover = incomes
          .filter((income: any) => income.status === 'completed' && income.amount > 0)
          .map((income: any) => ({
            incomeId: income._id,
            description: income.description || income.notes || 'Phiếu thu',
            amount: income.amount,
            category: income.incomeCategory || 'other',
            source: income.details?.payer || income.payer || '',
            method: income.method || 'cash',
            approvedBy: income.approvedBy || null,
            timestamp: income.createdAt || income.processedAt || new Date()
          }));
        
        // Gửi dữ liệu giao ca với expenses và incomes
        this.sendShiftHandoverDataWithExpenses(expensesForHandover, incomesForHandover, roomHistory, invoices, formData, handoverAmount, totalRevenue);
      },
      error: (error) => {
        console.error('Error loading expenses/incomes for shift handover:', error);
        // Nếu lỗi, vẫn gửi với expenses và incomes rỗng
        this.sendShiftHandoverDataWithExpenses([], [], roomHistory, invoices, formData, handoverAmount, totalRevenue);
      }
    });
  }
  
  // Gửi dữ liệu giao ca với expenses và incomes
  sendShiftHandoverDataWithExpenses(expenses: any[], incomes: any[], roomHistory: any[], invoices: any[], formData: any, handoverAmount: number, totalRevenue: number): void {
    // Tính expenseAmount từ expenses
    const calculatedExpenseAmount = expenses
      .filter(expense => expense.amount > 0)
      .reduce((sum, expense) => sum + (expense.amount || 0), 0);
    
    // Tính incomeAmount từ incomes
    const calculatedIncomeAmount = incomes
      .filter(income => income.amount > 0)
      .reduce((sum, income) => sum + (income.amount || 0), 0);
    
    const handoverData = {
      hotelId: this.hotelId,
      fromStaffId: formData.fromStaffId,
      toStaffId: formData.toStaffId,
      toUserPassword: formData.toUserPassword,
      previousShiftAmount: formData.previousShiftAmount || 0,
      cashInShift: formData.cashInShift || 0,
      managerHandoverAmount: formData.managerHandoverAmount || 0,
      cashAmount: formData.cashAmount || 0,
      bankTransferAmount: formData.bankTransferAmount || 0,
      cardPaymentAmount: formData.cardPaymentAmount || 0,
      expenseAmount: calculatedExpenseAmount || formData.expenseAmount || 0,
      incomeAmount: calculatedIncomeAmount || formData.incomeAmount || 0,
      roomHistory: roomHistory,
      invoices: invoices,
      expenses: expenses, // Gửi expenses từ database
      incomes: incomes, // Gửi incomes từ database
      serviceOrders: [],
      notes: formData.notes || '',
      pendingIssues: [],
      shiftStartTime: new Date()
    };

    console.log('Đang gửi dữ liệu giao ca với expenses và incomes:', handoverData);

    this.sendShiftHandoverData(handoverData);
  }
  
  sendShiftHandoverData(data: any): void {
    if (this.hotelId) {
      data.hotelId = this.hotelId;
    }
    
    const apiUrl = `${environment.apiUrl}/shift-handover`;
    this.http.post(apiUrl, data).pipe(
      catchError((error: HttpErrorResponse) => {
        let errorMessage = 'Có lỗi xảy ra khi gửi dữ liệu giao ca';
        
        if (error.error?.message) {
          errorMessage = error.error.message;
        } else if (error.error instanceof ErrorEvent) {
          errorMessage = `Lỗi: ${error.error.message}`;
        } else {
          errorMessage = `Mã lỗi: ${error.status}, Thông báo: ${error.message}`;
        }
        
        this.handoverMessage = errorMessage;
        this.handoverMessageType = 'error';
        this.message.error(errorMessage);
        console.error('Lỗi khi gửi dữ liệu giao ca:', error);
        
        return throwError(errorMessage);
      }),
      finalize(() => {
        this.isSubmitting = false;
      })
    ).subscribe(
      (response: any) => {
        this.handoverMessage = response.message || 'Giao ca thành công!';
        this.handoverMessageType = 'success';
        this.message.success('Giao ca thành công');
        
        console.log('Đã gửi dữ liệu giao ca:', response);
        
        // Nếu có thông tin login mới, cập nhật localStorage và services
        if (response.login?.token) {
          
          if (response.login.user) {
            localStorage.setItem('user', JSON.stringify(response.login.user));
            // Cập nhật AuthService
            const current = this.authService.getCurrentUser();
            const ur = response.login.user;
            const normalizedUser: User = {
              _id: ur._id,
              username: ur.username,
              email: ur.email,
              fullName: ur.fullName,
              role: (ur.role as User['role']),
              status: current?.status ?? 'active',
              createdAt: current?.createdAt ?? new Date(),
              updatedAt: current?.updatedAt ?? new Date(),
              businessId: current?.businessId,
              hotelId: ur.hotelId ?? current?.hotelId
            };
            this.authService.loginFromShiftHandover(response.login.token, normalizedUser);
            this.userService.setCurrentUser(response.login.user);
          }
          
          if (response.login.staff) {
            localStorage.setItem('staff', JSON.stringify(response.login.staff));
            localStorage.setItem('staffId', response.login.staff._id);
            this.currentStaffId = response.login.staff._id;
          }
          
          const displayName = response.login.user?.fullName || response.login.user?.username || 'nhân viên mới';
          this.message.success(`Đã đăng nhập với tài khoản: ${displayName}. Hệ thống sẽ tải lại để áp dụng...`);
          
          // [CẬP NHẬT QUAN TRỌNG]: Ép tải lại toàn bộ trang web để xóa sạch bộ nhớ của ca trước
          setTimeout(() => {
            this.closeShiftHandoverModal();
            window.location.reload(); 
          }, 1500);

          return; // Dừng hàm tại đây, không chạy các lệnh xóa list bên dưới nữa vì trang sẽ reload
        }
        
        // Xóa lịch sử thanh toán hiện tại sau khi giao ca thành công
        // Lấy danh sách roomId và bookingId từ roomHistory để xóa chính xác
        if (data.roomHistory && data.roomHistory.length > 0) {
          const roomHistoryRoomIds = data.roomHistory.map((rh: any) => rh.roomId?.toString()).filter((id: any) => id);
          const roomHistoryBookingIds = data.roomHistory.map((rh: any) => rh.bookingId?.toString()).filter((id: any) => id);
          const roomHistoryInvoiceNumbers = data.roomHistory.map((rh: any) => rh.invoiceNumber).filter((num: any) => num);
          const roomHistoryTimestamps = data.roomHistory.map((rh: any) => {
            const ts = rh.timestamp;
            return ts ? new Date(ts).getTime() : null;
          }).filter((ts: any): ts is number => ts !== null);
          
          const originalLength = this.listOfData.length;
          
          // Xóa các item trong listOfData đã được giao ca
          this.listOfData = this.listOfData.filter(item => {
            const itemRoomId = item.roomId?.toString() || item._id?.toString();
            const itemBookingId = item.bookingId?.toString();
            const itemInvoiceNumber = item.invoiceNumber;
            const itemCheckOutTime = item.checkOutTime || item.checkoutTime;
            const itemTimestamp = itemCheckOutTime ? new Date(itemCheckOutTime).getTime() : null;
            
            // Kiểm tra xem item có trong roomHistory không
            // 1. Kiểm tra bằng bookingId
            if (itemBookingId && roomHistoryBookingIds.includes(itemBookingId)) {
              return false; // Xóa
            }
            
            // 2. Kiểm tra bằng invoiceNumber
            if (itemInvoiceNumber && roomHistoryInvoiceNumbers.includes(itemInvoiceNumber)) {
              return false; // Xóa
            }
            
            // 3. Kiểm tra bằng roomId và timestamp (nếu không có bookingId/invoiceNumber)
            if (itemRoomId && roomHistoryRoomIds.includes(itemRoomId) && itemTimestamp) {
              const isInRoomHistory = roomHistoryTimestamps.some((rhTimestamp: number) => {
                // Cho phép sai số 5 phút để đảm bảo khớp
                return Math.abs(itemTimestamp - rhTimestamp) < 300000;
              });
              if (isInRoomHistory) {
                return false; // Xóa
              }
            }
            
            // Giữ lại item
            return true;
          });
          
          const deletedCount = originalLength - this.listOfData.length;
          if (deletedCount > 0) {
            console.log(`Đã xóa ${deletedCount} bản ghi đã thanh toán sau khi giao ca`);
          }
        } else {
          // Nếu không có roomHistory, xóa tất cả
          this.listOfData = [];
        }
        
        this.totalPayment = 0;
        
        // [CẬP NHẬT 1]: Ép bảng phải tính toán và vẽ lại ngay lập tức dữ liệu mới
        this.processTableData(); 
        this.calculateTotalPayment();
        
        // [CẬP NHẬT 2]: Gọi hàm tải lại dữ liệu chuẩn thay vì dùng hàm loadDataAfterHandover bị sai API
        this.reloadData();
        
        // [CẬP NHẬT 3]: Báo hiệu cho các component khác (như sơ đồ phòng) tự động cập nhật
        this.roomService.notifyRoomDataUpdated();
        
        setTimeout(() => {
          this.closeShiftHandoverModal();
        }, 2000);
      }
    );
  }
  
  loadDataAfterHandover(): void {
    if (this.hotelId) {
      const apiUrl = `${environment.apiUrl}/rooms?hotelId=${this.hotelId}`;
      this.http.get(apiUrl).pipe(
        catchError((error: HttpErrorResponse) => {
          console.error('Lỗi khi tải lại dữ liệu sau giao ca:', error);
          this.message.warning('Không thể tải lại dữ liệu mới sau khi giao ca');
          return throwError('Lỗi khi tải lại dữ liệu');
        })
      ).subscribe(
        (data: any) => {
          if (Array.isArray(data)) {
            this.listOfData = data;
            this.calculateTotalPayment();
          } else if (data && Array.isArray(data.items)) {
            this.listOfData = data.items;
            this.calculateTotalPayment();
          }
          console.log('Đã tải lại dữ liệu sau khi giao ca:', this.listOfData.length, 'bản ghi');
        }
      );
    }
  }
  
  formatterVND = (value: number): string => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  parserVND = (value: string): string => value.replace(/\$\s?|(,*)/g, '');
  
  formatUSD(amount: number | undefined): string {
    if (!this.usdRate) return '';
    const value = Number(amount || 0) * this.usdRate;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(this.currencyService.roundAmount(value, 'USD'));
  }

  // ============ GIAO TIỀN QUẢN LÝ ============
  
  initManagerHandoverForm(): void {
    this.managerHandoverForm = this.fb.group({
      managerUsername: ['', [Validators.required, Validators.minLength(3)]],
      managerPassword: ['', Validators.required],
      managerHandoverAmount: [0, [Validators.required, Validators.min(0)]],
      notes: ['']
    });
  }
  
  openManagerHandoverModal(): void {
    this.isManagerHandoverModalVisible = true;
    this.managerPasswordVisible = false;
    
    // Đảm bảo staffList đã được load trước
    if (!this.staffList || this.staffList.length === 0) {
      this.loadStaffList();
    }
    
    // Đảm bảo currentStaffId đã được set và hợp lệ
    if (!this.currentStaffId || !this.currentStaffId.trim()) {
      // Thử lấy từ localStorage
      const savedStaffId = localStorage.getItem('staffId');
      if (savedStaffId && savedStaffId.trim()) {
        // Validate xem staffId có trong danh sách staff không (nếu staffList đã có)
        if (this.staffList && this.staffList.length > 0) {
          const staffExists = this.staffList.find(s => s._id === savedStaffId.trim());
          if (staffExists) {
            this.currentStaffId = savedStaffId.trim();
          } else {
            // Nếu không tồn tại, tìm lại từ userId
            const currentUserId = this.authService.getUserId();
            const currentStaff = this.staffList.find(s => s.userId === currentUserId);
            if (currentStaff && currentStaff._id) {
              this.currentStaffId = currentStaff._id.trim();
              localStorage.setItem('staffId', this.currentStaffId);
            }
          }
        }
      }
    } else {
      // Validate currentStaffId có trong danh sách staff không (nếu staffList đã có)
      if (this.staffList && this.staffList.length > 0) {
        const staffExists = this.staffList.find(s => s._id === this.currentStaffId.trim());
        if (!staffExists) {
          console.warn('currentStaffId không tồn tại trong danh sách, tìm lại từ userId');
          const currentUserId = this.authService.getUserId();
          const currentStaff = this.staffList.find(s => s.userId === currentUserId);
          if (currentStaff && currentStaff._id) {
            this.currentStaffId = currentStaff._id.trim();
            localStorage.setItem('staffId', this.currentStaffId);
          }
        }
      }
    }
    
    // Load expenses để đảm bảo cashExpenseAmount được cập nhật
    // (để getActualCashInShift tính đúng)
    if (this.hotelId) {
      this.loadExpensesForManagerHandover();
    }
    
    // Reset form với giá trị mặc định
    this.managerHandoverForm.patchValue({
      managerUsername: '',
      managerPassword: '',
      managerHandoverAmount: 0,
      notes: ''
    });
  }
  
  // Load expenses và incomes cho modal giao tiền quản lý
  loadExpensesForManagerHandover(): void {
    if (!this.hotelId) return;
    
    // Load thời điểm giao tiền quản lý cuối cùng trước, sau đó mới load expenses và incomes
    this.loadLastManagerHandoverTime(() => {
      const startDate = this.getShiftStartDateIso();
      const endDate = new Date().toISOString();
      
      // Lấy tất cả phiếu chi và phiếu thu trong ca
      if (!this.hotelId) {
        console.warn('Không có hotelId để load expenses/incomes');
        return;
      }
      
      forkJoin({
        expenses: this.transactionService.getExpenses({
          hotelId: this.hotelId,
          startDate: startDate,
          endDate: endDate,
          page: 1,
          limit: 1000
        }),
        incomes: this.transactionService.getIncomes({
          hotelId: this.hotelId,
          startDate: startDate,
          endDate: endDate,
          page: 1,
          limit: 1000
        })
      }).subscribe({
        next: ({ expenses: expenseResponse, incomes: incomeResponse }) => {
          const expenses = expenseResponse.data || [];
          const incomes = incomeResponse.data || [];
          
          // Lọc chỉ lấy phiếu chi và phiếu thu SAU thời điểm giao tiền quản lý cuối cùng (nếu có)
          const filteredExpenses = this.lastManagerHandoverTime 
            ? expenses.filter(expense => {
                const expenseTime = expense.createdAt ? new Date(expense.createdAt) : (expense.updatedAt ? new Date(expense.updatedAt) : new Date());
                return expenseTime > this.lastManagerHandoverTime!;
              })
            : expenses;
          
          const filteredIncomes = this.lastManagerHandoverTime 
            ? incomes.filter((income: any) => {
                const incomeTime = income.createdAt ? new Date(income.createdAt) : (income.updatedAt ? new Date(income.updatedAt) : new Date());
                return incomeTime > this.lastManagerHandoverTime!;
              })
            : incomes;
          
          // Tính tổng tiền mặt chi (chỉ từ expenses sau giao tiền quản lý)
          let cashExpense = 0;
          let totalExpenseAmount = 0;
          
          filteredExpenses.forEach(expense => {
            if (expense.status === 'completed' && expense.amount > 0) {
              totalExpenseAmount += expense.amount;
              const method = expense.method?.toLowerCase() || '';
              if (method === 'cash') {
                cashExpense += expense.amount;
              }
            }
          });
          
          // Tính tổng tiền mặt thu (chỉ từ incomes sau giao tiền quản lý)
          let cashIncome = 0;
          let totalIncomeAmount = 0;
          
          filteredIncomes.forEach((income: any) => {
            if (income.status === 'completed' && income.amount > 0) {
              totalIncomeAmount += income.amount;
              const method = income.method?.toLowerCase() || '';
              if (method === 'cash') {
                cashIncome += income.amount;
              }
            }
          });
          
          // Cập nhật cashExpenseAmount và cashIncomeAmount để getActualCashInShift tính đúng
          this.cashExpenseAmount = cashExpense;
          this.cashIncomeAmount = cashIncome;
          
          // Cập nhật expenseAmount và incomeAmount trong shiftHandoverForm (chỉ tính expenses và incomes sau giao tiền quản lý)
          this.shiftHandoverForm.patchValue({
            expenseAmount: totalExpenseAmount,
            incomeAmount: totalIncomeAmount
          });
        },
        error: (error) => {
          console.error('Error loading expenses/incomes for manager handover:', error);
          // Nếu lỗi, giữ nguyên giá trị hiện tại
        }
      });
    });
  }
  
  loadManagerList(): void {
    if (!this.hotelId) return;
    
    // Lọc ra những nhân viên có chức vụ quản lý
    this.managerList = this.staffList.filter(staff => {
      const position = staff.employmentInfo?.position?.toLowerCase() || '';
      return position.includes('manager') || 
             position.includes('quản lý') || 
             position.includes('giám đốc') ||
             position.includes('chủ') ||
             position === 'hotel';
    });
    
    // Nếu không có ai có chức vụ quản lý, lấy tất cả staff (để user có thể chọn)
    if (this.managerList.length === 0) {
      this.managerList = [...this.staffList];
    }
  }
  
  getManagerName(managerId: string | undefined): string {
    if (!managerId) return '';
    const manager = this.staffList.find(s => s._id === managerId);
    if (!manager) return '';
    return getStaffFullName(manager);
  }
  
  closeManagerHandoverModal(): void {
    this.isManagerHandoverModalVisible = false;
    this.managerHandoverForm.reset();
    this.managerPasswordVisible = false;
  }
  
  // Biến để lưu tiền mặt chi riêng
  private cashExpenseAmount: number = 0;
  private cashIncomeAmount: number = 0;
  
  // Tính tiền mặt thực tế trong ca (từ thanh toán, trừ tiền mặt chi và cộng tiền mặt thu từ phiếu thu)
  getActualCashInShift(): number {
    const cashReceived = this.processedPaidData
      .filter((item: any) => this.isPaidTransaction(item) && item.paymentMethod === 'cash')
      .reduce((sum: number, item: any) => sum + this.getDisplayTotalAmount(item), 0);
    
    return Math.max(0, cashReceived - this.cashExpenseAmount + this.cashIncomeAmount);
  }
  
  // Tính tiền mặt sau khi giao quản lý
  getCashAfterManagerHandover(): number {
    const managerAmount = this.managerHandoverForm?.get('managerHandoverAmount')?.value || 0;
    return this.getActualCashInShift() + this.previousShiftAmount - managerAmount;
  }

  getManagerHandoverCashAvailable(): number {
    return Math.max(0, this.previousShiftAmount + this.getActualCashInShift());
  }

  getShiftHandoverPreviewAmount(): number {
    const previousShiftAmount = this.shiftHandoverForm?.get('previousShiftAmount')?.value || 0;
    const cashInShift = this.shiftHandoverForm?.get('cashInShift')?.value || 0;
    const managerHandoverAmount = this.shiftHandoverForm?.get('managerHandoverAmount')?.value || 0;
    return Math.max(0, previousShiftAmount + cashInShift - managerHandoverAmount);
  }
  
  submitManagerHandover(): void {
    if (this.managerHandoverForm.invalid) {
      Object.values(this.managerHandoverForm.controls).forEach(control => {
        control.markAsDirty();
        control.updateValueAndValidity();
      });
      this.message.warning('Vui lòng điền đầy đủ thông tin');
      return;
    }
    
    const formData = this.managerHandoverForm.value;
    
    // Kiểm tra các trường bắt buộc
    if (!formData.managerUsername || !formData.managerUsername.trim()) {
      this.message.error('Vui lòng nhập tài khoản quản lý (username hoặc email)');
      return;
    }
    
    if (!formData.managerPassword || !formData.managerPassword.trim()) {
      this.message.error('Vui lòng nhập mật khẩu quản lý');
      return;
    }
    
    // Đảm bảo staffList đã được load và có dữ liệu
    if (!this.staffList || this.staffList.length === 0) {
      this.message.warning('Đang tải danh sách nhân viên...');
      this.loadStaffList();
      // Đợi một chút để staffList được load
      setTimeout(() => {
        this.submitManagerHandover();
      }, 500);
      return;
    }
    
    // Đảm bảo fromStaffId hợp lệ trước khi submit
    let fromStaffId = this.currentStaffId?.trim();
    if (!fromStaffId) {
      fromStaffId = localStorage.getItem('staffId')?.trim() || '';
    }
    if (!fromStaffId) {
      fromStaffId = this.shiftHandoverForm?.get('fromStaffId')?.value?.trim() || '';
    }
    
    // Validate fromStaffId
    if (fromStaffId) {
      const staffExists = this.staffList.find(s => s._id === fromStaffId);
      if (!staffExists) {
        // Tìm lại từ userId
        const currentUserId = this.authService.getUserId();
        const currentStaff = this.staffList.find(s => s.userId === currentUserId);
        if (currentStaff && currentStaff._id) {
          fromStaffId = currentStaff._id.trim();
          this.currentStaffId = fromStaffId;
          localStorage.setItem('staffId', fromStaffId);
          this.shiftHandoverForm.patchValue({ fromStaffId: fromStaffId });
          console.log('Đã cập nhật fromStaffId:', fromStaffId);
        } else {
          this.message.error('Không tìm thấy thông tin nhân viên. Vui lòng chọn nhân viên trong form giao ca trước.');
          return;
        }
      }
    } else {
      this.message.error('Không tìm thấy thông tin nhân viên. Vui lòng chọn nhân viên trong form giao ca trước.');
      return;
    }
    
    if (!this.hotelId) {
      this.message.error('Không tìm thấy thông tin khách sạn');
      return;
    }
    
    this.isSubmittingManagerHandover = true;
    
    const managerAmount = formData.managerHandoverAmount || 0;
    
    // Lấy tiền mặt thực tế trong ca (đã trừ đi tiền mặt chi từ phiếu chi)
    // actualCash = tiền mặt thu được - tiền mặt chi (từ phiếu chi)
    const actualCash = this.getActualCashInShift();
    
    // Tính tiền mặt sau khi giao quản lý
    // cashAfterHandover = (tiền mặt thu - tiền mặt chi) + tiền ca trước - tiền giao quản lý
    const cashAfterHandover = actualCash + this.previousShiftAmount - managerAmount;
    
    // Lấy tổng chi từ form (đã được load từ database)
    const totalExpenseAmount = this.shiftHandoverForm?.get('expenseAmount')?.value || 0;
    
    // Lấy lịch sử phòng hiện tại trước khi xóa
    const roomHistory = this.processedPaidData.map(item => {
      // Lấy guestSource từ nhiều nguồn theo thứ tự ưu tiên
      let guestSource = 'walkin';
      
      // Debug: Log để kiểm tra dữ liệu
      console.log('Processing item for manager handover:', {
        roomNumber: item.roomNumber,
        guestSource: item.guestSource,
        guestInfo: item.guestInfo,
        event: item.event,
        bookingId: item.bookingId
      });
      
      // Ưu tiên 1: Từ item.guestSource (trực tiếp)
      if (item.guestSource) {
        guestSource = item.guestSource;
      }
      // Ưu tiên 2: Từ item.guestInfo?.guestSource
      else if (item.guestInfo?.guestSource) {
        guestSource = item.guestInfo.guestSource;
      }
      // Ưu tiên 3: Từ item.event?.guestInfo?.guestSource (nếu có event)
      else if (item.event?.guestInfo?.guestSource) {
        guestSource = item.event.guestInfo.guestSource;
      }
      // Ưu tiên 4: Từ item.bookingId (nếu là object)
      else if (item.bookingId && typeof item.bookingId === 'object') {
        guestSource = item.bookingId.guestSource || 
                     item.bookingId.guestInfo?.guestSource || 
                     item.bookingId.guestDetails?.guestSource || 
                     'walkin';
      }
      // Ưu tiên 5: Từ item.bookingId (nếu là string, cần populate)
      else if (item.bookingId && typeof item.bookingId === 'string') {
        // Không thể populate ở đây, giữ nguyên 'walkin'
        guestSource = 'walkin';
      }
      
      console.log('Final guestSource for room:', item.roomNumber, '=', guestSource);
      
      return {
        roomId: item.roomId || item._id,
        roomNumber: item.roomNumber,
        bookingId: item.bookingId,
        action: 'check_out',
        guestName: item.guestInfo?.name || item.customerName || 'Khách lẻ',
        guestSource: guestSource, // Lấy từ nhiều nguồn
        amount: this.getDisplayTotalAmount(item),
        paymentMethod: item.paymentMethod || 'cash',
        timestamp: item.checkOutTime || item.checkoutTime || new Date(),
        notes: item.notes || '',
        invoiceNumber: item.invoiceNumber || null,
        // Các trường bổ sung
        roomTotal: item.roomTotal || 0,
        additionalCharges: item.additionalCharges || 0,
        discount: item.discount || 0,
        serviceAmount: item.servicesTotal || item.serviceDetails?.amount || 0,
        advancePayment: item.advancePayment || 0,
        checkinTime: item.checkInTime || item.checkinTime || null,
        // Thêm guestInfo đầy đủ để backend có thể lấy từ nhiều nguồn
        guestInfo: item.guestInfo || null,
        // Thêm event nếu có
        event: item.event || null
      };
    });
    
    // Log roomHistory để debug
    console.log('RoomHistory for manager handover:', roomHistory.map(r => ({
      roomNumber: r.roomNumber,
      guestName: r.guestName,
      guestSource: r.guestSource
    })));
    
    const paidItems = this.processedPaidData.filter(item => this.isPaidTransaction(item));
    
    const totalBankTransfer = paidItems.reduce((sum, item) => {
      if (item.paymentMethod === 'bank_transfer' || item.paymentMethod === 'transfer' || item.paymentMethod === 'banking') {
        return sum + this.getDisplayTotalAmount(item);
      }
      return sum;
    }, 0);
    
    const totalCardPayment = paidItems.reduce((sum, item) => {
      if (item.paymentMethod === 'card' || item.paymentMethod === 'credit_card' || item.paymentMethod === 'visa') {
        return sum + this.getDisplayTotalAmount(item);
      }
      return sum;
    }, 0);
    
    // Load expenses từ database và submit
    this.loadExpensesForManagerHandoverAndSubmit(formData, managerAmount, actualCash, cashAfterHandover, roomHistory, totalBankTransfer, totalCardPayment, totalExpenseAmount);
  }
  
  // Load expenses và incomes, sau đó submit giao tiền quản lý
  loadExpensesForManagerHandoverAndSubmit(
    formData: any, 
    managerAmount: number, 
    actualCash: number, 
    cashAfterHandover: number, 
    roomHistory: any[], 
    totalBankTransfer: number, 
    totalCardPayment: number, 
    totalExpenseAmount: number
  ): void {
    if (!this.hotelId) {
      // Nếu không có hotelId, gửi với expenses và incomes rỗng
      this.submitManagerHandoverWithExpenses([], [], formData, managerAmount, actualCash, cashAfterHandover, roomHistory, totalBankTransfer, totalCardPayment, totalExpenseAmount, 0);
      return;
    }
    
    const startDate = this.getShiftStartDateIso();
    const endDate = new Date().toISOString();
    
    // Lấy tất cả phiếu chi và phiếu thu trong ca
    forkJoin({
      expenses: this.transactionService.getExpenses({
        hotelId: this.hotelId,
        startDate: startDate,
        endDate: endDate,
        page: 1,
        limit: 1000
      }),
      incomes: this.transactionService.getIncomes({
        hotelId: this.hotelId,
        startDate: startDate,
        endDate: endDate,
        page: 1,
        limit: 1000
      })
    }).subscribe({
      next: ({ expenses: expenseResponse, incomes: incomeResponse }) => {
        const expenses = expenseResponse.data || [];
        const incomes = incomeResponse.data || [];
        
        // Lọc chỉ lấy phiếu chi và phiếu thu SAU thời điểm giao tiền quản lý cuối cùng (nếu có)
        const filteredExpenses = this.lastManagerHandoverTime 
          ? expenses.filter(expense => {
              const expenseTime = expense.createdAt ? new Date(expense.createdAt) : (expense.updatedAt ? new Date(expense.updatedAt) : new Date());
              return expenseTime > this.lastManagerHandoverTime!;
            })
          : expenses;
        
        const filteredIncomes = this.lastManagerHandoverTime 
          ? incomes.filter(income => {
              const incomeTime = income.createdAt ? new Date(income.createdAt) : (income.updatedAt ? new Date(income.updatedAt) : new Date());
              return incomeTime > this.lastManagerHandoverTime!;
            })
          : incomes;
        
        // Chuyển đổi expenses thành format cho shift handover
        const expensesForHandover = filteredExpenses
          .filter(expense => expense.status === 'completed' && expense.amount > 0)
          .map(expense => ({
            expenseId: expense._id,
            description: expense.description || expense.notes || 'Phiếu chi',
            amount: expense.amount,
            category: expense.expenseCategory || 'other',
            recipient: (expense as any).details?.recipient || expense.recipient || '',
            method: expense.method || 'cash', // Thêm method để biết phương thức thanh toán
            approvedBy: (expense as any).approvedBy || null,
            timestamp: expense.createdAt || (expense as any).processedAt || new Date()
          }));
        
        // Chuyển đổi incomes thành format cho shift handover
        const incomesForHandover = filteredIncomes
          .filter((income: any) => income.status === 'completed' && income.amount > 0)
          .map((income: any) => ({
            incomeId: income._id,
            description: income.description || income.notes || 'Phiếu thu',
            amount: income.amount,
            category: income.incomeCategory || 'other',
            source: income.details?.payer || income.payer || '',
            method: income.method || 'cash',
            approvedBy: income.approvedBy || null,
            timestamp: income.createdAt || income.processedAt || new Date()
          }));
        
        // Tính lại totalExpenseAmount từ filteredExpenses
        const recalculatedTotalExpenseAmount = filteredExpenses
          .filter(expense => expense.status === 'completed' && expense.amount > 0)
          .reduce((sum, expense) => sum + (expense.amount || 0), 0);
        
        // Tính lại totalIncomeAmount từ filteredIncomes
        const recalculatedTotalIncomeAmount = filteredIncomes
          .filter(income => income.status === 'completed' && income.amount > 0)
          .reduce((sum, income) => sum + (income.amount || 0), 0);
        
        // Gửi dữ liệu với expenses và incomes
        this.submitManagerHandoverWithExpenses(expensesForHandover, incomesForHandover, formData, managerAmount, actualCash, cashAfterHandover, roomHistory, totalBankTransfer, totalCardPayment, recalculatedTotalExpenseAmount, recalculatedTotalIncomeAmount);
      },
      error: (error) => {
        console.error('Error loading expenses/incomes for manager handover:', error);
        // Nếu lỗi, vẫn gửi với expenses và incomes rỗng
        this.submitManagerHandoverWithExpenses([], [], formData, managerAmount, actualCash, cashAfterHandover, roomHistory, totalBankTransfer, totalCardPayment, totalExpenseAmount, 0);
      }
    });
  }
  
  // Submit giao tiền quản lý với expenses và incomes
  submitManagerHandoverWithExpenses(
    expenses: any[],
    incomes: any[],
    formData: any, 
    managerAmount: number, 
    actualCash: number, 
    cashAfterHandover: number, 
    roomHistory: any[], 
    totalBankTransfer: number, 
    totalCardPayment: number, 
    totalExpenseAmount: number,
    totalIncomeAmount: number
  ): void {
    // Kiểm tra và lấy fromStaffId
    let fromStaffId = this.currentStaffId?.trim();
    
    // Nếu không có currentStaffId, thử lấy từ localStorage hoặc shiftHandoverForm
    if (!fromStaffId) {
      fromStaffId = localStorage.getItem('staffId')?.trim() || '';
    }
    
    if (!fromStaffId) {
      fromStaffId = this.shiftHandoverForm?.get('fromStaffId')?.value?.trim() || '';
    }
    
    // Validate fromStaffId - kiểm tra xem có trong danh sách staff hiện tại không
    if (!fromStaffId || fromStaffId.trim() === '') {
      this.message.error('Không tìm thấy thông tin nhân viên. Vui lòng chọn nhân viên trong form giao ca trước.');
      this.isSubmittingManagerHandover = false;
      return;
    }
    
    // Đảm bảo staffList đã được load
    if (!this.staffList || this.staffList.length === 0) {
      this.message.warning('Đang tải danh sách nhân viên...');
      this.loadStaffList();
      this.isSubmittingManagerHandover = false;
      // Retry sau khi load xong
      setTimeout(() => {
        this.submitManagerHandoverWithExpenses(expenses, incomes, formData, managerAmount, actualCash, cashAfterHandover, roomHistory, totalBankTransfer, totalCardPayment, totalExpenseAmount, totalIncomeAmount);
      }, 1000);
      return;
    }
    
    // Validate fromStaffId có trong danh sách staff không
    const staffExists = this.staffList.find(s => s._id === fromStaffId);
    if (!staffExists) {
      console.warn('fromStaffId không tồn tại trong danh sách staff, tìm lại từ userId');
      // Tìm lại từ userId
      const currentUserId = this.authService.getUserId();
      const currentStaff = this.staffList.find(s => s.userId === currentUserId);
      if (currentStaff && currentStaff._id) {
        fromStaffId = currentStaff._id.trim();
        this.currentStaffId = fromStaffId;
        localStorage.setItem('staffId', fromStaffId);
        this.shiftHandoverForm.patchValue({ fromStaffId: fromStaffId });
        console.log('Đã cập nhật fromStaffId:', fromStaffId);
      } else {
        this.message.error('Không tìm thấy thông tin nhân viên. Vui lòng chọn nhân viên trong form giao ca trước.');
        this.isSubmittingManagerHandover = false;
        return;
      }
    }
    
    // Gửi lên server để xác thực mật khẩu và lưu lịch sử
    const managerHandoverData = {
      hotelId: this.hotelId,
      fromStaffId: fromStaffId,
      managerUsername: formData.managerUsername.trim(), // Username hoặc email của quản lý
      managerPassword: formData.managerPassword.trim(),
      amount: managerAmount,
      cashBeforeHandover: actualCash + this.previousShiftAmount,
      cashAfterHandover: cashAfterHandover,
      notes: formData.notes || '',
      timestamp: new Date(),
      // Thêm thông tin để tạo shift handover record
      roomHistory: roomHistory,
      previousShiftAmount: this.previousShiftAmount || 0,
      cashInShift: actualCash, // Tiền mặt trong ca (đã trừ tiền mặt chi từ phiếu chi)
      cashAmount: cashAfterHandover, // Tiền mặt sau khi giao quản lý
      bankTransferAmount: totalBankTransfer,
      cardPaymentAmount: totalCardPayment,
      expenseAmount: totalExpenseAmount, // Tổng chi từ database (tất cả phương thức)
      incomeAmount: totalIncomeAmount || this.shiftHandoverForm?.get('incomeAmount')?.value || 0, // Tổng thu từ database
      expenses: expenses, // Gửi expenses từ database
      incomes: incomes // Gửi incomes từ database
    };
    
    console.log('Giao tiền quản lý với expenses và incomes:', {
      ...managerHandoverData,
      expensesCount: expenses?.length || 0,
      incomesCount: incomes?.length || 0
    });
    
    // Validate fromStaffId trước khi gửi
    if (!fromStaffId || fromStaffId.trim() === '') {
      this.message.error('Không tìm thấy thông tin nhân viên. Vui lòng đăng nhập lại.');
      this.isSubmittingManagerHandover = false;
      return;
    }
    
    // Gọi API để xác thực và lưu
    this.http.post(`${environment.apiUrl}/shift-handover/manager`, managerHandoverData).pipe(
      catchError((error: HttpErrorResponse) => {
        let errorMessage = 'Có lỗi xảy ra khi giao tiền quản lý';
        
        if (error.error?.message) {
          errorMessage = error.error.message;
          // Hiển thị thêm chi tiết nếu có
          if (error.error.details) {
            console.error('Chi tiết lỗi:', error.error.details);
          }
        } else if (error.status === 401) {
          errorMessage = 'Mật khẩu quản lý không đúng';
        } else if (error.status === 404) {
          errorMessage = error.error?.message || 'Không tìm thấy thông tin. Vui lòng kiểm tra lại.';
        } else if (error.status === 400) {
          errorMessage = error.error?.message || 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.';
        }
        
        this.message.error(errorMessage);
        console.error('Lỗi giao tiền quản lý:', {
          status: error.status,
          message: error.error?.message,
          details: error.error?.details,
          fullError: error
        });
        return throwError(errorMessage);
      }),
      finalize(() => {
        this.isSubmittingManagerHandover = false;
      })
    ).subscribe(
      (response: any) => {
        // Cập nhật shiftHandoverForm với giá trị mới
        // Đảm bảo cập nhật đúng thứ tự để trigger valueChanges
        this.shiftHandoverForm.patchValue({
          managerHandoverAmount: managerAmount
        }, { emitEvent: true }); // emitEvent: true để trigger valueChanges subscription
        
        // Đảm bảo các control được mark as dirty để trigger validation và update
        this.shiftHandoverForm.get('managerHandoverAmount')?.markAsDirty();
        this.shiftHandoverForm.get('cashAmount')?.markAsDirty();
        this.shiftHandoverForm.get('cashInShift')?.markAsDirty();
        
        // Trigger lại valueChanges để cập nhật alert ngay lập tức
        const currentValues = this.shiftHandoverForm.value;
        const handoverAmount = (currentValues.previousShiftAmount || 0) + (currentValues.cashInShift || 0) - (currentValues.managerHandoverAmount || 0);
        const totalRevenue = this.getShiftTotalRevenue();
        
        if (handoverAmount >= 0) {
          this.handoverMessage = `Số tiền giao ca: ${this.formatterVND(handoverAmount)} đ | Tổng doanh thu: ${this.formatterVND(totalRevenue)} đ`;
          this.handoverMessageType = handoverAmount > 0 ? 'success' : 'info';
        } else {
          this.handoverMessage = `Số tiền giao ca: ${this.formatterVND(handoverAmount)} đ (âm)`;
          this.handoverMessageType = 'warning';
        }
        
        const managerName = response.managerInfo?.name || formData.managerUsername || 'quản lý';
        this.message.success(`Đã giao ${this.formatterVND(managerAmount)} đ cho ${managerName}. Tiền mặt còn lại: ${this.formatterVND(cashAfterHandover)} đ`);
        
        // Cập nhật thời điểm giao tiền quản lý cuối cùng
        this.lastManagerHandoverTime = new Date();
        
        // Xóa hết lịch sử phòng sau khi đã lưu vào shift handover
        // Lấy danh sách các identifier từ roomHistory để xóa chính xác
        const roomHistoryRoomIds = roomHistory.map(rh => rh.roomId?.toString()).filter(id => id);
        const roomHistoryBookingIds = roomHistory.map(rh => rh.bookingId?.toString()).filter(id => id);
        const roomHistoryInvoiceNumbers = roomHistory.map(rh => rh.invoiceNumber).filter(num => num);
        const roomHistoryTimestamps = roomHistory.map(rh => {
          const ts = rh.timestamp;
          return ts ? new Date(ts).getTime() : null;
        }).filter((ts): ts is number => ts !== null);
        
        // Xóa tất cả các item đã được lưu trong shift handover
        const originalLength = this.listOfData.length;
        this.listOfData = this.listOfData.filter(item => {
          // Kiểm tra xem item có trong roomHistory không
          const itemRoomId = (item.roomId || item._id)?.toString();
          const itemBookingId = item.bookingId?.toString();
          const itemInvoiceNumber = item.invoiceNumber;
          const itemCheckOutTime = item.checkOutTime || item.checkoutTime || item.date;
          const itemTimestamp = itemCheckOutTime ? new Date(itemCheckOutTime).getTime() : null;
          
          // Xóa nếu có roomId trùng
          if (itemRoomId && roomHistoryRoomIds.includes(itemRoomId)) {
            // Kiểm tra thêm bằng timestamp để chắc chắn
            if (itemTimestamp !== null && roomHistoryTimestamps.length > 0) {
              const isTimestampMatch = roomHistoryTimestamps.some(rhTs => {
                // Cho phép sai số 5 phút
                return Math.abs(itemTimestamp - rhTs) < 300000;
              });
              if (isTimestampMatch) {
                return false; // Xóa
              }
            } else {
              return false; // Xóa
            }
          }
          
          // Xóa nếu có bookingId trùng
          if (itemBookingId && roomHistoryBookingIds.includes(itemBookingId)) {
            return false; // Xóa
          }
          
          // Xóa nếu có invoiceNumber trùng
          if (itemInvoiceNumber && roomHistoryInvoiceNumbers.includes(itemInvoiceNumber)) {
            return false; // Xóa
          }
          
          // Xóa nếu timestamp trùng (cho các trường hợp không có bookingId/invoiceNumber)
          if (itemTimestamp !== null && roomHistoryTimestamps.length > 0) {
            const isTimestampMatch = roomHistoryTimestamps.some(rhTs => {
              // Cho phép sai số 5 phút
              return Math.abs(itemTimestamp - rhTs) < 300000;
            });
            if (isTimestampMatch) {
              return false; // Xóa
            }
          }
          
          // Giữ lại item nếu không trùng
          return true;
        });
        
        const deletedCount = originalLength - this.listOfData.length;
        if (deletedCount > 0) {
          console.log(`Đã xóa ${deletedCount} record lịch sử phòng khỏi frontend`);
        }
        
        // Cập nhật previousShiftAmount = handoverAmount (số tiền còn lại sau khi giao quản lý)
        // Điều này đảm bảo ca sau sẽ có previousShiftAmount đúng (đã trừ đi managerHandoverAmount)
        this.previousShiftAmount = handoverAmount;
        this.shiftHandoverForm.patchValue({
          previousShiftAmount: handoverAmount
        });
        
        // Reload lại previousShiftAmount từ backend để đảm bảo đồng bộ
        this.loadPreviousShiftAmount();
        
        // Reload lại expenses để cập nhật expenseAmount trong form giao ca
        const totalCash = this.processedPaidData
          .filter(item => item.paymentMethod === 'cash')
          .reduce((sum, item) => sum + this.getDisplayTotalAmount(item), 0);
        const totalBankTransfer = this.processedPaidData
          .filter(item => ['transfer', 'bank_transfer', 'banking'].includes(item.paymentMethod))
          .reduce((sum, item) => sum + this.getDisplayTotalAmount(item), 0);
        const totalCard = this.processedPaidData
          .filter(item => ['card', 'credit_card', 'visa'].includes(item.paymentMethod))
          .reduce((sum, item) => sum + this.getDisplayTotalAmount(item), 0);
        this.loadExpensesAndUpdateCash(totalCash, totalBankTransfer, totalCard);
        
        // Đóng modal
        this.closeManagerHandoverModal();
        
        // [CẬP NHẬT]: Ép bảng vẽ lại và đồng bộ với Server
        this.processTableData();
        this.calculateTotalPayment();
        this.reloadData();
        this.roomService.notifyRoomDataUpdated();
        
        // Log để debug
        console.log('Đã cập nhật form giao ca sau khi giao tiền quản lý:', {
          managerHandoverAmount: managerAmount,
          cashAmount: cashAfterHandover,
          cashInShift: actualCash,
          previousShiftAmount: handoverAmount,
          handoverAmount: handoverAmount,
          totalRevenue: totalRevenue
        });
      }
    );
  }

  getTotalAmount(): number {
    const baseTotal = this.processedPaidData.reduce((total: number, item: any) => {
      const amount = this.getDisplayTotalAmount(item);
      return total + (typeof amount === 'number' ? amount : 0);
    }, 0);
    const incomeAmount = this.shiftHandoverForm?.get('incomeAmount')?.value || 0;
    const expenseAmount = this.shiftHandoverForm?.get('expenseAmount')?.value || 0;
    return Math.max(0, baseTotal + incomeAmount - expenseAmount);
  }
  
  // Mở modal lịch sử giao ca
  openShiftHandoverHistory(): void {
    this.isShiftHandoverHistoryVisible = true;
  }
  
  closeShiftHandoverHistory(): void {
    this.isShiftHandoverHistoryVisible = false;
  }

  onFilterChange(filterType: string): void {
    this.currentFilterType = filterType;
    // Reset về trang 1 khi thay đổi filter
    this.currentPage = 1;
    this.loadHistory(filterType, 1);
  }

  onPaymentStatusFilterChange(status: 'all' | 'paid' | 'pending' | 'unpaid'): void {
    this.paymentStatusFilter = status;
    // Reset về trang 1 khi thay đổi filter
    this.currentPage = 1;
    // Tính lại totalItems và totalPages dựa trên paidData (đã filter payment status)
    setTimeout(() => {
    this.processTableData();
    this.calculateTotalPayment();
  }, 0);
  }

  // Getter để đếm số lượng đã thanh toán
  get paidCount(): number {
    if (!this.listOfData) return 0;
    return this.listOfData.filter(item => {
      // Chỉ đếm các event checkout
      const eventType = (item.event || item.type || '').toLowerCase();
      if (eventType !== 'check-out' && eventType !== 'checkout') return false;
      if (!item.checkOutTime && !item.checkoutTime) return false;
      
      // Lấy paymentStatus từ nhiều nguồn
      const paymentStatus = item.paymentStatus || item.payment?.status || item.payment?.paymentStatus || item.status || 'unpaid';
      // Chuẩn hóa: 'completed' từ SePay = 'paid'
      const normalizedStatus = (paymentStatus === 'completed') ? 'paid' : paymentStatus;
      return normalizedStatus === 'paid';
    }).length;
  }

  // Getter để đếm số lượng chờ thanh toán (pending)
  get pendingCount(): number {
    if (!this.listOfData) return 0;
    return this.listOfData.filter(item => {
      // Chỉ đếm các event checkout
      const eventType = (item.event || item.type || '').toLowerCase();
      if (eventType !== 'check-out' && eventType !== 'checkout') return false;
      if (!item.checkOutTime && !item.checkoutTime) return false;
      
      // Lấy paymentStatus từ nhiều nguồn
      const paymentStatus = item.paymentStatus || item.payment?.status || item.payment?.paymentStatus || item.status || 'unpaid';
      // Chuẩn hóa: 'completed' từ SePay = 'paid', không phải 'pending'
      const normalizedStatus = (paymentStatus === 'completed') ? 'paid' : paymentStatus;
      return normalizedStatus === 'pending';
    }).length;
  }

  // Getter để đếm số lượng chưa thanh toán (unpaid)
  get unpaidCount(): number {
    if (!this.listOfData) return 0;
    return this.listOfData.filter(item => {
      // Chỉ đếm các event checkout
      const eventType = (item.event || item.type || '').toLowerCase();
      if (eventType !== 'check-out' && eventType !== 'checkout') return false;
      if (!item.checkOutTime && !item.checkoutTime) return false;
      
      // Lấy paymentStatus từ nhiều nguồn
      const paymentStatus = item.paymentStatus || item.payment?.status || item.payment?.paymentStatus || item.status || 'unpaid';
      // Chuẩn hóa: 'completed' từ SePay = 'paid'
      const normalizedStatus = (paymentStatus === 'completed') ? 'paid' : paymentStatus;
      // Chưa thanh toán = không phải 'paid'/'completed' và không phải 'pending'
      return normalizedStatus !== 'paid' && normalizedStatus !== 'pending';
    }).length;
  }
  
  loadHistory(filterType: string = 'all', page: number = 1, forceReload: boolean = false): void {
    if (!this.hotelId) return;
    
    // Đảm bảo hotelId là string, không phải object
    const hotelIdStr = typeof this.hotelId === 'object' ? (this.hotelId as any)?._id || String(this.hotelId) : this.hotelId;
    
    if (!hotelIdStr || hotelIdStr === '[object Object]') {
      console.error('Invalid hotelId:', this.hotelId);
      return;
    }
    
    // Chỉ load dữ liệu nếu chưa có hoặc filterType thay đổi hoặc force reload
    // Nếu chỉ đổi trang, không cần load lại
    const shouldLoadData = forceReload || !this.listOfData || this.listOfData.length === 0 || 
                           this.lastFilterType !== filterType;
    
    if (shouldLoadData) {
      this.settingValue.loading = true;
      // Load tất cả dữ liệu để filter đúng ở frontend, sau đó paginate
      // Sử dụng limit lớn để lấy tất cả dữ liệu
      this.roomService.getRoomHistory(hotelIdStr, filterType, 1, 1000)
        .subscribe({
          next: (response: any) => {
            if (response && response.history) {
              // Lưu tất cả dữ liệu vào listOfData
              // paidData getter sẽ filter theo payment status
              this.listOfData = response.history;
              this.lastFilterType = filterType;
              
              // Set currentPage sau khi load dữ liệu
              this.currentPage = page;
              
              // Tính lại pagination sau khi filter
              // Sử dụng setTimeout để đảm bảo paidData getter đã được tính
              setTimeout(() => {
              this.processTableData();
              this.calculateTotalPayment();
            }, 0);
            }
            this.settingValue.loading = false;
          },
          error: (error: any) => {
            console.error('Error loading history:', error);
            this.message.error('Không thể tải lịch sử phòng');
            this.settingValue.loading = false;
            // Vẫn tính lại tổng tiền ngay cả khi có lỗi (với dữ liệu hiện tại)
            this.calculateTotalPayment();
          }
        });
    } else {
      // Chỉ cập nhật currentPage, không load lại dữ liệu
      this.currentPage = page;
      
      // Tính lại pagination
      setTimeout(() => {
        const filteredItems = this.processedPaidData.length;
        this.totalItems = filteredItems;
        this.totalPages = Math.ceil(filteredItems / this.pageSize);
        
        // Đảm bảo currentPage không vượt quá totalPages
        if (this.currentPage > this.totalPages && this.totalPages > 0) {
          this.currentPage = this.totalPages;
        } else if (this.currentPage < 1) {
          this.currentPage = 1;
        }
      }, 0);
    }
  }
  
  onPageChange(page: number): void {

    this.currentPage = page;
    
    // Đảm bảo currentPage hợp lệ
    if (this.currentPage > this.totalPages && this.totalPages > 0) {
      this.currentPage = this.totalPages;
    } else if (this.currentPage < 1) {
      this.currentPage = 1;
    }
    this.updateDisplayData();
  }
  
  reloadData(): void {
    // Reset về trang 1 và force reload dữ liệu
    this.currentPage = 1;
    this.loadHistory(this.currentFilterType, 1, true);
  }
  
  onPageSizeChange(pageSize: number): void {
    this.pageSize = pageSize;
    this.currentPage = 1;
    this.loadHistory(this.currentFilterType, 1);
    this.updateDisplayData();
  }
}
