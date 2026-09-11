export interface PcmBuffer { data: ArrayBuffer; sampleRate: number; channels: number }

/** Streaming interleaved int16 → mono 16 kHz. State spans native buffer boundaries. */
export class PcmNormalizer {
  private rate = 0;
  private samples: number[] = [];
  private offset = 0;
  private received = 0;
  private emitted = 0;

  push({ data, sampleRate, channels }: PcmBuffer): ArrayBuffer {
    if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0 ||
        !Number.isSafeInteger(channels) || channels <= 0 || data.byteLength % (2 * channels)) {
      throw new Error('stt_pcm_invalid');
    }
    // A route change may change the native format. Finish the old segment first.
    const tail = this.rate && this.rate !== sampleRate ? this.finish() : new ArrayBuffer(0);
    this.rate = sampleRate;
    const view = new DataView(data);
    for (let i = 0; i < data.byteLength; i += 2 * channels) {
      let sum = 0;
      for (let c = 0; c < channels; c++) sum += view.getInt16(i + 2 * c, true);
      this.samples.push(sum / channels);
      this.received++;
    }
    const output = this.render(false);
    if (!tail.byteLength) return output;
    const joined = new Uint8Array(tail.byteLength + output.byteLength);
    joined.set(new Uint8Array(tail));
    joined.set(new Uint8Array(output), tail.byteLength);
    return joined.buffer;
  }

  finish(): ArrayBuffer {
    const output = this.rate ? this.render(true) : new ArrayBuffer(0);
    this.rate = this.offset = this.received = this.emitted = 0;
    this.samples = [];
    return output;
  }

  private render(flush: boolean): ArrayBuffer {
    const step = this.rate / 16000;
    const cutoff = Math.min(1, 1 / step) * 0.9;
    const radius = Math.ceil(16 / cutoff);
    const output: number[] = [];
    const total = Math.floor(this.received / step);
    while (this.emitted < total) {
      const position = this.emitted * step;
      if (!flush && position + radius >= this.received) break;
      let value = 0;
      let weight = 0;
      // Windowed sinc low-pass suppresses aliasing when downsampling (e.g. 48 kHz).
      for (let i = Math.ceil(position - radius); i <= Math.floor(position + radius); i++) {
        const distance = i - position;
        const x = Math.PI * distance * cutoff;
        const sinc = Math.abs(x) < 1e-8 ? 1 : Math.sin(x) / x;
        const w = sinc * (0.5 + 0.5 * Math.cos(Math.PI * distance / radius));
        const index = Math.max(0, Math.min(this.received - 1, i));
        value += (this.samples[index - this.offset] ?? 0) * w;
        weight += w;
      }
      output.push(Math.max(-32768, Math.min(32767, Math.round(value / weight))));
      this.emitted++;
    }
    const discard = Math.max(0, Math.floor(this.emitted * step) - radius - this.offset);
    this.samples.splice(0, discard);
    this.offset += discard;
    const bytes = new ArrayBuffer(output.length * 2);
    const view = new DataView(bytes);
    output.forEach((value, i) => view.setInt16(i * 2, value, true));
    return bytes;
  }
}
