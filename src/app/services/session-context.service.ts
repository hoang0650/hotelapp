import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

/**
 * Context phiên làm việc đồng bộ qua Redis (phhotel-api /sessions/*).
 * Thay localStorage cho selectedHotel / floor / columns / staff để web + app cùng nguồn.
 */
@Injectable({
  providedIn: 'root'
})
export class SessionContextService {
  private selectedHotelIdSubject = new BehaviorSubject<string | null>(null);
  private selectedFloorSubject = new BehaviorSubject<string | null>(null);
  private roomColumnsCountSubject = new BehaviorSubject<number | null>(null);
  private staffIdSubject = new BehaviorSubject<string | null>(null);
  private staffNameSubject = new BehaviorSubject<string | null>(null);
  private hydrated = false;
  private hydrateInFlight: Promise<void> | null = null;

  readonly selectedHotelId$ = this.selectedHotelIdSubject.asObservable();
  readonly selectedFloor$ = this.selectedFloorSubject.asObservable();
  readonly roomColumnsCount$ = this.roomColumnsCountSubject.asObservable();
  readonly staffId$ = this.staffIdSubject.asObservable();

  constructor(
    private apiService: ApiService,
    private authService: AuthService
  ) {
    this.authService.currentUser$.subscribe((user) => {
      if (!user) {
        this.clearLocal();
        this.hydrated = false;
        return;
      }
      void this.hydrateFromRedis();
    });
  }

  getSelectedHotelId(): string | null {
    return this.selectedHotelIdSubject.value;
  }

  /**
   * Ưu tiên hotelId đã warm từ Redis / login bootstrap, rồi fallback profile user.
   * Dùng để các màn quản lý load data ngay, không chờ getHotels().
   */
  resolvePreferredHotelId(fallbackHotelId?: string | null): string | null {
    const fromSession = this.selectedHotelIdSubject.value?.trim() || null;
    if (fromSession) return fromSession;
    const fromFallback = fallbackHotelId ? String(fallbackHotelId).trim() : '';
    if (fromFallback) return fromFallback;
    return this.authService.getHotelId();
  }

  getSelectedFloor(): string | null {
    return this.selectedFloorSubject.value;
  }

  getRoomColumnsCount(): number | null {
    return this.roomColumnsCountSubject.value;
  }

  getStaffId(): string | null {
    return this.staffIdSubject.value;
  }

  getStaffName(): string | null {
    return this.staffNameSubject.value;
  }

  async ensureHydrated(): Promise<void> {
    if (this.hydrated) return;
    await this.hydrateFromRedis();
  }

  setSelectedHotelId(hotelId: string | null, options?: { persist?: boolean }): void {
    const normalized = hotelId?.trim() || null;
    // Không POST Redis lại khi hotelId không đổi — tránh storm sau login/bootstrap
    if (this.selectedHotelIdSubject.value === normalized) {
      return;
    }
    this.selectedHotelIdSubject.next(normalized);
    if (normalized && options?.persist !== false) {
      this.persistSelectedHotel(normalized);
    }
  }

  setSelectedFloor(floor: string | null, options?: { persist?: boolean; hotelId?: string }): void {
    const normalized = floor === undefined || floor === null || floor === '' ? null : String(floor);
    const unchanged = this.selectedFloorSubject.value === normalized;
    if (!unchanged) {
      this.selectedFloorSubject.next(normalized);
    }
    if (options?.persist === false || unchanged) return;

    const hotelId = options?.hotelId || this.selectedHotelIdSubject.value;
    const userId = this.authService.getUserId();
    if (!hotelId || !userId) return;

    this.apiService.saveSelectedFloor(userId, hotelId, normalized).subscribe({
      error: (err) => console.error('[SessionContext] saveSelectedFloor failed:', err)
    });
  }

  setRoomColumnsCount(count: number, options?: { persist?: boolean }): void {
    if (!Number.isFinite(count) || count < 2 || count > 12) return;
    this.roomColumnsCountSubject.next(count);
    if (options?.persist === false) return;

    const userId = this.authService.getUserId();
    if (!userId) return;
    this.apiService.saveRoomColumnsCount(userId, count).subscribe({
      error: (err) => console.error('[SessionContext] saveRoomColumnsCount failed:', err)
    });
  }

