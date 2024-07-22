import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BehaviorSubject } from 'rxjs';
import * as XLSX from 'xlsx';
@Injectable({
  providedIn: 'root'
})
export class RoomsService {
  private roomDataUpdated$ = new BehaviorSubject<any>(null);
  private apiUrl = 'https://hotel-app-smp2.onrender.com/rooms';

  constructor(private http: HttpClient) { }

  getRooms(){
    return this.http.get<any[]>(this.apiUrl);
  }

  getRoomDataUpdated$() {
    return this.roomDataUpdated$.asObservable();
  }

  // Call this method after checkin/checkout to notify subscribers
  notifyRoomDataUpdated() {
    this.roomDataUpdated$.next(null);
  }

  checkInRoom(id: string, payload: object): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/checkin/${id}`, payload);
  }

  checkOutRoom(id: string, payload: object): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/checkout/${id}`, payload);
  }

  cleanRoom(id: string, payload: object): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/clean/${id}`, payload);
  }
  // blockUser(id: string, action:string, payload: Object){
  //   return this.http.post(`${this.Root_url}/${id}/${action}`,payload={'blocked':true});
  // }

  exportToExcel(data: any[], fileName: string, sheetName: string): void {
    const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);
    const workbook: XLSX.WorkBook = { Sheets: { [sheetName]: worksheet }, SheetNames: [sheetName] };
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  }


}
