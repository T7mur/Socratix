import { describe, expect, it } from "vitest";
import { runStudentCode } from "../src/pyodideRunner.js";

const countPositives = "def count_positives(nums):\n    count = 0\n    for n in nums:\n        if n > 0:\n            count += 1\n    return count\n";

describe("runStudentCode", () => {
  it("passes correct code against its tests", async () => {
    const result = await runStudentCode(countPositives, "count_positives", [
      { description: "mixed", input: [[1, -2, 3]], expected: 2 },
      { description: "empty", input: [[]], expected: 0 },
    ]);
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.passed)).toBe(true);
  });

  it("fails buggy code on the test it gets wrong, without crashing the others", async () => {
    const buggy = "def count_positives(nums):\n    count = 0\n    for n in nums:\n        if n >= 0:\n            count += 1\n    return count\n"; // off-by-one on zero
    const result = await runStudentCode(buggy, "count_positives", [
      { description: "no zero", input: [[1, -2, 3]], expected: 2 },
      { description: "has zero", input: [[0, 1]], expected: 1 },
    ]);
    expect(result.passed).toBe(false);
    expect(result.results[0].passed).toBe(true);
    expect(result.results[1].passed).toBe(false);
    expect(result.results[1].actual).toBe(2);
  });

  it("reports a syntax error as a failed, non-crashing result", async () => {
    const result = await runStudentCode("def count_positives(nums)\n    pass\n", "count_positives", [
      { description: "n/a", input: [[1]], expected: 1 },
    ]);
    expect(result.passed).toBe(false);
    expect(result.stderr).toBeTruthy();
  });

  it("reports a missing function as a failed, non-crashing result", async () => {
    const result = await runStudentCode("x = 1\n", "count_positives", [{ description: "n/a", input: [[1]], expected: 1 }]);
    expect(result.passed).toBe(false);
    expect(result.results[0].error).toMatch(/not defined/);
  });
});
