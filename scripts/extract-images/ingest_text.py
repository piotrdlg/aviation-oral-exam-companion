#!/usr/bin/env python3
"""
Text ingestion for large PDFs that the Node.js pipeline skips (>100MB).

Primarily targets the FAA Testing Supplement (168MB) which contains
critical oral exam material but is skipped by scripts/ingest-sources.ts.

Uses PyMuPDF for per-page text extraction, then chunks, embeds, and inserts
into source_chunks matching the existing schema and chunking strategy.

Usage:
    python ingest_text.py --pdf /path/to/testing-supplement.pdf --doc-id <uuid>
    python ingest_text.py --pdf /path/to/testing-supplement.pdf --doc-id <uuid> --dry-run
"""

import argparse
import os
import re
import sys
import time
import uuid
from pathlib import Path

import fitz  # PyMuPDF
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(Path(__file__).resolve().parents[2] / '.env.local')
load_dotenv(Path(__file__).resolve().parents[2] / '.env')


def get_supabase_client():
    """Create Supabase client with service role key."""
    from supabase import create_client
    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        print("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
        sys.exit(1)
    return create_client(url, key)


def get_openai_client():
    """Create OpenAI client for embeddings."""
    from openai import OpenAI
    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        print("ERROR: OPENAI_API_KEY required for embedding generation")
        sys.exit(1)
    return OpenAI(api_key=api_key)


def estimate_tokens(text: str) -> int:
    """Rough token estimation: ~4 chars per token for English."""
    return len(text) // 4


def chunk_text(pages: list[dict], target_tokens: int = 750, max_tokens: int = 1000) -> list[dict]:
    """
    Chunk extracted page text into ~500-1000 token segments.
    Matches the existing chunking strategy in ingest-sources.ts.
    """
    chunks: list[dict] = []
    current_text = ""
    current_page_start = None
    current_page_end = None

    for page in pages:
        page_num = page['page_number']
        text = page['text'].strip()
        if not text:
            continue

        if current_page_start is None:
            current_page_start = page_num

        # Split page text into paragraphs
        paragraphs = re.split(r'\n\s*\n', text)

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            combined = current_text + ("\n\n" if current_text else "") + para
            if estimate_tokens(combined) > max_tokens and current_text:
                # Flush current chunk
                chunks.append({
                    'content': current_text,
                    'page_start': current_page_start,
                    'page_end': current_page_end or current_page_start,
                    'heading': extract_heading(current_text),
                })
                current_text = para
                current_page_start = page_num
                current_page_end = page_num
            else:
                current_text = combined
                current_page_end = page_num

    # Flush remaining text
    if current_text:
        chunks.append({
            'content': current_text,
            'page_start': current_page_start,
            'page_end': current_page_end or current_page_start,
            'heading': extract_heading(current_text),
        })

    return chunks


def extract_heading(text: str) -> str | None:
    """Extract a heading from the first line of text if it looks like one."""
    first_line = text.split('\n')[0].strip()
    # Headings are typically short, uppercase, or title-case
    if len(first_line) < 100 and (first_line.isupper() or first_line.istitle()):
        return first_line
    return None


def generate_embeddings(openai_client, texts: list[str], batch_size: int = 50) -> list[list[float]]:
    """Generate embeddings for a list of texts using OpenAI text-embedding-3-small."""
    all_embeddings: list[list[float]] = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        response = openai_client.embeddings.create(
            model='text-embedding-3-small',
            input=batch,
        )
        sorted_data = sorted(response.data, key=lambda x: x.index)
        all_embeddings.extend([item.embedding for item in sorted_data])
        if i + batch_size < len(texts):
            time.sleep(0.5)  # Rate limiting

    return all_embeddings


def main():
    parser = argparse.ArgumentParser(description='Ingest large PDF text via PyMuPDF')
    parser.add_argument('--pdf', required=True, help='Path to PDF file')
    parser.add_argument('--doc-id', required=True, help='UUID of source_documents row')
    parser.add_argument('--dry-run', action='store_true', help='Show chunks without inserting')
    parser.add_argument('--skip-embeddings', action='store_true', help='Skip embedding generation')
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"ERROR: {pdf_path} not found")
        sys.exit(1)

    print(f"Opening: {pdf_path.name} ({pdf_path.stat().st_size / 1024 / 1024:.1f} MB)")
    doc = fitz.open(str(pdf_path))
    print(f"Pages: {len(doc)}")

    # Extract text from all pages
    print("Extracting page text...")
    pages: list[dict] = []
    for i in range(len(doc)):
        text = doc[i].get_text()
        if text.strip():
            pages.append({'page_number': i + 1, 'text': text})
    doc.close()
    print(f"Pages with text: {len(pages)}")

    # Chunk text
    print("Chunking text...")
    chunks = chunk_text(pages)
    print(f"Chunks created: {len(chunks)}")

    if args.dry_run:
        for i, chunk in enumerate(chunks[:10]):
            tokens = estimate_tokens(chunk['content'])
            print(f"  Chunk {i}: pages {chunk['page_start']}-{chunk['page_end']}, "
                  f"~{tokens} tokens, heading: {chunk['heading']}")
        if len(chunks) > 10:
            print(f"  ... and {len(chunks) - 10} more chunks")
        return

    supabase = get_supabase_client()

    # Check if document already has chunks
    existing = supabase.table('source_chunks').select('id', count='exact').eq('document_id', args.doc_id).execute()
    if existing.count and existing.count > 0:
        print(f"WARNING: Document already has {existing.count} chunks. Skipping to avoid duplicates.")
        print("Delete existing chunks first if you want to re-ingest.")
        return

    # Insert chunks
    print("Inserting chunks...")
    inserted_ids: list[str] = []
    for i, chunk in enumerate(chunks):
        row = {
            'document_id': args.doc_id,
            'chunk_index': i,
            'heading': chunk['heading'],
            'content': chunk['content'],
            'page_start': chunk['page_start'],
            'page_end': chunk['page_end'],
            'token_count': estimate_tokens(chunk['content']),
            'embedding_status': 'stale' if args.skip_embeddings else 'stale',
        }
        result = supabase.table('source_chunks').insert(row).execute()
        if result.data:
            inserted_ids.append(result.data[0]['id'])

    print(f"Inserted: {len(inserted_ids)} chunks")

    # Generate and update embeddings
    if not args.skip_embeddings and inserted_ids:
        print("Generating embeddings...")
        openai_client = get_openai_client()
        texts = [c['content'] for c in chunks]
        embeddings = generate_embeddings(openai_client, texts)

        print("Updating embeddings in DB...")
        CONCURRENCY = 10
        for start in range(0, len(embeddings), CONCURRENCY):
            batch_embeddings = embeddings[start:start + CONCURRENCY]
            batch_ids = inserted_ids[start:start + CONCURRENCY]
            for j, (emb, chunk_id) in enumerate(zip(batch_embeddings, batch_ids)):
                supabase.table('source_chunks').update({
                    'embedding': emb,
                    'embedding_status': 'current',
                }).eq('id', chunk_id).execute()

        print(f"Embedded: {len(embeddings)} chunks")

    print("\nDone!")


if __name__ == '__main__':
    main()
