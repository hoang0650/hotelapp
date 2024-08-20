import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { EmailService } from '../../services/email.service';

@Component({
  selector: 'app-email-compose',
  templateUrl: './email-compose.component.html',
  styleUrls: ['./email-compose.component.css']
})
export class EmailComposeComponent {
  emailForm: FormGroup;
  file: File | null = null;

  constructor(private fb: FormBuilder, private emailService: EmailService) {
    this.emailForm = this.fb.group({
      to: ['', [Validators.required, Validators.email]],
      subject: ['', Validators.required],
      body: ['', Validators.required]
    });
  }

  onFileChange(event: any): void {
    this.file = event.target.files[0];
  }

  onSend(): void {
    if (this.emailForm.valid) {
      const formValue = this.emailForm.value;
      const emailData = {
        to: formValue.to,
        subject: formValue.subject,
        body: formValue.body,
        file: this.file
      };

      this.emailService.sendEmail(emailData).subscribe(
        response => {
          console.log('Email sent successfully', response);
          this.emailForm.reset();
          this.file = null;
        },
        error => {
          console.error('Error sending email', error);
        }
      );
    } else {
      console.log('Form is invalid');
    }
  }

  sendOtp(): void {
    const to = this.emailForm.get('to')?.value;
    if (to) {
      this.emailService.sendOtp(to).subscribe(
        response => {
          console.log('OTP sent successfully', response);
        },
        error => {
          console.error('Error sending OTP', error);
        }
      );
    }
  }
}
