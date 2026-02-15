# Image Augmentation for Oral Exam — Technical Design Document

**Project**: Aviation Oral Exam Companion
**Date**: 2026-02-15
**Author**: Claude (Opus 4.6)
**Status**: APPROVED by GPT-5.2 (unconditional approval, Round 5)
**Review History**:
- v1: 14 findings from GPT-5.2 (2 critical, 4 high, 4 medium, 4 low)
- v2: All 14 addressed → 9 new findings (4 design, 5 existing-code)
- v3: All 4 design issues addressed → 11 findings (5 new design, 6 existing-code repeats)
- v4: All 5 addressed → 11 findings (3 new design, 8 existing-code repeats in Section 16)
- v5: All 3 addressed. Existing-code prerequisites documented in Section 16.

---

## 1. Executive Summary

This document describes the technical architecture for extracting images (diagrams, charts, figures, tables) from FAA source PDFs, storing them with structured metadata, linking them to existing RAG text chunks, and displaying them contextually during oral exam sessions. The goal is to make the simulated DPE oral exam more realistic by presenting visual materials — the same charts, diagrams, and supplement pages a real DPE would hand to an applicant.

**Scope**: Image extraction, storage, linking, display, and optional Claude Vision assessment integration.

**Out of scope**: Video content, interactive chart manipulation, user-uploaded images, real-time chart generation.

| Phase | Description | Effort | Priority |
|-------|-------------|--------|----------|
| 1 | Image extraction pipeline (Python + PyMuPDF) | 3-4 days | Must-have |
| 2 | Database schema + Supabase Storage | 1 day | Must-have |
| 3 | Figure-to-chunk linking | 1-2 days | Must-have |
| 4 | UI display in exam interface | 1-2 days | Must-have |
| 5 | Claude Vision multimodal assessment | 2-3 days | Nice-to-have |

---

## 2. Source Document Analysis

### 2.1 Current Ingestion Pipeline

The existing pipeline (`scripts/ingest-sources.ts`) uses `pdf-parse` (Node.js) to extract plain text, chunk it into 500-1000 token segments, generate OpenAI text-embedding-3-small vectors (1536 dimensions), and store them in `source_chunks` with hybrid search (65% vector + 35% FTS).

**Current limitations:**
- `pdf-parse` discards all images, layout, and positional data
- `page_start` and `page_end` columns exist but are always NULL
- No figure/caption extraction
- No image storage infrastructure
- Files >100MB are skipped (notably the Testing Supplement at 168MB)

> **[R1-FIX: Testing Supplement Text Gap]** The existing ingestion script (`ingest-sources.ts:347`) skips files >100MB. The Testing Supplement (168MB, "Very High" image value) therefore has NO text chunks in the database. This image extraction pipeline will process it for images via PyMuPDF (which handles large files efficiently), but chunk-image linking for this document must rely on page-level rendered images rather than text chunk references. To fully resolve this, Phase 1 includes a sub-task to ingest Testing Supplement text using PyMuPDF's per-page text extraction (bypassing the `pdf-parse` size limit), creating text chunks specifically for this document. This enables both text RAG and image linking for the Testing Supplement.

### 2.2 Source PDF Inventory

159 PDFs across 8 categories, ~7.4 GB total:

| Category | Files | Size | Visual Content Value |
|----------|-------|------|---------------------|
| PHAK (FAA-H-8083-25B) | 22 chapters | ~800 MB | **Highest** — airspace diagrams, instrument panels, weather charts, W&B graphs, flight computer examples |
| AFH (FAA-H-8083-3C) | 24 chapters | ~600 MB | Medium — maneuver diagrams, approach profiles (mostly flight skills) |
| FAA-CT-8080-2H (Testing Supplement) | 1 file | 168 MB | **Very High** — sample METARs, TAFs, sectional chart excerpts, performance charts, W&B forms. DPEs use this booklet during real orals |
| AIM | 4 files | ~200 MB | High — approach plates, airport diagrams, light gun signals, phraseology charts |
| AC (Advisory Circulars) | 7 files | ~150 MB | Medium — weather charts (AC 00-6B), wake turbulence diagrams |
| CFR (14 CFR Parts) | 7 files | ~50 MB | Low — mostly text regulations, occasional tables |
| ACS (FAA-S-ACS-6C) | 1 file | ~5 MB | Low — task/element tables only |
| Other handbooks | ~93 files | ~5.4 GB | Varies — instrument flying, risk management, etc. |

### 2.3 High-Value Image Categories for Oral Exam

Based on typical DPE oral exam topics and ACS task coverage:

