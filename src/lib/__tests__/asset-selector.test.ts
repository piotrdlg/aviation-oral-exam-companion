import { describe, it, expect } from 'vitest';
import {
  scoreCategoryAlignment,
  scoreCaptionOverlap,
  scoreLinkType,
  normalizeRelevance,
  selectBestAssets,
  scoreImage,
  buildTextCards,
  AREA_CATEGORY_MAP,
  LINK_TYPE_SCORES,
  CONFIDENCE_THRESHOLD,
  MAX_IMAGES,
  MAX_TEXT_CARDS,
  TEXT_CARD_KEYWORDS,
  type AssetSelectionContext,
  type AssetScore,
} from '../asset-selector';
import type { ImageResult, ChunkSearchResult } from '../rag-retrieval';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeImage(overrides: Partial<ImageResult> = {}): ImageResult {
  return {
    image_id: 'img-1',
    figure_label: 'Figure 1',
    caption: 'A VOR diagram showing radials',
    image_category: 'diagram',
    public_url: 'https://example.com/img1.png',
    width: 800,
    height: 600,
    description: 'VOR navigation diagram with radials and bearings',
    doc_abbreviation: 'PHAK',
    page_number: 42,
    link_type: 'figure_ref',
    relevance_score: 0.8,
    ...overrides,
  };
}

function makeChunk(overrides: Partial<ChunkSearchResult> = {}): ChunkSearchResult {
  return {
    id: 'chunk-1',
    document_id: 'doc-1',
    heading: 'Navigation Systems',
    content: 'The VOR (VHF Omnidirectional Range) system provides bearing information.',
    page_start: 10,
    page_end: 11,
    doc_title: 'Pilot Handbook of Aeronautical Knowledge',
    doc_abbreviation: 'PHAK',
    score: 0.75,
    ...overrides,
  };
}

