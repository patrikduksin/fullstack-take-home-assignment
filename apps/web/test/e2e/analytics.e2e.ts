import { expect } from "e2e";

import { test } from "./browser-ready.js";

const original = process.env.ANALYTICS_TEST_V1;

const next = process.env.ANALYTICS_TEST_V2;

if (original === undefined || next === undefined) {
  throw new Error(
    "Run pnpm test:e2e to seed the real analytics browser fixture."
  );
}

// @effect-diagnostics-next-line asyncFunction:off -- The e2e runner requires a Promise callback for browser fixtures.
test("filters version and variant comparisons and explains eligible and empty denominators", async ({
  app,
  browser,
  screen,
}) => {
  await browser.setViewport({ height: 1800, width: 1280 });
  await app.open("/internal/analytics?campaign=dashboard-fixture");
  await expect(screen.getByRole("heading", "Funnel analytics")).toBeVisible();
  const starts = screen.getByRole("region", "Started sessions");
  const reach = screen.getByRole("region", "Result reach");
  const ctr = screen.getByRole("region", "CTA CTR");
  await expect(starts.getByText("3")).toBeVisible();
  await expect(reach.getByText("2 / 3 started sessions")).toBeVisible();
  await expect(ctr.getByText("1 / 2 result viewers")).toBeVisible();
  const comparisons = screen.getByRole("region", "Variant comparison");
  await expect(comparisons.getByText(original)).toBeVisible();
  await expect(comparisons.getByText(next)).toBeVisible();
  await app.screenshot("analytics-version-separated-summary");
  await screen.getByLabel("Variant").selectOption({ value: "A" });
  await expect(starts.getByText("2")).toBeVisible();
  await expect(reach.getByText("1 / 2 started sessions")).toBeVisible();
  await expect(ctr.getByText("1 / 1 result viewers")).toBeVisible();
  await app.screenshot("analytics-variant-a");
  await screen.getByLabel("Variant").selectOption({ value: "B" });
  await expect(starts.getByText("1")).toBeVisible();
  await expect(ctr.getByText("0 / 1 result viewers")).toBeVisible();
  await screen.getByLabel("Variant").selectOption({ value: "" });
  await expect(starts.getByText("3")).toBeVisible();
  await screen.getByLabel("Version").selectOption({ value: original });
  await expect(starts.getByText("2")).toBeVisible();
  await screen.getByText(`${original} · Variant A · dashboard-fixture`).tap();
  await expect(
    screen.getByRole("table", "Step conversion").getByText("50% (1 / 2)")
  ).toBeVisible();
  await expect(screen.getByRole("table", "Eligible transitions")).toContainText(
    "Skipped steps add no eligible sessions."
  );
  await expect(
    screen
      .getByRole("group", `${original} · Variant A · dashboard-fixture`)
      .getByText(
        "Result screens have no completed transition; use result reach and CTA CTR to assess terminal engagement."
      )
  ).toBeVisible();
  await app.screenshot("analytics-eligible-branch-denominators");
  await screen.getByLabel("Version").selectOption({ value: "" });
  await expect(starts.getByText("3")).toBeVisible();
  await screen.getByLabel("Version").selectOption({ value: next });
  await expect(starts.getByText("1")).toBeVisible();
  await screen.getByLabel("Initial campaign").selectOption({ value: "" });
  await expect(starts.getByText("1")).toBeVisible();
  await screen.getByLabel("Version").selectOption({ value: "" });
  await screen
    .getByLabel("Initial campaign")
    .selectOption({ value: JSON.stringify("other-campaign") });
  await expect(starts.getByText("1")).toBeVisible();
  await expect(ctr.getByText("Unavailable")).toBeVisible();
  await screen.getByLabel("Version").selectOption({ value: next });
  await expect(starts.getByText("0")).toBeVisible();
  await expect(reach.getByText("Unavailable")).toBeVisible();
  await expect(ctr.getByText("0 / 0 result viewers")).toBeVisible();
  await app.screenshot("analytics-empty-filter-rates");
  const refreshed = browser.waitForResponse(/\/api\/analytics/u);
  await screen.getByRole("button", "Refresh snapshot").tap();
  await refreshed;
  await expect(reach.getByText("0 / 0 started sessions")).toBeVisible();
});
