import { describe, expect, it } from "vitest";
import { exerciseBank } from "../src/exerciseBank.js";
import { runStudentCode } from "../src/pyodideRunner.js";

describe("exercise bank content sanity", () => {
  for (const exercise of exerciseBank) {
    it(`${exercise.id}: reference solution passes its own tests`, async () => {
      const result = await runStudentCode(exercise.referenceSolution, exercise.functionName, exercise.tests);
      expect(result.passed).toBe(true);
    });

    for (const variation of exercise.variations) {
      it(`${exercise.id} / ${variation.id}: has at least two tests and a stated rationale`, () => {
        expect(variation.tests.length).toBeGreaterThanOrEqual(2);
        expect(variation.changesOneThing.length).toBeGreaterThan(10);
      });
    }
  }

  it("every exercise has all three template hint levels and a concept link", () => {
    for (const exercise of exerciseBank) {
      expect(exercise.hintTemplates.H0).toBeTruthy();
      expect(exercise.hintTemplates.H1).toBeTruthy();
      expect(exercise.hintTemplates.H3).toBeTruthy();
      expect(exercise.conceptLink.title).toBeTruthy();
    }
  });
});
