/**
 * chunk-utils.ts — Pure text chunking functions for the ingestion pipeline.
 *
 * Extracted from ingest-sources.ts for testability.
 */

export interface TextChunk {
  index: number;
  heading: string | null;
  content: string;
  page_start: number | null;
  page_end: number | null;
}

/**
 * Flatten pages into an array of { text, pageNumber } paragraphs.
 * Splits each page's text by double-newlines so chunkText can track
 * which page each paragraph belongs to.
 */
export function flattenPageParagraphs(pages: Array<{ pageNumber: number; text: string }>): Array<{ text: string; pageNumber: number }> {
  const result: Array<{ text: string; pageNumber: number }> = [];
  for (const page of pages) {
    const paragraphs = page.text.split(/\n{2,}/);
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (trimmed) {
        result.push({ text: trimmed, pageNumber: page.pageNumber });
      }
    }
  }
  return result;
}

export function extractHeading(text: string): string | null {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return null;

  const firstLine = lines[0].trim();
  if (firstLine.length < 100 && (
    /^(chapter|section|part|\d+\.)/i.test(firstLine) ||
    firstLine === firstLine.toUpperCase()
  )) {
    return firstLine;
  }
  return null;
}

/**
 * Chunk page paragraphs into ~500-1000 token segments with page tracking.
 *
 * Tracks page_start/page_end per chunk by recording which pages contributed
 * paragraphs, matching the proven approach from ingest_text.py.
 */
export function chunkText(
  paragraphs: Array<{ text: string; pageNumber: number }>,
  maxTokens: number = 800,
  overlap: number = 100,
): TextChunk[] {
  const chunks: TextChunk[] = [];

  let currentChunk = '';
  let chunkIndex = 0;
  let chunkPageStart: number | null = null;
  let chunkPageEnd: number | null = null;

  for (const para of paragraphs) {
    const currentTokens = currentChunk.length / 4;
    const paraTokens = para.text.length / 4;

    if (currentTokens + paraTokens > maxTokens && currentChunk.length > 0) {
      chunks.push({
        index: chunkIndex,
        heading: extractHeading(currentChunk),
        content: currentChunk.trim(),
        page_start: chunkPageStart,
        page_end: chunkPageEnd ?? chunkPageStart,
      });
      chunkIndex++;

      const overlapChars = overlap * 4;
      const overlapText = currentChunk.slice(-overlapChars);
      currentChunk = overlapText + '\n\n' + para.text;
      chunkPageStart = chunkPageEnd ?? para.pageNumber;
      chunkPageEnd = para.pageNumber;
    } else {
      if (currentChunk.length === 0) {
        chunkPageStart = para.pageNumber;
      }
      currentChunk += (currentChunk ? '\n\n' : '') + para.text;
      chunkPageEnd = para.pageNumber;
    }
  }

  if (currentChunk.trim().length > 50) {
    chunks.push({
      index: chunkIndex,
      heading: extractHeading(currentChunk),
      content: currentChunk.trim(),
      page_start: chunkPageStart,
      page_end: chunkPageEnd ?? chunkPageStart,
    });
  }

  return chunks;
}
