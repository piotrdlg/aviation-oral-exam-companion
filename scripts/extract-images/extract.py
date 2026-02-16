#!/usr/bin/env python3
"""
Image Extraction Pipeline for Aviation Oral Exam Companion.

Extracts images from FAA source PDFs (PHAK, Testing Supplement, etc.),
classifies them, and uploads to Supabase Storage with metadata.

Usage:
    python extract.py --source-dir /path/to/pdfs
    python extract.py --source-dir /path/to/pdfs --document-filter "phak"
    python extract.py --source-dir /path/to/pdfs --dry-run
    python extract.py --source-dir /path/to/pdfs --backfill-pages-only

AGPL-3.0 compliance: PyMuPDF is used strictly as an offline CLI tool.
Not distributed, not embedded in the web app, not accessed over a network.
"""

import argparse
import hashlib
import io
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import fitz  # PyMuPDF
from dotenv import load_dotenv
from PIL import Image

# Load .env from project root
load_dotenv(Path(__file__).resolve().parents[2] / '.env.local')
load_dotenv(Path(__file__).resolve().parents[2] / '.env')

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ExtractedImage:
    """An image extracted from a PDF page."""
    page_number: int
    raw_bytes: bytes
    width: int
    height: int
    format: str  # 'png', 'jpeg', 'webp'
    extraction_method: str  # 'embedded', 'page_render', 'region_crop'
    content_hash: str
    file_size_bytes: int
    bbox: tuple[float, float, float, float] | None = None  # normalized 0-1
    figure_label: str | None = None
    caption: str | None = None
    image_category: str = 'general'
    quality_score: float = 0.5
    is_oral_exam_relevant: bool = True


@dataclass
class ExtractionStats:
    """Tracks extraction pipeline metrics."""
    total_pages: int = 0
    total_extracted: int = 0
    filtered_too_small: int = 0
    filtered_aspect_ratio: int = 0
    filtered_file_size: int = 0
    deduplicated: int = 0
    uploaded: int = 0
    backfill_matches: int = 0
    backfill_misses: int = 0

    def summary(self) -> str:
        return (
            f"Pages scanned: {self.total_pages}\n"
            f"Images extracted: {self.total_extracted}\n"
            f"Filtered (too small): {self.filtered_too_small}\n"
            f"Filtered (aspect ratio): {self.filtered_aspect_ratio}\n"
            f"Filtered (file size): {self.filtered_file_size}\n"
            f"Deduplicated: {self.deduplicated}\n"
            f"Uploaded: {self.uploaded}\n"
            f"Page backfill matches: {self.backfill_matches}\n"
            f"Page backfill misses: {self.backfill_misses}"
        )


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Minimum dimensions for extracted images (skip icons, bullets, logos)
MIN_WIDTH = 100
MIN_HEIGHT = 100
MIN_FILE_SIZE = 5 * 1024  # 5 KB
MAX_ASPECT_RATIO = 10.0

# Figure label patterns in FAA documents
FIGURE_PATTERNS = [
    re.compile(r'Figure\s+(\d+[-–]\d+)', re.IGNORECASE),
    re.compile(r'Fig\.\s*(\d+[-–]\d+)', re.IGNORECASE),
    re.compile(r'Table\s+(\d+[-–]\d+)', re.IGNORECASE),
    re.compile(r'Chart\s+(\d+[-–]\d+)', re.IGNORECASE),
    re.compile(r'Exhibit\s+(\d+)', re.IGNORECASE),
]

# Image category classification keywords
CATEGORY_KEYWORDS: dict[str, list[str]] = {
    'diagram': ['system', 'schematic', 'layout', 'components', 'flow', 'cross-section'],
    'chart': ['chart', 'graph', 'plot', 'curve', 'performance'],
    'table': ['table', 'summary', 'checklist', 'reference', 'minimum'],
    'instrument': ['instrument', 'gauge', 'indicator', 'display', 'altimeter', 'airspeed'],
    'weather': ['weather', 'metar', 'taf', 'front', 'cloud', 'prog', 'pressure', 'wind'],
    'performance': ['takeoff', 'landing', 'distance', 'density', 'altitude', 'weight', 'balance'],
    'sectional': ['sectional', 'airspace', 'symbol', 'legend', 'navigation', 'vfr'],
    'airport': ['airport', 'runway', 'taxiway', 'sign', 'marking', 'light', 'beacon'],
}

