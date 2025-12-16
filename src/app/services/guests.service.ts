import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Guest, GuestQuery, AssignGuestToRoomRequest, CreateBookingForGuestRequest } from '../models/guest.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class GuestsService {
  private apiUrl = `${environment.apiUrl}/guests`;

  constructor(private http: HttpClient) { }

  getGuests(query: GuestQuery): Observable<{ guests: Guest[], total: number }> {
    let params: any = {};
    
    if (query.hotelId) params.hotelId = query.hotelId;
    if (query.page) params.page = query.page;
    if (query.limit) params.limit = query.limit;
    if (query.search) params.search = query.search;
    if (query.guestType) params.guestType = query.guestType;
    
    return this.http.get<{ guests: Guest[], total: number }>(this.apiUrl, { params });
  }

  getGuestById(id: string): Observable<Guest> {
    return this.http.get<Guest>(`${this.apiUrl}/${id}`);
  }

  createGuest(guest: Partial<Guest>): Observable<{ message: string; guest: Guest }> {
    return this.http.post<{ message: string; guest: Guest }>(this.apiUrl, guest);
  }

  updateGuest(id: string, guest: Partial<Guest>): Observable<{ message: string; guest: Guest }> {
    return this.http.patch<{ message: string; guest: Guest }>(`${this.apiUrl}/${id}`, guest);
  }

  deleteGuest(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }

  // Tạo booking cho khách (đặt phòng trước)
  createBookingForGuest(guestId: string, request: CreateBookingForGuestRequest): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/${guestId}/create-booking`, request);
  }

  // Assign khách vào phòng
  assignGuestToRoom(guestId: string, request: AssignGuestToRoomRequest): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/${guestId}/assign-room`, request);
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