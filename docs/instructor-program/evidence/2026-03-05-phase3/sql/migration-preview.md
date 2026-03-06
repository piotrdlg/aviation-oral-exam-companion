# Migration Preview: 20260305000003_instructor_connections_mvp.sql

## Rationale

Phase 3 adds student-initiated connection requests and instructor approval workflow. The Phase 1 schema already has most required columns. This migration adds two missing columns and optimized composite indexes.

## Changes

### New Columns

| Column | Type | Purpose |
|--------|------|---------|
| `approved_by` | UUID (FK auth.users) | Tracks which instructor approved the connection |
| `rejected_at` | TIMESTAMPTZ | Records when a connection request was rejected |

### New Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_sic_instructor_state_updated` | (instructor_user_id, state, updated_at DESC) | Instructor listing students filtered by state |
| `idx_sic_student_state_updated` | (student_user_id, state, updated_at DESC) | Student viewing connections filtered by state |

## Already Present (from Phase 1)

- UNIQUE constraint on (instructor_user_id, student_user_id)
- `state` CHECK: invited, pending, connected, inactive, rejected, disconnected
- `initiated_by` CHECK: student, instructor, system
- `approved_at`, `connected_at`, `disconnected_at`, `disconnected_by`
- Basic single-column indexes on instructor_user_id, student_user_id, state
- RLS: users can read their own connections (both sides)

## Safety

- All operations use `IF NOT EXISTS`
- No column drops or type changes
- No data migration required
