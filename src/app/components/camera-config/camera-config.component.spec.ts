import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CameraConfigComponent } from './camera-config.component';

describe('CameraConfigComponent', () => {
  let component: CameraConfigComponent;
  let fixture: ComponentFixture<CameraConfigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CameraConfigComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CameraConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
