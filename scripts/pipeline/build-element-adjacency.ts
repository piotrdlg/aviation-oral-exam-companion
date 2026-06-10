/**
 * build-element-adjacency.ts — Scenario Engine layer 1 (W5.3, design §3).
 *
 * For each rating (PA/CA/IR), computes blended relatedness between all ACS
 * elements and writes the top-12 neighbors (score ≥ 0.35) per element to
 * element_adjacency:
 *
 *   0.60 × embedding cosine   "{code} {text} — task: {task}, area: {area}"
 *   0.25 × chunk co-occurrence (Jaccard over top-10 hybrid-search chunk ids)
 *   0.15 × structural prior    (same task 1.0 / same area 0.5 / else 0)
 *
 * Idempotent: per-rating delete-and-rebuild. Honors the stoplist file
 * (element-adjacency-stoplist.json) — CFI-flagged nonsense pairs excluded on
 * rebuild. Embeddings cached to scripts/.cache/element-embeddings.json so
 * re-runs cost nothing. Mandatory QC report written to
 * docs/reviews/2026-06-09-comprehensive-review/14-adjacency-qc.md.
 *
 * Usage: npm run pipeline:element-adjacency [-- --rating=PA]
 * Cost: ~2,174 embeddings (~$0.05) + ~2,174 chunk searches. ~5 min.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import {
  buildAdjacencyRows,
  type AdjacencyBuildItem,
  type AdjacencyRow,
} from '../../src/lib/element-adjacency';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const RATINGS: Record<string, string> = { PA: 'PA.', CA: 'CA.', IR: 'IR.' };
const CACHE_PATH = path.join(__dirname, '../.cache/element-embeddings.json');
const STOPLIST_PATH = path.join(__dirname, 'element-adjacency-stoplist.json');
const QC_PATH = path.join(__dirname, '../../docs/reviews/2026-06-09-comprehensive-review/14-adjacency-qc.md');

interface ElementRow {
  code: string;
  description: string;
  task_id: string;
  element_type: string;
}

function loadCache(): Record<string, number[]> {
  try { return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch { return {}; }
}
function saveCache(cache: Record<string, number[]>) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
}
function loadStoplist(): Set<string> {
  try {
    const pairs = JSON.parse(fs.readFileSync(STOPLIST_PATH, 'utf8')) as string[][];
    return new Set(pairs.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
  } catch { return new Set(); }
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: batch });
    out.push(...res.data.map((d) => d.embedding));
    process.stdout.write(`  embedded ${Math.min(i + 100, texts.length)}/${texts.length}\r`);
  }
  return out;
}

async function topChunkIds(text: string, embedding: number[]): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('chunk_hybrid_search', {
    query_text: text.slice(0, 500),
    query_embedding: embedding,
    match_count: 10,
  });
  if (error) throw new Error(`chunk_hybrid_search: ${error.message}`);
  return new Set((data as { id: string }[] | null)?.map((r) => r.id) ?? []);
}

async function buildRating(prefix: string, stoplist: Set<string>, cache: Record<string, number[]>): Promise<AdjacencyRow[]> {
  // 1. Elements + task/area titles
  // Oral exams test K and R elements only — S (skill) elements would waste
  // top-12 neighbor slots on rows no oral plan can ever use.
  const { data: elements, error: elErr } = await supabase
    .from('acs_elements')
    .select('code, description, task_id, element_type')
    .like('code', `${prefix}%`)
    .neq('element_type', 'skill')
    .order('code');
  if (elErr || !elements) throw new Error(`elements: ${elErr?.message}`);

  const { data: tasks } = await supabase
    .from('acs_tasks')
    .select('id, area, task')
    .like('id', `${prefix}%`);
  const taskMap = new Map((tasks ?? []).map((t) => [t.id, t]));

  const els = elements as ElementRow[];
  console.log(`${prefix}* — ${els.length} elements`);

  // 2. Embeddings (cached)
  const embedTexts = els.map((el) => {
    const t = taskMap.get(el.task_id);
    return `${el.code} ${el.description} — task: ${t?.task ?? ''}, area: ${t?.area ?? ''}`;
  });
  const missingIdx = els.map((el, i) => (cache[hashKey(el.code, embedTexts[i])] ? -1 : i)).filter((i) => i >= 0);
  if (missingIdx.length > 0) {
    console.log(`  embedding ${missingIdx.length} uncached elements…`);
    const fresh = await embedBatch(missingIdx.map((i) => embedTexts[i]));
    missingIdx.forEach((elIdx, j) => { cache[hashKey(els[elIdx].code, embedTexts[elIdx])] = fresh[j]; });
    saveCache(cache);
  }
  const embeddings = els.map((el, i) => cache[hashKey(el.code, embedTexts[i])]);

  // 3. Chunk co-occurrence sets (parallel, 8 at a time)
  console.log(`  fetching top-10 chunks per element…`);
  const chunkSets: Set<string>[] = new Array(els.length);
  let done = 0;
  for (let i = 0; i < els.length; i += 8) {
    const batch = els.slice(i, i + 8);
    const sets = await Promise.all(
      batch.map((el, j) => topChunkIds(`${el.description}`, embeddings[i + j]))
    );
    sets.forEach((s, j) => { chunkSets[i + j] = s; });
    done += batch.length;
    process.stdout.write(`  chunks ${done}/${els.length}\r`);
  }
  console.log();

  // 4. Blend
  const items: AdjacencyBuildItem[] = els.map((el, i) => ({
    code: el.code,
    embedding: embeddings[i],
    chunkIds: chunkSets[i],
  }));
  const rows = buildAdjacencyRows(items, { stoplist });
  console.log(`  ${rows.length} adjacency rows (${(rows.length / els.length).toFixed(1)} avg neighbors/element)`);

  // 5. Idempotent write: delete rating's rows, insert fresh
  const { error: delErr } = await supabase.from('element_adjacency').delete().like('element_code', `${prefix}%`);
  if (delErr) throw new Error(`delete: ${delErr.message}`);
  for (let i = 0; i < rows.length; i += 500) {
    const { error: insErr } = await supabase.from('element_adjacency').insert(
      rows.slice(i, i + 500).map((r) => ({ ...r, built_at: new Date().toISOString() }))
    );
    if (insErr) throw new Error(`insert: ${insErr.message}`);
  }
  console.log(`  written ✅`);
  return rows;
}

function hashKey(code: string, text: string): string {
  // cheap content-addressed cache key (text changes → re-embed)
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `${code}:${h}`;
}

async function writeQcReport(allRows: AdjacencyRow[], descriptions: Map<string, string>) {
  const byElement = new Map<string, AdjacencyRow[]>();
  for (const r of allRows) {
    const list = byElement.get(r.element_code) ?? [];
    list.push(r);
    byElement.set(r.element_code, list);
  }
  const codes = [...byElement.keys()];
  // Deterministic "random" sample: every Nth element
  const step = Math.max(1, Math.floor(codes.length / 30));
  const sample = codes.filter((_, i) => i % step === 0).slice(0, 30);

  const crossArea = allRows
    .filter((r) => {
      const a = r.element_code.split('.'), b = r.related_code.split('.');
      return a[1] !== b[1]; // different area
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  const desc = (c: string) => (descriptions.get(c) ?? '').slice(0, 90);
  const lines: string[] = [
    '# 14 — Element Adjacency QC Report (W5.3)',
    '',
    `> Generated ${new Date().toISOString().slice(0, 10)} by scripts/pipeline/build-element-adjacency.ts`,
    `> **OWNER (CFI) ACTION:** eyeball the neighbor lists below. Nonsense pairs go into`,
    '> `scripts/pipeline/element-adjacency-stoplist.json` as `["CODE_A","CODE_B"]` entries; re-run the build.',
    '',
    `Total rows: ${allRows.length} across ${codes.length} elements.`,
    '',
    '## Sampled neighbor lists (30 elements)',
    '',
  ];
  for (const code of sample) {
    lines.push(`### ${code} — ${desc(code)}`);
    for (const n of (byElement.get(code) ?? []).slice(0, 12)) {
      lines.push(`- ${n.related_code} (${n.score.toFixed(3)}) [emb ${n.signals.embedding.toFixed(2)} / co ${n.signals.cooccurrence.toFixed(2)} / str ${n.signals.structural.toFixed(1)}] — ${desc(n.related_code)}`);
    }
    lines.push('');
  }
  lines.push('## Top 50 cross-AREA pairs (the interesting ones)', '');
  for (const r of crossArea) {
    lines.push(`- ${r.element_code} ↔ ${r.related_code} (${r.score.toFixed(3)}) — "${desc(r.element_code)}" ↔ "${desc(r.related_code)}"`);
  }
  fs.writeFileSync(QC_PATH, lines.join('\n'));
  console.log(`QC report → ${QC_PATH}`);
}

async function main() {
  const ratingArg = process.argv.find((a) => a.startsWith('--rating='))?.split('=')[1];
  const prefixes = ratingArg ? [RATINGS[ratingArg]] : Object.values(RATINGS);
  if (prefixes.some((p) => !p)) { console.error('bad --rating'); process.exit(1); }

  const stoplist = loadStoplist();
  console.log(`stoplist: ${stoplist.size} pairs`);
  const cache = loadCache();

  const allRows: AdjacencyRow[] = [];
  for (const prefix of prefixes) {
    allRows.push(...await buildRating(prefix, stoplist, cache));
  }

  // Descriptions for the QC report (paginated — PostgREST caps at 1,000/page)
  const descriptions = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data: page } = await supabase.from('acs_elements')
      .select('code, description').order('code').range(from, from + 999);
    for (const e of page ?? []) descriptions.set(e.code, e.description);
    if (!page || page.length < 1000) break;
  }
  await writeQcReport(allRows, descriptions);
}

main().catch((e) => { console.error(e); process.exit(1); });
