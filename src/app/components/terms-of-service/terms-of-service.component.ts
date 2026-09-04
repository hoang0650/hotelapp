import { Component, OnDestroy, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { LegalDoc, TERMS_DOCS } from './terms-of-service.content';

@Component({
  selector: 'app-terms-of-service',
  templateUrl: './terms-of-service.component.html',
  styleUrls: ['./terms-of-service.component.css']
})
export class TermsOfServiceComponent implements OnInit, OnDestroy {
  lastUpdated = new Date('2026-09-04');
  doc: LegalDoc = TERMS_DOCS.vi;
  private sub?: Subscription;

  constructor(private translate: TranslateService) {}

  ngOnInit(): void {
    this.applyLang(this.translate.currentLang || this.translate.defaultLang || 'vi');
    this.sub = this.translate.onLangChange.subscribe((e) => this.applyLang(e.lang));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private applyLang(lang: string): void {
    const key = String(lang || 'vi').toLowerCase().startsWith('en') ? 'en' : 'vi';
    this.doc = TERMS_DOCS[key];
  }
}
