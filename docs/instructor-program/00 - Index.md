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
