import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
@Component({
  selector: 'app-visa-payment',
  templateUrl: './visa-payment.component.html',
  styleUrl: './visa-payment.component.css'
})
export class VisaPaymentComponent {
  paymentForm: FormGroup;

  constructor(private fb: FormBuilder) {
    this.paymentForm = this.fb.group({
      cardNumber: ['', [Validators.required, Validators.pattern('^[0-9]{16}$')]],
      expiryDate: ['', [Validators.required, Validators.pattern('(0[1-9]|1[0-2])/[0-9]{2}')]],
      cvv: ['', [Validators.required, Validators.pattern('^[0-9]{3,4}$')]]
    });
  }

  onSubmit(): void {
    if (this.paymentForm.valid) {
      console.log('Payment details:', this.paymentForm.value);
      // Xử lý thanh toán ở đây
    }
  }

}
