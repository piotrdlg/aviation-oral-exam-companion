# Cross-Browser Test Matrix

Test the full exam flow on each browser/platform combination.

## Test Flow

1. Load landing page
2. Sign in (OAuth or OTP)
3. Configure session (Private Pilot, ASEL, Linear, Mixed)
4. Start exam with voice enabled
5. Answer 3 questions using voice input
6. End session
7. Check progress page for session record
8. Check settings page for usage stats
9. Test pricing page loads
10. Test Stripe checkout redirect (use test card)

## Browser Matrix

| # | Browser | Platform | Auth | Exam Start | Voice STT | Voice TTS | Streaming | Progress | Settings | Pricing | Notes |
|---|---------|----------|------|------------|-----------|-----------|-----------|----------|----------|---------|-------|
| 1 | Chrome 120+ | macOS | | | | | | | | | Primary target |
| 2 | Chrome 120+ | Windows | | | | | | | | | |
| 3 | Firefox 121+ | macOS | | | | | | | | | No Web Speech API; Tier 2/3 only |
| 4 | Firefox 121+ | Windows | | | | | | | | | |
| 5 | Safari 17+ | macOS | | | | | | | | | User gesture required for audio |
| 6 | Safari 17+ | iOS (iPhone) | | | | | | | | | All iOS browsers use WebKit |
| 7 | Safari 17+ | iOS (iPad) | | | | | | | | | Desktop mode UA differs |
| 8 | Chrome (CriOS) | iOS | | | | | | | | | Uses WebKit under the hood |
| 9 | Chrome 120+ | Android | | | | | | | | | |
| 10 | Edge 120+ | Windows | | | | | | | | | Chromium-based |

## Status Legend

- **P** = Pass
- **F** = Fail (describe in Notes)
- **S** = Skip (feature not applicable)
- **N/A** = Not tested

## Known Limitations

- **Tier 1 (Ground School)**: Web Speech API STT only works on Chrome/Edge. Other browsers can still use text input + TTS output.
- **Tier 2/3 (Checkride Prep / DPE Live)**: Deepgram STT works on all browsers via WebSocket. AudioWorklet streaming may not work on older Safari.
- **iOS**: All browsers require a user gesture before audio playback. The `unlockAudioContext()` utility handles this.
- **Firefox**: Does not support Web Speech API. Users on free tier will not have voice input. Upgrade to Tier 2/3 for Deepgram STT.

## Test Results

_Fill in after executing tests._

| Date | Tester | Browsers Tested | Issues Found |
|------|--------|-----------------|--------------|
| | | | |
