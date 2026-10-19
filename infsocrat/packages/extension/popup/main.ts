/**
 * Popup UI: a thin client over @infsocrat/brain. Three tabs:
 *  - Practice: the curated exerciseBank loop (try-first -> hint -> tests -> Independence Challenge).
 *  - Upload: past-paper/exercise upload -> ELM-structured questions -> either the same
 *    practice loop (if the source gave tests) or a new ELM-graded open-answer flow.
 *  - Walk through code: CodeExplain on code the student already has, no question attached.
 * State lives only in this popup's memory for now (MV3 popups reset on close).
 */
import {
  initPyodide,
  initPdfWorker,
  extractTextFromPdf,
  exerciseBank,
  runStudentCode,
  detectSituation,
  shouldEscalate,
  chooseAdaptiveStep,
  initialFadingState,
  recordStrategySuccess,
  deriveMisconceptionKey,
  getGuardedHint,
  InMemoryHintBank,
  extractQuestions,
  extractQuestionsFromImage,
  evaluateOpenAnswer,
  isLowConfidence,
  buildTraceQuestion,
  evaluateCodeExplain,
  type Exercise,
  type FadingStateMap,
  type HintLevel,
  type RunResult,
  type TestCase,
  type ElmConfig,
  type UploadedQuestion,
} from "@infsocrat/brain";
import { ChromeStorage } from "../src/chromeStorage.js";
import { ELM_CONFIG_KEY } from "../src/storageKeys.js";

