import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';

import { QrPaymentComponent } from './qr-payment.component';
import { UserService } from '../../services/user.service';
import { NzMessageService } from 'ng-zorro-antd/message';

describe('QrPaymentComponent', () => {
  let component: QrPaymentComponent;
  let fixture: ComponentFixture<QrPaymentComponent>;
  const userServiceMock = {
    getProfile: () => of({
      username: 'tester',
      email: 'tester@example.com',
      bankAccount: {
        bankName: 'VCB',
        accountNumber: '0123456789',
        beneficiaryName: 'Tester',
        qrPaymentUrl: 'https://qr.sepay.vn/img?acc=0123456789&bank=VCB'
      }
    })
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [QrPaymentComponent],
      providers: [
        { provide: UserService, useValue: userServiceMock },
        { provide: NzMessageService, useValue: { error: jasmine.createSpy('error') } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(QrPaymentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
