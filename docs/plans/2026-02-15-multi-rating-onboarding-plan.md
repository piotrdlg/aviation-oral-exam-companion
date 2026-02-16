# Multi-Rating Knowledge Onboarding: Commercial Pilot + Instrument Rating

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Onboard knowledge bases for Commercial Pilot (FAA-S-ACS-7B) and Instrument Rating (FAA-S-ACS-8C), then add UI for rating selection, enabling the app to serve three certificate levels.

**Architecture:** Each rating shares the existing source document infrastructure (PHAK, AFH, AIM, CFRs, etc.) but adds rating-specific ACS tasks and any new reference documents. The exam engine filters by `rating` field, and the UI adds a rating selector to SessionConfig. No schema changes needed — `acs_tasks.rating` and `exam_sessions.rating` columns already exist.

**Tech Stack:** Next.js 16 (TypeScript), Supabase (PostgreSQL + pgvector), Python 3.11 (PyMuPDF), OpenAI text-embedding-3-small

**GPT-5.2 Review Status:** Reviewed and approved with all 20 findings incorporated (1 critical, 5 high, 6 medium, 8 low). See individual tasks for `[GPT-5.2]` annotations.

---

## Scope Summary

| Rating | ACS Document | Prefix | Areas | Tasks (est.) | Oral-Suitable |
|--------|-------------|--------|-------|-------------|---------------|
| Private Pilot | FAA-S-ACS-6C | PA | 12 | 61 | 9 areas |
| Commercial Pilot | FAA-S-ACS-7B | CA | 11 | ~60 | 7 areas |
| Instrument Rating | FAA-S-ACS-8C | IR | 8 | 22 | 6 areas |

### New Source Documents Required

**For Commercial Pilot (minimal — most sources already present):**
| Document | Status |
|----------|--------|
| FAA-S-ACS-7B (Commercial Pilot ACS) | **DOWNLOAD** |
| 14 CFR Part 73 (Special Use Airspace) | **DOWNLOAD** |
| 14 CFR Part 97 (Standard Instrument Procedures) | **DOWNLOAD** |
| All other references (PHAK, AFH, AIM, CFRs, etc.) | Already ingested |

**For Instrument Rating (several new references):**
| Document | Status |
|----------|--------|
| FAA-S-ACS-8C (Instrument Rating ACS) | **DOWNLOAD** |
| FAA-H-8083-16 (Instrument Procedures Handbook) | **DOWNLOAD + SPLIT** |
| AC 90-100A (U.S. Terminal and En Route RNAV) | **DOWNLOAD** |
| AC 90-105A (RNAV/Baro-VNAV Approval) | **DOWNLOAD** |
| AC 91-74B (Flight in Icing Conditions) | **DOWNLOAD** |
| AC 120-108 (Continuous Descent Final Approach) | **DOWNLOAD** |
| FAA-H-8083-15B (Instrument Flying Handbook) | Already ingested |
| All other references (PHAK, AFH, AIM, etc.) | Already ingested |

---

## Phase 1: Source Document Acquisition

### Task 1.1: Download Commercial Pilot ACS and New CFR Parts

**Files:**
- Download to: `sources/acs/FAA-S-ACS-7B_Commercial_Pilot_ACS.pdf`
- Download to: `sources/cfr/14_CFR_Part_73.pdf`
- Download to: `sources/cfr/14_CFR_Part_97.pdf`

**Step 1: Download FAA-S-ACS-7B**
```bash
curl -L -o sources/acs/FAA-S-ACS-7B_Commercial_Pilot_ACS.pdf \
  "https://www.faa.gov/training_testing/testing/acs/media/commercial_airplane_acs_7.pdf"
```

**Step 2: Download 14 CFR Part 73**
```bash
curl -L -o sources/cfr/14_CFR_Part_73.pdf \
  "https://www.govinfo.gov/content/pkg/CFR-2025-title14-vol2/pdf/CFR-2025-title14-vol2-part73.pdf"
```

**Step 3: Download 14 CFR Part 97**
```bash
curl -L -o sources/cfr/14_CFR_Part_97.pdf \
  "https://www.govinfo.gov/content/pkg/CFR-2025-title14-vol2/pdf/CFR-2025-title14-vol2-part97.pdf"
```

**Step 4: Verify all three PDFs are valid**
```bash
python3 -c "
import fitz
for f in ['sources/acs/FAA-S-ACS-7B_Commercial_Pilot_ACS.pdf',
          'sources/cfr/14_CFR_Part_73.pdf',
          'sources/cfr/14_CFR_Part_97.pdf']:
    doc = fitz.open(f)
    print(f'{f}: {len(doc)} pages')
    doc.close()
"
```

---

### Task 1.2: Download Instrument Rating ACS and New Sources

**Files:**
- Download to: `sources/acs/FAA-S-ACS-8C_Instrument_Rating_ACS.pdf`
- Download to: `sources/handbooks/FAA-H-8083-16B_Instrument_Procedures.pdf`
- Download to: `sources/ac/AC_90-100A_RNAV_Operations.pdf`
- Download to: `sources/ac/AC_90-105A_RNAV_Baro_VNAV.pdf`
- Download to: `sources/ac/AC_91-74B_Flight_Icing.pdf`
- Download to: `sources/ac/AC_120-108_Continuous_Descent.pdf`

**Step 1: Download FAA-S-ACS-8C**
```bash
curl -L -o sources/acs/FAA-S-ACS-8C_Instrument_Rating_ACS.pdf \
  "https://www.faa.gov/training_testing/testing/acs/media/instrument_rating_airplane_acs_8.pdf"
```

