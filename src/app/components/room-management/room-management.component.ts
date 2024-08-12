import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-room-management',
  templateUrl: './room-management.component.html',
  styleUrls: ['./room-management.component.css']
})
export class RoomManagementComponent implements OnInit {
  roomForm: FormGroup;
  rooms = []; // Example data, replace with real data

  constructor(private fb: FormBuilder) {
    this.roomForm = this.fb.group({
      roomNumber: [0, Validators.required],
      roomType: ['', Validators.required],
      hourlyRate: [0, Validators.required],
      nightlyRate: [0, Validators.required],
      dailyRate: [0, Validators.required],
      maxcount: [0, Validators.required],
    });
  }

  ngOnInit(): void {}

  onSubmitRoom(): void {
    if (this.roomForm.valid) {
      // Handle form submission
      console.log(this.roomForm.value);
    }
  }

}
