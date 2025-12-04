import { Component, OnInit, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import * as Highcharts from 'highcharts';
import { HotelService } from '../../services/hotel.service';

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

  constructor(private hotelService: HotelService) {}

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
    
    // Sử dụng API thật từ backend
    this.hotelService.getHotelRevenueByPeriod(this.hotelId, this.selectedPeriod).subscribe({
      next: (data) => {
        this.labels = data.labels;
        this.revenueData = data.revenueData;
        this.paymentData = data.paymentData;
        this.expenseData = data.expenseData || [];
        
        // Chỉ cập nhật totalRevenue, totalPayment và totalExpense nếu không được truyền từ bên ngoài
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
      error: (error) => {
        console.error('Error loading hotel revenue:', error);
        // Fallback về mock data nếu API lỗi
        if (this.hotelId) {
          this.hotelService.getHotelRevenueMock(this.hotelId, this.selectedPeriod).subscribe({
            next: (mockData) => {
              this.labels = mockData.labels;
              this.revenueData = mockData.revenueData;
              this.paymentData = mockData.paymentData;
              this.expenseData = mockData.expenseData || [];
              
              if (this.totalRevenue === 0 || !this.totalRevenue) {
                this.totalRevenue = mockData.totalRevenue;
              }
              if (this.totalPayment === 0 || !this.totalPayment) {
                this.totalPayment = mockData.totalPayment;
              }
              if (this.totalExpense === 0 || !this.totalExpense) {
                this.totalExpense = mockData.totalExpense || 0;
              }
              
              this.updateChart();
              this.isLoading = false;
            },
            error: (mockError) => {
              console.error('Error loading mock revenue:', mockError);
              this.isLoading = false;
            }
          });
        } else {
          this.isLoading = false;
        }
      }
    });
  }

  updateChart(): void {
    const title = `Tổng Thu và Tổng Chi ${this.getHotelTitle()}`;
    
    this.chartOptions = {
      chart: { type: 'column' },
      title: { text: title },
      xAxis: { 
        categories: this.labels,
        title: { text: this.getPeriodTitle(this.selectedPeriod) }
      },
      yAxis: { 
        title: { text: 'Số Tiền (VNĐ)' },
        labels: {
          formatter: function() {
            return Highcharts.numberFormat(this.value as number, 0, ',', '.') + ' đ';
          }
        }
      },
      tooltip: {
        shared: true,
        valueDecimals: 0,
        valuePrefix: '',
        valueSuffix: ' đ',
        pointFormat: '<span style="color:{series.color}">{series.name}</span>: <b>{point.y}</b> đ<br/>'
      },
      plotOptions: {
        line: {
          dataLabels: {
            enabled: false
          },
          enableMouseTracking: true
        }
      },
      series: [
        {
          name: 'Tổng Thu',
          data: this.revenueData,
          type: 'column',
          color: '#1890ff'
        },
        {
          name: 'Tổng Chi',
          data: this.expenseData.length > 0 ? this.expenseData : new Array(this.revenueData.length).fill(0),
          type: 'column',
          color: '#ff4d4f'
        }
      ],
      accessibility: {
        enabled: false
      },
      credits: {
        enabled: false
      }
    };
  }

  onPeriodChange(period: 'day' | 'week' | 'month'): void {
    this.selectedPeriod = period;
    this.periodChange.emit(period);
    this.loadHotelRevenue();
  }

  getPeriodTitle(period: 'day' | 'week' | 'month'): string {
    switch (period) {
      case 'day': return 'Ngày';
      case 'week': return 'Tuần';
      case 'month': return 'Tháng';
      default: return '';
    }
  }
  
  getHotelTitle(): string {
    if (!this.hotelId) return '';
    return `Theo ${this.getPeriodTitle(this.selectedPeriod)}`;
  }
  
  // Định dạng số tiền VND
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  }
}
