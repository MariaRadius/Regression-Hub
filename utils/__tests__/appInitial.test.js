import { describe, expect, it } from 'vitest';
import { deriveInitial, nextInitialCandidate } from '../appInitial.js';

describe('deriveInitial', () => {
  describe('worked examples from spec/plan', () => {
    it('Regression Hub → REH (first-word padding adjacent to its own initial)', () => {
      // Words: REGRESSION, HUB → acronym R,H (len 2)
      // Pad from REGRESSION after R → insert E adjacent to R, before H → REH
      expect(deriveInitial('Regression Hub')).toBe('REH');
    });

    it('Super Admin Portal → SAP (3 words, 3 initials, no padding needed)', () => {
      expect(deriveInitial('Super Admin Portal')).toBe('SAP');
    });

    it('Sandbox → SAN (single word, pad A, N from remaining letters)', () => {
      // Word: SANDBOX → S; pad A, N from SANDBOX → SAN
      expect(deriveInitial('Sandbox')).toBe('SAN');
    });

    it('QA → QA0 (two letters from single word; < 3 after padding, right-pad 0)', () => {
      // Word: QA → acronym Q; pad A from QA (next letter after Q) → QA; still 2 → QA0
      expect(deriveInitial('QA')).toBe('QA0');
    });
  });

  describe('multi-word cases', () => {
    it('four-word name → first 3 initials', () => {
      // Alpha Beta Gamma Delta → A,B,G,D → take first 3 → ABG
      expect(deriveInitial('Alpha Beta Gamma Delta')).toBe('ABG');
    });

    it('two words where first word has many letters → pad from first word before second initial', () => {
      // "My Tool" → words: MY, TOOL → acronym M,T (len 2)
      // REH rule: insert from MY after M (→ Y) adjacent to M, before T → MYT
      expect(deriveInitial('My Tool')).toBe('MYT');
    });

    it('two words where first word is short → pad exhausted, use second initial', () => {
      // "AB Tool" → words: AB, TOOL → acronym A,T (len 2)
      // Pad from AB after A: B → insert B adjacent to A → AB + T → but we only need 3 → ABT
      expect(deriveInitial('AB Tool')).toBe('ABT');
    });
  });

  describe('single-word cases', () => {
    it('long single word → first 3 letters', () => {
      // Dashboard → D, then A, then S → DAS
      expect(deriveInitial('Dashboard')).toBe('DAS');
    });

    it('exactly 3-letter word → uses all 3', () => {
      expect(deriveInitial('App')).toBe('APP');
    });

    it('exactly 2-letter single word → right-pad 0', () => {
      // "AB" → word AB → acronym A → pad B from AB → AB → still 2 → right-pad 0 → AB0
      expect(deriveInitial('AB')).toBe('AB0');
    });

    it('single-letter word → right-pad twice with 0', () => {
      expect(deriveInitial('X')).toBe('X00');
    });
  });

  describe('non-alphanumeric separators', () => {
    it('handles hyphenated names', () => {
      // "e-Commerce Hub" → words: E, COMMERCE, HUB → E,C,H → ECH
      expect(deriveInitial('e-Commerce Hub')).toBe('ECH');
    });

    it('handles names with parentheses (2 words)', () => {
      // "Admin (Internal)" → words: ADMIN, INTERNAL → A,I (len 2)
      // REH rule: pad from ADMIN after A → D adjacent to A, before I → ADI
      expect(deriveInitial('Admin (Internal)')).toBe('ADI');
    });

    it('handles leading/trailing separators (2 words)', () => {
      // " Foo Bar " → words: FOO, BAR → F,B (len 2)
      // REH rule: pad from FOO after F → O adjacent to F, before B → FOB
      expect(deriveInitial(' Foo Bar ')).toBe('FOB');
    });
  });

  describe('input normalization', () => {
    it('lowercase input → uppercase output', () => {
      expect(deriveInitial('regression hub')).toBe('REH');
      expect(deriveInitial('REGRESSION HUB')).toBe('REH');
    });

    it('camelCase is treated as a single word (no separator between letters)', () => {
      // "superAdminPortal" → single word SUPERADMINPORTAL → S,U,P
      expect(deriveInitial('superAdminPortal')).toBe('SUP');
    });

    it('numbers in name are treated as alphanumeric', () => {
      // "Hub 2 App" → words: HUB, 2, APP → H,2,A → H2A
      expect(deriveInitial('Hub 2 App')).toBe('H2A');
    });
  });

  describe('invalid input', () => {
    it('throws on null', () => {
      expect(() => deriveInitial(null)).toThrow();
    });

    it('throws on undefined', () => {
      expect(() => deriveInitial(undefined)).toThrow();
    });

    it('throws on non-string', () => {
      expect(() => deriveInitial(42)).toThrow();
    });

    it('throws when name has no alphanumeric characters', () => {
      // All separators, no words → should throw
      expect(() => deriveInitial('---')).toThrow();
    });

    it('throws on empty string', () => {
      expect(() => deriveInitial('')).toThrow();
    });
  });
});

