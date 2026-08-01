import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Hotel, HotelStatus } from '../interfaces/hotel';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, finalize, map, shareReplay, tap, timeout } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { SessionContextService } from './session-context.service';

interface RevenueData {
  labels: string[];
  revenueData: number[];
  paymentData: number[];
  expenseData?: number[];
  totalRevenue: number;
  totalPayment: number;
  totalExpense?: number;
}

@Injectable({
  providedIn: 'root'
})
export class HotelService {
  private apiUrl = `${environment.apiUrl}/hotels`;
  private revenueByPeriodCache = new Map<string, { payload: RevenueData; updatedAt: number }>();
  private hotelInfoCache = new Map<string, { payload: Hotel; updatedAt: number }>();
  private readonly hotelInfoCacheTtlMs = 60_000;

  /** Cache danh sách hotels cục bộ — dùng chung mọi màn, tránh gọi API lặp */
  private hotelsListCache: Hotel[] | null = null;
  private hotelsListCacheKey: string | null = null;
  private hotelsListCacheAt = 0;
  private hotelsListInFlight: Observable<Hotel[]> | null = null;
  private readonly hotelsListTtlMs = 5 * 60_000;
  private readonly hotelsListSubject = new BehaviorSubject<Hotel[]>([]);
  readonly hotelsList$ = this.hotelsListSubject.asObservable();

  constructor(
    private http: HttpClient,
    private sessionContext: SessionContextService
  ) { }

  /**
   * Lưu hotelId + floor vào Redis (đồng bộ web/app)
   */
  saveRoomContext(hotelId: string, floor: string): void {
    this.sessionContext.saveRoomContext(hotelId, floor || '');
  }

  /**
   * Lấy hotelId từ session context cục bộ (đã warm từ login/Redis)
   */
  getStoredHotelId(): string | null {
    return this.sessionContext.getSelectedHotelId();
  }

  /**
   * hotelId ưu tiên: session cục bộ → fallback auth — không cần gọi API
   */
  resolvePreferredHotelId(fallbackHotelId?: string | null): string | null {
    return this.normalizeHotelId(
      this.sessionContext.resolvePreferredHotelId(fallbackHotelId)
    );
  }

  /** Chuẩn hóa hotelId (ObjectId / object / string) về string */
  normalizeHotelId(hotelId: unknown): string | null {
    if (hotelId == null || hotelId === '') return null;
    if (typeof hotelId === 'object' && (hotelId as any)._id) {
      return String((hotelId as any)._id).trim() || null;
    }
    const s = String(hotelId).trim();
    if (!s || s === '[object Object]') return null;
    return s || null;
  }

  sameHotelId(a: unknown, b: unknown): boolean {
    const left = this.normalizeHotelId(a);
    const right = this.normalizeHotelId(b);
    return !!left && !!right && left === right;
  }

  /** Lấy businessId từ hotel (string / ObjectId / populated object) */
  extractBusinessId(hotel: Hotel | null | undefined): string | null {
    if (!hotel) return null;
    return this.normalizeHotelId((hotel as any).businessId);
  }

