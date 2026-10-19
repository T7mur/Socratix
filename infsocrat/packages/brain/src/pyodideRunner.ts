/**
 * Runs a student's Python code safely, in-process, via Pyodide (Python
 * compiled to WASM). No backend, no subprocess: the code never leaves the
 * device. Tests decide pass/fail here — never the AI.
 *
 * KNOWN LIMITATION (documented in the plan): a true timeout needs to
 * *preempt* a running WASM call, which requires Pyodide's interrupt buffer,
 * only available when Pyodide runs in a Web Worker (the extension will do
 * this). In this Node-based package, `timeoutMs` only bounds the async
 * await between calls — a student's genuine infinite loop (e.g. `while
 * True: pass`) will still hang the call here. Exercise authors should avoid
 * constructs that can infinite-loop until the extension's worker-based
 * runner adds the interrupt buffer.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PyodideInterface = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PyProxy = any;

let pyodideSingleton: Promise<PyodideInterface> | null = null;

/**
 * Call once, before any other function in this module, when running inside
 * the Chrome extension (or any browser context): pass the extension's own
 * vendored copy of Pyodide's assets, e.g.
 * `initPyodide(chrome.runtime.getURL("vendor/pyodide/"))`. Node/Vitest never
 * call this — they fall through to the auto-resolving `getPyodide()` below.
 */
export function initPyodide(indexURL: string): Promise<PyodideInterface> {
  if (!pyodideSingleton) {
    pyodideSingleton = import("pyodide").then(({ loadPyodide }) => loadPyodide({ indexURL }));
  }
  return pyodideSingleton;
}

/**
 * Lazily loads and memoizes the single Pyodide runtime instance. If
 * `initPyodide` was already called (the extension path), reuses that same
 * singleton. Otherwise, resolves Pyodide's own package directory on disk —
 * this is the Node/Vitest path only; it imports `node:module`/`node:path`
 * dynamically so bundling this module for the browser never needs to
 * resolve those built-ins.
 *
 * The explicit path resolution (rather than letting Pyodide auto-detect its
 * own location) works around pnpm's symlinked node_modules: Pyodide's
 * built-in inference resolves to the symlink's *target* directory structure
 * instead of its own package root, so its asset files (python_stdlib.zip,
 * pyodide.asm.wasm, ...) silently fail to load. require.resolve sidesteps
 * that, and — unlike import.meta.resolve — also works under Vitest's SSR
 * transform.
 */
export function getPyodide(): Promise<PyodideInterface> {
  if (!pyodideSingleton) {
    pyodideSingleton = import("pyodide").then(async ({ loadPyodide }) => {
      const indexURL = await resolveNodeIndexURL();
      return loadPyodide({ indexURL });
    });
  }
  return pyodideSingleton;
}

async function resolveNodeIndexURL(): Promise<string> {
  const [{ createRequire }, path] = await Promise.all([import("node:module"), import("node:path")]);
  const require = createRequire(import.meta.url);
  const entryPath = require.resolve("pyodide/pyodide.mjs");
  return path.dirname(entryPath) + path.sep;
}

export class TimeoutError extends Error {
  constructor(message = "Execution timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

const DEFAULT_TIMEOUT_MS = 5_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export interface PySession {
  namespace: PyProxy;
}

/** Executes top-level student code (function/class defs) into a fresh, isolated namespace. */
export async function loadCode(code: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<PySession> {
  const pyodide = await getPyodide();
  const namespace = pyodide.globals.get("dict")();
  await withTimeout(pyodide.runPythonAsync(code, { globals: namespace }), timeoutMs);
  return { namespace };
}

function toJsValue(value: unknown): unknown {
  if (value && typeof (value as PyProxy).toJs === "function") {
    return (value as PyProxy).toJs({ dict_converter: Object.fromEntries });
  }
  return value;
}

/** Calls a top-level function defined by the student's code with JS args, returns a plain JS value. */
export async function callFunction(
  session: PySession,
  functionName: string,
  args: unknown[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  const fn = session.namespace.get(functionName);
  if (!fn) {
    throw new Error(`Function '${functionName}' is not defined in the submitted code`);
  }
  try {
    const result = await withTimeout(Promise.resolve(fn(...args)), timeoutMs);
    return toJsValue(result);
  } finally {
    fn.destroy?.();
  }
}

export function disposeSession(session: PySession): void {
  session.namespace.destroy();
}

export interface TestCase {
  description: string;
  input: unknown[];
  expected: unknown;
}

export interface TestOutcome {
  description: string;
  passed: boolean;
  actual?: unknown;
  error?: string;
}

export interface RunResult {
  passed: boolean;
  results: TestOutcome[];
  stderr?: string;
  timedOut: boolean;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Loads code once, then runs every test case against `functionName`, isolating failures per test. */
export async function runStudentCode(
  code: string,
  functionName: string,
  tests: TestCase[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<RunResult> {
  let session: PySession;
  try {
    session = await loadCode(code, timeoutMs);
  } catch (err) {
    return {
      passed: false,
      results: [],
      stderr: err instanceof Error ? err.message : String(err),
      timedOut: err instanceof TimeoutError,
    };
  }

  const results: TestOutcome[] = [];
  for (const test of tests) {
    try {
      const actual = await callFunction(session, functionName, test.input, timeoutMs);
      results.push({ description: test.description, passed: deepEqual(actual, test.expected), actual });
    } catch (err) {
      results.push({
        description: test.description,
        passed: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  disposeSession(session);

  return {
    passed: results.length > 0 && results.every((r) => r.passed),
    results,
    timedOut: false,
  };
}
