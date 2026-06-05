import { Component, OnInit, OnDestroy, TemplateRef, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { NzModalRef, NzModalService } from 'ng-zorro-antd/modal';

interface Testimonial {
  name: string;
  quote: string;
  image: string;
  role: string;
  roleKey: string;
  quoteKey: string;
}

interface IntroduceImage {
  src: string;
  altKey: string;
  captionKey: string;
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
  previewImage: IntroduceImage | null = null;
  private previewModal?: NzModalRef;

  @ViewChild('screenshotPreviewTpl', { static: true }) screenshotPreviewTpl!: TemplateRef<unknown>;

  introduceImages: IntroduceImage[] = [
    {
      src: 'assets/images/introduce/30289503-9d0b-4c4b-a4ed-be2f3c3b940f.jfif',
      altKey: 'HOME.SCREENSHOTS.ITEM_1_ALT',
      captionKey: 'HOME.SCREENSHOTS.ITEM_1_CAPTION'
    },
    {
      src: 'assets/images/introduce/0d217b48-5d75-470f-898e-ccf223cb2efa.jfif',
      altKey: 'HOME.SCREENSHOTS.ITEM_2_ALT',
      captionKey: 'HOME.SCREENSHOTS.ITEM_2_CAPTION'
    },
    {
      src: 'assets/images/introduce/56aceaca-e346-4877-a9d5-a9385b2c101e.jfif',
      altKey: 'HOME.SCREENSHOTS.ITEM_3_ALT',
      captionKey: 'HOME.SCREENSHOTS.ITEM_3_CAPTION'
    },
    {
      src: 'assets/images/introduce/4756dccb-ff40-48aa-b958-3bd7c1e36384.jfif',
      altKey: 'HOME.SCREENSHOTS.ITEM_4_ALT',
      captionKey: 'HOME.SCREENSHOTS.ITEM_4_CAPTION'
    },
    {
      src: 'assets/images/introduce/91ca438c-3087-4544-bf35-b166fbd12daa.jfif',
      altKey: 'HOME.SCREENSHOTS.ITEM_5_ALT',
      captionKey: 'HOME.SCREENSHOTS.ITEM_5_CAPTION'
    },
    {
      src: 'assets/images/introduce/0a687707-3ebb-437b-a116-aa4188020c47.jfif',
      altKey: 'HOME.SCREENSHOTS.ITEM_6_ALT',
      captionKey: 'HOME.SCREENSHOTS.ITEM_6_CAPTION'
    },
    {
      src: 'assets/images/introduce/2643c5bf-9fa9-4a05-8935-4e83e0e95589.jfif',
      altKey: 'HOME.SCREENSHOTS.ITEM_7_ALT',
      captionKey: 'HOME.SCREENSHOTS.ITEM_7_CAPTION'
    }
  ];

  testimonials: Testimonial[] = [
    {
      name: 'Phan Huy Hoàng',
      quote: '',
      image: 'assets/images/guest1.jpg',
      role: '',
      roleKey: 'ROLE_HOTEL_OWNER',
      quoteKey: 'QUOTE_1'
    },
    {
      name: 'Hà Thị Yến',
      quote: '',
      image: 'assets/images/guest3.jpg',
      role: '',
      roleKey: 'ROLE_HOTEL_MANAGER',
      quoteKey: 'QUOTE_2'
    },
    {
      name: 'Phạm Minh Trưởng',
      quote: '',
      image: 'assets/images/guest2.jpg',
      role: '',
      roleKey: 'ROLE_CEO',
      quoteKey: 'QUOTE_3'
    }
  ];

  private langChangeSubscription?: Subscription;

  constructor(
    private sanitizer: DomSanitizer,
    private translate: TranslateService,
    private modal: NzModalService
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
    if (this.previewModal) {
      this.previewModal.destroy();
    }
  }

  private updateTestimonials(): void {
    this.testimonials.forEach(testimonial => {
      testimonial.quote = this.translate.instant(`HOME.TESTIMONIALS.${testimonial.quoteKey}`);
      testimonial.role = this.translate.instant(`HOME.TESTIMONIALS.${testimonial.roleKey}`);
    });
  }

  openScreenshotPreview(img: IntroduceImage): void {
    this.previewImage = img;
    if (this.previewModal) {
      this.previewModal.destroy();
    }
    this.previewModal = this.modal.create({
      nzContent: this.screenshotPreviewTpl,
      nzFooter: null,
      nzClosable: true,
      nzMaskClosable: true,
      nzCentered: true,
      nzWidth: '92vw',
      nzBodyStyle: { padding: '12px' }
    });
  }
}
