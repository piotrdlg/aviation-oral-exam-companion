/**
 * Multimodal Asset Audit
 *
 * Verifies that the semantic asset selection module is correctly wired:
 * scoring functions, threshold behavior, text card builder,
 * deterministic output, and edge case handling.
 *
 * Deterministic, offline (no LLM or DB calls).
 *
 * Checks:
 *   1. All 9 image categories appear in AREA_CATEGORY_MAP
 *   2. Link type scores cover all 4 known types
 *   3. Confidence threshold is 0.4
 *   4. Max 3 images returned
 *   5. Max 2 text cards returned
 *   6. Empty input produces empty output
 *   7. All-below-threshold input produces 0 images
 *   8. Explanation strings are non-empty for every scored image
 *   9. Text card keywords cover METAR, TAF, NOTAM, CFR patterns
 *   10. Category scoring is deterministic
 *
 * Usage:
 *   npx tsx scripts/eval/multimodal-asset-audit.ts
 *
 * Phase 13 — Multimodal Semantic Asset Engine
 */

import {
  AREA_CATEGORY_MAP,
  LINK_TYPE_SCORES,
  CONFIDENCE_THRESHOLD,
  MAX_IMAGES,
  MAX_TEXT_CARDS,
  TEXT_CARD_KEYWORDS,
  scoreCategoryAlignment,
  selectBestAssets,
  scoreImage,
  buildTextCards,
  type AssetSelectionContext,
} from '../../src/lib/asset-selector';

import type { ImageResult, ChunkSearchResult } from '../../src/lib/rag-retrieval';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
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

function makeImage(overrides: Partial<ImageResult> = {}): ImageResult {
  return {
    image_id: 'img-1',
    figure_label: 'Figure 1',
    caption: 'A chart diagram',
    image_category: 'diagram',
    public_url: 'https://example.com/img.png',
    width: 800,
    height: 600,
    description: 'Test image',
    doc_abbreviation: 'PHAK',
    page_number: 1,
    link_type: 'figure_ref',
    relevance_score: 0.8,
    ...overrides,
  };
}

function makeChunk(overrides: Partial<ChunkSearchResult> = {}): ChunkSearchResult {
  return {
    id: 'chunk-1',
    document_id: 'doc-1',
    heading: 'Test Heading',
    content: 'Test content for chunk',
    page_start: 1,
    page_end: 2,
    doc_title: 'Test Document',
    doc_abbreviation: 'TEST',
    score: 0.75,
    ...overrides,
  };
}

