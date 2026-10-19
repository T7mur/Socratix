import { describe, expect, it } from "vitest";
import { detectSituation, shouldEscalate, type SituationInput } from "../src/rules.js";

function baseInput(overrides: Partial<SituationInput> = {}): SituationInput {
  return {
    hasAttempted: true,
    testsAllPass: false,
    selfReportedUnfamiliar: false,
    sameErrorRepeatCount: 0,
    daysSinceLastSession: 0,
    consecutiveChallengesPassedWithoutHints: 0,
    ...overrides,
  };
}

describe("detectSituation", () => {
  it("returns before-attempt when the student hasn't tried yet, regardless of anything else", () => {
    expect(detectSituation(baseInput({ hasAttempted: false, testsAllPass: true }))).toBe("before-attempt");
  });

  it("returns solved when all tests pass", () => {
    expect(detectSituation(baseInput({ testsAllPass: true }))).toBe("solved");
  });

  it("returns returns-after-days when the student has been away, even over other signals", () => {
    expect(
      detectSituation(baseInput({ daysSinceLastSession: 3, selfReportedUnfamiliar: true })),
    ).toBe("returns-after-days");
  });

  it("returns unfamiliar-concept when self-reported and not away for days", () => {
    expect(detectSituation(baseInput({ selfReportedUnfamiliar: true }))).toBe("unfamiliar-concept");
  });

  it("returns repeated-mistake after the same error twice", () => {
    expect(detectSituation(baseInput({ sameErrorRepeatCount: 2 }))).toBe("repeated-mistake");
  });

  it("returns repeated-success after three independent challenge passes", () => {
    expect(
      detectSituation(baseInput({ consecutiveChallengesPassedWithoutHints: 3 })),
    ).toBe("repeated-success");
  });

  it("defaults to understands-but-stuck otherwise", () => {
    expect(detectSituation(baseInput())).toBe("understands-but-stuck");
  });
});

describe("shouldEscalate", () => {
  it("does not escalate on the first failed try", () => {
    expect(shouldEscalate(1)).toBe(false);
  });

  it("escalates after two failed tries on the same step", () => {
    expect(shouldEscalate(2)).toBe(true);
    expect(shouldEscalate(3)).toBe(true);
  });
});
