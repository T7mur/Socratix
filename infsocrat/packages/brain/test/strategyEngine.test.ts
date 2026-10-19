import { describe, expect, it } from "vitest";
import {
  chooseAdaptiveStep,
  initialFadingState,
  recordStrategyLapse,
  recordStrategySuccess,
  STAGE_ADVANCE_THRESHOLD,
  type FadingStateMap,
} from "../src/strategyEngine.js";

describe("chooseAdaptiveStep", () => {
  it("maps each situation to its documented principle and hint level, guided by default", () => {
    const empty = initialFadingState();
    expect(chooseAdaptiveStep("before-attempt", empty)).toMatchObject({
      principle: "generation",
      hintLevel: "H0",
      promptStyle: "name-the-strategy",
      suppressPrompt: false,
    });
    expect(chooseAdaptiveStep("unfamiliar-concept", empty)).toMatchObject({
      principle: "elaboration",
      hintLevel: "H1",
    });
    expect(chooseAdaptiveStep("understands-but-stuck", empty)).toMatchObject({
      principle: "generation",
      hintLevel: "H2",
    });
    expect(chooseAdaptiveStep("repeated-mistake", empty)).toMatchObject({
      principle: "interleaving",
      hintLevel: "H2",
    });
    expect(chooseAdaptiveStep("solved", empty)).toMatchObject({
      principle: "variedPractice",
      hintLevel: "H0",
    });
    expect(chooseAdaptiveStep("returns-after-days", empty)).toMatchObject({
      principle: "retrieval",
      hintLevel: "H1",
    });
    expect(chooseAdaptiveStep("repeated-success", empty)).toMatchObject({
      principle: "fading",
      hintLevel: "H0",
    });
  });

  it("escalates the hint level by one step when the loop breaker fires", () => {
    const step = chooseAdaptiveStep("understands-but-stuck", initialFadingState(), true);
    expect(step.hintLevel).toBe("H3"); // H2 -> H3
  });

  it("never escalates past H3", () => {
    const step = chooseAdaptiveStep("solved", initialFadingState(), true); // base H0 -> H1
    expect(step.hintLevel).toBe("H1");
  });

  it("suppresses the prompt once the matching strategy has faded to independent/withoutTool", () => {
    let state: FadingStateMap = initialFadingState();
    for (let i = 0; i < STAGE_ADVANCE_THRESHOLD; i += 1) {
      state = recordStrategySuccess(state, "generation"); // guided -> prompted
    }
    for (let i = 0; i < STAGE_ADVANCE_THRESHOLD; i += 1) {
      state = recordStrategySuccess(state, "generation"); // prompted -> independent
    }

    const step = chooseAdaptiveStep("understands-but-stuck", state);
    expect(step.promptStyle).toBe("minimal");
    expect(step.suppressPrompt).toBe(true);
  });
});

describe("recordStrategySuccess / recordStrategyLapse", () => {
  it("advances a stage only after STAGE_ADVANCE_THRESHOLD consecutive successes", () => {
    let state: FadingStateMap = initialFadingState();
    for (let i = 0; i < STAGE_ADVANCE_THRESHOLD - 1; i += 1) {
      state = recordStrategySuccess(state, "retrieval");
    }
    expect(state.retrieval?.stage).toBe("guided");

    state = recordStrategySuccess(state, "retrieval");
    expect(state.retrieval?.stage).toBe("prompted");
    expect(state.retrieval?.streak).toBe(0);
  });

  it("never regresses the stage on a lapse, only resets the streak", () => {
    let state: FadingStateMap = initialFadingState();
    for (let i = 0; i < STAGE_ADVANCE_THRESHOLD; i += 1) {
      state = recordStrategySuccess(state, "elaboration");
    }
    expect(state.elaboration?.stage).toBe("prompted");

    state = recordStrategyLapse(state, "elaboration");
    expect(state.elaboration?.stage).toBe("prompted");
    expect(state.elaboration?.streak).toBe(0);
  });

  it("caps at withoutTool and does not go further", () => {
    let state: FadingStateMap = initialFadingState();
    for (let stage = 0; stage < 4; stage += 1) {
      for (let i = 0; i < STAGE_ADVANCE_THRESHOLD; i += 1) {
        state = recordStrategySuccess(state, "spacing");
      }
    }
    expect(state.spacing?.stage).toBe("withoutTool");
  });
});