| Image Category | ACS Areas | Example |
|----------------|-----------|---------|
| Airspace classification diagrams | PA.III (Airport Ops) | PHAK Figure 15-1 "wedding cake" |
| Weather chart interpretation | PA.I.C (Weather Information) | Surface analysis, prog charts |
| TAF/METAR format examples | PA.I.C | Testing Supplement pages |
| Flight instruments | PA.I.B (Airworthiness), PA.VIII | Six-pack layout, pitot-static system |
| Aircraft systems diagrams | PA.I.B, PA.I.G | Electrical, fuel, hydraulic systems |
| Weight & balance graphs/forms | PA.I.F (Performance/Limitations) | CG envelope, loading problems |
| Performance charts | PA.I.F | Takeoff/landing distance, density altitude |
| Sectional chart excerpts | PA.VI (Navigation) | Airspace boundaries, symbols, legend |
| Airport diagram/signage | PA.III | Runway markings, taxi signs, light signals |
| Engine instruments | PA.I.B | Oil pressure, manifold pressure, RPM |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────┐
│              Image Extraction Pipeline           │
│  (Python script, runs offline, one-time + delta) │
│                                                   │
│  PyMuPDF → Extract images → Caption detection    │
│         → Classify image type → Upload to        │
│           Supabase Storage → Insert metadata      │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│              Supabase PostgreSQL                  │
│                                                   │
│  source_images (metadata, storage_path, caption) │
│  chunk_image_links (text chunk ↔ image mapping)  │
│  source_chunks (existing, with page_start added) │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│              Application Layer                    │
│                                                   │
│  RAG retrieval → Find linked images → Return     │
│  with chunk results → Display in exam UI         │
│                                                   │
│  Optional: Include images in Claude Vision       │
│  assessment prompts for chart interpretation Qs  │
└─────────────────────────────────────────────────┘
```

### 3.1 Why Python for Extraction (Not Node.js)

| Factor | PyMuPDF (Python) | pdfjs-dist (Node.js) |
|--------|------------------|----------------------|
| Image extraction with metadata | Full support: page, bbox, resolution, format | Limited: basic image extraction, no bbox |
| Page rendering to image | Built-in: `page.get_pixmap()` | Requires canvas emulation (node-canvas) |
| Caption/text-near-image detection | Text extraction with coordinates via `page.get_text("dict")` | Not supported |
| Complex FAA PDF handling | Excellent — handles embedded fonts, vector graphics | Struggles with some FAA layouts |
| Performance on large PDFs | Fast C-based engine (MuPDF) | Slower JavaScript-based rendering |
| Maturity for this use case | Industry standard for PDF data extraction | Designed for PDF viewing, not extraction |

The extraction pipeline runs offline (not in Next.js server), so language choice has no runtime impact. Python + PyMuPDF is the clear winner for this task.

### 3.2 Why Not Re-ingest Everything

The existing text chunking pipeline works well. Rather than replacing it, the image pipeline runs alongside it:
- Text chunks remain in `source_chunks` (unchanged)
- Images go into new `source_images` table
- A linking step creates `chunk_image_links` based on figure references and page proximity
- The only modification to existing tables is populating `page_start`/`page_end` (currently NULL)

---

## 4. Database Schema

### 4.1 New Tables

```sql
-- [R1-FIX: CHECK constraints, removed redundant public_url, added content_hash]
-- Extracted images from FAA source PDFs
CREATE TABLE source_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  figure_label TEXT,                    -- e.g., "Figure 3-1", "Table 5-2"
  caption TEXT,                         -- extracted caption text
  image_category TEXT NOT NULL DEFAULT 'general'
    CHECK (image_category IN (
      'diagram', 'chart', 'table', 'instrument',
      'weather', 'performance', 'sectional', 'airport', 'general'
    )),
  storage_path TEXT NOT NULL             -- Supabase Storage object path (source of truth)
    -- [R4-FIX: Prevent path traversal and enforce URL-safe convention]
    CHECK (storage_path !~ '^/' AND storage_path NOT LIKE '%..%'
           AND storage_path ~ '^[a-z0-9/\-\.]+$'),
  -- public_url is NOT stored; derived at query time from storage_path
  -- to prevent staleness if bucket/CDN domain changes
  width INT NOT NULL,
  height INT NOT NULL,
  file_size_bytes INT,
  content_hash TEXT,                    -- SHA-256 of image bytes for deduplication
  format TEXT NOT NULL DEFAULT 'png'
    CHECK (format IN ('png', 'jpeg', 'webp')),
  extraction_method TEXT NOT NULL
    CHECK (extraction_method IN ('embedded', 'page_render', 'region_crop')),
  bbox_x0 FLOAT,                       -- normalized 0-1 position on page
  bbox_y0 FLOAT,
  bbox_x1 FLOAT,
  bbox_y1 FLOAT,
  quality_score FLOAT,                 -- 0-1, set during extraction (resolution, size)
  is_oral_exam_relevant BOOLEAN DEFAULT TRUE,  -- manual/auto curation flag
  description TEXT,                     -- AI-generated description for accessibility + search
  description_model TEXT,               -- model used to generate description (e.g., 'claude-sonnet-4-5')
  described_at TIMESTAMPTZ,             -- when description was generated
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [R1-FIX: CHECK constraint on link_type]
-- Many-to-many: which text chunks reference which images
CREATE TABLE chunk_image_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES source_chunks(id) ON DELETE CASCADE,
  image_id UUID NOT NULL REFERENCES source_images(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL
    CHECK (link_type IN ('figure_ref', 'same_page', 'caption_match', 'manual')),
  relevance_score FLOAT DEFAULT 0.5,   -- 0-1, higher = stronger link
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(chunk_id, image_id)
);

-- Indexes
CREATE INDEX idx_source_images_document ON source_images(document_id);
CREATE INDEX idx_source_images_category ON source_images(image_category);
CREATE INDEX idx_source_images_figure ON source_images(figure_label);
CREATE INDEX idx_source_images_page ON source_images(document_id, page_number);
CREATE INDEX idx_source_images_relevant ON source_images(is_oral_exam_relevant) WHERE is_oral_exam_relevant = TRUE;
CREATE INDEX idx_source_images_hash ON source_images(content_hash);  -- dedup lookups
CREATE INDEX idx_chunk_image_links_chunk ON chunk_image_links(chunk_id);
CREATE INDEX idx_chunk_image_links_image ON chunk_image_links(image_id);
CREATE INDEX idx_chunk_image_links_type ON chunk_image_links(link_type);
```

### 4.2 RLS Policies

```sql
-- [R2-FIX: Service-role-only writes — no authenticated INSERT policies]
-- All writes happen via the extraction pipeline using SUPABASE_SERVICE_ROLE_KEY,
-- which bypasses RLS entirely. No application endpoint writes to these tables.
-- Therefore: no INSERT/UPDATE/DELETE policies for authenticated roles.

-- source_images: read-only for authenticated users
ALTER TABLE source_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read images"
  ON source_images FOR SELECT
  TO authenticated
  USING (true);
-- No INSERT/UPDATE/DELETE policies = writes denied for all non-service-role clients

-- chunk_image_links: read-only for authenticated users
ALTER TABLE chunk_image_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read chunk-image links"
  ON chunk_image_links FOR SELECT
  TO authenticated
  USING (true);
-- No INSERT/UPDATE/DELETE policies = writes denied for all non-service-role clients

