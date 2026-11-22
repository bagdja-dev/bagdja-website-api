import { CUSTOM_HTML_MAX_BYTES, CustomHtmlTooLargeError, sanitizeCustomHtml } from './custom-html';

describe('sanitizeCustomHtml (sandboxed render)', () => {
  it('keeps layout markup, inline styles, style blocks and inline UI scripts', () => {
    const html =
      '<style>@media(max-width:1024px){.grid{grid-template-columns:1fr!important}}</style>' +
      '<section style="display:grid;grid-template-columns:1.15fr .85fr;background:#0A0A0F">' +
      '<button onclick="toggle()">Tab</button></section>' +
      '<script>function toggle(){ if (a < b && c > "</div>") document.body.classList.toggle("x"); }</script>';
    const clean = sanitizeCustomHtml(html);

    expect(clean).toContain('grid-template-columns:1fr!important');
    expect(clean).toContain('style="display:grid;grid-template-columns:1.15fr .85fr;background:#0A0A0F"');
    expect(clean).toContain('onclick="toggle()"');
    expect(clean).toContain('<script>function toggle(){ if (a < b && c > "</div>")');
  });

  it('drops anything that loads from or submits to an external origin', () => {
    const clean = sanitizeCustomHtml(
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css"><meta http-equiv="refresh" content="0;url=https://evil.example">' +
      '<base href="https://evil.example/"><script src="https://cdn.evil.example/x.js"></script>' +
      '<iframe src="https://evil.example"></iframe><object data="x"></object><embed src="x">' +
      '<form action="https://evil.example" method="post"><button formaction="https://evil.example">Kirim</button></form>' +
      '<a href="javascript:alert(1)" ping="https://evil.example">link</a>',
    );

    expect(clean).not.toMatch(/<link|<meta|<base|<iframe|<object|<embed|<script|evil\.example|javascript:/i);
    expect(clean).toContain('<form method="post"><button>Kirim</button></form>');
    expect(clean).toContain('<a>link</a>');
  });

  it('keeps https and data images, SVG casing, and full-document head styles', () => {
    const clean = sanitizeCustomHtml(
      '<!doctype html><html><head><title>x</title><style>body{color:red}</style></head><body>' +
      '<img src="https://cdn.bagdja.com/a.webp"><img src="data:image/png;base64,AAAA">' +
      '<svg viewBox="0 0 10 10"><linearGradient id="g"></linearGradient></svg></body></html>',
    );

    expect(clean).toContain('<style>body{color:red}</style>');
    expect(clean).not.toContain('<title>');
    expect(clean).toContain('src="https://cdn.bagdja.com/a.webp"');
    expect(clean).toContain('src="data:image/png;base64,AAAA"');
    expect(clean).toContain('viewBox="0 0 10 10"');
    expect(clean).toContain('<linearGradient');
  });

  it('is stable when saved again', () => {
    const once = sanitizeCustomHtml('<div class="a" onclick="go()">x</div><script>var a = 1 < 2;</script>');
    expect(sanitizeCustomHtml(once)).toBe(once);
  });

  it('rejects HTML above the size limit', () => {
    const huge = `<img src="data:image/png;base64,${'A'.repeat(CUSTOM_HTML_MAX_BYTES)}">`;
    expect(() => sanitizeCustomHtml(huge)).toThrow(CustomHtmlTooLargeError);
  });
});
