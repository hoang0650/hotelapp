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

  async onSend(): Promise<void> {
    if (this.emailForm.valid) {
      const formValue = this.emailForm.value;
      
      // Convert File to base64 if file exists
      let fileData: { name: string; data: string } | undefined;
      if (this.file) {
        try {
          const base64Data = await this.fileToBase64(this.file);
          fileData = {
            name: this.file.name,
            data: base64Data
          };
        } catch (error) {
          console.error('Error converting file to base64:', error);
        }
      }

      const emailData = {
        to: formValue.to,
        subject: formValue.subject,
        body: formValue.body,
        file: fileData
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

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (data:image/png;base64,)
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
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
