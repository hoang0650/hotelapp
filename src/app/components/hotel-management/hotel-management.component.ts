import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Hotel } from '../../interfaces/hotel';
interface ItemData {
  id: string;
  name: string;
  age: string;
  address: string;
}
@Component({
  selector: 'app-hotel-management',
  templateUrl: './hotel-management.component.html',
  styleUrls: ['./hotel-management.component.css']
})
export class HotelManagementComponent implements OnInit {
  hotelForm: FormGroup;
  hotels: Hotel[] = []; 

  constructor(private fb: FormBuilder) {
    this.hotelForm = this.fb.group({
      name: ['', Validators.required],
      tax_code: [0, Validators.required],
      address: ['', Validators.required],
      phone: ['', Validators.required],
      email: ['', Validators.required],
      contact: this.fb.group({
        phone: ['', Validators.required],
        email: ['', [Validators.required, Validators.email]]
      }),
      businessId: {},
      rooms : [[]],
      staff:[[]],
      services: this.fb.group({
        name: ['', Validators.required],
        description: ['', [Validators.required]],
        quantity: [0, Validators.required],
        price: [0, [Validators.required]]
      })

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

  onSubmitHotel(): void {
    if (this.hotelForm.valid) {
      // Handle form submission
      console.log(this.hotelForm.value);
    }
  }
}
