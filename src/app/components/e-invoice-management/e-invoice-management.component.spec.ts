import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EInvoiceManagementComponent } from './e-invoice-management.component';

describe('EInvoiceManagementComponent', () => {
  let component: EInvoiceManagementComponent;
  let fixture: ComponentFixture<EInvoiceManagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EInvoiceManagementComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EInvoiceManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

