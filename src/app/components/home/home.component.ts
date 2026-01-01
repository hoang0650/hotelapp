import { Component, OnInit, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

interface Testimonial {
  name: string;
  quote: string;
  image: string;
  role: string;
  roleKey: string;
  quoteKey: string;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, OnDestroy {
  // URL video YouTube (có thể thay đổi)
  youtubeVideoId = 'dQw4w9WgXcQ'; // Thay bằng ID video YouTube thực tế
  safeVideoUrl!: SafeResourceUrl;

  testimonials: Testimonial[] = [
    {
      name: 'Nguyễn Văn A',
      quote: '',
      image: 'https://randomuser.me/api/portraits/women/3.jpg',
      role: '',
      roleKey: 'ROLE_HOTEL_OWNER',
      quoteKey: 'QUOTE_1'
    },
    {
      name: 'Trần Thị B',
      quote: '',
      image: 'https://randomuser.me/api/portraits/men/3.jpg',
      role: '',
      roleKey: 'ROLE_HOTEL_MANAGER',
      quoteKey: 'QUOTE_2'
    },
    {
      name: 'Lê Văn C',
      quote: '',
      image: 'https://randomuser.me/api/portraits/women/4.jpg',
      role: '',
      roleKey: 'ROLE_CEO',
      quoteKey: 'QUOTE_3'
    }
  ];

  private langChangeSubscription?: Subscription;

  constructor(
    private sanitizer: DomSanitizer,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    // Tạo URL an toàn cho iframe YouTube
    const url = `https://www.youtube.com/embed/${this.youtubeVideoId}?rel=0&modestbranding=1`;
    this.safeVideoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    
    // Load translations cho testimonials
    this.updateTestimonials();
    
    // Subscribe to language changes
    this.langChangeSubscription = this.translate.onLangChange.subscribe(() => {
      this.updateTestimonials();
    });
  }

  ngOnDestroy(): void {
    if (this.langChangeSubscription) {
      this.langChangeSubscription.unsubscribe();
    }
  }

  private updateTestimonials(): void {
    this.testimonials.forEach(testimonial => {
      testimonial.quote = this.translate.instant(`HOME.TESTIMONIALS.${testimonial.quoteKey}`);
      testimonial.role = this.translate.instant(`HOME.TESTIMONIALS.${testimonial.roleKey}`);
    });
  }
}