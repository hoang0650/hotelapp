import { Component, OnInit } from '@angular/core';
import { Hotel } from '../../interfaces/hotel';
import { HotelService } from '../../services/hotel.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-floor-plan-page',
  template: `
    <nz-card>
      <h2>{{ 'SIDEBAR.FLOOR_PLAN' | translate }}</h2>
      <div style="margin-bottom: 16px;">
        <nz-form-item>
          <nz-form-label>{{ 'ROOM_MANAGEMENT.HOTEL' | translate }}</nz-form-label>
          <nz-form-control>
            <nz-select [(ngModel)]="selectedHotelId" nzAllowClear nzShowSearch
              [nzPlaceHolder]="'ROOM_MANAGEMENT.SELECT_HOTEL' | translate" style="width: 300px;">
              <nz-option *ngFor="let hotel of hotels" [nzValue]="hotel._id" [nzLabel]="hotel.name"></nz-option>
            </nz-select>
          </nz-form-control>
        </nz-form-item>
      </div>
      <app-floor-plan *ngIf="selectedHotelId" [hotelId]="selectedHotelId"></app-floor-plan>
    </nz-card>
  `
})
export class FloorPlanPageComponent implements OnInit {
  hotels: Hotel[] = [];
  selectedHotelId: string = '';

  constructor(
    private hotelService: HotelService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (user?.hotelId) {
      this.selectedHotelId = user.hotelId;
    }
    this.hotelService.getHotels().subscribe({
      next: (res: any) => {
        this.hotels = res.data || res || [];
        if (!this.selectedHotelId && this.hotels.length === 1) {
          this.selectedHotelId = (this.hotels[0] as any)._id;
        }
      }
    });
  }
}
