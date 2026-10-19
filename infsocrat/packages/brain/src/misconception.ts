/**
 * Deterministic bucketing for the hint bank's cache key (see elmClient.ts's
 * getGuardedHint). Finite, stable per exercise, so repeat mistakes actually
 * reuse a cached hint instead of generating a fresh ELM call every attempt.
 */
export function deriveMisconceptionKey(stderr: string | undefined, failingTestDescriptions: string[]): string {
  if (stderr) {
    const exceptionType = stderr.trim().split(/[\s:]/)[0] || "error";
    return `error:${exceptionType}`;
  }
  if (failingTestDescriptions.length > 0) {
    return `fails:${[...failingTestDescriptions].sort().join(",")}`;
  }
  return "unknown";
}
