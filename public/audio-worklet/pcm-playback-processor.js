/**
 * PCM Playback AudioWorklet Processor with Stateful Resampling
 *
 * Ring buffer-based audio playback processor for streaming PCM audio.
 * Handles sample rate conversion (e.g., 44100→48000) with continuous
 * fractional read position to avoid artifacts at chunk boundaries.
 *
 * Handles:
 * - Progressive buffering of PCM chunks from TTS providers
 * - Stateful linear interpolation resampling across process() calls
 * - Jitter absorption via 2-second ring buffer (at source rate)
 * - Underrun: outputs silence (no pops or clicks)
 * - Overflow: drops oldest samples to recover from latency buildup
 * - Barge-in: flushes buffer immediately on 'flush' command
 *
 * Messages from main thread:
 * - Float32Array: PCM samples to enqueue (at source sample rate)
 * - { type: 'config', sourceRate: number }: Set source sample rate
 * - { type: 'flush' }: Clear buffer immediately (barge-in)
 *
 * Must be vanilla JS (no imports, no TypeScript).
 */

class PCMPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Source and target rates — target is the AudioContext render rate
    this._sourceRate = 48000;
    this._targetRate = sampleRate; // global in AudioWorkletScope
    this._ratio = this._sourceRate / this._targetRate;

    // Ring buffer sized in SOURCE samples (~2 seconds)
    this._capacity = this._sourceRate * 2;
    this._buffer = new Float32Array(this._capacity);
    this._writePos = 0;
    this._readPos = 0;

    // Fractional read position in source sample domain
    // Persists across process() calls for seamless resampling
    this._srcPos = 0;

    this.port.onmessage = (event) => {
      var data = event.data;

      // Handle flush command (barge-in)
      if (data && data.type === 'flush') {
        this._writePos = 0;
        this._readPos = 0;
        this._srcPos = 0;
        this._buffer.fill(0);
        this.port.postMessage({ type: 'flushed' });
        return;
      }

      // Handle config: set source sample rate and resize buffer
      if (data && data.type === 'config' && typeof data.sourceRate === 'number') {
        this._sourceRate = data.sourceRate;
        this._ratio = this._sourceRate / this._targetRate;

        // Resize buffer for ~2 seconds at new source rate
        this._capacity = Math.max(1, Math.floor(this._sourceRate * 2));
        this._buffer = new Float32Array(this._capacity);
        this._writePos = 0;
        this._readPos = 0;
        this._srcPos = 0;
        return;
      }

      // Handle PCM sample data (Float32Array)
      if (data instanceof Float32Array) {
        var samples = data;
        for (var i = 0; i < samples.length; i++) {
          // Overflow policy: if buffer is full, drop oldest by advancing readPos
          var buffered = this._writePos - this._readPos;
          if (buffered >= this._capacity) {
            this._readPos = this._writePos - this._capacity + 1;
            if (this._srcPos < this._readPos) this._srcPos = this._readPos;
          }
          this._buffer[this._writePos % this._capacity] = samples[i];
          this._writePos++;
        }
      }
    };
  }

  process(inputs, outputs) {
    var output = outputs[0];
    if (!output || output.length === 0) return true;

    var channel = output[0];
    if (!channel) return true;

    for (var i = 0; i < channel.length; i++) {
      // Need srcPos+1 to interpolate
      var needPos = Math.floor(this._srcPos) + 1;

      // If not enough buffered, output silence
      if (needPos >= this._writePos) {
        channel[i] = 0;
        continue;
      }

      var idx0 = Math.floor(this._srcPos);
      var frac = this._srcPos - idx0;

      var s0 = this._buffer[idx0 % this._capacity];
      var s1 = this._buffer[(idx0 + 1) % this._capacity];
      channel[i] = s0 * (1 - frac) + s1 * frac;

      // Advance in SOURCE domain by ratio
      this._srcPos += this._ratio;

      // Retire fully-consumed samples to keep buffer from growing unbounded
      var retireTo = Math.floor(this._srcPos) - 2; // keep 2 for safety
      if (retireTo > this._readPos) this._readPos = retireTo;
    }

    // Report buffer level periodically
    var bufferedNow = this._writePos - this._readPos;
    if (bufferedNow > 0 && (this._writePos % Math.floor(this._sourceRate / 10)) < 128) {
      this.port.postMessage({
        type: 'buffer_level',
        buffered: bufferedNow,
        capacity: this._capacity,
      });
    }

    return true;
  }
}

registerProcessor('pcm-playback-processor', PCMPlaybackProcessor);
