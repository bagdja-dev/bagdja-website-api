import { plainTextToHtml, richTextToPlainText, sanitizeRichText } from './rich-text';

describe('sanitizeRichText', () => {
  it('keeps the light formatting produced by the Studio editor (basic)', () => {
    const html = '<p>Termasuk <strong>makan siang</strong> dan <em>snack</em></p><ul><li>Air mineral</li><li><u>Kopi</u></li></ul>';
    expect(sanitizeRichText(html, 'basic')).toBe(html);
  });

  it('removes scripts, event handlers and dangerous links', () => {
    const dirty = '<p onclick="alert(1)">Hai<script>alert(1)</script></p><a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)>';
    expect(sanitizeRichText(dirty, 'basic')).toBe('<p>Hai</p><a target="_blank" rel="noopener noreferrer nofollow">x</a>');
    expect(sanitizeRichText(dirty, 'product')).not.toMatch(/script|onerror|onclick|javascript/);
  });

  it('forces safe link attributes', () => {
    expect(sanitizeRichText('<p><a href="https://bagdja.com" target="_self">Bagdja</a></p>', 'basic'))
      .toBe('<p><a href="https://bagdja.com" target="_blank" rel="noopener noreferrer nofollow">Bagdja</a></p>');
  });

  it('drops headings, images and tables from option descriptions but keeps them for products', () => {
    const html = '<h2>Judul</h2><p>Isi</p><img src="https://cdn.example/a.jpg" alt="a"><table><tbody><tr><td>1</td></tr></tbody></table>';
    expect(sanitizeRichText(html, 'basic')).toBe('Judul<p>Isi</p>1');
    expect(sanitizeRichText(html, 'product')).toBe(html.replace('alt="a">', 'alt="a" />'));
  });

  it('only allows https images for products', () => {
    expect(sanitizeRichText('<p>a</p><img src="http://cdn.example/a.jpg"><img src="data:image/png;base64,AAAA">', 'product')).toBe('<p>a</p>');
  });

  it('converts legacy plain text (textarea) into paragraphs and escapes it', () => {
    expect(sanitizeRichText('Baris 1\nBaris 2\n\n<b>bukan tag</b> & lain', 'basic'))
      .toBe('<p>Baris 1<br />Baris 2</p><p>&lt;b&gt;bukan tag&lt;/b&gt; &amp; lain</p>');
  });

  it('returns null for empty content', () => {
    expect(sanitizeRichText('', 'basic')).toBeNull();
    expect(sanitizeRichText('<p></p><p><br></p>', 'basic')).toBeNull();
    expect(sanitizeRichText(undefined, 'product')).toBeNull();
  });
});

describe('richTextToPlainText', () => {
  it('turns HTML into readable plain text', () => {
    expect(richTextToPlainText('<p>Makan &amp; minum</p><ul><li>Kopi</li><li>Teh</li></ul>')).toBe('Makan & minum\n• Kopi\n• Teh');
    expect(richTextToPlainText(plainTextToHtml('a\nb'))).toBe('a\nb');
  });
});
