import {
  Component,
  OnInit,
  OnDestroy,
  Input,
  OnChanges,
  SimpleChanges,
  Output,
  EventEmitter,
  ChangeDetectorRef
} from '@angular/core';
import * as Highcharts from 'highcharts';
import { HotelService } from '../../services/hotel.service';
import { ShiftHandoverService } from '../../services/shift-handover.service';
import {
  format,
  startOfDay,
  startOfWeek,
  startOfMonth,
  endOfDay,
  endOfWeek,
  endOfMonth,
  subDays,
  subWeeks,
  subMonths,
  addDays,
  addWeeks,
  addMonths
} from 'date-fns';
import { Subject, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-revenue-chart',
  templateUrl: './revenue-chart.component.html'
})
export class RevenueChartComponent implements OnInit, OnChanges, OnDestroy {
  @Input() hotelId: string | null = null;
  /** Optional seed từ parent — biểu đồ tự load chính, không phụ thuộc binding này để render. */
  @Input() labels: string[] = [];
  @Input() revenueData: number[] = [];
  @Input() paymentData: number[] = [];
  @Input() expenseData: number[] = [];
  @Input() selectedPeriod: 'day' | 'week' | 'month' = 'day';
  @Input() totalRevenue: number = 0;
  @Input() totalPayment: number = 0;
  @Input() totalExpense: number = 0;
  @Output() periodChange = new EventEmitter<'day' | 'week' | 'month'>();

  public Highcharts = Highcharts;
  public chartOptions: Highcharts.Options = {};
  /** Bắt buộc để highcharts-angular apply options mới. */
  public updateFlag = false;
  public oneToOneFlag = true;
  public chartInstance: Highcharts.Chart | null = null;

  public isLoading = false;
  public roomRevenue = 0;
  public serviceRevenue = 0;
  public cashTotal = 0;
  public bankTransferTotal = 0;
  public cardTotal = 0;
  public receiptExpenseTotal = 0;

  /** Series nội bộ dùng để vẽ — không bị parent Input ghi đè. */
  displayLabels: string[] = [];
  displayRevenue: number[] = [];
  displayExpense: number[] = [];
  displayPayment: number[] = [];

  private destroy$ = new Subject<void>();
  private loadToken = 0;
  private lastLoadedKey = '';
  private loadInFlightKey = '';

