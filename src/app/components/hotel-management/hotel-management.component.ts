import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HotelService } from '../../services/hotel.service';
import { BusinessService } from '../../services/business.service';
import { RoomsService } from '../../services/rooms.service';
import { StaffService } from '../../services/staff.service';
import { Hotel } from '../../interfaces/hotel';
import { Business } from '../../interfaces/business';
import { Room } from '../../interfaces/rooms';
import { Staff } from '../../interfaces/staff';

@Component({
  selector: 'app-hotel-management',
  templateUrl: './hotel-management.component.html',
  styleUrls: ['./hotel-management.component.css']
})
export class HotelManagementComponent implements OnInit {
  hotelForm: FormGroup;
  hotels: Hotel[] = [];
  businesses: Business[] = [];
  rooms: Room[] = [];
  staffs: Staff[] = [];
  selectedHotel: Hotel | null = null;
  editId: string | null = null;
  listOfData: Hotel[] = [];
  availableStaffs: Staff[] =[]
  availableRooms: Room[]=[]

  constructor(
    private hotelService: HotelService,
    private businessService: BusinessService,
    private roomService: RoomsService,
    private staffService: StaffService,
    private fb: FormBuilder
  ) {
    this.hotelForm = this.fb.group({
      name: ['', Validators.required],
      address: ['', Validators.required],
      tax_code: [0, [Validators.required, Validators.min(1)]],
      contact: this.fb.group({
        phone: ['', Validators.required],
        email: ['', [Validators.required, Validators.email]]
      }),
      businessId: ['', Validators.required],
      rooms: [[]],
      staff: [[]],
      service: this.fb.group({
        name: ['', Validators.required],
        description: ['', Validators.required],
        quantity: [0, [Validators.required, Validators.min(1)]],
        price: [0, [Validators.required, Validators.min(0)]]
      })
    });
  }

  ngOnInit(): void {
    this.loadHotels();
    this.loadBusinesses();
    this.loadRooms();
    this.loadStaffs();
  }

  startEdit(id: string): void {
    this.editId = id;
    const hotelToEdit = this.hotels.find(h => h._id === id);
    if (hotelToEdit) {
      this.selectedHotel = { ...hotelToEdit };
      this.hotelForm.patchValue(hotelToEdit);
    }
  }

  updateHotel(id: string): void {
    if (this.hotelForm.valid) {
      const updatedHotel: Hotel = {
        ...this.selectedHotel!,
        ...this.hotelForm.value
      };

      this.hotelService.updateHotel(id, updatedHotel).subscribe(
        (data: Hotel) => {
          const index = this.hotels.findIndex(h => h._id === id);
          if (index !== -1) {
            this.hotels[index] = data;
            this.listOfData = this.listOfData.map(item =>
              item._id === id ? data : item
            );
          }
          this.selectedHotel = null;
          this.editId = null;
          this.hotelForm.reset();
        },
        error => console.error('Error updating hotel:', error)
      );
    } else {
      console.error('Form is invalid');
    }
  }

  stopEdit(): void {
    this.editId = null;
    this.selectedHotel = null;
    this.hotelForm.reset();
  }

  loadHotels(): void {
    this.hotelService.getHotels().subscribe(
      data => {
        this.hotels = data;
        this.listOfData = data.map(hotel => ({
          ...hotel
        }));
      },
      error => console.error('Error fetching hotels:', error)
    );
  }

  loadBusinesses(): void {
    this.businessService.getBusinesses().subscribe(
      data => {
        this.businesses = data;
      },
      error => console.error('Error fetching businesses:', error)
    );
  }

  loadRooms(): void {
    this.roomService.getRooms().subscribe(
      data => {
        this.rooms = data;
      },
      error => console.error('Error fetching rooms:', error)
    );
  }

  loadStaffs(): void {
    this.staffService.getStaff().subscribe(
      data => {
        this.staffs = data;
      },
      error => console.error('Error fetching staffs:', error)
    );
  }

  createHotel(): void {
    if (this.hotelForm.valid) {
      const newHotel: Hotel = this.hotelForm.value;
      this.hotelService.createHotel(newHotel).subscribe(
        (data: Hotel) => {
          this.hotels.push(data);
          this.hotelForm.reset();
        },
        error => console.error('Error creating hotel:', error)
      );
    } else {
      console.error('Form is invalid');
    }
  }

  deleteHotel(id: string): void {
    this.hotelService.deleteHotel(id).subscribe(
      () => {
        this.hotels = this.hotels.filter(h => h._id !== id);
        this.selectedHotel = null;
      },
      error => console.error('Error deleting hotel:', error)
    );
  }
}
