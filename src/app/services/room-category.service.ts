import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RoomCategory } from '../interfaces/rooms';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class RoomCategoryService {
  private apiUrl = `${environment.apiUrl}/room-categories`;

  constructor(private http: HttpClient) {}

  getCategories(hotelId: string): Observable<RoomCategory[]> {
    return this.http.get<RoomCategory[]>(this.apiUrl, { params: new HttpParams().set('hotelId', hotelId) });
  }

  getCategoryById(id: string): Observable<RoomCategory> {
    return this.http.get<RoomCategory>(`${this.apiUrl}/${id}`);
  }

  createCategory(data: Partial<RoomCategory>): Observable<RoomCategory> {
    return this.http.post<RoomCategory>(this.apiUrl, data);
  }

  updateCategory(id: string, data: Partial<RoomCategory>): Observable<RoomCategory> {
    return this.http.put<RoomCategory>(`${this.apiUrl}/${id}`, data);
  }

  deleteCategory(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
