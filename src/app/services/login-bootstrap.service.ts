import { Injectable } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError, take, tap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { RoomsService } from './rooms.service';
import { SessionContextService } from './session-context.service';
import { HotelService } from './hotel.service';
import { PermissionService } from './permission.service';
import { PricingService } from './pricing.service';
import { User } from '../interfaces/user';

/**
 * Warm cache ngay sau login để /admin/room + sidebar hiện gần như tức thì.
 * Critical path: seed auth → seed hotelId → GET rooms?lite=1 (song song với navigate).
 */
@Injectable({
  providedIn: 'root'
})
export class LoginBootstrapService {
  private prefetchedHotelId: string | null = null;

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private roomsService: RoomsService,
    private sessionContext: SessionContextService,
    private hotelService: HotelService,
    private permissionService: PermissionService,
    private pricingService: PricingService
  ) {}

  /**
   * Seed auth + Redis session + prefetch rooms lite (không chặn navigation).
   */
  bootstrapAfterLogin(token: string, user: User): void {
    try {
      this.authService.loginFromShiftHandover(token, user);
      this.authService.authResolved.next(true);

      // Quyền sidebar: refresh ngay — không chờ 1.5s (tránh menu thiếu/sai sau login)
      this.permissionService.refreshPermissions();
      // Pricing / package không chặn board — trì hoãn mạnh khi Redis chậm
      setTimeout(() => {
        this.pricingService.prefetchPackages();
        if (user?._id) {
          this.pricingService.getCurrentUserPackage(String(user._id)).subscribe({ next: () => {}, error: () => {} });
        }
      }, 4000);

      const hotelId = this.resolveHotelId(user);
      const role = String(user?.role || '').trim().toLowerCase();
      const isPlatformAdmin = role === 'superadmin' || role === 'admin';

      if (hotelId) {
        this.seedHotelAndPrefetch(hotelId, true);
      } else if (isPlatformAdmin || !hotelId) {
        // Không có hotelId trên profile: lấy selected-hotel Redis SONG SONG với hotels list
        // → rooms lite warm sớm (không chờ getHotels xong)
        const userId = user?._id ? String(user._id) : '';
        if (userId) {
          this.apiService.getSelectedHotel(userId).pipe(
            take(1),
            catchError(() => of(null))
          ).subscribe((res) => {
            const resolved = this.hotelService.normalizeHotelId(res?.selectedHotelId);
            if (resolved && !this.sessionContext.getSelectedHotelId()) {
              this.seedHotelAndPrefetch(resolved, false);
            }
          });
        }
        void this.sessionContext.ensureHydrated().then(() => {
          const resolved = this.sessionContext.getSelectedHotelId();
          if (resolved) {
            this.prefetchHotelBundle(resolved);
          }
        }).catch(() => {});
      }

      // Warm danh sách hotels — nền; admin seed KS đầu nếu Redis chưa có
      this.prefetchHotelsList(user);
    } catch (err) {
      console.error('[LoginBootstrap] bootstrapAfterLogin error:', err);
      this.authService.loginFromShiftHandover(token, user);
      this.authService.authResolved.next(true);
    }
  }

  private seedHotelAndPrefetch(hotelId: string, persist: boolean): void {
    const id = this.hotelService.normalizeHotelId(hotelId);
    if (!id) return;
    this.sessionContext.setSelectedHotelId(id, { persist });
    this.hotelService.saveRoomContext(id, this.sessionContext.getSelectedFloor() || '');
    this.prefetchHotelBundle(id);
  }

  private prefetchHotelsList(user: User | null): void {
    const role = String(user?.role || '').trim().toLowerCase();
    const isPlatformAdmin = role === 'superadmin' || role === 'admin';
    const businessId = isPlatformAdmin
      ? undefined
      : (this.authService.getBusinessId() || undefined);
    this.hotelService.getHotelsCached(businessId, undefined, { lite: true }).pipe(take(1)).subscribe({
      next: (hotels) => {
        // Mọi role (không riêng admin): chưa có KS chọn → seed KS đầu
        // (quản lý KS không gắn user.hotelId từng bị board trống vì không ai seed)
        if (this.sessionContext.getSelectedHotelId()) return;
        const filtered = this.hotelService.filterHotelsForUser(hotels, user);
        const firstId = filtered.length
          ? this.hotelService.normalizeHotelId(filtered[0]._id)
          : null;
        if (firstId) {
          this.seedHotelAndPrefetch(firstId, true);
        }
      },
      error: () => {}
    });
  }

  private resolveHotelId(user: User | null): string | null {
    if (!user) return null;
    const raw = (user as any).hotelId;
    if (!raw) return null;
    if (typeof raw === 'string') return raw.trim() || null;
    if (typeof raw === 'object' && raw._id) return String(raw._id).trim() || null;
    const s = String(raw).trim();
    return s && s !== '[object Object]' ? s : null;
  }

  /** Prefetch rooms lite — critical path; secondary APIs sau khi rooms về */
  private prefetchHotelBundle(hotelId: string): void {
    const id = this.hotelService.normalizeHotelId(hotelId);
    if (!id) return;
    if (this.prefetchedHotelId === id) return;
    this.prefetchedHotelId = id;

    // Rooms lite trước (critical path); session/floor/columns sau để không tranh bandwidth
    this.roomsService.getRooms({ hotelId: id, lite: true }).pipe(
      tap((rooms) => this.roomsService.setCachedRooms(id, rooms || [])),
      catchError(() => of([])),
      take(1)
    ).subscribe({
      next: () => {
        // Secondary: trì hoãn nhẹ để first paint sơ đồ phòng ưu tiên
        setTimeout(() => {
          forkJoin({
            sessions: this.apiService.getRoomSessions(id).pipe(
              catchError(() => of({})),
              take(1)
            ),
            columns: this.apiService.getRoomColumnsCount().pipe(
              tap((res) => {
                if (res?.columnsCount) {
                  this.sessionContext.setRoomColumnsCount(res.columnsCount, { persist: false });
                }
              }),
              catchError(() => of(null)),
              take(1)
            ),
            floor: this.apiService.getSelectedFloor(this.authService.getUserId() || '', id).pipe(
              tap((res) => {
                if (res?.selectedFloor != null) {
                  this.sessionContext.setSelectedFloor(String(res.selectedFloor), { persist: false, hotelId: id });
                }
              }),
              catchError(() => of(null)),
              take(1)
            )
          }).subscribe({ next: () => {}, error: () => {} });
        }, 200);
      },
      error: () => {
        this.prefetchedHotelId = null;
      }
    });
  }
}
