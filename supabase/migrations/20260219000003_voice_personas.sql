-- Replace Deepgram model names with fixed DPE persona names.
-- Persona labels stay constant even when admin swaps the underlying TTS model.
UPDATE system_config
SET value = '[
  {"model": "aura-2-orion-en", "label": "Bob Mitchell", "desc": "Friendly veteran DPE everyone recommends", "gender": "M"},
  {"model": "aura-2-zeus-en", "label": "Jim Hayes", "desc": "Younger examiner, methodical", "gender": "M"},
  {"model": "aura-2-athena-en", "label": "Karen Sullivan", "desc": "Warm but thorough, catches everything", "gender": "F"},
  {"model": "aura-2-luna-en", "label": "Maria Torres", "desc": "Precise and efficient", "gender": "F"}
]'::jsonb
WHERE key = 'voice.user_options';
