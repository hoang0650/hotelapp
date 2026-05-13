import { Pipe, PipeTransform, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

@Pipe({
  name: 'markdown'
})
export class MarkdownPipe implements PipeTransform {

  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string): string {
    if (!value) return '';

    let html = this.escapeHtml(value);

    // 1. Extract Code Blocks (```lang ... ```)
    const codeBlocks: string[] = [];
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push(`<pre class="code-block"><div class="code-header">${lang || 'code'}</div><code>${this.escapeHtml(code)}</code></pre>`);
      return placeholder;
    });

    // 3. Inline Code (`code`)
    html = html.replace(/`([^`]+)`/g, (match, code) => {
        return `<code>${this.escapeHtml(code)}</code>`;
    });

    // 4. Bold (**text**)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 5. Italic (*text*)
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 6. Links ([text](url))
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, rawUrl) => {
      const safeUrl = this.sanitizeUrl(rawUrl);
      return safeUrl ? `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
    });

    // 7. Lists
    // Unordered list
    html = html.replace(/^\s*-\s+(.+)$/gm, '<li>$1</li>');
    // Wrap adjacent <li> in <ul> (simple heuristic)
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>'); 
    // This regex is too simple for multiple lists, but basic support.
    // Better: replace multiple <li> lines with <ul>...</ul>
    // But regex for multiline block is tricky without a state machine.
    // Let's skip list wrapping for now or use a simple hack.
    // Just converting - to bullet point char might be safer for simple implementation.
    // html = html.replace(/^\s*-\s+(.+)$/gm, '&bull; $1<br>');

    // 8. Newlines to <br>
    // We only convert newlines that are NOT inside HTML tags?
    // Or just convert all newlines to <br> if they are single newlines?
    html = html.replace(/\n/g, '<br>');

    // 9. Restore Code Blocks
    html = html.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
      return codeBlocks[parseInt(index, 10)];
    });

    return this.sanitizer.sanitize(SecurityContext.HTML, html) || '';
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private sanitizeUrl(url: string): string | null {
    const trimmed = (url || '').trim();
    if (!trimmed) {
      return null;
    }

    if (/^(https?:|mailto:)/i.test(trimmed)) {
      return trimmed.replace(/"/g, '&quot;');
    }

    return null;
  }
}
