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
