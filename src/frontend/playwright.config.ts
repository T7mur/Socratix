import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://localhost:3100",
    channel: process.env.PLAYWRIGHT_CHANNEL,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
  },
});