const storage = new ChromeStorage();
const hintBank = new InMemoryHintBank();
let elmConfig: ElmConfig | null = null;

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id} in popup/index.html`);
  return found as T;
}

const els = {
  status: el<HTMLDivElement>("status"),
  tabPractice: el<HTMLButtonElement>("tab-practice"),
  tabUpload: el<HTMLButtonElement>("tab-upload"),
  tabWalkthrough: el<HTMLButtonElement>("tab-walkthrough"),
  practiceView: el<HTMLDivElement>("practice-view"),
  uploadView: el<HTMLDivElement>("upload-view"),
  walkthroughView: el<HTMLDivElement>("walkthrough-view"),

  exerciseSelect: el<HTMLSelectElement>("exercise-select"),
  prompt: el<HTMLParagraphElement>("prompt"),
  concept: el<HTMLParagraphElement>("concept"),
  code: el<HTMLTextAreaElement>("code"),
  runButton: el<HTMLButtonElement>("run-button"),
  results: el<HTMLDivElement>("results"),
  hint: el<HTMLDivElement>("hint"),
  challengeSection: el<HTMLDivElement>("challenge-section"),
  variationSelect: el<HTMLSelectElement>("variation-select"),
  challengePrompt: el<HTMLParagraphElement>("challenge-prompt"),
  challengeCode: el<HTMLTextAreaElement>("challenge-code"),
  challengeRunButton: el<HTMLButtonElement>("challenge-run-button"),
  challengeResults: el<HTMLDivElement>("challenge-results"),

  uploadFile: el<HTMLInputElement>("upload-file"),
  analyzeButton: el<HTMLButtonElement>("analyze-button"),
  uploadStatus: el<HTMLDivElement>("upload-status"),
  extractedList: el<HTMLDivElement>("extracted-list"),
  openAnswerView: el<HTMLDivElement>("open-answer-view"),
  openPrompt: el<HTMLParagraphElement>("open-prompt"),
  openAnswer: el<HTMLTextAreaElement>("open-answer"),
  openCheckButton: el<HTMLButtonElement>("open-check-button"),
  openResult: el<HTMLDivElement>("open-result"),
  openHint: el<HTMLDivElement>("open-hint"),

  wtCode: el<HTMLTextAreaElement>("wt-code"),
  wtFunctionName: el<HTMLInputElement>("wt-function-name"),
  wtArgs: el<HTMLInputElement>("wt-args"),
  wtAskButton: el<HTMLButtonElement>("wt-ask-button"),
  wtPredictSection: el<HTMLDivElement>("wt-predict-section"),
  wtPrediction: el<HTMLTextAreaElement>("wt-prediction"),
  wtRevealButton: el<HTMLButtonElement>("wt-reveal-button"),
  wtResult: el<HTMLDivElement>("wt-result"),
};

// --- Tabs -----------------------------------------------------------------

type Tab = "practice" | "upload" | "walkthrough";

function showTab(tab: Tab): void {
  els.practiceView.hidden = tab !== "practice";
  els.uploadView.hidden = tab !== "upload";
  els.walkthroughView.hidden = tab !== "walkthrough";
  els.tabPractice.setAttribute("aria-selected", String(tab === "practice"));
  els.tabUpload.setAttribute("aria-selected", String(tab === "upload"));
  els.tabWalkthrough.setAttribute("aria-selected", String(tab === "walkthrough"));
}

els.tabPractice.addEventListener("click", () => showTab("practice"));
els.tabUpload.addEventListener("click", () => showTab("upload"));
els.tabWalkthrough.addEventListener("click", () => showTab("walkthrough"));

// --- Practice loop (curated exerciseBank) ---------------------------------

let currentExercise: Exercise = exerciseBank[0];
let fadingState: FadingStateMap = initialFadingState();
let hasAttempted = false;
let sameErrorRepeatCount = 0;
let lastErrorKey: string | undefined;
let failedTriesOnStep = 0;

function populateExerciseSelect(): void {
  els.exerciseSelect.innerHTML = "";
  exerciseBank.forEach((ex, i) => {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = ex.id;
    els.exerciseSelect.appendChild(option);
  });
}

function loadExercise(exercise: Exercise): void {
  currentExercise = exercise;
  fadingState = initialFadingState();
  hasAttempted = false;
  sameErrorRepeatCount = 0;
  lastErrorKey = undefined;
  failedTriesOnStep = 0;

  els.prompt.textContent = exercise.prompt;
  els.concept.textContent = `Concept: ${exercise.conceptLink.title} — ${exercise.conceptLink.note}`;
  els.code.value = exercise.starterCode;
  els.results.innerHTML = "";
  els.hint.innerHTML = "";
  els.challengeSection.hidden = true;
}

function renderResults(container: HTMLElement, result: RunResult, tests: TestCase[]): void {
  container.innerHTML = "";
  for (const r of result.results) {
    const test = tests.find((t) => t.description === r.description);
    const line = document.createElement("div");
    line.className = r.passed ? "pass" : "fail";
    line.textContent = r.passed
      ? `✅ ${r.description}`
      : `❌ ${r.description} — expected ${JSON.stringify(test?.expected)}, got ${JSON.stringify(r.actual)}${
          r.error ? `, error: ${r.error}` : ""
        }`;
    container.appendChild(line);
  }
  if (result.stderr) {
    const err = document.createElement("div");
    err.className = "fail";
    err.textContent = `stderr: ${result.stderr}`;
    container.appendChild(err);
  }
}

/** H0/H1/H3 render from templates; only H2 calls ELM, through the hint bank + guardrails. */
async function hintText(
  exercise: { hintTemplates: { H0: string; H1: string; H3: string } },
  level: HintLevel,
  ctx: { exerciseId: string; exercisePrompt: string; situation: string; studentCode: string; misconceptionKey: string; referenceSolution: string },
): Promise<string> {
  if (level === "H0") return exercise.hintTemplates.H0;
  if (level === "H1") return exercise.hintTemplates.H1;
  if (level === "H3") return exercise.hintTemplates.H3;

  if (!elmConfig) return `(No ELM key configured — Settings) ${exercise.hintTemplates.H3}`;

  const result = await getGuardedHint({
    ctx: {
      exerciseId: ctx.exerciseId,
      exercisePrompt: ctx.exercisePrompt,
      situation: ctx.situation,
      studentCode: ctx.studentCode,
      runningSummary: `Hint level H2 requested; situation=${ctx.situation}.`,
    },
    config: elmConfig,
    guardrails: { maxCodeLines: 2, referenceSolution: ctx.referenceSolution, similarityThreshold: 0.6 },
    hintBank,
    misconceptionKey: ctx.misconceptionKey,
    templateFallback: exercise.hintTemplates.H3,
  });
  return result.message;
}

async function handleRun(): Promise<void> {
  const code = els.code.value;
  const isUnchangedStarter = code.trim() === currentExercise.starterCode.trim();
  hasAttempted = hasAttempted || !isUnchangedStarter;

  els.hint.innerHTML = "";

  if (!hasAttempted) {
    els.hint.innerHTML = `<div class="meta">[before-attempt]</div><div>${currentExercise.hintTemplates.H0}</div>`;
    return;
  }

  els.runButton.disabled = true;
  els.status.textContent = "Running your code…";

  try {
    const result = await runStudentCode(code, currentExercise.functionName, currentExercise.tests);
    renderResults(els.results, result, currentExercise.tests);

    const failingDescriptions = result.results.filter((r) => !r.passed).map((r) => r.description);
    const errorKey = result.stderr ?? JSON.stringify(failingDescriptions);
    sameErrorRepeatCount = errorKey === lastErrorKey ? sameErrorRepeatCount + 1 : 0;
    lastErrorKey = errorKey;

    if (result.passed) {
      fadingState = recordStrategySuccess(fadingState, "generation");
      els.hint.innerHTML = `<strong>✅ Solved.</strong> Try the Independence Challenge below.`;
      showChallenge();
    } else {
      failedTriesOnStep += 1;
      const escalate = shouldEscalate(failedTriesOnStep);
      const situation = detectSituation({
        hasAttempted: true,
        testsAllPass: false,
        selfReportedUnfamiliar: false,
        sameErrorRepeatCount,
        daysSinceLastSession: 0,
        consecutiveChallengesPassedWithoutHints: 0,
      });
      const step = chooseAdaptiveStep(situation, fadingState, escalate);
      const misconceptionKey = deriveMisconceptionKey(result.stderr, failingDescriptions);
      els.status.textContent = "Thinking of a hint…";
      const text = await hintText(currentExercise, step.hintLevel, {
        exerciseId: currentExercise.id,
        exercisePrompt: currentExercise.prompt,
        situation,
        studentCode: code,
        misconceptionKey,
        referenceSolution: currentExercise.referenceSolution,
      });
      els.hint.innerHTML =
        `<div class="meta">[${situation}] principle=${step.principle} hintLevel=${step.hintLevel}${escalate ? " (loop-breaker escalated)" : ""}</div>` +
        `<div>${text}</div>`;
    }
  } finally {
    els.runButton.disabled = false;
    els.status.textContent = "Ready";
  }
}

function showChallenge(): void {
  if (currentExercise.variations.length === 0) {
    els.challengeSection.hidden = true;
    return;
  }
  els.challengeSection.hidden = false;
  els.variationSelect.innerHTML = "";
  currentExercise.variations.forEach((v, i) => {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = `${v.id} — ${v.changesOneThing}`;
    els.variationSelect.appendChild(option);
  });
  loadVariation(0);
}

function loadVariation(index: number): void {
  const variation = currentExercise.variations[index];
  if (!variation) return;
  els.challengePrompt.textContent = variation.prompt;
  els.challengeCode.value = variation.starterCode;
  els.challengeResults.innerHTML = "";
}

async function handleChallengeRun(): Promise<void> {
  const variation = currentExercise.variations[Number(els.variationSelect.value)];
  if (!variation) return;

  els.challengeRunButton.disabled = true;
  try {
    const result = await runStudentCode(els.challengeCode.value, variation.functionName, variation.tests);
    renderResults(els.challengeResults, result, variation.tests);
    if (result.passed) {
      fadingState = recordStrategySuccess(fadingState, "variedPractice");
    }
  } finally {
    els.challengeRunButton.disabled = false;
  }
}

// --- Upload: past papers / exercise sheets ---------------------------------

const GENERIC_TEMPLATES = {
  H0: "Have a go first — what's your plan before you write any code?",
  H1: "Try breaking the question into the smallest sub-step you're sure about, and start there.",
  H3: "Look again at exactly what the question is asking for — which part are you unsure how to start?",
};

let lastExtracted: UploadedQuestion[] = [];
let currentUploadedQuestion: UploadedQuestion | null = null;
let uploadedHasAttempted = false;
let uploadedFailedTries = 0;
let uploadedSameErrorRepeatCount = 0;
let uploadedLastErrorKey: string | undefined;

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function handleAnalyze(): Promise<void> {
  const file = els.uploadFile.files?.[0];
  if (!file) {
    els.uploadStatus.textContent = "Choose a file first.";
    return;
  }
  if (!elmConfig) {
    els.uploadStatus.textContent = "Set your ELM key in Settings first (right-click the extension icon).";
    return;
  }

  els.analyzeButton.disabled = true;
  els.uploadStatus.textContent = "Reading file…";
  try {
    let questions: UploadedQuestion[];

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const buf = await file.arrayBuffer();
      const extracted = await extractTextFromPdf(new Uint8Array(buf));
      if (extracted.hasText) {
        els.uploadStatus.textContent = "Extracting questions from text…";
        questions = (await extractQuestions(extracted.text, elmConfig)).questions;
      } else {
        els.uploadStatus.textContent = "No text layer found — asking ELM to read it as an image…";
        const base64 = await fileToBase64(file);
        questions = (await extractQuestionsFromImage(base64, "application/pdf", elmConfig)).questions;
      }
    } else {
      els.uploadStatus.textContent = "Asking ELM to read the image…";
      const base64 = await fileToBase64(file);
      questions = (await extractQuestionsFromImage(base64, file.type || "image/png", elmConfig)).questions;
    }

    lastExtracted = questions;
    renderExtractedList(questions);
    els.uploadStatus.textContent = questions.length > 0 ? `Found ${questions.length} question(s).` : "No questions found in this file.";
  } catch (err) {
    els.uploadStatus.textContent = `Couldn't read this file: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    els.analyzeButton.disabled = false;
  }
}

