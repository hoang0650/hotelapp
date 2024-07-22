import { Component, OnInit } from '@angular/core';
import { ProductService } from '../../services/product.service';
// import { ModalService } from 'src/app/services/modal.service';

@Component({
  selector: 'app-room-history',
  templateUrl: './room-history.component.html',
  styleUrls: ['./room-history.component.css']
})
export class RoomHistoryComponent implements OnInit {
  

  constructor(private productService:ProductService,
    // , private modal:ModalComponent
    ) { }

  ngOnInit(): void {
  }

 

  

}
