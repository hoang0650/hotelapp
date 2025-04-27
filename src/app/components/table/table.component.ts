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
import * as moment from 'moment';
import { format } from 'date-fns';
import { finalize, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { InvoiceService } from '../../services/invoice.service';

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
    { value: 'card', label: 'Thẻ tín dụng', color: 'blue' },
    { value: 'transfer', label: 'Chuyển khoản', color: 'purple' }
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
    private message: NzMessageService,
    private http: HttpClient,
    private invoiceService: InvoiceService
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
    
    console.log('Hiển thị hóa đơn cho phòng:', item.roomNumber);
    
    if (!item.id) {
      item.id = this.defaultShiftId;
    }
    
    this.invoiceService.showInvoiceModal(item);
    
    this.onViewInvoice.emit(item);
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
    this.totalPayment = this.listOfData.reduce((sum, current) => {
      const amount = current?.amount || current?.payment?.amount || 0;
      return sum + (typeof amount === 'number' ? amount : 0);
    }, 0);
  }
  
  exportToExcel(): void {
    this.exported = true;

    try {
      const data = this.listOfData.map(item => {
        return {
          'Phòng': item.roomNumber,
          'Khách hàng': item.customerName || 'Khách lẻ',
          'Nhận phòng': item.checkinTime ? new Date(item.checkinTime).toLocaleString() : '',
          'Trả phòng': item.checkoutTime ? new Date(item.checkoutTime).toLocaleString() : '',
          'Trạng thái thanh toán': this.getPaymentStatusText(item.payment?.status),
          'Số tiền thanh toán': item.amount || item.payment?.amount || 0,
          'Ghi chú': item.notes || ''
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh sách phòng');

      const columnWidths = [
        { wch: 10 },
        { wch: 25 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 15 },
        { wch: 30 }
      ];
      worksheet['!cols'] = columnWidths;

      XLSX.writeFile(workbook, `danh_sach_phong_${new Date().toISOString().split('T')[0]}.xlsx`);
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
      handoverEmployee: ['', Validators.required],
      receivingEmployee: ['', Validators.required],
      handoverTime: [new Date(), Validators.required],
      amount: [0, [Validators.required, Validators.min(0)]],
      paymentMethod: ['cash', Validators.required],
      notes: [''],
      shiftId: [this.defaultShiftId]
    });

    this.shiftHandoverForm.get('amount')?.valueChanges.subscribe(value => {
      if (value > 0) {
        this.handoverMessage = 'Đã thanh toán đầy đủ';
        this.handoverMessageType = 'success';
      } else {
        this.handoverMessage = 'Chờ thanh toán';
        this.handoverMessageType = 'warning';
      }
    });
  }
  
  openShiftHandoverModal(): void {
    this.isShiftHandoverModalVisible = true;
    this.handoverMessage = '';
    
    this.shiftHandoverForm.patchValue({
      shiftId: this.defaultShiftId
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
      return;
    }

    this.isSubmitting = true;

    const formData = this.shiftHandoverForm.value;
    const paymentStatus = formData.amount > 0 ? 'paid' : 'pending';
    
    const handoverData = {
      ...formData,
      id: formData.shiftId,
      paymentStatus: paymentStatus,
      handoverTime: format(new Date(formData.handoverTime), 'yyyy-MM-dd HH:mm:ss'),
      createdAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
    };

    console.log('Đang gửi dữ liệu giao ca với ID:', handoverData.id);

    this.sendShiftHandoverData(handoverData);
  }
  
  sendShiftHandoverData(data: any): void {
    if (this.hotelId) {
      data.hotelId = this.hotelId;
    }
    
    const apiUrl = `${environment.apiUrl}/api/shift-handovers`;
    
    this.http.post(apiUrl, data).pipe(
      catchError((error: HttpErrorResponse) => {
        let errorMessage = 'Có lỗi xảy ra khi gửi dữ liệu giao ca';
        
        if (error.error instanceof ErrorEvent) {
          // Lỗi client-side
          errorMessage = `Lỗi: ${error.error.message}`;
        } else {
          // Lỗi server-side
          errorMessage = `Mã lỗi: ${error.status}, Thông báo: ${error.message}`;
        }
        
        this.handoverMessage = 'Có lỗi xảy ra khi gửi dữ liệu giao ca!';
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
        if (data.amount > 0) {
          this.handoverMessage = 'Giao ca thành công. Số tiền đã được bàn giao.';
          this.handoverMessageType = 'success';
          this.message.success('Giao ca thành công');
        } else {
          this.handoverMessage = 'Giao ca thành công. Chưa có tiền được bàn giao.';
          this.handoverMessageType = 'info';
          this.message.info('Giao ca thành công');
        }
        
        console.log('Đã gửi dữ liệu giao ca:', response);
        
        this.loadDataAfterHandover();
        
        setTimeout(() => {
          this.closeShiftHandoverModal();
        }, 2000);
      }
    );
  }
  
  loadDataAfterHandover(): void {
    if (this.hotelId) {
      const apiUrl = `${environment.apiUrl}/api/hotels/${this.hotelId}/rooms`;
      
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

  // Tính tổng số tiền
  getTotalAmount(): number {
    if (!this.listOfData) return 0;
    
    return this.listOfData.reduce((total, item) => {
      const amount = item.amount || item.payment?.amount || item.totalAmount || 0;
      return total + (typeof amount === 'number' ? amount : 0);
    }, 0);
  }

  onFilterChange(filterType: string): void {
    this.currentFilterType = filterType;
    this.loadHistory(filterType);
  }
  
  loadHistory(filterType: string = 'all'): void {
    if (!this.hotelId) return;
    
    this.settingValue.loading = true;
    
    this.roomService.getRoomHistory(this.hotelId, filterType)
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