  /**
   * Lọc danh sách KS theo quyền sở hữu/role hiện tại.
   * - superadmin/admin: tất cả
   * - business: KS cùng businessId
   * - hotel: KS cùng businessId (đa cơ sở), fallback hotelId / managerId
   * - staff: chỉ hotelId của mình
   */
  filterHotelsForUser(
    hotels: Hotel[] | null | undefined,
    user: { role?: string; businessId?: unknown; hotelId?: unknown; _id?: unknown } | null | undefined,
    options?: { activeOnly?: boolean }
  ): Hotel[] {
    const list = this.normalizeHotelsList(hotels);
    const role = String(user?.role || '').trim().toLowerCase();
    const activeOnly = !!options?.activeOnly;
    const matchActive = (h: Hotel) =>
      !activeOnly || !(h as any).status || (h as any).status === 'active';

    if (role === 'superadmin' || role === 'admin') {
      return list.filter(matchActive);
    }

    if (role === 'business') {
      const businessId = this.normalizeHotelId(user?.businessId);
      if (!businessId) return [];
      return list.filter(
        (h) => this.sameHotelId(this.extractBusinessId(h), businessId) && matchActive(h)
      );
    }

    if (role === 'hotel') {
      const businessId = this.normalizeHotelId(user?.businessId);
      const hotelId = this.normalizeHotelId(user?.hotelId);
      const userId = this.normalizeHotelId(user?._id);

      if (businessId) {
        const byBusiness = list.filter(
          (h) => this.sameHotelId(this.extractBusinessId(h), businessId) && matchActive(h)
        );
        if (byBusiness.length > 0) return byBusiness;
      }

      return list.filter((h) => {
        if (!matchActive(h)) return false;
        if (hotelId && this.sameHotelId(h._id, hotelId)) return true;
        if (userId && this.sameHotelId((h as any).managerId, userId)) return true;
        return false;
      });
    }

    if (role === 'staff') {
      const hotelId = this.normalizeHotelId(user?.hotelId);
      if (!hotelId) return [];
      return list.filter((h) => this.sameHotelId(h._id, hotelId) && matchActive(h));
    }

    return [];
  }

  /** Stream hotelId đang chọn (cùng nguồn với sơ đồ phòng / session) */
  get selectedHotelId$(): Observable<string | null> {
    return this.sessionContext.selectedHotelId$;
  }

  setSelectedHotelId(hotelId: string | null, options?: { persist?: boolean }): void {
    this.sessionContext.setSelectedHotelId(this.normalizeHotelId(hotelId), options);
  }

  /**
   * Lấy floor từ Redis-backed session context (đồng bộ)
   */
  getStoredFloor(): string | null {
    return this.sessionContext.getSelectedFloor();
  }

  /**
   * Xóa context phòng/khách sạn khi logout
   */
  clearRoomContext(): void {
    this.sessionContext.clearLocal();
    this.clearHotelsListCache();
  }

  getCachedHotels(): Hotel[] {
    return this.hotelsListCache ? [...this.hotelsListCache] : [];
  }

  /** Chuẩn hóa _id hotels về string — tránh nz-select không khớp hotelId */
  normalizeHotelsList(hotels: Hotel[] | null | undefined): Hotel[] {
    return (hotels || [])
      .map((hotel) => {
        const id = this.normalizeHotelId((hotel as any)?._id ?? (hotel as any)?.id);
        if (!id) return null;
        const name = String((hotel as any)?.name || '').trim();
        if (name) {
          this.rememberHotelName(id, name);
        }
        return { ...hotel, _id: id } as Hotel;
      })
      .filter((hotel): hotel is Hotel => !!hotel);
  }

  /**
   * Đảm bảo hotelId đang chọn luôn có trong options dropdown.
   * Nếu list lọc theo role làm mất KS đang chọn → giữ lại từ raw/cache.
   */
  ensureSelectedHotelOption(
    hotels: Hotel[] | null | undefined,
    selectedHotelId?: string | null,
    fallbackName?: string | null
  ): Hotel[] {
    const list = this.normalizeHotelsList(hotels);
    const selected = this.normalizeHotelId(selectedHotelId);
    if (!selected) return list;
    if (list.some((h) => this.sameHotelId(h._id, selected))) return list;

    const fromCache = this.normalizeHotelsList(this.getCachedHotels())
      .find((h) => this.sameHotelId(h._id, selected));
    if (fromCache) {
      return [fromCache, ...list];
    }

    const cachedName = this.getCachedHotelName(selected);
    return [
      {
        _id: selected,
        name: (fallbackName || cachedName || '').trim() || 'Khách sạn đang chọn'
      } as Hotel,
      ...list
    ];
  }

  /** Cache tên KS theo id — dùng chung room board / AI / dropdown quản lý */
  private hotelNameById = new Map<string, string>();

