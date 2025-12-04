import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  // URL video YouTube (có thể thay đổi)
  youtubeVideoId = 'dQw4w9WgXcQ'; // Thay bằng ID video YouTube thực tế
  safeVideoUrl!: SafeResourceUrl;

  testimonials = [
    {
      name: 'Nguyễn Văn A',
      quote: 'Phần mềm rất dễ sử dụng và hiệu quả trong quản lý khách sạn!',
      image: 'https://randomuser.me/api/portraits/women/3.jpg'
    },
    {
      name: 'Trần Thị B',
      quote: 'Giải pháp quản lý toàn diện, giúp tiết kiệm thời gian và công sức.',
      image: 'https://randomuser.me/api/portraits/men/3.jpg'
    },
    {
      name: 'Lê Văn C',
      quote: 'Báo cáo chi tiết và chính xác, rất hữu ích cho việc quản lý.',
      image: 'https://randomuser.me/api/portraits/women/4.jpg'
    }
  ];

  constructor(private sanitizer: DomSanitizer) {}

  ngOnInit(): void {
    // Tạo URL an toàn cho iframe YouTube
    const url = `https://www.youtube.com/embed/${this.youtubeVideoId}?rel=0&modestbranding=1`;
    this.safeVideoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }
}