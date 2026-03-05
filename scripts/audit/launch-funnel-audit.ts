#!/usr/bin/env tsx
/**
 * Launch Funnel Instrumentation Audit
 * ====================================
 * Scans the codebase for all analytics/tracking events and maps them against
 * the required launch funnel event list. Produces JSON + TXT evidence files.
 *
 * Usage: npm run audit:launch-funnel
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FoundEvent {
  eventName: string;
  file: string;
  line: number;
  emitType: 'server-side' | 'client-side' | 'both';
  mechanism: string; // posthog-server | posthog-client | dataLayer | ga4-mp | usage_logs | gtm
  properties: string[];
  snippet: string;
}

type FunnelStatus = 'FOUND' | 'MISSING' | 'PARTIAL';

interface FunnelEventResult {
  requiredEvent: string;
  description: string;
  status: FunnelStatus;
  matchedEvents: Array<{
    eventName: string;
    file: string;
    emitType: string;
    mechanism: string;
    properties: string[];
  }>;
  notes: string;
}

interface AuditReport {
  timestamp: string;
  totalEventsFound: number;
  uniqueEventNames: string[];
  requiredFunnelTotal: number;
  requiredFunnelPresent: number;
  requiredFunnelMissing: number;
  requiredFunnelPartial: number;
  funnelEvents: FunnelEventResult[];
  allFoundEvents: FoundEvent[];
  observableDashboards: string[];
  verdict: 'SUFFICIENT' | 'NEEDS WORK' | 'INSUFFICIENT';
  verdictReason: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ROOT = join(__dirname, '..', '..');
const SRC_DIR = join(ROOT, 'src');
const EVIDENCE_DIR = join(ROOT, 'docs', 'system-audit', 'evidence', '2026-03-04-phase21', 'commands');

// File extensions to scan
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

// Required funnel events
const REQUIRED_FUNNEL_EVENTS: Array<{ id: string; description: string; patterns: RegExp[]; }> = [
  {
    id: 'page_viewed',
    description: 'Page view tracking (landing, pricing, help, etc.)',
    patterns: [/\$pageview/i, /page_view/i, /pageview/i, /pushPageData/],
  },
  {
    id: 'signup_started_or_completed',
    description: 'User signup event (started or completed)',
    patterns: [/sign_up/i, /signup/i, /trackSignup/],
  },
  {
    id: 'login_completed',
    description: 'User login completion event',
    patterns: [/login_completed/i, /trackLogin/i, /last_login_at/],
  },
  {
    id: 'trial_started',
    description: 'Free trial initiation event',
    patterns: [/trial_start/i, /trial_started/i, /trackTrialStart/],
  },
  {
    id: 'checkout_started_or_completed',
    description: 'Stripe checkout initiation or completion',
    patterns: [/checkout\.session\.completed/i, /checkout.*started/i, /checkout.*completed/i, /handleCheckoutCompleted/],
  },
  {
    id: 'subscription_created_or_confirmed',
    description: 'Subscription creation/confirmation event',
    patterns: [/subscription.*created/i, /subscription.*confirmed/i, /subscription.*updated/i, /sendSubscriptionConfirmed/],
  },
  {
    id: 'payment_failed',
    description: 'Payment failure event',
    patterns: [/payment_failed/i, /invoice\.payment_failed/i, /handlePaymentFailed/],
  },
  {
    id: 'exam_session_started',
    description: 'Exam session creation/start event',
    patterns: [/exam.*start/i, /session.*create/i, /action.*===.*['\"]start['\"]/],
  },
  {
    id: 'exam_session_completed',
    description: 'Exam session completion event',
    patterns: [/exam.*complete/i, /session.*complete/i, /status.*completed/i, /computeExamResult/],
  },
  {
    id: 'exam_answer_assessed',
    description: 'Individual answer assessment event',
    patterns: [/assessAnswer/i, /assessment/i, /element_attempts/],
  },
  {
    id: 'quick_drill_started',
    description: 'Quick drill mode session start',
    patterns: [/quick_drill/i, /quickdrill/i],
  },
  {
    id: 'support_ticket_created',
    description: 'Support ticket creation event',
    patterns: [/support_ticket/i, /create_ticket/i, /support.*insert/i],
  },
  {
    id: 'tts_request',
    description: 'Text-to-speech usage event (in usage_logs)',
    patterns: [/tts_request/i, /event_type.*tts/i],
  },
  {
    id: 'prompt_trace',
    description: 'Prompt version trace (in session metadata)',
    patterns: [/promptTrace/i, /prompt_trace/i, /examiner_prompt_version_id/i],
  },
  {
    id: 'multimodal_asset_selected',
    description: 'Multimodal asset (image/card) selection event',
    patterns: [/multimodal_asset_selected/i, /onAssetSelected/i],
  },
  {
    id: 'grounding_low_confidence',
    description: 'RAG grounding low confidence alert event',
    patterns: [/low_confidence/i, /weak_area_report_low_confidence/i, /grounding.*quality/i],
  },
  {
    id: 'landing_page_viewed',
    description: 'Landing page view with UTM attribution',
    patterns: [/landing.*view/i, /page_view.*landing/i],
  },
  {
    id: 'tts_denied_by_tier',
    description: 'TTS denied due to tier restriction',
    patterns: [/tts.*denied/i, /tier.*denied/i, /TTS_DENIED/i],
  },
  {
    id: 'prompt_fallback',
    description: 'Examiner prompt fallback to default',
    patterns: [/prompt.*fallback/i, /fallback.*prompt/i],
  },
  {
    id: 'health_check',
    description: 'Health endpoint availability',
    patterns: [/health/i, /status.*ok/i],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function walkDir(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === '__tests__') continue;
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          results.push(...walkDir(fullPath));
        } else if (SCAN_EXTENSIONS.has(extname(entry))) {
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

function extractProperties(line: string, nextLines: string[]): string[] {
  const props: string[] = [];
  // Look for key: value patterns in the line and following lines
  const combined = [line, ...nextLines.slice(0, 15)].join('\n');

  // Match object property patterns
  const propMatches = combined.match(/(\w+):\s*(?:[^,}]+)/g);
  if (propMatches) {
    for (const m of propMatches) {
      const key = m.split(':')[0].trim();
      // Filter out common non-property words
      if (!['if', 'else', 'return', 'const', 'let', 'var', 'case', 'break', 'try', 'catch', 'await', 'async', 'function', 'import', 'export', 'from', 'default'].includes(key)) {
        props.push(key);
      }
    }
  }
  return [...new Set(props)].slice(0, 12); // Dedupe and cap at 12
}

function determineEmitType(filePath: string, mechanism: string): 'server-side' | 'client-side' | 'both' {
  const relPath = relative(ROOT, filePath);

  // Server-side indicators
  if (relPath.includes('api/') || relPath.includes('route.ts') || mechanism === 'posthog-server' || mechanism === 'ga4-mp' || mechanism === 'usage_logs') {
    return 'server-side';
  }

  // Client-side indicators
  if (mechanism === 'posthog-client' || mechanism === 'dataLayer' || mechanism === 'gtm') {
    return 'client-side';
  }

  // Check for 'use client' directive
  try {
    const content = readFileSync(filePath, 'utf-8');
    if (content.startsWith("'use client'") || content.startsWith('"use client"')) {
      return 'client-side';
    }
  } catch {
    // ignore
  }

  return 'server-side';
}

// ---------------------------------------------------------------------------
// Scanning Patterns
// ---------------------------------------------------------------------------

interface ScanPattern {
  regex: RegExp;
  mechanism: string;
  extractEventName: (match: RegExpExecArray, line: string) => string | null;
}

const SCAN_PATTERNS: ScanPattern[] = [
  // PostHog server-side: captureServerEvent(userId, 'event_name', { ... })
  {
    regex: /captureServerEvent\(\s*[\w.]+\s*,\s*['"]([^'"]+)['"]/g,
    mechanism: 'posthog-server',
    extractEventName: (match) => match[1],
  },
  // PostHog client-side: posthog.capture('event_name', { ... })
  {
    regex: /posthog\.capture\(\s*['"]([^'"]+)['"]/g,
    mechanism: 'posthog-client',
    extractEventName: (match) => match[1],
  },
  // GA4 dataLayer: push({ event: 'event_name' })
  {
    regex: /push\(\s*\{\s*event:\s*['"]([^'"]+)['"]/g,
    mechanism: 'dataLayer',
    extractEventName: (match) => match[1],
  },
  // GA4 dataLayer helpers: trackSignup, trackTrialStart, trackPurchase, pushPageData
  {
    regex: /export function (trackSignup|trackTrialStart|trackPurchase|pushPageData)/g,
    mechanism: 'dataLayer',
    extractEventName: (match) => {
      const fnMap: Record<string, string> = {
        trackSignup: 'sign_up',
        trackTrialStart: 'trial_start',
        trackPurchase: 'purchase',
        pushPageData: 'page_data',
      };
      return fnMap[match[1]] || match[1];
    },
  },
  // GA4 Measurement Protocol (server-side)
  {
    regex: /events:\s*\[\s*\{\s*name:\s*['"]([^'"]+)['"]/g,
    mechanism: 'ga4-mp',
    extractEventName: (match) => match[1],
  },
  // GTM consent update
  {
    regex: /gtag\(\s*['"]consent['"]\s*,\s*['"]update['"]/g,
    mechanism: 'gtm',
    extractEventName: () => 'consent_update',
  },
  // Usage logs: event_type: 'xxx'
  {
    regex: /event_type:\s*['"]([^'"]+)['"]/g,
    mechanism: 'usage_logs',
    extractEventName: (match) => match[1],
  },
  // UTM capture
  {
    regex: /event:\s*['"]utm_captured['"]/g,
    mechanism: 'dataLayer',
    extractEventName: () => 'utm_captured',
  },
];

// ---------------------------------------------------------------------------
// Main Scanner
// ---------------------------------------------------------------------------

function scanCodebase(): FoundEvent[] {
  const files = walkDir(SRC_DIR);
  const events: FoundEvent[] = [];

  for (const filePath of files) {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    for (const scanPattern of SCAN_PATTERNS) {
      // Reset regex state
      scanPattern.regex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = scanPattern.regex.exec(content)) !== null) {
        const eventName = scanPattern.extractEventName(match, content);
        if (!eventName) continue;

        // Find line number
        const beforeMatch = content.slice(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;

        // Extract properties from surrounding lines
        const startLine = Math.max(0, lineNumber - 1);
        const nextLines = lines.slice(startLine, startLine + 15);
        const properties = extractProperties(lines[startLine] || '', nextLines);

        const relPath = relative(ROOT, filePath);
        const emitType = determineEmitType(filePath, scanPattern.mechanism);

        // Create snippet (3 lines around the match)
        const snippetStart = Math.max(0, lineNumber - 2);
        const snippetEnd = Math.min(lines.length, lineNumber + 2);
        const snippet = lines.slice(snippetStart, snippetEnd).join('\n').trim();

        events.push({
          eventName,
          file: relPath,
          line: lineNumber,
          emitType,
          mechanism: scanPattern.mechanism,
          properties,
          snippet: snippet.slice(0, 200),
        });
      }
    }
  }

  return events;
}

function deduplicateEvents(events: FoundEvent[]): FoundEvent[] {
  const seen = new Set<string>();
  return events.filter(e => {
    const key = `${e.eventName}|${e.file}|${e.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Full-File Content Scanning for Funnel Events
// ---------------------------------------------------------------------------

/**
 * Some funnel events don't fire as dedicated analytics events but exist as
 * server-side logic (webhook handlers, DB writes, API responses). We scan
 * full file content with broader patterns to detect these.
 */
