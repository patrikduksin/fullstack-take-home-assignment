import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    disableConsoleIntercept: true,
    fileParallelism: true,
    include: [
      "apps/*/test/*.integration.test.ts",
      "apps/*/test/browser.test.ts",
    ],
    maxWorkers: 2,
    sequence: { hooks: "list" },
    testTimeout: 60_000,
  },
});