  setStaffContext(staffId: string | null, staffName?: string | null, options?: { persist?: boolean }): void {
    const id = staffId?.trim() || null;
    const name = staffName?.trim() || null;
    this.staffIdSubject.next(id);
    if (name !== undefined) {
      this.staffNameSubject.next(name);
    }
    if (options?.persist === false) return;

    this.apiService.saveStaffContext(id, this.staffNameSubject.value).subscribe({
      error: (err) => console.error('[SessionContext] saveStaffContext failed:', err)
    });
  }

  saveRoomContext(hotelId: string, floor: string): void {
    this.setSelectedHotelId(hotelId, { persist: true });
    this.setSelectedFloor(floor || null, { persist: true, hotelId });
  }

  clearLocal(): void {
    this.selectedHotelIdSubject.next(null);
    this.selectedFloorSubject.next(null);
    this.roomColumnsCountSubject.next(null);
    this.staffIdSubject.next(null);
    this.staffNameSubject.next(null);
  }

  private persistSelectedHotel(hotelId: string): void {
    const userId = this.authService.getUserId();
    this.apiService.saveSelectedHotel(userId || undefined, hotelId).subscribe({
      error: (err) => console.error('[SessionContext] saveSelectedHotel failed:', err)
    });
  }

  private hydrateFromRedis(): Promise<void> {
    if (this.hydrateInFlight) return this.hydrateInFlight;

    const userId = this.authService.getUserId();
    if (!userId || !this.authService.isLoggedIn()) {
      this.hydrated = true;
      return Promise.resolve();
    }

    this.hydrateInFlight = new Promise<void>((resolve) => {
      const seededHotelId = this.selectedHotelIdSubject.value || this.authService.getHotelId();
      // Critical: hotel + floor. Columns/staff không chặn hydrate (tránh 8s Redis timeout).
      let pending = 1;
      const done = () => {
        pending -= 1;
        if (pending <= 0) {
          this.hydrated = true;
          this.hydrateInFlight = null;
          resolve();
        }
      };

      const loadSecondaryPrefs = () => {
        setTimeout(() => {
          if (this.roomColumnsCountSubject.value == null) {
            this.apiService.getRoomColumnsCount(userId).pipe(
              catchError(() => of({ columnsCount: null }))
            ).subscribe((res) => {
              const count = res?.columnsCount;
              if (count && count >= 2 && count <= 12 && this.roomColumnsCountSubject.value == null) {
                this.roomColumnsCountSubject.next(count);
              }
            });
          }
          if (!this.staffIdSubject.value) {
            this.apiService.getStaffContext().pipe(
              catchError(() => of({ staffId: null, staffName: null }))
            ).subscribe((res) => {
              if (res?.staffId && !this.staffIdSubject.value) {
                this.staffIdSubject.next(res.staffId);
              }
              if (res?.staffName && !this.staffNameSubject.value) {
                this.staffNameSubject.next(res.staffName);
              }
            });
          }
        }, 1200);
      };

      if (seededHotelId) {
        if (!this.selectedHotelIdSubject.value) {
          this.selectedHotelIdSubject.next(seededHotelId);
        }
        if (this.selectedFloorSubject.value == null) {
          this.apiService.getSelectedFloor(userId, seededHotelId).pipe(
            catchError(() => of({ selectedFloor: null }))
          ).subscribe((floorRes) => {
            if (floorRes?.selectedFloor != null && this.selectedFloorSubject.value == null) {
              this.selectedFloorSubject.next(String(floorRes.selectedFloor));
            }
            loadSecondaryPrefs();
            done();
          });
        } else {
          loadSecondaryPrefs();
          done();
        }
      } else {
        this.apiService.getSelectedHotel(userId).pipe(
          catchError(() => of({ selectedHotelId: null }))
        ).subscribe((res) => {
          const hotelId = res?.selectedHotelId || this.authService.getHotelId();
          if (hotelId && !this.selectedHotelIdSubject.value) {
            this.selectedHotelIdSubject.next(hotelId);
          }

          const effectiveHotelId = this.selectedHotelIdSubject.value;
          if (effectiveHotelId && this.selectedFloorSubject.value == null) {
            this.apiService.getSelectedFloor(userId, effectiveHotelId).pipe(
              catchError(() => of({ selectedFloor: null }))
            ).subscribe((floorRes) => {
              if (floorRes?.selectedFloor != null && this.selectedFloorSubject.value == null) {
                this.selectedFloorSubject.next(String(floorRes.selectedFloor));
              }
              loadSecondaryPrefs();
              done();
            });
          } else {
            loadSecondaryPrefs();
            done();
          }
        });
      }
    });

    return this.hydrateInFlight;
  }
}
