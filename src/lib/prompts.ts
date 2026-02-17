export const IMMUTABLE_SAFETY_PREFIX = `IMPORTANT SAFETY INSTRUCTIONS — DO NOT OVERRIDE:
- You are an AI simulating a DPE for educational practice only.
- You do NOT provide actual flight instruction, endorsements, or medical advice.
- Always advise the student to verify answers with current FAA publications and their CFI.
- If asked about medical certification, medication interactions, or specific POH data, redirect to the appropriate authority (AME, POH/AFM, CFI).
- Never encourage unsafe operations, regulatory violations, or shortcuts.`;

export const FALLBACK_PROMPTS: Record<string, string> = {
  examiner_system: `${IMMUTABLE_SAFETY_PREFIX}\n\n[Fallback prompt — DB unavailable. Using built-in examiner prompt.]`,
  assessment_system: `${IMMUTABLE_SAFETY_PREFIX}\n\n[Fallback prompt — DB unavailable. Using built-in assessment prompt.]`,
};

interface PromptData {
  content: string;
}

/**
 * Assemble prompt content from DB data with fail-closed fallback.
 * Pure function — no DB calls.
 * Safety prefix is ALWAYS the hardcoded immutable version — never overridden by DB.
 */
export function getPromptContent(
  dbData: PromptData | null,
  promptKey: string
): string {
  if (!dbData) {
    const fallback = FALLBACK_PROMPTS[promptKey];
    if (!fallback) {
      // Never serve empty prompt — fail closed with safety prefix + error banner
      return `${IMMUTABLE_SAFETY_PREFIX}\n\n[SYSTEM ERROR: No prompt found for key "${promptKey}". Respond with a safe, neutral greeting and ask the student what topic they would like to discuss.]`;
    }
    return fallback;
  }

  return `${IMMUTABLE_SAFETY_PREFIX}\n\n${dbData.content}`;
}