# Storage path sanitization
SAFE_PATH_RE = re.compile(r'[^a-z0-9/\-.]')


# ---------------------------------------------------------------------------
# Core extraction functions
# ---------------------------------------------------------------------------

def compute_hash(data: bytes) -> str:
    """SHA-256 hash of image bytes for deduplication."""
    return hashlib.sha256(data).hexdigest()


def sanitize_path(path: str) -> str:
    """Enforce URL-safe storage path convention."""
    return SAFE_PATH_RE.sub('-', path.lower())


def quality_score(width: int, height: int, file_size: int) -> float:
    """Compute quality score normalized to 0-1."""
    pixels = width * height
    if file_size == 0:
        return 0.0
    # Favor high resolution, penalize excessive compression
    raw = (pixels / 1_000_000) * (1.0 - min(file_size / (pixels * 3), 1.0))
    return min(max(raw, 0.0), 1.0)


def classify_category(figure_label: str | None, caption: str | None) -> str:
    """Auto-classify image category based on figure label and caption keywords."""
    text = ' '.join(filter(None, [figure_label, caption])).lower()
    if not text:
        return 'general'

    best_cat = 'general'
    best_count = 0
    for category, keywords in CATEGORY_KEYWORDS.items():
        count = sum(1 for kw in keywords if kw in text)
        if count > best_count:
            best_count = count
            best_cat = category
    return best_cat


def detect_figure_label(page: fitz.Page, bbox: fitz.Rect) -> str | None:
    """Search for figure label near an image's bounding box."""
    # Expand search area: ±50 points vertically
    search_rect = fitz.Rect(
        bbox.x0 - 10, bbox.y0 - 50,
        bbox.x1 + 10, bbox.y1 + 50
    )
    # Clip to page bounds
    search_rect &= page.rect

    text = page.get_textbox(search_rect)
    for pattern in FIGURE_PATTERNS:
        m = pattern.search(text)
        if m:
            return m.group(0)
    return None


def extract_caption(page: fitz.Page, bbox: fitz.Rect, max_chars: int = 200) -> str | None:
    """Extract caption text below an image's bounding box."""
    caption_rect = fitz.Rect(
        bbox.x0 - 20, bbox.y1,
        bbox.x1 + 20, min(bbox.y1 + 80, page.rect.height)
    )
    caption_rect &= page.rect

    text = page.get_textbox(caption_rect).strip()
    if not text or len(text) < 5:
        return None

    # Truncate at max chars or at next figure/heading boundary
    for pattern in FIGURE_PATTERNS:
        m = pattern.search(text)
        if m and m.start() > 0:
            text = text[:m.start()].strip()
            break

    return text[:max_chars] if text else None


def normalize_bbox(bbox: fitz.Rect, page_rect: fitz.Rect) -> tuple[float, float, float, float]:
    """Normalize bounding box to 0-1 range relative to page dimensions."""
    pw, ph = page_rect.width, page_rect.height
    if pw == 0 or ph == 0:
        return (0, 0, 0, 0)
    return (
        round(bbox.x0 / pw, 4),
        round(bbox.y0 / ph, 4),
        round(bbox.x1 / pw, 4),
        round(bbox.y1 / ph, 4),
    )


def passes_quality_filter(width: int, height: int, file_size: int, stats: ExtractionStats) -> bool:
    """Check if an image passes minimum quality thresholds."""
    if width < MIN_WIDTH or height < MIN_HEIGHT:
        stats.filtered_too_small += 1
        return False

    aspect = max(width, height) / max(min(width, height), 1)
    if aspect > MAX_ASPECT_RATIO:
        stats.filtered_aspect_ratio += 1
        return False

    if file_size < MIN_FILE_SIZE:
        stats.filtered_file_size += 1
        return False

    return True


