import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Hotel, HotelStatus } from '../interfaces/hotel';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface RevenueData {
  labels: string[];
  revenueData: number[];
  paymentData: number[];
  totalRevenue: number;
  totalPayment: number;
}

@Injectable({
  providedIn: 'root'
})
export class HotelService {
  //private apiUrl = 'https://hotel-app-smp2.onrender.com/hotels';
  private apiUrl = 'http://localhost:3000/hotels'

  constructor(private http: HttpClient) { }

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

  // Lấy doanh thu khách sạn theo khoảng thời gian
  getHotelRevenue(hotelId: string, period: 'day' | 'week' | 'month' = 'day'): Observable<RevenueData> {
    const params = new HttpParams()
      .set('period', period);
    
    return this.http.get<RevenueData>(`${this.apiUrl}/${hotelId}/revenue`, { params });
  }

  // API chưa tồn tại, tạm thời sử dụng dữ liệu giả lập
  getHotelRevenueMock(hotelId: string, period: 'day' | 'week' | 'month' = 'day'): Observable<RevenueData> {
    return new Observable<RevenueData>(observer => {
      let labels: string[] = [];
      let revenueData: number[] = [];
      let paymentData: number[] = [];
      
      // Tạo dữ liệu mẫu dựa trên period
      const now = new Date();
      const totalRevenue = Math.floor(Math.random() * 10000000) + 5000000;
      const totalPayment = Math.floor(totalRevenue * 0.9);
      
      if (period === 'day') {
        // Dữ liệu theo giờ trong ngày
        for (let i = 0; i < 24; i++) {
          labels.push(`${i}:00`);
          const revenue = Math.floor(Math.random() * 500000);
          revenueData.push(revenue);
          paymentData.push(Math.floor(revenue * (0.8 + Math.random() * 0.2)));
        }
      } else if (period === 'week') {
        // Dữ liệu trong 7 ngày
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
        // Dữ liệu trong 30 ngày gần nhất
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
