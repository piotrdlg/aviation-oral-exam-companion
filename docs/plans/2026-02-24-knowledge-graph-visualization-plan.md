# Knowledge Graph Visualization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an interactive knowledge graph visualization to the HeyDPE admin panel with 2D explorer, 3D view, health audit dashboard, and coverage treemap.

**Architecture:** Single admin page at `/admin/graph` with 4 tabbed views. `react-force-graph` (2D + 3D) for interactive graph rendering, existing Nivo treemap for coverage. Three new API routes serve graph data, health stats, and coverage metrics. All reads use `serviceSupabase` behind `requireAdmin()`. Colors use CSS variables (`c-amber`, `c-cyan`, `c-green`, `c-red`, `c-dim`) for automatic 4-theme compatibility.

**Tech Stack:** Next.js 16 App Router, React 19, react-force-graph (2D + 3D), @nivo/treemap (existing), Supabase PostgreSQL (existing RPCs + raw queries), Tailwind CSS v4 (existing theme system), TypeScript

---

## Task 1: Install dependency and add nav item

**Files:**
- Modify: `package.json`
- Modify: `src/app/(admin)/AdminShell.tsx:18-27`

**Step 1: Install react-force-graph**

Run: `cd /Users/piotrdlugiewicz/claude-projects/aviation-oral-exam-companion && npm install react-force-graph`

Expected: Package installs successfully. This single package exports `ForceGraph2D` and `ForceGraph3D`.

**Step 2: Add Graph nav item to AdminShell**

In `src/app/(admin)/AdminShell.tsx`, add to the SYSTEM `items` array (after the Moderation entry at line 25):

```typescript
      { href: '/admin/graph', label: 'Graph', icon: '\u2B21' },
```

The full SYSTEM section should now read:
```typescript
  {
    label: 'SYSTEM',
    items: [
      { href: '/admin/prompts', label: 'Prompts', icon: '\u27E8\u27E9' },
      { href: '/admin/config', label: 'Config', icon: '\u2699' },
      { href: '/admin/tts', label: 'Voice / TTS', icon: '\u266B' },
      { href: '/admin/voicelab', label: 'Voice Lab', icon: '\u2697' },
      { href: '/admin/moderation', label: 'Moderation', icon: '\u2691' },
      { href: '/admin/graph', label: 'Graph', icon: '\u2B21' },
    ],
  },
```

**Step 3: Verify**

Run: `cd /Users/piotrdlugiewicz/claude-projects/aviation-oral-exam-companion && npx tsc --noEmit`

Expected: No type errors.

**Step 4: Commit**

```bash
git add package.json package-lock.json src/app/(admin)/AdminShell.tsx
git commit -m "feat: add react-force-graph dependency and Graph nav item"
```

---

## Task 2: Shared types and theme color utilities

**Files:**
- Create: `src/app/(admin)/admin/graph/graph-types.ts`

**Step 1: Create the types file**

```typescript
import type { ConceptCategory, RelationType, ValidationStatus } from '@/types/database';

/** Node in the force-graph data structure */
export interface GraphNode {
  id: string;
  name: string;
  slug: string;
  category: ConceptCategory;
  content: string;
  keyFacts: unknown[];
  misconceptions: unknown[];
  validationStatus: ValidationStatus;
  edgeCount: number;
  evidence: EvidenceItem[];
  // Set by force-graph at runtime
  x?: number;
  y?: number;
  z?: number;
}

/** Edge in the force-graph data structure */
export interface GraphLink {
  source: string;
  target: string;
  relationType: RelationType;
  weight: number;
  confidence: number;
  examinerTransition: string | null;
}

/** Evidence citation attached to a concept */
export interface EvidenceItem {
  chunkId: string;
  docTitle: string;
  pageRef: string | null;
  confidence: number;
}

/** Data shape for react-force-graph */
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** Health tab aggregate data */
export interface GraphHealthData {
  totals: {
    concepts: number;
    edges: number;
    evidence: number;
    orphans: number;
  };
  byCategory: CategoryStats[];
  byRelation: RelationStats[];
  orphans: OrphanNode[];
  unvalidated: UnvalidatedNode[];
  coverage: RatingCoverage[];
}

export interface CategoryStats {
  category: string;
  count: number;
  pctEmbedded: number;
  pctValidated: number;
  avgEdges: number;
}

export interface RelationStats {
  type: string;
  count: number;
  avgConfidence: number;
  avgWeight: number;
}

export interface OrphanNode {
  id: string;
  name: string;
  slug: string;
  category: string;
}

export interface UnvalidatedNode {
  id: string;
  name: string;
  slug: string;
  category: string;
  confidence: number | null;
}

export interface RatingCoverage {
  rating: string;
  totalElements: number;
  connectedElements: number;
  pct: number;
}

/** Coverage tab data */
export interface CoverageData {
  rating: string;
  areas: CoverageArea[];
}

export interface CoverageArea {
  name: string;
  slug: string;
  tasks: CoverageTask[];
}

export interface CoverageTask {
  name: string;
  slug: string;
  elements: CoverageElement[];
}

export interface CoverageElement {
  code: string;
  name: string;
  edgeCount: number;
}

/**
 * Map concept category to CSS color variable name.
 * These map to --color-c-* CSS custom properties defined in globals.css,
 * which automatically adapt across all 4 themes (cockpit/glass/sectional/briefing).
 */
export const CATEGORY_COLORS: Record<ConceptCategory, string> = {
  acs_area: 'var(--color-c-amber)',
  acs_task: 'var(--color-c-amber-dim)',
  acs_element: 'var(--color-c-text)',
  topic: 'var(--color-c-cyan)',
  definition: 'var(--color-c-green)',
  procedure: 'var(--color-c-cyan-dim)',
  regulatory_claim: 'var(--color-c-red)',
  artifact: 'var(--color-c-dim)',
};

/**
 * Map relation type to CSS color + opacity for edges.
 */
export const RELATION_COLORS: Record<RelationType, { color: string; opacity: number }> = {
  is_component_of: { color: 'var(--color-c-amber-dim)', opacity: 0.8 },
  applies_in_scenario: { color: 'var(--color-c-red)', opacity: 0.3 },
  leads_to_discussion_of: { color: 'var(--color-c-cyan)', opacity: 0.3 },
  requires_knowledge_of: { color: 'var(--color-c-green)', opacity: 0.3 },
  contrasts_with: { color: 'var(--color-c-red)', opacity: 0.7 },
  mitigates_risk_of: { color: 'var(--color-c-green-dim)', opacity: 0.5 },
};

/** Category labels for display */
export const CATEGORY_LABELS: Record<ConceptCategory, string> = {
  acs_area: 'ACS Area',
  acs_task: 'ACS Task',
  acs_element: 'ACS Element',
  topic: 'Topic',
  definition: 'Definition',
  procedure: 'Procedure',
  regulatory_claim: 'Regulatory Claim',
  artifact: 'Artifact',
};

/** Relation type labels for display */
export const RELATION_LABELS: Record<RelationType, string> = {
  is_component_of: 'Component Of',
  applies_in_scenario: 'Applies In',
  leads_to_discussion_of: 'Leads To',
  requires_knowledge_of: 'Requires',
  contrasts_with: 'Contrasts With',
  mitigates_risk_of: 'Mitigates',
};
```

**Step 2: Verify types**

Run: `npx tsc --noEmit`

Expected: No errors.

**Step 3: Commit**

```bash
git add src/app/(admin)/admin/graph/graph-types.ts
git commit -m "feat: add shared types and color maps for graph visualization"
```

---

## Task 3: Graph bundle API endpoint

**Files:**
- Create: `src/app/api/admin/graph/route.ts`

**Context:** This endpoint reuses the existing `get_concept_bundle` Supabase RPC (already deployed to production). The RPC accepts `p_element_code` and `p_max_depth` and returns concept rows with edges and evidence. We transform its output into `{ nodes, links }` for react-force-graph.

**Reference files:**
- `src/lib/graph-retrieval.ts` — `ConceptBundleRow` interface (the RPC return type)
- `src/lib/admin-guard.ts` — `requireAdmin()` + `handleAdminError()` pattern
- `src/app/api/admin/dashboard/route.ts` — example admin API route structure

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';
import type { GraphNode, GraphLink } from '@/app/(admin)/admin/graph/graph-types';

