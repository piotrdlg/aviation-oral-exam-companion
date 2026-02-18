'use client';

import VoiceLab from '@/components/voice/VoiceLab';

export default function AdminVoiceLabPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-c-text font-mono uppercase tracking-wider mb-2">Voice Lab</h1>
      <p className="text-c-muted mb-6">
        Developer tools for testing AudioWorklet, TTS playback, and STT pipeline.
      </p>
      <VoiceLab />
    </div>
  );
}
