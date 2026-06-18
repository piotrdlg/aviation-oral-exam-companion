-- ============================================================
-- Migration: consent_records — allow kind 'ai_data_processing'
-- ============================================================
-- The native onboarding flow records a SECOND, separate consent before the
-- first exam: an explicit third-party-AI data-processing consent
-- (kind 'ai_data_processing', choices {third_party_ai_v1: true}) naming the
-- processors spoken answers/transcripts are sent to — Anthropic (examiner LLM),
-- Deepgram (STT + TTS), OpenAI (TTS fallback). Apple Guideline 5.1.1/5.1.2 +
-- docs/mobile/05-APPLE-COMPLIANCE.md §10 require it before any audio leaves the
-- device. The original CHECK only allowed 'cookie'/'disclaimer'.
--
-- This is distinct from the FAA-examiner 'disclaimer' consent and writes a
-- consent_records row only (no disclaimer_acknowledged_at stamp).

ALTER TABLE consent_records DROP CONSTRAINT IF EXISTS consent_records_kind_check;

ALTER TABLE consent_records
  ADD CONSTRAINT consent_records_kind_check
  CHECK (kind IN ('cookie', 'disclaimer', 'ai_data_processing'));
