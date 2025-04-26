import { Component, OnInit, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import * as Highcharts from 'highcharts';

@Component({
  selector: 'app-revenue-chart',
  templateUrl: './revenue-chart.component.html',
  styleUrls: ['./revenue-chart.component.css']
})
export class RevenueChartComponent implements OnInit, OnChanges {
  @Input() labels: string[] = [];
  @Input() revenueData: number[] = [];
  @Input() paymentData: number[] = []; // Thêm input cho dữ liệu thanh toán
  @Input() selectedPeriod: 'day' | 'week' | 'month' = 'day'; // Thêm input cho khoảng thời gian
  @Output() periodChange = new EventEmitter<'day' | 'week' | 'month'>();

  public Highcharts = Highcharts;
  public chartOptions: Highcharts.Options = {};

  ngOnInit(): void {
    this.updateChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Cập nhật biểu đồ khi dữ liệu đầu vào thay đổi
    if (changes['labels'] || changes['revenueData'] || changes['paymentData']) {
      this.updateChart();
    }
    // Không cần thiết nếu selectedPeriod chỉ thay đổi từ parent
    // if (changes['selectedPeriod']) {
    //   this.updateChart(); 
    // }
  }

  updateChart(): void {
    this.chartOptions = {
      chart: { type: 'line' }, // Có thể đổi loại biểu đồ (column, bar,...)
      title: { 
        text: `Doanh Thu và Thanh Toán Theo ${this.getPeriodTitle(this.selectedPeriod)}` 
      },
      xAxis: { 
        categories: this.labels, // Sử dụng labels từ input
        title: {
          text: this.getPeriodTitle(this.selectedPeriod)
        }
      },
      yAxis: { 
        title: { text: 'Số Tiền (VNĐ)' } // Đơn vị tiền tệ
      },
      tooltip: {
          shared: true,
          valueSuffix: ' VNĐ'
      },
      plotOptions: {
          line: {
              dataLabels: {
                  enabled: true
              },
              enableMouseTracking: true
          }
      },
      series: [
        {
          name: 'Tổng Doanh Thu',
          data: this.revenueData, // Sử dụng revenueData từ input
          type: 'line'
        },
        {
          name: 'Tổng Thanh Toán',
          data: this.paymentData, // Sử dụng paymentData từ input
          type: 'line'
        }
      ]
    };
  }

  onPeriodChange(period: 'day' | 'week' | 'month'): void {
    // Phát sự kiện khi người dùng chọn khoảng thời gian khác
    this.periodChange.emit(period);
    // Component cha sẽ xử lý việc lấy dữ liệu mới và cập nhật Input
  }

  getPeriodTitle(period: 'day' | 'week' | 'month'): string {
    switch (period) {
      case 'day': return 'Ngày';
      case 'week': return 'Tuần';
      case 'month': return 'Tháng';
      default: return '';
    }
  }
}
