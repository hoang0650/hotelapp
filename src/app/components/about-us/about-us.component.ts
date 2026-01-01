import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-about-us',
  templateUrl: './about-us.component.html',
  styleUrls: ['./about-us.component.css']
})
export class AboutUsComponent implements OnInit {
  coreValues: { title: string; description: string; icon: string }[] = [];

  constructor(private translate: TranslateService) {}

  ngOnInit(): void {
    this.initCoreValues();
    this.translate.onLangChange.subscribe(() => {
      this.initCoreValues();
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