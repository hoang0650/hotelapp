import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { StaffService } from '../../services/staff.service';
import { Staff } from '../../interfaces/staff';
interface ItemData {
  id: string;
  name: string;
  age: string;
  address: string;
}
@Component({
  selector: 'app-staff-management',
  templateUrl: './staff-management.component.html',
  styleUrls: ['./staff-management.component.css']
})
export class StaffManagementComponent implements OnInit {
  staffForm: FormGroup;
  staff: Staff[] = []; // Example data, replace with real data

  constructor(private fb: FormBuilder,private staffService: StaffService) {
    this.staffForm = this.fb.group({
      name: ['', Validators.required],
      position: ['', Validators.required],
      contact: this.fb.group({
        phone: ['', Validators.required],
        email: ['', [Validators.required, Validators.email]]
      }),
      schedule: this.fb.group({
        day: ['', Validators.required],
        shift: ['', Validators.required],
      }),
      hotelId:[[]]

    });
  }

  i = 0;
  editId: string | null = null;
  listOfData: ItemData[] = [];

  startEdit(id: string): void {
    this.editId = id;
  }

  stopEdit(): void {
    this.editId = null;
  }

  addRow(): void {
    this.listOfData = [
      ...this.listOfData,
      {
        id: `${this.i}`,
        name: `Edward King ${this.i}`,
        age: '32',
        address: `London, Park Lane no. ${this.i}`
      }
    ];
    this.i++;
  }

  deleteRow(id: string): void {
    this.listOfData = this.listOfData.filter(d => d.id !== id);
  }

  ngOnInit(): void {
    this.addRow();
    this.addRow();
  }

  onSubmitStaff(): void {
    if (this.staffForm.valid) {
      // Handle form submission
      console.log(this.staffForm.value);
    }
  }

  getStaff() {
    this.staffService.getStaff().subscribe((data) => {
      this.staff = data;
    });
  }

  createStaff() {
    this.staffService.createStaff(this.staffForm.value).subscribe(() => {
      this.getStaff();
    });
  }

  deleteStaff(id: string) {
    this.staffService.deleteStaff(id).subscribe(() => {
      this.getStaff();
    });
  }
}
