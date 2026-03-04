/**
 * Semantic Asset Selector — Phase 13
 *
 * Scores images against ACS element/area context using 4 weighted signals:
 *   1. Category-topic alignment (0.35)
 *   2. Caption keyword overlap (0.25)
 *   3. Link type quality (0.15)
 *   4. Relevance score passthrough (0.25)
 *
 * Applies confidence threshold (0.4) — prefer NO image over wrong image.
 * Builds structured text cards for METAR/TAF/regulation content.
 *
 * Pure functions, zero side effects, fully testable.
 */

import type { ImageResult, ChunkSearchResult } from './rag-retrieval';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssetSelectionContext {
  acsArea: string;           // Roman numeral e.g. "I", "III", "XI"
  acsTaskCode: string;       // e.g. "PA.I.A"
  elementCode?: string;      // e.g. "PA.I.A.K1"
  rating: string;            // "private" | "commercial" | "instrument"
  questionText: string;      // Last examiner question for keyword extraction
  difficulty?: string;       // "foundational" | "intermediate" | "advanced"
}

export interface AssetScore {
  image: ImageResult;
  categoryScore: number;     // 0-1
  captionScore: number;      // 0-1
  linkTypeScore: number;     // 0-1
  relevanceScore: number;    // 0-1
  totalScore: number;        // Weighted combination
  explanation: string;       // Human-readable reason
}

export interface TextAsset {
  type: 'metar' | 'taf' | 'regulation' | 'reference';
  title: string;
  content: string;
  source: string;            // doc_abbreviation + page
  confidence: number;
}

