import 'server-only';

/**
 * Lightweight span recorder for end-to-end latency instrumentation.
 *
 * Usage:
 *   const t = createTimingContext();
 *   t.start('rag.embedding');
 *   await generateEmbedding(query);
 *   t.end('rag.embedding');
 *   // … later:
 *   await writeTimings(serviceSupabase, sessionId, exchangeNumber, t);
 *
 * Safe for serverless: no shared state across invocations.
 */

export interface TimingSpan {
  name: string;
  startMs: number;
  endMs?: number;
  durationMs?: number;
}

export interface TimingContext {
  /** Begin a named span. */
  start(name: string): void;
  /** End a previously started span. No-op if the span was never started. */
  end(name: string): void;
  /** Return all recorded spans. */
  getSpans(): ReadonlyArray<TimingSpan>;
  /** Flatten to a JSON-safe object: { spanName: durationMs | null, … } */
  toJSON(): Record<string, number | null>;
}

export function createTimingContext(): TimingContext {
  const spans: TimingSpan[] = [];

  return {
    start(name: string) {
      spans.push({ name, startMs: performance.now() });
    },

    end(name: string) {
      // Find the *last* open span with this name (allows nested/repeated spans)
      for (let i = spans.length - 1; i >= 0; i--) {
        if (spans[i].name === name && spans[i].endMs === undefined) {
          spans[i].endMs = performance.now();
          spans[i].durationMs = spans[i].endMs! - spans[i].startMs;
          return;
        }
      }
      // Span not found — silently ignore (defensive)
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
 * Persist timing data to the latency_logs table.
 *
 * The existing table has typed INT columns (vad_to_stt_ms, stt_duration_ms, etc.)
 * that map to the voice pipeline. We add a new JSONB `timings` column (via migration)
 * for arbitrary span data so instrumentation isn't blocked by schema changes.
 *
 * Non-blocking: errors are logged, never thrown.
 */
export async function writeTimings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceSupabase: any,
  sessionId: string,
  exchangeNumber: number,
  ctx: TimingContext
): Promise<void> {
  try {
    const timingsJson = ctx.toJSON();
    // Compute total pipeline time from the recorded spans
    const totalMs = timingsJson['exchange.total'] ?? null;

    const { error } = await serviceSupabase
      .from('latency_logs')
      .insert({
        session_id: sessionId,
        exchange_number: exchangeNumber,
        total_pipeline_ms: totalMs,
        timings: timingsJson,
      });

    if (error) {
      console.error('writeTimings: insert failed –', error.message);
    }
  } catch (err) {
    console.error('writeTimings: unexpected error –', err);
  }
}
