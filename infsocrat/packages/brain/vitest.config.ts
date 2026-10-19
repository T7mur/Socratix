import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Pyodide downloads/initializes its WASM runtime on first use in pyodideRunner
    // and codeExplain tests; give those room instead of slowing down every test file.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