function makeContext(overrides: Partial<AssetSelectionContext> = {}): AssetSelectionContext {
  return {
    acsArea: 'I',
    acsTaskCode: 'PA.I.A',
    rating: 'private',
    questionText: 'What charts are used for preflight planning?',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Check 1: All 9 image categories appear in AREA_CATEGORY_MAP
// ---------------------------------------------------------------------------

const ALL_CATEGORIES = ['diagram', 'chart', 'table', 'instrument', 'weather', 'performance', 'sectional', 'airport', 'general'];
const mapCategories = new Set<string>();
for (const cats of Object.values(AREA_CATEGORY_MAP)) {
  for (const c of cats) mapCategories.add(c);
}
const missingCategories = ALL_CATEGORIES.filter(c => !mapCategories.has(c));
check(
  'all_9_categories_in_map',
  missingCategories.length === 0,
  missingCategories.length === 0
    ? `All 9 categories present: ${[...mapCategories].sort().join(', ')}`
    : `Missing: ${missingCategories.join(', ')}`
);

// ---------------------------------------------------------------------------
// Check 2: Link type scores cover all 4 known types
// ---------------------------------------------------------------------------

const KNOWN_LINK_TYPES = ['figure_ref', 'caption_match', 'same_page', 'manual'];
const missingLinkTypes = KNOWN_LINK_TYPES.filter(lt => !(lt in LINK_TYPE_SCORES));
check(
  'link_type_scores_complete',
  missingLinkTypes.length === 0,
  missingLinkTypes.length === 0
    ? `All 4 link types scored: ${KNOWN_LINK_TYPES.map(lt => `${lt}=${LINK_TYPE_SCORES[lt]}`).join(', ')}`
    : `Missing: ${missingLinkTypes.join(', ')}`
);

// ---------------------------------------------------------------------------
// Check 3: Confidence threshold is 0.4
// ---------------------------------------------------------------------------

check(
  'confidence_threshold_is_0.4',
  CONFIDENCE_THRESHOLD === 0.4,
  `Threshold = ${CONFIDENCE_THRESHOLD}`
);

// ---------------------------------------------------------------------------
// Check 4: Max 3 images returned
// ---------------------------------------------------------------------------

const manyImages = Array.from({ length: 10 }, (_, i) =>
  makeImage({ image_id: `img-${i}`, image_category: 'chart', relevance_score: 0.9 - i * 0.02 })
);
const resultMany = selectBestAssets(manyImages, [], makeContext());
check(
  'max_3_images_returned',
  resultMany.images.length <= MAX_IMAGES,
  `${resultMany.images.length} images returned from 10 candidates (max ${MAX_IMAGES})`
);

// ---------------------------------------------------------------------------
// Check 5: Max 2 text cards returned
// ---------------------------------------------------------------------------

const manyChunks = [
  makeChunk({ id: 'c1', heading: 'METAR Data', content: 'METAR KJAX 091853Z 18012KT...' }),
  makeChunk({ id: 'c2', heading: 'TAF Forecast', content: 'TAF KJAX 091730Z 0918/1018...' }),
  makeChunk({ id: 'c3', heading: 'NOTAM Info', content: 'NOTAM for KJAX closed runway...' }),
  makeChunk({ id: 'c4', heading: '14 CFR Part 91', content: '14 CFR 91.103 requires preflight...' }),
];
const resultCards = buildTextCards(manyChunks, makeContext({ questionText: 'Explain METAR TAF NOTAM 14 CFR regulations' }));
check(
  'max_2_text_cards_returned',
  resultCards.length <= MAX_TEXT_CARDS,
  `${resultCards.length} text cards returned (max ${MAX_TEXT_CARDS})`
);

// ---------------------------------------------------------------------------
// Check 6: Empty input produces empty output
// ---------------------------------------------------------------------------

const resultEmpty = selectBestAssets([], [], makeContext());
check(
  'empty_input_empty_output',
  resultEmpty.images.length === 0 && resultEmpty.textCards.length === 0,
  `Images: ${resultEmpty.images.length}, TextCards: ${resultEmpty.textCards.length}`
);

// ---------------------------------------------------------------------------
// Check 7: All-below-threshold input produces 0 images
// ---------------------------------------------------------------------------

const lowImages = Array.from({ length: 5 }, (_, i) =>
  makeImage({
    image_id: `low-${i}`,
    image_category: 'sectional',  // Low score for area I
    link_type: 'same_page',
    relevance_score: 0.05,
    caption: null,
    description: null,
  })
);
const resultLow = selectBestAssets(lowImages, [], makeContext({ acsArea: 'I', questionText: 'xyz abc nothing' }));
check(
  'all_below_threshold_zero_images',
  resultLow.images.length === 0,
  `${resultLow.images.length} images selected from ${lowImages.length} low-scoring candidates`
);

// ---------------------------------------------------------------------------
// Check 8: Explanation strings non-empty for every scored image
// ---------------------------------------------------------------------------

const testImages = [
  makeImage({ image_id: 'a', image_category: 'chart' }),
  makeImage({ image_id: 'b', image_category: 'diagram' }),
  makeImage({ image_id: 'c', image_category: 'weather' }),
];
const resultExplain = selectBestAssets(testImages, [], makeContext());
const allExplanationsNonEmpty = resultExplain.images.every(s => s.explanation && s.explanation.length > 0);
check(
  'explanation_strings_non_empty',
  allExplanationsNonEmpty,
  allExplanationsNonEmpty
    ? `All ${resultExplain.images.length} selected images have explanations`
    : 'Some images missing explanations'
);

// ---------------------------------------------------------------------------
// Check 9: Text card keywords cover METAR, TAF, NOTAM, CFR patterns
// ---------------------------------------------------------------------------

const requiredKeywords = ['metar', 'taf', 'notam', 'cfr'];
const configuredKeywords = Object.keys(TEXT_CARD_KEYWORDS);
const missingKeywords = requiredKeywords.filter(k => !configuredKeywords.includes(k));
check(
  'text_card_keywords_coverage',
  missingKeywords.length === 0,
  missingKeywords.length === 0
    ? `All required keywords configured: ${requiredKeywords.join(', ')}`
    : `Missing keywords: ${missingKeywords.join(', ')}`
);

// ---------------------------------------------------------------------------
// Check 10: Category scoring is deterministic
// ---------------------------------------------------------------------------

let deterministic = true;
for (let i = 0; i < 5; i++) {
  const s1 = scoreCategoryAlignment('chart', 'I');
  const s2 = scoreCategoryAlignment('chart', 'I');
  if (s1 !== s2) { deterministic = false; break; }
}

const img = makeImage({ image_category: 'chart', relevance_score: 0.8 });
const ctx = makeContext();
const score1 = scoreImage(img, ctx);
const score2 = scoreImage(img, ctx);
if (score1.totalScore !== score2.totalScore) deterministic = false;

check(
  'category_scoring_deterministic',
  deterministic,
  deterministic
    ? 'Same inputs always produce same scores'
    : 'Non-deterministic scoring detected'
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const passed = checks.filter(c => c.status === 'PASS').length;
const failed = checks.filter(c => c.status === 'FAIL').length;
const allPassed = failed === 0;

console.log('\n=== Multimodal Asset Audit ===\n');

for (const c of checks) {
  const icon = c.status === 'PASS' ? '\u2713' : '\u2717';
  console.log(`  ${icon} ${c.name}: ${c.detail}`);
}

console.log(`\nResult: ${passed}/${checks.length} passed${failed > 0 ? `, ${failed} FAILED` : ''}`);
console.log(allPassed ? '\nAll checks passed.' : '\nSome checks FAILED. See details above.');

// Write report
const reportDir = path.join(__dirname, '../../docs/system-audit/evidence/2026-03-10-phase13');
fs.mkdirSync(path.join(reportDir, 'commands'), { recursive: true });
const reportContent = [
  '# Multimodal Asset Audit Report',
  `Date: ${new Date().toISOString()}`,
  `Result: ${passed}/${checks.length} passed`,
  '',
  '## Checks',
  ...checks.map(c => `- [${c.status}] ${c.name}: ${c.detail}`),
].join('\n');
fs.writeFileSync(
  path.join(reportDir, 'commands', 'multimodal-asset-audit.txt'),
  reportContent,
);

process.exit(allPassed ? 0 : 1);
