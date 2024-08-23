import { Component,OnInit } from '@angular/core';
import { ProductService } from '../../services/product.service';
import { ActivatedRoute } from '@angular/router';
@Component({
  selector: 'app-product-detail',
  templateUrl: './product-detail.component.html',
  styleUrls: ['./product-detail.component.css']
})
export class ProductDetailComponent implements OnInit {
  product: any
  room: any = {};

  constructor(private route: ActivatedRoute, private productService: ProductService) { }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const productId = +params['id'];
      this.product = this.productService.getProductById(productId);
    });
    this.route.data.subscribe(data => {
      // Assuming data.room contains room details
      // this.room = data.room;
    });
  }

  getRoomStatusColor(status: string): string {
    switch (status) {
      case 'available':
        return 'green';
      case 'dirty':
        return 'red';
      case 'active':
        return 'blue';
      default:
        return 'gray';
    }
  }

  capitalize(value: string): string {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }

  bookRoom(): void {
    // Implement booking logic
    alert('Room booked successfully!');
  }

}
