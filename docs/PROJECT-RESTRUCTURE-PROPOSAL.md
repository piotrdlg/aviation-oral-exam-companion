---
date: 2026-03-06
type: restructure-proposal
tags: [heydpe, project-management, reorganization]
status: proposal — awaiting owner decision
author: analysis session
---

# HeyDPE — Project Folder Restructure Proposal

**Prepared:** 2026-03-06
**Scope:** Full repository analysis (excluding `node_modules`, `.git`, `.next`)
**Total files inventoried:** ~1,555 (without build artifacts: ~400 meaningful files)
**Purpose:** Reduce friction when starting new AI sessions, uploading context to LLMs, and understanding project state at a glance.

---

## Executive Summary

The project has grown organically across 21 development phases and is architecturally sound, but carries significant **navigational debt** in three areas:

1. **Root directory** is polluted with 36 PNG screenshots and 6 `.env` backup files — a new session's first impression is noise, not signal.
2. **`scripts/`** has 17 flat `.ts` files alongside 8 organized subdirectories — half the pipeline is findable, half is not.
3. **`docs/instructor-program/`** has 16 numbered documents with no master file, making it unportable to LLMs (same problem as `system-audit` before today).

Everything else is well-structured. The proposals below are conservative — no content is deleted, no source code is touched.

---

## Current State — What's Working Well

| Area | Status | Note |
|------|--------|------|
| `src/` | ✅ Clean | App Router structure is correct, lib has 114 modules |
| `supabase/migrations/` | ✅ Clean | 59 migrations, date-prefixed, sequential |
| `sources/` | ✅ Clean | 180 FAA source files organized by type (acs, cfr, phak, afh, aim, ac, handbooks) |
| `data/taxonomy/` | ✅ Clean | 13 taxonomy files logically grouped |
| `docs/system-audit/` | ✅ Now clean | 65 docs + master file created today |
| `docs/plans/` | ✅ Clean | 15 dated design/plan documents |
| `docs/runbooks/` | ✅ Clean | 4 operational runbooks |
| `docs/build-reports/` | ✅ Clean | 20 dated build reports |
| `docs/instructor-program/` | ⚠️ Needs master file | 16 docs, no consolidated file |
| `scripts/` subdirs | ✅ Clean | audit/, email/, eval/, exam/, graph/, load/, smoke/, staging/, taxonomy/ |
| `e2e/` | ✅ Clean | Playwright tests |
| `mockups/` | ✅ Acceptable | 6 HTML theme files |

---

## Problem Areas — Detailed Analysis

---

### Problem 1: 36 PNG Screenshots at Repository Root
**Severity: High — First Impression & LLM Context Pollution**

When opening the project in any IDE, Finder, or passing the folder to an LLM, the first thing visible is a wall of 36 unorganized PNG files. These are test evidence from different sprints, not permanent assets.

**Current files at root:**
```
e2e-graph-2d-label-blocks.png       (graph explorer E2E evidence — Phase 3)
e2e-graph-3d-airspace.png           (graph explorer E2E evidence — Phase 3)
e2e-graph-3d-label-blocks.png       (graph explorer E2E evidence — Phase 3)
e2e-graph-3d-view.png               (graph explorer E2E evidence — Phase 3)
e2e-graph-airspace-nodes.png        (graph explorer E2E evidence — Phase 3)
e2e-graph-health-tab.png            (graph explorer E2E evidence — Phase 3)
e2e-graph-page-loaded.png           (graph explorer E2E evidence — Phase 3)
e2e-graph-search-results.png        (graph explorer E2E evidence — Phase 3)
exam-images-test.png                (exam images test — Sprint 0)
favicon-in-tab.png                  (favicon verification — early sprint)
favicon-preview.png                 (favicon verification — early sprint)
landing-page.png                    (initial landing page screenshot)
login-page.png                      (initial login page screenshot)
signup-page.png                     (initial signup page screenshot)
test-landing-page.png               (Phase 5 test evidence)
test-login-page.png                 (Phase 5 test evidence)
test1_landing_page.png  through test9_mobile_404.png  (Phase 2 E2E test evidence — 9 files)
theme-cockpit-default.png           (theme verification — Phase 2)
theme-glass-landing.png             (theme verification — Phase 2)
theme-glass-test.png                (theme verification — Phase 2)
theme-glass-verified.png            (theme verification — Phase 2)
theme-neon-verified.png             (theme verification — Phase 2)
theme-radar-verified.png            (theme verification — Phase 2)
```

