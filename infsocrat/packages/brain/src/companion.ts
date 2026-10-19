/**
 * Companion layer: the thin wrapper around the practice engine that adds the
 * daily plan/reflect loop and schedules spaced independent checks. This is
 * what turns Version A (practice tutor) into Version B (InfSocrat
 * Companion) without touching the practice engine itself.
 */

export type CompanionFadingStage = "daily" | "fewTimesAWeek" | "studentLed" | "graduated";

export interface PlanCheckIn {
  date: string; // ISO date, the day the plan is for
  planText: string;
}

export interface ReflectCheckIn {
  date: string; // ISO date, the day being reflected on
  studiedText: string;
  hardPart: string;
}

export interface PlanFollowUp {
  planDate: string;
  didHappen: boolean;
  note?: string;
}

export interface CompanionState {
  stage: CompanionFadingStage;
  consecutiveFollowThroughs: number;
  lastCheckInDate?: string; // ISO date
}

const STAGE_ORDER: CompanionFadingStage[] = ["daily", "fewTimesAWeek", "studentLed", "graduated"];

/** A week of good follow-through before the companion eases off the next stage. */
export const FOLLOW_THROUGH_THRESHOLD = 7;

export function initialCompanionState(): CompanionState {
  return { stage: "daily", consecutiveFollowThroughs: 0 };
}

function advanceCompanionStage(stage: CompanionFadingStage): CompanionFadingStage {
  const idx = STAGE_ORDER.indexOf(stage);
  return STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.length - 1)];
}

/** Call once per day's follow-up ("did yesterday's plan happen?"). */
export function recordFollowUp(state: CompanionState, didHappen: boolean): CompanionState {
  const consecutiveFollowThroughs = didHappen ? state.consecutiveFollowThroughs + 1 : 0;
  const shouldAdvance = consecutiveFollowThroughs > 0 && consecutiveFollowThroughs % FOLLOW_THROUGH_THRESHOLD === 0;
  return {
    ...state,
    consecutiveFollowThroughs: shouldAdvance ? 0 : consecutiveFollowThroughs,
    stage: shouldAdvance ? advanceCompanionStage(state.stage) : state.stage,
  };
}

export function recordCheckIn(state: CompanionState, date: string): CompanionState {
  return { ...state, lastCheckInDate: date };
}

const MS_PER_DAY = 86_400_000;

/**
 * Whether the companion should prompt a check-in today, given its current
 * fading stage. 'graduated' means the tool never initiates — the student is
 * fully self-led.
 */
export function isCheckInDueToday(state: CompanionState, today: Date = new Date()): boolean {
  if (state.stage === "graduated") return false;
  if (!state.lastCheckInDate) return true;

  const daysSince = Math.floor((today.getTime() - new Date(state.lastCheckInDate).getTime()) / MS_PER_DAY);
  if (state.stage === "daily") return daysSince >= 1;
  if (state.stage === "fewTimesAWeek") return daysSince >= 3;
  return daysSince >= 7; // studentLed
}

export interface SpacedCheckSchedule {
  dueDate: string; // ISO date, 2-3 days out
  topics: string[]; // interleaved: the topic just completed plus up to 2 earlier ones
}

/** Schedules the spaced, interleaved check described in InfSocrat 2.0 step 4. */
export function scheduleSpacedCheck(
  completedTopic: string,
  priorTopics: string[],
  completedOn: Date = new Date(),
): SpacedCheckSchedule {
  const dueDate = new Date(completedOn);
  dueDate.setDate(dueDate.getDate() + 2 + Math.round(Math.random())); // 2-3 days later

  const topics = Array.from(new Set([completedTopic, ...priorTopics.slice(-2)]));
  return { dueDate: dueDate.toISOString(), topics };
}
