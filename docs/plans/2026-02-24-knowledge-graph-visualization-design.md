# Knowledge Graph Visualization — Design Document

**Date**: 2026-02-24
**Status**: Approved
**Goal**: Add an interactive knowledge graph visualization to the HeyDPE admin panel for graph exploration, quality audit, and coverage analysis.

---

## Context

The GraphRAG pipeline has been fully populated on production:
- 22,075 concepts across 8 categories
- 45,728 edges across 6 relation types
- 30,689 evidence links

There is no visual way to explore, audit, or understand this graph. Admins need both an interactive explorer (to navigate concept neighborhoods) and health/coverage dashboards (to spot gaps and quality issues).

---

## Architecture

### Route & Navigation

- **Route**: `/admin/graph` — single page with tabbed sub-views
- **Nav item**: Added to SYSTEM section in `AdminShell.tsx`
  - `{ href: '/admin/graph', label: 'Graph', icon: '⬡' }`
- **Tabs**: Explorer (2D) | 3D View | Health | Coverage

### Libraries

| Library | Purpose | Size |
|---------|---------|------|
| `react-force-graph-2d` | Primary interactive graph explorer | ~40KB |
| `react-force-graph-3d` | 3D WebGL showcase view | ~200KB |

Both come from the `react-force-graph` package (same API). Loaded client-side only (`'use client'` + dynamic import with `ssr: false`).

### Data Flow

```
Admin selects element (search/dropdown)
        |
        v
API: GET /api/admin/graph?element=PA.I.A.K1&depth=2
        |
        v
Server: Supabase RPC get_concept_bundle (existing, maxRows=200 for viz)
        |
        v
Transform to { nodes: [...], links: [...] } format
        |
        v
react-force-graph renders with category-based coloring
```

---

## Tab Specifications

### Tab 1: Explorer (2D)

ACS-element-centric interactive graph browser using `react-force-graph-2d`.

**Controls**:
- Search/select input at top to pick an ACS element (autocomplete by slug or name)
- Rating filter dropdown (Private / Commercial / Instrument)
- Depth slider (1-3 hops, default 2)
- Category filter checkboxes (toggle topic, definition, procedure, etc.)

**Interactions**:
- Click node: opens detail panel on right, highlights connected edges
- Double-click node: re-centers graph on that node (fetches new bundle)
- Hover node: tooltip with name + category + edge count
- Zoom/pan: mouse wheel + drag (built into react-force-graph)

**Canvas**: `c-bg` background with `noise` overlay. Node labels in `font-mono`.

### Tab 2: 3D View

Same data and controls as Explorer, rendered with `react-force-graph-3d` (WebGL).
- Rotatable via mouse drag
- Zoomable via scroll
- Same node/edge coloring scheme
- Same detail panel on click

### Tab 3: Health

Audit dashboard using existing admin styling (no graph library). Metric cards + tables.

**Sections**:
1. **Summary cards** (top row): Total concepts, total edges, evidence links, orphan count — `bezel` cards with `glow-a` numbers
2. **Category breakdown**: Table with columns: category, count, % with embeddings, % validated, avg edges per node
3. **Edge distribution**: Table with columns: relation_type, count, avg confidence, avg weight
4. **Orphan nodes**: Filterable list of concepts with 0 edges. Click to jump to Explorer tab.
5. **Unvalidated concepts**: List of `validation_status = 'pending'`, sortable by category, showing extraction_confidence
6. **Coverage heatmap**: Per-rating (PA/CA/IR) bar showing % of elements with edges beyond `is_component_of`. Uses `prog-a`/`prog-g`/`prog-r` gradient bars.

### Tab 4: Coverage

Reuses the existing `AcsCoverageTreemap` pattern (Nivo treemap). Colors by edge richness:
- `c-green`: element has 5+ connected concepts
- `c-amber`: element has 1-4 connected concepts
- `c-red`: element has 0 connections beyond hierarchy

Click an element in the treemap to jump to the Explorer tab centered on that element.

---

## Visual Encoding

### Node Colors (theme-compatible via CSS variables)

| Category | CSS Variable | Rationale |
|----------|-------------|-----------|
| `acs_area` | `c-amber` | Primary accent — top-level structure |
| `acs_task` | `c-amber-dim` | Dimmed primary — one level down |
| `acs_element` | `c-text` with `c-amber` ring on root | Neutral, highlighted when selected |
| `topic` | `c-cyan` | Secondary accent — knowledge topics |
| `definition` | `c-green` | Established knowledge — definitions |
| `procedure` | `c-cyan-dim` | Dimmed secondary — step-by-step |
| `regulatory_claim` | `c-red` | Alert color — regulatory requirements |
| `artifact` | `c-dim` | Tertiary — reference documents |

