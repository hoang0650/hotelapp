import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml, SecurityContext } from '@angular/platform-browser';

@Pipe({
  name: 'nlToBr'
})
export class NlToBrPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string): SafeHtml {
    if (!value) return value;
    
    const escapedText = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const text = escapedText
      .replace(/\n/g, '<br>')
      .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');

    return this.sanitizer.sanitize(SecurityContext.HTML, text) || '';
  }
} 
