import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Service, ServiceOrder } from '../interfaces/service';

@Injectable({
  providedIn: 'root'
})
export class ServiceService {
  // private apiUrl = 'https://hotel-app-smp2.onrender.com/services';
  private apiUrl = 'http://localhost:3000/services';

  constructor(private http: HttpClient) { }

  // Lấy danh sách dịch vụ theo khách sạn và/hoặc danh mục
  getServices(hotelId?: string, category?: string): Observable<Service[]> {
    let url = this.apiUrl;
    const params: any = {};
    
    if (hotelId) {
      params.hotelId = hotelId;
    }
    
    if (category) {
      params.category = category;
    }
    
    return this.http.get<Service[]>(url, { params });
  }

  // Lấy dịch vụ theo ID
  getServiceById(id: string): Observable<Service> {
    return this.http.get<Service>(`${this.apiUrl}/${id}`);
  }

  // Lấy danh mục dịch vụ theo khách sạn
  getServiceCategories(hotelId: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/categories?hotelId=${hotelId}`);
  }

  // Tạo dịch vụ mới
  createService(service: Service): Observable<Service> {
    return this.http.post<Service>(this.apiUrl, service);
  }

  // Cập nhật dịch vụ
  updateService(id: string, service: Service): Observable<Service> {
    return this.http.put<Service>(`${this.apiUrl}/${id}`, service);
  }

  // Xóa dịch vụ
  deleteService(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // === Quản lý đơn hàng dịch vụ ===

  // Tạo đơn hàng dịch vụ
  createServiceOrder(order: ServiceOrder): Observable<ServiceOrder> {
    return this.http.post<ServiceOrder>(`${this.apiUrl}/orders`, order);
  }

  // Cập nhật trạng thái đơn hàng
  updateServiceOrderStatus(id: string, status: string, staffId?: string): Observable<ServiceOrder> {
    return this.http.patch<ServiceOrder>(
      `${this.apiUrl}/orders/${id}/status`, 
      { status, staffId }
    );
  }

  // Lấy đơn hàng theo ID
  getServiceOrderById(id: string): Observable<ServiceOrder> {
    return this.http.get<ServiceOrder>(`${this.apiUrl}/orders/${id}`);
  }

  // Lấy đơn hàng theo phòng
  getServiceOrdersByRoom(roomId: string): Observable<ServiceOrder[]> {
    return this.http.get<ServiceOrder[]>(`${this.apiUrl}/orders/room/${roomId}`);
  }

  // Lấy đơn hàng theo khách sạn
  getServiceOrdersByHotel(
    hotelId: string, 
    status?: string, 
    page: number = 1, 
    limit: number = 20
  ): Observable<{orders: ServiceOrder[], totalPages: number, currentPage: number}> {
    let url = `${this.apiUrl}/orders/hotel?hotelId=${hotelId}&page=${page}&limit=${limit}`;
    
    if (status) {
      url += `&status=${status}`;
    }
    
    return this.http.get<{orders: ServiceOrder[], totalPages: number, currentPage: number}>(url);
  }

  // Xóa đơn hàng
  deleteServiceOrder(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/orders/${id}`);
  }
} 