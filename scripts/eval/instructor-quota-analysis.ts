#!/usr/bin/env tsx
/**
 * Instructor Quota Analysis — Usage Distribution Report
 * Run: npm run eval:instructor-quotas
 *
 * This script analyzes the quota system by:
 * 1. Running deterministic checks on the quota resolver
 * 2. Generating a mock usage report
 */

import * as fs from 'fs';
import * as path from 'path';

import { resolveEffectiveQuota, isOverrideExpired, QUOTA_DEFAULTS } from '../../src/lib/instructor-quotas';
import type { QuotaOverride, QuotaSystemConfig } from '../../src/lib/instructor-quotas';

const EVIDENCE_DIR = path.join(__dirname, '../../docs/instructor-program/evidence/2026-03-06-phase8/eval');
const REPORTS_DIR = path.join(__dirname, '../../docs/instructor-program/evidence/2026-03-06-phase8/reports');

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
// Deterministic checks
// ---------------------------------------------------------------------------

// Check 1: Default limits match constants
const defaults = resolveEffectiveQuota(0, null, null);
check('Check 1: Default email limit', defaults.emailInviteLimit === 20, `emailInviteLimit=${defaults.emailInviteLimit}`);

// Check 2: Default token limit
check('Check 2: Default token limit', defaults.tokenCreationLimit === 50, `tokenCreationLimit=${defaults.tokenCreationLimit}`);

// Check 3: Default source
check('Check 3: Default source is "default"', defaults.source === 'default', `source=${defaults.source}`);

// Check 4: System config override
const sysConfig: QuotaSystemConfig = { email_invite_limit: 30, token_creation_limit: 60 };
const configResult = resolveEffectiveQuota(0, sysConfig, null);
check('Check 4: System config overrides defaults', configResult.emailInviteLimit === 30 && configResult.tokenCreationLimit === 60, `email=${configResult.emailInviteLimit}, token=${configResult.tokenCreationLimit}`);

// Check 5: Adaptive tier2
const adaptiveConfig: QuotaSystemConfig = { adaptive_quotas: { enabled: true } };
const tier2Result = resolveEffectiveQuota(3, adaptiveConfig, null);
check('Check 5: Adaptive tier2 for 3 paid students', tier2Result.source === 'adaptive_tier2', `source=${tier2Result.source}, email=${tier2Result.emailInviteLimit}`);

// Check 6: Adaptive tier3
const tier3Result = resolveEffectiveQuota(10, adaptiveConfig, null);
check('Check 6: Adaptive tier3 for 10 paid students', tier3Result.source === 'adaptive_tier3', `source=${tier3Result.source}, email=${tier3Result.emailInviteLimit}`);

// Check 7: Override takes precedence
const override: QuotaOverride = { emailInviteLimit: 100, tokenCreationLimit: 200, expiresAt: null, note: 'VIP' };
const overrideResult = resolveEffectiveQuota(10, adaptiveConfig, override);
check('Check 7: Override takes precedence over adaptive', overrideResult.source === 'override' && overrideResult.emailInviteLimit === 100, `source=${overrideResult.source}, email=${overrideResult.emailInviteLimit}`);

// Check 8: Expired override ignored
const expiredOverride: QuotaOverride = { emailInviteLimit: 100, tokenCreationLimit: 200, expiresAt: '2020-01-01T00:00:00Z', note: 'expired' };
const expiredResult = resolveEffectiveQuota(3, adaptiveConfig, expiredOverride);
check('Check 8: Expired override ignored', expiredResult.source !== 'override', `source=${expiredResult.source}`);

// Check 9: isOverrideExpired with null
check('Check 9: null override is expired', isOverrideExpired(null) === true, 'null → true');

// Check 10: isOverrideExpired with no expiry
const noExpiry: QuotaOverride = { emailInviteLimit: 10, tokenCreationLimit: 20, expiresAt: null, note: null };
check('Check 10: No expiry = not expired', isOverrideExpired(noExpiry) === false, 'null expiresAt → false');

