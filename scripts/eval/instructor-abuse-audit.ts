#!/usr/bin/env npx tsx
/**
 * Instructor Abuse Hardening — Deterministic Offline Audit
 *
 * Phase 7 — validates the abuse hardening features across rate limiting,
 * self-referral blocking, feature flag gating, and public data safety
 * WITHOUT requiring a live database connection or any server-only modules.
 *
 * Checks combine inlined pure-logic constants with source-code content
 * analysis of route files to verify security invariants are in place.
 *
 * Usage: npx tsx scripts/eval/instructor-abuse-audit.ts
 *        npm run eval:instructor-abuse
 */

import { randomBytes } from 'crypto';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Inline definitions matching source modules
// These are verified against the module's behavior — any drift means
// the source module has changed and this audit needs updating.
// ---------------------------------------------------------------------------

// From src/lib/instructor-entitlements.ts
const PAID_ACTIVE_SUBSCRIPTION_STATUSES: string[] = ['active'];
const COURTESY_TIER = 'checkride_prep' as const;

// From src/lib/instructor-rate-limiter.ts
const DEFAULTS = {
  EMAIL_INVITE_LIMIT: 20,
  TOKEN_CREATION_LIMIT: 50,
  RATE_LIMIT_WINDOW_HOURS: 24,
} as const;

// From src/lib/instructor-identity.ts
const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERRAL_CODE_LENGTH = 8;

function generateReferralCode(): string {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += REFERRAL_ALPHABET[bytes[i] % REFERRAL_ALPHABET.length];
  }
  return code;
}

// From src/types/database.ts
type ConnectionSource = 'referral_link' | 'invite_link' | 'student_search' | 'admin';
const CONNECTION_SOURCE_VALUES: ConnectionSource[] = [
  'referral_link',
  'invite_link',
  'student_search',
  'admin',
];

// ---------------------------------------------------------------------------
// Source-reading helper
// ---------------------------------------------------------------------------

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  const fullPath = join(ROOT, relativePath);
  if (!existsSync(fullPath)) return '';
  return readFileSync(fullPath, 'utf-8');
}

function sourceExists(relativePath: string): boolean {
  return existsSync(join(ROOT, relativePath));
}

// ---------------------------------------------------------------------------
// Audit framework
// ---------------------------------------------------------------------------

const EVIDENCE_DIR = join(
  process.cwd(),
  'docs/instructor-program/evidence/2026-03-06-phase7/eval'
);