def optimize_image(raw_bytes: bytes, width: int, height: int) -> tuple[bytes, str]:
    """Optimize image format and quality for storage."""
    img = Image.open(io.BytesIO(raw_bytes))

    # Diagrams/charts with text → PNG (lossless)
    # Photos/complex → JPEG at quality 85
    # Large images → WebP at quality 85
    buf = io.BytesIO()

    if len(raw_bytes) > 500 * 1024:
        # Large image: use WebP
        img.save(buf, format='WEBP', quality=85)
        return buf.getvalue(), 'webp'
    elif img.mode in ('RGBA', 'LA', 'P'):
        # Has transparency or palette → PNG
        img.save(buf, format='PNG', optimize=True)
        return buf.getvalue(), 'png'
    else:
        # Default: JPEG
        if img.mode != 'RGB':
            img = img.convert('RGB')
        img.save(buf, format='JPEG', quality=85)
        return buf.getvalue(), 'jpeg'


def extract_embedded_images(
    doc: fitz.Document,
    stats: ExtractionStats,
    seen_hashes: set[str],
) -> list[ExtractedImage]:
    """Phase A: Extract embedded images from all pages."""
    images: list[ExtractedImage] = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        stats.total_pages += 1

        for img_info in page.get_images(full=True):
            xref = img_info[0]
            try:
                pix = fitz.Pixmap(doc, xref)
            except Exception:
                continue

            # Skip images with no colorspace (masks, stencils)
            if not pix.colorspace:
                pix = None
                continue

            # PNG only supports grayscale and RGB — convert everything else
            cs_name = pix.colorspace.name if pix.colorspace else ''
            if cs_name not in ('DeviceGray', 'DeviceRGB', 'Indexed'):
                try:
                    pix = fitz.Pixmap(fitz.csRGB, pix)
                except Exception:
                    pix = None
                    continue

            # Strip alpha channel if present (PNG supports it, but simpler without)
            if pix.alpha:
                pix = fitz.Pixmap(pix, 0)  # drop alpha

            width, height = pix.width, pix.height
            try:
                raw_bytes = pix.tobytes("png")
            except Exception:
                # Unsupported colorspace — skip this image
                pix = None
                continue
            file_size = len(raw_bytes)
            pix = None  # free memory

            if not passes_quality_filter(width, height, file_size, stats):
                continue

            content_hash = compute_hash(raw_bytes)
            if content_hash in seen_hashes:
                stats.deduplicated += 1
                continue
            seen_hashes.add(content_hash)

            stats.total_extracted += 1

            # Try to get bbox from page image list
            bbox = None
            norm_bbox = None
            for item in page.get_image_rects(xref):
                bbox = item
                norm_bbox = normalize_bbox(bbox, page.rect)
                break

            # Detect figure label and caption
            fig_label = None
            caption = None
            if bbox:
                fig_label = detect_figure_label(page, bbox)
                caption = extract_caption(page, bbox)

            # Optimize
            optimized_bytes, fmt = optimize_image(raw_bytes, width, height)
            category = classify_category(fig_label, caption)

            images.append(ExtractedImage(
                page_number=page_num + 1,  # 1-indexed
                raw_bytes=optimized_bytes,
                width=width,
                height=height,
                format=fmt,
                extraction_method='embedded',
                content_hash=content_hash,
                file_size_bytes=len(optimized_bytes),
                bbox=norm_bbox,
                figure_label=fig_label,
                caption=caption,
                image_category=category,
                quality_score=quality_score(width, height, len(optimized_bytes)),
            ))

    return images


