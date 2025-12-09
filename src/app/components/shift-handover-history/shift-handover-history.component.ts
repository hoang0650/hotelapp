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

  getIncomeCategoryLabel(category: string | undefined): string {
    if (!category) return 'Khác';
    const labelMap: Record<string, string> = {
      'room_rental': 'Tiền phòng',
      'service': 'Dịch vụ',
      'deposit': 'Tiền cọc',
      'other': 'Khác'
    };
    return labelMap[category] || category || 'Khác';
  }

  getIncomeCategoryColor(category: string | undefined): string {
    if (!category) return 'default';
    const colorMap: Record<string, string> = {
      'room_rental': 'blue',
      'service': 'green',
      'deposit': 'orange',
      'other': 'default'
    };
    return colorMap[category] || 'default';
  }

  // Tính tổng doanh thu = Tiền giao quản lý + Phiếu thu - Phiếu chi
  getTotalRevenue(record: ShiftHandover): number {
    const managerHandoverAmount = record.managerHandoverAmount || 0;
    const incomeAmount = record.incomeAmount || 0;
    const expenseAmount = record.expenseAmount || 0;
    return managerHandoverAmount + incomeAmount - expenseAmount;
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

  // Lấy guestSource từ nhiều nguồn
  getGuestSource(room: any): string {
    // Ưu tiên lấy từ nhiều nguồn theo thứ tự
    let source = 'walkin';
    
    // Ưu tiên 1: Từ room.guestSource (đã được backend optimize)
    if (room.guestSource) {
      source = room.guestSource;
    }
    // Ưu tiên 2: Từ room.guestInfo.guestSource
    else if (room.guestInfo?.guestSource) {
      source = room.guestInfo.guestSource;
    }
    // Ưu tiên 3: Từ room.event?.guestInfo?.guestSource (nếu có event)
    else if (room.event?.guestInfo?.guestSource) {
      source = room.event.guestInfo.guestSource;
    }
    // Ưu tiên 4: Từ room.bookingId?.guestSource hoặc bookingId?.guestInfo?.guestSource
    else if (room.bookingId) {
      if (typeof room.bookingId === 'object') {
        source = room.bookingId.guestSource || 
                 room.bookingId.guestInfo?.guestSource || 
                 room.bookingId.guestDetails?.guestSource || 
                 'walkin';
      }
    }
    
    return source;
  }

  // Lấy label cho nguồn khách
  getGuestSourceLabel(room: any): string {
    const source = this.getGuestSource(room);
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

  // Lấy màu cho nguồn khách
  getGuestSourceColor(room: any): string {
    const source = this.getGuestSource(room);
    const colorMap: { [key: string]: string } = {
      'walkin': 'default',
      'booking': 'blue',
      'agoda': 'orange',
      'traveloka': 'green',
      'expedia': 'purple',
      'trip': 'cyan',
      'g2j': 'magenta',
      'other': 'geekblue'
    };
    return colorMap[source] || 'default';
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
            'Phiếu thu': record.incomeAmount || 0,
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
          const allIncomes: any[] = [];

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

            // Thêm phiếu thu
            if (record.incomes && Array.isArray(record.incomes)) {
              record.incomes.forEach(income => {
                allIncomes.push({
                  'Thời gian giao ca': format(new Date(record.handoverTime), 'dd/MM/yyyy HH:mm'),
                  'Mô tả': income.description || 'Phiếu thu',
                  'Danh mục': this.getIncomeCategoryLabel(income.category),
                  'Người nộp': income.source || '',
                  'Số tiền': income.amount || 0,
                  'Hình thức thanh toán': income.method === 'cash' ? 'Tiền mặt' : 
                                          income.method === 'bank_transfer' ? 'Chuyển khoản' : 
                                          income.method === 'card' ? 'Thẻ' : 'Khác',
                  'Thời gian': format(new Date(income.timestamp), 'dd/MM/yyyy HH:mm'),
                  'Người duyệt': income.approvedBy || ''
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
            'Tổng phiếu thu': allRecords.reduce((sum, r) => sum + (r.incomeAmount || 0), 0),
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

          // Sheet 4: Phiếu thu
          if (allIncomes.length > 0) {
            workbook.Sheets['Phiếu thu'] = XLSX.utils.json_to_sheet(allIncomes);
            workbook.SheetNames.push('Phiếu thu');
          }

          // Tạo tên file
          const dateStr = format(new Date(), 'ddMMyyyy_HHmmss');
          const fileName = `Tong_doanh_thu_phiếu_chi_va_phiếu_thu_${dateStr}`;

          // Xuất file
          XLSX.writeFile(workbook, `${fileName}.xlsx`);
          this.message.success(`Đã xuất dữ liệu: ${allRoomHistory.length} lịch sử phòng, ${allExpenses.length} phiếu chi, ${allIncomes.length} phiếu thu`);
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

  // Helper function để lấy tháng/quý/năm từ date
  private getMonthYear(date: Date): { year: number; month: number } {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1
    };
  }

  private getQuarter(date: Date): { year: number; quarter: number } {
    const month = date.getMonth() + 1;
    return {
      year: date.getFullYear(),
      quarter: Math.ceil(month / 3)
    };
  }

  private getYear(date: Date): number {
    return date.getFullYear();
  }

  // Xuất Excel doanh thu theo tháng
  exportRevenueByMonth(): void {
    this.exportRevenueByPeriod('month');
  }

  // Xuất Excel doanh thu theo quý
  exportRevenueByQuarter(): void {
    this.exportRevenueByPeriod('quarter');
  }

  // Xuất Excel doanh thu theo năm
  exportRevenueByYear(): void {
    this.exportRevenueByPeriod('year');
  }

  // Xuất Excel phiếu chi theo tháng
  exportExpenseByMonth(): void {
    this.exportExpenseByPeriod('month');
  }

  // Xuất Excel phiếu chi theo quý
  exportExpenseByQuarter(): void {
    this.exportExpenseByPeriod('quarter');
  }

  // Xuất Excel phiếu chi theo năm
  exportExpenseByYear(): void {
    this.exportExpenseByPeriod('year');
  }

  // Xuất Excel phiếu thu theo tháng
  exportIncomeByMonth(): void {
    this.exportIncomeByPeriod('month');
  }

  // Xuất Excel phiếu thu theo quý
  exportIncomeByQuarter(): void {
    this.exportIncomeByPeriod('quarter');
  }

  // Xuất Excel phiếu thu theo năm
  exportIncomeByYear(): void {
    this.exportIncomeByPeriod('year');
  }

  // Xuất Excel tổng hợp (doanh thu + phiếu chi + phiếu thu) theo tháng
  exportCombinedByMonth(): void {
    this.exportCombinedByPeriod('month');
  }

  // Xuất Excel tổng hợp (doanh thu + phiếu chi) theo quý
  exportCombinedByQuarter(): void {
    this.exportCombinedByPeriod('quarter');
  }

  // Xuất Excel tổng hợp (doanh thu + phiếu chi) theo năm
  exportCombinedByYear(): void {
    this.exportCombinedByPeriod('year');
  }

  // Xuất Excel doanh thu theo kỳ (tháng/quý/năm)
  private exportRevenueByPeriod(period: 'month' | 'quarter' | 'year'): void {
    const currentHotelId = this._hotelId || this.hotelId || this.authService.getHotelId();
    
    if (!currentHotelId) {
      this.message.warning('Không tìm thấy thông tin khách sạn');
      return;
    }

    this.isLoading = true;
    
    // Load tất cả dữ liệu
    const params: any = {
      hotelId: currentHotelId,
      page: 1,
      limit: 10000
    };

    this.subscriptions.add(
      this.shiftHandoverService.getShiftHandoverHistory(params).subscribe({
        next: (response: ShiftHandoverHistoryResponse) => {
          const allRecords = response.data || [];
          
          if (allRecords.length === 0) {
            this.message.warning('Không có dữ liệu để xuất Excel');
            this.isLoading = false;
            return;
          }

          // Gộp tất cả lịch sử phòng và phiếu thu, nhóm theo kỳ
          const revenueByPeriod: { [key: string]: any[] } = {};
          const incomeByPeriod: { [key: string]: any[] } = {};

          allRecords.forEach(record => {
            // Xử lý lịch sử phòng
            if (record.roomHistory && Array.isArray(record.roomHistory)) {
              record.roomHistory.forEach(room => {
                const handoverDate = new Date(record.handoverTime);
                let periodKey = '';

                if (period === 'month') {
                  const { year, month } = this.getMonthYear(handoverDate);
                  periodKey = `${year}-${String(month).padStart(2, '0')}`;
                } else if (period === 'quarter') {
                  const { year, quarter } = this.getQuarter(handoverDate);
                  periodKey = `${year}-Q${quarter}`;
                } else {
                  const year = this.getYear(handoverDate);
                  periodKey = String(year);
                }

                if (!revenueByPeriod[periodKey]) {
                  revenueByPeriod[periodKey] = [];
                }

                const roomTotal = (room as any).roomTotal || 0;
                const additionalCharges = (room as any).additionalCharges || 0;
                const discount = (room as any).discount || 0;
                const serviceAmount = (room as any).serviceAmount || (room as any).serviceTotal || 0;
                const advancePayment = (room as any).advancePayment || 0;
                const checkinTime = (room as any).checkinTime || (room as any).checkInTime || null;

                revenueByPeriod[periodKey].push({
                  'Kỳ': periodKey,
                  'Thời gian giao ca': format(new Date(record.handoverTime), 'dd/MM/yyyy HH:mm'),
                  'Phòng': room.roomNumber || '',
                  'Tên khách': this.getGuestName(room),
                  'Nguồn': this.getGuestSourceLabel(room),
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

            // Xử lý phiếu thu
            if (record.incomes && Array.isArray(record.incomes)) {
              record.incomes.forEach(income => {
                const handoverDate = new Date(record.handoverTime);
                let periodKey = '';

                if (period === 'month') {
                  const { year, month } = this.getMonthYear(handoverDate);
                  periodKey = `${year}-${String(month).padStart(2, '0')}`;
                } else if (period === 'quarter') {
                  const { year, quarter } = this.getQuarter(handoverDate);
                  periodKey = `${year}-Q${quarter}`;
                } else {
                  const year = this.getYear(handoverDate);
                  periodKey = String(year);
                }

                if (!incomeByPeriod[periodKey]) {
                  incomeByPeriod[periodKey] = [];
                }

                incomeByPeriod[periodKey].push({
                  'Kỳ': periodKey,
                  'Thời gian giao ca': format(new Date(record.handoverTime), 'dd/MM/yyyy HH:mm'),
                  'Mô tả': income.description || 'Phiếu thu',
                  'Danh mục': this.getIncomeCategoryLabel(income.category),
                  'Người nộp': income.source || '',
                  'Số tiền': income.amount || 0,
                  'Hình thức thanh toán': income.method === 'cash' ? 'Tiền mặt' : 
                                          income.method === 'bank_transfer' ? 'Chuyển khoản' : 
                                          income.method === 'card' ? 'Thẻ' : 'Khác',
                  'Thời gian': format(new Date(income.timestamp), 'dd/MM/yyyy HH:mm'),
                  'Người duyệt': income.approvedBy || ''
                });
              });
            }
          });

          // Tạo workbook với nhiều sheets (mỗi kỳ một sheet)
          const workbook: XLSX.WorkBook = {
            Sheets: {},
            SheetNames: []
          };

          // Lấy tất cả các kỳ (union của revenue và income periods)
          const allPeriods = new Set([
            ...Object.keys(revenueByPeriod),
            ...Object.keys(incomeByPeriod)
          ]);
          const sortedPeriods = Array.from(allPeriods).sort();

          // Tạo sheet tổng hợp
          const summaryData: any[] = [];

          sortedPeriods.forEach(periodKey => {
            const rooms = revenueByPeriod[periodKey] || [];
            const incomes = incomeByPeriod[periodKey] || [];
            const totalRevenue = rooms.reduce((sum, r) => sum + (r['Số tiền'] || 0), 0);
            const totalRoom = rooms.reduce((sum, r) => sum + (r['Tiền phòng'] || 0), 0);
            const totalService = rooms.reduce((sum, r) => sum + (r['Tiền dịch vụ'] || 0), 0);
            const totalAdditional = rooms.reduce((sum, r) => sum + (r['Phụ thu'] || 0), 0);
            const totalDiscount = rooms.reduce((sum, r) => sum + (r['Khuyến mãi'] || 0), 0);
            const totalIncome = incomes.reduce((sum, i) => sum + (i['Số tiền'] || 0), 0);

            summaryData.push({
              'Kỳ': periodKey,
              'Số phòng': rooms.length,
              'Tổng tiền phòng': totalRoom,
              'Tổng tiền dịch vụ': totalService,
              'Tổng phụ thu': totalAdditional,
              'Tổng khuyến mãi': totalDiscount,
              'Tổng doanh thu phòng': totalRevenue,
              'Số phiếu thu': incomes.length,
              'Tổng phiếu thu': totalIncome,
              'Tổng doanh thu': totalRevenue + totalIncome
            });
          });

          workbook.Sheets['Tổng hợp'] = XLSX.utils.json_to_sheet(summaryData);
          workbook.SheetNames.push('Tổng hợp');

          // Tạo sheet cho mỗi kỳ (doanh thu và phiếu thu)
          sortedPeriods.forEach(periodKey => {
            const periodLabel = period === 'month' ? `Tháng ${periodKey}` :
                               period === 'quarter' ? `Quý ${periodKey}` :
                               `Năm ${periodKey}`;
            
            // Sheet doanh thu cho kỳ này
            if (revenueByPeriod[periodKey] && revenueByPeriod[periodKey].length > 0) {
              workbook.Sheets[`${periodLabel} - Doanh thu`] = XLSX.utils.json_to_sheet(revenueByPeriod[periodKey]);
              workbook.SheetNames.push(`${periodLabel} - Doanh thu`);
            }

            // Sheet phiếu thu cho kỳ này
            if (incomeByPeriod[periodKey] && incomeByPeriod[periodKey].length > 0) {
              workbook.Sheets[`${periodLabel} - Phiếu thu`] = XLSX.utils.json_to_sheet(incomeByPeriod[periodKey]);
              workbook.SheetNames.push(`${periodLabel} - Phiếu thu`);
            }
          });

          // Tạo tên file
          const dateStr = format(new Date(), 'ddMMyyyy_HHmmss');
          const periodLabel = period === 'month' ? 'theo_thang' :
                            period === 'quarter' ? 'theo_quy' :
                            'theo_nam';
          const fileName = `Doanh_thu_${periodLabel}_${dateStr}`;

          // Xuất file
          XLSX.writeFile(workbook, `${fileName}.xlsx`);
          this.message.success(`Đã xuất doanh thu ${periodLabel.replace('_', ' ')}`);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error exporting revenue by period:', error);
          this.message.error('Không thể xuất dữ liệu ra Excel');
          this.isLoading = false;
        }
      })
    );
  }

  // Xuất Excel phiếu chi theo kỳ (tháng/quý/năm)
  private exportExpenseByPeriod(period: 'month' | 'quarter' | 'year'): void {
    const currentHotelId = this._hotelId || this.hotelId || this.authService.getHotelId();
    
    if (!currentHotelId) {
      this.message.warning('Không tìm thấy thông tin khách sạn');
      return;
    }

    this.isLoading = true;
    
    // Load tất cả dữ liệu
    const params: any = {
      hotelId: currentHotelId,
      page: 1,
      limit: 10000
    };

    this.subscriptions.add(
      this.shiftHandoverService.getShiftHandoverHistory(params).subscribe({
        next: (response: ShiftHandoverHistoryResponse) => {
          const allRecords = response.data || [];
          
          if (allRecords.length === 0) {
            this.message.warning('Không có dữ liệu để xuất Excel');
            this.isLoading = false;
            return;
          }

          // Gộp tất cả phiếu chi và nhóm theo kỳ
          const expenseByPeriod: { [key: string]: any[] } = {};

          allRecords.forEach(record => {
            if (record.expenses && Array.isArray(record.expenses)) {
              record.expenses.forEach(expense => {
                const expenseDate = new Date(expense.timestamp);
                let periodKey = '';

                if (period === 'month') {
                  const { year, month } = this.getMonthYear(expenseDate);
                  periodKey = `${year}-${String(month).padStart(2, '0')}`;
                } else if (period === 'quarter') {
                  const { year, quarter } = this.getQuarter(expenseDate);
                  periodKey = `${year}-Q${quarter}`;
                } else {
                  const year = this.getYear(expenseDate);
                  periodKey = String(year);
                }

                if (!expenseByPeriod[periodKey]) {
                  expenseByPeriod[periodKey] = [];
                }

                expenseByPeriod[periodKey].push({
                  'Kỳ': periodKey,
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

          // Tạo workbook với nhiều sheets (mỗi kỳ một sheet)
          const workbook: XLSX.WorkBook = {
            Sheets: {},
            SheetNames: []
          };

          // Tạo sheet tổng hợp
          const summaryData: any[] = [];
          const sortedPeriods = Object.keys(expenseByPeriod).sort();

          sortedPeriods.forEach(periodKey => {
            const expenses = expenseByPeriod[periodKey];
            const totalExpense = expenses.reduce((sum, e) => sum + (e['Số tiền'] || 0), 0);
            const totalCash = expenses.filter(e => e['Hình thức thanh toán'] === 'Tiền mặt')
                                     .reduce((sum, e) => sum + (e['Số tiền'] || 0), 0);
            const totalTransfer = expenses.filter(e => e['Hình thức thanh toán'] === 'Chuyển khoản')
                                         .reduce((sum, e) => sum + (e['Số tiền'] || 0), 0);
            const totalCard = expenses.filter(e => e['Hình thức thanh toán'] === 'Thẻ')
                                     .reduce((sum, e) => sum + (e['Số tiền'] || 0), 0);

            summaryData.push({
              'Kỳ': periodKey,
              'Số phiếu chi': expenses.length,
              'Tổng tiền mặt': totalCash,
              'Tổng chuyển khoản': totalTransfer,
              'Tổng cà thẻ': totalCard,
              'Tổng phiếu chi': totalExpense
            });
          });

          workbook.Sheets['Tổng hợp'] = XLSX.utils.json_to_sheet(summaryData);
          workbook.SheetNames.push('Tổng hợp');

          // Tạo sheet cho mỗi kỳ
          sortedPeriods.forEach(periodKey => {
            const periodLabel = period === 'month' ? `Tháng ${periodKey}` :
                               period === 'quarter' ? `Quý ${periodKey}` :
                               `Năm ${periodKey}`;
            workbook.Sheets[periodLabel] = XLSX.utils.json_to_sheet(expenseByPeriod[periodKey]);
            workbook.SheetNames.push(periodLabel);
          });

          // Tạo tên file
          const dateStr = format(new Date(), 'ddMMyyyy_HHmmss');
          const periodLabel = period === 'month' ? 'theo_thang' :
                            period === 'quarter' ? 'theo_quy' :
                            'theo_nam';
          const fileName = `Phieu_chi_${periodLabel}_${dateStr}`;

          // Xuất file
          XLSX.writeFile(workbook, `${fileName}.xlsx`);
          this.message.success(`Đã xuất phiếu chi ${periodLabel.replace('_', ' ')}`);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error exporting expense by period:', error);
          this.message.error('Không thể xuất dữ liệu ra Excel');
          this.isLoading = false;
        }
      })
    );
  }

  // Xuất Excel phiếu thu theo kỳ (tháng/quý/năm)
  private exportIncomeByPeriod(period: 'month' | 'quarter' | 'year'): void {
    const currentHotelId = this._hotelId || this.hotelId || this.authService.getHotelId();
    
    if (!currentHotelId) {
      this.message.warning('Không tìm thấy thông tin khách sạn');
      return;
    }

    this.isLoading = true;
    
    // Load tất cả dữ liệu
    const params: any = {
      hotelId: currentHotelId,
      page: 1,
      limit: 10000
    };

    this.subscriptions.add(
      this.shiftHandoverService.getShiftHandoverHistory(params).subscribe({
        next: (response: ShiftHandoverHistoryResponse) => {
          const allRecords = response.data || [];
          
          if (allRecords.length === 0) {
            this.message.warning('Không có dữ liệu để xuất Excel');
            this.isLoading = false;
            return;
          }

          // Gộp tất cả phiếu thu và nhóm theo kỳ
          const incomeByPeriod: { [key: string]: any[] } = {};

          allRecords.forEach(record => {
            if (record.incomes && Array.isArray(record.incomes)) {
              record.incomes.forEach(income => {
                const incomeDate = new Date(income.timestamp);
                let periodKey = '';

                if (period === 'month') {
                  const { year, month } = this.getMonthYear(incomeDate);
                  periodKey = `${year}-${String(month).padStart(2, '0')}`;
                } else if (period === 'quarter') {
                  const { year, quarter } = this.getQuarter(incomeDate);
                  periodKey = `${year}-Q${quarter}`;
                } else {
                  const year = this.getYear(incomeDate);
                  periodKey = String(year);
                }

                if (!incomeByPeriod[periodKey]) {
                  incomeByPeriod[periodKey] = [];
                }

                incomeByPeriod[periodKey].push({
                  'Kỳ': periodKey,
                  'Thời gian giao ca': format(new Date(record.handoverTime), 'dd/MM/yyyy HH:mm'),
                  'Mô tả': income.description || 'Phiếu thu',
                  'Danh mục': this.getIncomeCategoryLabel(income.category),
                  'Người nộp': income.source || '',
                  'Số tiền': income.amount || 0,
                  'Hình thức thanh toán': income.method === 'cash' ? 'Tiền mặt' : 
                                          income.method === 'bank_transfer' ? 'Chuyển khoản' : 
                                          income.method === 'card' ? 'Thẻ' : 'Khác',
                  'Thời gian': format(new Date(income.timestamp), 'dd/MM/yyyy HH:mm'),
                  'Người duyệt': income.approvedBy || ''
                });
              });
            }
          });

          // Tạo workbook với nhiều sheets (mỗi kỳ một sheet)
          const workbook: XLSX.WorkBook = {
            Sheets: {},
            SheetNames: []
          };

          // Tạo sheet tổng hợp
          const summaryData: any[] = [];
          const sortedPeriods = Object.keys(incomeByPeriod).sort();

          sortedPeriods.forEach(periodKey => {
            const incomes = incomeByPeriod[periodKey];
            const totalIncome = incomes.reduce((sum, i) => sum + (i['Số tiền'] || 0), 0);
            const totalCash = incomes.filter(i => i['Hình thức thanh toán'] === 'Tiền mặt')
                                     .reduce((sum, i) => sum + (i['Số tiền'] || 0), 0);
            const totalTransfer = incomes.filter(i => i['Hình thức thanh toán'] === 'Chuyển khoản')
                                         .reduce((sum, i) => sum + (i['Số tiền'] || 0), 0);
            const totalCard = incomes.filter(i => i['Hình thức thanh toán'] === 'Thẻ')
                                     .reduce((sum, i) => sum + (i['Số tiền'] || 0), 0);

            summaryData.push({
              'Kỳ': periodKey,
              'Số phiếu thu': incomes.length,
              'Tổng tiền mặt': totalCash,
              'Tổng chuyển khoản': totalTransfer,
              'Tổng cà thẻ': totalCard,
              'Tổng phiếu thu': totalIncome
            });
          });

          workbook.Sheets['Tổng hợp'] = XLSX.utils.json_to_sheet(summaryData);
          workbook.SheetNames.push('Tổng hợp');

          // Tạo sheet cho mỗi kỳ
          sortedPeriods.forEach(periodKey => {
            const periodLabel = period === 'month' ? `Tháng ${periodKey}` :
                               period === 'quarter' ? `Quý ${periodKey}` :
                               `Năm ${periodKey}`;
            workbook.Sheets[periodLabel] = XLSX.utils.json_to_sheet(incomeByPeriod[periodKey]);
            workbook.SheetNames.push(periodLabel);
          });

          // Tạo tên file
          const dateStr = format(new Date(), 'ddMMyyyy_HHmmss');
          const periodLabel = period === 'month' ? 'theo_thang' :
                            period === 'quarter' ? 'theo_quy' :
                            'theo_nam';
          const fileName = `Phieu_thu_${periodLabel}_${dateStr}`;

          // Xuất file
          XLSX.writeFile(workbook, `${fileName}.xlsx`);
          this.message.success(`Đã xuất phiếu thu ${periodLabel.replace('_', ' ')}`);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error exporting income by period:', error);
          this.message.error('Không thể xuất dữ liệu ra Excel');
          this.isLoading = false;
        }
      })
    );
  }

  // Xuất Excel tổng hợp (doanh thu + phiếu chi + phiếu thu) theo kỳ (tháng/quý/năm)
  private exportCombinedByPeriod(period: 'month' | 'quarter' | 'year'): void {
    const currentHotelId = this._hotelId || this.hotelId || this.authService.getHotelId();
    
    if (!currentHotelId) {
      this.message.warning('Không tìm thấy thông tin khách sạn');
      return;
    }

    this.isLoading = true;
    
    // Load tất cả dữ liệu
    const params: any = {
      hotelId: currentHotelId,
      page: 1,
      limit: 10000
    };

    this.subscriptions.add(
      this.shiftHandoverService.getShiftHandoverHistory(params).subscribe({
        next: (response: ShiftHandoverHistoryResponse) => {
          const allRecords = response.data || [];
          
          if (allRecords.length === 0) {
            this.message.warning('Không có dữ liệu để xuất Excel');
            this.isLoading = false;
            return;
          }

          // Gộp tất cả lịch sử phòng, phiếu chi và phiếu thu, nhóm theo kỳ
          const revenueByPeriod: { [key: string]: any[] } = {};
          const expenseByPeriod: { [key: string]: any[] } = {};
          const incomeByPeriod: { [key: string]: any[] } = {};

          allRecords.forEach(record => {
            // Xử lý lịch sử phòng
            if (record.roomHistory && Array.isArray(record.roomHistory)) {
              record.roomHistory.forEach(room => {
                const handoverDate = new Date(record.handoverTime);
                let periodKey = '';

                if (period === 'month') {
                  const { year, month } = this.getMonthYear(handoverDate);
                  periodKey = `${year}-${String(month).padStart(2, '0')}`;
                } else if (period === 'quarter') {
                  const { year, quarter } = this.getQuarter(handoverDate);
                  periodKey = `${year}-Q${quarter}`;
                } else {
                  const year = this.getYear(handoverDate);
                  periodKey = String(year);
                }

                if (!revenueByPeriod[periodKey]) {
                  revenueByPeriod[periodKey] = [];
                }

                const roomTotal = (room as any).roomTotal || 0;
                const additionalCharges = (room as any).additionalCharges || 0;
                const discount = (room as any).discount || 0;
                const serviceAmount = (room as any).serviceAmount || (room as any).serviceTotal || 0;
                const advancePayment = (room as any).advancePayment || 0;
                const checkinTime = (room as any).checkinTime || (room as any).checkInTime || null;

                revenueByPeriod[periodKey].push({
                  'Kỳ': periodKey,
                  'Thời gian giao ca': format(new Date(record.handoverTime), 'dd/MM/yyyy HH:mm'),
                  'Phòng': room.roomNumber || '',
                  'Tên khách': this.getGuestName(room),
                  'Nguồn': this.getGuestSourceLabel(room),
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

            // Xử lý phiếu chi
            if (record.expenses && Array.isArray(record.expenses)) {
              record.expenses.forEach(expense => {
                const expenseDate = new Date(expense.timestamp);
                let periodKey = '';

                if (period === 'month') {
                  const { year, month } = this.getMonthYear(expenseDate);
                  periodKey = `${year}-${String(month).padStart(2, '0')}`;
                } else if (period === 'quarter') {
                  const { year, quarter } = this.getQuarter(expenseDate);
                  periodKey = `${year}-Q${quarter}`;
                } else {
                  const year = this.getYear(expenseDate);
                  periodKey = String(year);
                }

                if (!expenseByPeriod[periodKey]) {
                  expenseByPeriod[periodKey] = [];
                }

                expenseByPeriod[periodKey].push({
                  'Kỳ': periodKey,
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

            // Xử lý phiếu thu
            if (record.incomes && Array.isArray(record.incomes)) {
              record.incomes.forEach(income => {
                const incomeDate = new Date(income.timestamp);
                let periodKey = '';

                if (period === 'month') {
                  const { year, month } = this.getMonthYear(incomeDate);
                  periodKey = `${year}-${String(month).padStart(2, '0')}`;
                } else if (period === 'quarter') {
                  const { year, quarter } = this.getQuarter(incomeDate);
                  periodKey = `${year}-Q${quarter}`;
                } else {
                  const year = this.getYear(incomeDate);
                  periodKey = String(year);
                }

                if (!incomeByPeriod[periodKey]) {
                  incomeByPeriod[periodKey] = [];
                }

                incomeByPeriod[periodKey].push({
                  'Kỳ': periodKey,
                  'Thời gian giao ca': format(new Date(record.handoverTime), 'dd/MM/yyyy HH:mm'),
                  'Mô tả': income.description || 'Phiếu thu',
                  'Danh mục': this.getIncomeCategoryLabel(income.category),
                  'Người nộp': income.source || '',
                  'Số tiền': income.amount || 0,
                  'Hình thức thanh toán': income.method === 'cash' ? 'Tiền mặt' : 
                                          income.method === 'bank_transfer' ? 'Chuyển khoản' : 
                                          income.method === 'card' ? 'Thẻ' : 'Khác',
                  'Thời gian': format(new Date(income.timestamp), 'dd/MM/yyyy HH:mm'),
                  'Người duyệt': income.approvedBy || ''
                });
              });
            }
          });

          // Tạo workbook với nhiều sheets (mỗi kỳ một sheet)
          const workbook: XLSX.WorkBook = {
            Sheets: {},
            SheetNames: []
          };

          // Lấy tất cả các kỳ (union của revenue, expense và income periods)
          const allPeriods = new Set([
            ...Object.keys(revenueByPeriod),
            ...Object.keys(expenseByPeriod),
            ...Object.keys(incomeByPeriod)
          ]);
          const sortedPeriods = Array.from(allPeriods).sort();

          // Tạo sheet tổng hợp
          const summaryData: any[] = [];

          sortedPeriods.forEach(periodKey => {
            const rooms = revenueByPeriod[periodKey] || [];
            const expenses = expenseByPeriod[periodKey] || [];
            const incomes = incomeByPeriod[periodKey] || [];
            
            const totalRevenue = rooms.reduce((sum, r) => sum + (r['Số tiền'] || 0), 0);
            const totalRoom = rooms.reduce((sum, r) => sum + (r['Tiền phòng'] || 0), 0);
            const totalService = rooms.reduce((sum, r) => sum + (r['Tiền dịch vụ'] || 0), 0);
            const totalAdditional = rooms.reduce((sum, r) => sum + (r['Phụ thu'] || 0), 0);
            const totalDiscount = rooms.reduce((sum, r) => sum + (r['Khuyến mãi'] || 0), 0);
            const totalExpense = expenses.reduce((sum, e) => sum + (e['Số tiền'] || 0), 0);
            const totalIncome = incomes.reduce((sum, i) => sum + (i['Số tiền'] || 0), 0);
            const netRevenue = totalRevenue + totalIncome - totalExpense;

            summaryData.push({
              'Kỳ': periodKey,
              'Số phòng': rooms.length,
              'Tổng tiền phòng': totalRoom,
              'Tổng tiền dịch vụ': totalService,
              'Tổng phụ thu': totalAdditional,
              'Tổng khuyến mãi': totalDiscount,
              'Tổng doanh thu': totalRevenue,
              'Số phiếu chi': expenses.length,
              'Tổng phiếu chi': totalExpense,
              'Số phiếu thu': incomes.length,
              'Tổng phiếu thu': totalIncome,
              'Doanh thu thuần': netRevenue
            });
          });

          workbook.Sheets['Tổng hợp'] = XLSX.utils.json_to_sheet(summaryData);
          workbook.SheetNames.push('Tổng hợp');

          // Tạo sheet cho mỗi kỳ (doanh thu và phiếu chi)
          sortedPeriods.forEach(periodKey => {
            const periodLabel = period === 'month' ? `Tháng ${periodKey}` :
                               period === 'quarter' ? `Quý ${periodKey}` :
                               `Năm ${periodKey}`;
            
            // Sheet doanh thu cho kỳ này
            if (revenueByPeriod[periodKey] && revenueByPeriod[periodKey].length > 0) {
              workbook.Sheets[`${periodLabel} - Doanh thu`] = XLSX.utils.json_to_sheet(revenueByPeriod[periodKey]);
              workbook.SheetNames.push(`${periodLabel} - Doanh thu`);
            }

            // Sheet phiếu chi cho kỳ này
            if (expenseByPeriod[periodKey] && expenseByPeriod[periodKey].length > 0) {
              workbook.Sheets[`${periodLabel} - Phiếu chi`] = XLSX.utils.json_to_sheet(expenseByPeriod[periodKey]);
              workbook.SheetNames.push(`${periodLabel} - Phiếu chi`);
            }

            // Sheet phiếu thu cho kỳ này
            if (incomeByPeriod[periodKey] && incomeByPeriod[periodKey].length > 0) {
              workbook.Sheets[`${periodLabel} - Phiếu thu`] = XLSX.utils.json_to_sheet(incomeByPeriod[periodKey]);
              workbook.SheetNames.push(`${periodLabel} - Phiếu thu`);
            }
          });

          // Tạo tên file
          const dateStr = format(new Date(), 'ddMMyyyy_HHmmss');
          const periodLabel = period === 'month' ? 'theo_thang' :
                            period === 'quarter' ? 'theo_quy' :
                            'theo_nam';
          const fileName = `Tong_hop_doanh_thu_phieu_chi_va_phieu_thu_${periodLabel}_${dateStr}`;

          // Xuất file
          XLSX.writeFile(workbook, `${fileName}.xlsx`);
          this.message.success(`Đã xuất tổng hợp doanh thu, phiếu chi và phiếu thu ${periodLabel.replace('_', ' ')}`);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error exporting combined by period:', error);
          this.message.error('Không thể xuất dữ liệu ra Excel');
          this.isLoading = false;
        }
      })
    );
  }
}

