import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-about-us',
  templateUrl: './about-us.component.html',
  styleUrls: ['./about-us.component.css']
})
export class AboutUsComponent implements OnInit {
  teamMembers = [
    {
      name: 'Jane Doe',
      position: 'CEO',
      avatarUrl: 'https://randomuser.me/api/portraits/women/1.jpg',
      bio: 'Jane is the visionary behind our company, leading with passion and innovation.'
    },
    {
      name: 'John Smith',
      position: 'CTO',
      avatarUrl: 'https://randomuser.me/api/portraits/men/1.jpg',
      bio: 'John drives our technology strategy and ensures our solutions are cutting-edge.'
    },
    {
      name: 'Emily Johnson',
      position: 'COO',
      avatarUrl: 'https://randomuser.me/api/portraits/women/2.jpg',
      bio: 'Emily manages operations and ensures our day-to-day activities align with our strategic goals.'
    }
  ];

  services = [
    {
      title: 'Luxury Rooms',
      description: 'Experience the best in comfort and style with our luxury rooms.',
      icon: 'anticon anticon-star',
      link: '/rooms'
    },
    {
      title: 'Gourmet Dining',
      description: 'Indulge in gourmet dining with our world-class chefs.',
      icon: 'anticon anticon-heart',
      link: '/dining'
    },
    {
      title: 'Spa Services',
      description: 'Relax and rejuvenate with our exclusive spa services.',
      icon: 'anticon anticon-skin',
      link: '/spa'
    }
  ];

  ngOnInit(): void {
    // Initialization logic if needed
  }
}