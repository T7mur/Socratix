import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkGuardrails,
  evaluateOpenAnswer,
  ExtractionError,
  extractQuestions,
  extractQuestionsFromImage,
  getGuardedHint,
  hintBankKey,
  InMemoryHintBank,
  isLowConfidence,
  testElmConnection,
  type ElmConfig,
  type GuardrailConfig,
  type HintContext,
  type HintReply,
} from "../src/elmClient.js";

const referenceSolution =
  "def count_positives(nums):\n    count = 0\n    for n in nums:\n        if n > 0:\n            count += 1\n    return count\n";

const guardrails: GuardrailConfig = {
  maxCodeLines: 2,
  referenceSolution,
  similarityThreshold: 0.6,
};

function reply(overrides: Partial<HintReply> = {}): HintReply {
  return { message: "What value should your counter start at before the loop begins?", cited: "", proposedLevel: "H2", ...overrides };
}

describe("checkGuardrails", () => {
  it("allows a short, conceptual hint with no code", () => {
    expect(checkGuardrails(reply(), guardrails)).toEqual({ allowed: true });
  });

  it("rejects a reply whose code block is longer than maxCodeLines", () => {
    const message = "```python\n" + referenceSolution + "```";
    expect(checkGuardrails(reply({ message }), guardrails)).toEqual({
      allowed: false,
      reason: "code-block-too-long",
    });
  });

  it("rejects a reply asking more than one question", () => {
    const message = "What does the loop do? What is a counter? Why does it matter?";
    expect(checkGuardrails(reply({ message }), guardrails)).toEqual({
      allowed: false,
      reason: "more-than-one-question",
    });
  });

  it("rejects a reply that is too textually similar to the reference solution, even without a code fence", () => {
    const message = "count = 0 for n in nums if n > 0 count += 1 return count";
    expect(checkGuardrails(reply({ message }), guardrails)).toEqual({
      allowed: false,
      reason: "too-similar-to-solution",
    });
  });
});

const config: ElmConfig = { baseUrl: "https://elm.example.edu/v1", apiKey: "test-key", model: "test-model" };

const ctx: HintContext = {
  exerciseId: "count-positives",
  exercisePrompt: "Count the positive numbers in a list.",
  situation: "understands-but-stuck",
  studentCode: "def count_positives(nums):\n    pass\n",
  runningSummary: "Student has not yet attempted a loop.",
};

function mockFetchJson(...bodies: unknown[]) {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const body = bodies[Math.min(call, bodies.length - 1)];
      call += 1;
      return { ok: true, status: 200, statusText: "OK", json: async () => body } as Response;
    }),
  );
}

function elmBody(content: unknown): unknown {
  return { choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getGuardedHint", () => {
  it("returns the ELM reply when it passes guardrails, and caches it in the hint bank", async () => {
    mockFetchJson(elmBody({ message: "Think about what your accumulator starts at.", cited: "lecture 3", proposed_level: "H2" }));

    const hintBank = new InMemoryHintBank();
    const result = await getGuardedHint({
      ctx,
      config,
      guardrails,
      hintBank,
      misconceptionKey: "no-attempt",
      templateFallback: "Have another go first.",
    });

    expect(result.source).toBe("elm");
    expect(hintBank.get(hintBankKey(ctx.exerciseId, "no-attempt"))).toBe(result.message);
  });

  it("serves repeat requests for the same misconception from the hint bank with no extra network call", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => elmBody({ message: "A short conceptual nudge.", cited: "", proposed_level: "H2" }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchSpy);

    const hintBank = new InMemoryHintBank();
    const opts = { ctx, config, guardrails, hintBank, misconceptionKey: "no-attempt", templateFallback: "fallback" };

    await getGuardedHint(opts);
    await getGuardedHint(opts);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("leak-rate check: falls back to the template, never leaks a full solution, even if the model tries on both attempts", async () => {
    const leakAttempt = elmBody({
      message: "Sure, here you go:\n```python\n" + referenceSolution + "```",
      cited: "",
      proposed_level: "H2",
    });
    // Simulate an uncooperative model that leaks the solution on the strict retry too.
    mockFetchJson(leakAttempt, leakAttempt);

    const hintBank = new InMemoryHintBank();
    const result = await getGuardedHint({
      ctx,
      config,
      guardrails,
      hintBank,
      misconceptionKey: "wants-answer",
      templateFallback: "Here's a nudge instead: what should your counter start at?",
    });

    expect(result.source).toBe("template");
    expect(result.message).not.toContain("count += 1");
  });

  it("falls back to the template on a network failure without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const result = await getGuardedHint({
      ctx,
      config,
      guardrails,
      hintBank: new InMemoryHintBank(),
      misconceptionKey: "no-attempt",
      templateFallback: "offline fallback hint",
    });

    expect(result).toEqual({ message: "offline fallback hint", source: "template" });
  });
});

