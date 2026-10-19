/**
 * The only module allowed to call out to ELM. Hard boundary: ELM only ever
 * *words* an H2 hint or an "explain-my-error" reply for a situation the
 * rules engine already decided — it never decides pass/fail, flow, or
 * fading, and it is never allowed to hand back a full solution.
 */
import type { HintLevel } from "./strategyEngine.js";

export type { HintLevel };

export interface ElmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface HintContext {
  exerciseId: string;
  exercisePrompt: string;
  situation: string;
  studentCode: string;
  /** 2-3 line running summary of the session so far — never the full chat history. */
  runningSummary: string;
}

export interface HintReply {
  message: string;
  cited: string;
  proposedLevel: HintLevel;
}

const BASE_SYSTEM_PROMPT = `You are InfSocrat, a Socratic programming tutor for first-year Informatics students at the University of Edinburgh.
Rules you must never break:
- Never provide a full working solution or a complete corrected version of the student's code.
- Include at most one short code snippet (max 2 lines), only if essential to illustrate a concept.
- Ask at most one guiding question.
- Keep your reply under 60 words.
- Base your hint only on the exercise and the running summary given to you; do not invent facts.
Respond ONLY as compact JSON: {"message": string, "cited": string, "proposed_level": "H0"|"H1"|"H2"|"H3"}`;

const STRICT_RETRY_ADDENDUM =
  "\nYour previous reply was rejected for containing too much code or being too close to a full solution. This time, give only a short conceptual nudge and no code at all.";

