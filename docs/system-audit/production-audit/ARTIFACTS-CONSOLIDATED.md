---
title: "Production Audit Artifacts — Consolidated"
date: 2026-02-24
type: audit-artifacts
tags: [audit, artifacts, database-snapshots, heydpe]
audit_ref: prod-reality-audit-20260224
note: "Consolidated for LLM upload. Individual files preserved in artifacts/ directory."
---

# Production Audit Artifacts — Consolidated

> This file consolidates all audit artifacts into a single document for LLM context upload.
> Individual files are preserved in the `artifacts/` subdirectory.

---

## Artifact 1: Production Database Snapshot Summary

# PROD Database Snapshot

Taken: 2026-02-25T01:58:03.482Z
Project: pvuiwwqsumoqjepukjhz

### System Config Flags
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

### Row Counts
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

### Coverage Metrics
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

### Concepts by Category
| Category | Count |
|----------|-------|
| acs_area | 31 |
| acs_element | 969 |

### Relations by Type
| Relation Type | Count |
|---------------|-------|
| is_component_of | 1000 |

### RPC Presence
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

---

## Artifact 2: Staging Database Snapshot Summary

# STAGING Database Snapshot

Taken: 2026-02-25T01:57:35.008Z
Project: curpdzczzawpnniaujgq

### System Config Flags
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
| tts.openai | `{"model":"tts-1","speed":1,"voice":"onyx"}` | OpenAI TTS settings (Tier 1: Ground School). Voice: onyx/alloy/echo/fable/nova/shimmer. Model: tts-1/tts-1-hd. Speed: 0.25-4.0. |
| tts.deepgram | `{"model":"aura-2-orion-en","encoding":"linear16","sample_rat` | Deepgram Aura-2 TTS settings (Tier 2: Checkride Prep). Model = voice selection. Encoding: linear16/mp3/opus/flac/aac. |
| tts.cartesia | `{"model":"sonic-3","speed":0.95,"volume":1,"emotion":"confid` | Cartesia Sonic 3 TTS settings (Tier 3: DPE Live). Speed: 0.6-1.5. Volume: 0.5-2.0. Emotion: confident/calm/neutral/determined/etc. |
| voice.user_options | `[{"desc":"Friendly veteran DPE everyone recommends","image":` | Admin-curated Deepgram voice options shown to users. Array of {model, label}. |
| app.environment | `{"name":"staging"}` |  |
| tts_sentence_stream | `{"enabled":true}` |  |
| graph.enhanced_retrieval | `{"enabled":false}` | Merge graph concept bundle into RAG context |
| graph.shadow_mode | `{"enabled":false}` | Log graph retrieval in parallel without affecting output |

### Row Counts
| Table | Count |
|-------|-------|
| source_documents | 172 |
| source_chunks | 4674 |
| source_images | 0 |
| chunk_image_links | 0 |
| embedding_cache | 0 |
| latency_logs | 0 |
| concepts | 2348 |
| concept_relations | 2317 |
| concept_chunk_evidence | 0 |
| acs_tasks | 143 |
| acs_elements | 2174 |
| exam_sessions | 13 |
| session_transcripts | 76 |
| element_attempts | 34 |
| prompt_versions | 23 |
| user_profiles | 3 |
| usage_logs | 211 |
| transcript_citations | 185 |
| active_sessions | 2 |
| off_graph_mentions | 0 |
| admin_users | 1 |

### Coverage Metrics
| Metric | Value |
|--------|-------|
| chunks_with_embedding | 4619 |
| chunks_with_page_start | 0 |
| embedding_cache_reused | 0 |
| concepts_with_embedding | 2348 |
| sessions_active | 1 |
| sessions_completed | 7 |
| sessions_paused | 0 |
| sessions_expired | 0 |
| sessions_abandoned | 5 |

### Concepts by Category
| Category | Count |
|----------|-------|
| acs_area | 31 |
| acs_element | 969 |

### Relations by Type
| Relation Type | Count |
|---------------|-------|
| is_component_of | 1000 |

### RPC Presence
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

---

## Artifact 3: Production Snapshot JSON (Structure Reference)

> Full JSON available at: `artifacts/prod-snapshot.json`

