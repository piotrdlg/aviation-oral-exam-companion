# Instructor Fraud Signal Audit Results

Date: 2026-03-06T17:16:47.034Z
Result: ALL PASS

| # | Check | Result | Detail |
|---|-------|--------|--------|
| 1 | Check 1: Clean instructor returns risk=low | PASS | riskLevel=low |
| 2 | Check 2: High invite low connect triggers signal | PASS | signals=high_invite_low_connect |
| 3 | Check 3: Rate limit abuse triggers signal | PASS | rateLimitHits7d=5 |
| 4 | Check 4: High churn triggers signal | PASS | 7/12 disconnected |
| 5 | Check 5: Zero engagement triggers signal | PASS | 6 connected, 0 active |
| 6 | Check 6: Multiple signals produce medium+ risk | PASS | riskLevel=medium, score=45 |
| 7 | Check 7: Risk score capped at 100 | PASS | riskScore=80 |
| 8 | Check 8: Always returns exactly 6 signals | PASS | signals.length=6 |
| 9 | Check 9: Reasons match triggered signals | PASS | reasons=0, triggered=0 |
| 10 | Check 10: Admin fraud route exists | PASS | /Users/piotrdlugiewicz/claude-projects/aviation-oral-exam-companion/src/app/api/admin/partnership/fraud/route.ts |
| 11 | Check 11: Fraud route uses requireAdmin | PASS | requireAdmin import |
| 12 | Check 12: No PII leak in fraud route (no certificate_number, no student_email) | PASS | PII check passed |