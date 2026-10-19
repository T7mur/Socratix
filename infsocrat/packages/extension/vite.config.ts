import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname),
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup/index.html"),
        options: resolve(__dirname, "options/index.html"),
      },
      // These are only ever reached by brain's Node-only fallback path
      // (resolveNodeIndexURL in pyodideRunner.ts), which the extension never
      // calls — it always calls initPyodide() with its own vendored path.
      // Externalizing them just means Rollup doesn't need to resolve a
      // browser polyfill for a code path that never runs here.
      external: [/^node:/],
    },
  },
});
