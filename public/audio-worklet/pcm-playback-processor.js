/**
 * PCM Playback AudioWorklet Processor with Stateful Resampling
 *
 * Ring buffer-based audio playback processor for streaming PCM audio.
 * Handles sample rate conversion (e.g., 44100->48000) with continuous
 * fractional read position to avoid artifacts at chunk boundaries.
 *
 * Handles:
 * - Progressive buffering of PCM chunks from TTS providers
 * - Stateful linear interpolation resampling across process() calls
 * - Jitter absorption via 60-second ring buffer (at source rate)
 * - Underrun: outputs silence (no pops or clicks)
 * - Barge-in: flushes buffer immediately on 'flush' command
 * - Config gating: outputs silence until source rate is configured
 *
 * Messages from main thread:
 * - Float32Array: PCM samples to enqueue (at source sample rate)
 * - { type: 'config', sourceRate: number }: Set source sample rate
 * - { type: 'flush' }: Clear buffer immediately (barge-in)
 *
 * Messages to main thread:
 * - { type: 'configured' }: ACK after config is applied
 * - { type: 'flushed' }: ACK after flush
 * - { type: 'buffer_level', buffered, capacity }: Periodic status
 * - { type: 'drain' }: Buffer has been fully consumed
 *
 * Must be vanilla JS (no imports, no TypeScript).
 */

class PCMPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Source and target rates — target is the AudioContext render rate
    // Default source rate to 44100 (Cartesia Sonic default)
    this._sourceRate = 44100;
    this._targetRate = sampleRate; // global in AudioWorkletScope
    this._ratio = this._sourceRate / this._targetRate;

    // Not configured until we receive a config message
    this._configured = false;

    // Ring buffer sized in SOURCE samples (~60 seconds)
    // Large enough to hold a full TTS utterance without overflow
    this._capacity = this._sourceRate * 60;
    this._buffer = new Float32Array(this._capacity);
    this._writePos = 0;
    this._readPos = 0;

    // Fractional read position in source sample domain
    // Persists across process() calls for seamless resampling
    this._srcPos = 0;

    // Track whether we had data and drained it (for drain notification)
    this._hadData = false;
    this._drainNotified = false;

    this.port.onmessage = (event) => {
      var data = event.data;

      // Handle flush command (barge-in)
      if (data && data.type === 'flush') {
        this._writePos = 0;
        this._readPos = 0;
        this._srcPos = 0;
        this._hadData = false;
        this._drainNotified = false;
        this._buffer.fill(0);
        this.port.postMessage({ type: 'flushed' });
        return;
      }

      // Handle config: set source sample rate and resize buffer
      if (data && data.type === 'config' && typeof data.sourceRate === 'number') {
        this._sourceRate = data.sourceRate;
        this._ratio = this._sourceRate / this._targetRate;
        this._configured = true;

        // Resize buffer for ~60 seconds at new source rate
        this._capacity = Math.max(1, Math.floor(this._sourceRate * 60));
        this._buffer = new Float32Array(this._capacity);
        this._writePos = 0;
        this._readPos = 0;
        this._srcPos = 0;
        this._hadData = false;
        this._drainNotified = false;

        // ACK to main thread
        this.port.postMessage({ type: 'configured' });
        return;
      }

      // Handle PCM sample data (Float32Array)
      if (data instanceof Float32Array) {
        var samples = data;
        for (var i = 0; i < samples.length; i++) {
          this._buffer[this._writePos % this._capacity] = samples[i];
          this._writePos++;
        }
        this._hadData = true;
        this._drainNotified = false;
      }
    };
  }

  process(inputs, outputs) {
    var output = outputs[0];
    if (!output || output.length === 0) return true;

    var channel = output[0];
    if (!channel) return true;

    // If not configured yet, output silence
    if (!this._configured) {
      for (var s = 0; s < channel.length; s++) {
        channel[s] = 0;
      }
      return true;
    }

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

    // Notify drain when buffer is exhausted after having had data
    var bufferedNow = this._writePos - Math.floor(this._srcPos);
    if (this._hadData && bufferedNow <= 0 && !this._drainNotified) {
      this._drainNotified = true;
      this.port.postMessage({ type: 'drain' });
    }

    // Report buffer level periodically
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
