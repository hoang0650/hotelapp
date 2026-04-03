import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = 'https://api.phgrouptechs.com/';

  constructor(private http: HttpClient) { }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('authToken') || '';
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  public loadData<T>(endpoint: string): BehaviorSubject<T[]> {
    const dataSubject = new BehaviorSubject<T[]>([]);

    this.http.get<T[]>(`${this.baseUrl}/${endpoint}`).subscribe(
      data => {
        dataSubject.next(data);
      },
      error => {
        console.error(`Error loading data from ${endpoint}:`, error);
      }
    );

    return dataSubject;
  }

  getRoomSessions(hotelId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}sessions/rooms?hotelId=${hotelId}`, {
      headers: this.getAuthHeaders()
    });
  }

  saveRoomSessions(hotelId: string, sessions: any): Observable<any> {
    return this.http.post(`${this.baseUrl}sessions/rooms`, { hotelId, sessions }, {
      headers: this.getAuthHeaders()
    });
  }

  updateRoomSession(hotelId: string, roomId: string, sessionData: any): Observable<any> {
    return this.http.put(`${this.baseUrl}sessions/rooms`, { hotelId, roomId, sessionData }, {
      headers: this.getAuthHeaders()
    });
  }

  getSelectedHotel(userId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}sessions/selected-hotel?userId=${userId}`, {
      headers: this.getAuthHeaders()
    });
  }

  saveSelectedHotel(userId: string, hotelId: string): Observable<any> {
    return this.http.post(`${this.baseUrl}sessions/selected-hotel`, { userId, hotelId }, {
      headers: this.getAuthHeaders()
    });
  }

  getRoomTotalPrice(hotelId: string, roomId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}sessions/room-total-price?hotelId=${hotelId}&roomId=${roomId}`, {
      headers: this.getAuthHeaders()
    });
  }

  saveRoomTotalPrice(hotelId: string, roomId: string, totalPrice: number): Observable<any> {
    return this.http.post(`${this.baseUrl}sessions/room-total-price`, { hotelId, roomId, totalPrice }, {
      headers: this.getAuthHeaders()
    });
  }

  getCheckinData(hotelId: string, roomId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}sessions/checkin-data?hotelId=${hotelId}&roomId=${roomId}`, {
      headers: this.getAuthHeaders()
    });
  }

  saveCheckinData(hotelId: string, roomId: string, checkinData: any): Observable<any> {
    return this.http.post(`${this.baseUrl}sessions/checkin-data`, { hotelId, roomId, checkinData }, {
      headers: this.getAuthHeaders()
    });
  }

  getRoomColumnsCount(userId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}sessions/room-columns-count?userId=${userId}`, {
      headers: this.getAuthHeaders()
    });
  }

  saveRoomColumnsCount(userId: string, columnsCount: number): Observable<any> {
    return this.http.post(`${this.baseUrl}sessions/room-columns-count`, { userId, columnsCount }, {
      headers: this.getAuthHeaders()
    });
  }

  getSelectedFloor(userId: string, hotelId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}sessions/selected-floor?userId=${userId}&hotelId=${hotelId}`, {
      headers: this.getAuthHeaders()
    });
  }

  saveSelectedFloor(userId: string, hotelId: string, floor: string | null): Observable<any> {
    return this.http.post(`${this.baseUrl}sessions/selected-floor`, { userId, hotelId, floor }, {
      headers: this.getAuthHeaders()
    });
  }
}