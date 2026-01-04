import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EInvoiceRegistrationComponent } from './e-invoice-registration.component';

describe('EInvoiceRegistrationComponent', () => {
  let component: EInvoiceRegistrationComponent;
  let fixture: ComponentFixture<EInvoiceRegistrationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EInvoiceRegistrationComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EInvoiceRegistrationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

