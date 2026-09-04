import { Component, OnDestroy, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { Meta, Title, DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-clip-landing',
  templateUrl: './clip-landing.component.html',
  styleUrls: ['./clip-landing.component.css']
})
export class ClipLandingComponent implements OnInit, OnDestroy {
  readonly appStoreUrl = 'https://apps.apple.com/app/id6778220852';
  readonly playStoreUrl =
    'https://play.google.com/store/apps/details?id=app.rork.phhotel_pms_interface';
  readonly websiteUrl = 'https://phhotel.vn';
  readonly youtubeUrl = 'https://youtu.be/8YDrnZSQ2Xc';
  youtubeEmbedUrl: SafeResourceUrl | null = null;
  private langSub?: Subscription;

  constructor(
    private title: Title,
    private meta: Meta,
    private sanitizer: DomSanitizer,
    private translate: TranslateService,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    this.youtubeEmbedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      'https://www.youtube.com/embed/8YDrnZSQ2Xc?rel=0&modestbranding=1'
    );

    this.applySeo();
    this.langSub = this.translate.onLangChange.subscribe(() => this.applySeo());

    if (isPlatformBrowser(this.platformId)) {
      let link = this.document.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
      if (!link) {
        link = this.document.createElement('link');
        link.setAttribute('rel', 'canonical');
        this.document.head.appendChild(link);
      }
      link.setAttribute('href', 'https://phhotel.vn/clip');
    }
  }

  ngOnDestroy(): void {
    this.langSub?.unsubscribe();
  }

  private applySeo(): void {
    this.title.setTitle(this.translate.instant('CLIP.META_TITLE'));
    this.meta.updateTag({
      name: 'description',
      content: this.translate.instant('CLIP.META_DESCRIPTION')
    });
    this.meta.updateTag({
      property: 'og:title',
      content: this.translate.instant('CLIP.META_TITLE')
    });
    this.meta.updateTag({
      property: 'og:description',
      content: this.translate.instant('CLIP.OG_DESCRIPTION')
    });
    this.meta.updateTag({
      property: 'og:image',
      content: 'https://phhotel.vn/assets/images/introduce/duns.png'
    });
    this.meta.updateTag({
      property: 'og:url',
      content: 'https://phhotel.vn/clip'
    });
    this.meta.updateTag({
      name: 'apple-itunes-app',
      content:
        'app-id=6778220852, app-clip-bundle-id=app.rork.phhotel-pms-interface.clip, app-clip-display=card'
    });
  }
}
