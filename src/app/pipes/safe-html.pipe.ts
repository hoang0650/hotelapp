import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'safeHtml'
})
export class SafeHtmlPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string): SafeHtml {
    if (!value) return '';
    // Bypass cơ chế bảo mật của Angular để render toàn vẹn HTML
    return this.sanitizer.bypassSecurityTrustHtml(value);
  }
}