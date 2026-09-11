import { describe, expect, it, vi } from 'vitest';
import type { SpeechText } from '../stt-parser';
import { VoiceSession, type VoicePorts } from '../voice-session';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function setup() {
  let onText!: (text: SpeechText) => void;
  const capture = { finalize: vi.fn(async () => ''), abort: vi.fn(async () => {}) };
  const ports: VoicePorts = {
    recordingMode: vi.fn(async () => {}),
    play: vi.fn(async () => {}),
    listen: vi.fn(async (_signal, callback) => { onText = callback; return capture; }),
  };
  const voice = new VoiceSession(ports);
  return { voice, ports, capture, emit: (text: string) => onText({ transcript: text, interim: '' }) };
}

describe('serialized voice session', () => {
  it('plays feedback before the next question', async () => {
    const { voice, ports } = setup();
    const first = deferred<void>();
    vi.mocked(ports.play).mockImplementationOnce(() => first.promise);
    const feedback = voice.enqueue('Feedback');
    const question = voice.enqueue('Question');
    await vi.waitFor(() => expect(ports.play).toHaveBeenCalledTimes(1));
    first.resolve();
    await Promise.all([feedback, question]);
    expect(vi.mocked(ports.play).mock.calls.map(([text]) => text)).toEqual(['Feedback', 'Question']);
  });
  it('never starts playback over listening', async () => {
    const { voice, ports } = setup();
    await voice.startListening('');
    await voice.enqueue('Should not speak');
    expect(ports.play).not.toHaveBeenCalled();
  });
  it('guards same-tick duplicate mic taps', async () => {
    const { voice, ports } = setup();
    await Promise.all([voice.startListening(''), voice.startListening('')]);
    expect(ports.listen).toHaveBeenCalledTimes(1);
  });
  it('cancels playback and clears queued speech before recording', async () => {
    const { voice, ports } = setup();
    const order: string[] = [];
    vi.mocked(ports.play).mockImplementation((_text, signal) => new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => { order.push('stopped'); resolve(); });
    }));
    const first = voice.enqueue('Feedback');
    const next = voice.enqueue('Question');
    await vi.waitFor(() => expect(ports.play).toHaveBeenCalledTimes(1));
    await voice.startListening('');
    await Promise.all([first, next]);
    expect(order).toEqual(['stopped']);
    expect(ports.play).toHaveBeenCalledTimes(1);
    expect(voice.getSnapshot().mode).toBe('listening');
  });
  it('preserves the typed prefix and trailing final on send', async () => {
    const { voice, capture, emit } = setup();
    await voice.startListening('Typed prefix.');
    emit('Recognized speech.');
    capture.finalize.mockImplementation(async () => { emit('Recognized speech. Last words.'); return 'Recognized speech. Last words.'; });
    expect(await voice.finalize()).toBe('Typed prefix. Recognized speech. Last words.');
    expect(voice.getSnapshot().mode).toBe('idle');
  });
  it('shares one finalization for duplicate Send or stop', async () => {
    const { voice, capture } = setup();
    await voice.startListening('');
    await Promise.all([voice.finalize(), voice.finalize()]);
    expect(capture.finalize).toHaveBeenCalledTimes(1);
  });
  it('restores playback mode after capture stops', async () => {
    const { voice, ports, capture } = setup();
    await voice.startListening('');
    await voice.finalize();
    const stopped = capture.abort.mock.invocationCallOrder.at(-1)!;
    const restored = vi.mocked(ports.recordingMode).mock.invocationCallOrder.at(-1)!;
    expect(stopped).toBeLessThan(restored);
    expect(ports.recordingMode).toHaveBeenLastCalledWith(false);
  });
  it('drops late callbacks from the previous attempt', async () => {
    const { voice, ports } = setup();
    await voice.startListening('First');
    const old = vi.mocked(ports.listen).mock.calls[0][1];
    await voice.abort();
    await voice.startListening('Second');
    old({ transcript: 'stale', interim: '' });
    expect(voice.getSnapshot().draft).toBe('Second');
  });
  it('cancels a pending permission/token/socket attempt', async () => {
    const { voice, ports, capture } = setup();
    const pending = deferred<typeof capture>();
    vi.mocked(ports.listen).mockReturnValue(pending.promise);
    const start = voice.startListening('Draft');
    await vi.waitFor(() => expect(ports.listen).toHaveBeenCalled());
    const abort = voice.abort();
    expect(vi.mocked(ports.listen).mock.calls[0][0].aborted).toBe(true);
    pending.resolve(capture);
    await Promise.all([start, abort]);
    expect(capture.abort).toHaveBeenCalled();
    expect(voice.getSnapshot().mode).toBe('idle');
  });
  it('keeps recognized text after lifecycle abort without finalizing', async () => {
    const { voice, capture, emit } = setup();
    await voice.startListening('Prefix');
    emit('recognized');
    await voice.suspend();
    expect(capture.finalize).not.toHaveBeenCalled();
    expect(voice.getSnapshot().draft).toBe('Prefix recognized');
  });
  it('cannot play a late API response while backgrounded', async () => {
    const { voice, ports } = setup();
    await voice.suspend();
    await voice.enqueue('Late API question');
    expect(ports.play).not.toHaveBeenCalled();
    await voice.activate();
    await voice.enqueue('New question');
    expect(ports.play).toHaveBeenCalledTimes(1);
  });
  it('surfaces mode-switch failure and does not open the mic', async () => {
    const { voice, ports } = setup();
    vi.mocked(ports.recordingMode).mockRejectedValueOnce(new Error('Mode failed'));
    await voice.startListening('');
    expect(voice.getSnapshot().mode).toBe('error');
    expect(ports.listen).not.toHaveBeenCalled();
  });
  it('does not reactivate after a newer background event', async () => {
    const { voice, ports } = setup();
    const mode = deferred<void>();
    vi.mocked(ports.recordingMode).mockReturnValueOnce(mode.promise);
    const activate = voice.activate();
    const suspend = voice.suspend();
    mode.resolve();
    await Promise.all([activate, suspend]);
    await voice.enqueue('Late response');
    expect(ports.play).not.toHaveBeenCalled();
    expect(voice.active).toBe(false);
  });
  it('does not cancel a new mic attempt during old finalization cleanup', async () => {
    const { voice, ports } = setup();
    await voice.startListening('Old');
    const mode = deferred<void>();
    vi.mocked(ports.recordingMode).mockReturnValueOnce(mode.promise);
    const finish = voice.finalize();
    await vi.waitFor(() => expect(ports.recordingMode).toHaveBeenCalledTimes(3));
    const start = voice.startListening('New');
    mode.resolve();
    await Promise.all([finish, start]);
    expect(voice.getSnapshot()).toMatchObject({ mode: 'listening', draft: 'New', connecting: false });
    expect(ports.listen).toHaveBeenCalledTimes(2);
  });
});


