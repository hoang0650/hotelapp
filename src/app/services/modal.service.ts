import { Injectable, Component } from '@angular/core';
// import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';

declare var $: any;
@Injectable({
  providedIn: 'root'
})

// @Component({
//   templateUrl: '../components/modal/modal.component.html',
//   styleUrls: ['../components/modal/modal.component.css']
// })
export class ModalService {

  constructor() { }


  open(){
    $('#exampleModal').modal('show')
  }

  close(){
    $('#exampleModal').modal('hide')
  }
}
