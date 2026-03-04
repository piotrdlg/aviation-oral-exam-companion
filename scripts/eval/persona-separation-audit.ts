/**
 * Persona Separation Audit
 *
 * Verifies that PersonaContractV1 produces measurably different prompt
 * outputs across all 4 personas. This is a deterministic, offline audit
 * (no LLM calls) that checks structural separation.
 *
 * Checks:
 *   1. All 4 personas have unique dimension profiles
 *   2. Formatted prompt sections are distinct
 *   3. Each pair of personas differs in >= 2 dimensions
 *   4. Persona summaries (for monitoring) are complete
 *   5. Voice map is bidirectionally consistent
 *   6. Resolution logic works for all input types
 *   7. Boundary enforcement text is present in all persona prompts
 *   8. Persona section character counts are reasonable
 *
 * Usage:
 *   npx tsx scripts/eval/persona-separation-audit.ts
 *
 * Phase 11 — Examiner Personality Engine
 */

import {
  ALL_PERSONA_KEYS,
  PERSONA_CONTRACTS,
  PERSONA_VOICE_MAP,
  VOICE_TO_PERSONA_MAP,
  getPersonaContract,
  resolvePersonaKey,
  formatPersonaForExaminer,
  personaSummary,
  type PersonaContractV1,
  type PersonaKey,
} from '../../src/lib/persona-contract';

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL';
  detail: string;
}

const checks: CheckResult[] = [];

function check(name: string, passed: boolean, detail: string) {
  checks.push({ name, status: passed ? 'PASS' : 'FAIL', detail });
}

// ---------------------------------------------------------------------------
// Check 1: All 4 personas defined with unique keys
// ---------------------------------------------------------------------------

const keys = ALL_PERSONA_KEYS;
check(
  'all_personas_defined',
  keys.length === 4,
  `Expected 4 personas, got ${keys.length}: ${keys.join(', ')}`
);

// ---------------------------------------------------------------------------
// Check 2: Each persona has all required dimensions
// ---------------------------------------------------------------------------

const DIMENSIONS = [
  'warmth', 'strictness', 'verbosity', 'drilldownTendency',
  'transitionStyle', 'challengeStyle', 'correctionStyle', 'patience',
] as const;

let allDimensionsValid = true;
for (const key of keys) {
  const contract = PERSONA_CONTRACTS[key];
  for (const dim of DIMENSIONS) {
    if (!contract[dim]) {
      allDimensionsValid = false;
    }
  }
}
check(
  'all_dimensions_populated',
  allDimensionsValid,
  `8 dimensions × 4 personas = ${DIMENSIONS.length * keys.length} values checked`
);

// ---------------------------------------------------------------------------
// Check 3: Pairwise dimension separation (>= 2 diffs per pair)
// ---------------------------------------------------------------------------

let minDiffs = Infinity;
let worstPair = '';
const pairDetails: string[] = [];

for (let i = 0; i < keys.length; i++) {
  for (let j = i + 1; j < keys.length; j++) {
    const a = PERSONA_CONTRACTS[keys[i]];
    const b = PERSONA_CONTRACTS[keys[j]];
    const diffs = DIMENSIONS.filter(d => a[d] !== b[d]).length;
    pairDetails.push(`${keys[i]} vs ${keys[j]}: ${diffs}/${DIMENSIONS.length} dimensions differ`);
    if (diffs < minDiffs) {
      minDiffs = diffs;
      worstPair = `${keys[i]} vs ${keys[j]}`;
    }
  }
}

check(
  'pairwise_separation',
  minDiffs >= 2,
  `Minimum dimension difference: ${minDiffs} (${worstPair}). All pairs:\n    ${pairDetails.join('\n    ')}`
);

// ---------------------------------------------------------------------------
// Check 4: Formatted prompts are all distinct
// ---------------------------------------------------------------------------

const formattedPrompts = new Map<PersonaKey, string>();
for (const key of keys) {
  formattedPrompts.set(key, formatPersonaForExaminer(PERSONA_CONTRACTS[key]));
}