**Step 2: Download Instrument Procedures Handbook (FAA-H-8083-16B)**
```bash
curl -L -o sources/handbooks/FAA-H-8083-16B_Instrument_Procedures.pdf \
  "https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/instrument_procedures_handbook/FAA-H-8083-16B.pdf"
```

**Step 3: Download new Advisory Circulars**
```bash
# AC 90-100A
curl -L -o sources/ac/AC_90-100A_RNAV_Operations.pdf \
  "https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_90-100A_CHG_2.pdf"

# AC 90-105A
curl -L -o sources/ac/AC_90-105A_RNAV_Baro_VNAV.pdf \
  "https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_90-105A.pdf"

# AC 91-74B
curl -L -o sources/ac/AC_91-74B_Flight_Icing.pdf \
  "https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_91-74B.pdf"

# AC 120-108
curl -L -o sources/ac/AC_120-108_Continuous_Descent.pdf \
  "https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_120-108.pdf"
```

**Step 4: Verify all downloads**
```bash
python3 -c "
import fitz
for f in ['sources/acs/FAA-S-ACS-8C_Instrument_Rating_ACS.pdf',
          'sources/handbooks/FAA-H-8083-16B_Instrument_Procedures.pdf',
          'sources/ac/AC_90-100A_RNAV_Operations.pdf',
          'sources/ac/AC_90-105A_RNAV_Baro_VNAV.pdf',
          'sources/ac/AC_91-74B_Flight_Icing.pdf',
          'sources/ac/AC_120-108_Continuous_Descent.pdf']:
    try:
        doc = fitz.open(f)
        print(f'{f}: {len(doc)} pages')
        doc.close()
    except Exception as e:
        print(f'{f}: ERROR - {e}')
"
```

**Note:** If any FAA download URL has changed, search for the document at https://www.faa.gov/regulations_policies/advisory_circulars and https://www.faa.gov/regulations_policies/handbooks_manuals. Download manually if curl fails.

---

### Task 1.3: Split Instrument Procedures Handbook into Chapters

**Files:**
- Modify: `scripts/split_pdfs.py`
- Output: `sources/handbooks/iph_chapters/*.pdf`

**Step 1: Inspect the IPH for chapter boundaries**
```bash
python3 -c "
import pypdf
reader = pypdf.PdfReader('sources/handbooks/FAA-H-8083-16B_Instrument_Procedures.pdf')
print(f'Total pages: {len(reader.pages)}')
# Get top-level bookmarks
outline = reader.outline
if outline:
    for item in outline:
        if not isinstance(item, list):
            try:
                page = reader.get_destination_page_number(item) + 1
                print(f'  p.{page:4d} | {item.title}')
            except: pass
"
```

**Step 2: Add `split_iph()` function to `scripts/split_pdfs.py`**

Add a new function following the existing pattern (like `split_ifh()`). Use bookmarks or manual page inspection to define chapter boundaries:

```python
def split_iph():
    """Split Instrument Procedures Handbook into chapters."""
    print("\n" + "=" * 70)
    print("IPH — Instrument Procedures Handbook")
    print("=" * 70)

    path = os.path.join(SOURCES, "handbooks", "FAA-H-8083-16B_Instrument_Procedures.pdf")
    output_dir = os.path.join(SOURCES, "handbooks", "iph_chapters")

    # Determine chapters from bookmark inspection above
    chapters = [
        # (start_page, suffix, display_name)
        # Fill in from Step 1 output
    ]

    split_pdf(path, chapters, output_dir, "iph")
```

**Step 3: Run the split**
```bash
python3 scripts/split_pdfs.py
```

**Step 4: Verify chapter files**
```bash
ls -la sources/handbooks/iph_chapters/
```

---

### Task 1.4: Update sources/README.md

**Files:**
- Modify: `sources/README.md`

Add new entries for all downloaded documents. Add sections:

```markdown
### Commercial Pilot ACS
| # | Document | File | Notes |
|---|----------|------|-------|
| C1 | FAA-S-ACS-7B — Commercial Pilot ACS | `acs/FAA-S-ACS-7B_Commercial_Pilot_ACS.pdf` | May 2024 |

### Instrument Rating ACS
| # | Document | File | Notes |
|---|----------|------|-------|
| I1 | FAA-S-ACS-8C — Instrument Rating ACS | `acs/FAA-S-ACS-8C_Instrument_Rating_ACS.pdf` | May 2024 |
| I2 | FAA-H-8083-16B — Instrument Procedures Handbook | `handbooks/FAA-H-8083-16B_Instrument_Procedures.pdf` | Split into chapters |
```

Add the new CFRs (Parts 73, 97) and ACs (90-100A, 90-105A, 91-74B, 120-108) to existing tables.

**Step 1: Commit**
```bash
git add sources/README.md
git commit -m "docs: update source inventory for Commercial and Instrument ratings"
```

---

## Phase 2: Text Ingestion and Embedding

### Task 2.1: Register New Documents in Ingestion Script

**Files:**
- Modify: `scripts/ingest-sources.ts` (function `buildDocumentRegistry()`)

**Step 1: Add IPH chapters registration**

After the existing `handbookDirs` array (around line 155), add IPH:

```typescript
const handbookDirs = [
  { dir: 'handbooks/ifh_chapters', abbrev: 'ifh', faa: 'FAA-H-8083-15B' },
  { dir: 'handbooks/awh_chapters', abbrev: 'awh', faa: 'FAA-H-8083-28A' },
  { dir: 'handbooks/rmh_chapters', abbrev: 'rmh', faa: 'FAA-H-8083-2A' },
  { dir: 'handbooks/wbh_chapters', abbrev: 'wbh', faa: 'FAA-H-8083-1B' },
  { dir: 'handbooks/iph_chapters', abbrev: 'iph', faa: 'FAA-H-8083-16B' },  // ← ADD
];
```

