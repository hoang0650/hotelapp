import { Component, OnInit, NgModule } from '@angular/core';
import { FormControl, FormGroup, NonNullableFormBuilder } from '@angular/forms';
import { NzTableLayout, NzTablePaginationPosition, NzTablePaginationType, NzTableSize } from 'ng-zorro-antd/table';
import { ProductService } from '../../services/product.service';
import { RoomsService } from '../../services/rooms.service';
import { ItemData, Setting } from '../../interfaces/room';

type TableScroll = 'unset' | 'scroll' | 'fixed';

@Component({
  selector: 'app-table',
  templateUrl: './table.component.html',
  styleUrls: ['./table.component.css']
})

export class TableComponent implements OnInit {
  switchValue = false;
  exported?: boolean;
  settingForm: FormGroup<{ [K in keyof Setting]: FormControl<Setting[K]> }>;
  listOfData: readonly ItemData[] = [];
  displayData: readonly ItemData[] = [];
  allChecked = false;
  indeterminate = false;
  fixedColumn = false;
  scrollX: string | null = null;
  scrollY: string | null = null;
  settingValue: Setting;
  totalPayment = 0;
  listOfSwitch = [
    { name: 'Bordered', formControlName: 'bordered' },
    { name: 'Loading', formControlName: 'loading' },
    { name: 'Pagination', formControlName: 'pagination' },
    { name: 'PageSizeChanger', formControlName: 'sizeChanger' },
    { name: 'Title', formControlName: 'title' },
    { name: 'Column Header', formControlName: 'header' },
    { name: 'Footer', formControlName: 'footer' },
    { name: 'Expandable', formControlName: 'expandable' },
    { name: 'Checkbox', formControlName: 'checkbox' },
    { name: 'Fixed Header', formControlName: 'fixHeader' },
    { name: 'No Result', formControlName: 'noResult' },
    { name: 'Ellipsis', formControlName: 'ellipsis' },
    { name: 'Simple Pagination', formControlName: 'simple' },
    { name: 'Show Total', formControlName: 'totalPayment' },
  ];

  listOfRadio = [
    {
      name: 'Size',
      formControlName: 'size',
      listOfOption: [
        { value: 'default', label: 'Default' },
        { value: 'middle', label: 'Middle' },
        { value: 'small', label: 'Small' }
      ]
    },
    {
      name: 'Table Scroll',
      formControlName: 'tableScroll',
      listOfOption: [
        { value: 'unset', label: 'Unset' },
        { value: 'scroll', label: 'Scroll' },
        { value: 'fixed', label: 'Fixed' }
      ]
    },
    {
      name: 'Table Layout',
      formControlName: 'tableLayout',
      listOfOption: [
        { value: 'auto', label: 'Auto' },
        { value: 'fixed', label: 'Fixed' }
      ]
    },
    {
      name: 'Pagination Position',
      formControlName: 'position',
      listOfOption: [
        { value: 'top', label: 'Top' },
        { value: 'bottom', label: 'Bottom' },
        { value: 'both', label: 'Both' }
      ]
    },
    {
      name: 'Pagination Type',
      formControlName: 'paginationType',
      listOfOption: [
        { value: 'default', label: 'Default' },
        { value: 'small', label: 'Small' }
      ]
    }
  ];

  currentPageDataChange($event: readonly ItemData[]): void {
    this.displayData = $event;
    this.refreshStatus();
  }

  refreshStatus(): void {
    const validData = this.displayData.filter(value => !value.disabled);
    const allChecked = validData.length > 0 && validData.every(value => value.checked === true);
    const allUnChecked = validData.every(value => !value.checked);
    this.allChecked = allChecked;
    this.indeterminate = !allChecked && !allUnChecked;
  }

  checkAll(value: boolean): void {
    this.displayData.forEach(data => {
      if (!data.disabled) {
        data.checked = value;
      }
    });
    this.refreshStatus();
  }

  constructor(private formBuilder: NonNullableFormBuilder, private productService: ProductService, private roomService:RoomsService) {
    this.settingForm = this.formBuilder.group({
      bordered: [false],
      loading: [false],
      pagination: [true],
      sizeChanger: [false],
      title: [true],
      header: [true],
      footer: [true],
      expandable: [true],
      checkbox: [true],
      fixHeader: [false],
      noResult: [false],
      ellipsis: [false],
      simple: [false],
      totalPayment: [true],
      size: 'small' as NzTableSize,
      paginationType: 'default' as NzTablePaginationType,
      tableScroll: 'unset' as TableScroll,
      tableLayout: 'auto' as NzTableLayout,
      position: 'bottom' as NzTablePaginationPosition
    });
    this.settingValue = this.settingForm.value as Setting;
  }
  ngOnInit(): void {
    this.settingForm.valueChanges.subscribe(value => {
      this.settingValue = value as Setting;
    });

    this.settingForm.controls.tableScroll.valueChanges.subscribe(scroll => {
      this.fixedColumn = scroll === 'fixed';
      this.scrollX = scroll === 'scroll' || scroll === 'fixed' ? '100vw' : null;
    });

    this.settingForm.controls.fixHeader.valueChanges.subscribe(fixed => {
      this.scrollY = fixed ? '240px' : null;
    });

    this.settingForm.controls.noResult.valueChanges.subscribe(empty => {
      if (empty) {
        this.listOfData = [];
      } else {
        this.updateListOfData();
      }
    });

    // Initial update
    this.updateListOfData();
  }

  private updateListOfData(): void {
    this.productService.products$.subscribe(products => {
      const allEvents: any[] = [];
  
      // Flatten the list of events from different room numbers
      products.forEach(product => {
        allEvents.push(...product.events.map((event: any) => ({
          roomNumber: product.roomNumber,
          checkoutTime: event.checkoutTime,
          checkinTime: event.checkinTime,
          payment: event.payment,
          type: event.type,
          expand: false,
          // disabled: false,
          checked: false
        })));
      });
  
      this.calculateTotalPayment();
  
      // Sort all events by checkout time in descending order
      allEvents.sort((a, b) => {
        return new Date(b.checkoutTime).getTime() - new Date(a.checkoutTime).getTime();
      });
  
      const n = allEvents.length;
      // Take the first item (latest checkout) from the sorted list
      const latestCheckout = allEvents[0];
      const nextNCheckouts = allEvents.slice(0, n + 1);
  
      this.listOfData = nextNCheckouts;
      console.log('listOfData',this.listOfData);
      
    });
  }
  


  

  private calculateTotalPayment(): void {
    this.totalPayment = this.listOfData.reduce((sum, room) => {
      const roomPayment = sum + (room.payment || 0);
      return roomPayment;
    }, 0);
  }

  exportToExcel(): void {
    const mutableListOfData = [...this.listOfData];
  // Tiếp tục sử dụng mutableListOfData trong hàm xuất Excel
    this.roomService.exportToExcel(mutableListOfData, 'Danh sách thanh toán phòng', 'sheetName');
  }

  // exportXLS(){
  //   this.exported = true;
  //   this.cameraService.exportExcel(this.cameras,'ttgt-cameras');
  // }
}


