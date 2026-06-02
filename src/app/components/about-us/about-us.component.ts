import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-about-us',
  templateUrl: './about-us.component.html',
  styleUrls: ['./about-us.component.css']
})
export class AboutUsComponent implements OnInit {
  coreValues: { title: string; description: string; icon: string }[] = [];

  constructor(
    private translate: TranslateService,
    private seoService: SeoService
  ) {}

  ngOnInit(): void {
    this.initCoreValues();
    this.translate.onLangChange.subscribe(() => {
      this.initCoreValues();
      this.updateSeoTitle();
    });
    
    this.updateSeoTitle();
  }

  private updateSeoTitle(): void {
    // Thiết lập title cho trang About Us
    // Sử dụng translate.instant để lấy giá trị dịch
    const title = this.translate.instant('SEO.ABOUT_US.TITLE');
    const description = this.translate.instant('SEO.ABOUT_US.DESCRIPTION');
    
    // Cập nhật title trực tiếp nếu cần
    if (title && title !== 'SEO.ABOUT_US.TITLE') {
      document.title = `PHHotel | ${title}`;
    }
    
    // Cập nhật SEO metadata thông qua service
    this.seoService.updateSeoData({
      titleKey: 'SEO.ABOUT_US.TITLE',
      descriptionKey: 'SEO.ABOUT_US.DESCRIPTION'
    });
  }

  private initCoreValues(): void {
    this.coreValues = [
      {
        title: this.translate.instant('ABOUT_US.CORE_VALUES_ITEMS.CREATIVITY.TITLE'),
        description: this.translate.instant('ABOUT_US.CORE_VALUES_ITEMS.CREATIVITY.DESCRIPTION'),
        icon: 'bulb'
      },
      {
        title: this.translate.instant('ABOUT_US.CORE_VALUES_ITEMS.QUALITY.TITLE'),
        description: this.translate.instant('ABOUT_US.CORE_VALUES_ITEMS.QUALITY.DESCRIPTION'),
        icon: 'star'
      },
      {
        title: this.translate.instant('ABOUT_US.CORE_VALUES_ITEMS.TRUST.TITLE'),
        description: this.translate.instant('ABOUT_US.CORE_VALUES_ITEMS.TRUST.DESCRIPTION'),
        icon: 'safety-certificate'
      },
      {
        title: this.translate.instant('ABOUT_US.CORE_VALUES_ITEMS.INNOVATION.TITLE'),
        description: this.translate.instant('ABOUT_US.CORE_VALUES_ITEMS.INNOVATION.DESCRIPTION'),
        icon: 'thunderbolt'
      },
      {
        title: this.translate.instant('ABOUT_US.CORE_VALUES_ITEMS.COOPERATION.TITLE'),
        description: this.translate.instant('ABOUT_US.CORE_VALUES_ITEMS.COOPERATION.DESCRIPTION'),
        icon: 'team'
      },
      {
        title: this.translate.instant('ABOUT_US.CORE_VALUES_ITEMS.SERVICE.TITLE'),
        description: this.translate.instant('ABOUT_US.CORE_VALUES_ITEMS.SERVICE.DESCRIPTION'),
        icon: 'customer-service'
      }
    ];
  }
}