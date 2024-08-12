import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HotelManagementComponent } from './hotel-management.component';

describe('HotelManagementComponent', () => {
  let component: HotelManagementComponent;
  let fixture: ComponentFixture<HotelManagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HotelManagementComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(HotelManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