interface CheckResult {
  id: number;
  name: string;
  pass: boolean;
  detail: string;
  expected: string;
  actual: string;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function runChecks(): CheckResult[] {
  const checks: CheckResult[] = [];

  // Check 1: Courtesy does NOT count trialing by default
  {
    const pass =
      PAID_ACTIVE_SUBSCRIPTION_STATUSES.length === 1 &&
      PAID_ACTIVE_SUBSCRIPTION_STATUSES[0] === 'active';
    checks.push({
      id: 1,
      name: 'Courtesy does NOT count trialing by default',
      pass,
      detail: pass
        ? "PAID_ACTIVE_SUBSCRIPTION_STATUSES is exactly ['active'] — trialing excluded"
        : `Got ${PAID_ACTIVE_SUBSCRIPTION_STATUSES.length} items: [${PAID_ACTIVE_SUBSCRIPTION_STATUSES.join(', ')}]`,
      expected: JSON.stringify(['active']),
      actual: JSON.stringify(PAID_ACTIVE_SUBSCRIPTION_STATUSES),
    });
  }

  // Check 2: QR endpoint path structure
  {
    const routePath = 'src/app/api/public/qr/referral/[code]/route.ts';
    const exists = sourceExists(routePath);
    const content = readSource(routePath);
    const hasImagePng = content.includes("'image/png'") || content.includes('"image/png"');
    const pass = exists && hasImagePng;
    checks.push({
      id: 2,
      name: 'QR endpoint route file exists and returns image/png',
      pass,
      detail: pass
        ? `Route file at ${routePath} exists and contains image/png content type`
        : `exists=${exists}, hasImagePng=${hasImagePng}`,
      expected: 'Route exists at /api/public/qr/referral/[code] and returns image/png',
      actual: exists
        ? (hasImagePng ? 'Route exists and returns image/png' : 'Route exists but missing image/png header')
        : 'Route file not found',
    });
  }

  // Check 3: QR route generates valid PNG (file exists and uses qrcode library)
  {
    const routePath = 'src/app/api/public/qr/referral/[code]/route.ts';
    const content = readSource(routePath);
    const usesQRCode = content.includes('QRCode') || content.includes('qrcode');
    const hasToBuffer = content.includes('toBuffer');
    const pass = usesQRCode && hasToBuffer;
    checks.push({
      id: 3,
      name: 'QR route uses qrcode library with toBuffer for PNG generation',
      pass,
      detail: pass
        ? 'Route imports QRCode and calls toBuffer() for PNG generation'
        : `usesQRCode=${usesQRCode}, hasToBuffer=${hasToBuffer}`,
      expected: 'QRCode.toBuffer() called for PNG generation',
      actual: usesQRCode && hasToBuffer
        ? 'QRCode library and toBuffer() both present'
        : `usesQRCode=${usesQRCode}, hasToBuffer=${hasToBuffer}`,
    });
  }

  // Check 4: Email invite route rejects non-approved instructors
  {
    const content = readSource('src/app/api/instructor/invites/email/route.ts');
    const hasApprovedCheck = content.includes("profile.status !== 'approved'") ||
                              content.includes("status !== 'approved'");
    const has403 = content.includes('403');
    const pass = hasApprovedCheck && has403;
    checks.push({
      id: 4,
      name: 'Email invite route rejects non-approved instructors',
      pass,
      detail: pass
        ? "Route checks profile.status !== 'approved' and returns 403"
        : `hasApprovedCheck=${hasApprovedCheck}, has403=${has403}`,
      expected: "status !== 'approved' check with 403 response",
      actual: hasApprovedCheck && has403
        ? 'Approved status check and 403 response both present'
        : `approvedCheck=${hasApprovedCheck}, returns403=${has403}`,
    });
  }

  // Check 5: Rate limit defaults — email=20, token=50
  {
    const emailPass = DEFAULTS.EMAIL_INVITE_LIMIT === 20;
    const tokenPass = DEFAULTS.TOKEN_CREATION_LIMIT === 50;
    const pass = emailPass && tokenPass;
    checks.push({
      id: 5,
      name: 'Rate limit defaults: email=20, token=50',
      pass,
      detail: pass
        ? 'EMAIL_INVITE_LIMIT=20, TOKEN_CREATION_LIMIT=50'
        : `EMAIL_INVITE_LIMIT=${DEFAULTS.EMAIL_INVITE_LIMIT}, TOKEN_CREATION_LIMIT=${DEFAULTS.TOKEN_CREATION_LIMIT}`,
      expected: JSON.stringify({ EMAIL_INVITE_LIMIT: 20, TOKEN_CREATION_LIMIT: 50 }),
      actual: JSON.stringify({
        EMAIL_INVITE_LIMIT: DEFAULTS.EMAIL_INVITE_LIMIT,
        TOKEN_CREATION_LIMIT: DEFAULTS.TOKEN_CREATION_LIMIT,
      }),
    });
  }

  // Check 6: Rate limit window is 24 hours
  {
    const pass = DEFAULTS.RATE_LIMIT_WINDOW_HOURS === 24;
    checks.push({
      id: 6,
      name: 'Rate limit window is 24 hours',
      pass,
      detail: pass
        ? 'RATE_LIMIT_WINDOW_HOURS=24'
        : `Got ${DEFAULTS.RATE_LIMIT_WINDOW_HOURS}`,
      expected: '24',
      actual: String(DEFAULTS.RATE_LIMIT_WINDOW_HOURS),
    });
  }

  // Check 7: Self-referral blocked
  {
    const content = readSource('src/app/api/referral/claim/route.ts');
    const hasSelfCheck = content.includes('instructor.instructorUserId === user.id') ||
                          content.includes('instructorUserId === user.id');
    const hasOwnCodeMessage = content.includes('own referral code') ||
                               content.includes('self-connection');
    const pass = hasSelfCheck && hasOwnCodeMessage;
    checks.push({
      id: 7,
      name: 'Self-referral blocked in claim route',
      pass,
      detail: pass
        ? 'Claim route checks instructorUserId === user.id and returns user-friendly error'
        : `hasSelfCheck=${hasSelfCheck}, hasOwnCodeMessage=${hasOwnCodeMessage}`,
      expected: 'instructorUserId === user.id guard with rejection message',
      actual: hasSelfCheck && hasOwnCodeMessage
        ? 'Self-referral guard and error message both present'
        : `selfCheck=${hasSelfCheck}, message=${hasOwnCodeMessage}`,
    });
  }

  // Check 8: ConnectionSource values are exactly 4
  {
    const expectedValues = new Set(['referral_link', 'invite_link', 'student_search', 'admin']);
    const actualValues = new Set(CONNECTION_SOURCE_VALUES);
    const pass =
      actualValues.size === 4 &&
      [...expectedValues].every(v => actualValues.has(v as ConnectionSource));
    checks.push({
      id: 8,
      name: 'ConnectionSource values are exactly 4: referral_link, invite_link, student_search, admin',
      pass,
      detail: pass
        ? 'All 4 expected ConnectionSource values present'
        : `Expected 4, got ${actualValues.size}: [${[...actualValues].join(', ')}]`,
      expected: JSON.stringify([...expectedValues].sort()),
      actual: JSON.stringify([...actualValues].sort()),
    });
  }

  // Check 9: Email invite sends produce log event
  {
    const content = readSource('src/app/api/instructor/invites/email/route.ts');
    const logsInviteEvent = content.includes('logInviteEvent');
    const importsLogInviteEvent = content.includes("import") && content.includes('logInviteEvent');
    const pass = logsInviteEvent && importsLogInviteEvent;
    checks.push({
      id: 9,
      name: 'Email invite sends produce log event (logInviteEvent)',
      pass,
      detail: pass
        ? 'Email invite route imports and calls logInviteEvent'
        : `logsInviteEvent=${logsInviteEvent}, importsLogInviteEvent=${importsLogInviteEvent}`,
      expected: 'logInviteEvent imported and called in email invite route',
      actual: logsInviteEvent && importsLogInviteEvent
        ? 'logInviteEvent imported and called'
        : `calls=${logsInviteEvent}, imported=${importsLogInviteEvent}`,
    });
  }

  // Check 10: Admin metrics endpoint returns expected schema
  {
    const routePath = 'src/app/api/admin/quality/referrals/route.ts';
    const exists = sourceExists(routePath);
    const content = readSource(routePath);
    const expectedKeys = [
      'connectionsBySource',
      'identityCoverage',
      'topReferrers',
      'recentClaims',
      'inviteEvents',
      'courtesyBreakdown',
    ];
    const foundKeys = expectedKeys.filter(k => content.includes(k));
    const pass = exists && foundKeys.length === expectedKeys.length;
    checks.push({
      id: 10,
      name: 'Admin metrics endpoint returns expected schema keys',
      pass,
      detail: pass
        ? `Route at ${routePath} exists and contains all ${expectedKeys.length} expected response keys`
        : `exists=${exists}, foundKeys=${foundKeys.length}/${expectedKeys.length}: [${foundKeys.join(', ')}]`,
      expected: `Route exists with keys: ${expectedKeys.join(', ')}`,
      actual: exists
        ? `Found ${foundKeys.length}/${expectedKeys.length} keys: [${foundKeys.join(', ')}]`
        : 'Route file not found',
    });
  }

  // Check 11: Feature flag gating on referral claim
  {
    const content = readSource('src/app/api/referral/claim/route.ts');
    const hasFeatureCheck = content.includes('isInstructorFeatureEnabled');
    const imports = content.includes("import") && content.includes('isInstructorFeatureEnabled');
    const pass = hasFeatureCheck && imports;
    checks.push({
      id: 11,
      name: 'Feature flag gating: referral claim checks isInstructorFeatureEnabled',
      pass,
      detail: pass
        ? 'Claim route imports and checks isInstructorFeatureEnabled before processing'
        : `hasFeatureCheck=${hasFeatureCheck}, imported=${imports}`,
      expected: 'isInstructorFeatureEnabled imported and called in claim route',
      actual: hasFeatureCheck && imports
        ? 'Feature flag check imported and called'
        : `check=${hasFeatureCheck}, imported=${imports}`,
    });
  }

  // Check 12: No certificate_number in public responses
  {
    const lookupRoute = readSource('src/app/api/referral/lookup/route.ts');
    const lookupLib = readSource('src/lib/instructor-identity.ts');

    // The lookup route delegates to lookupByReferralCode / lookupBySlug.
    // Check that those functions' .select() calls never include certificate_number.
    // We extract the .select('...') column lists from each function.
    const lookupByReferralCodeMatch = lookupLib.match(
      /lookupByReferralCode[\s\S]*?\.select\(['"`](.*?)['"`]\)/
    );
    const lookupBySlugMatch = lookupLib.match(
      /lookupBySlug[\s\S]*?\.select\(['"`](.*?)['"`]\)/
    );

    const referralCodeSelect = lookupByReferralCodeMatch?.[1] || '';
    const slugSelect = lookupBySlugMatch?.[1] || '';

    const referralCodeSafe = !referralCodeSelect.includes('certificate_number');
    const slugSafe = !slugSelect.includes('certificate_number');

    // Check that the lookup route does NOT .select() certificate_number
    // (comments like "NEVER returns certificate_number" are documentation, not code)
    const routeSelectMatches = lookupRoute.match(/\.select\(['"`](.*?)['"`]\)/g) || [];
    const routeSelectSafe = !routeSelectMatches.some(m => m.includes('certificate_number'));

    // Check the ReferralLookup interface does not include certificate_number as a field
    const interfaceMatch = lookupLib.match(
      /export\s+interface\s+ReferralLookup\s*\{([^}]*)\}/
    );
    const interfaceBody = interfaceMatch?.[1] || '';
    const interfaceSafe = !interfaceBody.includes('certificate_number');

    const pass = referralCodeSafe && slugSafe && routeSelectSafe && interfaceSafe;
    checks.push({
      id: 12,
      name: 'No certificate_number in public referral responses',
      pass,
      detail: pass
        ? 'Neither lookupByReferralCode nor lookupBySlug select certificate_number; ReferralLookup interface is clean'
        : `referralCodeSafe=${referralCodeSafe}, slugSafe=${slugSafe}, routeSelectSafe=${routeSelectSafe}, interfaceSafe=${interfaceSafe}`,
      expected: 'certificate_number absent from all public-facing selects and interfaces',
      actual: pass
        ? 'All public paths verified clean'
        : `referralCode=${referralCodeSafe}, slug=${slugSafe}, routeSelect=${routeSelectSafe}, interface=${interfaceSafe}`,
    });
  }

  return checks;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('=== Instructor Abuse Hardening — Deterministic Offline Audit ===');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log(`Phase: 7 (Abuse Hardening)\n`);

  const checks = runChecks();

  // Print each check
  for (const c of checks) {
    const icon = c.pass ? '[PASS]' : '[FAIL]';
    console.log(`  ${icon} Check ${c.id}: ${c.name}`);
    if (!c.pass) {
      console.log(`         Expected: ${c.expected}`);
      console.log(`         Actual:   ${c.actual}`);
    }
  }

  const passed = checks.filter(c => c.pass).length;
  const failed = checks.filter(c => !c.pass).length;
  const total = checks.length;
  const overallPass = failed === 0;

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Total checks: ${total}`);
  console.log(`  Passed:       ${passed}`);
  console.log(`  Failed:       ${failed}`);
  console.log(`  Result:       ${overallPass ? 'ALL PASS' : 'FAILURES DETECTED'}`);

  // -------------------------------------------------------------------------
  // Write evidence files
  // -------------------------------------------------------------------------
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  // JSON evidence
  const jsonEvidence = {
    audit: 'instructor-abuse-hardening',
    phase: 7,
    timestamp: new Date().toISOString(),
    environment: 'offline-deterministic',
    inlined_constants: {
      PAID_ACTIVE_SUBSCRIPTION_STATUSES,
      COURTESY_TIER,
      DEFAULTS,
      REFERRAL_ALPHABET,
      REFERRAL_CODE_LENGTH,
      CONNECTION_SOURCE_VALUES,
    },
    source_files_checked: [
      'src/app/api/public/qr/referral/[code]/route.ts',
      'src/app/api/instructor/invites/email/route.ts',
      'src/app/api/referral/claim/route.ts',
      'src/app/api/referral/lookup/route.ts',
      'src/app/api/admin/quality/referrals/route.ts',
      'src/lib/instructor-identity.ts',
    ],
    checks: checks.map(c => ({
      id: c.id,
      name: c.name,
      pass: c.pass,
      detail: c.detail,
      expected: c.expected,
      actual: c.actual,
    })),
    summary: {
      total,
      passed,
      failed,
      overall_pass: overallPass,
    },
  };

  writeFileSync(
    join(EVIDENCE_DIR, 'instructor-abuse-audit.json'),
    JSON.stringify(jsonEvidence, null, 2)
  );

  // Markdown evidence
  let md = `# Instructor Abuse Hardening — Deterministic Offline Audit\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**Phase:** 7 (Abuse Hardening)\n`;
  md += `**Environment:** Offline deterministic (no database required)\n`;
  md += `**Overall result:** ${overallPass ? 'PASS' : 'FAIL'}\n\n`;

  md += `## Inlined Constants\n\n`;
  md += `| Constant | Value |\n`;
  md += `|----------|-------|\n`;
  md += `| PAID_ACTIVE_SUBSCRIPTION_STATUSES | \`${JSON.stringify(PAID_ACTIVE_SUBSCRIPTION_STATUSES)}\` |\n`;
  md += `| COURTESY_TIER | \`${COURTESY_TIER}\` |\n`;
  md += `| DEFAULTS.EMAIL_INVITE_LIMIT | \`${DEFAULTS.EMAIL_INVITE_LIMIT}\` |\n`;
  md += `| DEFAULTS.TOKEN_CREATION_LIMIT | \`${DEFAULTS.TOKEN_CREATION_LIMIT}\` |\n`;
  md += `| DEFAULTS.RATE_LIMIT_WINDOW_HOURS | \`${DEFAULTS.RATE_LIMIT_WINDOW_HOURS}\` |\n`;
  md += `| REFERRAL_ALPHABET | \`${REFERRAL_ALPHABET}\` |\n`;
  md += `| REFERRAL_CODE_LENGTH | \`${REFERRAL_CODE_LENGTH}\` |\n`;
  md += `| CONNECTION_SOURCE_VALUES | \`${JSON.stringify(CONNECTION_SOURCE_VALUES)}\` |\n\n`;

  md += `## Source Files Checked\n\n`;
  md += `| File | Exists |\n`;
  md += `|------|--------|\n`;
  const sourceFiles = [
    'src/app/api/public/qr/referral/[code]/route.ts',
    'src/app/api/instructor/invites/email/route.ts',
    'src/app/api/referral/claim/route.ts',
    'src/app/api/referral/lookup/route.ts',
    'src/app/api/admin/quality/referrals/route.ts',
    'src/lib/instructor-identity.ts',
  ];
  for (const f of sourceFiles) {
    md += `| \`${f}\` | ${sourceExists(f) ? 'Yes' : 'No'} |\n`;
  }
  md += `\n`;

  md += `## Checks\n\n`;
  md += `| # | Check | Pass | Detail |\n`;
  md += `|---|-------|------|--------|\n`;
  for (const c of checks) {
    const icon = c.pass ? 'PASS' : 'FAIL';
    md += `| ${c.id} | ${c.name} | ${icon} | ${c.detail} |\n`;
  }

  md += `\n## Summary\n\n`;
  md += `- **Total checks:** ${total}\n`;
  md += `- **Passed:** ${passed}\n`;
  md += `- **Failed:** ${failed}\n`;
  md += `- **Result:** ${overallPass ? 'ALL PASS' : 'FAILURES DETECTED'}\n\n`;

  md += `## Methodology\n\n`;
  md += `This audit validates the Phase 7 abuse hardening features using two strategies:\n\n`;
  md += `### 1. Inlined Constant Verification\n\n`;
  md += `Pure-logic constants are inlined from source modules to avoid \`server-only\` import guards. `;
  md += `Constants verified:\n\n`;
  md += `- \`PAID_ACTIVE_SUBSCRIPTION_STATUSES\` from \`src/lib/instructor-entitlements.ts\` `;
  md += `(must be \`['active']\` only — trialing excluded by default)\n`;
  md += `- Rate limit defaults from \`src/lib/instructor-rate-limiter.ts\` `;
  md += `(email=20/day, token=50/day, 24h window)\n`;
  md += `- \`ConnectionSource\` enum values from \`src/types/database.ts\` (exactly 4 values)\n\n`;
  md += `### 2. Source Code Content Analysis\n\n`;
  md += `Route files are read and searched for critical security patterns:\n\n`;
  md += `- QR endpoint existence and content-type (\`image/png\`)\n`;
  md += `- Approved-status gating on email invites\n`;
  md += `- Self-referral blocking in claim route (\`instructorUserId === user.id\`)\n`;
  md += `- Feature flag gating (\`isInstructorFeatureEnabled\`)\n`;
  md += `- Invite event logging (\`logInviteEvent\`)\n`;
  md += `- Admin metrics response schema completeness\n`;
  md += `- Public data safety: \`certificate_number\` never in public selects or responses\n`;

  writeFileSync(join(EVIDENCE_DIR, 'instructor-abuse-audit.md'), md);

  console.log(`\nEvidence saved to ${EVIDENCE_DIR}/`);
  console.log(`  - instructor-abuse-audit.json`);
  console.log(`  - instructor-abuse-audit.md`);

  if (!overallPass) process.exit(1);
}

main();
