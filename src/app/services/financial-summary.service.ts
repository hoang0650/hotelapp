import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface FinancialConfig {
  depreciationRate?: number;      // % khấu hao mỗi năm
  loanPercentage?: number;        // % vốn vay
  interestRate?: number;          // % lãi suất vay/năm
  taxRate?: number;              // % thuế suất
  wacc?: number;                 // % WACC
  projectionYears?: number;      // Số năm projection cho NPV/IRR
}

export interface FinancialSummary {
  totalRevenue: number;          // Tổng doanh thu
  totalCosts: number;            // Tổng chi phí
  profit: number;                // Lợi nhuận = Doanh thu - Chi phí
  initialInvestment: number;     // Vốn đầu tư ban đầu
  monthlyProfit: number;         // Lợi nhuận trung bình/tháng
  paybackPeriod: number;         // Thời gian hoàn vốn (tháng)
  paybackPeriodDays: number;      // Thời gian hoàn vốn (ngày)
  depreciation?: number;          // Khấu hao
  interest?: number;             // Lãi vay
  profitBeforeTax?: number;      // Lợi nhuận trước thuế
  tax?: number;                  // Thuế
  profitAfterTax?: number;       // Lợi nhuận sau thuế
  npv?: number;                  // Net Present Value (triệu đồng)
  irr?: number;                  // Internal Rate of Return (%)
  financialConfig?: FinancialConfig; // Cấu hình tài chính
  breakdown: {
    revenue: {
      roomRevenue: number;       // Doanh thu phòng
      roomRevenueDaily?: number; // Doanh thu phòng/ngày
      roomRevenueMonthly?: number; // Doanh thu phòng/tháng
      roomRevenueYearly?: number; // Doanh thu phòng/năm
      serviceRevenue: number;     // Doanh thu dịch vụ
      cafeRevenue?: number;        // Doanh thu café
      otherServiceRevenue?: number; // Doanh thu dịch vụ khác
      receiptRevenue?: number;     // Doanh thu từ phiếu thu
      otherRevenue: number;       // Doanh thu khác
    };
    costs: {
      expenses: number;          // Chi phí (phiếu chi)
      receiptExpenses?: number;  // Tổng phiếu chi (tương tự receiptRevenue)
      utilities: number;         // Tiện ích
      salary: number;            // Lương
      supplies: number;          // Vật tư
      maintenance: number;       // Bảo trì
      marketing: number;         // Marketing
      training?: number;         // Chi phí đào tạo
      serviceCost?: number;      // Chi phí giá vốn dịch vụ
      other: number;             // Khác
    };
  };
  period: {
    startDate: string;
    endDate: string;
  };
}

export interface FinancialSummaryQuery {
  hotelId?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FinancialSummaryService {
  private apiUrl = `${environment.apiUrl}/financial-summary`;

  constructor(private http: HttpClient) { }

  /**
   * Lấy báo cáo tổng hợp tài chính
   */
  getFinancialSummary(query: FinancialSummaryQuery): Observable<{ message: string; data: FinancialSummary }> {
    let params = new HttpParams();
    
    if (query.hotelId) {
      params = params.set('hotelId', query.hotelId);
    }
    if (query.startDate) {
      params = params.set('startDate', query.startDate);
    }
    if (query.endDate) {
      params = params.set('endDate', query.endDate);
    }
    
    return this.http.get<{ message: string; data: FinancialSummary }>(this.apiUrl, { params });
  }

  /**
   * Cập nhật vốn đầu tư ban đầu cho khách sạn
   */
  updateInitialInvestment(hotelId: string, initialInvestment: number): Observable<{ message: string; data: { hotelId: string; initialInvestment: number } }> {
    return this.http.patch<{ message: string; data: { hotelId: string; initialInvestment: number } }>(
      `${this.apiUrl}/initial-investment/${hotelId}`,
      { initialInvestment }
    );
  }

  /**
   * Cập nhật cấu hình tài chính cho khách sạn
   */
  updateFinancialConfig(hotelId: string, financialConfig: FinancialConfig): Observable<{ message: string; data: { hotelId: string; financialConfig: FinancialConfig } }> {
    return this.http.patch<{ message: string; data: { hotelId: string; financialConfig: FinancialConfig } }>(
      `${this.apiUrl}/financial-config/${hotelId}`,
      { financialConfig }
    );
  }
}

