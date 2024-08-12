import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-staff-management',
  templateUrl: './staff-management.component.html',
  styleUrls: ['./staff-management.component.css']
})
export class StaffManagementComponent implements OnInit {
  staffForm: FormGroup;
  staff = []; // Example data, replace with real data

  constructor(private fb: FormBuilder) {
    this.staffForm = this.fb.group({
      name: ['', Validators.required],
      position: ['', Validators.required],
      phone: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      day: ['', Validators.required],
      shift: ['', Validators.required],
    });
  }

  ngOnInit(): void {}

  onSubmitStaff(): void {
    if (this.staffForm.valid) {
      // Handle form submission
      console.log(this.staffForm.value);
    }
  }
}
