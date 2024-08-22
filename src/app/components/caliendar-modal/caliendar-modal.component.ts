import { Component } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
@Component({
  selector: 'app-caliendar-modal',
  templateUrl: './caliendar-modal.component.html',
  styleUrl: './caliendar-modal.component.css'
})
export class CaliendarModalComponent {
  form: FormGroup;
  events: { date: string, customerName: string, status: string, amount: number, note: string }[] = [];
  currentDate: Date = new Date(); // Default to the current date
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
    }
  }

}