def render_pages(
    doc: fitz.Document,
    page_numbers: list[int],
    stats: ExtractionStats,
    seen_hashes: set[str],
    dpi: int = 200,
) -> list[ExtractedImage]:
    """Phase B: Render specific pages as full-page images."""
    images: list[ExtractedImage] = []

    for page_num in page_numbers:
        if page_num < 0 or page_num >= len(doc):
            continue

        page = doc[page_num]
        pix = page.get_pixmap(dpi=dpi)
        raw_bytes = pix.tobytes("png")
        width, height = pix.width, pix.height
        file_size = len(raw_bytes)
        pix = None

        content_hash = compute_hash(raw_bytes)
        if content_hash in seen_hashes:
            stats.deduplicated += 1
            continue
        seen_hashes.add(content_hash)

        optimized_bytes, fmt = optimize_image(raw_bytes, width, height)
        stats.total_extracted += 1

        images.append(ExtractedImage(
            page_number=page_num + 1,
            raw_bytes=optimized_bytes,
            width=width,
            height=height,
            format=fmt,
            extraction_method='page_render',
            content_hash=content_hash,
            file_size_bytes=len(optimized_bytes),
            quality_score=quality_score(width, height, len(optimized_bytes)),
        ))

    return images


# ---------------------------------------------------------------------------
# Page backfill
# ---------------------------------------------------------------------------

def normalize_text(text: str) -> str:
    """Normalize text for anchor matching: lowercase, collapse whitespace, remove hyphens."""
    text = text.lower()
    text = re.sub(r'-\s*\n\s*', '', text)  # remove line-break hyphens
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def get_anchors(text: str, count: int = 3, anchor_len: int = 40) -> list[str]:
    """Extract short anchor strings from start, middle, and end of text."""
    normalized = normalize_text(text)
    if len(normalized) < anchor_len:
        return [normalized] if normalized else []

    anchors = []
    # Start
    anchors.append(normalized[:anchor_len])
    # Middle
    mid = len(normalized) // 2
    anchors.append(normalized[mid:mid + anchor_len])
    # End
    anchors.append(normalized[-anchor_len:])

    return anchors[:count]


def backfill_page_numbers(
    doc: fitz.Document,
    chunks: list[dict],
    stats: ExtractionStats,
) -> list[dict]:
    """
    Multi-anchor page backfill with cursor-based search.

    For each chunk, extract 3 anchors and search ±10 pages from cursor.
    A page matches if ≥2 of 3 anchors are found.
    """
    # Precompute per-page normalized text
    page_texts: list[str] = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        page_texts.append(normalize_text(page.get_text()))

    cursor = 0
    search_range = 10
    results: list[dict] = []

    for chunk in chunks:
        content = chunk.get('content', '')
        anchors = get_anchors(content)

        if not anchors:
            results.append({**chunk, 'page_start': None, 'page_end': None})
            stats.backfill_misses += 1
            continue

        # Search ±search_range pages from cursor
        best_page = None
        best_matches = 0
        start_search = max(0, cursor - search_range)
        end_search = min(len(page_texts), cursor + search_range + 1)

        for page_idx in range(start_search, end_search):
            matches = sum(1 for a in anchors if a in page_texts[page_idx])
            if matches > best_matches:
                best_matches = matches
                best_page = page_idx

        # Require ≥2 anchor matches (or 1 if only 1 anchor available)
        min_required = min(2, len(anchors))
        if best_page is not None and best_matches >= min_required:
            cursor = best_page
            results.append({
                **chunk,
                'page_start': best_page + 1,  # 1-indexed
                'page_end': best_page + 1,
            })
            stats.backfill_matches += 1
        else:
            results.append({**chunk, 'page_start': None, 'page_end': None})
            stats.backfill_misses += 1

    return results


# ---------------------------------------------------------------------------
# Supabase upload
# ---------------------------------------------------------------------------

