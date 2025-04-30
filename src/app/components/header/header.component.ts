import { Component, OnInit } from '@angular/core';
import { UserService, UserResponse } from '../../services/user.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit {
  isLoggedIn: boolean = false;
  infor: UserResponse | null = null;

  constructor(private userService: UserService) {
    this.userInfo();
  }

  ngOnInit(): void {
    this.userService.isLoggedIn.subscribe((status: boolean) => {
      console.log('status', status);
      this.isLoggedIn = status;
      this.userInfo();
    });
  }

  logOut(): void {
    localStorage.removeItem('access_token');
    this.userService.logout();
    this.isLoggedIn = false;
  }

  userInfo(): void {
    this.userService.getUserInfo().subscribe((data: UserResponse) => {
      this.infor = data;
      console.log('data', data);
    });
  }
}
