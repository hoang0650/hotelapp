import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VisaPaymentComponent } from './visa-payment.component';

describe('VisaPaymentComponent', () => {
  let component: VisaPaymentComponent;
  let fixture: ComponentFixture<VisaPaymentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [VisaPaymentComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(VisaPaymentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
