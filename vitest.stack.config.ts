import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    disableConsoleIntercept: true,
    include: [
      "apps/*/test/*.integration.test.ts",
      "apps/*/test/browser.test.ts",
    ],
    sequence: { hooks: "list" },
    testTimeout: 60_000,
  },
});