const uniquePrompts = new Set(formattedPrompts.values());
check(
  'formatted_prompts_distinct',
  uniquePrompts.size === keys.length,
  `${uniquePrompts.size} unique prompts from ${keys.length} personas`
);

// ---------------------------------------------------------------------------
// Check 5: Prompt char counts are reasonable (200–2000 chars)
// ---------------------------------------------------------------------------

let charCountsValid = true;
const charDetails: string[] = [];
for (const key of keys) {
  const len = formattedPrompts.get(key)!.length;
  charDetails.push(`${key}: ${len} chars`);
  if (len < 200 || len > 2000) charCountsValid = false;
}

check(
  'prompt_char_counts',
  charCountsValid,
  `Character counts: ${charDetails.join(', ')}`
);

// ---------------------------------------------------------------------------
// Check 6: Boundary enforcement present in all prompts
// ---------------------------------------------------------------------------

const BOUNDARY_MARKERS = [
  'PERSONA BOUNDARIES',
  'STYLE and PROBING STRATEGY only',
  'Grounding Contract',
  'Depth/Difficulty Contract',
  'Do NOT change factual content',
];

let allBoundariesPresent = true;
for (const key of keys) {
  const prompt = formattedPrompts.get(key)!;
  for (const marker of BOUNDARY_MARKERS) {
    if (!prompt.includes(marker)) {
      allBoundariesPresent = false;
    }
  }
}

check(
  'boundary_enforcement',
  allBoundariesPresent,
  `${BOUNDARY_MARKERS.length} boundary markers checked across ${keys.length} personas`
);

// ---------------------------------------------------------------------------
// Check 7: Voice map consistency
// ---------------------------------------------------------------------------

const voiceMapValid =
  Object.keys(PERSONA_VOICE_MAP).length === 4 &&
  Object.keys(VOICE_TO_PERSONA_MAP).length === 4 &&
  Object.entries(PERSONA_VOICE_MAP).every(([pk, vid]) => VOICE_TO_PERSONA_MAP[vid] === pk);

check(
  'voice_map_consistency',
  voiceMapValid,
  `Forward map: ${Object.keys(PERSONA_VOICE_MAP).length} entries, Reverse map: ${Object.keys(VOICE_TO_PERSONA_MAP).length} entries`
);

// ---------------------------------------------------------------------------
// Check 8: Resolution logic
// ---------------------------------------------------------------------------

const resolutionTests = [
  { input: 'supportive_coach', expected: 'supportive_coach' },
  { input: 'strict_dpe', expected: 'strict_dpe' },
  { input: 'bob_mitchell', expected: 'supportive_coach' },
  { input: 'jim_hayes', expected: 'strict_dpe' },
  { input: 'maria_torres', expected: 'quiet_methodical' },
  { input: 'karen_sullivan', expected: 'scenario_challenger' },
  { input: undefined, expected: 'quiet_methodical' },
  { input: 'unknown', expected: 'quiet_methodical' },
];

let allResolutionsPass = true;
for (const t of resolutionTests) {
  const result = resolvePersonaKey(t.input);
  if (result !== t.expected) {
    allResolutionsPass = false;
  }
}

check(
  'resolution_logic',
  allResolutionsPass,
  `${resolutionTests.length} resolution tests: direct keys, voice IDs, undefined, unknown`
);

// ---------------------------------------------------------------------------
// Check 9: PersonaSummary completeness
// ---------------------------------------------------------------------------

let summariesComplete = true;
for (const key of keys) {
  const summary = personaSummary(PERSONA_CONTRACTS[key]);
  if (Object.keys(summary).length !== 10) {
    summariesComplete = false;
  }
}

check(
  'summary_completeness',
  summariesComplete,
  `10 fields per summary × ${keys.length} personas`
);

// ---------------------------------------------------------------------------
// Check 10: Determinism
// ---------------------------------------------------------------------------

let deterministic = true;
for (const key of keys) {
  const a = formatPersonaForExaminer(getPersonaContract(key));
  const b = formatPersonaForExaminer(getPersonaContract(key));
  if (a !== b) deterministic = false;
}

