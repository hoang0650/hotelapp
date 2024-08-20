import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmailAdminComponent } from './email-admin.component';

describe('EmailAdminComponent', () => {
  let component: EmailAdminComponent;
  let fixture: ComponentFixture<EmailAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [EmailAdminComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(EmailAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
