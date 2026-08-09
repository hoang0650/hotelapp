import { Injectable } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { TranslateService } from '@ngx-translate/core';
import { filter } from 'rxjs';
import { environment } from '../../environments/environment';

type SeoData = {
  title?: string;
  titleKey?: string;
  description?: string;
  descriptionKey?: string;
  robots?: string;
  ogType?: string;
};

type NavItem = { name: string; description: string; path: string };

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
    this.setMetaTag('property', 'og:image', `${this.getBaseUrl()}/assets/phgroup_logo_circle.PNG`);

    this.setMetaTag('name', 'twitter:card', 'summary');
    this.setMetaTag('name', 'twitter:title', title);
    this.setMetaTag('name', 'twitter:description', description);

    this.setCanonicalLink(url);
    this.setPageJsonLd(url, title, description);
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

  private getBaseUrl(): string {
    const site = String((environment as any)?.siteUrl || '').replace(/\/+$/, '');
    if (site) return site;
    if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
    return 'https://phhotel.vn';
  }

  private getCanonicalUrl(): string {
    const origin = this.getBaseUrl();
    const rawPath = String(this.router.url || '/');
    const pathOnly = rawPath.split('#')[0].split('?')[0] || '/';
    // Prefer /home over bare / for marketing home
    const normalized = pathOnly === '/' ? '/home' : pathOnly;
    return `${origin}${normalized}`.replace(/\/+$/, '') || origin;
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

  private getSiteNavItems(): NavItem[] {
    return [
      {
        name: this.getTranslatedValue('SEO.PRICING.TITLE') || 'Bảng giá',
        description: this.getTranslatedValue('SEO.PRICING.DESCRIPTION') || '',
        path: '/pricing'
      },
      {
        name: this.getTranslatedValue('SEO.BLOG.TITLE') || 'Blog',
        description: this.getTranslatedValue('SEO.BLOG.DESCRIPTION') || '',
        path: '/blog'
      },
      {
        name: this.getTranslatedValue('SEO.CONTACT.TITLE') || 'Liên hệ',
        description: this.getTranslatedValue('SEO.CONTACT.DESCRIPTION') || '',
        path: '/contact'
      },
      {
        name: this.getTranslatedValue('SEO.ABOUT_US.TITLE') || 'Về chúng tôi',
        description: this.getTranslatedValue('SEO.ABOUT_US.DESCRIPTION') || '',
        path: '/about-us'
      }
    ];
  }

  private setPageJsonLd(url: string, title: string, description: string): void {
    if (typeof document === 'undefined') return;

    const pathOnly = String(this.router.url || '/').split('#')[0].split('?')[0] || '/';
    const isHome = pathOnly === '/' || pathOnly === '/home';

    const homeName = this.getTranslatedValue('SEO.HOME.TITLE') || 'Trang chủ';
    const baseUrl = this.getBaseUrl();

    const toUrl = (p: string) => {
      const normalized = String(p || '/').startsWith('/') ? String(p || '/') : `/${p}`;
      return `${baseUrl}${normalized}`.replace(/\/+$/, '');
    };

    const crumbList = isHome
      ? [{ name: homeName, url: toUrl('/home') }]
      : [{ name: homeName, url: toUrl('/home') }, { name: title, url }];

    const navItems = this.getSiteNavItems();

    const schema = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          '@id': `${baseUrl}#website`,
          name: this.brand,
          url: baseUrl,
          inLanguage: this.translate.currentLang || 'vi',
          publisher: { '@id': `${baseUrl}#organization` }
        },
        {
          '@type': 'Organization',
          '@id': `${baseUrl}#organization`,
          name: this.brand,
          url: baseUrl,
          logo: `${baseUrl}/assets/favicon.png`
        },
        {
          '@type': 'WebPage',
          '@id': `${url}#webpage`,
          url,
          name: title,
          description,
          inLanguage: this.translate.currentLang || 'vi',
          isPartOf: { '@id': `${baseUrl}#website` }
        },
        {
          '@type': 'BreadcrumbList',
          '@id': `${url}#breadcrumb`,
          itemListElement: crumbList.map((c, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            name: c.name,
            item: c.url
          }))
        },
        {
          '@type': 'ItemList',
          '@id': `${baseUrl}#sitelinks`,
          name: 'PHHotel site navigation',
          itemListElement: navItems.map((item, idx) => ({
            '@type': 'SiteNavigationElement',
            position: idx + 1,
            name: item.name,
            description: item.description,
            url: toUrl(item.path)
          }))
        }
      ]
    };

    const id = 'phhotel-jsonld-page';
    let el = document.querySelector<HTMLScriptElement>(`script#${id}[type="application/ld+json"]`);
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = id;
      document.head.appendChild(el);
    }
    el.text = JSON.stringify(schema);
  }

  updateSeoData(data: SeoData): void {
    this.apply(data);
  }
}
