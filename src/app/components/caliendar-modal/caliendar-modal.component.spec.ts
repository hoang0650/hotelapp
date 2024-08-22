import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaliendarModalComponent } from './caliendar-modal.component';

describe('CaliendarModalComponent', () => {
  let component: CaliendarModalComponent;
  let fixture: ComponentFixture<CaliendarModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CaliendarModalComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CaliendarModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
