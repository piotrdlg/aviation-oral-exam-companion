# Phase 5 — Instructor Insights + Student Milestones

## Overview

Phase 5 adds deterministic student insights, self-reported milestones, and a weekly instructor summary email to the HeyDPE Instructor Partnership program.

## Student Milestones

### Schema

- Table: `student_milestones` (migration `20260306000005`)
- Append-only audit trail — current state computed by latest `declared_at` per (student, key)
- 4 milestone keys: `knowledge_test_passed`, `mock_oral_completed`, `checkride_scheduled`, `oral_passed`
- 3 statuses: `not_set`, `in_progress`, `completed`
- RLS: students can read/write own milestones; instructor access via service role

### API Endpoints

- `GET /api/user/milestones` — student's own milestones
- `POST /api/user/milestones` — student declares milestone
- `GET /api/user/instructor/students/milestones?studentUserId=<uuid>` — instructor reads student milestones
- `POST /api/user/instructor/students/milestones` — instructor declares milestone for student

### Privacy

- Milestones are self-reported (student or instructor declared)
- HeyDPE does not verify milestone accuracy
- Disclaimer shown on all milestone UI surfaces

## Instructor Insights

### Pure Functions (src/lib/instructor-insights.ts)

- `computeReadiness()` — maps `overall_score` (0-1) to 0-100
- `computeReadinessTrend()` — compares avg of 2 newest vs 2 oldest scores (min 3 scores)
- `computeCoverage()` — `(asked + credited) / total_in_plan` percentage
- `extractWeakAreas()` — areas with score < 0.60
- `extractStrongAreas()` — areas with score >= 0.85
- `extractGapElements()` — elements with severity `not_asked`
- `recommendTopics()` — top 5 weak elements sorted by severity
- `checkNeedsAttention()` — flags when readiness < 60, declining trend, or 7+ days inactive

### API

- `GET /api/user/instructor/students/insights?studentUserId=<uuid>` — full insights for connected student
- `GET /api/admin/quality/milestones` — milestone health metrics

### Design Decisions

- All insights are deterministic — no LLM calls
- Readiness is derived from ExamResultV2.overall_score
- Trend requires 3+ completed sessions with ExamResultV2
- No transcript content exposed to instructors

## Weekly Instructor Summary Email

### Architecture

- Template: `src/emails/instructor-weekly-summary.tsx` (React Email)
- Builder: `src/lib/instructor-summary-builder.ts`
- Sender: `src/lib/email.ts:sendInstructorWeeklySummary()`
- Scheduler: `scripts/send-instructor-weekly.ts` (CLI, --dry-run, --review)
- Category: `instructor_weekly_summary` (optional, opt-out supported)
- Cadence: once per week, enforced via email_logs template_id check

### Email Content

- Per-student: readiness score, trend, session count, needs-attention flags, recent milestones
- KPIs: total students, active students, needs-attention count
- CTA: "Open Command Center" link

## UI Changes

### Student Settings (settings/page.tsx)
- "Checkride Milestones" section with 4 dropdowns

### Instructor Command Center (instructor/page.tsx)
- "Needs Attention" KPI card
- "NEEDS ATTENTION" / "INACTIVE" labels on student cards

### Student Detail Page (instructor/students/[id]/page.tsx)
- Readiness trend indicator
- Coverage percentage
- Needs attention banner
- Milestones section with instructor-editable dropdowns

## Files

### New Files
- `supabase/migrations/20260306000005_instructor_milestones.sql`
- `src/lib/instructor-insights.ts`
- `src/lib/instructor-summary-builder.ts`
- `src/emails/instructor-weekly-summary.tsx`
- `src/app/api/user/milestones/route.ts`
- `src/app/api/user/instructor/students/insights/route.ts`
- `src/app/api/user/instructor/students/milestones/route.ts`
- `src/app/api/admin/quality/milestones/route.ts`
- `scripts/send-instructor-weekly.ts`
- `scripts/eval/instructor-insights-audit.ts`
- `src/lib/__tests__/instructor-insights.test.ts`

### Modified Files
- `src/types/database.ts` — milestone types, email category
- `src/lib/email-preferences.ts` — instructor_weekly_summary defaults/labels/descriptions
- `src/lib/email.ts` — sendInstructorWeeklySummary()
- `src/app/(dashboard)/settings/page.tsx` — milestone section
- `src/app/(dashboard)/instructor/page.tsx` — needs-attention KPI + labels
- `src/app/(dashboard)/instructor/students/[id]/page.tsx` — insights + milestones
- `package.json` — new scripts

## Test Coverage
- `src/lib/__tests__/instructor-insights.test.ts` — ~30 unit tests
- `scripts/eval/instructor-insights-audit.ts` — 10 deterministic checks

## Rollback

All changes are additive. To rollback:
- Revert modified files (email.ts, email-preferences.ts, database.ts, UI pages, package.json)
- Delete new files listed above
- Migration is CREATE only — `DROP TABLE student_milestones` if needed
