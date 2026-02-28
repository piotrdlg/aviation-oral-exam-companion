---
date: 2026-02-27
type: system-audit
tags: [heydpe, system-audit, deployment, pr-status, migration]
status: final
evidence_level: high
---

# Deployment and PR Status

## Git Branch Status

Evidence: `docs/system-audit/evidence/2026-02-27/commands/git-branches.txt`

| Branch | Commit | Tracking | Status |
|--------|--------|----------|--------|
| `main` | `8dab6d3` | `origin/main` | Up to date |
| `phase5-grading-v2-quick-drill` | `8e165c5` | `origin/phase5-grading-v2-quick-drill` | PR #3 OPEN |
| `feat/light-themes-sectional-briefing` | `4fbe61b` | `origin/feat/light-themes-sectional-briefing` | PR #1 MERGED |
| `feat/voice-enabled-setting` | `b5fa3c5` | `origin/feat/voice-enabled-setting` | PR #2 MERGED |
| `prod-reality-audit-20260224` | `b920534` | — | Already merged into main |
| `inventory-verification-sprint-20260227` | (this sprint) | — | In progress |

## Pull Request Status

Evidence: `docs/system-audit/evidence/2026-02-27/github/pr-list.txt`, `github/pr-3-view.txt`

| PR | Title | Branch | State | Created | Merged |
|----|-------|--------|-------|---------|--------|
| #1 | Replace Radar/Neon with light-background Sectional and Briefing themes | feat/light-themes-sectional-briefing | **MERGED** | 2026-02-23 | 2026-02-23 |
| #2 | Move voice mode toggle to Settings as persistent preference | feat/voice-enabled-setting | **MERGED** | 2026-02-23 | 2026-02-23 |
| #3 | feat(exam): Phase 5 — Grading V2 + Quick Drill | phase5-grading-v2-quick-drill | **OPEN** | 2026-02-27 | — |

### PR #3 Details
- **Additions**: 1,944 lines
- **Deletions**: 14 lines
- **Files**: 13 (6 new, 7 modified)
- **Key deliverables**: ExamResultV2, per-area gating, weak-area synthesis, Quick Drill mode, 27 tests
- **Includes migration**: `20260226100001_add_quick_drill_study_mode.sql`
- **URL**: https://github.com/piotrdlg/aviation-oral-exam-companion/pull/3
- **Status**: Awaiting review. DO NOT merge until this inventory sprint is committed.

## What's Deployed to Production (main)

Evidence: `docs/system-audit/evidence/2026-02-27/commands/git-log-20.txt`

HEAD of `main` is `8dab6d3` — "Merge prod-reality-audit-20260224: KG infrastructure + ExamPlan Phase 4"

### Deployed Features (on main)
- ExamPlanV1 (Phase 4) — predetermined exam shape
- Knowledge graph infrastructure — 49 migrations, 24K concepts, 74K relations
- Multi-hub taxonomy — 4 hubs, 2,529 nodes
- Graph explorer UI — 2D/3D views, health dashboard, coverage treemap
- Voice pipeline — 3 TTS providers, tier-based selection
- Stripe billing — checkout, webhook, portal
- Admin panel — dashboard, user management, prompt versioning

### NOT Deployed (in PR #3 only)
- ExamResultV2 — plan-based grading
- Per-area gating — configurable thresholds
- Weak-area synthesis — grounded citations
- Quick Drill mode — targeted weak-area drills
- DB migration for `quick_drill` study_mode

## Database Migration Status

### Production DB Constraint
Evidence: `docs/system-audit/evidence/2026-02-27/sql/db-introspection.md`

**Current `exam_sessions.study_mode` CHECK constraint**:
```
CHECK (study_mode IN ('linear', 'cross_acs', 'weak_areas'))
```

**Test result**: Inserting `study_mode = 'quick_drill'` returns error 23514 (CHECK violation).

### Migration Pending (in PR #3)
File: `supabase/migrations/20260226100001_add_quick_drill_study_mode.sql`
```sql
ALTER TABLE exam_sessions DROP CONSTRAINT exam_sessions_study_mode_check;
ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_study_mode_check
  CHECK (study_mode IN ('linear', 'cross_acs', 'weak_areas', 'quick_drill'));
```

**This migration MUST be applied to production DB before PR #3 can be safely deployed.**

### Other DB Observations

| Finding | Impact |
|---------|--------|
| `system_flags` table not found in REST schema cache | Feature flag queries may fail silently |
| `system_prompts` NULL count | Table may be empty or inaccessible |
| `voice_configs` NULL count | Voice configuration may use hardcoded defaults |
| `image_chunk_mappings` NULL count | Image-to-chunk linking may not be populated |
| `off_graph_mentions` 0 rows | Feature exists but unused |

## Vercel Deployment

Vercel MCP tools are available but deployment verification requires project ID. Manual verification steps:

1. **Check current deployment**:
   ```bash
   # Via Vercel dashboard or CLI:
   vercel ls --limit 5
   ```
   Expected: latest deployment matches main branch HEAD `8dab6d3`

2. **Verify live URL**:
   - https://aviation-oral-exam-companion.vercel.app should serve main branch
   - Check browser console for version/commit hash if exposed

3. **Build verification**:
   - `npm run build` passes on main (evidence: `commands/npm-build.txt`)
   - No build-time errors expected

## Pre-Merge Checklist for PR #3

Before merging PR #3 into main:

- [ ] Apply migration `20260226100001_add_quick_drill_study_mode.sql` to production DB
- [ ] Verify constraint with: `SELECT conname FROM pg_constraint WHERE conrelid = 'exam_sessions'::regclass AND conname LIKE '%study_mode%';`
- [ ] Run `npm test` on PR branch (522 tests expected)
- [ ] Run `npm run typecheck` on PR branch
- [ ] Merge PR via GitHub (no squash — preserve commit history)
- [ ] Verify Vercel deployment succeeds
- [ ] Smoke test: start a regular exam, complete it, check `metadata.examResultV2` in DB
- [ ] Smoke test: call `GET /api/exam?action=summary&sessionId=<id>`

## Recommended Merge Order

1. **This sprint** (inventory-verification-sprint-20260227) — commit and merge first
2. **PR #3** (Phase 5) — merge after DB migration is applied
3. Clean up stale branches: `prod-reality-audit-20260224`, `feat/light-themes-sectional-briefing`, `feat/voice-enabled-setting`