function renderExtractedList(questions: UploadedQuestion[]): void {
  els.extractedList.innerHTML = "";
  questions.forEach((q, i) => {
    const button = document.createElement("button");
    const hasTests = q.type === "coding" && (q.tests?.length ?? 0) > 0;
    button.innerHTML = `<span class="badge">${q.type}${hasTests ? "" : q.type === "coding" ? " · AI-graded" : ""}</span>${q.prompt}`;
    button.addEventListener("click", () => selectUploadedQuestion(i));
    els.extractedList.appendChild(button);
  });
}

function selectUploadedQuestion(index: number): void {
  const q = lastExtracted[index];
  if (!q) return;

  const hasTests = q.type === "coding" && (q.tests?.length ?? 0) > 0;
  if (hasTests && q.tests) {
    const adHoc: Exercise = {
      id: `uploaded-${index}`,
      topic: "uploaded",
      prompt: q.prompt,
      functionName: guessFunctionName(q),
      starterCode: `def ${guessFunctionName(q)}(...):\n    # your code here\n    pass\n`,
      referenceSolution: q.answer ?? "",
      tests: q.tests as TestCase[],
      conceptLink: { title: "Uploaded question", note: "From your uploaded file." },
      variations: [],
      hintTemplates: GENERIC_TEMPLATES,
    };
    loadExercise(adHoc);
    showTab("practice");
    return;
  }

  currentUploadedQuestion = q;
  uploadedHasAttempted = false;
  uploadedFailedTries = 0;
  uploadedSameErrorRepeatCount = 0;
  uploadedLastErrorKey = undefined;
  els.openPrompt.textContent = q.type === "coding" ? `${q.prompt} (no tests found — graded by ELM, may be wrong)` : q.prompt;
  els.openAnswer.value = "";
  els.openResult.innerHTML = "";
  els.openHint.innerHTML = "";
  els.openAnswerView.hidden = false;
}

