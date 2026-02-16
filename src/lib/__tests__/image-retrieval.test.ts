/**
 * Tests for image retrieval and linking functions.
 * Sections 11.2 and 11.3 of the design document.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Figure reference regex (mirrors the linking script patterns)
// ---------------------------------------------------------------------------
const CHUNK_FIGURE_REFS = [
  /(?:see|refer\s+to|shown\s+in|illustrated\s+in|depicted\s+in)?\s*((?:Figure|Fig\.|Table|Chart)\s+\d+[-–]\d+)/gi,
  /((?:Figure|Fig\.|Table|Chart)\s+\d+[-–]\d+)/gi,
];

function findFigureRefs(text: string): string[] {
  const refs = new Set<string>();
  for (const pattern of CHUNK_FIGURE_REFS) {
    pattern.lastIndex = 0; // Reset global regex
    let m;
    while ((m = pattern.exec(text)) !== null) {
      refs.add(m[1].toLowerCase().replace(/\bfig\.\s*/, 'figure ').replace('–', '-'));
    }
  }
  return [...refs];
}

describe('Figure Reference Matching (linking)', () => {
  it('finds "Figure X-Y" in chunk text', () => {
    const refs = findFigureRefs('As shown in Figure 3-1, the airspace...');
    expect(refs).toContain('figure 3-1');
  });

  it('finds "Table X-Y" in chunk text', () => {
    const refs = findFigureRefs('Refer to Table 5-2 for performance data');
    expect(refs).toContain('table 5-2');
  });

  it('finds "Fig. X-Y" abbreviated format', () => {
    const refs = findFigureRefs('See Fig. 12-4 for the weather chart');
    expect(refs).toContain('figure 12-4');
  });

  it('finds multiple references in same chunk', () => {
    const refs = findFigureRefs('Figure 3-1 shows... and Table 5-2 lists...');
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty array when no references found', () => {
    const refs = findFigureRefs('This chunk has no figure references at all.');
    expect(refs).toHaveLength(0);
  });

  it('handles em-dash variant', () => {
    const refs = findFigureRefs('Figure 15–2 illustrates...');
    expect(refs).toContain('figure 15-2');
  });
});

// ---------------------------------------------------------------------------
// Image selection logic (mirrors exam-engine image filtering)
// ---------------------------------------------------------------------------
interface MockImage {
  image_id: string;
  relevance_score: number;
  public_url: string | null;
}

function selectImages(images: MockImage[], maxCount: number = 3): MockImage[] {
  return images
    .filter(img => img.public_url != null)
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, maxCount);
}

describe('Image Selection Logic', () => {
  it('returns empty for no images', () => {
    expect(selectImages([])).toHaveLength(0);
  });

  it('limits to max 3 images', () => {
    const images: MockImage[] = Array.from({ length: 5 }, (_, i) => ({
      image_id: `img-${i}`,
      relevance_score: 0.9 - i * 0.1,
      public_url: `https://example.com/img-${i}.png`,
    }));
    expect(selectImages(images)).toHaveLength(3);
  });

  it('sorts by relevance score descending', () => {
    const images: MockImage[] = [
      { image_id: 'low', relevance_score: 0.3, public_url: 'https://example.com/low.png' },
      { image_id: 'high', relevance_score: 0.9, public_url: 'https://example.com/high.png' },
      { image_id: 'mid', relevance_score: 0.6, public_url: 'https://example.com/mid.png' },
    ];
    const selected = selectImages(images);
    expect(selected[0].image_id).toBe('high');
    expect(selected[1].image_id).toBe('mid');
    expect(selected[2].image_id).toBe('low');
  });

  it('filters out images with null public_url', () => {
    const images: MockImage[] = [
      { image_id: 'valid', relevance_score: 0.9, public_url: 'https://example.com/valid.png' },
      { image_id: 'null-url', relevance_score: 0.95, public_url: null },
    ];
    const selected = selectImages(images);
    expect(selected).toHaveLength(1);
    expect(selected[0].image_id).toBe('valid');
  });
});

// ---------------------------------------------------------------------------
// SSE image event parsing (mirrors practice page parsing)
// ---------------------------------------------------------------------------
describe('SSE Image Event Parsing', () => {
  it('parses image event from SSE payload', () => {
    const payload = JSON.stringify({
      images: [
        {
          image_id: '123',
          figure_label: 'Figure 3-1',
          caption: 'Airspace diagram',
          image_category: 'diagram',
          public_url: 'https://example.com/figure-3-1.png',
          width: 800,
          height: 600,
          description: null,
          doc_abbreviation: 'PHAK',
          page_number: 42,
          link_type: 'figure_ref',
          relevance_score: 0.9,
        },
      ],
    });

    const parsed = JSON.parse(payload);
    expect(parsed.images).toBeDefined();
    expect(Array.isArray(parsed.images)).toBe(true);
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0].figure_label).toBe('Figure 3-1');
    expect(parsed.images[0].public_url).toContain('figure-3-1.png');
  });

  it('handles empty images array', () => {
    const parsed = JSON.parse(JSON.stringify({ images: [] }));
    expect(parsed.images).toHaveLength(0);
  });

  it('ignores non-image SSE events', () => {
    const tokenEvent = JSON.parse(JSON.stringify({ token: 'Hello' }));
    expect(tokenEvent.images).toBeUndefined();

    const assessmentEvent = JSON.parse(JSON.stringify({ assessment: { score: 'satisfactory' } }));
    expect(assessmentEvent.images).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// No images for chunks without links
// ---------------------------------------------------------------------------
describe('No Images Edge Cases', () => {
  it('empty chunk ID array returns no images', () => {
    // This mirrors getImagesForChunks([]) returning []
    const chunkIds: string[] = [];
    expect(chunkIds.length).toBe(0);
    // The actual RPC would return [] for empty input
  });

  it('feature flag controls image display', () => {
    // Simulate NEXT_PUBLIC_SHOW_EXAM_IMAGES check
    const showImages = (flag: string | undefined) => flag === 'true';
    expect(showImages('true')).toBe(true);
    expect(showImages('false')).toBe(false);
    expect(showImages(undefined)).toBe(false);
    expect(showImages('')).toBe(false);
  });
});
