import { Component, OnInit } from '@angular/core';
import { UserService } from '../../services/user.service';
@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit {
  isLoggedIn: boolean = false
  infor: any;

  constructor(private userService: UserService) {
    // this.userInfor()
  }

  ngOnInit(): void {
    this.userService.isLoggedIn.subscribe((status)=>{
      console.log('status',status);
      this.isLoggedIn = status
      // this.userInfor()
    })
  }

  logOut(){
    localStorage.removeItem('access_token')
    this.userService.logout()
    this.isLoggedIn = false

  }

  // userInfor(){
  //   return this.userService.getUserInfor().subscribe(data=>{
  //     this.infor=data
  //     console.log('data',data);
      
  //   });
  // }

}
