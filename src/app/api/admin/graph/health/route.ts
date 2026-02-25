import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';
import type {
  GraphHealthData,
  CategoryStats,
  RelationStats,
  OrphanNode,
  UnvalidatedNode,
  RatingCoverage,
} from '@/app/(admin)/admin/graph/graph-types';
import type { ConceptCategory, RelationType } from '@/types/database';

/** All concept categories for per-category queries */
const ALL_CATEGORIES: ConceptCategory[] = [
  'acs_area',
  'acs_task',
  'acs_element',
  'topic',
  'definition',
  'procedure',
  'regulatory_claim',
  'artifact',
];

/** All relation types for per-type queries */
const ALL_RELATION_TYPES: RelationType[] = [
  'is_component_of',
  'requires_knowledge_of',
  'leads_to_discussion_of',
  'contrasts_with',
  'mitigates_risk_of',
  'applies_in_scenario',
];

/**
 * GET /api/admin/graph/health
 *
 * Returns aggregate graph health statistics:
 * - Total concepts, edges, evidence, orphans
 * - Per-category breakdown (count, % embedded, % validated, avg edges)
 * - Per-relation-type breakdown (count, avg confidence, avg weight)
 * - Orphan concepts (no edges)
 * - Unvalidated concepts sorted by lowest confidence
 * - Coverage per rating (PA/CA/IR)
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    // ── Parallel queries ──────────────────────────────────────────
    // Group 1: Totals (exact counts via head:true)
    // Group 2: Per-category counts (count + embedded + validated)
    // Group 3: Per-relation-type stats
    // Group 4: Orphans, unvalidated, coverage data

    const [
      // Totals
      totalConceptsResult,
      totalEdgesResult,
      totalEvidenceResult,
      // Per-category counts
      ...categoryAndRelationResults
    ] = await Promise.all([
      // Total concepts
      serviceSupabase
        .from('concepts')
        .select('id', { count: 'exact', head: true }),

      // Total edges
      serviceSupabase
        .from('concept_relations')
        .select('id', { count: 'exact', head: true }),

      // Total evidence
      serviceSupabase
        .from('concept_chunk_evidence')
        .select('id', { count: 'exact', head: true }),

      // Per-category: total count
      ...ALL_CATEGORIES.map((cat) =>
        serviceSupabase
          .from('concepts')
          .select('id', { count: 'exact', head: true })
          .eq('category', cat)
      ),

      // Per-category: embedded count (embedding_status = 'current')
      ...ALL_CATEGORIES.map((cat) =>
        serviceSupabase
          .from('concepts')
          .select('id', { count: 'exact', head: true })
          .eq('category', cat)
          .eq('embedding_status', 'current')
      ),

      // Per-category: validated count (validation_status = 'validated')
      ...ALL_CATEGORIES.map((cat) =>
        serviceSupabase
          .from('concepts')
          .select('id', { count: 'exact', head: true })
          .eq('category', cat)
          .eq('validation_status', 'validated')
      ),

      // Per-relation-type: count
      ...ALL_RELATION_TYPES.map((rt) =>
        serviceSupabase
          .from('concept_relations')
          .select('id', { count: 'exact', head: true })
          .eq('relation_type', rt)
      ),

      // Per-relation-type: avg confidence & weight (sample up to 1000 rows)
      ...ALL_RELATION_TYPES.map((rt) =>
        serviceSupabase
          .from('concept_relations')
          .select('confidence, weight')
          .eq('relation_type', rt)
          .limit(1000)
      ),
    ]);

    // ── Parse per-category stats ──────────────────────────────────
    const catCount = ALL_CATEGORIES.length; // 8
    const rtCount = ALL_RELATION_TYPES.length; // 6

    // categoryAndRelationResults layout:
    //   [0..7]   = per-category total count          (8 items)
    //   [8..15]  = per-category embedded count        (8 items)
    //   [16..23] = per-category validated count        (8 items)
    //   [24..29] = per-relation-type count             (6 items)
    //   [30..35] = per-relation-type confidence/weight (6 items)

    const totalEdges = totalEdgesResult.count ?? 0;
    const totalConcepts = totalConceptsResult.count ?? 0;

    const byCategory: CategoryStats[] = ALL_CATEGORIES.map((cat, i) => {
      const count = categoryAndRelationResults[i].count ?? 0;
      const embeddedCount = categoryAndRelationResults[catCount + i].count ?? 0;
      const validatedCount = categoryAndRelationResults[catCount * 2 + i].count ?? 0;

      return {
        category: cat,
        count,
        pctEmbedded: count > 0 ? Math.round((embeddedCount / count) * 100) : 0,
        pctValidated: count > 0 ? Math.round((validatedCount / count) * 100) : 0,
        // avgEdges: approximate from total edges / total concepts per category
        // (exact per-category edge count would require additional queries)
        avgEdges:
          count > 0 && totalConcepts > 0
            ? Math.round(((totalEdges * 2) / totalConcepts) * (count / totalConcepts) * 100) / 100
            : 0,
      };
    }).filter((c) => c.count > 0);

    // ── Parse per-relation stats ──────────────────────────────────
    const byRelation: RelationStats[] = ALL_RELATION_TYPES.map((rt, i) => {
      const count = categoryAndRelationResults[catCount * 3 + i].count ?? 0;
      const sampleData = categoryAndRelationResults[catCount * 3 + rtCount + i].data as
        | Array<{ confidence: number; weight: number }>
        | null;

      let avgConfidence = 0;
      let avgWeight = 0;

      if (sampleData && sampleData.length > 0) {
        const totalConf = sampleData.reduce((sum, r) => sum + (r.confidence ?? 0), 0);
        const totalW = sampleData.reduce((sum, r) => sum + (r.weight ?? 0), 0);
        avgConfidence = Math.round((totalConf / sampleData.length) * 100) / 100;
        avgWeight = Math.round((totalW / sampleData.length) * 100) / 100;
      }

      return { type: rt, count, avgConfidence, avgWeight };
    }).filter((r) => r.count > 0);

    // ── Orphans, unvalidated, coverage (parallel) ─────────────────
    const [orphanResult, unvalidatedResult, acsElementsResult, acsEdgesResult] =
      await Promise.all([
        // Orphan concepts via RPC (may fail if migration not applied)
        // Wrap in Promise.resolve() because Supabase returns PromiseLike (no .catch)
        Promise.resolve(
          serviceSupabase.rpc('get_orphan_concepts_admin').limit(100)
        ).catch(() => ({ data: null, error: { message: 'RPC not available' } })),

        // Unvalidated concepts sorted by lowest confidence
        serviceSupabase
          .from('concepts')
          .select('id, name, slug, category, extraction_confidence')
          .eq('validation_status', 'pending')
          .order('extraction_confidence', { ascending: true, nullsFirst: true })
          .limit(100),

        // All acs_element concepts (for coverage calculation)
        serviceSupabase
          .from('concepts')
          .select('id, slug')
          .eq('category', 'acs_element')
          .limit(5000),

        // Edges involving acs_element concepts (non is_component_of)
        // We fetch edges to determine which elements are "connected"
        serviceSupabase
          .from('concept_relations')
          .select('source_id, target_id')
          .neq('relation_type', 'is_component_of')
          .limit(50000),
      ]);

    // ── Build orphans array ───────────────────────────────────────
    let orphans: OrphanNode[] = [];
    if (orphanResult.data && !orphanResult.error) {
      orphans = (orphanResult.data as Array<{ id: string; name: string; slug: string; category: string }>).map(
        (r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          category: r.category,
        })
      );
    }

    // ── Build unvalidated array ───────────────────────────────────
    const unvalidated: UnvalidatedNode[] = (unvalidatedResult.data ?? []).map(
      (r) => ({
        id: r.id as string,
        name: r.name as string,
        slug: r.slug as string,
        category: r.category as string,
        confidence: (r.extraction_confidence as number) ?? null,
      })
    );

    // ── Build coverage per rating ─────────────────────────────────
    // Determine rating from slug prefix: acs_element:PA.* -> private, CA.* -> commercial, IR.* -> instrument
    const ratingMap: Record<string, { label: string; total: Set<string>; connected: Set<string> }> = {
      PA: { label: 'private', total: new Set(), connected: new Set() },
      CA: { label: 'commercial', total: new Set(), connected: new Set() },
      IR: { label: 'instrument', total: new Set(), connected: new Set() },
    };

    const acsElements = (acsElementsResult.data ?? []) as Array<{ id: string; slug: string }>;
    const elementIdToPrefix = new Map<string, string>();

    for (const el of acsElements) {
      // slug format: "acs_element:PA.I.A.K1" — extract prefix after ":"
      const colonIdx = el.slug.indexOf(':');
      const afterColon = colonIdx >= 0 ? el.slug.slice(colonIdx + 1) : el.slug;
      const prefix = afterColon.split('.')[0]; // PA, CA, or IR

      if (ratingMap[prefix]) {
        ratingMap[prefix].total.add(el.id);
        elementIdToPrefix.set(el.id, prefix);
      }
    }

    // Check which element concepts have non-is_component_of edges
    const allEdges = (acsEdgesResult.data ?? []) as Array<{ source_id: string; target_id: string }>;
    for (const edge of allEdges) {
      const srcPrefix = elementIdToPrefix.get(edge.source_id);
      const tgtPrefix = elementIdToPrefix.get(edge.target_id);
      if (srcPrefix && ratingMap[srcPrefix]) {
        ratingMap[srcPrefix].connected.add(edge.source_id);
      }
      if (tgtPrefix && ratingMap[tgtPrefix]) {
        ratingMap[tgtPrefix].connected.add(edge.target_id);
      }
    }

    const coverage: RatingCoverage[] = Object.values(ratingMap)
      .filter((r) => r.total.size > 0)
      .map((r) => ({
        rating: r.label,
        totalElements: r.total.size,
        connectedElements: r.connected.size,
        pct:
          r.total.size > 0
            ? Math.round((r.connected.size / r.total.size) * 100)
            : 0,
      }));

    // ── Assemble response ─────────────────────────────────────────
    const healthData: GraphHealthData = {
      totals: {
        concepts: totalConcepts,
        edges: totalEdges,
        evidence: totalEvidenceResult.count ?? 0,
        orphans: orphans.length,
      },
      byCategory,
      byRelation,
      orphans,
      unvalidated,
      coverage,
    };

    return NextResponse.json(healthData);
  } catch (error) {
    return handleAdminError(error);
  }
}
