'use client';

import { useState, useRef } from 'react';

interface TestResult {
  status: 'idle' | 'running' | 'pass' | 'fail';
  detail: string;
  timing?: number;
}

const WORKLET_URL = '/audio-worklet/pcm-playback-processor.js?v=3';

export default function VoiceLab() {
  const [workletTest, setWorkletTest] = useState<TestResult>({ status: 'idle', detail: '' });
  const [ttsWorkletTest, setTtsWorkletTest] = useState<TestResult>({ status: 'idle', detail: '' });
  const [ttsBufferTest, setTtsBufferTest] = useState<TestResult>({ status: 'idle', detail: '' });
  const [sttTest, setSttTest] = useState<TestResult>({ status: 'idle', detail: '' });
  const [sysInfo, setSysInfo] = useState('');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  // ── Test 1: AudioWorklet Health ──
  async function testWorklet() {
    setWorkletTest({ status: 'running', detail: 'Loading AudioWorklet module...' });
    const t0 = performance.now();

    try {
      // Create fresh AudioContext
      if (audioCtxRef.current) await audioCtxRef.current.close().catch(() => {});
      const ctx = new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = ctx;
      const actualRate = ctx.sampleRate;

      setWorkletTest({ status: 'running', detail: `AudioContext created (sampleRate=${actualRate}). Loading worklet...` });

      await ctx.audioWorklet.addModule(WORKLET_URL);
      const loadTime = Math.round(performance.now() - t0);

      setWorkletTest({ status: 'running', detail: `Module loaded in ${loadTime}ms. Sending config...` });

      const node = new AudioWorkletNode(ctx, 'pcm-playback-processor');
      node.connect(ctx.destination);
      workletNodeRef.current = node;

      // Wait for config ACK
      const ackReceived = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 5000);
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'configured') {
            clearTimeout(timeout);
            node.port.removeEventListener('message', handler);
            resolve(true);
          }
        };
        node.port.addEventListener('message', handler);
        node.port.postMessage({ type: 'config', sourceRate: actualRate });
      });

      if (!ackReceived) {
        setWorkletTest({
          status: 'fail',
          detail: `Module loaded in ${loadTime}ms but config ACK NEVER received. The cached worklet may be stale. Try hard-refresh (Cmd+Shift+R).`,
          timing: loadTime,
        });
        return;
      }

      const configTime = Math.round(performance.now() - t0);
      setWorkletTest({ status: 'running', detail: `Config ACK received in ${configTime}ms. Playing test tone...` });

      // Generate a 0.5s 440Hz test tone
      const toneSamples = actualRate / 2; // 0.5 seconds
      const tone = new Float32Array(toneSamples);
      for (let i = 0; i < toneSamples; i++) {
        tone[i] = 0.3 * Math.sin(2 * Math.PI * 440 * i / actualRate);
      }

      // Send in chunks to simulate streaming
      const chunkSize = 4096;
      for (let offset = 0; offset < tone.length; offset += chunkSize) {
        const chunk = tone.slice(offset, offset + chunkSize);
        node.port.postMessage(chunk, [chunk.buffer]);
      }

      // Wait for drain
      await new Promise<void>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'drain') {
            node.port.removeEventListener('message', handler);
            resolve();
          }
        };
        node.port.addEventListener('message', handler);
        setTimeout(resolve, 3000); // safety timeout
      });

      if (ctx.state === 'suspended') await ctx.resume();

      const totalTime = Math.round(performance.now() - t0);
      setWorkletTest({
        status: 'pass',
        detail: `AudioWorklet OK! Load=${loadTime}ms, Config ACK=${configTime}ms, Total=${totalTime}ms. Device rate=${actualRate}Hz. You should have heard a short beep.`,
        timing: totalTime,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setWorkletTest({ status: 'fail', detail: `AudioWorklet failed: ${msg}` });
    }
  }

  // ── Test 2: TTS via AudioWorklet (Strategy A) ──
  async function testTtsWorklet() {
    setTtsWorkletTest({ status: 'running', detail: 'Fetching TTS audio...' });
    const t0 = performance.now();

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'This is a test of the voice pipeline. Can you hear me clearly?' }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || `HTTP ${res.status}`);
      }

      const encoding = res.headers.get('X-Audio-Encoding') || 'mp3';
      const sampleRate = parseInt(res.headers.get('X-Audio-Sample-Rate') || '48000', 10);
      const provider = res.headers.get('X-TTS-Provider') || 'unknown';
      const ttfb = Math.round(performance.now() - t0);

      setTtsWorkletTest({ status: 'running', detail: `TTFB=${ttfb}ms (${provider}, ${encoding}, ${sampleRate}Hz). Streaming to AudioWorklet...` });

      if (encoding === 'mp3') {
        // MP3 doesn't go through worklet — use decodeAudioData
        const arrayBuffer = await res.arrayBuffer();
        const ctx = new AudioContext();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        await new Promise<void>((resolve) => {
          source.onended = () => { ctx.close(); resolve(); };
          source.start();
        });
        const total = Math.round(performance.now() - t0);
        setTtsWorkletTest({ status: 'pass', detail: `MP3 played via decodeAudioData. TTFB=${ttfb}ms, Total=${total}ms (${provider})`, timing: total });
        return;
      }

      // PCM: stream through AudioWorklet
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext({ sampleRate: 48000 });
        await audioCtxRef.current.audioWorklet.addModule(WORKLET_URL);
        const node = new AudioWorkletNode(audioCtxRef.current, 'pcm-playback-processor');
        node.connect(audioCtxRef.current.destination);
        workletNodeRef.current = node;
      }

      const ctx = audioCtxRef.current!;
      const node = workletNodeRef.current!;
      if (ctx.state === 'suspended') await ctx.resume();

      // Config and wait for ACK
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Worklet config timeout')), 5000);
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'configured') {
            clearTimeout(timeout);
            node.port.removeEventListener('message', handler);
            resolve();
          }
        };
        node.port.addEventListener('message', handler);
        node.port.postMessage({ type: 'config', sourceRate: sampleRate });
      });

      const bytesPerSample = encoding === 'linear16' ? 2 : 4;
      const body = res.body;
      if (!body) throw new Error('No response body');
      const reader = body.getReader();
      let remainder: Uint8Array | null = null;
      let firstChunkTime = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!firstChunkTime) firstChunkTime = performance.now() - t0;

        let chunk: Uint8Array = value;
        if (remainder) {
          const merged = new Uint8Array(remainder.length + chunk.length);
          merged.set(remainder);
          merged.set(chunk, remainder.length);
          chunk = merged;
          remainder = null;
        }

        const rem = chunk.length % bytesPerSample;
        if (rem > 0) {
          remainder = chunk.slice(chunk.length - rem);
          chunk = chunk.slice(0, chunk.length - rem);
        }
        if (chunk.length === 0) continue;

        let float32: Float32Array;
        if (encoding === 'linear16') {
          const int16 = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.byteLength >> 1);
          float32 = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
        } else {
          float32 = new Float32Array(chunk.byteLength >> 2);
          const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
          for (let i = 0; i < float32.length; i++) float32[i] = view.getFloat32(i * 4, true);
        }

        node.port.postMessage(float32, [float32.buffer]);
      }
      reader.releaseLock();

      // Wait for drain
      await new Promise<void>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'drain') {
            node.port.removeEventListener('message', handler);
            resolve();
          }
        };
        node.port.addEventListener('message', handler);
        setTimeout(resolve, 30000);
      });

      const total = Math.round(performance.now() - t0);
      setTtsWorkletTest({
        status: 'pass',
        detail: `PCM via AudioWorklet OK! TTFB=${ttfb}ms, FirstChunk=${Math.round(firstChunkTime)}ms, Total=${total}ms (${provider}, ${encoding}, ${sampleRate}Hz)`,
        timing: total,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setTtsWorkletTest({ status: 'fail', detail: `TTS Worklet failed: ${msg}` });
    }
  }

  // ── Test 3: TTS via AudioBufferSource (Strategy B — fallback) ──
  async function testTtsBuffer() {
    setTtsBufferTest({ status: 'running', detail: 'Fetching TTS audio (will buffer entire response)...' });
    const t0 = performance.now();

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'This is the buffer playback test. Does this sound clear?' }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || `HTTP ${res.status}`);
      }

      const encoding = res.headers.get('X-Audio-Encoding') || 'mp3';
      const sampleRate = parseInt(res.headers.get('X-Audio-Sample-Rate') || '48000', 10);
      const provider = res.headers.get('X-TTS-Provider') || 'unknown';
      const arrayBuffer = await res.arrayBuffer();
      const ttfb = Math.round(performance.now() - t0);
      const sizeKB = Math.round(arrayBuffer.byteLength / 1024);

      setTtsBufferTest({ status: 'running', detail: `Buffered ${sizeKB}KB in ${ttfb}ms (${provider}, ${encoding}, ${sampleRate}Hz). Playing...` });

      const ctx = new AudioContext({ sampleRate });

      if (encoding === 'mp3') {
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        await new Promise<void>((resolve) => {
          source.onended = () => { ctx.close(); resolve(); };
          source.start();
        });
      } else {
        let float32: Float32Array;
        if (encoding === 'linear16') {
          const int16 = new Int16Array(arrayBuffer);
          float32 = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
        } else {
          float32 = new Float32Array(arrayBuffer);
        }

        const audioBuffer = ctx.createBuffer(1, float32.length, sampleRate);
        audioBuffer.getChannelData(0).set(float32);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        await new Promise<void>((resolve) => {
          source.onended = () => { ctx.close(); resolve(); };
          source.start();
        });
      }

      const total = Math.round(performance.now() - t0);
      setTtsBufferTest({
        status: 'pass',
        detail: `Buffer playback OK! BufferTime=${ttfb}ms, Size=${sizeKB}KB, Total=${total}ms (${provider}, ${encoding}, ${sampleRate}Hz)`,
        timing: total,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setTtsBufferTest({ status: 'fail', detail: `Buffer playback failed: ${msg}` });
    }
  }

  // ── Test 4: STT WebSocket Connection ──
  async function testStt() {
    setSttTest({ status: 'running', detail: 'Fetching STT token...' });
    const t0 = performance.now();

    try {
      const tokenRes = await fetch('/api/stt/token');
      const tokenTime = Math.round(performance.now() - t0);

      if (!tokenRes.ok) {
        const errData = await tokenRes.json().catch(() => ({}));
        throw new Error(errData.error || `Token HTTP ${tokenRes.status}`);
      }

      const tokenData = await tokenRes.json();
      const tokenPreview = tokenData.token ? `${tokenData.token.slice(0, 20)}...` : 'MISSING';

      setSttTest({ status: 'running', detail: `Token fetched in ${tokenTime}ms (${tokenPreview}). Connecting WebSocket...` });

      const wsUrl = `${tokenData.url}&encoding=linear16&sample_rate=48000&channels=1`;

      // Try Sec-WebSocket-Protocol auth
      const result = await new Promise<{ connected: boolean; closeCode?: number; closeReason?: string; error?: string }>((resolve) => {
        try {
          const ws = new WebSocket(wsUrl, ['token', tokenData.token]);
          const timeout = setTimeout(() => {
            ws.close();
            resolve({ connected: false, error: 'Connection timeout (8s)' });
          }, 8000);

          ws.onopen = () => {
            clearTimeout(timeout);
            // Send close immediately — we just wanted to test auth
            ws.send(JSON.stringify({ type: 'CloseStream' }));
            setTimeout(() => ws.close(), 500);
            resolve({ connected: true });
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            resolve({ connected: false, error: 'WebSocket error (check browser console)' });
          };

          ws.onclose = (event) => {
            clearTimeout(timeout);
            if (!event.wasClean && event.code !== 1000) {
              resolve({ connected: false, closeCode: event.code, closeReason: event.reason || 'No reason' });
            }
          };
        } catch (err) {
          resolve({ connected: false, error: err instanceof Error ? err.message : 'Unknown error' });
        }
      });

      const totalTime = Math.round(performance.now() - t0);

      if (result.connected) {
        setSttTest({
          status: 'pass',
          detail: `STT WebSocket connected! TokenTime=${tokenTime}ms, Total=${totalTime}ms. Auth via Sec-WebSocket-Protocol works.`,
          timing: totalTime,
        });
      } else {
        const reason = result.error || `Close code: ${result.closeCode}, reason: ${result.closeReason}`;
        setSttTest({
          status: 'fail',
          detail: `STT WebSocket FAILED. TokenTime=${tokenTime}ms. ${reason}. Token preview: ${tokenPreview}`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setSttTest({ status: 'fail', detail: `STT test failed: ${msg}` });
    }
  }

  // ── System Info ──
  function collectSysInfo() {
    const info: string[] = [];
    info.push(`Browser: ${navigator.userAgent}`);
    info.push(`Platform: ${navigator.platform}`);
    try {
      const ctx = new AudioContext();
      info.push(`AudioContext.sampleRate: ${ctx.sampleRate}`);
      info.push(`AudioContext.state: ${ctx.state}`);
      ctx.close();
    } catch (e) {
      info.push(`AudioContext: ${e instanceof Error ? e.message : 'Failed'}`);
    }
    info.push(`Worklet URL: ${WORKLET_URL}`);
    info.push(`Date: ${new Date().toISOString()}`);

    // Add test results
    info.push('');
    info.push('--- Test Results ---');
    info.push(`AudioWorklet: ${workletTest.status} — ${workletTest.detail}`);
    info.push(`TTS Worklet: ${ttsWorkletTest.status} — ${ttsWorkletTest.detail}`);
    info.push(`TTS Buffer: ${ttsBufferTest.status} — ${ttsBufferTest.detail}`);
    info.push(`STT Auth: ${sttTest.status} — ${sttTest.detail}`);

    const text = info.join('\n');
    setSysInfo(text);
    navigator.clipboard.writeText(text).catch(() => {});
  }

  const statusBadge = (r: TestResult) => {
    const colors = {
      idle: 'bg-gray-700 text-gray-400',
      running: 'bg-yellow-900/50 text-yellow-400 animate-pulse',
      pass: 'bg-green-900/50 text-green-400',
      fail: 'bg-red-900/50 text-red-400',
    };
    const labels = { idle: 'Not Run', running: 'Running...', pass: 'PASS', fail: 'FAIL' };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${colors[r.status]}`}>
        {labels[r.status]}
        {r.timing ? ` (${r.timing}ms)` : ''}
      </span>
    );
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <h2 className="text-lg font-medium text-white mb-1">Voice Pipeline Lab</h2>
      <p className="text-sm text-gray-400 mb-5">
        Test each component of the voice pipeline independently. Run tests top-to-bottom.
      </p>

      <div className="space-y-4">
        {/* Test 1: AudioWorklet */}
        <div className="border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-medium text-white">1. AudioWorklet Health</h3>
              <p className="text-xs text-gray-500">Load module, config ACK, test tone playback</p>
            </div>
            {statusBadge(workletTest)}
          </div>
          {workletTest.detail && (
            <p className={`text-xs mb-2 ${workletTest.status === 'fail' ? 'text-red-300' : 'text-gray-400'}`}>
              {workletTest.detail}
            </p>
          )}
          <button
            onClick={testWorklet}
            disabled={workletTest.status === 'running'}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs rounded font-medium transition-colors"
          >
            Run Test
          </button>
        </div>

        {/* Test 2: TTS via AudioWorklet */}
        <div className="border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-medium text-white">2. TTS via AudioWorklet (Strategy A)</h3>
              <p className="text-xs text-gray-500">Streaming PCM playback — lowest latency</p>
            </div>
            {statusBadge(ttsWorkletTest)}
          </div>
          {ttsWorkletTest.detail && (
            <p className={`text-xs mb-2 ${ttsWorkletTest.status === 'fail' ? 'text-red-300' : 'text-gray-400'}`}>
              {ttsWorkletTest.detail}
            </p>
          )}
          <button
            onClick={testTtsWorklet}
            disabled={ttsWorkletTest.status === 'running'}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs rounded font-medium transition-colors"
          >
            Run Test
          </button>
        </div>

        {/* Test 3: TTS via Buffer */}
        <div className="border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-medium text-white">3. TTS via Buffer Playback (Strategy B)</h3>
              <p className="text-xs text-gray-500">Buffer entire response, then play — reliable fallback</p>
            </div>
            {statusBadge(ttsBufferTest)}
          </div>
          {ttsBufferTest.detail && (
            <p className={`text-xs mb-2 ${ttsBufferTest.status === 'fail' ? 'text-red-300' : 'text-gray-400'}`}>
              {ttsBufferTest.detail}
            </p>
          )}
          <button
            onClick={testTtsBuffer}
            disabled={ttsBufferTest.status === 'running'}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs rounded font-medium transition-colors"
          >
            Run Test
          </button>
        </div>

        {/* Test 4: STT Auth */}
        <div className="border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-medium text-white">4. Deepgram STT Connection</h3>
              <p className="text-xs text-gray-500">Token fetch + WebSocket auth handshake</p>
            </div>
            {statusBadge(sttTest)}
          </div>
          {sttTest.detail && (
            <p className={`text-xs mb-2 ${sttTest.status === 'fail' ? 'text-red-300' : 'text-gray-400'}`}>
              {sttTest.detail}
            </p>
          )}
          <button
            onClick={testStt}
            disabled={sttTest.status === 'running'}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs rounded font-medium transition-colors"
          >
            Run Test
          </button>
        </div>
      </div>

      {/* System Info + Copy */}
      <div className="mt-5 pt-4 border-t border-gray-800">
        <button
          onClick={collectSysInfo}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded font-medium transition-colors"
        >
          Copy Diagnostics to Clipboard
        </button>
        {sysInfo && (
          <pre className="mt-3 p-3 bg-gray-950 rounded text-xs text-gray-400 overflow-x-auto max-h-40 overflow-y-auto">
            {sysInfo}
          </pre>
        )}
      </div>
    </div>
  );
}