-- [R3-FIX: Defense-in-depth — explicitly revoke write privileges]
-- Even though RLS denies writes without policies, revoking privileges at the
-- GRANT level prevents writes even if someone later adds permissive policies.
REVOKE INSERT, UPDATE, DELETE ON source_images FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON chunk_image_links FROM authenticated, anon;
-- Verification: \dp source_images should show no INSERT/UPDATE/DELETE for authenticated/anon
```

> **[R3-FIX: Legacy vs new RLS mismatch]** The existing `source_documents` and `source_chunks` tables use `is_admin()` INSERT policies because the original text ingestion was designed to run via authenticated admin endpoints. The new `source_images` and `chunk_image_links` tables use **service-role-only writes** (with explicit REVOKE) because the image extraction pipeline runs as an offline script with the service-role key and has no corresponding admin endpoint. This is an intentional architectural difference, not an inconsistency.

### 4.2.1 Supabase Storage Policies

> **[R1-FIX + R2-FIX: Storage bucket — world-readable, service-role-only writes]**
> The `source-images` bucket is configured as **public** in the Supabase Dashboard.
> This means all objects are world-readable via CDN URL without authentication.
> This is intentional: images are FAA public domain documents and must load in
> `<img>` tags without auth headers.
>
> **Write protection**: No Storage policies grant INSERT/UPDATE/DELETE to any role.
> Only the extraction pipeline (using `SUPABASE_SERVICE_ROLE_KEY`, which bypasses
> Storage RLS) can upload/modify/delete objects.

```sql
-- Storage RLS for source-images bucket
-- The bucket is marked PUBLIC in Supabase Dashboard = world-readable via CDN.
-- No explicit SELECT policy needed (public bucket serves objects without RLS check).
-- No INSERT/UPDATE/DELETE policies = writes denied for all non-service-role clients.
--
-- Verification: In Supabase Dashboard → Storage → Policies → source-images:
--   ✓ No INSERT policies exist
--   ✓ No UPDATE policies exist
--   ✓ No DELETE policies exist
--   ✓ Bucket is marked "Public"
```

### 4.3 Existing Table Modification

```sql
-- Populate page_start/page_end in source_chunks (currently always NULL)
-- This is done by the Python extraction pipeline, not a migration
-- The columns already exist, just need data
```

### 4.4 RPC Function for Image Retrieval

```sql
-- [R1-FIX: Deterministic DISTINCT ON with link-type priority + tie-breaker;
--  derives public_url from storage_path instead of storing it]
CREATE OR REPLACE FUNCTION get_images_for_chunks(
  chunk_ids UUID[],
  supabase_url TEXT DEFAULT current_setting('app.settings.supabase_url', true)
)
RETURNS TABLE (
  image_id UUID,
  figure_label TEXT,
  caption TEXT,
  image_category TEXT,
  public_url TEXT,
  width INT,
  height INT,
  description TEXT,
  doc_abbreviation TEXT,
  page_number INT,
  link_type TEXT,
  relevance_score FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT ON (si.id)
    si.id AS image_id,
    si.figure_label,
    si.caption,
    si.image_category,
    -- [R3-FIX: NULL-safe URL derivation — returns NULL if base URL is missing]
    CASE
      WHEN coalesce(supabase_url, current_setting('app.settings.supabase_url', true)) IS NULL
        THEN NULL  -- caller must handle NULL public_url (don't render image, log warning)
      ELSE concat(
        coalesce(supabase_url, current_setting('app.settings.supabase_url', true)),
        '/storage/v1/object/public/source-images/',
        si.storage_path
      )
    END AS public_url,
    si.width,
    si.height,
    si.description,
    sd.abbreviation AS doc_abbreviation,
    si.page_number,
    cil.link_type,
    cil.relevance_score
  FROM chunk_image_links cil
  JOIN source_images si ON si.id = cil.image_id
  JOIN source_documents sd ON sd.id = si.document_id
  WHERE cil.chunk_id = ANY(chunk_ids)
    AND si.is_oral_exam_relevant = TRUE
  ORDER BY si.id,
    -- [R2-FIX: Explicit case for all link_types, no catch-all ELSE]
    -- Priority: figure_ref > caption_match > same_page > manual
    CASE cil.link_type
      WHEN 'figure_ref' THEN 3
      WHEN 'caption_match' THEN 2
      WHEN 'same_page' THEN 1
      WHEN 'manual' THEN 0
    END DESC,
    cil.relevance_score DESC,
    cil.created_at DESC;  -- final tie-breaker
$$;
```

> **[R3-FIX: CASE/CHECK coupling]** The CASE expression in `get_images_for_chunks` must list the same values as the CHECK constraint on `chunk_image_links.link_type`. If the CHECK constraint is updated to add new link types, the CASE in this function **must be updated in lockstep** to include the new type with an appropriate priority value. Failure to do so will cause NULL sort keys for the new link type (effectively random ordering for those links).

> **[R4-FIX: DISTINCT ON cardinality]** The `DISTINCT ON (si.id)` deduplicates across chunks — it returns **one row per image** (with the best link across all requested chunks), NOT one row per chunk-image pair. This is intentional: the UI displays unique images, not per-chunk image lists. If a future requirement needs per-chunk image mapping, change the DISTINCT key to `(cil.chunk_id, si.id)`.

> **[R4-FIX: SECURITY DEFINER hardening]** This function uses `LANGUAGE sql STABLE` (not SECURITY DEFINER), so search_path risks don't apply directly. However, the existing `chunk_hybrid_search` function in migration 20260214000005 uses `LANGUAGE plpgsql SECURITY DEFINER` without a fixed search_path. As an implementation prerequisite, add `SET search_path = public` to that function to prevent object-shadowing attacks. This is documented in Section 16.

> **[R1-FIX: URL derivation]** `public_url` is derived at query time from `storage_path` + Supabase project URL. This prevents staleness if the CDN domain or bucket configuration changes. The Supabase URL is passed as a parameter (defaulting to a `app.settings` config) and can be set via `ALTER DATABASE SET app.settings.supabase_url = 'https://pvuiwwqsumoqjepukjhz.supabase.co';`.

---

## 5. Image Extraction Pipeline

### 5.1 Pipeline Architecture

```
scripts/extract-images.py
│
├── Phase A: Extract embedded images
│   ├── PyMuPDF page.get_images() → raw image bytes
│   ├── Filter: min 100x100px, min 5KB (skip icons/bullets)
│   ├── Detect figure label from nearby text
│   └── Extract caption from text below image
│
├── Phase B: Render full pages for complex charts
│   ├── Detect pages with minimal extractable images but known chart content
│   ├── page.get_pixmap(dpi=200) → full page PNG
│   └── Used for: Testing Supplement pages, complex composite figures
│
├── Phase C: Region cropping (optional, Phase 5 enhancement)
│   ├── Use bbox coordinates to crop specific chart regions
│   └── Higher precision for multi-figure pages
│
├── Phase D: Metadata enrichment
│   ├── Auto-classify image category based on caption/context keywords
│   ├── Generate quality score (resolution × area / file_size)
│   └── Flag oral-exam relevance based on category + ACS area matching
│
└── Phase E: Upload & persist
    ├── Upload to Supabase Storage bucket: 'source-images'
    ├── Insert row into source_images table
    └── Generate public_url via Supabase CDN
```

### 5.2 Figure Label Detection

FAA documents use consistent figure numbering. The extraction script searches text within ±50 vertical units of each image's bounding box for patterns:

```python
FIGURE_PATTERNS = [
    r'Figure\s+(\d+[-–]\d+)',       # "Figure 3-1"
    r'Fig\.\s*(\d+[-–]\d+)',        # "Fig. 3-1"
    r'Table\s+(\d+[-–]\d+)',        # "Table 5-2"
    r'Chart\s+(\d+[-–]\d+)',        # "Chart 1-3"
    r'Exhibit\s+(\d+)',             # "Exhibit 7"
]
```

Caption text is extracted from the first text block below the image bounding box, up to 200 characters or until the next figure/heading boundary.

### 5.3 Image Category Classification

Automatic classification based on caption keywords and document context:

| Category | Detection Keywords | Typical Source |
|----------|-------------------|----------------|
| `diagram` | system, schematic, layout, components, flow | PHAK Ch 7-8 (systems) |
| `chart` | chart, graph, plot, curve, performance | PHAK Ch 11 (performance) |
| `table` | table, summary, checklist, reference | Various |
| `instrument` | instrument, gauge, indicator, display | PHAK Ch 8 (flight instruments) |
| `weather` | weather, metar, taf, front, cloud, prog | PHAK Ch 12-13, AC 00-6B |
| `performance` | takeoff, landing, distance, density, altitude | PHAK Ch 11, Testing Supplement |
| `sectional` | sectional, chart, airspace, symbol, legend | PHAK Ch 15-16, Testing Supplement |
| `airport` | airport, runway, taxiway, sign, marking, light | PHAK Ch 14, AIM |
| `general` | (fallback) | Everything else |

### 5.4 Quality Filtering

Not all extracted images are useful. Filter criteria:

| Criterion | Threshold | Reason |
|-----------|-----------|--------|
| Minimum dimensions | 100 x 100 px | Skip icons, bullets, logos |
| Minimum file size | 5 KB | Skip tiny decorative elements |
| Maximum aspect ratio | 10:1 | Skip horizontal rules, borders |
| Duplicate detection | SHA-256 hash (stored in `content_hash` column with index) | Same image used in multiple chapters — skip re-upload, reuse existing `source_images` row. Dedup is per-extraction-run via hash lookup before upload. |
| Color depth | ≥ 8-bit | Skip 1-bit stamps/marks |

### 5.5 Page Number Backfill

> **[R1-FIX: Improved backfill reliability and performance]**

During extraction, the script also records which pages each text passage appears on. This data is written back to `source_chunks.page_start` and `source_chunks.page_end` via a secondary pass, enabling page-proximity linking.

**Improved approach (addressing O(chunks × pages) concern):**

1. **Precompute per-page text**: For each document, extract all page text once with PyMuPDF and normalize it (lowercase, collapse whitespace, remove line-break hyphens). Store as a list indexed by page number.

2. **Multi-anchor search**: For each chunk, extract 3 short anchors (~40 chars each) from the chunk's start, middle, and end. Search for these anchors in the normalized page text. A page matches if ≥2 of 3 anchors are found.

3. **Constrained search range**: Since chunks are ordered by `chunk_index` and documents are processed sequentially, maintain a cursor. Only search pages within ±10 of the last matched page for subsequent chunks. This reduces the search from O(pages) to O(1) amortized.

4. **Graceful fallback**: If no page match is found, set `page_start = NULL` (keep existing behavior). Record "backfill_miss" count in the extraction log for monitoring.

Expected runtime: ~1-2 seconds per document (vs. potentially minutes with naive approach).

### 5.6 AI Description Generation

> **[R1-FIX: Description generation plan]**

The `description` field on `source_images` provides accessibility alt-text and enables future text-based semantic search over images. Generation strategy:

- **Scope**: Only generate descriptions for images where `is_oral_exam_relevant = TRUE` (~380-640 images)
- **Timing**: Run as a separate batch pass after image extraction (not inline during extraction)
- **Method**: Use Claude Sonnet with the image URL to generate a 1-2 sentence description
- **Cost**: ~750 input tokens + ~50 output tokens per image × ~500 images ≈ ~$1.20 total (one-time)
- **Tracking**: `description_model` and `described_at` columns record provenance. Images with `description IS NULL AND is_oral_exam_relevant = TRUE` are candidates for generation.
- **Validation**: Spot-check 20 random descriptions for accuracy before marking batch complete.

### 5.7 Image Versioning Strategy

> **[R1-FIX: Handling FAA document updates]**

FAA documents are updated infrequently (PHAK revisions every 3-5 years). When a new revision is published:

1. **Detection**: Compare new PDF's SHA-256 hash against `source_documents.file_name` to identify changed documents.
2. **Re-extraction**: Run extraction pipeline on the updated PDF. New images get new UUIDs; `content_hash` comparison identifies which images are genuinely new vs. unchanged.
3. **Linking**: Re-run linking for affected documents only.
4. **Cleanup**: Old images from superseded documents are marked `is_oral_exam_relevant = FALSE` (soft delete, not hard delete) to preserve any historical references.
5. **Storage**: Old image files remain in storage (negligible cost) to avoid broken URLs in any cached responses.

This is a manual, infrequent process — no automated update detection is needed.

### 5.8 Expected Output Volumes

| Document Set | Est. Extracted Images | Est. Oral-Relevant | Storage |
|-------------|----------------------|--------------------|---------|
| PHAK (22 chapters) | ~400-600 | ~200-300 | ~150 MB |
| Testing Supplement | ~100-200 | ~80-150 | ~100 MB |
| AFH (24 chapters) | ~300-500 | ~50-100 | ~100 MB |
| AIM | ~50-100 | ~30-50 | ~30 MB |
| Advisory Circulars | ~50-100 | ~20-40 | ~20 MB |
| **Total** | **~900-1500** | **~380-640** | **~400 MB** |

Supabase Storage free tier: 1 GB. Pro tier: 100 GB. 400 MB fits comfortably in the free tier.

---

## 6. Figure-to-Chunk Linking

### 6.1 Linking Strategies (in priority order)

**Strategy 1: Figure Reference Matching (highest precision)**

Scan existing `source_chunks.content` for figure reference patterns:

```python
# In chunk text: "See Figure 3-1" or "as shown in Figure 3-1"
CHUNK_FIGURE_REFS = [
    r'(?:see|refer to|shown in|illustrated in|depicted in)?\s*'
    r'(?:Figure|Fig\.|Table|Chart)\s+(\d+[-–]\d+)',
]
```

Match extracted figure labels to these references. Set `link_type = 'figure_ref'`, `relevance_score = 0.9`.

**Strategy 2: Caption Content Overlap (high precision)**

Compare image captions to chunk text using trigram similarity:

```sql
-- Chunks whose content overlaps significantly with the image caption
SELECT c.id, similarity(c.content, si.caption) AS sim
FROM source_chunks c, source_images si
WHERE similarity(c.content, si.caption) > 0.3;
```

Set `link_type = 'caption_match'`, `relevance_score = similarity_score`.

**Strategy 3: Same-Page Proximity (medium precision)**

When `page_start`/`page_end` are populated, link images to chunks on the same page:

```sql
INSERT INTO chunk_image_links (chunk_id, image_id, link_type, relevance_score)
SELECT c.id, si.id, 'same_page', 0.5
FROM source_chunks c
JOIN source_images si ON si.document_id = c.document_id
WHERE si.page_number BETWEEN c.page_start AND c.page_end;
```

### 6.2 Link Deduplication

> **[R1-FIX: Preserve strongest link_type when existing score is higher]**

If multiple strategies link the same chunk-image pair, keep the highest-scoring link and its corresponding type:

```sql
-- Upsert: keep highest relevance_score AND its associated link_type
INSERT INTO chunk_image_links (chunk_id, image_id, link_type, relevance_score)
VALUES ($1, $2, $3, $4)
ON CONFLICT (chunk_id, image_id) DO UPDATE
SET relevance_score = GREATEST(chunk_image_links.relevance_score, EXCLUDED.relevance_score),
    link_type = CASE
      WHEN EXCLUDED.relevance_score > chunk_image_links.relevance_score
        THEN EXCLUDED.link_type
      ELSE chunk_image_links.link_type
    END;
```

This ensures that when the existing score is higher, the original `link_type` rationale is preserved.

### 6.3 Expected Link Coverage

| Strategy | Est. Links Created | Precision |
|----------|-------------------|-----------|
| Figure reference | ~500-1000 | ~95% |
| Caption match | ~200-400 | ~80% |
| Same-page | ~1000-2000 | ~60% |
| **Total (deduplicated)** | **~1500-3000** | — |

Not every chunk will have linked images — only those discussing visual concepts. Estimated coverage: ~20-30% of oral-exam-relevant chunks will have at least one linked image.

---

## 7. Application Layer Integration

### 7.1 RAG Retrieval Changes

The existing `searchChunks()` function in `src/lib/rag-retrieval.ts` returns `ChunkSearchResult[]`. After retrieval, a second query fetches linked images.

**New function in `src/lib/rag-retrieval.ts`:**

```typescript
export interface ImageResult {
  image_id: string;
  figure_label: string | null;
  caption: string | null;
  image_category: string;
  public_url: string;
  width: number;
  height: number;
  description: string | null;
  doc_abbreviation: string;
  page_number: number;
  link_type: string;
  relevance_score: number;
}

// [R1-FIX: Log RPC errors instead of silent swallowing]
export async function getImagesForChunks(
  chunkIds: string[]
): Promise<ImageResult[]> {
  if (chunkIds.length === 0) return [];

  const { data, error } = await supabase.rpc('get_images_for_chunks', {
    chunk_ids: chunkIds,
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

  if (error) {
    console.error('getImagesForChunks RPC failed:', error.message, { chunkCount: chunkIds.length });
    return [];
  }
  // [R3-FIX: Filter out images with NULL public_url (missing supabase_url config)]
  const results = (data ?? []) as ImageResult[];
  const valid = results.filter(img => img.public_url != null);
  if (valid.length < results.length) {
    console.warn(`${results.length - valid.length} images had NULL public_url (check app.settings.supabase_url)`);
  }
  return valid;
}
```

### 7.2 Exam Engine Changes

In `src/lib/exam-engine.ts`, the `fetchRagContext()` function is modified to also return linked images:

> **[R1-FIX: Log errors instead of silent catch; add `import 'server-only'`]**
> The existing `fetchRagContext()` has a bare `catch` that silently returns empty results.
> As part of this change, add `console.error` logging to the existing catch block
> and ensure the module has `import 'server-only'` at the top.

```typescript
// At top of file:
import 'server-only';  // [R1-FIX: Prevent client-bundle inclusion]

export async function fetchRagContext(
  task: AcsTaskRow,
  history: ExamMessage[],
  studentAnswer?: string,
  matchCount: number = 5
): Promise<{
  ragContext: string;
  ragChunks: ChunkSearchResult[];
  ragImages: ImageResult[];    // NEW
}> {
  try {
    // ... existing code ...
    const ragChunks = await searchChunks(query, { matchCount });
    const ragContext = formatChunksForPrompt(ragChunks);

    // Fetch linked images
    const chunkIds = ragChunks.map(c => c.id);
    const ragImages = await getImagesForChunks(chunkIds);

    return { ragContext, ragChunks, ragImages };
  } catch (err) {
    // [R1-FIX: Log instead of silent swallow]
    console.error('fetchRagContext failed:', err instanceof Error ? err.message : err);
    return { ragContext: '', ragChunks: [], ragImages: [] };
  }
}
```

### 7.3 Image Selection Logic

Not every image should be shown. Selection criteria:

1. **Relevance threshold**: Only show images with `relevance_score >= 0.7` (figure_ref links) OR the top 2 images by score if none meet the threshold
2. **Deduplication**: Same figure across multiple chunks → show once
3. **Maximum display**: Show at most 3 images per examiner turn (avoid overwhelming the UI)
4. **Category preference**: For a given question, prefer images matching the ACS area topic (e.g., weather images for PA.I.C questions)

### 7.4 SSE Stream Extension

The existing SSE stream sends `{ token }`, `{ examinerMessage }`, `{ assessment }`, and `[DONE]`. Add a new event type:

```typescript
// After examinerMessage, before assessment
controller.enqueue(
  encoder.encode(`data: ${JSON.stringify({ images: selectedImages })}\n\n`)
);
```

Client-side handler accumulates images alongside the examiner message.

---

## 8. UI Design

### 8.1 Image Display Component

Images appear in a collapsible panel below the examiner's message, between the question text and the student's input area.

```
┌─────────────────────────────────────────┐
│ DPE: "Looking at the airspace diagram,  │
│ can you tell me the dimensions of       │
│ Class B airspace at a primary airport?"  │
├─────────────────────────────────────────┤
│ 📎 Reference Materials                [▼]│
│ ┌─────────────────────────────────────┐ │
│ │         [Airspace Diagram]          │ │
│ │      (PHAK Figure 15-1, p. 15-3)   │ │
│ └─────────────────────────────────────┘ │
│ ┌────────────┐ ┌────────────┐          │
│ │ [Airport   ]│ │ [Class B   ]│          │
│ │  Signs     ]│ │  Profile   ]│          │
│ │ (Fig 14-2) │ │ (Fig 15-4) │          │
│ └────────────┘ └────────────┘          │
├─────────────────────────────────────────┤
│ [Your answer input area...]             │
└─────────────────────────────────────────┘
```

### 8.2 Component Structure

```typescript
// New component: src/components/ExamImages.tsx
interface ExamImagesProps {
  images: ImageResult[];
  isCollapsible?: boolean;
  defaultExpanded?: boolean;
}
```

Features:
- **Collapsible panel** with "Reference Materials" header — expanded by default when images are present
- **Primary image** displayed large (max-width: 100%, up to 600px)
- **Secondary images** displayed as smaller thumbnails in a row
- **Click to enlarge** — lightbox overlay for detailed examination
- **Caption** shown below each image with figure label and source document
- **Keyboard accessible** — Enter/Space to expand, Escape to close lightbox
- **Responsive** — single column on mobile, side-by-side on desktop

### 8.3 Lightbox Behavior

When an image is clicked:
- Full-screen overlay with dark backdrop
- Image displayed at maximum resolution (constrained to viewport)
- Pinch-to-zoom on mobile, scroll-to-zoom on desktop
- Caption and source shown below the image
- Close via X button, Escape key, or clicking outside

Implementation: Use a minimal custom lightbox (no heavy library). The core is a fixed-position overlay with `object-fit: contain`.

### 8.4 Dark Theme Integration

All images get a subtle treatment to integrate with the gray-950 dark theme:
- Images displayed with `rounded-lg border border-gray-700`
- Caption text: `text-sm text-gray-400`
- Figure label: `text-xs font-medium text-gray-300`
- Lightbox backdrop: `bg-black/80 backdrop-blur-sm`

---

## 9. Claude Vision Integration (Phase 5)

### 9.1 Multimodal Exam Questions

For certain question types, the examiner can explicitly reference a displayed image:

```
DPE: "I'm showing you a section of a sectional chart.
Can you identify the airspace type and its dimensions
in the highlighted area?"

[Sectional chart excerpt displayed]
```

This requires including the image in the Claude API call:

```typescript
const messages = [
  ...history,
  {
    role: 'user',
    content: [
      {
        type: 'image',
        source: {
          type: 'url',
          url: imagePublicUrl,
        },
      },
      {
        type: 'text',
        text: 'The applicant can see this image. Ask them about it.',
      },
    ],
  },
];
```

### 9.2 Visual Assessment

When the student answers a question about a displayed chart, the image is included in the `assessAnswer()` call so Claude can validate whether the student's interpretation is correct:

```typescript
// In assessAnswer(), when images were shown for this question
const assessmentMessages = [
  {
    role: 'user',
    content: [
      ...(questionImages.map(img => ({
        type: 'image' as const,
        source: { type: 'url' as const, url: img.public_url },
      }))),
      {
        type: 'text' as const,
        text: `The applicant was shown the above image(s) and asked: "${examinerQuestion}"\n\nStudent's answer: ${studentAnswer}\n\nAssess this answer.`,
      },
    ],
  },
];
```

### 9.3 Cost Impact

Claude Vision pricing: ~750 tokens per 1024x1024 image.

Per question with 1-2 images:
- Examiner call: +750-1500 input tokens → ~$0.002-0.005
- Assessment call: +750-1500 input tokens → ~$0.002-0.005
- **Per-image-question overhead**: ~$0.004-0.01

At 2-3 image questions per 15-exchange session: **~$0.01-0.03 additional per session**. Negligible compared to existing LLM costs ($0.19-0.33/session).

---

## 10. Supabase Storage Configuration

### 10.1 Bucket Setup

> **[R1-FIX: CRITICAL — Explicit read-only public access, write protection]**

```sql
-- Create storage bucket for source images (via Supabase dashboard or API)
-- Bucket name: 'source-images'
-- Public: YES for READS (images served via CDN, no auth needed for display)
-- File size limit: 10 MB
-- Allowed MIME types: image/png, image/jpeg, image/webp
--
-- WRITE PROTECTION: No Storage policies grant INSERT/UPDATE/DELETE to
-- authenticated or anon roles. Only the extraction script (using
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses Storage RLS) can upload.
-- See Section 4.2.1 for Storage RLS policies.
--
-- IMPORTANT: Verify in Supabase Dashboard → Storage → Policies that
-- no default policies allow unauthenticated writes.
```

### 10.2 Storage Path Convention

> **[R2-FIX + R3-FIX: Safe filename convention]** All storage paths MUST use URL-safe characters only:
> lowercase letters, digits, hyphens, forward slashes, and dots (for file extensions only).
> No spaces, underscores, or other special characters.
> The extraction script enforces this via `re.sub(r'[^a-z0-9/\-.]', '-', path)`.
> This avoids URL encoding issues when `public_url` is derived from `storage_path` in the RPC.

```
source-images/
├── phak/
│   ├── ch03/
│   │   ├── figure-3-1.png
│   │   ├── figure-3-2.png
│   │   └── ...
│   ├── ch15/
│   │   └── figure-15-1.png
│   └── ...
├── testing-supplement/
│   ├── page-042.png
│   └── ...
├── aim/
│   └── ...
└── advisory-circulars/
    └── ...
```

### 10.3 Image Optimization

Before upload, the extraction script optimizes images:

| Format | Use Case | Quality |
|--------|----------|---------|
| PNG | Diagrams, charts with text (lossless needed) | As-is |
| JPEG | Photos, complex illustrations | Quality 85 |
| WebP | Large images > 500 KB (better compression) | Quality 85 |

Target: Keep individual images under 500 KB where possible. Supabase image transformations can serve resized versions for thumbnails.

### 10.4 CDN URLs

Supabase Storage generates public URLs in the format:
```
https://{project-ref}.supabase.co/storage/v1/object/public/source-images/{path}
```

For thumbnails, use Supabase image transformations:
```
https://{project-ref}.supabase.co/storage/v1/render/image/public/source-images/{path}?width=200&height=200&resize=contain
```

---

## 11. Testing Strategy

### 11.1 Extraction Pipeline Tests

| Test | Method |
|------|--------|
| Figure label regex patterns match FAA format | Unit test (Python pytest) |
| Caption extraction from known PHAK pages | Integration test with sample PDF |
| Quality filtering removes icons/bullets | Unit test with synthetic images |
| Duplicate detection works across chapters | Unit test with duplicate hashes |
| Page number backfill accuracy | Integration test: known pages vs extracted |

### 11.2 Linking Tests

| Test | Method |
|------|--------|
| Figure reference regex matches in chunk text | Unit test (Vitest) |
| `get_images_for_chunks` RPC returns correct data | Integration test (Supabase) |
| Deduplication: same image via multiple links | Integration test |
| No images returned for chunks without links | Unit test |

### 11.3 UI Tests

| Test | Method |
|------|--------|
| ExamImages renders images with captions | Component test (Vitest + testing-library) |
| Lightbox opens/closes correctly | Component test |
| Collapsible panel expands/collapses | Component test |
| SSE image event parsed correctly | Unit test |
| No image panel when no images available | Unit test |

### 11.4 End-to-End Validation

Manual testing checklist:
- Start exam on PA.I.C (Weather) → weather chart images should appear
- Start exam on PA.III (Airport Ops) → airport diagram/signage images should appear
- Start exam on PA.IX (Emergency) → no images expected (mostly verbal topics)
- Click image → lightbox opens at full resolution
- Lightbox: Escape key closes, click outside closes
- Mobile: images responsive, lightbox works with touch

---

## 12. Rollout Strategy

### 12.1 Phased Rollout

**Phase 1: Extraction + Storage (offline, no user impact)**
- Run Python extraction on PHAK + Testing Supplement (highest value)
- Upload to Supabase Storage
- Populate `source_images` table
- Manual review: spot-check 50 random images for quality

**Phase 2: Linking (offline, no user impact)**
- Run figure reference matching
- Run page proximity linking
- Generate `chunk_image_links`
- Validate: check 20 random chunks → verify linked images are topically correct

**Phase 3: UI integration (feature-flagged)**
- Add `ExamImages` component behind a feature flag (e.g., `NEXT_PUBLIC_SHOW_EXAM_IMAGES=true`)
- Deploy to production with flag OFF
- Enable for beta testers (Piotr) for validation

**Phase 4: General availability**
- **[R1-FIX]** Convert feature flag to a server-controlled operational kill-switch (environment variable) — do NOT remove entirely. Keep `NEXT_PUBLIC_SHOW_EXAM_IMAGES` as a permanent kill-switch that can instantly disable image display in production if issues arise.
- Enable by default for all users
- Monitor: no performance regression (page load, SSE latency)
- Expand to AFH, AIM, Advisory Circulars

**Phase 5: Claude Vision (separate iteration)**
- Enable multimodal questions for specific ACS areas
- Requires additional testing for assessment accuracy

### 12.2 Rollback Plan

- Feature flag OFF disables image display instantly
- Storage bucket and database tables remain (no data loss)
- No changes to existing text-only RAG pipeline

---

## 13. Performance Considerations

### 13.1 Image Loading

- Images served from Supabase CDN (edge-cached)
- Thumbnails via Supabase image transformations (200x200)
- Full images loaded lazily on lightbox open
- `loading="lazy"` on all `<img>` tags
- Estimated overhead per examiner turn: 1 RPC call (~50ms) + 0-3 image loads (~100-300ms, cached after first load)

### 13.2 Database Query Performance

- `get_images_for_chunks` RPC: JOIN on indexed columns, filtered by `is_oral_exam_relevant`, typically returns 0-5 rows → <10ms
- No impact on existing text RAG query performance

### 13.3 SSE Payload Size

- Image metadata (URL, caption, dimensions) adds ~200-500 bytes per image
- 3 images max → ~1.5 KB additional SSE data → negligible

---

## 14. Security Considerations

> **[R1-FIX: CRITICAL — Service-role key isolation and Storage write protection]**

- **Storage bucket write protection**: The `source-images` bucket is public for reads only. No Storage RLS policies grant write access to `authenticated` or `anon` roles. Only the offline extraction script (using `SUPABASE_SERVICE_ROLE_KEY`) can upload/modify/delete objects. See Section 4.2.1 for explicit Storage policies.

- **Service-role key isolation**: Modules that use `SUPABASE_SERVICE_ROLE_KEY` (`src/lib/rag-retrieval.ts`, `src/lib/exam-engine.ts`, and the new `getImagesForChunks`) MUST include `import 'server-only';` at the top to prevent accidental client-bundle exposure in Next.js. The service-role Supabase client should be isolated in a dedicated server-only module (e.g., `src/lib/supabase-admin.ts`). **Action item**: As part of Phase 2, add `import 'server-only'` to all modules using service-role key and verify no `'use client'` component tree imports them.

- Storage images are FAA public domain documents — no sensitive data in the images themselves
- No user-uploaded images (attack surface limited to read-only serving)
- Image URLs are deterministic (path-based) but contain no auth tokens
- RLS on `source_images` and `chunk_image_links` restricts database reads to authenticated users; admin-only writes
- The extraction script runs offline with service role key (not exposed to clients)

---

## 15. Cost Analysis

### 15.1 One-Time Costs

| Item | Cost |
|------|------|
| Supabase Storage (~400 MB) | Free tier (1 GB included) |
| PyMuPDF license | Free (AGPL-3.0). Used strictly as an offline CLI extraction tool — not distributed, not embedded in the web app, not accessed over a network. AGPL copyleft obligations do not apply to internal-only offline scripts. If this compliance posture changes (e.g., extraction moves to a web service), re-evaluate licensing. |
| Developer time | ~8-12 days across all phases |

### 15.2 Ongoing Costs

| Item | Per-Session Cost |
|------|-----------------|
| Supabase Storage bandwidth | ~$0.00 (CDN-cached, low volume) |
| Additional RPC query | ~$0.00 (included in Supabase plan) |
| Claude Vision tokens (Phase 5 only) | ~$0.01-0.03 per session |

**Total marginal cost increase: effectively $0.00 for Phases 1-4, ~$0.01-0.03 for Phase 5.**

---

## 16. Implementation Prerequisites (Existing Code Hardening)

> These are fixes to **existing** checked-in code that must be applied as the first step
> of implementation. They are not design changes but are documented here for completeness
> since GPT-5.2 flagged them during review.

| File | Fix | Rationale |
|------|-----|-----------|
| `src/lib/exam-engine.ts` | Add `import 'server-only';` at top | Prevents accidental client-bundle inclusion of `SUPABASE_SERVICE_ROLE_KEY` |
| `src/lib/rag-retrieval.ts` | Add `import 'server-only';` at top | Same as above |
| `src/lib/exam-engine.ts:96-98` | Replace bare `catch {}` with `catch (err) { console.error('fetchRagContext failed:', err); ... }` | Silent error swallowing hides production failures |
| `scripts/ingest-sources.ts:460-468` | Batch embedding updates (use `Promise.allSettled` with concurrency limit) | One-at-a-time updates are slow for large ingests |
| `supabase/migrations/20260214000005:106-150` | Add `SET search_path = public` to `chunk_hybrid_search` SECURITY DEFINER function | Prevents object-shadowing attacks in SECURITY DEFINER context |
| `src/lib/rag-retrieval.ts:38-46` | Add early return when `query.trim().length < 3` | Avoids unnecessary OpenAI embedding calls on empty/trivial queries |

These are one-time fixes applied in the first commit of Phase 2, before any image-specific changes.

---

## 17. Implementation Phases — Summary

### Phase 1: Image Extraction Pipeline (3-4 days)
- Set up Python environment with PyMuPDF
- Write extraction script for embedded images + page renders
- Figure label and caption detection
- Quality filtering and deduplication (SHA-256 `content_hash`)
- Image optimization (PNG/JPEG/WebP)
- Run on PHAK + Testing Supplement
- Upload to Supabase Storage
- **[R1-FIX]** Ingest Testing Supplement text via PyMuPDF per-page extraction (bypassing `pdf-parse` 100MB limit) to enable text-chunk-based linking for this critical document

### Phase 2: Database Schema + Storage (1 day)
- Create migration for `source_images` and `chunk_image_links` tables (with CHECK constraints)
- Create `get_images_for_chunks` RPC function (deterministic ordering, derived URLs)
- Set up Supabase Storage bucket with read-only public access + write protection policies
- Backfill `page_start`/`page_end` in existing chunks (multi-anchor search with cursor)
- **[R1-FIX]** Add `import 'server-only'` to all modules using `SUPABASE_SERVICE_ROLE_KEY`

### Phase 3: Figure-to-Chunk Linking (1-2 days)
- Figure reference pattern matching in chunk text
- Caption content overlap matching
- Page proximity linking
- Link deduplication and quality scoring

### Phase 4: UI Display (1-2 days)
- `ExamImages` component with collapsible panel
- Lightbox for full-resolution viewing
- SSE stream extension for image events
- Integration with practice page
- Feature flag for controlled rollout

### Phase 5: Claude Vision Assessment (2-3 days)
- Multimodal examiner prompts with images
- Visual assessment (include images in assessment calls)
- Question type detection: "chart interpretation" triggers image inclusion
- Testing and validation of assessment accuracy with visual questions
