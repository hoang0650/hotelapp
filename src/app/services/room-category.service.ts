import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, shareReplay, finalize, catchError, map } from 'rxjs/operators';
import { RoomCategory } from '../interfaces/rooms';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class RoomCategoryService {
  private apiUrl = `${environment.apiUrl}/room-categories`;
  private priceConfigUrl = `${environment.apiUrl}/priceConfig`;
  private categoriesCache = new Map<string, { data: RoomCategory[]; at: number }>();
  private categoriesInFlight = new Map<string, Observable<RoomCategory[]>>();
  private readonly cacheTtlMs = 60_000;

  constructor(private http: HttpClient) {}

  getCachedCategories(hotelId: string): RoomCategory[] | null {
    const id = String(hotelId || '').trim();
    if (!id) return null;
    const hit = this.categoriesCache.get(id);
    if (!hit) return null;
    if (Date.now() - hit.at > this.cacheTtlMs) return null;
    return hit.data;
  }

  clearCachedCategories(hotelId?: string): void {
    if (hotelId) {
      this.categoriesCache.delete(String(hotelId));
      return;
    }
    this.categoriesCache.clear();
  }

  getCategories(hotelId: string): Observable<RoomCategory[]> {
    const id = String(hotelId || '').trim();
    if (!id) {
      return of([]);
    }

    const cached = this.getCachedCategories(id);
    if (cached) {
      return of(cached);
    }

    const existing = this.categoriesInFlight.get(id);
    if (existing) {
      return existing;
    }

    const request$ = this.http
      .get<any>(this.apiUrl, { params: new HttpParams().set('hotelId', id) })
      .pipe(
        map((res) => (Array.isArray(res) ? res : (res?.data || [])) as RoomCategory[]),
        tap((list) => {
          this.categoriesCache.set(id, { data: list || [], at: Date.now() });
        }),
        finalize(() => this.categoriesInFlight.delete(id)),
        catchError(() => of([] as RoomCategory[])),
        shareReplay(1)
      );

    this.categoriesInFlight.set(id, request$);
    return request$;
  }

  getCategoryById(id: string): Observable<RoomCategory> {
    return this.http.get<RoomCategory>(`${this.apiUrl}/${id}`);
  }

  createCategory(data: Partial<RoomCategory>): Observable<RoomCategory> {
    return this.http.post<RoomCategory>(this.apiUrl, data).pipe(
      tap((created) => {
        const hotelId = String((created as any)?.hotelId || (data as any)?.hotelId || '');
        if (hotelId) this.clearCachedCategories(hotelId);
      })
    );
  }

  updateCategory(id: string, data: Partial<RoomCategory>): Observable<RoomCategory> {
    return this.http.put<RoomCategory>(`${this.apiUrl}/${id}`, data).pipe(
      tap((updated) => {
        const hotelId = String((updated as any)?.hotelId || (data as any)?.hotelId || '');
        if (hotelId) this.clearCachedCategories(hotelId);
      })
    );
  }

  deleteCategory(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`).pipe(
      tap(() => this.categoriesCache.clear())
    );
  }

  getPriceConfigByRoomCategory(hotelId: string, roomCategoryId: string): Observable<any> {
    return this.http.get<any>(`${this.priceConfigUrl}/hotel/${hotelId}/roomType/${roomCategoryId}`);
  }

  createPriceConfig(hotelId: string, data: any): Observable<any> {
    return this.http.post<any>(`${this.priceConfigUrl}/hotel/${hotelId}`, data);
  }

  updatePriceConfig(configId: string, data: any): Observable<any> {
    return this.http.put<any>(`${this.priceConfigUrl}/${configId}`, data);
  }

  deactivatePriceConfig(configId: string): Observable<any> {
    return this.http.patch<any>(`${this.priceConfigUrl}/${configId}/deactivate`, {});
  }
}
