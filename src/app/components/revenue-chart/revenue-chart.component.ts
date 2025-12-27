import { Component, OnInit, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import * as Highcharts from 'highcharts';
import { HotelService } from '../../services/hotel.service';
import { ShiftHandoverService } from '../../services/shift-handover.service';
import { TransactionService } from '../../services/transaction.service';
import { FinancialSummaryService } from '../../services/financial-summary.service';
import { format, startOfDay, startOfWeek, startOfMonth, endOfDay, endOfWeek, endOfMonth, subDays, subWeeks, subMonths } from 'date-fns';
import { forkJoin } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-revenue-chart',
  templateUrl: './revenue-chart.component.html',
  styleUrls: ['./revenue-chart.component.css']
})
export class RevenueChartComponent implements OnInit, OnChanges {
  @Input() hotelId: string | null = null;
  @Input() labels: string[] = [];
  @Input() revenueData: number[] = [];
  @Input() paymentData: number[] = []; // Thêm input cho dữ liệu thanh toán
  @Input() expenseData: number[] = []; // Thêm input cho dữ liệu chi
  @Input() selectedPeriod: 'day' | 'week' | 'month' = 'day'; // Thêm input cho khoảng thời gian
  @Input() totalRevenue: number = 0;
  @Input() totalPayment: number = 0;
  @Input() totalExpense: number = 0; // Thêm input cho tổng chi
  @Output() periodChange = new EventEmitter<'day' | 'week' | 'month'>();

  public Highcharts = Highcharts;
  public chartOptions: Highcharts.Options = {};
  
  public isLoading = false;

  constructor(
    private hotelService: HotelService,
    private shiftHandoverService: ShiftHandoverService,
    private transactionService: TransactionService,
    private financialSummaryService: FinancialSummaryService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.loadHotelRevenue();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['hotelId'] && !changes['hotelId'].firstChange) {
      // Reset dữ liệu khi hotelId thay đổi
      this.labels = [];
      this.revenueData = [];
      this.paymentData = [];
      this.loadHotelRevenue();
    }
    
    if (changes['selectedPeriod'] && !changes['selectedPeriod'].firstChange) {
      // Reset dữ liệu khi period thay đổi
      this.labels = [];
      this.revenueData = [];
      this.paymentData = [];
      this.expenseData = [];
      this.loadHotelRevenue();
    }
    
    // Cập nhật biểu đồ khi dữ liệu từ input thay đổi (chỉ khi có dữ liệu từ parent)
    if ((changes['labels'] || changes['revenueData'] || changes['paymentData'] || changes['expenseData']) && 
        this.labels.length > 0 && this.revenueData.length > 0) {
      this.updateChart();
    }
    
