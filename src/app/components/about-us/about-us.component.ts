import { Component } from '@angular/core';

@Component({
  selector: 'app-about-us',
  templateUrl: './about-us.component.html',
  styleUrls: ['./about-us.component.css']
})
export class AboutUsComponent {
  teamMembers = [
    {
      name: 'John Doe',
      position: 'CEO & Founder',
      avatarUrl: 'https://example.com/avatar1.jpg'
    },
    {
      name: 'Jane Smith',
      position: 'CTO',
      avatarUrl: 'https://example.com/avatar2.jpg'
    },
    {
      name: 'Mike Johnson',
      position: 'COO',
      avatarUrl: 'https://example.com/avatar3.jpg'
    }
  ];
}