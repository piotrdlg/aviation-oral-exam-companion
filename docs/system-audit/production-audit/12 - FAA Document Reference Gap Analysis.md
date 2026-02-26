# 12 - FAA Document Reference Gap Analysis

**Date**: 2026-02-25
**Scope**: Cross-reference all FAA documents cited in ACS task Reference lines (all three ratings) against the HeyDPE ingestion registry and physical source PDFs.

---

## Methodology

1. Extracted every `References:` line from all tasks in three ACS documents:
   - FAA-S-ACS-6C (Private Pilot, 61 tasks)
   - FAA-S-ACS-7B (Commercial Pilot, 60 tasks)
   - FAA-S-ACS-8C (Instrument Rating, 22 tasks)
2. Compiled the union of all unique FAA document identifiers (List A).
3. Read `scripts/ingest-sources.ts` `buildDocumentRegistry()` and inventoried all PDFs in `sources/` (List B).
4. Performed gap analysis: A minus B, B minus A, and structural findings.

---

## List A: All FAA Documents Referenced in ACS Task Reference Lines

### Code of Federal Regulations (8 unique parts)

| # | Document | Referenced By | Notes |
|---|----------|-------------|-------|
| 1 | 14 CFR Part 39 | PA.I.B, CA.I.B | Airworthiness Directives |
| 2 | 14 CFR Part 43 | PA.I.B, CA.I.B | Maintenance |
| 3 | 14 CFR Part 61 | PA.I.A, PA.V.B, CA.I.A, IR.I.A | Pilot Certification |
| 4 | 14 CFR Part 68 | PA.I.A, CA.I.A | BasicMed |
| 5 | 14 CFR Part 71 | PA.I.E, CA.I.E | Airspace Designation |
| 6 | 14 CFR Part 91 | Many tasks across all three ratings | General Operating Rules |
| 7 | 14 CFR Part 93 | PA.I.E, CA.I.E | Special Air Traffic Rules |
| 8 | 14 CFR Part 97 | IR.V.B, IR.VI.C, IR.VI.D | Standard Instrument Procedures |

Note: CA.I.A also references "14 CFR part 119, section 119.1(e)" but this is a specific section reference, not a standalone Part in the ingestion pipeline.

### FAA Handbooks (8 unique publications)

| # | FAA Number | Short Name | Referenced By | Task Coverage |
|---|-----------|-----------|-------------|---------------|
| 1 | FAA-H-8083-1 | Weight & Balance Handbook (WBH) | PA.I.F, CA.I.F | 2 tasks |
| 2 | FAA-H-8083-2 | Risk Management Handbook (RMH) | Virtually every task in all 3 ACS | ~140+ tasks |
| 3 | FAA-H-8083-3 | Airplane Flying Handbook (AFH) | Virtually every task in all 3 ACS | ~140+ tasks |
| 4 | FAA-H-8083-15 | Instrument Flying Handbook (IFH) | IR Areas I-VIII, PA.X.C/D, CA.X.C/D | ~30 tasks |
| 5 | FAA-H-8083-16 | Instrument Procedures Handbook (IPH) | IR.I.C, IR.III-VII (many tasks) | ~15 tasks |
| 6 | FAA-H-8083-23 | Seaplane/Skiplane Handbook | PA.I.G/I, PA.II.A/F, PA.IV (several), PA.XII.B, CA equivalents | ~20 tasks |
| 7 | FAA-H-8083-25 | PHAK | Virtually every task in all 3 ACS | ~140+ tasks |
| 8 | FAA-H-8083-28 | Aviation Weather Handbook (AWH) | PA.I.C, PA.II.A, CA.I.C, CA.II.A, IR.I.B | 5 tasks |

### Advisory Circulars (13 unique ACs)

