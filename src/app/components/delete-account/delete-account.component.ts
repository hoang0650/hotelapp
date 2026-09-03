import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { NzMessageService } from 'ng-zorro-antd/message';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-delete-account',
  templateUrl: './delete-account.component.html',
  styleUrls: ['./delete-account.component.css']
})
export class DeleteAccountComponent {
  form: FormGroup;
  submitting = false;
  submitted = false;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private message: NzMessageService
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      note: ['']
    });
  }

  submit(): void {
    if (this.form.invalid || this.submitting) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting = true;
    this.http.post(`${environment.apiUrl}/users/request-account-deletion`, this.form.value).subscribe({
      next: () => {
        this.submitted = true;
        this.submitting = false;
        this.message.success('Đã gửi yêu cầu xóa tài khoản.');
      },
      error: (err) => {
        this.submitting = false;
        this.message.error(err?.error?.message || 'Không gửi được yêu cầu. Email support@phhotel.vn');
      }
    });
  }
}
