---
date: 2026-03-04
type: system-audit
tags: [heydpe, system-audit, launch, monitoring, dashboards]
status: final
evidence_level: high
---

# 52 — Launch Dashboard and Alert Thresholds

**Phase:** 18 — Public Launch Execution
**Date:** 2026-03-04
**Scope:** Metrics definitions, dashboard specifications, and alert thresholds for first-week monitoring

---

## Dashboard 1: Acquisition Funnel

**Source:** PostHog + GA4
**Refresh:** Real-time

| Metric | Event Source | Healthy Range | Alert Threshold |
|--------|-------------|---------------|-----------------|
| Daily unique visitors | `$pageview` (PostHog) | 50-500/day | < 10/day after 48h |
| Signup rate | `sign_up` / `$pageview` | 2-8% | < 1% over 24h window |
| Login success rate | `login_completed` / login attempts | > 95% | < 80% |
| Pricing page visits | `$pageview` where path=/pricing | 10-100/day | < 5/day after 48h |

### Funnel Stages
```
Landing ($pageview path=/) → Pricing ($pageview path=/pricing) → Signup (sign_up) → Login (login_completed)
```

---

## Dashboard 2: Conversion Funnel

**Source:** PostHog + Stripe Dashboard
**Refresh:** Hourly

| Metric | Event Source | Healthy Range | Alert Threshold |
|--------|-------------|---------------|-----------------|
| Trial-to-checkout rate | `checkout_completed` / `trial_start` | 5-20% | < 2% over 7 days |
| Payment success rate | Stripe successful_charges / total_charges | > 98% | < 95% |
| Monthly revenue | Stripe MRR | Growing | Flat for 14 days |
| Churn rate | `customer.subscription.deleted` / active subs | < 5%/month | > 10%/month |

### Funnel Stages
```
Trial Start (trial_start) → Exam Completed (exam_session_completed) → Checkout (checkout_completed) → Active Subscriber
```

---

## Dashboard 3: Engagement

**Source:** PostHog + Supabase
**Refresh:** Daily

| Metric | Event Source | Healthy Range | Alert Threshold |
|--------|-------------|---------------|-----------------|
| Sessions started/day | `exam_session_started` (PostHog) | 10-200/day | < 5/day after 72h |
| Session completion rate | `exam_session_completed` / `exam_session_started` | > 40% | < 20% |
| Avg exchanges/session | `exam_session_completed.exchange_count` | 8-25 | < 3 (abandon signal) |
| Return user rate | unique users with 2+ sessions / total users | > 30% | < 15% |
| Quick drill adoption | sessions where study_mode=quick_drill / total | 10-40% | Not critical |

---

## Dashboard 4: System Health

**Source:** Vercel + Supabase + PostHog
**Refresh:** Real-time

| Metric | Event Source | Healthy Range | Alert Threshold |
|--------|-------------|---------------|-----------------|
| API error rate (5xx) | Vercel function logs | < 1% | > 5% for 10 min |
| Avg response time | Vercel function duration | < 3s (exam), < 500ms (session) | > 10s for 5 min |
| TTS latency | `usage_logs` where event_type=tts_request | < 2s | > 5s avg over 10 min |
| Supabase connection pool | Supabase dashboard | < 80% utilization | > 90% |
| Anthropic API errors | Vercel logs (Claude calls) | < 0.5% | > 2% for 15 min |

---

## Dashboard 5: Revenue Health

**Source:** Stripe Dashboard
**Refresh:** Daily

| Metric | Source | Healthy Range | Alert Threshold |
|--------|--------|---------------|-----------------|
| MRR | Stripe | Growing | Declining for 7 days |
| Failed payments | invoice.payment_failed events | < 3% of invoices | > 5% |
| Refund rate | Stripe refunds / charges | < 2% | > 5% |
| Active subscriptions | Stripe active_subscriptions | Growing | Declining for 7 days |
| Trial-to-paid conversion | Stripe trialing→active transitions | > 10% | < 5% |

---

## Dashboard 6: Support & Quality

**Source:** Supabase (support_tickets) + PostHog
**Refresh:** Daily

| Metric | Source | Healthy Range | Alert Threshold |
|--------|--------|---------------|-----------------|
| Tickets/day | support_tickets table count | < 10/day | > 20/day |
| Unresolved tickets | support_tickets where status=open | < 5 at any time | > 15 |
| RAG grounding confidence | `weak_area_report_low_confidence` | < 10% of sessions | > 25% |
| Multimodal asset selection | `multimodal_asset_selected` | > 50% of exchanges | < 20% |

---

## Alert Escalation Path

| Severity | Response Time | Who | Action |
|----------|--------------|-----|--------|
| P1 — Service Down | 15 min | Owner (Piotr) | Check Vercel status, rollback if needed |
| P2 — Payment Issues | 1 hour | Owner | Check Stripe dashboard, contact Stripe support |
| P3 — Quality Degradation | 4 hours | Owner | Review PostHog events, check Claude API status |
| P4 — Metric Anomaly | 24 hours | Owner | Investigate in next work session |

---

## Implementation Notes

### Currently Available
- **PostHog:** $pageview, sign_up, trial_start, exam_session_started, exam_session_completed, checkout_completed, multimodal_asset_selected, weak_area_report_low_confidence, flow events, depth events
- **GA4:** purchase (Measurement Protocol), page_data, utm_captured
- **Stripe:** Full webhook integration (5 event types)
- **Supabase:** exam_sessions, usage_logs, support_tickets, element_attempts tables
- **Vercel:** Function logs, deployment status

### Post-Launch Additions (Week 1)
- Add login_completed PostHog event (currently DB-only)
- Add payment_failed PostHog event (currently DB-only via webhook)
- Add exam_answer_assessed PostHog event (for per-question quality monitoring)
- Set up PostHog dashboard with these 6 panels
- Configure Vercel alerts for function error rate