  rememberHotelName(hotelId: unknown, name?: string | null): void {
    const id = this.normalizeHotelId(hotelId);
    const n = String(name || '').trim();
    if (!id || !n) return;
    if (/^[a-f0-9]{24}$/i.test(n)) return; // không cache raw ObjectId làm tên
    if (n === 'Khách sạn đang chọn') return;
    this.hotelNameById.set(id, n);
  }

  getCachedHotelName(hotelId: unknown): string | null {
    const id = this.normalizeHotelId(hotelId);
    if (!id) return null;
    return this.hotelNameById.get(id) || null;
  }

  /**
   * Resolve tên hiển thị: memory → list cache → GET /hotels/:id?lite=1
   * Không bao giờ trả về raw ObjectId.
   */
  resolveHotelDisplayName(hotelId: unknown): Observable<string> {
    const id = this.normalizeHotelId(hotelId);
    if (!id) {
      return of('Chưa chọn khách sạn');
    }

    const remembered = this.getCachedHotelName(id);
    if (remembered) {
      return of(remembered);
    }

    const fromList = this.normalizeHotelsList(this.getCachedHotels())
      .find((h) => this.sameHotelId(h._id, id));
    if (fromList?.name && String(fromList.name).trim()) {
      this.rememberHotelName(id, fromList.name);
      return of(String(fromList.name).trim());
    }

    return this.getHotelInfo(id, { lite: true }).pipe(
      map((hotel) => {
        const name = String(hotel?.name || '').trim() || 'Khách sạn';
        this.rememberHotelName(id, name);
        return name;
      }),
      catchError(() => of('Khách sạn'))
    );
  }

  clearHotelsListCache(): void {
    this.hotelsListCache = null;
    this.hotelsListCacheKey = null;
    this.hotelsListCacheAt = 0;
    this.hotelsListInFlight = null;
    this.hotelsListSubject.next([]);
  }

  private buildHotelsCacheKey(businessId?: string, status?: HotelStatus, lite?: boolean): string {
    return `${businessId || 'all'}|${status || 'any'}|${lite ? 'lite' : 'full'}`;
  }

  /**
   * Lấy danh sách hotels: ưu tiên cache cục bộ, chỉ gọi API khi miss/hết hạn.
   * Dùng chung cho staff / room / service / debt / category / floor / room board.
   */
  getHotelsCached(
    businessId?: string,
    status?: HotelStatus,
    options?: { lite?: boolean; forceRefresh?: boolean }
  ): Observable<Hotel[]> {
    const lite = options?.lite !== false; // mặc định lite để nhanh
    const key = this.buildHotelsCacheKey(businessId, status, lite);
    const now = Date.now();

    // Hit đúng key
    if (
      !options?.forceRefresh &&
      this.hotelsListCache &&
      this.hotelsListCacheKey === key &&
      now - this.hotelsListCacheAt < this.hotelsListTtlMs
    ) {
      return of(this.hotelsListCache);
    }

    // Không tái dùng cache sai key (tránh admin/business/hotel lẫn danh sách)

    if (!options?.forceRefresh && this.hotelsListInFlight && this.hotelsListCacheKey === key) {
      return this.hotelsListInFlight;
    }

    this.hotelsListCacheKey = key;
    this.hotelsListInFlight = this.getHotels(businessId, status, { lite }).pipe(
      timeout(8000),
      tap((hotels) => {
        this.hotelsListCache = this.normalizeHotelsList(Array.isArray(hotels) ? hotels : []);
        this.hotelsListCacheAt = Date.now();
        this.hotelsListSubject.next(this.hotelsListCache);
      }),
      catchError((err) => {
        this.hotelsListInFlight = null;
        console.warn('[HotelService] getHotelsCached failed/timeout:', err?.message || err);
        // Chỉ trả cache nếu đúng key — tránh lẫn danh sách theo role
        if (this.hotelsListCache && this.hotelsListCacheKey === key) {
          return of(this.hotelsListCache);
        }
        return of([]);
      }),
      finalize(() => {
        this.hotelsListInFlight = null;
      }),
      shareReplay(1)
    );

    return this.hotelsListInFlight;
  }

