# Difficulty Calibration Audit (R4)

**Date:** 2026-03-03

## Instruction Injection Validation

| Difficulty | Present | Detail |
|------------|---------|--------|
| easy | ✅ | Contains: "Ask straightforward recall/definition questions...." |
| medium | ✅ | Contains: "Ask application and scenario-based questions...." |
| hard | ✅ | Contains: "Ask complex edge cases, "what if" chains, and regu..." |
| mixed | ✅ | Contains: "Vary difficulty naturally: mix recall, scenario-ba..." |
| (none) | ✅ | No DIFFICULTY LEVEL header when omitted |

## Methodology

- Instruction injection: imports `buildSystemPrompt()` from exam-logic.ts and checks each difficulty value
- Transcript analysis: loads examiner turns from `session_transcripts`, measures word count, scenario markers, regulation references
- Calibration: compares easy vs hard buckets for expected gradients
