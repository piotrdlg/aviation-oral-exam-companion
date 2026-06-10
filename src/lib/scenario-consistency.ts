/**
 * Scenario-fact consistency scan (W5.6, design §7 continuous regression).
 *
 * The spine's facts are fixed for the whole exam. The cheapest high-signal
 * automated check: the examiner must never introduce a DIFFERENT tail number
 * than the scenario's aircraft. (Full fact-consistency is the owner's manual
 * checklist over the transcript dump; this catches the blatant drift.)
 */

const TAIL_RE = /\bN\d{1,5}[A-Z]{0,2}\b/g;

export function scanScenarioConsistency(
  scenarioAircraft: string,
  examinerTurns: string[]
): { consistent: boolean; foreignTailNumbers: string[] } {
  const allowed = new Set((scenarioAircraft.match(TAIL_RE) ?? []).map((t) => t.toUpperCase()));
  const foreign = new Set<string>();
  for (const turn of examinerTurns) {
    for (const tail of turn.match(TAIL_RE) ?? []) {
      if (!allowed.has(tail.toUpperCase())) foreign.add(tail.toUpperCase());
    }
  }
  return { consistent: foreign.size === 0, foreignTailNumbers: [...foreign] };
}
