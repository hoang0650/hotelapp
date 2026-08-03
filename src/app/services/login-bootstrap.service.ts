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
 * Warm cache ngay sau login để /admin/room + sidebar + /pricing hiện gần như tức thì.
 */
@Injectable({
  providedIn: 'root'
})
export class LoginBootstrapService {
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
      // Quyền/gói giá: trì hoãn nhẹ để nhường bandwidth cho rooms lite
      setTimeout(() => {
        this.permissionService.refreshPermissions();
        this.pricingService.prefetchPackages();
        if (user?._id) {
          this.pricingService.getCurrentUserPackage(String(user._id)).subscribe({ next: () => {}, error: () => {} });
        }
      }, 800);

      const hotelId = this.resolveHotelId(user);
      if (hotelId) {
        // Seed local ngay; persist Redis chạy nền (không chặn UI)
        this.sessionContext.setSelectedHotelId(hotelId, { persist: true });
        this.hotelService.saveRoomContext(hotelId, this.sessionContext.getSelectedFloor() || '');
        this.prefetchHotelBundle(hotelId);
      } else {
        void this.sessionContext.ensureHydrated().then(() => {
          const resolved = this.sessionContext.getSelectedHotelId();
          if (resolved) {
            this.prefetchHotelBundle(resolved);
          }
        }).catch(() => {});
      }

      // Warm danh sách hotels cục bộ 1 lần — các màn quản lý tái sử dụng, không gọi lại API
      this.prefetchHotelsList(user);
    } catch (err) {
      console.error('[LoginBootstrap] bootstrapAfterLogin error:', err);
      this.authService.loginFromShiftHandover(token, user);
      this.authService.authResolved.next(true);
    }
  }

  private prefetchHotelsList(user: User | null): void {
    const role = String(user?.role || '').trim().toLowerCase();
    const isPlatformAdmin = role === 'superadmin' || role === 'admin';
    const businessId = isPlatformAdmin
      ? undefined
      : (this.authService.getBusinessId() || undefined);
    this.hotelService.getHotelsCached(businessId, undefined, { lite: true }).pipe(take(1)).subscribe({
      next: (hotels) => {
        // superadmin/admin không có hotelId — seed KS đầu tiên để /admin/room không kẹt "Trống"
        if (!isPlatformAdmin) return;
        if (this.sessionContext.getSelectedHotelId()) return;
        const filtered = this.hotelService.filterHotelsForUser(hotels, user);
        const firstId = filtered.length
          ? this.hotelService.normalizeHotelId(filtered[0]._id)
          : null;
        if (firstId) {
          this.sessionContext.setSelectedHotelId(firstId, { persist: true });
          this.hotelService.saveRoomContext(firstId, this.sessionContext.getSelectedFloor() || '');
          this.prefetchHotelBundle(firstId);
        }
      },
      error: () => {}
    });
  }

  private resolveHotelId(user: User | null): string | null {
    if (!user) return null;
    const raw = (user as any).hotelId;
    if (!raw) return null;
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'object' && raw._id) return String(raw._id);
    return String(raw);
  }

  private prefetchHotelBundle(hotelId: string): void {
    if (!hotelId) return;

    // Rooms lite trước (critical path); session/floor/columns sau để không tranh bandwidth
    this.roomsService.getRooms({ hotelId, lite: true }).pipe(
      tap((rooms) => this.roomsService.setCachedRooms(hotelId, rooms || [])),
      catchError(() => of([])),
      take(1)
    ).subscribe({
      next: () => {
        forkJoin({
          sessions: this.apiService.getRoomSessions(hotelId).pipe(
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
          floor: this.apiService.getSelectedFloor(this.authService.getUserId() || '', hotelId).pipe(
            tap((res) => {
              if (res?.selectedFloor != null) {
                this.sessionContext.setSelectedFloor(String(res.selectedFloor), { persist: false, hotelId });
              }
            }),
            catchError(() => of(null)),
            take(1)
          )
        }).subscribe({ next: () => {}, error: () => {} });
      },
      error: () => {}
    });
  }
}
