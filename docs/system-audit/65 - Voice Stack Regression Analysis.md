# 65 — Voice Stack Regression Analysis

> **Date:** 2026-03-06
> **Status:** Analysis complete — decision-ready plan produced
> **Full report:** Obsidian vault (`HeyDPE - Build Report/2026-03-06 Voice Stack Regression — Engineering Report.md`)

## Summary

Voice pipeline regression: "WebSocket connection to speech service failed" → "Voice mode disabled."

### Root Cause (Ranked)
1. **CSP `connect-src` missing `wss://` scheme** — production CSP has `https://api.deepgram.com` but not `wss://api.deepgram.com`. CSP3 says `https:` matches `wss:`, Chrome supports this but Safari/iOS may not.
2. **Deepgram auth/grant JWT instability** — 8 previous commits fixed STT auth. Chronically fragile area.
3. **Aggressive auto-fallback** — single failure permanently disables voice (no retry).

### Recommended Fix (Moderate)
1. Add explicit `wss://api.deepgram.com` to CSP `connect-src`
2. Add 1 retry with 2s delay on WebSocket failure
3. Add PostHog events for STT connect/fail/voice-disable
4. Add CSP `report-to` for violation detection
5. Delete dead code `voice-integration.ts`

### Key Architecture Facts
- All 3 tiers route through Deepgram for STT and TTS
- STT: client → /api/stt/token (JWT) → direct WebSocket to Deepgram
- TTS: client → /api/tts → Deepgram (server-side proxy)
- `voice-integration.ts:getVoiceConfig()` is dead code (never imported)
- `ground_school` tier blocked from TTS but not STT at API level
- 10 previous commits fixed STT WebSocket auth issues

### Files Involved
| File | Change | Lines |
|------|--------|-------|
| `next.config.ts` | Add `wss://api.deepgram.com` to CSP | ~5 |
| `src/hooks/useDeepgramSTT.ts` | Add retry + structured logging | ~30 |
| `src/app/(dashboard)/practice/page.tsx` | Replace auto-disable with retry UI | ~20 |
| `src/lib/voice-integration.ts` | DELETE (dead code) | -101 |
| Various | PostHog events | ~20 |