All colors read from CSS custom properties, so all 4 themes (Cockpit, Glass, Sectional, Briefing) are automatically supported.

**Node sizing**: Scales with edge count (more connections = larger node).

**Validation indicators**:
- `validated` = solid fill
- `pending` = 50% opacity fill + dashed ring
- `rejected` = `c-red-dim` fill + strikethrough label

### Edge Colors (theme-compatible)

| Relation Type | Color | Style |
|---------------|-------|-------|
| `is_component_of` | `c-amber-dim` | Solid, thick (hierarchy) |
| `applies_in_scenario` | `c-red` at 30% opacity | Dashed (regulatory) |
| `leads_to_discussion_of` | `c-cyan` at 30% opacity | Thin, curved (examiner flow) |
| `requires_knowledge_of` | `c-green` at 30% opacity | Solid (prerequisite) |
| `contrasts_with` | `c-red` | Dotted (opposition) |
| `mitigates_risk_of` | `c-green-dim` | Dotted (risk management) |

---

## Detail Panel

Slide-in panel on the right (320px wide, `c-panel` background) when a node is clicked:

| Section | Content |
|---------|---------|
| **Header** | Concept name + category badge + validation status pill |
| **Content** | Full `content` field text |
| **Key Facts** | Bulleted list from `key_facts` JSONB |
| **Misconceptions** | Warning-styled items from `common_misconceptions` |
| **Edges** | Grouped by relation_type with direction arrows. Each shows target name + confidence. Clickable to re-center. |
| **Evidence** | Source document title + page_ref from `concept_chunk_evidence`. Top 3 by confidence. |

---

## API Endpoints

All require admin authentication via `requireAdmin(request)`.

### `GET /api/admin/graph`

Query params:
- `element` (required): ACS element slug (e.g., `PA.I.A.K1`)
- `depth` (optional, default 2): traversal depth (1-3)

Returns: `{ nodes: ConceptNode[], links: ConceptLink[] }` formatted for react-force-graph.

Uses existing `get_concept_bundle` RPC with `maxRows=200`.

### `GET /api/admin/graph/health`

Returns aggregate stats:
```json
{
  "totals": { "concepts": 22075, "edges": 45728, "evidence": 30689, "orphans": 966 },
  "byCategory": [{ "category": "topic", "count": 4992, "pctEmbedded": 100, "pctValidated": 0, "avgEdges": 3.2 }],
  "byRelation": [{ "type": "applies_in_scenario", "count": 26328, "avgConfidence": 0.85 }],
  "orphans": [{ "id": "...", "name": "...", "category": "..." }],
  "unvalidated": [{ "id": "...", "name": "...", "category": "...", "confidence": 0.7 }]
}
```

### `GET /api/admin/graph/coverage`

Query params:
- `rating` (optional, default `private`): `private` | `commercial` | `instrument`

Returns per-element edge counts for treemap:
```json
{
  "rating": "private",
  "areas": [{
    "name": "I. Preflight Preparation",
    "tasks": [{
      "name": "PA.I.A",
      "elements": [{ "code": "PA.I.A.K1", "name": "...", "edgeCount": 12 }]
    }]
  }]
}
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/app/(admin)/admin/graph/page.tsx` | Graph page with tab router |
| `src/app/(admin)/admin/graph/GraphExplorer.tsx` | 2D force graph component |
| `src/app/(admin)/admin/graph/Graph3DView.tsx` | 3D force graph component |
| `src/app/(admin)/admin/graph/GraphHealth.tsx` | Health audit dashboard |
| `src/app/(admin)/admin/graph/GraphCoverage.tsx` | Coverage treemap |
| `src/app/(admin)/admin/graph/GraphDetailPanel.tsx` | Node detail sidebar |
| `src/app/(admin)/admin/graph/graph-types.ts` | Shared types for graph viz |
| `src/app/api/admin/graph/route.ts` | Graph bundle API |
| `src/app/api/admin/graph/health/route.ts` | Health stats API |
| `src/app/api/admin/graph/coverage/route.ts` | Coverage data API |

## Files to Modify

| File | Change |
|------|--------|
| `src/app/(admin)/AdminShell.tsx` | Add Graph nav item to SYSTEM section |
| `package.json` | Add `react-force-graph` dependency |
