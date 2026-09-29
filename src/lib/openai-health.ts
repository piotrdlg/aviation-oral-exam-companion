import 'server-only';
import OpenAI from 'openai';
import { classifyProviderError, type ProviderErrorClass } from './provider-error';

interface ProbeResult {
  ok: boolean;
  checked_at: string;
  error_class: ProviderErrorClass | null;
}
type Probe = 'openai_embeddings' | 'openai_tts';
const SUCCESS_TTL_MS = 10 * 60_000;
const FAILURE_TTL_MS = 60_000;
const TIMEOUT_MS = 8_000;
const cache: Partial<Record<Probe, { result: ProbeResult; expires: number }>> = {};
const inFlight: Partial<Record<Probe, Promise<ProbeResult>>> = {};

async function probe(kind: Probe): Promise<ProbeResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const call = async () => {
      if (!process.env.OPENAI_API_KEY) {
        throw Object.assign(new Error('OpenAI key is not configured'), { code: 'missing_api_key' });
      }
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: TIMEOUT_MS, maxRetries: 0 });
      const options = { signal: controller.signal };
      if (kind === 'openai_embeddings') {
        const result = await client.embeddings.create({ model: 'text-embedding-3-small', input: 'OK.' }, options);
        if (!result.data[0]?.embedding?.length) throw new Error('Empty embedding');
      } else {
        const response = await client.audio.speech.create({ model: 'gpt-4o-mini-tts', voice: 'onyx', input: 'OK.' }, options);
        // Consume the body too: headers alone do not prove synthesis completed.
        if (!(await response.arrayBuffer()).byteLength) throw new Error('Empty audio');
      }
    };
    // The race bounds even a stalled SDK/body; abort releases the underlying request.
    await Promise.race([
      call(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(Object.assign(new Error('OpenAI health probe timed out'), { name: 'TimeoutError' }));
          controller.abort();
        }, TIMEOUT_MS);
      }),
    ]);
    return { ok: true, checked_at: new Date().toISOString(), error_class: null };
  } catch (error) {
    return { ok: false, checked_at: new Date().toISOString(), error_class: classifyProviderError(error) };
  } finally {
    clearTimeout(timer);
  }
}

function cachedProbe(kind: Probe): Promise<ProbeResult> {
  const cached = cache[kind];
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.result);
  if (inFlight[kind]) return inFlight[kind];
  const pending = probe(kind).then(result => {
    cache[kind] = { result, expires: Date.now() + (result.ok ? SUCCESS_TTL_MS : FAILURE_TTL_MS) };
    return result;
  }).finally(() => { delete inFlight[kind]; });
  inFlight[kind] = pending;
  return pending;
}

export async function checkOpenAIHealth() {
  const [openai_embeddings, openai_tts] = await Promise.all([
    cachedProbe('openai_embeddings'), cachedProbe('openai_tts'),
  ]);
  return { openai_embeddings, openai_tts };
}
