---
date: 2026-03-04
type: system-audit
tags: [heydpe, system-audit, email, preferences, unsubscribe, compliance]
status: final
evidence_level: high
---

# 58 — Email Preference System Architecture

**Phase:** 20 — Email Preferences + Learning Digest Engine
**Date:** 2026-03-04
**Scope:** Selective email opt-out system with HMAC-based unsubscribe tokens, resolving Gap 5 from [[57 - Email Gaps and Recommendations]]

---

## Overview

The email preference system provides per-category opt-out controls with stateless HMAC-SHA256 unsubscribe tokens. Users can manage preferences through the authenticated settings page or via one-click unsubscribe links embedded in every lifecycle email. All sent emails are audit-logged to the `email_logs` table. This resolves the compliance prerequisite identified in Phase 19 before adding lifecycle emails (learning digest, motivation nudges).

---

## Data Model

### `email_preferences` Table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Primary key |
| `user_id` | uuid | FK to `auth.users`, unique per category |
| `category` | `email_category` enum | One of 7 categories |
| `enabled` | boolean | Default varies by category |
| `source` | text | How preference was set (`default`, `user`, `unsubscribe_link`, `admin`) |
| `created_at` | timestamptz | Row creation |
| `updated_at` | timestamptz | Last modification |

### `email_logs` Table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Primary key |
| `user_id` | uuid | FK to `auth.users` |
| `category` | `email_category` enum | Which email type was sent |
| `subject` | text | Email subject line |
| `resend_id` | text | Resend delivery ID |
| `metadata` | jsonb | Arbitrary context (milestone, variant, etc.) |
| `sent_at` | timestamptz | When the email was dispatched |

### Additional Schema Changes

- `timezone` column added to `user_profiles` (text, default `'America/New_York'`)
- Migration: `supabase/migrations/20260310000001_email_preferences.sql`

---

## Email Categories

| Category | Type | Default | User-Toggleable |
|----------|------|---------|-----------------|
| `account_security` | Required | enabled | No |
| `billing_transactional` | Required | enabled | No |
| `support_transactional` | Required | enabled | No |
| `learning_digest` | Optional | enabled | Yes |
| `motivation_nudges` | Optional | enabled | Yes |
| `product_updates` | Optional | enabled | Yes |
| `marketing` | Optional | disabled | Yes |

Required categories are always-on and cannot be disabled by the user.

---

## Unsubscribe Token Strategy

Tokens are **stateless HMAC-SHA256** signatures, avoiding database lookups for verification.

- **Format:** `HMAC-SHA256(userId:category, EMAIL_UNSUBSCRIBE_SECRET)`
- **Scope:** Category-specific -- one-click unsubscribe for "learning_digest" does not affect "motivation_nudges"
- **Verification:** Timing-safe comparison via `crypto.timingSafeEqual`
- **URL pattern:** `/email/preferences?uid={userId}&cat={category}&token={hmacToken}`
- **Headers:** `List-Unsubscribe` and `List-Unsubscribe-Post` on all lifecycle emails

Implementation: `src/lib/unsubscribe-token.ts`

---

## API Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /api/user/email-preferences` | Authenticated | Fetch current user's preferences |
| `POST /api/user/email-preferences` | Authenticated | Update preferences from settings page |
| `GET /api/email/preferences` | Token-verified | Public unsubscribe page data |
| `POST /api/email/preferences` | Token-verified | Public one-click unsubscribe |

---

## UI Integration

- **Settings page** (`src/app/(dashboard)/settings/page.tsx`): Email Notifications section with toggles for each optional category. Required categories shown as locked/always-on.
- **Public preference page** (`src/app/email/preferences/page.tsx`): Standalone page accessible via unsubscribe link. No authentication required -- verified by HMAC token.

---

## RPC Functions

- **`get_email_eligible_users(p_category)`** -- Returns users who have the given category enabled. Used by cron scripts to batch-query eligible recipients before sending.
- **`init_email_preferences(p_user_id)`** -- Idempotent initialization of default preferences for a new user. Called on first settings page load or email send.

---

## Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/20260310000001_email_preferences.sql` | Schema: tables, enum, RLS, RPC functions |
| `src/lib/email-preferences.ts` | Preference CRUD, eligibility checks |
| `src/lib/unsubscribe-token.ts` | HMAC token generation and verification |
| `src/lib/email-logging.ts` | Audit trail: `logEmailSent()`, dedup queries |
| `src/app/api/user/email-preferences/route.ts` | Authenticated preference API |
| `src/app/api/email/preferences/route.ts` | Public token-verified unsubscribe API |
| `src/app/email/preferences/page.tsx` | Public preference management page |

---

## Related Documents

- [[57 - Email Gaps and Recommendations]] -- Gap 5 (unsubscribe infrastructure) resolved by this work
- [[59 - Learning Digest Engine]] -- First consumer of preference system
- [[60 - Motivation Nudge Engine]] -- Second consumer of preference system
- [[43 - Email Communications Program]] -- Original email program design
