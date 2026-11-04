import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4175",
      url: "http://127.0.0.1:4175",
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SUPABASE_URL: "https://auth.example.invalid",
        VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      },
    },
    {
      command:
        "npm run build && npm run preview -- --host 127.0.0.1 --port 4177",
      url: "http://127.0.0.1:4177",
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: "security",
      testMatch: /security.spec.ts/,
      use: {
        baseURL: "http://127.0.0.1:4177",
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: "desktop",
      testIgnore: /auth.spec.ts|security.spec.ts/,
      use: { viewport: { width: 1440, height: 960 } },
    },
    {
      name: "mobile",
      testIgnore: /auth.spec.ts|security.spec.ts/,
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: "auth",
      testMatch: /auth.spec.ts/,
      use: {
        baseURL: "http://127.0.0.1:4175",
        viewport: { width: 1440, height: 960 },
      },
    },
  ],
});