**Step 2: Add new ACs to the AC section**

The existing AC scanner (`acDir` block, line 136) already picks up all PDFs in `sources/ac/` automatically. No change needed — the new AC PDFs will be detected.

**Step 3: Add new CFRs**

The existing CFR scanner (`cfrDir` block, line 119) already picks up all PDFs in `sources/cfr/` automatically. No change needed for Parts 73 and 97.

**Step 4: Add Commercial and Instrument ACS documents**

Extend the ACS section (around line 199):

```typescript
// ACS documents
const acsDir = path.join(SOURCES_DIR, 'acs');
if (fs.existsSync(acsDir)) {
  const acsFiles = fs.readdirSync(acsDir).filter(f => f.endsWith('.pdf')).sort();
  for (const file of acsFiles) {
    // Detect which ACS by filename
    let title = 'ACS Document';
    let faaNumber: string | null = null;
    if (file.includes('6C') || file.toLowerCase().includes('private')) {
      title = 'FAA-S-ACS-6C Private Pilot ACS';
      faaNumber = 'FAA-S-ACS-6C';
    } else if (file.includes('7B') || file.toLowerCase().includes('commercial')) {
      title = 'FAA-S-ACS-7B Commercial Pilot ACS';
      faaNumber = 'FAA-S-ACS-7B';
    } else if (file.includes('8C') || file.toLowerCase().includes('instrument')) {
      title = 'FAA-S-ACS-8C Instrument Rating ACS';
      faaNumber = 'FAA-S-ACS-8C';
    }
    docs.push({
      title,
      faa_number: faaNumber,
      abbreviation: 'acs',
      document_type: 'other',
      chapter_number: null,
      chapter_title: null,
      file_path: `acs/${file}`,
    });
  }
}
```

---

### Task 2.2: Run Text Ingestion for New Sources

**Step 1: Run ingestion with all sources**
```bash
npx tsx scripts/ingest-sources.ts --subset all
```

This will:
- Re-detect all existing documents (skip unchanged ones by `file_name` dedup)
- Ingest new PDFs: CFR Parts 73 + 97, ACs 90-100A + 90-105A + 91-74B + 120-108, IPH chapters, ACS documents
- Generate embeddings for all new chunks

> **[GPT-5.2 LOW] Re-ingestion note:** The ingestion script deletes old chunks before re-inserting for a given document. Only NEW documents will be processed on a clean run. Existing documents with unchanged filenames are skipped. If a document needs re-ingestion (e.g., updated PDF), delete its `source_documents` row first.

**Step 2: Verify new documents are in the database**
```sql
SELECT abbreviation, COUNT(*) as docs,
       (SELECT COUNT(*) FROM source_chunks sc WHERE sc.document_id = sd.id) as chunk_sample
FROM source_documents sd
WHERE created_at > '2026-02-15'
GROUP BY abbreviation, sd.id
ORDER BY abbreviation;
```

**Step 3: Commit**
```bash
git add scripts/ingest-sources.ts
git commit -m "feat: register IPH and new ACS documents in ingestion pipeline"
```

---

## Phase 3: Image Extraction for New Sources

### Task 3.1: Extract Images from New Source PDFs

**Step 1: Activate Python venv**
```bash
cd scripts/extract-images
source .venv/bin/activate
```

**Step 2: Extract images from new sources**
```bash
# New CFR parts
python3 extract.py --source-dir ../../sources/cfr --document-filter Part_73
python3 extract.py --source-dir ../../sources/cfr --document-filter Part_97

# IPH chapters (new handbook)
python3 extract.py --source-dir ../../sources/handbooks/iph_chapters

# New Advisory Circulars
python3 extract.py --source-dir ../../sources/ac --document-filter AC_90
python3 extract.py --source-dir ../../sources/ac --document-filter AC_91-74
python3 extract.py --source-dir ../../sources/ac --document-filter AC_120-108

# New ACS documents
python3 extract.py --source-dir ../../sources/acs --document-filter ACS-7B
python3 extract.py --source-dir ../../sources/acs --document-filter ACS-8C
```

**Step 3: Verify extraction**
```sql
SELECT sd.abbreviation, COUNT(si.id) as images
FROM source_images si
JOIN source_documents sd ON sd.id = si.document_id
WHERE si.created_at > '2026-02-15'
GROUP BY sd.abbreviation;
```

---

### Task 3.2: Run Image-to-Chunk Linking

**Step 1: Run all linking strategies**
```bash
cd scripts/extract-images
source .venv/bin/activate
python3 link_images.py
```

This is idempotent — existing links are preserved via `UPSERT ON CONFLICT(chunk_id, image_id)`.

**Step 2: Verify link counts**
```sql
SELECT link_type, COUNT(*) as links
FROM chunk_image_links
GROUP BY link_type;
```

---

## Phase 4: ACS Task Seeding

### Task 4.1: Download and Parse ACS PDFs for Task Details

Before creating seed migrations, extract the exact task names and K/R/S element codes from the official PDFs.

**Step 1: Extract task structure from Commercial Pilot ACS (FAA-S-ACS-7B)**

Open `sources/acs/FAA-S-ACS-7B_Commercial_Pilot_ACS.pdf` and extract:
- Each Area of Operation (I through XI)
- Each Task (A, B, C, ...) within each Area
- Each Knowledge element (CA.I.A.K1, CA.I.A.K2, ...)
- Each Risk Management element (CA.I.A.R1, CA.I.A.R2, ...)
- Each Skill element (CA.I.A.S1, ...)
- The `applicable_classes` for each task (ASEL, AMEL, ASES, AMES)

