import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FinancialSummaryService, FinancialSummary, FinancialSummaryQuery, FinancialConfig } from '../../services/financial-summary.service';
import { AuthService } from '../../services/auth.service';
import { HotelService } from '../../services/hotel.service';
import { TranslateService } from '@ngx-translate/core';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-financial-summary-report',
  templateUrl: './financial-summary-report.component.html',
  styleUrls: ['./financial-summary-report.component.css']
})
export class FinancialSummaryReportComponent implements OnInit {
  loading = false;
  exporting = false;
  financialSummary: FinancialSummary | null = null;
  selectedHotelId: string | null = null;
  hotels: any[] = [];
  startDate: Date = startOfMonth(subMonths(new Date(), 1));
  endDate: Date = endOfMonth(subMonths(new Date(), 1));
  dateRange: [Date, Date] = [this.startDate, this.endDate];
  configModalVisible = false;
  configForm: FormGroup;

  constructor(
    private financialSummaryService: FinancialSummaryService,
    private authService: AuthService,
    private hotelService: HotelService,
    private fb: FormBuilder,
    private translate: TranslateService
  ) {
    this.configForm = this.fb.group({
      depreciationRate: [10, [Validators.required, Validators.min(0), Validators.max(100)]],
      loanPercentage: [70, [Validators.required, Validators.min(0), Validators.max(100)]],
      interestRate: [8, [Validators.required, Validators.min(0), Validators.max(100)]],
      taxRate: [20, [Validators.required, Validators.min(0), Validators.max(100)]],
      wacc: [9, [Validators.required, Validators.min(0), Validators.max(100)]],
      projectionYears: [10, [Validators.required, Validators.min(1), Validators.max(50)]]
    });
  }

  ngOnInit(): void {
    this.loadHotels();
    this.loadFinancialSummary();
  }

  // Helper function để extract businessId từ hotel (xử lý cả populated và non-populated)
  private extractBusinessId(hotel: any): string | null {
    if (!hotel || !hotel.businessId) {
      return null;
    }
    
    if (typeof hotel.businessId === 'object' && hotel.businessId !== null && '_id' in hotel.businessId) {
      return hotel.businessId._id;
    } else if (typeof hotel.businessId === 'string') {
      return hotel.businessId;
    }
    
    return null;
  }

  loadHotels(): void {
    this.hotelService.getHotels().subscribe({
      next: (response) => {
        const hotels = Array.isArray(response) ? response : [];
        const currentUser = this.authService.getCurrentUser();
        
        // Filter hotels theo role
        if (this.authService.isAdmin() || this.authService.isSuperAdmin()) {
          // Admin/Superadmin thấy tất cả
          this.hotels = hotels;
        } else if (this.authService.isBusiness() && currentUser?.businessId) {
          // Business chỉ thấy hotels thuộc business của mình
          this.hotels = hotels.filter((hotel: any) => {
            const hotelBusinessId = this.extractBusinessId(hotel);
            const userBusinessId = currentUser.businessId;
            return hotelBusinessId && userBusinessId && hotelBusinessId.toString() === userBusinessId.toString();
          });
        } else if (this.authService.isHotelManager() && currentUser?.hotelId) {
          // Hotel manager chỉ thấy hotel của mình
          this.hotels = hotels.filter((hotel: any) => hotel._id === currentUser.hotelId);
        } else {
          this.hotels = hotels; // Fallback
        }
        
        // Auto-select hotel
        if (this.hotels.length === 1) {
          this.selectedHotelId = this.hotels[0]._id;
        } else if (currentUser && (currentUser as any).hotelId) {
          this.selectedHotelId = (currentUser as any).hotelId;
        }
        
        this.loadFinancialSummary();
      },
      error: (error) => {
        console.error('Error loading hotels:', error);
      }
    });
  }

