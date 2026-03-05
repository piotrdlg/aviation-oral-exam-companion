---
date: 2026-03-04
type: system-audit
tags: [heydpe, system-audit, launch, operations, playbook]
status: final
evidence_level: high
---

# 53 — First 72 Hours Launch Operations

**Phase:** 18 — Public Launch Execution
**Date:** 2026-03-04
**Scope:** Hour-by-hour operational playbook for the first 72 hours after public launch

---

## Hour 0-1: Launch

### Pre-Launch Checklist (30 min before)
- [ ] Verify production deployment is current (`5cb6725`)
- [ ] Open Vercel dashboard — confirm deployment status GREEN
- [ ] Open Stripe dashboard — confirm test mode OFF, live keys active
- [ ] Open PostHog — confirm events are flowing
- [ ] Open Supabase dashboard — confirm connection pool < 50%
- [ ] Open Resend dashboard — confirm domain verified, no bounces

### Launch Actions
- [ ] Remove any invite-only restrictions (if applicable)
- [ ] Send launch announcement email to beta users via Resend
- [ ] Post on social channels (if planned)
- [ ] Monitor PostHog real-time view for first signups

### First Hour Monitoring
- [ ] Watch for first `sign_up` event in PostHog
- [ ] Watch for first `exam_session_started` event
- [ ] Check Vercel function logs for any 5xx errors
- [ ] Verify first TTS request succeeds (check usage_logs)

---

## Hours 1-6: Active Monitoring

**Check every 30 minutes:**

| Check | Tool | Expected |
|-------|------|----------|
| New signups | PostHog → sign_up | At least 1 |
| Error rate | Vercel → Functions | < 1% |
| API response time | Vercel → Functions → Duration | < 5s avg |
| Payment attempts | Stripe → Payments | Any successful = good |
| Support tickets | Supabase → support_tickets | < 3 |
| Email delivery | Resend → Activity | No bounces |

### If You See Zero Activity After 2 Hours
1. Test the full flow yourself: landing → signup → exam → pricing
2. Check DNS propagation if using custom domain
3. Verify email confirmation delivery in Resend logs
4. Check Supabase Auth logs for signup failures

---

## Hours 6-24: Settling Period

**Check every 2 hours during waking hours:**

| Priority | Action |
|----------|--------|
| 1 | Review PostHog funnel: pageview → signup → exam_start → exam_complete |
| 2 | Check Stripe for any failed payments |
| 3 | Review support tickets — respond to any urgent ones |
| 4 | Check Vercel function error rate trending |
| 5 | Scan browser console errors in PostHog session recordings (if enabled) |

### First Day Metrics to Capture
- Total unique visitors
- Signup count
- Exam sessions started
- Exam sessions completed
- Any checkout attempts
- Support ticket count
- Error rate

---

## Hours 24-48: Stabilization

**Check 3x daily (morning, afternoon, evening):**

### Key Questions
1. Are users completing exams or abandoning early? (Check avg exchange_count)
2. Are trial users returning for a second session? (Check return rate)
3. Are there any recurring errors? (Check Vercel logs)
4. Is the payment flow working? (Check Stripe for successful charges)
5. Are emails being delivered? (Check Resend bounce rate)

### First Known Issues to Watch For
| Issue | Symptom | Response |
|-------|---------|----------|
| STT not working | Users report voice not responding | Expected: Chrome/Edge only. Check Help page mentions this |
| Slow TTS | Audio delays > 3s | Check usage_logs latency_ms. Switch provider if consistent |
| Trial limit confusion | Users complain about 3 exam limit | Expected behavior. Verify pricing CTA is visible |
| Email not received | Users can't confirm account | Check Resend logs. Advise spam folder check |
| Payment decline | Stripe shows declined charges | Normal — user's card issue. Auto-email sent |

---

## Hours 48-72: Assessment

**Check 2x daily:**

### Performance Review
| Metric | Where to Check | Success Criteria |
|--------|---------------|-----------------|
| Total signups | PostHog | > 10 |
| Signup → exam rate | PostHog funnel | > 50% |
| Exam completion rate | PostHog funnel | > 30% |
| Any purchases | Stripe | > 0 |
| Error rate | Vercel | < 2% |
| Support tickets | Supabase | < 10 total |
| Bounce rate | Resend | < 5% |

### 72-Hour Decision Point
Based on the metrics above:

| Signal | Action |
|--------|--------|
| Users signing up AND completing exams | Continue. Focus on conversion optimization |
| Users signing up but NOT completing exams | Investigate UX. Check exchange_count distribution |
| Very few signups | Review acquisition channels. Check SEO/ads targeting |
| High error rate (> 5%) | Consider rollback or hotfix sprint |
| Payment flow broken | IMMEDIATE: Fix or disable pricing page |
| No support tickets AND no activity | Verify all monitoring is working correctly |

---

## Incident Response

### P1 — Service Down
**Symptoms:** 5xx errors > 10%, or complete service unavailability
**Response:**
1. Check Vercel deployment status
2. Check Supabase service status
3. Check Anthropic API status
4. If Vercel issue: trigger redeployment from dashboard
5. If Supabase issue: check connection pool, restart if needed
6. If Anthropic issue: wait for resolution (no fallback AI available)
7. If persistent: rollback to previous deployment via Vercel dashboard

### P2 — Payment System Down
**Symptoms:** All payment attempts failing, webhook errors
**Response:**
1. Check Stripe status page
2. Verify webhook endpoint is responding (check subscription_events table)
3. If webhook secret rotated: update STRIPE_WEBHOOK_SECRET env var
4. Test with a $1 test charge if possible
5. If persistent: disable pricing page CTA, notify beta users

### P3 — Email Delivery Failure
**Symptoms:** Resend bounce rate > 10%, users not receiving confirmation
**Response:**
1. Check Resend dashboard for bounces/complaints
2. Verify DNS records (SPF, DKIM, DMARC) haven't changed
3. Check if domain is on any blocklists
4. If persistent: temporarily switch to manual account approval

---

## Rollback Plan

If a critical issue requires rollback:

1. **Vercel:** Dashboard → Deployments → Promote previous deployment
2. **Database:** No schema changes in Phase 18 — no DB rollback needed
3. **Stripe:** Webhook configuration doesn't need rollback (additive changes only)
4. **DNS:** No DNS changes in Phase 18

**Time to rollback:** < 5 minutes via Vercel dashboard

---

## Post-72h Transition

After the first 72 hours:
1. Write a "Week 1 Retrospective" document
2. Prioritize any operational issues discovered
3. Begin adding remaining PARTIAL analytics events
4. Set up automated PostHog alerts for Dashboard 4 (System Health) metrics
5. Transition from active monitoring to scheduled daily checks
