import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Guest, GuestQuery } from '../models/guest.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class GuestsService {
  private apiUrl = `${environment.apiUrl}/guests`;

  constructor(private http: HttpClient) { }

  getGuests(query: GuestQuery): Observable<{ guests: Guest[], total: number }> {
    let params: any = { hotelId: query.hotelId };
    
    if (query.page) params.page = query.page;
    if (query.limit) params.limit = query.limit;
    if (query.search) params.search = query.search;
    
    return this.http.get<{ guests: Guest[], total: number }>(this.apiUrl, { params });
  }

  getGuestById(id: string): Observable<Guest> {
    return this.http.get<Guest>(`${this.apiUrl}/${id}`);
  }

  createGuest(guest: Guest): Observable<Guest> {
    return this.http.post<Guest>(this.apiUrl, guest);
  }

  updateGuest(id: string, guest: Partial<Guest>): Observable<Guest> {
    return this.http.patch<Guest>(`${this.apiUrl}/${id}`, guest);
  }

  deleteGuest(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  // Tìm kiếm khách hàng theo ID number
  findGuestByIdNumber(idNumber: string, hotelId: string): Observable<Guest[]> {
    return this.http.get<Guest[]>(`${this.apiUrl}/find?idNumber=${idNumber}&hotelId=${hotelId}`);
  }

  // Lấy danh sách khách hàng đang ở trong một phòng
  getGuestsByRoom(roomId: string): Observable<Guest[]> {
    return this.http.get<Guest[]>(`${this.apiUrl}/room/${roomId}`);
  }

  // Gộp thông tin khách hàng (trong trường hợp có trùng lặp)
  mergeGuests(primaryId: string, secondaryId: string): Observable<Guest> {
    return this.http.post<Guest>(`${this.apiUrl}/merge`, {
      primaryId,
      secondaryId
    });
  }
} 