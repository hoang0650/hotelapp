import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  private buildUrl(path: string): string {
    if (!path) return this.baseUrl;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith('/')) return `${this.baseUrl}${path}`;
    return `${this.baseUrl}/${path}`;
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken() || localStorage.getItem('authToken') || '';
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  public loadData<T>(endpoint: string): BehaviorSubject<T[]> {
    const dataSubject = new BehaviorSubject<T[]>([]);

    this.http.get<T[]>(this.buildUrl(endpoint)).subscribe(
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
    return this.http.get(this.buildUrl(`/sessions/rooms?hotelId=${hotelId}`), {
      headers: this.getAuthHeaders()
    });
  }

  saveRoomSessions(hotelId: string, sessions: any): Observable<any> {
    return this.http.post(this.buildUrl('/sessions/rooms'), { hotelId, sessions }, {
      headers: this.getAuthHeaders()
    });
  }

  updateRoomSession(hotelId: string, roomId: string, sessionData: any): Observable<any> {
    return this.http.put(this.buildUrl('/sessions/rooms'), { hotelId, roomId, sessionData }, {
      headers: this.getAuthHeaders()
    });
  }

  getSelectedHotel(_userId?: string): Observable<any> {
    return this.http.get(this.buildUrl('/sessions/selected-hotel'), {
      headers: this.getAuthHeaders()
    });
  }

  saveSelectedHotel(_userId: string | undefined, hotelId: string): Observable<any> {
    return this.http.post(this.buildUrl('/sessions/selected-hotel'), { hotelId }, {
      headers: this.getAuthHeaders()
    });
  }

  getRoomTotalPrice(hotelId: string, roomId: string): Observable<any> {
    return this.http.get(this.buildUrl(`/sessions/room-total-price?hotelId=${hotelId}&roomId=${roomId}`), {
      headers: this.getAuthHeaders()
    });
  }

  saveRoomTotalPrice(hotelId: string, roomId: string, totalPrice: number): Observable<any> {
    return this.http.post(this.buildUrl('/sessions/room-total-price'), { hotelId, roomId, totalPrice }, {
      headers: this.getAuthHeaders()
    });
  }

  getCheckinData(hotelId: string, roomId: string): Observable<any> {
    return this.http.get(this.buildUrl(`/sessions/checkin-data?hotelId=${hotelId}&roomId=${roomId}`), {
      headers: this.getAuthHeaders()
    });
  }

  saveCheckinData(hotelId: string, roomId: string, checkinData: any): Observable<any> {
    return this.http.post(this.buildUrl('/sessions/checkin-data'), { hotelId, roomId, checkinData }, {
      headers: this.getAuthHeaders()
    });
  }

  getRoomColumnsCount(_userId?: string): Observable<any> {
    return this.http.get(this.buildUrl('/sessions/room-columns-count'), {
      headers: this.getAuthHeaders()
    });
  }

  saveRoomColumnsCount(_userId: string | undefined, columnsCount: number): Observable<any> {
    return this.http.post(this.buildUrl('/sessions/room-columns-count'), { columnsCount }, {
      headers: this.getAuthHeaders()
    });
  }

  getSelectedFloor(userId: string, hotelId: string): Observable<any> {
    return this.http.get(this.buildUrl(`/sessions/selected-floor?userId=${userId}&hotelId=${hotelId}`), {
      headers: this.getAuthHeaders()
    });
  }

  saveSelectedFloor(userId: string, hotelId: string, floor: string | null): Observable<any> {
    return this.http.post(this.buildUrl('/sessions/selected-floor'), { userId, hotelId, floor }, {
      headers: this.getAuthHeaders()
    });
  }
}