| # | AC Number (as cited in ACS) | Topic | Referenced By |
|---|---------------------------|-------|-------------|
| 1 | AC 61-67 | Stall and Spin Awareness | PA.VII.B/C/D, CA.VII.B/C/D/E |
| 2 | AC 61-107 | Operations of Aircraft at Altitudes Above 25,000 Ft MSL | CA.VIII.A, CA.VIII.B |
| 3 | AC 68-1 | BasicMed | PA.I.A, CA.I.A, IR.I.A |
| 4 | AC 90-100 | U.S. Terminal and En Route RNAV Operations | IR.II.B, IR.V.B |
| 5 | AC 90-105 | Approval of RNP Procedures with Baro-VNAV | IR.II.B, IR.VI.B |
| 6 | AC 90-107 | Guidance for Localizer Performance with Vertical Guidance | IR.VI.B |
| 7 | AC 91-73 | Taxi Operations (Parts 91/135) | PA.II.D/E, CA.II.D/E |
| 8 | AC 91-74 | Pilot Guide: Flight in Icing Conditions | IR.II.A, IR.V.B |
| 9 | AC 91-78 | Electronic Flight Bags | PA.VI.B, CA.VI.B, IR.II.B |
| 10 | AC 91-92 | Pilot's Guide to Preflight Briefing | PA.I.C, CA.I.C, IR.I.B |
| 11 | AC 91.21-1 | Use of Portable Electronic Devices (PEDs) | IR.II.B, IR.II.C |
| 12 | AC 120-71 | SOPs and Pilot Monitoring | PA.II.B, CA.II.B |
| 13 | AC 120-108 | Continuous Descent Final Approach | IR.VI.A |

### Other FAA Documents (1 unique)

| # | Document | Referenced By |
|---|----------|-------------|
| 1 | FAA-P-8740-66 | Flying Light Twins Safely | PA.IX.E/F/G, PA.X.A-D, CA.IX.E/F/G, CA.X.A-D |

### Non-FAA / Supplementary References (7 types)

| # | Document Type | Referenced By | Notes |
|---|-------------|-------------|-------|
| 1 | POH/AFM | Almost every task | Aircraft-specific, not ingestible |
| 2 | AIM | Many tasks | Already ingested |
| 3 | Chart Supplements U.S. | PA.I.D/I, PA.II.D/E, CA equivalents, IR.I.C | Ingested (SE region) |
| 4 | VFR Navigation Charts | PA.I.D/E, PA.VI.A/C/D, CA equivalents | Sectional/Terminal charts - not directly ingestible |
| 5 | USCG Navigation Rules | PA.I.I, CA.I.I | Ingested |
| 6 | Terminal Procedures Publications | IR.VI.A/B/C/D, IR.VII.C/D | Not ingested as standalone |
| 7 | IFR Enroute/Navigation Charts | IR.I.C | Not directly ingestible |
| 8 | NOTAMs | PA.I.D, CA.I.D, IR.I.C | Dynamic data, not ingestible |

---

## List B: All Documents in Ingestion Registry (`buildDocumentRegistry`)

### Gold Subset (always ingested)

| Abbreviation | FAA Number | Source Dir | File Count | ACS-Referenced? |
|-------------|-----------|-----------|------------|----------------|
| phak | FAA-H-8083-25B | `phak/` | 22 chapters | YES - all 3 ACS |
| afh | FAA-H-8083-3C | `afh/` | 21 chapters | YES - all 3 ACS |
| aim | AIM | `aim/chapters/` | 14 chapters | YES - all 3 ACS |

### All Subset (extended ingestion)

