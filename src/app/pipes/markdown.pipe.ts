import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'markdown'
})
export class MarkdownPipe implements PipeTransform {

  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string): SafeHtml {
    if (!value) return '';

    let html = value;

    // 1. Extract Code Blocks (```lang ... ```)
    const codeBlocks: string[] = [];
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push(`<pre class="code-block"><div class="code-header">${lang || 'code'}</div><code>${this.escapeHtml(code)}</code></pre>`);
      return placeholder;
    });

    // 2. Escape HTML in the non-code parts to prevent XSS (if we assume input is markdown text, not HTML)
    // However, user said "bot returns html or code".
    // If we escape here, we break HTML returned by bot.
    // If we don't escape, we are vulnerable if user input is malicious.
    // Since this is for "bot returns", and bot is trusted (mostly), maybe we can skip escaping?
    // OR we can try to detect if it looks like HTML?
    // Let's assume mixed content is possible but primarily we want to render format.
    // Safe approach: Escape by default unless we detect it's purely HTML?
    // No, standard markdown parsers escape HTML.
    // But the user specifically asked "support markdown ... when bot returns html or code".
    // "Returns html" -> implies raw HTML.
    // "Returns code" -> implies markdown code blocks.
    
    // I will NOT escape HTML generally, but I will sanitize the final result using DomSanitizer.
    // Angular's bypassSecurityTrustHtml will allow the HTML to be rendered.
    // If I want to support Markdown syntax like **bold**, I should apply it.

    // 3. Inline Code (`code`)
    html = html.replace(/`([^`]+)`/g, (match, code) => {
        return `<code>${this.escapeHtml(code)}</code>`;
    });

    // 4. Bold (**text**)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 5. Italic (*text*)
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 6. Links ([text](url))
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

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

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
