import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoomContentModalComponent } from './room-content-modal.component';

describe('RoomContentModalComponent', () => {
  let component: RoomContentModalComponent;
  let fixture: ComponentFixture<RoomContentModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RoomContentModalComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoomContentModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