  constructor(
    private hotelService: HotelService,
    private shiftHandoverService: ShiftHandoverService,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.updateChart();
    // Mount qua *ngIf khi mở panel — load ngay, không chờ bấm reload
    if (this.normalizeHotelId(this.hotelId)) {
      this.loadHotelRevenue(true);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    const hotelChanged = !!changes['hotelId'];
    const periodChanged = !!changes['selectedPeriod'];

    if (hotelChanged || periodChanged) {
      const hotelId = this.normalizeHotelId(this.hotelId);
      if (!hotelId) {
        this.resetSeries();
        this.updateChart();
        return;
      }
      // firstChange / đổi hotel: force. Đổi period từ parent: dùng cache nếu vừa load từ radio.
      const force = hotelChanged || !!changes['hotelId']?.firstChange || !!changes['selectedPeriod']?.firstChange;
      this.loadHotelRevenue(force);
      return;
    }

    // Seed từ parent chỉ khi chưa có series nội bộ
    if (
      (changes['labels'] || changes['revenueData'] || changes['expenseData'] || changes['paymentData']) &&
      this.displayLabels.length === 0 &&
      Array.isArray(this.labels) &&
      this.labels.length > 0
    ) {
      this.applySeriesPayload({
        labels: this.labels,
        revenueData: this.revenueData || [],
        expenseData: this.expenseData || [],
        paymentData: this.paymentData || [],
        totalRevenue: this.totalRevenue,
        totalPayment: this.totalPayment,
        totalExpense: this.totalExpense
      });
    }

    if (changes['totalRevenue'] || changes['totalPayment'] || changes['totalExpense']) {
      if (changes['totalExpense'] && this.totalExpense != null) {
        this.receiptExpenseTotal = Number(this.totalExpense) || 0;
      }
      this.updateChart();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.chartInstance = null;
  }

  onChartInstance(chart: Highcharts.Chart): void {
    this.chartInstance = chart;
    // Collapse panel đôi khi render width=0 → reflow ngay khi có instance
    setTimeout(() => this.reflowChart(), 0);
  }

  loadHotelRevenue(force = false): void {
    const hotelId = this.normalizeHotelId(this.hotelId);
    if (!hotelId) {
      this.resetSeries();
      this.updateChart();
      return;
    }

    const loadKey = `${hotelId}:${this.selectedPeriod}`;
    if (!force && this.lastLoadedKey === loadKey && this.displayLabels.length > 0) {
      this.updateChart();
      return;
    }
    if (this.loadInFlightKey === loadKey && !force) {
      return;
    }

    const cached = this.hotelService.getCachedHotelRevenueByPeriod(hotelId, this.selectedPeriod);
    if (!force && cached?.payload) {
      this.applySeriesPayload(cached.payload);
      this.lastLoadedKey = loadKey;
      return;
    }

    const token = ++this.loadToken;
    this.loadInFlightKey = loadKey;
    this.isLoading = true;

    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (this.selectedPeriod) {
      case 'week':
        startDate = startOfWeek(subWeeks(now, 3), { weekStartsOn: 1 });
        endDate = endOfWeek(now, { weekStartsOn: 1 });
        break;
      case 'month':
        startDate = startOfMonth(subMonths(now, 11));
        endDate = endOfMonth(now);
        break;
      case 'day':
      default:
        startDate = startOfDay(subDays(now, 6));
        endDate = endOfDay(now);
        break;
    }

    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');

    this.shiftHandoverService
      .getRevenueByPeriod({
        hotelId,
        period: this.selectedPeriod,
        startDate: startStr,
        endDate: endStr
      })
      .pipe(
        takeUntil(this.destroy$),
        catchError((error) => {
          console.error('Error loading revenue from backend:', error);
          return this.hotelService.getHotelRevenueByPeriod(hotelId, this.selectedPeriod).pipe(
            catchError((fallbackError) => {
              console.error('Error loading fallback revenue:', fallbackError);
              return of({
                labels: [],
                revenueData: [],
                paymentData: [],
                expenseData: [],
                totalRevenue: 0,
                totalPayment: 0,
                totalExpense: 0
              });
            })
          );
        }),
        finalize(() => {
          if (token === this.loadToken) {
            this.isLoading = false;
            if (this.loadInFlightKey === loadKey) {
              this.loadInFlightKey = '';
            }
            this.cdr.markForCheck();
          }
        })
      )
      .subscribe((response: any) => {
        if (token !== this.loadToken) return;

        const normalized = this.normalizePeriodSeries({
          period: this.selectedPeriod,
          startDate,
          endDate,
          labels: response?.labels || [],
          revenueData: response?.revenueData || [],
          expenseData: response?.expenseData || [],
          paymentData: response?.paymentData || []
        });

        const payload = {
          labels: normalized.labels,
          revenueData: normalized.revenueData,
          expenseData: normalized.expenseData,
          paymentData: normalized.paymentData,
          totalRevenue: Number(response?.totalRevenue) || this.sum(normalized.revenueData),
          totalPayment: Number(response?.totalPayment) || this.sum(normalized.paymentData),
          totalExpense: Number(response?.totalExpense) || this.sum(normalized.expenseData)
        };

        this.hotelService.setCachedHotelRevenueByPeriod(hotelId, this.selectedPeriod, payload);
        this.applySeriesPayload(payload);
        this.lastLoadedKey = loadKey;

        // Breakdown giao ca — không chặn chart
        this.shiftHandoverService
          .getShiftHandoverHistory({
            hotelId,
            startDate: startStr,
            endDate: endStr,
            page: 1,
            limit: 5000
          })
          .pipe(
            takeUntil(this.destroy$),
            catchError(() => of({ data: [] }))
          )
          .subscribe((history: any) => {
            if (token !== this.loadToken) return;
            this.applyShiftHandoverBreakdown(history?.data || []);
            this.cdr.markForCheck();
          });
      });
  }

  private applySeriesPayload(payload: {
    labels?: string[];
    revenueData?: number[];
    expenseData?: number[];
    paymentData?: number[];
    totalRevenue?: number;
    totalPayment?: number;
    totalExpense?: number;
  }): void {
    this.displayLabels = Array.isArray(payload.labels) ? [...payload.labels] : [];
    this.displayRevenue = (payload.revenueData || []).map((v) => Math.abs(Number(v) || 0));
    this.displayExpense = (payload.expenseData || []).map((v) => Math.abs(Number(v) || 0));
    this.displayPayment = (payload.paymentData || []).map((v) => Math.abs(Number(v) || 0));

    // Đồng bộ độ dài series
    const len = this.displayLabels.length;
    while (this.displayRevenue.length < len) this.displayRevenue.push(0);
    while (this.displayExpense.length < len) this.displayExpense.push(0);
    while (this.displayPayment.length < len) this.displayPayment.push(0);

    this.totalRevenue = Number(payload.totalRevenue) || this.sum(this.displayRevenue);
    this.totalPayment = Number(payload.totalPayment) || this.sum(this.displayPayment);
    this.totalExpense = Number(payload.totalExpense) || this.sum(this.displayExpense);
    this.receiptExpenseTotal = this.totalExpense;

    this.updateChart();
  }

  private resetSeries(): void {
    this.displayLabels = [];
    this.displayRevenue = [];
    this.displayExpense = [];
    this.displayPayment = [];
    this.totalRevenue = 0;
    this.totalPayment = 0;
    this.totalExpense = 0;
    this.receiptExpenseTotal = 0;
    this.roomRevenue = 0;
    this.serviceRevenue = 0;
    this.cashTotal = 0;
    this.bankTransferTotal = 0;
    this.cardTotal = 0;
    this.lastLoadedKey = '';
  }

  private normalizeHotelId(value: any): string {
    if (!value) return '';
    if (typeof value === 'object') {
      return String(value._id || value.id || '').trim();
    }
    const id = String(value).trim();
    if (!id || id === 'undefined' || id === 'null' || id === '[object Object]') return '';
    return id;
  }

  private sum(values: number[]): number {
    return (values || []).reduce((s, v) => s + (Number(v) || 0), 0);
  }

  private normalizePeriodSeries(input: {
    period: 'day' | 'week' | 'month';
    startDate: Date;
    endDate: Date;
    labels: string[];
    revenueData: number[];
    expenseData: number[];
    paymentData: number[];
  }): { labels: string[]; revenueData: number[]; expenseData: number[]; paymentData: number[] } {
    const labelToIndex = new Map<string, number>();
    (input.labels || []).forEach((raw, idx) => {
      this.labelKeys(raw).forEach((key) => {
        if (!labelToIndex.has(key)) labelToIndex.set(key, idx);
      });
    });

    const labels: string[] = [];
    const revenueData: number[] = [];
    const expenseData: number[] = [];
    const paymentData: number[] = [];

    const pushPoint = (canonicalLabel: string, lookupKeys: string[]) => {
      let idx: number | undefined;
      for (const key of lookupKeys) {
        if (labelToIndex.has(key)) {
          idx = labelToIndex.get(key);
          break;
        }
      }
      labels.push(canonicalLabel);
      revenueData.push(idx === undefined ? 0 : Number(input.revenueData[idx] || 0));
      expenseData.push(idx === undefined ? 0 : Math.abs(Number(input.expenseData[idx] || 0)));
      paymentData.push(idx === undefined ? 0 : Number(input.paymentData[idx] || 0));
    };

    if (input.period === 'day') {
      let cursor = startOfDay(input.startDate);
      const end = startOfDay(input.endDate);
      while (cursor.getTime() <= end.getTime()) {
        const label = format(cursor, 'dd/MM');
        pushPoint(label, this.labelKeys(label, cursor));
        cursor = addDays(cursor, 1);
      }
      return { labels, revenueData, expenseData, paymentData };
    }

    if (input.period === 'week') {
      let cursor = startOfWeek(input.startDate, { weekStartsOn: 1 });
      const end = startOfWeek(input.endDate, { weekStartsOn: 1 });
      while (cursor.getTime() <= end.getTime()) {
        const label = format(cursor, 'dd/MM');
        pushPoint(label, this.labelKeys(label, cursor));
        cursor = addWeeks(cursor, 1);
      }
      return { labels, revenueData, expenseData, paymentData };
    }

    let cursor = startOfMonth(input.startDate);
    const end = startOfMonth(input.endDate);
    while (cursor.getTime() <= end.getTime()) {
      const label = format(cursor, 'MM/yyyy');
      pushPoint(label, this.labelKeys(label, cursor));
      cursor = addMonths(cursor, 1);
    }
    return { labels, revenueData, expenseData, paymentData };
  }

  /** Sinh các khóa khớp linh hoạt: MM/yyyy, yyyy-MM, MM-yyyy, ... */
  private labelKeys(raw: string, date?: Date): string[] {
    const keys = new Set<string>();
    const text = String(raw || '').trim();
    if (text) {
      keys.add(text);
      keys.add(text.replace(/-/g, '/'));
      keys.add(text.replace(/\//g, '-'));
    }

    if (date && !isNaN(date.getTime())) {
      keys.add(format(date, 'dd/MM'));
      keys.add(format(date, 'MM/yyyy'));
      keys.add(format(date, 'yyyy-MM'));
      keys.add(format(date, 'yyyy-MM-dd'));
      keys.add(format(date, 'MM-yyyy'));
    }

    // "07/2026" <-> "2026-07"
    const mY = text.match(/^(\d{2})[\/-](\d{4})$/);
    if (mY) {
      keys.add(`${mY[1]}/${mY[2]}`);
      keys.add(`${mY[2]}-${mY[1]}`);
    }
    const yM = text.match(/^(\d{4})[\/-](\d{2})$/);
    if (yM) {
      keys.add(`${yM[2]}/${yM[1]}`);
      keys.add(`${yM[1]}-${yM[2]}`);
    }

    return Array.from(keys);
  }

  private applyShiftHandoverBreakdown(shiftHandovers: any[]): void {
    const safe = Array.isArray(shiftHandovers) ? shiftHandovers : [];
    let roomRevenue = 0;
    let serviceRevenue = 0;
    let cashTotal = 0;
    let bankTransferTotal = 0;
    let cardTotal = 0;

    safe.forEach((record: any) => {
      cashTotal += Number(record?.cashAmount || 0);
      bankTransferTotal += Number(record?.bankTransferAmount || 0);
      cardTotal += Number(record?.cardPaymentAmount || 0);

      const roomHistory = Array.isArray(record?.roomHistory) ? record.roomHistory : [];
      roomHistory.forEach((room: any) => {
        const roomTotal = Number(room?.roomTotal || 0);
        const additionalCharges = Number(room?.additionalCharges || 0);
        const discount = Number(room?.discount || 0);
        const serviceAmount = Number(room?.serviceAmount || room?.serviceTotal || 0);
        roomRevenue += roomTotal + additionalCharges - discount;
        serviceRevenue += serviceAmount;
      });
    });

    this.roomRevenue = roomRevenue;
    this.serviceRevenue = serviceRevenue;
    this.cashTotal = cashTotal;
    this.bankTransferTotal = bankTransferTotal;
    this.cardTotal = cardTotal;
  }

  updateChart(): void {
    const periodTitle = this.getPeriodTitle(this.selectedPeriod);
    const title = `${this.translate.instant('REVENUE_CHART.CHART_TITLE')} ${this.translate.instant('REVENUE_CHART.BY_PERIOD', { period: periodTitle })}`;

    const processedExpenseData =
      this.displayExpense.length > 0
        ? this.displayExpense.map((val) => Math.abs(val || 0))
        : new Array(this.displayRevenue.length).fill(0);
    const processedRevenueData = this.displayRevenue.map((val) => Math.abs(val || 0));

    const allValues = [...processedRevenueData, ...processedExpenseData];
    const maxValue = allValues.length ? Math.max(...allValues, 0) : 0;
    const yAxisMax = maxValue > 0 ? maxValue * 1.2 : 100000;

    const totalRevenueLabel = this.translate.instant('REVENUE_CHART.TOTAL_REVENUE_SERIES');
    const totalExpenseLabel = this.translate.instant('REVENUE_CHART.TOTAL_EXPENSE_SERIES');
    const profitLabel = this.translate.instant('REVENUE_CHART.PROFIT');

    this.chartOptions = {
      chart: {
        type: 'column',
        backgroundColor: 'transparent',
        spacing: [20, 20, 20, 20],
        animation: { duration: 250 },
        height: 450
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
        categories: this.displayLabels,
        title: {
          text: this.getPeriodTitle(this.selectedPeriod),
          style: { fontSize: '14px', color: '#595959' }
        },
        gridLineColor: '#f0f0f0',
        lineColor: '#d9d9d9',
        tickColor: '#d9d9d9',
        labels: {
          rotation: this.selectedPeriod === 'month' ? -45 : 0,
          style: { fontSize: '12px', color: '#8c8c8c' }
        }
      },
      yAxis: {
        visible: false,
        min: 0,
        max: yAxisMax
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
        style: { fontSize: '13px', color: '#262626' },
        useHTML: true,
        formatter: function () {
          let tooltip = '<div style="padding: 8px 0;">';
          tooltip +=
            '<div style="font-weight: 600; margin-bottom: 8px; color: #262626; font-size: 14px;">' +
            this.x +
            '</div>';

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
          minPointLength: 2,
          dataLabels: {
            enabled: true,
            align: 'center',
            verticalAlign: 'top',
            crop: false,
            allowOverlap: false,
            style: {
              fontSize: '10px',
              fontWeight: '600',
              color: '#333',
              textOutline: 'none'
            },
            formatter: function () {
              const value = Math.abs(this.y || 0);
              if (value <= 0) return '';
              if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
              if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
              return Highcharts.numberFormat(value, 0, ',', '.');
            },
            y: -8
          },
          animation: { duration: 250 },
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
        itemHoverStyle: { color: '#262626' },
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
          borderColor: '#1890ff'
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
          borderColor: '#ff4d4f'
        }
      ],
      accessibility: { enabled: false },
      credits: { enabled: false },
      responsive: {
        rules: [
          {
            condition: { maxWidth: 768 },
            chartOptions: {
              legend: {
                align: 'center',
                verticalAlign: 'bottom',
                layout: 'horizontal'
              },
              title: { style: { fontSize: '16px' } }
            }
          }
        ]
      }
    };

    // Trigger highcharts-angular update
    this.updateFlag = true;
    this.cdr.detectChanges();
    setTimeout(() => this.reflowChart(), 0);
  }

  private reflowChart(): void {
    try {
      this.chartInstance?.reflow();
    } catch {
      /* ignore */
    }
  }

  onPeriodChange(period: 'day' | 'week' | 'month'): void {
    const changed = this.selectedPeriod !== period;
    this.selectedPeriod = period;
    this.periodChange.emit(period);
    // Tránh double-load khi parent sync lại cùng period qua @Input
    this.loadHotelRevenue(changed);
  }

  reload(): void {
    this.loadHotelRevenue(true);
  }

  getPeriodTitle(period: 'day' | 'week' | 'month'): string {
    switch (period) {
      case 'day':
        return this.translate.instant('REVENUE_CHART.DAY');
      case 'week':
        return this.translate.instant('REVENUE_CHART.WEEK');
      case 'month':
        return this.translate.instant('REVENUE_CHART.MONTH');
      default:
        return '';
    }
  }

  getHotelTitle(): string {
    if (!this.hotelId) return '';
    return this.translate.instant('REVENUE_CHART.BY_PERIOD', {
      period: this.getPeriodTitle(this.selectedPeriod)
    });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
  }
}
