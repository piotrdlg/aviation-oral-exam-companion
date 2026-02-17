-- Seed TTS provider configuration into system_config
-- These are read by TTS providers at runtime (priority: system_config > env var > hardcoded default)

INSERT INTO system_config (key, value, description) VALUES
  ('tts.openai', '{
    "voice": "onyx",
    "model": "tts-1",
    "speed": 1.0
  }', 'OpenAI TTS settings (Tier 1: Ground School). Voice: onyx/alloy/echo/fable/nova/shimmer. Model: tts-1/tts-1-hd. Speed: 0.25-4.0.'),

  ('tts.deepgram', '{
    "model": "aura-2-orion-en",
    "sample_rate": 48000,
    "encoding": "linear16"
  }', 'Deepgram Aura-2 TTS settings (Tier 2: Checkride Prep). Model = voice selection. Encoding: linear16/mp3/opus/flac/aac.'),

  ('tts.cartesia', '{
    "model": "sonic-3",
    "voice_id": "95856005-0332-41b0-935f-352e296aa0df",
    "voice_name": "Hugo — Teatime Friend (British)",
    "speed": 0.95,
    "volume": 1.0,
    "emotion": "confident",
    "sample_rate": 48000
  }', 'Cartesia Sonic 3 TTS settings (Tier 3: DPE Live). Speed: 0.6-1.5. Volume: 0.5-2.0. Emotion: confident/calm/neutral/determined/etc.')
ON CONFLICT (key) DO NOTHING;
