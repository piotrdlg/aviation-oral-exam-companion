/**
 * Examiner Identity Audit
 *
 * Verifies that ExaminerProfileV1 is correctly wired:
 * profile definitions, lookup maps, resolution logic,
 * persona section formatting, display name resolution,
 * and voice-profile consistency.
 *
 * Deterministic, offline (no LLM or DB calls).
 *
 * Checks:
 *   1. All 4 profiles defined with required fields
 *   2. Gender balance: 2 male, 2 female
 *   3. Unique voice IDs and persona keys
 *   4. Bidirectional lookup map consistency
 *   5. Resolution priority chain works correctly
 *   6. All legacy inputs (voice, persona) resolve to valid profiles
 *   7. Formatted persona sections are distinct and non-empty
 *   8. Display name resolution handles all edge cases
 *
 * Usage:
 *   npx tsx scripts/eval/examiner-identity-audit.ts
 *
 * Phase 12 — Examiner Identity Unification
 */

import {
  EXAMINER_PROFILES,
  ALL_PROFILE_KEYS,
  VOICE_TO_PROFILE_MAP,
  PERSONA_TO_PROFILE_MAP,
  getExaminerProfile,
  resolveExaminerProfile,
  formatProfilePersonaSection,
  resolveDisplayName,
  examinerProfileSummary,
  type ExaminerProfileKey,
} from '../../src/lib/examiner-profile';