**Step 2: Extract task structure from Instrument Rating ACS (FAA-S-ACS-8C)**

Open `sources/acs/FAA-S-ACS-8C_Instrument_Rating_ACS.pdf` and extract:
- Each Area of Operation (I through VIII)
- Each Task (A, B, C, ...) within each Area
- Each Knowledge element (IR.I.A.K1, ...)
- Each Risk Management element (IR.I.A.R1, ...)
- Each Skill element (IR.I.A.S1, ...)
- The `applicable_classes` for each task

---

### Task 4.2: Create Commercial Pilot ACS Seed Migration

**Files:**
- Create: `supabase/migrations/20260215100001_seed_acs_tasks_commercial.sql`

**Step 1: Write the migration SQL**

Follow the exact pattern from `20260214000002_seed_acs_tasks.sql`. Use `CA` prefix:

```sql
BEGIN;

-- ============================================================
-- Commercial Pilot ACS Tasks (FAA-S-ACS-7B)
-- ============================================================

-- AREA I: Preflight Preparation (9 tasks)
INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes)
VALUES
(
  'CA.I.A', 'commercial', 'Preflight Preparation', 'Pilot Qualifications',
  $$[
    {"code":"CA.I.A.K1","description":"..."},
    ...
  ]$$::jsonb,
  $$[...]$$::jsonb,
  $$[...]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

-- ... continue for all ~60 tasks across 11 areas ...

COMMIT;
```

**Key differences from Private Pilot:**
- `rating` = `'commercial'` (not `'private'`)
- Prefix = `CA` (not `PA`)
- Area VIII = High-Altitude Operations (new, not in Private)
- No separate Night Operations area (incorporated into others)
- No Basic Instrument Maneuvers area
- Area V has 5 tasks (Steep Turns, Steep Spirals, Chandelles, Lazy Eights, Eights on Pylons)
- Area VII adds Accelerated Stalls (Task D)
- Area IV Task M = Power-Off 180 (replaces Forward Slip)

**Oral-exam-relevant areas (exclude flight-only):**
- Include: I, II, III, VI, VIII, IX, XI
- Exclude: IV (Takeoffs/Landings), V (Performance/Ground Reference), VII (Slow Flight/Stalls), X (Multiengine — flight skills)

---

### Task 4.3: Create Instrument Rating ACS Seed Migration

**Files:**
- Create: `supabase/migrations/20260215100002_seed_acs_tasks_instrument.sql`

**Step 1: Write the migration SQL**

```sql
BEGIN;

-- ============================================================
-- Instrument Rating ACS Tasks (FAA-S-ACS-8C)
-- ============================================================

-- AREA I: Preflight Preparation (3 tasks)
INSERT INTO acs_tasks (id, rating, area, task, knowledge_elements, risk_management_elements, skill_elements, applicable_classes)
VALUES
(
  'IR.I.A', 'instrument', 'Preflight Preparation', 'Pilot Qualifications',
  $$[
    {"code":"IR.I.A.K1","description":"..."},
    ...
  ]$$::jsonb,
  $$[...]$$::jsonb,
  $$[...]$$::jsonb,
  '{ASEL,AMEL,ASES,AMES}'
);

-- ... continue for all 22 tasks across 8 areas ...

COMMIT;
```

**Key differences from Private Pilot:**
- `rating` = `'instrument'` (not `'private'`)
- Prefix = `IR` (not `PA`)
- Only 8 Areas of Operation, 22 Tasks (much smaller than Private/Commercial)
- Heavily IFR-focused: ATC clearances, holding, approaches, navigation systems
- Area VII.B and VII.C are multiengine-only (AMEL, AMES)

**Oral-exam-relevant areas:**
- Include: I, II, III, V (knowledge portions), VII (A: Lost Comms, D: Loss of Instruments), VIII
- Exclude: IV (Flight by Reference to Instruments), VI (Instrument Approach Procedures — flight skills)

---

### Task 4.4: Apply Migrations and Seed Elements

**Step 1: Push migrations to Supabase**
```bash
npx supabase db push
```

**Step 2: Verify ACS tasks by rating**
```sql
SELECT rating, COUNT(*) as tasks
FROM acs_tasks
GROUP BY rating
ORDER BY rating;
```

Expected:
```
commercial  | ~60
instrument  | 22
private     | 61
```

**Step 3: Seed ACS elements**
```bash
npx tsx scripts/seed-elements.ts
```

> **[GPT-5.2 LOW] Note:** `seed-elements.ts` deletes ALL existing `acs_elements` rows before re-seeding (lines 157-160). This causes momentary data loss. Run during low-traffic periods. The script automatically processes ALL ratings from `acs_tasks`, so it will seed PA, CA, and IR elements in one run.

**Step 4: Classify difficulty**
```bash
npx tsx scripts/classify-difficulty.ts
```

**Step 5: Verify elements**
```sql
SELECT
  CASE
    WHEN code LIKE 'PA.%' THEN 'private'
    WHEN code LIKE 'CA.%' THEN 'commercial'
    WHEN code LIKE 'IR.%' THEN 'instrument'
  END as rating,
  element_type,
  difficulty_default,
  COUNT(*) as count
FROM acs_elements
GROUP BY 1, element_type, difficulty_default
ORDER BY 1, element_type, difficulty_default;
```

**Step 6: Commit**
```bash
git add supabase/migrations/
git commit -m "feat: seed ACS tasks for Commercial Pilot and Instrument Rating"
```

