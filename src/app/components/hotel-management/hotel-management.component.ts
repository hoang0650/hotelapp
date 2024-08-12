import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-hotel-management',
  templateUrl: './hotel-management.component.html',
  styleUrls: ['./hotel-management.component.css']
})
export class HotelManagementComponent implements OnInit {
  hotelForm: FormGroup;
  hotels = []; // Example data, replace with real data

  constructor(private fb: FormBuilder) {
    this.hotelForm = this.fb.group({
      name: ['', Validators.required],
      tax_code: [0, Validators.required],
      address: ['', Validators.required],
      phone: ['', Validators.required],
      email: ['', Validators.required],
    });
  }

  ngOnInit(): void {}

  onSubmitHotel(): void {
    if (this.hotelForm.valid) {
      // Handle form submission
      console.log(this.hotelForm.value);
    }
  }
}
