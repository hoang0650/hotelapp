import { Component } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.css'
})
export class CalendarComponent {
  form: FormGroup;
  events: { date: string, customerName: string, status: string, amount: number, note: string }[] = [];
  currentDate: Date = new Date(); // Default to the current date
  showCalendar = true; // Show or hide calendar as needed

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      date: [null],
      customerName: [''],
      status: ['Booked'], // Default status
      amount: [null],
      note: ['']
    });
  }

  onSubmit(): void {
    if (this.form.valid) {
      const formValue = this.form.value;
      this.events.push({
        date: formValue.date ? formValue.date.toISOString() : 'Không xác định',
        customerName: formValue.customerName,
        status: formValue.status,
        amount: formValue.amount,
        note: formValue.note
      });
      this.form.reset();
      this.showCalendar = false; // Hide calendar after submission if needed
    }
  }

  onDateChange(date: Date): void {
    this.currentDate = date;
    // Handle additional logic if needed when the date changes
    console.log('Selected Date:', date);
  }

}
