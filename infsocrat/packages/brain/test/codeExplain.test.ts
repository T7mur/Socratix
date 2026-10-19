import { describe, expect, it } from "vitest";
import { buildTraceQuestion, evaluateCodeExplain } from "../src/codeExplain.js";

const original = "def count_positives(nums):\n    count = 0\n    for n in nums:\n        if n > 0:\n            count += 1\n    return count\n";
const mutated = "def count_positives(nums):\n    count = 0\n    for n in nums:\n        if n >= 0:\n            count += 1\n    return count\n";

describe("CodeExplain (merged Trace-check / readiness-check)", () => {
  it("confirms a correct prediction after the mutated code actually runs", async () => {
    const question = buildTraceQuestion(
      "post-solve-trace",
      "count_positives",
      { description: "line 4: `if n > 0` becomes `if n >= 0`", mutatedCode: mutated },
      [[0, 1, -2]],
    );
    const outcome = await evaluateCodeExplain(question, "2");
    expect(outcome.actualValue).toBe(2);
    expect(outcome.matchesPrediction).toBe(true);
  });

  it("flags a mismatch when the prediction is wrong, without ever revealing it was wrong before running", async () => {
    const question = buildTraceQuestion(
      "pre-submit-readiness",
      "count_positives",
      { description: "line 4: `if n > 0` becomes `if n >= 0`", mutatedCode: mutated },
      [[0, 1, -2]],
    );
    const outcome = await evaluateCodeExplain(question, "1"); // forgets zero now counts
    expect(outcome.actualValue).toBe(2);
    expect(outcome.matchesPrediction).toBe(false);
  });

  it("surfaces a runtime error on the mutated code instead of crashing the caller", async () => {
    const question = buildTraceQuestion(
      "post-solve-trace",
      "count_positives",
      { description: "broken mutation", mutatedCode: "def count_positives(nums):\n    return 1 / 0\n" },
      [[1]],
    );
    const outcome = await evaluateCodeExplain(question, "anything");
    expect(outcome.matchesPrediction).toBe(false);
    expect(outcome.actualError).toBeTruthy();
  });
});