async function requestHint(ctx: HintContext, config: ElmConfig, strict = false): Promise<HintReply> {
  const systemPrompt = strict ? BASE_SYSTEM_PROMPT + STRICT_RETRY_ADDENDUM : BASE_SYSTEM_PROMPT;

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 150,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            `EXERCISE: ${ctx.exercisePrompt}\n` +
            `SITUATION: ${ctx.situation}\n` +
            `RUNNING SUMMARY: ${ctx.runningSummary}\n` +
            `<student_code>\n${ctx.studentCode}\n</student_code>`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`ELM request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return parseHintReply(data.choices[0]?.message.content ?? "{}");
}

function parseHintReply(raw: string): HintReply {
  try {
    const parsed = JSON.parse(raw);
    const level = parsed.proposed_level;
    return {
      message: String(parsed.message ?? ""),
      cited: String(parsed.cited ?? ""),
      proposedLevel: level === "H0" || level === "H1" || level === "H2" || level === "H3" ? level : "H2",
    };
  } catch {
    // Model didn't return clean JSON — treat the raw text as the message so
    // guardrails still get a chance to inspect it, rather than crashing.
    return { message: raw.slice(0, 300), cited: "", proposedLevel: "H2" };
  }
}

// --- Guardrails ---------------------------------------------------------

export interface GuardrailConfig {
  /** Reject if any code block in the reply is longer than this many lines. */
  maxCodeLines: number;
  referenceSolution: string;
  /** 0-1 token-overlap ratio against the reference solution; above this, reject. */
  similarityThreshold: number;
}

export interface GuardrailVerdict {
  allowed: boolean;
  reason?: "code-block-too-long" | "more-than-one-question" | "too-similar-to-solution";
}

export function checkGuardrails(reply: HintReply, config: GuardrailConfig): GuardrailVerdict {
  const codeBlocks = extractCodeBlocks(reply.message);
  const longestBlockLines = codeBlocks.reduce((max, block) => Math.max(max, block.split("\n").length), 0);
  if (longestBlockLines > config.maxCodeLines) {
    return { allowed: false, reason: "code-block-too-long" };
  }

  const questionCount = (reply.message.match(/\?/g) ?? []).length;
  if (questionCount > 1) {
    return { allowed: false, reason: "more-than-one-question" };
  }

  if (tokenOverlapRatio(reply.message, config.referenceSolution) > config.similarityThreshold) {
    return { allowed: false, reason: "too-similar-to-solution" };
  }

  return { allowed: true };
}

function extractCodeBlocks(text: string): string[] {
  return [...text.matchAll(/```[\w]*\n([\s\S]*?)```/g)].map((m) => m[1]);
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 2);
}

/** Jaccard-style overlap of the reply's tokens against the solution's tokens. */
function tokenOverlapRatio(reply: string, solution: string): number {
  const solutionTokens = new Set(tokenize(solution));
  if (solutionTokens.size === 0) return 0;

  const replyTokens = new Set(tokenize(reply));
  let shared = 0;
  for (const token of solutionTokens) {
    if (replyTokens.has(token)) shared += 1;
  }
  return shared / solutionTokens.size;
}

// --- Hint bank (cache) ---------------------------------------------------

export interface HintBank {
  get(key: string): string | undefined;
  set(key: string, message: string): void;
}

export class InMemoryHintBank implements HintBank {
  private bank = new Map<string, string>();
  get(key: string): string | undefined {
    return this.bank.get(key);
  }
  set(key: string, message: string): void {
    this.bank.set(key, message);
  }
}

export function hintBankKey(exerciseId: string, misconceptionKey: string): string {
  return `${exerciseId}::${misconceptionKey}`;
}

// --- Orchestration: bank -> ELM (with guardrails + one strict retry) -> template fallback

export interface GetGuardedHintOptions {
  ctx: HintContext;
  config: ElmConfig;
  guardrails: GuardrailConfig;
  hintBank: HintBank;
  misconceptionKey: string;
  templateFallback: string;
}

export type HintSource = "bank" | "elm" | "template";

export async function getGuardedHint(opts: GetGuardedHintOptions): Promise<{ message: string; source: HintSource }> {
  const key = hintBankKey(opts.ctx.exerciseId, opts.misconceptionKey);
  const cached = opts.hintBank.get(key);
  if (cached) return { message: cached, source: "bank" };

  for (const strict of [false, true]) {
    try {
      const reply = await requestHint(opts.ctx, opts.config, strict);
      const verdict = checkGuardrails(reply, opts.guardrails);
      if (verdict.allowed) {
        opts.hintBank.set(key, reply.message);
        return { message: reply.message, source: "elm" };
      }
    } catch {
      break; // network/API failure: skip straight to the template, don't burn the retry
    }
  }

  return { message: opts.templateFallback, source: "template" };
}

// --- Uploaded-content extraction & open-answer grading ------------------
//
// Two new call sites, both outside the hint-ladder's hard boundary: here ELM
// is trusted to extract structured content from arbitrary uploads and to
// judge correctness for non-coding answers, because there is no deterministic
// alternative for that content. Keep this contained to exactly these two
// functions — nothing else in the brain should let AI decide correctness.

export interface UploadedQuestion {
  prompt: string;
  type: "coding" | "open";
  functionSignature?: string;
  tests?: Array<{ description: string; input: unknown[]; expected: unknown }>;
  /** The source material's own answer/model-solution, if the upload included one. */
  answer?: string;
}

export interface ExtractQuestionsResult {
  questions: UploadedQuestion[];
}

export class ExtractionError extends Error {
  constructor(message = "Could not read structured questions from this file") {
    super(message);
    this.name = "ExtractionError";
  }
}

const EXTRACTION_SYSTEM_PROMPT = `You extract exercise/past-paper questions from raw text for a first-year Informatics course.
Return ONLY a JSON array, no prose, matching exactly:
[{"prompt": string, "type": "coding"|"open", "functionSignature": string|null, "tests": [{"description": string, "input": any[], "expected": any}]|null, "answer": string|null}]
Rules:
- "coding" is for programming questions; "open" is for conceptual/short-answer questions.
- Only fill "tests" if the source text itself gives concrete example inputs/outputs — never invent test cases.
- Only fill "answer" if the source text itself states or clearly implies the correct answer — never invent one.
- If nothing resembling a question is found, return [].`;

const STRICT_JSON_ADDENDUM = "\nYour previous reply was not valid JSON matching the schema. Reply with ONLY the JSON array this time, nothing else.";

function parseExtractedQuestions(raw: string): ExtractQuestionsResult {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("not an array");

  const questions: UploadedQuestion[] = parsed.map((item) => {
    if (typeof item.prompt !== "string" || (item.type !== "coding" && item.type !== "open")) {
      throw new Error("item missing required fields");
    }
    return {
      prompt: item.prompt,
      type: item.type,
      functionSignature: typeof item.functionSignature === "string" ? item.functionSignature : undefined,
      tests: Array.isArray(item.tests) ? item.tests : undefined,
      answer: typeof item.answer === "string" ? item.answer : undefined,
    };
  });
  return { questions };
}

async function requestExtraction(
  userContent: string | Array<Record<string, unknown>>,
  config: ElmConfig,
  strict: boolean,
): Promise<ExtractQuestionsResult> {
  const systemPrompt = strict ? EXTRACTION_SYSTEM_PROMPT + STRICT_JSON_ADDENDUM : EXTRACTION_SYSTEM_PROMPT;

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 2000,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) throw new Error(`ELM request failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return parseExtractedQuestions(data.choices[0]?.message.content ?? "[]");
}

