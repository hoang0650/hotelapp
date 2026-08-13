import { Component, OnDestroy, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { LegalDoc, PRIVACY_DOCS } from './privacy-policy.content';

@Component({
  selector: 'app-privacy-policy',
  templateUrl: './privacy-policy.component.html',
  styleUrls: ['./privacy-policy.component.css']
})
export class PrivacyPolicyComponent implements OnInit, OnDestroy {
  lastUpdated = new Date('2025-12-19');
  doc: LegalDoc = PRIVACY_DOCS.vi;
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
    this.doc = PRIVACY_DOCS[key];
  }
}