| Abbreviation | FAA Number | Source Dir | File Count | ACS-Referenced? |
|-------------|-----------|-----------|------------|----------------|
| cfr | 14 CFR Part 39 | `cfr/` | 1 file | YES |
| cfr | 14 CFR Part 43 | `cfr/` | 1 file | YES |
| cfr | 14 CFR Part 61 | `cfr/` | 1 file | YES |
| cfr | 14 CFR Part 68 | `cfr/` | 1 file | YES |
| cfr | 14 CFR Part 71 | `cfr/` | 1 file | YES |
| cfr | 14 CFR Part 73 | `cfr/` | 1 file | **NO** - not in any ACS Reference line |
| cfr | 14 CFR Part 91 | `cfr/` | 1 file | YES |
| cfr | 14 CFR Part 93 | `cfr/` | 1 file | YES |
| cfr | 14 CFR Part 97 | `cfr/` | 1 file | YES |
| ifh | FAA-H-8083-15B | `handbooks/ifh_chapters/` | 16 chapters | YES - IR ACS, PA/CA Area X |
| awh | FAA-H-8083-28A | `handbooks/awh_chapters/` | 29 chapters | YES |
| rmh | FAA-H-8083-2A | `handbooks/rmh_chapters/` | 12 chapters | YES |
| wbh | FAA-H-8083-1B | `handbooks/wbh_chapters/` | 15 chapters | YES |
| iph | FAA-H-8083-16B | `handbooks/iph_chapters/` | 11 chapters | YES - IR ACS |
| ac | AC-60-28B-English-Language | `ac/` | 1 file | **NO** - PPL ACS front matter references it but NOT in any task Reference line |
| ac | AC-61-67C-Stall-Spin-Awareness | `ac/` | 1 file | YES |
| ac | AC-68-1A-BasicMed | `ac/` | 1 file | YES |
| ac | AC-90-100A-RNAV-Operations | `ac/` | 1 file | YES |
| ac | AC-90-105A-RNAV-Baro-VNAV | `ac/` | 1 file | YES |
| ac | AC-91-73B-Taxi-Operations | `ac/` | 1 file | YES |
| ac | AC-91-74B-Flight-Icing | `ac/` | 1 file | YES |
| ac | AC-91-78A-Electronic-Flight-Bags | `ac/` | 1 file | YES |
| ac | AC-91-92-Preflight-Briefing | `ac/` | 1 file | YES |
| ac | AC-120-71B-SOPs-Pilot-Monitoring | `ac/` | 1 file | YES |
| ac | AC-120-108-Continuous-Descent | `ac/` | 1 file | YES |
| seaplane | FAA-H-8083-23 | `handbooks/seaplane/` | 4 parts | YES |
| acs | FAA-S-ACS-6C | `acs/` | 1 file | (The ACS itself) |
| acs | FAA-S-ACS-7B | `acs/` | 1 file | (The ACS itself) |
| acs | FAA-S-ACS-8C | `acs/` | 1 file | (The ACS itself) |
| other | (null faa_number) | `other/` | 6 files | Varies (see below) |

### Other Documents (sources/other/)

| Filename | ACS-Referenced? |
|----------|----------------|
| FAA-P-8740-66_Flying_Light_Twins.pdf | YES - multiengine tasks |
| FAA-G-ACS-2_ACS_Companion_Guide.pdf | **NO** - not in any task Reference line |
| USCG_Navigation_Rules.pdf | YES - PA.I.I, CA.I.I |
| Chart_Supplement_SE.pdf | YES - several PA/CA/IR tasks |
| FAA-CT-8080-2H_Private_Pilot_Testing_Supplement.pdf | **NO** - supplemental chart reference |
| Aeronautical_Chart_Users_Guide.pdf | **NO** - supplemental chart reference |

---

## Gap Analysis

### GAP 1: Referenced in ACS but NOT in Ingestion Registry (CRITICAL GAPS)

These documents are explicitly cited in ACS task Reference lines but have **no PDF and no registry entry**:

| Document | ACS Rating(s) | Tasks Citing It | Severity | Action Required |
|----------|--------------|----------------|----------|----------------|
| **AC 61-107** | CPL | CA.VIII.A, CA.VIII.B (High-Altitude Operations) | **HIGH** | Download AC 61-107B from FAA.gov and add to `sources/ac/` |
| **AC 90-107** | IR | IR.VI.B (Instrument Approach - LPV) | **HIGH** | Download AC 90-107A from FAA.gov and add to `sources/ac/` |
| **AC 91.21-1** (or AC 91-21-1) | IR | IR.II.B, IR.II.C (Preflight, PEDs) | **MEDIUM** | Download from FAA.gov; note the unusual dot notation in ACS may correspond to AC 91-21-1D |

3 documents missing. All are Advisory Circulars referenced by the Commercial Pilot or Instrument Rating ACS.

### GAP 2: In Ingestion Registry but NOT Referenced in Any ACS Task

These are ingested but serve no direct ACS reference purpose:

| Document | faa_number in Registry | Purpose |
|----------|----------------------|---------|
| 14 CFR Part 73 | 14 CFR Part 73 | Restricted/Prohibited Areas - not in any ACS task Reference line. However, it is related to airspace topics (PA.I.E) which references Part 71 and 93. **Low priority** -- useful background but not directly ACS-cited. |
| AC 60-28B | AC-60-28B-English-Language | English Language Skill Standards - referenced in ACS Appendix 1 (AELS discussion) but NOT in any specific task's Reference line. **Keep** -- useful for AELS compliance context. |
| FAA-G-ACS-2 | null | ACS Companion Guide for Pilots - not a task reference but a meta-document about the ACS. **Keep** -- valuable supplementary context for the AI examiner. |
| FAA-CT-8080-2H | null | Private Pilot Knowledge Testing Supplement - contains sample charts, weather products, legends. **Keep** -- critical for chart/weather question context. |
| Aeronautical Chart Users' Guide | null | Chart symbol legends. **Keep** -- supports VFR chart interpretation questions. |

