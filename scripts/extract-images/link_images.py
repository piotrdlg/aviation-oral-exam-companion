#!/usr/bin/env python3
"""
Figure-to-Chunk Linking Pipeline.

Creates chunk_image_links by matching images to text chunks using three strategies:
1. Figure reference matching (highest precision, ~95%)
2. Caption content overlap (high precision, ~80%)
3. Same-page proximity (medium precision, ~60%)

Usage:
    python link_images.py
    python link_images.py --strategy figure_ref
    python link_images.py --strategy all --dry-run
"""

import argparse
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root
load_dotenv(Path(__file__).resolve().parents[2] / '.env.local')
load_dotenv(Path(__file__).resolve().parents[2] / '.env')


# ---------------------------------------------------------------------------
# Figure reference patterns (matching what appears in chunk text)
# ---------------------------------------------------------------------------
CHUNK_FIGURE_REFS = [
    re.compile(
        r'(?:see|refer\s+to|shown\s+in|illustrated\s+in|depicted\s+in|as\s+in|per)?\s*'
        r'((?:Figure|Fig\.|Table|Chart)\s+\d+[-–]\d+)',
        re.IGNORECASE,
    ),
    re.compile(
        r'((?:Figure|Fig\.|Table|Chart)\s+\d+[-–]\d+)',
        re.IGNORECASE,
    ),
]

# Normalize figure labels for matching: "Figure 3-1" → "figure 3-1", "Fig. 3-1" → "figure 3-1"
def normalize_label(label: str) -> str:
    """Normalize figure label for matching."""
    label = label.lower().strip()
    label = re.sub(r'\bfig\.\s*', 'figure ', label)
    label = label.replace('–', '-')  # em-dash to hyphen
    return label


