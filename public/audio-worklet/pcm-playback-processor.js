/**
 * PCM Playback AudioWorklet Processor
 *
 * Ring buffer-based audio playback processor for streaming PCM audio.
 * Handles:
 * - Progressive buffering of PCM chunks from TTS providers
 * - Jitter absorption via 2-second ring buffer
 * - Underrun: outputs silence (no pops or clicks)
 * - Overflow: drops oldest samples to recover from latency buildup
 * - Barge-in: flushes buffer immediately on 'flush' command
 *
 * Messages from main thread:
 * - Float32Array: PCM samples to enqueue
 * - { type: 'flush' }: Clear buffer immediately (barge-in)
 *
 * Must be vanilla JS (no imports, no TypeScript).
 */

class PCMPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Ring buffer: 2 seconds at 48kHz
    this._capacity = 48000 * 2;
    this._buffer = new Float32Array(this._capacity);
    this._writePos = 0;
    this._readPos = 0;

    this.port.onmessage = (event) => {
      var data = event.data;

      // Handle flush command (barge-in)
      if (data && data.type === 'flush') {
        this._writePos = 0;
        this._readPos = 0;
        this._buffer.fill(0);
        this.port.postMessage({ type: 'flushed' });
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
      if (this._readPos < this._writePos) {
        channel[i] = this._buffer[this._readPos % this._capacity];
        this._readPos++;
      } else {
        // Underrun: output silence, no pop
        channel[i] = 0;
      }
    }

    // Report buffer level periodically (every ~100ms = ~4800 samples at 48kHz)
    // Only report when there's actual content
    var buffered = this._writePos - this._readPos;
    if (buffered > 0 && this._writePos % 4800 < 128) {
      this.port.postMessage({
        type: 'buffer_level',
        buffered: buffered,
        capacity: this._capacity,
      });
    }

    return true;
  }
}

registerProcessor('pcm-playback-processor', PCMPlaybackProcessor);