---

## Phase 5: Exam Logic Updates

### Task 5.1: Make ORAL_EXAM_AREA_PREFIXES Rating-Aware

**Files:**
- Modify: `src/lib/exam-logic.ts`

**Step 1: Replace static constant with per-rating lookup**

Replace the single `ORAL_EXAM_AREA_PREFIXES` constant with a rating-keyed map:

```typescript
import type { Rating } from '@/types/database';

export const ORAL_EXAM_AREA_PREFIXES: Record<Rating, string[]> = {
  private: [
    'PA.I.', 'PA.II.', 'PA.III.', 'PA.VI.', 'PA.VII.',
    'PA.VIII.', 'PA.IX.', 'PA.X.', 'PA.XI.', 'PA.XII.',
  ],
  commercial: [
    'CA.I.', 'CA.II.', 'CA.III.', 'CA.VI.',
    'CA.VIII.', 'CA.IX.', 'CA.XI.',
  ],
  instrument: [
    'IR.I.', 'IR.II.', 'IR.III.', 'IR.V.',
    'IR.VII.', 'IR.VIII.',
  ],
  atp: [], // Future
};
```

**Step 2: Update `filterEligibleTasks()` to accept rating**

```typescript
export function filterEligibleTasks(
  tasks: AcsTaskRow[],
  coveredTaskIds: string[] = [],
  aircraftClass?: AircraftClass,
  rating: Rating = 'private'  // ← ADD parameter
): AcsTaskRow[] {
  const prefixes = ORAL_EXAM_AREA_PREFIXES[rating] || ORAL_EXAM_AREA_PREFIXES.private;
  return tasks.filter((t) => {
    if (coveredTaskIds.includes(t.id)) return false;
    const inOralArea = prefixes.some((prefix) => t.id.startsWith(prefix));
    if (!inOralArea) return false;
    if (aircraftClass && t.applicable_classes) {
      if (!t.applicable_classes.includes(aircraftClass)) return false;
    }
    return true;
  });
}
```

**Step 3: Update `selectRandomTask()` to pass rating through**

```typescript
export function selectRandomTask(
  allTasks: AcsTaskRow[],
  coveredTaskIds: string[] = [],
  aircraftClass?: AircraftClass,
  rating: Rating = 'private'  // ← ADD parameter
): AcsTaskRow | null {
  // ... use rating in filterEligibleTasks call
  const eligible = filterEligibleTasks(allTasks, coveredTaskIds, aircraftClass, rating);
  // ... rest unchanged
}
```

**Step 4: Update `buildSystemPrompt()` for rating-specific persona**

```typescript
export function buildSystemPrompt(
  task: AcsTaskRow,
  targetDifficulty?: Difficulty,
  aircraftClass?: AircraftClass,
  rating: Rating = 'private'  // ← ADD parameter
): string {
  const ratingLabel: Record<Rating, string> = {
    private: 'Private Pilot',
    commercial: 'Commercial Pilot',
    instrument: 'Instrument Rating',
    atp: 'Airline Transport Pilot',
  };

  const examName = ratingLabel[rating] || 'Private Pilot';

  return `You are a Designated Pilot Examiner (DPE) conducting an FAA ${examName} oral examination. ...`;
  // Rest of prompt remains the same structure
}
```

**Step 5: Run tests**
```bash
npx vitest run
```

Update failing tests in `src/lib/__tests__/exam-logic.test.ts` to pass `rating` parameter where needed.

**Step 6: Commit**
```bash
git add src/lib/exam-logic.ts src/lib/__tests__/exam-logic.test.ts
git commit -m "feat: make exam logic rating-aware (Private, Commercial, Instrument)"
```

---

### Task 5.2: Update Exam Engine for Rating Parameter

**Files:**
- Modify: `src/lib/exam-engine.ts`

**Step 1: Update `pickStartingTask()` (line 48)**

Add `rating` parameter, replace hardcoded `'private'` at line 55:

```typescript
export async function pickStartingTask(
  coveredTaskIds: string[] = [],
  aircraftClass?: AircraftClass,
  rating: Rating = 'private'  // ← ADD
): Promise<AcsTaskRow | null> {
  let query = supabase
    .from('acs_tasks')
    .select('*')
    .eq('rating', rating);  // ← USE variable (was hardcoded 'private')
  // ... rest unchanged, also pass rating to selectRandomTask:
  return selectRandomTask(data as AcsTaskRow[], coveredTaskIds, aircraftClass, rating);
}
```

**Step 2: Update `pickNextTask()` (line 72)**

Pass `rating` through to `pickStartingTask`:

```typescript
export async function pickNextTask(
  currentTaskId: string,
  coveredTaskIds: string[] = [],
  aircraftClass?: AircraftClass,
  rating: Rating = 'private'  // ← ADD
): Promise<AcsTaskRow | null> {
  return pickStartingTask([...coveredTaskIds, currentTaskId], aircraftClass, rating);
}
```

**Step 3: Update `generateExaminerTurn()` (line 113) and `generateExaminerTurnStreaming()` (line 159)**

Both call `buildSystemPrompt()` without rating. Add `rating` parameter and pass through:

