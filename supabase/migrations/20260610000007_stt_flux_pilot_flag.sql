-- ============================================================
-- Migration: STT Flux pilot flag (W4.3)
-- ============================================================
-- Seeds the default-OFF flag for the Deepgram Flux (/v2/listen) pilot.
-- When enabled, /api/stt/token issues Flux URLs with model-based
-- end-of-turn detection; the client handles the TurnInfo schema.
-- Both URL shapes were live-verified against Deepgram on 2026-06-10
-- (scripts/eval/verify-keyterm-handshake.ts).

INSERT INTO system_config (key, value, description)
VALUES ('stt.flux_pilot', '{"enabled": false}',
        'Pilot: Deepgram Flux (/v2/listen) model-based end-of-turn detection instead of nova-3 + utterance_end_ms. Default OFF.')
ON CONFLICT (key) DO NOTHING;