def get_supabase_client():
    """Create Supabase client with service role key."""
    from supabase import create_client
    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        print("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
        sys.exit(1)
    return create_client(url, key)


# ---------------------------------------------------------------------------
# Strategy 1: Figure Reference Matching
# ---------------------------------------------------------------------------
def link_by_figure_reference(supabase, dry_run: bool = False) -> int:
    """
    Scan chunk text for figure references and link to matching images.
    Sets link_type='figure_ref', relevance_score=0.9.
    """
    print("\n=== Strategy 1: Figure Reference Matching ===")

    # Fetch all images with figure labels
    images_resp = supabase.table('source_images') \
        .select('id, figure_label, document_id') \
        .filter('figure_label', 'not.is', 'null') \
        .eq('is_oral_exam_relevant', True) \
        .execute()

    if not images_resp.data:
        print("No images with figure labels found")
        return 0

    # Build lookup: normalized_label -> image rows (may have multiple docs)
    label_to_images: dict[str, list[dict]] = {}
    for img in images_resp.data:
        norm = normalize_label(img['figure_label'])
        label_to_images.setdefault(norm, []).append(img)

    print(f"Images with labels: {len(images_resp.data)} ({len(label_to_images)} unique labels)")

    # Fetch all chunks
    chunks_resp = supabase.table('source_chunks') \
        .select('id, content, document_id') \
        .execute()

    if not chunks_resp.data:
        print("No chunks found")
        return 0

    print(f"Chunks to scan: {len(chunks_resp.data)}")

    links_created = 0
    for chunk in chunks_resp.data:
        content = chunk['content']

        # Find all figure references in chunk text
        refs_found: set[str] = set()
        for pattern in CHUNK_FIGURE_REFS:
            for m in pattern.finditer(content):
                refs_found.add(normalize_label(m.group(1)))

        for ref in refs_found:
            if ref not in label_to_images:
                continue

            # Prefer same-document image, fall back to any match
            images = label_to_images[ref]
            best = next(
                (img for img in images if img['document_id'] == chunk['document_id']),
                images[0],
            )

            if dry_run:
                print(f"  [DRY RUN] chunk {chunk['id'][:8]} -> image {best['id'][:8]} ({ref})")
                links_created += 1
                continue

            try:
                supabase.table('chunk_image_links').upsert({
                    'chunk_id': chunk['id'],
                    'image_id': best['id'],
                    'link_type': 'figure_ref',
                    'relevance_score': 0.9,
                }, on_conflict='chunk_id,image_id').execute()
                links_created += 1
            except Exception as e:
                print(f"  LINK ERROR: {e}")

    print(f"Figure reference links: {links_created}")
    return links_created


# ---------------------------------------------------------------------------
# Strategy 2: Caption Content Overlap
# ---------------------------------------------------------------------------
def link_by_caption_overlap(supabase, dry_run: bool = False) -> int:
    """
    Match image captions to chunk text using keyword overlap.
    Sets link_type='caption_match', relevance_score based on overlap.
    """
    print("\n=== Strategy 2: Caption Content Overlap ===")

    # Fetch images with captions
    images_resp = supabase.table('source_images') \
        .select('id, caption, document_id') \
        .filter('caption', 'not.is', 'null') \
        .eq('is_oral_exam_relevant', True) \
        .execute()

    if not images_resp.data:
        print("No images with captions found")
        return 0

    print(f"Images with captions: {len(images_resp.data)}")

    # Fetch chunks from same documents
    doc_ids = list(set(img['document_id'] for img in images_resp.data))
    chunks_resp = supabase.table('source_chunks') \
        .select('id, content, document_id') \
        .in_('document_id', doc_ids) \
        .execute()

    if not chunks_resp.data:
        print("No chunks for these documents")
        return 0

    print(f"Chunks from image documents: {len(chunks_resp.data)}")

    def keyword_overlap(caption: str, content: str) -> float:
        """Compute word-level overlap between caption and content."""
        cap_words = set(re.findall(r'\b\w{4,}\b', caption.lower()))
        if not cap_words:
            return 0.0
        content_lower = content.lower()
        matches = sum(1 for w in cap_words if w in content_lower)
        return matches / len(cap_words)

    links_created = 0
    for img in images_resp.data:
        caption = img['caption']
        if not caption or len(caption) < 10:
            continue

        # Only check chunks from same document
        doc_chunks = [c for c in chunks_resp.data if c['document_id'] == img['document_id']]

        for chunk in doc_chunks:
            overlap = keyword_overlap(caption, chunk['content'])
            if overlap < 0.3:
                continue

            if dry_run:
                print(f"  [DRY RUN] chunk {chunk['id'][:8]} -> image {img['id'][:8]} (overlap={overlap:.2f})")
                links_created += 1
                continue

            try:
                # Upsert: keep highest relevance_score and its link_type
                supabase.rpc('upsert_chunk_image_link', {
                    'p_chunk_id': chunk['id'],
                    'p_image_id': img['id'],
                    'p_link_type': 'caption_match',
                    'p_relevance_score': round(overlap, 3),
                }).execute()
                links_created += 1
            except Exception:
                # Fallback: direct upsert
                try:
                    supabase.table('chunk_image_links').upsert({
                        'chunk_id': chunk['id'],
                        'image_id': img['id'],
                        'link_type': 'caption_match',
                        'relevance_score': round(overlap, 3),
                    }, on_conflict='chunk_id,image_id').execute()
                    links_created += 1
                except Exception as e:
                    print(f"  LINK ERROR: {e}")

    print(f"Caption overlap links: {links_created}")
    return links_created


# ---------------------------------------------------------------------------
# Strategy 3: Same-Page Proximity
# ---------------------------------------------------------------------------
def link_by_page_proximity(supabase, dry_run: bool = False) -> int:
    """
    Link images to chunks on the same page.
    Requires page_start/page_end in source_chunks (from backfill).
    Sets link_type='same_page', relevance_score=0.5.
    """
    print("\n=== Strategy 3: Same-Page Proximity ===")

    # Fetch images
    images_resp = supabase.table('source_images') \
        .select('id, document_id, page_number') \
        .eq('is_oral_exam_relevant', True) \
        .execute()

    if not images_resp.data:
        print("No relevant images found")
        return 0

    print(f"Relevant images: {len(images_resp.data)}")

    # Group images by document
    doc_images: dict[str, list[dict]] = {}
    for img in images_resp.data:
        doc_images.setdefault(img['document_id'], []).append(img)

    # Fetch chunks with page numbers
    chunks_resp = supabase.table('source_chunks') \
        .select('id, document_id, page_start, page_end') \
        .filter('page_start', 'not.is', 'null') \
        .in_('document_id', list(doc_images.keys())) \
        .execute()

    if not chunks_resp.data:
        print("No chunks with page numbers found (run page backfill first)")
        return 0

    print(f"Chunks with page numbers: {len(chunks_resp.data)}")

    links_created = 0
    for chunk in chunks_resp.data:
        doc_id = chunk['document_id']
        if doc_id not in doc_images:
            continue

        page_start = chunk['page_start']
        page_end = chunk['page_end'] or page_start

        for img in doc_images[doc_id]:
            if page_start <= img['page_number'] <= page_end:
                if dry_run:
                    print(f"  [DRY RUN] chunk {chunk['id'][:8]} -> image {img['id'][:8]} (page {img['page_number']})")
                    links_created += 1
                    continue

                try:
                    supabase.table('chunk_image_links').upsert({
                        'chunk_id': chunk['id'],
                        'image_id': img['id'],
                        'link_type': 'same_page',
                        'relevance_score': 0.5,
                    }, on_conflict='chunk_id,image_id').execute()
                    links_created += 1
                except Exception as e:
                    print(f"  LINK ERROR: {e}")

    print(f"Same-page proximity links: {links_created}")
    return links_created


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description='Link images to text chunks')
    parser.add_argument('--strategy', choices=['figure_ref', 'caption_match', 'same_page', 'all'],
                        default='all', help='Linking strategy to run')
    parser.add_argument('--dry-run', action='store_true', help='Show links without creating them')
    args = parser.parse_args()

    supabase = get_supabase_client()

    total = 0
    strategies = {
        'figure_ref': link_by_figure_reference,
        'caption_match': link_by_caption_overlap,
        'same_page': link_by_page_proximity,
    }

    if args.strategy == 'all':
        # Run in priority order
        for name in ['figure_ref', 'caption_match', 'same_page']:
            total += strategies[name](supabase, args.dry_run)
    else:
        total += strategies[args.strategy](supabase, args.dry_run)

    print(f"\n{'='*40}")
    print(f"LINKING COMPLETE")
    print(f"{'='*40}")
    print(f"Total links created: {total}")

    # Report stats
    if not args.dry_run:
        stats = supabase.table('chunk_image_links') \
            .select('link_type', count='exact') \
            .execute()
        if stats.count:
            print(f"Total links in database: {stats.count}")


if __name__ == '__main__':
    main()
