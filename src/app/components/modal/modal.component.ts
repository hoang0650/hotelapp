import { Component, Input } from '@angular/core';

declare var $: any;
@Component({
  selector: 'app-modal',
  templateUrl: './modal.component.html',
  styleUrls: ['./modal.component.css']
})
export class ModalComponent {
  @Input() isVisible: boolean = false;

  constructor() {}

  open(){
    $('#exampleModal').modal('show')
  }

  close(){
    $('#exampleModal').modal('hide')
  }

  handleOk(): void {
    console.log('Button ok clicked!');
    this.isVisible = false;
  }

  handleCancel(): void {
    console.log('Button cancel clicked!');
    this.isVisible = false;
  }

  
  


}
