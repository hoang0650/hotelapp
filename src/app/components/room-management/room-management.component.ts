import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
interface ItemData {
  id: string;
  name: string;
  age: string;
  address: string;
}
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

  onSubmitRoom(): void {
    if (this.roomForm.valid) {
      // Handle form submission
      console.log(this.roomForm.value);
    }
  }

}
