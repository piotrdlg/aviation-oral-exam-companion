---
date: 2026-03-10
type: system-audit
tags: [heydpe, system-audit, phase-13, multimodal, images, text-cards, semantic-selection]
status: final
evidence_level: high
---

# 36 — Multimodal Semantic Asset Engine (Phase 13)

## Summary

Phase 13 replaces the naive chunk-proximity image selection (sort by relevance_score, take top 3) with a semantic asset selection layer that scores images against ACS element/area context using 4 weighted signals, applies confidence thresholding, and introduces structured text cards for METAR/TAF/regulation content.

## Problem

Before Phase 13, image selection was proximity-based:
- `get_images_for_chunks` RPC returned images linked to the same chunks used for RAG
- `exam-engine.ts` sorted by `relevance_score` and took top 3
- No concept-level semantic indexing (doc 23/R7 gap)
- No confidence threshold — wrong images shown to students
- No text assets for structured data (weather reports, regulations)
- No explainability or monitoring

## Solution: Semantic Asset Selection

### 4-Signal Scoring Model

| Signal | Weight | Description |
|--------|--------|-------------|
| Category-topic alignment | 0.35 | Maps ACS area to expected `image_category` values |
| Caption keyword overlap | 0.25 | Tokenized overlap between question text and image caption/description |
| Link type quality | 0.15 | `figure_ref`=1.0, `manual`=0.9, `caption_match`=0.8, `same_page`=0.6 |
| Relevance score | 0.25 | Pass-through of DB `relevance_score` |

### Confidence Threshold

**0.4** — images scoring below this are excluded. Prefer NO image over wrong image.

### Text Cards

Structured text snippets extracted from RAG chunks when question/element keywords match:
- METAR/TAF → monospace weather report card
- CFR/FAR/AC/AIM → regulation/reference card
- Max 2 text cards per response

### Area-Category Mapping

| ACS Area | Expected Categories |
|----------|-------------------|
| I (Preflight) | chart, diagram, table, general |
| II (Preflight Procedures) | airport, sectional, diagram |
| III (Airport/Airspace) | airport, sectional, diagram, chart |
| VI (Navigation) | sectional, chart, diagram |
| VIII (Performance) | performance, chart, table, diagram |
| IX (Emergency) | weather, chart, diagram, instrument |
| XI (Instrument Approaches) | instrument, weather, chart, performance |
| XII (XC Instrument) | sectional, chart, diagram, weather |

## Changes

### New Files
- `src/lib/asset-selector.ts` — Core module (types, scoring, selection, text cards)
- `src/lib/__tests__/asset-selector.test.ts` — 37 tests across 9 groups
- `src/components/ui/TextAssetCard.tsx` — Text card rendering component
- `src/app/api/admin/quality/multimodal/route.ts` — Admin monitoring endpoint
- `scripts/eval/multimodal-asset-audit.ts` — 10-check offline audit

### Modified Files
- `src/lib/exam-engine.ts` — Replaced naive sort+slice with `selectBestAssets()`, widened `prefetchedRag` type, added `assetContext` and `onAssetSelected` params
- `src/app/api/exam/route.ts` — Builds `AssetSelectionContext` from planner state, passes to streaming, fires `multimodal_asset_selected` PostHog event
- `src/app/(dashboard)/practice/page.tsx` — Handles `{ asset }` SSE event, renders `TextAssetCard`
- `package.json` — Added `eval:multimodal` script

## Backward Compatibility

- Dual-emit SSE: both `{ asset }` (new) and `{ images }` (legacy) events sent
- When no `AssetSelectionContext` provided, falls back to legacy sort+slice
- No DB migration required — uses existing `source_images` and `chunk_image_links` schema
- Feature flag `NEXT_PUBLIC_SHOW_EXAM_IMAGES=true` still controls image rendering

## Monitoring

- **PostHog event**: `multimodal_asset_selected` — fires on every exam response with total_candidates, images_shown, text_cards_shown, top_image_score, threshold
- **Admin endpoint**: `GET /api/admin/quality/multimodal` — reports image category distribution, link type distribution, oral-exam relevance rate, average quality score

## Evidence

| Check | Result |
|-------|--------|
| `npm run typecheck` | Clean (0 errors) |
| `npm test` | 731 tests pass (37 new from asset-selector) |
| `npm run eval:multimodal` | 10/10 checks pass |

## What This Does NOT Change

- No new DB migration — all data exists in current schema
- ExamImages component unchanged — still receives `ImageResult[]`
- Image ingestion pipeline unchanged
- Assessment/grading unaffected
- Voice pipeline unaffected
