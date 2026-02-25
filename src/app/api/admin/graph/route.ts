import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';
import type { GraphNode, GraphLink, EvidenceItem } from '@/app/(admin)/admin/graph/graph-types';
import type { ConceptCategory, RelationType, ValidationStatus } from '@/types/database';

/** Shape returned by the get_concept_bundle RPC */
interface BundleRow {
  concept_id: string;
  concept_name: string;
  concept_category: string;
  concept_content: string | null;
  key_facts: unknown[] | null;
  common_misconceptions: unknown[] | null;
  depth: number;
  relation_type: string | null;
  examiner_transition: string | null;
  evidence_chunks: unknown[] | null;
}

/**
 * GET /api/admin/graph
 *
 * Two modes:
 *
 * 1. Element search (?search=<term>)
 *    Returns up to 20 ACS concepts matching slug or name.
 *
 * 2. Graph bundle (?element=PA.I.A.K1&depth=2)
 *    Returns { nodes: GraphNode[], links: GraphLink[] } for force-graph rendering.
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const url = new URL(request.url);
    const search = url.searchParams.get('search');
    const element = url.searchParams.get('element');

    // ── Mode 1: Element search ──────────────────────────────────
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

    // ── Mode 2: Graph bundle ────────────────────────────────────
    if (element) {
      const depthParam = parseInt(url.searchParams.get('depth') ?? '2', 10);
      const depth = Math.min(Math.max(depthParam, 1), 3); // clamp 1..3

      // 1. Call get_concept_bundle RPC
      const { data: rpcData, error: rpcError } = await serviceSupabase
        .rpc('get_concept_bundle', {
          p_element_code: element,
          p_max_depth: depth,
        })
        .limit(200);

      const rpcRows = rpcData as BundleRow[] | null;

      if (rpcError) {
        console.error('get_concept_bundle RPC error:', rpcError);
        return NextResponse.json(
          { error: 'Failed to fetch concept bundle' },
          { status: 500 }
        );
      }

      if (!rpcRows || rpcRows.length === 0) {
        return NextResponse.json({ nodes: [], links: [] });
      }

      // 2. Deduplicate nodes by concept_id (RPC can return same concept at different depths)
      const seenIds = new Set<string>();
      const dedupedRows: typeof rpcRows = [];
      for (const row of rpcRows) {
        if (!seenIds.has(row.concept_id)) {
          seenIds.add(row.concept_id);
          dedupedRows.push(row);
        }
      }

      // 3. Build evidence items from evidence_chunks
      function parseEvidence(chunks: unknown): EvidenceItem[] {
        if (!chunks || !Array.isArray(chunks)) return [];
        return chunks
          .filter((c: Record<string, unknown>) => c && c.chunk_id)
          .map((c: Record<string, unknown>) => ({
            chunkId: c.chunk_id as string,
            docTitle: (c.doc_title as string) ?? '',
            pageRef: (c.page_ref as string) ?? null,
            confidence: (c.confidence as number) ?? 0,
          }));
      }

      // 4. Collect all concept IDs for bulk queries
      const conceptIds = Array.from(seenIds);

      // 5. Fetch slugs and validation_status from concepts table
      const { data: conceptMeta } = await serviceSupabase
        .from('concepts')
        .select('id, slug, validation_status')
        .in('id', conceptIds);

      const metaMap = new Map<string, { slug: string; validationStatus: ValidationStatus }>();
      if (conceptMeta) {
        for (const c of conceptMeta) {
          metaMap.set(c.id, {
            slug: c.slug as string,
            validationStatus: c.validation_status as ValidationStatus,
          });
        }
      }

      // 6. Fetch edges where source or target is in node set
      const { data: edgeRows } = await serviceSupabase
        .from('concept_relations')
        .select('id, source_id, target_id, relation_type, weight, confidence, examiner_transition')
        .or(`source_id.in.(${conceptIds.join(',')}),target_id.in.(${conceptIds.join(',')})`)
        .limit(500);

      // 7. Only include edges where both endpoints are in the node set
      const nodeIdSet = new Set(conceptIds);
      const filteredEdges = (edgeRows ?? []).filter(
        (e) => nodeIdSet.has(e.source_id as string) && nodeIdSet.has(e.target_id as string)
      );

      // 8. Count edges per node
      const edgeCountMap = new Map<string, number>();
      for (const e of filteredEdges) {
        const src = e.source_id as string;
        const tgt = e.target_id as string;
        edgeCountMap.set(src, (edgeCountMap.get(src) ?? 0) + 1);
        edgeCountMap.set(tgt, (edgeCountMap.get(tgt) ?? 0) + 1);
      }

      // 9. Build GraphNode objects
      const nodes: GraphNode[] = dedupedRows.map((row) => {
        const meta = metaMap.get(row.concept_id);
        return {
          id: row.concept_id as string,
          name: row.concept_name as string,
          slug: meta?.slug ?? '',
          category: row.concept_category as ConceptCategory,
          content: (row.concept_content as string) ?? '',
          keyFacts: Array.isArray(row.key_facts) ? row.key_facts : [],
          misconceptions: Array.isArray(row.common_misconceptions) ? row.common_misconceptions : [],
          validationStatus: meta?.validationStatus ?? 'pending',
          edgeCount: edgeCountMap.get(row.concept_id as string) ?? 0,
          evidence: parseEvidence(row.evidence_chunks),
        };
      });

      // 10. Build GraphLink objects
      const links: GraphLink[] = filteredEdges.map((e) => ({
        source: e.source_id as string,
        target: e.target_id as string,
        relationType: e.relation_type as RelationType,
        weight: (e.weight as number) ?? 1,
        confidence: (e.confidence as number) ?? 0,
        examinerTransition: (e.examiner_transition as string) ?? null,
      }));

      return NextResponse.json({ nodes, links });
    }

    // No recognized query params
    return NextResponse.json(
      { error: 'Provide ?search=<term> or ?element=<code>&depth=<1-3>' },
      { status: 400 }
    );
  } catch (error) {
    return handleAdminError(error);
  }
}
