import { Component, OnDestroy, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Subscription } from 'rxjs';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-duns',
  templateUrl: './duns.component.html',
  styleUrls: ['./duns.component.css']
})
export class DunsComponent implements OnInit, OnDestroy {
  readonly dunsFormatted = '66-547-1898';
  readonly dunsNumeric = '665471898';
  readonly legalNameEn = 'PHGROUP TECHNOLOGY SOLUTIONS COMPANY LIMITED';
  readonly legalNameVi = 'CÔNG TY TNHH GIẢI PHÁP CÔNG NGHỆ PHGROUP';
  readonly addressEn = 'Lot A1-15 Binh Hoa 24 Street, Dong An 4 Residential Area, Binh Hoa Ward, Ho Chi Minh, Vietnam';
  readonly phone = '(84) (93) (1881584)';
  readonly website = 'https://phgrouptechs.com';
  readonly websiteLabel = 'phgrouptechs.com';
  readonly email = 'phanhuyhoang@phgrouptechs.com';
  readonly taxId = '3703279135';

  private langSub?: Subscription;

  constructor(
    private translate: TranslateService,
    private seoService: SeoService,
    private message: NzMessageService
  ) {}

  ngOnInit(): void {
    this.updateSeoTitle();
    this.langSub = this.translate.onLangChange.subscribe(() => this.updateSeoTitle());
  }

  ngOnDestroy(): void {
    this.langSub?.unsubscribe();
  }

  copyDuns(value: string): void {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(value).then(() => {
      this.message.success(this.translate.instant('DUNS.COPIED'));
    });
  }

  private updateSeoTitle(): void {
    const title = this.translate.instant('SEO.DUNS.TITLE');
    if (title && title !== 'SEO.DUNS.TITLE') {
      document.title = `PHHotel | ${title}`;
    }
    this.seoService.updateSeoData({
      titleKey: 'SEO.DUNS.TITLE',
      descriptionKey: 'SEO.DUNS.DESCRIPTION'
    });
  }
}