describe('fresh-response measurement and replay', () => {
  function measured() {
    const s = setup();
    s.ports.metric = vi.fn();
    s.ports.firstPlayback = vi.fn();
    vi.mocked(s.ports.play).mockImplementation(async (_text, _signal, playing) => { playing(); });
    return s;
  }
  it('measures first playback once and the feedback-to-question continuation separately', async () => {
    const { voice, ports } = measured();
    await voice.enqueue('Feedback', 'response-1');
    await voice.enqueue('Next question', 'response-1');
    expect(vi.mocked(ports.metric!).mock.calls.map(([name]) => name)).toEqual(['T2', 'T3_feedback_question']);
    expect(ports.firstPlayback).toHaveBeenCalledTimes(1);
  });
  it.each(['replay', 'resume'] as const)('excludes %s and its long-text splits from T2/T3/E2E', async (source) => {
    const { voice, ports } = measured();
    await voice.enqueue('Original', 'response-1');
    vi.mocked(ports.metric!).mockClear();
    vi.mocked(ports.firstPlayback!).mockClear();
    await voice.enqueue('Long examiner text. '.repeat(250), 'response-1', source);
    expect(ports.metric).not.toHaveBeenCalled();
    expect(ports.firstPlayback).not.toHaveBeenCalled();
  });
  it('allows the unheard background turn to be heard on explicit foreground replay', async () => {
    const { voice, ports } = measured();
    await voice.suspend();
    await voice.enqueue('Arrived in background', 'response-1');
    await voice.activate();
    expect(ports.play).not.toHaveBeenCalled();
    await voice.enqueue('Arrived in background', 'response-1', 'replay');
    expect(ports.play).toHaveBeenCalledTimes(1);
    expect(ports.metric).not.toHaveBeenCalled();
  });
  it('does not count the gap across suspension as a continuation', async () => {
    const { voice, ports } = measured();
    await voice.enqueue('Feedback', 'response-1');
    await voice.suspend();
    await voice.activate();
    vi.mocked(ports.metric!).mockClear();
    await voice.enqueue('Question', 'response-1', 'resume');
    expect(ports.metric).not.toHaveBeenCalled();
  });
});

it('exposes interim speech separately from the retained typed draft', async () => {
  const { voice, ports } = setup();
  await voice.startListening('Typed prefix');
  const onText = vi.mocked(ports.listen).mock.calls[0][1];
  onText({ transcript: 'Final words', interim: 'live partial' });
  expect(voice.getSnapshot()).toMatchObject({ interim: 'live partial', draft: 'Typed prefix Final words live partial' });
  onText({ transcript: 'Final words live partial', interim: '' });
  expect(voice.getSnapshot().interim).toBe('');
  await voice.suspend();
  expect(voice.getSnapshot().draft).toBe('Typed prefix Final words live partial');
});
