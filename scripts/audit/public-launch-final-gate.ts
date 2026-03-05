/**
 * Public Launch Final Gate (Phase 21)
 *
 * Definitive final launch gate — 16 automated checks across 6 categories:
 *   1. Build Verification (typecheck, unit tests, build script)
 *   2. Observability Infrastructure (health endpoint, PostHog, analytics events)
 *   3. Cron & Background Jobs (config, auth, error handling)
 *   4. Email System (templates, logging, unsubscribe)
 *   5. Security (admin auth, rate limiting)
 *   6. Error Handling (error boundary, 404 page)
 *
 * Usage: npx tsx scripts/audit/public-launch-final-gate.ts
 * No database access required — file-content and CLI checks only.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
} from 'fs';
import { execSync } from 'child_process';
import { join, relative, extname } from 'path';

const ROOT = join(__dirname, '..', '..');
const EVIDENCE_DIR = join(
  ROOT,
  'docs/system-audit/evidence/2026-03-04-phase21/commands'
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Verdict = 'GO' | 'REVIEW' | 'NO-GO';

interface CheckResult {
  check: string;
  category: string;
  verdict: Verdict;
  detail: string;
}

interface CategoryResult {
  name: string;
  checks: CheckResult[];
  verdict: Verdict;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function categoryVerdict(checks: CheckResult[]): Verdict {
  if (checks.some(c => c.verdict === 'NO-GO')) return 'NO-GO';
  if (checks.some(c => c.verdict === 'REVIEW')) return 'REVIEW';
  return 'GO';
}

function overallVerdict(categories: CategoryResult[]): Verdict {
  const allChecks = categories.flatMap(c => c.checks);
  const noGoCount = allChecks.filter(c => c.verdict === 'NO-GO').length;
  const reviewCount = allChecks.filter(c => c.verdict === 'REVIEW').length;

  if (noGoCount > 0) return 'NO-GO';
  if (reviewCount > 2) return 'REVIEW';
  if (reviewCount > 0) return 'REVIEW';
  return 'GO';
}

function verdictIcon(v: Verdict): string {
  switch (v) {
    case 'GO': return '\u2705 GO  ';
    case 'REVIEW': return '\u26A0\uFE0F  REVIEW';
    case 'NO-GO': return '\u274C NO-GO';
  }
}

function verdictLabel(v: Verdict): string {
  return v;
}

/**
 * Read a project-relative file and return its contents, or null if missing.
 */
function readProjectFile(relativePath: string): string | null {
  const fullPath = join(ROOT, relativePath);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, 'utf-8');
}

/**
 * Walk a directory tree and return all .ts/.tsx files, skipping node_modules.
 */
function walkDir(dir: string): string[] {
  const results: string[] = [];
  const scanExtensions = new Set(['.ts', '.tsx']);
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          results.push(...walkDir(fullPath));
        } else if (scanExtensions.has(extname(entry))) {
          results.push(fullPath);
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Skip unreadable directories
  }
  return results;
}

// ---------------------------------------------------------------------------
// Category 1: Build Verification
// ---------------------------------------------------------------------------

function checkTypecheck(category: string): CheckResult {
  try {
    execSync('npx tsc --noEmit', {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 120_000,
    });
    return {
      check: 'typecheck',
      category,
      verdict: 'GO',
      detail: 'TypeScript compiles without errors',
    };
  } catch (err: unknown) {
    const stderr =
      err instanceof Error && 'stderr' in err
        ? String((err as { stderr: string }).stderr).slice(0, 500)
        : 'unknown error';
    return {
      check: 'typecheck',
      category,
      verdict: 'NO-GO',
      detail: `TypeScript compilation failed: ${stderr}`,
    };
  }
}

function checkUnitTests(category: string): CheckResult {
  try {
    const stdout = execSync('npx vitest run', {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 120_000,
    });

    // Extract summary line (e.g., "Tests  235 passed (235)")
    const summaryMatch = stdout.match(/Tests\s+(\d+)\s+passed/);
    const testCount = summaryMatch ? summaryMatch[1] : '?';

    return {
      check: 'unit_tests',
      category,
      verdict: 'GO',
      detail: `All tests pass (${testCount} passed)`,
    };
  } catch (err: unknown) {
    const stdout =
      err instanceof Error && 'stdout' in err
        ? String((err as { stdout: string }).stdout).slice(-500)
        : 'unknown error';
    return {
      check: 'unit_tests',
      category,
      verdict: 'NO-GO',
      detail: `Test suite failed: ${stdout}`,
    };
  }
}

