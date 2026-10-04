import { expect } from "e2e";
import { Schema } from "effect";

import { test } from "./browser-ready.js";

// @effect-diagnostics-next-line asyncFunction:off -- The e2e runner requires Promise callbacks for browser journeys.
test("verifies the independently planned traffic cohorts in the dashboard", async ({
  app,
  browser,
  screen,
}) => {
  const { explore, direct, trail, camp } = Schema.decodeUnknownSync(
    Schema.Struct({
      camp: Schema.String,
      direct: Schema.String,
      explore: Schema.String,
      trail: Schema.String,
    })
  )({
    camp: process.env.TRAFFIC_CAMP,
    direct: process.env.TRAFFIC_DIRECT,
    explore: process.env.TRAFFIC_EXPLORE,
    trail: process.env.TRAFFIC_TRAIL,
  });

  await browser.setViewport({ height: 1800, width: 1280 });
  await app.open("/internal/analytics");
  await expect(screen.getByRole("heading", "Funnel analytics")).toBeVisible();
  const starts = screen.getByRole("region", "Started sessions");
  const reach = screen.getByRole("region", "Result reach");
  const ctr = screen.getByRole("region", "CTA CTR");
  const globalStarts = starts.getByText(/^\d+$/u);
  await expect(globalStarts).toBeVisible();
  expect(Number(await globalStarts.textContent())).toBeGreaterThanOrEqual(120);
  await app.screenshot("traffic-at-least-120-stored-sessions");

  await screen
    .getByLabel("Initial campaign")
    .selectOption({ value: JSON.stringify(explore) });
  await expect(starts.getByText("80")).toBeVisible();
  await expect(reach.getByText("32 / 80 started sessions")).toBeVisible();
  await expect(ctr.getByText("24 / 32 result viewers")).toBeVisible();
  await app.screenshot("traffic-explore-80-starts-32-results-24-cta");
  await screen.getByLabel("Version").selectOption({ value: trail });
  await expect(starts.getByText("40")).toBeVisible();
  await expect(reach.getByText("16 / 40 started sessions")).toBeVisible();
  await screen.getByLabel("Variant").selectOption({ value: "B" });
  await expect(starts.getByText("20")).toBeVisible();
  await expect(ctr.getByText("6 / 8 result viewers")).toBeVisible();
  await screen.getByText(`${trail} · Variant B · ${explore}`).tap();
  await expect(screen.getByRole("table", "Step conversion")).toContainText(
    "82.4% (14 / 17)"
  );
  await expect(screen.getByRole("table", "Eligible transitions")).toContainText(
    "57.1% (4 / 7)"
  );
  await app.screenshot(
    "traffic-trail-b-reordered-hours-and-eligible-short-edge"
  );

  await screen.getByLabel("Variant").selectOption({ value: "" });
  await screen.getByLabel("Version").selectOption({ value: "" });
  await screen
    .getByLabel("Initial campaign")
    .selectOption({ value: JSON.stringify(direct) });
  await expect(starts.getByText("40")).toBeVisible();
  await expect(reach.getByText("24 / 40 started sessions")).toBeVisible();
  await expect(ctr.getByText("16 / 24 result viewers")).toBeVisible();
  await app.screenshot("traffic-direct-40-starts-24-results-16-cta");
  await screen.getByLabel("Version").selectOption({ value: camp });
  await screen.getByLabel("Variant").selectOption({ value: "A" });
  await expect(starts.getByText("10")).toBeVisible();
  await expect(ctr.getByText("4 / 6 result viewers")).toBeVisible();
  await screen.getByText(`${camp} · Variant A · ${direct}`).tap();
  await expect(screen.getByRole("table", "Step conversion")).toContainText(
    "75% (3 / 4)"
  );
  await expect(screen.getByRole("table", "Eligible transitions")).toContainText(
    "80% (4 / 5)"
  );
  await app.screenshot("traffic-camp-a-water-branch-and-historical-edits");

  const response = browser.waitForResponse(/\/api\/analytics/u);
  await screen.getByRole("button", "Refresh snapshot").tap();
  await response;
  await expect(starts.getByText("10")).toBeVisible();
  await app.open(
    `/internal/analytics?campaign=${encodeURIComponent(`${explore}-missing`)}`
  );
  await expect(starts.getByText("0")).toBeVisible();
  await expect(reach.getByText("0 / 0 started sessions")).toBeVisible();
  await expect(ctr.getByText("Unavailable")).toBeVisible();
  await app.screenshot("traffic-missing-cohort-unavailable-rates");
});
