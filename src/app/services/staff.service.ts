import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Staff } from '../interfaces/staff';

@Injectable({
  providedIn: 'root'
})
export class StaffService {
  private baseUrl = 'http://localhost:3000/staffs';

  constructor(private http: HttpClient) {}

  getStaff(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}`);
  }

  getHotelById(id: string): Observable<Staff> {
    return this.http.get<Staff>(`${this.baseUrl}/${id}`);
  }

  updateHotel(id: string, hotel: Staff): Observable<Staff> {
    return this.http.put<Staff>(`${this.baseUrl}/${id}`, hotel);
  }

  createStaff(data: any): Observable<Staff> {
    return this.http.post<Staff>(`${this.baseUrl}`, data);
  }

  deleteStaff(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