  loadFinancialSummary(): void {
    if (!this.selectedHotelId) {
      return;
    }

    this.loading = true;
    const query: FinancialSummaryQuery = {
      hotelId: this.selectedHotelId,
      startDate: format(this.startDate, 'yyyy-MM-dd'),
      endDate: format(this.endDate, 'yyyy-MM-dd')
    };

    this.financialSummaryService.getFinancialSummary(query).subscribe({
      next: (response) => {
        this.financialSummary = response.data;
        
        // Đảm bảo tất cả các field revenue luôn có giá trị
        if (this.financialSummary && this.financialSummary.breakdown && this.financialSummary.breakdown.revenue) {
          const revenue = this.financialSummary.breakdown.revenue;
          
          // Đảm bảo receiptRevenue luôn có giá trị (kể cả khi là 0 hoặc undefined)
          if (revenue.receiptRevenue === undefined || revenue.receiptRevenue === null) {
            revenue.receiptRevenue = 0;
          }
          
          // Đảm bảo các field khác cũng có giá trị mặc định
          if (revenue.roomRevenue === undefined || revenue.roomRevenue === null) {
            revenue.roomRevenue = 0;
          }
          if (revenue.serviceRevenue === undefined || revenue.serviceRevenue === null) {
            revenue.serviceRevenue = 0;
          }
          if (revenue.otherRevenue === undefined || revenue.otherRevenue === null) {
            revenue.otherRevenue = 0;
          }
          if (revenue.cafeRevenue === undefined || revenue.cafeRevenue === null) {
            revenue.cafeRevenue = 0;
          }
          if (revenue.otherServiceRevenue === undefined || revenue.otherServiceRevenue === null) {
            revenue.otherServiceRevenue = 0;
          }
          
          // Đảm bảo serviceRevenue = cafeRevenue + otherServiceRevenue
          const calculatedServiceRevenue = (revenue.cafeRevenue || 0) + (revenue.otherServiceRevenue || 0);
          if (Math.abs((revenue.serviceRevenue || 0) - calculatedServiceRevenue) > 0.01) {
            console.warn('Service revenue mismatch. Using calculated value:', {
              serviceRevenue: revenue.serviceRevenue,
              calculatedServiceRevenue,
              difference: Math.abs((revenue.serviceRevenue || 0) - calculatedServiceRevenue)
            });
            revenue.serviceRevenue = calculatedServiceRevenue;
          }
          
          // Tính lại totalRevenue từ các thành phần để đảm bảo tính nhất quán
          // totalRevenue = roomRevenue + serviceRevenue + receiptRevenue + otherRevenue
          const calculatedTotalRevenue = 
            (revenue.roomRevenue || 0) + 
            (revenue.serviceRevenue || 0) + 
            (revenue.receiptRevenue || 0) + 
            (revenue.otherRevenue || 0);
          
          // Nếu totalRevenue từ backend khác với tính toán, sử dụng giá trị tính toán
          if (Math.abs((this.financialSummary.totalRevenue || 0) - calculatedTotalRevenue) > 0.01) {
            console.warn('Total revenue mismatch. Using calculated value:', {
              backendTotalRevenue: this.financialSummary.totalRevenue,
              calculatedTotalRevenue,
              difference: Math.abs((this.financialSummary.totalRevenue || 0) - calculatedTotalRevenue)
            });
            this.financialSummary.totalRevenue = calculatedTotalRevenue;
            // Cập nhật lại profit
            this.financialSummary.profit = this.financialSummary.totalRevenue - (this.financialSummary.totalCosts || 0);
          }
          
          // Đảm bảo costs cũng có giá trị mặc định
          if (this.financialSummary.breakdown.costs) {
            const costs = this.financialSummary.breakdown.costs;
            if (costs.receiptExpenses === undefined || costs.receiptExpenses === null) {
              costs.receiptExpenses = costs.expenses || 0; // Mặc định bằng tổng expenses
            }
          }
          
          // Debug log để kiểm tra
          console.log('=== FRONTEND DEBUG: Financial Summary ===');
          console.log('Full response:', response);
          console.log('Financial Summary Revenue Breakdown:', {
            roomRevenue: revenue.roomRevenue,
            serviceRevenue: revenue.serviceRevenue,
            cafeRevenue: revenue.cafeRevenue,
            otherServiceRevenue: revenue.otherServiceRevenue,
            receiptRevenue: revenue.receiptRevenue,
            otherRevenue: revenue.otherRevenue,
            totalRevenue: this.financialSummary.totalRevenue,
            calculatedTotalRevenue: calculatedTotalRevenue
          });
          console.log('Financial Summary Costs Breakdown:', {
            expenses: this.financialSummary.breakdown.costs?.expenses,
            receiptExpenses: this.financialSummary.breakdown.costs?.receiptExpenses,
            totalCosts: this.financialSummary.totalCosts
          });
          console.log('=== END FRONTEND DEBUG ===');
        }
        
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading financial summary:', error);
        this.loading = false;
      }
    });
  }

  onHotelChange(): void {
    this.loadFinancialSummary();
  }

