import type { TTSProvider, VoiceTier } from './types';
import { TIER_FEATURES } from './types';

/** Returns the provider name for a given tier (pure function, no SDK imports). */
export function getTTSProviderName(tier: VoiceTier): string {
  return TIER_FEATURES[tier].ttsProvider;
}

/**
 * Creates the TTS provider instance for a given tier.
 * Lazy-imports SDK modules to avoid bundling unused providers.
 * Includes fallback chain: Cartesia -> Deepgram -> OpenAI -> throw.
 */
export async function createTTSProvider(tier: VoiceTier): Promise<TTSProvider> {
  const primary = TIER_FEATURES[tier].ttsProvider;

  try {
    return await importProvider(primary);
  } catch (err) {
    console.error(`Primary TTS provider ${primary} failed to initialize:`, err);
    // Fallback chain
    const fallbacks = getFallbackChain(primary);
    for (const fallback of fallbacks) {
      try {
        console.warn(`Falling back to TTS provider: ${fallback}`);
        return await importProvider(fallback);
      } catch {
        continue;
      }
    }
    throw new Error('All TTS providers failed to initialize');
  }
}

function getFallbackChain(primary: string): string[] {
  switch (primary) {
    case 'cartesia': return ['deepgram', 'openai'];
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
    case 'cartesia': {
      const { CartesiaTTSProvider } = await import('./tts/cartesia-tts');
      return new CartesiaTTSProvider();
    }
    default:
      throw new Error(`Unknown TTS provider: ${name}`);
  }
}