describe("extractQuestions", () => {
  it("returns structured questions parsed from a valid JSON reply", async () => {
    mockFetchJson(
      elmBody([
        { prompt: "Write sum_list(nums).", type: "coding", functionSignature: "sum_list(nums)", tests: null, answer: null },
        { prompt: "What is Big-O notation?", type: "open", functionSignature: null, tests: null, answer: null },
      ]),
    );

    const result = await extractQuestions("1. Write sum_list(nums). 2. What is Big-O notation?", config);

    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]).toMatchObject({ prompt: "Write sum_list(nums).", type: "coding" });
    expect(result.questions[1]).toMatchObject({ type: "open" });
  });

  it("retries once with a stricter prompt on invalid JSON, then throws ExtractionError if it still fails", async () => {
    mockFetchJson(elmBody("not json at all"), elmBody("still not json"));
    await expect(extractQuestions("garbled text", config)).rejects.toBeInstanceOf(ExtractionError);
  });

  it("recovers if the strict retry returns valid JSON", async () => {
    mockFetchJson(elmBody("not json"), elmBody([{ prompt: "Define recursion.", type: "open", functionSignature: null, tests: null, answer: null }]));
    const result = await extractQuestions("some text", config);
    expect(result.questions).toHaveLength(1);
  });

  it("never shows raw unvalidated output: rejects an item missing required fields", async () => {
    mockFetchJson(elmBody([{ type: "coding" }]), elmBody([{ type: "coding" }]));
    await expect(extractQuestions("text", config)).rejects.toBeInstanceOf(ExtractionError);
  });
});

describe("extractQuestionsFromImage", () => {
  it("sends a vision content array and parses the structured result the same way", async () => {
    mockFetchJson(elmBody([{ prompt: "Write find_max(nums).", type: "coding", functionSignature: null, tests: null, answer: null }]));

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => elmBody([{ prompt: "Write find_max(nums).", type: "coding", functionSignature: null, tests: null, answer: null }]),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchSpy);

    const result = await extractQuestionsFromImage("base64data", "image/png", config);

    expect(result.questions).toEqual([{ prompt: "Write find_max(nums).", type: "coding", functionSignature: undefined, tests: undefined, answer: undefined }]);
    const requestBody = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(requestBody.messages[1].content[1]).toMatchObject({ type: "image_url" });
  });
});

describe("evaluateOpenAnswer", () => {
  it("returns a clamped, well-typed verdict", async () => {
    mockFetchJson(elmBody({ correct: true, confidence: 0.85, rationale: "Covers the key idea." }));
    const verdict = await evaluateOpenAnswer("What is Big-O notation?", "A measure of algorithm growth rate.", config);
    expect(verdict).toEqual({ correct: true, confidence: 0.85, rationale: "Covers the key idea." });
  });

  it("clamps an out-of-range confidence into [0,1]", async () => {
    mockFetchJson(elmBody({ correct: false, confidence: 1.5, rationale: "" }));
    const verdict = await evaluateOpenAnswer("Q", "A", config);
    expect(verdict.confidence).toBe(1);
  });

  it("flags low-confidence verdicts via isLowConfidence", async () => {
    mockFetchJson(elmBody({ correct: true, confidence: 0.3, rationale: "Ambiguous question." }));
    const verdict = await evaluateOpenAnswer("Q", "A", config);
    expect(isLowConfidence(verdict)).toBe(true);
  });

  it("does not flag a high-confidence verdict", async () => {
    mockFetchJson(elmBody({ correct: true, confidence: 0.9, rationale: "" }));
    const verdict = await evaluateOpenAnswer("Q", "A", config);
    expect(isLowConfidence(verdict)).toBe(false);
  });
});

describe("testElmConnection", () => {
  it("reports ok on a successful response", async () => {
    mockFetchJson(elmBody("OK"));
    expect(await testElmConnection(config)).toEqual({ ok: true, message: "Connected." });
  });

  it("reports the HTTP error on a non-ok response, without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, statusText: "Unauthorized", json: async () => ({}) })),
    );
    expect(await testElmConnection(config)).toEqual({ ok: false, message: "401 Unauthorized" });
  });

  it("reports a network failure message, without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    expect(await testElmConnection(config)).toEqual({ ok: false, message: "network down" });
  });
});