function guessFunctionName(q: UploadedQuestion): string {
  const match = q.functionSignature?.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
  return match?.[1] ?? "solution";
}

async function handleOpenCheck(): Promise<void> {
  if (!currentUploadedQuestion || !elmConfig) return;
  const answer = els.openAnswer.value.trim();
  uploadedHasAttempted = uploadedHasAttempted || answer.length > 0;
  els.openHint.innerHTML = "";

  if (!uploadedHasAttempted) {
    els.openHint.innerHTML = `<div class="meta">[before-attempt]</div><div>${GENERIC_TEMPLATES.H0}</div>`;
    return;
  }

  els.openCheckButton.disabled = true;
  els.openResult.textContent = "Checking…";
  try {
    const verdict = await evaluateOpenAnswer(currentUploadedQuestion.prompt, answer, elmConfig, currentUploadedQuestion.answer);
    const low = isLowConfidence(verdict);

    els.openResult.innerHTML = low
      ? `<div class="low-confidence">🤔 Likely ${verdict.correct ? "correct" : "incorrect"} — worth double-checking (low confidence).</div>`
      : verdict.correct
        ? `<div class="pass">✅ Correct.</div>`
        : `<div class="fail">❌ Not quite.</div>`;

    const errorKey = `${verdict.correct}`;
    uploadedSameErrorRepeatCount = errorKey === uploadedLastErrorKey && !verdict.correct ? uploadedSameErrorRepeatCount + 1 : 0;
    uploadedLastErrorKey = errorKey;

    if (verdict.correct && !low) {
      fadingState = recordStrategySuccess(fadingState, "generation");
      return;
    }
    if (verdict.correct && low) return; // don't give a "wrong-answer" hint for a correct-but-uncertain verdict

    uploadedFailedTries += 1;
    const escalate = shouldEscalate(uploadedFailedTries);
    const situation = detectSituation({
      hasAttempted: true,
      testsAllPass: false,
      selfReportedUnfamiliar: false,
      sameErrorRepeatCount: uploadedSameErrorRepeatCount,
      daysSinceLastSession: 0,
      consecutiveChallengesPassedWithoutHints: 0,
    });
    const step = chooseAdaptiveStep(situation, fadingState, escalate);
    const text = await hintText(
      { hintTemplates: GENERIC_TEMPLATES },
      step.hintLevel,
      {
        exerciseId: "uploaded-open",
        exercisePrompt: currentUploadedQuestion.prompt,
        situation,
        studentCode: answer,
        misconceptionKey: "open-answer",
        referenceSolution: currentUploadedQuestion.answer ?? "",
      },
    );
    els.openHint.innerHTML =
      `<div class="meta">[${situation}] principle=${step.principle} hintLevel=${step.hintLevel}</div><div>${text}</div>`;
  } finally {
    els.openCheckButton.disabled = false;
  }
}

