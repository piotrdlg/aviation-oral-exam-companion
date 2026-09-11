import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startSpeechCapture, type CapturePorts } from '../stt-capture';

class Socket {
  static OPEN = 1;
  static sockets: Socket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send = vi.fn();
  constructor() { Socket.sockets.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  close() { this.readyState = 3; this.onclose?.(); }
  message(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
}

function setup() {
  const ports: CapturePorts = {
    stream: { start: vi.fn(async () => {}), stop: vi.fn() },
    permission: vi.fn(async () => ({ granted: true })),
    token: vi.fn(async () => ({ token: 'eyJtest', url: 'wss://test.invalid' })),
    setBufferHandler: vi.fn(), metric: vi.fn(),
  };
  const abort = new AbortController();
  const onText = vi.fn();
  const onError = vi.fn();
  const open = async () => {
    const pending = startSpeechCapture(ports, abort.signal, onText, onError);
    await vi.waitFor(() => expect(Socket.sockets).toHaveLength(1));
    const socket = Socket.sockets[0];
    socket.open();
    return { capture: await pending, socket };
  };
  return { ports, abort, onText, onError, open };
}

beforeEach(() => { Socket.sockets = []; vi.stubGlobal('WebSocket', Socket); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('native speech adapter protocol', () => {
  it('keeps the socket open for trailing final words', async () => {
    const { open, onText } = setup();
    const { capture, socket } = await open();
    const final = capture.finalize();
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.send).toHaveBeenCalledWith('{"type":"CloseStream"}');
    expect(socket.readyState).toBe(1);
    socket.message({ type: 'Results', is_final: true, start: 0, duration: 1, channel: { alternatives: [{ transcript: 'Last words' }] } });
    socket.message({ type: 'Metadata' });
    expect(await final).toBe('Last words');
    expect(onText).toHaveBeenLastCalledWith({ transcript: 'Last words', interim: '' });
    expect(socket.readyState).toBe(3);
  });
  it('bounds finalization at 1500ms and retains the recognized draft', async () => {
    const { open, ports } = setup();
    const { capture, socket } = await open();
    socket.message({ type: 'Results', is_final: false, channel: { alternatives: [{ transcript: 'Unfinalized words' }] } });
    const final = capture.finalize();
    await vi.advanceTimersByTimeAsync(1500);
    expect(await final).toBe('Unfinalized words');
    expect(ports.metric).toHaveBeenCalledWith('stt_finalize_timeout');
  });
  it('lifecycle abort closes immediately and drops late messages', async () => {
    const { open, abort, onText, ports } = setup();
    const { socket } = await open();
    abort.abort();
    expect(socket.readyState).toBe(3);
    expect(ports.stream.stop).toHaveBeenCalled();
    socket.message({ type: 'Results', channel: { alternatives: [{ transcript: 'stale' }] } });
    expect(onText).not.toHaveBeenCalled();
  });
  it('does not request a token after canceled permission', async () => {
    const { ports, abort, onText, onError } = setup();
    abort.abort();
    await expect(startSpeechCapture(ports, abort.signal, onText, onError)).rejects.toThrow('canceled');
    expect(ports.token).not.toHaveBeenCalled();
    expect(ports.stream.start).not.toHaveBeenCalled();
  });
  it('releases capture when the socket drops', async () => {
    const { open, ports, onError } = setup();
    const { socket } = await open();
    socket.close();
    expect(ports.stream.stop).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
  it('stops again if abort races with native start', async () => {
    const { ports, abort, open } = setup();
    let resolve!: () => void;
    vi.mocked(ports.stream.start).mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    const pending = open();
    const rejected = expect(pending).rejects.toThrow('canceled');
    await vi.waitFor(() => expect(ports.stream.start).toHaveBeenCalled());
    abort.abort();
    resolve();
    await rejected;
    expect(ports.stream.stop).toHaveBeenCalledTimes(2);
  });
  it('awaits a native stop already started by lifecycle cancellation', async () => {
    const { ports, abort, open } = setup();
    const { capture } = await open();
    let resolve!: () => void;
    vi.mocked(ports.stream.stop).mockReturnValue(new Promise<void>((done) => { resolve = done; }));
    abort.abort();
    let done = false;
    const stopping = capture.abort().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    resolve();
    await stopping;
    expect(done).toBe(true);
    expect(ports.stream.stop).toHaveBeenCalledTimes(1);
  });
});
