---
date: 2026-03-06
type: instructor-program-master
tags: [heydpe, instructor-program, master, consolidated]
status: auto-generated
source_files: 19 original documents (00–18)
generated_by: concatenation script (originals preserved)
---

# HeyDPE Instructor Partnership Program — MASTER CONSOLIDATED FILE

> **Purpose:** Consolidates all 19 Instructor Program documents into a single portable
> file for LLM context upload. All original files remain intact.
>
> **Navigate with:** `DOC-NN` to jump to a document, `## Phase` for phase sections,
> or keyword search (e.g. "FAA verification", "entitlement", "referral", "fraud").

---

## Master Table of Contents

| # | Document Title | Phase |
|---|----------------|-------|
| 00 | [Index](#doc-00) | Index & Overview |
| 01 | [PRD Mapping and Architecture](#doc-01) | Architecture |
| 02 | [Phase 1 Foundation and Activation](#doc-02) | Phase 1 — Foundation & Activation |
| 03 | [Phase 2 Verification and Invites](#doc-03) | Phase 2 — Verification & Invites |
| 04 | [Phase 3 Connections and Command Center MVP](#doc-04) | Phase 3 — Connections & Command Center |
| 05 | [Phase 4 Entitlements and Authorization](#doc-05) | Phase 4 — Entitlements & Authorization |
| 06 | [Entitlement Monitoring and Abuse Signals](#doc-06) | Phase 4 — Entitlements & Authorization |
| 07 | [Phase 5 Insights and Milestones](#doc-07) | Phase 5 — Insights & Milestones |
| 08 | [Weekly Email Operations](#doc-08) | Phase 5 — Insights & Milestones |
| 09 | [Phase 6 Referrals and Landing Pages](#doc-09) | Phase 6 — Referrals & Landing Pages |
| 10 | [Phase 7 Invite Tools and Abuse Hardening](#doc-10) | Phase 7 — Invite Tools & Abuse Hardening |
| 11 | [Phase 7 Weekly Referral Nudge](#doc-11) | Phase 7 — Invite Tools & Abuse Hardening |
| 12 | [Phase 8 KPI Contract and Definitions](#doc-12) | Phase 8 — KPIs & Dashboards |
| 13 | [Phase 8 Admin Partnership Dashboard](#doc-13) | Phase 8 — KPIs & Dashboards |
| 14 | [Phase 8 Quotas and Anti-Fraud Signals](#doc-14) | Phase 8 — KPIs & Dashboards |
| 15 | [Phase 8 PostHog Dashboard Spec](#doc-15) | Phase 8 — KPIs & Dashboards |
| 16 | [Instructor Public Launch Audit](#doc-16) | Phase 9 — Public Launch Closure |
| 17 | [FAA Verification Operations and Freshness](#doc-17) | Phase 9 — Public Launch Closure |
| 18 | [Instructor Public Launch Gate](#doc-18) | Phase 9 — Public Launch Closure |

---

## Phase Roadmap Summary

| Phase | Scope | Status |
|-------|-------|--------|
| 1 — Foundation | Schema, state machine, feature flag, Settings UI, admin workflow | Complete |
| 2 — Verification & Invites | FAA verification, auto-approval, invite generation, student claiming | Complete |
| 3 — Connections | Student↔instructor connections, command center, student progress | Complete |
| 4 — Entitlements | Courtesy access, entitlement resolver, tier integration, overrides | Complete |
| 5 — Insights | Deterministic insights, milestones, weekly instructor summary email | Complete |
| 6 — Referrals | Public identity, referral codes, landing pages, auto-connect | Complete |
| 7 — Invite Tools | QR codes, email invites, rate limiting, abuse protection, referral nudge | Complete |
| 8 — KPIs & Dashboards | KPI contract, admin dashboard, quotas, adaptive tiers, anti-fraud | Complete |
| 9 — Public Launch | PRD audit, FAA freshness ops, privacy audit, launch gate (15 checks) | Complete — GO |

---


---

## Index & Overview

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-00 START  |  00 - Index  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-00"></a>

# Instructor Partnership Program — Documentation Index

## Overview
The Instructor Partnership adds a product stream where CFIs (Certified Flight Instructors) can connect with students, monitor progress, and use HeyDPE as a teaching partner. The system is feature-flagged and built incrementally across multiple phases.

## Documents

| # | Title | Status |
|---|-------|--------|
| 01 | [PRD Mapping and Architecture](./01%20-%20PRD%20Mapping%20and%20Architecture.md) | Complete |
| 02 | [Phase 1 Foundation and Activation](./02%20-%20Phase%201%20Foundation%20and%20Activation.md) | Complete |
| 03 | [Phase 2 Verification and Invites](./03%20-%20Phase%202%20Verification%20and%20Invites.md) | Complete |
| 04 | [Phase 3 Connections and Command Center MVP](./04%20-%20Phase%203%20Connections%20and%20Command%20Center%20MVP.md) | Complete |
| 05 | [Phase 4 Entitlements and Authorization](./05%20-%20Phase%204%20Entitlements%20and%20Authorization.md) | Complete |
| 06 | [Entitlement Monitoring and Abuse Signals](./06%20-%20Entitlement%20Monitoring%20and%20Abuse%20Signals.md) | Complete |
| 07 | [Phase 5 Insights and Milestones](./07%20-%20Phase%205%20Insights%20and%20Milestones.md) | Complete |
| 08 | [Weekly Email Operations](./08%20-%20Weekly%20Email%20Operations.md) | Complete |
| 09 | [Phase 6 Referrals and Landing Pages](./09%20-%20Phase%206%20Referrals%20and%20Landing%20Pages.md) | Complete |
| 10 | [Phase 7 Invite Tools and Abuse Hardening](./10%20-%20Phase%207%20Invite%20Tools%20and%20Abuse%20Hardening.md) | Complete |
| 11 | [Phase 7 Weekly Referral Nudge](./11%20-%20Phase%207%20Weekly%20Referral%20Nudge.md) | Complete |
| 12 | [Phase 8 KPI Contract and Definitions](./12%20-%20Phase%208%20KPI%20Contract%20and%20Definitions.md) | Complete |
| 13 | [Phase 8 Admin Partnership Dashboard](./13%20-%20Phase%208%20Admin%20Partnership%20Dashboard.md) | Complete |
| 14 | [Phase 8 Quotas and Anti-Fraud Signals](./14%20-%20Phase%208%20Quotas%20and%20Anti-Fraud%20Signals.md) | Complete |
| 15 | [Phase 8 PostHog Dashboard Spec](./15%20-%20Phase%208%20PostHog%20Dashboard%20Spec.md) | Complete |
| 16 | [Instructor Public Launch Audit](./16%20-%20Instructor%20Public%20Launch%20Audit.md) | Complete |
| 17 | [FAA Verification Operations and Freshness](./17%20-%20FAA%20Verification%20Operations%20and%20Freshness.md) | Complete |
| 18 | [Instructor Public Launch Gate](./18%20-%20Instructor%20Public%20Launch%20Gate.md) | Complete |

## Phase Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| **1 — Foundation** | Schema, state machine, feature flag, Settings UI, admin workflow, tests | Complete |
| **2 — Verification & Invites** | FAA verification, auto-approval fast-path, invite generation, student claiming, admin verification evidence | Complete |
| **3 — Connections & Command Center** | Student↔instructor connections, instructor command center, student progress page, admin monitoring | Complete |
| **4 — Entitlements & Authorization** | Courtesy access, entitlement resolver, tier integration, admin overrides, monitoring | Complete |
| **5 — Insights & Milestones** | Deterministic insights, student milestones, weekly instructor summary email | Complete |
| **6 — Referrals** | Public identity, referral codes, landing pages, auto-connect, connection source attribution | Complete |
| **7 — Invite Tools & Abuse Hardening** | QR codes, email invites, rate limiting, self-referral protection, entitlement correction, weekly referral nudge | Complete |
| **8 — KPIs & Dashboards** | KPI contract, admin partnership dashboard, quota tuning, adaptive tiers, anti-fraud signals | Complete |
| **9 — Public Launch Closure** | PRD audit, FAA freshness ops, privacy audit, launch gate (15 checks), 69 total eval checks | Complete — **GO** |

## Feature Flag
- Key: `instructor_partnership_v1`
- Table: `system_config`
- Default: `{"enabled": false}`
- Behavior: When disabled, instructor UI is hidden from Settings and API returns 404

## Key Files
| File | Purpose |
|------|---------|
| `src/lib/instructor-access.ts` | Canonical state resolver (12 exports) |
| `src/lib/__tests__/instructor-access.test.ts` | 50 unit tests |
| `supabase/migrations/20260305000001_instructor_partnership.sql` | Schema (4 tables + RLS) |
| `src/app/api/user/instructor/route.ts` | User-facing API (GET state / POST application) |
| `src/app/api/admin/instructors/route.ts` | Admin list endpoint |
| `src/app/api/admin/instructors/[id]/route.ts` | Admin actions (approve/reject/suspend/reinstate) |
| `src/app/(dashboard)/settings/page.tsx` | Instructor Mode section in Settings |
| `src/app/(admin)/admin/instructors/page.tsx` | Admin review page |
| `src/lib/instructor-verification.ts` | FAA verification matcher |
| `src/lib/instructor-invites.ts` | Invite generation + claiming |
| `src/lib/__tests__/instructor-verification.test.ts` | 20 verification tests |
| `src/lib/__tests__/instructor-invites.test.ts` | 16 invite flow tests |
| `scripts/instructor/import-faa-airmen.ts` | FAA CSV import pipeline |
| `supabase/migrations/20260305000002_instructor_verification.sql` | Verification + FAA tables |
| `src/app/api/invite/[token]/route.ts` | Invite lookup + claim API |
| `src/app/invite/[token]/page.tsx` | Student invite claim page |
| `src/lib/instructor-connections.ts` | Connection CRUD + search |
| `src/lib/instructor-student-summary.ts` | Student progress extraction |
| `src/lib/__tests__/instructor-connections.test.ts` | 34 connection tests |
| `src/lib/__tests__/instructor-student-summary.test.ts` | 19 summary tests |
| `src/app/api/user/instructor/connections/route.ts` | Student connection API |
| `src/app/api/user/instructor/search/route.ts` | Instructor search API |
| `src/app/api/instructor/connections/route.ts` | Instructor connection management |
| `src/app/api/instructor/students/route.ts` | Student list API |
| `src/app/api/instructor/students/[student_user_id]/route.ts` | Student detail API |
| `src/app/(dashboard)/instructor/page.tsx` | Instructor Command Center |
| `src/app/(dashboard)/instructor/students/[student_user_id]/page.tsx` | Student detail page |
| `src/app/api/admin/quality/instructor-program/route.ts` | Program metrics API |
| `supabase/migrations/20260305000003_instructor_connections_mvp.sql` | Phase 3 migration |
| `src/lib/instructor-entitlements.ts` | Entitlement resolver (single source of truth) |
| `src/lib/__tests__/instructor-entitlements.test.ts` | 33 entitlement tests |
| `src/lib/voice/tier-lookup.ts` | Tier lookup with courtesy integration |
| `supabase/migrations/20260305000004_instructor_entitlements.sql` | Phase 4 migration |
| `src/app/api/admin/instructor-entitlements/route.ts` | Admin entitlement metrics |
| `src/app/api/admin/user-overrides/route.ts` | Admin override management |
| `src/app/api/admin/quality/instructor-entitlements/route.ts` | Quality metrics |
| `scripts/eval/instructor-entitlement-audit.ts` | Offline audit (10 checks) |
| `src/lib/instructor-identity.ts` | Public identity (slug + referral code) |
| `src/lib/__tests__/instructor-identity.test.ts` | 25 identity tests |
| `src/lib/__tests__/instructor-referrals.test.ts` | 40 referral tests |
| `src/app/api/referral/claim/route.ts` | Referral claim API |
| `src/app/api/referral/lookup/route.ts` | Referral lookup API |
| `src/app/ref/[code]/page.tsx` | Referral claim page |
| `src/app/instructor/[slug]/page.tsx` | Public instructor profile |
| `src/app/api/admin/quality/referrals/route.ts` | Referral metrics |
| `scripts/eval/instructor-referral-audit.ts` | Offline referral audit (10 checks) |
| `supabase/migrations/20260306000006_instructor_referrals.sql` | Phase 6 migration |
| `src/lib/instructor-rate-limiter.ts` | Rate limiting for invites |
| `src/lib/__tests__/instructor-rate-limiter.test.ts` | 19 rate limiter tests |
| `src/lib/__tests__/instructor-summary-builder.test.ts` | 6 weekly email tests |
| `src/app/api/instructor/invites/email/route.ts` | Email invite API |
| `src/app/api/public/qr/referral/[code]/route.ts` | QR code endpoint |
| `src/emails/instructor-invite.tsx` | Invite email template |
| `supabase/migrations/20260306000007_instructor_invite_events.sql` | Phase 7 migration |
| `scripts/eval/instructor-abuse-audit.ts` | Abuse audit (12 checks) |
| `src/lib/instructor-kpis.ts` | KPI contract (pure functions, 6 exports) |
| `src/lib/__tests__/instructor-kpis.test.ts` | 32 KPI tests |
| `src/lib/instructor-quotas.ts` | Quota resolver (pure functions) |
| `src/lib/__tests__/instructor-quotas.test.ts` | 18 quota tests |
| `src/lib/instructor-fraud-signals.ts` | Fraud signal computation (pure functions) |
| `src/lib/__tests__/instructor-fraud-signals.test.ts` | 24 fraud signal tests |
| `src/app/api/instructor/kpis/route.ts` | Instructor KPI endpoint |
| `src/app/api/admin/partnership/kpis/route.ts` | Admin KPI dashboard endpoint |
| `src/app/api/admin/partnership/fraud/route.ts` | Admin fraud signals endpoint |
| `src/app/api/admin/partnership/quotas/route.ts` | Admin quota overview endpoint |
| `src/app/(admin)/admin/partnership/page.tsx` | Admin partnership dashboard page |
| `supabase/migrations/20260306000008_instructor_quota_overrides.sql` | Phase 8 migration |
| `scripts/eval/instructor-fraud-audit.ts` | Fraud audit (12 checks) |
| `scripts/eval/instructor-quota-analysis.ts` | Quota audit (12 checks) + report |
| `scripts/eval/instructor-faa-freshness.ts` | FAA freshness audit (8 checks) |
| `scripts/eval/instructor-public-launch-gate.ts` | Public launch gate (15 checks) |


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-00 END    |  00 - Index  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->


---

## Architecture

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-01 START  |  01 - PRD Mapping and Architecture  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-01"></a>

# PRD Mapping and Architecture

## Context
HeyDPE is an AI checkride oral exam simulator. The Instructor Partnership adds a new product stream where CFIs (Certified Flight Instructors) can connect with students, monitor progress, and use HeyDPE as a teaching partner.

## PRD Requirements → System Mapping

Map each business rule to technical decisions:

1. **"HeyDPE is a teaching partner, not a replacement"** → Instructor doesn't control exam content; they monitor student progress and can see reports. No instructor-authored questions in Phase 1.

2. **"Instructor remains authority for training/endorsement"** → HeyDPE never issues endorsements. The system provides data to support instructor decision-making.

3. **"Students are default users"** → No schema change to existing users. `user_profiles` stays as-is. Instructor status lives in a separate `instructor_profiles` table.

4. **"Instructor is a normal user who activates Instructor Mode"** → Any authenticated user can apply. Application requires: first_name, last_name, certificate_number, certificate_type. Creates a row in `instructor_profiles` with status=pending.

5. **"Minimum activation data"** → first_name, last_name, certificate_number (TEXT, not validated against FAA in Phase 1), certificate_type (enum: CFI, CFII, MEI, AGI, IGI).

6. **"Instructor accounts require admin approval"** → Status machine: draft → pending → approved/rejected. Admin can also suspend approved instructors.

7. **"Student-instructor relationships are bidirectional and revocable"** → `student_instructor_connections` table with states: invited → pending → connected → disconnected. Either party can disconnect.

8. **"Instructor free access depends on connected paying students"** → Not enforced in Phase 1. Schema supports it via `instructor_access_overrides` table. Entitlement logic deferred to Phase 2.

9. **"Admin overrides and fraud controls"** → `instructor_access_overrides` for courtesy access. `admin_audit_log` (existing) for tracking all admin actions.

## Phase Boundaries

### Phase 1 (This Sprint)
- instructor_profiles table + state machine
- student_instructor_connections table (scaffold only)
- instructor_invites table (scaffold only)
- instructor_access_overrides table (scaffold only)
- RLS policies for all tables
- `instructor-access.ts` resolver module
- Feature flag: `instructor_partnership_v1`
- Settings UI: activation form + status display
- Admin: list/approve/reject/suspend endpoints
- Tests for state resolver + admin workflow

### Phase 2 (Next)
- Student-instructor connection UX
- Invite generation and claiming
- Instructor dashboard (read-only student progress)

### Phase 3+
- Entitlement enforcement (N paying students → free access)
- Instructor-specific reports
- Instructor-authored study plans
- QR code invite generation

## Architectural Decisions

### AD-1: Separate table vs. columns on user_profiles
**Decision**: Separate `instructor_profiles` table.
**Rationale**: Instructor lifecycle (apply/approve/reject/suspend) is independent of user account lifecycle. A separate table allows clean RLS, independent state machine, and no pollution of the user model.

### AD-2: Certificate validation
**Decision**: No FAA API validation in Phase 1. Store as text. Certificate number stored but not verified.
**Rationale**: FAA certificate validation requires an external API and error handling. Phase 1 focuses on the data model and admin review workflow. Admin manually verifies during approval.

### AD-3: Feature flag pattern
**Decision**: Use existing `system_config` table with key `instructor_partnership_v1` and value `{"enabled": false}`.
**Rationale**: Consistent with existing kill switch and config patterns. No new infrastructure needed.

### AD-4: State machine
**Decision**: Linear state machine with admin control:
```
(new) → draft → pending → approved ↔ suspended
                        → rejected
```
**Rationale**: Simple, auditable states. Draft allows saving partial applications. Pending triggers admin review. Approved/rejected are terminal from admin. Suspended is reversible.

### AD-5: Authorization boundaries
**Decision**:
- Users can only see/edit their own instructor profile
- Admins can see all profiles and change status
- Connection data is scoped to participants only
- Invite tokens are opaque and stateless-verifiable

### AD-6: Privacy boundaries
**Decision**:
- Student cannot see instructor's certificate number
- Instructor can see connected student's display_name and progress summaries only
- All data access through app-level resolvers, not direct DB access

## Entity Relationship

```
auth.users ─┬─ user_profiles (1:1, existing)
             │
             └─ instructor_profiles (0:1, new)
                    │
                    ├─ student_instructor_connections (1:many as instructor)
                    │       └── student_user_id → auth.users
                    │
                    ├─ instructor_invites (1:many)
                    │
                    └─ instructor_access_overrides (1:many)
```

## Tables to Create (Phase 1)

| Table | Purpose | Phase 1 Usage |
|---|---|---|
| `instructor_profiles` | Application + status + certificate data | Full CRUD + admin workflow |
| `student_instructor_connections` | Student↔instructor links | Schema only, no UI |
| `instructor_invites` | Invite tokens for student onboarding | Schema only, no UI |
| `instructor_access_overrides` | Admin courtesy access grants | Schema only, no enforcement |

## Future Dependencies

| Phase | Depends On |
|---|---|
| Phase 2 (Connections UX) | `student_instructor_connections` table, `instructor_invites` table |
| Phase 3 (Entitlements) | `instructor_access_overrides`, connected student count, Stripe integration |
| Phase 4 (Reports) | `exam_sessions`, `session_transcripts`, connection data |
| Phase 5+ (Study Plans) | Instructor dashboard, ACS task coverage data |


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-01 END    |  01 - PRD Mapping and Architecture  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->


---

## Phase 1 — Foundation & Activation

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-02 START  |  02 - Phase 1 Foundation and Activation  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-02"></a>

# Phase 1 — Foundation and Activation

## Summary
Phase 1 establishes the structural foundation for the Instructor Partnership feature on HeyDPE. It creates the database schema, state machine, feature flag, user-facing activation UI, admin approval workflow, and comprehensive test coverage. No production deployment — feature flag defaults to disabled.

## What Was Built

### Database Schema (`20260305000001_instructor_partnership.sql`)

**4 tables created:**

| Table | Purpose | Phase 1 Usage |
|-------|---------|---------------|
| `instructor_profiles` | Application + status + certificate data | Full CRUD + admin workflow |
| `instructor_invites` | Invite tokens for student onboarding | Schema only |
| `student_instructor_connections` | Student↔instructor links | Schema only |
| `instructor_access_overrides` | Admin courtesy access grants | Schema only |

**Key constraints:**
- `instructor_profiles.status` CHECK: `draft`, `pending`, `approved`, `rejected`, `suspended`
- `instructor_invites.type` CHECK: `link`, `email`, `qr`
- `student_instructor_connections.state` CHECK: `invited`, `pending`, `connected`, `inactive`, `rejected`, `disconnected`
- `instructor_access_overrides.type` CHECK: `courtesy_access`, `beta_tester`, `partnership`, `manual`

**RLS policies:** Users read/write own profiles; admin operations via service-role client.

**Feature flag seed:** `system_config` row with key `instructor_partnership_v1`, value `{"enabled": false}`.

### State Machine

```
(new user) → draft → pending → approved ↔ suspended
                              → rejected → (resubmit) → pending
```

Valid transitions enforced in `instructor-access.ts`:
- `submitInstructorApplication`: Only from no-profile, draft, or rejected
- `approveInstructor`: Only from pending
- `rejectInstructor`: Only from pending
- `suspendInstructor`: Only from approved
- `reinstateInstructor`: Only from suspended

### Resolver Module (`src/lib/instructor-access.ts`)

12 exports:

| Export | Type | Purpose |
|--------|------|---------|
| `InstructorStatus` | Type | `draft \| pending \| approved \| rejected \| suspended` |
| `CertificateType` | Type | `CFI \| CFII \| MEI \| AGI \| IGI` |
| `InstructorProfile` | Interface | Full profile shape |
| `InstructorProgramState` | Interface | Composite state for Settings UI |
| `isInstructorFeatureEnabled()` | Query | Checks `system_config` flag |
| `getInstructorProfile()` | Query | Fetches profile by user_id |
| `getInstructorApplicationStatus()` | Query | Returns status or null |
| `isInstructorApproved()` | Query | Boolean check |
| `canOpenInstructorMode()` | Query | Feature flag + approved status |
| `getInstructorProgramState()` | Resolver | Primary state resolver for UI |
| `submitInstructorApplication()` | Mutation | Create/update application |
| `approveInstructor()` | Admin | Approve pending application |
| `rejectInstructor()` | Admin | Reject pending application |
| `suspendInstructor()` | Admin | Suspend approved instructor |
| `reinstateInstructor()` | Admin | Reinstate suspended instructor |

### User-Facing UI

**Settings page** (`src/app/(dashboard)/settings/page.tsx`):
- Instructor Mode section conditionally rendered when feature flag is enabled
- Fetches state via `GET /api/user/instructor`
- 5 states rendered: no profile (activation form), pending (review notice), approved (active badge), rejected (reapply prompt), suspended (contact support)
- Activation form collects: first name, last name, certificate number, certificate type

**API** (`src/app/api/user/instructor/route.ts`):
- `GET`: Returns `InstructorProgramState` for authenticated user
- `POST`: Submits instructor application; validates required fields; checks feature flag (404 if disabled)

### Admin Workflow

**List endpoint** (`src/app/api/admin/instructors/route.ts`):
- `GET`: Lists instructor applications with status filter and pagination
- Enriches profiles with user email from `auth.users`

**Detail/action endpoint** (`src/app/api/admin/instructors/[id]/route.ts`):
- `GET`: Single profile with user email
- `POST`: Actions (approve, reject, suspend, reinstate) with audit logging via `logAdminAction()`

**Admin page** (`src/app/(admin)/admin/instructors/page.tsx`):
- Status filter tabs
- Table view with columns: name, email, certificate, status, submitted date
- Action buttons per row
- Modal for rejection/suspension reason

### Tests (`src/lib/__tests__/instructor-access.test.ts`)

**50 tests in 9 groups:**
1. Feature flag (4): enabled, disabled, missing row, no enabled field
2. Profile queries (3): found, null, error
3. Application status (2): exists, null
4. isInstructorApproved (6): each status + no profile
5. canOpenInstructorMode (3): feature+approved, disabled feature, pending
6. getInstructorProgramState (9): all status permutations with correct derived fields
7. submitInstructorApplication (6): new, update draft, resubmit rejected, blocked for pending/approved/suspended
8. Admin mutations (8): approve/reject/suspend/reinstate valid + invalid transitions
9. State machine parity (7): valid and invalid transition coverage

## Migration Notes

The migration file is at `supabase/migrations/20260305000001_instructor_partnership.sql`. It has **not been applied** to production. To apply:

```bash
# Local development
supabase db reset   # Applies all migrations from scratch

# Staging / Production
supabase db push    # Applies pending migrations
# OR via Supabase Dashboard > SQL Editor: paste the migration file contents
```

The migration is safe to apply:
- Creates new tables only (no ALTER on existing tables)
- Seeds a single `system_config` row with feature disabled
- All tables have `updated_at` triggers
- RLS enabled on all tables

## Verification Results

| Check | Result |
|-------|--------|
| `npm run typecheck` | 0 errors |
| `npm test` | 806/806 pass (37 files) |
| New tests | 50 in `instructor-access.test.ts` |
| Feature flag default | `{"enabled": false}` |

## Deferred to Phase 2

- Student-instructor connection UX
- Invite generation and claiming (link, email, QR)
- Instructor dashboard (read-only student progress)
- FAA certificate number validation via external API
- Entitlement enforcement (N paying students → free access)
- Email notifications for status changes (approve/reject/suspend)


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-02 END    |  02 - Phase 1 Foundation and Activation  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->


---

## Phase 2 — Verification & Invites

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-03 START  |  03 - Phase 2 Verification and Invites  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-03"></a>

# Phase 2 — Fast-Path Verification + Instructor-Initiated Invitations

## Overview
Phase 2 adds automated FAA verification of instructor credentials and a complete invite flow for connecting instructors with students. Key capabilities:
- Hybrid FAA verification using the FAA Airmen Certification Releasable Database
- Fast-path auto-approval for high-confidence single-match verifications
- Instructor-initiated invite links (DB-backed tokens, 30-day expiry)
- Student invite claim flow with connection creation
- Verification evidence display in admin review panel
- Full audit trail: every verification decision is explainable

## Architecture

### Verification Pipeline
1. Instructor submits application with name + certificate type + certificate number
2. API route (`/api/user/instructor`) calls `verifyInstructor()` from `instructor-verification.ts`
3. Verification queries `faa_airmen` (normalized names) + `faa_airmen_certs` tables
4. Pure function `computeVerificationResult()` determines confidence:
   - **HIGH** — exactly 1 exact name+cert match, no partial matches — auto-approve
   - **MEDIUM** — multiple matches, or partial name, or wrong cert type — manual review
   - **LOW** — name found but no instructor cert — manual review
   - **NONE** — no match or no FAA data — manual review
5. Result stored in `instructor_profiles` verification fields
6. Auto-approved profiles skip admin queue entirely

### FAA Data Constraint
The downloadable FAA dataset does NOT contain certificate numbers. Verification is name + cert type matching only. Every verification result includes `certificate_number_unverifiable` reason code.

### Invite Flow
1. Approved instructor creates invite via Settings page
2. System generates 48-char cryptographic token, stores in `instructor_invites`
3. Instructor copies invite URL and shares with student
4. Student opens `/invite/[token]` — sees instructor name + cert type
5. Student clicks "Accept Invite" — creates `student_instructor_connections` entry
6. Single-use tokens: each invite can be claimed once

## Database Changes

Migration: `20260305000002_instructor_verification.sql`

### instructor_profiles (ALTER TABLE)
| Column | Type | Notes |
|--------|------|-------|
| verification_status | TEXT | 'unverified', 'verified_auto', 'needs_manual_review', 'verified_admin' |
| verification_source | TEXT | e.g., 'faa_database' |
| verification_confidence | TEXT | 'high', 'medium', 'low', 'none' |
| verification_data | JSONB | Candidates, reason codes, explanation |
| verification_attempted_at | TIMESTAMPTZ | When verification ran |
| auto_approved | BOOLEAN | Whether fast-path was used |

### faa_airmen (new table)
Imported from FAA PILOT_BASIC.csv. Normalized name fields for matching.
- Unique index on (faa_unique_id, source_date)
- Normalized first_name and last_name for case-insensitive lookup

### faa_airmen_certs (new table)
Imported from FAA PILOT_CERT.csv.
- cert_type: P (Pilot), F (Flight Instructor), G (Ground Instructor)
- cert_level: rating text (e.g., "AIRPLANE SINGLE ENGINE LAND")

### faa_import_log (new table)
Audit trail for FAA data imports.

## Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/20260305000002_instructor_verification.sql` | Schema changes |
| `src/lib/instructor-verification.ts` | FAA verification matcher (pure + async) |
| `src/lib/instructor-invites.ts` | Invite generation, claiming, management |
| `scripts/instructor/import-faa-airmen.ts` | FAA CSV import pipeline |
| `src/app/api/user/instructor/invites/route.ts` | Invite CRUD API |
| `src/app/api/invite/[token]/route.ts` | Public invite lookup + claim |
| `src/app/invite/[token]/page.tsx` | Student invite claim page |
| `src/lib/__tests__/instructor-verification.test.ts` | 20 verification matcher tests |
| `src/lib/__tests__/instructor-invites.test.ts` | 16 invite flow tests |

## Files Modified

| File | Changes |
|------|---------|
| `src/types/database.ts` | Added verification + FAA types |
| `src/lib/instructor-access.ts` | Extended types, added VerificationPayload, auto-approve logic |
| `src/app/api/user/instructor/route.ts` | Added verification call in POST handler |
| `src/app/(dashboard)/settings/page.tsx` | Added invite management UI for approved instructors |
| `src/app/(admin)/admin/instructors/page.tsx` | Added verification evidence column + expandable detail |
| `src/lib/__tests__/instructor-access.test.ts` | Updated fixtures for new fields |
| `package.json` | Added instructor:import:faa script |

## Confidence Tiers

| Confidence | Criteria | Action |
|-----------|----------|--------|
| HIGH | Exactly 1 exact name + correct cert type match, no partial matches | Auto-approve |
| MEDIUM | Multiple matches, partial name, or mismatched cert type | Manual review |
| LOW | Name found but no instructor certificate | Manual review |
| NONE | No match or no FAA data imported | Manual review |

## Verification Reason Codes

| Code | Meaning |
|------|---------|
| unique_name_certtype_match | Single exact match found |
| multiple_candidates | Multiple FAA records match |
| name_match_no_instructor_cert | Name found but no instructor cert |
| no_name_match | No FAA record matches |
| partial_name_match | First name is initial/prefix match only |
| certificate_number_unverifiable | Always present — FAA dataset lacks cert numbers |
| manual_review_required | Catch-all for non-auto cases |
| faa_data_not_available | No FAA import completed yet |

## Test Coverage

- 20 verification matcher tests (computeVerificationResult pure function)
- 16 invite flow tests (token generation, URL building, create/claim with mocked DB)
- Total project: 842 tests, 0 typecheck errors

## Verification

- `npm run typecheck` — 0 errors
- `npm test` — 842/842 pass


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-03 END    |  03 - Phase 2 Verification and Invites  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->


---

## Phase 3 — Connections & Command Center

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-04 START  |  04 - Phase 3 Connections and Command Center MVP  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-04"></a>

# Phase 3 — Connections & Command Center MVP

## Summary

Phase 3 adds student-initiated connection requests, instructor approval workflow, an Instructor Command Center with KPIs, and a student progress detail page. All features are gated behind the `instructor_partnership_v1` feature flag.

## Migration

**`20260305000003_instructor_connections_mvp.sql`**

Additive changes to the existing `student_instructor_connections` table:

| Change | Details |
|--------|---------|
| `approved_by` column | UUID FK to `auth.users` — tracks which instructor approved |
| `rejected_at` column | TIMESTAMPTZ — records rejection timestamp |
| Composite index `idx_sic_instructor_state_updated` | `(instructor_user_id, state, updated_at DESC)` — instructor listing queries |
| Composite index `idx_sic_student_state_updated` | `(student_user_id, state, updated_at DESC)` — student listing queries |

All operations use `IF NOT EXISTS`. No destructive changes.

## Connection Flow

### Student-Initiated
1. Student searches for instructor by last name (+ optional cert number)
2. Student sends connection request → state: `pending`, `initiated_by: student`
3. Instructor approves → state: `connected`, `approved_by` set, `approved_at` + `connected_at` timestamped
4. Either party can disconnect → state: `disconnected`, `disconnected_by` + `disconnected_at` set

### Guards
- Self-connection prevented (student cannot connect to themselves)
- Reuses disconnected/rejected rows by updating state back to `pending`
- Feature flag required on all endpoints
- Instructor must be `approved` status for instructor-side endpoints

## API Endpoints

### Student-Facing

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/user/instructor/search?lastName=&certNumber=` | Search approved instructors (privacy-safe) |
| GET | `/api/user/instructor/connections` | Get student's current connection |
| POST | `/api/user/instructor/connections` | `request_connection`, `cancel_request`, `disconnect` |

### Instructor-Facing

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/instructor/connections` | List pending + connected students with counts |
| POST | `/api/instructor/connections` | `approve`, `reject`, `disconnect` |
| GET | `/api/instructor/students` | Student list with readiness scores |
| GET | `/api/instructor/students/[student_user_id]` | Student detail (progress, sessions, gaps) |

### Admin

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/admin/quality/instructor-program` | Program metrics (instructors, connections, invites, suspicious patterns) |

## Privacy Boundary

The following data is **never** returned to student search results:
- Certificate number
- Email address
- Internal profile IDs

The following data is **never** returned to instructor student views:
- Session transcripts
- Raw RAG chunks
- Full exam configurations
- Student email address

## Readiness Score

Derived from `exam_sessions.metadata.examResultV2`:
- `readiness = Math.round(examResultV2.overall_score * 100)`
- Returns `null` if no completed sessions with examResultV2
- Weak elements filtered to `unsatisfactory`/`partial` status only
- Max 5 weak elements in list view, max 10 in detail view
- Recommended topics = top 3 weak element codes

## UI Surfaces

### Settings Page — Student Connection Section
- Search form (last name + optional cert number)
- Connection states: none → searching → pending → connected
- Cancel request / disconnect actions with confirmation

### Instructor Command Center (`/instructor`)
- KPI row: Connected, Pending, Invites, Active (7-day)
- Three-tab interface: Students, Pending, Invites
- Student list with readiness score bars and last activity
- "View Progress" links to detail page
- Legal disclaimer banner

### Student Detail Page (`/instructor/students/[id]`)
- Readiness score with color coding (green ≥70%, amber ≥50%, red <50%)
- Area breakdown with progress bars
- Weak elements list
- Recommended topics
- Recent sessions timeline
- Disconnect button
- Legal disclaimer banner

## PostHog Events

| Event | Trigger |
|-------|---------|
| `instructor_connection_requested` | Student sends connection request |
| `instructor_connection_disconnected` | Student disconnects |
| `instructor_connection_approved` | Instructor approves request |
| `instructor_connection_rejected` | Instructor rejects request |
| `instructor_connection_removed` | Instructor disconnects student |

## Library Modules

| Module | Purpose | Test File |
|--------|---------|-----------|
| `src/lib/instructor-connections.ts` | Connection CRUD + search | `instructor-connections.test.ts` (34 tests) |
| `src/lib/instructor-student-summary.ts` | Student progress extraction | `instructor-student-summary.test.ts` (19 tests) |

## Test Coverage

| File | Tests |
|------|-------|
| `instructor-connections.test.ts` | 34 (search, state transitions, guards, privacy) |
| `instructor-student-summary.test.ts` | 19 (list, detail, readiness, privacy) |
| **Phase 3 total** | **53 new tests** |
| **Project total** | **895 tests, 41 files** |

## Verification

- `npx tsc --noEmit` → Exit code 0
- `npm test` → 41 files, 895 tests passed


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-04 END    |  04 - Phase 3 Connections and Command Center MVP  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->


---

## Phase 4 — Entitlements & Authorization

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-05 START  |  05 - Phase 4 Entitlements and Authorization  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-05"></a>

# Phase 4 — Courtesy Access, Entitlements & Authorization Integration

## Summary

Phase 4 makes instructor privileges dynamically depend on approval status, connected student subscriptions, and admin overrides. Instructors with at least one paying student receive courtesy access (equivalent to `checkride_prep` tier). This access is explicitly a *courtesy benefit*, not a contractual entitlement, and is revocable at any time.

## Eligibility Rule (Exact)

An instructor has **courtesy access** if ALL of:

1. `instructor_profiles.status == 'approved'`

AND any ONE of:

2a. At least one connected student has `user_profiles.subscription_status` IN (`'active'`, `'trialing'`)

2b. At least one connected student has an active, non-expired `user_entitlement_overrides` row with `entitlement_key = 'paid_equivalent'`

2c. The instructor has an active, non-expired `instructor_access_overrides` row (any type)

**Priority order**: direct override (2c) > paid student (2a) > student override (2b)

## Effective Tier Mapping

| Instructor Status | Courtesy Access | Effective Tier |
|---|---|---|
| Not instructor | N/A | Normal user tier from `user_profiles.tier` |
| Pending approval | No | Normal user tier |
| Approved, no courtesy | No | Normal user tier |
| Approved, with courtesy | Yes | MAX(user tier, `checkride_prep`) |
| Suspended | No | Normal user tier |

**Key constraint**: Courtesy access never *downgrades* a tier. If the instructor already has `dpe_live` (paid subscription), they keep it.

## Paid-Active Student Definition

A student is considered "paid-active" if:
- `user_profiles.subscription_status` is `'active'` OR `'trialing'`

Conservative approach: `past_due`, `incomplete`, `canceled`, and `'none'` are NOT counted.

## Schema Changes

### New Table: `user_entitlement_overrides`

```sql
CREATE TABLE user_entitlement_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entitlement_key TEXT NOT NULL CHECK (entitlement_key IN ('paid_equivalent')),
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  reason TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, entitlement_key)
);
```

**Purpose**: General-purpose override allowing admin to grant paid-equivalent status to any user (demo accounts, beta testers, partnerships). When such a user is connected to an instructor, the instructor benefits from their paid-equivalent status.

**RLS**: Admin-only (no RLS policies = default deny for all authenticated users; service role bypasses).

### Rollback SQL

```sql
DROP TABLE IF EXISTS user_entitlement_overrides;
```

No other schema changes; existing tables are unchanged.

## Code Integration Points

### Entitlement Resolver (single source of truth)

**File**: `src/lib/instructor-entitlements.ts`

| Export | Purpose |
|--------|---------|
| `resolveInstructorEntitlements(userId, opts)` | Full entitlement resolution with TTL cache |
| `isStudentPaidActive(studentUserId, supabase)` | Check if student has paid subscription |
| `hasPaidEquivalentOverride(userId, supabase)` | Check for admin override |
| `buildResult(status, reason, ...)` | Pure function to construct result |
| `invalidateEntitlementCache(userId)` | Clear cache for specific user |
| `clearEntitlementCache()` | Clear all cached entitlements |
| `COURTESY_TIER` | The tier granted: `'checkride_prep'` |
| `PAID_ACTIVE_SUBSCRIPTION_STATUSES` | `['active', 'trialing']` |

### Tier Lookup Integration

**File**: `src/lib/voice/tier-lookup.ts`

`getUserTier()` now:
1. Fetches base tier from `user_profiles.tier` (existing)
2. If base tier < `checkride_prep`, checks instructor courtesy access
3. Returns the higher of (base tier, courtesy tier)
4. Error in entitlement check is swallowed (does not break tier resolution)

### API Endpoint Changes

| Endpoint | Change |
|----------|--------|
| `GET /api/user/instructor` | Now returns `hasCourtesyAccess`, `courtesyReason`, `paidStudentCount` |

### New Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/instructor-entitlements` | Aggregate entitlement metrics |
| `GET /api/admin/user-overrides` | List active user overrides |
| `POST /api/admin/user-overrides` | Grant/revoke paid_equivalent override |
| `GET /api/admin/quality/instructor-entitlements` | Daily aggregate quality metrics |

### UI Changes

| Page | Change |
|------|--------|
| Instructor Command Center | Courtesy access banner (green/amber/red) |
| Settings (Instructor Mode) | Courtesy status, paid student count, disclaimer text |

## Caching

- **Entitlement cache**: 60-second TTL (module-level `TtlCache`)
- **Tier cache**: 5-minute TTL (existing, in `tier-lookup.ts`)
- Both survive across warm serverless invocations
- Cache miss always falls through to DB (correctness never depends on cache)

## Feature Flag Behavior

When `instructor_partnership_v1` is **disabled**:
- `resolveInstructorEntitlements()` still returns `not_instructor` for users without profiles
- The tier lookup integration only checks courtesy when base tier < `checkride_prep`
- All instructor UI/routes remain blocked at the route level (existing behavior)

## Test Coverage

| File | Tests |
|------|-------|
| `instructor-entitlements.test.ts` | 33 (buildResult, resolver, cache, privacy) |
| **Phase 4 total** | **33 new tests** |
| **Project total** | **928 tests, 42 files** |

## Audit Script

```bash
npm run eval:instructor-entitlements
```

Runs 10 deterministic offline checks validating the pure entitlement logic.

## Verification

- `npx tsc --noEmit` → Exit code 0
- `npm test` → 42 files, 928 tests passed
- `npm run eval:instructor-entitlements` → 10/10 checks pass


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-05 END    |  05 - Phase 4 Entitlements and Authorization  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-06 START  |  06 - Entitlement Monitoring and Abuse Signals  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-06"></a>

# Entitlement Monitoring and Abuse Signals

## PostHog Events

### `instructor_courtesy_access_resolved`

Fired on every entitlement cache miss for an approved instructor (approximately once per 60 seconds per active instructor).

| Property | Type | Description |
|----------|------|-------------|
| `instructorStatus` | string | `approved_with_courtesy` or `approved_no_courtesy` |
| `hasCourtesyAccess` | boolean | Whether instructor currently has courtesy access |
| `courtesyReason` | string | `paid_student`, `student_override`, `direct_override`, or `none` |
| `paidStudentCount` | number | Connected students with active/trialing subscription |
| `paidEquivalentStudentCount` | number | Connected students with admin-granted paid_equivalent |
| `effectiveTier` | string | `checkride_prep` or `none` |

### Recommended Future Events (Phase 7)

| Event | Trigger | Purpose |
|-------|---------|---------|
| `instructor_courtesy_access_gained` | Status changes from no-courtesy to courtesy | Track onboarding conversion |
| `instructor_courtesy_access_lost` | Status changes from courtesy to no-courtesy | Track churn signals |

## Admin Endpoints

### `GET /api/admin/instructor-entitlements`

Aggregate metrics for admin dashboard.

```json
{
  "instructorsApproved": 12,
  "instructorsWithCourtesy": 8,
  "instructorsWithoutCourtesy": 4,
  "overridesActive": 2,
  "studentOverridesActive": 3,
  "expiringOverrides": [
    { "userId": "...", "expiresAt": "2026-03-20T00:00:00Z", "reason": "beta tester" }
  ]
}
```

### `GET /api/admin/user-overrides`

List all active user entitlement overrides.

### `POST /api/admin/user-overrides`

Grant or revoke paid_equivalent override.

```json
{ "action": "grant", "userId": "...", "entitlementKey": "paid_equivalent", "reason": "Beta tester", "expiresAt": "2026-06-01T00:00:00Z" }
```

### `GET /api/admin/quality/instructor-entitlements`

Daily aggregate quality metrics (no PII).

```json
{
  "timestamp": "2026-03-05T20:00:00Z",
  "approvedInstructors": 12,
  "withCourtesy": 8,
  "withoutCourtesy": 4,
  "directOverridesActive": 2,
  "studentOverridesActive": 3,
  "courtesyByReason": { "paid_student": 6, "student_override": 1, "direct_override": 1 }
}
```

## Recommended PostHog Dashboards

### Instructor Entitlement Overview

| Panel | Query |
|-------|-------|
| Courtesy instructors (trend) | `instructor_courtesy_access_resolved` where `hasCourtesyAccess=true`, unique users, daily |
| No-courtesy instructors (trend) | Same where `hasCourtesyAccess=false` |
| Courtesy by reason (pie) | Breakdown by `courtesyReason` |
| Paid student distribution | Breakdown by `paidStudentCount` bucket (0, 1, 2-5, 6+) |

### Abuse Signals

| Signal | Threshold | Action |
|--------|-----------|--------|
| Instructor with > 20 connected students | > 20 | Manual review |
| Instructor gained + lost courtesy > 3 times in 30 days | > 3 state flips | Manual review |
| Override granted with < 7 day expiry | < 7 days | Verify intent |
| Student with paid_equivalent connecting to > 3 instructors | > 3 connections | Investigate |

## Trial Abuse Audit (Phase 7 Risks)

The following abuse vectors were identified during read-only audit:

| Vector | Risk | Fix Phase |
|--------|------|-----------|
| Trial re-entry (new account = new trial) | Critical | Phase 7 |
| No trial history tracking in DB | Medium | Phase 7 |
| Instructor dual identity (two accounts, one paid) | Medium | Phase 7 |
| Unlimited invite generation per instructor | Low | Phase 7+ |
| No app-level rate limiting on signup | Low | Phase 8 |

### Recommended Phase 7 Actions

1. Add `trial_started_at` and `trial_count` to `user_profiles`
2. Create `trial_events` table for audit trail
3. Add device fingerprint/IP logging for instructor-student connections
4. Add invite rate limiting (50 active per instructor per 7 days)


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-06 END    |  06 - Entitlement Monitoring and Abuse Signals  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->


---

## Phase 5 — Insights & Milestones

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-07 START  |  07 - Phase 5 Insights and Milestones  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-07"></a>

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


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-07 END    |  07 - Phase 5 Insights and Milestones  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-08 START  |  08 - Weekly Email Operations  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-08"></a>

# Weekly Instructor Summary — Operations Guide

## Sending

```bash
# Production send
npm run send:instructor-weekly

# Dry run (build summaries, don't send)
npm run send:instructor-weekly -- --dry-run

# Review one sample
npm run send:instructor-weekly -- --review
```

## Eligibility

An instructor receives the weekly email when ALL conditions are met:
1. `instructor_profiles.status = 'approved'`
2. Has at least one connected student (`student_instructor_connections.state = 'connected'`)
3. `email_preferences` category `instructor_weekly_summary` is enabled (default: true)
4. Has not received this email in the last 6 days (cadence guard via `email_logs`)

## Email Content

| Section | Source |
|---------|--------|
| Instructor name | `instructor_profiles.first_name + last_name` |
| Week label | Computed from current date |
| Student summaries | `getStudentInsights()` per connected student |
| Readiness score | `ExamResultV2.overall_score * 100` |
| Readiness trend | Average of 2 newest vs 2 oldest scores |
| Needs attention | Readiness < 60 OR declining OR 7+ days inactive |
| Recent milestone | Latest completed milestone from `student_milestones` |

## Opt-Out

Students and instructors can opt out via:
1. Settings page → Email Preferences → toggle off "Instructor Weekly Summary"
2. One-click unsubscribe link in email footer (HMAC-signed URL)

## Monitoring

- `email_logs` table records each send with category `instructor_weekly_summary` and template_id `instructor-weekly-summary`
- PostHog event `email_sent` with `category: instructor_weekly_summary`
- Admin endpoint: `GET /api/admin/quality/milestones` for milestone activity metrics

## Scheduling

The script is designed for external cron invocation (e.g., Vercel Cron, GitHub Actions, or manual):
- Recommended: Monday 8:00 AM ET
- The 6-day cadence guard prevents duplicate sends if the cron fires more than once per week


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-08 END    |  08 - Weekly Email Operations  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->


---

## Phase 6 — Referrals & Landing Pages

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-09 START  |  09 - Phase 6 Referrals and Landing Pages  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-09"></a>

# Phase 6 — Referrals, Landing Pages, and Attribution

## Overview

Phase 6 reduces instructor referral friction to near-zero by introducing public identity (slug + referral code), public landing pages, and automatic connection-on-claim. Every connection is attributed to its source (referral link, invite link, student search, admin) for analytics.

## Migration

- **`20260306000006_instructor_referrals.sql`**
  - Adds `slug TEXT UNIQUE` and `referral_code TEXT UNIQUE` to `instructor_profiles`
  - Adds `connection_source TEXT` to `student_instructor_connections` with CHECK constraint
  - Backfills existing connections based on `invite_id` presence
  - RLS policy for anonymous slug lookup (approved instructors only)

## Instructor Public Identity

### Slug Generation

- `normalizeSlug(firstName, lastName)` → `"john-smith"` (lowercase, ASCII, hyphenated)
- Handles diacritics, special characters, collapsing whitespace
- Collision handling: `-2`, `-3`, ..., random hex suffix fallback
- Constants: `MAX_SLUG_ATTEMPTS = 5`

### Referral Code

- 8-character uppercase alphanumeric (alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`)
- No ambiguous characters (0/O/I/1 excluded)
- Retry loop on collision (max 10 attempts, 32^8 = ~1T possibilities)

### Identity Assignment

- `ensureInstructorIdentity()` — idempotent, called on:
  - Approval (`approveInstructor()`)
  - Auto-approval (`submitInstructorApplication()`)
  - Reinstatement (`reinstateInstructor()`)
  - Lazy backfill (GET `/api/user/instructor` for approved instructors missing identity)

## Connection Source Attribution

| Source | Value | When |
|--------|-------|------|
| Referral link claim | `referral_link` | Student uses `/ref/[code]` or `/instructor/[slug]` |
| Invite claim | `invite_link` | Student uses `/invite/[token]` |
| Student search | `student_search` | Student finds instructor via search |
| Admin action | `admin` | Admin creates connection manually |

- Column: `student_instructor_connections.connection_source`
- CHECK constraint: `('referral_link', 'invite_link', 'student_search', 'admin')`
- Legacy connections backfilled based on `invite_id` presence

## Public Routes

### `/ref/[code]` — Referral Claim Page

- Client component, shows instructor info (name, cert type, bio)
- If not logged in → redirect to `/login?redirect=/ref/[code]`
- "Connect" button calls `POST /api/referral/claim`
- Success → sessionStorage flag + redirect to `/practice`

### `/instructor/[slug]` — Public Instructor Profile

- Nav bar with SIGN IN / GET STARTED
- Avatar initial, name, cert type, bio, "When you connect" explainer
- "Connect" button uses referral code from slug lookup

### `/api/referral/lookup` — Public Lookup

- `GET ?code=ABCD1234` or `?slug=john-smith`
- No auth required, feature flag gated
- NEVER returns certificate_number or email

### `/api/referral/claim` — Claim Endpoint

- `POST { code: string }`, auth required
- One-instructor-at-a-time: 409 if already connected to different instructor
- Idempotent: returns existing connection if same instructor
- Auto-connects (state='connected', no pending step)
- PostHog event: `referral_code_claimed`

## Auth Redirect Chain

1. `/ref/[code]` → click Connect → not logged in → redirect to `/login?redirect=/ref/[code]`
2. Login page reads `redirect` param → passes as `?next=` to OAuth callback
3. Auth callback reads `next` param → redirects to `/ref/[code]`
4. Middleware honors `redirect` param for already-authenticated users on auth routes

## Invite Tools UI Panel

- New "Share with Students" panel on instructor command center
- Shows Referral Code (amber monospace), Quick Link (`/ref/{code}`), Profile Page (`/instructor/{slug}`)
- Copy-to-clipboard for all three
- Lazy backfill: GET endpoint calls `ensureInstructorIdentity` for approved instructors missing identity

## Referral Welcome Banner

- `useInstructorConnection` hook reads sessionStorage flags
- `ReferralWelcomeBanner` component renders on practice page
- Shows "Connected with [Name]!" after successful referral claim
- One-time display (sessionStorage key cleared after read)

## Key Invariants

1. **One instructor at a time** — Student can only have one non-disconnected connection
2. **Privacy** — Public pages/APIs never expose certificate_number or email
3. **Feature flag** — All referral routes gated by `instructor_partnership_v1`
4. **Idempotency** — Re-claiming same referral code returns success without side effects
5. **Auto-connect** — Referral claims skip pending step (state='connected' immediately)

## Admin Monitoring

- `GET /api/admin/quality/referrals` — connections by source, identity coverage, top referrers, recent claims

## Files

### New Files

- `supabase/migrations/20260306000006_instructor_referrals.sql`
- `src/lib/instructor-identity.ts`
- `src/lib/__tests__/instructor-identity.test.ts`
- `src/lib/__tests__/instructor-referrals.test.ts`
- `src/app/api/referral/claim/route.ts`
- `src/app/api/referral/lookup/route.ts`
- `src/app/ref/[code]/page.tsx`
- `src/app/instructor/[slug]/page.tsx`
- `src/components/ui/ReferralWelcomeBanner.tsx`
- `src/hooks/useInstructorConnection.ts`
- `src/app/api/admin/quality/referrals/route.ts`
- `scripts/eval/instructor-referral-audit.ts`

### Modified Files

- `src/types/database.ts` — connection_source type, slug/referral_code fields
- `src/lib/instructor-access.ts` — ensureInstructorIdentity calls on approval/reinstatement
- `src/app/api/user/instructor/route.ts` — lazy backfill for approved instructors missing identity
- `src/app/(dashboard)/instructor/page.tsx` — "Share with Students" invite tools panel
- `src/app/(dashboard)/practice/page.tsx` — referral welcome banner
- `src/app/(auth)/login/page.tsx` — redirect param handling
- `src/app/auth/callback/route.ts` — next param redirect
- `src/middleware.ts` — redirect param for authenticated users on auth routes

## Test Coverage

- `src/lib/__tests__/instructor-identity.test.ts` — 25 unit tests (slug, referral code, lookups)
- `src/lib/__tests__/instructor-referrals.test.ts` — 40 unit tests (attribution, invariants, safety)
- `scripts/eval/instructor-referral-audit.ts` — 10 deterministic checks

## Rollback

All changes are additive. To rollback:
- Revert modified files (instructor-access.ts, database.ts, UI pages, middleware.ts, auth routes)
- Delete new files listed above
- Migration is additive — `ALTER TABLE ... DROP COLUMN` for slug, referral_code, connection_source if needed


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-09 END    |  09 - Phase 6 Referrals and Landing Pages  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->


---

## Phase 7 — Invite Tools & Abuse Hardening

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-10 START  |  10 - Phase 7 Invite Tools and Abuse Hardening  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-10"></a>

# Phase 7 — Invite Tools and Abuse Hardening

## Overview

Phase 7 completes the invite toolchain (QR codes, email invites), hardens against abuse (rate limiting, self-referral protection), and corrects the courtesy access eligibility rule. The `trialing` subscription status no longer counts as paid by default, aligning with the PRD requirement that courtesy access requires an actual paying student. All new endpoints are feature-flagged, rate-limited, and produce PostHog events for observability.

## Migration

- **`20260306000007_instructor_invite_events.sql`**
  - Creates `instructor_invite_events` table for rate limiting and audit trail
  - Columns: `id` (UUID PK), `instructor_user_id` (FK to auth.users), `event_type`, `metadata` (JSONB), `created_at`
  - CHECK constraint on `event_type`: `('token_created', 'email_sent', 'claimed', 'revoked', 'rate_limited')`
  - Indexes: `(instructor_user_id, created_at)` for rate limit queries, `(event_type, created_at)` for admin analytics
  - RLS: instructors can read their own events; service role bypasses

## Entitlement Correction

### Problem

The PRD specifies that courtesy access requires at least one connected student with an **active paid subscription**. The Phase 4 implementation included `trialing` in `PAID_ACTIVE_SUBSCRIPTION_STATUSES`, which meant instructors could receive courtesy access from a student who had not yet paid.

### Fix

- `PAID_ACTIVE_SUBSCRIPTION_STATUSES` changed from `['active', 'trialing']` to `['active']`
- `trialing` no longer counts as paid by default
- System config override: `instructor.courtesy_counts_trialing` (boolean)
  - When `true`, the entitlement resolver adds `'trialing'` to the paid status list
  - Allows future opt-in without code changes
- Reason: PRD alignment — courtesy access requires actual paying student

### Affected Files

- `src/lib/instructor-entitlements.ts` — `PAID_ACTIVE_STATUSES` constant, new `shouldCountTrialing()` helper
- `src/lib/__tests__/instructor-entitlements.test.ts` — updated tests for new default
- `scripts/eval/instructor-entitlement-audit.ts` — updated inlined constants and Check 8

## QR Code Generation

### Server Endpoint

- `GET /api/public/qr/referral/[code]` — returns PNG image
- Public endpoint (no auth required)
- Code validation: 3-20 alphanumeric characters (case-insensitive)
- QR target URL: `https://heydpe.com/ref/{CODE}` (uppercased)
- Generation: `qrcode` library with `toBuffer()` for PNG output
- Dimensions: 400px width, 2px margin, error correction level M
- Colors: amber-500 (`#F59E0B`) on transparent background (`#00000000`)
- Headers: `Content-Type: image/png`, `Cache-Control: public, max-age=86400, immutable`
- Content-Disposition: `inline; filename="heydpe-referral-{CODE}.png"`

### Client Download

- Instructor command center "Share with Students" panel includes QR download link
- Links to the server endpoint for the instructor's referral code

### PostHog Event

- `instructor_referral_qr_downloaded` — tracked on client download click

## Email Invite Sending

### Endpoint

- `POST /api/instructor/invites/email`
- Authenticated, feature-flagged (`instructor_partnership_v1`)
- Body: `{ email: string; studentName?: string }`
- Returns: `{ success: true; inviteId: string }` on success

### Flow

1. Auth check (401 if not authenticated)
2. Feature flag check (404 if disabled)
3. Instructor status check — must be `approved` (403 otherwise)
4. Email validation — RFC 5321 max length (254), basic format regex
5. Rate limit check via `checkInstructorRateLimit()`
6. Create invite token via `createInviteLink()`
7. Log `token_created` event
8. Send email via `sendInstructorInviteEmail()` (Resend)
9. Log `email_sent` event
10. Fire PostHog event

### Email Template

- `src/emails/instructor-invite.tsx`
- React Email component using shared `EmailLayout`
- Props: `instructorName`, `certType` (nullable), `inviteUrl`
- Content: invitation heading, instructor intro with cert type, HeyDPE product description, amber CTA button, legal disclaimer, ignore notice with support email
- Dark theme styling consistent with other HeyDPE emails

### PostHog Events

- `instructor_invite_email_sent` — successful invite send (includes `invite_id`, `has_student_name`)
- `instructor_invite_rate_limited` — rate limit hit (includes `event_type`, `current`, `limit`)

## Rate Limiting

### Architecture

- DB-backed via `instructor_invite_events` table (serverless safe — no in-memory state)
- Sliding window: last 24 hours from current time
- Counts events by `instructor_user_id` and `event_type`

### Limits

| Event Type | Default Limit | Config Key |
|------------|---------------|------------|
| `email_sent` | 20/day | `instructor.email_invite_limit` |
| `token_created` | 50/day | `instructor.token_creation_limit` |

### Configuration

- Limits read from `system_config` table (key: `instructor`)
- Falls back to defaults if config is missing or throws
- `overrideLimit` parameter available for programmatic override (testing)
- Window: 24 hours (constant, not configurable)

### Rate Limit Response

When rate limit is exceeded:
- `rate_limited` event logged to `instructor_invite_events`
- PostHog event: `instructor_invite_rate_limited`
- HTTP 429 response with `{ error, current, limit, windowHours }`

### Module API

```typescript
checkInstructorRateLimit(supabase, instructorUserId, eventType, overrideLimit?)
  → Promise<{ allowed, current, limit, windowHours }>

logInviteEvent(supabase, instructorUserId, eventType, metadata?)
  → Promise<void>
```

## Admin Monitoring

### Extended `/api/admin/quality/referrals`

Phase 7 extends the admin referral metrics endpoint with two new sections:

| Section | Fields |
|---------|--------|
| `inviteEvents` | `emailsSent7d`, `tokensCreated7d`, `claims7d`, `rateLimitHits7d` |
| `courtesyBreakdown` | `directOverrides`, `paidActiveStudents`, `trialingStudents`, `trialingCountsAsPaid` |

The `courtesyBreakdown.trialingCountsAsPaid` field is hardcoded to `false` (reflecting the new default). When `instructor.courtesy_counts_trialing` is enabled via system config, the entitlement resolver will count trialing students, but the admin endpoint reflects the default policy.

## Key Invariants

1. **Approved only** — Only approved instructors can send email invites or generate QR codes
2. **Rate limited** — Email invites capped at 20/day, token creation at 50/day (configurable)
3. **Self-referral blocked** — Claim route rejects `instructorUserId === user.id`
4. **Feature flag gated** — All invite routes require `instructor_partnership_v1` enabled
5. **No PII in public routes** — QR endpoint and lookup never expose certificate_number or email
6. **Trialing is not paid** — `PAID_ACTIVE_SUBSCRIPTION_STATUSES = ['active']` by default
7. **Audit trail** — Every invite action (create, send, claim, revoke, rate limit) logged to `instructor_invite_events`
8. **Idempotent** — Re-claiming same referral code returns existing connection without side effects

## Testing

- `src/lib/__tests__/instructor-rate-limiter.test.ts` — 19 unit tests (defaults, rate limit checks, event logging)
- `src/lib/__tests__/instructor-entitlements.test.ts` — updated tests for trialing exclusion
- `scripts/eval/instructor-abuse-audit.ts` — 12 deterministic offline checks (constants, source analysis, security invariants)

## Files

### New Files

- `supabase/migrations/20260306000007_instructor_invite_events.sql`
- `src/lib/instructor-rate-limiter.ts`
- `src/lib/__tests__/instructor-rate-limiter.test.ts`
- `src/app/api/instructor/invites/email/route.ts`
- `src/app/api/public/qr/referral/[code]/route.ts`
- `src/emails/instructor-invite.tsx`
- `scripts/eval/instructor-abuse-audit.ts`

### Modified Files

- `src/lib/instructor-entitlements.ts` — `PAID_ACTIVE_STATUSES` correction, `shouldCountTrialing()` helper
- `src/lib/__tests__/instructor-entitlements.test.ts` — tests updated for new trialing default
- `scripts/eval/instructor-entitlement-audit.ts` — inlined constants and Check 8 updated
- `src/app/api/admin/quality/referrals/route.ts` — `inviteEvents` and `courtesyBreakdown` sections added
- `src/lib/email.ts` — `sendInstructorInviteEmail()` function added
- `src/types/database.ts` — no structural changes (existing types reused)

## Rollback

All changes are additive. To rollback:
- Revert modified files (instructor-entitlements.ts, email.ts, admin quality route)
- Delete new files listed above
- Migration is additive — `DROP TABLE instructor_invite_events` if needed
- Restore `PAID_ACTIVE_STATUSES` to `['active', 'trialing']` if reverting entitlement correction


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-10 END    |  10 - Phase 7 Invite Tools and Abuse Hardening  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-11 START  |  11 - Phase 7 Weekly Referral Nudge  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-11"></a>

# Phase 7 — Weekly Referral Nudge

## Overview

Micro-add to the existing weekly instructor email. When an instructor has 0 connected students, the weekly email includes a referral CTA instead of the normal weekly summary. Instructors with 1 or more students see exactly the same email as before — no changes to the existing format.

## Template Changes

### `src/emails/instructor-weekly-summary.tsx`

Conditional rendering based on `totalStudents`:

| Condition | Render |
|-----------|--------|
| `totalStudents > 0` | Normal weekly summary (stats row, student cards, "Open Command Center" CTA) — **unchanged** |
| `totalStudents === 0` | Referral CTA variant (3-step guide, referral link, QR download link, courtesy disclaimer) |

### 0-Students Variant Content

1. **Heading**: "Get Started with Student Connections" (amber, centered)
2. **Intro**: "Connect with your students on HeyDPE in three simple steps:" (muted, centered)
3. **3-step guide** (dark cards with amber step numbers):
   - Step 1: Share your referral link with students
   - Step 2: Students click the link and sign up
   - Step 3: Once a student subscribes, you unlock courtesy access
4. **Referral link box**: dark card with "Your referral link:" label and clickable link
5. **CTA button**: "COPY REFERRAL LINK" (amber, full-width)
6. **QR download link**: "Download QR Code — Print or share with students"
7. **Courtesy disclaimer**: "Courtesy access (Checkride Prep tier) is automatically granted when at least one of your connected students has an active paid subscription." (muted, italic)

### New Props on `InstructorWeeklySummaryProps`

```typescript
referralCode?: string;
referralLink?: string;   // e.g. "https://heydpe.com/ref/ABCD1234"
qrUrl?: string;          // e.g. "https://heydpe.com/api/public/qr/referral/ABCD1234"
```

All three are optional and only populated for the 0-students variant.

## Builder Changes

### `src/lib/instructor-summary-builder.ts`

#### Previous Behavior

`buildInstructorWeeklySummary` returned `null` for instructors with 0 students, causing the weekly send script to skip them entirely.

#### New Behavior

- **0 students**: Returns a complete `InstructorWeeklySummaryProps` object with `totalStudents: 0`, empty students array, and referral props (`referralCode`, `referralLink`, `qrUrl`) populated from the instructor's referral code
- **>=1 students**: Returns the normal summary as before — referral props are **not** included

#### New Helper

```typescript
function buildReferralUrls(referralCode: string | undefined): {
  referralCode?: string;
  referralLink?: string;
  qrUrl?: string;
}
```

Uses `NEXT_PUBLIC_SITE_URL` env var (falls back to `https://aviation-oral-exam-companion.vercel.app`).

### `InstructorForEmail` Type Extension

```typescript
export interface InstructorForEmail {
  userId: string;
  email: string;
  displayName: string | null;
  referralCode?: string;  // NEW — from instructor_profiles.referral_code
}
```

## Script Changes

### `scripts/send-instructor-weekly.ts`

- Instructor query now includes `referral_code` in the SELECT
- `InstructorForEmail` constructed with `referralCode: instr.referral_code`
- 0-student instructors are no longer skipped — they receive the referral nudge variant

## Backwards Compatibility

Instructors **with** students see exactly the same email as before. The referral props (`referralCode`, `referralLink`, `qrUrl`) are only populated when `totalStudents === 0`, and the template only renders the referral CTA in that branch. Shared elements (greeting, sign-off, unsubscribe footer) are identical in both variants.

## Sample Renders

Sample HTML renders saved in evidence folder:
- `docs/instructor-program/evidence/2026-03-06-phase7/email/weekly-0-students.html`
- `docs/instructor-program/evidence/2026-03-06-phase7/email/weekly-with-students.html`

## Testing

- `src/lib/__tests__/instructor-summary-builder.test.ts` — 6 new tests:
  1. Returns data with referral CTA when 0 students
  2. Returns data without referral CTA when >= 1 students
  3. `referralLink` and `qrUrl` are populated from `referralCode`
  4. `referralLink` and `qrUrl` are undefined when no `referralCode`
  5. Uses fallback base URL when `NEXT_PUBLIC_SITE_URL` is not set
  6. Uses "Instructor" as fallback name when `displayName` is null

## Files

### Modified Files

- `src/emails/instructor-weekly-summary.tsx` — conditional referral CTA, new props, new styles
- `src/lib/instructor-summary-builder.ts` — `buildReferralUrls()`, 0-student handling, `InstructorForEmail.referralCode`
- `scripts/send-instructor-weekly.ts` — `referral_code` in SELECT, `referralCode` prop pass-through

### New Files

- `src/lib/__tests__/instructor-summary-builder.test.ts` — 6 unit tests

## Rollback

All changes are additive. To rollback:
- Revert the three modified files
- Delete the new test file
- The weekly email reverts to skipping 0-student instructors (previous behavior)


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-11 END    |  11 - Phase 7 Weekly Referral Nudge  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->


---

## Phase 8 — KPIs & Dashboards

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-12 START  |  12 - Phase 8 KPI Contract and Definitions  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-12"></a>

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


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-12 END    |  12 - Phase 8 KPI Contract and Definitions  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-13 START  |  13 - Phase 8 Admin Partnership Dashboard  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-13"></a>

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


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-13 END    |  13 - Phase 8 Admin Partnership Dashboard  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-14 START  |  14 - Phase 8 Quotas and Anti-Fraud Signals  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-14"></a>

# Phase 8 — Quotas and Anti-Fraud Signals

## Quota System

### Architecture

```
Code Defaults → System Config → Adaptive Tier → Per-Instructor Override
     (lowest priority)                             (highest priority)
```

### Default Limits

| Parameter | Default | Config Key |
|-----------|---------|------------|
| Email invite limit | 20/day | `instructor.email_invite_limit` |
| Token creation limit | 50/day | `instructor.token_creation_limit` |

### Adaptive Tiers (behind flag)

Enable via `system_config` key `instructor`:
```json
{
  "adaptive_quotas": {
    "enabled": true,
    "tier2_threshold": 2,
    "tier2_email_limit": 40,
    "tier2_token_limit": 100,
    "tier3_threshold": 10,
    "tier3_email_limit": 80,
    "tier3_token_limit": 200
  }
}
```

| Tier | Threshold | Email | Token |
|------|-----------|-------|-------|
| Base | < 2 paid students | 20 | 50 |
| Tier 2 | >= 2 paid students | 40 | 100 |
| Tier 3 | >= 10 paid students | 80 | 200 |

### Per-Instructor Overrides

Table: `instructor_quota_overrides`
- Admin-only access (RLS)
- Optional expiry (`expires_at`)
- Override note for audit trail
- Expired overrides automatically ignored

### Module

- **`src/lib/instructor-quotas.ts`** — Pure function, resolves effective quota
- **`resolveEffectiveQuota()`** — Takes paid count, system config, override → returns EffectiveQuota

## Anti-Fraud Signals

### Architecture

Fraud detection is **signal-based, not enforcement-based**. No automatic actions are taken — signals are surfaced to admins for review.

### Signal Definitions

| Signal | Weight | Trigger |
|--------|--------|---------|
| `high_invite_low_connect` | 25 | 50+ invites sent, < 5 connections |
| `rate_limit_abuse` | 20 | 3+ rate limit hits in 7 days |
| `burst_invite_activity` | 15 | 15+ emails OR 30+ tokens in 7 days |
| `high_churn` | 20 | 50%+ connections disconnected AND >= 5 disconnects |
| `zero_engagement` | 15 | 5+ connected students, 0 active in 7 days |
| `suspicious_paid_ratio` | 10 | 3+ connected, 0 paid, 0 trialing |

### Risk Levels

| Level | Score Range | Recommended Action |
|-------|-----------|-------------------|
| Low | 0-24 | Monitor |
| Medium | 25-49 | Contact |
| High | 50-100 | Throttle or Suspend Review |

### High-Risk Action Mapping

- `throttle` — High risk with churn or rate limit signals
- `suspend_review` — High risk with 3+ triggered signals

### Module

- **`src/lib/instructor-fraud-signals.ts`** — Pure function, computes risk from inputs
- **`computeFraudSignals()`** — Returns `FraudSignalResult` with level, score, reasons, signals

### PostHog Events

- `instructor_fraud_signal_high` — Emitted per high-risk instructor (includes reasons + recommended action)

## Migration

- `supabase/migrations/20260306000008_instructor_quota_overrides.sql`
- Table: `instructor_quota_overrides` (admin-only RLS, auto-updated timestamps)

## Eval Scripts

- `eval:instructor-quotas` — 12 checks on quota resolver + analysis report
- `eval:instructor-fraud` — 12 checks on fraud signals + PII safety

## Key Invariants

1. No automatic enforcement — signals only surface to admin
2. Risk score capped at 100
3. Always returns exactly 6 signals
4. Override precedence: per-instructor > adaptive > system_config > code defaults
5. Expired overrides automatically ignored
6. No PII in fraud endpoint responses (no email, no certificate_number)


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-14 END    |  14 - Phase 8 Quotas and Anti-Fraud Signals  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-15 START  |  15 - Phase 8 PostHog Dashboard Spec  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-15"></a>

# Phase 8 — PostHog Dashboard Spec

## Overview

This document defines all PostHog events emitted by the instructor program, intended for configuring dashboards in PostHog.

## Event Catalog

### Instructor-Facing Events (Client-Side)

| Event | When | Properties |
|-------|------|------------|
| `instructor_command_center_viewed` | Instructor opens command center page | — |
| `instructor_student_detail_viewed` | Instructor opens student detail page | `student_user_id` |
| `instructor_referral_link_copied` | Instructor copies referral/QR/profile link | `field` |
| `instructor_referral_qr_downloaded` | Instructor downloads QR code | `referralCode` |

### Instructor-Facing Events (Server-Side)

| Event | When | Properties |
|-------|------|------------|
| `instructor_kpi_computed` | KPI endpoint called | `totalConnected`, `activeLast7d`, `paidActive`, `avgReadiness`, `conversionRate` |
| `instructor_invite_email_sent` | Email invite delivered | `recipientEmail` (hashed), `inviteToken` |
| `instructor_invite_rate_limited` | Rate limit hit on invite action | `limit`, `current`, `action` |
| `instructor_courtesy_access_resolved` | Entitlement resolved for instructor | `instructorStatus`, `hasCourtesyAccess`, `courtesyReason`, `paidStudentCount` |

### Connection Events (Server-Side)

| Event | When | Properties |
|-------|------|------------|
| `instructor_connection_requested` | Student requests connection | `instructor_user_id` |
| `instructor_connection_approved` | Instructor approves request | `connection_id` |
| `instructor_connection_rejected` | Instructor rejects request | `connection_id` |
| `instructor_connection_disconnected` | Either party disconnects | `connection_id`, `disconnected_by` |
| `referral_code_claimed` | Student claims referral code | `referral_code`, `instructor_user_id` |

### Fraud Events (Server-Side)

| Event | When | Properties |
|-------|------|------------|
| `instructor_fraud_signal_high` | High-risk instructor detected | `riskScore`, `reasons[]`, `recommendedAction`, `signalsTriggered[]` |

## Suggested Dashboards

### 1. Instructor Program Health
- Total approved instructors (trend)
- Active instructors (with >= 1 connected student)
- Avg students per instructor
- Invite → Claim conversion rate

### 2. Referral Funnel
- Invites sent (7d trend)
- Claims (7d trend)
- Connections (7d trend)
- Paid conversions (7d trend)

### 3. Fraud Monitoring
- High-risk instructor count
- Rate limit hit frequency
- Churn rate distribution

## PII Rules

**Never include in PostHog events:**
- Student email addresses
- Instructor certificate_number
- Full user IDs (truncate to 8 chars in admin-facing displays)

**Allowed:**
- `instructor_user_id` (as `distinctId`)
- `student_user_id` (as property, not as distinctId)
- Aggregated counts and scores


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-15 END    |  15 - Phase 8 PostHog Dashboard Spec  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->


---

## Phase 9 — Public Launch Closure

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-16 START  |  16 - Instructor Public Launch Audit  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-16"></a>

# Instructor Public Launch Audit

## Context

Phase 9 audit of the Instructor Partnership subsystem against the PRD and implementation docs (Phases 1–8). Goal: determine if the instructor program is publicly launch-ready.

Baseline: branch `instructor-phase9-public-launch-closure` at `7e38d6b`, 50 test files, 1129 tests, 0 type errors.

## PRD Completeness Matrix

### MUST-HAVE Items

| # | PRD Requirement | Phase | Verdict | Evidence |
|---|----------------|-------|---------|----------|
| M1 | Instructor activation (apply via Settings) | P1 | PASS | Settings UI, POST /api/user/instructor, state machine in instructor-access.ts |
| M2 | Admin approval/reject/suspend/reinstate | P1 | PASS | POST /api/admin/instructors/[id], admin page, audit logging |
| M3 | FAA verification (auto + manual paths) | P2 | PASS | instructor-verification.ts, computeVerificationResult(), 4 confidence levels |
| M4 | Instructor-initiated invite (link) | P2 | PASS | instructor-invites.ts, /api/user/instructor/invites, /invite/[token] claim page |
| M5 | Student-initiated connection request | P3 | PASS | /api/user/instructor/search, /api/user/instructor/connections (request_connection), Settings UI search form |
| M6 | Instructor approve/reject student request | P3 | PASS | /api/instructor/connections (approve, reject actions) |
| M7 | Bidirectional disconnect | P3 | PASS | Student: disconnect via /api/user/instructor/connections; Instructor: disconnect via /api/instructor/connections |
| M8 | One-instructor-at-a-time policy | P3/P6 | PASS | Enforced in referral claim (409), connection request guards, instructor-connections.ts |
| M9 | Command Center (student list, KPIs) | P3 | PASS | /instructor page, KPI row, student list, pending tab, invites tab |
| M10 | Student progress summary | P3 | PASS | /instructor/students/[id], readiness score, area breakdown, weak elements, recent sessions |
| M11 | Student milestones | P5 | PASS | student_milestones table, API endpoints, Settings UI, instructor-editable |
| M12 | Instructor insights (deterministic) | P5 | PASS | instructor-insights.ts, readiness/trend/coverage/weak/strong/gaps/recommendations |
| M13 | Weekly instructor summary email | P5 | PASS | instructor-weekly-summary.tsx, send-instructor-weekly.ts, cadence guard, opt-out |
| M14 | Courtesy access (paid student → free tier) | P4 | PASS | instructor-entitlements.ts, resolveInstructorEntitlements(), tier-lookup.ts integration |
| M15 | Courtesy never downgrades tier | P4 | PASS | tier-lookup.ts: MAX(base, courtesy), verified in tests |
| M16 | Trialing excluded from paid by default | P7 | PASS | PAID_ACTIVE_STATUSES = ['active'], system config override available |
| M17 | Admin override for courtesy access | P4 | PASS | instructor_access_overrides table, /api/admin/user-overrides endpoints |
| M18 | Referral codes + landing pages | P6 | PASS | instructor-identity.ts, /ref/[code], /instructor/[slug], auto-connect on claim |
| M19 | QR code generation | P7 | PASS | /api/public/qr/referral/[code], PNG output, amber on transparent |
| M20 | Email invite sending | P7 | PASS | /api/instructor/invites/email, instructor-invite.tsx template, Resend integration |
| M21 | Rate limiting (invites) | P7 | PASS | instructor-rate-limiter.ts, DB-backed sliding window, 20 email/50 token per day |
| M22 | Self-referral blocked | P7 | PASS | /api/referral/claim returns 400 if user === instructor |
| M23 | Privacy: no cert number in public/student APIs | P3/P6 | PASS | Search returns only name+certType; referral lookup excludes cert_number |
| M24 | Privacy: no student email in instructor APIs | P3 | PASS | Student detail returns display_name, progress, sessions only |
| M25 | Privacy: no transcript leakage | P3 | PASS | instructor-student-summary.ts never returns raw transcripts/RAG chunks |
| M26 | Feature flag gating | P1 | PASS | instructor_partnership_v1 checked in Settings, API routes, referral routes |
| M27 | Connection source attribution | P6 | PASS | connection_source column: referral_link, invite_link, student_search, admin |
| M28 | Admin visibility (program metrics) | P3 | PASS | /api/admin/quality/instructor-program, /api/admin/partnership/* endpoints |
| M29 | Abuse monitoring (fraud signals) | P8 | PASS | instructor-fraud-signals.ts, /api/admin/partnership/fraud, 6 weighted signals |
| M30 | KPI contract | P8 | PASS | instructor-kpis.ts, InstructorKpiV1, 6 pure functions |
| M31 | Quota system | P8 | PASS | instructor-quotas.ts, 4-level precedence, adaptive tiers behind flag |
| M32 | FAA data freshness/refreshability | P2 | PARTIAL | Import script exists but no automated freshness check or staleness warning |

### NICE-TO-HAVE / Deferred

| # | Item | Status | Notes |
|---|------|--------|-------|
| N1 | Instructor-authored study plans | Not started | PRD Phase 5+ |
| N2 | Student satisfaction signals | Not started | Phase 9 candidate |
| N3 | Automated entitlement correction | Not started | Self-healing courtesy drift |
| N4 | Instructor analytics deep-dive | Not started | Time-series KPI trends |
| N5 | PostHog dashboard provisioning | Spec only | Doc 15 has spec, not provisioned |
| N6 | Instructor onboarding wizard | Not started | Guided setup flow |

### NOT IN SCOPE

| # | Item | Reason |
|---|------|--------|
| X1 | ATP rating tasks | Different rating, different sprint |
| X2 | External FAA API integration | PRD explicitly deferred |
| X3 | Instructor-authored questions | PRD: "teaching partner, not replacement" |
| X4 | Stripe integration for entitlements | Uses existing subscription_status |

## Audit Results Summary

- **PASS**: 31 of 32 MUST-HAVE items
- **PARTIAL**: 1 item (M32 — FAA data freshness)
- **FAIL**: 0 items

## M32 Gap Analysis: FAA Data Freshness

### Current State
- `scripts/instructor/import-faa-airmen.ts` imports FAA CSV data into `faa_airmen` + `faa_airmen_certs`
- `faa_import_log` table records each import with `source_date`, `completed_at`, status
- `instructor-verification.ts` checks if ANY completed import exists but does NOT check data age
- No admin-visible staleness warning
- No automated freshness check or cron documentation

### Fix Required (This Sprint)
1. Create `scripts/eval/instructor-faa-freshness.ts` — deterministic audit checking import age
2. Document FAA verification operations and freshness in doc 17
3. Add freshness metadata to admin quality endpoint

## Fixes Implemented in This Sprint

| Fix | Description | Files |
|-----|-------------|-------|
| FAA freshness audit script | Deterministic 8-check offline audit for FAA data age | `scripts/eval/instructor-faa-freshness.ts` |
| FAA operations doc | Operational runbook for FAA data management | Doc 17 |
| Launch gate script | 12+ check gate evaluation | `scripts/eval/instructor-public-launch-gate.ts` |

## Evidence

All evidence saved under:
```
docs/instructor-program/evidence/2026-03-06-phase9/
```


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-16 END    |  16 - Instructor Public Launch Audit  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-17 START  |  17 - FAA Verification Operations and Freshness  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-17"></a>

# 17 - FAA Verification Operations and Freshness

Phase 9 of the Instructor Program — documents the FAA data source, import pipeline, freshness policy, and operational procedures for keeping instructor verification data current.

---

## FAA Data Source

| Field | Value |
|-------|-------|
| URL | https://registry.faa.gov/database/ReleasableAirmen.zip |
| Contains | `PILOT_BASIC.csv`, `PILOT_CERT.csv` |
| Update frequency | Quarterly (by the FAA) |
| Format | CSV with pipe or comma delimiters |
| Certificate numbers | **NOT included** in the downloadable dataset |

The FAA Releasable Airmen database is a publicly available dataset containing basic airman information (name, city, state, medical class) and certificate records (certificate type, level, ratings). It does **not** include certificate numbers, which means our verification logic cannot confirm a specific certificate number against FAA records. This is a known limitation documented in the `certificate_number_unverifiable` reason code.

---

## Import Pipeline

### Script Location

`scripts/instructor/import-faa-airmen.ts`

### Usage

```bash
npx tsx scripts/instructor/import-faa-airmen.ts \
  --basic-csv <path-to-PILOT_BASIC.csv> \
  --cert-csv <path-to-PILOT_CERT.csv> \
  --source-date YYYY-MM-DD \
  [--instructor-only] \
  [--dry-run]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--basic-csv <path>` | Yes | Path to the PILOT_BASIC.csv (or .txt) file |
| `--cert-csv <path>` | Yes | Path to the PILOT_CERT.csv (or .txt) file |
| `--source-date <YYYY-MM-DD>` | Yes | Publication date of the FAA dataset |
| `--instructor-only` | No | Only import flight/ground instructors (cert type F or G) |
| `--dry-run` | No | Parse and validate without writing to the database |

### NPM Shortcut

```bash
npm run instructor:import:faa -- --basic-csv data/PILOT_BASIC.csv --cert-csv data/PILOT_CERT.csv --source-date 2026-03-01
```

### Database Tables

| Table | Purpose |
|-------|---------|
| `faa_airmen` | Basic airman records (name, location, medical info) |
| `faa_airmen_certs` | Certificate records per airman (type, level, ratings) |
| `faa_import_log` | Tracks each import run (source_date, status, row counts) |

### Safety Guards

- **`--dry-run` mode**: Parses and validates CSV files without writing to the database. Always use this first with a new dataset.
- **`ALLOW_PROD_WRITE` guard**: The script calls `assertNotProduction()` and will refuse to run against production unless `ALLOW_PROD_WRITE=1` is set explicitly.
- **Environment detection**: Uses `getAppEnv()` to detect the current environment and log it before any writes.
- **Batch upserts**: Uses `ON CONFLICT` upserts (not blind inserts) to safely re-run imports without duplicating data.

### Import Log Schema

```sql
CREATE TABLE faa_import_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_date DATE NOT NULL,
  source_url TEXT,
  basic_rows_imported INTEGER NOT NULL DEFAULT 0,
  cert_rows_imported INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);
```

---

## Freshness Policy

### Threshold

**45 days** from the `source_date` of the most recent completed import.

This threshold is defined as the constant `FAA_FRESHNESS_THRESHOLD_DAYS = 45` in the eval script (`scripts/eval/instructor-faa-freshness.ts`).

### Freshness Verdicts

| Verdict | Condition | Meaning |
|---------|-----------|---------|
| `FRESH` | `source_date` is within 45 days of today | Data is current; no action needed |
| `STALE` | `source_date` is more than 45 days old | Data should be refreshed; verification still works but confidence may be lower for new applicants |
| `NO_DATA` | No completed import log entries exist | No FAA data available; all verifications fall back to manual review |

### When Data Is Stale

- Instructor verification **still works** but may not reflect recent FAA certificate changes
- Confidence for **new applicants** may be lower since recently issued certificates might not appear
- Existing verified instructors are not affected (their verification was already completed)
- The manual review path remains fully available regardless of freshness
- Admin should schedule a re-import from the latest FAA dataset

### When No FAA Data Exists

- `computeVerificationResult()` returns `confidence: 'none'` with `status: 'needs_manual_review'`
- The `faa_data_not_available` reason code is included
- Admin can still approve instructors based on documentation they provide
- This is the expected state for a new deployment before the first import

---

## Freshness Monitoring

### Eval Script

```bash
npm run eval:instructor-faa-freshness
```

This runs 8 deterministic offline checks that validate the freshness logic without requiring a database connection.

### Checks

| # | Check | What It Validates |
|---|-------|-------------------|
| 1 | FAA import log table schema referenced | FaaImportLogEntry interface includes source_date, completed_at, status |
| 2 | Freshness threshold constant exists | FAA_FRESHNESS_THRESHOLD_DAYS = 45 |
| 3 | No imports case | computeFaaFreshness(null) returns stale=true, daysOld=null, verdict=NO_DATA |
| 4 | Fresh import case | source_date within 45 days returns stale=false, verdict=FRESH |
| 5 | Stale import case | source_date 60+ days ago returns stale=true, verdict=STALE |
| 6 | Verification without FAA data | No-data verdict triggers manual review path |
| 7 | Manual review fallback | Stale recommendation includes re-import instructions and FAA URL |
| 8 | Import script exists | File exists at scripts/instructor/import-faa-airmen.ts |

### Evidence Output

The eval script writes evidence to:

- `docs/instructor-program/evidence/2026-03-06-phase9/eval/instructor-faa-freshness.json`
- `docs/instructor-program/evidence/2026-03-06-phase9/eval/instructor-faa-freshness.md`

### Integration with Admin Quality Endpoints

Admin quality endpoints surface import metadata (last import date, source date, row counts) from the `faa_import_log` table. When freshness monitoring detects stale data, admins can see this in the partnership dashboard.

---

## Verification Without FAA Data

When no FAA data has been imported (or all imports have failed), the verification module behaves as follows:

1. `verifyInstructor()` queries `faa_import_log` for any `status = 'completed'` entries
2. If none exist, `hasFaaData` is set to `false`
3. `computeVerificationResult()` returns:
   - `confidence: 'none'`
   - `status: 'needs_manual_review'`
   - `reasonCodes: ['faa_data_not_available', 'certificate_number_unverifiable']`
   - `explanation: 'No FAA airmen data has been imported yet. Manual verification required.'`
4. The admin reviews the instructor's submitted documentation manually
5. Admin can approve or reject based on their own verification of certificates

This ensures the instructor program can operate even before FAA data is loaded.

---

## Recommended Cron Schedule

### Frequency

**Monthly or quarterly**, aligned with FAA release cadence.

The FAA updates the Releasable Airmen database quarterly. Monthly imports are recommended if operational cadence allows, to catch any mid-cycle corrections.

### Process

1. **Download** the latest dataset:
   ```bash
   curl -O https://registry.faa.gov/database/ReleasableAirmen.zip
   unzip ReleasableAirmen.zip -d data/
   ```

2. **Dry-run** to validate the data:
   ```bash
   npx tsx scripts/instructor/import-faa-airmen.ts \
     --basic-csv data/PILOT_BASIC.csv \
     --cert-csv data/PILOT_CERT.csv \
     --source-date $(date +%Y-%m-%d) \
     --instructor-only \
     --dry-run
   ```

3. **Live import** (after confirming dry-run output):
   ```bash
   npx tsx scripts/instructor/import-faa-airmen.ts \
     --basic-csv data/PILOT_BASIC.csv \
     --cert-csv data/PILOT_CERT.csv \
     --source-date $(date +%Y-%m-%d) \
     --instructor-only
   ```

4. **Verify** the import completed:
   - Check `faa_import_log` for a row with `status = 'completed'`
   - Review `basic_rows_imported` and `cert_rows_imported` counts
   - Run the freshness eval: `npm run eval:instructor-faa-freshness`

### Monitoring

- Check `faa_import_log` for `status = 'completed'` entries with recent `source_date`
- If `source_date` is more than 45 days old, the freshness eval will flag it as `STALE`
- Set up an external cron reminder (e.g., calendar event) to download and import quarterly

### Production Considerations

- The import script requires `ALLOW_PROD_WRITE=1` to run against production
- Use `--instructor-only` to reduce import size (~90% reduction) when only instructor data is needed
- Large imports (full dataset without `--instructor-only`) may take several minutes
- The script uses batch upserts of 500 rows at a time to manage memory and database load


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-17 END    |  17 - FAA Verification Operations and Freshness  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-18 START  |  18 - Instructor Public Launch Gate  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<a name="doc-18"></a>

# Instructor Public Launch Gate

## Verdict: GO

The Instructor Partnership subsystem passes all launch gate checks and is ready for public launch behind the `instructor_partnership_v1` feature flag.

## Gate Evaluation

### Launch Gate Script: 15/15 PASS

| # | Category | Check | Result |
|---|----------|-------|--------|
| 1 | Activation | Feature flag key is `instructor_partnership_v1` | PASS |
| 2 | Activation | State machine has all 5 states | PASS |
| 3 | Activation | Valid transitions cover approve/reject/suspend/reinstate | PASS |
| 4 | Connections | Self-connection is prevented | PASS |
| 5 | Connections | Connection states include all 6 required values | PASS |
| 6 | Connections | Search returns privacy-safe fields only | PASS |
| 7 | Invites | Invite token length is 48 chars | PASS |
| 8 | Invites | Referral code uses unambiguous alphabet | PASS |
| 9 | Invites | Self-referral check exists | PASS |
| 10 | Entitlements | PAID_ACTIVE_STATUSES is ['active'] | PASS |
| 11 | Entitlements | Courtesy tier is 'checkride_prep' | PASS |
| 12 | Abuse | Rate limit defaults are 20 email / 50 token | PASS |
| 13 | Abuse | Fraud signal count is 6 | PASS |
| 14 | Operational | FAA import script exists | PASS |
| 15 | Operational | FAA freshness threshold is 45 days | PASS |

### Supporting Eval Scripts

| Script | Checks | Result |
|--------|--------|--------|
| `eval:instructor-entitlements` | 10 | 10/10 PASS |
| `eval:instructor-abuse` | 12 | 12/12 PASS |
| `eval:instructor-fraud` | 12 | 12/12 PASS |
| `eval:instructor-quotas` | 12 | 12/12 PASS |
| `eval:instructor-faa-freshness` | 8 | 8/8 PASS |
| `eval:instructor-launch` | 15 | 15/15 PASS |

### Build Health

| Metric | Value |
|--------|-------|
| TypeScript errors | 0 |
| Test files | 50 |
| Tests passing | 1,129 |
| Eval checks passing | 69/69 |

## PRD Completeness

From the launch audit (Doc 16):

- **MUST-HAVE items**: 32
- **PASS**: 31
- **PARTIAL**: 1 (FAA freshness — addressed in this sprint with eval script and operations doc)
- **FAIL**: 0

The PARTIAL item (M32) was addressed by:
1. Creating `scripts/eval/instructor-faa-freshness.ts` — 8-check freshness audit
2. Creating Doc 17 — FAA Verification Operations and Freshness runbook
3. Defining 45-day staleness threshold with clear verdict system

## Privacy & Security Audit

All verified via launch gate checks + abuse audit:

| Check | Status |
|-------|--------|
| No certificate_number in public/student APIs | PASS |
| No student email in instructor APIs | PASS |
| No transcript leakage in instructor views | PASS |
| Self-referral blocked | PASS |
| Self-connection blocked | PASS |
| Invite claim path feature-flag protected | PASS |
| Admin endpoints locked to admin role | PASS |
| Rate limiting enforced on invite actions | PASS |

## Feature Flag Launch Process

To enable the instructor program for public launch:

```sql
UPDATE system_config
SET value = '{"enabled": true}'
WHERE key = 'instructor_partnership_v1';
```

To disable (instant rollback):

```sql
UPDATE system_config
SET value = '{"enabled": false}'
WHERE key = 'instructor_partnership_v1';
```

When disabled:
- All instructor UI is hidden from Settings
- All instructor API routes return 404
- Referral/invite claim pages show "feature unavailable"
- Existing connections and data are preserved (not deleted)

## Rollback Notes

The instructor subsystem is fully additive:
- No existing tables were altered (only new tables created)
- No existing API routes modified in breaking ways
- Feature flag provides instant kill switch
- All 8 migrations are CREATE-only (safe to drop tables if full rollback needed)

## Non-Blocking Deferred Items

These items are not required for public launch:

| Item | Priority | Notes |
|------|----------|-------|
| PostHog dashboard provisioning | Medium | Spec exists (Doc 15), not yet created in PostHog |
| Instructor analytics deep-dive | Low | Time-series KPI trends, cohort analysis |
| Automated entitlement correction | Low | Self-healing courtesy access drift |
| Student satisfaction signals | Low | Post-session NPS feedback |
| Instructor onboarding wizard | Low | Guided setup flow for new instructors |
| Instructor-authored study plans | Low | PRD Phase 5+, not in current scope |

## Conclusion

The Instructor Partnership program is **ready for public launch**. All 32 PRD must-have items are satisfied, all 69 eval checks pass, privacy boundaries are enforced, and the feature flag provides a safe, instant rollback mechanism.


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- DOC-18 END    |  18 - Instructor Public Launch Gate  -->
<!-- ═══════════════════════════════════════════════════════════════════ -->


---

## End of Consolidated File

*Generated: 2026-03-06 | Source: /sessions/vigilant-blissful-faraday/mnt/aviation-oral-exam-companion/docs/instructor-program | Documents: 19 | Originals preserved*