**Recommendation**: Keep all 5 in the registry. They provide valuable context even though they are not directly cited in ACS task Reference lines. Consider adding `acs_referenced: false` metadata to distinguish them from directly-cited sources.

### GAP 3: PDFs That Exist But Have No faa_number in Registry

The `other/` directory documents are ingested with `faa_number: null`:

| File | Should Have faa_number |
|------|----------------------|
| FAA-P-8740-66_Flying_Light_Twins.pdf | `FAA-P-8740-66` |
| FAA-G-ACS-2_ACS_Companion_Guide.pdf | `FAA-G-ACS-2` |
| USCG_Navigation_Rules.pdf | N/A (not FAA) |
| Chart_Supplement_SE.pdf | N/A (periodic, no stable FAA number) |
| FAA-CT-8080-2H_Private_Pilot_Testing_Supplement.pdf | `FAA-CT-8080-2H` |
| Aeronautical_Chart_Users_Guide.pdf | N/A (no stable FAA number) |

**Action**: Update the `other/` handler in `buildDocumentRegistry()` to detect and assign `faa_number` values for FAA documents with known publication numbers instead of defaulting to `null`.

### GAP 4: Non-Ingestible References

These documents are cited in ACS task Reference lines but are inherently non-ingestible or dynamic:

| Document | Reason Not Ingestible | Mitigation |
|----------|---------------------|------------|
| POH/AFM | Aircraft-specific, varies per airplane | Add generic POH knowledge to PHAK/AFH chunks; tag chunks with `poh_relevant` metadata |
| VFR Sectional Charts | Geo-referenced raster imagery on 56-day cycle | Chart Users' Guide + Testing Supplement cover symbology |
| VFR Terminal Area Charts | Same as above | Same mitigation |
| IFR Enroute Charts | Same as above | Testing Supplement + AIM cover procedures |
| Terminal Procedures Publications | Updated on 56-day cycle, thousands of pages | AIM + IFH + IPH cover the concepts; specific approach plates not needed |
| NOTAMs | Real-time dynamic data | AIM covers NOTAM types and interpretation |

**No action needed** -- existing sources adequately cover the underlying knowledge.

---

## Structural Finding: ACS Task References Not Stored in Database

The ACS seed migration (`20260214000002_seed_acs_tasks.sql`) stores task ID, rating, area, task name, and knowledge/risk/skill elements as JSONB. However, it does **not** store the per-task `References:` line.

This means:
- The exam engine cannot dynamically look up which source documents are relevant for a given task
- RAG retrieval relies on semantic search rather than precise document targeting
- There is no way to validate chunk coverage per ACS task at the database level

**Recommendation**: Add a `references` column (TEXT[] or JSONB) to the `acs_tasks` table containing the normalized list of FAA document identifiers from each task's Reference line. This would enable:
- Task-aware RAG filtering (restrict search to only documents cited for the current task)
- Coverage validation queries (which tasks have all their reference documents ingested?)
- More precise grounding metadata in exam responses

---

## Summary Scorecard

| Metric | Count |
|--------|-------|
| **Unique documents in ACS Reference lines** | 37 (8 CFR + 8 HB + 13 AC + 1 FAA-P + 7 non-ingestible) |
| **Ingestible documents referenced** | 30 (8 CFR + 8 HB + 13 AC + 1 FAA-P) |
| **Documents in ingestion registry** | 35+ (including chapters, ACS docs, and supplemental) |
| **Critical gaps (referenced but missing)** | **3** (AC 61-107, AC 90-107, AC 91.21-1) |
| **Extra in registry (not ACS-referenced)** | 5 (all worth keeping) |
| **PDFs with missing faa_number** | 3 (FAA-P-8740-66, FAA-G-ACS-2, FAA-CT-8080-2H) |
| **Coverage of ACS-referenced ingestible docs** | **90%** (27 of 30) |

