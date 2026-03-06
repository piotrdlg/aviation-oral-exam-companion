# Phase 8 — Admin Partnership Dashboard

## Overview

The Partnership Dashboard provides admin users a centralized view of the instructor program's health, including KPI summaries, funnel metrics, fraud signals, and quota usage.

## Admin Routes

### `GET /api/admin/partnership/kpis`

Global instructor program summary:
- `summary` — Total approved, with connected students, with paid students
- `funnel` — 7-day invites → claims → connections → paid pipeline
- `instructors[]` — Per-instructor table with key metrics

### `GET /api/admin/partnership/fraud`

Fraud signal detection:
- `flagged[]` — Instructors with `riskLevel` medium or high
- Each entry includes: riskScore, reasons[], recommendedAction
- Only medium+ risk instructors returned

### `GET /api/admin/partnership/quotas`

Quota system overview:
- `defaults` — Current system limits and adaptive settings
- `overrides` — Active per-instructor overrides
- `usage7d` / `usage30d` — Percentile distributions (p50/p90/p95/max)

## Dashboard Page

**Path:** `/admin/partnership`

### Sections

1. **Summary Cards** — 3 cards: Approved, With Connected, With Paid
2. **7-Day Funnel** — Invites → Claims → Connections → Paid
3. **Top Invite Volume** — Top 10 by invites sent (7d)
4. **Top Paid Conversions** — Top 10 by paid students
5. **Flagged for Review** — Fraud signals table with risk badges
6. **Quota Usage** — Percentile distributions + active overrides

### Navigation

Added to AdminShell under OVERVIEW section as "Partnership" with heart icon.

## Files

### New Files
- `src/app/(admin)/admin/partnership/page.tsx`
- `src/app/api/admin/partnership/kpis/route.ts`
- `src/app/api/admin/partnership/fraud/route.ts`
- `src/app/api/admin/partnership/quotas/route.ts`

### Modified Files
- `src/app/(admin)/AdminShell.tsx` — Added Partnership nav item
