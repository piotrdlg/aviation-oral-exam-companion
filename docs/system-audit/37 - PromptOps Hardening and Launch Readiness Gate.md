---
date: 2026-03-11
type: system-audit
tags: [heydpe, system-audit, promptops, launch-readiness, phase-14]
status: Final
evidence_level: high
---

# 37 — PromptOps Hardening and Launch Readiness Gate

**Phase:** 14
**Date:** 2026-03-11
**Scope:** Prompt governance hardening, launch readiness gate, commercial launch preparation

---

## Summary

Phase 14 adds three operational capabilities:

1. **PromptOps audit script** (`eval:promptops`) — 5-check governance audit verifying prompt inventory, coverage matrix, version ambiguity, required keys, and persona coverage
2. **Prompt usage trail** — Every exam session now captures `metadata.promptTrace` recording which prompt version powered it, the source (db vs fallback), and the full resolution context
3. **Launch readiness gate** (`audit:launch`) — 12-check GO/REVIEW/NO-GO assessment across 4 categories: Core Exam Behavior, Operational Readiness, Commercial Readiness, PromptOps Readiness

---

## PromptOps Architecture (Integration Map)

### Prompt Governance Flow

```
prompt_versions table
  ├─ prompt_key: examiner_system, assessment_system, persona_*
  ├─ dimensions: rating × study_mode × difficulty (NULL = wildcard)
  ├─ lifecycle: draft → published → archived
  └─ admin CRUD: /api/admin/prompts (create, publish, rollback)
        │
        ▼
loadPromptFromDB() [exam-engine.ts:82-121]
  ├─ 5-min TtlCache keyed by prompt_key
  ├─ Specificity scoring: +1 per exact dimension match
  ├─ Ties broken by version number (desc)
  └─ Fallback: getPromptContent() → IMMUTABLE_SAFETY_PREFIX + FALLBACK_PROMPTS
        │
        ▼
Route handler [api/exam/route.ts]
  ├─ start action: captures examinerVersionId
  ├─ Writes metadata.promptTrace to exam_sessions
  └─ PostHog event: multimodal_asset_selected (from Phase 13)
```

### Specificity Scoring Model

| rating | study_mode | difficulty | Specificity |
|--------|-----------|-----------|-------------|
| match  | match     | match     | 3           |
| match  | match     | NULL      | 2           |
| match  | NULL      | NULL      | 1           |
| NULL   | NULL      | NULL      | 0 (wildcard)|

### Prompt Trace Schema

```json
{
  "examiner_prompt_version_id": "uuid-or-null",
  "source": "db | fallback",
  "rating": "private",
  "study_mode": "full_exam",
  "difficulty": "medium",
  "profile_key": "jim_hayes",
  "timestamp": "2026-03-11T..."
}
```

---

## Launch Readiness Gate

### Categories and Checks

| # | Category | Check | Threshold |
|---|----------|-------|-----------|
| 1 | Core Exam | acs_task_coverage | GO: all 3 ratings have tasks |
| 2 | Core Exam | prompt_versions | GO: examiner + assessment published |
| 3 | Core Exam | knowledge_graph | GO: > 1000 concepts |
| 4 | Core Exam | source_chunks | GO: > 500 chunks |
| 5 | Operational | session_tracking | GO: > 0 sessions in 90 days |
| 6 | Operational | prompt_trace_adoption | GO: > 50% recent sessions traced |
| 7 | Operational | image_assets | GO: > 100 images |
| 8 | Commercial | auth_system | GO: Supabase env vars set |
| 9 | Commercial | ai_provider | GO: ANTHROPIC_API_KEY set |
| 10 | Commercial | user_profiles | GO: table queryable |
| 11 | PromptOps | persona_prompts | GO: >= 4 distinct published |
| 12 | PromptOps | version_ambiguity | GO: no duplicate published groups |

### Gate Logic

- Category verdict = worst check in category
- Overall verdict = worst category
- Exit code 0 = GO, exit code 1 = REVIEW or NO-GO

### Current Results (2026-03-11)

| Category | Verdict | Detail |
|----------|---------|--------|
| Core Exam Behavior | GO | PA=61, CA=60, IR=22; 24,613 concepts; 4,674 chunks |
| Operational Readiness | REVIEW | 78 sessions; 0% trace adoption (B2 not yet deployed) |
| Commercial Readiness | GO | All env vars set; 11 user profiles |
| PromptOps Readiness | GO | 4 personas; no version ambiguity |
| **Overall** | **REVIEW** | 11/12 GO — trace adoption expected after deploy |

---

## Admin Endpoint

**`GET /api/admin/quality/prompts`** — Returns:
- `prompt_inventory`: Counts by prompt_key × status
- `fallback_rate`: db vs fallback vs missing across recent sessions
- `coverage_warnings`: Missing required prompt_keys
- `latest_traced_sessions`: 10 most recent sessions with promptTrace

---

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `scripts/eval/promptops-audit.ts` | CREATE | 5-check PromptOps governance audit |
| `scripts/audit/launch-readiness.ts` | CREATE | 12-check launch readiness gate |
| `src/app/api/admin/quality/prompts/route.ts` | CREATE | Admin prompts quality endpoint |
| `src/app/api/exam/route.ts` | MODIFY | Added promptTrace to session metadata |
| `package.json` | MODIFY | Added `eval:promptops` and `audit:launch` scripts |

---

## Evidence

- `docs/system-audit/evidence/2026-03-11-phase14/eval/promptops-audit.{json,md}`
- `docs/system-audit/evidence/2026-03-11-phase14/eval/launch-readiness.{json,md}`
- `docs/system-audit/evidence/2026-03-11-phase14/commands/smoke-matrix.txt`
- `docs/system-audit/evidence/2026-03-11-phase14/commands/npm-test-baseline.txt`
- `docs/system-audit/evidence/2026-03-11-phase14/commands/typecheck-baseline.txt`

---

## Methodology

1. Mapped all prompt governance integration points (loadPromptFromDB, getPromptContent, loadPersonaFragment, admin CRUD)
2. Created audit script validating 5 governance properties against production data
3. Added runtime prompt trace logging to exam session metadata
4. Created admin visibility endpoint for prompt health monitoring
5. Built 12-check launch readiness gate with GO/REVIEW/NO-GO verdicts
6. Ran full E2E smoke matrix: 9 eval scripts + 731 unit tests
