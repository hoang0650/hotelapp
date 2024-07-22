import { NzTableLayout, NzTablePaginationPosition, NzTablePaginationType, NzTableSize } from 'ng-zorro-antd/table';

export interface EventData {
    type: string;
    checkinTime: Date;
    checkoutTime: Date;
    payment: number
  }
  
export interface ItemData {
    roomNumber: number | string;
    checked: boolean;
    expand: boolean;
    disabled: boolean; // Thêm thuộc tính events
    checkoutTime: Date,
    checkinTime: Date,
    payment: number,
    type: string
  }

  export interface RoomHistory{
    roomNumber: number | string;
    events: EventData[];
  }
  
  export interface Setting {
    totalPayment: boolean;
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
    size: NzTableSize;
    tableScroll: TableScroll;
    tableLayout: NzTableLayout;
    position: NzTablePaginationPosition;
    paginationType: NzTablePaginationType;
}

type TableScroll = 'unset' | 'scroll' | 'fixed';