  getHotels(businessId?: string, status?: HotelStatus, options?: { lite?: boolean }): Observable<Hotel[]> {
    let params = new HttpParams();
    if (businessId) {
      params = params.set('businessId', businessId);
    }
    if (status) {
      params = params.set('status', status);
    }
    if (options?.lite) {
      params = params.set('lite', '1');
    }
    return this.http.get<Hotel[]>(this.apiUrl, { params });
  }

  getHotelById(id: string, options?: { lite?: boolean }): Observable<Hotel> {
    let params = new HttpParams();
    if (options?.lite) {
      params = params.set('lite', '1');
    }
    return this.http.get<Hotel>(`${this.apiUrl}/${id}`, { params });
  }

  getHotelInfo(hotelId: string | null | undefined, options?: { lite?: boolean }): Observable<Hotel | null> {
    if (!hotelId) {
      return of(null);
    }

    const cacheKey = `${hotelId}:${options?.lite ? 'lite' : 'full'}`;
    const cached = this.hotelInfoCache.get(cacheKey);
    if (cached && Date.now() - cached.updatedAt < this.hotelInfoCacheTtlMs) {
      this.rememberHotelName(hotelId, cached.payload?.name);
      return of(cached.payload);
    }
    
    let params = new HttpParams();
    if (options?.lite) {
      params = params.set('lite', '1');
    }

    return this.http.get<Hotel>(`${this.apiUrl}/${hotelId}`, { params }).pipe(
      map((hotel: Hotel) => {
        if (hotel) {
          this.hotelInfoCache.set(cacheKey, { payload: hotel, updatedAt: Date.now() });
          this.rememberHotelName(hotelId, hotel.name);
        }
        return hotel;
      }),
      catchError((error: any) => {
        console.error('Error fetching hotel info:', error);
        return of(null);
      })
    );
  }

  clearHotelInfoCache(hotelId?: string): void {
    if (!hotelId) {
      this.hotelInfoCache.clear();
      return;
    }
    Array.from(this.hotelInfoCache.keys()).forEach((key) => {
      if (key.startsWith(`${hotelId}:`)) {
        this.hotelInfoCache.delete(key);
      }
    });
  }

  createHotel(hotel: Partial<Hotel>): Observable<Hotel> {
    return this.http.post<Hotel>(this.apiUrl, hotel);
  }

  updateHotel(id: string, hotelUpdates: Partial<Hotel>): Observable<Hotel> {
    return this.http.put<Hotel>(`${this.apiUrl}/${id}`, hotelUpdates);
  }

