import { describe, expect, it } from 'vitest';
import { mergeSpeechDraft, SttParser } from '../stt-parser';
import { splitUtterance } from '../voice-text';

const result = (text: string, start = 0, final = true) => ({
  type: 'Results', start, duration: 1, is_final: final,
  channel: { alternatives: [{ transcript: text }] },
});

describe('speech accumulation', () => {
  it('accumulates finals', () => {
    const parser = new SttParser();
    parser.push(result('First answer.'));
    expect(parser.push(result('Second answer.', 1)).transcript).toBe('First answer. Second answer.');
  });
  it('deduplicates a final by acoustic timing', () => {
    const parser = new SttParser();
    parser.push(result('Mayday'));
    expect(parser.push(result('Mayday')).transcript).toBe('Mayday');
  });
  it('retains repeated words at different timings', () => {
    const parser = new SttParser();
    parser.push(result('Mayday'));
    expect(parser.push(result('Mayday', 1)).transcript).toBe('Mayday Mayday');
  });
  it('does not commit interim text', () => {
    const parser = new SttParser();
    expect(parser.push(result('May', 0, false))).toEqual({ transcript: '', interim: 'May' });
    expect(parser.push(result('Mayday'))).toEqual({ transcript: 'Mayday', interim: '' });
  });
  it('clears empty endpoint interims', () => {
    const parser = new SttParser();
    parser.push(result('noise', 0, false));
    expect(parser.push(result(''))).toEqual({ transcript: '', interim: '' });
  });
  it.each(['{', null, 7, { type: 'Results', channel: {} }, { type: 'Metadata' }])('ignores invalid/control frames: %j', (raw) => {
    expect(new SttParser().push(raw)).toEqual({ transcript: '', interim: '' });
  });
  it('appends distinct Flux turns instead of replacing the first', () => {
    const parser = new SttParser(true);
    const turn = { type: 'TurnInfo', event: 'EndOfTurn', transcript: 'Check fuel.', turn_index: 0 };
    parser.push(turn);
    parser.push(turn);
    expect(parser.push({ ...turn, turn_index: 1 }).transcript).toBe('Check fuel. Check fuel.');
  });
  it('parses JSON frames', () => {
    expect(new SttParser().push(JSON.stringify(result('Fuel'))).transcript).toBe('Fuel');
  });
  it('preserves a typed prefix', () => {
    expect(mergeSpeechDraft('Fuel first.', { transcript: 'Then oil.', interim: 'Then' })).toBe('Fuel first. Then oil. Then');
  });
  it('preserves draft content on empty speech', () => {
    expect(mergeSpeechDraft('Typed answer', { transcript: '', interim: '' })).toBe('Typed answer');
  });
});

describe('bounded utterances', () => {
  it('keeps a short turn whole for the baseline', () => {
    expect(splitUtterance('First sentence. Second sentence.')).toEqual(['First sentence. Second sentence.']);
  });
  it('does not lose words on long turns', () => {
    const text = 'Check fuel quantity. '.repeat(200).trim();
    const chunks = splitUtterance(text);
    expect(chunks.join(' ')).toBe(text);
    expect(chunks.every((chunk) => chunk.length <= 2000)).toBe(true);
  });
  it('handles a long unbroken string', () => {
    const text = 'x'.repeat(4500);
    const chunks = splitUtterance(text);
    expect(chunks.map((c) => c.length)).toEqual([2000, 2000, 500]);
    expect(chunks.join('')).toBe(text);
  });
  it('does not send empty text', () => { expect(splitUtterance('  ')).toEqual([]); });
});
