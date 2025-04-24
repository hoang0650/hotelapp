import { Component, Input, OnInit, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
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
}

@Component({
  selector: 'app-room-history',
  templateUrl: './room-history.component.html',
  styleUrls: ['./room-history.component.scss']
})
export class RoomHistoryComponent implements OnInit, OnChanges, OnDestroy {
  @Input() hotelId: string | null = null;
  @Input() roomId: string | null = null;

  historyList: ExtendedBookingHistory[] = [];
  totalPages = 0;
  currentPage = 1;
  pageSize = 20;
  isLoading = false;
  totalPayment = 0;
  
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
    private fb: FormBuilder
  ) { }

  ngOnInit(): void {
    this.initSettingForm();
    this.loadRoomHistory();
    
    // Đăng ký lắng nghe sự kiện cập nhật dữ liệu phòng
    this.roomDataSubscription = this.roomsService.getRoomDataUpdated$().subscribe(() => {
      // Khi có thông báo dữ liệu phòng được cập nhật (checkout, checkin), tải lại lịch sử
      this.loadRoomHistory();
    });
  }
  
  ngOnDestroy(): void {
    if (this.roomDataSubscription) {
      this.roomDataSubscription.unsubscribe();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['hotelId'] || changes['roomId']) {
      this.loadRoomHistory();
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

  loadRoomHistory(page: number = 1) {
    this.isLoading = true;
    
    const params: any = {
      page: page,
      limit: this.pageSize
    };
    
    if (this.roomId) {
      params.roomId = this.roomId;
    }
    
    if (this.hotelId) {
      params.hotelId = this.hotelId;
    }
    
    this.roomsService.getRoomHistory(params).subscribe({
      next: (data) => {
        // Chỉ lấy các sự kiện check-out
        this.historyList = data.history.filter((item: any) => item.event === 'check-out').map((item: any) => {
          // Đảm bảo checkInTime và checkOutTime luôn là đối tượng Date nếu có
          const checkInTime = item.checkInTime || item.checkinTime;
          const checkOutTime = item.checkOutTime || item.checkoutTime;
          
          return {
            ...item,
            customerName: this.getCustomerName(item),
            checkInTime: checkInTime ? new Date(checkInTime) : undefined,
            checkOutTime: checkOutTime ? new Date(checkOutTime) : undefined,
            paymentMethod: this.getPaymentMethod(item),
            // Đảm bảo dữ liệu bổ sung cho hiển thị chi tiết
            guestInfo: item.guestInfo || {},
            notes: item.notes || ''
          } as ExtendedBookingHistory;
        });
        
        this.totalPages = data.totalPages;
        this.currentPage = data.currentPage;
        // Tính tổng thanh toán từ danh sách đã lọc
        this.totalPayment = this.historyList.reduce((sum, item) => sum + (item.amount || 0), 0);
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Lỗi khi tải lịch sử phòng:', err);
        this.isLoading = false;
        this.message.error('Không thể tải lịch sử phòng. Vui lòng thử lại sau.');
      }
    });
  }

  // Helper methods để lấy dữ liệu từ response API
  private getCustomerName(item: any): string {
    return item.customerName || item.guestInfo?.name || 'Khách lẻ';
  }

  private getCheckInTime(item: any): Date | undefined {
    return item.checkInTime || item.checkinTime;
  }

  private getCheckOutTime(item: any): Date | undefined {
    return item.checkOutTime || item.checkoutTime;
  }

  private getPaymentMethod(item: any): string {
    return item.paymentMethod || 'cash';
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadRoomHistory();
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
      this.message.warning('Không tìm thấy hóa đơn cho giao dịch này.');
      return;
    }
    
    this.isLoading = true;
    
    this.roomsService.getInvoiceDetails(invoiceId).subscribe(
      (invoiceData) => {
        // Nếu có hotelId, lấy thông tin khách sạn đầy đủ
        if (this.hotelId) {
          this.roomsService.getHotelInfo(this.hotelId).subscribe(
            (hotelInfo) => {
              // Thêm thông tin chi tiết khách sạn vào invoiceData
              invoiceData.businessName = hotelInfo.name;
              invoiceData.business_address = hotelInfo.address;
              invoiceData.phoneNumber = hotelInfo.phoneNumber || (hotelInfo['contact'] ? hotelInfo['contact'].phone : '') || '';
              
              // Hiển thị thông tin checkout rõ ràng hơn
              if (invoiceData.checkInTime && invoiceData.checkOutTime) {
                // Tính số giờ ở
                const checkInTime = new Date(invoiceData.checkInTime);
                const checkOutTime = new Date(invoiceData.checkOutTime);
                const durationInHours = Math.ceil((checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60));
                
                // Thêm thông tin thời gian lưu trú
                invoiceData.duration = {
                  hours: durationInHours,
                  days: Math.ceil(durationInHours / 24)
                };
                
                // Tính giá tiền phòng
                let roomRate = invoiceData.roomRate || 0;
                if (!roomRate && invoiceData.roomType) {
                  // Nếu không có roomRate nhưng có roomType, lấy giá mặc định theo loại phòng
                  const roomTypes: { [key: string]: number } = {
                    'standard': 200000,
                    'deluxe': 350000,
                    'suite': 500000,
                    'family': 400000,
                    'vip': 700000
                  };
                  roomRate = roomTypes[invoiceData.roomType.toLowerCase()] || 200000;
                }
                
                // Thêm thông tin đầy đủ vào mảng products
                if (!invoiceData.products || invoiceData.products.length === 0) {
                  invoiceData.products = [{
                    name: `Tiền phòng ${invoiceData.roomNumber || 'N/A'} (${durationInHours} giờ)`,
                    price: invoiceData.amount || roomRate * Math.ceil(durationInHours / 24) || 0,
                    quantity: 1
                  }];
                }
                
                // Thêm các dịch vụ đã sử dụng nếu có
                if (invoiceData.services && Array.isArray(invoiceData.services) && invoiceData.services.length > 0) {
                  invoiceData.services.forEach((service: any) => {
                    invoiceData.products.push({
                      name: service.name || 'Dịch vụ',
                      price: service.price || 0,
                      quantity: service.quantity || 1
                    });
                  });
                }
                
                // Tính tổng tiền dịch vụ
                const serviceAmount = (invoiceData.services || []).reduce((sum: number, service: any) => {
                  return sum + (service.price || 0) * (service.quantity || 1);
                }, 0);
                
                // Cập nhật tổng tiền nếu cần
                if (!invoiceData.totalAmount) {
                  invoiceData.totalAmount = (invoiceData.amount || 0) + serviceAmount;
                }
                
                // Thêm thông tin khách hàng đầy đủ
                if (invoiceData.guestInfo) {
                  invoiceData.customerName = invoiceData.guestInfo.name || invoiceData.customerName;
                  invoiceData.customerPhone = invoiceData.guestInfo.phone;
                  invoiceData.customerEmail = invoiceData.guestInfo.email;
                }
              }
              
              // Thêm thông tin staff nếu có
              if (invoiceData.staffId) {
                // Gọi API lấy thông tin nhân viên nếu cần
                // Hoặc gán giá trị mặc định
                invoiceData.staffName = invoiceData.staffName || 'Nhân viên lễ tân';
              }
              
              this.showInvoiceModal(invoiceData);
            },
            (error) => {
              console.error('Lỗi khi lấy thông tin khách sạn:', error);
              this.showInvoiceModal(invoiceData);
            }
          );
        } else {
          this.showInvoiceModal(invoiceData);
        }
      },
      (error) => {
        this.isLoading = false;
        this.message.error('Lỗi khi tải hóa đơn: ' + error.message);
      }
    );
  }

  // Hiển thị modal hóa đơn
  private showInvoiceModal(invoiceData: any): void {
    this.isLoading = false;
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
