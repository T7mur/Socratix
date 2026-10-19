import type { Situation } from "./rules.js";

/**
 * The Make It Stick strategies InfSocrat actively teaches. ("Varied practice"
 * and "fading" are treated as strategies in their own right because they get
 * their own row in the Adaptive Learning Friction table and their own fading
 * state, same as the others.)
 */
export type StrategyName =
  | "elaboration"
  | "generation"
  | "interleaving"
  | "variedPractice"
  | "retrieval"
  | "spacing"
  | "fading";

export type HintLevel = "H0" | "H1" | "H2" | "H3";

/**
 * Each strategy fades through four stages independently, per the fading
 * diagram: the tool prompts it and names it, then just asks which strategy
 * applies, then only checks while the student drives, then stops entirely.
 */
export type FadingStage = "guided" | "prompted" | "independent" | "withoutTool";

export interface StrategyFadingState {
  stage: FadingStage;
  /** Consecutive independent successes at the current stage, towards promotion. */
  streak: number;
}

export type FadingStateMap = Partial<Record<StrategyName, StrategyFadingState>>;

/** A student moves on when they show the habit, not after a fixed number of weeks. */
export const STAGE_ADVANCE_THRESHOLD = 3;

const STAGE_ORDER: FadingStage[] = ["guided", "prompted", "independent", "withoutTool"];

export function initialFadingState(): FadingStateMap {
  return {};
}

function getStrategyState(state: FadingStateMap, strategy: StrategyName): StrategyFadingState {
  return state[strategy] ?? { stage: "guided", streak: 0 };
}

/**
 * Call when the student successfully used `strategy` without needing a
 * guided/prompted nudge for it. After STAGE_ADVANCE_THRESHOLD in a row, the
 * strategy is promoted to the next fading stage and the streak resets.
 */
export function recordStrategySuccess(state: FadingStateMap, strategy: StrategyName): FadingStateMap {
  const current = getStrategyState(state, strategy);
  const streak = current.streak + 1;

  if (streak >= STAGE_ADVANCE_THRESHOLD) {
    return { ...state, [strategy]: { stage: advanceStage(current.stage), streak: 0 } };
  }
  return { ...state, [strategy]: { stage: current.stage, streak } };
}

/** A lapse resets the streak (but never regresses the stage already earned). */
export function recordStrategyLapse(state: FadingStateMap, strategy: StrategyName): FadingStateMap {
  const current = getStrategyState(state, strategy);
  return { ...state, [strategy]: { stage: current.stage, streak: 0 } };
}

function advanceStage(stage: FadingStage): FadingStage {
  const idx = STAGE_ORDER.indexOf(stage);
  return STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.length - 1)];
}

const SITUATION_PRINCIPLE: Record<Situation, StrategyName> = {
  "before-attempt": "generation",
  "unfamiliar-concept": "elaboration",
  "understands-but-stuck": "generation",
  "repeated-mistake": "interleaving",
  solved: "variedPractice",
  "returns-after-days": "retrieval",
  "repeated-success": "fading",
};

const SITUATION_HINT_LEVEL: Record<Situation, HintLevel> = {
  "before-attempt": "H0",
  "unfamiliar-concept": "H1",
  "understands-but-stuck": "H2",
  "repeated-mistake": "H2",
  solved: "H0",
  "returns-after-days": "H1",
  "repeated-success": "H0",
};

const HINT_LEVEL_ORDER: HintLevel[] = ["H0", "H1", "H2", "H3"];

function escalateHintLevel(level: HintLevel): HintLevel {
  const idx = HINT_LEVEL_ORDER.indexOf(level);
  return HINT_LEVEL_ORDER[Math.min(idx + 1, HINT_LEVEL_ORDER.length - 1)];
}

export interface AdaptiveStep {
  situation: Situation;
  principle: StrategyName;
  hintLevel: HintLevel;
  /**
   * How much the tool should say about *why* it's doing this, driven by how
   * far this strategy has faded for this student:
   *  - name-the-strategy: tool prompts it and names it ("this is called retrieval")
   *  - ask-which-strategy: tool asks the student to choose, doesn't tell them
   *  - minimal: tool only checks; no strategy talk at all
   */
  promptStyle: "name-the-strategy" | "ask-which-strategy" | "minimal";
  /** True once this strategy has faded to 'independent' or 'withoutTool' for this student. */
  suppressPrompt: boolean;
}

/**
 * The single decision point the rest of the app calls: given the detected
 * situation and the student's current fading state, decide which strategy to
 * invoke, at what hint level, and how much to say about it. `escalate` comes
 * from rules.shouldEscalate (the loop breaker).
 */
export function chooseAdaptiveStep(
  situation: Situation,
  fadingState: FadingStateMap,
  escalate = false,
): AdaptiveStep {
  const principle = SITUATION_PRINCIPLE[situation];
  const strategyState = getStrategyState(fadingState, principle);
  const hintLevel = escalate ? escalateHintLevel(SITUATION_HINT_LEVEL[situation]) : SITUATION_HINT_LEVEL[situation];

  const promptStyle: AdaptiveStep["promptStyle"] =
    strategyState.stage === "guided"
      ? "name-the-strategy"
      : strategyState.stage === "prompted"
        ? "ask-which-strategy"
        : "minimal";

  const suppressPrompt = strategyState.stage === "independent" || strategyState.stage === "withoutTool";

  return { situation, principle, hintLevel, promptStyle, suppressPrompt };
}
