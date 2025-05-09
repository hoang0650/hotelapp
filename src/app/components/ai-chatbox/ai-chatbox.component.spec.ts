import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AiChatboxComponent } from './ai-chatbox.component';

describe('AiChatboxComponent', () => {
  let component: AiChatboxComponent;
  let fixture: ComponentFixture<AiChatboxComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AiChatboxComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AiChatboxComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
