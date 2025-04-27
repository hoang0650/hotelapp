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
  @Input() selectedPeriod: 'day' | 'week' | 'month' = 'day'; // Thêm input cho khoảng thời gian
  @Input() totalRevenue: number = 0;
  @Input() totalPayment: number = 0;
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
      this.loadHotelRevenue();
    }
    
    if (changes['selectedPeriod'] && !changes['selectedPeriod'].firstChange) {
      this.loadHotelRevenue();
    }
    
    // Cập nhật biểu đồ khi dữ liệu từ input thay đổi
    if (changes['labels'] || changes['revenueData'] || changes['paymentData'] || 
        changes['totalRevenue'] || changes['totalPayment']) {
      this.updateChart();
    }
  }

  loadHotelRevenue(): void {
    if (!this.hotelId) return;
    
    // Nếu đã có dữ liệu từ input, không cần gọi API
    if (this.labels.length > 0 && this.revenueData.length > 0) {
      this.updateChart();
      return;
    }
    
    this.isLoading = true;
    
    // Sử dụng API mock vì API thật chưa tồn tại
    this.hotelService.getHotelRevenueMock(this.hotelId, this.selectedPeriod).subscribe({
      next: (data) => {
        this.labels = data.labels;
        this.revenueData = data.revenueData;
        this.paymentData = data.paymentData;
        
        // Chỉ cập nhật totalRevenue và totalPayment nếu không được truyền từ bên ngoài
        if (this.totalRevenue === 0) {
          this.totalRevenue = data.totalRevenue;
        }
        if (this.totalPayment === 0) {
          this.totalPayment = data.totalPayment;
        }
        
        this.updateChart();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading hotel revenue:', error);
        this.isLoading = false;
      }
    });
  }

  updateChart(): void {
    const title = `Doanh Thu và Thanh Toán ${this.getHotelTitle()}`;
    
    this.chartOptions = {
      chart: { type: 'line' },
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
          name: 'Doanh Thu',
          data: this.revenueData,
          type: 'line',
          color: '#1890ff'
        },
        {
          name: 'Thanh Toán',
          data: this.paymentData,
          type: 'line',
          color: '#52c41a'
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
