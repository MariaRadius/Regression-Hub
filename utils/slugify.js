/**
 * Converts a string into a URL-safe slug.
 *
 * Steps applied in order:
 * 1. Non-string input → returns ''.
 * 2. Lowercase the string.
 * 3. Collapse every run of non-alphanumeric characters to a single '-'.
 * 4. Trim leading and trailing '-'.
 * 5. Truncate to MAX_SLUG_LENGTH, then trim any trailing '-' introduced by the cut.
 *
 * Used as the content fingerprint for test-case identity matching:
 * `fingerprint = slugify(testCase.name)` scoped to (team, application, module).
 *
 * @param {*} text - Value to slugify; non-string types return ''.
 * @returns {string} Slug string, at most MAX_SLUG_LENGTH characters, never starting or ending with '-'.
 *
 * @see utils/__tests__/slugify.test.js
 */

const MAX_SLUG_LENGTH = 1000;

export function slugify(text) {
  if (typeof text !== 'string') return '';

  let slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length > MAX_SLUG_LENGTH) {
    slug = slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, '');
  }

  return slug;
}
