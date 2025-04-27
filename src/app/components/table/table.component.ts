import { Component, OnInit, NgModule, Input, Output, EventEmitter } from '@angular/core';
import { FormControl, FormGroup, NonNullableFormBuilder } from '@angular/forms';
import { NzTableLayout, NzTablePaginationPosition, NzTablePaginationType, NzTableSize } from 'ng-zorro-antd/table';
import { ProductService } from '../../services/product.service';
import { RoomsService } from '../../services/rooms.service';
import { ItemData, Setting } from '../../interfaces/room';
import * as XLSX from 'xlsx';

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
export class TableComponent implements OnInit {
  @Input() listOfData: any[] = [];
  @Input() fixedColumn: boolean = true;
  @Output() onViewInvoice = new EventEmitter<any>();

  searchText: string = '';
  exported: boolean = false;
  switchValue = false;
  allChecked = false;
  indeterminate = false;
  totalPayment = 0;
  today = new Date();
  
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

  constructor(private fb: NonNullableFormBuilder, private productService: ProductService, private roomService: RoomsService) {}

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
    
    this.setScrollSize();
    this.calculateTotalPayment();
  }
  
  setScrollSize(): void {
    this.scrollX = this.settingValue.fixedHeader ? '1200px' : null;
    this.scrollY = this.settingValue.fixedHeader ? '600px' : null;
  }
  
  countByStatus(status: string): number {
    return this.listOfData.filter(item => item.payment?.status === status).length;
  }
  
  getPaymentStatusColor(status: string | undefined): string {
    if (!status) return 'blue';
    switch (status) {
      case 'paid': return 'green';
      case 'pending': return 'orange';
      case 'cancelled': return 'red';
      default: return 'blue';
    }
  }
  
  getPaymentStatusText(status: string | undefined): string {
    if (!status) return 'Chưa xác định';
    switch (status) {
      case 'paid': return 'Đã thanh toán';
      case 'pending': return 'Chờ thanh toán';
      case 'cancelled': return 'Đã hủy';
      default: return 'Chưa xác định';
    }
  }

  viewInvoice(item: any): void {
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
      const amount = current?.payment?.amount;
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
          'Số tiền thanh toán': item.payment?.amount || 0,
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

  getPaymentMethodLabel(method: string | undefined): string {
    if (!method) return 'Tiền mặt';
    const paymentMethods: { [key: string]: string } = {
      'cash': 'Tiền mặt',
      'card': 'Thẻ',
      'banking': 'Chuyển khoản',
      'qr': 'QR Code',
      'visa': 'Visa/Master',
      'momo': 'MoMo',
      'zalopay': 'ZaloPay',
      'vnpay': 'VNPay'
    };
    return paymentMethods[method.toLowerCase()] || method;
  }

  getPaymentMethodColor(method: string | undefined): string {
    if (!method) return 'green';
    const colorMap: { [key: string]: string } = {
      'cash': 'green',
      'card': 'blue',
      'banking': 'purple',
      'qr': 'cyan',
      'visa': 'geekblue',
      'momo': 'magenta',
      'zalopay': 'blue',
      'vnpay': 'orange'
    };
    return colorMap[method.toLowerCase()] || 'default';
  }
}