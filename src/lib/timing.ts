import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Lightweight span recorder for API request instrumentation.
 *
 * Usage:
 *   const timing = createTimingContext();
 *   timing.start('rag.total');
 *   // ... work ...
 *   timing.end('rag.total');
 *   await writeTimings(supabase, sessionId, exchangeNumber, timing);
 */

export interface TimingSpan {
  name: string;
  startMs: number;
  endMs?: number;
  durationMs?: number;
}

export interface TimingContext {
  start(name: string): void;
  end(name: string): void;
  getSpans(): TimingSpan[];
  toJSON(): Record<string, number | null>;
}

export function createTimingContext(): TimingContext {
  const spans: TimingSpan[] = [];

  return {
    start(name: string) {
      spans.push({ name, startMs: performance.now() });
    },

    end(name: string) {
      // Find the most recent open span with this name (allows nested spans)
      for (let i = spans.length - 1; i >= 0; i--) {
        if (spans[i].name === name && spans[i].endMs === undefined) {
          spans[i].endMs = performance.now();
          spans[i].durationMs = spans[i].endMs! - spans[i].startMs;
          return;
        }
      }
    },

    getSpans() {
      return spans;
    },

    toJSON() {
      const out: Record<string, number | null> = {};
      for (const s of spans) {
        out[s.name] = s.durationMs != null ? Math.round(s.durationMs) : null;
      }
      return out;
    },
  };
}

/**
 * Persist timing spans to the latency_logs.timings JSONB column.
 * Best-effort — errors are logged but never thrown.
 */
export async function writeTimings(
  supabase: SupabaseClient,
  sessionId: string,
  exchangeNumber: number,
  timing: TimingContext
): Promise<void> {
  try {
    const timings = timing.toJSON();
    if (Object.keys(timings).length === 0) return;

    const { error } = await supabase
      .from('latency_logs')
      .insert({
        session_id: sessionId,
        exchange_number: exchangeNumber,
        timings,
      });

    if (error) {
      console.error('writeTimings error:', error.message);
    }
  } catch (err) {
    console.error('writeTimings unexpected error:', err);
  }
}
