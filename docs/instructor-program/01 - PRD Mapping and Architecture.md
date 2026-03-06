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
