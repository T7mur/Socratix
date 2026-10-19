/**
 * Calibration: one "predict your score, then see the gap" primitive, reused
 * for the Independence Challenge, the spaced check, and CodeExplain, rather
 * than three separate confidence-rating implementations.
 */

export interface CalibrationResult {
  predictedScore: number;
  actualScore: number;
  maxScore: number;
  timestamp: string;
  gap: number;
  feedback: string;
}

export function recordPrediction(
  predictedScore: number,
  actualScore: number,
  maxScore: number,
  now: Date = new Date(),
): CalibrationResult {
  const gap = actualScore - predictedScore;
  return {
    predictedScore,
    actualScore,
    maxScore,
    timestamp: now.toISOString(),
    gap,
    feedback: calibrationFeedback(gap, maxScore),
  };
}

function calibrationFeedback(gap: number, maxScore: number): string {
  if (maxScore <= 0) return "No score to compare yet.";
  const magnitude = Math.abs(gap) / maxScore;
  if (magnitude < 0.1) {
    return "Your prediction was close — your sense of what you know is well calibrated.";
  }
  if (gap > 0) {
    return "You scored higher than you predicted — you may know more than you give yourself credit for.";
  }
  return "You scored lower than you predicted — that gap is worth noticing; it often means re-reading felt like knowing.";
}
