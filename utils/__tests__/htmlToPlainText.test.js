import { describe, expect, it } from 'vitest';
import { htmlToPlainText } from '@/utils/htmlToPlainText';

describe('htmlToPlainText', () => {
  it('returns plain text unchanged', () => {
    expect(htmlToPlainText('1. Open app\n2. Sign in')).toBe(
      '1. Open app\n2. Sign in',
    );
  });

  it('converts TipTap list items to numbered lines', () => {
    expect(htmlToPlainText('<ol><li>Open app</li><li>Sign in</li></ol>')).toBe(
      '1. Open app\n2. Sign in',
    );
  });

  it('converts bullet list items to dashed lines', () => {
    expect(htmlToPlainText('<ul><li>One</li><li>Two</li></ul>')).toBe(
      '- One\n- Two',
    );
  });

  it('turns paragraphs and <br> into line breaks and strips other tags', () => {
    expect(
      htmlToPlainText(
        '<p>First <strong>bold</strong></p><p>Second<br>Third</p>',
      ),
    ).toBe('First bold\nSecond\nThird');
  });

  it('decodes common HTML entities', () => {
    expect(
      htmlToPlainText('<p>a &amp; b &lt;c&gt;&nbsp;&quot;d&quot;</p>'),
    ).toBe('a & b <c> "d"');
  });

  it('returns an empty string for null/undefined', () => {
    expect(htmlToPlainText(null)).toBe('');
    expect(htmlToPlainText(undefined)).toBe('');
  });
});
