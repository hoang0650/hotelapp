import { Component, OnInit } from '@angular/core';
import { UserService } from '../../services/user.service';
import { Router } from '@angular/router';
@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  email!: string;
  password!: string;
  constructor(private userService:UserService, private router:Router) { }

  ngOnInit(): void {
  }
  login(){
    const user = {email: this.email,password: this.password}
    this.userService.login(user).subscribe(response=>{
      localStorage.setItem('access_token',response.token);
      this.userService.loggedIn.next(true)
      this.router.navigate(['home'])

    },error=>{
      console.error('Đăng nhập thất bại',error)
      
    })
  }

}
