import { SttParser, type SpeechText } from './stt-parser';
import type { SpeechCapture } from './voice-session';

export interface PcmBuffer { data: ArrayBuffer; sampleRate: number; channels: number }
export interface CapturePorts {
  stream: { start(): Promise<void>; stop(): void | Promise<void> };
  permission(): Promise<{ granted: boolean }>;
  token(signal: AbortSignal): Promise<{ token: string; url: string; flux?: boolean }>;
  setBufferHandler(handler: ((buffer: PcmBuffer) => void) | null): void;
  metric(name: string, milliseconds?: number): void;
}

const abortError = () => new Error('Voice input canceled.');

/** Owns exactly one permission/token/socket/capture attempt. */
export async function startSpeechCapture(
  ports: CapturePorts,
  signal: AbortSignal,
  onText: (text: SpeechText) => void,
  onError: (error: Error) => void,
): Promise<SpeechCapture> {
  if (signal.aborted) throw abortError();
  const startedAt = performance.now();
  const permission = await ports.permission();
  if (signal.aborted) throw abortError();
  if (!permission.granted) throw new Error('Microphone access is off. Enable it in Settings.');
  const grant = await ports.token(signal);
  if (signal.aborted) throw abortError();
  ports.metric('stt_token_ready', performance.now() - startedAt);
  const parser = new SttParser(grant.flux);
  const ws = new WebSocket(grant.url, [grant.token.startsWith('eyJ') ? 'bearer' : 'token', grant.token]);
  let ended = false;
  let finalizing = false;
  let finalizeDone: (() => void) | undefined;
  let rejectConnect: ((error: Error) => void) | undefined;
  let onset: number | undefined;
  let firstResult = false;
  let firstBuffer = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let finishPromise: Promise<string> | undefined;
  let closing: Promise<void> | undefined;

  const close = (): Promise<void> => {
    if (closing) return closing;
    ended = true;
    ports.setBufferHandler(null);
    clearTimeout(timeout);
    clearInterval(keepalive);
    signal.removeEventListener('abort', onAbort);
    rejectConnect?.(abortError());
    finalizeDone?.();
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    closing = (async () => {
      try { ws.close(); } finally { await ports.stream.stop(); }
    })();
    return closing;
  };
  const onAbort = () => { void close().catch(onError); };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    await new Promise<void>((resolve, reject) => {
      rejectConnect = reject;
      timeout = setTimeout(() => reject(new Error('Voice connection timed out. Tap the mic to retry.')), 10_000);
      ws.onopen = () => {
        clearTimeout(timeout);
        rejectConnect = undefined;
        ports.metric('stt_socket_ready', performance.now() - startedAt);
        resolve();
      };
      ws.onmessage = (event) => {
        if (ended || signal.aborted) return;
        const text = parser.push(event.data);
        if (!firstResult && (text.transcript || text.interim)) {
          firstResult = true;
          if (onset !== undefined) ports.metric('T1', performance.now() - onset);
        }
        onText(text);
        if (finalizing) {
          try {
            if (JSON.parse(String(event.data))?.type === 'Metadata') finalizeDone?.();
          } catch { /* Non-JSON control frames do not finish a transcript. */ }
        }
      };
      const dropped = () => {
        if (ended || signal.aborted) return;
        if (finalizing) { finalizeDone?.(); return; }
        const error = new Error('Voice input dropped. Tap the mic to retry.');
        rejectConnect?.(error);
        void close().catch(onError);
        onError(error);
      };
      ws.onerror = dropped;
      ws.onclose = dropped;
    });
    if (signal.aborted || ended) throw abortError();
    const captureAt = performance.now();
    ports.setBufferHandler((buffer) => {
      if (signal.aborted || ended || finalizing || ws.readyState !== WebSocket.OPEN) return;
      if (buffer.sampleRate !== 16000 || buffer.channels !== 1) {
        onError(new Error('This microphone returned an unsupported audio format. Please type your answer.'));
        void close().catch(onError);
        return;
      }
      if (!firstBuffer) {
        firstBuffer = true;
        ports.metric('stt_first_buffer', performance.now() - captureAt);
      }
      if (onset === undefined) {
        const pcm = new DataView(buffer.data);
        let square = 0;
        for (let i = 0; i + 1 < pcm.byteLength; i += 2) square += (pcm.getInt16(i, true) / 32768) ** 2;
        if (Math.sqrt(square / Math.max(1, pcm.byteLength / 2)) >= 0.02) onset = performance.now();
      }
      try { ws.send(buffer.data); } catch {
        onError(new Error('Voice input disconnected. Please retry.'));
        void close().catch(onError);
      }
    });
    await ports.stream.start();
    if (signal.aborted || ended) {
      // An abort can arrive while native start is pending. Stop again after it settles.
      await ports.stream.stop();
      throw abortError();
    }
    keepalive = setInterval(() => {
      if (!ended && !finalizing && ws.readyState === WebSocket.OPEN && !grant.flux) {
        try { ws.send(JSON.stringify({ type: 'KeepAlive' })); } catch { onAbort(); }
      }
    }, 4000);
  } catch (error) {
    await close();
    throw error;
  }

  return {
    abort: close,
    finalize() {
      if (finishPromise) return finishPromise;
      finishPromise = (async () => {
        if (ended) return [parser.text.transcript, parser.text.interim].filter(Boolean).join(' ');
        finalizing = true;
        ports.setBufferHandler(null);
        clearInterval(keepalive);
        await ports.stream.stop();
        if (!ended && !signal.aborted && ws.readyState === WebSocket.OPEN) {
          await new Promise<void>((resolve) => {
            finalizeDone = resolve;
            timeout = setTimeout(() => {
              ports.metric('stt_finalize_timeout');
              resolve();
            }, 1500);
            try { ws.send(JSON.stringify({ type: 'CloseStream' })); } catch { resolve(); }
          });
        }
        const text = parser.text;
        if (!signal.aborted) onText(text);
        await close();
        return [text.transcript, text.interim].filter(Boolean).join(' ');
      })();
      return finishPromise;
    },
  };
}
