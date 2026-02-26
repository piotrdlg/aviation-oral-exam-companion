import { describe, it, expect } from 'vitest';
import { flattenPageParagraphs, chunkText, extractHeading } from '../chunk-utils';

describe('flattenPageParagraphs', () => {
  it('splits pages into paragraphs with page numbers', () => {
    const pages = [
      { pageNumber: 1, text: 'First para.\n\nSecond para.' },
      { pageNumber: 2, text: 'Third para.' },
    ];
    const result = flattenPageParagraphs(pages);
    expect(result).toEqual([
      { text: 'First para.', pageNumber: 1 },
      { text: 'Second para.', pageNumber: 1 },
      { text: 'Third para.', pageNumber: 2 },
    ]);
  });

  it('skips empty paragraphs and whitespace-only content', () => {
    const pages = [
      { pageNumber: 1, text: '  \n\n\n\nActual content.\n\n  ' },
    ];
    const result = flattenPageParagraphs(pages);
    expect(result).toEqual([
      { text: 'Actual content.', pageNumber: 1 },
    ]);
  });

  it('handles triple+ newlines as a single split', () => {
    const pages = [
      { pageNumber: 3, text: 'A\n\n\n\nB' },
    ];
    const result = flattenPageParagraphs(pages);
    expect(result).toEqual([
      { text: 'A', pageNumber: 3 },
      { text: 'B', pageNumber: 3 },
    ]);
  });

  it('returns empty array for empty pages', () => {
    expect(flattenPageParagraphs([])).toEqual([]);
    expect(flattenPageParagraphs([{ pageNumber: 1, text: '  ' }])).toEqual([]);
  });
});

describe('extractHeading', () => {
  it('detects uppercase headings', () => {
    expect(extractHeading('CHAPTER ONE\nSome body text here')).toBe('CHAPTER ONE');
  });

  it('detects "Chapter" prefix headings', () => {
    expect(extractHeading('Chapter 5: Navigation\nBody')).toBe('Chapter 5: Navigation');
  });

  it('detects numbered headings', () => {
    expect(extractHeading('4.2 Weather Briefing\nDetails...')).toBe('4.2 Weather Briefing');
  });

  it('returns null for long first lines', () => {
    const longLine = 'A'.repeat(101);
    expect(extractHeading(longLine)).toBeNull();
  });

  it('returns null for normal paragraph text', () => {
    expect(extractHeading('The pilot should always check weather before departure.')).toBeNull();
  });
});

describe('chunkText', () => {
  // Helper: create paragraph with specific char length (≈ token count * 4)
  function makePara(pageNumber: number, tokens: number, label?: string): { text: string; pageNumber: number } {
    const chars = tokens * 4;
    const text = (label ?? `p${pageNumber}`) + 'x'.repeat(Math.max(0, chars - (label ?? `p${pageNumber}`).length));
    return { text, pageNumber };
  }

  it('produces a single chunk when total tokens < maxTokens', () => {
    const paras = [
      makePara(1, 200),
      makePara(1, 200),
    ];
    const chunks = chunkText(paras, 800, 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].page_start).toBe(1);
    expect(chunks[0].page_end).toBe(1);
    expect(chunks[0].index).toBe(0);
  });

  it('splits into multiple chunks when exceeding maxTokens', () => {
    const paras = [
      makePara(1, 500),
      makePara(2, 500),
    ];
    const chunks = chunkText(paras, 800, 0);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].page_start).toBe(1);
    expect(chunks[0].page_end).toBe(1);
    expect(chunks[1].page_start).toBe(1);
    expect(chunks[1].page_end).toBe(2);
  });

  it('tracks page ranges across multiple pages correctly', () => {
    const paras = [
      makePara(1, 100),
      makePara(2, 100),
      makePara(3, 100),
      makePara(4, 100),
      makePara(5, 100),
    ];
    // Total ~500 tokens, fits in one chunk (maxTokens=800)
    const chunks = chunkText(paras, 800, 0);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].page_start).toBe(1);
    expect(chunks[0].page_end).toBe(5);
  });

  it('never produces null page_start or page_end', () => {
    const paras = [
      makePara(1, 300),
      makePara(2, 300),
      makePara(3, 300),
      makePara(4, 300),
    ];
    const chunks = chunkText(paras, 500, 50);
    for (const chunk of chunks) {
      expect(chunk.page_start).not.toBeNull();
      expect(chunk.page_end).not.toBeNull();
      expect(chunk.page_start).toBeGreaterThan(0);
      expect(chunk.page_end).toBeGreaterThanOrEqual(chunk.page_start!);
    }
  });

  it('handles single paragraph that is short', () => {
    // Less than 50 chars after trim → skipped (min chunk threshold)
    const paras = [{ text: 'tiny', pageNumber: 5 }];
    const chunks = chunkText(paras, 800, 0);
    expect(chunks).toHaveLength(0);
  });

  it('produces chunks with sequential indices', () => {
    const paras = [
      makePara(1, 400),
      makePara(2, 400),
      makePara(3, 400),
    ];
    const chunks = chunkText(paras, 500, 0);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
    }
  });

  it('content does not contain leading/trailing whitespace', () => {
    const paras = [
      makePara(1, 300),
      makePara(2, 300),
    ];
    const chunks = chunkText(paras, 800, 0);
    for (const chunk of chunks) {
      expect(chunk.content).toBe(chunk.content.trim());
    }
  });

  it('assigns page_end = page_start for single-page chunks', () => {
    const paras = [
      makePara(7, 200),
    ];
    // Make text long enough to pass the 50 char threshold
    paras[0].text = 'x'.repeat(200);
    const chunks = chunkText(paras, 800, 0);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].page_start).toBe(7);
    expect(chunks[0].page_end).toBe(7);
  });
});
