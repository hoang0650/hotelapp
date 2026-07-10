import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Hotel, HotelStatus } from '../interfaces/hotel';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

interface RevenueData {
  labels: string[];
  revenueData: number[];
  paymentData: number[];
  expenseData?: number[];
  totalRevenue: number;
  totalPayment: number;
  totalExpense?: number;
}

@Injectable({
  providedIn: 'root'
})
export class HotelService {
  private apiUrl = `${environment.apiUrl}/hotels`;
  private revenueByPeriodCache = new Map<string, { payload: RevenueData; updatedAt: number }>();
  
  // Định nghĩa key cố định trong localStorage để tránh typo
  private readonly HOTEL_ID_KEY = 'current_hotel_id';
  private readonly FLOOR_KEY = 'current_floor';

  constructor(private http: HttpClient) { }

  /**
   * Lưu nhanh hotelId và floor vào LocalStorage
   */
  saveRoomContext(hotelId: string, floor: string): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(this.HOTEL_ID_KEY, hotelId);
      localStorage.setItem(this.FLOOR_KEY, floor);
    }
  }

  /**
   * Lấy nhanh hotelId từ LocalStorage (Đồng bộ - Không cần qua Observable)
   */
  getStoredHotelId(): string | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(this.HOTEL_ID_KEY);
    }
    return null;
  }

  /**
   * Lấy nhanh floor từ LocalStorage (Đồng bộ - Không cần qua Observable)
   */
  getStoredFloor(): string | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(this.FLOOR_KEY);
    }
    return null;
  }

  /**
   * Xóa sạch thông tin phòng/khách sạn khi logout
   */
  clearRoomContext(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(this.HOTEL_ID_KEY);
      localStorage.removeItem(this.FLOOR_KEY);
    }
  }

  getHotels(businessId?: string, status?: HotelStatus): Observable<Hotel[]> {
    let params = new HttpParams();
    if (businessId) {
      params = params.set('businessId', businessId);
    }
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<Hotel[]>(this.apiUrl, { params });
  }

  getHotelById(id: string): Observable<Hotel> {
    return this.http.get<Hotel>(`${this.apiUrl}/${id}`);
  }

  getHotelInfo(hotelId: string | null | undefined): Observable<Hotel | null> {
    if (!hotelId) {
      return of(null);
    }
    
    return this.http.get<Hotel>(`${this.apiUrl}/${hotelId}`).pipe(
      map((hotel: Hotel) => hotel),
      catchError((error: any) => {
        console.error('Error fetching hotel info:', error);
        return of(null);
      })
    );
  }

  extractBusinessId(hotel: any): string | null {
    if (!hotel || !hotel.businessId) {
      return null;
    }
    
    if (typeof hotel.businessId === 'object' && hotel.businessId._id) {
      return hotel.businessId._id;
    } else if (typeof hotel.businessId === 'string') {
      return hotel.businessId;
    }
    
    return null;
  }

  createHotel(hotel: Partial<Hotel>): Observable<Hotel> {
    return this.http.post<Hotel>(this.apiUrl, hotel);
  }

  updateHotel(id: string, hotelUpdates: Partial<Hotel>): Observable<Hotel> {
    return this.http.put<Hotel>(`${this.apiUrl}/${id}`, hotelUpdates);
  }

  deleteHotel(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  updateHotelStatus(id: string, status: HotelStatus): Observable<Hotel> {
    return this.http.patch<{ message: string, hotel: Hotel }>(`${this.apiUrl}/${id}/status`, { status }).pipe(
      map(response => response.hotel)
    );
  }

  uploadHotelImages(id: string, images: string[]): Observable<{ message: string, images: string[] }> {
    return this.http.post<{ message: string, images: string[] }>(`${this.apiUrl}/${id}/images`, { images });
  }

  deleteHotelImage(id: string, imageIndex: number): Observable<{ message: string, images: string[] }> {
    return this.http.delete<{ message: string, images: string[] }>(`${this.apiUrl}/${id}/images/${imageIndex}`);
  }

  updateHotelSettings(id: string, settingsUpdate: Partial<Hotel['settings']>) : Observable<{ message: string, settings: Hotel['settings'] | undefined }>{
    return this.http.patch<{ message: string, settings: Hotel['settings'] }>(`${this.apiUrl}/${id}/settings`, { settings: settingsUpdate });
  }

  getHotelRevenue(hotelId: string, period: 'day' | 'week' | 'month' = 'day'): Observable<RevenueData> {
    const params = new HttpParams()
      .set('period', period);
    
    return this.http.get<RevenueData>(`${this.apiUrl}/${hotelId}/revenue`, { params });
  }

  getHotelRevenueByPeriod(hotelId: string, period: 'day' | 'week' | 'month' = 'day'): Observable<RevenueData> {
    const apiUrl = `${environment.apiUrl}/shift-handover/revenue/period`;
    const params = new HttpParams()
      .set('hotelId', hotelId)
      .set('period', period);
    
    return this.http.get<{ labels: string[], revenueData: number[], paymentData: number[], expenseData?: number[], totalRevenue: number, totalPayment: number, totalExpense?: number }>(apiUrl, { params }).pipe(
      map(response => ({
        labels: response.labels,
        revenueData: response.revenueData,
        paymentData: response.paymentData,
        expenseData: response.expenseData || [],
        totalRevenue: response.totalRevenue,
        totalPayment: response.totalPayment,
        totalExpense: response.totalExpense || 0
      }))
    );
  }

  private buildRevenueCacheKey(hotelId: string, period: 'day' | 'week' | 'month'): string {
    return `${hotelId}:${period}`;
  }

  getCachedHotelRevenueByPeriod(hotelId: string, period: 'day' | 'week' | 'month' = 'day') {
    if (!hotelId) {
      return null;
    }
    return this.revenueByPeriodCache.get(this.buildRevenueCacheKey(hotelId, period)) || null;
  }

  setCachedHotelRevenueByPeriod(hotelId: string, period: 'day' | 'week' | 'month', payload: RevenueData): void {
    if (!hotelId) {
      return;
    }
    this.revenueByPeriodCache.set(this.buildRevenueCacheKey(hotelId, period), {
      payload,
      updatedAt: Date.now()
    });
  }

  clearCachedHotelRevenueByPeriod(hotelId?: string): void {
    if (!hotelId) {
      this.revenueByPeriodCache.clear();
      return;
    }

    Array.from(this.revenueByPeriodCache.keys()).forEach((cacheKey) => {
      if (cacheKey.startsWith(`${hotelId}:`)) {
        this.revenueByPeriodCache.delete(cacheKey);
      }
    });
  }

  getHotelRevenueMock(hotelId: string, period: 'day' | 'week' | 'month' = 'day'): Observable<RevenueData> {
    return new Observable<RevenueData>(observer => {
      let labels: string[] = [];
      let revenueData: number[] = [];
      let paymentData: number[] = [];
      
      const now = new Date();
      const totalRevenue = Math.floor(Math.random() * 10000000) + 5000000;
      const totalPayment = Math.floor(totalRevenue * 0.9);
      
      if (period === 'day') {
        for (let i = 0; i < 24; i++) {
          labels.push(`${i}:00`);
          const revenue = Math.floor(Math.random() * 500000);
          revenueData.push(revenue);
          paymentData.push(Math.floor(revenue * (0.8 + Math.random() * 0.2)));
        }
      } else if (period === 'week') {
        const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
        const today = now.getDay();
        
        for (let i = 0; i < 7; i++) {
          const dayIndex = (today - 6 + i + 7) % 7;
          labels.push(days[dayIndex]);
          const revenue = Math.floor(Math.random() * 2000000) + 500000;
          revenueData.push(revenue);
          paymentData.push(Math.floor(revenue * (0.85 + Math.random() * 0.15)));
        }
      } else if (period === 'month') {
        const date = new Date(now);
        date.setDate(date.getDate() - 29);
        
        for (let i = 0; i < 30; i++) {
          date.setDate(date.getDate() + 1);
          labels.push(`${date.getDate()}/${date.getMonth() + 1}`);
          const revenue = Math.floor(Math.random() * 1000000) + 200000;
          revenueData.push(revenue);
          paymentData.push(Math.floor(revenue * (0.85 + Math.random() * 0.15)));
        }
      }
      
      observer.next({
        labels,
        revenueData,
        paymentData,
        totalRevenue,
        totalPayment
      });
      observer.complete();
    });
  }
}
