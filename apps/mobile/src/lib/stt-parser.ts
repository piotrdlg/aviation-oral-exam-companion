export interface SpeechText {
  transcript: string;
  interim: string;
}

type Message = {
  type?: string;
  event?: string;
  is_final?: boolean;
  start?: number;
  duration?: number;
  turn_index?: number;
  audio_window_start?: number;
  audio_window_end?: number;
  transcript?: string;
  channel?: { alternatives?: { transcript?: string }[] };
};

/** One parser per socket attempt. Identity is acoustic timing, never spoken text. */
export class SttParser {
  private finals: string[] = [];
  private seen = new Set<string>();
  private interim = '';

  constructor(private readonly flux = false) {}

  get text(): SpeechText {
    return { transcript: this.finals.join(' '), interim: this.interim };
  }

  push(raw: unknown): SpeechText {
    let data: Message;
    try {
      const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!parsed || typeof parsed !== 'object') return this.text;
      data = parsed as Message;
    } catch {
      return this.text;
    }
    const nova = !this.flux && data.type === 'Results';
    const flux = this.flux && data.type === 'TurnInfo';
    if (!nova && !flux) return this.text;
    const value = nova ? data.channel?.alternatives?.[0]?.transcript : data.transcript;
    if (typeof value !== 'string') return this.text;
    const text = value.trim();
    const final = nova ? data.is_final === true : data.event === 'EndOfTurn';
    if (!final) {
      this.interim = text;
      return this.text;
    }

    const key = nova
      ? (Number.isFinite(data.start) && Number.isFinite(data.duration)
        ? `n:${data.start}:${data.duration}` : undefined)
      : (Number.isFinite(data.turn_index) ? `f:${data.turn_index}`
        : Number.isFinite(data.audio_window_start) && Number.isFinite(data.audio_window_end)
          ? `f:${data.audio_window_start}:${data.audio_window_end}` : undefined);
    if (key && this.seen.has(key)) return this.text;
    // Empty endpoint finals still clear obsolete interim text.
    this.interim = '';
    if (text) {
      if (key) this.seen.add(key);
      this.finals.push(text);
    }
    return this.text;
  }
}

export function mergeSpeechDraft(prefix: string, speech: SpeechText): string {
  return [prefix.trim(), speech.transcript.trim(), speech.interim.trim()].filter(Boolean).join(' ');
}
