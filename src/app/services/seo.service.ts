import { Injectable } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { TranslateService } from '@ngx-translate/core';
import { filter } from 'rxjs';

type SeoData = {
  title?: string;
  titleKey?: string;
  description?: string;
  descriptionKey?: string;
  robots?: string;
  ogType?: string;
};

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly brand = 'PHHotel';
  private readonly fallbackDefaultDescription =
    'PHHotel là phần mềm quản lý khách sạn: quản lý phòng, đặt phòng, hóa đơn, giao ca, báo cáo doanh thu, tích hợp camera và tin nhắn.';

  constructor(
    private title: Title,
    private meta: Meta,
    private router: Router,
    private route: ActivatedRoute,
    private translate: TranslateService
  ) {}

  init(): void {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      const data = this.getMergedRouteData();
      this.apply(data);
    });
    this.translate.onLangChange.subscribe(() => {
      const data = this.getMergedRouteData();
      this.apply(data);
    });
    const initial = this.getMergedRouteData();
    this.apply(initial);
  }

  private getMergedRouteData(): SeoData {
    const chain: ActivatedRoute[] = [];
    let current: ActivatedRoute | null = this.route;
    while (current) {
      chain.push(current);
      current = current.firstChild;
    }

    let merged: SeoData = {};
    for (const r of chain) {
      const d: any = r.snapshot?.data || {};
      if (d.title) merged = { ...merged, title: d.title };
      if (d.titleKey) merged = { ...merged, titleKey: d.titleKey };
      if (d.description) merged = { ...merged, description: d.description };
      if (d.descriptionKey) merged = { ...merged, descriptionKey: d.descriptionKey };
      if (d.robots) merged = { ...merged, robots: d.robots };
      if (d.ogType) merged = { ...merged, ogType: d.ogType };
    }
    return merged;
  }

  private apply(data: SeoData): void {
    const url = this.getCanonicalUrl();
    const translatedTitle = this.getTranslatedValue(data.titleKey);
    const translatedDescription = this.getTranslatedValue(data.descriptionKey);
    const title = this.buildTitle(translatedTitle || data.title);
    const defaultDescription = this.getTranslatedValue('SEO.DEFAULT_DESCRIPTION') || this.fallbackDefaultDescription;
    const description = translatedDescription || data.description || defaultDescription;
    const robots = data.robots || 'index,follow';
    const ogType = data.ogType || 'website';

    this.title.setTitle(title);
    this.setMetaTag('name', 'description', description);
    this.setMetaTag('name', 'robots', robots);

    this.setMetaTag('property', 'og:title', title);
    this.setMetaTag('property', 'og:description', description);
    this.setMetaTag('property', 'og:type', ogType);
    this.setMetaTag('property', 'og:url', url);
    this.setMetaTag('property', 'og:site_name', this.brand);

    this.setMetaTag('name', 'twitter:card', 'summary');
    this.setMetaTag('name', 'twitter:title', title);
    this.setMetaTag('name', 'twitter:description', description);

    this.setCanonicalLink(url);
  }

  private buildTitle(pageTitle?: string): string {
    const t = String(pageTitle || '').trim();
    const homeTitle = this.getTranslatedValue('SEO.HOME.TITLE') || 'Trang chủ';
    const effective = t || homeTitle;
    if (effective.toLowerCase().includes(this.brand.toLowerCase())) return effective;
    return `${this.brand} | ${effective}`;
  }

  private getTranslatedValue(key?: string): string {
    const k = String(key || '').trim();
    if (!k) return '';
    const v = this.translate.instant(k);
    if (!v || v === k) return '';
    return String(v).trim();
  }

  private getCanonicalUrl(): string {
    const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : '';
    const path = this.router.url || '/';
    return `${origin}${path}`.replace(/\/+$/, '') || '/';
  }

  private setCanonicalLink(url: string): void {
    if (typeof document === 'undefined') return;
    let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', 'canonical');
      document.head.appendChild(el);
    }
    el.setAttribute('href', url);
  }

  private setMetaTag(attrName: 'name' | 'property', attrValue: string, content: string): void {
    this.meta.updateTag({ [attrName]: attrValue, content });
  }
}
