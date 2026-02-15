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
});
