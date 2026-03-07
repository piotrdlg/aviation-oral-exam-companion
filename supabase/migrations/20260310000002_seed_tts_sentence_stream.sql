-- Seed tts_sentence_stream feature flag into system_config.
--
-- When enabled, the exam response delivery uses a structured 3-chunk JSON
-- format (feedback_quick, feedback_detail, question) instead of paragraph
-- splitting. Each chunk is spoken via TTS as soon as it arrives, providing
-- lower perceived latency and tighter text-audio synchronization.
--
-- Default: disabled. Toggle via admin dashboard when ready to activate.

INSERT INTO system_config (key, value, description) VALUES
  ('tts_sentence_stream', '{"enabled": false}', 'Enable structured 3-chunk response delivery with per-chunk TTS streaming')
ON CONFLICT (key) DO NOTHING;
