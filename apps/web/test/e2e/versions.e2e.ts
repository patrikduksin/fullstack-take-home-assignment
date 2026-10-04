import { expect } from "e2e";

import { test } from "./browser-ready.js";

// @effect-diagnostics-next-line asyncFunction:off -- The e2e runner requires a Promise callback for browser fixtures.
test("publishes a local JSON file and rolls back without changing the visitor's saved session", async ({
  app,
  browser,
  screen,
}) => {
  await browser.setViewport({ height: 1700, width: 1280 });
  await app.open("/?variant=A");
  await expect(
    screen.getByRole("heading", "Plan a fictional weekend trail")
  ).toBeVisible();
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("radio", "Gentle stroll").check();
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("link", "Manage versions").tap();
  await expect(screen.getByRole("heading", "Funnel versions")).toBeVisible();
  const active = screen.getByRole("region", "Active version");
  await expect(active.getByText("trail-branches-v1")).toBeVisible();
  await app.screenshot("version-management-initial");
  await screen
    .getByLabel("Configuration JSON")
    .setInputFiles("test/fixtures/operator-invalid.json");
  await screen.getByRole("button", "Publish version").tap();
  await expect(screen.getByRole("alert")).toContainText("at least six screens");
  await expect(active.getByText("trail-branches-v1")).toBeVisible();
  await app.screenshot("publication-validation-error");
  await screen
    .getByLabel("Configuration JSON")
    .setInputFiles("test/fixtures/operator-version.json");
  await screen.getByRole("button", "Publish version").tap();
  await expect(active.getByText("operator-browser-v1")).toBeVisible();
  await expect(
    screen
      .getByRole("region", "Activation history")
      .getByText(/publish · operator-browser-v1/u)
  ).toBeVisible();
  await app.screenshot("published-version-history");
  await screen.getByRole("link", "Open funnel").tap();
  await expect(
    screen.getByRole("heading", "What would you like to see?")
  ).toBeVisible();
  await screen.getByRole("button", "Back").tap();
  await expect(screen.getByRole("radio", "Gentle stroll")).toBeChecked();
  await app.open("/?variant=A");
  await screen.getByRole("button", "Start new session").tap();
  await expect(
    screen.getByRole("heading", "Your published weekend trail")
  ).toBeVisible();
  await screen.getByRole("link", "Manage versions").tap();
  await screen.getByRole("button", "Roll back").tap();
  await expect(active.getByText("trail-branches-v1")).toBeVisible();
  await expect(
    screen
      .getByRole("region", "Activation history")
      .getByText(/rollback · trail-branches-v1/u)
  ).toBeVisible();
  await app.screenshot("rollback-retains-history");
  await screen.getByRole("link", "Open funnel").tap();
  await expect(
    screen.getByRole("heading", "Your published weekend trail")
  ).toBeVisible();
  await app.open("/?variant=A");
  await screen.getByRole("button", "Start new session").tap();
  await expect(
    screen.getByRole("heading", "Plan a fictional weekend trail")
  ).toBeVisible();
});
