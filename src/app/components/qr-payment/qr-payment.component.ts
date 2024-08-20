import { Component } from '@angular/core';
// @ts-ignore
import QRious from 'qrious';


@Component({
  selector: 'app-qr-payment',
  templateUrl: './qr-payment.component.html',
})
export class QrPaymentComponent {
  qrCodeDataUrl: string;

  constructor() {
    const qr = new QRious({
      value: 'https://yourpaymentlink.com',
      size: 256,
    });

    this.qrCodeDataUrl = qr.toDataURL();
  }
}
