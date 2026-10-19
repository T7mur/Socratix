/**
 * Situation detector: rules, not AI, decide what state a student's session is in.
 * This is the architectural boundary from the plan — ELM only ever words a hint
 * for a situation this module has already deterministically chosen.
 */

export type Situation =
  | "before-attempt"
  | "unfamiliar-concept"
  | "understands-but-stuck"
  | "repeated-mistake"
  | "solved"
  | "returns-after-days"
  | "repeated-success";

export interface SituationInput {
  /** Has the student made any attempt or written a one-line plan yet (fixed step 1)? */
  hasAttempted: boolean;
  /** Did the student's latest code pass every test for this exercise? */
  testsAllPass: boolean;
  /** Student explicitly signalled "I don't know this concept", or failed a quick concept check. */
  selfReportedUnfamiliar: boolean;
  /** How many times in a row the same test/error has failed. */
  sameErrorRepeatCount: number;
  /** Days since the student's last session (0 = same day). */
  daysSinceLastSession: number;
  /** Consecutive Independence Challenges passed with no hints requested. */
  consecutiveChallengesPassedWithoutHints: number;
}

/**
 * Order matters: each check below is a one-shot classification of "what is
 * going on right now", evaluated top to bottom against the situation table
 * from InfSocrat 2.0 (Adaptive Learning Friction).
 */
export function detectSituation(input: SituationInput): Situation {
  if (!input.hasAttempted) return "before-attempt";
  if (input.testsAllPass) return "solved";
  if (input.daysSinceLastSession >= 2) return "returns-after-days";
  if (input.selfReportedUnfamiliar) return "unfamiliar-concept";
  if (input.sameErrorRepeatCount >= 2) return "repeated-mistake";
  if (input.consecutiveChallengesPassedWithoutHints >= 3) return "repeated-success";
  return "understands-but-stuck";
}

/**
 * Loop breaker: two failed tries on the same step escalate the hint level
 * automatically, instead of leaving a frustrated student stuck in place.
 */
export function shouldEscalate(failedTriesOnCurrentStep: number): boolean {
  return failedTriesOnCurrentStep >= 2;
}
