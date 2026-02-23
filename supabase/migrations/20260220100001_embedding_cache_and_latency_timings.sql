-- ==========================================================================
-- Migration: Embedding cache table + latency_logs timings JSONB column
-- Created: 2026-02-20
--
-- 1. embedding_cache: keyed by hash(normalized_query) → vector(1536)
--    Avoids redundant OpenAI embedding API calls for repeated/similar queries.
--
-- 2. latency_logs.timings: JSONB column for arbitrary span data
--    The existing INT columns (vad_to_stt_ms, etc.) model the voice pipeline.
--    The new timings column stores fine-grained instrumentation from timing.ts.
-- ==========================================================================

-- 1. Embedding cache
CREATE TABLE IF NOT EXISTS embedding_cache (
  query_hash    TEXT PRIMARY KEY,               -- SHA-256 hex of normalized query
  normalized_query TEXT NOT NULL,               -- original text for debugging
  embedding     VECTOR(1536) NOT NULL,          -- text-embedding-3-small output
  model         TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cleanup (oldest first)
CREATE INDEX idx_embedding_cache_last_used ON embedding_cache (last_used_at);

-- Service-role only (no user RLS needed — this table is accessed server-side only)
ALTER TABLE embedding_cache ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (bypasses RLS anyway), but deny anon/authenticated
CREATE POLICY "embedding_cache_service_only" ON embedding_cache
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Add JSONB timings column to latency_logs
ALTER TABLE latency_logs ADD COLUMN IF NOT EXISTS timings JSONB;

-- 3. Allow service role to insert latency_logs (existing RLS only allows via session ownership)
CREATE POLICY "latency_service_insert" ON latency_logs
  FOR INSERT TO service_role
  USING (true)
  WITH CHECK (true);
