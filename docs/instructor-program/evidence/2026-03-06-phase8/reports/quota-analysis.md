# Instructor Quota Analysis Report

Generated: 2026-03-06T17:16:48.214Z

## Default Limits

| Parameter | Code Default | Config Key |
|-----------|-------------|------------|
| Email Invite Limit | 20 | instructor.email_invite_limit |
| Token Creation Limit | 50 | instructor.token_creation_limit |

## Adaptive Tiers

| Tier | Threshold | Email Limit | Token Limit | Config Key |
|------|-----------|-------------|-------------|------------|
| Base | < 2 paid | 20 | 50 | — |
| Tier 2 | >= 2 paid | 40 | 100 | instructor.adaptive_quotas.tier2_* |
| Tier 3 | >= 10 paid | 80 | 200 | instructor.adaptive_quotas.tier3_* |

## Precedence Chain

1. Per-instructor override (instructor_quota_overrides table)
2. Adaptive tier (behind instructor.adaptive_quotas.enabled flag)
3. System config (instructor.email_invite_limit / instructor.token_creation_limit)
4. Code defaults (QUOTA_DEFAULTS constants)

## Audit Results

Total checks: 12
Passed: 12
Failed: 0