# Phase 8 — KPI Contract and Definitions

## Overview

Phase 8 introduces `InstructorKpiV1`, a canonical KPI contract that serves as the single source of truth for instructor program metrics. All UI, admin, and audit consumers use this contract rather than computing metrics independently.

## KPI Contract (`InstructorKpiV1`)

### Structure

```
InstructorKpiV1
├── version: 1
├── instructorUserId
├── computedAt (ISO timestamp)
├── lifecycle: InstructorStudentLifecycleCounts
├── invites: InstructorInviteStats
├── readiness: InstructorReadinessStats
├── milestones: InstructorMilestoneStats
└── entitlements: InstructorEntitlementStats
```

### Definitions

| Term | Definition |
|------|-----------|
| **Active student (7d)** | Connected student with >= 1 exam session in the last 7 days |
| **Inactive student** | Connected student with 0 sessions in last 7 days |
| **Paid active** | Student with `subscription_status = 'active'` |
| **Trialing** | Student with `subscription_status = 'trialing'` (does NOT count as paid by default) |
| **Free** | Student with null or non-active/non-trialing subscription status |
| **Conversion rate** | `totalClaims / (totalTokensCreated + totalEmailsSent)` — null if no invites |
| **Needs attention** | Student with readiness < 60% OR no activity in 7+ days |

### Lifecycle Counts

- `totalConnected` — Students with `state = 'connected'`
- `activeLast7d` — Connected students with `sessionsLast7d >= 1`
- `inactiveLast7d` — Connected students with `sessionsLast7d === 0`
- `paidActive` — Connected with `subscription_status = 'active'`
- `trialing` — Connected with `subscription_status = 'trialing'`
- `free` — Connected with other/null subscription status
- `pendingRequests` — `state = 'pending'` or `state = 'invited'`
- `disconnected` — `state = 'disconnected'` or `state = 'rejected'`

### Invite Stats

Computed from `instructor_invite_events` table:
- Token/email counts (all-time and 7d window)
- Claims (all-time and 7d)
- Rate limit hits (7d only)
- Conversion rate

### Readiness Stats

- Average readiness across students with scores (0-100)
- Counts of improving/declining trends
- Students needing attention

Source: `exam_sessions.metadata.examResultV2.overall_score`

### Milestone Stats

Counts of connected students who completed each milestone:
- `knowledge_test_passed`
- `mock_oral_completed`
- `checkride_scheduled`
- `oral_passed`

### Entitlement Stats

Current courtesy access state:
- `hasCourtesyAccess` — boolean
- `courtesyReason` — `'paid_student'` | `'direct_override'` | `'none'`
- `paidStudentCount` — number of paid students
- `hasDirectOverride` — admin override active

## Implementation

### Module

- **`src/lib/instructor-kpis.ts`** — Pure functions, no DB dependencies
- 6 exported computation functions
- All data passed in as typed parameters

### API

- **`GET /api/instructor/kpis`** — Instructor-facing, auth required
- Returns `{ kpi: InstructorKpiV1 }`
- Emits `instructor_kpi_computed` PostHog event

### Test Coverage

- `src/lib/__tests__/instructor-kpis.test.ts` — 32 unit tests

## Key Invariants

1. KPI version is always `1`
2. `activeLast7d + inactiveLast7d === totalConnected`
3. `paidActive + trialing + free === totalConnected`
4. `conversionRate` is null when no invites sent
5. All computation is deterministic (same inputs → same outputs)
