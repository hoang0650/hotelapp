import { Component, OnInit } from '@angular/core';
import { EmailService, EmailHistory } from '../../services/email.service';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'app-email-list',
  templateUrl: './email-list.component.html',
  styleUrls: ['./email-list.component.css']
})
export class EmailListComponent implements OnInit {
  emailList: EmailHistory[] = [];
  loading = false;

  constructor(
    private emailService: EmailService,
    private message: NzMessageService
  ) {}

  ngOnInit(): void {
    this.loadEmailList();
  }

  loadEmailList(): void {
    this.loading = true;
    this.emailService.loadOtp().subscribe({
      next: (response) => {
        // API trả về { success, data, total } hoặc array trực tiếp
        if (response && typeof response === 'object' && 'data' in response) {
          this.emailList = response.data || [];
        } else if (Array.isArray(response)) {
          this.emailList = response;
        } else {
          this.emailList = [];
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading email list', error);
        this.message.error('Lỗi khi tải danh sách email');
        this.loading = false;
      }
    });
  }

  onView(email: EmailHistory): void {
    // Hiển thị chi tiết email
    const details = `
      Email: ${email.email}
      ${email.subject ? `Chủ đề: ${email.subject}` : ''}
      ${email.otp ? `OTP: ${email.otp}` : ''}
      Ngày gửi: ${new Date(email.date).toLocaleString('vi-VN')}
      ${email.status ? `Trạng thái: ${email.status}` : ''}
    `;
    this.message.info(details);
  }

  refresh(): void {
    this.loadEmailList();
  }
}