**Proposed action:** Move all to `docs/screenshots/` organized by sprint subfolder. Keep originals — no deletion. Add `docs/screenshots/*.png` to `.gitignore` (they are large, not code, and shouldn't be in git history going forward).

**Proposed structure:**
```
docs/screenshots/
  sprint-0/
    exam-images-test.png
    favicon-in-tab.png
    favicon-preview.png
    landing-page.png
    login-page.png
    signup-page.png
  phase-2-e2e/
    test1_landing_page.png  ... test9_mobile_404.png
    test-landing-page.png
    test-login-page.png
  phase-2-themes/
    theme-cockpit-default.png
    theme-glass-landing.png
    theme-glass-test.png
    theme-glass-verified.png
    theme-neon-verified.png
    theme-radar-verified.png
  phase-3-graph/
    e2e-graph-2d-label-blocks.png
    e2e-graph-3d-airspace.png
    e2e-graph-3d-label-blocks.png
    e2e-graph-3d-view.png
    e2e-graph-airspace-nodes.png
    e2e-graph-health-tab.png
    e2e-graph-page-loaded.png
    e2e-graph-search-results.png
  phase-2-practice/
    test3_practice_config.png
    test4_commercial_tasks.png
    test5_instrument_tasks.png
    test7_commercial_session.png
    test8_progress_page.png
```

---

### Problem 2: 6 `.env` Backup Files at Root
**Severity: High — Security Risk & Clutter**

There are currently 4 backup copies of `.env.local` sitting in the project root alongside the live `.env.local`. These files contain real API keys, database connection strings, and Stripe secrets. They are not referenced by any tool, are not gitignored as a pattern, and create both a security exposure risk and visual clutter.

**Current files:**
```
.env.local                        ← live, correct
.env.local.prod-backup            ← Feb 20 snapshot (38 days old)
.env.local.production-backup      ← Feb 24 snapshot
.env.local.staging-backup         ← Feb 24 snapshot
.env.local.staging-backup-20260225 ← Feb 25 snapshot
.env.staging                      ← separate staging env (fine)
.env.staging.example              ← fine (no secrets)
```

**Proposed action:** Create a `.env-backups/` folder (already gitignored via `.env*` pattern — verify) and move the 4 backup files there, or simply delete them since the live `.env.local` is current and the production values are the authoritative ones in Vercel's dashboard. The `.env.staging.example` is documentation and should stay.

**Recommended:**
```
.env.local                  ← keep (live)
.env.example                ← keep (documentation)
.env.staging                ← keep (staging specific)
.env.staging.example        ← keep (documentation)
.env-backups/               ← NEW (gitignored)
  .env.local.prod-backup    ← moved
  .env.local.production-backup ← moved
  .env.local.staging-backup ← moved
  .env.local.staging-backup-20260225 ← moved
```

---

### Problem 3: 17 Flat `.ts` Scripts Mixed with Organized Subdirectories
**Severity: Medium — Discoverability**

`scripts/` has 8 well-organized subdirectories (audit, email, eval, exam, graph, load, smoke, staging, taxonomy) with ~65 files total — but also 17 TypeScript files dumped flat at the root. These flat files are the legacy pipeline scripts that existed before the subdirectory structure was introduced.

**Flat files and where they belong:**

| Current flat file | Should move to | Reason |
|-------------------|----------------|--------|
| `ingest-sources.ts` | `scripts/pipeline/ingest-sources.ts` | Core ingestion pipeline |
| `embed-concepts.ts` | `scripts/pipeline/embed-concepts.ts` | Core ingestion pipeline |
| `extract-topics.ts` | `scripts/pipeline/extract-topics.ts` | Core ingestion pipeline |
| `extract-artifacts.ts` | `scripts/pipeline/extract-artifacts.ts` | Core ingestion pipeline |
| `extract-regulatory-claims.ts` | `scripts/pipeline/extract-regulatory-claims.ts` | Core ingestion pipeline |
| `extraction-prompts.ts` | `scripts/pipeline/extraction-prompts.ts` | Core ingestion pipeline (shared prompts) |
| `chunk-utils.ts` | `scripts/pipeline/chunk-utils.ts` | Pipeline utility |
| `infer-edges.ts` | `scripts/graph/infer-edges.ts` | Graph — already has a subdir |
| `verify-graph-health.ts` | `scripts/graph/verify-graph-health.ts` | Graph — already has a subdir |
| `verify-graph-e2e.ts` | `scripts/graph/verify-graph-e2e.ts` | Graph — already has a subdir |
| `link-acs-to-chunks.ts` | `scripts/pipeline/link-acs-to-chunks.ts` | Ingestion linking |
| `link-claims-to-acs.ts` | `scripts/pipeline/link-claims-to-acs.ts` | Ingestion linking |
| `seed-elements.ts` | `scripts/pipeline/seed-elements.ts` | DB seeding |
| `classify-difficulty.ts` | `scripts/eval/classify-difficulty.ts` | Eval — already has a subdir |
| `send-instructor-weekly.ts` | `scripts/email/send-instructor-weekly.ts` | Email — already has a subdir |
| `_reload-schema.ts` | `scripts/_dev/_reload-schema.ts` | Dev utility (keep underscore prefix) |
| `_reload-schema2.ts` | `scripts/_dev/_reload-schema2.ts` or delete v1 | Two versions of same utility — review |

**New proposed `scripts/` structure:**
```
scripts/
  _dev/                    ← NEW: dev utilities (underscore = not pipeline)
    _reload-schema.ts
    _reload-schema2.ts
  pipeline/                ← NEW: core FAA document ingestion pipeline
    ingest-sources.ts
    embed-concepts.ts
    extract-topics.ts
    extract-artifacts.ts
    extract-regulatory-claims.ts
    extraction-prompts.ts
    chunk-utils.ts
    link-acs-to-chunks.ts
    link-claims-to-acs.ts
    seed-elements.ts
  graph/                   ← EXISTS: move 3 files here
    infer-edges.ts         (moved from flat)
    verify-graph-health.ts (moved from flat)
    verify-graph-e2e.ts    (moved from flat)
    [existing 8 graph scripts]
  eval/                    ← EXISTS: move 1 file here
    classify-difficulty.ts (moved from flat)
    [existing 17 eval scripts]
  email/                   ← EXISTS: move 1 file here
    send-instructor-weekly.ts (moved from flat)
    [existing 4 email scripts]
  audit/          ← exists
  exam/           ← exists
  load/           ← exists
  smoke/          ← exists
  staging/        ← exists
  taxonomy/       ← exists
  __tests__/      ← exists
  extract-images/ ← exists (Python pipeline)
  split_pdfs.py   ← consider moving to extract-images/
  001_schema.sql  ← consider moving to supabase/ or scripts/_dev/
  KNOWLEDGE_ONBOARDING_PROCEDURE.md ← move to docs/runbooks/
```

Also note: `scripts/KNOWLEDGE_ONBOARDING_PROCEDURE.md` is a documentation file buried inside the scripts folder. It belongs in `docs/runbooks/`.

---

### Problem 4: `docs/instructor-program/` Has No Master File
**Severity: Medium — LLM Context Portability**

The `instructor-program` folder has 16 numbered documents (00–15) and an `evidence/` subfolder — identical structure to what `system-audit` had before today. It cannot be uploaded as a single context source to an LLM.

**Proposed action:** Apply the exact same concatenation treatment used for `system-audit` to create `docs/instructor-program/INSTRUCTOR-PROGRAM-MASTER.md`. The evidence/ subdirectory files (command outputs, SQL previews, eval results) can optionally be included or summarized separately.

---

### Problem 5: Dead Folders
**Severity: Low — Minor Confusion**

Two doc folders exist but are empty (or contain only a `.gitkeep`):

| Folder | Content | Recommendation |
|--------|---------|----------------|
| `docs/archive/` | Empty | Either populate (move truly obsolete docs here) or remove |
| `docs/staging-reports/` | Only `.gitkeep` | Remove or rename to match actual use — staging evidence is in `docs/system-audit/evidence/` |
| `docs/graph-reports/` | 2 JSON metric snapshots | Consider consolidating into `docs/build-reports/` |

---

### Problem 6: `mockups/` at Root Level
**Severity: Low — Minor**

6 HTML theme mockup files sit at the project root as a top-level folder. They are design exploration artifacts, not source code. Consider moving to `docs/mockups/` to group all design artifacts under `docs/`.

---

### Problem 7: CLAUDE.md Is Behind Reality
**Severity: Medium — Immediate Impact on Every AI Session**

The `CLAUDE.md` file (the AI context file read at the start of every session) documents the project as of approximately Phase 2. The codebase is now at Phase 21+. Key things CLAUDE.md states that are outdated:

| CLAUDE.md claim | Reality |
|-----------------|---------|
| "Knowledge graph populated but unused at runtime" | **False** — graph is active with 22K concepts |
| "No transcript persistence" | Partially outdated — check current state |
| "Private + Commercial + Instrument supported" | Now also includes Instructor Program (Phase 5+) |
| "No admin interface" | **False** — full admin at `/admin` with graph explorer, analytics, config, instructors pages |
| Lists 8 tables in database | Database has grown significantly beyond 8 tables (59 migrations) |
| Lists 3 API routes | App has 33+ API routes |
| Project structure shows simplified `src/` | Actual `src/` is significantly larger |
| TTS as "multi-provider" | Partially correct but doesn't mention Cartesia/Deepgram specifics |

**Recommended action:** Update CLAUDE.md to reflect:
- Admin route group and pages
- Instructor program feature set
- Active knowledge graph status
- Updated table count / API route count
- Current migration count and latest schema changes
- PostHog, Stripe, Resend integrations (currently mentioned partially)

---

## Proposed New Root Structure (After Changes)

```
aviation-oral-exam-companion/
├── .env.example                    ← keep
├── .env.local                      ← keep (live)
├── .env.staging                    ← keep
├── .env.staging.example            ← keep
├── .env-backups/                   ← NEW: gitignored, 4 backup files moved here
├── CLAUDE.md                       ← UPDATE: bring to Phase 21 reality
├── README.md                       ← keep
├── data/                           ← keep (taxonomy data)
├── docs/
│   ├── archive/                    ← POPULATE or REMOVE (currently empty)
│   ├── build-reports/              ← keep (20 dated reports)
│   ├── graph-reports/              ← MERGE into build-reports/ (only 2 JSON files)
│   ├── instructor-program/
│   │   ├── INSTRUCTOR-PROGRAM-MASTER.md  ← NEW: concatenated master
│   │   ├── 00 - Index.md ... 15 - ...   ← keep originals
│   │   └── evidence/               ← keep
│   ├── mockups/                    ← NEW: move from root mockups/
│   │   └── [6 HTML theme files]
│   ├── plans/                      ← keep (15 design docs)
│   ├── runbooks/
│   │   ├── API.md                  ← keep
│   │   ├── DATABASE.md             ← keep
│   │   ├── KNOWLEDGE_ONBOARDING_PROCEDURE.md  ← MOVED from scripts/
│   │   ├── cross-browser-test-matrix.md ← keep
│   │   └── stripe-branding-guide.md ← keep
│   ├── screenshots/                ← NEW: 36 PNGs moved from root
│   │   ├── sprint-0/
│   │   ├── phase-2-e2e/
│   │   ├── phase-2-themes/
│   │   ├── phase-2-practice/
│   │   └── phase-3-graph/
│   ├── staging-reports/            ← REMOVE (empty, only .gitkeep)
│   └── system-audit/
│       ├── SYSTEM-AUDIT-MASTER.md  ← DONE (created today)
│       ├── 00 - Index.md ... 64 -  ← keep originals
│       ├── evidence/               ← keep
│       └── production-audit/       ← keep
├── e2e/                            ← keep (Playwright tests)
├── public/                         ← keep (static assets)
├── scripts/
│   ├── _dev/                       ← NEW: dev utilities
│   ├── pipeline/                   ← NEW: 14 flat scripts moved here
│   ├── audit/                      ← keep
│   ├── email/                      ← keep + 1 moved here
│   ├── eval/                       ← keep + 1 moved here
│   ├── exam/                       ← keep
│   ├── graph/                      ← keep + 3 moved here
│   ├── instructor/                 ← keep
│   ├── load/                       ← keep
│   ├── smoke/                      ← keep
│   ├── staging/                    ← keep
│   ├── taxonomy/                   ← keep
│   ├── extract-images/             ← keep (Python)
│   └── __tests__/                  ← keep
├── sources/                        ← keep (180 FAA source files)
├── src/                            ← keep (unchanged)
├── supabase/                       ← keep (migrations, config)
└── [config files: next.config.ts, package.json, tsconfig.json, etc.]
```

---

## Priority & Effort Matrix

| # | Change | Priority | Effort | Risk | Impact |
|---|--------|----------|--------|------|--------|
| 1 | Move 36 root PNGs to `docs/screenshots/` | **High** | 5 min | Zero | Clean root, better IDE |
| 2 | Move 4 `.env` backups to `.env-backups/` | **High** | 2 min | Zero | Security hygiene |
| 3 | Update CLAUDE.md to Phase 21 reality | **High** | 30 min | Low | Every future AI session |
| 4 | Create `INSTRUCTOR-PROGRAM-MASTER.md` | **High** | 5 min | Zero | LLM portability |
| 5 | Move 17 flat scripts to subdirs | **Medium** | 15 min | Low (update imports) | Discoverability |
| 6 | Move `KNOWLEDGE_ONBOARDING.md` to runbooks/ | **Medium** | 1 min | Zero | Documentation |
| 7 | Remove `docs/staging-reports/` (only .gitkeep) | **Low** | 1 min | Zero | Minor cleanup |
| 8 | Merge `docs/graph-reports/` into build-reports/ | **Low** | 2 min | Zero | Simplification |
| 9 | Move `mockups/` to `docs/mockups/` | **Low** | 2 min | Zero | Organization |
| 10 | Add `*.png` to `.gitignore` (screenshots) | **Low** | 1 min | Zero | Future hygiene |

**Total estimated effort: ~60–90 minutes for all changes.**

---

## Changes That Are NOT Recommended

| What | Why NOT to change |
|------|-------------------|
| `src/` structure | Clean, follows Next.js App Router conventions exactly |
| `supabase/migrations/` | Canonical, sequential, never reorganize migration files |
| `sources/` structure | Well-organized by FAA document type |
| `data/taxonomy/` | Correct structure, actively used by scripts |
| `e2e/` | Standard Playwright location |
| Individual numbered docs in `system-audit/` or `instructor-program/` | Obsidian wikilinks depend on exact filenames |
| `scripts/` subdirectory names | Used in `package.json` run scripts — renaming requires updating all references |

---

## Suggested Implementation Order

**Do today (zero-risk, immediate payoff):**
1. Move root PNGs → `docs/screenshots/`
2. Move `.env` backups → `.env-backups/`
3. Create `INSTRUCTOR-PROGRAM-MASTER.md`
4. Move `KNOWLEDGE_ONBOARDING_PROCEDURE.md` to `docs/runbooks/`
5. Remove `docs/staging-reports/` empty folder

**Next session:**
6. Update CLAUDE.md (requires careful reading of current codebase)
7. Move 17 flat scripts to subdirs (requires checking package.json for any `npm run` references)

**Optional / low priority:**
8–10 as described above.

---

## What This Achieves

After these changes, any new AI session that receives this project folder will:

- See a clean root with only config files and the essential directories
- Find `CLAUDE.md` that accurately describes the current system
- Be able to upload `SYSTEM-AUDIT-MASTER.md` (660KB) for full sprint history
- Be able to upload `INSTRUCTOR-PROGRAM-MASTER.md` for instructor feature history
- Locate any script in a logical subdirectory with no guessing
- Have no ambiguity about which `.env` file is active

---

*Proposal prepared: 2026-03-06 | No files have been moved yet — this is analysis only.*
