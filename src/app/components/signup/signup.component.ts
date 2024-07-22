import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { User } from '../../interfaces/users';
import { UserService } from '../../services/user.service';
import { Router } from '@angular/router';
@Component({
  selector: 'app-signup',
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.css']
})
export class SignupComponent {

  registerForm!: FormGroup
  userData: User = {
    username: '',
    email: '',
    password: '',
  };

  constructor(private fb: FormBuilder, private userService: UserService, private router:Router) {
    this.registerForm = this.fb.group({
      username: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    })
  }

  onSubmit() {
    if (this.registerForm.valid) {
      // console.log('successful', this.registerForm.value);
      this.userData = this.registerForm.value as User

      this.userService.signUp(this.userData).subscribe((response) => {
        console.log('successful!', response);
        this.router.navigate(['login'])
      }, (err) => {
        console.error('failed', err);
      })
    }

  }


}
