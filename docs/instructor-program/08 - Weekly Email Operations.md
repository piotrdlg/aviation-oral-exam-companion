# Weekly Instructor Summary — Operations Guide

## Sending

```bash
# Production send
npm run send:instructor-weekly

# Dry run (build summaries, don't send)
npm run send:instructor-weekly -- --dry-run

# Review one sample
npm run send:instructor-weekly -- --review
```

## Eligibility

An instructor receives the weekly email when ALL conditions are met:
1. `instructor_profiles.status = 'approved'`
2. Has at least one connected student (`student_instructor_connections.state = 'connected'`)
3. `email_preferences` category `instructor_weekly_summary` is enabled (default: true)
4. Has not received this email in the last 6 days (cadence guard via `email_logs`)

## Email Content

| Section | Source |
|---------|--------|
| Instructor name | `instructor_profiles.first_name + last_name` |
| Week label | Computed from current date |
| Student summaries | `getStudentInsights()` per connected student |
| Readiness score | `ExamResultV2.overall_score * 100` |
| Readiness trend | Average of 2 newest vs 2 oldest scores |
| Needs attention | Readiness < 60 OR declining OR 7+ days inactive |
| Recent milestone | Latest completed milestone from `student_milestones` |

## Opt-Out

Students and instructors can opt out via:
1. Settings page → Email Preferences → toggle off "Instructor Weekly Summary"
2. One-click unsubscribe link in email footer (HMAC-signed URL)

## Monitoring

- `email_logs` table records each send with category `instructor_weekly_summary` and template_id `instructor-weekly-summary`
- PostHog event `email_sent` with `category: instructor_weekly_summary`
- Admin endpoint: `GET /api/admin/quality/milestones` for milestone activity metrics

## Scheduling

The script is designed for external cron invocation (e.g., Vercel Cron, GitHub Actions, or manual):
- Recommended: Monday 8:00 AM ET
- The 6-day cadence guard prevents duplicate sends if the cron fires more than once per week
