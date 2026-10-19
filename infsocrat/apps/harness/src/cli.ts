/**
 * Manual test harness for @infsocrat/brain. Nothing here is mocked except
 * the ELM network call (H2 hints are shown as a labelled template
 * stand-in) — every other line is the real brain package: the same
 * situation detector, strategy engine, Pyodide sandbox, CodeExplain module,
 * calibration primitive and companion scheduler that the automated tests
 * exercise. Run with `pnpm harness` from the repo root.
 */
import { createInterface, type Interface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  exerciseBank,
  runStudentCode,
  detectSituation,
  shouldEscalate,
  chooseAdaptiveStep,
  initialFadingState,
  recordStrategySuccess,
  buildTraceQuestion,
  evaluateCodeExplain,
  recordPrediction,
  initialCompanionState,
  recordFollowUp,
  recordCheckIn,
  isCheckInDueToday,
  scheduleSpacedCheck,
  type Exercise,
  type FadingStateMap,
  type TestCase,
} from "@infsocrat/brain";

async function readCode(
  rl: Interface,
  label: string,
  starterCode: string,
  referenceSolution: string | undefined,
): Promise<string> {
  console.log(`\n${label}`);
  console.log("Paste Python code, then a line with just ~~~ to finish.");
  console.log(
    referenceSolution
      ? "Shortcuts: type STARTER alone to reuse the starter code unchanged, or SOLUTION alone to use the reference solution."
      : "Shortcut: type STARTER alone to reuse the starter code unchanged.",
  );

  const firstLine = await rl.question("> ");
  if (firstLine.trim() === "STARTER") return starterCode;
  if (referenceSolution && firstLine.trim() === "SOLUTION") return referenceSolution;

  const lines = [firstLine];
  while (true) {
    const line = await rl.question("");
    if (line.trim() === "~~~") break;
    lines.push(line);
  }
  return lines.join("\n") + "\n";
}

function hintText(exercise: Exercise, level: "H0" | "H1" | "H2" | "H3"): string {
  if (level === "H0") return exercise.hintTemplates.H0;
  if (level === "H1") return exercise.hintTemplates.H1;
  if (level === "H3") return exercise.hintTemplates.H3;
  return `(H2 — in the real app this calls ELM; shown here as a template stand-in) ${exercise.hintTemplates.H3}`;
}

interface AttemptLoopResult {
  finalCode: string;
  fadingState: FadingStateMap;
}

