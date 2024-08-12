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
      roomName: ['', Validators.required],
      roomType: ['', Validators.required],
      roomPrice: [0, Validators.required],
      roomStatus: ['']
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
