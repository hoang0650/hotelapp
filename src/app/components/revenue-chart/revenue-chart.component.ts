import { Component, OnInit } from '@angular/core';
import * as Highcharts from 'highcharts';

@Component({
  selector: 'app-revenue-chart',
  templateUrl: './revenue-chart.component.html',
  styleUrls: ['./revenue-chart.component.css']
})
export class RevenueChartComponent implements OnInit {
  public Highcharts = Highcharts;
  public chartOptions: Highcharts.Options = {};
  public tabs = [
    { title: 'Ngày', key: 'daily' },
    { title: 'Tuần', key: 'weekly' },
    { title: 'Tháng', key: 'monthly' },
    { title: 'Năm', key: 'yearly' }
  ];

  public currentTab = 'monthly';

  ngOnInit(): void {
    this.updateChartData('monthly'); // Default to daily
  }

  updateChartData(period: string): void {
    this.currentTab = period;
    switch (period) {
      case 'daily':
        this.chartOptions = {
          chart: { type: 'line' },
          title: { text: 'Doanh Thu Theo Ngày' },
          xAxis: { categories: ['Ngày 1', 'Ngày 2', 'Ngày 3', 'Ngày 4'] },
          yAxis: { title: { text: 'Doanh Thu' } },
          series: [{ name: 'Doanh Thu', data: [100, 200, 150, 300], type: 'line' }]
        };
        break;
      case 'weekly':
        this.chartOptions = {
          chart: { type: 'line' },
          title: { text: 'Doanh Thu Theo Tuần' },
          xAxis: { categories: ['Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4'] },
          yAxis: { title: { text: 'Doanh Thu' } },
          series: [{ name: 'Doanh Thu', data: [400, 500, 600, 700], type: 'line' }]
        };
        break;
      case 'monthly':
        this.chartOptions = {
          chart: { type: 'line' },
          title: { text: 'Doanh Thu Theo Tháng' },
          xAxis: { categories: ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4'] },
          yAxis: { title: { text: 'Doanh Thu' } },
          series: [{ name: 'Doanh Thu', data: [1000, 1200, 1400, 1600], type: 'line' }]
        };
        break;
      case 'yearly':
        this.chartOptions = {
          chart: { type: 'line' },
          title: { text: 'Doanh Thu Theo Năm' },
          xAxis: { categories: ['Năm 1', 'Năm 2', 'Năm 3', 'Năm 4'] },
          yAxis: { title: { text: 'Doanh Thu' } },
          series: [{ name: 'Doanh Thu', data: [5000, 6000, 7000, 8000], type: 'line' }]
        };
        break;
    }
  }
}
