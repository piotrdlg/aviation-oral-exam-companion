import { describe, expect, it } from 'vitest';
import { PcmNormalizer } from '../pcm-normalizer';

function convert(rate: number, channels: number, frequency: number, chunk: number) {
  const normalizer = new PcmNormalizer();
  const result: number[] = [];
  const append = (bytes: ArrayBuffer) => result.push(...new Int16Array(bytes));
  for (let start = 0; start < rate; start += chunk) {
    const frames = Math.min(chunk, rate - start);
    const data = new Int16Array(frames * channels);
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < channels; c++) data[i * channels + c] = Math.round(10000 * Math.sin(2 * Math.PI * frequency * (start + i) / rate));
    }
    append(normalizer.push({ data: data.buffer, sampleRate: rate, channels }));
  }
  append(normalizer.finish());
  return result;
}

describe('native PCM normalization', () => {
  it.each([[48000, 2], [44100, 1], [8000, 2], [16000, 1], [24000, 4]])('converts %i Hz / %i channels to one second of mono 16 kHz', (rate, channels) => {
    const result = convert(rate, channels, 1000, 137);
    expect(result).toHaveLength(16000);
    const error = result.slice(50, -50).reduce((sum, value, i) => sum + (value - 10000 * Math.sin(2 * Math.PI * 1000 * (i + 50) / 16000)) ** 2, 0);
    expect(Math.sqrt(error / (result.length - 100))).toBeLessThan(50);
  });
  it('is independent of native buffer boundaries', () => {
    expect(convert(44100, 2, 1000, 101)).toEqual(convert(44100, 2, 1000, 44100));
  });
  it('filters frequencies above the output Nyquist frequency', () => {
    const result = convert(48000, 2, 12000, 127).slice(100, -100);
    expect(Math.sqrt(result.reduce((sum, v) => sum + v * v, 0) / result.length)).toBeLessThan(100);
  });
  it('averages channels and accepts a rate change', () => {
    const n = new PcmNormalizer();
    const first = n.push({ data: new Int16Array(960).fill(1000).buffer, sampleRate: 48000, channels: 2 });
    const stereo = new Int16Array(882);
    for (let i = 0; i < stereo.length; i += 2) { stereo[i] = 2000; stereo[i + 1] = -2000; }
    const second = n.push({ data: stereo.buffer, sampleRate: 44100, channels: 2 });
    const final = n.finish();
    expect((first.byteLength + second.byteLength + final.byteLength) / 2).toBe(320);
    expect([...new Int16Array(final)]).toEqual(expect.arrayContaining([0]));
  });
  it.each([{ sampleRate: NaN, channels: 1 }, { sampleRate: 16000, channels: 0 }, { sampleRate: 16000, channels: 2 }])('reports malformed metadata or frames as diagnostics', (format) => {
    expect(() => new PcmNormalizer().push({ data: new ArrayBuffer(2), ...format })).toThrow('stt_pcm_invalid');
  });
});
