import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";
import { chatgpt } from "e2e/oauth/chatgpt";

const url = process.env.APP_URL;

if (url === undefined || url === "") {
  throw new Error("Run pnpm test:e2e to start the Alchemy test stack.");
}

export default {
  agents: { default: { model: chatgpt("gpt-6-luna") } },
  retries: 0,
  targets: [{ app: { url }, engine: web(), name: "chromium" }],
  tests: "test/e2e/**/*.e2e.ts",
  trace: "retain-on-failure",
  workers: 1,
} satisfies E2EConfig;