// Check 11: Partial override applies only specified fields
const partialOverride: QuotaOverride = { emailInviteLimit: 50, tokenCreationLimit: null, expiresAt: null, note: null };
const partialResult = resolveEffectiveQuota(0, null, partialOverride);
check('Check 11: Partial override: email=50, token=default', partialResult.emailInviteLimit === 50 && partialResult.tokenCreationLimit === QUOTA_DEFAULTS.TOKEN_CREATION_LIMIT, `email=${partialResult.emailInviteLimit}, token=${partialResult.tokenCreationLimit}`);

// Check 12: Determinism
const r1 = resolveEffectiveQuota(5, adaptiveConfig, override, new Date('2026-03-06'));
const r2 = resolveEffectiveQuota(5, adaptiveConfig, override, new Date('2026-03-06'));
check('Check 12: Deterministic output', JSON.stringify(r1) === JSON.stringify(r2), 'same input → same output');

// ---------------------------------------------------------------------------
// Generate quota analysis report
// ---------------------------------------------------------------------------

const reportLines: string[] = [
  '# Instructor Quota Analysis Report',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Default Limits',
  '',
  '| Parameter | Code Default | Config Key |',
  '|-----------|-------------|------------|',
  `| Email Invite Limit | ${QUOTA_DEFAULTS.EMAIL_INVITE_LIMIT} | instructor.email_invite_limit |`,
  `| Token Creation Limit | ${QUOTA_DEFAULTS.TOKEN_CREATION_LIMIT} | instructor.token_creation_limit |`,
  '',
  '## Adaptive Tiers',
  '',
  '| Tier | Threshold | Email Limit | Token Limit | Config Key |',
  '|------|-----------|-------------|-------------|------------|',
  `| Base | < ${QUOTA_DEFAULTS.TIER2_THRESHOLD} paid | ${QUOTA_DEFAULTS.EMAIL_INVITE_LIMIT} | ${QUOTA_DEFAULTS.TOKEN_CREATION_LIMIT} | — |`,
  `| Tier 2 | >= ${QUOTA_DEFAULTS.TIER2_THRESHOLD} paid | ${QUOTA_DEFAULTS.TIER2_EMAIL_LIMIT} | ${QUOTA_DEFAULTS.TIER2_TOKEN_LIMIT} | instructor.adaptive_quotas.tier2_* |`,
  `| Tier 3 | >= ${QUOTA_DEFAULTS.TIER3_THRESHOLD} paid | ${QUOTA_DEFAULTS.TIER3_EMAIL_LIMIT} | ${QUOTA_DEFAULTS.TIER3_TOKEN_LIMIT} | instructor.adaptive_quotas.tier3_* |`,
  '',
  '## Precedence Chain',
  '',
  '1. Per-instructor override (instructor_quota_overrides table)',
  '2. Adaptive tier (behind instructor.adaptive_quotas.enabled flag)',
  '3. System config (instructor.email_invite_limit / instructor.token_creation_limit)',
  '4. Code defaults (QUOTA_DEFAULTS constants)',
  '',
  '## Audit Results',
  '',
  `Total checks: ${results.length}`,
  `Passed: ${results.filter(r => r.pass).length}`,
  `Failed: ${results.filter(r => !r.pass).length}`,
];

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
  path.join(EVIDENCE_DIR, 'instructor-quota-analysis.json'),
  JSON.stringify({ checks: results, summary: { total: results.length, passed: passCount, failed: failCount } }, null, 2)
);

fs.mkdirSync(REPORTS_DIR, { recursive: true });
fs.writeFileSync(
  path.join(REPORTS_DIR, 'quota-analysis.md'),
  reportLines.join('\n')
);

console.log(`\nEvidence saved to ${EVIDENCE_DIR}/`);
console.log(`  - instructor-quota-analysis.json`);
console.log(`Report saved to ${REPORTS_DIR}/`);
console.log(`  - quota-analysis.md`);

if (failCount > 0) process.exit(1);