  deleteHotel(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  updateHotelStatus(id: string, status: HotelStatus): Observable<Hotel> {
    return this.http.patch<{ message: string, hotel: Hotel }>(`${this.apiUrl}/${id}/status`, { status }).pipe(
      map(response => response.hotel)
    );
  }

  uploadHotelImages(id: string, images: string[]): Observable<{ message: string, images: string[] }> {
    return this.http.post<{ message: string, images: string[] }>(`${this.apiUrl}/${id}/images`, { images });
  }

  deleteHotelImage(id: string, imageIndex: number): Observable<{ message: string, images: string[] }> {
    return this.http.delete<{ message: string, images: string[] }>(`${this.apiUrl}/${id}/images/${imageIndex}`);
  }

  updateHotelSettings(id: string, settingsUpdate: Partial<Hotel['settings']>) : Observable<{ message: string, settings: Hotel['settings'] | undefined }>{
    return this.http.patch<{ message: string, settings: Hotel['settings'] }>(`${this.apiUrl}/${id}/settings`, { settings: settingsUpdate });
  }

  getHotelRevenue(hotelId: string, period: 'day' | 'week' | 'month' = 'day'): Observable<RevenueData> {
    const params = new HttpParams()
      .set('period', period);
    
    return this.http.get<RevenueData>(`${this.apiUrl}/${hotelId}/revenue`, { params });
  }

  getHotelRevenueByPeriod(hotelId: string, period: 'day' | 'week' | 'month' = 'day'): Observable<RevenueData> {
    const apiUrl = `${environment.apiUrl}/shift-handover/revenue/period`;
    const params = new HttpParams()
      .set('hotelId', hotelId)
      .set('period', period);
    
    return this.http.get<{ labels: string[], revenueData: number[], paymentData: number[], expenseData?: number[], totalRevenue: number, totalPayment: number, totalExpense?: number }>(apiUrl, { params }).pipe(
      map(response => ({
        labels: response.labels,
        revenueData: response.revenueData,
        paymentData: response.paymentData,
        expenseData: response.expenseData || [],
        totalRevenue: response.totalRevenue,
        totalPayment: response.totalPayment,
        totalExpense: response.totalExpense || 0
      }))
    );
  }

  private buildRevenueCacheKey(hotelId: string, period: 'day' | 'week' | 'month'): string {
    return `${hotelId}:${period}`;
  }

  getCachedHotelRevenueByPeriod(hotelId: string, period: 'day' | 'week' | 'month' = 'day') {
    if (!hotelId) {
      return null;
    }
    return this.revenueByPeriodCache.get(this.buildRevenueCacheKey(hotelId, period)) || null;
  }

  setCachedHotelRevenueByPeriod(hotelId: string, period: 'day' | 'week' | 'month', payload: RevenueData): void {
    if (!hotelId) {
      return;
    }
    this.revenueByPeriodCache.set(this.buildRevenueCacheKey(hotelId, period), {
      payload,
      updatedAt: Date.now()
    });
  }

  clearCachedHotelRevenueByPeriod(hotelId?: string): void {
    if (!hotelId) {
      this.revenueByPeriodCache.clear();
      return;
    }

    Array.from(this.revenueByPeriodCache.keys()).forEach((cacheKey) => {
      if (cacheKey.startsWith(`${hotelId}:`)) {
        this.revenueByPeriodCache.delete(cacheKey);
      }
    });
  }

  getHotelRevenueMock(hotelId: string, period: 'day' | 'week' | 'month' = 'day'): Observable<RevenueData> {
    return new Observable<RevenueData>(observer => {
      let labels: string[] = [];
      let revenueData: number[] = [];
      let paymentData: number[] = [];
      
      const now = new Date();
      const totalRevenue = Math.floor(Math.random() * 10000000) + 5000000;
      const totalPayment = Math.floor(totalRevenue * 0.9);
      
      if (period === 'day') {
        for (let i = 0; i < 24; i++) {
          labels.push(`${i}:00`);
          const revenue = Math.floor(Math.random() * 500000);
          revenueData.push(revenue);
          paymentData.push(Math.floor(revenue * (0.8 + Math.random() * 0.2)));
        }
      } else if (period === 'week') {
        const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
        const today = now.getDay();
        
        for (let i = 0; i < 7; i++) {
          const dayIndex = (today - 6 + i + 7) % 7;
          labels.push(days[dayIndex]);
          const revenue = Math.floor(Math.random() * 2000000) + 500000;
          revenueData.push(revenue);
          paymentData.push(Math.floor(revenue * (0.85 + Math.random() * 0.15)));
        }
      } else if (period === 'month') {
        const date = new Date(now);
        date.setDate(date.getDate() - 29);
        
        for (let i = 0; i < 30; i++) {
          date.setDate(date.getDate() + 1);
          labels.push(`${date.getDate()}/${date.getMonth() + 1}`);
          const revenue = Math.floor(Math.random() * 1000000) + 200000;
          revenueData.push(revenue);
          paymentData.push(Math.floor(revenue * (0.85 + Math.random() * 0.15)));
        }
      }
      
      observer.next({
        labels,
        revenueData,
        paymentData,
        totalRevenue,
        totalPayment
      });
      observer.complete();
    });
  }
}