    // Cập nhật totalRevenue, totalPayment và totalExpense từ input
    if (changes['totalRevenue'] || changes['totalPayment'] || changes['totalExpense']) {
      this.updateChart();
    }
  }

  loadHotelRevenue(): void {
    if (!this.hotelId) return;
    
    // Nếu đã có dữ liệu từ input, không cần gọi API
    if (this.labels.length > 0 && this.revenueData.length > 0 && this.totalRevenue > 0) {
      this.updateChart();
      return;
    }
    
    this.isLoading = true;
    
    // Tính toán khoảng thời gian dựa trên period
    const now = new Date();
    let startDate: Date;
    let endDate = now;
    
    switch (this.selectedPeriod) {
      case 'day':
        startDate = subDays(now, 6); // 7 ngày gần nhất
        break;
      case 'week':
        startDate = subWeeks(now, 3); // 4 tuần gần nhất
        break;
      case 'month':
        startDate = subMonths(now, 11); // 12 tháng gần nhất
        break;
      default:
        startDate = subDays(now, 6);
    }
    
    // Lấy dữ liệu từ shift handover history (không cần incomes API nữa)
    this.shiftHandoverService.getShiftHandoverHistory({
      hotelId: this.hotelId,
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
      page: 1,
      limit: 1000 // Lấy tối đa 1000 records
    }).subscribe({
      next: (response) => {
        const shiftHandovers = response.data || [];
        
        // Nhóm dữ liệu theo period và tính toán (tính incomeAmount từ shift-handover-history)
        const groupedData = this.groupShiftHandoversByPeriod(shiftHandovers, this.selectedPeriod);
        
        this.labels = groupedData.labels;
        this.revenueData = groupedData.revenueData;
        this.expenseData = groupedData.expenseData;
        this.paymentData = groupedData.paymentData;
        
        // Tính tổng tiền phòng từ shift-handover-history (totalRoomRevenue) - dùng cho payment
        const totalRoomRevenue = shiftHandovers.reduce((sum, record) => {
          return sum + (record.totalRoomRevenue || 0);
        }, 0);
        
        // Tổng thanh toán = tổng tiền từ room history (giống totalRoomRevenue)
        this.totalPayment = totalRoomRevenue;
        
        // Tổng chi = tổng expenseAmount từ expenses
        this.totalExpense = shiftHandovers.reduce((sum, record) => {
          if (record.expenses && Array.isArray(record.expenses)) {
            return sum + record.expenses.reduce((expenseSum: number, expense: any) => {
              return expenseSum + (expense.amount || 0);
            }, 0);
          }
          return sum + (record.expenseAmount || 0);
        }, 0);
        
        // Tính tổng doanh thu từ Financial Summary Service (giống như financial-summary-report)
        // Sử dụng cùng logic với financial-summary-report để đảm bảo tính toán nhất quán
        // Lưu shiftHandovers để dùng trong fallback nếu cần
        this.loadTotalRevenueFromFinancialSummary(startDate, endDate, shiftHandovers);
        
        this.updateChart();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading shift handover history:', error);
        // Fallback về API cũ nếu lỗi
        this.hotelService.getHotelRevenueByPeriod(this.hotelId!, this.selectedPeriod).subscribe({
          next: (data) => {
            this.labels = data.labels;
            this.revenueData = data.revenueData;
            this.paymentData = data.paymentData;
            this.expenseData = data.expenseData || [];
            
            if (this.totalRevenue === 0 || !this.totalRevenue) {
              this.totalRevenue = data.totalRevenue;
            }
            if (this.totalPayment === 0 || !this.totalPayment) {
              this.totalPayment = data.totalPayment;
            }
            if (this.totalExpense === 0 || !this.totalExpense) {
              this.totalExpense = data.totalExpense || 0;
            }
            
            this.updateChart();
            this.isLoading = false;
          },
          error: (fallbackError) => {
            console.error('Error loading fallback revenue:', fallbackError);
            this.isLoading = false;
          }
        });
      }
    });
  }
  
  // Nhóm dữ liệu shift handover theo period
  // Theo công thức: Tổng doanh thu = Tổng tiền phòng (totalRoomRevenue) + Phiếu thu (incomeAmount) từ shift-handover-history
  private groupShiftHandoversByPeriod(
    shiftHandovers: any[], 
    period: 'day' | 'week' | 'month'
  ): { labels: string[], revenueData: number[], expenseData: number[], paymentData: number[] } {
    const grouped: { [key: string]: { revenue: number, expense: number, payment: number } } = {};
    
    shiftHandovers.forEach(record => {
      // Lấy thời gian giao ca để nhóm theo period
      const handoverDate = new Date(record.handoverTime);
      let key: string;
      
      switch (period) {
        case 'day':
          key = format(handoverDate, 'yyyy-MM-dd');
          break;
        case 'week':
          key = format(startOfWeek(handoverDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
          break;
        case 'month':
          key = format(startOfMonth(handoverDate), 'yyyy-MM');
          break;
        default:
          key = format(handoverDate, 'yyyy-MM-dd');
      }
      
      if (!grouped[key]) {
        grouped[key] = { revenue: 0, expense: 0, payment: 0 };
      }
      
      // Tính doanh thu từ shift-handover-history:
      // - totalRoomRevenue: Tổng tiền phòng từ shift handover record
      // - incomeAmount: Phiếu thu từ shift handover record
      // Tổng doanh thu = totalRoomRevenue + incomeAmount
      const roomRevenue = record.totalRoomRevenue || 0;
      const incomeAmount = record.incomeAmount || 0;
      const totalRevenue = roomRevenue + incomeAmount;
      
      grouped[key].revenue += totalRevenue;
      grouped[key].payment += roomRevenue; // Payment chỉ tính tiền phòng
      
      // Tính chi phí từ expenses
      let expenseAmount = 0;
      if (record.expenses && Array.isArray(record.expenses)) {
        expenseAmount = record.expenses.reduce((sum: number, expense: any) => {
          return sum + (expense.amount || 0);
        }, 0);
      } else {
        expenseAmount = record.expenseAmount || 0;
      }
      
      grouped[key].expense += expenseAmount;
    });
    
    // Sắp xếp keys và tạo arrays
    const sortedKeys = Object.keys(grouped).sort();
    const labels: string[] = [];
    const revenueData: number[] = [];
    const expenseData: number[] = [];
    const paymentData: number[] = [];
    
    sortedKeys.forEach(key => {
      // Format label
      let label: string;
      if (period === 'day' || period === 'week') {
        const parts = key.split('-');
        if (parts.length === 3) {
          label = `${parts[2]}/${parts[1]}`;
        } else {
          label = key;
        }
      } else if (period === 'month') {
        const parts = key.split('-');
        if (parts.length === 2) {
          label = `${parts[1]}/${parts[0]}`;
        } else {
          label = key;
        }
      } else {
        label = key;
      }
      
      labels.push(label);
      revenueData.push(grouped[key].revenue);
      expenseData.push(grouped[key].expense);
      paymentData.push(grouped[key].payment);
    });
    
    return { labels, revenueData, expenseData, paymentData };
  }

  updateChart(): void {
    const periodTitle = this.getPeriodTitle(this.selectedPeriod);
    const title = `${this.translate.instant('REVENUE_CHART.CHART_TITLE')} ${this.translate.instant('REVENUE_CHART.BY_PERIOD', { period: periodTitle })}`;
    
    // Đảm bảo expenseData có cùng độ dài với revenueData và không có giá trị âm
    const processedExpenseData = this.expenseData.length > 0 
      ? this.expenseData.map(val => Math.abs(val || 0))
      : new Array(this.revenueData.length).fill(0);
    
    // Đảm bảo revenueData không có giá trị âm
    const processedRevenueData = this.revenueData.map(val => Math.abs(val || 0));
    
    // Tính toán min và max cho yAxis để hiển thị đẹp hơn
    const allValues = [...processedRevenueData, ...processedExpenseData];
    const maxValue = Math.max(...allValues, 0);
    const minValue = Math.min(...allValues, 0);
    const yAxisMax = maxValue > 0 ? maxValue * 1.2 : 100000; // Thêm 20% padding
    
    const totalRevenueLabel = this.translate.instant('REVENUE_CHART.TOTAL_REVENUE_SERIES');
    const totalExpenseLabel = this.translate.instant('REVENUE_CHART.TOTAL_EXPENSE_SERIES');
    const profitLabel = this.translate.instant('REVENUE_CHART.PROFIT');
    
    this.chartOptions = {
      chart: { 
        type: 'column',
        backgroundColor: 'transparent',
        spacing: [20, 20, 20, 20],
        animation: {
          duration: 1000
        }
      },
      title: { 
        text: title,
        style: {
          fontSize: '18px',
          fontWeight: '600',
          color: '#262626'
        },
        align: 'left',
        margin: 30
      },
      xAxis: { 
        categories: this.labels,
        title: { 
          text: this.getPeriodTitle(this.selectedPeriod),
          style: {
            fontSize: '14px',
            color: '#595959'
          }
        },
        gridLineColor: '#f0f0f0',
        lineColor: '#d9d9d9',
        tickColor: '#d9d9d9',
        labels: {
          style: {
            fontSize: '12px',
            color: '#8c8c8c'
          }
        }
      },
      yAxis: { 
        title: { 
          text: this.translate.instant('REVENUE_CHART.AMOUNT_LABEL'),
          style: {
            fontSize: '14px',
            color: '#595959'
          }
        },
        min: 0,
        max: yAxisMax,
        labels: {
          formatter: function() {
            const value = this.value as number;
            if (value >= 1000000) {
              return (value / 1000000).toFixed(1) + 'M đ';
            } else if (value >= 1000) {
              return (value / 1000).toFixed(0) + 'K đ';
            }
            return Highcharts.numberFormat(value, 0, ',', '.') + ' đ';
          },
          style: {
            fontSize: '12px',
            color: '#8c8c8c'
          }
        },
        gridLineColor: '#f0f0f0',
        lineColor: '#d9d9d9'
      },
      tooltip: {
        shared: true,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#d9d9d9',
        borderRadius: 8,
        shadow: {
          color: 'rgba(0, 0, 0, 0.1)',
          offsetX: 0,
          offsetY: 2,
          opacity: 0.1,
          width: 4
        },
        style: {
          fontSize: '13px',
          color: '#262626'
        },
        useHTML: true,
        formatter: function() {
          let tooltip = '<div style="padding: 8px 0;">';
          tooltip += '<div style="font-weight: 600; margin-bottom: 8px; color: #262626; font-size: 14px;">' + this.x + '</div>';
          
          this.points?.forEach((point: any) => {
            const value = Math.abs(point.y || 0);
            const formattedValue = Highcharts.numberFormat(value, 0, ',', '.');
            const color = point.color;
            const icon = point.series.name === totalRevenueLabel ? '▲' : '▼';
            
            tooltip += `<div style="display: flex; align-items: center; margin-bottom: 6px;">
              <span style="display: inline-block; width: 12px; height: 12px; background-color: ${color}; border-radius: 2px; margin-right: 8px;"></span>
              <span style="color: #595959; margin-right: 8px;">${point.series.name}:</span>
              <span style="font-weight: 600; color: ${color}; font-size: 14px;">${icon} ${formattedValue} đ</span>
            </div>`;
          });
          
          // Tính tổng lợi nhuận nếu có cả thu và chi
          if (this.points && this.points.length === 2) {
            const revenue = Math.abs(this.points[0].y || 0);
            const expense = Math.abs(this.points[1].y || 0);
            const profit = revenue - expense;
            const profitColor = profit >= 0 ? '#52c41a' : '#ff4d4f';
            const profitIcon = profit >= 0 ? '✓' : '✗';
            const formattedProfit = Highcharts.numberFormat(Math.abs(profit), 0, ',', '.');
            
            tooltip += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #f0f0f0; display: flex; align-items: center;">
              <span style="color: #595959; margin-right: 8px; font-weight: 500;">${profitLabel}</span>
              <span style="font-weight: 600; color: ${profitColor}; font-size: 14px;">${profitIcon} ${formattedProfit} đ</span>
            </div>`;
          }
          
          tooltip += '</div>';
          return tooltip;
        }
      },
      plotOptions: {
        column: {
          borderRadius: 6,
          borderWidth: 0,
          groupPadding: 0.15,
          pointPadding: 0.1,
          dataLabels: {
            enabled: false
          },
          animation: {
            duration: 1000
          },
          states: {
            hover: {
              brightness: 0.1,
              borderColor: 'transparent'
            }
          }
        }
      },
      legend: {
        enabled: true,
        align: 'right',
        verticalAlign: 'top',
        layout: 'horizontal',
        itemStyle: {
          fontSize: '13px',
          color: '#595959',
          fontWeight: '400'
        },
        itemHoverStyle: {
          color: '#262626'
        },
        symbolRadius: 4,
        symbolPadding: 10,
        itemMarginBottom: 8
      },
      series: [
        {
          name: totalRevenueLabel,
          data: processedRevenueData,
          type: 'column',
          color: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, '#40a9ff'],
              [1, '#1890ff']
            ]
          },
          borderColor: '#1890ff',
          shadow: {
            color: 'rgba(24, 144, 255, 0.2)',
            offsetX: 0,
            offsetY: 2,
            opacity: 0.2,
            width: 3
          }
        },
        {
          name: totalExpenseLabel,
          data: processedExpenseData,
          type: 'column',
          color: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, '#ff7875'],
              [1, '#ff4d4f']
            ]
          },
          borderColor: '#ff4d4f',
          shadow: {
            color: 'rgba(255, 77, 79, 0.2)',
            offsetX: 0,
            offsetY: 2,
            opacity: 0.2,
            width: 3
          }
        }
      ],
      accessibility: {
        enabled: false
      },
      credits: {
        enabled: false
      },
      responsive: {
        rules: [{
          condition: {
            maxWidth: 768
          },
          chartOptions: {
            legend: {
              align: 'center',
              verticalAlign: 'bottom',
              layout: 'horizontal'
            },
            title: {
              style: {
                fontSize: '16px'
              }
            }
          }
        }]
      }
    };
  }

  onPeriodChange(period: 'day' | 'week' | 'month'): void {
    this.selectedPeriod = period;
    this.periodChange.emit(period);
    this.loadHotelRevenue();
  }

  reload(): void {
    // Reset dữ liệu trước khi tải lại
    this.labels = [];
    this.revenueData = [];
    this.paymentData = [];
    this.expenseData = [];
    this.totalRevenue = 0;
    this.totalPayment = 0;
    this.totalExpense = 0;
    // Tải lại dữ liệu
    this.loadHotelRevenue();
  }

  getPeriodTitle(period: 'day' | 'week' | 'month'): string {
    switch (period) {
      case 'day': return this.translate.instant('REVENUE_CHART.DAY');
      case 'week': return this.translate.instant('REVENUE_CHART.WEEK');
      case 'month': return this.translate.instant('REVENUE_CHART.MONTH');
      default: return '';
    }
  }
  
  getHotelTitle(): string {
    if (!this.hotelId) return '';
    return this.translate.instant('REVENUE_CHART.BY_PERIOD', { period: this.getPeriodTitle(this.selectedPeriod) });
  }
  
  // Định dạng số tiền VND
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  }

  /**
   * Load tổng doanh thu từ Financial Summary Service (giống như financial-summary-report)
   * Đảm bảo tính toán nhất quán giữa revenue-chart và financial-summary-report
   * Backend tính: totalRevenue = roomRevenue + serviceRevenue + receiptRevenue + cafeRevenue + otherServiceRevenue + otherRevenue
   */
  private loadTotalRevenueFromFinancialSummary(startDate: Date, endDate: Date, shiftHandovers?: any[]): void {
    if (!this.hotelId) {
      return;
    }

    this.financialSummaryService.getFinancialSummary({
      hotelId: this.hotelId,
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd')
    }).subscribe({
      next: (response) => {
        if (response && response.data) {
          // Sử dụng totalRevenue từ financial summary (đã được tính từ backend)
          // Backend tính: totalRevenue = roomRevenue + serviceRevenue + receiptRevenue + cafeRevenue + otherServiceRevenue + otherRevenue
          this.totalRevenue = response.data.totalRevenue || 0;
          // Cập nhật lại chart sau khi có totalRevenue
          this.updateChart();
        }
      },
      error: (error) => {
        console.error('Error loading total revenue from financial summary:', error);
        // Fallback: tính từ shift handover nếu không load được từ financial summary
        if (shiftHandovers && shiftHandovers.length > 0) {
          const totalRoomRevenue = shiftHandovers.reduce((sum: number, record: any) => {
            return sum + (record.totalRoomRevenue || 0);
          }, 0);
          
          const totalIncome = shiftHandovers.reduce((sum: number, record: any) => {
            return sum + (record.incomeAmount || 0);
          }, 0);
          
          // Tổng doanh thu = tổng tiền phòng + phiếu thu từ lịch sử giao ca
          this.totalRevenue = totalRoomRevenue + totalIncome;
          this.updateChart();
        }
      }
    });
  }
}