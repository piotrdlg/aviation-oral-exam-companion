import { describe, it, expect } from 'vitest';
import { detectSentenceBoundary } from '../voice/sentence-boundary';

describe('detectSentenceBoundary', () => {
  it('detects a simple sentence ending with a period', () => {
    const result = detectSentenceBoundary(
      'The aircraft must be in airworthy condition. The pilot is responsible for this.'
    );
    expect(result).not.toBeNull();
    expect(result!.sentence).toBe('The aircraft must be in airworthy condition.');
    expect(result!.remainder).toBe('The pilot is responsible for this.');
  });

  it('detects a sentence ending with a question mark', () => {
    const result = detectSentenceBoundary(
      'Can you tell me about the required inspections? I need to know the details.'
    );
    expect(result).not.toBeNull();
    expect(result!.sentence).toBe('Can you tell me about the required inspections?');
  });

  it('detects a sentence ending with an exclamation mark', () => {
    const result = detectSentenceBoundary(
      'That is absolutely correct! Now let us move on to the next topic.'
    );
    expect(result).not.toBeNull();
    expect(result!.sentence).toBe('That is absolutely correct!');
  });

  it('does NOT split on abbreviations like e.g. and i.e.', () => {
    const result = detectSentenceBoundary(
      'You need certain documents, e.g. your pilot certificate. Make sure they are current.'
    );
    expect(result).not.toBeNull();
    // Should split at "certificate.", not at "e.g."
    expect(result!.sentence).toBe('You need certain documents, e.g. your pilot certificate.');
  });

  it('does NOT split on FAA references like 91.205', () => {
    const result = detectSentenceBoundary(
      'According to 14 CFR 91.205 the required instruments include an airspeed indicator. Check your POH for details.'
    );
    expect(result).not.toBeNull();
    expect(result!.sentence).toContain('91.205');
    expect(result!.sentence).toContain('airspeed indicator');
  });

  it('does NOT split on decimal numbers like 122.8', () => {
    const result = detectSentenceBoundary(
      'Tune your radio to 122.8 MHz for the CTAF frequency. Listen before transmitting.'
    );
    expect(result).not.toBeNull();
    expect(result!.sentence).toContain('122.8 MHz');
    expect(result!.sentence).toContain('CTAF frequency');
  });

  it('does NOT split on list markers like 1). or a).', () => {
    const result = detectSentenceBoundary(
      'The first item is 1). Check the fuel quantity before every flight departure is mandatory.'
    );
    // Should NOT split after "1)."
    const result2 = detectSentenceBoundary(
      'The first item is 1). checking something very important to safety and airworthiness of the aircraft. Then do the next thing.'
    );
    expect(result2).not.toBeNull();
    expect(result2!.sentence).toContain('1).');
  });

  it('splits on colon soft boundary for long buffers', () => {
    const longBuffer =
      'Here are the key requirements for the private pilot checkride that you absolutely need to know about: ' +
      'First you need to review your logbook entries carefully.';
    const result = detectSentenceBoundary(longBuffer);
    expect(result).not.toBeNull();
    expect(result!.sentence).toContain('know about:');
  });

  it('force flushes very long buffers without any punctuation', () => {
    const longText = 'word '.repeat(50); // 250 chars, no sentence endings
    const result = detectSentenceBoundary(longText);
    expect(result).not.toBeNull();
    expect(result!.sentence.length).toBeLessThanOrEqual(205);
    expect(result!.sentence.length).toBeGreaterThan(20);
  });

  it('returns null when buffer is too short for a sentence', () => {
    const result = detectSentenceBoundary('Short text. ');
    expect(result).toBeNull();
  });

  // Additional edge cases for aviation context
  it('does NOT split on 14 CFR 91.155 mid-sentence', () => {
    const result = detectSentenceBoundary(
      'Under 14 CFR 91.155 the basic VFR weather minimums require certain visibility. Know these cold.'
    );
    expect(result).not.toBeNull();
    expect(result!.sentence).toContain('91.155');
    expect(result!.sentence).toContain('visibility');
  });

  it('does NOT split on 61.113 with CFR reference', () => {
    const result = detectSentenceBoundary(
      'Per 14 CFR 61.113 a private pilot may not act as PIC for compensation. There are exceptions though.'
    );
    expect(result).not.toBeNull();
    expect(result!.sentence).toContain('61.113');
    expect(result!.sentence).toContain('compensation');
  });

  it('does NOT split on decimal altitudes like 3.5 degrees', () => {
    const result = detectSentenceBoundary(
      'The glide slope angle is typically 3.0 degrees for a standard ILS approach. Maintain it precisely.'
    );
    expect(result).not.toBeNull();
    expect(result!.sentence).toContain('3.0 degrees');
  });

  it('handles multiple sentences and returns only the first', () => {
    const result = detectSentenceBoundary(
      'First sentence is long enough to pass. Second sentence here. Third one too.'
    );
    expect(result).not.toBeNull();
    expect(result!.sentence).toBe('First sentence is long enough to pass.');
    expect(result!.remainder).toBe('Second sentence here. Third one too.');
  });

  it('handles streaming scenario: accumulate tokens then detect', () => {
    // Simulate token-by-token accumulation
    let buffer = '';
    const tokens = 'The minimum visibility requirement is three statute miles. '.split(' ');
    let found: ReturnType<typeof detectSentenceBoundary> = null;
    for (const token of tokens) {
      buffer += (buffer ? ' ' : '') + token;
      found = detectSentenceBoundary(buffer);
      if (found) break;
    }
    expect(found).not.toBeNull();
    expect(found!.sentence).toContain('three statute miles.');
  });

  it('handles etc. abbreviation: does not split there, waits for real boundary', () => {
    // "etc." is an abbreviation so should NOT be a split point.
    // The real boundary is at "valid." — but the full string is <200 chars.
    const result = detectSentenceBoundary(
      'You need your logbook, medical certificate, etc. Make sure everything is current and valid. Next topic.'
    );
    expect(result).not.toBeNull();
    // Should skip "etc." and split at "valid."
    expect(result!.sentence).toContain('etc.');
    expect(result!.sentence).toContain('valid.');
    expect(result!.remainder).toBe('Next topic.');
  });
});
