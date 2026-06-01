/**
 * Application initial derivation utilities.
 *
 * An application's initial is a 3-character, DB-globally-unique, alphanumeric
 * (A–Z, 0–9, uppercased) identifier derived from its name at creation time.
 * It serves as the namespace prefix for test-case display IDs (e.g. SAP-0001).
 *
 * @see utils/__tests__/appInitial.test.js
 */

/**
 * Characters the 3rd position rolls through on collision: 0 (sentinel), 1–9, then A–Z.
 * '0' is the reset/sentinel value used by the caller to initiate rollover from a
 * derived initial (e.g. 'SAP' taken → caller passes 'SA0' → nextInitialCandidate → 'SA1').
 * '0' is never persisted as a final initial; the caller always advances past it.
 */
const ROLL_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Derive a 3-character initial from an application name using the REH rule.
 *
 * Algorithm:
 *  1. Uppercase the name; split into words on any run of non-alphanumeric characters.
 *  2. Build an acronym from the first character of each word in order.
 *  3. If acronym length >= 3, take the first 3 characters as the candidate.
 *  4. If acronym length < 3, pad by inserting the first word's subsequent letters
 *     immediately after the first word's own initial (REH rule), before any later
 *     words' initials, until length 3.
 *  5. If the result is still < 3 (e.g. the whole name has fewer than 3 alphanumerics),
 *     right-pad with '0' to length 3.
 *
 * Worked examples:
 *  - 'Regression Hub'     → 'REH'  (words: REGRESSION, HUB; acronym R,H; pad E → REH)
 *  - 'Super Admin Portal' → 'SAP'  (3 words, 3 initials, no padding needed)
 *  - 'Sandbox'            → 'SAN'  (1 word; acronym S; pad A, N → SAN)
 *  - 'QA'                 → 'QA0'  (1 word QA; acronym Q; pad A → QA; still 2 → QA0)
 *
 * @param {string} name - The application name.
 * @returns {string} A 3-character uppercase alphanumeric initial.
 * @throws {Error} If name is not a non-empty string or yields no alphanumeric characters.
 * @see utils/__tests__/appInitial.test.js
 */
export function deriveInitial(name) {
  if (typeof name !== 'string') {
    throw new Error('Application name must be a string');
  }

  const upper = name.toUpperCase();

  // Split on runs of non-alphanumeric characters; filter out empty strings
  const words = upper.split(/[^A-Z0-9]+/).filter((w) => w.length > 0);

  if (words.length === 0) {
    throw new Error(
      'Application name must contain at least one alphanumeric character',
    );
  }

  // Collect one initial per word
  const wordInitials = words.map((w) => w[0]);

  if (wordInitials.length >= 3) {
    // Enough words — take first 3 initials
    return wordInitials.slice(0, 3).join('');
  }

  // Fewer than 3 words — apply REH rule:
  // Insert first-word subsequent letters immediately after the first word's own initial,
  // before any later words' initials.
  //
  // Layout for 3-char result: [firstWordInitial] [padLetters...] [otherWordsInitials...]
  //
  // Number of padding slots = 3 - 1 (first word initial) - otherInitials.length
  const firstWord = words[0];
  const otherInitials = wordInitials.slice(1); // initials from words 2..N

  const slotsForPad = 3 - 1 - otherInitials.length;
  const padLetters = firstWord.slice(1, 1 + Math.max(slotsForPad, 0));

  let candidate = firstWord[0] + padLetters + otherInitials.join('');

  // Right-pad with '0' if still under 3 characters
  while (candidate.length < 3) {
    candidate += '0';
  }

  return candidate;
}

/**
 * Produce the next collision-fallback candidate from the current 3-character initial.
 *
 * The 3rd character rolls through the sequence: 0 (sentinel), 1–9, then A–Z.
 * '0' is the sentinel value — callers convert a derived initial (e.g. 'SAP') to
 * '[prefix]0' (e.g. 'SA0') before the first `nextInitialCandidate` call, so that
 * the first result is always '[prefix]1' (e.g. 'SA1').
 *
 * When the 3rd character reaches 'Z' (exhausted), the 2nd character is incremented
 * by the same roll rule and the 3rd resets to '0'. If the 2nd is also exhausted,
 * the 1st increments and both trailing positions reset.
 *
 * Worked examples:
 *  - 'SA0' → 'SA1'  (sentinel → first collision candidate)
 *  - 'SA9' → 'SAA'  (digits exhausted → start alphabetic)
 *  - 'SAZ' → 'SB0'  (3rd exhausted → increment 2nd, reset 3rd)
 *  - 'SZZ' → 'T00'  (2nd also exhausted → increment 1st, reset both)
 *
 * @param {string} current - The current 3-character initial candidate.
 * @returns {string} The next candidate in the collision-rollover sequence.
 * @throws {Error} If current is not a string of exactly 3 characters.
 * @see utils/__tests__/appInitial.test.js
 */
export function nextInitialCandidate(current) {
  if (typeof current !== 'string' || current.length !== 3) {
    throw new Error('Current initial must be a 3-character string');
  }

  const c1 = current[0];
  const c2 = current[1];
  const c3 = current[2];

  const nextC3 = rollNextChar(c3);
  if (nextC3 !== null) {
    return c1 + c2 + nextC3;
  }

  // 3rd char exhausted (was 'Z') — roll 2nd char, reset 3rd to sentinel '0'
  const nextC2 = rollNextChar(c2);
  if (nextC2 !== null) {
    return `${c1 + nextC2}0`;
  }

  // 2nd char also exhausted — roll 1st char, reset 2nd and 3rd to sentinel '0'
  const nextC1 = rollNextChar(c1);
  if (nextC1 !== null) {
    return `${nextC1}00`;
  }

  throw new Error(
    `Initial candidate space exhausted starting from '${current}'`,
  );
}

/**
 * Return the next character in the roll sequence (0–9 then A–Z), or null if exhausted.
 *
 * @param {string} ch - A single character currently in the candidate.
 * @returns {string|null} The next character, or null if ch is 'Z' (sequence end).
 */
function rollNextChar(ch) {
  const idx = ROLL_CHARS.indexOf(ch);
  if (idx === -1) {
    // Character is not in the roll sequence (e.g. a derived letter not yet rolled).
    // Start rolling from '0' (sentinel → caller will call nextInitialCandidate again).
    return ROLL_CHARS[0];
  }
  if (idx === ROLL_CHARS.length - 1) {
    // 'Z' — exhausted
    return null;
  }
  return ROLL_CHARS[idx + 1];
}
