import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EInvoiceTemplateComponent } from './e-invoice-template.component';

describe('EInvoiceTemplateComponent', () => {
  let component: EInvoiceTemplateComponent;
  let fixture: ComponentFixture<EInvoiceTemplateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EInvoiceTemplateComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EInvoiceTemplateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