/** Runs the try-first -> adaptive-hint loop against one set of tests, reused for both the main exercise and the Independence Challenge variation. */
async function runAttemptLoop(
  rl: Interface,
  exercise: Exercise,
  functionName: string,
  tests: TestCase[],
  starterCode: string,
  referenceSolution: string | undefined,
  fadingState: FadingStateMap,
): Promise<AttemptLoopResult> {
  let hasAttempted = false;
  let sameErrorRepeatCount = 0;
  let lastErrorKey: string | undefined;
  let failedTriesOnStep = 0;

  while (true) {
    const code = await readCode(
      rl,
      hasAttempted ? "Your next attempt:" : "Your first attempt (or type STARTER to see the before-attempt path):",
      starterCode,
      referenceSolution,
    );
    const isUnchangedStarter = code.trim() === starterCode.trim();
    hasAttempted = hasAttempted || !isUnchangedStarter;

    if (!hasAttempted) {
      console.log(`\n[situation: before-attempt]\nHint (H0): ${exercise.hintTemplates.H0}`);
      continue;
    }

    console.log("\nRunning against the tests (via Pyodide)...");
    const result = await runStudentCode(code, functionName, tests);
    for (const r of result.results) {
      const test = tests.find((t) => t.description === r.description);
      console.log(
        `  ${r.passed ? "✅" : "❌"} ${r.description}` +
          (r.passed
            ? ""
            : ` — expected ${JSON.stringify(test?.expected)}, got ${JSON.stringify(r.actual)}${r.error ? `, error: ${r.error}` : ""}`),
      );
    }
    if (result.stderr) console.log(`  stderr: ${result.stderr}`);

    const errorKey = result.stderr ?? (result.passed ? undefined : JSON.stringify(result.results.filter((r) => !r.passed).map((r) => r.description)));
    sameErrorRepeatCount = errorKey && errorKey === lastErrorKey ? sameErrorRepeatCount + 1 : 0;
    lastErrorKey = errorKey;

    if (result.passed) {
      console.log("\n✅ All tests passed.");
      return { finalCode: code, fadingState: recordStrategySuccess(fadingState, "generation") };
    }

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

    console.log(
      `\n[situation: ${situation}] principle=${step.principle} hintLevel=${step.hintLevel} promptStyle=${step.promptStyle}` +
        (escalate ? " (loop-breaker escalated)" : ""),
    );
    console.log(`Hint: ${hintText(exercise, step.hintLevel)}`);
  }
}

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log("InfSocrat brain — manual test harness");
  console.log(
    "(Everything below is the real @infsocrat/brain package — only the ELM network call is stubbed, as a labelled template.)\n",
  );

  console.log("Exercises:");
  exerciseBank.forEach((ex, i) => console.log(`  ${i + 1}. ${ex.id} — ${ex.prompt}`));
  const choice = Number(await rl.question("\nPick an exercise number: "));
  const exercise = exerciseBank[choice - 1];
  if (!exercise) {
    console.log("Invalid choice.");
    rl.close();
    return;
  }

  console.log(`\n--- ${exercise.id} ---`);
  console.log(exercise.prompt);
  console.log("\nStarter code:\n" + exercise.starterCode);
  console.log(`(Concept: ${exercise.conceptLink.title} — ${exercise.conceptLink.note})`);

  let fadingState = initialFadingState();

  const mainResult = await runAttemptLoop(
    rl,
    exercise,
    exercise.functionName,
    exercise.tests,
    exercise.starterCode,
    exercise.referenceSolution,
    fadingState,
  );
  fadingState = mainResult.fadingState;

  // --- CodeExplain ---
  console.log("\n=== CodeExplain: predict before you run ===");
  console.log('Describe one change to your own code (e.g. "line 4: change `n > 0` to `n >= 0`"), then paste the mutated code.');
  const mutationDescription = await rl.question("Change description: ");
  const mutatedCode = await readCode(rl, "Paste your mutated code:", exercise.starterCode, undefined);
  const sampleInput = exercise.tests[0]?.input ?? [];
  const question = buildTraceQuestion(
    "post-solve-trace",
    exercise.functionName,
    { description: mutationDescription, mutatedCode },
    sampleInput,
  );
  console.log(`\n${question.prompt}`);
  const prediction = await rl.question("Your prediction: ");
  const outcome = await evaluateCodeExplain(question, prediction);
  console.log(
    outcome.matchesPrediction
      ? "✅ Matches!"
      : `❌ Doesn't match. Actual: ${JSON.stringify(outcome.actualValue ?? outcome.actualError)}`,
  );

  // --- Independence Challenge ---
  if (exercise.variations.length > 0) {
    console.log("\n=== Independence Challenge ===");
    exercise.variations.forEach((v, i) => console.log(`  ${i + 1}. ${v.id} — ${v.prompt} (${v.changesOneThing})`));
    const vChoice = Number(await rl.question("Pick a variation number: "));
    const variation = exercise.variations[vChoice - 1] ?? exercise.variations[0];

    const predicted = Number(
      await rl.question(`How many of the ${variation.tests.length} tests do you predict you'll pass (0-${variation.tests.length})? `),
    ) || 0;

    const challengeResult = await runAttemptLoop(
      rl,
      exercise,
      variation.functionName,
      variation.tests,
      variation.starterCode,
      undefined,
      fadingState,
    );
    fadingState = challengeResult.fadingState;

    const finalRun = await runStudentCode(challengeResult.finalCode, variation.functionName, variation.tests);
    const actualPassed = finalRun.results.filter((r) => r.passed).length;
    const calibration = recordPrediction(predicted, actualPassed, variation.tests.length);
    console.log(
      `\nCalibration: predicted ${predicted}/${variation.tests.length}, actually passed ${actualPassed}/${variation.tests.length}. ${calibration.feedback}`,
    );
  }

  // --- Companion check-in ---
  console.log("\n=== Companion check-in (plan / reflect) ===");
  let companionState = initialCompanionState();
  const plan = await rl.question("What's one thing you'll do today? ");
  console.log(`Saved plan: "${plan}"`);
  const didHappen = (await rl.question("(Simulating the next day) Did yesterday's plan happen? (y/n) "))
    .trim()
    .toLowerCase()
    .startsWith("y");
  companionState = recordFollowUp(companionState, didHappen);
  companionState = recordCheckIn(companionState, new Date().toISOString());
  console.log(`Companion stage: ${companionState.stage}, consecutive follow-throughs: ${companionState.consecutiveFollowThroughs}`);
  console.log(`Check-in due tomorrow? ${isCheckInDueToday(companionState, new Date(Date.now() + 86_400_000))}`);

  const schedule = scheduleSpacedCheck(exercise.topic, []);
  console.log(
    `\nSpaced independent check scheduled for ${new Date(schedule.dueDate).toDateString()}, mixing topics: ${schedule.topics.join(", ")}`,
  );

  console.log("\n=== Final fading state for this session ===");
  console.log(JSON.stringify(fadingState, null, 2));

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
