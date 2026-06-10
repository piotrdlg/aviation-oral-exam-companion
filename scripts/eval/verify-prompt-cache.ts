/**
 * W5.2 — live verification of Anthropic prompt caching in the exam engine.
 * Runs the REAL generateExaminerTurn twice (simulating exchange 1 → 2 of a
 * task) and assessAnswer twice, printing cache_creation/cache_read tokens.
 * PASS = the second call of each pair reads from cache.
 *
 * Usage: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/eval/verify-prompt-cache.ts
 * Cost: ~4 Sonnet calls (≈ $0.10).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { generateExaminerTurn, assessAnswer, fetchRagContext } = await import('../../src/lib/exam-engine');
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: task } = await supabase.from('acs_tasks').select('*').eq('id', 'PA.I.B').single();
  if (!task) throw new Error('task PA.I.B not found');

  // Production-realistic persona (~450 tokens) — the cache minimum is
  // 1,024 tokens and production always carries a persona fragment.
  const persona = 'PERSONA: You are Captain Dan Mitchell, a retired airline captain and DPE with 22,000 hours. ' +
    'You are firm but encouraging, use real-world anecdotes from your Part 121 career sparingly, and insist on ' +
    'precise regulatory citations. You never accept hand-waving. When a student is close but imprecise, you probe once more. '.repeat(6);

  const history1 = [
    { role: 'examiner' as const, text: 'Good morning. What documents must you carry to act as PIC today?' },
    { role: 'student' as const, text: 'I need my pilot certificate, a government photo ID, and a current medical certificate.' },
  ];
  const t0 = Date.now();
  const rag1 = await fetchRagContext(task, history1, history1[1].text, 5, {});
  const ragMs1 = Date.now() - t0;

  console.log('=== examiner call 1 (expect cache_creation > 0) ===');
  const turn1 = await generateExaminerTurn(task, history1, 'medium', undefined, { ragContext: rag1.ragContext }, 'private', undefined, persona);
  console.log(JSON.stringify(turn1.usage));

  const history2 = [...history1,
    { role: 'examiner' as const, text: turn1.examinerMessage },
    { role: 'student' as const, text: 'BasicMed requires a valid driver\'s license and the CMEC checklist every four years.' },
  ];
  const rag2 = await fetchRagContext(task, history2, history2[3].text, 5, {});

  console.log('=== examiner call 2 (expect cache_read > 0) ===');
  const turn2 = await generateExaminerTurn(task, history2, 'medium', undefined, { ragContext: rag2.ragContext }, 'private', undefined, persona);
  console.log(JSON.stringify(turn2.usage));

  // Production always passes a grading contract (formatContractForAssessment)
  const gradingContract = 'GRADING CALIBRATION CONTRACT (medium difficulty):\n' +
    'satisfactory = the answer demonstrates correct understanding of the element with at most minor imprecision; ' +
    'partial = the core concept is present but a material component is missing or imprecise; ' +
    'unsatisfactory = the core concept is wrong, absent, or dangerously misapplied. '.repeat(4) +
    'Apply the ACS standard for the element, not perfection. Cite the controlling reference when scoring.';
  console.log('=== assessment call 1 (expect cache_creation > 0) ===');
  const a1 = await assessAnswer(task, history1, history1[1].text, { ragContext: rag1.ragContext, ragChunks: rag1.ragChunks }, null, 'private', undefined, 'medium', gradingContract);
  console.log(JSON.stringify(a1.usage));
  console.log('=== assessment call 2 (expect cache_read > 0) ===');
  const a2 = await assessAnswer(task, history2, history2[3].text, { ragContext: rag2.ragContext, ragChunks: rag2.ragChunks }, null, 'private', undefined, 'medium', gradingContract);
  console.log(JSON.stringify(a2.usage));

  const examinerHit = (turn2.usage?.cache_read_input_tokens ?? 0) > 0;
  const assessHit = (a2.usage?.cache_read_input_tokens ?? 0) > 0;
  console.log(`\nretrieval latency (5 chunks + images kick-off): ${ragMs1}ms`);
  console.log(`examiner cache: ${examinerHit ? 'HIT ✅' : 'MISS ❌'}  assessment cache: ${assessHit ? 'HIT ✅' : 'MISS (block may be under 1024-token minimum)'}`);
  if (!examinerHit) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
