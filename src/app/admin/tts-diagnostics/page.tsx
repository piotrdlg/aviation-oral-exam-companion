'use client';

import { useState, useRef, useCallback } from 'react';
import { warmUpAudio, isAudioUnlocked } from '@/lib/audio-unlock';

/**
 * Admin TTS Diagnostics Page
 *
 * Tests the EXACT SAME TTS playback pipeline used by the real app:
 *   fetch('/api/tts') → arrayBuffer → new Blob([ab], {type: 'audio/mpeg'})
 *   → URL.createObjectURL → new Audio(url) → audio.play()
 *
 * This is NOT a theoretical test. If this page produces sound,
 * the app should too. If it doesn't, the same failure is in the app.
 *
 * Tests A-F isolate each layer of the TTS pipeline.
 */

interface TestResult {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'pass' | 'fail';
  detail: string;
  durationMs?: number;
}

const TEST_TEXT = 'Welcome to your oral examination. Today we will be discussing airspace classification and weather minimums. Are you ready to begin?';

export default function TTSDiagnosticsPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const updateResult = useCallback((id: string, update: Partial<TestResult>) => {
    setResults(prev => prev.map(r => r.id === id ? { ...r, ...update } : r));
  }, []);

  const runAllTests = useCallback(async () => {
    // Unlock audio SYNCHRONOUSLY in this click handler — EXACTLY like the app does
    warmUpAudio();

    setRunning(true);
    const tests: TestResult[] = [
      { id: 'A', label: 'Test A: Audio Unlock', status: 'pending', detail: '' },
      { id: 'B', label: 'Test B: /api/tts Server Response', status: 'pending', detail: '' },
      { id: 'C', label: 'Test C: Blob Construction', status: 'pending', detail: '' },
      { id: 'D', label: 'Test D: Audio Element Play (SAME as app)', status: 'pending', detail: '' },
      { id: 'E', label: 'Test E: Sequential Playback (paragraph queue)', status: 'pending', detail: '' },
      { id: 'F', label: 'Test F: Full Pipeline Timing', status: 'pending', detail: '' },
    ];
    setResults(tests);

    // --- Test A: Audio Unlock ---
    const startA = Date.now();
    setResults(prev => prev.map(r => r.id === 'A' ? { ...r, status: 'running' } : r));
    await new Promise(r => setTimeout(r, 200)); // Give play() promise time to resolve
    const unlocked = isAudioUnlocked();
    updateResult('A', {
      status: unlocked ? 'pass' : 'fail',
      detail: unlocked
        ? `Audio unlocked in ${Date.now() - startA}ms. warmUpAudio() succeeded.`
        : `Audio NOT unlocked after ${Date.now() - startA}ms. warmUpAudio() failed — this blocks ALL TTS in the app.`,
      durationMs: Date.now() - startA,
    });

    // --- Test B: /api/tts Server Response ---
    const startB = Date.now();
    setResults(prev => prev.map(r => r.id === 'B' ? { ...r, status: 'running' } : r));
    let arrayBuffer: ArrayBuffer | null = null;
    let serverContentType = '';
    let serverHeaders: Record<string, string> = {};
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: TEST_TEXT }),
      });

      serverContentType = response.headers.get('Content-Type') || 'MISSING';
      serverHeaders = {
        'Content-Type': serverContentType,
        'X-Audio-Encoding': response.headers.get('X-Audio-Encoding') || 'MISSING',
        'X-Audio-Sample-Rate': response.headers.get('X-Audio-Sample-Rate') || 'MISSING',
        'X-TTS-Provider': response.headers.get('X-TTS-Provider') || 'MISSING',
      };

      if (!response.ok) {
        const errBody = await response.text();
        updateResult('B', {
          status: 'fail',
          detail: `HTTP ${response.status}: ${errBody}. The app will also fail here.`,
          durationMs: Date.now() - startB,
        });
      } else {
        arrayBuffer = await response.arrayBuffer();
        const byteLength = arrayBuffer.byteLength;

        if (byteLength === 0) {
          updateResult('B', {
            status: 'fail',
            detail: `HTTP 200 but 0 bytes returned. Headers: ${JSON.stringify(serverHeaders)}`,
            durationMs: Date.now() - startB,
          });
          arrayBuffer = null;
        } else {
          // Check MP3 signature (first 2 bytes should be FF FB or FF F3 or ID3)
          const header = new Uint8Array(arrayBuffer.slice(0, 4));
          const isMP3Sync = (header[0] === 0xFF && (header[1] & 0xE0) === 0xE0);
          const isID3 = (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33); // "ID3"
          const isValidMP3 = isMP3Sync || isID3;

          updateResult('B', {
            status: isValidMP3 ? 'pass' : 'fail',
            detail: `HTTP 200, ${byteLength} bytes, Content-Type: ${serverContentType}, ` +
              `MP3 header: ${Array.from(header).map(b => b.toString(16).padStart(2, '0')).join(' ')}, ` +
              `valid MP3: ${isValidMP3}. Headers: ${JSON.stringify(serverHeaders)}`,
            durationMs: Date.now() - startB,
          });

          if (!isValidMP3) arrayBuffer = null;
        }
      }
    } catch (err) {
      updateResult('B', {
        status: 'fail',
        detail: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - startB,
      });
    }

    // --- Test C: Blob Construction ---
    const startC = Date.now();
    setResults(prev => prev.map(r => r.id === 'C' ? { ...r, status: 'running' } : r));
    let blobUrl: string | null = null;
    if (!arrayBuffer) {
      updateResult('C', { status: 'fail', detail: 'Skipped — Test B failed (no audio data)', durationMs: 0 });
    } else {
      try {
        // EXACT same code as useVoiceProvider.ts:93-94
        const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
        blobUrl = URL.createObjectURL(blob);
        updateResult('C', {
          status: 'pass',
          detail: `Blob created: size=${blob.size}, type=${blob.type}, URL=${blobUrl.substring(0, 40)}...`,
          durationMs: Date.now() - startC,
        });
      } catch (err) {
        updateResult('C', {
          status: 'fail',
          detail: `Blob construction failed: ${err instanceof Error ? err.message : String(err)}`,
          durationMs: Date.now() - startC,
        });
      }
    }

    // --- Test D: Audio Element Play (THE REAL TEST) ---
    const startD = Date.now();
    setResults(prev => prev.map(r => r.id === 'D' ? { ...r, status: 'running' } : r));
    if (!blobUrl) {
      updateResult('D', { status: 'fail', detail: 'Skipped — Test C failed (no blob URL)', durationMs: 0 });
    } else {
      try {
        const audio = new Audio(blobUrl);
        audioRef.current = audio;

        const playResult = await new Promise<{ success: boolean; detail: string }>((resolve) => {
          const timeout = setTimeout(() => {
            resolve({ success: false, detail: 'Timeout — audio.play() did not resolve or reject within 10s' });
          }, 10000);

          audio.onended = () => {
            clearTimeout(timeout);
            URL.revokeObjectURL(blobUrl!);
            resolve({
              success: true,
              detail: `Audio played to completion. Duration: ${audio.duration.toFixed(2)}s. ` +
                `canPlayType('audio/mpeg'): ${audio.canPlayType('audio/mpeg')}`,
            });
          };

          audio.onerror = () => {
            clearTimeout(timeout);
            const mediaErr = audio.error;
            const errDetail = mediaErr
              ? `code=${mediaErr.code} ${mediaErr.message || ''}`
              : 'unknown';
            URL.revokeObjectURL(blobUrl!);
            resolve({
              success: false,
              detail: `audio.onerror fired: ${errDetail}. canPlayType('audio/mpeg'): ${audio.canPlayType('audio/mpeg')}`,
            });
          };

          audio.play()
            .then(() => {
              // play() resolved — wait for onended or onerror
              // Update status to show it's actually playing
              updateResult('D', {
                status: 'running',
                detail: `audio.play() resolved — audio is playing. Waiting for completion...`,
              });
            })
            .catch((err) => {
              clearTimeout(timeout);
              URL.revokeObjectURL(blobUrl!);
              resolve({
                success: false,
                detail: `audio.play() REJECTED: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}. ` +
                  `isAudioUnlocked: ${isAudioUnlocked()}. canPlayType('audio/mpeg'): ${audio.canPlayType('audio/mpeg')}`,
              });
            });
        });

        updateResult('D', {
          status: playResult.success ? 'pass' : 'fail',
          detail: playResult.detail,
          durationMs: Date.now() - startD,
        });
      } catch (err) {
        updateResult('D', {
          status: 'fail',
          detail: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
          durationMs: Date.now() - startD,
        });
      }
    }

    // --- Test E: Sequential Playback (same pattern as paragraph queue) ---
    const startE = Date.now();
    setResults(prev => prev.map(r => r.id === 'E' ? { ...r, status: 'running' } : r));
    try {
      const sentences = ['First sentence.', 'Second sentence.'];
      let played = 0;
      for (const sentence of sentences) {
        // EXACT same path as the paragraph drain loop in practice/page.tsx:797-806
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: sentence }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} for sentence ${played + 1}`);
        const ab = await res.arrayBuffer();
        if (ab.byteLength === 0) throw new Error(`0 bytes for sentence ${played + 1}`);
        const blob = new Blob([ab], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const a = new Audio(url);
        await new Promise<void>((resolve, reject) => {
          a.onended = () => { URL.revokeObjectURL(url); resolve(); };
          a.onerror = () => {
            const me = a.error;
            URL.revokeObjectURL(url);
            reject(new Error(`onerror: code=${me?.code} ${me?.message || ''}`));
          };
          a.play().catch(reject);
        });
        played++;
      }
      updateResult('E', {
        status: 'pass',
        detail: `${played}/${sentences.length} sentences played sequentially`,
        durationMs: Date.now() - startE,
      });
    } catch (err) {
      updateResult('E', {
        status: 'fail',
        detail: `Sequential playback failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - startE,
      });
    }

    // --- Test F: Full Pipeline Timing ---
    const startF = Date.now();
    setResults(prev => prev.map(r => r.id === 'F' ? { ...r, status: 'running' } : r));
    try {
      const t0 = Date.now();
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Timing test for the full TTS pipeline.' }),
      });
      const t1 = Date.now();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ab = await res.arrayBuffer();
      const t2 = Date.now();
      const blob = new Blob([ab], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      const t3 = Date.now();
      await new Promise<void>((resolve, reject) => {
        a.onended = () => { URL.revokeObjectURL(url); resolve(); };
        a.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`onerror: ${a.error?.code}`)); };
        a.play().catch(reject);
      });
      const t4 = Date.now();
      updateResult('F', {
        status: 'pass',
        detail: `Total: ${t4 - t0}ms | fetch: ${t1 - t0}ms | arrayBuffer: ${t2 - t1}ms | ` +
          `Audio setup: ${t3 - t2}ms | playback: ${t4 - t3}ms | bytes: ${ab.byteLength}`,
        durationMs: t4 - t0,
      });
    } catch (err) {
      updateResult('F', {
        status: 'fail',
        detail: `Timing test failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - startF,
      });
    }

    setRunning(false);
  }, [updateResult]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 20px', fontFamily: 'monospace', color: '#e0e0e0', background: '#0a0a0a' }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>TTS Diagnostics — Admin Only</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
        Tests the EXACT same pipeline as the app: fetch /api/tts → arrayBuffer → Blob(audio/mpeg) → Audio → play().
        <br />If Test D passes (you hear sound), the app pipeline is functional. If it fails, the same failure is in the app.
      </p>

      <div style={{ marginBottom: 24, display: 'flex', gap: 12 }}>
        <button
          onClick={runAllTests}
          disabled={running}
          style={{
            padding: '10px 24px', background: running ? '#333' : '#1a7' , color: '#fff',
            border: 'none', borderRadius: 6, cursor: running ? 'default' : 'pointer', fontSize: 14,
          }}
        >
          {running ? 'Running...' : 'Run All Tests (click = gesture context)'}
        </button>
        <button
          onClick={stopAudio}
          style={{ padding: '10px 16px', background: '#a33', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          Stop Audio
        </button>
      </div>

      <div style={{ marginBottom: 16, fontSize: 13, color: '#888' }}>
        Audio unlocked: <strong style={{ color: isAudioUnlocked() ? '#4f4' : '#f44' }}>{isAudioUnlocked() ? 'YES' : 'NO'}</strong>
        {' | '}
        Browser: <strong>{typeof navigator !== 'undefined' ? navigator.userAgent.split(' ').slice(-2).join(' ') : 'unknown'}</strong>
      </div>

      {results.map(r => (
        <div key={r.id} style={{
          marginBottom: 12, padding: 12, borderRadius: 6,
          background: r.status === 'pass' ? '#0a2a0a' : r.status === 'fail' ? '#2a0a0a' : '#1a1a1a',
          border: `1px solid ${r.status === 'pass' ? '#2a5' : r.status === 'fail' ? '#a32' : '#333'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <strong style={{ color: r.status === 'pass' ? '#4f4' : r.status === 'fail' ? '#f44' : '#aaa' }}>
              {r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : r.status === 'running' ? 'RUNNING...' : 'PENDING'}{' '}
              {r.label}
            </strong>
            {r.durationMs !== undefined && <span style={{ color: '#666', fontSize: 12 }}>{r.durationMs}ms</span>}
          </div>
          {r.detail && <div style={{ fontSize: 12, color: '#aaa', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{r.detail}</div>}
        </div>
      ))}

      <div style={{ marginTop: 32, padding: 16, background: '#111', borderRadius: 6, fontSize: 12, color: '#666' }}>
        <strong>What each test does:</strong><br />
        <strong>A</strong> — Checks if warmUpAudio() succeeded (audio unlock for Safari autoplay policy)<br />
        <strong>B</strong> — Fetches /api/tts and checks HTTP status, byte count, MP3 header bytes, Content-Type<br />
        <strong>C</strong> — Creates Blob with explicit audio/mpeg type (same as useVoiceProvider.ts:93)<br />
        <strong>D</strong> — Creates Audio element and calls play() — if you hear sound, the pipeline works<br />
        <strong>E</strong> — Sequential playback of 2 sentences (same as paragraph queue in practice/page.tsx:797-806)<br />
        <strong>F</strong> — Full pipeline with timing breakdown: fetch → arrayBuffer → Blob → Audio → play → end
      </div>
    </div>
  );
}
