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
