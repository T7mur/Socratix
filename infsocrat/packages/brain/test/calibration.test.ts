import { describe, expect, it } from "vitest";
import { recordPrediction } from "../src/calibration.js";

describe("recordPrediction", () => {
  it("computes a positive gap and encouraging feedback when the student undersold themselves", () => {
    const result = recordPrediction(3, 5, 5);
    expect(result.gap).toBe(2);
    expect(result.feedback).toMatch(/higher than you predicted/i);
  });

  it("computes a negative gap and a noticing message when the student oversold themselves", () => {
    const result = recordPrediction(5, 2, 5);
    expect(result.gap).toBe(-3);
    expect(result.feedback).toMatch(/lower than you predicted/i);
  });

  it("recognises a well-calibrated prediction", () => {
    const result = recordPrediction(4, 4, 5);
    expect(result.gap).toBe(0);
    expect(result.feedback).toMatch(/well calibrated/i);
  });
});