import {
  ALL_PERSONA_KEYS,
  PERSONA_VOICE_MAP,
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
// Check 1: All 4 profiles defined with required fields
// ---------------------------------------------------------------------------

const keys = ALL_PROFILE_KEYS;
check(
  'all_profiles_defined',
  keys.length === 4,
  `Expected 4 profiles, got ${keys.length}: ${keys.join(', ')}`
);

const requiredFields = ['profileKey', 'personaKey', 'voiceId', 'voiceGender', 'defaultDisplayName', 'description', 'version'] as const;
let allFieldsValid = true;
for (const key of keys) {
  const profile = EXAMINER_PROFILES[key];
  for (const field of requiredFields) {
    if (!profile[field]) {
      allFieldsValid = false;
    }
  }
  if (profile.version !== 1) allFieldsValid = false;
}
check(
  'all_required_fields',
  allFieldsValid,
  allFieldsValid ? 'All 4 profiles have all required fields with version=1' : 'Some profiles are missing fields'
);

// ---------------------------------------------------------------------------
// Check 2: Gender balance (2 male, 2 female)
// ---------------------------------------------------------------------------

const males = keys.filter(k => EXAMINER_PROFILES[k].voiceGender === 'male');
const females = keys.filter(k => EXAMINER_PROFILES[k].voiceGender === 'female');
check(
  'gender_balance',
  males.length === 2 && females.length === 2,
  `Males: ${males.join(', ')} (${males.length}); Females: ${females.join(', ')} (${females.length})`
);

// ---------------------------------------------------------------------------
// Check 3: Unique voice IDs and persona keys
// ---------------------------------------------------------------------------

const voiceIds = keys.map(k => EXAMINER_PROFILES[k].voiceId);
const personaKeys = keys.map(k => EXAMINER_PROFILES[k].personaKey);
const uniqueVoices = new Set(voiceIds).size;
const uniquePersonas = new Set(personaKeys).size;

check(
  'unique_voice_ids',
  uniqueVoices === 4,
  `${uniqueVoices} unique voice IDs: ${voiceIds.join(', ')}`
);
check(
  'unique_persona_keys',
  uniquePersonas === 4,
  `${uniquePersonas} unique persona keys: ${personaKeys.join(', ')}`
);

// ---------------------------------------------------------------------------
// Check 4: Bidirectional lookup map consistency
// ---------------------------------------------------------------------------

let mapsConsistent = true;
const mapDetails: string[] = [];

for (const key of keys) {
  const profile = EXAMINER_PROFILES[key];

  // Voice → Profile
  if (VOICE_TO_PROFILE_MAP[profile.voiceId] !== key) {
    mapsConsistent = false;
    mapDetails.push(`VOICE_TO_PROFILE_MAP[${profile.voiceId}] = ${VOICE_TO_PROFILE_MAP[profile.voiceId]}, expected ${key}`);
  }

  // Persona → Profile
  if (PERSONA_TO_PROFILE_MAP[profile.personaKey] !== key) {
    mapsConsistent = false;
    mapDetails.push(`PERSONA_TO_PROFILE_MAP[${profile.personaKey}] = ${PERSONA_TO_PROFILE_MAP[profile.personaKey]}, expected ${key}`);
  }

  // Cross-check with persona-contract voice map
  if (PERSONA_VOICE_MAP[profile.personaKey] !== profile.voiceId) {
    mapsConsistent = false;
    mapDetails.push(`PERSONA_VOICE_MAP[${profile.personaKey}] = ${PERSONA_VOICE_MAP[profile.personaKey]}, expected ${profile.voiceId}`);
  }
}

check(
  'bidirectional_maps_consistent',
  mapsConsistent,
  mapsConsistent ? 'All lookup maps are bidirectionally consistent' : mapDetails.join('; ')
);

// ---------------------------------------------------------------------------
// Check 5: Resolution priority chain
// ---------------------------------------------------------------------------

let priorityCorrect = true;
const priorityDetails: string[] = [];

// Direct profile takes priority
const r1 = resolveExaminerProfile({
  savedProfile: 'karen_scenario',
  savedVoice: 'bob_mitchell',
  savedPersona: 'strict_dpe',
});
if (r1.profile.profileKey !== 'karen_scenario' || r1.source !== 'direct_profile') {
  priorityCorrect = false;
  priorityDetails.push(`Profile priority failed: got ${r1.profile.profileKey}/${r1.source}`);
}

// Voice fallback when no profile
const r2 = resolveExaminerProfile({ savedVoice: 'jim_hayes', savedPersona: 'supportive_coach' });
if (r2.profile.profileKey !== 'jim_strict' || r2.source !== 'voice_fallback') {
  priorityCorrect = false;
  priorityDetails.push(`Voice fallback failed: got ${r2.profile.profileKey}/${r2.source}`);
}

// Persona fallback when no profile or voice
const r3 = resolveExaminerProfile({ savedPersona: 'scenario_challenger' });
if (r3.profile.profileKey !== 'karen_scenario' || r3.source !== 'persona_fallback') {
  priorityCorrect = false;
  priorityDetails.push(`Persona fallback failed: got ${r3.profile.profileKey}/${r3.source}`);
}

// Default when nothing provided
const r4 = resolveExaminerProfile({});
if (r4.profile.profileKey !== 'maria_methodical') {
  priorityCorrect = false;
  priorityDetails.push(`Default failed: got ${r4.profile.profileKey}`);
}

check(
  'resolution_priority_chain',
  priorityCorrect,
  priorityCorrect ? 'Profile > Voice > Persona > Default chain works correctly' : priorityDetails.join('; ')
);

// ---------------------------------------------------------------------------
// Check 6: All legacy inputs resolve correctly
// ---------------------------------------------------------------------------

let allLegacyResolve = true;
const legacyDetails: string[] = [];

// All 4 voices
const voiceExpected: Record<string, ExaminerProfileKey> = {
  maria_torres: 'maria_methodical',
  bob_mitchell: 'bob_supportive',
  jim_hayes: 'jim_strict',
  karen_sullivan: 'karen_scenario',
};
for (const [voice, expected] of Object.entries(voiceExpected)) {
  const result = resolveExaminerProfile({ savedVoice: voice });
  if (result.profile.profileKey !== expected) {
    allLegacyResolve = false;
    legacyDetails.push(`Voice ${voice}: got ${result.profile.profileKey}, expected ${expected}`);
  }
}

// All 4 personas
const personaExpected: Record<string, ExaminerProfileKey> = {
  quiet_methodical: 'maria_methodical',
  supportive_coach: 'bob_supportive',
  strict_dpe: 'jim_strict',
  scenario_challenger: 'karen_scenario',
};
for (const [persona, expected] of Object.entries(personaExpected)) {
  const result = resolveExaminerProfile({ savedPersona: persona });
  if (result.profile.profileKey !== expected) {
    allLegacyResolve = false;
    legacyDetails.push(`Persona ${persona}: got ${result.profile.profileKey}, expected ${expected}`);
  }
}

check(
  'all_legacy_inputs_resolve',
  allLegacyResolve,
  allLegacyResolve ? 'All 4 voice IDs and 4 persona keys resolve correctly' : legacyDetails.join('; ')
);

// ---------------------------------------------------------------------------
// Check 7: Formatted persona sections are distinct and non-empty
// ---------------------------------------------------------------------------

const sections = keys.map(k => formatProfilePersonaSection(EXAMINER_PROFILES[k]));
const uniqueSections = new Set(sections).size;
const allNonEmpty = sections.every(s => s.length > 100);
const allHaveBoundaries = sections.every(s => s.includes('PERSONA BOUNDARIES'));

check(
  'persona_sections_distinct',
  uniqueSections === 4 && allNonEmpty && allHaveBoundaries,
  `${uniqueSections} unique sections, all non-empty: ${allNonEmpty}, all have boundaries: ${allHaveBoundaries}`
);

// ---------------------------------------------------------------------------
// Check 8: Display name resolution handles edge cases
// ---------------------------------------------------------------------------

let displayNameCorrect = true;
const dnDetails: string[] = [];
const testProfile = EXAMINER_PROFILES.maria_methodical;

// Custom name
if (resolveDisplayName(testProfile, 'Custom DPE') !== 'Custom DPE') {
  displayNameCorrect = false;
  dnDetails.push('Custom name failed');
}
// Null → default
if (resolveDisplayName(testProfile, null) !== testProfile.defaultDisplayName) {
  displayNameCorrect = false;
  dnDetails.push('Null fallback failed');
}
// Empty → default
if (resolveDisplayName(testProfile, '') !== testProfile.defaultDisplayName) {
  displayNameCorrect = false;
  dnDetails.push('Empty string fallback failed');
}
// Whitespace → default
if (resolveDisplayName(testProfile, '   ') !== testProfile.defaultDisplayName) {
  displayNameCorrect = false;
  dnDetails.push('Whitespace fallback failed');
}
// Trimming
if (resolveDisplayName(testProfile, '  Test  ') !== 'Test') {
  displayNameCorrect = false;
  dnDetails.push('Trimming failed');
}

check(
  'display_name_resolution',
  displayNameCorrect,
  displayNameCorrect ? 'All edge cases handled: custom, null, empty, whitespace, trimming' : dnDetails.join('; ')
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const passed = checks.filter(c => c.status === 'PASS').length;
const failed = checks.filter(c => c.status === 'FAIL').length;
const allPassed = failed === 0;

console.log('\n=== Examiner Identity Audit ===\n');

for (const c of checks) {
  const icon = c.status === 'PASS' ? '\u2713' : '\u2717';
  console.log(`  ${icon} ${c.name}: ${c.detail}`);
}

console.log(`\nResult: ${passed}/${checks.length} passed${failed > 0 ? `, ${failed} FAILED` : ''}`);
console.log(allPassed ? '\nAll checks passed.' : '\nSome checks FAILED. See details above.');

// Write report
const reportDir = path.join(__dirname, '../../docs/system-audit/evidence/2026-03-09-phase12');
fs.mkdirSync(path.join(reportDir, 'commands'), { recursive: true });
const reportContent = [
  '# Examiner Identity Audit Report',
  `Date: ${new Date().toISOString()}`,
  `Result: ${passed}/${checks.length} passed`,
  '',
  '## Checks',
  ...checks.map(c => `- [${c.status}] ${c.name}: ${c.detail}`),
].join('\n');
fs.writeFileSync(
  path.join(reportDir, 'commands', 'examiner-identity-audit.txt'),
  reportContent,
);

process.exit(allPassed ? 0 : 1);
