# Migration Preview: 20260305000004_instructor_entitlements.sql

## Rationale

Phase 4 adds a general-purpose user entitlement override table for granting paid-equivalent access to any user (students, demo accounts, beta testers). When a student with a paid_equivalent override is connected to an instructor, the instructor qualifies for courtesy access.

## Changes

### New Table

| Table | Purpose |
|-------|---------|
| `user_entitlement_overrides` | Admin-managed overrides granting paid-equivalent status |

### Columns

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Primary key |
| `user_id` | UUID FK (auth.users) | The user receiving the override |
| `entitlement_key` | TEXT | Override type (currently only 'paid_equivalent') |
| `active` | BOOLEAN | Whether the override is currently active |
| `expires_at` | TIMESTAMPTZ NULL | Optional expiry date |
| `reason` | TEXT NOT NULL | Admin-provided reason |
| `created_by` | UUID FK (auth.users) | Admin who created the override |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

### Constraints
- UNIQUE(user_id, entitlement_key) — one override per key per user
- CHECK(entitlement_key IN ('paid_equivalent'))

### Indexes
- `idx_ueo_user_id` on (user_id)
- `idx_ueo_active` partial index on (active) WHERE active = true

### RLS
- RLS enabled, no policies = admin/service-role only

## Safety
- All operations use `IF NOT EXISTS`
- No column drops or type changes
- No data migration required

## Rollback
```sql
DROP TABLE IF EXISTS user_entitlement_overrides;
```
