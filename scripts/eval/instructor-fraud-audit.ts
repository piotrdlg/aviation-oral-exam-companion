#!/usr/bin/env tsx
/**
 * Instructor Fraud Signal Audit — Deterministic Offline Checks
 * Run: npm run eval:instructor-fraud
 */

import * as fs from 'fs';
import * as path from 'path';

// Direct imports of pure functions (no server-only)
import { computeFraudSignals } from '../../src/lib/instructor-fraud-signals';
import type {
  FraudKpiInput,
  FraudInviteInput,
  FraudConnectionInput,
  FraudMilestoneInput,
} from '../../src/lib/instructor-fraud-signals';

const EVIDENCE_DIR = path.join(__dirname, '../../docs/instructor-program/evidence/2026-03-06-phase8/eval');

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ': ' + detail : ''}`);
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

// Check 1: Clean instructor → risk=low
const cleanKpi: FraudKpiInput = { totalConnected: 5, paidActive: 2, trialing: 1, free: 2, activeLast7d: 3, inactiveLast7d: 2 };
const cleanInvite: FraudInviteInput = { emailsSent7d: 2, tokensCreated7d: 3, rateLimitHits7d: 0, totalEmailsSent: 10, totalTokensCreated: 15, totalClaims: 5 };
const cleanConn: FraudConnectionInput = { totalConnections: 10, disconnectedCount: 2, connectionSources: { referral_link: 5, invite_link: 3, student_search: 2 } };
const cleanMilestone: FraudMilestoneInput = { studentsWithMilestones: 2, totalConnected: 5 };
const cleanResult = computeFraudSignals(cleanKpi, cleanInvite, cleanConn, cleanMilestone);
check('Check 1: Clean instructor returns risk=low', cleanResult.riskLevel === 'low', `riskLevel=${cleanResult.riskLevel}`);

// Check 2: High invite low connect → triggered
const highInviteResult = computeFraudSignals(
  cleanKpi,
  { ...cleanInvite, totalEmailsSent: 60, totalTokensCreated: 10 },
  { ...cleanConn, totalConnections: 3 },
  cleanMilestone
);
check('Check 2: High invite low connect triggers signal', highInviteResult.signals.some(s => s.name === 'high_invite_low_connect' && s.triggered), `signals=${highInviteResult.signals.filter(s => s.triggered).map(s => s.name).join(',')}`);

// Check 3: Rate limit abuse → triggered
const rateLimitResult = computeFraudSignals(
  cleanKpi,
  { ...cleanInvite, rateLimitHits7d: 5 },
  cleanConn,
  cleanMilestone
);
check('Check 3: Rate limit abuse triggers signal', rateLimitResult.signals.some(s => s.name === 'rate_limit_abuse' && s.triggered), `rateLimitHits7d=5`);

// Check 4: High churn → triggered
const churnResult = computeFraudSignals(
  cleanKpi,
  cleanInvite,
  { totalConnections: 12, disconnectedCount: 7, connectionSources: {} },
  cleanMilestone
);
check('Check 4: High churn triggers signal', churnResult.signals.some(s => s.name === 'high_churn' && s.triggered), `7/12 disconnected`);

// Check 5: Zero engagement → triggered
const zeroEngResult = computeFraudSignals(
  { totalConnected: 6, paidActive: 0, trialing: 0, free: 6, activeLast7d: 0, inactiveLast7d: 6 },
  cleanInvite,
  cleanConn,
  cleanMilestone
);
check('Check 5: Zero engagement triggers signal', zeroEngResult.signals.some(s => s.name === 'zero_engagement' && s.triggered), `6 connected, 0 active`);

// Check 6: Multiple signals → medium or high risk
const multiResult = computeFraudSignals(
  { totalConnected: 6, paidActive: 0, trialing: 0, free: 6, activeLast7d: 0, inactiveLast7d: 6 },
  { ...cleanInvite, rateLimitHits7d: 5 },
  cleanConn,
  cleanMilestone
);
check('Check 6: Multiple signals produce medium+ risk', multiResult.riskLevel !== 'low', `riskLevel=${multiResult.riskLevel}, score=${multiResult.riskScore}`);

// Check 7: Risk score capped at 100
const allBadResult = computeFraudSignals(
  { totalConnected: 6, paidActive: 0, trialing: 0, free: 6, activeLast7d: 0, inactiveLast7d: 6 },
  { emailsSent7d: 20, tokensCreated7d: 40, rateLimitHits7d: 10, totalEmailsSent: 100, totalTokensCreated: 50, totalClaims: 1 },
  { totalConnections: 20, disconnectedCount: 15, connectionSources: {} },
  cleanMilestone
);
check('Check 7: Risk score capped at 100', allBadResult.riskScore <= 100, `riskScore=${allBadResult.riskScore}`);

// Check 8: Always returns exactly 6 signals
check('Check 8: Always returns exactly 6 signals', cleanResult.signals.length === 6, `signals.length=${cleanResult.signals.length}`);

// Check 9: Reasons array matches triggered signals
check('Check 9: Reasons match triggered signals', cleanResult.reasons.length === cleanResult.signals.filter(s => s.triggered).length, `reasons=${cleanResult.reasons.length}, triggered=${cleanResult.signals.filter(s => s.triggered).length}`);

// Check 10: Admin fraud endpoint file exists
const fraudRoutePath = path.join(__dirname, '../../src/app/api/admin/partnership/fraud/route.ts');
const fraudRouteExists = fs.existsSync(fraudRoutePath);
check('Check 10: Admin fraud route exists', fraudRouteExists, fraudRoutePath);

// Check 11: Fraud route uses requireAdmin
let fraudRouteUsesAdmin = false;
if (fraudRouteExists) {
  const content = fs.readFileSync(fraudRoutePath, 'utf-8');
  fraudRouteUsesAdmin = content.includes('requireAdmin');
}
check('Check 11: Fraud route uses requireAdmin', fraudRouteUsesAdmin, 'requireAdmin import');

// Check 12: No PII leak — check fraud route doesn't return email or certificate_number
let noPiiLeak = true;
if (fraudRouteExists) {
  const content = fs.readFileSync(fraudRoutePath, 'utf-8');
  // The route should not include student emails or certificate numbers in the response
  if (content.includes('certificate_number') || content.includes('student_email')) {
    noPiiLeak = false;
  }
}
check('Check 12: No PII leak in fraud route (no certificate_number, no student_email)', noPiiLeak, 'PII check passed');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('');
console.log('=== SUMMARY ===');
const passCount = results.filter(r => r.pass).length;
const failCount = results.filter(r => !r.pass).length;
console.log(`  Total checks: ${results.length}`);
console.log(`  Passed:       ${passCount}`);
console.log(`  Failed:       ${failCount}`);
console.log(`  Result:       ${failCount === 0 ? 'ALL PASS' : 'SOME FAILURES'}`);

// Save evidence
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(
  path.join(EVIDENCE_DIR, 'instructor-fraud-audit.json'),
  JSON.stringify({ checks: results, summary: { total: results.length, passed: passCount, failed: failCount } }, null, 2)
);
fs.writeFileSync(
  path.join(EVIDENCE_DIR, 'instructor-fraud-audit.md'),
  [
    '# Instructor Fraud Signal Audit Results',
    '',
    `Date: ${new Date().toISOString()}`,
    `Result: ${failCount === 0 ? 'ALL PASS' : 'SOME FAILURES'}`,
    '',
    '| # | Check | Result | Detail |',
    '|---|-------|--------|--------|',
    ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.detail} |`),
  ].join('\n')
);

console.log(`\nEvidence saved to ${EVIDENCE_DIR}/`);
console.log(`  - instructor-fraud-audit.json`);
console.log(`  - instructor-fraud-audit.md`);

if (failCount > 0) process.exit(1);
