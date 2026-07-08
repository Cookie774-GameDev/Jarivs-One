import { describe, expect, it } from 'vitest';
import { escapeHtml, renderSkillMarkdown } from './markdownPreview';

describe('renderSkillMarkdown safety', () => {
  it('escapes raw HTML so skill bodies cannot inject markup', () => {
    const html = renderSkillMarkdown('<img src=x onerror=alert(1)> **bold**');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('renders images only for safe URL schemes', () => {
    const safe = renderSkillMarkdown('![diagram](https://example.com/a.png)');
    expect(safe).toContain('<img src="https://example.com/a.png"');

    const relative = renderSkillMarkdown('![local](./docs/pic.png)');
    expect(relative).toContain('<img src="./docs/pic.png"');

    const dataImage = renderSkillMarkdown('![inline](data:image/png;base64,AAAA)');
    expect(dataImage).toContain('<img src="data:image/png;base64,AAAA"');
  });

  it('refuses javascript:, vbscript:, and other unsafe image URIs', () => {
    for (const uri of ['javascript:alert(1)', 'vbscript:x', 'data:text/html;base64,PHNjcmlwdD4=', 'file:///etc/passwd']) {
      const html = renderSkillMarkdown(`![x](${uri})`);
      expect(html).not.toContain('<img');
      // The original text stays visible (escaped) instead of silently vanishing.
      expect(html).toContain(escapeHtml(`![x](${uri})`).slice(0, 8));
    }
  });

  it('cannot break out of the src attribute with quotes', () => {
    const html = renderSkillMarkdown('![x](https://example.com/a.png"onerror="alert(1))');
    expect(html).not.toContain('"onerror="');
  });
});