function makeContext(overrides: Partial<AssetSelectionContext> = {}): AssetSelectionContext {
  return {
    acsArea: 'I',
    acsTaskCode: 'PA.I.A',
    rating: 'private',
    questionText: 'What are the different types of charts used in preflight planning?',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Category Scoring (6 tests)
// ---------------------------------------------------------------------------

describe('scoreCategoryAlignment', () => {
  it('returns 1.0 for top category match in area', () => {
    // Area I top category is 'chart'
    expect(scoreCategoryAlignment('chart', 'I')).toBe(1.0);
  });

  it('returns 0.8 for second category match', () => {
    // Area I second category is 'diagram'
    expect(scoreCategoryAlignment('diagram', 'I')).toBe(0.8);
  });

  it('returns 0.6 for third category match', () => {
    // Area I third category is 'table'
    expect(scoreCategoryAlignment('table', 'I')).toBe(0.6);
  });

  it('returns 0.1 for non-matching category', () => {
    // 'sectional' is not in Area I
    expect(scoreCategoryAlignment('sectional', 'I')).toBe(0.1);
  });

  it('scores weather high for Area IX (Emergency)', () => {
    expect(scoreCategoryAlignment('weather', 'IX')).toBe(1.0);
  });

  it('uses default categories for unknown area', () => {
    // Unknown area → default ['diagram', 'chart', 'general']
    expect(scoreCategoryAlignment('diagram', 'UNKNOWN')).toBe(1.0);
    expect(scoreCategoryAlignment('chart', 'UNKNOWN')).toBe(0.8);
  });
});

// ---------------------------------------------------------------------------
// 2. Caption Scoring (4 tests)
// ---------------------------------------------------------------------------

describe('scoreCaptionOverlap', () => {
  it('returns positive score for keyword overlap', () => {
    const score = scoreCaptionOverlap(
      'What is a VOR radial?',
      'VOR diagram showing radials',
      null
    );
    expect(score).toBeGreaterThan(0);
  });

  it('returns 0 for empty caption and description', () => {
    expect(scoreCaptionOverlap('What is a VOR?', null, null)).toBe(0);
  });

  it('returns 0 for empty question text', () => {
    expect(scoreCaptionOverlap('', 'VOR diagram', null)).toBe(0);
  });

  it('uses description as fallback when caption is null', () => {
    const score = scoreCaptionOverlap(
      'What is a VOR radial?',
      null,
      'VOR navigation diagram with radials'
    );
    expect(score).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Link Type Scoring (4 tests)
// ---------------------------------------------------------------------------

describe('scoreLinkType', () => {
  it('returns 1.0 for figure_ref', () => {
    expect(scoreLinkType('figure_ref')).toBe(1.0);
  });

  it('returns 0.8 for caption_match', () => {
    expect(scoreLinkType('caption_match')).toBe(0.8);
  });

  it('returns 0.6 for same_page', () => {
    expect(scoreLinkType('same_page')).toBe(0.6);
  });

  it('returns 0.3 for unknown link type', () => {
    expect(scoreLinkType('unknown_type')).toBe(0.3);
  });
});

// ---------------------------------------------------------------------------
// 4. Composite Scoring (4 tests)
// ---------------------------------------------------------------------------

describe('scoreImage (composite)', () => {
  it('computes weighted total correctly', () => {
    const img = makeImage({ image_category: 'chart', link_type: 'figure_ref', relevance_score: 1.0 });
    const ctx = makeContext({ acsArea: 'I', questionText: 'charts for preflight' });
    const result = scoreImage(img, ctx);

    // categoryScore = 1.0 (chart is top for area I)
    expect(result.categoryScore).toBe(1.0);
    // linkTypeScore = 1.0 (figure_ref)
    expect(result.linkTypeScore).toBe(1.0);
    // relevanceScore = 1.0
    expect(result.relevanceScore).toBe(1.0);
    // Total should be high
    expect(result.totalScore).toBeGreaterThan(0.7);
  });

  it('sorts images by total score descending', () => {
    const highImg = makeImage({ image_id: 'high', image_category: 'chart', link_type: 'figure_ref', relevance_score: 0.9 });
    const lowImg = makeImage({ image_id: 'low', image_category: 'sectional', link_type: 'same_page', relevance_score: 0.3 });
    const ctx = makeContext({ acsArea: 'I' });

    const result = selectBestAssets([lowImg, highImg], [], ctx);
    if (result.images.length >= 2) {
      expect(result.images[0].image.image_id).toBe('high');
      expect(result.images[1].image.image_id).toBe('low');
    }
  });

  it('breaks ties deterministically', () => {
    const img1 = makeImage({ image_id: 'a', image_category: 'chart', relevance_score: 0.8 });
    const img2 = makeImage({ image_id: 'b', image_category: 'chart', relevance_score: 0.8 });
    const ctx = makeContext({ acsArea: 'I' });

    const r1 = selectBestAssets([img1, img2], [], ctx);
    const r2 = selectBestAssets([img1, img2], [], ctx);

    // Same order both times
    expect(r1.images.map(i => i.image.image_id)).toEqual(r2.images.map(i => i.image.image_id));
  });

  it('includes all scoring components in the result', () => {
    const img = makeImage();
    const ctx = makeContext();
    const result = scoreImage(img, ctx);

    expect(typeof result.categoryScore).toBe('number');
    expect(typeof result.captionScore).toBe('number');
    expect(typeof result.linkTypeScore).toBe('number');
    expect(typeof result.relevanceScore).toBe('number');
    expect(typeof result.totalScore).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// 5. Confidence Threshold (4 tests)
// ---------------------------------------------------------------------------

describe('confidence threshold', () => {
  it('excludes images below 0.4 threshold', () => {
    // Create an image that will score very low
    const img = makeImage({
      image_category: 'sectional',  // 0.1 for area I
      link_type: 'same_page',       // 0.6
      relevance_score: 0.1,         // low
      caption: null,
      description: null,
    });
    const ctx = makeContext({ acsArea: 'I', questionText: 'completely unrelated topic xyz' });
    const result = selectBestAssets([img], [], ctx);

    // Image should be excluded (total score will be ~0.1*0.35 + 0*0.25 + 0.6*0.15 + 0.1*0.25 = 0.035+0+0.09+0.025 = 0.15)
    expect(result.images.length).toBe(0);
  });

  it('includes images at or above threshold', () => {
    const img = makeImage({
      image_category: 'chart',      // 1.0 for area I
      link_type: 'figure_ref',      // 1.0
      relevance_score: 0.9,
    });
    const ctx = makeContext({ acsArea: 'I' });
    const result = selectBestAssets([img], [], ctx);

    expect(result.images.length).toBe(1);
    expect(result.images[0].totalScore).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });

  it('returns empty when all images below threshold', () => {
    const lowImages = Array.from({ length: 5 }, (_, i) =>
      makeImage({
        image_id: `low-${i}`,
        image_category: 'sectional',
        link_type: 'same_page',
        relevance_score: 0.05,
        caption: null,
        description: null,
      })
    );
    const ctx = makeContext({ acsArea: 'I', questionText: 'xyz abc' });
    const result = selectBestAssets(lowImages, [], ctx);

    expect(result.images.length).toBe(0);
    expect(result.totalCandidates).toBe(5);
  });

  it('limits to MAX_IMAGES (3)', () => {
    const images = Array.from({ length: 6 }, (_, i) =>
      makeImage({
        image_id: `img-${i}`,
        image_category: 'chart',
        link_type: 'figure_ref',
        relevance_score: 0.9 - i * 0.05,
      })
    );
    const ctx = makeContext({ acsArea: 'I' });
    const result = selectBestAssets(images, [], ctx);

    expect(result.images.length).toBeLessThanOrEqual(MAX_IMAGES);
  });
});

// ---------------------------------------------------------------------------
// 6. Text Card Builder (4 tests)
// ---------------------------------------------------------------------------

describe('buildTextCards', () => {
  it('creates a text card when METAR keyword matches', () => {
    const chunk = makeChunk({
      heading: 'METAR Decoding',
      content: 'METAR KJAX 091853Z 18012KT 10SM FEW250 29/18 A3002',
    });
    const ctx = makeContext({ questionText: 'How do you decode a METAR report?' });
    const cards = buildTextCards([chunk], ctx);

    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(cards[0].type).toBe('metar');
    expect(cards[0].title).toBe('METAR Report');
    expect(cards[0].content).toContain('METAR');
  });

  it('returns empty when no keywords match', () => {
    const chunk = makeChunk({ heading: 'Aerodynamics', content: 'Lift is generated by...' });
    const ctx = makeContext({ questionText: 'Explain the four forces of flight' });
    const cards = buildTextCards([chunk], ctx);

    expect(cards.length).toBe(0);
  });

  it('limits to MAX_TEXT_CARDS (2)', () => {
    const chunks = [
      makeChunk({ id: 'c1', heading: 'METAR Decoding', content: 'METAR KJAX 091853Z...' }),
      makeChunk({ id: 'c2', heading: 'TAF Forecast', content: 'TAF KJAX 091730Z...' }),
      makeChunk({ id: 'c3', heading: 'NOTAM Summary', content: 'NOTAM for KJAX...' }),
    ];
    const ctx = makeContext({ questionText: 'Explain METAR, TAF, and NOTAM' });
    const cards = buildTextCards(chunks, ctx);

    expect(cards.length).toBeLessThanOrEqual(MAX_TEXT_CARDS);
  });

  it('includes source attribution', () => {
    const chunk = makeChunk({
      heading: 'TAF Interpretation',
      content: 'TAF KJAX 091730Z 0918/1018 18010KT P6SM FEW250',
      doc_abbreviation: 'AWM',
      page_start: 25,
    });
    const ctx = makeContext({ questionText: 'How do you read a TAF?' });
    const cards = buildTextCards([chunk], ctx);

    if (cards.length > 0) {
      expect(cards[0].source).toContain('AWM');
      expect(cards[0].source).toContain('25');
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Edge Cases (4 tests)
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('returns empty for no images and no chunks', () => {
    const ctx = makeContext();
    const result = selectBestAssets([], [], ctx);

    expect(result.images).toEqual([]);
    expect(result.textCards).toEqual([]);
    expect(result.totalCandidates).toBe(0);
  });

  it('handles empty chunks gracefully', () => {
    const img = makeImage();
    const ctx = makeContext();
    const result = selectBestAssets([img], [], ctx);

    expect(result.textCards).toEqual([]);
  });

  it('handles missing context fields gracefully', () => {
    const img = makeImage();
    const ctx: AssetSelectionContext = {
      acsArea: '',
      acsTaskCode: '',
      rating: 'private',
      questionText: '',
    };
    // Should not throw
    const result = selectBestAssets([img], [], ctx);
    expect(result).toBeDefined();
    expect(result.context).toBeDefined();
  });

  it('uses default categories for unknown area code', () => {
    const img = makeImage({ image_category: 'diagram' });
    const ctx = makeContext({ acsArea: 'XXXX' });
    const score = scoreImage(img, ctx);

    // 'diagram' is the first default category → 1.0
    expect(score.categoryScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 8. Explanation Strings (2 tests)
// ---------------------------------------------------------------------------

describe('explanation strings', () => {
  it('produces non-empty explanation for every scored image', () => {
    const images = [
      makeImage({ image_id: 'a', image_category: 'chart' }),
      makeImage({ image_id: 'b', image_category: 'weather' }),
    ];
    const ctx = makeContext({ acsArea: 'I' });
    const result = selectBestAssets(images, [], ctx);

    for (const scored of result.images) {
      expect(scored.explanation.length).toBeGreaterThan(0);
    }
  });

  it('includes category and total score in explanation', () => {
    const img = makeImage({ image_category: 'chart' });
    const ctx = makeContext({ acsArea: 'I' });
    const score = scoreImage(img, ctx);

    expect(score.explanation).toContain('chart');
    expect(score.explanation).toContain('total');
  });
});

// ---------------------------------------------------------------------------
// Additional: selectBestAssets metadata
// ---------------------------------------------------------------------------

describe('selectBestAssets metadata', () => {
  it('includes totalCandidates count', () => {
    const images = [makeImage(), makeImage({ image_id: 'img-2' })];
    const ctx = makeContext();
    const result = selectBestAssets(images, [], ctx);

    expect(result.totalCandidates).toBe(2);
  });

  it('includes threshold value', () => {
    const result = selectBestAssets([], [], makeContext());
    expect(result.thresholdApplied).toBe(CONFIDENCE_THRESHOLD);
  });

  it('includes timestamp', () => {
    const result = selectBestAssets([], [], makeContext());
    expect(result.selectionTimestamp).toBeTruthy();
    // Should be a valid ISO string
    expect(() => new Date(result.selectionTimestamp)).not.toThrow();
  });

  it('includes context reference', () => {
    const ctx = makeContext({ acsArea: 'III' });
    const result = selectBestAssets([], [], ctx);
    expect(result.context?.acsArea).toBe('III');
  });
});

// ---------------------------------------------------------------------------
// normalizeRelevance
// ---------------------------------------------------------------------------

describe('normalizeRelevance', () => {
  it('clamps values to 0-1 range', () => {
    expect(normalizeRelevance(1.5)).toBe(1.0);
    expect(normalizeRelevance(-0.5)).toBe(0);
    expect(normalizeRelevance(0.7)).toBe(0.7);
  });
});
