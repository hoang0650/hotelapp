import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FinancialSummaryService, FinancialSummary, FinancialSummaryQuery, FinancialConfig } from '../../services/financial-summary.service';
import { AuthService } from '../../services/auth.service';
import { HotelService } from '../../services/hotel.service';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';

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
    private fb: FormBuilder
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

  loadHotels(): void {
    this.hotelService.getHotels().subscribe({
      next: (response) => {
        this.hotels = Array.isArray(response) ? response : [];
        // Nếu chỉ có 1 khách sạn, tự động chọn
        if (this.hotels.length === 1) {
          this.selectedHotelId = this.hotels[0]._id;
        } else {
          const currentUser = this.authService.getCurrentUser();
          if (currentUser && (currentUser as any).hotelId) {
            this.selectedHotelId = (currentUser as any).hotelId;
          }
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

    const newInvestment = prompt('Nhập vốn đầu tư ban đầu (VND):', this.financialSummary.initialInvestment.toString());
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
          alert('Có lỗi xảy ra khi cập nhật vốn đầu tư');
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
        alert('Có lỗi xảy ra khi cập nhật cấu hình tài chính: ' + (error.error?.message || error.message));
      }
    });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(value);
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
      alert('Vui lòng chọn khách sạn');
      return;
    }

    this.exporting = true;
    const queryParams = new URLSearchParams({
      hotelId: this.selectedHotelId,
      startDate: format(this.startDate, 'yyyy-MM-dd'),
      endDate: format(this.endDate, 'yyyy-MM-dd')
    });

    const url = `https://nest-production-8106.up.railway.app/financial-summary/export-excel?${queryParams.toString()}`;
    
    // Lấy token từ localStorage
    const token = localStorage.getItem('token');
    
    if (!token) {
      alert('Vui lòng đăng nhập để xuất file Excel');
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
        throw new Error('Lỗi khi xuất file Excel');
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
      alert('Có lỗi xảy ra khi xuất file Excel');
      this.exporting = false;
    });
  }
}

