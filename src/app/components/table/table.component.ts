import { Component, OnInit, NgModule, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
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
import { finalize, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
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
import { take } from 'rxjs/operators';

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
export class TableComponent implements OnInit, OnChanges {
  @Input() listOfData: any[] = [];
  @Input() hotelId: string | null = null;
  @Input() fixedColumn: boolean = true;
  @Output() onViewInvoice = new EventEmitter<any>();

  // Bộ lọc
  currentFilterType = 'checkout'; // Giá trị mặc định là checkout
  
  // Getter để lọc chỉ các bản ghi đã thanh toán (loại trừ dọn dẹp, bảo trì, check-in, booking)
  get paidData(): any[] {
    if (!this.listOfData) return [];
    return this.listOfData.filter(item => {
      // Loại trừ các event không liên quan đến thanh toán
      const excludedEvents = [
        'cleaning', 'clean', 'maintenance', 'check-in', 'checkin', 
        'service', 'transfer', 'booking', 'checked_in', 'cancel_booking'
      ];
      
      const eventType = (item.event || item.type || '').toLowerCase();
      
      // Nếu là event bị loại trừ thì không hiển thị
      if (excludedEvents.includes(eventType)) return false;
      
      // Loại trừ các booking (đặt trước) - kiểm tra status hoặc type
      if (item.status === 'booked' || item.status === 'pending' || 
          item.bookingStatus === 'booked' || item.bookingStatus === 'pending') {
        return false;
      }
      
      // Loại trừ nếu không có checkOutTime (chưa checkout)
      if (!item.checkOutTime && !item.checkoutTime) return false;
      
      // Kiểm tra trạng thái thanh toán
      const isPaid = item.paymentStatus === 'paid' || 
                     item.payment?.status === 'paid' ||
                     item.payment?.paymentStatus === 'paid';
      
      // Kiểm tra event checkout
      const isCheckout = eventType === 'check-out' || eventType === 'checkout';
      
      // Chỉ lấy các bản ghi đã thanh toán HOẶC là checkout (có checkOutTime)
      return isPaid || isCheckout;
    });
  }
  
  searchText: string = '';
  exported: boolean = false;
  switchValue = false;
  allChecked = false;
  indeterminate = false;
  totalPayment = 0;
  today = new Date();
  
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
    { value: 'pending', label: 'Chờ thanh toán', color: 'warning' },
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
    private businessService: BusinessService
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

    // Tải lịch sử checkout mới nhất nếu không có dữ liệu được truyền vào
    if (this.hotelId && this.listOfData.length === 0) {
      this.loadHistory(this.currentFilterType);
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
  }
  
  setScrollSize(): void {
    this.scrollX = this.settingValue.fixedHeader ? '1200px' : null;
    this.scrollY = this.settingValue.fixedHeader ? '600px' : null;
  }
  
  countByStatus(status: 'paid' | 'pending' | 'cancelled' | 'refunded'): number {
    if (!this.listOfData) return 0;
    
    return this.listOfData.filter(item => {
      if (status === 'paid') {
        return item.paymentStatus === 'paid' || item.payment?.status === 'paid' || (item.amount > 0 || item.payment?.amount > 0);
      } else if (status === 'pending') {
        return item.paymentStatus === 'pending' || item.payment?.status === 'pending' || (item.amount === 0 && (!item.payment || item.payment.amount === 0));
      } else {
        return item.paymentStatus === status || item.payment?.status === status;
      }
    }).length;
  }
  
  getPaymentStatusText(status: string): string {
    const found = this.paymentStatusOptions.find(option => option.value === status);
    return found ? found.label : 'Chờ thanh toán';
  }

  getPaymentStatusColor(status: string): string {
    const found = this.paymentStatusOptions.find(option => option.value === status);
    return found ? found.color : 'warning';
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
      roomAmount: invoice.roomAmount || 0,
      serviceAmount: invoice.serviceAmount || 0,
      additionalCharges: invoice.additionalCharges || 0,
      discount: invoice.discount || 0,
      advancePayment: invoice.advancePayment || 0,
      totalAmount: invoice.totalAmount || 0,
      paymentMethod: invoice.paymentMethod || 'cash',
      paymentStatus: invoice.paymentStatus || 'paid',
      notes: invoice.notes || '',
      guestDetails: invoice.guestDetails || invoice.guestInfo || {},
      hotelId: hotelId, // Đảm bảo hotelId luôn là string
      rateType: invoice.rateType || 'hourly',
      businessInfo: invoice.businessInfo || null // Truyền businessInfo đầy đủ để component có thể sử dụng
    };
  }
  
  // Hiển thị modal hóa đơn
  showInvoiceModal(invoiceData: any): void {
    // Đảm bảo có businessInfo trước khi hiển thị
    if (!invoiceData.businessInfo && invoiceData.hotelId) {
      // Load business info từ hotelId
      this.loadBusinessInfoForInvoice(invoiceData).then((updatedInvoiceData) => {
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
    // Tính tổng tiền chỉ từ các bản ghi đã thanh toán
    let baseTotal = this.paidData.reduce((sum, current) => {
      const amount = current?.totalAmount || current?.amount || current?.payment?.amount || 0;
      return sum + (typeof amount === 'number' ? amount : 0);
    }, 0);
    
    // Trừ đi tiền giao quản lý và tiền chi (nếu có) từ form giao ca
    const managerHandoverAmount = this.shiftHandoverForm?.get('managerHandoverAmount')?.value || 0;
    const expenseAmount = this.shiftHandoverForm?.get('expenseAmount')?.value || 0;
    
    // Tổng tiền = tổng tiền ban đầu - tiền giao quản lý - tiền chi
    this.totalPayment = Math.max(0, baseTotal - managerHandoverAmount - expenseAmount);
  }
  
  exportToExcel(): void {
    this.exported = true;

    try {
      // Chỉ xuất các bản ghi đã thanh toán
      const data = this.paidData.map(item => {
        // Lấy thông tin khách hàng
        const customerName = item.customerName || item.guestInfo?.name || 'Khách lẻ';
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
        
        return {
          'Phòng': item.roomNumber || '',
          'Khách hàng': customerName,
          'SĐT': customerPhone,
          'CCCD/CMND': customerIdNumber,
          'Nhận phòng': checkInTime ? this.formatDateTime(checkInTime) : '',
          'Trả phòng': checkOutTime ? this.formatDateTime(checkOutTime) : '',
          'Thời gian lưu trú': duration,
          'Tiền phòng': item.roomTotal || 0,
          'Dịch vụ': servicesList,
          'Tiền dịch vụ': item.servicesTotal || 0,
          'Phụ thu': item.additionalCharges || 0,
          'Khuyến mãi': item.discount || 0,
          'Đặt trước': item.advancePayment || 0,
          'Tổng tiền': item.totalAmount || item.amount || 0,
          'Hình thức TT': paymentMethod,
          'Trạng thái': 'Đã thanh toán',
          'Ghi chú': item.notes || ''
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Lịch sử đã thanh toán');

      // Thiết lập độ rộng cột
      const columnWidths = [
        { wch: 8 },   // Phòng
        { wch: 20 },  // Khách hàng
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
      
      this.message.success(`Đã xuất file ${fileName}`);
    } catch (error) {
      console.error('Lỗi xuất Excel:', error);
      this.message.error('Lỗi khi xuất file Excel');
    } finally {
      setTimeout(() => {
        this.exported = false;
      }, 1000);
    }
  }

  getPaymentMethodLabel(method: string): string {
    const found = this.paymentMethodOptions.find(option => option.value === method);
    return found ? found.label : 'Tiền mặt';
  }

  getPaymentMethodColor(method: string): string {
    const found = this.paymentMethodOptions.find(option => option.value === method);
    return found ? found.color : 'green';
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
      expenseAmount: [0],
      incomeAmount: [0],
      notes: [''],
      shiftId: [this.defaultShiftId]
    });

    // Tính số tiền giao ca = Số tiền ca trước + Tiền mặt trong ca - Tiền giao quản lý
    this.shiftHandoverForm.valueChanges.subscribe(values => {
      const handoverAmount = (values.previousShiftAmount || 0) + (values.cashInShift || 0) - (values.managerHandoverAmount || 0);
      const totalRevenue = (values.cashAmount || 0) + (values.bankTransferAmount || 0) + (values.cardPaymentAmount || 0) - (values.expenseAmount || 0);
      
      if (handoverAmount >= 0) {
        this.handoverMessage = `Số tiền giao ca: ${this.formatterVND(handoverAmount)} đ | Tổng doanh thu: ${this.formatterVND(totalRevenue)} đ`;
        this.handoverMessageType = handoverAmount > 0 ? 'success' : 'info';
      } else {
        this.handoverMessage = `Số tiền giao ca: ${this.formatterVND(handoverAmount)} đ (âm)`;
        this.handoverMessageType = 'warning';
      }
    });
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
  loadPreviousShiftAmount(): void {
    if (!this.hotelId) return;
    
    this.shiftHandoverService.getPreviousShiftAmount(this.hotelId).subscribe(
      (response) => {
        this.previousShiftAmount = response.data.previousShiftAmount;
        this.shiftHandoverForm.patchValue({ previousShiftAmount: this.previousShiftAmount });
      },
      (error) => {
        console.error('Error loading previous shift amount:', error);
      }
    );
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
    this.loadPreviousShiftAmount();
    
    // Tính tổng doanh thu từ paidData (CHỈ tính từ thanh toán trong ca, KHÔNG cộng thêm tiền ca trước)
    const totalCash = this.paidData
      .filter(item => item.paymentMethod === 'cash')
      .reduce((sum, item) => sum + (item.totalAmount || item.amount || 0), 0);
    const totalBankTransfer = this.paidData
      .filter(item => ['transfer', 'bank_transfer', 'banking'].includes(item.paymentMethod))
      .reduce((sum, item) => sum + (item.totalAmount || item.amount || 0), 0);
    const totalCard = this.paidData
      .filter(item => ['card', 'credit_card', 'visa'].includes(item.paymentMethod))
      .reduce((sum, item) => sum + (item.totalAmount || item.amount || 0), 0);
    
    // Tiền mặt trong ca = CHỈ tiền mặt thu được trong ca (KHÔNG cộng thêm previousShiftAmount)
    this.shiftHandoverForm.patchValue({
      shiftId: this.defaultShiftId,
      cashAmount: totalCash,              // Tiền mặt thu được trong ca
      bankTransferAmount: totalBankTransfer,
      cardPaymentAmount: totalCard,
      cashInShift: totalCash              // Tiền mặt trong ca = chỉ tiền mặt thu được (không cộng tiền ca trước)
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
    
    // Tính tổng doanh thu
    const totalRevenue = (formData.cashAmount || 0) + (formData.bankTransferAmount || 0) + (formData.cardPaymentAmount || 0) - (formData.expenseAmount || 0);
    
    // Tạo roomHistory từ paidData
    const roomHistory = this.paidData.map(item => ({
      roomId: item.roomId || item._id,
      roomNumber: item.roomNumber,
      bookingId: item.bookingId,
      action: 'check_out',
      guestName: item.guestInfo?.name || item.customerName || 'Khách lẻ',
      amount: item.totalAmount || item.amount || 0,
      paymentMethod: item.paymentMethod || 'cash',
      timestamp: item.checkOutTime || item.checkoutTime || new Date(),
      notes: item.notes || ''
    }));
    
    // Tạo invoices từ paidData
    const invoices = this.paidData.map(item => ({
      invoiceNumber: item.invoiceNumber,
      bookingId: item.bookingId,
      roomId: item.roomId,
      roomNumber: item.roomNumber,
      guestName: item.guestInfo?.name || item.customerName || 'Khách lẻ',
      amount: item.totalAmount || item.amount || 0,
      paymentMethod: item.paymentMethod || 'cash',
      type: 'room',
      timestamp: item.checkOutTime || item.checkoutTime || new Date()
    }));
    
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
      expenseAmount: formData.expenseAmount || 0,
      incomeAmount: formData.incomeAmount || 0,
      roomHistory: roomHistory,
      invoices: invoices,
      expenses: [],
      incomes: [],
      serviceOrders: [],
      notes: formData.notes || '',
      pendingIssues: [],
      shiftStartTime: new Date()
    };

    console.log('Đang gửi dữ liệu giao ca:', handoverData);

    this.sendShiftHandoverData(handoverData);
  }
  
  sendShiftHandoverData(data: any): void {
    if (this.hotelId) {
      data.hotelId = this.hotelId;
    }
    
    // Sử dụng API endpoint đúng từ backend
    const apiUrl = `http://localhost:3000/shift-handover`;
    
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
          localStorage.setItem('token', response.login.token);
          
          if (response.login.user) {
            localStorage.setItem('user', JSON.stringify(response.login.user));
            // Cập nhật AuthService
            this.authService.loginFromShiftHandover(response.login.token, response.login.user);
            // Cập nhật UserService để header tự động refresh
            this.userService.setCurrentUser(response.login.user);
          }
          
          if (response.login.staff) {
            localStorage.setItem('staff', JSON.stringify(response.login.staff));
            localStorage.setItem('staffId', response.login.staff._id);
            this.currentStaffId = response.login.staff._id;
          }
          
          const displayName = response.login.user?.fullName || response.login.user?.username || 'nhân viên mới';
          this.message.success(`Đã đăng nhập với tài khoản: ${displayName}`);
        }
        
        // Xóa lịch sử thanh toán hiện tại sau khi giao ca thành công
        this.listOfData = [];
        this.totalPayment = 0;
        this.calculateTotalPayment();
        
        this.loadDataAfterHandover();
        
        setTimeout(() => {
          this.closeShiftHandoverModal();
        }, 2000);
      }
    );
  }
  
  loadDataAfterHandover(): void {
    if (this.hotelId) {
      const apiUrl = `http://localhost:3000/rooms?hotelId=${this.hotelId}`;
      
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
    
    // Đảm bảo currentStaffId đã được set
    if (!this.currentStaffId || !this.currentStaffId.trim()) {
      // Thử lấy từ localStorage
      const savedStaffId = localStorage.getItem('staffId');
      if (savedStaffId && savedStaffId.trim()) {
        this.currentStaffId = savedStaffId.trim();
      } else {
        // Load lại staff list để lấy currentStaffId
        this.loadStaffList();
      }
    }
    
    // Reset form với giá trị mặc định
    this.managerHandoverForm.patchValue({
      managerUsername: '',
      managerPassword: '',
      managerHandoverAmount: 0,
      notes: ''
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
  
  // Tính tiền mặt thực thu trong ca
  getActualCashInShift(): number {
    return this.paidData
      .filter(item => item.paymentMethod === 'cash')
      .reduce((sum, item) => sum + (item.totalAmount || item.amount || 0), 0);
  }
  
  // Tính tiền mặt sau khi giao quản lý
  getCashAfterManagerHandover(): number {
    const managerAmount = this.managerHandoverForm?.get('managerHandoverAmount')?.value || 0;
    return this.getActualCashInShift() + this.previousShiftAmount - managerAmount;
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
    
    if (!this.currentStaffId || !this.currentStaffId.trim()) {
      this.message.error('Không tìm thấy thông tin nhân viên hiện tại. Vui lòng đăng nhập lại.');
      return;
    }
    
    if (!this.hotelId) {
      this.message.error('Không tìm thấy thông tin khách sạn');
      return;
    }
    
    this.isSubmittingManagerHandover = true;
    
    const managerAmount = formData.managerHandoverAmount || 0;
    const actualCash = this.getActualCashInShift();
    const cashAfterHandover = actualCash + this.previousShiftAmount - managerAmount;
    
    // Gửi lên server để xác thực mật khẩu và lưu lịch sử
    const managerHandoverData = {
      hotelId: this.hotelId,
      fromStaffId: this.currentStaffId.trim(),
      managerUsername: formData.managerUsername.trim(), // Username hoặc email của quản lý
      managerPassword: formData.managerPassword.trim(),
      amount: managerAmount,
      cashBeforeHandover: actualCash + this.previousShiftAmount,
      cashAfterHandover: cashAfterHandover,
      notes: formData.notes || '',
      timestamp: new Date()
    };
    
    console.log('Giao tiền quản lý:', managerHandoverData);
    
    // Gọi API để xác thực và lưu
    this.http.post(`http://localhost:3000/shift-handover/manager`, managerHandoverData).pipe(
      catchError((error: HttpErrorResponse) => {
        let errorMessage = 'Có lỗi xảy ra khi giao tiền quản lý';
        
        if (error.error?.message) {
          errorMessage = error.error.message;
        } else if (error.status === 401) {
          errorMessage = 'Mật khẩu quản lý không đúng';
        }
        
        this.message.error(errorMessage);
        console.error('Lỗi giao tiền quản lý:', error);
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
          managerHandoverAmount: managerAmount,
          cashAmount: cashAfterHandover,
          cashInShift: actualCash
        }, { emitEvent: true }); // emitEvent: true để trigger valueChanges subscription
        
        // Đảm bảo các control được mark as dirty để trigger validation và update
        this.shiftHandoverForm.get('managerHandoverAmount')?.markAsDirty();
        this.shiftHandoverForm.get('cashAmount')?.markAsDirty();
        this.shiftHandoverForm.get('cashInShift')?.markAsDirty();
        
        // Trigger lại valueChanges để cập nhật alert ngay lập tức
        const currentValues = this.shiftHandoverForm.value;
        const handoverAmount = (currentValues.previousShiftAmount || 0) + (currentValues.cashInShift || 0) - (currentValues.managerHandoverAmount || 0);
        const totalRevenue = (currentValues.cashAmount || 0) + (currentValues.bankTransferAmount || 0) + (currentValues.cardPaymentAmount || 0) - (currentValues.expenseAmount || 0);
        
        if (handoverAmount >= 0) {
          this.handoverMessage = `Số tiền giao ca: ${this.formatterVND(handoverAmount)} đ | Tổng doanh thu: ${this.formatterVND(totalRevenue)} đ`;
          this.handoverMessageType = handoverAmount > 0 ? 'success' : 'info';
        } else {
          this.handoverMessage = `Số tiền giao ca: ${this.formatterVND(handoverAmount)} đ (âm)`;
          this.handoverMessageType = 'warning';
        }
        
        const managerName = response.managerInfo?.name || formData.managerUsername || 'quản lý';
        this.message.success(`Đã giao ${this.formatterVND(managerAmount)} đ cho ${managerName}. Tiền mặt còn lại: ${this.formatterVND(cashAfterHandover)} đ`);
        
        // Đóng modal
        this.closeManagerHandoverModal();
        
        // Cập nhật tổng tiền hiển thị (tự động trừ đi tiền giao quản lý và tiền chi)
        this.calculateTotalPayment();
        
        // Log để debug
        console.log('Đã cập nhật form giao ca sau khi giao tiền quản lý:', {
          managerHandoverAmount: managerAmount,
          cashAmount: cashAfterHandover,
          cashInShift: actualCash,
          previousShiftAmount: this.shiftHandoverForm.get('previousShiftAmount')?.value,
          handoverAmount: handoverAmount,
          totalRevenue: totalRevenue
        });
      }
    );
  }

  // Tính tổng số tiền
  getTotalAmount(): number {
    // Tính tổng từ các bản ghi đã thanh toán
    let baseTotal = this.paidData.reduce((total, item) => {
      const amount = item.totalAmount || item.amount || item.payment?.amount || 0;
      return total + (typeof amount === 'number' ? amount : 0);
    }, 0);
    
    // Trừ đi tiền giao quản lý và tiền chi (nếu có) từ form giao ca
    const managerHandoverAmount = this.shiftHandoverForm?.get('managerHandoverAmount')?.value || 0;
    const expenseAmount = this.shiftHandoverForm?.get('expenseAmount')?.value || 0;
    
    // Tổng tiền = tổng tiền ban đầu - tiền giao quản lý - tiền chi
    return Math.max(0, baseTotal - managerHandoverAmount - expenseAmount);
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
    this.loadHistory(filterType);
  }
  
  loadHistory(filterType: string = 'all'): void {
    if (!this.hotelId) return;
    
    // Đảm bảo hotelId là string, không phải object
    const hotelIdStr = typeof this.hotelId === 'object' ? (this.hotelId as any)?._id || String(this.hotelId) : this.hotelId;
    
    if (!hotelIdStr || hotelIdStr === '[object Object]') {
      console.error('Invalid hotelId:', this.hotelId);
      return;
    }
    
    this.settingValue.loading = true;
    
    this.roomService.getRoomHistory(hotelIdStr, filterType)
      .subscribe({
        next: (response: any) => {
          if (response && response.history) {
            this.listOfData = response.history;
            this.calculateTotalPayment();
          }
          this.settingValue.loading = false;
        },
        error: (error: any) => {
          console.error('Error loading history:', error);
          this.message.error('Không thể tải lịch sử phòng');
          this.settingValue.loading = false;
        }
      });
  }
}