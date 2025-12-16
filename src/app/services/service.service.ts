import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Service, ServiceOrder } from '../interfaces/service';

export interface ServiceCheckoutResponse {
  message: string;
  data: {
    services: {
      serviceId: string;
      serviceName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      orderId?: string;
      orderTime?: Date;
      status?: string;
    }[];
    totalAmount: number;
    orderCount: number;
  };
}

export interface ServiceCalculateResponse {
  message: string;
  data: {
    services: {
      serviceId: string;
      serviceName: string;
      unitPrice: number;
      quantity: number;
      totalPrice: number;
    }[];
    totalAmount: number;
  };
}

export interface ServiceModalResponse {
  message: string;
  data: {
    services: Service[];
    grouped: { [category: string]: Service[] };
    total: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ServiceService {
  private apiUrl = 'https://nest-production-8106.up.railway.app/services';

  constructor(private http: HttpClient) { }

  // ============ QUẢN LÝ DỊCH VỤ ============

  /**
   * Lấy danh sách dịch vụ theo khách sạn và/hoặc danh mục
   */
  getServices(hotelId?: string, category?: string): Observable<Service[]> {
    let params = new HttpParams();
    
    if (hotelId) {
      params = params.set('hotelId', hotelId);
    }
    
    if (category) {
      params = params.set('category', category);
    }
    
    return this.http.get<Service[]>(this.apiUrl, { params });
  }

  /**
   * Lấy dịch vụ theo ID
   */
  getServiceById(id: string): Observable<Service> {
    return this.http.get<Service>(`${this.apiUrl}/${id}`);
  }

  /**
   * Lấy danh mục dịch vụ theo khách sạn
   */
  getServiceCategories(hotelId: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/categories?hotelId=${hotelId}`);
  }

  /**
   * Tạo dịch vụ mới
   */
  createService(service: Partial<Service>): Observable<Service> {
    return this.http.post<Service>(this.apiUrl, service);
  }

  /**
   * Cập nhật dịch vụ
   */
  updateService(id: string, service: Partial<Service>): Observable<Service> {
    return this.http.put<Service>(`${this.apiUrl}/${id}`, service);
  }

  /**
   * Xóa dịch vụ
   */
  deleteService(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // ============ QUẢN LÝ ĐƠN HÀNG DỊCH VỤ ============

  /**
   * Tạo đơn hàng dịch vụ
   */
  createServiceOrder(order: Partial<ServiceOrder>): Observable<ServiceOrder> {
    return this.http.post<ServiceOrder>(`${this.apiUrl}/orders`, order);
  }

  /**
   * Cập nhật trạng thái đơn hàng
   */
  updateServiceOrderStatus(id: string, status: string, staffId?: string): Observable<ServiceOrder> {
    return this.http.patch<ServiceOrder>(
      `${this.apiUrl}/orders/${id}/status`, 
      { status, staffId }
    );
  }

  /**
   * Lấy đơn hàng theo ID
   */
  getServiceOrderById(id: string): Observable<ServiceOrder> {
    return this.http.get<ServiceOrder>(`${this.apiUrl}/orders/${id}`);
  }

  /**
   * Lấy đơn hàng theo phòng
   */
  getServiceOrdersByRoom(roomId: string): Observable<ServiceOrder[]> {
    return this.http.get<ServiceOrder[]>(`${this.apiUrl}/orders/room/${roomId}`);
  }

  /**
   * Lấy đơn hàng theo khách sạn với phân trang
   */
  getServiceOrdersByHotel(
    hotelId: string, 
    status?: string, 
    page: number = 1, 
    limit: number = 20
  ): Observable<{ orders: ServiceOrder[], totalPages: number, currentPage: number }> {
    let params = new HttpParams()
      .set('hotelId', hotelId)
      .set('page', page.toString())
      .set('limit', limit.toString());
    
    if (status) {
      params = params.set('status', status);
    }
    
    return this.http.get<{ orders: ServiceOrder[], totalPages: number, currentPage: number }>(
      `${this.apiUrl}/orders/hotel`, 
      { params }
    );
  }

  /**
   * Lấy tất cả đơn hàng theo khách sạn (không phân trang) để thống kê
   */
  getAllServiceOrdersForStatistics(
    hotelId: string,
    startDate?: Date,
    endDate?: Date
  ): Observable<any[]> {
    let params = new HttpParams()
      .set('hotelId', hotelId)
      .set('page', '1')
      .set('limit', '10000'); // Lấy tất cả
    
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    
    return this.http.get<{ orders: any[], totalPages: number, currentPage: number }>(
      `${this.apiUrl}/orders/hotel`, 
      { params }
    ).pipe(
      map(response => response.orders || [])
    );
  }

  /**
   * Xóa đơn hàng
   */
  deleteServiceOrder(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/orders/${id}`);
  }

  // ============ ASSIGN DỊCH VỤ VÀO KHÁCH SẠN ============

  /**
   * Assign dịch vụ vào khách sạn
   */
  assignServiceToHotel(serviceId: string, hotelId: string): Observable<{ message: string; service: Service }> {
    return this.http.post<{ message: string; service: Service }>(`${this.apiUrl}/assign`, {
      serviceId,
      hotelId
    });
  }

  /**
   * Bulk assign nhiều dịch vụ vào khách sạn
   */
  bulkAssignServicesToHotel(serviceIds: string[], hotelId: string): Observable<{ message: string; modifiedCount: number }> {
    return this.http.post<{ message: string; modifiedCount: number }>(`${this.apiUrl}/bulk-assign`, {
      serviceIds,
      hotelId
    });
  }

  // ============ DỊCH VỤ CHO MODAL CHECKIN/CHECKOUT ============

  /**
   * Lấy danh sách dịch vụ đã sử dụng để tính tiền checkout
   */
  getServicesForCheckout(bookingId: string): Observable<ServiceCheckoutResponse> {
    return this.http.get<ServiceCheckoutResponse>(`${this.apiUrl}/checkout/${bookingId}`);
  }

  /**
   * Tính tổng tiền dịch vụ
   */
  calculateServiceTotal(services: { serviceId: string; quantity: number }[]): Observable<ServiceCalculateResponse> {
    return this.http.post<ServiceCalculateResponse>(`${this.apiUrl}/calculate-total`, { services });
  }

  /**
   * Lấy danh sách dịch vụ có sẵn cho modal (checkin/checkout)
   * Grouped theo category
   */
  getAvailableServicesForModal(hotelId: string): Observable<ServiceModalResponse> {
    return this.http.get<ServiceModalResponse>(`${this.apiUrl}/available?hotelId=${hotelId}`);
  }

  // ============ HELPER METHODS ============

  /**
   * Format giá tiền
   */
  formatPrice(price: number, currency: string = 'VND'): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: currency
    }).format(price);
  }

  /**
   * Lấy label trạng thái đơn hàng
   */
  getOrderStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'pending': 'Chờ xử lý',
      'processing': 'Đang xử lý',
      'completed': 'Hoàn thành',
      'cancelled': 'Đã hủy'
    };
    return labels[status] || status;
  }

  /**
   * Lấy màu trạng thái đơn hàng
   */
  getOrderStatusColor(status: string): string {
    const colors: Record<string, string> = {
      'pending': 'orange',
      'processing': 'blue',
      'completed': 'green',
      'cancelled': 'red'
    };
    return colors[status] || 'default';
  }

  /**
   * Lấy label danh mục dịch vụ
   */
  getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      'room_service': 'Dịch vụ phòng',
      'food': 'Đồ ăn',
      'beverage': 'Đồ uống',
      'spa': 'Spa & Massage',
      'transport': 'Vận chuyển',
      'custom': 'Tùy chỉnh'
    };
    return labels[category] || category;
  }

  /**
   * Tính tổng tiền từ danh sách items
   */
  calculateTotalFromItems(items: { price: number; quantity: number }[]): number {
    return items.reduce((total, item) => total + (item.price * item.quantity), 0);
  }
}
