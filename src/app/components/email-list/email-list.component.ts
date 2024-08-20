import { Component, OnInit } from '@angular/core';
import { EmailService } from '../../services/email.service';

@Component({
  selector: 'app-email-list',
  templateUrl: './email-list.component.html',
  styleUrls: ['./email-list.component.css']
})
export class EmailListComponent implements OnInit {
  emailList: any[] = [];

  constructor(private emailService: EmailService) {}

  ngOnInit(): void {
    this.loadEmailList();
  }

  loadEmailList(): void {
    this.emailService.loadOtp().subscribe(
      data => {
        this.emailList = data;
      },
      error => {
        console.error('Error loading email list', error);
      }
    );
  }

  onView(email: any): void {
    // Handle viewing the email details
    console.log('Viewing email:', email);
  }
}