```typescript
export async function generateExaminerTurn(
  task: AcsTaskRow,
  history: ExamMessage[],
  difficulty?: Difficulty,
  aircraftClass?: AircraftClass,
  prefetchedRag?: { ragContext: string },
  rating: Rating = 'private'  // ← ADD
): Promise<ExamTurn> {
  const systemPrompt = buildSystemPrompt(task, difficulty, aircraftClass, rating);  // ← pass rating
  // ... rest unchanged
}

export async function generateExaminerTurnStreaming(
  task: AcsTaskRow,
  history: ExamMessage[],
  difficulty?: Difficulty,
  aircraftClass?: AircraftClass,
  prefetchedRag?: { ragContext: string; ragImages?: ImageResult[] },
  assessmentPromise?: Promise<AssessmentData>,
  onComplete?: (fullText: string) => void,
  rating: Rating = 'private'  // ← ADD
): Promise<ReadableStream> {
  const systemPrompt = buildSystemPrompt(task, difficulty, aircraftClass, rating);  // ← pass rating
  // ... rest unchanged
}
```

**Step 4: [GPT-5.2 CRITICAL] Update `assessAnswer()` system prompt (line 305)**

The `assessAnswer()` function hardcodes `"You are assessing a private pilot applicant's oral exam answer"` in its system prompt. This MUST be parameterized:

```typescript
export async function assessAnswer(
  task: AcsTaskRow,
  history: ExamMessage[],
  studentAnswer: string,
  questionImages?: ImageResult[],
  rating: Rating = 'private'  // ← ADD
): Promise<AssessmentData> {
  // ... existing code ...

  const ratingLabel: Record<Rating, string> = {
    private: 'private pilot',
    commercial: 'commercial pilot',
    instrument: 'instrument rating',
    atp: 'airline transport pilot',
  };

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 400,
    system: `You are assessing a ${ratingLabel[rating] || 'private pilot'} applicant's oral exam answer. Rate it against the ACS standards.
    // ... rest of system prompt unchanged
  });
}
```

Without this fix, Commercial and Instrument exam sessions would have their answers assessed against Private Pilot standards.

**Step 5: Verify TypeScript compiles**
```bash
npx tsc --noEmit
```

**Step 6: Commit**
```bash
git add src/lib/exam-engine.ts
git commit -m "feat: parameterize rating in exam engine (pickTask, generate, assess)"
```

---

### Task 5.3: Update Exam Planner for Rating

**Files:**
- Modify: `src/lib/exam-planner.ts`

**Step 1: [GPT-5.2 HIGH] Filter ACS elements by rating in `initPlanner()` (lines 32-36)**

Currently loads ALL elements across all ratings. Add rating filter using element code prefix:

```typescript
export async function initPlanner(
  config: SessionConfig,
  userId: string
): Promise<PlannerResult | null> {
  const ratingPrefix: Record<string, string> = {
    private: 'PA.', commercial: 'CA.', instrument: 'IR.', atp: 'ATP.',
  };
  const prefix = ratingPrefix[config.rating] || 'PA.';

  let elementQuery = supabase
    .from('acs_elements')
    .select('*')
    .like('code', `${prefix}%`)  // ← FILTER by rating prefix
    .order('order_index');

  // ... rest unchanged
}
```

Without this, a Commercial session would load Private and Instrument elements too, causing cross-rating contamination.

**Step 2: [GPT-5.2 HIGH] Filter classTasks query by rating (lines 48-51)**

The aircraft class filter query loads ALL tasks across all ratings. Add rating filter:

```typescript
if (config.aircraftClass) {
  const { data: classTasks } = await supabase
    .from('acs_tasks')
    .select('id')
    .eq('rating', config.rating || 'private')  // ← ADD rating filter
    .contains('applicable_classes', [config.aircraftClass]);
  // ... rest unchanged
}
```

**Step 3: [GPT-5.2 HIGH] Fix `get_element_scores` hardcoded rating (line 64)**

```typescript
const { data: scores } = await supabase.rpc('get_element_scores', {
  p_user_id: userId,
  p_rating: config.rating || 'private',  // ← USE config (was hardcoded 'private')
});
```

**Step 4: [GPT-5.2 MEDIUM] Pass rating to `buildSystemPrompt()` in `advancePlanner()` (line 125)**

```typescript
const systemPrompt = buildSystemPrompt(
  task as AcsTaskRow,
  difficulty,
  config.aircraftClass,
  config.rating || 'private'  // ← ADD rating parameter
);
```

**Step 5: [GPT-5.2 MEDIUM] Filter elements by rating in `advancePlanner()` (lines 94-99)**

When `advancePlanner()` re-fetches elements (no cache), add the same rating prefix filter:

```typescript
if (!elements) {
  const prefix = ratingPrefix[config.rating] || 'PA.';
  const { data } = await supabase
    .from('acs_elements')
    .select('*')
    .like('code', `${prefix}%`)  // ← ADD filter
    .order('order_index');
  elements = (data || []) as AcsElementDB[];
}
```

**Step 6: Verify TypeScript compiles**
```bash
npx tsc --noEmit
```

**Step 7: Commit**
```bash
git add src/lib/exam-planner.ts
git commit -m "feat: planner filters elements and scores by rating"
```

---

## Phase 6: API Route Updates

### Task 6.1: Update Session API to Accept Rating

**Files:**
- Modify: `src/app/api/session/route.ts`

**Step 1: Accept rating in POST create action**

```typescript
// In the 'create' action handler:
const { rating = 'private', study_mode, difficulty_preference, ... } = body;

const { data, error } = await supabase
  .from('exam_sessions')
  .insert({
    user_id: user.id,
    rating: rating,  // ← USE variable (was hardcoded 'private')
    // ... rest unchanged
  })
```

**Step 2: Accept rating in GET element-scores action**

```typescript
// In the element-scores handler:
const rating = url.searchParams.get('rating') || 'private';
const { data, error } = await supabase.rpc('get_element_scores', {
  p_user_id: user.id,
  p_rating: rating,  // ← USE variable (was hardcoded 'private')
});
```

---

### Task 6.2: Update Exam API to Accept Rating

**Files:**
- Modify: `src/app/api/exam/route.ts`

**Step 1: Accept rating in POST start action**

```typescript
const { sessionConfig } = body;
const rating = sessionConfig?.rating || 'private';

