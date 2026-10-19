import { createRequire } from "node:module";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(__dirname, "..");
const distDir = path.join(extensionRoot, "dist");

async function main() {
  await copyFile(path.join(extensionRoot, "manifest.json"), path.join(distDir, "manifest.json"));

  // Vendor Pyodide's runtime assets into the extension itself: Manifest V3
  // forbids loading remotely hosted code, so these can't come from a CDN.
  const pyodideDir = path.dirname(require.resolve("pyodide/pyodide.mjs"));
  const vendorDir = path.join(distDir, "vendor", "pyodide");
  await mkdir(vendorDir, { recursive: true });

  const assets = ["pyodide.mjs", "pyodide.asm.js", "pyodide.asm.wasm", "pyodide-lock.json", "python_stdlib.zip"];
  await Promise.all(assets.map((asset) => copyFile(path.join(pyodideDir, asset), path.join(vendorDir, asset))));

  // Same reason as Pyodide above: MV3 forbids remote code, so pdf.js's
  // worker must ship inside the extension rather than being fetched.
  const pdfjsLegacyDir = path.dirname(require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"));
  const pdfjsVendorDir = path.join(distDir, "vendor", "pdfjs");
  await mkdir(pdfjsVendorDir, { recursive: true });
  await copyFile(path.join(pdfjsLegacyDir, "pdf.worker.mjs"), path.join(pdfjsVendorDir, "pdf.worker.mjs"));

  console.log(`Copied manifest.json, ${assets.length} Pyodide assets, and the pdf.js worker into dist/.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
