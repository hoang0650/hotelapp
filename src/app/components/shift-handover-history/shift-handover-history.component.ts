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
import * as XLSX from 'xlsx';

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
  _hotelId: string | null = null; // Public để template có thể truy cập
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

  // Helper methods để lấy các giá trị từ room history
  getRoomTotal(room: any): number {
    return room.roomTotal || 0;
  }

  getAdditionalCharges(room: any): number {
    return room.additionalCharges || 0;
  }

  getDiscount(room: any): number {
    return room.discount || 0;
  }

  getServiceAmount(room: any): number {
    return room.serviceAmount || room.serviceTotal || 0;
  }

  getAdvancePayment(room: any): number {
    return room.advancePayment || 0;
  }

  getCheckinTime(room: any): Date | null {
    const checkinTime = room.checkinTime || room.checkInTime;
    return checkinTime ? new Date(checkinTime) : null;
  }

  // Lấy tên khách từ nhiều nguồn
  getGuestSourceLabel(room: any): string {
    const source = room.guestSource || room.guestInfo?.guestSource || 'walkin';
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
    return sourceMap[source] || source;
  }

  getGuestName(room: any): string {
    // Ưu tiên: guestName từ roomHistory
    if (room.guestName) {
      return room.guestName;
    }
    
    // Nếu có bookingId được populate
    if (room.bookingId && typeof room.bookingId === 'object') {
      const booking = room.bookingId;
      if (booking.guestInfo?.name) {
        return booking.guestInfo.name;
      }
      if (booking.customerName) {
        return booking.customerName;
      }
      if (booking.guestName) {
        return booking.guestName;
      }
    }
    
    // Nếu có roomId được populate
    if (room.roomId && typeof room.roomId === 'object') {
      const roomData = room.roomId;
      if (roomData.currentBooking?.guestInfo?.name) {
        return roomData.currentBooking.guestInfo.name;
      }
    }
    
    // Fallback
    return 'Khách lẻ';
  }

  // Xuất Excel lịch sử giao ca
  exportShiftHandoverHistory(): void {
    const currentHotelId = this._hotelId || this.hotelId || this.authService.getHotelId();
    
    if (!currentHotelId) {
      this.message.warning('Không tìm thấy thông tin khách sạn');
      return;
    }

    this.isLoading = true;
    
    // Load tất cả dữ liệu (không phân trang)
    const params: any = {
      hotelId: currentHotelId,
      page: 1,
      limit: 10000 // Lấy tối đa 10000 records
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
          const allRecords = response.data || [];
          
          if (allRecords.length === 0) {
            this.message.warning('Không có dữ liệu để xuất Excel');
            this.isLoading = false;
            return;
          }

          // Chuẩn bị dữ liệu cho Excel
          const excelData = allRecords.map(record => ({
            'Thời gian giao ca': format(new Date(record.handoverTime), 'dd/MM/yyyy HH:mm'),
            'Nhân viên giao': this.getStaffName(record.fromStaffId),
            'Nhân viên nhận': this.getStaffName(record.toStaffId),
            'Tiền ca trước': record.previousShiftAmount || 0,
            'Tiền mặt trong ca': record.cashInShift || 0,
            'Tiền giao quản lý': record.managerHandoverAmount || 0,
            'Số tiền giao ca': record.handoverAmount || 0,
            'Tiền mặt': record.cashAmount || 0,
            'Chuyển khoản': record.bankTransferAmount || 0,
            'Cà thẻ': record.cardPaymentAmount || 0,
            'Phiếu chi': record.expenseAmount || 0,
            'Tổng doanh thu': this.getTotalRevenue(record),
            'Tổng tiền phòng': record.totalRoomRevenue || 0,
            'Trạng thái': this.getStatusLabel(record.status),
            'Ghi chú': record.notes || ''
          }));

          // Tạo worksheet
          const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(excelData);
          const workbook: XLSX.WorkBook = { 
            Sheets: { 'Lịch sử giao ca': worksheet }, 
            SheetNames: ['Lịch sử giao ca'] 
          };

          // Tạo tên file
          const dateStr = format(new Date(), 'ddMMyyyy_HHmmss');
          const fileName = `Lich_su_giao_ca_${dateStr}`;

          // Xuất file
          XLSX.writeFile(workbook, `${fileName}.xlsx`);
          this.message.success(`Đã xuất ${allRecords.length} bản ghi ra file Excel`);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error exporting shift handover history:', error);
          this.message.error('Không thể xuất dữ liệu ra Excel');
          this.isLoading = false;
        }
      })
    );
  }

  // Xuất Excel tổng doanh thu và phiếu chi (gộp tất cả lịch sử phòng và phiếu chi)
  exportRevenueAndExpense(): void {
    const currentHotelId = this._hotelId || this.hotelId || this.authService.getHotelId();
    
    if (!currentHotelId) {
      this.message.warning('Không tìm thấy thông tin khách sạn');
      return;
    }

    this.isLoading = true;
    
    // Load tất cả dữ liệu (không phân trang)
    const params: any = {
      hotelId: currentHotelId,
      page: 1,
      limit: 10000 // Lấy tối đa 10000 records
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
          const allRecords = response.data || [];
          
          if (allRecords.length === 0) {
            this.message.warning('Không có dữ liệu để xuất Excel');
            this.isLoading = false;
            return;
          }

          // Gộp tất cả lịch sử phòng từ tất cả các ca
          const allRoomHistory: any[] = [];
          const allExpenses: any[] = [];

          allRecords.forEach(record => {
            // Thêm lịch sử phòng
            if (record.roomHistory && Array.isArray(record.roomHistory)) {
              record.roomHistory.forEach(room => {
                // Lấy các giá trị từ room object, nếu không có thì để 0
                const roomTotal = (room as any).roomTotal || 0;
                const additionalCharges = (room as any).additionalCharges || 0;
                const discount = (room as any).discount || 0;
                const serviceAmount = (room as any).serviceAmount || (room as any).serviceTotal || 0;
                const advancePayment = (room as any).advancePayment || 0;
                const checkinTime = (room as any).checkinTime || (room as any).checkInTime || null;
                
                allRoomHistory.push({
                  'Thời gian giao ca': format(new Date(record.handoverTime), 'dd/MM/yyyy HH:mm'),
                  'Phòng': room.roomNumber || '',
                  'Tên khách': this.getGuestName(room),
                  'Nguồn': this.getGuestSourceLabel(room),
                  'Hành động': room.action || '',
                  'Tiền phòng': roomTotal,
                  'Phụ thu': additionalCharges,
                  'Khuyến mãi': discount,
                  'Tiền dịch vụ': serviceAmount,
                  'Tiền đặt trước': advancePayment,
                  'Số tiền': room.amount || 0,
                  'Hình thức thanh toán': room.paymentMethod === 'cash' ? 'Tiền mặt' : 
                  room.paymentMethod === 'bank_transfer' ? 'Chuyển khoản' : 
                  room.paymentMethod === 'card' ? 'Thẻ' : 'Khác',
                  'Nhận phòng': checkinTime ? format(new Date(checkinTime), 'dd/MM/yyyy HH:mm') : '',
                  'Trả phòng': format(new Date(room.timestamp), 'dd/MM/yyyy HH:mm'),
                  'Ghi chú': room.notes || ''
                });
              });
            }

            // Thêm phiếu chi
            if (record.expenses && Array.isArray(record.expenses)) {
              record.expenses.forEach(expense => {
                allExpenses.push({
                  'Thời gian giao ca': format(new Date(record.handoverTime), 'dd/MM/yyyy HH:mm'),
                  'Mô tả': expense.description || 'Phiếu chi',
                  'Danh mục': this.getExpenseCategoryLabel(expense.category),
                  'Người nhận': expense.recipient || '',
                  'Số tiền': expense.amount || 0,
                  'Hình thức thanh toán': expense.method === 'cash' ? 'Tiền mặt' : 
                                          expense.method === 'bank_transfer' ? 'Chuyển khoản' : 
                                          expense.method === 'card' ? 'Thẻ' : 'Khác',
                  'Thời gian': format(new Date(expense.timestamp), 'dd/MM/yyyy HH:mm'),
                  'Người duyệt': expense.approvedBy || ''
                });
              });
            }
          });

          // Tạo workbook với nhiều sheets
          const workbook: XLSX.WorkBook = {
            Sheets: {},
            SheetNames: []
          };

          // Sheet 1: Tổng hợp doanh thu
          const summaryData = [{
            'Tổng số ca': allRecords.length,
            'Tổng tiền ca trước': allRecords.reduce((sum, r) => sum + (r.previousShiftAmount || 0), 0),
            'Tổng tiền mặt trong ca': allRecords.reduce((sum, r) => sum + (r.cashInShift || 0), 0),
            'Tổng tiền giao quản lý': allRecords.reduce((sum, r) => sum + (r.managerHandoverAmount || 0), 0),
            'Tổng số tiền giao ca': allRecords.reduce((sum, r) => sum + (r.handoverAmount || 0), 0),
            'Tổng tiền mặt': allRecords.reduce((sum, r) => sum + (r.cashAmount || 0), 0),
            'Tổng chuyển khoản': allRecords.reduce((sum, r) => sum + (r.bankTransferAmount || 0), 0),
            'Tổng cà thẻ': allRecords.reduce((sum, r) => sum + (r.cardPaymentAmount || 0), 0),
            'Tổng phiếu chi': allRecords.reduce((sum, r) => sum + (r.expenseAmount || 0), 0),
            'Tổng doanh thu': allRecords.reduce((sum, r) => sum + this.getTotalRevenue(r), 0),
            'Tổng tiền phòng': allRecords.reduce((sum, r) => sum + (r.totalRoomRevenue || 0), 0)
          }];
          workbook.Sheets['Tổng hợp'] = XLSX.utils.json_to_sheet(summaryData);
          workbook.SheetNames.push('Tổng hợp');

          // Sheet 2: Lịch sử phòng
          if (allRoomHistory.length > 0) {
            workbook.Sheets['Lịch sử phòng'] = XLSX.utils.json_to_sheet(allRoomHistory);
            workbook.SheetNames.push('Lịch sử phòng');
          }

          // Sheet 3: Phiếu chi
          if (allExpenses.length > 0) {
            workbook.Sheets['Phiếu chi'] = XLSX.utils.json_to_sheet(allExpenses);
            workbook.SheetNames.push('Phiếu chi');
          }

          // Tạo tên file
          const dateStr = format(new Date(), 'ddMMyyyy_HHmmss');
          const fileName = `Tong_doanh_thu_va_phiếu_chi_${dateStr}`;

          // Xuất file
          XLSX.writeFile(workbook, `${fileName}.xlsx`);
          this.message.success(`Đã xuất dữ liệu: ${allRoomHistory.length} lịch sử phòng, ${allExpenses.length} phiếu chi`);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error exporting revenue and expense:', error);
          this.message.error('Không thể xuất dữ liệu ra Excel');
          this.isLoading = false;
        }
      })
    );
  }
}