// Pass to pickStartingTask:
const task = await pickStartingTask([], sessionConfig?.aircraftClass, rating);
```

**Step 2: Update list-tasks GET endpoint**

```typescript
// GET ?action=list-tasks
const rating = url.searchParams.get('rating') || 'private';
const { data, error } = await supabase
  .from('acs_tasks')
  .select('id, area, task, applicable_classes')
  .eq('rating', rating)  // ← USE variable (was hardcoded 'private')
  .order('id');
```

**Step 3: Update next-task action to pass rating through**

```typescript
const rating = body.sessionConfig?.rating || 'private';
const nextTask = await pickNextTask(body.taskData.id, body.coveredTaskIds, body.sessionConfig?.aircraftClass, rating);
```

**Step 4: [GPT-5.2 LOW] Update respond action to pass rating**

The `respond` action calls `assessAnswer()` and `generateExaminerTurnStreaming()` — both now need `rating`:

```typescript
const rating = body.sessionConfig?.rating || 'private';
// Pass to assessAnswer:
const assessment = assessAnswer(task, history, studentAnswer, questionImages, rating);
// Pass to generateExaminerTurnStreaming:
const stream = await generateExaminerTurnStreaming(task, history, difficulty, aircraftClass, rag, assessment, onComplete, rating);
```

**Step 5: Verify TypeScript compiles**
```bash
npx tsc --noEmit
```

**Step 6: Commit**
```bash
git add src/app/api/
git commit -m "feat: API routes accept rating parameter for multi-rating support"
```

---

## Phase 7: UI Updates

### Task 7.1: Add Rating to Type Definitions

**Files:**
- Modify: `src/types/database.ts`

**Step 1: Add `rating` to `SessionConfig` interface**

```typescript
export interface SessionConfig {
  rating: Rating;  // ← ADD
  aircraftClass: AircraftClass;
  studyMode: StudyMode;
  difficulty: DifficultyPreference;
  selectedAreas: string[];
  selectedTasks: string[];
}
```

---

### Task 7.2: Add Rating Selector to SessionConfig Component

**Files:**
- Modify: `src/app/(dashboard)/practice/components/SessionConfig.tsx`

**Step 1: Add rating to SessionConfigData interface**

```typescript
export interface SessionConfigData {
  rating: Rating;  // ← ADD
  studyMode: 'linear' | 'cross_acs' | 'weak_areas';
  // ... rest unchanged
}
```

**Step 2: Add rating state**

```typescript
const [selectedRating, setSelectedRating] = useState<Rating>('private');
```

**Step 3: Add rating selector UI**

Add BEFORE the Aircraft Class selector, as a prominent 3-button group:

```tsx
{/* Certificate Rating */}
<div className="space-y-2">
  <label className="text-sm font-medium text-gray-300">Certificate Rating</label>
  <div className="grid grid-cols-3 gap-2">
    {[
      { value: 'private', label: 'Private Pilot', desc: '61 ACS tasks' },
      { value: 'commercial', label: 'Commercial', desc: '~60 ACS tasks' },
      { value: 'instrument', label: 'Instrument', desc: '22 ACS tasks' },
    ].map((r) => (
      <button
        key={r.value}
        onClick={() => setSelectedRating(r.value as Rating)}
        className={`p-3 rounded-lg border text-center transition-colors ${
          selectedRating === r.value
            ? 'border-blue-500 bg-blue-500/10 text-blue-400'
            : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
        }`}
      >
        <div className="font-medium text-sm">{r.label}</div>
        <div className="text-xs text-gray-500 mt-0.5">{r.desc}</div>
      </button>
    ))}
  </div>
</div>
```

**Step 4: Update task list fetching to filter by rating**

```typescript
// When fetching tasks for the task picker:
const res = await fetch(`/api/exam?action=list-tasks&rating=${selectedRating}`);
```

Re-fetch tasks when `selectedRating` changes.

**Step 4b: [GPT-5.2 LOW] Reset `selectedAreas` when rating changes**

The `selectedAreas` list must be rebuilt when rating changes, since PA.I/CA.I/IR.I represent different area sets. Add an effect:

```typescript
useEffect(() => {
  // Reset area selection when rating changes — areas differ per rating
  setSelectedAreas([]);
  setSelectedTasks([]);
  // Re-fetch tasks for the new rating
  fetchTasks(selectedRating);
}, [selectedRating]);
```

**Step 5: Pass rating in config output**

```typescript
const configData: SessionConfigData = {
  rating: selectedRating,  // ← ADD
  studyMode: selectedMode,
  // ... rest unchanged
};
```

---

### Task 7.3: Wire Rating Through Practice Page

**Files:**
- Modify: `src/app/(dashboard)/practice/page.tsx`

**Step 1: Pass rating when creating session**

```typescript
const res = await fetch('/api/session', {
  method: 'POST',
  body: JSON.stringify({
    action: 'create',
    rating: config.rating,  // ← ADD
    study_mode: config.studyMode,
    // ... rest unchanged
  }),
});
```

**Step 2: Pass rating when starting exam**

```typescript
const examRes = await fetch('/api/exam', {
  method: 'POST',
  body: JSON.stringify({
    action: 'start',
    sessionConfig: config,  // config now includes .rating
  }),
});
```

---

### Task 7.4: Add Rating Filter to Progress Page

**Files:**
- Modify: `src/app/(dashboard)/progress/page.tsx`

**Step 1: Add rating state and selector**

Add a rating filter similar to the existing aircraft class selector:

```typescript
const [selectedRating, setSelectedRating] = useState<Rating>('private');
```

Add rating buttons above the existing class selector in the stats section.

**Step 2: Filter sessions by rating**

```typescript
const filteredSessions = sessions.filter(s =>
  !selectedRating || s.rating === selectedRating
);
```

**Step 3: Pass rating to element-scores endpoint**

```typescript
const scoresRes = await fetch(
  `/api/session?action=element-scores&rating=${selectedRating}`
);
```

**Step 4: Show rating badge on session cards**

Add a small badge showing "PPL", "CPL", or "IR" on each session card.

---

### Task 7.5: Update Landing Page

**Files:**
- Modify: `src/app/page.tsx`

Update the landing page copy to mention support for all three ratings instead of just "Private Pilot."

---

## Phase 8: Testing and Verification

### Task 8.1: TypeScript and Unit Tests

**Step 1: TypeScript compilation**
```bash
npx tsc --noEmit
```

**Step 2: Run all tests**
```bash
npx vitest run
```

Fix any failures caused by the new `rating` parameter in exam-logic functions.

**Step 3: Commit**
```bash
git add .
git commit -m "feat: complete multi-rating support (Private, Commercial, Instrument)"
```

---

### Task 8.2: Database Verification

**Step 1: Run all verification queries from onboarding procedure**

```sql
-- Documents
SELECT abbreviation, COUNT(*) FROM source_documents GROUP BY abbreviation ORDER BY abbreviation;

