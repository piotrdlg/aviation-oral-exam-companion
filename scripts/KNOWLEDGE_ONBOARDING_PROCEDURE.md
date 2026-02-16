# Knowledge Onboarding Procedure

Complete procedure for adding new certificate ratings (Commercial Pilot, Instrument Rating, etc.) to the Aviation Oral Exam Companion. Covers every step from ACS source identification through image extraction, text ingestion, embedding, and chunk-image linking.

**Last verified**: February 15, 2026 (Private Pilot rating onboarding)

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Phase 1: Identify Knowledge Sources from ACS](#2-phase-1-identify-knowledge-sources-from-acs)
3. [Phase 2: Acquire and Organize Source PDFs](#3-phase-2-acquire-and-organize-source-pdfs)
4. [Phase 3: Split Multi-Chapter PDFs](#4-phase-3-split-multi-chapter-pdfs)
5. [Phase 4: Register Document Registry in Ingestion Script](#5-phase-4-register-document-registry-in-ingestion-script)
6. [Phase 5: Text Ingestion and Embedding](#6-phase-5-text-ingestion-and-embedding)
7. [Phase 6: Image Extraction](#7-phase-6-image-extraction)
8. [Phase 7: Image-to-Chunk Linking](#8-phase-7-image-to-chunk-linking)
9. [Phase 8: Seed ACS Tasks](#9-phase-8-seed-acs-tasks)
10. [Phase 9: Seed ACS Elements and Classify Difficulty](#10-phase-9-seed-acs-elements-and-classify-difficulty)
11. [Phase 10: Verification](#11-phase-10-verification)
12. [Appendix A: Database Schema Reference](#appendix-a-database-schema-reference)
13. [Appendix B: Troubleshooting](#appendix-b-troubleshooting)

---

## 1. Prerequisites

### Environment

| Requirement | Details |
|-------------|---------|
| Node.js | >= 18 |
| Python | >= 3.11 |
| Supabase CLI | `npx supabase` (project linked) |
| Environment file | `.env.local` with all keys (see below) |

### Required `.env.local` Keys

```
NEXT_PUBLIC_SUPABASE_URL=https://pvuiwwqsumoqjepukjhz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
OPENAI_API_KEY=<openai-key>
ANTHROPIC_API_KEY=<anthropic-key>
```

### Python Virtual Environment

```bash
cd scripts/extract-images
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**requirements.txt** contents:
```
PyMuPDF>=1.24.0
Pillow>=10.0.0
supabase>=2.0.0
python-dotenv>=1.0.0
pytest>=8.0.0
```

### npm Dependencies

From project root:
```bash
npm install
```

Key packages used by scripts: `@supabase/supabase-js`, `openai`, `pdf-parse`, `dotenv`.

---

## 2. Phase 1: Identify Knowledge Sources from ACS

### Step 1: Download the ACS Document

Each FAA certificate/rating has its own Airman Certification Standards document:

| Rating | ACS Document | FAA Number |
|--------|-------------|------------|
| Private Pilot | Private Pilot ACS | FAA-S-ACS-6C |
| Instrument Rating | Instrument Rating ACS | FAA-S-ACS-8C |
| Commercial Pilot | Commercial Pilot ACS | FAA-S-ACS-7B |

Download from: https://www.faa.gov/training_testing/testing/acs

### Step 2: Extract the Reference List

Open the ACS PDF and locate the **"References"** section (typically pages 3-5). This lists every document the FAA considers testable material.

For Private Pilot (FAA-S-ACS-6C), there are 30 referenced documents. Document categories:

| Category | Examples |
|----------|----------|
| **Code of Federal Regulations** | 14 CFR Parts 39, 43, 61, 68, 71, 91, 93 |
| **FAA Handbooks** | PHAK, AFH, IFH, AWH, RMH, WBH, Seaplane |
| **Advisory Circulars** | AC 60-28B, AC 61-67C, AC 68-1A, etc. |
| **Other** | AIM, Chart Supplement, USCG Nav Rules |

### Step 3: Create Source Checklist

Create a checklist of all referenced documents with download URLs. Reference the existing `sources/README.md` for the Private Pilot format.

**Download sources:**
- CFRs: https://www.govinfo.gov/content/pkg/CFR-2025-title14-vol1/pdf/
- Handbooks: https://www.faa.gov/regulations_policies/handbooks_manuals
- Advisory Circulars: https://www.faa.gov/regulations_policies/advisory_circulars
- AIM: https://www.faa.gov/air_traffic/publications

---

## 3. Phase 2: Acquire and Organize Source PDFs

### Directory Structure Convention

```
sources/
├── <rating>/              # One top-level dir per NEW rating's unique sources
│   └── acs/               # The ACS document itself
├── phak/                  # Shared across ratings (already populated)
├── afh/                   # Shared across ratings (already populated)
├── aim/                   # Shared
├── cfr/                   # Shared
├── handbooks/             # Shared
├── ac/                    # Shared
├── other/                 # Shared
└── README.md              # Master document inventory
```

**Important**: Many sources are shared between ratings (PHAK, AFH, AIM, CFRs). Do NOT re-download or duplicate files that already exist. Only add documents that are new for the rating being added.

### File Naming Convention

Pattern: `<prefix>_<description>.pdf` using underscores, lowercase.

Examples:
- `14_CFR_Part_91.pdf`
- `FAA-H-8083-25B_PHAK_ch3.pdf`
- `AC_61-67C_Stall_Spin_Awareness.pdf`

### Step-by-Step

1. Download each PDF from the FAA source
2. Place in the appropriate subdirectory under `sources/`
3. Verify file integrity: `python3 -c "import fitz; doc=fitz.open('file.pdf'); print(len(doc), 'pages')"`
4. Update `sources/README.md` with the new entries

---

## 4. Phase 3: Split Multi-Chapter PDFs

Large handbooks (IFH, AWH, WBH, RMH) come as single monolithic PDFs. They must be split into chapter-level files for the ingestion pipeline (which registers one `source_documents` row per file).

### Script: `scripts/split_pdfs.py`

This script uses `pypdf` to split PDFs by page ranges. It contains hardcoded chapter boundaries for each handbook.

**To add a new handbook:**

1. Open the PDF and identify chapter boundaries (page numbers)
2. Add a new `split_<abbrev>()` function in `split_pdfs.py`
3. Define chapters as a list of `(start_page_1indexed, filename_suffix, display_name)` tuples

Example pattern:
```python
def split_cph():
    """Split Commercial Pilot Handbook into chapters."""
    path = os.path.join(SOURCES, "handbooks", "FAA-H-8083-xxx.pdf")
    output_dir = os.path.join(SOURCES, "handbooks", "cph_chapters")

    chapters = [
        (1,   "00_front",  "Front Matter"),
        (20,  "01_ch1",    "Ch 1 — Title"),
        (45,  "02_ch2",    "Ch 2 — Title"),
        # ... determine from PDF bookmarks or manual inspection
    ]

    split_pdf(path, chapters, output_dir, "cph")
```

4. Call the function from `__main__`
5. Run: `python3 scripts/split_pdfs.py`

**Tip**: Use `get_top_level_bookmarks(reader)` to auto-discover chapter boundaries from PDF bookmarks (works for AWH, may work for others).

### Handbook Abbreviation Conventions

| Handbook | Abbreviation | Directory |
|----------|-------------|-----------|
| Pilot's Handbook of Aeronautical Knowledge | `phak` | `sources/phak/` |
| Airplane Flying Handbook | `afh` | `sources/afh/` |
| Instrument Flying Handbook | `ifh` | `handbooks/ifh_chapters/` |
| Aviation Weather Handbook | `awh` | `handbooks/awh_chapters/` |
| Risk Management Handbook | `rmh` | `handbooks/rmh_chapters/` |
| Weight & Balance Handbook | `wbh` | `handbooks/wbh_chapters/` |

---

## 5. Phase 4: Register Document Registry in Ingestion Script

### Script: `scripts/ingest-sources.ts`

The function `buildDocumentRegistry()` maps filesystem PDFs to metadata. When adding a new rating's sources, extend this function.

### Adding a New Document Group

Add a new block inside `buildDocumentRegistry()`:

```typescript
// Commercial Pilot Handbook chapters
const cphDir = path.join(SOURCES_DIR, 'handbooks', 'cph_chapters');
if (fs.existsSync(cphDir)) {
  const cphFiles = fs.readdirSync(cphDir).filter(f => f.endsWith('.pdf')).sort();
  for (const file of cphFiles) {
    const match = file.match(/ch(\d+)/i);
    const chNum = match ? parseInt(match[1]) : null;
    docs.push({
      title: `CPH ${file.replace('.pdf', '').replace(/_/g, ' ')}`,
      faa_number: 'FAA-H-8083-xxx',
      abbreviation: 'cph',
      document_type: 'handbook',
      chapter_number: chNum,
      chapter_title: null,
      file_path: `handbooks/cph_chapters/${file}`,
    });
  }
}
```

**Critical fields:**
- `abbreviation`: Short lowercase code (e.g., `phak`, `afh`, `cph`). Used as storage path prefix and for filtering.
- `document_type`: One of `'handbook' | 'ac' | 'cfr' | 'aim' | 'other'`
- `file_path`: Relative to `sources/` directory

---

## 6. Phase 5: Text Ingestion and Embedding

### Primary Script: `scripts/ingest-sources.ts`

This is the main text ingestion pipeline. It:
1. Reads each PDF using `pdf-parse`
2. Splits text into ~800-token chunks with 100-token overlap
3. Inserts `source_documents` rows (dedup by `file_name`)
4. Inserts `source_chunks` rows with SHA-256 `content_hash`
5. Generates OpenAI `text-embedding-3-small` embeddings (1536 dimensions)
6. Updates chunks with embeddings

### Running

```bash
# Gold subset only (PHAK, AFH, AIM):
npx tsx scripts/ingest-sources.ts --subset gold

# All sources including handbooks, CFRs, ACs, other:
npx tsx scripts/ingest-sources.ts --subset all

# Skip embedding generation (text only):
npx tsx scripts/ingest-sources.ts --subset all --skip-embeddings
```

### What Happens

- Documents already in DB (matched by `file_name`) are re-ingested: existing chunks deleted, new ones inserted
- Embedding generation uses OpenAI API (costs ~$0.02 per 1M tokens)
- Files > 100MB are skipped (use `ingest_text.py` for those)

### Large PDF Fallback: `scripts/extract-images/ingest_text.py`

For PDFs > 100MB (e.g., FAA Testing Supplement at 168MB):

```bash
# First, find or create the source_documents row and note its UUID
# Then run:
cd scripts/extract-images
source .venv/bin/activate
python3 ingest_text.py --pdf ../../sources/other/FAA-CT-8080-2H_Testing_Supplement.pdf --doc-id <uuid>

# Dry run to preview chunks:
python3 ingest_text.py --pdf <path> --doc-id <uuid> --dry-run
```

### Verification

After ingestion, verify in Supabase:
```sql
SELECT abbreviation, COUNT(*) as chunks,
       COUNT(embedding) as embedded
FROM source_chunks sc
JOIN source_documents sd ON sd.id = sc.document_id
GROUP BY abbreviation
ORDER BY abbreviation;
```

---

## 7. Phase 6: Image Extraction

### Script: `scripts/extract-images/extract.py`

Extracts images from PDF files using PyMuPDF, classifies them, converts to web-optimized formats, and uploads to Supabase Storage.

### How It Works

1. **Document ID Resolution**: Fetches all `source_documents` rows once, matches PDF filenames to DB records locally using normalized string matching
2. **Image Extraction**: Uses PyMuPDF to extract embedded images from each page
3. **Quality Filtering**: Skips images < 100x100px, < 5KB, or aspect ratio > 10:1
4. **Colorspace Handling**: Converts CMYK/DeviceN/Lab to RGB; skips null-colorspace masks/stencils
5. **Optimization**: Large images → WebP (quality 85), transparency → PNG, default → JPEG (quality 85)
6. **Deduplication**: SHA-256 hash-based dedup within a run AND across runs (checks DB)
7. **Metadata Extraction**: Detects figure labels (e.g., "Figure 3-1") and captions from nearby text
8. **Upload**: Files go to `source-images` Supabase Storage bucket; metadata to `source_images` table

### Running

```bash
cd scripts/extract-images
source .venv/bin/activate

# Extract from all PDFs in a directory:
python3 extract.py --source-dir ../../sources/phak

# Filter to specific files:
python3 extract.py --source-dir ../../sources/phak --document-filter ch3

# Dry run (no uploads):
python3 extract.py --source-dir ../../sources/phak --dry-run

# Process all source directories:
python3 extract.py --source-dir ../../sources/phak
python3 extract.py --source-dir ../../sources/afh
python3 extract.py --source-dir ../../sources/aim/chapters
python3 extract.py --source-dir ../../sources/handbooks
python3 extract.py --source-dir ../../sources/other
python3 extract.py --source-dir ../../sources/cfr
python3 extract.py --source-dir ../../sources/ac
python3 extract.py --source-dir ../../sources/acs
```

### Prerequisite: Source Documents Must Exist in DB

The image extraction pipeline resolves `document_id` by matching PDF filenames to rows in the `source_documents` table. If a PDF has no matching row, it is skipped with a warning.

**The text ingestion step (Phase 5) must run first** — it creates the `source_documents` rows.

### Storage Bucket

The `source-images` bucket must exist in Supabase Storage before first run. Created via:

```javascript
const { data, error } = await supabase.storage.createBucket('source-images', {
  public: true,
  fileSizeLimit: 10485760, // 10MB
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp']
});
```

This was already done for the current project. For a new Supabase project, run this once.

### Idempotency

The pipeline is fully idempotent:
- Images with matching `content_hash` in `source_images` are skipped
- Storage files that already exist are handled gracefully
- Safe to re-run after crashes or partial runs

### Statistics

Private Pilot run (February 15, 2026):
- PHAK: 22 PDFs → 232 images extracted, 28 new uploads (204 deduped from earlier partial runs)
- AFH: 21 PDFs → 281 images
- AIM: 15 PDFs → 179 images
- Handbooks (IFH, AWH, RMH, WBH, Seaplane): 80 PDFs → 217 images
- Other + ACS: 101 + 0 images
- **Total: 1,408 images in database**

---

## 8. Phase 7: Image-to-Chunk Linking

### Script: `scripts/extract-images/link_images.py`

Creates `chunk_image_links` records by matching images to text chunks using three strategies (run in priority order):

### Strategy 1: Figure Reference Matching (`figure_ref`, relevance=0.9)

Scans chunk text for patterns like "see Figure 3-1", "refer to Table 5-2". Matches against `source_images.figure_label`. Highest precision (~95%).

### Strategy 2: Caption Content Overlap (`caption_match`, relevance=overlap%)

Computes word-level overlap between image captions and chunk text. Only links where ≥30% of caption keywords (4+ chars) appear in chunk content. Good precision (~80%).

### Strategy 3: Same-Page Proximity (`same_page`, relevance=0.5)

Links images to chunks on the same page. Requires `page_start`/`page_end` in `source_chunks` (populated by `ingest_text.py` but NOT by `ingest-sources.ts`). Medium precision (~60%).

### Running

```bash
cd scripts/extract-images
source .venv/bin/activate

# Run all strategies:
python3 link_images.py

# Run specific strategy:
python3 link_images.py --strategy figure_ref
python3 link_images.py --strategy caption_match
python3 link_images.py --strategy same_page

# Dry run:
python3 link_images.py --dry-run
```

### Output

Private Pilot run:
- Strategy 1 (figure_ref): 233 links
- Strategy 2 (caption_match): 7,454 links
- Strategy 3 (same_page): 0 links (no page numbers in chunks from `ingest-sources.ts`)
- **Total: 7,533 links in database**

### Supabase API Limitation

The linking scripts fetch max 1,000 rows per query (Supabase default limit). If the database grows beyond this, add pagination to the fetch calls in `link_images.py`.

---

## 9. Phase 8: Seed ACS Tasks

### Migration: `supabase/migrations/20260214000002_seed_acs_tasks.sql`

ACS tasks define the exam structure — each task represents a testable topic area.

### For a New Rating

1. Create a new migration file:
   ```
   supabase/migrations/YYYYMMDDNNNNNN_seed_acs_tasks_<rating>.sql
   ```

2. Parse the ACS document to extract all tasks and their K/R/S elements

3. Insert into `acs_tasks` following the ID convention:
   ```
   <rating_prefix>.<area_roman>.<task_letter>
   ```

   Examples:
   - Private Pilot: `PA.I.A` (PA = Private Airplane)
   - Instrument Rating: `IR.I.A` (IR = Instrument Rating)
   - Commercial Pilot: `CA.I.A` (CA = Commercial Airplane)

4. Each task has:
   - `rating`: `'private'`, `'instrument'`, `'commercial'`, etc.
   - `area`: Human-readable area name (e.g., "Preflight Preparation")
   - `task`: Task name (e.g., "Pilot Qualifications")
   - `knowledge_elements`: JSONB array of `{code, description}`
   - `risk_management_elements`: JSONB array of `{code, description}`
   - `skill_elements`: JSONB array of `{code, description}`

5. Apply migration:
   ```bash
   npx supabase db push
   ```

### Element Code Convention

```
<prefix>.<area>.<task>.<type><number>
```
- `K` = Knowledge, `R` = Risk Management, `S` = Skill
- Example: `PA.I.A.K1` = Private Pilot, Area I, Task A, Knowledge element 1

---

## 10. Phase 9: Seed ACS Elements and Classify Difficulty

### Script: `scripts/seed-elements.ts`

Normalizes the JSONB element arrays from `acs_tasks` into individual rows in `acs_elements`:

```bash
npx tsx scripts/seed-elements.ts
```

### Script: `scripts/classify-difficulty.ts`

Assigns difficulty levels to elements based on keyword heuristics:

```bash
npx tsx scripts/classify-difficulty.ts
```

| Difficulty | Keywords |
|-----------|----------|
| `easy` | definition, requirements, regulations, certificate, documents, privileges, limitations, currency, types, purpose |
| `hard` | emergency, hazard, malfunction, failure, abnormal, spin, stall, icing, thunderstorm, turbulence, loss of, degraded, partial, inoperative |
| `medium` | Everything else |

---

## 11. Phase 10: Verification

### Database Verification Queries

```sql
-- 1. Source documents by abbreviation
SELECT abbreviation, document_type, COUNT(*) as docs
FROM source_documents
GROUP BY abbreviation, document_type
ORDER BY abbreviation;

-- 2. Chunks and embeddings by document type
SELECT sd.abbreviation, COUNT(sc.id) as chunks,
       COUNT(sc.embedding) as with_embeddings,
       ROUND(AVG(LENGTH(sc.content))) as avg_content_len
FROM source_chunks sc
JOIN source_documents sd ON sd.id = sc.document_id
GROUP BY sd.abbreviation
ORDER BY sd.abbreviation;

-- 3. Images by document
SELECT sd.abbreviation, COUNT(si.id) as images,
       COUNT(si.figure_label) as with_labels,
       COUNT(si.caption) as with_captions
FROM source_images si
JOIN source_documents sd ON sd.id = si.document_id
GROUP BY sd.abbreviation
ORDER BY sd.abbreviation;

-- 4. Chunk-image links by type
SELECT link_type, COUNT(*) as links,
       ROUND(AVG(relevance_score)::numeric, 3) as avg_relevance
FROM chunk_image_links
GROUP BY link_type;

-- 5. ACS tasks by rating
SELECT rating, COUNT(*) as tasks
FROM acs_tasks
GROUP BY rating;

-- 6. ACS elements by type and difficulty
SELECT element_type, difficulty_default, COUNT(*) as elements
FROM acs_elements
GROUP BY element_type, difficulty_default
ORDER BY element_type, difficulty_default;
```

### RAG Search Test

Test the hybrid search RPC directly:

```sql
-- Requires a pre-computed embedding vector.
-- Easier to test via the app's API or exam engine.
```

Or test via the running app:
1. Start dev server: `npm run dev`
2. Log in and start an exam session
3. Answer a question — the examiner response should reference source material
4. If `NEXT_PUBLIC_SHOW_EXAM_IMAGES=true` in `.env.local`, images should appear in "Reference Materials" panel

### Feature Flag

Set `NEXT_PUBLIC_SHOW_EXAM_IMAGES=true` in `.env.local` (and Vercel environment variables for production) to enable image display in the exam UI.

---

## Appendix A: Database Schema Reference

### Tables Involved in Knowledge Onboarding

| Table | Purpose | Created By |
|-------|---------|-----------|
| `source_documents` | PDF registry (one row per file) | `ingest-sources.ts` |
| `source_chunks` | Text chunks with embeddings for RAG | `ingest-sources.ts` / `ingest_text.py` |
| `source_images` | Extracted image metadata | `extract.py` |
| `chunk_image_links` | Text-image relationships | `link_images.py` |
| `acs_tasks` | Exam task definitions from ACS | SQL migration |
| `acs_elements` | Normalized K/R/S elements | `seed-elements.ts` |

### RPC Functions

| Function | Purpose |
|----------|---------|
| `chunk_hybrid_search()` | Vector + FTS hybrid search for RAG retrieval |
| `get_images_for_chunks()` | Fetch linked images for a set of chunk IDs |
| `get_related_concepts()` | Graph traversal (future use) |

### Storage

| Bucket | Contents |
|--------|---------|
| `source-images` | Extracted images (PNG, JPEG, WebP) |

---

## Appendix B: Troubleshooting

### Image Extraction Crashes

| Error | Cause | Fix |
|-------|-------|-----|
| `ValueError: unsupported colorspace for 'png'` | CMYK or exotic colorspace | Already handled — converts to RGB |
| `ValueError: source colorspace must not be None` | Image mask/stencil with no colorspace | Already handled — skips these |
| `FzErrorArgument: pixmap must be grayscale or rgb` | DeviceN, Lab, or other non-standard colorspace | Already handled — checks `cs_name` |

### Text Ingestion Issues

| Issue | Fix |
|-------|-----|
| PDF > 100MB skipped | Use `ingest_text.py` instead |
| Duplicate chunks on re-run | `ingest-sources.ts` deletes existing chunks for the document before re-inserting |
| Missing embeddings | Re-run without `--skip-embeddings` |

### Linking Issues

| Issue | Fix |
|-------|-----|
| "No chunks with page numbers found" | Strategy 3 requires page numbers. Use `ingest_text.py` which populates `page_start`/`page_end`, or run page backfill |
| `TypeError: 'SyncSelectRequestBuilder' object is not callable` | supabase-py v2 API change. Use `.filter('col', 'not.is', 'null')` instead of `.not_('col', 'is', 'null')` |
| Supabase 1,000 row limit | Add pagination for large datasets |

### Document ID Resolution

If `extract.py` shows "SKIP: <filename> — no matching source_documents row":
- The `source_documents` table has no row matching that PDF filename
- Run `ingest-sources.ts` first to populate `source_documents`
- Or insert the row manually via Supabase dashboard

---

## Complete Onboarding Checklist (New Rating)

```
[ ] 1. Download ACS document for the rating
[ ] 2. Extract reference list from ACS (all cited documents)
[ ] 3. Download each new source PDF (skip already-present shared docs)
[ ] 4. Place PDFs in correct sources/ subdirectory
[ ] 5. Update sources/README.md
[ ] 6. Split multi-chapter PDFs (add to split_pdfs.py if needed)
[ ] 7. Add document registry entries in ingest-sources.ts
[ ] 8. Run text ingestion: npx tsx scripts/ingest-sources.ts --subset all
[ ] 9. Run large PDF ingestion if any: python3 ingest_text.py --pdf <path> --doc-id <uuid>
[ ] 10. Run image extraction for each source directory: python3 extract.py --source-dir <path>
[ ] 11. Run image linking: python3 link_images.py
[ ] 12. Create ACS task seed migration SQL
[ ] 13. Apply migration: npx supabase db push
[ ] 14. Seed elements: npx tsx scripts/seed-elements.ts
[ ] 15. Classify difficulty: npx tsx scripts/classify-difficulty.ts
[ ] 16. Update exam-logic.ts with new ORAL_EXAM_AREAS for the rating
[ ] 17. Run verification queries
[ ] 18. Test via app (start exam session, verify RAG + images)
```