check(
  'deterministic',
  deterministic,
  `Same key → same output for all ${keys.length} personas`
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const passed = checks.filter(c => c.status === 'PASS').length;
const failed = checks.filter(c => c.status === 'FAIL').length;
const overall = failed === 0 ? 'PASS' : 'FAIL';

console.log('');
console.log('='.repeat(60));
console.log('  PERSONA SEPARATION AUDIT');
console.log('='.repeat(60));
console.log('');

for (const c of checks) {
  const icon = c.status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} ${c.name}: ${c.status}`);
  console.log(`   ${c.detail}`);
  console.log('');
}

console.log('─'.repeat(60));
console.log(`OVERALL: ${overall} (${passed}/${checks.length} checks)`);
if (failed > 0) {
  console.log(`FAILED: ${checks.filter(c => c.status === 'FAIL').map(c => c.name).join(', ')}`);
}
console.log('');

// ---------------------------------------------------------------------------
// Dimension Profile Matrix
// ---------------------------------------------------------------------------

console.log('DIMENSION PROFILE MATRIX:');
console.log('─'.repeat(60));
const header = ['Persona', ...DIMENSIONS.map(d => d.substring(0, 10))];
console.log(header.map(h => h.padEnd(12)).join(''));
for (const key of keys) {
  const c = PERSONA_CONTRACTS[key];
  const row = [key, ...DIMENSIONS.map(d => c[d])];
  console.log(row.map(v => String(v).padEnd(12)).join(''));
}
console.log('');

// ---------------------------------------------------------------------------
// Save results
// ---------------------------------------------------------------------------

const evidenceDir = 'docs/system-audit/evidence/2026-03-08-phase11/eval';
fs.mkdirSync(evidenceDir, { recursive: true });

const report = {
  timestamp: new Date().toISOString(),
  audit: 'persona-separation',
  phase: 11,
  checks: checks.map(c => ({ name: c.name, status: c.status, detail: c.detail })),
  overall,
  passed,
  total: checks.length,
  personas: keys.map(k => ({
    key: k,
    label: PERSONA_CONTRACTS[k].label,
    dimensions: Object.fromEntries(DIMENSIONS.map(d => [d, PERSONA_CONTRACTS[k][d]])),
    promptCharCount: formattedPrompts.get(k)!.length,
  })),
};

fs.writeFileSync(
  path.join(evidenceDir, 'persona-separation-audit.json'),
  JSON.stringify(report, null, 2),
);

// Also save the markdown report
const mdLines = [
  `# Persona Separation Audit`,
  ``,
  `**Date:** ${new Date().toISOString().split('T')[0]}`,
  `**Phase:** 11 — Examiner Personality Engine`,
  `**Overall:** ${overall} (${passed}/${checks.length})`,
  ``,
  `## Checks`,
  ``,
  `| Check | Status | Detail |`,
  `|-------|--------|--------|`,
  ...checks.map(c => `| ${c.name} | ${c.status} | ${c.detail.split('\n')[0]} |`),
  ``,
  `## Dimension Matrix`,
  ``,
  `| Persona | Warmth | Strict | Verbose | Drill | Transition | Challenge | Correction | Patience |`,
  `|---------|--------|--------|---------|-------|------------|-----------|------------|----------|`,
  ...keys.map(k => {
    const c = PERSONA_CONTRACTS[k];
    return `| ${k} | ${c.warmth} | ${c.strictness} | ${c.verbosity} | ${c.drilldownTendency} | ${c.transitionStyle} | ${c.challengeStyle} | ${c.correctionStyle} | ${c.patience} |`;
  }),
  ``,
];

fs.writeFileSync(
  path.join(evidenceDir, 'persona-separation-audit.md'),
  mdLines.join('\n'),
);

console.log(`Results saved to ${evidenceDir}/persona-separation-audit.{json,md}`);
console.log('');

process.exit(failed > 0 ? 1 : 0);
