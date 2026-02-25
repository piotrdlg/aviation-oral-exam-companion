import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';
import type { CoverageData, CoverageArea, CoverageTask, CoverageElement } from '@/app/(admin)/admin/graph/graph-types';

/** Map user-facing rating name to ACS task ID prefix */
const RATING_PREFIX: Record<string, string> = {
  private: 'PA.',
  commercial: 'CA.',
  instrument: 'IR.',
};

/** Map ACS task ID prefix to the rating word used in acs_area slugs */
const PREFIX_TO_RATING_WORD: Record<string, string> = {
  PA: 'private',
  CA: 'commercial',
  IR: 'instrument',
};

/**
 * Fetch all rows from a Supabase query, paginating in chunks to avoid the
 * default 1000-row limit. Returns the concatenated result array.
 */
async function fetchAllPaginated<T>(
  queryFn: (offset: number, limit: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await queryFn(offset, pageSize);
    if (error) {
      console.error('Paginated fetch error at offset', offset, error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break; // last page
    offset += pageSize;
  }
  return all;
}

/**
 * GET /api/admin/graph/coverage?rating=private|commercial|instrument
 *
 * Returns a hierarchical coverage structure for the treemap visualization:
 *   { rating, areas: [{ name, slug, tasks: [{ name, slug, elements: [{ code, name, edgeCount }] }] }] }
 *
 * Edge counts exclude `is_component_of` edges (structural ACS hierarchy).
 * Only non-structural knowledge edges are counted to show true coverage depth.
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const url = new URL(request.url);
    const rating = url.searchParams.get('rating') ?? 'private';

    const prefix = RATING_PREFIX[rating];
    if (!prefix) {
      return NextResponse.json(
        { error: `Invalid rating: ${rating}. Must be one of: private, commercial, instrument` },
        { status: 400 },
      );
    }

    const ratingWord = PREFIX_TO_RATING_WORD[prefix.replace('.', '')];

    // ── Step 1: Fetch all ACS element concepts for this rating ──────
    // Slug pattern: "acs_element:PA.%" — may be 2000+ rows, so paginate.
    const slugPattern = `acs_element:${prefix}%`;

    const elements = await fetchAllPaginated<{
      id: string;
      name: string;
      slug: string;
    }>((offset, limit) =>
      serviceSupabase
        .from('concepts')
        .select('id, name, slug')
        .eq('category', 'acs_element')
        .like('slug', slugPattern)
        .order('slug')
        .range(offset, offset + limit - 1),
    );

    if (elements.length === 0) {
      return NextResponse.json({ rating, areas: [] } satisfies CoverageData);
    }

    // Build a set of element IDs and a map from ID to element info
    const elementIdSet = new Set<string>();
    const elementById = new Map<string, { name: string; slug: string }>();
    for (const el of elements) {
      elementIdSet.add(el.id);
      elementById.set(el.id, { name: el.name, slug: el.slug });
    }

    // ── Step 2: Count non-structural edges per element ──────────────
    // Query edges in batches of element IDs (max ~100 per .in() call)
    // to avoid Supabase rejecting large .in() lists.
    const edgeCountMap = new Map<string, number>();
    const elementIds = Array.from(elementIdSet);
    const BATCH_SIZE = 100;

    for (let i = 0; i < elementIds.length; i += BATCH_SIZE) {
      const batch = elementIds.slice(i, i + BATCH_SIZE);
      const batchIdList = batch.join(',');

      // Fetch edges where source_id OR target_id is in this batch,
      // excluding is_component_of (structural hierarchy edges)
      const { data: edges, error: edgeError } = await serviceSupabase
        .from('concept_relations')
        .select('source_id, target_id')
        .neq('relation_type', 'is_component_of')
        .or(`source_id.in.(${batchIdList}),target_id.in.(${batchIdList})`)
        .limit(50000);

      if (edgeError) {
        console.error('Edge batch query error:', edgeError);
        continue;
      }

      for (const edge of edges ?? []) {
        const src = edge.source_id as string;
        const tgt = edge.target_id as string;
        // Only count for elements in our set (the batch filter may return
        // edges where the *other* endpoint matches a different batch element)
        if (elementIdSet.has(src)) {
          edgeCountMap.set(src, (edgeCountMap.get(src) ?? 0) + 1);
        }
        if (elementIdSet.has(tgt)) {
          edgeCountMap.set(tgt, (edgeCountMap.get(tgt) ?? 0) + 1);
        }
      }
    }

    // ── Step 3: Fetch ACS area concepts for name resolution ─────────
    // Slug pattern: "acs_area:{ratingWord}:%" e.g. "acs_area:private:%"
    const areaSlugPattern = `acs_area:${ratingWord}:%`;
    const { data: areaConcepts } = await serviceSupabase
      .from('concepts')
      .select('name, slug, key_facts')
      .eq('category', 'acs_area')
      .like('slug', areaSlugPattern)
      .limit(50);

    // Map roman numeral -> area info
    const areaNameMap = new Map<string, { name: string; slug: string }>();
    for (const area of areaConcepts ?? []) {
      // slug format: "acs_area:private:I" -> extract roman numeral
      const parts = (area.slug as string).split(':');
      const roman = parts[2]; // "I", "II", etc.
      // Try to get the descriptive area name from key_facts
      let areaName = area.name as string;
      const kf = area.key_facts as unknown;
      if (kf && typeof kf === 'object' && !Array.isArray(kf) && 'area_name' in (kf as Record<string, unknown>)) {
        areaName = (kf as Record<string, string>).area_name;
      } else if (Array.isArray(kf)) {
        // key_facts is stored as JSONB — might be an object or array
        // If it's an array with a single object containing area_name
        for (const item of kf) {
          if (item && typeof item === 'object' && 'area_name' in (item as Record<string, unknown>)) {
            areaName = (item as Record<string, string>).area_name;
            break;
          }
        }
      }
      areaNameMap.set(roman, { name: areaName, slug: area.slug as string });
    }

    // ── Step 4: Fetch ACS task concepts for name resolution ─────────
    const taskSlugPattern = `acs_task:${prefix}%`;
    const taskConcepts = await fetchAllPaginated<{
      name: string;
      slug: string;
    }>((offset, limit) =>
      serviceSupabase
        .from('concepts')
        .select('name, slug')
        .eq('category', 'acs_task')
        .like('slug', taskSlugPattern)
        .order('slug')
        .range(offset, offset + limit - 1),
    );

    // Map task key (e.g. "PA.I.A") -> task info
    const taskNameMap = new Map<string, { name: string; slug: string }>();
    for (const task of taskConcepts) {
      // slug format: "acs_task:PA.I.A" -> extract "PA.I.A"
      const colonIdx = task.slug.indexOf(':');
      const taskKey = colonIdx >= 0 ? task.slug.slice(colonIdx + 1) : task.slug;
      taskNameMap.set(taskKey, { name: task.name, slug: task.slug });
    }

    // ── Step 5: Build the hierarchy ─────────────────────────────────
    // Parse each element slug to extract area key, task key, and element code.
    // Slug format: "acs_element:PA.I.A.K1"
    //   -> prefix "PA", area roman "I", task letter "A", element short "K1"
    //   -> area key "PA.I", task key "PA.I.A", element code "PA.I.A.K1"

    // Use ordered maps to preserve sort order
    const areaMap = new Map<string, Map<string, CoverageElement[]>>();

    for (const el of elements) {
      const colonIdx = el.slug.indexOf(':');
      const code = colonIdx >= 0 ? el.slug.slice(colonIdx + 1) : el.slug;
      // code: "PA.I.A.K1"
      const dotParts = code.split('.');
      if (dotParts.length < 4) continue; // malformed slug, skip

      const areaKey = `${dotParts[0]}.${dotParts[1]}`; // "PA.I"
      const taskKey = `${dotParts[0]}.${dotParts[1]}.${dotParts[2]}`; // "PA.I.A"

      if (!areaMap.has(areaKey)) {
        areaMap.set(areaKey, new Map());
      }
      const taskMap = areaMap.get(areaKey)!;
      if (!taskMap.has(taskKey)) {
        taskMap.set(taskKey, []);
      }

      taskMap.get(taskKey)!.push({
        code,
        name: el.name,
        edgeCount: edgeCountMap.get(el.id) ?? 0,
      });
    }

    // Assemble into the response structure
    const areas: CoverageArea[] = [];

    for (const [areaKey, taskMap] of areaMap) {
      // areaKey: "PA.I" -> roman numeral is the second part
      const roman = areaKey.split('.')[1];
      const areaInfo = areaNameMap.get(roman);

      const tasks: CoverageTask[] = [];
      for (const [taskKey, elementList] of taskMap) {
        const taskInfo = taskNameMap.get(taskKey);
        tasks.push({
          name: taskInfo?.name ?? taskKey,
          slug: taskInfo?.slug ?? `acs_task:${taskKey}`,
          elements: elementList,
        });
      }

      areas.push({
        name: areaInfo?.name ?? `Area ${roman}`,
        slug: areaInfo?.slug ?? `acs_area:${ratingWord}:${roman}`,
        tasks,
      });
    }

    const result: CoverageData = { rating, areas };
    return NextResponse.json(result);
  } catch (error) {
    return handleAdminError(error);
  }
}
