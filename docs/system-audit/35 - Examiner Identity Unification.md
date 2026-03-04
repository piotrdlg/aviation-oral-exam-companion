---
date: 2026-03-09
type: system-audit
tags: [heydpe, system-audit, phase-12, examiner-identity, persona, voice, unification]
status: final
evidence_level: high
---

# 35 — Examiner Identity Unification (Phase 12)

## Summary

Phase 12 unifies three previously independent examiner identity axes — persona style, voice, and display name — into a single `ExaminerProfileV1` layer. Settings becomes the authoritative source of truth. SessionConfig displays the active profile read-only. Runtime resolution uses a deterministic 4-level fallback chain for backward compatibility.

## Problem

Before Phase 12, examiner identity was split across 3 locations:
- **Persona** — selected per-session in SessionConfig, stored in exam request payload
- **Voice** — selected in Settings, stored in `user_profiles.preferred_voice`
- **Display Name/Avatar** — set in Settings, derived from voice options at runtime

This created drift: a user could have `bob_mitchell` (supportive) as their voice but `strict_dpe` as their session persona. The TTS voice and the personality prompt would be from different examiners.

## Solution: ExaminerProfileV1

A single profile key maps to exactly one persona + one voice + one display identity:

| Profile Key | Persona | Voice | Gender | Display Name |
|-------------|---------|-------|--------|-------------|
| `maria_methodical` | `quiet_methodical` | `maria_torres` | F | Maria Torres |
| `bob_supportive` | `supportive_coach` | `bob_mitchell` | M | Bob Mitchell |
| `jim_strict` | `strict_dpe` | `jim_hayes` | M | Jim Hayes |
| `karen_scenario` | `scenario_challenger` | `karen_sullivan` | F | Karen Sullivan |

### Resolution Chain

```
sessionConfig.examinerProfileKey
  → DB examiner_profile
    → DB preferred_voice (via VOICE_TO_PROFILE_MAP)
      → legacy persona (via PERSONA_TO_PROFILE_MAP)
        → default: maria_methodical
```

Each level returns a `ResolutionSource`: `direct_profile`, `voice_fallback`, `persona_fallback`, or `default`.

## Changes

### New Files
- `src/lib/examiner-profile.ts` — Core module (ExaminerProfileV1 type, 4 profiles, lookup maps, resolution, formatting, summary)
- `src/lib/__tests__/examiner-profile.test.ts` — 31 tests across 8 groups
- `supabase/migrations/20260309000001_examiner_profile.sql` — Adds `examiner_profile` column with backfill
- `src/app/api/admin/quality/examiner-identity/route.ts` — Admin monitoring endpoint
- `scripts/eval/examiner-identity-audit.ts` — Offline 10-check audit script

### Modified Files
- `src/types/database.ts` — Added `ExaminerProfileKey` type and `examinerProfileKey` to `SessionConfig` interface
- `src/app/api/user/tier/route.ts` — GET returns `examinerProfile`, POST validates and syncs `preferred_voice`
- `src/app/(dashboard)/settings/page.tsx` — Unified "YOUR EXAMINER" profile selector replaces voice cards
- `src/app/(dashboard)/practice/components/SessionConfig.tsx` — Read-only profile display, removed per-session persona picker
- `src/app/(dashboard)/practice/page.tsx` — Fetches `examinerProfileKey` from tier API, passes to SessionConfig
- `src/app/api/exam/route.ts` — Uses `resolveExaminerProfile()` for unified resolution, fires `examiner_profile_resolved` PostHog event
- `package.json` — Added `eval:examiner-identity` script

## Backward Compatibility

- Setting an examiner profile automatically syncs `preferred_voice` in the API, so TTS (which reads `preferred_voice`) works without modification
- Migration backfills `examiner_profile` from existing `preferred_voice` values
- Resolution chain falls through voice → persona → default for users who haven't selected a profile yet
- `SessionConfig.persona` field kept in the type for paused session metadata compatibility

## Monitoring

- **PostHog event**: `examiner_profile_resolved` — fires on every exam start with profile key, resolution source, persona key, voice ID
- **Admin endpoint**: `GET /api/admin/quality/examiner-identity` — reports adoption rate, profile distribution, voice-profile consistency, mismatch rate

## Evidence

| Check | Result |
|-------|--------|
| `npm run typecheck` | Clean (0 errors) |
| `npm test` | 694 tests pass (31 new from examiner-profile) |
| `npm run eval:examiner-identity` | 10/10 checks pass |
| `npm run eval:persona-separation` | Still passes (Phase 11 audit intact) |

## What This Does NOT Change

- Personality does NOT affect grading (bounded by ACS scope, ExamPlan, grounding, depth/difficulty)
- TTS route reads `preferred_voice` directly — no change needed (backward compat via sync)
- PersonaContractV1 (Phase 11) — still used under the hood, now accessed through ExaminerProfileV1
- Display name/avatar in message bubbles — still derived from voice options for now
