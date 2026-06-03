import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FinancialSummaryService, FinancialSummary, FinancialSummaryQuery, FinancialConfig } from '../../services/financial-summary.service';
import { AuthService } from '../../services/auth.service';
import { HotelService } from '../../services/hotel.service';
import { TranslateService } from '@ngx-translate/core';
import { format, subMonths, startOfMonth, endOfMonth, differenceInCalendarDays } from 'date-fns';
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

  private getSelectedHotel(): any | null {
    if (!this.selectedHotelId) {
      return null;
    }
    return this.hotels.find((h: any) => h && h._id === this.selectedHotelId) || null;
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
        const selectedHotel = this.getSelectedHotel();
        if (this.financialSummary) {
          const hotelInitialInvestment = selectedHotel && Number.isFinite(Number(selectedHotel.initialInvestment))
            ? Number(selectedHotel.initialInvestment)
            : null;
          if (hotelInitialInvestment !== null) {
            this.financialSummary.initialInvestment = hotelInitialInvestment;
          } else if (this.financialSummary.initialInvestment === undefined || this.financialSummary.initialInvestment === null) {
            this.financialSummary.initialInvestment = 0;
          }
        }
        
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

        if (this.financialSummary) {
          this.recalculateFinancialMetrics(this.financialSummary);
        }
        
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading financial summary:', error);
        this.loading = false;
      }
    });
  }

  private recalculateFinancialMetrics(summary: FinancialSummary): void {
    const config: FinancialConfig = summary.financialConfig || {};
    const depreciationRate = Number(config.depreciationRate ?? 10) / 100;
    const loanPercentage = Number(config.loanPercentage ?? 70) / 100;
    const interestRate = Number(config.interestRate ?? 8) / 100;
    const taxRate = Number(config.taxRate ?? 20) / 100;
    const wacc = Number(config.wacc ?? 9) / 100;
    const projectionYears = Math.max(1, Number(config.projectionYears ?? 10));

    const initialInvestment = Math.max(0, Number(summary.initialInvestment || 0));
    const loanAmount = initialInvestment * Math.min(Math.max(loanPercentage, 0), 1);

    const start = this.startDate;
    const end = this.endDate;
    const days = Math.max(1, differenceInCalendarDays(end, start) + 1);
    const daysPerYear = 365.2425;
    const yearFraction = Math.max(1 / daysPerYear, days / daysPerYear);

    const periodOperatingProfit = Number(summary.profit || 0);
    const annualizedOperatingProfit = periodOperatingProfit / yearFraction;

    const depreciationAnnual = initialInvestment * Math.min(Math.max(depreciationRate, 0), 1);
    const interestAnnual = loanAmount * Math.min(Math.max(interestRate, 0), 10);

    const profitBeforeTaxAnnual = annualizedOperatingProfit - depreciationAnnual - interestAnnual;
    const taxAnnual = profitBeforeTaxAnnual > 0 ? profitBeforeTaxAnnual * Math.min(Math.max(taxRate, 0), 1) : 0;
    const profitAfterTaxAnnual = profitBeforeTaxAnnual - taxAnnual;
    const freeCashFlowAnnual = profitAfterTaxAnnual + depreciationAnnual;

    summary.depreciation = depreciationAnnual;
    summary.interest = interestAnnual;
    summary.profitBeforeTax = profitBeforeTaxAnnual;
    summary.tax = taxAnnual;
    summary.profitAfterTax = profitAfterTaxAnnual;
    summary.monthlyProfit = profitAfterTaxAnnual / 12;

    if (initialInvestment > 0 && freeCashFlowAnnual > 0) {
      const paybackYears = initialInvestment / freeCashFlowAnnual;
      summary.paybackPeriod = paybackYears * 12;
      summary.paybackPeriodDays = paybackYears * daysPerYear;
    } else {
      summary.paybackPeriod = 0;
      summary.paybackPeriodDays = 0;
    }

    if (initialInvestment > 0 && Number.isFinite(wacc) && wacc > -0.99 && projectionYears > 0) {
      const cashFlows: number[] = [-initialInvestment];
      for (let i = 1; i <= projectionYears; i++) {
        cashFlows.push(freeCashFlowAnnual);
      }
      const npvValue = this.calculateNpv(wacc, cashFlows);
      summary.npv = Number.isFinite(npvValue) ? npvValue / 1_000_000 : undefined;

      const irr = this.calculateIrr(cashFlows);
      summary.irr = Number.isFinite(irr) ? irr * 100 : undefined;
    } else {
      summary.npv = undefined;
      summary.irr = undefined;
    }
  }

  private calculateNpv(discountRate: number, cashFlows: number[]): number {
    let total = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      total += cashFlows[t] / Math.pow(1 + discountRate, t);
    }
    return total;
  }

  private calculateIrr(cashFlows: number[]): number {
    const hasPositive = cashFlows.some(v => v > 0);
    const hasNegative = cashFlows.some(v => v < 0);
    if (!hasPositive || !hasNegative) return NaN;

    const npvAt = (rate: number) => this.calculateNpv(rate, cashFlows);

    let low = -0.9999;
    let high = 10;
    let npvLow = npvAt(low);
    let npvHigh = npvAt(high);

    let expand = 0;
    while (npvLow * npvHigh > 0 && expand < 20) {
      high *= 2;
      npvHigh = npvAt(high);
      expand++;
    }
    if (npvLow * npvHigh > 0) return NaN;

    for (let i = 0; i < 120; i++) {
      const mid = (low + high) / 2;
      const npvMid = npvAt(mid);
      if (Math.abs(npvMid) < 1e-7) return mid;
      if (npvLow * npvMid <= 0) {
        high = mid;
        npvHigh = npvMid;
      } else {
        low = mid;
        npvLow = npvMid;
      }
    }
    return (low + high) / 2;
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
    const selectedHotel = this.getSelectedHotel();
    const selectedHotelInitialInvestment = selectedHotel && Number.isFinite(Number(selectedHotel.initialInvestment))
      ? Number(selectedHotel.initialInvestment)
      : null;
    const defaultValue = this.formatNumber(Number(selectedHotelInitialInvestment ?? this.financialSummary.initialInvestment ?? 0));
    const newInvestment = prompt(promptMessage, defaultValue);
    if (newInvestment === null) {
      return;
    }

    const numericValue = this.parseVndInput(newInvestment);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      alert(this.translate.instant('FINANCIAL_REPORT.UPDATE_INVESTMENT_ERROR'));
      return;
    }

    if (numericValue === Number(this.financialSummary.initialInvestment || 0)) {
      return;
    }

    if (Number.isFinite(numericValue)) {
      this.financialSummaryService.updateInitialInvestment(
        this.selectedHotelId,
        numericValue
      ).subscribe({
        next: (response) => {
          this.financialSummary!.initialInvestment = response.data.initialInvestment;
          const idx = this.hotels.findIndex((h: any) => h && h._id === this.selectedHotelId);
          if (idx >= 0) {
            this.hotels[idx] = { ...this.hotels[idx], initialInvestment: response.data.initialInvestment };
          }
          this.loadFinancialSummary();
        },
        error: (error) => {
          console.error('Error updating initial investment:', error);
          alert(this.translate.instant('FINANCIAL_REPORT.UPDATE_INVESTMENT_ERROR'));
        }
      });
    }
  }

  private parseVndInput(value: string): number {
    const raw = String(value ?? '').trim();
    if (!raw) return NaN;
    const cleaned = raw.replace(/[^\d-]/g, '');
    if (!cleaned || cleaned === '-') return NaN;
    return Number(cleaned);
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
      depreciationRate: config.depreciationRate ?? 10,
      loanPercentage: config.loanPercentage ?? 70,
      interestRate: config.interestRate ?? 8,
      taxRate: config.taxRate ?? 20,
      wacc: config.wacc ?? 9,
      projectionYears: config.projectionYears ?? 10
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

  getWaccThreshold(): number {
    const wacc = this.financialSummary?.financialConfig?.wacc;
    const num = Number(wacc);
    return Number.isFinite(num) ? num : 9;
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

