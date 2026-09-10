import { mergeSpeechDraft, type SpeechText } from './stt-parser';
import { splitUtterance } from './voice-text';

export type VoiceMode = 'idle' | 'speaking' | 'listening' | 'finalizing' | 'error';
export interface VoiceSnapshot {
  mode: VoiceMode;
  connecting: boolean;
  draft: string;
  error: string | null;
}

export interface SpeechCapture {
  finalize(): Promise<string>;
  abort(): Promise<void>;
}

export interface VoicePorts {
  recordingMode(recording: boolean): Promise<void>;
  play(text: string, signal: AbortSignal, onPlaying: () => void): Promise<void>;
  metric?(name: string, milliseconds: number): void;
  listen(signal: AbortSignal, onText: (text: SpeechText) => void,
    onError: (error: Error) => void): Promise<SpeechCapture>;
}

/** All native transitions share one queue; cancellation invalidates callbacks immediately. */
export class VoiceSession {
  private snapshot: VoiceSnapshot = { mode: 'idle', connecting: false, draft: '', error: null };
  private listeners = new Set<() => void>();
  private tail: Promise<unknown> = Promise.resolve();
  private epoch = new AbortController();
  private capture: SpeechCapture | null = null;
  private finish: Promise<string> | null = null;
  private acceptingSpeech = false;
  private enabled = true;
  private responseId: string | undefined;
  private previousFinish: { response: string | undefined; time: number } | undefined;

  constructor(private readonly ports: VoicePorts) {}

  getSnapshot = () => this.snapshot;
  get active() { return this.enabled; }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(patch: Partial<VoiceSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const task = this.tail.then(work);
    this.tail = task.catch(() => {});
    return task;
  }

  private invalidate() {
    this.epoch.abort();
    this.epoch = new AbortController();
    this.acceptingSpeech = false;
    this.finish = null;
    return this.epoch.signal;
  }

  private async releaseCapture() {
    const capture = this.capture;
    this.capture = null;
    try {
      await capture?.abort();
    } finally {
      await this.ports.recordingMode(false);
    }
  }

  private async failed(error: unknown, signal: AbortSignal) {
    if (signal.aborted) return;
    const cleanupSignal = this.invalidate();
    let message = error instanceof Error ? error.message : 'Voice unavailable. You can keep typing.';
    try { await this.releaseCapture(); } catch { message = 'Audio could not stop. Leave Practice and retry.'; }
    if (!cleanupSignal.aborted) this.update({ mode: 'error', connecting: false, error: message });
  }

  enqueue(text: string, response?: string): Promise<void> {
    if (!this.enabled || this.acceptingSpeech) return Promise.resolve();
    const enqueuedAt = performance.now();
    const first = response === undefined || response !== this.responseId;
    this.responseId = response;
    const signal = this.epoch.signal;
    return this.serial(async () => {
      if (signal.aborted || !this.enabled) return;
      try {
        await this.ports.recordingMode(false);
        const parts = splitUtterance(text);
        for (const [index, part] of parts.entries()) {
          if (signal.aborted) return;
          this.update({ mode: 'speaking', error: null });
          await this.ports.play(part, signal, () => {
            if (signal.aborted) return;
            if (first && index === 0) this.ports.metric?.('T2', performance.now() - enqueuedAt);
            else if (this.previousFinish && this.previousFinish.response === response) {
              this.ports.metric?.(index === 0 ? 'T3_feedback_question' : 'T3_split', performance.now() - this.previousFinish.time);
            }
          });
          if (!signal.aborted) this.previousFinish = { response, time: performance.now() };
        }
        if (!signal.aborted) this.update({ mode: 'idle' });
      } catch (error) {
        await this.failed(error, signal);
      }
    });
  }

  startListening(prefix: string): Promise<void> {
    if (!this.enabled || this.acceptingSpeech) return Promise.resolve();
    const signal = this.invalidate();
    this.acceptingSpeech = true;
    this.update({ mode: 'listening', connecting: true, draft: prefix, error: null });
    return this.serial(async () => {
      if (signal.aborted) return;
      try {
        await this.releaseCapture();
        if (signal.aborted) return;
        await this.ports.recordingMode(true);
        if (signal.aborted) return;
        const capture = await this.ports.listen(signal, (text) => {
          if (!signal.aborted) this.update({ draft: mergeSpeechDraft(prefix, text) });
        }, (error) => {
          if (signal.aborted) return;
          // Queue cleanup behind a pending native start, but cancel its callbacks now.
          const next = this.invalidate();
          void this.serial(() => this.failed(error, next));
        });
        if (signal.aborted) { await capture.abort(); return; }
        this.capture = capture;
        this.update({ mode: this.snapshot.mode === 'finalizing' ? 'finalizing' : 'listening', connecting: false });
      } catch (error) {
        await this.failed(error, signal);
      } finally {
        if (signal.aborted) {
          try { await this.ports.recordingMode(false); }
          catch { this.update({ mode: 'error', connecting: false, error: 'Audio could not stop. Leave Practice and retry.' }); }
        }
      }
    });
  }

  finalize(): Promise<string> {
    if (this.finish) return this.finish;
    if (!this.acceptingSpeech) return Promise.resolve(this.snapshot.draft);
    const signal = this.epoch.signal;
    this.update({ mode: 'finalizing', connecting: false });
    const finish = this.serial(async () => {
      if (signal.aborted) return this.snapshot.draft;
      try {
        // The adapter emits the trailing text through onText before resolving.
        await this.capture?.finalize();
        if (signal.aborted) return this.snapshot.draft;
        this.acceptingSpeech = false;
        await this.releaseCapture();
        if (signal.aborted) return this.snapshot.draft;
        this.epoch.abort();
        this.epoch = new AbortController();
        this.update({ mode: 'idle', connecting: false });
        return this.snapshot.draft;
      } catch (error) {
        await this.failed(error, signal);
        throw error;
      } finally {
        if (this.finish === finish) this.finish = null;
      }
    });
    this.finish = finish;
    return finish;
  }

  abort(): Promise<void> {
    const signal = this.invalidate();
    this.update({ connecting: false });
    return this.serial(async () => {
      try {
        await this.releaseCapture();
        if (!signal.aborted) this.update({ mode: 'idle', error: null });
      } catch (error) {
        if (!signal.aborted) this.update({ mode: 'error', error: error instanceof Error ? error.message : 'Audio could not stop.' });
        throw error;
      }
    });
  }

  suspend(): Promise<void> {
    this.enabled = false;
    return this.abort();
  }

  async activate(): Promise<void> {
    const stopped = this.abort();
    const signal = this.epoch.signal;
    await stopped;
    if (!signal.aborted) this.enabled = true;
  }
}
