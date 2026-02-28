---
date: 2026-02-27
type: system-audit
tags: [heydpe, system-audit, docs, restructure, conventions]
status: final
evidence_level: high
---

# Docs Restructure Plan and Moves

## Canonical Docs Structure

As of this sprint, the repo uses this directory layout:

```
docs/
├── system-audit/            # Numbered long-term audit docs (00–26+)
│   ├── 00 - Index.md        # Master index with wikilinks
│   ├── 01–26 - *.md         # Audit documents
│   ├── evidence/            # Raw evidence organized by date
│   │   └── YYYY-MM-DD/
│   │       ├── commands/    # CLI output captures
│   │       ├── sql/         # DB query results
│   │       ├── github/      # PR/issue snapshots
│   │       └── vercel/      # Deployment evidence
│   └── production-audit/    # 2026-02-24 deep production audit (13 docs)
├── build-reports/           # Date-stamped run reports (staging, graph, TTS)
├── runbooks/                # How-to and reference docs (API, DB, testing)
├── plans/                   # Design docs and implementation plans
└── archive/                 # Legacy or obsolete docs (empty for now)
```

## Moves Performed (this sprint)

All moves used `git mv` to preserve history.

### Reference Docs → `docs/runbooks/`

| Old Path | New Path | Reason |
|----------|----------|--------|
| `docs/API.md` | `docs/runbooks/API.md` | Reference doc, not a plan or report |
| `docs/DATABASE.md` | `docs/runbooks/DATABASE.md` | Reference doc |
| `docs/cross-browser-test-matrix.md` | `docs/runbooks/cross-browser-test-matrix.md` | Test reference |
| `docs/stripe-branding-guide.md` | `docs/runbooks/stripe-branding-guide.md` | Operational reference |

### Design Docs → `docs/plans/`

| Old Path | New Path | Reason |
|----------|----------|--------|
| `docs/COCKPIT-DESIGN-SYSTEM.md` | `docs/plans/cockpit-design-system.md` | Design system spec (also lowercased) |

### Date-Stamped Reports → `docs/build-reports/`

| Old Path | New Path | Reason |
|----------|----------|--------|
| `docs/reports/2026-02-20-chunked-tts-generation.md` | `docs/build-reports/2026-02-20-chunked-tts-generation.md` | Build report |
| `docs/reports/2026-02-20-tts-sentence-stream-and-latency-benchmark.md` | `docs/build-reports/2026-02-20-tts-sentence-stream-and-latency-benchmark.md` | Build report |
| `docs/staging-reports/2026-02-19-phase1-verification.md` | `docs/build-reports/2026-02-19-phase1-verification.md` | Staging report |
| `docs/staging-reports/2026-02-20-phase1-verification.md` | `docs/build-reports/2026-02-20-phase1-verification.md` | Staging report |
| `docs/staging-reports/2026-02-20-staging-e2e-smoke.md` | `docs/build-reports/2026-02-20-staging-e2e-smoke.md` | Staging report |
| `docs/graph-reports/2026-02-25-expected-path-audit.md` | `docs/build-reports/2026-02-25-expected-path-audit.md` | Graph report |
| `docs/graph-reports/2026-02-25-graph-metrics.md` | `docs/build-reports/2026-02-25-graph-metrics.md` | Graph report |
| `docs/graph-reports/2026-02-25-graph-validation.md` | `docs/build-reports/2026-02-25-graph-validation.md` | Graph report |
| `docs/graph-reports/2026-02-25-taxonomy-attachment.md` | `docs/build-reports/2026-02-25-taxonomy-attachment.md` | Graph report |
| `docs/graph-reports/2026-02-26-chunk-classification-knowledge.md` | `docs/build-reports/2026-02-26-chunk-classification-knowledge.md` | Graph report |
| `docs/graph-reports/2026-02-26-concept-taxonomy-attachment.md` | `docs/build-reports/2026-02-26-concept-taxonomy-attachment.md` | Graph report |
| `docs/graph-reports/2026-02-26-graph-metrics.md` | `docs/build-reports/2026-02-26-graph-metrics.md` | Graph report |
| `docs/graph-reports/2026-02-26-graph-validation.md` | `docs/build-reports/2026-02-26-graph-validation.md` | Graph report |
| `docs/graph-reports/2026-02-26-hub-scaffold.md` | `docs/build-reports/2026-02-26-hub-scaffold.md` | Graph report |
| `docs/graph-reports/2026-02-26-multi-hub-chunk-assignment.md` | `docs/build-reports/2026-02-26-multi-hub-chunk-assignment.md` | Graph report |
| `docs/graph-reports/2026-02-26-multi-hub-phase1-validation.md` | `docs/build-reports/2026-02-26-multi-hub-phase1-validation.md` | Graph report |
| `docs/graph-reports/2026-02-26-multi-hub-taxonomy-build.md` | `docs/build-reports/2026-02-26-multi-hub-taxonomy-build.md` | Graph report |
| `docs/graph-reports/2026-02-26-taxonomy-concept-sync.md` | `docs/build-reports/2026-02-26-taxonomy-concept-sync.md` | Graph report |

### Removed Directories

| Directory | Status |
|-----------|--------|
| `docs/reports/` | Emptied and removed |
| `docs/staging-reports/` | Emptied and removed |
| `docs/graph-reports/` | Emptied and removed |

## External Docs Audit

### Obsidian Vault
Path: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Piotr's Second Brain/Imagine Flying/NextGen CFI/Products/HeyDPE/HeyDPE - Build Report/`

14 session logs found (2026-02-18 through 2026-02-26). These are Obsidian session logs written per CLAUDE.md protocol. They remain in the Obsidian vault (not copied into repo) because:
1. They are human-owned knowledge base artifacts
2. They serve a different audience (project owner continuity)
3. They reference Obsidian wikilinks and vault structure

**No action needed** — the Obsidian vault is the canonical home for session logs.

### `~/claude-projects/` Workspace
Scanned for HeyDPE-related `.md` files outside this repo. Found: **none**. Other projects in the workspace (expense-tracker, imagine-flying) are unrelated.

## Conventions Going Forward

### Naming
- **System audit docs**: `NN - Title.md` (zero-padded two-digit number)
- **Build reports**: `YYYY-MM-DD-descriptive-slug.md`
- **Plans**: `YYYY-MM-DD-plan-name.md` or `descriptive-name.md`
- **Runbooks**: `DESCRIPTIVE-NAME.md` (UPPER for legacy, lowercase for new)

### Frontmatter
All docs should include:
```yaml
---
date: YYYY-MM-DD
type: system-audit | build-report | runbook | plan
tags: [heydpe, ...]
status: draft | final | living | archived
---
```

### Wikilinks
The system-audit Index (`00 - Index.md`) uses Obsidian-compatible `[[wikilinks]]`. These work in Obsidian but not on GitHub. This is intentional — the primary consumer is the Obsidian vault.

### Evidence
Raw evidence goes under `docs/system-audit/evidence/YYYY-MM-DD/` with subdirectories for `commands/`, `sql/`, `github/`, `vercel/`.
