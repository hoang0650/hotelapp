import { Component, OnInit } from '@angular/core';
import { Hotel } from '../../interfaces/hotel';
import { HotelService } from '../../services/hotel.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-room-category-page',
  template: `
    <nz-card>
      <h2>{{ 'SIDEBAR.ROOM_CATEGORY' | translate }}</h2>
      <div style="margin-bottom: 16px;">
        <nz-form-item>
          <nz-form-label>{{ 'ROOM_MANAGEMENT.HOTEL' | translate }}</nz-form-label>
          <nz-form-control>
            <nz-select
              [ngModel]="selectedHotelId"
              (ngModelChange)="onHotelChange($event)"
              nzAllowClear
              nzShowSearch
              [nzPlaceHolder]="'ROOM_MANAGEMENT.SELECT_HOTEL' | translate"
              style="width: 300px;">
              <nz-option *ngFor="let hotel of hotels" [nzValue]="hotel._id" [nzLabel]="hotel.name"></nz-option>
            </nz-select>
          </nz-form-control>
        </nz-form-item>
      </div>
      <app-room-category *ngIf="selectedHotelId" [hotelId]="selectedHotelId"></app-room-category>
    </nz-card>
  `
})
export class RoomCategoryPageComponent implements OnInit {
  hotels: Hotel[] = [];
  selectedHotelId: string = '';

  constructor(
    private hotelService: HotelService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    const storedHotelId = this.hotelService.resolvePreferredHotelId(this.authService.getHotelId());
    if (storedHotelId) {
      this.selectedHotelId = storedHotelId;
    }

    const cached = this.hotelService.getCachedHotels();
    if (cached.length > 0) {
      this.applyHotels(cached);
    }

    this.hotelService.getHotelsCached(undefined, undefined, { lite: true }).subscribe({
      next: (res) => this.applyHotels(res || [])
    });
  }

  private applyHotels(list: Hotel[]): void {
    this.hotels = list;
    if (!this.selectedHotelId && this.hotels.length === 1) {
      this.onHotelChange((this.hotels[0] as any)._id);
    } else if (this.selectedHotelId && this.hotels.length > 0) {
      const stillValid = this.hotels.some(h => h._id === this.selectedHotelId);
      if (!stillValid) {
        this.onHotelChange((this.hotels[0] as any)._id);
      }
    }
  }

  onHotelChange(hotelId: string | null): void {
    this.selectedHotelId = hotelId || '';
    this.hotelService.setSelectedHotelId(hotelId || null);
  }
}
