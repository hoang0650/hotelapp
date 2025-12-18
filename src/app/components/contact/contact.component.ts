import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ContactService } from '../../services/contact.service';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'app-contact',
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.css']
})
export class ContactComponent implements OnInit {
  contactForm!: FormGroup;
  isLoading = false;

  constructor(
    private fb: FormBuilder,
    private contactService: ContactService,
    private message: NzMessageService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
  }

  private initForm(): void {
    this.contactForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      subject: ['', [Validators.required, Validators.minLength(5)]],
      message: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  onSubmit(): void {
    if (this.contactForm.invalid) {
      Object.values(this.contactForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      return;
    }

    this.isLoading = true;
    const formData = this.contactForm.value;

    this.contactService.createContact(formData).subscribe({
      next: (response) => {
        this.message.success(response.message || 'Gửi liên hệ thành công! Chúng tôi sẽ phản hồi sớm nhất có thể.');
        this.contactForm.reset();
        this.isLoading = false;
      },
      error: (error) => {
        this.isLoading = false;
        this.message.error(error.error?.error || 'Gửi liên hệ thất bại. Vui lòng thử lại sau.');
      }
    });
  }
}