```json
{
  "meta": {
    "environment": "prod",
    "supabase_url": "https://pvuiwwqsumoqjepukjhz.supabase.co",
    "project_ref": "pvuiwwqsumoqjepukjhz",
    "snapshot_at": "2026-02-25T01:58:03.482Z"
  },
  "system_config": [
    {
      "key": "kill_switch.anthropic",
      "value": {
        "enabled": false
      },
      "description": "Disable Anthropic API calls",
      "updated_at": "2026-02-17T00:24:40.548271+00:00"
    },
    {
      "key": "kill_switch.openai",
      "value": {
        "enabled": false
      },
      "description": "Disable OpenAI API calls",
      "updated_at": "2026-02-17T00:24:40.548271+00:00"
    },
    {
      "key": "kill_switch.deepgram",
      "value": {
        "enabled": false
      },
      "description": "Disable Deepgram API calls",
      "updated_at": "2026-02-17T00:24:40.548271+00:00"
    },
    {
      "key": "kill_switch.cartesia",
      "value": {
        "enabled": false
      },
      "description": "Disable Cartesia API calls",
      "updated_at": "2026-02-17T00:24:40.548271+00:00"
    },
    {
      "key": "kill_switch.tier.ground_school",
      "value": {
        "enabled": false
      },
      "description": "Disable ground_school tier",
      "updated_at": "2026-02-17T00:24:40.548271+00:00"
    },
    {
      "key": "kill_switch.tier.checkride_prep",
      "value": {
        "enabled": false
      },
      "description": "Disable checkride_prep tier",
      "updated_at": "2026-02-17T00:24:40.548271+00:00"
    },
    {
      "key": "kill_switch.tier.dpe_live",
      "value": {
        "enabled": false
      },
      "description": "Disable dpe_live tier",
      "updated_at": "2026-02-17T00:24:40.548271+00:00"
    },
    {
      "key": "maintenance_mode",
      "value": {
        "enabled": false,
        "message": ""
      },
      "description": "Global maintenance mode",
      "updated_at": "2026-02-17T00:24:40.548271+00:00"
    },
    {
      "key": "user_hard_caps",
      "value": {
        "daily_tts_chars": 50000,
        "daily_llm_tokens": 100000,
        "daily_stt_seconds": 3600
      },
      "description": "Per-user daily hard caps",
      "updated_at": "2026-02-17T00:24:40.548271+00:00"
    },
    {
      "key": "app.environment",
      "value": {
        "name": "production"
      },
      "description": null,
      "updated_at": "2026-02-20T04:52:12.814429+00:00"
    },
    {
      "key": "voice.user_options",
      "value": [
        {
          "desc": "Younger examiner, methodical",
          "image": "/personas/jim-hayes.webp",
          "label": "Jim Hayes",
          "model": "aura-2-zeus-en",
          "gender": "M",
          "persona_id": "jim_hayes"
        },
        {
          "desc": "Warm but thorough, catches everything",
          "image": "/personas/karen-sullivan.webp",
          "label": "Karen Sullivan",
          "model": "aura-2-athena-en",
          "gender": "F",
          "persona_id": "karen_sullivan"
        },
        {
          "desc": "Precise and efficient",
          "image": "/personas/maria-torres.webp",
          "label": "Maria Torres",
          "model": "aura-2-luna-en",
          "gender": "F",
          "persona_id": "maria_torres"
        },
        {
          "label": "Mars — Patient, baritone (M, American)",
          "model": "aura-2-mars-en"
        }
      ],
      "description": "Admin-curated Deepgram voice options shown to users. Array of {model, label}.",
      "updated_at": "2026-02-20T05:14:33.79+00:00"
    },
    {
      "key": "graph.shadow_mode",
      "value": {
        "enabled": true
      },
      "description": "Log graph retrieval in parallel without affecting output",
      "updated_at": "2026-02-23T12:53:48.711403+00:00"
    },
    {
      "key": "graph.enhanced_retrieval",
      "value": {
        "enabled": true
      },
      "description": "Merge graph concept bundle into RAG context",
      "updated_at": "2026-02-23T12:53:48.711403+00:00"
    },
    {
      "key": "tts.openai",
      "value": {
        "model": "tts-1",
        "speed": 1,
        "voice": "onyx"
      },
      "description": "OpenAI TTS settings (Tier 1: Ground School). Voice: onyx/alloy/echo/fable/nova/shimmer. Model: tts-1/tts-1-hd. Speed: 0.25-4.0.",
      "updated_at": "2026-02-17T16:38:00.265+00:00"
    },
    {
      "key": "tts.deepgram",
      "value": {
        "model": "aura-2-orion-en",
        "encoding": "linear16",
        "sample_rate": 48000
      },
      "description": "Deepgram Aura-2 TTS settings (Tier 2: Checkride Prep). Model = voice selection. Encoding: linear16/mp3/opus/flac/aac.",
      "updated_at": "2026-02-17T16:38:00.265+00:00"
    },
    {
      "key": "tts.cartesia",
      "value": {
        "model": "sonic-3",
        "speed": 0.95,
        "volume": 1,
        "emotion": "confident",
        "voice_id": "95856005-0332-41b0-935f-352e296aa0df",
        "voice_name": "Hugo — Teatime Friend (British)",
        "sample_rate": 48000
      },
      "description": "Cartesia Sonic 3 TTS settings (Tier 3: DPE Live). Speed: 0.6-1.5. Volume: 0.5-2.0. Emotion: confident/calm/neutral/determined/etc.",
      "updated_at": "2026-02-17T16:38:00.265+00:00"
    }
  ],
  "schema": {
    "exam_sessions": [
      {
        "column_name": "(schema query failed)",
        "data_type": "Could not find the table 'public.information_schema.columns' in the schema cache",
        "is_nullable": ""
      }
    ],
    "session_transcripts": [
      {
        "column_name": "(schema query failed)",
        "data_type": "Could not find the table 'public.information_schema.columns' in the schema cache",
        "is_nullable": ""
      }
    ],
    "element_attempts": [
      {
        "column_name": "(schema query failed)",
        "data_type": "Could not find the table 'public.information_schema.columns' in the schema cache",
        "is_nullable": ""
      }
    ],
    "prompt_versions": [
```