---

## Action Items (Priority Order)

### P0 - Critical (blocks IR and CPL exam quality)

1. **Download AC 61-107B** (Operations at Altitudes Above 25,000 Ft MSL and/or Mach Numbers Greater Than .75)
   - Source: https://www.faa.gov/regulations_policies/advisory_circulars
   - Save to: `sources/ac/AC_61-107B_High_Altitude_Operations.pdf`
   - Referenced by: CA.VIII.A, CA.VIII.B (High-Altitude Operations)

2. **Download AC 90-107A** (Guidance for LPV/LP Approaches)
   - Source: https://www.faa.gov/regulations_policies/advisory_circulars
   - Save to: `sources/ac/AC_90-107A_LPV_Guidance.pdf`
   - Referenced by: IR.VI.B (Instrument Approach Procedures)

3. **Download AC 91-21-1D** (Use of Portable Electronic Devices Aboard Aircraft)
   - Source: https://www.faa.gov/regulations_policies/advisory_circulars
   - Note: ACS cites as "AC 91.21-1" which is the dot-notation variant of AC 91-21-1
   - Save to: `sources/ac/AC_91-21-1D_Portable_Electronic_Devices.pdf`
   - Referenced by: IR.II.B, IR.II.C

### P1 - Important (improves data quality)

4. **Fix `faa_number: null`** for `other/` directory documents in `buildDocumentRegistry()`:
   - `FAA-P-8740-66_Flying_Light_Twins.pdf` -> `faa_number: 'FAA-P-8740-66'`
   - `FAA-G-ACS-2_ACS_Companion_Guide.pdf` -> `faa_number: 'FAA-G-ACS-2'`
   - `FAA-CT-8080-2H_Private_Pilot_Testing_Supplement.pdf` -> `faa_number: 'FAA-CT-8080-2H'`

5. **Add `references` column to `acs_tasks` table** — store the normalized document list per task for task-aware RAG filtering.

### P2 - Nice to Have

6. **Add `acs_referenced: boolean`** metadata to `source_documents` to distinguish directly-cited vs. supplementary sources.

7. **Re-run ingestion** with `--subset all` after downloading the 3 missing ACs to ensure full coverage.

---

## Appendix: Complete Per-Task Reference Mapping

### FAA-S-ACS-6C (Private Pilot) — All 61 Tasks

| Task ID | References |
|---------|-----------|
| PA.I.A | 14 CFR parts 61, 68; AC 68-1; FAA-H-8083-2, FAA-H-8083-25 |
| PA.I.B | 14 CFR parts 39, 43, 91; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.I.C | 14 CFR part 91; AC 91-92; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25, FAA-H-8083-28 |
| PA.I.D | 14 CFR part 91; AIM; Chart Supplements; FAA-H-8083-2, FAA-H-8083-25; VFR Navigation Charts; NOTAMs |
| PA.I.E | 14 CFR parts 71, 91, 93; AIM; FAA-H-8083-2, FAA-H-8083-25 |
| PA.I.F | FAA-H-8083-1, FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.I.G | 14 CFR part 91; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-23, FAA-H-8083-25; POH/AFM |
| PA.I.H | 14 CFR part 91; AIM; FAA-H-8083-2, FAA-H-8083-25 |
| PA.I.I | 14 CFR part 91; AIM; Chart Supplements; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-23, FAA-H-8083-25; USCG Nav Rules; POH/AFM |
| PA.II.A | 14 CFR part 91; AIM; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-23, FAA-H-8083-25, FAA-H-8083-28; POH/AFM |
| PA.II.B | AC 120-71; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.II.C | 14 CFR part 91; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.II.D | 14 CFR part 91; AC 91-73; AIM; Chart Supplements; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.II.E | 14 CFR part 91; AC 91-73; AIM; Chart Supplements; FAA-H-8083-2, FAA-H-8083-25; POH/AFM |
| PA.II.F | 14 CFR part 91; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-23, FAA-H-8083-25; POH/AFM |
| PA.III.A | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.III.B | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.IV.A-N | (14 tasks) Various combinations of: 14 CFR part 91; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-23, FAA-H-8083-25; POH/AFM |
| PA.V.A | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.V.B | 14 CFR part 61; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.VI.A | FAA-H-8083-2, FAA-H-8083-25; VFR Navigation Charts |
| PA.VI.B | AC 91-78; FAA-H-8083-2, FAA-H-8083-25 |
| PA.VI.C | FAA-H-8083-2, FAA-H-8083-25; VFR Navigation Charts |
| PA.VI.D | FAA-H-8083-2, FAA-H-8083-25; VFR Navigation Charts |
| PA.VII.A | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.VII.B | AC 61-67; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.VII.C | AC 61-67; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.VII.D | AC 61-67; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.VIII.A-F | (6 tasks) FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-25; POH/AFM |
| PA.IX.A | 14 CFR part 91; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.IX.B | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.IX.C | 14 CFR part 91; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.IX.D | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.IX.E-G | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; FAA-P-8740-66; POH/AFM |
| PA.X.A-B | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; FAA-P-8740-66; POH/AFM |
| PA.X.C-D | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-25; FAA-P-8740-66; POH/AFM |
| PA.XI.A | AIM; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.XII.A | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM |
| PA.XII.B | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-23, FAA-H-8083-25; POH/AFM |

