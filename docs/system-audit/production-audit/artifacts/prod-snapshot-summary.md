# PROD Database Snapshot

Taken: 2026-02-25T01:58:03.482Z
Project: pvuiwwqsumoqjepukjhz

## System Config Flags
| Key | Value | Description |
|-----|-------|-------------|
| kill_switch.anthropic | `{"enabled":false}` | Disable Anthropic API calls |
| kill_switch.openai | `{"enabled":false}` | Disable OpenAI API calls |
| kill_switch.deepgram | `{"enabled":false}` | Disable Deepgram API calls |
| kill_switch.cartesia | `{"enabled":false}` | Disable Cartesia API calls |
| kill_switch.tier.ground_school | `{"enabled":false}` | Disable ground_school tier |
| kill_switch.tier.checkride_prep | `{"enabled":false}` | Disable checkride_prep tier |
| kill_switch.tier.dpe_live | `{"enabled":false}` | Disable dpe_live tier |
| maintenance_mode | `{"enabled":false,"message":""}` | Global maintenance mode |
| user_hard_caps | `{"daily_tts_chars":50000,"daily_llm_tokens":100000,"daily_st` | Per-user daily hard caps |
| app.environment | `{"name":"production"}` |  |
| voice.user_options | `[{"desc":"Younger examiner, methodical","image":"/personas/j` | Admin-curated Deepgram voice options shown to users. Array of {model, label}. |
| graph.shadow_mode | `{"enabled":true}` | Log graph retrieval in parallel without affecting output |
| graph.enhanced_retrieval | `{"enabled":true}` | Merge graph concept bundle into RAG context |
| tts.openai | `{"model":"tts-1","speed":1,"voice":"onyx"}` | OpenAI TTS settings (Tier 1: Ground School). Voice: onyx/alloy/echo/fable/nova/shimmer. Model: tts-1/tts-1-hd. Speed: 0.25-4.0. |
| tts.deepgram | `{"model":"aura-2-orion-en","encoding":"linear16","sample_rat` | Deepgram Aura-2 TTS settings (Tier 2: Checkride Prep). Model = voice selection. Encoding: linear16/mp3/opus/flac/aac. |
| tts.cartesia | `{"model":"sonic-3","speed":0.95,"volume":1,"emotion":"confid` | Cartesia Sonic 3 TTS settings (Tier 3: DPE Live). Speed: 0.6-1.5. Volume: 0.5-2.0. Emotion: confident/calm/neutral/determined/etc. |

## Row Counts
| Table | Count |
|-------|-------|
| source_documents | 172 |
| source_chunks | 4674 |
| source_images | 1596 |
| chunk_image_links | 7460 |
| embedding_cache | 84 |
| latency_logs | 83 |
| concepts | 22075 |
| concept_relations | 45728 |
| concept_chunk_evidence | 30689 |
| acs_tasks | 143 |
| acs_elements | 2174 |
| exam_sessions | 70 |
| session_transcripts | 720 |
| element_attempts | 306 |
| prompt_versions | 24 |
| user_profiles | 11 |
| usage_logs | 1355 |
| transcript_citations | 1555 |
| active_sessions | 19 |
| off_graph_mentions | 0 |
| admin_users | 1 |

## Coverage Metrics
| Metric | Value |
|--------|-------|
| chunks_with_embedding | 4624 |
| chunks_with_page_start | 0 |
| embedding_cache_reused | 0 |
| concepts_with_embedding | 22075 |
| sessions_active | 21 |
| sessions_completed | 14 |
| sessions_paused | 8 |
| sessions_expired | 0 |
| sessions_abandoned | 27 |

## Concepts by Category
| Category | Count |
|----------|-------|
| acs_area | 31 |
| acs_element | 969 |

## Relations by Type
| Relation Type | Count |
|---------------|-------|
| is_component_of | 1000 |

## RPC Presence
| Function | Status |
|----------|--------|
| chunk_hybrid_search | false |
| get_images_for_chunks | false |
| get_element_scores | false |
| get_session_element_scores | false |
| get_related_concepts | false |
| hybrid_search | false |
| get_concept_bundle | false |
| get_uncovered_acs_tasks | false |
| get_orphan_concepts | false |
