const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/**
 * Flattens TipTap/HTML rich text into readable plain text for contexts that
 * cannot render HTML (e.g. Jira issue descriptions). Ordered list items become
 * "1. …" lines, unordered items "- …" lines; paragraphs and <br> become line
 * breaks; all other tags are stripped and common entities decoded.
 * Plain-text input passes through unchanged.
 *
 * @param {string|null|undefined} html
 * @returns {string}
 * @see {@link utils/__tests__/htmlToPlainText.test.js}
 */
export function htmlToPlainText(html) {
  if (!html) return '';
  if (!/<[a-z][\s\S]*>/i.test(html)) return html;

  let text = html;

  // Number <ol> items; dash <ul> items. Handle each list block separately so
  // numbering restarts per list.
  text = text.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, body) => {
    let i = 0;
    return body.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_li, item) => {
      i += 1;
      return `${i}. ${item.trim()}\n`;
    });
  });
  text = text.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_m, body) =>
    body.replace(
      /<li[^>]*>([\s\S]*?)<\/li>/gi,
      (_li, item) => `- ${item.trim()}\n`,
    ),
  );

  // Block-level closers and <br> become line breaks.
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|h[1-6]|blockquote|tr)>/gi, '\n');

  // Strip any remaining tags.
  text = text.replace(/<[^>]+>/g, '');

  // Decode common entities.
  text = text.replace(
    /&(amp|lt|gt|quot|#39|nbsp);/g,
    (entity) => ENTITIES[entity],
  );

  // Collapse blank lines / trailing whitespace.
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}