export interface SelectedAsset {
  images: AssetScore[];      // 0-3 scored images above threshold
  textCards: TextAsset[];    // 0-2 text cards
  context: AssetSelectionContext | null;
  selectionTimestamp: string;
  totalCandidates: number;
  thresholdApplied: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CONFIDENCE_THRESHOLD = 0.4;
export const MAX_IMAGES = 3;
export const MAX_TEXT_CARDS = 2;

// Weights for the 4 scoring signals
const W_CATEGORY = 0.35;
const W_CAPTION = 0.25;
const W_LINK_TYPE = 0.15;
const W_RELEVANCE = 0.25;

/**
 * Maps ACS area roman numerals to expected image categories.
 * Categories listed first are the strongest matches.
 */
export const AREA_CATEGORY_MAP: Record<string, string[]> = {
  'I':    ['chart', 'diagram', 'table', 'general'],             // Preflight Preparation
  'II':   ['airport', 'sectional', 'diagram'],                  // Preflight Procedures
  'III':  ['airport', 'sectional', 'diagram', 'chart'],         // Airport & Airspace Operations
  'VI':   ['sectional', 'chart', 'diagram'],                    // Navigation
  'VII':  ['diagram', 'chart', 'instrument'],                   // Slow Flight / Stalls
  'VIII': ['performance', 'chart', 'table', 'diagram'],         // Ground Reference / Performance
  'IX':   ['weather', 'chart', 'diagram', 'instrument'],        // Emergency Operations
  'XI':   ['instrument', 'weather', 'chart', 'performance'],    // Instrument Approach Procedures
  'XII':  ['sectional', 'chart', 'diagram', 'weather'],         // Cross-Country (Instrument)
};

/** Default categories for areas not in the map. */
const DEFAULT_CATEGORIES = ['diagram', 'chart', 'general'];

/** Link type → quality score. */
export const LINK_TYPE_SCORES: Record<string, number> = {
  figure_ref:     1.0,
  manual:         0.9,
  caption_match:  0.8,
  same_page:      0.6,
};
const DEFAULT_LINK_TYPE_SCORE = 0.3;

/** Keywords that trigger text card types. */
export const TEXT_CARD_KEYWORDS: Record<string, { pattern: RegExp; type: TextAsset['type']; title: string }> = {
  metar:      { pattern: /\bMETAR\b/i,                    type: 'metar',      title: 'METAR Report' },
  taf:        { pattern: /\bTAF\b/i,                      type: 'taf',        title: 'TAF Forecast' },
  notam:      { pattern: /\bNOTAM\b/i,                    type: 'reference',  title: 'NOTAM Reference' },
  cfr:        { pattern: /\b(?:14\s*CFR|CFR\s*Part)\b/i,  type: 'regulation', title: 'Federal Regulation' },
  far:        { pattern: /\bFAR\b/i,                      type: 'regulation', title: 'Federal Aviation Regulation' },
  ac:         { pattern: /\bAC\s+\d/i,                    type: 'reference',  title: 'Advisory Circular' },
  aim:        { pattern: /\bAIM\b/i,                      type: 'reference',  title: 'AIM Reference' },
};

// ---------------------------------------------------------------------------
// Scoring Functions
// ---------------------------------------------------------------------------

/**
 * Score how well an image category matches the ACS area topic.
 * Returns 1.0 for top match, decaying by position, 0.1 for no match.
 */
export function scoreCategoryAlignment(imageCategory: string, acsArea: string): number {
  const expectedCategories = AREA_CATEGORY_MAP[acsArea] ?? DEFAULT_CATEGORIES;
  const index = expectedCategories.indexOf(imageCategory);
  if (index === -1) return 0.1;
  // First match = 1.0, second = 0.8, third = 0.6, fourth = 0.4
  return Math.max(0.2, 1.0 - index * 0.2);
}

/**
 * Score keyword overlap between question text and image caption/description.
 * Tokenizes both, computes Jaccard-like overlap ratio.
 */
export function scoreCaptionOverlap(
  questionText: string,
  caption: string | null,
  description: string | null
): number {
  const imageText = [caption ?? '', description ?? ''].join(' ');
  if (!imageText.trim() || !questionText.trim()) return 0;

  const questionTokens = tokenize(questionText);
  const imageTokens = tokenize(imageText);

  if (questionTokens.size === 0 || imageTokens.size === 0) return 0;

  let matches = 0;
  for (const token of imageTokens) {
    if (questionTokens.has(token)) matches++;
  }

  // Ratio of image tokens found in question, capped at 1.0
  return Math.min(1.0, matches / Math.min(imageTokens.size, questionTokens.size));
}

/**
 * Score the link type quality.
 */
export function scoreLinkType(linkType: string): number {
  return LINK_TYPE_SCORES[linkType] ?? DEFAULT_LINK_TYPE_SCORE;
}

/**
 * Normalize the raw relevance score to 0-1 range.
 * Assumes relevance_score is already 0-1 from the DB.
 */
export function normalizeRelevance(relevanceScore: number): number {
  return Math.max(0, Math.min(1, relevanceScore));
}

// ---------------------------------------------------------------------------
// Main Selection
// ---------------------------------------------------------------------------

/**
 * Score and select the best assets for a given exam context.
 */
export function selectBestAssets(
  images: ImageResult[],
  chunks: ChunkSearchResult[],
  context: AssetSelectionContext
): SelectedAsset {
  const scored = images.map(img => scoreImage(img, context));

  // Sort descending by total score
  scored.sort((a, b) => b.totalScore - a.totalScore);

  // Apply confidence threshold and limit
  const selected = scored
    .filter(s => s.totalScore >= CONFIDENCE_THRESHOLD)
    .slice(0, MAX_IMAGES);

  const textCards = buildTextCards(chunks, context);

  return {
    images: selected,
    textCards,
    context,
    selectionTimestamp: new Date().toISOString(),
    totalCandidates: images.length,
    thresholdApplied: CONFIDENCE_THRESHOLD,
  };
}

/**
 * Score a single image against the selection context.
 */
export function scoreImage(image: ImageResult, context: AssetSelectionContext): AssetScore {
  const categoryScore = scoreCategoryAlignment(image.image_category, context.acsArea);
  const captionScore = scoreCaptionOverlap(context.questionText, image.caption, image.description);
  const linkTypeScore = scoreLinkType(image.link_type);
  const relevanceScore = normalizeRelevance(image.relevance_score);

  const totalScore =
    categoryScore * W_CATEGORY +
    captionScore * W_CAPTION +
    linkTypeScore * W_LINK_TYPE +
    relevanceScore * W_RELEVANCE;

  const explanationParts: string[] = [];

  const areaCategories = AREA_CATEGORY_MAP[context.acsArea] ?? DEFAULT_CATEGORIES;
  if (areaCategories.includes(image.image_category)) {
    explanationParts.push(`${image.image_category} matches Area ${context.acsArea}`);
  } else {
    explanationParts.push(`${image.image_category} not typical for Area ${context.acsArea}`);
  }

  if (captionScore > 0.3) {
    explanationParts.push(`caption keyword overlap (${(captionScore * 100).toFixed(0)}%)`);
  }

  explanationParts.push(`${image.link_type} link (${(linkTypeScore * 100).toFixed(0)}%)`);
  explanationParts.push(`relevance ${(relevanceScore * 100).toFixed(0)}%`);
  explanationParts.push(`total ${(totalScore * 100).toFixed(0)}%`);

  return {
    image,
    categoryScore,
    captionScore,
    linkTypeScore,
    relevanceScore,
    totalScore,
    explanation: explanationParts.join('; '),
  };
}

// ---------------------------------------------------------------------------
// Text Card Builder
// ---------------------------------------------------------------------------

/**
 * Build structured text cards from RAG chunks when element keywords match.
 */
export function buildTextCards(
  chunks: ChunkSearchResult[],
  context: AssetSelectionContext
): TextAsset[] {
  if (!chunks.length) return [];

  const searchText = [context.questionText, context.elementCode ?? ''].join(' ');
  const cards: TextAsset[] = [];

  for (const [, config] of Object.entries(TEXT_CARD_KEYWORDS)) {
    if (cards.length >= MAX_TEXT_CARDS) break;
    if (!config.pattern.test(searchText)) continue;

    // Find the best matching chunk
    const match = findBestChunkForKeyword(chunks, config.pattern);
    if (!match) continue;

    const snippet = match.content.slice(0, 500);
    const source = [
      match.doc_abbreviation,
      match.page_start ? `p.${match.page_start}` : '',
    ].filter(Boolean).join(' ');

    cards.push({
      type: config.type,
      title: config.title,
      content: snippet,
      source,
      confidence: match.score,
    });
  }

  return cards;
}

/**
 * Find the chunk that best matches a keyword pattern.
 * Prefers chunks where the heading or content contains the keyword.
 */
function findBestChunkForKeyword(
  chunks: ChunkSearchResult[],
  pattern: RegExp
): ChunkSearchResult | null {
  // Prefer heading matches first
  const headingMatch = chunks.find(c => c.heading && pattern.test(c.heading));
  if (headingMatch) return headingMatch;

  // Then content matches, sorted by score
  const contentMatches = chunks
    .filter(c => pattern.test(c.content))
    .sort((a, b) => b.score - a.score);

  return contentMatches[0] ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stop words to exclude from keyword matching. */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor',
  'not', 'so', 'if', 'it', 'its', 'this', 'that', 'what', 'which', 'who',
  'how', 'when', 'where', 'why', 'all', 'each', 'every', 'both', 'few',
  'more', 'most', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
  'too', 'very', 'just', 'about', 'up', 'your', 'you', 'me', 'my',
]);

/**
 * Tokenize text into a set of meaningful lowercase words (3+ chars, no stop words).
 */
function tokenize(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  return new Set(words.filter(w => !STOP_WORDS.has(w)));
}