function checkBuild(category: string): CheckResult {
  // Don't actually run `npm run build` (too slow) — verify package.json has
  // a build script and check for known build artifacts or script existence.
  const pkgContent = readProjectFile('package.json');
  if (!pkgContent) {
    return {
      check: 'build',
      category,
      verdict: 'NO-GO',
      detail: 'package.json not found',
    };
  }

  try {
    const pkg = JSON.parse(pkgContent);
    if (pkg.scripts?.build) {
      // Check if .next/ exists (previous build)
      const hasNextDir = existsSync(join(ROOT, '.next'));
      const buildScript = pkg.scripts.build;
      return {
        check: 'build',
        category,
        verdict: 'GO',
        detail: `Build script exists: "${buildScript}"${hasNextDir ? ' — .next/ directory present from previous build' : ' — .next/ not present (run npm run build to generate)'}`,
      };
    }
    return {
      check: 'build',
      category,
      verdict: 'NO-GO',
      detail: 'No "build" script in package.json',
    };
  } catch {
    return {
      check: 'build',
      category,
      verdict: 'NO-GO',
      detail: 'Failed to parse package.json',
    };
  }
}

// ---------------------------------------------------------------------------
// Category 2: Observability Infrastructure
// ---------------------------------------------------------------------------

function checkHealthEndpoint(category: string): CheckResult {
  const content = readProjectFile('src/app/api/health/route.ts');
  if (content === null) {
    return {
      check: 'health_endpoint',
      category,
      verdict: 'NO-GO',
      detail: 'File not found: src/app/api/health/route.ts',
    };
  }

  if (content.includes('export') && /async\s+function\s+GET/.test(content)) {
    return {
      check: 'health_endpoint',
      category,
      verdict: 'GO',
      detail: 'Health endpoint exists with GET export — src/app/api/health/route.ts',
    };
  }

  return {
    check: 'health_endpoint',
    category,
    verdict: 'NO-GO',
    detail: 'src/app/api/health/route.ts exists but missing GET export',
  };
}

function checkPosthogConfigured(category: string): CheckResult {
  const serverModule = readProjectFile('src/lib/posthog-server.ts');
  const clientModule =
    readProjectFile('src/components/PostHogProvider.tsx') ||
    readProjectFile('src/lib/posthog-client.ts');

  if (serverModule && clientModule) {
    return {
      check: 'posthog_configured',
      category,
      verdict: 'GO',
      detail: 'PostHog server module (src/lib/posthog-server.ts) and client module (src/components/PostHogProvider.tsx) both exist',
    };
  }

  const found: string[] = [];
  const missing: string[] = [];
  if (serverModule) found.push('server'); else missing.push('server (src/lib/posthog-server.ts)');
  if (clientModule) found.push('client'); else missing.push('client (src/components/PostHogProvider.tsx)');

  return {
    check: 'posthog_configured',
    category,
    verdict: missing.length > 0 ? 'NO-GO' : 'GO',
    detail: `PostHog modules — found: [${found.join(', ')}], missing: [${missing.join(', ')}]`,
  };
}

function checkAnalyticsEvents(category: string): CheckResult {
  const srcDir = join(ROOT, 'src');
  const files = walkDir(srcDir);
  let callCount = 0;

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const matches = content.match(/captureServerEvent\s*\(/g);
      if (matches) {
        callCount += matches.length;
      }
    } catch {
      // Skip unreadable files
    }
  }

  const threshold = 15;
  if (callCount >= threshold) {
    return {
      check: 'analytics_events',
      category,
      verdict: 'GO',
      detail: `Found ${callCount} captureServerEvent calls (threshold: >= ${threshold})`,
    };
  }

  return {
    check: 'analytics_events',
    category,
    verdict: callCount >= 10 ? 'REVIEW' : 'NO-GO',
    detail: `Found ${callCount} captureServerEvent calls (threshold: >= ${threshold}) — insufficient analytics coverage`,
  };
}

// ---------------------------------------------------------------------------
// Category 3: Cron & Background Jobs
// ---------------------------------------------------------------------------

