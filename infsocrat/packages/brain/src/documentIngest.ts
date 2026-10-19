/**
 * Client-side text extraction from an uploaded PDF, via pdf.js. This module
 * only ever extracts raw text — it never interprets it. `elmClient.ts`'s
 * `extractQuestions` is what turns that text into structured questions.
 *
 * If a PDF has no real text layer (a scanned or photographed page),
 * `hasText` comes back false and the caller should fall back to
 * `elmClient.ts`'s vision-based `extractQuestionsFromImage` instead of
 * trusting empty/near-empty extracted text.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfjsModule = any;

let pdfjsModulePromise: Promise<PdfjsModule> | undefined;
let browserWorkerSrc: string | undefined;

/**
 * Call once, before `extractTextFromPdf`, when running inside the Chrome
 * extension (or any browser context): pass the extension's own vendored
 * copy of pdf.js's worker, e.g.
 * `initPdfWorker(chrome.runtime.getURL("vendor/pdfjs/pdf.worker.min.mjs"))`.
 * MV3 forbids remote code, same reason Pyodide's assets are vendored.
 * Node/Vitest never call this — they fall through to the auto-resolving
 * path below, the same split used by `pyodideRunner.ts`.
 */
export function initPdfWorker(workerSrc: string): void {
  browserWorkerSrc = workerSrc;
}

async function getPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs").then(async (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = browserWorkerSrc ?? (await resolveNodeWorkerSrc());
      return pdfjs;
    });
  }
  return pdfjsModulePromise;
}

/** Node/Vitest path only — mirrors pyodideRunner.ts's resolveNodeIndexURL. */
async function resolveNodeWorkerSrc(): Promise<string> {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  return require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
}

export interface ExtractResult {
  text: string;
  /**
   * False when extraction found ~no text — likely a scanned/photographed
   * page rather than a real text layer. The caller should not treat `text`
   * as reliable in that case.
   */
  hasText: boolean;
}

const MIN_TEXT_LENGTH = 20;

/**
 * Extracts all text from a PDF's pages, concatenated in reading order.
 * Never throws on a scanned/image-only PDF — returns `hasText: false`
 * instead, so the caller can fall back to a vision call.
 */
export async function extractTextFromPdf(data: Uint8Array | ArrayBuffer): Promise<ExtractResult> {
  const pdfjs = await getPdfjs();
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const doc = await pdfjs.getDocument({ data: bytes }).promise;

  const pageTexts: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: { str?: string }) => item.str ?? "")
      .join(" ");
    pageTexts.push(pageText);
    page.cleanup();
  }
  await doc.destroy();

  const text = pageTexts.join("\n\n").trim();
  return { text, hasText: text.length >= MIN_TEXT_LENGTH };
}
