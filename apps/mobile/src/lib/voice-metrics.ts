import { track } from './analytics';

let exchange: { send: number; finalized?: number; response?: number } | null = null;

export function beginVoiceExchange() { exchange = { send: performance.now() }; }
export function markVoiceFinalized() {
  if (!exchange) return;
  exchange.finalized = performance.now();
  voiceMetric('send_to_finalize', exchange.finalized - exchange.send);
}
export function markExamResponse() {
  if (!exchange) return;
  exchange.response = performance.now();
  voiceMetric('finalize_to_response', exchange.response - (exchange.finalized ?? exchange.send));
}
export function markVoicePlayback() {
  if (!exchange || exchange.response === undefined) return;
  voiceMetric('response_to_playing', performance.now() - exchange.response);
  voiceMetric('E2E', performance.now() - exchange.send);
  exchange = null;
}

/** No audio/text/identity properties: samples can be enabled in the preview build. */
export function voiceMetric(metric: string, milliseconds?: number) {
  if (!__DEV__ && process.env.EXPO_PUBLIC_VOICE_METRICS !== 'true') return;
  const props = { metric, milliseconds: milliseconds === undefined ? undefined : Math.round(milliseconds) };
  if (__DEV__) console.info('[voice_spike_sample]', props);
  track('voice_spike_sample', props);
}