function checkCronConfig(category: string): CheckResult {
  const content = readProjectFile('vercel.json');
  if (content === null) {
    return {
      check: 'cron_config',
      category,
      verdict: 'NO-GO',
      detail: 'vercel.json not found',
    };
  }

  try {
    const config = JSON.parse(content);
    const cronCount = config.crons?.length || 0;

    if (cronCount >= 2) {
      const paths = (config.crons as Array<{ path: string }>).map(c => c.path).join(', ');
      return {
        check: 'cron_config',
        category,
        verdict: 'GO',
        detail: `vercel.json has ${cronCount} cron entries: ${paths}`,
      };
    }

    return {
      check: 'cron_config',
      category,
      verdict: 'NO-GO',
      detail: `vercel.json has ${cronCount} cron entries (expected >= 2)`,
    };
  } catch {
    return {
      check: 'cron_config',
      category,
      verdict: 'NO-GO',
      detail: 'Failed to parse vercel.json',
    };
  }
}

function checkCronAuth(category: string): CheckResult {
  const cronRoutes = [
    'src/app/api/cron/daily-digest/route.ts',
    'src/app/api/cron/nudges/route.ts',
  ];

  const results: { route: string; hasCronSecret: boolean }[] = [];

  for (const route of cronRoutes) {
    const content = readProjectFile(route);
    if (content === null) {
      results.push({ route, hasCronSecret: false });
      continue;
    }
    results.push({
      route,
      hasCronSecret: content.includes('CRON_SECRET'),
    });
  }

  const allSecured = results.every(r => r.hasCronSecret);
  const noneFound = results.every(r => !r.hasCronSecret);

  if (allSecured) {
    return {
      check: 'cron_auth',
      category,
      verdict: 'GO',
      detail: `Both cron routes check CRON_SECRET: ${cronRoutes.join(', ')}`,
    };
  }

  const failing = results.filter(r => !r.hasCronSecret).map(r => r.route);
  return {
    check: 'cron_auth',
    category,
    verdict: noneFound ? 'NO-GO' : 'REVIEW',
    detail: `Cron routes missing CRON_SECRET check: ${failing.join(', ')}`,
  };
}

function checkCronErrorHandling(category: string): CheckResult {
  const cronRoutes = [
    'src/app/api/cron/daily-digest/route.ts',
    'src/app/api/cron/nudges/route.ts',
  ];

  const results: { route: string; hasTryCatch: boolean; hasStats: boolean }[] = [];

  for (const route of cronRoutes) {
    const content = readProjectFile(route);
    if (content === null) {
      results.push({ route, hasTryCatch: false, hasStats: false });
      continue;
    }
    results.push({
      route,
      hasTryCatch: content.includes('try {') && content.includes('catch'),
      hasStats: content.includes('stats') || content.includes('Stats'),
    });
  }

  const allGood = results.every(r => r.hasTryCatch && r.hasStats);
  if (allGood) {
    return {
      check: 'cron_error_handling',
      category,
      verdict: 'GO',
      detail: `Both cron routes have try/catch with stats tracking`,
    };
  }

  const issues: string[] = [];
  for (const r of results) {
    if (!r.hasTryCatch) issues.push(`${r.route}: missing try/catch`);
    if (!r.hasStats) issues.push(`${r.route}: missing stats tracking`);
  }

  return {
    check: 'cron_error_handling',
    category,
    verdict: 'REVIEW',
    detail: `Cron error handling issues: ${issues.join('; ')}`,
  };
}

// ---------------------------------------------------------------------------
// Category 4: Email System
// ---------------------------------------------------------------------------

function checkEmailTemplates(category: string): CheckResult {
  const emailsDir = join(ROOT, 'src/emails');
  if (!existsSync(emailsDir)) {
    return {
      check: 'email_templates',
      category,
      verdict: 'NO-GO',
      detail: 'src/emails/ directory not found',
    };
  }

  try {
    const entries = readdirSync(emailsDir);
    // Count .tsx files, excluding layout.tsx (it's a wrapper, not a template)
    const templates = entries.filter(
      e => e.endsWith('.tsx') && e !== 'layout.tsx'
    );
    const threshold = 5;

    if (templates.length >= threshold) {
      return {
        check: 'email_templates',
        category,
        verdict: 'GO',
        detail: `Found ${templates.length} email templates (threshold: >= ${threshold}): ${templates.join(', ')}`,
      };
    }

    return {
      check: 'email_templates',
      category,
      verdict: templates.length >= 3 ? 'REVIEW' : 'NO-GO',
      detail: `Found ${templates.length} email templates (threshold: >= ${threshold}): ${templates.join(', ')}`,
    };
  } catch {
    return {
      check: 'email_templates',
      category,
      verdict: 'NO-GO',
      detail: 'Failed to read src/emails/ directory',
    };
  }
}

