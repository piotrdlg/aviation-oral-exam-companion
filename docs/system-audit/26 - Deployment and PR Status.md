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
| `main` | `4fef6b7` | `origin/main` | Up to date |
| `phase5-grading-v2-quick-drill` | `8e165c5` | `origin/phase5-grading-v2-quick-drill` | PR #3 MERGED |
| `feat/light-themes-sectional-briefing` | `4fbe61b` | `origin/feat/light-themes-sectional-briefing` | PR #1 MERGED |
| `feat/voice-enabled-setting` | `b5fa3c5` | `origin/feat/voice-enabled-setting` | PR #2 MERGED |
| `prod-reality-audit-20260224` | `b920534` | — | Already merged into main |
| `inventory-verification-sprint-20260227` | `476a426` | — | PR #4 MERGED |

> **UPDATE (2026-03-02):** PR #4 (inventory sprint) merged at `3bb19f8`. PR #3 (Phase 5) merged at `39fc159`. DB migration applied. Release verification at `4fef6b7`. See [[27 - Release Verification --- Phase 5]].

## Pull Request Status

Evidence: `docs/system-audit/evidence/2026-02-27/github/pr-list.txt`, `github/pr-3-view.txt`

| PR | Title | Branch | State | Created | Merged |
|----|-------|--------|-------|---------|--------|
| #1 | Replace Radar/Neon with light-background Sectional and Briefing themes | feat/light-themes-sectional-briefing | **MERGED** | 2026-02-23 | 2026-02-23 |
| #2 | Move voice mode toggle to Settings as persistent preference | feat/voice-enabled-setting | **MERGED** | 2026-02-23 | 2026-02-23 |
| #3 | feat(exam): Phase 5 — Grading V2 + Quick Drill | phase5-grading-v2-quick-drill | **MERGED** | 2026-02-27 | 2026-03-02 |
| #4 | Inventory + Verification Sprint | inventory-verification-sprint-20260227 | **MERGED** | 2026-03-02 | 2026-03-02 |

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

HEAD of `main` is `4fef6b7` — Release verification doc for Phase 5

### Deployed Features (on main)
- ExamPlanV1 (Phase 4) — predetermined exam shape
- Knowledge graph infrastructure — 49 migrations, 24K concepts, 74K relations
- Multi-hub taxonomy — 4 hubs, 2,529 nodes
- Graph explorer UI — 2D/3D views, health dashboard, coverage treemap
- Voice pipeline — 3 TTS providers, tier-based selection
- Stripe billing — checkout, webhook, portal
- Admin panel — dashboard, user management, prompt versioning
- ExamResultV2 (Phase 5) — plan-based grading with per-area gating
- Weak-area synthesis — grounded citations from FAA sources
- Quick Drill mode — targeted weak-area drills (DB migration applied 2026-03-02)
- Inventory + verification docs (22-27)

> **UPDATE (2026-03-02):** All PR #3 features now deployed. DB `quick_drill` constraint applied.

## Database Migration Status

### Production DB Constraint
Evidence: `docs/system-audit/evidence/2026-02-27/sql/db-introspection.md`

**Current `exam_sessions.study_mode` CHECK constraint** (after migration):
```
CHECK (study_mode = ANY (ARRAY['linear', 'cross_acs', 'weak_areas', 'quick_drill']))
```

> **UPDATE (2026-03-02):** Migration `20260226100001` applied to production via psql. Constraint now includes `quick_drill`. Verified post-migration. See [[27 - Release Verification --- Phase 5]].

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

## Completed Merge Checklist for PR #3

All items completed 2026-03-02:

- [x] Apply migration `20260226100001_add_quick_drill_study_mode.sql` to production DB
- [x] Verify constraint includes `quick_drill`
- [x] Run `npm test` on PR branch (522 tests passing)
- [x] Run `npm run typecheck` on PR branch (clean)
- [x] Merge PR #4 (inventory sprint) via GitHub
- [x] Merge PR #3 (Phase 5) via GitHub at `39fc159`
- [x] Run `npm run exam:result-audit` — 1 session with V2, 16 total completed
- [x] Write release verification doc (doc 27)

See [[27 - Release Verification --- Phase 5]] for full evidence.

## Stale Branches to Clean Up

- `prod-reality-audit-20260224` — already merged into main
- `feat/light-themes-sectional-briefing` — PR #1 merged
- `feat/voice-enabled-setting` — PR #2 merged
- `inventory-verification-sprint-20260227` — PR #4 merged
