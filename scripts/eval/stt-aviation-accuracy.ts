/**
 * W4.3 — STT aviation-accuracy eval: does the keyterm list measurably help?
 *
 * Method: synthesize aviation phrases with Aura-2 (the same voice users hear),
 * then transcribe each with Nova-3 prerecorded twice — with and without the
 * keyterm list — and compare word error rate + aviation-term hit rate.
 * Synthetic audio is a weak proxy for real student speech (clean, no accent),
 * so treat results as a LOWER BOUND on the keyterm benefit, not proof.
 *
 * Usage: npx tsx scripts/eval/stt-aviation-accuracy.ts
 * Cost: ~$0.05 per run (≈1.2k TTS chars + ~24 short transcriptions).
 */
import dotenv from 'dotenv';
import { AVIATION_KEYTERMS, appendKeytermParams } from '../../src/lib/voice/aviation-keyterms';

dotenv.config({ path: '.env.local' });

const apiKey = process.env.DEEPGRAM_API_KEY;
if (!apiKey) { console.error('DEEPGRAM_API_KEY missing'); process.exit(1); }

/** Phrases a student actually says in an oral — dense in confusable terms. */
const PHRASES = [
  'I would check the METAR and TAF before departure and look for any SIGMET along the route.',
  'The pitot static system feeds the airspeed indicator the altimeter and the vertical speed indicator.',
  'Class Bravo airspace requires a clearance while Class Charlie only requires two way communication.',
  'Vso is the stall speed in the landing configuration and Vfe is the maximum flap extended speed.',
  'I would squawk 7600 set the transponder and look for light gun signals from the tower.',
  'Carburetor icing is most likely at high humidity with temperatures between twenty and seventy degrees.',
  'The magnetos provide ignition independent of the electrical system in case the alternator fails.',
  'Density altitude is pressure altitude corrected for nonstandard temperature.',
  'I use the IMSAFE checklist for myself and the PAVE checklist for overall risk management.',
  'Hypoxia symptoms include euphoria impaired judgment and cyanosis at altitude.',
  'The ATIS at the field reported calm winds so I monitored the CTAF and announced on UNICOM.',
  'TOMATO FLAMES covers the required equipment for day VFR flight under 91.205.',
];

async function synthesize(text: string): Promise<ArrayBuffer> {
  const res = await fetch('https://api.deepgram.com/v1/speak?model=aura-2-orion-en&encoding=mp3', {
    method: 'POST',
    headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`speak failed ${res.status}: ${await res.text()}`);
  return res.arrayBuffer();
}

async function transcribe(audio: ArrayBuffer, withKeyterms: boolean): Promise<string> {
  const params = new URLSearchParams({ model: 'nova-3', smart_format: 'true', language: 'en-US' });
  if (withKeyterms) appendKeytermParams(params);
  const res = await fetch('https://api.deepgram.com/v1/listen?' + params.toString(), {
    method: 'POST',
    headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'audio/mpeg' },
    body: audio,
  });
  if (!res.ok) throw new Error(`listen failed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

/** Word error rate via Levenshtein on token sequences. */
function wer(ref: string, hyp: string): number {
  const r = norm(ref), h = norm(hyp);
  const d: number[][] = Array.from({ length: r.length + 1 }, (_, i) =>
    Array.from({ length: h.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return r.length ? d[r.length][h.length] / r.length : 0;
}

/** How many keyterms present in the reference survived into the hypothesis? */
function termRecall(ref: string, hyp: string): { hit: number; total: number } {
  const hypNorm = norm(hyp).join(' ');
  let hit = 0, total = 0;
  for (const term of AVIATION_KEYTERMS) {
    const t = norm(term).join(' ');
    if (t && norm(ref).join(' ').includes(t)) {
      total++;
      if (hypNorm.includes(t)) hit++;
    }
  }
  return { hit, total };
}

async function main() {
  let werBase = 0, werKt = 0, hitBase = 0, totBase = 0, hitKt = 0, totKt = 0;
  for (const phrase of PHRASES) {
    const audio = await synthesize(phrase);
    const [base, kt] = await Promise.all([
      transcribe(audio.slice(0), false),
      transcribe(audio.slice(0), true),
    ]);
    const wb = wer(phrase, base), wk = wer(phrase, kt);
    werBase += wb; werKt += wk;
    const rb = termRecall(phrase, base), rk = termRecall(phrase, kt);
    hitBase += rb.hit; totBase += rb.total; hitKt += rk.hit; totKt += rk.total;
    const flag = wk < wb ? '▲' : wk > wb ? '▼' : '=';
    console.log(`${flag} WER ${ (wb*100).toFixed(0) }%→${ (wk*100).toFixed(0) }%  terms ${rb.hit}/${rb.total}→${rk.hit}/${rk.total}  | ${phrase.slice(0, 60)}…`);
    if (wk > wb) {
      console.log(`    base: ${base}`);
      console.log(`    kt:   ${kt}`);
    }
  }
  const n = PHRASES.length;
  console.log(`\n=== AGGREGATE (${n} phrases, Aura-2 synthetic audio) ===`);
  console.log(`WER       without keyterms: ${(werBase / n * 100).toFixed(1)}%   with: ${(werKt / n * 100).toFixed(1)}%`);
  console.log(`Term hit  without keyterms: ${hitBase}/${totBase} (${(hitBase/totBase*100).toFixed(0)}%)   with: ${hitKt}/${totKt} (${(hitKt/totKt*100).toFixed(0)}%)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