-- Chunks with embeddings
SELECT sd.abbreviation, COUNT(sc.id) as chunks, COUNT(sc.embedding) as embedded
FROM source_chunks sc JOIN source_documents sd ON sd.id = sc.document_id
GROUP BY sd.abbreviation ORDER BY sd.abbreviation;

-- Images
SELECT sd.abbreviation, COUNT(si.id) as images
FROM source_images si JOIN source_documents sd ON sd.id = si.document_id
GROUP BY sd.abbreviation ORDER BY sd.abbreviation;

-- Links
SELECT link_type, COUNT(*) FROM chunk_image_links GROUP BY link_type;

-- Tasks by rating
SELECT rating, COUNT(*) FROM acs_tasks GROUP BY rating ORDER BY rating;

-- Elements by rating
SELECT
  CASE WHEN code LIKE 'PA.%' THEN 'private'
       WHEN code LIKE 'CA.%' THEN 'commercial'
       WHEN code LIKE 'IR.%' THEN 'instrument'
  END as rating,
  COUNT(*) as elements
FROM acs_elements
GROUP BY 1 ORDER BY 1;
```

---

### Task 8.3: End-to-End App Verification

**Step 1: Start dev server**
```bash
npm run dev
```

**Step 2: Test Private Pilot (regression)**
- Log in → Start exam → Select "Private Pilot" → Verify session works as before

**Step 3: Test Commercial Pilot**
- Start exam → Select "Commercial" → Verify:
  - Task list shows CA.* tasks
  - Questions are appropriate for commercial level
  - Area VIII (High-Altitude Operations) appears
  - Images appear if NEXT_PUBLIC_SHOW_EXAM_IMAGES=true

**Step 4: Test Instrument Rating**
- Start exam → Select "Instrument" → Verify:
  - Task list shows IR.* tasks (22 tasks)
  - Questions focus on IFR operations
  - Areas include ATC clearances, navigation systems

**Step 5: Test Progress page**
- Check that sessions show correct rating badges
- Verify filtering works per rating

---

## Phase Summary and Dependencies

```
Phase 1: Source Acquisition
  Task 1.1 ──┐
  Task 1.2 ──┤── Task 1.3 (split IPH) ── Task 1.4 (README)
              │
Phase 2: Text Ingestion
  Task 2.1 (registry) ── Task 2.2 (ingestion run)
              │
Phase 3: Image Pipeline
  Task 3.1 (extraction) ── Task 3.2 (linking)
              │
Phase 4: ACS Seeding
  Task 4.1 (parse PDFs) ── Task 4.2 (Commercial SQL) ──┐
                         ── Task 4.3 (Instrument SQL) ──┤── Task 4.4 (apply + seed)
                                                         │
Phase 5: Exam Logic                                      │
  Task 5.1 (area prefixes) ── Task 5.2 (engine) ── Task 5.3 (planner)
              │
Phase 6: API Updates
  Task 6.1 (session API) ── Task 6.2 (exam API)
              │
Phase 7: UI Updates
  Task 7.1 (types) ── Task 7.2 (SessionConfig) ── Task 7.3 (practice) ── Task 7.4 (progress) ── Task 7.5 (landing)
              │
Phase 8: Verification
  Task 8.1 (TS + tests) ── Task 8.2 (DB queries) ── Task 8.3 (E2E)
```

**Total: 8 phases, 22 tasks**

**Estimated API costs:**
- Embedding generation for ~50-100 new chunks: ~$0.01
- No additional Claude API costs (ACS seeding is SQL-only)

---

## Appendix: GPT-5.2 Review Findings Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 1 | Incorporated in Task 5.2 Step 4 (`assessAnswer` hardcoded rating) |
| HIGH | 5 | Incorporated in Tasks 5.2, 5.3, 6.2 |
| MEDIUM | 6 | Incorporated in Tasks 5.1-5.3, 7.1-7.3 |
| LOW | 8 | Incorporated as notes in Tasks 2.2, 4.4, 6.2, 7.2 |

**All 20 findings have been addressed in this plan.**