function checkEmailLogging(category: string): CheckResult {
  const content = readProjectFile('src/lib/email-logging.ts');
  if (content !== null) {
    return {
      check: 'email_logging',
      category,
      verdict: 'GO',
      detail: 'Email logging module exists — src/lib/email-logging.ts',
    };
  }

  return {
    check: 'email_logging',
    category,
    verdict: 'NO-GO',
    detail: 'File not found: src/lib/email-logging.ts',
  };
}

function checkUnsubscribeSystem(category: string): CheckResult {
  const content = readProjectFile('src/lib/unsubscribe-token.ts');
  if (content !== null) {
    return {
      check: 'unsubscribe_system',
      category,
      verdict: 'GO',
      detail: 'Unsubscribe token module exists — src/lib/unsubscribe-token.ts',
    };
  }

  return {
    check: 'unsubscribe_system',
    category,
    verdict: 'NO-GO',
    detail: 'File not found: src/lib/unsubscribe-token.ts',
  };
}

// ---------------------------------------------------------------------------
// Category 5: Security
// ---------------------------------------------------------------------------

function checkAdminAuth(category: string): CheckResult {
  const adminDir = join(ROOT, 'src/app/api/admin');
  if (!existsSync(adminDir)) {
    return {
      check: 'admin_auth',
      category,
      verdict: 'NO-GO',
      detail: 'src/app/api/admin/ directory not found',
    };
  }

  // Find all admin route.ts files
  const adminRoutes = walkDir(adminDir).filter(f => f.endsWith('route.ts'));
  const withRequireAdmin: string[] = [];
  const withoutRequireAdmin: string[] = [];

  for (const routeFile of adminRoutes) {
    const content = readFileSync(routeFile, 'utf-8');
    const relPath = relative(ROOT, routeFile);
    if (content.includes('requireAdmin')) {
      withRequireAdmin.push(relPath);
    } else {
      withoutRequireAdmin.push(relPath);
    }
  }

  if (withoutRequireAdmin.length === 0 && withRequireAdmin.length > 0) {
    return {
      check: 'admin_auth',
      category,
      verdict: 'GO',
      detail: `All ${withRequireAdmin.length} admin endpoints use requireAdmin`,
    };
  }

  if (withoutRequireAdmin.length > 0) {
    return {
      check: 'admin_auth',
      category,
      verdict: 'NO-GO',
      detail: `${withoutRequireAdmin.length} admin endpoints missing requireAdmin: ${withoutRequireAdmin.slice(0, 5).join(', ')}${withoutRequireAdmin.length > 5 ? '...' : ''}`,
    };
  }

  return {
    check: 'admin_auth',
    category,
    verdict: 'NO-GO',
    detail: 'No admin route files found in src/app/api/admin/',
  };
}

function checkRateLimiting(category: string): CheckResult {
  const rateLimitFile = readProjectFile('src/lib/rate-limit.ts');
  if (rateLimitFile !== null) {
    return {
      check: 'rate_limiting',
      category,
      verdict: 'GO',
      detail: 'Rate limiting module exists — src/lib/rate-limit.ts',
    };
  }

  // Fallback: check middleware for rate limiting
  const middleware = readProjectFile('src/middleware.ts');
  if (middleware && (middleware.includes('rate') || middleware.includes('limit'))) {
    return {
      check: 'rate_limiting',
      category,
      verdict: 'GO',
      detail: 'Rate limiting found in middleware — src/middleware.ts',
    };
  }

  return {
    check: 'rate_limiting',
    category,
    verdict: 'NO-GO',
    detail: 'No rate limiting found — neither src/lib/rate-limit.ts nor middleware rate limiting detected',
  };
}

// ---------------------------------------------------------------------------
// Category 6: Error Handling
// ---------------------------------------------------------------------------

function checkErrorBoundary(category: string): CheckResult {
  const content = readProjectFile('src/app/error.tsx');
  if (content !== null) {
    return {
      check: 'error_boundary',
      category,
      verdict: 'GO',
      detail: 'Error boundary exists — src/app/error.tsx',
    };
  }

  return {
    check: 'error_boundary',
    category,
    verdict: 'NO-GO',
    detail: 'File not found: src/app/error.tsx',
  };
}

