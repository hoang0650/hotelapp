import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class CurrencyService {
  // Cache tỷ giá để tránh gọi API nhiều lần
  private exchangeRatesCache: Map<string, ExchangeRate> = new Map();
  private cacheExpiry = 60 * 60 * 1000; // 1 giờ
  
  // Cache toàn bộ rates từ API
  private allRatesCache: { [key: string]: number } | null = null;
  private allRatesCacheTimestamp: number = 0;
  
  // API endpoint
  private readonly apiUrl = 'https://v6.exchangerate-api.com/v6/f69c17a8a7bded3db484e7e5/latest/USD';

  // Tỷ giá mặc định (fallback nếu API không khả dụng)
  private defaultRates: { [key: string]: number } = {
    'EUR': 0.8588,
    'GBP': 0.7506,
    'JPY': 155.7349,
    'AUD': 1.5086,
    'CAD': 1.3839,
    'CHF': 0.8063,
    'CNY': 7.0779,
    'SGD': 1.2972,
    'HKD': 7.7805,
    'THB': 31.8760,
    'VND': 26254.1183
  };

  constructor(private http: HttpClient) {}

  /**
   * Lấy tỷ giá từ USD sang currency khác
   * Sử dụng API exchangerate-api.com hoặc cache
   */
  getExchangeRate(fromCurrency: string, toCurrency: string): Observable<number> {
    // Nếu cùng currency, return 1
    if (fromCurrency === toCurrency) {
      return of(1);
    }

    // Nếu convert từ USD sang currency khác
    if (fromCurrency === 'USD') {
      const cacheKey = `USD_${toCurrency}`;
      const cached = this.exchangeRatesCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
        return of(cached.rate);
      }

      // Lấy tỷ giá từ API hoặc cache
      return this.fetchAllRates().pipe(
        map(rates => {
          const rate = rates[toCurrency] || this.defaultRates[toCurrency] || 1;
          
          // Cache tỷ giá
          this.exchangeRatesCache.set(cacheKey, {
            from: 'USD',
            to: toCurrency,
            rate: rate,
            timestamp: Date.now()
          });
          
          return rate;
        }),
        catchError(() => {
          // Fallback về tỷ giá mặc định nếu API lỗi
          const rate = this.defaultRates[toCurrency] || 1;
          this.exchangeRatesCache.set(cacheKey, {
            from: 'USD',
            to: toCurrency,
            rate: rate,
            timestamp: Date.now()
          });
          return of(rate);
        })
      );
    }

    // Nếu convert từ currency khác sang USD
    if (toCurrency === 'USD') {
      const cacheKey = `${fromCurrency}_USD`;
      const cached = this.exchangeRatesCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
        return of(cached.rate);
      }

      // Lấy tỷ giá từ API và tính nghịch đảo
      return this.fetchAllRates().pipe(
        map(rates => {
          const fromRate = rates[fromCurrency] || this.defaultRates[fromCurrency] || 1;
          const rate = 1 / fromRate;
          
          // Cache tỷ giá
          this.exchangeRatesCache.set(cacheKey, {
            from: fromCurrency,
            to: 'USD',
            rate: rate,
            timestamp: Date.now()
          });
          
          return rate;
        }),
        catchError(() => {
          // Fallback về tỷ giá mặc định nếu API lỗi
          const fromRate = this.defaultRates[fromCurrency] || 1;
          const rate = 1 / fromRate;
          this.exchangeRatesCache.set(cacheKey, {
            from: fromCurrency,
            to: 'USD',
            rate: rate,
            timestamp: Date.now()
          });
          return of(rate);
        })
      );
    }

    // Convert giữa 2 currency khác USD
    // Convert: fromCurrency -> USD -> toCurrency
    return this.getExchangeRate(fromCurrency, 'USD').pipe(
      switchMap(usdRate => {
        return this.getExchangeRate('USD', toCurrency).pipe(
          map(toRate => usdRate * toRate)
        );
      }),
      catchError(() => of(1))
    );
  }

  /**
   * Lấy tất cả tỷ giá từ API và cache
   */
  private fetchAllRates(): Observable<{ [key: string]: number }> {
    // Kiểm tra cache
    if (this.allRatesCache && (Date.now() - this.allRatesCacheTimestamp) < this.cacheExpiry) {
      return of(this.allRatesCache);
    }

    // Gọi API
    return this.http.get<any>(this.apiUrl).pipe(
      map(response => {
        if (response.result === 'success' && response.conversion_rates) {
          // Cache toàn bộ rates
          this.allRatesCache = response.conversion_rates;
          this.allRatesCacheTimestamp = Date.now();
          return response.conversion_rates;
        }
        throw new Error('Invalid API response');
      }),
      catchError(error => {
        console.error('Error fetching exchange rates:', error);
        // Trả về default rates nếu API lỗi
        return of(this.defaultRates);
      })
    );
  }

  /**
   * Convert số tiền từ currency này sang currency khác
   */
  convertAmount(amount: number, fromCurrency: string, toCurrency: string): Observable<number> {
    if (fromCurrency === toCurrency) {
      return of(amount);
    }

    return this.getExchangeRate(fromCurrency, toCurrency).pipe(
      map(rate => amount * rate)
    );
  }


  /**
   * Kiểm tra currency có được PayPal hỗ trợ không
   */
  isPayPalSupported(currency: string): boolean {
    // PayPal hỗ trợ các currency này
    const supportedCurrencies = [
      'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 
      'CNY', 'SGD', 'HKD', 'THB', 'NZD', 'SEK', 'DKK', 
      'NOK', 'PLN', 'MXN', 'BRL', 'INR', 'KRW', 'TWD'
    ];
    return supportedCurrencies.includes(currency.toUpperCase());
  }

  /**
   * Làm tròn số tiền theo quy tắc currency
   */
  roundAmount(amount: number, currency: string): number {
    // Một số currency không có decimal (như JPY, VND)
    const noDecimalCurrencies = ['JPY', 'VND', 'KRW'];
    if (noDecimalCurrencies.includes(currency.toUpperCase())) {
      return Math.round(amount);
    }
    // Làm tròn 2 chữ số thập phân
    return Math.round(amount * 100) / 100;
  }
}

