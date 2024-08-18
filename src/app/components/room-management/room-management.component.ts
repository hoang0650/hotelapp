import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Room } from '../../interfaces/rooms';
import { Hotel } from '../../interfaces/hotel';
import { RoomsService } from '../../services/rooms.service';
import { HotelService } from '../../services/hotel.service';

@Component({
  selector: 'app-room-management',
  templateUrl: './room-management.component.html',
  styleUrls: ['./room-management.component.css']
})
export class RoomManagementComponent implements OnInit {
  roomForm: FormGroup;
  rooms: Room[] = [];
  hotels: Hotel[] = []
  editId: string | null = null;
  selectedRoom: Room | null = null;

  constructor(private fb: FormBuilder, private roomService: RoomsService, private hotelService:HotelService) {
    this.roomForm = this.fb.group({
      hotelId: [],
      roomNumber: [0, Validators.required],
      roomType: ['', Validators.required],
      roomStatus: ['available', Validators.required],
      hourlyRate: [0, Validators.required],
      dailyRate: [0, Validators.required],
      nightlyRate: [0, Validators.required],
      maxcount: [0, Validators.required],
      description: ['', Validators.required],
      events: [[]],
      bookingHistory: [[]]
    });
  }

  ngOnInit(): void {
    this.loadRooms();
    this.loadHotels()
  }

  loadRooms(): void {
    this.roomService.getRooms().subscribe(
      data => {
        this.rooms = data;
      },
      error => console.error('Error fetching rooms:', error)
    );
  }

  loadHotels(): void {
    this.hotelService.getHotels().subscribe(
      data => {
        this.hotels = data;
      },
      error => console.error('Error fetching hotels:', error)
    );
  }

  startEdit(id: string): void {
    this.editId = id;
    const roomToEdit = this.rooms.find(r => r._id === id);
    if (roomToEdit) {
      this.selectedRoom = { ...roomToEdit };
      this.roomForm.patchValue(roomToEdit);
    }
  }

  stopEdit(): void {
    this.editId = null;
    this.selectedRoom = null;
    this.roomForm.reset();
  }

  createRoom(): void {
    if (this.roomForm.valid) {
      const newRoom: Room = this.roomForm.value;
      this.roomService.createRoom(newRoom).subscribe(
        (data: Room) => {
          this.rooms.push(data);
          this.roomForm.reset();
        },
        error => console.error('Error creating room:', error)
      );
    } else {
      console.error('Form is invalid');
    }
  }

  updateRoom(): void {
    if (this.selectedRoom && this.roomForm.valid) {
      this.roomService.updateRoom(this.selectedRoom._id!, this.roomForm.value).subscribe(
        () => {
          this.loadRooms(); // Reload rooms to get the updated data
          this.stopEdit();  // Stop editing and reset the form
        },
        error => console.error('Error updating room:', error)
      );
    } else {
      console.error('Form is invalid or no room selected');
    }
  }

  deleteRoom(id: string): void {
    this.roomService.deleteRoom(id).subscribe(
      () => {
        this.rooms = this.rooms.filter(r => r._id !== id); // Remove deleted room from the list
      },
      error => console.error('Error deleting room:', error)
    );
  }
}
