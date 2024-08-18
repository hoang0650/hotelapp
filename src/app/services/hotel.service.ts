import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Hotel } from '../interfaces/hotel';
import { Observable } from 'rxjs';
@Injectable({
  providedIn: 'root'
})
export class HotelService {
  private apiUrl = 'https://hotel-app-smp2.onrender.com/hotels';
  // private apiUrl = 'http://localhost:3000/hotels'

  constructor(private http: HttpClient) { }
  getHotels(): Observable<Hotel[]> {
    return this.http.get<Hotel[]>(this.apiUrl);
  }

  getHotelById(id: string): Observable<Hotel> {
    return this.http.get<Hotel>(`${this.apiUrl}/${id}`);
  }

  createHotel(hotel: Hotel): Observable<Hotel> {
    return this.http.post<Hotel>(this.apiUrl, hotel);
  }

  updateHotel(id: string, hotel: Hotel): Observable<Hotel> {
    return this.http.put<Hotel>(`${this.apiUrl}/${id}`, hotel);
  }

  deleteHotel(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
