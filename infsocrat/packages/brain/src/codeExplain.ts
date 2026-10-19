/**
 * CodeExplain: the single "predict what your own code does" module. The
 * docs described this as three near-identical mechanisms (Trace check,
 * "Am I ready to submit?", self-explanation) — this is the one module that
 * serves both trigger points. No timer, no lock, never marked, never leaves
 * the device: it just runs the student's own (mutated) code and compares
 * the real result to their prediction.
 */
import { loadCode, callFunction, disposeSession, type PySession } from "./pyodideRunner.js";

export type CodeExplainTrigger = "post-solve-trace" | "pre-submit-readiness";

export interface LineMutation {
  /** Human-readable description of what changed, e.g. "line 3: `if n > 0` becomes `if n >= 0`". */
  description: string;
  /** The student's own code with that one change applied. */
  mutatedCode: string;
}

export interface CodeExplainQuestion {
  trigger: CodeExplainTrigger;
  mutation: LineMutation;
  functionName: string;
  input: unknown[];
  prompt: string;
}

export interface CodeExplainOutcome {
  question: CodeExplainQuestion;
  predictedAnswer: string;
  actualValue?: unknown;
  actualError?: string;
  matchesPrediction: boolean;
}

export function buildTraceQuestion(
  trigger: CodeExplainTrigger,
  functionName: string,
  mutation: LineMutation,
  input: unknown[],
): CodeExplainQuestion {
  const argsLiteral = input.map((v) => JSON.stringify(v)).join(", ");
  return {
    trigger,
    mutation,
    functionName,
    input,
    prompt: `Predict first, then we'll run it: ${mutation.description}. What will \`${functionName}(${argsLiteral})\` return now?`,
  };
}

function normalize(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Runs the mutated code for real and checks it against the student's own prediction. */
export async function evaluateCodeExplain(
  question: CodeExplainQuestion,
  predictedAnswer: string,
): Promise<CodeExplainOutcome> {
  let session: PySession | undefined;
  try {
    session = await loadCode(question.mutation.mutatedCode);
    const actualValue = await callFunction(session, question.functionName, question.input);
    return {
      question,
      predictedAnswer,
      actualValue,
      matchesPrediction: normalize(predictedAnswer) === normalize(String(actualValue)),
    };
  } catch (err) {
    return {
      question,
      predictedAnswer,
      actualError: err instanceof Error ? err.message : String(err),
      matchesPrediction: false,
    };
  } finally {
    if (session) disposeSession(session);
  }
}
