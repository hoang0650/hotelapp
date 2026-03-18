import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = 'https://nest-production-8106.up.railway.app';

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
}