def get_supabase_client():
    """Create Supabase client with service role key."""
    from supabase import create_client
    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        print("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
        sys.exit(1)
    return create_client(url, key)


def generate_storage_path(doc_slug: str, image: ExtractedImage) -> str:
    """Generate URL-safe storage path for an image."""
    if image.figure_label:
        filename = sanitize_path(image.figure_label) + f'.{image.format}'
    else:
        filename = f'page-{image.page_number:04d}.{image.format}'

    # e.g., phak/ch03/figure-3-1.png
    return sanitize_path(f'{doc_slug}/{filename}')


def upload_images(
    images: list[ExtractedImage],
    document_id: str,
    doc_slug: str,
    dry_run: bool = False,
    stats: ExtractionStats | None = None,
) -> None:
    """Upload extracted images to Supabase Storage and insert metadata."""
    if dry_run:
        for img in images:
            path = generate_storage_path(doc_slug, img)
            print(f"  [DRY RUN] {path} ({img.width}x{img.height}, {img.file_size_bytes}B, {img.image_category})")
        return

    supabase = get_supabase_client()

    for img in images:
        storage_path = generate_storage_path(doc_slug, img)

        # Check if hash already exists (dedup across runs)
        existing = supabase.table('source_images').select('id').eq('content_hash', img.content_hash).execute()
        if existing.data:
            if stats:
                stats.deduplicated += 1
            continue

        # Upload to storage
        mime_type = {
            'png': 'image/png',
            'jpeg': 'image/jpeg',
            'webp': 'image/webp',
        }[img.format]

        try:
            supabase.storage.from_('source-images').upload(
                path=storage_path,
                file=img.raw_bytes,
                file_options={'content-type': mime_type},
            )
        except Exception as e:
            if 'Duplicate' in str(e) or 'already exists' in str(e):
                pass  # File exists, proceed with metadata insert
            else:
                print(f"  UPLOAD ERROR: {storage_path}: {e}")
                continue

        # Insert metadata
        row = {
            'document_id': document_id,
            'page_number': img.page_number,
            'figure_label': img.figure_label,
            'caption': img.caption,
            'image_category': img.image_category,
            'storage_path': storage_path,
            'width': img.width,
            'height': img.height,
            'file_size_bytes': img.file_size_bytes,
            'content_hash': img.content_hash,
            'format': img.format,
            'extraction_method': img.extraction_method,
            'quality_score': img.quality_score,
            'is_oral_exam_relevant': img.is_oral_exam_relevant,
        }
        if img.bbox:
            row['bbox_x0'] = img.bbox[0]
            row['bbox_y0'] = img.bbox[1]
            row['bbox_x1'] = img.bbox[2]
            row['bbox_y1'] = img.bbox[3]

        try:
            supabase.table('source_images').insert(row).execute()
            if stats:
                stats.uploaded += 1
        except Exception as e:
            print(f"  DB INSERT ERROR: {storage_path}: {e}")


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def process_document(
    pdf_path: Path,
    document_id: str,
    doc_slug: str,
    dry_run: bool = False,
    render_pages_list: list[int] | None = None,
    backfill_only: bool = False,
) -> ExtractionStats:
    """Process a single PDF document through the extraction pipeline."""
    stats = ExtractionStats()
    seen_hashes: set[str] = set()

    print(f"\nProcessing: {pdf_path.name}")
    doc = fitz.open(str(pdf_path))

    if backfill_only:
        # Only run page backfill, no image extraction
        print("  [Page backfill only mode]")
        # Would need chunks from DB to backfill — placeholder
        doc.close()
        return stats

    # Phase A: Extract embedded images
    print("  Phase A: Extracting embedded images...")
    embedded = extract_embedded_images(doc, stats, seen_hashes)
    print(f"  Found {len(embedded)} images after filtering")

    # Phase B: Render specific pages (e.g., Testing Supplement charts)
    rendered: list[ExtractedImage] = []
    if render_pages_list:
        print(f"  Phase B: Rendering {len(render_pages_list)} pages...")
        rendered = render_pages(doc, render_pages_list, stats, seen_hashes)
        print(f"  Rendered {len(rendered)} page images")

    all_images = embedded + rendered
    print(f"  Total images to upload: {len(all_images)}")

    # Upload
    upload_images(all_images, document_id, doc_slug, dry_run, stats)

    doc.close()
    return stats


def load_document_index(supabase) -> list[dict]:
    """Fetch all source_documents rows once for local matching."""
    resp = supabase.table('source_documents') \
        .select('id, abbreviation, title') \
        .execute()
    return resp.data or []


def resolve_document_id(doc_index: list[dict], pdf_filename: str) -> tuple[str, str] | None:
    """
    Match a PDF filename to a source_documents row using local index.

    Filenames like "05_phak_ch3.pdf" match titles like "PHAK 05 phak ch3".
    Strategy: strip numbers/underscores from filename stem, match against title.

    Returns (document_id, abbreviation) or None.
    """
    stem = pdf_filename.rsplit('.', 1)[0].lower().strip()
    # Normalize: "05_phak_ch3" -> "phak ch3" (strip leading number prefix, replace _ with space)
    # Also keep original for exact matching
    normalized = re.sub(r'^\d+[_\s]+', '', stem)  # Strip leading "05_"
    normalized = normalized.replace('_', ' ')

    # Strategy 1: Check if normalized stem appears in title (most reliable)
    matches = []
    for doc in doc_index:
        title_lower = doc['title'].lower()
        if normalized in title_lower:
            matches.append(doc)

    if len(matches) == 1:
        return (matches[0]['id'], matches[0]['abbreviation'])

    # Strategy 2: If multiple matches, try with the full stem (including number prefix)
    if len(matches) > 1:
        full_normalized = stem.replace('_', ' ')
        refined = [doc for doc in matches if full_normalized in doc['title'].lower()]
        if len(refined) == 1:
            return (refined[0]['id'], refined[0]['abbreviation'])

    # Strategy 3: Try matching abbreviation + last meaningful part
    parts = normalized.split()
    if len(parts) >= 2:
        abbr = parts[0]
        rest = ' '.join(parts[1:])
        for doc in doc_index:
            if doc['abbreviation'].lower() == abbr and rest in doc['title'].lower():
                return (doc['id'], doc['abbreviation'])

    return None


def main():
    parser = argparse.ArgumentParser(description='Extract images from FAA source PDFs')
    parser.add_argument('--source-dir', required=True, help='Directory containing PDF files')
    parser.add_argument('--document-filter', help='Only process PDFs matching this substring')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be extracted without uploading')
    parser.add_argument('--backfill-pages-only', action='store_true', help='Only run page number backfill')
    args = parser.parse_args()

    source_dir = Path(args.source_dir)
    if not source_dir.is_dir():
        print(f"ERROR: {source_dir} is not a directory")
        sys.exit(1)

    pdf_files = sorted(source_dir.glob('**/*.pdf'))
    if args.document_filter:
        pdf_files = [f for f in pdf_files if args.document_filter.lower() in f.name.lower()]

    if not pdf_files:
        print(f"No PDF files found in {source_dir}")
        sys.exit(1)

    print(f"Found {len(pdf_files)} PDF files to process")
    if args.dry_run:
        print("[DRY RUN MODE - no uploads]")

    # Connect to DB and load document index once
    supabase = get_supabase_client()
    doc_index = load_document_index(supabase)
    print(f"Loaded {len(doc_index)} source_documents from DB")

    total_stats = ExtractionStats()
    skipped = 0

    for pdf_path in pdf_files:
        # Resolve document_id from local index
        resolved = resolve_document_id(doc_index, pdf_path.name)
        if resolved is None:
            print(f"\n  SKIP: {pdf_path.name} — no matching source_documents row")
            print(f"    (Hint: insert a row into source_documents first, or check filename)")
            skipped += 1
            continue

        document_id, abbreviation = resolved
        doc_slug = sanitize_path(abbreviation + '/' + pdf_path.stem)

        stats = process_document(
            pdf_path=pdf_path,
            document_id=document_id,
            doc_slug=doc_slug,
            dry_run=args.dry_run,
            backfill_only=args.backfill_pages_only,
        )

        # Accumulate stats
        total_stats.total_pages += stats.total_pages
        total_stats.total_extracted += stats.total_extracted
        total_stats.filtered_too_small += stats.filtered_too_small
        total_stats.filtered_aspect_ratio += stats.filtered_aspect_ratio
        total_stats.filtered_file_size += stats.filtered_file_size
        total_stats.deduplicated += stats.deduplicated
        total_stats.uploaded += stats.uploaded
        total_stats.backfill_matches += stats.backfill_matches
        total_stats.backfill_misses += stats.backfill_misses

    print(f"\n{'='*40}")
    print("EXTRACTION COMPLETE")
    print(f"{'='*40}")
    if skipped:
        print(f"Skipped (no DB match): {skipped}")
    print(total_stats.summary())


if __name__ == '__main__':
    main()
