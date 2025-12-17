import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface FinancialSummary {
  totalRevenue: number;          // Tổng doanh thu
  totalCosts: number;            // Tổng chi phí
  profit: number;                // Lợi nhuận = Doanh thu - Chi phí
  initialInvestment: number;     // Vốn đầu tư ban đầu
  monthlyProfit: number;         // Lợi nhuận trung bình/tháng
  paybackPeriod: number;         // Thời gian hoàn vốn (tháng)
  paybackPeriodDays: number;      // Thời gian hoàn vốn (ngày)
  breakdown: {
    revenue: {
      roomRevenue: number;       // Doanh thu phòng
      roomRevenueDaily?: number; // Doanh thu phòng/ngày
      roomRevenueMonthly?: number; // Doanh thu phòng/tháng
      roomRevenueYearly?: number; // Doanh thu phòng/năm
      serviceRevenue: number;     // Doanh thu dịch vụ
      cafeRevenue?: number;        // Doanh thu café
      otherServiceRevenue?: number; // Doanh thu dịch vụ khác
      otherRevenue: number;       // Doanh thu khác
    };
    costs: {
      expenses: number;          // Chi phí (phiếu chi)
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
  private apiUrl = 'https://nest-production-8106.up.railway.app/financial-summary';

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
}

