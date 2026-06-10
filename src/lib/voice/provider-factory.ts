import type { TTSProvider, TTSOptions, TTSResult, VoiceTier } from './types';
import { TIER_FEATURES } from './types';

/** Returns the provider name for a given tier (pure function, no SDK imports). */
export function getTTSProviderName(tier: VoiceTier): string {
  return TIER_FEATURES[tier].ttsProvider;
}

/**
 * Runtime-fallback TTS provider (W4.1, review-04 #3).
 *
 * The old fallback chain only wrapped the dynamic IMPORT of the provider
 * module — which essentially never fails — so a Deepgram 429/5xx/timeout at
 * synthesis time surfaced as a 500 and the sentence was silently skipped.
 * This wrapper applies the chain to the synthesize() CALL itself.
 *
 * `name` reflects the provider that actually served the most recent call, so
 * the route's X-TTS-Provider header and usage_logs record real fallbacks.
 * Fallback providers do NOT receive the primary's config (a Deepgram model
 * string passed to OpenAI would itself fail) — they use their own defaults.
 */
class FallbackTTSProvider implements TTSProvider {
  readonly supportsStreaming = true;
  private actualName: string;

  constructor(private readonly chain: string[]) {
    this.actualName = chain[0];
  }

  get name(): string {
    return this.actualName;
  }

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    let lastErr: unknown;
    for (let i = 0; i < this.chain.length; i++) {
      const providerName = this.chain[i];
      try {
        const provider = await importProvider(providerName);
        const result = await provider.synthesize(text, i === 0 ? options : undefined);
        this.actualName = providerName;
        if (i > 0) {
          console.warn(`[tts] primary provider failed — served by fallback '${providerName}'`);
        }
        return result;
      } catch (err) {
        lastErr = err;
        console.error(
          `[tts] provider '${providerName}' failed:`,
          err instanceof Error ? err.message : err
        );
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('All TTS providers failed');
  }
}

/**
 * Creates the TTS provider for a tier, with a runtime fallback chain.
 * Lazy-imports SDK modules to avoid bundling unused providers.
 */
export async function createTTSProvider(tier: VoiceTier): Promise<TTSProvider> {
  const primary = TIER_FEATURES[tier].ttsProvider;
  return new FallbackTTSProvider([primary, ...getFallbackChain(primary)]);
}

function getFallbackChain(primary: string): string[] {
  switch (primary) {
    case 'deepgram': return ['openai'];
    case 'openai': return [];
    default: return ['openai'];
  }
}

async function importProvider(name: string): Promise<TTSProvider> {
  switch (name) {
    case 'openai': {
      const { OpenAITTSProvider } = await import('./tts/openai-tts');
      return new OpenAITTSProvider();
    }
    case 'deepgram': {
      const { DeepgramTTSProvider } = await import('./tts/deepgram-tts');
      return new DeepgramTTSProvider();
    }
    default:
      throw new Error(`Unknown TTS provider: ${name}`);
  }
}
