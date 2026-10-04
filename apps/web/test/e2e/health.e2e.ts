import { expect } from "e2e";

import { test } from "./browser-ready.js";

// @effect-diagnostics-next-line asyncFunction:off -- The e2e runner requires a Promise callback for browser fixtures.
test("hydrates the health client and queries D1 again after reload", async ({
  app,
  agent,
  browser,
  screen,
}) => {
  await app.open("/health");
  await expect(screen.getByText("Backend ok. Database ready.")).toBeVisible();

  if (process.env.E2E_AGENT_ASSERTIONS !== "0") {
    await agent.assert(
      "The page reports a successful backend connection and a ready database, with no connection error visible."
    );
  }

  await browser.reload();
  await expect(screen.getByText("Backend ok. Database ready.")).toBeVisible();
});
