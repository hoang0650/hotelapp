import { Component } from '@angular/core';

@Component({
  selector: 'app-email-admin',
  templateUrl: './email-admin.component.html',
  styleUrl: './email-admin.component.css'
})
export class EmailAdminComponent {
  tabs = [
    {
      name: '<app-email-compose></app-email-compose>',
      icon: 'apple'
    },
    {
      name: '</app-email-list>',
      icon: 'android'
    }
  ];
}
