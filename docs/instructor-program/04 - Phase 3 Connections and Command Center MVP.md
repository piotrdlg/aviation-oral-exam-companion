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