// --- Walk through code (CodeExplain, no question attached) ----------------

function parseArgs(raw: string): unknown[] {
  if (!raw.trim()) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

let wtQuestion: ReturnType<typeof buildTraceQuestion> | null = null;

function handleWtAsk(): void {
  try {
    const args = parseArgs(els.wtArgs.value);
    wtQuestion = buildTraceQuestion(
      "pre-submit-readiness",
      els.wtFunctionName.value.trim(),
      { description: "Walking through your code as-is", mutatedCode: els.wtCode.value },
      args,
    );
    els.wtResult.innerHTML = "";
    els.wtPrediction.value = "";
    els.wtPredictSection.hidden = false;
  } catch (err) {
    els.wtResult.innerHTML = `<div class="fail">Couldn't parse arguments as JSON: ${err instanceof Error ? err.message : String(err)}</div>`;
  }
}

async function handleWtReveal(): Promise<void> {
  if (!wtQuestion) return;
  els.wtRevealButton.disabled = true;
  try {
    const outcome = await evaluateCodeExplain(wtQuestion, els.wtPrediction.value);
    els.wtResult.innerHTML = outcome.actualError
      ? `<div class="fail">Error running your code: ${outcome.actualError}</div>`
      : `<div class="${outcome.matchesPrediction ? "pass" : "fail"}">
           ${outcome.matchesPrediction ? "✅ Matched your prediction." : "❌ Didn't match."}
           Actual: ${JSON.stringify(outcome.actualValue)}
         </div>`;
  } finally {
    els.wtRevealButton.disabled = false;
  }
}

// --- Startup ----------------------------------------------------------------

async function main(): Promise<void> {
  populateExerciseSelect();
  loadExercise(exerciseBank[0]);

  els.status.textContent = "Loading…";
  initPdfWorker(chrome.runtime.getURL("vendor/pdfjs/pdf.worker.mjs"));
  elmConfig = await storage.get<ElmConfig>(ELM_CONFIG_KEY);
  await initPyodide(chrome.runtime.getURL("vendor/pyodide/"));
  els.status.textContent = elmConfig ? "Ready" : "Ready (no ELM key set — H2 hints use a template fallback)";

  els.exerciseSelect.addEventListener("change", () => {
    loadExercise(exerciseBank[Number(els.exerciseSelect.value)]);
  });
  els.runButton.addEventListener("click", () => void handleRun());
  els.variationSelect.addEventListener("change", () => loadVariation(Number(els.variationSelect.value)));
  els.challengeRunButton.addEventListener("click", () => void handleChallengeRun());

  els.analyzeButton.addEventListener("click", () => void handleAnalyze());
  els.openCheckButton.addEventListener("click", () => void handleOpenCheck());

  els.wtAskButton.addEventListener("click", () => handleWtAsk());
  els.wtRevealButton.addEventListener("click", () => void handleWtReveal());
}

main().catch((err) => {
  console.error(err);
  els.status.textContent = `Error: ${String(err)}`;
});
