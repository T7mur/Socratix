import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractTextFromPdf } from "../src/documentIngest.js";

const fixturePath = fileURLToPath(new URL("./fixtures/sample.pdf", import.meta.url));

describe("extractTextFromPdf", () => {
  it("extracts the text layer from a real PDF", async () => {
    const bytes = readFileSync(fixturePath);
    const result = await extractTextFromPdf(new Uint8Array(bytes));

    expect(result.hasText).toBe(true);
    expect(result.text).toContain("Hello InfSocrat test PDF");
  });

  it("reports hasText: false for a PDF with (near-)no extractable text, instead of throwing", async () => {
    const emptyPagePdf =
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\ntrailer\n<< /Size 4 /Root 1 0 R >>\n%%EOF";
    const bytes = new TextEncoder().encode(emptyPagePdf);

    const result = await extractTextFromPdf(bytes);
    expect(result.hasText).toBe(false);
    expect(result.text).toBe("");
  });
});