describe('nextInitialCandidate', () => {
  // Convention: the caller passes [c1][c2]0 as the starting sentinel when
  // beginning the rollover from a derived initial (e.g. 'SAP' → use 'SA0').
  // nextInitialCandidate('SA0') → 'SA1' (first collision candidate).
  // This avoids ambiguity between a derived letter and a rolled letter in position 3.

  describe('rolls the 3rd character', () => {
    it('SA0 → SA1 (sentinel start; first collision candidate from SAP)', () => {
      expect(nextInitialCandidate('SA0')).toBe('SA1');
    });

    it('SA1 → SA2', () => {
      expect(nextInitialCandidate('SA1')).toBe('SA2');
    });

    it('SA9 → SAA (digits exhausted, start alphabetic)', () => {
      expect(nextInitialCandidate('SA9')).toBe('SAA');
    });

    it('SAA → SAB', () => {
      expect(nextInitialCandidate('SAA')).toBe('SAB');
    });

    it('SAZ → SB0 (3rd char exhausted A-Z, increment 2nd, reset 3rd to sentinel)', () => {
      expect(nextInitialCandidate('SAZ')).toBe('SB0');
    });

    it('SZZ → T00 (both 2nd and 3rd exhausted, increment 1st and reset)', () => {
      expect(nextInitialCandidate('SZZ')).toBe('T00');
    });
  });

  describe('collision-rollover sequence', () => {
    it('produces the spec-documented sequence from SAP via sentinel', () => {
      // Caller converts 'SAP' → 'SA0' sentinel, then rolls:
      const sequence = ['SA0'];
      for (let i = 0; i < 4; i++) {
        sequence.push(nextInitialCandidate(sequence[sequence.length - 1]));
      }
      expect(sequence).toEqual(['SA0', 'SA1', 'SA2', 'SA3', 'SA4']);
    });

    it('rolls from 9 to A correctly', () => {
      expect(nextInitialCandidate('SA9')).toBe('SAA');
    });

    it('produces 35 distinct 3rd-char variants (1-9 then A-Z) before incrementing 2nd char', () => {
      // SA0 → SA1 (start), then 1-9 (9 values), A-Z (26 values) = 35 rolls total, then SB0
      let current = 'SA0';
      const variants = [];
      for (let i = 0; i < 35; i++) {
        current = nextInitialCandidate(current);
        variants.push(current);
      }
      expect(variants[0]).toBe('SA1'); // first roll
      expect(variants[8]).toBe('SA9'); // last digit
      expect(variants[9]).toBe('SAA'); // first letter
      expect(variants[34]).toBe('SAZ'); // last letter
    });

    it('increments 2nd char and resets 3rd after exhausting 3rd-char range', () => {
      expect(nextInitialCandidate('SAZ')).toBe('SB0');
      expect(nextInitialCandidate('SBZ')).toBe('SC0');
    });
  });

  describe('invalid input', () => {
    it('throws on non-string input', () => {
      expect(() => nextInitialCandidate(null)).toThrow();
    });

    it('throws on string with length !== 3', () => {
      expect(() => nextInitialCandidate('SA')).toThrow();
      expect(() => nextInitialCandidate('SAAB')).toThrow();
    });

    it('throws on empty string', () => {
      expect(() => nextInitialCandidate('')).toThrow();
    });
  });
});