### FAA-S-ACS-7B (Commercial Pilot) — All 60 Tasks

References mirror PPL ACS exactly for matching areas (I-IX, XI) with these additions:
- **CA.VIII.A**: AC 61-107; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM
- **CA.VIII.B**: AC 61-107; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-25; POH/AFM
- **CA.I.A**: adds "14 CFR part 119, section 119.1(e)" beyond what PA.I.A cites

### FAA-S-ACS-8C (Instrument Rating) — All 22 Tasks

| Task ID | References |
|---------|-----------|
| IR.I.A | 14 CFR parts 61, 91; AC 68-1; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-25 |
| IR.I.B | 14 CFR part 91; AC 91-92; FAA-H-8083-2, FAA-H-8083-15, FAA-H-8083-25, FAA-H-8083-28 |
| IR.I.C | 14 CFR part 91; AIM; Chart Supplements; FAA-H-8083-2, FAA-H-8083-15, FAA-H-8083-16, FAA-H-8083-25; IFR Enroute/Navigation Charts; NOTAMs |
| IR.II.A | 14 CFR part 91; AC 91-74; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-25 |
| IR.II.B | 14 CFR part 91; AC 90-100, AC 90-105, AC 91-78, AC 91.21-1; FAA-H-8083-2, FAA-H-8083-15, FAA-H-8083-25 |
| IR.II.C | 14 CFR part 91; AC 91.21-1; FAA-H-8083-2, FAA-H-8083-15, FAA-H-8083-25 |
| IR.III.A | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-16, FAA-H-8083-25; POH/AFM |
| IR.III.B | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-16, FAA-H-8083-25; POH/AFM |
| IR.IV.A | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-16, FAA-H-8083-25; POH/AFM |
| IR.IV.B | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-25; POH/AFM |
| IR.V.A | 14 CFR part 91; AIM; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-16, FAA-H-8083-25 |
| IR.V.B | 14 CFR parts 91, 97; AC 90-100, AC 91-74; AIM; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-16, FAA-H-8083-25 |
| IR.VI.A | AC 120-108; AIM; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-16, FAA-H-8083-25; Terminal Procedures Publications |
| IR.VI.B | 14 CFR part 91; AC 90-105, AC 90-107; AIM; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-16, FAA-H-8083-25; Terminal Procedures Publications |
| IR.VI.C | 14 CFR parts 91, 97; AIM; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-16, FAA-H-8083-25; Terminal Procedures Publications |
| IR.VI.D | 14 CFR parts 91, 97; AIM; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-16, FAA-H-8083-25; Terminal Procedures Publications |
| IR.VI.E | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-25; POH/AFM |
| IR.VII.A | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-16, FAA-H-8083-25; POH/AFM |
| IR.VII.B | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-25; POH/AFM |
| IR.VII.C | AIM; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-16, FAA-H-8083-25; Terminal Procedures Publications; POH/AFM |
| IR.VII.D | AIM; FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-16, FAA-H-8083-25; Terminal Procedures Publications; POH/AFM |
| IR.VIII.A | FAA-H-8083-2, FAA-H-8083-3, FAA-H-8083-15, FAA-H-8083-25; POH/AFM |
