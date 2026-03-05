/**
 * Phase 21 — Load & Resilience Validation (Offline)
 *
 * Static analysis of the codebase for resilience patterns.
 * Does NOT perform actual load testing — audits source files for:
 *   1. API Route Timeouts
 *   2. Rate Limiting
 *   3. Connection Handling (singleton patterns)
 *   4. Error Resilience (error boundaries, try/catch)
 *   5. Caching
 *   6. Deployment (vercel.json)
 *
 * Usage: npx tsx scripts/load/phase21-load-check.ts
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const EVIDENCE_DIR = join(ROOT, 'docs/system-audit/evidence/2026-03-04-phase21/commands');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Verdict = 'PASS' | 'FAIL' | 'WARN';

interface CheckResult {
  check: string;
  category: string;
  verdict: Verdict;
  detail: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFile(relPath: string): string | null {
  const absPath = join(ROOT, relPath);
  if (!existsSync(absPath)) return null;
  return readFileSync(absPath, 'utf-8');
}

function verdictIcon(v: Verdict): string {
  switch (v) {
    case 'PASS': return '[PASS]';
    case 'FAIL': return '[FAIL]';
    case 'WARN': return '[WARN]';
  }
}

// ---------------------------------------------------------------------------
// Category 1: API Route Timeouts
// ---------------------------------------------------------------------------

function checkExamRouteTimeout(): CheckResult {
  const content = readFile('src/app/api/exam/route.ts');
  if (!content) {
    return { check: 'exam_route_timeout', category: '1) API Route Timeouts', verdict: 'FAIL', detail: 'File not found: src/app/api/exam/route.ts' };
  }
  const match = content.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
  if (match) {
    return { check: 'exam_route_timeout', category: '1) API Route Timeouts', verdict: 'PASS', detail: `maxDuration = ${match[1]}s` };
  }
  return { check: 'exam_route_timeout', category: '1) API Route Timeouts', verdict: 'FAIL', detail: 'No maxDuration export found' };
}

function checkTtsRouteTimeout(): CheckResult {
  const content = readFile('src/app/api/tts/route.ts');
  if (!content) {
    return { check: 'tts_route_timeout', category: '1) API Route Timeouts', verdict: 'FAIL', detail: 'File not found: src/app/api/tts/route.ts' };
  }
  const match = content.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
  if (match) {
    return { check: 'tts_route_timeout', category: '1) API Route Timeouts', verdict: 'PASS', detail: `maxDuration = ${match[1]}s` };
  }
  // TTS routes are typically fast — warn rather than fail if not set
  return { check: 'tts_route_timeout', category: '1) API Route Timeouts', verdict: 'WARN', detail: 'No maxDuration export found (TTS is typically fast, but explicit timeout is recommended)' };
}

function checkCronRouteTimeouts(): CheckResult {
  const cronRoutes = [
    'src/app/api/cron/daily-digest/route.ts',
    'src/app/api/cron/nudges/route.ts',
  ];

  const results: string[] = [];
  let allHave = true;

  for (const route of cronRoutes) {
    const content = readFile(route);
    if (!content) {
      results.push(`${route}: file not found`);
      allHave = false;
      continue;
    }
    const match = content.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
    if (match) {
      results.push(`${route}: maxDuration = ${match[1]}s`);
    } else {
      results.push(`${route}: no maxDuration`);
      allHave = false;
    }
  }

  if (allHave) {
    return { check: 'cron_route_timeouts', category: '1) API Route Timeouts', verdict: 'PASS', detail: results.join('; ') };
  }
  return { check: 'cron_route_timeouts', category: '1) API Route Timeouts', verdict: 'FAIL', detail: results.join('; ') };
}

// ---------------------------------------------------------------------------
// Category 2: Rate Limiting
// ---------------------------------------------------------------------------

function checkRateLimitingMiddleware(): CheckResult {
  const middlewareContent = readFile('src/middleware.ts');
  if (!middlewareContent) {
    return { check: 'rate_limiting_middleware', category: '2) Rate Limiting', verdict: 'FAIL', detail: 'src/middleware.ts not found' };
  }

  const hasRateLimitImport = middlewareContent.includes('rate-limit') || middlewareContent.includes('rateLimit') || middlewareContent.includes('checkRateLimit');
  const hasRateLimitCall = middlewareContent.includes('checkRateLimit') || middlewareContent.includes('rateLimit(');

  if (hasRateLimitImport && hasRateLimitCall) {
    // Check for the dedicated rate-limit module
    const rateLimitModule = readFile('src/lib/rate-limit.ts');
    if (rateLimitModule) {
      // Count configured routes
      const routeMatches = rateLimitModule.match(/'\/(api\/[^']+)'/g);
      const routeCount = routeMatches ? routeMatches.length : 0;
      return { check: 'rate_limiting_middleware', category: '2) Rate Limiting', verdict: 'PASS', detail: `Rate limiting in middleware via src/lib/rate-limit.ts (${routeCount} route configs)` };
    }
    return { check: 'rate_limiting_middleware', category: '2) Rate Limiting', verdict: 'PASS', detail: 'Rate limiting present in middleware' };
  }

  return { check: 'rate_limiting_middleware', category: '2) Rate Limiting', verdict: 'FAIL', detail: 'No rate limiting found in middleware' };
}

function checkApiRateLimiting(): CheckResult {
  const rateLimitContent = readFile('src/lib/rate-limit.ts');
  if (!rateLimitContent) {
    return { check: 'api_rate_limiting', category: '2) Rate Limiting', verdict: 'FAIL', detail: 'src/lib/rate-limit.ts not found' };
  }

  // Check which API routes are covered
  const coveredRoutes: string[] = [];
  const criticalRoutes = ['/api/exam', '/api/tts', '/api/report'];

  for (const route of criticalRoutes) {
    if (rateLimitContent.includes(`'${route}'`)) {
      coveredRoutes.push(route);
    }
  }

  if (coveredRoutes.length === criticalRoutes.length) {
    return { check: 'api_rate_limiting', category: '2) Rate Limiting', verdict: 'PASS', detail: `All critical routes covered: ${coveredRoutes.join(', ')}` };
  }

  const missing = criticalRoutes.filter(r => !coveredRoutes.includes(r));
  if (coveredRoutes.length > 0) {
    return { check: 'api_rate_limiting', category: '2) Rate Limiting', verdict: 'WARN', detail: `Covered: ${coveredRoutes.join(', ')}; Missing: ${missing.join(', ')}` };
  }

  return { check: 'api_rate_limiting', category: '2) Rate Limiting', verdict: 'FAIL', detail: 'No critical API routes have rate limiting configured' };
}

// ---------------------------------------------------------------------------
// Category 3: Connection Handling
// ---------------------------------------------------------------------------

function checkSupabaseClientSingleton(): CheckResult {
  const serverContent = readFile('src/lib/supabase/server.ts');
  if (!serverContent) {
    return { check: 'supabase_client_singleton', category: '3) Connection Handling', verdict: 'FAIL', detail: 'src/lib/supabase/server.ts not found' };
  }

  // The server.ts uses createServerClient per-request (correct for Next.js App Router with cookies).
  // Check that API routes using service-role use module-level singletons.
  const examContent = readFile('src/app/api/exam/route.ts');
  const ttsContent = readFile('src/app/api/tts/route.ts');
  const sessionContent = readFile('src/app/api/session/route.ts');

  const issues: string[] = [];
  const routeFiles = [
    { name: 'exam/route.ts', content: examContent },
    { name: 'tts/route.ts', content: ttsContent },
    { name: 'session/route.ts', content: sessionContent },
  ];

  for (const { name, content } of routeFiles) {
    if (!content) continue;
    // Check for module-level service client (singleton pattern)
    const hasModuleLevelClient = /^const\s+service\w*\s*=\s*create(?:Service)?Client/m.test(content);
    // Check for per-request service client creation inside handler
    const hasPerRequestCreation = /(?:export\s+async\s+function\s+(?:GET|POST|PUT|DELETE))[\s\S]*?createServiceClient\(/m.test(content) ||
      /(?:export\s+async\s+function\s+(?:GET|POST|PUT|DELETE))[\s\S]*?createClient\([\s\S]*?SERVICE_ROLE/m.test(content);

    if (hasModuleLevelClient) {
      // Good: using module-level singleton
    } else if (hasPerRequestCreation) {
      issues.push(`${name}: creates service client per-request (not singleton)`);
    }
  }

  // Per-request user clients (via createClient from server.ts) are expected.
  // Only service-role clients should be singletons.
  if (issues.length === 0) {
    return { check: 'supabase_client_singleton', category: '3) Connection Handling', verdict: 'PASS', detail: 'Service-role clients use module-level singleton in exam, tts, session routes' };
  }

  return { check: 'supabase_client_singleton', category: '3) Connection Handling', verdict: 'WARN', detail: issues.join('; ') };
}

function checkPosthogClientSingleton(): CheckResult {
  const content = readFile('src/lib/posthog-server.ts');
  if (!content) {
    return { check: 'posthog_client_singleton', category: '3) Connection Handling', verdict: 'WARN', detail: 'src/lib/posthog-server.ts not found — PostHog may not be used server-side' };
  }

  const hasSingletonPattern = content.includes('let client') && content.includes('if (client)');
  const hasCaching = content.includes('singleton') || hasSingletonPattern;

  if (hasSingletonPattern) {
    return { check: 'posthog_client_singleton', category: '3) Connection Handling', verdict: 'PASS', detail: 'PostHog server client uses singleton pattern (module-level let + guard)' };
  }

  if (content.includes('new PostHog')) {
    return { check: 'posthog_client_singleton', category: '3) Connection Handling', verdict: 'WARN', detail: 'PostHog client created but singleton pattern not detected' };
  }

  return { check: 'posthog_client_singleton', category: '3) Connection Handling', verdict: 'FAIL', detail: 'No PostHog client instantiation found' };
}

function checkAnthropicClientHandling(): CheckResult {
  const content = readFile('src/lib/exam-engine.ts');
  if (!content) {
    return { check: 'anthropic_client_handling', category: '3) Connection Handling', verdict: 'FAIL', detail: 'src/lib/exam-engine.ts not found' };
  }

  // Check for module-level Anthropic client (singleton)
  const hasModuleLevelClient = /^const\s+anthropic\s*=\s*new\s+Anthropic/m.test(content);
  // Check for per-function client creation
  const perFunctionPattern = /(?:async\s+function|function)\s+\w+[\s\S]*?new\s+Anthropic/;
  const hasPerFunctionClient = perFunctionPattern.test(content);

  if (hasModuleLevelClient && !hasPerFunctionClient) {
    return { check: 'anthropic_client_handling', category: '3) Connection Handling', verdict: 'PASS', detail: 'Anthropic client is module-level singleton in exam-engine.ts' };
  }

  if (hasModuleLevelClient && hasPerFunctionClient) {
    return { check: 'anthropic_client_handling', category: '3) Connection Handling', verdict: 'WARN', detail: 'Module-level singleton exists but also found per-function instantiation' };
  }

  if (hasPerFunctionClient) {
    return { check: 'anthropic_client_handling', category: '3) Connection Handling', verdict: 'WARN', detail: 'Anthropic client created per-function (not singleton)' };
  }

  return { check: 'anthropic_client_handling', category: '3) Connection Handling', verdict: 'FAIL', detail: 'No Anthropic client instantiation found' };
}

// ---------------------------------------------------------------------------
// Category 4: Error Resilience
// ---------------------------------------------------------------------------

function checkGlobalErrorBoundary(): CheckResult {
  const content = readFile('src/app/error.tsx');
  if (!content) {
    return { check: 'global_error_boundary', category: '4) Error Resilience', verdict: 'FAIL', detail: 'src/app/error.tsx not found — no global error boundary' };
  }

  const hasUseClient = content.includes("'use client'") || content.includes('"use client"');
  const hasErrorProp = content.includes('error') && content.includes('reset');
  const hasExport = content.includes('export default');

  if (hasUseClient && hasErrorProp && hasExport) {
    return { check: 'global_error_boundary', category: '4) Error Resilience', verdict: 'PASS', detail: 'Global error boundary exists with error + reset props (use client)' };
  }

  const issues: string[] = [];
  if (!hasUseClient) issues.push('missing "use client"');
  if (!hasErrorProp) issues.push('missing error/reset props');
  if (!hasExport) issues.push('missing default export');

  return { check: 'global_error_boundary', category: '4) Error Resilience', verdict: 'WARN', detail: `error.tsx exists but: ${issues.join(', ')}` };
}

function checkApiErrorHandling(): CheckResult {
  const routes = [
    { name: 'exam', path: 'src/app/api/exam/route.ts' },
    { name: 'tts', path: 'src/app/api/tts/route.ts' },
    { name: 'report', path: 'src/app/api/report/route.ts' },
  ];

  const results: string[] = [];
  let allHaveTryCatch = true;

  for (const route of routes) {
    const content = readFile(route.path);
    if (!content) {
      results.push(`${route.name}: file not found`);
      allHaveTryCatch = false;
      continue;
    }

    const hasTryCatch = content.includes('try {') || content.includes('try{');
    const hasCatchBlock = content.includes('} catch');
    const returns500 = content.includes('status: 500');

    if (hasTryCatch && hasCatchBlock && returns500) {
      results.push(`${route.name}: try/catch with 500 response`);
    } else if (hasTryCatch && hasCatchBlock) {
      results.push(`${route.name}: try/catch present (no explicit 500)`);
    } else {
      results.push(`${route.name}: missing try/catch`);
      allHaveTryCatch = false;
    }
  }

  if (allHaveTryCatch) {
    return { check: 'api_error_handling', category: '4) Error Resilience', verdict: 'PASS', detail: results.join('; ') };
  }
  return { check: 'api_error_handling', category: '4) Error Resilience', verdict: 'FAIL', detail: results.join('; ') };
}

function checkCronErrorHandling(): CheckResult {
  const cronRoutes = [
    { name: 'daily-digest', path: 'src/app/api/cron/daily-digest/route.ts' },
    { name: 'nudges', path: 'src/app/api/cron/nudges/route.ts' },
  ];

  const results: string[] = [];
  let allGood = true;

  for (const route of cronRoutes) {
    const content = readFile(route.path);
    if (!content) {
      results.push(`${route.name}: file not found`);
      allGood = false;
      continue;
    }

    const hasTryCatch = content.includes('try {') || content.includes('try{');
    const hasCatchBlock = content.includes('} catch');
    const hasStatsReporting = content.includes('stats') && (content.includes('NextResponse.json') || content.includes('console.log'));
    const hasAuthCheck = content.includes('CRON_SECRET') || content.includes('authorization');

    const checks: string[] = [];
    if (hasTryCatch && hasCatchBlock) checks.push('try/catch');
    if (hasStatsReporting) checks.push('stats reporting');
    if (hasAuthCheck) checks.push('auth check');

    if (hasTryCatch && hasCatchBlock && hasStatsReporting) {
      results.push(`${route.name}: ${checks.join(' + ')}`);
    } else {
      const missing: string[] = [];
      if (!hasTryCatch || !hasCatchBlock) missing.push('try/catch');
      if (!hasStatsReporting) missing.push('stats');
      results.push(`${route.name}: missing ${missing.join(', ')}`);
      allGood = false;
    }
  }

  if (allGood) {
    return { check: 'cron_error_handling', category: '4) Error Resilience', verdict: 'PASS', detail: results.join('; ') };
  }
  return { check: 'cron_error_handling', category: '4) Error Resilience', verdict: 'FAIL', detail: results.join('; ') };
}

// ---------------------------------------------------------------------------
// Category 5: Caching
// ---------------------------------------------------------------------------

function checkTtlCacheUsage(): CheckResult {
  const cacheContent = readFile('src/lib/ttl-cache.ts');
  if (!cacheContent) {
    return { check: 'ttl_cache_usage', category: '5) Caching', verdict: 'FAIL', detail: 'src/lib/ttl-cache.ts not found' };
  }

  // Check if it's actually used anywhere
  const examEngineContent = readFile('src/lib/exam-engine.ts');
  const usedInExamEngine = examEngineContent?.includes('TtlCache') || false;
  const usedInExamEngineImport = examEngineContent?.includes("from './ttl-cache'") || false;

  if (usedInExamEngine || usedInExamEngineImport) {
    // Check what's cached
    const cacheInstances = examEngineContent?.match(/new\s+TtlCache/g)?.length || 0;
    return { check: 'ttl_cache_usage', category: '5) Caching', verdict: 'PASS', detail: `TtlCache module exists and is used in exam-engine.ts (${cacheInstances} instance(s))` };
  }

  return { check: 'ttl_cache_usage', category: '5) Caching', verdict: 'WARN', detail: 'TtlCache module exists but not detected in exam-engine.ts' };
}

function checkEmbeddingCache(): CheckResult {
  const ragContent = readFile('src/lib/rag-retrieval.ts');
  if (!ragContent) {
    return { check: 'embedding_cache', category: '5) Caching', verdict: 'WARN', detail: 'src/lib/rag-retrieval.ts not found' };
  }

  const hasEmbeddingCache = ragContent.includes('embedding_cache');
  const hasHashFunction = ragContent.includes('queryHash') || ragContent.includes('query_hash');
  const hasCacheCheck = ragContent.includes('cache_check') || ragContent.includes('Cache miss');

  if (hasEmbeddingCache && hasHashFunction) {
    const mechanism = ragContent.includes("from('embedding_cache')") ? 'DB-backed (embedding_cache table)' : 'in-memory';
    return { check: 'embedding_cache', category: '5) Caching', verdict: 'PASS', detail: `Embedding cache present: ${mechanism} with hash-based lookup` };
  }

  if (hasEmbeddingCache) {
    return { check: 'embedding_cache', category: '5) Caching', verdict: 'WARN', detail: 'embedding_cache referenced but full pattern not detected' };
  }

  return { check: 'embedding_cache', category: '5) Caching', verdict: 'WARN', detail: 'No embedding cache found in RAG retrieval pipeline' };
}

// ---------------------------------------------------------------------------
// Category 6: Deployment
// ---------------------------------------------------------------------------

function checkVercelConfig(): CheckResult {
  const content = readFile('vercel.json');
  if (!content) {
    return { check: 'vercel_config_valid', category: '6) Deployment', verdict: 'WARN', detail: 'vercel.json not found (Vercel defaults will be used)' };
  }

  try {
    const config = JSON.parse(content);

    const checks: string[] = [];

    // Check for cron config
    if (config.crons && Array.isArray(config.crons)) {
      checks.push(`${config.crons.length} cron job(s)`);
      // Validate each cron entry has path and schedule
      const validCrons = config.crons.filter((c: { path?: string; schedule?: string }) => c.path && c.schedule);
      if (validCrons.length !== config.crons.length) {
        checks.push(`${config.crons.length - validCrons.length} invalid cron entries`);
      }
    }

    // Check for headers config
    if (config.headers) {
      checks.push(`headers configured`);
    }

    // Check for redirects
    if (config.redirects) {
      checks.push(`${config.redirects.length} redirect(s)`);
    }

    // Check for rewrites
    if (config.rewrites) {
      checks.push(`${config.rewrites.length} rewrite(s)`);
    }

    const summary = checks.length > 0 ? checks.join(', ') : 'valid JSON (minimal config)';
    return { check: 'vercel_config_valid', category: '6) Deployment', verdict: 'PASS', detail: `Valid JSON: ${summary}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { check: 'vercel_config_valid', category: '6) Deployment', verdict: 'FAIL', detail: `Invalid JSON: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

function generateTextReport(results: CheckResult[], timestamp: string): string {
  let txt = '';
  txt += `Phase 21 — Load & Resilience Validation (Offline)\n`;
  txt += `${'='.repeat(55)}\n`;
  txt += `Date: ${timestamp.split('T')[0]}\n`;
  txt += `Timestamp: ${timestamp}\n`;
  txt += `Total checks: ${results.length}\n`;
  txt += `Passed: ${results.filter(r => r.verdict === 'PASS').length}\n`;
  txt += `Warned: ${results.filter(r => r.verdict === 'WARN').length}\n`;
  txt += `Failed: ${results.filter(r => r.verdict === 'FAIL').length}\n\n`;

  const categories = Array.from(new Set(results.map(r => r.category)));

  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    const catPassed = catResults.filter(r => r.verdict === 'PASS').length;
    txt += `--- ${cat} (${catPassed}/${catResults.length} passed) ---\n`;

    for (const r of catResults) {
      txt += `  ${verdictIcon(r.verdict)} ${r.check}\n`;
      txt += `         ${r.detail}\n`;
    }
    txt += '\n';
  }

  // Summary
  txt += `--- SUMMARY ---\n`;
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    const catPassed = catResults.filter(r => r.verdict === 'PASS').length;
    const padded = cat.padEnd(35);
    txt += `  ${padded} ${catPassed}/${catResults.length} passed\n`;
  }

  const totalPassed = results.filter(r => r.verdict === 'PASS').length;
  const totalFailed = results.filter(r => r.verdict === 'FAIL').length;
  txt += `\n  OVERALL: ${totalPassed}/${results.length} passed, ${totalFailed} failed`;
  txt += totalFailed === 0 ? ' -- ALL PASS\n' : ' -- FAILURES DETECTED\n';

  return txt;
}

function generateJsonReport(results: CheckResult[], timestamp: string): object {
  const categories = Array.from(new Set(results.map(r => r.category)));

  return {
    metadata: {
      phase: 'Phase 21 -- Load & Resilience Validation',
      timestamp,
      total_checks: results.length,
      passed: results.filter(r => r.verdict === 'PASS').length,
      warned: results.filter(r => r.verdict === 'WARN').length,
      failed: results.filter(r => r.verdict === 'FAIL').length,
      all_pass: results.every(r => r.verdict !== 'FAIL'),
    },
    categories: categories.map(cat => {
      const catResults = results.filter(r => r.category === cat);
      return {
        name: cat,
        passed: catResults.filter(r => r.verdict === 'PASS').length,
        warned: catResults.filter(r => r.verdict === 'WARN').length,
        failed: catResults.filter(r => r.verdict === 'FAIL').length,
        total: catResults.length,
        checks: catResults.map(r => ({
          check: r.check,
          verdict: r.verdict,
          detail: r.detail,
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
  const categories = Array.from(new Set(results.map(r => r.category)));

  console.log('');
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    const catPassed = catResults.filter(r => r.verdict === 'PASS').length;
    console.log(`--- ${cat} (${catPassed}/${catResults.length}) ---`);

    for (const r of catResults) {
      const icon = r.verdict === 'PASS' ? '\u2705' : r.verdict === 'WARN' ? '\u26A0\uFE0F' : '\u274C';
      console.log(`  ${icon} ${r.check}: ${r.detail}`);
    }
    console.log('');
  }

  const totalPassed = results.filter(r => r.verdict === 'PASS').length;
  const totalWarned = results.filter(r => r.verdict === 'WARN').length;
  const totalFailed = results.filter(r => r.verdict === 'FAIL').length;

  console.log('=== OVERALL ===');
  console.log(`  Passed: ${totalPassed}/${results.length}`);
  if (totalWarned > 0) console.log(`  Warned: ${totalWarned}/${results.length}`);
  if (totalFailed > 0) console.log(`  Failed: ${totalFailed}/${results.length}`);
  console.log(
    totalFailed === 0
      ? '  Result: ALL CHECKS PASS (no failures)'
      : '  Result: FAILURES DETECTED'
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('=== Phase 21 — Load & Resilience Validation (Offline) ===');

  const timestamp = new Date().toISOString();
  const results: CheckResult[] = [];

  // Category 1: API Route Timeouts
  console.log('\nChecking API route timeouts...');
  results.push(checkExamRouteTimeout());
  results.push(checkTtsRouteTimeout());
  results.push(checkCronRouteTimeouts());

  // Category 2: Rate Limiting
  console.log('Checking rate limiting...');
  results.push(checkRateLimitingMiddleware());
  results.push(checkApiRateLimiting());

  // Category 3: Connection Handling
  console.log('Checking connection handling...');
  results.push(checkSupabaseClientSingleton());
  results.push(checkPosthogClientSingleton());
  results.push(checkAnthropicClientHandling());

  // Category 4: Error Resilience
  console.log('Checking error resilience...');
  results.push(checkGlobalErrorBoundary());
  results.push(checkApiErrorHandling());
  results.push(checkCronErrorHandling());

  // Category 5: Caching
  console.log('Checking caching patterns...');
  results.push(checkTtlCacheUsage());
  results.push(checkEmbeddingCache());

  // Category 6: Deployment
  console.log('Checking deployment config...');
  results.push(checkVercelConfig());

  // Print results to console
  printResults(results);

  // Write evidence files
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  const txtReport = generateTextReport(results, timestamp);
  writeFileSync(join(EVIDENCE_DIR, 'load-check.txt'), txtReport);

  const jsonReport = generateJsonReport(results, timestamp);
  writeFileSync(join(EVIDENCE_DIR, 'load-check.json'), JSON.stringify(jsonReport, null, 2));

  console.log(
    `\nEvidence saved to:\n  ${join(EVIDENCE_DIR, 'load-check.txt')}\n  ${join(EVIDENCE_DIR, 'load-check.json')}`
  );

  // Exit code
  const hasFail = results.some(r => r.verdict === 'FAIL');
  if (hasFail) {
    process.exit(1);
  }
}

main();
