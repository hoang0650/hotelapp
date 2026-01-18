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
import { TranslateService } from '@ngx-translate/core';

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
  
  // Translated titles
  cardTitle: string = '';
  detailModalTitle: string = '';
  
  constructor(
    private shiftHandoverService: ShiftHandoverService,
    private authService: AuthService,
    private message: NzMessageService,
    private translate: TranslateService
  ) {}
  
  ngOnInit(): void {
    // Khởi tạo _hotelId từ @Input hoặc authService
    this._hotelId = this.hotelId || this.authService.getHotelId();
    
    // Load dữ liệu nếu đã có hotelId
    if (this._hotelId) {
      this.loadShiftHistory();
    }
    
    // Initialize translated titles
    this.updateTitles();
    
    // Subscribe to language changes
    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => {
        this.updateTitles();
      })
    );
  }
  
  private updateTitles(): void {
    this.cardTitle = this.translate.instant('SHIFT_HANDOVER.HISTORY.TITLE');
    this.detailModalTitle = this.translate.instant('SHIFT_HANDOVER.HISTORY.DETAIL_TITLE');
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
      this.message.warning(this.translate.instant('SHIFT_HANDOVER_EXPORT.HOTEL_NOT_FOUND'));
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
    if (!date) return this.translate.instant('SHIFT_HANDOVER.HISTORY.N_A');
    return format(new Date(date), 'dd/MM/yyyy HH:mm');
  }
  
  getStaffName(staff: any): string {
    if (!staff) return this.translate.instant('SHIFT_HANDOVER.HISTORY.N_A');
    if (typeof staff === 'string') return staff;
    const firstName = staff.personalInfo?.firstName || '';
    const lastName = staff.personalInfo?.lastName || '';
    return `${firstName} ${lastName}`.trim() || staff.username || this.translate.instant('SHIFT_HANDOVER.HISTORY.N_A');
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
      'pending': this.translate.instant('SHIFT_HANDOVER.HISTORY.STATUS.PENDING'),
      'confirmed': this.translate.instant('SHIFT_HANDOVER.HISTORY.STATUS.CONFIRMED'),
      'rejected': this.translate.instant('SHIFT_HANDOVER.HISTORY.STATUS.REJECTED'),
      'cancelled': this.translate.instant('SHIFT_HANDOVER.HISTORY.STATUS.CANCELLED')
    };
    return labelMap[status] || status;
  }
  
  getExpenseCategoryLabel(category: string | undefined): string {
    if (!category) return this.translate.instant('SHIFT_HANDOVER.HISTORY.CATEGORY.OTHER');
    const labelMap: Record<string, string> = {
      'supplies': this.translate.instant('SHIFT_HANDOVER.HISTORY.CATEGORY.SUPPLIES'),
      'utilities': this.translate.instant('SHIFT_HANDOVER.HISTORY.CATEGORY.UTILITIES'),
      'salary': this.translate.instant('SHIFT_HANDOVER.HISTORY.CATEGORY.SALARY'),
      'maintenance': this.translate.instant('SHIFT_HANDOVER.HISTORY.CATEGORY.MAINTENANCE'),
      'marketing': this.translate.instant('SHIFT_HANDOVER.HISTORY.CATEGORY.MARKETING'),
      'other': this.translate.instant('SHIFT_HANDOVER.HISTORY.CATEGORY.OTHER')
    };
    return labelMap[category] || category || this.translate.instant('SHIFT_HANDOVER.HISTORY.CATEGORY.OTHER');
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
    if (!category) return this.translate.instant('SHIFT_HANDOVER.HISTORY.CATEGORY.OTHER');
    const labelMap: Record<string, string> = {
      'room_rental': this.translate.instant('SHIFT_HANDOVER.HISTORY.CATEGORY.ROOM_RENTAL'),
      'service': this.translate.instant('SHIFT_HANDOVER.HISTORY.CATEGORY.SERVICE'),
      'deposit': this.translate.instant('SHIFT_HANDOVER.HISTORY.CATEGORY.DEPOSIT'),
      'other': this.translate.instant('SHIFT_HANDOVER.HISTORY.CATEGORY.OTHER')
    };
    return labelMap[category] || category || this.translate.instant('SHIFT_HANDOVER.HISTORY.CATEGORY.OTHER');
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

  getTotalRevenue(record: ShiftHandover): number {
    const roomRevenue = (record.roomHistory || []).reduce((sum, room: any) => {
      const roomTotal = room.roomTotal || 0;
      const serviceAmount = room.serviceAmount || room.serviceTotal || 0;
      const additionalCharges = room.additionalCharges || 0;
      const discount = room.discount || 0;
      return sum + roomTotal + serviceAmount + additionalCharges - discount;
    }, 0);
    const advanceTotal = (record.roomHistory || []).reduce((sum, room: any) => {
      return sum + (room.advancePayment || 0);
    }, 0);
    const incomeAmount = record.incomeAmount || 0;
    return roomRevenue + advanceTotal + incomeAmount;
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

  getGuestSource(room: any): string {
    let source: any = 'walkin';
    if (room.guestSource) {
      source = room.guestSource;
    }
    else if (room.guestInfo?.guestSource) {
      source = room.guestInfo.guestSource;
    }
    else if (room.event?.guestInfo?.guestSource) {
      source = room.event.guestInfo.guestSource;
    }
    else if (room.bookingId) {
      if (typeof room.bookingId === 'object') {
        source = room.bookingId.guestSource || 
                 room.bookingId.guestInfo?.guestSource || 
                 room.bookingId.guestDetails?.guestSource || 
                 room.bookingId.source || 
                 room.bookingId.otaSource || 
                 'walkin';
      } else if (typeof room.bookingId === 'string') {
        source = 'walkin';
      }
    }
    if (typeof source !== 'string') {
      source = 'walkin';
    }
    let normalized = String(source).toLowerCase().trim();
    if ((!normalized || normalized === 'ota') && room.bookingId && typeof room.bookingId === 'object') {
      const booking = room.bookingId;
      if (booking.otaSource) {
        normalized = String(booking.otaSource).toLowerCase().trim();
      }
    }
    if (
      normalized === 'walkin' ||
      normalized === 'walk-in' ||
      normalized === 'walk_in' ||
      normalized === 'direct' ||
      normalized === 'phone' ||
      normalized === 'regular' ||
      normalized === 'guest' ||
      normalized === 'khach le' ||
      normalized === 'khách lẻ'
    ) {
      return 'walkin';
    }
    if (normalized.includes('booking')) {
      return 'booking';
    }
    if (normalized.includes('agoda')) {
      return 'agoda';
    }
    if (normalized.includes('traveloka')) {
      return 'traveloka';
    }
    if (normalized.includes('expedia')) {
      return 'expedia';
    }
    if (normalized.includes('trip')) {
      return 'trip';
    }
    if (normalized.includes('g2j')) {
      return 'g2j';
    }
    if (!normalized) {
      return 'walkin';
    }
    return 'other';
  }

  // Lấy label cho nguồn khách
  getGuestSourceLabel(room: any): string {
    const source = this.getGuestSource(room);
    const sourceMap: { [key: string]: string } = {
      'walkin': this.translate.instant('SHIFT_HANDOVER.HISTORY.GUEST_SOURCE.WALKIN'),
      'booking': this.translate.instant('SHIFT_HANDOVER.HISTORY.GUEST_SOURCE.BOOKING'),
      'agoda': this.translate.instant('SHIFT_HANDOVER.HISTORY.GUEST_SOURCE.AGODA'),
      'traveloka': this.translate.instant('SHIFT_HANDOVER.HISTORY.GUEST_SOURCE.TRAVELOKA'),
      'expedia': this.translate.instant('SHIFT_HANDOVER.HISTORY.GUEST_SOURCE.EXPEDIA'),
      'trip': this.translate.instant('SHIFT_HANDOVER.HISTORY.GUEST_SOURCE.TRIP'),
      'g2j': this.translate.instant('SHIFT_HANDOVER.HISTORY.GUEST_SOURCE.G2J'),
      'other': this.translate.instant('SHIFT_HANDOVER.HISTORY.GUEST_SOURCE.OTHER')
    };
    
    // Đảm bảo source là string và lowercase
    const normalizedSource = String(source).toLowerCase().trim();
    
    // Lấy label từ map, đảm bảo trả về string
    const label = sourceMap[normalizedSource];
    
    // Nếu label là object hoặc không tồn tại, trả về default
    if (typeof label !== 'string' || !label) {
      return this.translate.instant('SHIFT_HANDOVER.HISTORY.GUEST_SOURCE.OTHER');
    }
    
    return label;
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
      this.message.warning(this.translate.instant('SHIFT_HANDOVER_EXPORT.HOTEL_NOT_FOUND'));
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
            this.message.warning(this.translate.instant('SHIFT_HANDOVER_EXPORT.NO_DATA'));
            this.isLoading = false;
            return;
          }

          // Chuẩn bị dữ liệu cho Excel
          const excelData = allRecords.map(record => ({
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.HANDOVER_TIME')]: format(new Date(record.handoverTime), 'dd/MM/yyyy HH:mm'),
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.FROM_STAFF')]: this.getStaffName(record.fromStaffId),
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.TO_STAFF')]: this.getStaffName(record.toStaffId),
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.PREVIOUS_SHIFT_AMOUNT')]: record.previousShiftAmount || 0,
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.CASH_IN_SHIFT')]: record.cashInShift || 0,
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.MANAGER_HANDOVER_AMOUNT')]: record.managerHandoverAmount || 0,
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.HANDOVER_AMOUNT')]: record.handoverAmount || 0,
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.CASH_AMOUNT')]: record.cashAmount || 0,
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.BANK_TRANSFER_AMOUNT')]: record.bankTransferAmount || 0,
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.CARD_PAYMENT_AMOUNT')]: record.cardPaymentAmount || 0,
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.EXPENSE_AMOUNT')]: record.expenseAmount || 0,
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.INCOME_AMOUNT')]: record.incomeAmount || 0,
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_REVENUE')]: this.getTotalRevenue(record),
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_ROOM_REVENUE')]: record.totalRoomRevenue || 0,
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.STATUS')]: this.getStatusLabel(record.status),
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.NOTES')]: record.notes || ''
          }));

          // Tạo worksheet
          const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(excelData);
          const workbook: XLSX.WorkBook = { 
            Sheets: { [this.translate.instant('SHIFT_HANDOVER_EXPORT.SHEET_NAME')]: worksheet }, 
            SheetNames: [this.translate.instant('SHIFT_HANDOVER_EXPORT.SHEET_NAME')] 
          };

          // Tạo tên file
          const dateStr = format(new Date(), 'ddMMyyyy_HHmmss');
          const fileName = `Lich_su_giao_ca_${dateStr}`;

          // Xuất file
          XLSX.writeFile(workbook, `${fileName}.xlsx`);
          this.message.success(this.translate.instant('SHIFT_HANDOVER_EXPORT.SUCCESS', { count: allRecords.length }));
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error exporting shift handover history:', error);
          this.message.error(this.translate.instant('SHIFT_HANDOVER_EXPORT.ERROR'));
          this.isLoading = false;
        }
      })
    );
  }

  // Xuất Excel tổng doanh thu và phiếu chi (gộp tất cả lịch sử phòng và phiếu chi)
  exportRevenueAndExpense(): void {
    const currentHotelId = this._hotelId || this.hotelId || this.authService.getHotelId();
    
    if (!currentHotelId) {
      this.message.warning(this.translate.instant('SHIFT_HANDOVER_EXPORT.HOTEL_NOT_FOUND'));
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
            this.message.warning(this.translate.instant('SHIFT_HANDOVER_EXPORT.NO_DATA'));
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
                const roomTotal = (room as any).roomTotal || 0;
                const additionalCharges = (room as any).additionalCharges || 0;
                const discount = (room as any).discount || 0;
                const serviceAmount = (room as any).serviceAmount || (room as any).serviceTotal || 0;
                const advancePayment = (room as any).advancePayment || 0;
                const checkinTime = (room as any).checkinTime || (room as any).checkInTime || null;
                const advancePaymentMethod = (room as any).advancePaymentMethod || (room as any).paymentMethod || 'cash';
                
                allRoomHistory.push({
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.HANDOVER_TIME')]: format(new Date(record.handoverTime), 'dd/MM/yyyy HH:mm'),
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.ROOM')]: room.roomNumber || '',
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.GUEST_NAME')]: this.getGuestName(room),
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.SOURCE')]: this.getGuestSourceLabel(room),
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.ACTION')]: room.action || '',
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.ROOM_TOTAL')]: roomTotal,
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.ADDITIONAL_CHARGES')]: additionalCharges,
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.DISCOUNT')]: discount,
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.SERVICE_AMOUNT')]: serviceAmount,
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.ADVANCE_PAYMENT')]: advancePayment,
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.ADVANCE_PAYMENT_METHOD')]:
                    advancePaymentMethod === 'cash'
                      ? this.translate.instant('SHIFT_HANDOVER_EXPORT.CASH')
                      : advancePaymentMethod === 'bank_transfer'
                        ? this.translate.instant('SHIFT_HANDOVER_EXPORT.BANK_TRANSFER')
                        : advancePaymentMethod === 'card'
                          ? this.translate.instant('SHIFT_HANDOVER_EXPORT.CARD')
                          : this.translate.instant('SHIFT_HANDOVER_EXPORT.OTHER'),
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.AMOUNT')]: room.amount || 0,
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.PAYMENT_METHOD')]: room.paymentMethod === 'cash' ? this.translate.instant('SHIFT_HANDOVER_EXPORT.CASH') : 
                  room.paymentMethod === 'bank_transfer' ? this.translate.instant('SHIFT_HANDOVER_EXPORT.BANK_TRANSFER') : 
                  room.paymentMethod === 'card' ? this.translate.instant('SHIFT_HANDOVER_EXPORT.CARD') : this.translate.instant('SHIFT_HANDOVER_EXPORT.OTHER'),
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.CHECK_IN')]: checkinTime ? format(new Date(checkinTime), 'dd/MM/yyyy HH:mm') : '',
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.CHECK_OUT')]: format(new Date(room.timestamp), 'dd/MM/yyyy HH:mm'),
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.NOTES')]: room.notes || ''
                });
              });
            }

            // Thêm phiếu chi
            if (record.expenses && Array.isArray(record.expenses)) {
              record.expenses.forEach(expense => {
                allExpenses.push({
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.HANDOVER_TIME')]: format(new Date(record.handoverTime), 'dd/MM/yyyy HH:mm'),
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.DESCRIPTION')]: expense.description || this.translate.instant('SHIFT_HANDOVER_EXPORT.EXPENSE_VOUCHER'),
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.CATEGORY')]: this.getExpenseCategoryLabel(expense.category),
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.RECIPIENT')]: expense.recipient || '',
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.AMOUNT')]: expense.amount || 0,
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.PAYMENT_METHOD')]: expense.method === 'cash' ? this.translate.instant('SHIFT_HANDOVER_EXPORT.CASH') : 
                                          expense.method === 'bank_transfer' ? this.translate.instant('SHIFT_HANDOVER_EXPORT.BANK_TRANSFER') : 
                                          expense.method === 'card' ? this.translate.instant('SHIFT_HANDOVER_EXPORT.CARD') : this.translate.instant('SHIFT_HANDOVER_EXPORT.OTHER'),
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.TIMESTAMP')]: format(new Date(expense.timestamp), 'dd/MM/yyyy HH:mm'),
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.APPROVED_BY')]: expense.approvedBy || ''
                });
              });
            }

            // Thêm phiếu thu
            if (record.incomes && Array.isArray(record.incomes)) {
              record.incomes.forEach(income => {
                allIncomes.push({
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.HANDOVER_TIME')]: format(new Date(record.handoverTime), 'dd/MM/yyyy HH:mm'),
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.DESCRIPTION')]: income.description || this.translate.instant('SHIFT_HANDOVER_EXPORT.INCOME_VOUCHER'),
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.CATEGORY')]: this.getIncomeCategoryLabel(income.category),
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.PAYER')]: income.source || '',
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.AMOUNT')]: income.amount || 0,
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.PAYMENT_METHOD')]: income.method === 'cash' ? this.translate.instant('SHIFT_HANDOVER_EXPORT.CASH') : 
                                          income.method === 'bank_transfer' ? this.translate.instant('SHIFT_HANDOVER_EXPORT.BANK_TRANSFER') : 
                                          income.method === 'card' ? this.translate.instant('SHIFT_HANDOVER_EXPORT.CARD') : this.translate.instant('SHIFT_HANDOVER_EXPORT.OTHER'),
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.TIMESTAMP')]: format(new Date(income.timestamp), 'dd/MM/yyyy HH:mm'),
                  [this.translate.instant('SHIFT_HANDOVER_EXPORT.APPROVED_BY')]: income.approvedBy || ''
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
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_SHIFTS')]: allRecords.length,
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_PREVIOUS_SHIFT_AMOUNT')]: allRecords.reduce((sum, r) => sum + (r.previousShiftAmount || 0), 0),
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_CASH_IN_SHIFT')]: allRecords.reduce((sum, r) => sum + (r.cashInShift || 0), 0),
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_MANAGER_HANDOVER_AMOUNT')]: allRecords.reduce((sum, r) => sum + (r.managerHandoverAmount || 0), 0),
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_HANDOVER_AMOUNT')]: allRecords.reduce((sum, r) => sum + (r.handoverAmount || 0), 0),
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_CASH_AMOUNT')]: allRecords.reduce((sum, r) => sum + (r.cashAmount || 0), 0),
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_BANK_TRANSFER_AMOUNT')]: allRecords.reduce((sum, r) => sum + (r.bankTransferAmount || 0), 0),
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_CARD_PAYMENT_AMOUNT')]: allRecords.reduce((sum, r) => sum + (r.cardPaymentAmount || 0), 0),
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_EXPENSE_AMOUNT')]: allRecords.reduce((sum, r) => sum + (r.expenseAmount || 0), 0),
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_INCOME_AMOUNT')]: allRecords.reduce((sum, r) => sum + (r.incomeAmount || 0), 0),
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_REVENUE')]: allRecords.reduce((sum, r) => sum + this.getTotalRevenue(r), 0),
            [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_ROOM_REVENUE')]: allRecords.reduce((sum, r) => sum + (r.totalRoomRevenue || 0), 0)
          }];
          workbook.Sheets[this.translate.instant('SHIFT_HANDOVER_EXPORT.SUMMARY_SHEET')] = XLSX.utils.json_to_sheet(summaryData);
          workbook.SheetNames.push(this.translate.instant('SHIFT_HANDOVER_EXPORT.SUMMARY_SHEET'));

          // Sheet 2: Lịch sử phòng
          if (allRoomHistory.length > 0) {
            workbook.Sheets[this.translate.instant('SHIFT_HANDOVER_EXPORT.ROOM_HISTORY_SHEET')] = XLSX.utils.json_to_sheet(allRoomHistory);
            workbook.SheetNames.push(this.translate.instant('SHIFT_HANDOVER_EXPORT.ROOM_HISTORY_SHEET'));
          }

          // Sheet 3: Phiếu chi
          if (allExpenses.length > 0) {
            workbook.Sheets[this.translate.instant('SHIFT_HANDOVER_EXPORT.EXPENSE_SHEET')] = XLSX.utils.json_to_sheet(allExpenses);
            workbook.SheetNames.push(this.translate.instant('SHIFT_HANDOVER_EXPORT.EXPENSE_SHEET'));
          }

          // Sheet 4: Phiếu thu
          if (allIncomes.length > 0) {
            workbook.Sheets[this.translate.instant('SHIFT_HANDOVER_EXPORT.INCOME_SHEET')] = XLSX.utils.json_to_sheet(allIncomes);
            workbook.SheetNames.push(this.translate.instant('SHIFT_HANDOVER_EXPORT.INCOME_SHEET'));
          }

          // Tạo tên file
          const dateStr = format(new Date(), 'ddMMyyyy_HHmmss');
          const fileName = `Tong_doanh_thu_phiếu_chi_va_phiếu_thu_${dateStr}`;

          // Xuất file
          XLSX.writeFile(workbook, `${fileName}.xlsx`);
          this.message.success(this.translate.instant('SHIFT_HANDOVER_EXPORT.EXPORT_SUCCESS_DETAIL', { 
            roomHistory: allRoomHistory.length, 
            expenses: allExpenses.length, 
            incomes: allIncomes.length 
          }));
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error exporting revenue and expense:', error);
          this.message.error(this.translate.instant('SHIFT_HANDOVER_EXPORT.ERROR'));
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
      this.message.warning(this.translate.instant('SHIFT_HANDOVER_EXPORT.HOTEL_NOT_FOUND'));
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
            this.message.warning(this.translate.instant('SHIFT_HANDOVER_EXPORT.NO_DATA'));
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
            const amountKey = this.translate.instant('SHIFT_HANDOVER_EXPORT.AMOUNT');
            const roomTotalKey = this.translate.instant('SHIFT_HANDOVER_EXPORT.ROOM_TOTAL');
            const serviceAmountKey = this.translate.instant('SHIFT_HANDOVER_EXPORT.SERVICE_AMOUNT');
            const additionalChargesKey = this.translate.instant('SHIFT_HANDOVER_EXPORT.ADDITIONAL_CHARGES');
            const discountKey = this.translate.instant('SHIFT_HANDOVER_EXPORT.DISCOUNT');
            const totalRevenue = rooms.reduce((sum, r) => sum + (r[amountKey] || 0), 0);
            const totalRoom = rooms.reduce((sum, r) => sum + (r[roomTotalKey] || 0), 0);
            const totalService = rooms.reduce((sum, r) => sum + (r[serviceAmountKey] || 0), 0);
            const totalAdditional = rooms.reduce((sum, r) => sum + (r[additionalChargesKey] || 0), 0);
            const totalDiscount = rooms.reduce((sum, r) => sum + (r[discountKey] || 0), 0);
            const totalIncome = incomes.reduce((sum, i) => sum + (i[amountKey] || 0), 0);

            summaryData.push({
              [this.translate.instant('SHIFT_HANDOVER_EXPORT.PERIOD')]: periodKey,
              [this.translate.instant('SHIFT_HANDOVER_EXPORT.ROOM_COUNT')]: rooms.length,
              [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_ROOM_TOTAL')]: totalRoom,
              [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_SERVICE_AMOUNT')]: totalService,
              [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_ADDITIONAL_CHARGES')]: totalAdditional,
              [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_DISCOUNT')]: totalDiscount,
              [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_ROOM_REVENUE')]: totalRevenue,
              [this.translate.instant('SHIFT_HANDOVER_EXPORT.INCOME_COUNT')]: incomes.length,
              [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_INCOME_AMOUNT')]: totalIncome,
              [this.translate.instant('SHIFT_HANDOVER_EXPORT.TOTAL_REVENUE')]: totalRevenue + totalIncome
            });
          });

          workbook.Sheets[this.translate.instant('SHIFT_HANDOVER_EXPORT.SUMMARY_SHEET')] = XLSX.utils.json_to_sheet(summaryData);
          workbook.SheetNames.push(this.translate.instant('SHIFT_HANDOVER_EXPORT.SUMMARY_SHEET'));

          // Tạo sheet cho mỗi kỳ (doanh thu và phiếu thu)
          sortedPeriods.forEach(periodKey => {
            const monthLabel = this.translate.instant('SHIFT_HANDOVER_EXPORT.MONTH');
            const quarterLabel = this.translate.instant('SHIFT_HANDOVER_EXPORT.QUARTER');
            const yearLabel = this.translate.instant('SHIFT_HANDOVER_EXPORT.YEAR');
            const revenueLabel = this.translate.instant('SHIFT_HANDOVER_EXPORT.REVENUE');
            const incomeLabel = this.translate.instant('SHIFT_HANDOVER_EXPORT.INCOME_VOUCHER');
            const periodLabel = period === 'month' ? `${monthLabel} ${periodKey}` :
                               period === 'quarter' ? `${quarterLabel} ${periodKey}` :
                               `${yearLabel} ${periodKey}`;
            
            // Sheet doanh thu cho kỳ này
            if (revenueByPeriod[periodKey] && revenueByPeriod[periodKey].length > 0) {
              workbook.Sheets[`${periodLabel} - ${revenueLabel}`] = XLSX.utils.json_to_sheet(revenueByPeriod[periodKey]);
              workbook.SheetNames.push(`${periodLabel} - ${revenueLabel}`);
            }

            // Sheet phiếu thu cho kỳ này
            if (incomeByPeriod[periodKey] && incomeByPeriod[periodKey].length > 0) {
              workbook.Sheets[`${periodLabel} - ${incomeLabel}`] = XLSX.utils.json_to_sheet(incomeByPeriod[periodKey]);
              workbook.SheetNames.push(`${periodLabel} - ${incomeLabel}`);
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
      this.message.warning(this.translate.instant('SHIFT_HANDOVER_EXPORT.HOTEL_NOT_FOUND'));
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
            this.message.warning(this.translate.instant('SHIFT_HANDOVER_EXPORT.NO_DATA'));
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
      this.message.warning(this.translate.instant('SHIFT_HANDOVER_EXPORT.HOTEL_NOT_FOUND'));
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
            this.message.warning(this.translate.instant('SHIFT_HANDOVER_EXPORT.NO_DATA'));
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
      this.message.warning(this.translate.instant('SHIFT_HANDOVER_EXPORT.HOTEL_NOT_FOUND'));
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
            this.message.warning(this.translate.instant('SHIFT_HANDOVER_EXPORT.NO_DATA'));
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

