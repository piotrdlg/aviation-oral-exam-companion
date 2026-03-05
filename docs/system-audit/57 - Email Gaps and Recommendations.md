---
date: 2026-03-16
type: system-audit
tags: [heydpe, system-audit, email, gaps, recommendations]
status: final
evidence_level: high
---

# 57 — Email Gaps and Recommendations

**Phase:** 19 — Email System Review + Sample Send Pack
**Date:** 2026-03-16
**Scope:** Classification of missing/partial email scenarios with priority and recommendations

---

## Current Coverage

- **Implemented in app:** 8 send functions covering 10 scenario variants
- **Supabase-handled:** 2 (signup verification, password reset)
- **Not implemented:** 5 scenarios
- **Coverage:** 10/15 scenarios active (67%)

---

## Gap Analysis

### Gap 1: Trial Start Notification

| Attribute | Value |
|-----------|-------|
| **Classification** | Nice-to-have |
| **Launch Blocker?** | No |
| **Current State** | Trial starts silently — user signs up, gets welcome email, starts trial via Stripe checkout. No explicit "your trial has started" email. |
| **Why It Matters** | Sets expectations for trial duration (7 days) and what happens at end. Currently covered partially by welcome email which mentions "3 free practice sessions". The trial-ending reminder (2 days before) fills the more critical gap. |
| **Recommended Action** | Defer — welcome email + trial-ending reminder covers the critical path |
| **Effort** | 2-3 hours (new template + send function + trigger in checkout webhook) |
| **Type** | Transactional |

### Gap 2: Weekly Learning Summary / Digest

| Attribute | Value |
|-----------|-------|
| **Classification** | Nice-to-have (post-launch) |
| **Launch Blocker?** | No |
| **Current State** | No periodic email communication after initial signup. Users must actively return to the app to check progress. |
| **Why It Matters** | Drives re-engagement and habit formation. Shows users their ACS coverage progress, weak areas, and suggested next focus. Could significantly improve retention. |
| **Recommended Action** | Implement in first month post-launch, behind feature flag, opt-in only |
| **Effort** | 8-12 hours (template + data aggregation query + cron script + opt-in toggle + unsubscribe link) |
| **Type** | Lifecycle / Marketing |
| **Prerequisites** | Unsubscribe infrastructure (Gap 5) must be built first |
| **Data Required** | Sessions completed this week, ACS areas covered, weak elements, suggested next study focus |
| **Frequency** | Weekly (Sunday evening), users with ≥1 session in past 7 days |

### Gap 3: Re-engagement Email (Inactive Users)

| Attribute | Value |
|-----------|-------|
| **Classification** | Defer |
| **Launch Blocker?** | No |
| **Current State** | Users who stop using the app receive no nudge to return. |
| **Why It Matters** | Could recover churned free-tier users and remind them of upcoming checkride deadlines. Lower ROI than learning summary since it targets already-disengaged users. |
| **Recommended Action** | Defer to month 2+ — only implement after learning summary proves valuable |
| **Effort** | 6-8 hours (template + inactive user query + cron + unsubscribe) |
| **Type** | Lifecycle / Marketing |
| **Prerequisites** | Unsubscribe infrastructure (Gap 5), usage tracking baseline |
| **Trigger** | 30+ days of inactivity (no exam sessions started) |

### Gap 4: Bug Report Confirmation Email

| Attribute | Value |
|-----------|-------|
| **Classification** | Nice-to-have |
| **Launch Blocker?** | No |
| **Current State** | In-app bug reports via `/api/report` write to `moderation_queue` table. User sees a toast confirmation in UI, but receives no email confirmation. Support tickets sent to support@heydpe.com DO get auto-reply. |
| **Why It Matters** | Low impact — in-app reporting already shows confirmation. Adding email would be noisy for something that's already acknowledged in the UI. |
| **Recommended Action** | Defer — in-app confirmation is sufficient. If volume increases, consider. |
| **Effort** | 1-2 hours (reuse ticket-auto-reply template with modified copy) |
| **Type** | Transactional |

### Gap 5: Unsubscribe / Email Preference Management

