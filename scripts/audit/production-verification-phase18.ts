/**
 * Production Verification Matrix (Phase 18)
 *
 * HTTP-level checks against the live production URL.
 * Validates public pages, security headers, API auth gates, and admin endpoints.
 *
 * Usage:
 *   npx tsx scripts/audit/production-verification-phase18.ts
 *   BASE_URL=http://localhost:3000 npx tsx scripts/audit/production-verification-phase18.ts
 *
 * Exit code 0 = all checks pass, 1 = any check failed.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL =
  process.env.BASE_URL || 'https://aviation-oral-exam-companion.vercel.app';

const TIMEOUT_MS = 15_000;

const EVIDENCE_DIR = join(
  process.cwd(),
  'docs/system-audit/evidence/2026-03-15-phase18/api'
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  category: string;
  expected: string;
  actual: string;
  pass: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: 'follow',
    });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// A) Public-Facing Pages
// ---------------------------------------------------------------------------

async function checkPublicPage(
  name: string,
  path: string,
  expectedStatus: number,
  contentMarkers: string[]
): Promise<CheckResult> {
  const url = `${BASE_URL}${path}`;

  try {
    const resp = await fetchWithTimeout(url);
    const body = await resp.text();
    const bodyUpper = body.toUpperCase();

    // Check status
    if (resp.status !== expectedStatus) {
      return {
        name,
        category: 'A) Public Pages',
        expected: `HTTP ${expectedStatus} + markers: [${contentMarkers.join(', ')}]`,
        actual: `HTTP ${resp.status}`,
        pass: false,
      };
    }

    // Check content markers
    const missingMarkers = contentMarkers.filter(
      (m) => !bodyUpper.includes(m.toUpperCase())
    );

    if (missingMarkers.length > 0) {
      return {
        name,
        category: 'A) Public Pages',
        expected: `HTTP ${expectedStatus} + markers: [${contentMarkers.join(', ')}]`,
        actual: `HTTP ${resp.status}, missing markers: [${missingMarkers.join(', ')}]`,
        pass: false,
      };
    }

    return {
      name,
      category: 'A) Public Pages',
      expected: `HTTP ${expectedStatus} + markers: [${contentMarkers.join(', ')}]`,
      actual: `HTTP ${resp.status}, all markers found`,
      pass: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name,
      category: 'A) Public Pages',
      expected: `HTTP ${expectedStatus}`,
      actual: `ERROR: ${msg}`,
      pass: false,
    };
  }
}

async function checkPublicPages(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1. Landing page
  results.push(
    await checkPublicPage('Landing page (/)', '/', 200, ['HEYDPE'])
  );

  // 2. Pricing page
  results.push(
    await checkPublicPage('Pricing page (/pricing)', '/pricing', 200, [
      'PRICING',
      '$39',
    ])
  );

  // 3. Help/FAQ page (NEW in Phase 16)
  results.push(
    await checkPublicPage('Help/FAQ page (/help)', '/help', 200, [
      'HELP',
      'FAQ',
    ])
  );

  // 4. Login page
  results.push(
    await checkPublicPage('Login page (/login)', '/login', 200, ['SIGN IN'])
  );

  // 5. Signup page (redirects to /login — check for GET STARTED or SIGN IN)
  results.push(
    await checkPublicPage('Signup page (/signup)', '/signup', 200, ['GET STARTED'])
  );

  // 6. Privacy page
  results.push(
    await checkPublicPage('Privacy page (/privacy)', '/privacy', 200, [
      'PRIVACY',
    ])
  );

  // 7. Terms page
  results.push(
    await checkPublicPage('Terms page (/terms)', '/terms', 200, ['TERMS'])
  );

  // 8. Try page
  results.push(
    await checkPublicPage('Try page (/try)', '/try', 200, [])
  );

  // 9. 404 page
  const notFoundUrl = `${BASE_URL}/nonexistent-page-test`;
  try {
    const resp = await fetchWithTimeout(notFoundUrl);
    results.push({
      name: '404 page (/nonexistent-page-test)',
      category: 'A) Public Pages',
      expected: 'HTTP 404',
      actual: `HTTP ${resp.status}`,
      pass: resp.status === 404,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({
      name: '404 page (/nonexistent-page-test)',
      category: 'A) Public Pages',
      expected: 'HTTP 404',
      actual: `ERROR: ${msg}`,
      pass: false,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// B) Security Headers
// ---------------------------------------------------------------------------

async function checkSecurityHeaders(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const url = `${BASE_URL}/`;

  try {
    const resp = await fetchWithTimeout(url);

    // 10. X-Content-Type-Options
    const xcto = resp.headers.get('x-content-type-options');
    results.push({
      name: 'X-Content-Type-Options header',
      category: 'B) Security Headers',
      expected: 'nosniff',
      actual: xcto ?? '(not set)',
      pass: xcto?.toLowerCase() === 'nosniff',
    });

    // 11. X-Frame-Options
    const xfo = resp.headers.get('x-frame-options');
    results.push({
      name: 'X-Frame-Options header',
      category: 'B) Security Headers',
      expected: 'DENY',
      actual: xfo ?? '(not set)',
      pass: xfo?.toUpperCase() === 'DENY',
    });

    // 12. Content-Security-Policy (NEW in Phase 17)
    const csp = resp.headers.get('content-security-policy');
    results.push({
      name: 'Content-Security-Policy header',
      category: 'B) Security Headers',
      expected: 'present',
      actual: csp ? `present (${csp.slice(0, 80)}...)` : '(not set)',
      pass: csp !== null && csp.length > 0,
    });

    // 13. Referrer-Policy
    const rp = resp.headers.get('referrer-policy');
    results.push({
      name: 'Referrer-Policy header',
      category: 'B) Security Headers',
      expected: 'present',
      actual: rp ?? '(not set)',
      pass: rp !== null && rp.length > 0,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If we can't reach the server, all header checks fail
    for (const headerName of [
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Content-Security-Policy',
      'Referrer-Policy',
    ]) {
      results.push({
        name: `${headerName} header`,
        category: 'B) Security Headers',
        expected: 'present',
        actual: `ERROR: ${msg}`,
        pass: false,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// C) API Health Checks (unauthenticated => 401)
// ---------------------------------------------------------------------------

async function checkApiEndpoint(
  name: string,
  path: string,
  method: string,
  expectedStatuses: number[]
): Promise<CheckResult> {
  const url = `${BASE_URL}${path}`;

  try {
    const resp = await fetchWithTimeout(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify({}) : undefined,
    });

    return {
      name,
      category: 'C) API Auth Gates',
      expected: `HTTP ${expectedStatuses.join(' or ')}`,
      actual: `HTTP ${resp.status}`,
      pass: expectedStatuses.includes(resp.status),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name,
      category: 'C) API Auth Gates',
      expected: `HTTP ${expectedStatuses.join(' or ')}`,
      actual: `ERROR: ${msg}`,
      pass: false,
    };
  }
}

async function checkApiHealthChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 14. POST /api/exam
  results.push(
    await checkApiEndpoint('POST /api/exam', '/api/exam', 'POST', [401])
  );

  // 15. POST /api/tts
  results.push(
    await checkApiEndpoint('POST /api/tts', '/api/tts', 'POST', [401])
  );

  // 16. POST /api/report
  results.push(
    await checkApiEndpoint('POST /api/report', '/api/report', 'POST', [401])
  );

  // 17. POST /api/session
  results.push(
    await checkApiEndpoint('POST /api/session', '/api/session', 'POST', [401])
  );

  return results;
}

// ---------------------------------------------------------------------------
// D) Admin Endpoints (unauthenticated => 401 or 403)
// ---------------------------------------------------------------------------

async function checkAdminEndpoint(
  name: string,
  path: string,
  method: string,
  expectedStatuses: number[]
): Promise<CheckResult> {
  const url = `${BASE_URL}${path}`;

  try {
    const resp = await fetchWithTimeout(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify({}) : undefined,
    });

    return {
      name,
      category: 'D) Admin Endpoints',
      expected: `HTTP ${expectedStatuses.join(' or ')}`,
      actual: `HTTP ${resp.status}`,
      pass: expectedStatuses.includes(resp.status),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name,
      category: 'D) Admin Endpoints',
      expected: `HTTP ${expectedStatuses.join(' or ')}`,
      actual: `ERROR: ${msg}`,
      pass: false,
    };
  }
}

async function checkAdminEndpoints(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 18. GET /api/admin/quality/examiner-identity
  results.push(
    await checkAdminEndpoint(
      'GET /api/admin/quality/examiner-identity',
      '/api/admin/quality/examiner-identity',
      'GET',
      [401, 403]
    )
  );

  // 19. GET /api/admin/quality/prompts
  results.push(
    await checkAdminEndpoint(
      'GET /api/admin/quality/prompts',
      '/api/admin/quality/prompts',
      'GET',
      [401, 403]
    )
  );

  return results;
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

function generateTextReport(results: CheckResult[], timestamp: string): string {
  let txt = '';
  txt += `Production Verification Matrix (Phase 18)\n`;
  txt += `${'='.repeat(50)}\n`;
  txt += `Date: ${timestamp.split('T')[0]}\n`;
  txt += `Timestamp: ${timestamp}\n`;
  txt += `Base URL: ${BASE_URL}\n`;
  txt += `Total checks: ${results.length}\n`;
  txt += `Passed: ${results.filter((r) => r.pass).length}\n`;
  txt += `Failed: ${results.filter((r) => !r.pass).length}\n\n`;

  const categories = [...new Set(results.map((r) => r.category))];

  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPassed = catResults.filter((r) => r.pass).length;
    txt += `--- ${cat} (${catPassed}/${catResults.length} passed) ---\n`;

    for (const r of catResults) {
      const icon = r.pass ? '[PASS]' : '[FAIL]';
      txt += `  ${icon} ${r.name}\n`;
      txt += `         Expected: ${r.expected}\n`;
      txt += `         Actual:   ${r.actual}\n`;
    }
    txt += '\n';
  }

  // Summary table
  txt += `--- SUMMARY ---\n`;
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPassed = catResults.filter((r) => r.pass).length;
    const padded = cat.padEnd(30);
    txt += `  ${padded} ${catPassed}/${catResults.length} passed\n`;
  }

  const totalPassed = results.filter((r) => r.pass).length;
  txt += `\n  OVERALL: ${totalPassed}/${results.length} checks passed`;
  txt += totalPassed === results.length ? ' -- ALL PASS\n' : ' -- FAILURES DETECTED\n';

  return txt;
}

function generateJsonReport(
  results: CheckResult[],
  timestamp: string
): object {
  const categories = [...new Set(results.map((r) => r.category))];

  return {
    metadata: {
      phase: 'Phase 18 -- Production Verification Matrix',
      timestamp,
      base_url: BASE_URL,
      total_checks: results.length,
      passed: results.filter((r) => r.pass).length,
      failed: results.filter((r) => !r.pass).length,
      all_pass: results.every((r) => r.pass),
    },
    categories: categories.map((cat) => {
      const catResults = results.filter((r) => r.category === cat);
      return {
        name: cat,
        passed: catResults.filter((r) => r.pass).length,
        total: catResults.length,
        checks: catResults.map((r) => ({
          name: r.name,
          expected: r.expected,
          actual: r.actual,
          pass: r.pass,
        })),
      };
    }),
    results,
  };
}

// ---------------------------------------------------------------------------
// Console Output
// ---------------------------------------------------------------------------

function printResults(results: CheckResult[]): void {
  const categories = [...new Set(results.map((r) => r.category))];

  console.log('');
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPassed = catResults.filter((r) => r.pass).length;
    console.log(`--- ${cat} (${catPassed}/${catResults.length}) ---`);

    for (const r of catResults) {
      const icon = r.pass ? '\u2705' : '\u274C';
      console.log(`  ${icon} ${r.name}`);
      if (!r.pass) {
        console.log(`     Expected: ${r.expected}`);
        console.log(`     Actual:   ${r.actual}`);
      }
    }
    console.log('');
  }

  const totalPassed = results.filter((r) => r.pass).length;
  const totalFailed = results.filter((r) => !r.pass).length;

  console.log('=== OVERALL ===');
  console.log(`  Passed: ${totalPassed}/${results.length}`);
  if (totalFailed > 0) {
    console.log(`  Failed: ${totalFailed}/${results.length}`);
  }
  console.log(
    totalPassed === results.length
      ? '  Result: ALL CHECKS PASS'
      : '  Result: FAILURES DETECTED'
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`=== Production Verification Matrix (Phase 18) ===`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms`);

  const timestamp = new Date().toISOString();

  // Run all check groups
  console.log('\nChecking public pages...');
  const publicPages = await checkPublicPages();

  console.log('Checking security headers...');
  const securityHeaders = await checkSecurityHeaders();

  console.log('Checking API auth gates...');
  const apiChecks = await checkApiHealthChecks();

  console.log('Checking admin endpoints...');
  const adminChecks = await checkAdminEndpoints();

  const allResults = [
    ...publicPages,
    ...securityHeaders,
    ...apiChecks,
    ...adminChecks,
  ];

  // Print formatted results to console
  printResults(allResults);

  // Write evidence files
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  const txtReport = generateTextReport(allResults, timestamp);
  writeFileSync(
    join(EVIDENCE_DIR, 'production-verification.txt'),
    txtReport
  );

  const jsonReport = generateJsonReport(allResults, timestamp);
  writeFileSync(
    join(EVIDENCE_DIR, 'production-verification.json'),
    JSON.stringify(jsonReport, null, 2)
  );

  console.log(
    `\nEvidence saved to:\n  ${join(EVIDENCE_DIR, 'production-verification.txt')}\n  ${join(EVIDENCE_DIR, 'production-verification.json')}`
  );

  // Exit code
  const allPass = allResults.every((r) => r.pass);
  if (!allPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
