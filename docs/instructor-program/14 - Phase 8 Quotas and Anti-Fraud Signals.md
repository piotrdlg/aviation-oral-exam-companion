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