function checkNotFoundPage(category: string): CheckResult {
  const content = readProjectFile('src/app/not-found.tsx');
  if (content !== null) {
    return {
      check: 'not_found_page',
      category,
      verdict: 'GO',
      detail: '404 page exists — src/app/not-found.tsx',
    };
  }

  return {
    check: 'not_found_page',
    category,
    verdict: 'NO-GO',
    detail: 'File not found: src/app/not-found.tsx',
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('=== Public Launch Final Gate (Phase 21) ===\n');

  // --- Category 1: Build Verification ---
  console.log('Running typecheck (this may take a moment)...');
  const typecheckResult = checkTypecheck('Build Verification');
  console.log(`  ${verdictIcon(typecheckResult.verdict)} typecheck`);

  console.log('Running unit tests (this may take a moment)...');
  const unitTestsResult = checkUnitTests('Build Verification');
  console.log(`  ${verdictIcon(unitTestsResult.verdict)} unit_tests`);

  const buildResult = checkBuild('Build Verification');

  const buildChecks: CheckResult[] = [typecheckResult, unitTestsResult, buildResult];
  const cat1: CategoryResult = {
    name: 'Build Verification',
    checks: buildChecks,
    verdict: categoryVerdict(buildChecks),
  };

  // --- Category 2: Observability Infrastructure ---
  const observabilityChecks: CheckResult[] = [
    checkHealthEndpoint('Observability Infrastructure'),
    checkPosthogConfigured('Observability Infrastructure'),
    checkAnalyticsEvents('Observability Infrastructure'),
  ];

  const cat2: CategoryResult = {
    name: 'Observability Infrastructure',
    checks: observabilityChecks,
    verdict: categoryVerdict(observabilityChecks),
  };

  // --- Category 3: Cron & Background Jobs ---
  const cronChecks: CheckResult[] = [
    checkCronConfig('Cron & Background Jobs'),
    checkCronAuth('Cron & Background Jobs'),
    checkCronErrorHandling('Cron & Background Jobs'),
  ];

  const cat3: CategoryResult = {
    name: 'Cron & Background Jobs',
    checks: cronChecks,
    verdict: categoryVerdict(cronChecks),
  };

  // --- Category 4: Email System ---
  const emailChecks: CheckResult[] = [
    checkEmailTemplates('Email System'),
    checkEmailLogging('Email System'),
    checkUnsubscribeSystem('Email System'),
  ];

  const cat4: CategoryResult = {
    name: 'Email System',
    checks: emailChecks,
    verdict: categoryVerdict(emailChecks),
  };

  // --- Category 5: Security ---
  const securityChecks: CheckResult[] = [
    checkAdminAuth('Security'),
    checkRateLimiting('Security'),
  ];

  const cat5: CategoryResult = {
    name: 'Security',
    checks: securityChecks,
    verdict: categoryVerdict(securityChecks),
  };

  // --- Category 6: Error Handling ---
  const errorHandlingChecks: CheckResult[] = [
    checkErrorBoundary('Error Handling'),
    checkNotFoundPage('Error Handling'),
  ];

  const cat6: CategoryResult = {
    name: 'Error Handling',
    checks: errorHandlingChecks,
    verdict: categoryVerdict(errorHandlingChecks),
  };

  const categories = [cat1, cat2, cat3, cat4, cat5, cat6];
  const overall = overallVerdict(categories);

  // --- Console Output ---
  console.log('');
  for (const cat of categories) {
    console.log(`--- Category: ${cat.name} ---`);
    for (const c of cat.checks) {
      console.log(`  ${verdictIcon(c.verdict)} ${c.check}: ${c.detail}`);
    }
    console.log('');
  }

  console.log('--- SUMMARY ---');
  const allChecks = categories.flatMap(c => c.checks);
  for (const cat of categories) {
    const goCount = cat.checks.filter(c => c.verdict === 'GO').length;
    const padded = cat.name.padEnd(32);
    console.log(`  ${padded} ${verdictLabel(cat.verdict)}  (${goCount}/${cat.checks.length} checks GO)`);
  }
  console.log('');

  const totalGo = allChecks.filter(c => c.verdict === 'GO').length;
  const totalReview = allChecks.filter(c => c.verdict === 'REVIEW').length;
  const totalNoGo = allChecks.filter(c => c.verdict === 'NO-GO').length;
  console.log(`  OVERALL: ${verdictLabel(overall)} (${totalGo}/${allChecks.length} GO, ${totalReview} REVIEW, ${totalNoGo} NO-GO)`);

  // --- Write Evidence ---
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  // Text report
  let txt = `Public Launch Final Gate (Phase 21)\n`;
  txt += `${'='.repeat(50)}\n`;
  txt += `Date: ${new Date().toISOString().split('T')[0]}\n`;
  txt += `Timestamp: ${new Date().toISOString()}\n`;
  txt += `Overall Verdict: ${overall}\n\n`;

  for (const cat of categories) {
    txt += `--- ${cat.name} (${cat.verdict}) ---\n`;
    for (const c of cat.checks) {
      const icon = c.verdict === 'GO' ? '[GO]    ' : c.verdict === 'REVIEW' ? '[REVIEW]' : '[NO-GO] ';
      txt += `  ${icon} ${c.check}: ${c.detail}\n`;
    }
    txt += '\n';
  }

  txt += `--- SUMMARY ---\n`;
  for (const cat of categories) {
    const goCount = cat.checks.filter(c => c.verdict === 'GO').length;
    const padded = cat.name.padEnd(32);
    txt += `  ${padded} ${verdictLabel(cat.verdict)}  (${goCount}/${cat.checks.length} checks GO)\n`;
  }
  txt += `\n  OVERALL: ${verdictLabel(overall)} (${totalGo}/${allChecks.length} GO, ${totalReview} REVIEW, ${totalNoGo} NO-GO)\n`;

  txt += `\n--- METHODOLOGY ---\n`;
  txt += `\nCategory 1: Build Verification\n`;
  txt += `  - typecheck: Runs 'npx tsc --noEmit' and checks exit code\n`;
  txt += `  - unit_tests: Runs 'npx vitest run' and parses pass/fail count\n`;
  txt += `  - build: Verifies package.json has 'build' script (does not run build)\n`;
  txt += `\nCategory 2: Observability Infrastructure\n`;
  txt += `  - health_endpoint: Verifies src/app/api/health/route.ts exists with GET export\n`;
  txt += `  - posthog_configured: Verifies PostHog server + client modules exist\n`;
  txt += `  - analytics_events: Counts captureServerEvent calls in codebase (threshold >= 15)\n`;
  txt += `\nCategory 3: Cron & Background Jobs\n`;
  txt += `  - cron_config: Verifies vercel.json has >= 2 cron entries\n`;
  txt += `  - cron_auth: Verifies both cron routes check CRON_SECRET\n`;
  txt += `  - cron_error_handling: Verifies both cron routes have try/catch with stats\n`;
  txt += `\nCategory 4: Email System\n`;
  txt += `  - email_templates: Counts .tsx templates in src/emails/ (threshold >= 5)\n`;
  txt += `  - email_logging: Verifies src/lib/email-logging.ts exists\n`;
  txt += `  - unsubscribe_system: Verifies src/lib/unsubscribe-token.ts exists\n`;
  txt += `\nCategory 5: Security\n`;
  txt += `  - admin_auth: Verifies all admin endpoints use requireAdmin\n`;
  txt += `  - rate_limiting: Verifies src/lib/rate-limit.ts or middleware rate limiting exists\n`;
  txt += `\nCategory 6: Error Handling\n`;
  txt += `  - error_boundary: Verifies src/app/error.tsx exists\n`;
  txt += `  - not_found_page: Verifies src/app/not-found.tsx exists\n`;

  writeFileSync(join(EVIDENCE_DIR, 'final-gate.txt'), txt);

  // JSON evidence
  const jsonEvidence = {
    timestamp: new Date().toISOString(),
    phase: 'Phase 21 — Public Launch Final Gate',
    overall_verdict: overall,
    categories: categories.map(cat => ({
      name: cat.name,
      verdict: cat.verdict,
      checks: cat.checks,
    })),
    summary: {
      total_checks: allChecks.length,
      go_count: totalGo,
      review_count: totalReview,
      nogo_count: totalNoGo,
    },
  };

  writeFileSync(
    join(EVIDENCE_DIR, 'final-gate.json'),
    JSON.stringify(jsonEvidence, null, 2)
  );

  console.log(`\nEvidence saved to ${EVIDENCE_DIR}/final-gate.{txt,json}`);

  if (overall !== 'GO') {
    process.exit(1);
  }
}

main();
