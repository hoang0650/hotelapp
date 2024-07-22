import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = 'https://hotel-app-smp2.onrender.com/';

  constructor(private http: HttpClient) { }

  // Hàm chung để load dữ liệu từ API
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

}
