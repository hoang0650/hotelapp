import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { OrderedService } from '../interfaces/rooms';

export interface RoomService {
  _id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  hotelId: string;
  image?: string;
  isAvailable: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ServiceOrder {
  _id?: string;
  roomId: string;
  hotelId: string;
  services: OrderedService[];
  totalAmount: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  requestTime: Date;
  completedTime?: Date;
  staffId?: string;
  notes?: string;
}

@Injectable({
  providedIn: 'root'
})
export class RoomServiceService {
  private apiUrl = 'http://localhost:3000/services';

  constructor(private http: HttpClient) { }

  // Lấy danh sách dịch vụ
  getServices(params?: { hotelId?: string, category?: string }): Observable<RoomService[]> {
    let httpParams = new HttpParams();
    
    if (params) {
      if (params.hotelId) {
        httpParams = httpParams.set('hotelId', params.hotelId);
      }
      if (params.category) {
        httpParams = httpParams.set('category', params.category);
      }
    }
    
    return this.http.get<RoomService[]>(this.apiUrl, { params: httpParams });
  }

  // Lấy dịch vụ theo ID
  getServiceById(id: string): Observable<RoomService> {
    return this.http.get<RoomService>(`${this.apiUrl}/${id}`);
  }

  // Tạo dịch vụ mới
  createService(service: RoomService): Observable<RoomService> {
    return this.http.post<RoomService>(this.apiUrl, service);
  }

  // Cập nhật dịch vụ
  updateService(id: string, service: RoomService): Observable<RoomService> {
    return this.http.put<RoomService>(`${this.apiUrl}/${id}`, service);
  }

  // Xóa dịch vụ
  deleteService(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // ===== Quản lý đơn hàng dịch vụ =====
  
  // Tạo đơn hàng dịch vụ
  createServiceOrder(order: ServiceOrder): Observable<ServiceOrder> {
    return this.http.post<ServiceOrder>(`${this.apiUrl}/orders`, order);
  }

  // Lấy danh sách đơn hàng dịch vụ theo phòng
  getServiceOrdersByRoom(roomId: string): Observable<ServiceOrder[]> {
    return this.http.get<ServiceOrder[]>(`${this.apiUrl}/orders/room/${roomId}`);
  }

  // Lấy danh sách đơn hàng dịch vụ theo khách sạn
  getServiceOrdersByHotel(hotelId: string, params?: { 
    status?: 'pending' | 'processing' | 'completed' | 'cancelled',
    page?: number,
    limit?: number
  }): Observable<{ 
    orders: ServiceOrder[], 
    totalPages: number, 
    currentPage: number 
  }> {
    let httpParams = new HttpParams().set('hotelId', hotelId);
    
    if (params) {
      if (params.status) {
        httpParams = httpParams.set('status', params.status);
      }
      if (params.page !== undefined) {
        httpParams = httpParams.set('page', params.page.toString());
      }
      if (params.limit !== undefined) {
        httpParams = httpParams.set('limit', params.limit.toString());
      }
    }
    
    return this.http.get<{ 
      orders: ServiceOrder[], 
      totalPages: number, 
      currentPage: number 
    }>(`${this.apiUrl}/orders/hotel`, { params: httpParams });
  }

  // Cập nhật trạng thái đơn hàng dịch vụ
  updateServiceOrderStatus(orderId: string, status: 'pending' | 'processing' | 'completed' | 'cancelled', staffId?: string): Observable<ServiceOrder> {
    return this.http.patch<ServiceOrder>(`${this.apiUrl}/orders/${orderId}/status`, { 
      status,
      staffId
    });
  }

  // Xóa đơn hàng dịch vụ
  deleteServiceOrder(orderId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/orders/${orderId}`);
  }

  // Lấy danh sách danh mục dịch vụ
  getServiceCategories(hotelId: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/categories?hotelId=${hotelId}`);
  }
} 