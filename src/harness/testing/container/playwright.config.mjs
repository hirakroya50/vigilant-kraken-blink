import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "/opt/gate/tests",
  outputDir: "/results/test-results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 30000,
  globalTimeout: 480000,
  reporter: [["list"], ["json", { outputFile: "/results/playwright.json" }]],
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: "node /opt/gate/serve.mjs", url: "http://127.0.0.1:4173", reuseExistingServer: false, timeout: 15000 },
});
