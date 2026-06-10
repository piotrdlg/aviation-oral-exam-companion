import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));
vi.mock('../rag-retrieval', () => ({
  searchChunks: vi.fn(async () => []),
  formatChunksForPrompt: vi.fn(() => ''),
  getImagesForChunks: vi.fn(async () => []),
}));
vi.mock('../rag-search-with-fallback', () => ({
  searchWithFallback: vi.fn(async () => []),
  inferRagFilters: vi.fn(() => null),
}));
vi.mock('../posthog-server', () => ({ captureServerEvent: vi.fn() }));
vi.mock('../asset-selector', () => ({ selectBestAssets: vi.fn(async () => []) }));

import { buildCachedSystem } from '../exam-engine';

describe('buildCachedSystem (W5.2 prompt caching)', () => {
  it('marks the session-static block with an ephemeral cache breakpoint', () => {
    const blocks = buildCachedSystem('STATIC PREFIX', 'DYNAMIC TAIL');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      type: 'text',
      text: 'STATIC PREFIX',
      cache_control: { type: 'ephemeral' },
    });
    // the dynamic block must NOT carry cache_control — anything after the
    // marker is intentionally uncached (per-exchange RAG/transitions)
    expect(blocks[1]).toEqual({ type: 'text', text: 'DYNAMIC TAIL' });
  });

  it('omits the dynamic block when empty (single cached block)', () => {
    const blocks = buildCachedSystem('STATIC ONLY', '');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('keeps the static block FIRST — prefix caching depends on order', () => {
    const blocks = buildCachedSystem('A', 'B');
    expect(blocks[0].text).toBe('A');
    expect(blocks[0].cache_control).toBeDefined();
    expect(blocks[1].cache_control).toBeUndefined();
  });
});
