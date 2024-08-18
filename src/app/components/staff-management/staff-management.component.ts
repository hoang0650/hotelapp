import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { StaffService } from '../../services/staff.service';
import { Staff } from '../../interfaces/staff';
import { error } from 'console';

@Component({
  selector: 'app-staff-management',
  templateUrl: './staff-management.component.html',
  styleUrls: ['./staff-management.component.css']
})
export class StaffManagementComponent implements OnInit {
  staffForm: FormGroup;
  staffs: Staff[] = [];
  selectedStaff: Staff | null = null;
  // availableHotels: Hotel[] = [];

  constructor(private fb: FormBuilder, private staffService: StaffService) {
    this.staffForm = this.fb.group({
      name: ['', Validators.required],
      position: ['', Validators.required],
      contact: this.fb.group({
        phone: ['', Validators.required],
        email: ['', [Validators.required, Validators.email]]
      }),
      schedule: this.fb.group({
        day: ['', Validators.required],
        shift: ['', Validators.required]
      })
    });
  }

  ngOnInit(): void {
    this.loadStaff();
  }

  i = 0;
  editId: string | null = null;
  listOfData: Staff[] = [];

  startEdit(id: string): void {
    this.editId = id;
    const staffToEdit = this.staffs.find(b => b._id === id);
    if (staffToEdit) {
      this.selectedStaff = { ...staffToEdit };
      this.staffForm.patchValue({
        hotelId: this.selectedStaff.hotelId,
        name: this.selectedStaff.name,
        position: this.selectedStaff.position,
        contact:{
          phone: this.selectedStaff.contact.phone,
          email: this.selectedStaff.contact.email
        },
        schedule: {
          day: this.selectedStaff.schedule.day,
          shift: this.selectedStaff.schedule.shift
        }
      });
    }
  }

  stopEdit(): void {
    this.editId = null;
    this.selectedStaff = null;
    this.staffForm.reset();
  }
  

  deleteRow(_id: string): void {
    this.listOfData = this.listOfData.filter(d => d._id !== _id);
  }


  loadStaff(): void {
    this.staffService.getStaff().subscribe((data) => {
      this.staffs = data;
    });
  }

  createStaff(): void {
    if (this.staffForm.valid) {
      const newStaff: Staff = this.staffForm.value;
      this.staffService.createStaff(newStaff).subscribe((data: Staff) => {
        console.log('Business created successfully:', data);
        this.staffs.push(data); // Add the new business to the local list
        this.staffForm.reset(); // Reset the form after successful creation
      },
      error =>{
        console.error('Error creating staff:', error);
      }
    );
    }
  }

  updateStaff(): void {
    if (this.selectedStaff && this.staffForm.valid) {
      this.staffService.updateStaff(this.selectedStaff._id, this.staffForm.value).subscribe(() => {
        this.loadStaff();
        this.staffForm.reset();
        this.selectedStaff = null;
      });
    }
  }

  deleteStaff(staffId: string): void {
    this.listOfData = this.listOfData.filter(d => d._id !== staffId);
    this.staffService.deleteStaff(staffId).subscribe(() => {
      this.loadStaff();
    });
  }
}
