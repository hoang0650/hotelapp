import { Component, Input} from '@angular/core';
@Component({
  selector: 'app-invoice',
  templateUrl: './invoice.component.html',
  styleUrls: ['./invoice.component.css']
})
export class InvoiceComponent {
  @Input() invoiceData: any;

  // invoiceData = {
  //   invoiceNumber: 'INV-001',
  //   date: '2024-02-01',
  //   products: [
  //     { name: 'Tiền phòng tháng 1', price: 70000 },
  //     { name: 'Tiền phòng tháng 2', price: 70000 }
  //   ],
  //   totalAmount: 140000,
  // };

  exportInvoice(): void {
    // Triển khai logic xuất hóa đơn ở đây
    console.log('Exporting invoice:', this.invoiceData);
  }

}
