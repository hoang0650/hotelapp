import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Subscription } from 'rxjs';
import { ShiftHandoverService } from '../../services/shift-handover.service';
import { AuthService } from '../../services/auth.service';
import { 
  ShiftHandover, 
  ShiftHandoverHistoryResponse
} from '../../interfaces/shift-handover';
import { format } from 'date-fns';

@Component({
  selector: 'app-shift-handover-history',
  templateUrl: './shift-handover-history.component.html',
  styleUrls: ['./shift-handover-history.component.css']
})
export class ShiftHandoverHistoryComponent implements OnInit, OnDestroy, OnChanges {
  @Input() hotelId: string | null = null;
  
  private subscriptions = new Subscription();
  
  // Data
  shiftHistory: ShiftHandover[] = [];
  isLoading = false;
  
  // Filters
  private _hotelId: string | null = null;
  startDate: Date | null = null;
  endDate: Date | null = null;
  dateRange: [Date, Date] | null = null;
  
  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalItems = 0;
  
  // Selected record for detail view
  selectedRecord: ShiftHandover | null = null;
  isDetailModalVisible = false;
  
  constructor(
    private shiftHandoverService: ShiftHandoverService,
    private authService: AuthService,
    private message: NzMessageService
  ) {}
  
  ngOnInit(): void {
    // Khởi tạo _hotelId từ @Input hoặc authService
    this._hotelId = this.hotelId || this.authService.getHotelId();
    
    // Load dữ liệu nếu đã có hotelId
    if (this._hotelId) {
      this.loadShiftHistory();
    }
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    // Khi hotelId thay đổi từ @Input, cập nhật và reload
    if (changes['hotelId']) {
      const newHotelId = changes['hotelId'].currentValue || this.authService.getHotelId();
      
      // Chỉ reload nếu hotelId thực sự thay đổi và có giá trị
      if (newHotelId && newHotelId !== this._hotelId) {
        this._hotelId = newHotelId;
        this.currentPage = 1;
        this.loadShiftHistory();
      } else if (newHotelId && !this._hotelId) {
        // Nếu lần đầu có giá trị từ @Input
        this._hotelId = newHotelId;
        this.currentPage = 1;
        this.loadShiftHistory();
      }
    }
  }
  
  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
  
  loadShiftHistory(): void {
    // Sử dụng _hotelId hoặc hotelId hoặc lấy từ authService
    const currentHotelId = this._hotelId || this.hotelId || this.authService.getHotelId();
    
    if (!currentHotelId) {
      this.message.warning('Không tìm thấy thông tin khách sạn');
      this.isLoading = false;
      return;
    }
    
    this.isLoading = true;
    
    const params: any = {
      hotelId: currentHotelId,
      page: this.currentPage,
      limit: this.pageSize
    };
    
    if (this.startDate) {
      params.startDate = format(this.startDate, 'yyyy-MM-dd');
    }
    
    if (this.endDate) {
      params.endDate = format(this.endDate, 'yyyy-MM-dd');
    }
    
      this.subscriptions.add(
      this.shiftHandoverService.getShiftHandoverHistory(params).subscribe({
        next: (response: ShiftHandoverHistoryResponse) => {
          this.shiftHistory = response.data || [];
          this.totalItems = response.pagination?.totalItems || 0;
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading shift history:', error);
          this.message.error('Không thể tải lịch sử giao ca');
          this.isLoading = false;
        }
      })
    );
  }
  
  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadShiftHistory();
  }
  
  onFilterChange(): void {
    this.currentPage = 1;
    this.loadShiftHistory();
  }
  
  viewDetail(record: ShiftHandover): void {
    this.selectedRecord = record;
    this.isDetailModalVisible = true;
  }
  
  closeDetailModal(): void {
    this.isDetailModalVisible = false;
    this.selectedRecord = null;
  }
  
  resetFilters(): void {
    this.startDate = null;
    this.endDate = null;
    this.currentPage = 1;
    this.loadShiftHistory();
  }
  
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount || 0);
  }
  
  formatDate(date: Date | string | undefined): string {
    if (!date) return 'N/A';
    return format(new Date(date), 'dd/MM/yyyy HH:mm');
  }
  
  getStaffName(staff: any): string {
    if (!staff) return 'N/A';
    if (typeof staff === 'string') return staff;
    const firstName = staff.personalInfo?.firstName || '';
    const lastName = staff.personalInfo?.lastName || '';
    return `${firstName} ${lastName}`.trim() || staff.username || 'N/A';
  }
  
  getStatusColor(status: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'orange',
      'confirmed': 'green',
      'rejected': 'red',
      'cancelled': 'default'
    };
    return statusMap[status] || 'default';
  }
  
  getStatusLabel(status: string): string {
    const labelMap: Record<string, string> = {
      'pending': 'Chờ xác nhận',
      'confirmed': 'Đã xác nhận',
      'rejected': 'Đã từ chối',
      'cancelled': 'Đã hủy'
    };
    return labelMap[status] || status;
  }
  
  getExpenseCategoryLabel(category: string | undefined): string {
    if (!category) return 'Khác';
    const labelMap: Record<string, string> = {
      'supplies': 'Vật tư',
      'utilities': 'Tiện ích',
      'salary': 'Lương',
      'maintenance': 'Bảo trì',
      'marketing': 'Marketing',
      'other': 'Khác'
    };
    return labelMap[category] || category || 'Khác';
  }
  
  getExpenseCategoryColor(category: string | undefined): string {
    if (!category) return 'default';
    const colorMap: Record<string, string> = {
      'supplies': 'orange',
      'utilities': 'blue',
      'salary': 'purple',
      'maintenance': 'cyan',
      'marketing': 'green',
      'other': 'default'
    };
    return colorMap[category] || 'default';
  }

  // Tính tổng doanh thu = Tiền giao quản lý + Phiếu chi
  getTotalRevenue(record: ShiftHandover): number {
    const managerHandoverAmount = record.managerHandoverAmount || 0;
    const expenseAmount = record.expenseAmount || 0;
    return managerHandoverAmount + expenseAmount;
  }
}