interface CodeLevelMatch {
  file: string;
  emitType: 'server-side' | 'client-side';
  mechanism: string;
  description: string;
  properties: string[];
}

function scanFilesForCodeLevelEvents(): Map<string, CodeLevelMatch[]> {
  const results = new Map<string, CodeLevelMatch[]>();
  const files = walkDir(SRC_DIR);

  // Define code-level patterns that indicate funnel events exist in business logic
  const codePatterns: Array<{
    funnelId: string;
    filePatterns: RegExp[];
    contentPatterns: RegExp[];
    mechanism: string;
    description: string;
  }> = [
    {
      funnelId: 'login_completed',
      filePatterns: [/callback/],
      contentPatterns: [/trackLogin/, /last_login_at/, /auth_method/],
      mechanism: 'db-write',
      description: 'Login tracked via DB update to user_profiles.last_login_at + auth_method',
    },
    {
      funnelId: 'checkout_started_or_completed',
      filePatterns: [/stripe.*checkout/, /stripe.*webhook/],
      contentPatterns: [/checkout\.session\.completed/, /handleCheckoutCompleted/, /stripe\.checkout\.sessions\.create/],
      mechanism: 'stripe-webhook',
      description: 'Checkout tracked via Stripe webhook (checkout.session.completed) + GA4 Measurement Protocol purchase event',
    },
    {
      funnelId: 'subscription_created_or_confirmed',
      filePatterns: [/stripe.*webhook/],
      contentPatterns: [/customer\.subscription\.updated/, /handleSubscriptionUpdated/, /sendSubscriptionConfirmed/, /tier.*dpe_live/],
      mechanism: 'stripe-webhook',
      description: 'Subscription tracked via Stripe webhook + DB tier update + confirmation email',
    },
    {
      funnelId: 'payment_failed',
      filePatterns: [/stripe.*webhook/],
      contentPatterns: [/invoice\.payment_failed/, /handlePaymentFailed/, /sendPaymentFailed/, /latest_invoice_status.*failed/],
      mechanism: 'stripe-webhook',
      description: 'Payment failure tracked via Stripe webhook + DB update + failure email',
    },
    {
      funnelId: 'exam_session_started',
      filePatterns: [/session.*route/, /exam.*route/],
      contentPatterns: [/action.*===.*['"]create['"]/, /action.*===.*['"]start['"]/, /exam_sessions.*insert/, /status.*active/],
      mechanism: 'db-write',
      description: 'Session creation tracked via DB insert to exam_sessions + exam API start action',
    },
    {
      funnelId: 'exam_session_completed',
      filePatterns: [/session.*route/, /exam.*route/],
      contentPatterns: [/status.*completed/, /computeExamResult/, /ended_at/, /computeExamResultV2/],
      mechanism: 'db-write',
      description: 'Session completion tracked via DB update (status=completed, ended_at, result grading)',
    },
    {
      funnelId: 'exam_answer_assessed',
      filePatterns: [/exam.*route/],
      contentPatterns: [/assessAnswer/, /element_attempts/, /writeElementAttempts/, /assessment.*update/],
      mechanism: 'db-write',
      description: 'Answer assessment tracked via DB: session_transcripts.assessment + element_attempts rows',
    },
    {
      funnelId: 'quick_drill_started',
      filePatterns: [/session.*route/, /exam-planner/, /SessionConfig/],
      contentPatterns: [/quick_drill/, /studyMode.*quick_drill/],
      mechanism: 'db-write',
      description: 'Quick drill tracked via exam_sessions.study_mode = quick_drill',
    },
    {
      funnelId: 'support_ticket_created',
      filePatterns: [/resend-inbound/, /support/],
      contentPatterns: [/support_tickets.*insert/, /create_ticket/],
      mechanism: 'db-write',
      description: 'Support tickets tracked via DB insert to support_tickets table (Resend inbound webhook)',
    },
    {
      funnelId: 'prompt_trace',
      filePatterns: [/exam.*route/],
      contentPatterns: [/promptTrace/, /examiner_prompt_version_id/, /prompt.*version/],
      mechanism: 'session-metadata',
      description: 'Prompt trace persisted in exam_sessions.metadata.promptTrace with version ID + source',
    },
  ];

  for (const cp of codePatterns) {
    const matches: CodeLevelMatch[] = [];

    for (const filePath of files) {
      const relPath = relative(ROOT, filePath);
      const fileMatch = cp.filePatterns.length === 0 || cp.filePatterns.some(p => p.test(relPath));
      if (!fileMatch) continue;

      let content: string;
      try {
        content = readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }

      const contentMatch = cp.contentPatterns.some(p => p.test(content));
      if (contentMatch) {
        const emitType = relPath.includes('api/') || relPath.includes('route.ts') ? 'server-side' as const : 'client-side' as const;
        // Extract matched pattern names as properties
        const matchedPatterns = cp.contentPatterns
          .filter(p => p.test(content))
          .map(p => p.source.replace(/[\\[\]().*+?^${}|]/g, '').slice(0, 30));

        matches.push({
          file: relPath,
          emitType,
          mechanism: cp.mechanism,
          description: cp.description,
          properties: matchedPatterns,
        });
      }
    }

    if (matches.length > 0) {
      results.set(cp.funnelId, matches);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Funnel Mapping
// ---------------------------------------------------------------------------

function mapToFunnel(allEvents: FoundEvent[]): FunnelEventResult[] {
  // Also scan for code-level events
  const codeLevelMatches = scanFilesForCodeLevelEvents();

  const results: FunnelEventResult[] = [];

  for (const required of REQUIRED_FUNNEL_EVENTS) {
    const matchedEvents: FunnelEventResult['matchedEvents'] = [];

    // Check all found events against this required event's patterns
    for (const event of allEvents) {
      for (const pattern of required.patterns) {
        // Check event name and surrounding context
        if (pattern.test(event.eventName) || pattern.test(event.snippet)) {
          matchedEvents.push({
            eventName: event.eventName,
            file: event.file,
            emitType: event.emitType,
            mechanism: event.mechanism,
            properties: event.properties,
          });
          break; // Don't double-count the same event for the same required
        }
      }
    }

    // Also check code-level matches
    const codeMatches = codeLevelMatches.get(required.id) || [];
    for (const cm of codeMatches) {
      matchedEvents.push({
        eventName: `[code-level] ${required.id}`,
        file: cm.file,
        emitType: cm.emitType,
        mechanism: cm.mechanism,
        properties: cm.properties,
      });
    }

    // Deduplicate matched events by eventName + file
    const uniqueMatched = matchedEvents.filter((m, i, arr) =>
      arr.findIndex(x => x.eventName === m.eventName && x.file === m.file) === i
    );

    // Determine status
    let status: FunnelStatus;
    let notes: string;

    if (uniqueMatched.length === 0) {
      status = 'MISSING';
      notes = `No events matching '${required.id}' found in codebase.`;
    } else {
      // Check if it's a dedicated analytics event (posthog or dataLayer) or just DB-level
      const hasDedicatedAnalytics = uniqueMatched.some(
        m => m.mechanism === 'posthog-server' || m.mechanism === 'posthog-client' || m.mechanism === 'dataLayer' || m.mechanism === 'ga4-mp'
      );
      const hasDbOrCodeLevel = uniqueMatched.some(
        m => m.mechanism === 'usage_logs' || m.mechanism === 'db-write' || m.mechanism === 'stripe-webhook' || m.mechanism === 'session-metadata'
      );

      if (hasDedicatedAnalytics) {
        status = 'FOUND';
        notes = `Found ${uniqueMatched.length} event source(s) with dedicated analytics tracking.`;
      } else if (hasDbOrCodeLevel) {
        status = 'PARTIAL';
        const codeDesc = codeMatches.length > 0 ? codeMatches[0].description : '';
        notes = `Event tracked at DB/code level but lacks dedicated PostHog/GA4 analytics event. ${codeDesc}`;
      } else {
        status = 'PARTIAL';
        notes = `Event logic exists in code but no dedicated analytics event fires.`;
      }
    }

    results.push({
      requiredEvent: required.id,
      description: required.description,
      status,
      matchedEvents: uniqueMatched,
      notes,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Observable Dashboards Assessment
// ---------------------------------------------------------------------------

function assessDashboards(funnelResults: FunnelEventResult[]): string[] {
  const dashboards: string[] = [];

  const has = (id: string) => funnelResults.find(f => f.requiredEvent === id)?.status !== 'MISSING';

  if (has('page_viewed') && has('signup_started_or_completed') && has('login_completed')) {
    dashboards.push('Acquisition Funnel: page_view -> signup -> login (PostHog + GA4/GTM)');
  }

  if (has('trial_started') && has('checkout_started_or_completed') && has('subscription_created_or_confirmed')) {
    dashboards.push('Conversion Funnel: trial -> checkout -> subscription (PostHog + GA4 Measurement Protocol)');
  }

  if (has('exam_session_started') && has('exam_answer_assessed') && has('exam_session_completed')) {
    dashboards.push('Engagement Funnel: session_start -> answers -> session_complete (DB + PostHog)');
  }

  if (has('tts_request')) {
    dashboards.push('Voice Usage Dashboard: TTS/STT usage per tier, quota utilization (usage_logs table)');
  }

  if (has('payment_failed')) {
    dashboards.push('Revenue Health: payment failures, churn signals (Stripe webhooks + DB)');
  }

  if (has('prompt_trace')) {
    dashboards.push('Prompt Ops: prompt version tracking per session (session metadata)');
  }

  if (has('multimodal_asset_selected')) {
    dashboards.push('Multimodal Engagement: asset selection rates, image/card usage (PostHog)');
  }

  if (has('grounding_low_confidence')) {
    dashboards.push('RAG Quality: grounding confidence, citation health (PostHog + session metadata)');
  }

  if (has('support_ticket_created')) {
    dashboards.push('Support Volume: ticket creation rate, response times (support_tickets table)');
  }

  return dashboards;
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

function computeVerdict(
  funnelResults: FunnelEventResult[]
): { verdict: AuditReport['verdict']; reason: string } {
  const found = funnelResults.filter(f => f.status === 'FOUND').length;
  const partial = funnelResults.filter(f => f.status === 'PARTIAL').length;
  const missing = funnelResults.filter(f => f.status === 'MISSING').length;
  const total = funnelResults.length;
  const coverage = (found + partial * 0.5) / total;

  if (coverage >= 0.85 && missing === 0) {
    return {
      verdict: 'SUFFICIENT',
      reason: `${found}/${total} events fully instrumented, ${partial} partial. All critical funnel events have at least DB-level tracking. Coverage: ${(coverage * 100).toFixed(0)}%.`,
    };
  }

  if (coverage >= 0.6) {
    return {
      verdict: 'NEEDS WORK',
      reason: `${found}/${total} events fully instrumented, ${partial} partial, ${missing} missing. Coverage: ${(coverage * 100).toFixed(0)}%. Some funnel events need dedicated analytics events added.`,
    };
  }

  return {
    verdict: 'INSUFFICIENT',
    reason: `Only ${found}/${total} events fully instrumented, ${missing} missing. Coverage: ${(coverage * 100).toFixed(0)}%. Major gaps in funnel instrumentation.`,
  };
}

// ---------------------------------------------------------------------------
// Output Formatters
// ---------------------------------------------------------------------------

function formatTxt(report: AuditReport): string {
  const lines: string[] = [];
  const hr = '='.repeat(80);
  const hr2 = '-'.repeat(80);

  lines.push(hr);
  lines.push('  LAUNCH FUNNEL INSTRUMENTATION AUDIT');
  lines.push(`  Generated: ${report.timestamp}`);
  lines.push(hr);
  lines.push('');

  // Summary
  lines.push('## SUMMARY');
  lines.push(hr2);
  lines.push(`Total events found in codebase:    ${report.totalEventsFound}`);
  lines.push(`Unique event names:                ${report.uniqueEventNames.length}`);
  lines.push(`Required funnel events:            ${report.requiredFunnelTotal}`);
  lines.push(`  FOUND:                           ${report.requiredFunnelPresent}`);
  lines.push(`  PARTIAL:                         ${report.requiredFunnelPartial}`);
  lines.push(`  MISSING:                         ${report.requiredFunnelMissing}`);
  lines.push('');
  lines.push(`VERDICT: ${report.verdict}`);
  lines.push(`  ${report.verdictReason}`);
  lines.push('');

  // Unique event names
  lines.push('## ALL UNIQUE EVENT NAMES');
  lines.push(hr2);
  for (const name of report.uniqueEventNames) {
    lines.push(`  - ${name}`);
  }
  lines.push('');

  // Funnel events detail
  lines.push('## REQUIRED FUNNEL EVENTS');
  lines.push(hr2);
  for (const fe of report.funnelEvents) {
    const icon = fe.status === 'FOUND' ? '[OK]' : fe.status === 'PARTIAL' ? '[!!]' : '[XX]';
    lines.push(`${icon} ${fe.requiredEvent} — ${fe.status}`);
    lines.push(`    Description: ${fe.description}`);
    lines.push(`    Notes: ${fe.notes}`);
    if (fe.matchedEvents.length > 0) {
      lines.push('    Sources:');
      for (const m of fe.matchedEvents) {
        lines.push(`      - ${m.eventName} (${m.mechanism}, ${m.emitType}) in ${m.file}`);
        if (m.properties.length > 0) {
          lines.push(`        Properties: ${m.properties.join(', ')}`);
        }
      }
    }
    lines.push('');
  }

  // Observable dashboards
  lines.push('## OBSERVABLE DASHBOARDS');
  lines.push(hr2);
  for (const d of report.observableDashboards) {
    lines.push(`  [+] ${d}`);
  }
  lines.push('');

  // Missing events that need adding
  const missingEvents = report.funnelEvents.filter(f => f.status === 'MISSING');
  const partialEvents = report.funnelEvents.filter(f => f.status === 'PARTIAL');

  if (missingEvents.length > 0 || partialEvents.length > 0) {
    lines.push('## GAPS & RECOMMENDATIONS');
    lines.push(hr2);
    if (missingEvents.length > 0) {
      lines.push('Missing events that need adding:');
      for (const m of missingEvents) {
        lines.push(`  [ADD] ${m.requiredEvent}: ${m.description}`);
      }
      lines.push('');
    }
    if (partialEvents.length > 0) {
      lines.push('Partial events that need dedicated analytics:');
      for (const p of partialEvents) {
        lines.push(`  [UPGRADE] ${p.requiredEvent}: ${p.notes}`);
      }
    }
    lines.push('');
  }

  // All found events (grouped by mechanism)
  lines.push('## ALL FOUND EVENTS (BY MECHANISM)');
  lines.push(hr2);
  const byMechanism = new Map<string, FoundEvent[]>();
  for (const e of report.allFoundEvents) {
    const list = byMechanism.get(e.mechanism) || [];
    list.push(e);
    byMechanism.set(e.mechanism, list);
  }
  for (const [mechanism, events] of byMechanism) {
    lines.push(`\n### ${mechanism.toUpperCase()} (${events.length} events)`);
    for (const e of events) {
      lines.push(`  ${e.eventName} — ${e.file}:${e.line} (${e.emitType})`);
    }
  }
  lines.push('');

  lines.push(hr);
  lines.push('  END OF AUDIT REPORT');
  lines.push(hr);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('Launch Funnel Instrumentation Audit');
  console.log('===================================\n');

  // Step 1: Scan codebase
  console.log('Scanning codebase for analytics events...');
  const rawEvents = scanCodebase();
  const allEvents = deduplicateEvents(rawEvents);
  console.log(`  Found ${allEvents.length} unique event instances`);

  // Step 2: Map to funnel
  console.log('Mapping events to required funnel...');
  const funnelResults = mapToFunnel(allEvents);

  // Step 3: Assess dashboards
  const dashboards = assessDashboards(funnelResults);

  // Step 4: Compute verdict
  const { verdict, reason } = computeVerdict(funnelResults);

  // Step 5: Build report
  const uniqueEventNames = [...new Set(allEvents.map(e => e.eventName))].sort();

  const report: AuditReport = {
    timestamp: new Date().toISOString(),
    totalEventsFound: allEvents.length,
    uniqueEventNames,
    requiredFunnelTotal: REQUIRED_FUNNEL_EVENTS.length,
    requiredFunnelPresent: funnelResults.filter(f => f.status === 'FOUND').length,
    requiredFunnelMissing: funnelResults.filter(f => f.status === 'MISSING').length,
    requiredFunnelPartial: funnelResults.filter(f => f.status === 'PARTIAL').length,
    funnelEvents: funnelResults,
    allFoundEvents: allEvents,
    observableDashboards: dashboards,
    verdict,
    verdictReason: reason,
  };

  // Step 6: Output
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  const jsonPath = join(EVIDENCE_DIR, 'launch-funnel-audit.json');
  const txtPath = join(EVIDENCE_DIR, 'launch-funnel-audit.txt');

  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(txtPath, formatTxt(report));

  console.log(`\nEvidence files written:`);
  console.log(`  JSON: ${relative(ROOT, jsonPath)}`);
  console.log(`  TXT:  ${relative(ROOT, txtPath)}`);

  // Print summary
  console.log(`\n--- SUMMARY ---`);
  console.log(`Total events found:         ${allEvents.length}`);
  console.log(`Unique event names:         ${uniqueEventNames.length}`);
  console.log(`Required funnel events:     ${REQUIRED_FUNNEL_EVENTS.length}`);
  console.log(`  FOUND:                    ${report.requiredFunnelPresent}`);
  console.log(`  PARTIAL:                  ${report.requiredFunnelPartial}`);
  console.log(`  MISSING:                  ${report.requiredFunnelMissing}`);
  console.log(`\nVERDICT: ${verdict}`);
  console.log(`  ${reason}`);

  // Print funnel detail
  console.log(`\n--- FUNNEL EVENT STATUS ---`);
  for (const fe of funnelResults) {
    const icon = fe.status === 'FOUND' ? '  [OK]' : fe.status === 'PARTIAL' ? '  [!!]' : '  [XX]';
    console.log(`${icon} ${fe.requiredEvent.padEnd(40)} ${fe.status}`);
  }

  // Print dashboards
  console.log(`\n--- OBSERVABLE DASHBOARDS (${dashboards.length}) ---`);
  for (const d of dashboards) {
    console.log(`  [+] ${d}`);
  }
}

main();