> **Note**: The full production snapshot JSON continues beyond this excerpt with additional schema entries, row counts, sample data, coverage metrics, concept categories, relation types, and RPC presence checks. See the complete file at `artifacts/prod-snapshot.json` for all data.

---

## Artifact 4: Staging Snapshot JSON (Structure Reference)

> Full JSON available at: `artifacts/staging-snapshot.json`

```json
{
  "meta": {
    "environment": "staging",
    "supabase_url": "https://curpdzczzawpnniaujgq.supabase.co",
    "project_ref": "curpdzczzawpnniaujgq",
    "snapshot_at": "2026-02-25T01:57:35.008Z"
  },
  "system_config": [
    {
      "key": "kill_switch.anthropic",
      "value": {
        "enabled": false
      },
      "description": "Disable Anthropic API calls",
      "updated_at": "2026-02-20T04:02:24.519233+00:00"
    },
    {
      "key": "kill_switch.openai",
      "value": {
        "enabled": false
      },
      "description": "Disable OpenAI API calls",
      "updated_at": "2026-02-20T04:02:24.519233+00:00"
    },
    {
      "key": "kill_switch.deepgram",
      "value": {
        "enabled": false
      },
      "description": "Disable Deepgram API calls",
      "updated_at": "2026-02-20T04:02:24.519233+00:00"
    },
    {
      "key": "kill_switch.cartesia",
      "value": {
        "enabled": false
      },
      "description": "Disable Cartesia API calls",
      "updated_at": "2026-02-20T04:02:24.519233+00:00"
    },
    {
      "key": "kill_switch.tier.ground_school",
      "value": {
        "enabled": false
      },
      "description": "Disable ground_school tier",
      "updated_at": "2026-02-20T04:02:24.519233+00:00"
    },
    {
      "key": "kill_switch.tier.checkride_prep",
      "value": {
        "enabled": false
      },
      "description": "Disable checkride_prep tier",
      "updated_at": "2026-02-20T04:02:24.519233+00:00"
    },
    {
      "key": "kill_switch.tier.dpe_live",
      "value": {
        "enabled": false
      },
      "description": "Disable dpe_live tier",
      "updated_at": "2026-02-20T04:02:24.519233+00:00"
    },
    {
      "key": "maintenance_mode",
      "value": {
        "enabled": false,
        "message": ""
      },
      "description": "Global maintenance mode",
      "updated_at": "2026-02-20T04:02:24.519233+00:00"
    },
    {
      "key": "user_hard_caps",
      "value": {
        "daily_tts_chars": 50000,
        "daily_llm_tokens": 100000,
        "daily_stt_seconds": 3600
      },
      "description": "Per-user daily hard caps",
      "updated_at": "2026-02-20T04:02:24.519233+00:00"
    },
    {
      "key": "tts.openai",
      "value": {
        "model": "tts-1",
        "speed": 1,
        "voice": "onyx"
      },
      "description": "OpenAI TTS settings (Tier 1: Ground School). Voice: onyx/alloy/echo/fable/nova/shimmer. Model: tts-1/tts-1-hd. Speed: 0.25-4.0.",
      "updated_at": "2026-02-20T04:02:24.978741+00:00"
    },
    {
      "key": "tts.deepgram",
      "value": {
        "model": "aura-2-orion-en",
        "encoding": "linear16",
        "sample_rate": 48000
      },
      "description": "Deepgram Aura-2 TTS settings (Tier 2: Checkride Prep). Model = voice selection. Encoding: linear16/mp3/opus/flac/aac.",
      "updated_at": "2026-02-20T04:02:24.978741+00:00"
    },
    {
      "key": "tts.cartesia",
      "value": {
        "model": "sonic-3",
        "speed": 0.95,
        "volume": 1,
        "emotion": "confident",
        "voice_id": "95856005-0332-41b0-935f-352e296aa0df",
        "voice_name": "Hugo — Teatime Friend (British)",
        "sample_rate": 48000
      },
      "description": "Cartesia Sonic 3 TTS settings (Tier 3: DPE Live). Speed: 0.6-1.5. Volume: 0.5-2.0. Emotion: confident/calm/neutral/determined/etc.",
      "updated_at": "2026-02-20T04:02:24.978741+00:00"
    },
    {
      "key": "voice.user_options",
      "value": [
        {
          "desc": "Friendly veteran DPE everyone recommends",
          "image": "/personas/bob-mitchell.webp",
          "label": "Bob Mitchell",
          "model": "aura-2-orion-en",
          "gender": "M",
          "persona_id": "bob_mitchell"
        },
        {
          "desc": "Younger examiner, methodical",
          "image": "/personas/jim-hayes.webp",
          "label": "Jim Hayes",
          "model": "aura-2-zeus-en",
          "gender": "M",
          "persona_id": "jim_hayes"
        },
        {
          "desc": "Warm but thorough, catches everything",
          "image": "/personas/karen-sullivan.webp",
          "label": "Karen Sullivan",
          "model": "aura-2-athena-en",
          "gender": "F",
          "persona_id": "karen_sullivan"
        },
        {
          "desc": "Precise and efficient",
          "image": "/personas/maria-torres.webp",
          "label": "Maria Torres",
          "model": "aura-2-luna-en",
          "gender": "F",
          "persona_id": "maria_torres"
        }
      ],
      "description": "Admin-curated Deepgram voice options shown to users. Array of {model, label}.",
      "updated_at": "2026-02-20T04:02:25.133795+00:00"
    },
    {
      "key": "app.environment",
      "value": {
        "name": "staging"
      },
      "description": null,
      "updated_at": "2026-02-20T04:08:55.969616+00:00"
    },
    {
      "key": "tts_sentence_stream",
      "value": {
        "enabled": true
      },
      "description": null,
      "updated_at": "2026-02-20T18:28:00.825043+00:00"
    },
    {
      "key": "graph.enhanced_retrieval",
      "value": {
        "enabled": false
      },
      "description": "Merge graph concept bundle into RAG context",
      "updated_at": "2026-02-25T01:07:52.643719+00:00"
    },
    {
      "key": "graph.shadow_mode",
      "value": {
        "enabled": false
      },
      "description": "Log graph retrieval in parallel without affecting output",
      "updated_at": "2026-02-25T01:07:52.643719+00:00"
    }
  ],
  "schema": {
    "exam_sessions": [
      {
        "column_name": "(schema query failed)",
        "data_type": "Could not find the table 'public.information_schema.columns' in the schema cache",
        "is_nullable": ""
      }
    ],
    "session_transcripts": [
      {
        "column_name": "(schema query failed)",
        "data_type": "Could not find the table 'public.information_schema.columns' in the schema cache",
        "is_nullable": ""
      }
    ],
```

> **Note**: The full staging snapshot JSON continues beyond this excerpt with additional schema entries, row counts, sample data, coverage metrics, concept categories, relation types, and RPC presence checks. See the complete file at `artifacts/staging-snapshot.json` for all data.
