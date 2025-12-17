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
      quote: 'Phần mềm rất dễ sử dụng và hiệu quả trong quản lý khách sạn! Giao diện thân thiện, tính năng đầy đủ giúp tôi quản lý khách sạn một cách chuyên nghiệp.',
      image: 'https://randomuser.me/api/portraits/women/3.jpg',
      role: 'Chủ khách sạn'
    },
    {
      name: 'Trần Thị B',
      quote: 'Giải pháp quản lý toàn diện, giúp tiết kiệm thời gian và công sức. Báo cáo tự động và chính xác, hỗ trợ tôi đưa ra quyết định kinh doanh hiệu quả.',
      image: 'https://randomuser.me/api/portraits/men/3.jpg',
      role: 'Quản lý khách sạn'
    },
    {
      name: 'Lê Văn C',
      quote: 'Báo cáo chi tiết và chính xác, rất hữu ích cho việc quản lý. Đội ngũ hỗ trợ nhiệt tình, luôn sẵn sàng giải đáp mọi thắc mắc.',
      image: 'https://randomuser.me/api/portraits/women/4.jpg',
      role: 'Giám đốc điều hành'
    }
  ];

  constructor(private sanitizer: DomSanitizer) {}

  ngOnInit(): void {
    // Tạo URL an toàn cho iframe YouTube
    const url = `https://www.youtube.com/embed/${this.youtubeVideoId}?rel=0&modestbranding=1`;
    this.safeVideoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }
}