| Attribute | Value |
|-----------|-------|
| **Classification** | Public launch blocker (compliance) |
| **Launch Blocker?** | YES — for lifecycle/marketing emails; NOT for transactional |
| **Current State** | No unsubscribe link in any email template. No preference center page. All current emails are transactional (triggered by user action) which are CAN-SPAM exempt. But trial-ending reminder is borderline lifecycle. |
| **Why It Matters** | CAN-SPAM requires unsubscribe mechanism for commercial emails. Current transactional emails (welcome, billing, support) are exempt. But learning summary (Gap 2) would require it. Trial-ending is defensible as transactional since it informs about existing subscription. |
| **Recommended Action** | Implement before adding any non-transactional emails (Gap 2, Gap 3). Not blocking current launch since all current emails are transactional. |
| **Effort** | 4-6 hours (unsubscribe link in footer, preference page, DB column for opt-out, middleware to check before sending lifecycle emails) |
| **Type** | Infrastructure |
| **Implementation Notes** | Add `email_preferences` JSONB column to `user_profiles` with per-category opt-in/out. Add unsubscribe page at `/unsubscribe?token=...`. Add unsubscribe link to EmailLayout footer for lifecycle emails. |

---

## Supabase Email Customization

### Gap 6: Custom Supabase Auth Email Templates

| Attribute | Value |
|-----------|-------|
| **Classification** | Nice-to-have |
| **Launch Blocker?** | No |
| **Current State** | Signup verification and password reset use Supabase default templates. These are functional but don't match HeyDPE branding (dark theme, amber accent). |
| **Why It Matters** | Brand consistency. Default Supabase emails look generic. But users see them rarely (once at signup, occasionally for password reset). |
| **Recommended Action** | Customize via Supabase dashboard when time permits. Low priority since they work fine. |
| **Effort** | 1-2 hours (Supabase dashboard → Auth → Email Templates) |

---

## Priority Matrix

| Priority | Gap | Classification | Effort | When |
|----------|-----|---------------|--------|------|
| 1 | Gap 5: Unsubscribe infrastructure | Compliance | 4-6h | Before adding lifecycle emails |
| 2 | Gap 2: Weekly learning summary | Nice-to-have | 8-12h | Month 1 post-launch |
| 3 | Gap 6: Custom Supabase templates | Nice-to-have | 1-2h | When convenient |
| 4 | Gap 1: Trial start notification | Nice-to-have | 2-3h | Low priority |
| 5 | Gap 4: Bug report confirmation | Nice-to-have | 1-2h | If volume increases |
| 6 | Gap 3: Re-engagement email | Defer | 6-8h | Month 2+ |

---

## Quality Observations from Sample Review

### Strengths
- All React Email templates use consistent dark theme with amber accent (#f59e0b)
- Shared EmailLayout provides brand consistency (header logo, footer with privacy/terms links)
- Professional tone with aviation personality ("Clear skies")
- Each email has a single clear CTA
- Error handling is robust (never throws, logs silently)
- Support ticket reply has proper email threading (In-Reply-To/References headers)

### Areas for Improvement
- **No unsubscribe link** — needed before adding lifecycle emails
- **No email preview text customization** — some templates have preview, some don't
- **Support ticket reply is plain text only** — no branding, no footer. Consider wrapping in EmailLayout
- **Forward email has minimal formatting** — acceptable for catch-all forwarding
- **Trial ending email mentions both monthly/annual but has no way to change plans** — could add plan change CTA
- **No A/B testing** — all templates are single-variant

### Delivery Infrastructure
- Resend auto-retries 3x with exponential backoff
- No dead-letter queue for permanently failed sends
- No bounce/complaint monitoring automation (manual via Resend dashboard)
- Domain configuration (SPF/DKIM/DMARC) should be verified before high-volume sending

---

## Recommended Implementation Order

1. **Now (pre-launch):** Verify Resend domain SPF/DKIM/DMARC (15 min, Supabase/Resend dashboard)
2. **Week 1 post-launch:** Monitor Resend delivery metrics daily
3. **Week 2:** Build unsubscribe infrastructure (Gap 5) — prerequisite for everything else
4. **Week 3-4:** Implement weekly learning summary (Gap 2)
5. **Month 2+:** Re-engagement, custom Supabase templates, trial start notification as needed
