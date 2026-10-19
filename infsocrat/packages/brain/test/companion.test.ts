import { describe, expect, it } from "vitest";
import {
  FOLLOW_THROUGH_THRESHOLD,
  initialCompanionState,
  isCheckInDueToday,
  recordCheckIn,
  recordFollowUp,
  scheduleSpacedCheck,
  type CompanionState,
} from "../src/companion.js";

describe("companion fading", () => {
  it("starts at the daily stage", () => {
    expect(initialCompanionState().stage).toBe("daily");
  });

  it("advances one stage after a full week of consecutive follow-through", () => {
    let state: CompanionState = initialCompanionState();
    for (let i = 0; i < FOLLOW_THROUGH_THRESHOLD - 1; i += 1) {
      state = recordFollowUp(state, true);
    }
    expect(state.stage).toBe("daily");

    state = recordFollowUp(state, true);
    expect(state.stage).toBe("fewTimesAWeek");
    expect(state.consecutiveFollowThroughs).toBe(0);
  });

  it("resets the streak (without regressing the stage) on a missed day", () => {
    let state: CompanionState = { stage: "fewTimesAWeek", consecutiveFollowThroughs: 4 };
    state = recordFollowUp(state, false);
    expect(state.consecutiveFollowThroughs).toBe(0);
    expect(state.stage).toBe("fewTimesAWeek");
  });

  it("caps at graduated", () => {
    let state: CompanionState = { stage: "graduated", consecutiveFollowThroughs: 0 };
    state = recordFollowUp(state, true);
    expect(state.stage).toBe("graduated");
  });
});

describe("isCheckInDueToday", () => {
  it("is due on day one, before any check-in has happened", () => {
    expect(isCheckInDueToday(initialCompanionState())).toBe(true);
  });

  it("is due again the next day while at the daily stage", () => {
    const state = recordCheckIn(initialCompanionState(), "2026-10-16T00:00:00.000Z");
    const tomorrow = new Date("2026-10-17T00:00:00.000Z");
    expect(isCheckInDueToday(state, tomorrow)).toBe(true);
  });

  it("is not due again later the same day at the daily stage", () => {
    const state = recordCheckIn(initialCompanionState(), "2026-10-16T08:00:00.000Z");
    const sameDayLater = new Date("2026-10-16T20:00:00.000Z");
    expect(isCheckInDueToday(state, sameDayLater)).toBe(false);
  });

  it("only becomes due every 3 days at the fewTimesAWeek stage", () => {
    const state = recordCheckIn(
      { stage: "fewTimesAWeek", consecutiveFollowThroughs: 0 },
      "2026-10-16T00:00:00.000Z",
    );
    expect(isCheckInDueToday(state, new Date("2026-10-18T00:00:00.000Z"))).toBe(false);
    expect(isCheckInDueToday(state, new Date("2026-10-19T00:00:00.000Z"))).toBe(true);
  });

  it("never initiates once graduated", () => {
    const state = { stage: "graduated" as const, consecutiveFollowThroughs: 0 };
    expect(isCheckInDueToday(state, new Date("2099-01-01"))).toBe(false);
  });
});

describe("scheduleSpacedCheck", () => {
  it("schedules 2-3 days out and mixes in up to two prior topics", () => {
    const completedOn = new Date("2026-10-16T00:00:00.000Z");
    const schedule = scheduleSpacedCheck("loops", ["variables", "conditionals", "functions"], completedOn);

    const dueDate = new Date(schedule.dueDate);
    const daysOut = Math.round((dueDate.getTime() - completedOn.getTime()) / 86_400_000);
    expect(daysOut).toBeGreaterThanOrEqual(2);
    expect(daysOut).toBeLessThanOrEqual(3);

    expect(schedule.topics).toContain("loops");
    expect(schedule.topics.length).toBeLessThanOrEqual(3);
    expect(schedule.topics).toEqual(expect.arrayContaining(["conditionals", "functions"]));
  });
});
