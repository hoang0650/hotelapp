import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-unauthorized',
  templateUrl: './unauthorized.component.html',
  styleUrls: ['./unauthorized.component.css']
})
export class UnauthorizedComponent implements OnInit {
  primaryLink = '/admin/room';
  primaryLabel = 'Vào quản lý phòng';
  showPricingLink = false;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    if (this.authService.isGuest()) {
      this.primaryLink = '/admin/pricing-management';
      this.primaryLabel = 'Đăng ký gói dịch vụ';
      this.showPricingLink = true;
    } else {
      this.primaryLink = this.authService.getAdminHomePath();
      this.primaryLabel = 'Vào quản lý phòng';
    }
  }
}