  onDateRangeChange(): void {
    if (this.dateRange && this.dateRange[0] && this.dateRange[1]) {
      this.startDate = this.dateRange[0];
      this.endDate = this.dateRange[1];
      this.loadFinancialSummary();
    }
  }

  updateInitialInvestment(): void {
    if (!this.selectedHotelId || !this.financialSummary) {
      return;
    }

    const promptMessage = this.translate.instant('FINANCIAL_REPORT.UPDATE_INVESTMENT') + ' (VND):';
    const newInvestment = prompt(promptMessage, this.financialSummary.initialInvestment.toString());
    if (newInvestment && !isNaN(Number(newInvestment))) {
      this.financialSummaryService.updateInitialInvestment(
        this.selectedHotelId,
        Number(newInvestment)
      ).subscribe({
        next: (response) => {
          this.financialSummary!.initialInvestment = response.data.initialInvestment;
          this.loadFinancialSummary();
        },
        error: (error) => {
          console.error('Error updating initial investment:', error);
          alert(this.translate.instant('FINANCIAL_REPORT.UPDATE_INVESTMENT_ERROR'));
        }
      });
    }
  }

  openConfigModal(): void {
    if (!this.financialSummary) {
      return;
    }

    const config = this.financialSummary.financialConfig || {
      depreciationRate: 10,
      loanPercentage: 70,
      interestRate: 8,
      taxRate: 20,
      wacc: 9,
      projectionYears: 10
    };

    this.configForm.patchValue({
      depreciationRate: config.depreciationRate || 10,
      loanPercentage: config.loanPercentage || 70,
      interestRate: config.interestRate || 8,
      taxRate: config.taxRate || 20,
      wacc: config.wacc || 9,
      projectionYears: config.projectionYears || 10
    });

    this.configModalVisible = true;
  }

  closeConfigModal(): void {
    this.configModalVisible = false;
  }

  updateFinancialConfig(): void {
    if (!this.selectedHotelId || !this.configForm.valid) {
      return;
    }

    const financialConfig: FinancialConfig = this.configForm.value;

    this.financialSummaryService.updateFinancialConfig(
      this.selectedHotelId,
      financialConfig
    ).subscribe({
      next: (response) => {
        this.configModalVisible = false;
        this.loadFinancialSummary();
      },
      error: (error) => {
        console.error('Error updating financial config:', error);
        alert(this.translate.instant('FINANCIAL_REPORT.UPDATE_CONFIG_ERROR') + ': ' + (error.error?.message || error.message));
      }
    });
  }

  formatCurrency(value: number | null | undefined): string {
    // Xử lý null, undefined, NaN, và các giá trị không hợp lệ
    const numValue = (value !== null && value !== undefined && !isNaN(value)) ? value : 0;
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(numValue);
  }

  formatNumber(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value);
  }

  formatPercent(value: number): string {
    return value + '%';
  }

  parsePercent(value: string): string {
    return value.replace('%', '');
  }

  canAccess(): boolean {
    // Chỉ superadmin và business mới được xem và tải Excel
    return this.authService.isSuperAdmin() || 
           this.authService.isBusiness();
  }

  canExportExcel(): boolean {
    // Chỉ superadmin và business mới được tải Excel
    return this.authService.isSuperAdmin() || 
           this.authService.isBusiness();
  }

  exportToExcel(): void {
    if (!this.selectedHotelId) {
      alert(this.translate.instant('FINANCIAL_REPORT.SELECT_HOTEL_ERROR'));
      return;
    }

    this.exporting = true;
    const queryParams = new URLSearchParams({
      hotelId: this.selectedHotelId,
      startDate: format(this.startDate, 'yyyy-MM-dd'),
      endDate: format(this.endDate, 'yyyy-MM-dd')
    });

    const url = `${environment.apiUrl}/financial-summary/export-excel?${queryParams.toString()}`;
    
    // Lấy token từ AuthService (in-memory)
    const token = this.authService.getToken();
    
    if (!token) {
      alert(this.translate.instant('FINANCIAL_REPORT.LOGIN_REQUIRED'));
      this.exporting = false;
      return;
    }
    
    fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(this.translate.instant('FINANCIAL_REPORT.EXPORT_ERROR'));
      }
      return response.blob();
    })
    .then(blob => {
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `bao-cao-tai-chinh-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      this.exporting = false;
    })
    .catch(error => {
      console.error('Error exporting Excel:', error);
      alert(this.translate.instant('FINANCIAL_REPORT.EXPORT_EXCEL_ERROR'));
      this.exporting = false;
    });
  }
}

