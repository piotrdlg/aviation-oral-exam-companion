-- Add persona_id and image fields to voice persona config
UPDATE system_config
SET value = '[
  {"persona_id": "bob_mitchell", "model": "aura-2-orion-en", "label": "Bob Mitchell", "desc": "Friendly veteran DPE everyone recommends", "gender": "M", "image": "/personas/bob-mitchell.webp"},
  {"persona_id": "jim_hayes", "model": "aura-2-zeus-en", "label": "Jim Hayes", "desc": "Younger examiner, methodical", "gender": "M", "image": "/personas/jim-hayes.webp"},
  {"persona_id": "karen_sullivan", "model": "aura-2-athena-en", "label": "Karen Sullivan", "desc": "Warm but thorough, catches everything", "gender": "F", "image": "/personas/karen-sullivan.webp"},
  {"persona_id": "maria_torres", "model": "aura-2-luna-en", "label": "Maria Torres", "desc": "Precise and efficient", "gender": "F", "image": "/personas/maria-torres.webp"}
]'::jsonb
WHERE key = 'voice.user_options';
