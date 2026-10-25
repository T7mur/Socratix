import { describe, expect, it } from "vitest";
import { passwordError, safeNext } from "@/lib/auth/validation";

describe("authentication boundaries", () => {
  it.each([
    "https://attacker.invalid",
    "//attacker.invalid",
    "/review/../evil",
    "javascript:alert(1)",
    null,
  ])("rejects unsafe next value %s", (value) => {
    expect(safeNext(value)).toBe("/account");
  });
  it("preserves allowed recovery destination", () =>
    expect(safeNext("/reset-password")).toBe("/reset-password"));
  it("requires matching long passwords", () => {
    expect(passwordError("short", "short")).toContain("12");
    expect(passwordError("long-password-here", "different-password")).toContain(
      "match",
    );
    expect(
      passwordError("long-password-here", "long-password-here"),
    ).toBeNull();
  });
});