/**
 * GET /api/admin/graph?element=PA.I.A.K1&depth=2
 *
 * Returns { nodes, links } for the graph explorer.
 * Uses the existing get_concept_bundle RPC with maxRows=200 for visualization.
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const url = new URL(request.url);
    const element = url.searchParams.get('element');
    const depth = Math.min(parseInt(url.searchParams.get('depth') || '2', 10), 3);

    if (!element) {
      return NextResponse.json({ error: 'element parameter required' }, { status: 400 });
    }

    // Call existing RPC
    const { data, error } = await serviceSupabase
      .rpc('get_concept_bundle', {
        p_element_code: element,
        p_max_depth: depth,
      })
      .limit(200);

    if (error) {
      console.error('get_concept_bundle error:', error.message);
      return NextResponse.json({ error: 'Graph query failed' }, { status: 500 });
    }

    const rows = data ?? [];

    // Deduplicate nodes (RPC can return same concept at different depths)
    const nodeMap = new Map<string, GraphNode>();
    const links: GraphLink[] = [];

    for (const row of rows) {
      if (!nodeMap.has(row.concept_id)) {
        nodeMap.set(row.concept_id, {
          id: row.concept_id,
          name: row.concept_name,
          slug: '', // Will be filled below
          category: row.concept_category,
          content: row.concept_content || '',
          keyFacts: Array.isArray(row.key_facts) ? row.key_facts : [],
          misconceptions: Array.isArray(row.common_misconceptions) ? row.common_misconceptions : [],
          validationStatus: 'pending',
          edgeCount: 0,
          evidence: (row.evidence_chunks ?? []).map((c: { chunk_id: string; doc_title: string; page_ref: string | null; confidence: number }) => ({
            chunkId: c.chunk_id,
            docTitle: c.doc_title,
            pageRef: c.page_ref,
            confidence: c.confidence,
          })),
        });
      }
    }

    // Fetch slugs and validation status for all concept IDs
    const conceptIds = Array.from(nodeMap.keys());
    if (conceptIds.length > 0) {
      const { data: conceptDetails } = await serviceSupabase
        .from('concepts')
        .select('id, slug, validation_status')
        .in('id', conceptIds);

      if (conceptDetails) {
        for (const detail of conceptDetails) {
          const node = nodeMap.get(detail.id);
          if (node) {
            node.slug = detail.slug;
            node.validationStatus = detail.validation_status;
          }
        }
      }
    }

    // Fetch edges between these concepts
    if (conceptIds.length > 0) {
      const { data: edges } = await serviceSupabase
        .from('concept_relations')
        .select('source_id, target_id, relation_type, weight, confidence, examiner_transition')
        .or(`source_id.in.(${conceptIds.join(',')}),target_id.in.(${conceptIds.join(',')})`)
        .limit(500);

      if (edges) {
        for (const edge of edges) {
          // Only include edges where both endpoints are in our node set
          if (nodeMap.has(edge.source_id) && nodeMap.has(edge.target_id)) {
            links.push({
              source: edge.source_id,
              target: edge.target_id,
              relationType: edge.relation_type,
              weight: edge.weight,
              confidence: edge.confidence,
              examinerTransition: edge.examiner_transition,
            });

            // Count edges per node
            const srcNode = nodeMap.get(edge.source_id);
            const tgtNode = nodeMap.get(edge.target_id);
            if (srcNode) srcNode.edgeCount++;
            if (tgtNode) tgtNode.edgeCount++;
          }
        }
      }
    }

    return NextResponse.json({
      nodes: Array.from(nodeMap.values()),
      links,
    });
  } catch (err) {
    return handleAdminError(err);
  }
}
```

**Step 2: Also add element search endpoint**

We need a way to search for ACS elements for the autocomplete. Add a query mode:

When `?search=<term>` is passed instead of `?element=`, return matching ACS element concepts:

Add this block at the top of the GET handler, after the `requireAdmin` call but before the element check:

```typescript
    const search = url.searchParams.get('search');
    if (search) {
      const { data: results } = await serviceSupabase
        .from('concepts')
        .select('id, name, slug, category')
        .in('category', ['acs_element', 'acs_task', 'acs_area'])
        .or(`slug.ilike.%${search}%,name.ilike.%${search}%`)
        .order('category')
        .limit(20);

      return NextResponse.json({ results: results ?? [] });
    }
```

**Step 3: Verify**

Run: `npx tsc --noEmit`

Expected: No errors.

**Step 4: Commit**

```bash
git add src/app/api/admin/graph/route.ts
git commit -m "feat: add graph bundle API with element search"
```

---

## Task 4: Health stats API endpoint

**Files:**
- Create: `src/app/api/admin/graph/health/route.ts`

**Context:** This runs multiple aggregate queries against `concepts`, `concept_relations`, and `concept_chunk_evidence` tables. All use `serviceSupabase` (bypasses RLS). Pattern follows `src/app/api/admin/dashboard/route.ts` with parallel `Promise.all`.

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/graph/health
 *
 * Returns aggregate graph health stats for the Health tab.
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const [
      conceptCountResult,
      edgeCountResult,
      evidenceCountResult,
      categoriesResult,
      relationsResult,
      orphansResult,
      unvalidatedResult,
      coverageResult,
    ] = await Promise.all([
      // Total concepts
      serviceSupabase
        .from('concepts')
        .select('id', { count: 'exact', head: true }),

      // Total edges
      serviceSupabase
        .from('concept_relations')
        .select('id', { count: 'exact', head: true }),

      // Total evidence links
      serviceSupabase
        .from('concept_chunk_evidence')
        .select('id', { count: 'exact', head: true }),

      // Category breakdown with stats — use raw SQL via RPC isn't needed,
      // we'll compute in JS from a grouped fetch
      serviceSupabase
        .from('concepts')
        .select('category, validation_status, embedding_status'),

      // Relation type breakdown
      serviceSupabase
        .from('concept_relations')
        .select('relation_type, confidence, weight'),

      // Orphan concepts (no edges at all) — concepts not in any relation
      serviceSupabase.rpc('get_orphan_concepts_admin').limit(100),

      // Unvalidated concepts (pending)
      serviceSupabase
        .from('concepts')
        .select('id, name, slug, category, extraction_confidence')
        .eq('validation_status', 'pending')
        .order('extraction_confidence', { ascending: true, nullsFirst: true })
        .limit(100),

      // ACS element coverage per rating
      serviceSupabase
        .from('concepts')
        .select('id, slug')
        .eq('category', 'acs_element'),
    ]);

    // Compute category stats
    const catMap = new Map<string, { total: number; embedded: number; validated: number }>();
    if (categoriesResult.data) {
      for (const row of categoriesResult.data) {
        if (!catMap.has(row.category)) {
          catMap.set(row.category, { total: 0, embedded: 0, validated: 0 });
        }
        const entry = catMap.get(row.category)!;
        entry.total++;
        if (row.embedding_status === 'current') entry.embedded++;
        if (row.validation_status === 'validated') entry.validated++;
      }
    }

    const byCategory = Array.from(catMap.entries()).map(([category, stats]) => ({
      category,
      count: stats.total,
      pctEmbedded: stats.total > 0 ? Math.round((stats.embedded / stats.total) * 100) : 0,
      pctValidated: stats.total > 0 ? Math.round((stats.validated / stats.total) * 100) : 0,
      avgEdges: 0, // computed below
    }));

    // Compute relation stats
    const relMap = new Map<string, { count: number; totalConf: number; totalWeight: number }>();
    if (relationsResult.data) {
      for (const row of relationsResult.data) {
        if (!relMap.has(row.relation_type)) {
          relMap.set(row.relation_type, { count: 0, totalConf: 0, totalWeight: 0 });
        }
        const entry = relMap.get(row.relation_type)!;
        entry.count++;
        entry.totalConf += row.confidence ?? 0;
        entry.totalWeight += row.weight ?? 0;
      }
    }

    const byRelation = Array.from(relMap.entries()).map(([type, stats]) => ({
      type,
      count: stats.count,
      avgConfidence: stats.count > 0 ? Math.round((stats.totalConf / stats.count) * 100) / 100 : 0,
      avgWeight: stats.count > 0 ? Math.round((stats.totalWeight / stats.count) * 100) / 100 : 0,
    }));

    // Orphans — the RPC may not exist yet, fallback to empty
    const orphans = (orphansResult.data ?? []).map((row: { id: string; name: string; slug: string; category: string }) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      category: row.category,
    }));

    // Unvalidated
    const unvalidated = (unvalidatedResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      category: row.category,
      confidence: row.extraction_confidence,
    }));

    // Coverage per rating
    const elements = coverageResult.data ?? [];
    const ratingMap = new Map<string, { total: number; connected: number }>();
    const ratingPrefixes: Record<string, string> = { 'PA.': 'private', 'CA.': 'commercial', 'IR.': 'instrument' };

    for (const el of elements) {
      const slug: string = el.slug ?? '';
      // slug format: acs_element:PA.I.A.K1
      const code = slug.replace('acs_element:', '');
      const prefix = Object.keys(ratingPrefixes).find(p => code.startsWith(p));
      if (!prefix) continue;
      const rating = ratingPrefixes[prefix];
      if (!ratingMap.has(rating)) ratingMap.set(rating, { total: 0, connected: 0 });
      ratingMap.get(rating)!.total++;
    }

    // Count elements with edges beyond is_component_of
    // We need a subquery — for simplicity, fetch edge counts for acs_elements
    const { data: elementEdges } = await serviceSupabase
      .from('concept_relations')
      .select('source_id, target_id, relation_type')
      .or('relation_type.neq.is_component_of')
      .limit(50000);

    if (elementEdges) {
      const connectedIds = new Set<string>();
      for (const edge of elementEdges) {
        if (edge.relation_type !== 'is_component_of') {
          connectedIds.add(edge.source_id);
          connectedIds.add(edge.target_id);
        }
      }
      for (const el of elements) {
        const slug: string = el.slug ?? '';
        const code = slug.replace('acs_element:', '');
        const prefix = Object.keys(ratingPrefixes).find(p => code.startsWith(p));
        if (!prefix) continue;
        const rating = ratingPrefixes[prefix];
        if (connectedIds.has(el.id)) {
          ratingMap.get(rating)!.connected++;
        }
      }
    }

    const coverage = Array.from(ratingMap.entries()).map(([rating, stats]) => ({
      rating,
      totalElements: stats.total,
      connectedElements: stats.connected,
      pct: stats.total > 0 ? Math.round((stats.connected / stats.total) * 100) : 0,
    }));

    return NextResponse.json({
      totals: {
        concepts: conceptCountResult.count ?? 0,
        edges: edgeCountResult.count ?? 0,
        evidence: evidenceCountResult.count ?? 0,
        orphans: orphans.length,
      },
      byCategory,
      byRelation,
      orphans,
      unvalidated,
      coverage,
    });
  } catch (err) {
    return handleAdminError(err);
  }
}
```

**Step 2: Create orphan concepts RPC**

We need a small Supabase RPC to find orphan concepts efficiently. Create migration:

Create file `supabase/migrations/20260224100001_orphan_concepts_rpc.sql`:

```sql
-- RPC to find concepts with zero edges (not in concept_relations as source or target)
CREATE OR REPLACE FUNCTION get_orphan_concepts_admin()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  category TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT c.id, c.name, c.slug, c.category
  FROM concepts c
  WHERE NOT EXISTS (
    SELECT 1 FROM concept_relations cr
    WHERE cr.source_id = c.id OR cr.target_id = c.id
  )
  ORDER BY c.category, c.name
  LIMIT 200;
$$;

-- Grant to authenticated (admin guard checks admin_users before calling)
GRANT EXECUTE ON FUNCTION get_orphan_concepts_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION get_orphan_concepts_admin() TO service_role;
```

**Step 3: Push migration**

Run: `cd /Users/piotrdlugiewicz/claude-projects/aviation-oral-exam-companion && npx supabase db push`

Expected: Migration applied successfully.

**Step 4: Verify types**

Run: `npx tsc --noEmit`

Expected: No errors.

**Step 5: Commit**

```bash
git add src/app/api/admin/graph/health/route.ts supabase/migrations/20260224100001_orphan_concepts_rpc.sql
git commit -m "feat: add graph health API and orphan concepts RPC"
```

---

## Task 5: Coverage API endpoint

**Files:**
- Create: `src/app/api/admin/graph/coverage/route.ts`

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

const RATING_PREFIXES: Record<string, string> = {
  private: 'PA.',
  commercial: 'CA.',
  instrument: 'IR.',
};

/**
 * GET /api/admin/graph/coverage?rating=private
 *
 * Returns per-element edge counts for the coverage treemap.
 * Elements are grouped by area > task > element.
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const url = new URL(request.url);
    const rating = url.searchParams.get('rating') || 'private';
    const prefix = RATING_PREFIXES[rating];

    if (!prefix) {
      return NextResponse.json({ error: 'Invalid rating. Use: private, commercial, instrument' }, { status: 400 });
    }

    // Get all ACS elements for this rating
    const { data: elements } = await serviceSupabase
      .from('concepts')
      .select('id, name, slug')
      .eq('category', 'acs_element')
      .like('slug', `acs_element:${prefix}%`);

    if (!elements || elements.length === 0) {
      return NextResponse.json({ rating, areas: [] });
    }

    // Get edge counts per element (excluding is_component_of)
    const elementIds = elements.map((e) => e.id);
    const { data: edges } = await serviceSupabase
      .from('concept_relations')
      .select('source_id, target_id')
      .neq('relation_type', 'is_component_of')
      .or(`source_id.in.(${elementIds.join(',')}),target_id.in.(${elementIds.join(',')})`)
      .limit(50000);

    // Count edges per element
    const edgeCounts = new Map<string, number>();
    if (edges) {
      for (const edge of edges) {
        if (elementIds.includes(edge.source_id)) {
          edgeCounts.set(edge.source_id, (edgeCounts.get(edge.source_id) || 0) + 1);
        }
        if (elementIds.includes(edge.target_id)) {
          edgeCounts.set(edge.target_id, (edgeCounts.get(edge.target_id) || 0) + 1);
        }
      }
    }

    // Build hierarchy: area > task > element
    // slug format: acs_element:PA.I.A.K1
    // area: PA.I, task: PA.I.A, element: PA.I.A.K1
    const areaMap = new Map<string, Map<string, { code: string; name: string; edgeCount: number }[]>>();

    for (const el of elements) {
      const code = (el.slug as string).replace('acs_element:', '');
      const parts = code.split('.');
      if (parts.length < 4) continue;

      const areaKey = `${parts[0]}.${parts[1]}`; // PA.I
      const taskKey = `${parts[0]}.${parts[1]}.${parts[2]}`; // PA.I.A

      if (!areaMap.has(areaKey)) areaMap.set(areaKey, new Map());
      const taskMap = areaMap.get(areaKey)!;
      if (!taskMap.has(taskKey)) taskMap.set(taskKey, []);
      taskMap.get(taskKey)!.push({
        code,
        name: el.name as string,
        edgeCount: edgeCounts.get(el.id) || 0,
      });
    }

    // Get area names from acs_area concepts
    const { data: areaNames } = await serviceSupabase
      .from('concepts')
      .select('slug, name')
      .eq('category', 'acs_area')
      .like('slug', `acs_area:${rating.charAt(0).toLowerCase()}%`);

    const areaNameMap = new Map<string, string>();
    if (areaNames) {
      for (const a of areaNames) {
        // slug: acs_area:private:I → key: PA.I
        const match = (a.slug as string).match(/:(\w+):([IVXLC]+)$/);
        if (match) {
          const rPrefix = match[1] === 'private' ? 'PA' : match[1] === 'commercial' ? 'CA' : 'IR';
          areaNameMap.set(`${rPrefix}.${match[2]}`, a.name as string);
        }
      }
    }

    const areas = Array.from(areaMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([areaKey, taskMap]) => ({
        name: areaNameMap.get(areaKey) || areaKey,
        slug: areaKey,
        tasks: Array.from(taskMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([taskKey, elements]) => ({
            name: taskKey,
            slug: taskKey,
            elements: elements.sort((a, b) => a.code.localeCompare(b.code)),
          })),
      }));

    return NextResponse.json({ rating, areas });
  } catch (err) {
    return handleAdminError(err);
  }
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`

Expected: No errors.

**Step 3: Commit**

```bash
git add src/app/api/admin/graph/coverage/route.ts
git commit -m "feat: add graph coverage API for treemap visualization"
```

---

## Task 6: Detail panel component

**Files:**
- Create: `src/app/(admin)/admin/graph/GraphDetailPanel.tsx`

**Context:** This is a slide-in sidebar (320px) on the right side of the graph. Shown when a node is clicked. Uses the same styling patterns as other admin panels — `c-panel` background, `c-border` dividers, `font-mono` labels, `glow-a` accents.

**Step 1: Create the component**

```tsx
'use client';

import type { GraphNode, GraphLink } from './graph-types';
import { CATEGORY_LABELS, RELATION_LABELS } from './graph-types';
import type { ConceptCategory, RelationType, ValidationStatus } from '@/types/database';

interface Props {
  node: GraphNode | null;
  links: GraphLink[];
  allNodes: GraphNode[];
  onNavigate: (nodeId: string) => void;
  onClose: () => void;
}

function ValidationBadge({ status }: { status: ValidationStatus }) {
  const styles: Record<ValidationStatus, string> = {
    validated: 'bg-c-green/20 text-c-green border-c-green/30',
    pending: 'bg-c-amber/20 text-c-amber border-c-amber/30',
    rejected: 'bg-c-red/20 text-c-red border-c-red/30',
    needs_edit: 'bg-c-amber/20 text-c-amber border-c-amber/30',
  };
  return (
    <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 border rounded ${styles[status]}`}>
      {status}
    </span>
  );
}

function CategoryBadge({ category }: { category: ConceptCategory }) {
  return (
    <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 border border-c-border rounded text-c-muted">
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

export default function GraphDetailPanel({ node, links, allNodes, onNavigate, onClose }: Props) {
  if (!node) return null;

  // Find edges connected to this node
  const connectedLinks = links.filter(
    (l) => {
      const srcId = typeof l.source === 'object' ? (l.source as unknown as GraphNode).id : l.source;
      const tgtId = typeof l.target === 'object' ? (l.target as unknown as GraphNode).id : l.target;
      return srcId === node.id || tgtId === node.id;
    }
  );

  // Group edges by relation type
  const edgesByType = new Map<RelationType, { targetId: string; targetName: string; direction: 'out' | 'in'; confidence: number }[]>();
  for (const link of connectedLinks) {
    const srcId = typeof link.source === 'object' ? (link.source as unknown as GraphNode).id : link.source;
    const tgtId = typeof link.target === 'object' ? (link.target as unknown as GraphNode).id : link.target;
    const isOutgoing = srcId === node.id;
    const otherId = isOutgoing ? tgtId : srcId;
    const otherNode = allNodes.find((n) => n.id === otherId);

    if (!edgesByType.has(link.relationType)) edgesByType.set(link.relationType, []);
    edgesByType.get(link.relationType)!.push({
      targetId: otherId,
      targetName: otherNode?.name ?? otherId,
      direction: isOutgoing ? 'out' : 'in',
      confidence: link.confidence,
    });
  }

  return (
    <div className="w-80 flex-shrink-0 border-l border-c-border bg-c-panel overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-c-border">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-mono text-sm font-bold text-c-text leading-tight">{node.name}</h3>
          <button
            onClick={onClose}
            className="text-c-muted hover:text-c-text text-xs font-mono flex-shrink-0"
            title="Close"
          >
            &times;
          </button>
        </div>
        <div className="flex gap-1.5 mt-2">
          <CategoryBadge category={node.category} />
          <ValidationBadge status={node.validationStatus} />
        </div>
        {node.slug && (
          <p className="font-mono text-[10px] text-c-dim mt-1.5 break-all">{node.slug}</p>
        )}
      </div>

      {/* Content */}
      {node.content && (
        <div className="p-4 border-b border-c-border">
          <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider mb-1.5">// Content</p>
          <p className="text-xs text-c-muted leading-relaxed">{node.content}</p>
        </div>
      )}

      {/* Key Facts */}
      {node.keyFacts.length > 0 && (
        <div className="p-4 border-b border-c-border">
          <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider mb-1.5">// Key Facts</p>
          <ul className="space-y-1">
            {node.keyFacts.map((fact, i) => (
              <li key={i} className="text-xs text-c-muted flex gap-1.5">
                <span className="text-c-cyan flex-shrink-0">&bull;</span>
                <span>{typeof fact === 'string' ? fact : JSON.stringify(fact)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Misconceptions */}
      {node.misconceptions.length > 0 && (
        <div className="p-4 border-b border-c-border">
          <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider mb-1.5">// Misconceptions</p>
          <ul className="space-y-1">
            {node.misconceptions.map((m, i) => (
              <li key={i} className="text-xs text-c-red/80 flex gap-1.5">
                <span className="flex-shrink-0">&loz;</span>
                <span>{typeof m === 'string' ? m : JSON.stringify(m)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Edges */}
      {edgesByType.size > 0 && (
        <div className="p-4 border-b border-c-border">
          <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider mb-1.5">
            // Edges ({connectedLinks.length})
          </p>
          <div className="space-y-3">
            {Array.from(edgesByType.entries()).map(([relType, edges]) => (
              <div key={relType}>
                <p className="font-mono text-[10px] text-c-amber mb-1">
                  {RELATION_LABELS[relType] ?? relType}
                </p>
                <ul className="space-y-0.5 pl-2">
                  {edges.map((edge, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-c-dim">{edge.direction === 'out' ? '\u2192' : '\u2190'}</span>
                      <button
                        onClick={() => onNavigate(edge.targetId)}
                        className="text-xs text-c-cyan hover:text-c-text transition-colors truncate text-left"
                        title={edge.targetName}
                      >
                        {edge.targetName}
                      </button>
                      <span className="text-[9px] text-c-dim ml-auto flex-shrink-0">
                        {(edge.confidence * 100).toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evidence */}
      {node.evidence.length > 0 && (
        <div className="p-4">
          <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider mb-1.5">
            // Evidence ({node.evidence.length})
          </p>
          <ul className="space-y-1">
            {node.evidence.map((ev, i) => (
              <li key={i} className="text-xs text-c-muted flex gap-1.5">
                <span className="text-c-amber flex-shrink-0">&para;</span>
                <span>
                  {ev.docTitle}
                  {ev.pageRef && <span className="text-c-dim"> {ev.pageRef}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`

Expected: No errors.

**Step 3: Commit**

```bash
git add src/app/(admin)/admin/graph/GraphDetailPanel.tsx
git commit -m "feat: add graph detail panel for concept inspection"
```

---

## Task 7: 2D Graph Explorer component

**Files:**
- Create: `src/app/(admin)/admin/graph/GraphExplorer.tsx`

**Context:** Uses `react-force-graph-2d` via dynamic import (SSR disabled). Canvas-based rendering. Reads CSS variables from the DOM at mount time for theme-compatible colors. D3 force simulation runs automatically.

**Step 1: Create the component**

```tsx
'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { GraphData, GraphNode, GraphLink } from './graph-types';
import { CATEGORY_COLORS, RELATION_COLORS, CATEGORY_LABELS } from './graph-types';
import type { ConceptCategory, RelationType } from '@/types/database';
import GraphDetailPanel from './GraphDetailPanel';

// Dynamic import — react-force-graph uses canvas/WebGL, can't render on server
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

/** Read a CSS custom property value from the document root */
function getCssColor(varExpr: string): string {
  if (typeof window === 'undefined') return '#888';
  const match = varExpr.match(/var\((.+)\)/);
  if (!match) return varExpr;
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || '#888';
}

export default function GraphExplorer() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; slug: string; category: string }[]>([]);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [depth, setDepth] = useState(2);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const fgRef = useRef<{ centerAt: (x: number, y: number, ms: number) => void; zoom: (k: number, ms: number) => void } | null>(null);

  // Resolve CSS colors once on mount and on theme change
  const [resolvedColors, setResolvedColors] = useState<Record<string, string>>({});

  useEffect(() => {
    function resolveColors() {
      const colors: Record<string, string> = {};
      for (const [cat, varExpr] of Object.entries(CATEGORY_COLORS)) {
        colors[`cat:${cat}`] = getCssColor(varExpr);
      }
      for (const [rel, { color }] of Object.entries(RELATION_COLORS)) {
        colors[`rel:${rel}`] = getCssColor(color);
      }
      colors['bg'] = getCssColor('var(--color-c-bg)');
      colors['border'] = getCssColor('var(--color-c-border)');
      colors['amber'] = getCssColor('var(--color-c-amber)');
      setResolvedColors(colors);
    }
    resolveColors();
    // Re-resolve on theme change (data-theme attribute)
    const observer = new MutationObserver(resolveColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Search for elements
  useEffect(() => {
    if (searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/admin/graph?search=${encodeURIComponent(searchTerm)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setSearchResults(data.results ?? []))
      .catch(() => {});
    return () => controller.abort();
  }, [searchTerm]);

  // Fetch graph data when element or depth changes
  const fetchGraph = useCallback(async (elementSlug: string) => {
    setLoading(true);
    try {
      // Extract element code from slug: acs_element:PA.I.A.K1 → PA.I.A.K1
      const code = elementSlug.replace(/^acs_element:/, '');
      const res = await fetch(`/api/admin/graph?element=${encodeURIComponent(code)}&depth=${depth}`);
      const data = await res.json();
      if (data.nodes) {
        setGraphData(data);
        setSelectedNode(null);
      }
    } catch (err) {
      console.error('Failed to fetch graph:', err);
    } finally {
      setLoading(false);
    }
  }, [depth]);

  const handleSelectElement = useCallback((slug: string) => {
    setSelectedElement(slug);
    setSearchTerm('');
    setSearchResults([]);
    fetchGraph(slug);
  }, [fetchGraph]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
  }, []);

  const handleNodeDoubleClick = useCallback((node: GraphNode) => {
    // Re-center on this node
    if (node.category === 'acs_element' || node.category === 'acs_task') {
      handleSelectElement(node.slug);
    } else if (fgRef.current && node.x !== undefined && node.y !== undefined) {
      fgRef.current.centerAt(node.x, node.y, 500);
      fgRef.current.zoom(2, 500);
    }
  }, [handleSelectElement]);

  const handleNavigate = useCallback((nodeId: string) => {
    const node = graphData.nodes.find((n) => n.id === nodeId);
    if (node) {
      setSelectedNode(node);
      if (fgRef.current && node.x !== undefined && node.y !== undefined) {
        fgRef.current.centerAt(node.x, node.y, 500);
      }
    }
  }, [graphData.nodes]);

  // Node size based on edge count
  const nodeSize = useCallback((node: GraphNode) => {
    const base = node.category === 'acs_area' ? 8 : node.category === 'acs_task' ? 6 : 4;
    return base + Math.min(node.edgeCount * 0.5, 8);
  }, []);

  // Node color based on category
  const nodeColor = useCallback((node: GraphNode) => {
    const color = resolvedColors[`cat:${node.category}`] || '#888';
    if (node.validationStatus === 'pending') return color + '80'; // 50% opacity
    if (node.validationStatus === 'rejected') return resolvedColors[`cat:regulatory_claim`] + '60';
    return color;
  }, [resolvedColors]);

  // Edge color
  const linkColor = useCallback((link: GraphLink) => {
    const relType = link.relationType as RelationType;
    const color = resolvedColors[`rel:${relType}`] || '#444';
    const opacity = RELATION_COLORS[relType]?.opacity ?? 0.3;
    // Convert hex to rgba
    const hex = color.replace('#', '');
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgba(${r},${g},${b},${opacity})`;
    }
    return color;
  }, [resolvedColors]);

  // Edge width
  const linkWidth = useCallback((link: GraphLink) => {
    if (link.relationType === 'is_component_of') return 2;
    return 1;
  }, []);

  // Category legend
  const activeCats = useMemo(() => {
    const cats = new Set(graphData.nodes.map((n) => n.category));
    return Array.from(cats) as ConceptCategory[];
  }, [graphData.nodes]);

  return (
    <div className="flex h-[calc(100vh-140px)]">
      {/* Main graph area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Controls bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-c-border bg-c-panel">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search ACS element (e.g., PA.I.A.K1)..."
              className="w-full bg-c-bg border border-c-border rounded px-3 py-1.5 text-xs font-mono text-c-text placeholder:text-c-dim focus:border-c-amber focus:outline-none"
            />
            {searchResults.length > 0 && (
              <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-c-panel border border-c-border rounded shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => handleSelectElement(r.slug)}
                      className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-c-elevated transition-colors flex items-center gap-2"
                    >
                      <span className="text-c-dim">[{r.category.replace('acs_', '')}]</span>
                      <span className="text-c-text truncate">{r.name}</span>
                      <span className="text-c-dim ml-auto text-[10px]">{r.slug.replace(/^acs_\w+:/, '')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Depth slider */}
          <div className="flex items-center gap-2">
            <label className="font-mono text-[10px] text-c-dim uppercase">Depth</label>
            <input
              type="range"
              min={1}
              max={3}
              value={depth}
              onChange={(e) => setDepth(parseInt(e.target.value))}
              className="w-16 accent-[var(--color-c-amber)]"
            />
            <span className="font-mono text-xs text-c-muted w-3">{depth}</span>
          </div>

          {/* Stats */}
          {graphData.nodes.length > 0 && (
            <div className="font-mono text-[10px] text-c-dim flex gap-3 ml-auto">
              <span>{graphData.nodes.length} nodes</span>
              <span>{graphData.links.length} edges</span>
            </div>
          )}
        </div>

        {/* Legend */}
        {activeCats.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-1.5 border-b border-c-border bg-c-bg/50">
            {activeCats.map((cat) => (
              <div key={cat} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: resolvedColors[`cat:${cat}`] || '#888' }}
                />
                <span className="font-mono text-[9px] text-c-dim uppercase">{CATEGORY_LABELS[cat]}</span>
              </div>
            ))}
          </div>
        )}

        {/* Graph canvas */}
        <div className="flex-1 relative" style={{ backgroundColor: resolvedColors['bg'] || '#080c12' }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-c-bg/80">
              <span className="font-mono text-sm text-c-amber glow-a flicker">Loading graph...</span>
            </div>
          )}
          {!selectedElement && !loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono text-sm text-c-dim">Search for an ACS element to explore its graph neighborhood</span>
            </div>
          )}
          {selectedElement && graphData.nodes.length > 0 && (
            <ForceGraph2D
              ref={fgRef}
              graphData={graphData}
              nodeId="id"
              nodeLabel={(node: GraphNode) => `${node.name} (${CATEGORY_LABELS[node.category] ?? node.category}) — ${node.edgeCount} edges`}
              nodeVal={nodeSize}
              nodeColor={nodeColor}
              nodeCanvasObjectMode={() => 'after'}
              nodeCanvasObject={(node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
                // Draw label when zoomed in enough
                if (globalScale < 1.5) return;
                const label = node.name.length > 30 ? node.name.substring(0, 28) + '...' : node.name;
                const fontSize = 10 / globalScale;
                ctx.font = `${fontSize}px JetBrains Mono, monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillStyle = resolvedColors[`cat:${node.category}`] || '#888';
                ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + nodeSize(node) / globalScale + 2);

                // Draw amber ring on selected root
                if (selectedElement && node.slug === selectedElement) {
                  ctx.beginPath();
                  ctx.arc(node.x ?? 0, node.y ?? 0, nodeSize(node) / globalScale + 3, 0, 2 * Math.PI);
                  ctx.strokeStyle = resolvedColors['amber'] || '#f5a623';
                  ctx.lineWidth = 2 / globalScale;
                  ctx.stroke();
                }
              }}
              linkColor={linkColor}
              linkWidth={linkWidth}
              linkDirectionalArrowLength={3}
              linkDirectionalArrowRelPos={0.8}
              onNodeClick={handleNodeClick}
              onNodeDblClick={handleNodeDoubleClick}
              onNodeHover={(node: GraphNode | null) => setHoveredNode(node)}
              backgroundColor="rgba(0,0,0,0)"
              cooldownTicks={100}
              warmupTicks={50}
            />
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedNode && (
        <GraphDetailPanel
          node={selectedNode}
          links={graphData.links}
          allNodes={graphData.nodes}
          onNavigate={handleNavigate}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`

Expected: No errors (may need to adjust some react-force-graph types — the library's types are loose, use `any` casts where needed).

**Step 3: Commit**

```bash
git add src/app/(admin)/admin/graph/GraphExplorer.tsx
git commit -m "feat: add 2D graph explorer with search, zoom, and detail panel"
```

---

## Task 8: 3D Graph View component

**Files:**
- Create: `src/app/(admin)/admin/graph/Graph3DView.tsx`

**Context:** Nearly identical to GraphExplorer but uses `ForceGraph3D` instead. Shares all the same types, color utilities, and detail panel. The 3D variant renders in WebGL with Three.js sprites for labels.

**Step 1: Create the component**

```tsx
'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { GraphData, GraphNode, GraphLink } from './graph-types';
import { CATEGORY_COLORS, RELATION_COLORS, CATEGORY_LABELS } from './graph-types';
import type { ConceptCategory, RelationType } from '@/types/database';
import GraphDetailPanel from './GraphDetailPanel';

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false });

function getCssColor(varExpr: string): string {
  if (typeof window === 'undefined') return '#888';
  const match = varExpr.match(/var\((.+)\)/);
  if (!match) return varExpr;
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || '#888';
}

export default function Graph3DView() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; slug: string; category: string }[]>([]);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [depth, setDepth] = useState(2);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(false);
  const fgRef = useRef(null);

  const [resolvedColors, setResolvedColors] = useState<Record<string, string>>({});

  useEffect(() => {
    function resolveColors() {
      const colors: Record<string, string> = {};
      for (const [cat, varExpr] of Object.entries(CATEGORY_COLORS)) {
        colors[`cat:${cat}`] = getCssColor(varExpr);
      }
      for (const [rel, { color }] of Object.entries(RELATION_COLORS)) {
        colors[`rel:${rel}`] = getCssColor(color);
      }
      colors['bg'] = getCssColor('var(--color-c-bg)');
      setResolvedColors(colors);
    }
    resolveColors();
    const observer = new MutationObserver(resolveColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (searchTerm.length < 2) { setSearchResults([]); return; }
    const controller = new AbortController();
    fetch(`/api/admin/graph?search=${encodeURIComponent(searchTerm)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setSearchResults(data.results ?? []))
      .catch(() => {});
    return () => controller.abort();
  }, [searchTerm]);

  const fetchGraph = useCallback(async (elementSlug: string) => {
    setLoading(true);
    try {
      const code = elementSlug.replace(/^acs_element:/, '');
      const res = await fetch(`/api/admin/graph?element=${encodeURIComponent(code)}&depth=${depth}`);
      const data = await res.json();
      if (data.nodes) {
        setGraphData(data);
        setSelectedNode(null);
      }
    } catch (err) {
      console.error('Failed to fetch graph:', err);
    } finally {
      setLoading(false);
    }
  }, [depth]);

  const handleSelectElement = useCallback((slug: string) => {
    setSelectedElement(slug);
    setSearchTerm('');
    setSearchResults([]);
    fetchGraph(slug);
  }, [fetchGraph]);

  const nodeColor = useCallback((node: GraphNode) => {
    const color = resolvedColors[`cat:${node.category}`] || '#888';
    if (node.validationStatus === 'pending') return color + '80';
    return color;
  }, [resolvedColors]);

  const linkColor = useCallback((link: GraphLink) => {
    const relType = link.relationType as RelationType;
    const color = resolvedColors[`rel:${relType}`] || '#444';
    const opacity = RELATION_COLORS[relType]?.opacity ?? 0.3;
    const hex = color.replace('#', '');
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgba(${r},${g},${b},${opacity})`;
    }
    return color;
  }, [resolvedColors]);

  const activeCats = useMemo(() => {
    const cats = new Set(graphData.nodes.map((n) => n.category));
    return Array.from(cats) as ConceptCategory[];
  }, [graphData.nodes]);

  return (
    <div className="flex h-[calc(100vh-140px)]">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Controls — same as 2D */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-c-border bg-c-panel">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search ACS element..."
              className="w-full bg-c-bg border border-c-border rounded px-3 py-1.5 text-xs font-mono text-c-text placeholder:text-c-dim focus:border-c-amber focus:outline-none"
            />
            {searchResults.length > 0 && (
              <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-c-panel border border-c-border rounded shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => handleSelectElement(r.slug)}
                      className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-c-elevated transition-colors flex items-center gap-2"
                    >
                      <span className="text-c-dim">[{r.category.replace('acs_', '')}]</span>
                      <span className="text-c-text truncate">{r.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="font-mono text-[10px] text-c-dim uppercase">Depth</label>
            <input type="range" min={1} max={3} value={depth} onChange={(e) => setDepth(parseInt(e.target.value))} className="w-16 accent-[var(--color-c-amber)]" />
            <span className="font-mono text-xs text-c-muted w-3">{depth}</span>
          </div>
          {graphData.nodes.length > 0 && (
            <div className="font-mono text-[10px] text-c-dim flex gap-3 ml-auto">
              <span>{graphData.nodes.length} nodes</span>
              <span>{graphData.links.length} edges</span>
            </div>
          )}
        </div>

        {/* Legend */}
        {activeCats.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-1.5 border-b border-c-border bg-c-bg/50">
            {activeCats.map((cat) => (
              <div key={cat} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: resolvedColors[`cat:${cat}`] || '#888' }} />
                <span className="font-mono text-[9px] text-c-dim uppercase">{CATEGORY_LABELS[cat]}</span>
              </div>
            ))}
          </div>
        )}

        {/* 3D graph */}
        <div className="flex-1 relative" style={{ backgroundColor: resolvedColors['bg'] || '#080c12' }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-c-bg/80">
              <span className="font-mono text-sm text-c-amber glow-a flicker">Loading graph...</span>
            </div>
          )}
          {!selectedElement && !loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono text-sm text-c-dim">Search for an ACS element to explore in 3D</span>
            </div>
          )}
          {selectedElement && graphData.nodes.length > 0 && (
            <ForceGraph3D
              ref={fgRef}
              graphData={graphData}
              nodeId="id"
              nodeLabel={(node: GraphNode) => `${node.name} (${CATEGORY_LABELS[node.category] ?? node.category})`}
              nodeVal={(node: GraphNode) => {
                const base = node.category === 'acs_area' ? 4 : node.category === 'acs_task' ? 3 : 2;
                return base + Math.min(node.edgeCount * 0.3, 4);
              }}
              nodeColor={nodeColor}
              linkColor={linkColor}
              linkWidth={(link: GraphLink) => link.relationType === 'is_component_of' ? 1.5 : 0.5}
              linkDirectionalArrowLength={2}
              linkDirectionalArrowRelPos={0.8}
              onNodeClick={(node: GraphNode) => setSelectedNode(node)}
              backgroundColor={resolvedColors['bg'] || '#080c12'}
              showNavInfo={false}
            />
          )}
        </div>
      </div>

      {selectedNode && (
        <GraphDetailPanel
          node={selectedNode}
          links={graphData.links}
          allNodes={graphData.nodes}
          onNavigate={(nodeId) => {
            const node = graphData.nodes.find((n) => n.id === nodeId);
            if (node) setSelectedNode(node);
          }}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/(admin)/admin/graph/Graph3DView.tsx
git commit -m "feat: add 3D WebGL graph view"
```

---

## Task 9: Health dashboard component

**Files:**
- Create: `src/app/(admin)/admin/graph/GraphHealth.tsx`

**Context:** Pure data display — metric cards + tables. No graph library needed. Follows the same styling patterns as `/admin` dashboard (bezel cards, font-mono labels, glow-a numbers). Fetches from `/api/admin/graph/health`.

**Step 1: Create the component**

```tsx
'use client';

import { useState, useEffect } from 'react';
import type { GraphHealthData } from './graph-types';

export default function GraphHealth({ onNavigateToExplorer }: { onNavigateToExplorer: (slug: string) => void }) {
  const [data, setData] = useState<GraphHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [orphanFilter, setOrphanFilter] = useState('');
  const [unvalidatedFilter, setUnvalidatedFilter] = useState('');

  useEffect(() => {
    fetch('/api/admin/graph/health')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="font-mono text-sm text-c-amber glow-a flicker">Loading health data...</span>
      </div>
    );
  }

  if (!data) {
    return <div className="font-mono text-sm text-c-red">Failed to load health data</div>;
  }

  const filteredOrphans = data.orphans.filter(
    (o) => !orphanFilter || o.category === orphanFilter
  );

  const filteredUnvalidated = data.unvalidated.filter(
    (u) => !unvalidatedFilter || u.category === unvalidatedFilter
  );

  return (
    <div className="space-y-6 p-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Concepts', value: data.totals.concepts },
          { label: 'Edges', value: data.totals.edges },
          { label: 'Evidence', value: data.totals.evidence },
          { label: 'Orphans', value: data.totals.orphans, warn: data.totals.orphans > 0 },
        ].map((card) => (
          <div key={card.label} className="bezel p-4">
            <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider">{card.label}</p>
            <p className={`font-mono text-2xl font-bold mt-1 ${card.warn ? 'text-c-amber glow-a' : 'text-c-text'}`}>
              {card.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Category Breakdown */}
      <div className="bezel p-4">
        <h3 className="font-mono text-[10px] text-c-dim uppercase tracking-wider mb-3">// Category Breakdown</h3>
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-c-dim text-[10px] uppercase tracking-wider border-b border-c-border">
              <th className="text-left py-2 pr-4">Category</th>
              <th className="text-right py-2 pr-4">Count</th>
              <th className="text-right py-2 pr-4">Embedded</th>
              <th className="text-right py-2 pr-4">Validated</th>
              <th className="text-right py-2">Avg Edges</th>
            </tr>
          </thead>
          <tbody>
            {data.byCategory.map((row) => (
              <tr key={row.category} className="border-b border-c-border/50 hover:bg-c-elevated/30 transition-colors">
                <td className="py-2 pr-4 text-c-text">{row.category}</td>
                <td className="py-2 pr-4 text-right text-c-muted">{row.count.toLocaleString()}</td>
                <td className="py-2 pr-4 text-right">
                  <span className={row.pctEmbedded === 100 ? 'text-c-green' : 'text-c-amber'}>{row.pctEmbedded}%</span>
                </td>
                <td className="py-2 pr-4 text-right">
                  <span className={row.pctValidated > 80 ? 'text-c-green' : row.pctValidated > 0 ? 'text-c-amber' : 'text-c-dim'}>{row.pctValidated}%</span>
                </td>
                <td className="py-2 text-right text-c-muted">{row.avgEdges.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edge Distribution */}
      <div className="bezel p-4">
        <h3 className="font-mono text-[10px] text-c-dim uppercase tracking-wider mb-3">// Edge Distribution</h3>
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-c-dim text-[10px] uppercase tracking-wider border-b border-c-border">
              <th className="text-left py-2 pr-4">Relation Type</th>
              <th className="text-right py-2 pr-4">Count</th>
              <th className="text-right py-2 pr-4">Avg Confidence</th>
              <th className="text-right py-2">Avg Weight</th>
            </tr>
          </thead>
          <tbody>
            {data.byRelation.map((row) => (
              <tr key={row.type} className="border-b border-c-border/50 hover:bg-c-elevated/30 transition-colors">
                <td className="py-2 pr-4 text-c-text">{row.type}</td>
                <td className="py-2 pr-4 text-right text-c-muted">{row.count.toLocaleString()}</td>
                <td className="py-2 pr-4 text-right text-c-muted">{row.avgConfidence.toFixed(2)}</td>
                <td className="py-2 text-right text-c-muted">{row.avgWeight.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Coverage Per Rating */}
      <div className="bezel p-4">
        <h3 className="font-mono text-[10px] text-c-dim uppercase tracking-wider mb-3">// ACS Element Coverage</h3>
        <div className="space-y-3">
          {data.coverage.map((cov) => (
            <div key={cov.rating} className="flex items-center gap-3">
              <span className="font-mono text-xs text-c-text w-24 uppercase">{cov.rating}</span>
              <div className="flex-1 bg-c-bg rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full ${cov.pct > 60 ? 'prog-g' : cov.pct > 30 ? 'prog-a' : 'prog-r'}`}
                  style={{ width: `${cov.pct}%` }}
                />
              </div>
              <span className="font-mono text-xs text-c-muted w-28 text-right">
                {cov.connectedElements}/{cov.totalElements} ({cov.pct}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Orphan Nodes */}
      <div className="bezel p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-mono text-[10px] text-c-dim uppercase tracking-wider">
            // Orphan Nodes ({data.orphans.length})
          </h3>
          <select
            value={orphanFilter}
            onChange={(e) => setOrphanFilter(e.target.value)}
            className="bg-c-bg border border-c-border rounded px-2 py-1 text-[10px] font-mono text-c-muted"
          >
            <option value="">All categories</option>
            {[...new Set(data.orphans.map((o) => o.category))].map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {filteredOrphans.slice(0, 50).map((orphan) => (
            <div
              key={orphan.id}
              className="flex items-center gap-2 px-2 py-1 hover:bg-c-elevated/30 rounded transition-colors cursor-pointer"
              onClick={() => onNavigateToExplorer(orphan.slug)}
            >
              <span className="text-[9px] font-mono text-c-dim uppercase w-20">{orphan.category}</span>
              <span className="text-xs font-mono text-c-muted truncate">{orphan.name}</span>
            </div>
          ))}
          {filteredOrphans.length > 50 && (
            <p className="text-[10px] font-mono text-c-dim px-2 py-1">... and {filteredOrphans.length - 50} more</p>
          )}
        </div>
      </div>

      {/* Unvalidated Concepts */}
      <div className="bezel p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-mono text-[10px] text-c-dim uppercase tracking-wider">
            // Unvalidated ({data.unvalidated.length})
          </h3>
          <select
            value={unvalidatedFilter}
            onChange={(e) => setUnvalidatedFilter(e.target.value)}
            className="bg-c-bg border border-c-border rounded px-2 py-1 text-[10px] font-mono text-c-muted"
          >
            <option value="">All categories</option>
            {[...new Set(data.unvalidated.map((u) => u.category))].map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {filteredUnvalidated.slice(0, 50).map((item) => (
            <div key={item.id} className="flex items-center gap-2 px-2 py-1 hover:bg-c-elevated/30 rounded transition-colors">
              <span className="text-[9px] font-mono text-c-dim uppercase w-20">{item.category}</span>
              <span className="text-xs font-mono text-c-muted truncate flex-1">{item.name}</span>
              <span className="text-[9px] font-mono text-c-dim">
                {item.confidence != null ? `${(item.confidence * 100).toFixed(0)}%` : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/(admin)/admin/graph/GraphHealth.tsx
git commit -m "feat: add graph health audit dashboard"
```

---

## Task 10: Coverage treemap component

**Files:**
- Create: `src/app/(admin)/admin/graph/GraphCoverage.tsx`

**Context:** Reuses the `@nivo/treemap` pattern from `src/app/(dashboard)/progress/components/AcsCoverageTreemap.tsx`. Colors by edge richness (green/amber/red) instead of score. Fetches from `/api/admin/graph/coverage`.

**Step 1: Create the component**

```tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { ResponsiveTreeMap } from '@nivo/treemap';
import type { ComputedNode } from '@nivo/treemap';

interface CoverageElement {
  code: string;
  name: string;
  edgeCount: number;
}

interface TreeNode {
  name: string;
  children?: TreeNode[];
  value?: number;
  color?: string;
  elementCode?: string;
  edgeCount?: number;
}

function getEdgeColor(edgeCount: number): string {
  if (edgeCount >= 5) return 'rgba(0, 255, 65, 0.75)';     // c-green — well connected
  if (edgeCount >= 1) return 'rgba(245, 166, 35, 0.75)';    // c-amber — sparse
  return 'rgba(255, 59, 48, 0.4)';                           // c-red — orphan
}

export default function GraphCoverage({ onNavigateToExplorer }: { onNavigateToExplorer: (slug: string) => void }) {
  const [rating, setRating] = useState('private');
  const [data, setData] = useState<{ areas: { name: string; slug: string; tasks: { name: string; slug: string; elements: CoverageElement[] }[] }[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/graph/coverage?rating=${rating}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [rating]);

  const treeData = useMemo(() => {
    if (!data) return { name: 'root', children: [] };

    return {
      name: rating.toUpperCase(),
      children: data.areas.map((area) => ({
        name: area.name,
        children: area.tasks.map((task) => ({
          name: task.name,
          children: task.elements.map((el) => ({
            name: el.code.split('.').pop() || el.code,
            value: 1,
            color: getEdgeColor(el.edgeCount),
            elementCode: el.code,
            edgeCount: el.edgeCount,
          })),
        })),
      })),
    } as TreeNode;
  }, [data, rating]);

  // Stats
  const stats = useMemo(() => {
    if (!data) return { total: 0, connected: 0, rich: 0 };
    let total = 0, connected = 0, rich = 0;
    for (const area of data.areas) {
      for (const task of area.tasks) {
        for (const el of task.elements) {
          total++;
          if (el.edgeCount > 0) connected++;
          if (el.edgeCount >= 5) rich++;
        }
      }
    }
    return { total, connected, rich };
  }, [data]);

  return (
    <div className="space-y-4 p-4">
      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="font-mono text-[10px] text-c-dim uppercase">Rating</label>
          <select
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="bg-c-bg border border-c-border rounded px-2 py-1 text-xs font-mono text-c-text"
          >
            <option value="private">Private Pilot</option>
            <option value="commercial">Commercial Pilot</option>
            <option value="instrument">Instrument Rating</option>
          </select>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 ml-auto">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(0, 255, 65, 0.75)' }} />
            <span className="font-mono text-[9px] text-c-dim">5+ edges</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(245, 166, 35, 0.75)' }} />
            <span className="font-mono text-[9px] text-c-dim">1-4 edges</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(255, 59, 48, 0.4)' }} />
            <span className="font-mono text-[9px] text-c-dim">0 edges</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 font-mono text-xs">
        <span className="text-c-muted">{stats.total} elements</span>
        <span className="text-c-amber">{stats.connected} connected ({stats.total > 0 ? Math.round(stats.connected / stats.total * 100) : 0}%)</span>
        <span className="text-c-green">{stats.rich} rich ({stats.total > 0 ? Math.round(stats.rich / stats.total * 100) : 0}%)</span>
      </div>

      {/* Treemap */}
      <div className="h-[calc(100vh-280px)] bezel p-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="font-mono text-sm text-c-amber glow-a flicker">Loading coverage...</span>
          </div>
        ) : (
          <ResponsiveTreeMap<TreeNode>
            data={treeData}
            identity="name"
            value="value"
            leavesOnly
            innerPadding={2}
            outerPadding={4}
            colors={(node: ComputedNode<TreeNode>) => node.data.color || '#1c2333'}
            borderWidth={1}
            borderColor="rgba(255,255,255,0.05)"
            labelSkipSize={20}
            label={(node: ComputedNode<TreeNode>) => `${node.id}`}
            labelTextColor="rgba(255,255,255,0.8)"
            parentLabelPosition="left"
            parentLabelTextColor="rgba(255,255,255,0.3)"
            tooltip={({ node }: { node: ComputedNode<TreeNode> }) => (
              <div className="bg-c-panel border border-c-border rounded px-3 py-2 shadow-lg">
                <p className="font-mono text-xs text-c-text font-bold">{node.data.elementCode || node.id}</p>
                <p className="font-mono text-[10px] text-c-muted mt-0.5">
                  {node.data.edgeCount ?? 0} connections (excl. hierarchy)
                </p>
              </div>
            )}
            onClick={(node: ComputedNode<TreeNode>) => {
              if (node.data.elementCode) {
                onNavigateToExplorer(`acs_element:${node.data.elementCode}`);
              }
            }}
            theme={{
              labels: {
                text: { fontFamily: 'JetBrains Mono, monospace', fontSize: 9 },
              },
              tooltip: {
                container: { background: 'transparent', padding: 0, boxShadow: 'none' },
              },
            }}
          />
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/(admin)/admin/graph/GraphCoverage.tsx
git commit -m "feat: add graph coverage treemap visualization"
```

---

## Task 11: Main graph page with tabs

**Files:**
- Create: `src/app/(admin)/admin/graph/page.tsx`

**Context:** This is the parent page that renders the 4 tabs (Explorer, 3D, Health, Coverage). Uses `useState` for tab switching. Each tab component is dynamically imported to avoid loading all at once (especially the heavy 3D component).

**Step 1: Create the page**

```tsx
'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

// Lazy-load tab components
const GraphExplorer = dynamic(() => import('./GraphExplorer'), { ssr: false });
const Graph3DView = dynamic(() => import('./Graph3DView'), { ssr: false });
const GraphHealth = dynamic(() => import('./GraphHealth'), { ssr: false });
const GraphCoverage = dynamic(() => import('./GraphCoverage'), { ssr: false });

type Tab = 'explorer' | '3d' | 'health' | 'coverage';

const TABS: { id: Tab; label: string }[] = [
  { id: 'explorer', label: 'Explorer (2D)' },
  { id: '3d', label: '3D View' },
  { id: 'health', label: 'Health' },
  { id: 'coverage', label: 'Coverage' },
];

export default function GraphPage() {
  const [activeTab, setActiveTab] = useState<Tab>('explorer');

  const handleNavigateToExplorer = useCallback((slug: string) => {
    setActiveTab('explorer');
    // The GraphExplorer will pick this up — pass via URL param or state
    // For now, switch tab and let user search
  }, []);

  return (
    <div className="-mx-6 -mt-8 flex flex-col h-[calc(100vh-44px)]">
      {/* Page header with tabs */}
      <div className="flex items-center border-b border-c-border bg-c-panel px-6">
        <h1 className="font-mono text-xs font-bold text-c-amber uppercase tracking-widest mr-6 py-3">
          Knowledge Graph
        </h1>
        <nav className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 font-mono text-[11px] uppercase tracking-wider transition-colors border-b-2 -mb-[1px] ${
                activeTab === tab.id
                  ? 'text-c-amber border-c-amber'
                  : 'text-c-muted hover:text-c-text border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'explorer' && <GraphExplorer />}
        {activeTab === '3d' && <Graph3DView />}
        {activeTab === 'health' && <GraphHealth onNavigateToExplorer={handleNavigateToExplorer} />}
        {activeTab === 'coverage' && <GraphCoverage onNavigateToExplorer={handleNavigateToExplorer} />}
      </div>
    </div>
  );
}
```

**Step 2: Verify the entire build**

Run: `npx tsc --noEmit`

Expected: No type errors.

Run: `npm run build`

Expected: Build succeeds. The dynamic imports with `ssr: false` prevent any server-side rendering issues with canvas/WebGL.

**Step 3: Commit**

```bash
git add src/app/(admin)/admin/graph/page.tsx
git commit -m "feat: add graph page with Explorer, 3D, Health, and Coverage tabs"
```

---

## Task 12: Manual smoke test and type fixes

**Step 1: Start the dev server**

Run: `npm run dev`

**Step 2: Navigate to the admin graph page**

Open `http://localhost:3000/admin/graph` in the browser.

**Step 3: Verify each tab**

1. **Explorer tab**: Search for `PA.I.A.K1`. Graph should render with colored nodes. Click a node — detail panel slides in. Double-click a different ACS element — graph re-centers.
2. **3D tab**: Same search. 3D graph renders with rotation.
3. **Health tab**: Summary cards show numbers. Tables populated. Orphan list renders.
4. **Coverage tab**: Select rating. Treemap renders with green/amber/red cells.

**Step 4: Fix any type errors or runtime issues**

Common issues to expect and fix:
- react-force-graph type mismatches (use type assertions where needed)
- CSS variable resolution timing (ensure colors resolve before first render)
- Supabase `.or()` filter syntax (parentheses in filter strings)
- Dynamic import SSR warnings (ensure all three.js / canvas code is behind `ssr: false`)

**Step 5: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve type and runtime issues from smoke test"
```

---

## Task 13: Final verification and cleanup

**Step 1: Run all existing tests**

Run: `npm test`

Expected: All 235+ existing tests pass (this feature adds no test regressions — it's admin-only UI with no changes to core logic).

**Step 2: Type check**

Run: `npx tsc --noEmit`

Expected: No errors.

**Step 3: Build**

Run: `npm run build`

Expected: Build succeeds.

**Step 4: Final commit**

If any cleanup was needed:
```bash
git add -A
git commit -m "chore: cleanup graph visualization implementation"
```

---

## Files Created

| File | Purpose |
|------|---------|
| `src/app/(admin)/admin/graph/page.tsx` | Graph page with tab router |
| `src/app/(admin)/admin/graph/GraphExplorer.tsx` | 2D force graph explorer |
| `src/app/(admin)/admin/graph/Graph3DView.tsx` | 3D WebGL graph view |
| `src/app/(admin)/admin/graph/GraphHealth.tsx` | Health audit dashboard |
| `src/app/(admin)/admin/graph/GraphCoverage.tsx` | Coverage treemap |
| `src/app/(admin)/admin/graph/GraphDetailPanel.tsx` | Node detail sidebar |
| `src/app/(admin)/admin/graph/graph-types.ts` | Shared types + color maps |
| `src/app/api/admin/graph/route.ts` | Graph bundle + search API |
| `src/app/api/admin/graph/health/route.ts` | Health stats API |
| `src/app/api/admin/graph/coverage/route.ts` | Coverage data API |
| `supabase/migrations/20260224100001_orphan_concepts_rpc.sql` | Orphan concepts RPC |

## Files Modified

| File | Change |
|------|--------|
| `src/app/(admin)/AdminShell.tsx` | Add Graph nav item to SYSTEM section |
| `package.json` | Add `react-force-graph` dependency |
