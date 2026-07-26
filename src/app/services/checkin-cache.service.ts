import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { SessionContextService } from './session-context.service';

/**
 * Cache checkin tạm (đồng bộ Redis qua /sessions/checkin-data).
 * Memory map cho đọc sync; persist async để web/app cùng nguồn.
 */
@Injectable({
  providedIn: 'root'
})
export class CheckinCacheService {
  private memory = new Map<string, any>();

  constructor(
    private apiService: ApiService,
    private sessionContext: SessionContextService
  ) {}

  private key(hotelId: string, roomId: string): string {
    return `${hotelId}:${roomId}`;
  }

  getSync(roomId: string, hotelId?: string | null): any | null {
    const hid = hotelId || this.sessionContext.getSelectedHotelId();
    if (!hid || !roomId) return null;
    return this.memory.get(this.key(hid, roomId)) || null;
  }

  set(roomId: string, checkinData: any, hotelId?: string | null): void {
    const hid = hotelId || this.sessionContext.getSelectedHotelId();
    if (!hid || !roomId) return;

    if (checkinData == null) {
      this.memory.delete(this.key(hid, roomId));
      this.apiService.saveCheckinData(hid, roomId, null).subscribe({
        error: (err) => console.error('[CheckinCache] delete failed:', err)
      });
      return;
    }

    this.memory.set(this.key(hid, roomId), checkinData);
    this.apiService.saveCheckinData(hid, roomId, checkinData).subscribe({
      error: (err) => console.error('[CheckinCache] save failed:', err)
    });
  }

  remove(roomId: string, hotelId?: string | null): void {
    this.set(roomId, null, hotelId);
  }

  hydrate(roomId: string, hotelId?: string | null): void {
    const hid = hotelId || this.sessionContext.getSelectedHotelId();
    if (!hid || !roomId) return;
    this.apiService.getCheckinData(hid, roomId).subscribe({
      next: (res) => {
        if (res?.checkinData) {
          this.memory.set(this.key(hid, roomId), res.checkinData);
        }
      },
      error: () => {}
    });
  }
}