/** Turns raw text (from `documentIngest.ts`'s PDF extraction) into structured questions. */
export async function extractQuestions(rawText: string, config: ElmConfig): Promise<ExtractQuestionsResult> {
  for (const strict of [false, true]) {
    try {
      return await requestExtraction(rawText, config, strict);
    } catch (err) {
      if (strict) throw err instanceof Error ? new ExtractionError(err.message) : new ExtractionError();
    }
  }
  throw new ExtractionError();
}

/**
 * Same as `extractQuestions`, but for a scanned/photographed page with no
 * extractable text layer — sent as a vision input instead. Only works if
 * the configured ELM model is vision-capable; a failure here should surface
 * as "try a text-based PDF instead", not a silent fallback.
 */
export async function extractQuestionsFromImage(
  imageBase64: string,
  mimeType: string,
  config: ElmConfig,
): Promise<ExtractQuestionsResult> {
  const userContent = [
    { type: "text", text: "Extract the questions from this image." },
    { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
  ];
  for (const strict of [false, true]) {
    try {
      return await requestExtraction(userContent, config, strict);
    } catch (err) {
      if (strict) throw err instanceof Error ? new ExtractionError(err.message) : new ExtractionError();
    }
  }
  throw new ExtractionError();
}

export interface OpenAnswerVerdict {
  correct: boolean;
  /** 0-1. Below LOW_CONFIDENCE_THRESHOLD, render as "likely X, worth double-checking", not a flat verdict. */
  confidence: number;
  rationale: string;
}

/** Tune once real test runs show false-positive/negative rates (see plan's open items). */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

export function isLowConfidence(verdict: OpenAnswerVerdict): boolean {
  return verdict.confidence < LOW_CONFIDENCE_THRESHOLD;
}

const GRADING_SYSTEM_PROMPT = `You grade a first-year Informatics student's answer to a conceptual/open question.
Return ONLY compact JSON: {"correct": boolean, "confidence": number (0-1), "rationale": string}
Rules:
- Be a fair but accurate grader; partial/vague answers that miss the key idea are not correct.
- "confidence" reflects your own certainty given the question and any reference answer provided — lower it when the question is ambiguous or you lack a clear reference.
- "rationale" is at most 2 sentences, for internal use, not necessarily shown verbatim to the student.`;

/** A throwaway, minimal request used by the extension's options page to confirm a key/model/base URL actually works. */
export async function testElmConnection(config: ElmConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 5,
        messages: [{ role: "user", content: "Reply with OK." }],
      }),
    });
    if (!res.ok) return { ok: false, message: `${res.status} ${res.statusText}` };
    return { ok: true, message: "Connected." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Grades an open/conceptual answer. This is the one place in the brain
 * where AI decides correctness rather than code — see the module header.
 * A low-confidence result must not be treated as a reliable pass: callers
 * should not advance fading state on it (see strategyEngine.ts usage).
 */
export async function evaluateOpenAnswer(
  question: string,
  studentAnswer: string,
  config: ElmConfig,
  referenceAnswer?: string,
): Promise<OpenAnswerVerdict> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 300,
      temperature: 0,
      messages: [
        { role: "system", content: GRADING_SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `QUESTION: ${question}\n` +
            `${referenceAnswer ? `REFERENCE ANSWER: ${referenceAnswer}\n` : ""}` +
            `STUDENT ANSWER: ${studentAnswer}`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`ELM request failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const parsed = JSON.parse(data.choices[0]?.message.content ?? "{}");
  return {
    correct: Boolean(parsed.correct),
    confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
  };
}
