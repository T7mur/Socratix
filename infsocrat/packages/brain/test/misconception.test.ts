import { describe, expect, it } from "vitest";
import { deriveMisconceptionKey } from "../src/misconception.js";

describe("deriveMisconceptionKey", () => {
  it("buckets on the exception type when there's a runtime error", () => {
    expect(deriveMisconceptionKey("TypeError: unsupported operand type(s)", [])).toBe("error:TypeError");
  });

  it("buckets on the sorted set of failing test descriptions for a logical failure", () => {
    expect(deriveMisconceptionKey(undefined, ["all negative", "mixed list"])).toBe("fails:all negative,mixed list");
  });

  it("is stable regardless of failing-test order", () => {
    expect(deriveMisconceptionKey(undefined, ["b", "a"])).toBe(deriveMisconceptionKey(undefined, ["a", "b"]));
  });

  it("falls back to 'unknown' when there's neither an error nor a failing test", () => {
    expect(deriveMisconceptionKey(undefined, [])).toBe("unknown");
  });
});
