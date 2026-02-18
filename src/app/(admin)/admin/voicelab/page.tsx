'use client';

import VoiceLab from '@/components/voice/VoiceLab';

export default function AdminVoiceLabPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Voice Lab</h1>
      <p className="text-gray-400 mb-6">
        Developer tools for testing AudioWorklet, TTS playback, and STT pipeline.
      </p>
      <VoiceLab />
    </div>
  );
}
