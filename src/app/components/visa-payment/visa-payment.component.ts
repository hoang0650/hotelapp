import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
@Component({
  selector: 'app-visa-payment',
  templateUrl: './visa-payment.component.html',
  styleUrl: './visa-payment.component.css'
})
export class VisaPaymentComponent {
  paymentForm: FormGroup;   
  cardNumber = '';
  cardHolder = '';
  expiryDate = '';
  cvv = '';

  constructor(private fb: FormBuilder) {
    this.paymentForm = this.fb.group({
      cardNumber: ['', [Validators.required, Validators.pattern(/^\d{16}$/)]],
      cardHolder: ['', [Validators.required]],
      expiryDate: ['', [Validators.required, Validators.pattern(/^\d{2}\/\d{2}$/)]],
      cvv: ['', [Validators.required, Validators.pattern(/^\d{3}$/)]]
    });

    this.paymentForm.valueChanges.subscribe(value => {
      this.cardNumber = value.cardNumber;
      this.cardHolder = value.cardHolder;
      this.expiryDate = value.expiryDate;
      this.cvv = value.cvv;
    });
  }

  onSubmit(){
    
  }
}
  

