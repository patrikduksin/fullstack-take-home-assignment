import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// @effect-diagnostics-next-line asyncFunction:off -- The e2e runner requires a Promise callback for browser fixtures.
test("completes a configured funnel and restores drafts and accepted answers", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/?variant=A");
  await expect(
    screen.getByRole("heading", "Plan a fictional weekend trail")
  ).toBeVisible();
  await app.screenshot("welcome");
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("button", "Continue").tap();
  await expect(screen.getByRole("alert")).toContainText("Choose one option.");
  await app.screenshot("validation");
  await screen.getByRole("radio", "Active hike").check();
  await browser.reload();
  await expect(screen.getByRole("radio", "Active hike")).toBeChecked();
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("checkbox", "Forest").check();
  await screen.getByRole("checkbox", "Waterfalls").check();
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("spinbutton", "How many hours do you have?").fill("3");
  await app.restart();
  await expect(
    screen.getByRole("spinbutton", "How many hours do you have?")
  ).toHaveValue("3");
  await app.screenshot("resumed-number-draft");
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("button", "Back").tap();
  await expect(
    screen.getByRole("spinbutton", "How many hours do you have?")
  ).toHaveValue("3");
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("button", "Continue").tap();
  await expect(
    screen.getByRole("heading", "Your sample trail plan is ready")
  ).toBeVisible();
  await expect(screen.getByRole("link", "Explore trail ideas")).toHaveAttribute(
    "href",
    "https://www.nps.gov/subjects/trails/index.htm"
  );
  await app.screenshot("configured-result");
  await screen.getByRole("link", "Explore trail ideas").tap();
  await expect(browser).toHaveURL(
    "https://www.nps.gov/subjects/trails/index.htm"
  );
  await app.open("/?variant=A");
  await expect(
    screen.getByRole("heading", "Your sample trail plan is ready")
  ).toBeVisible();
  await screen.getByRole("button", "Start new session").tap();
  await expect(
    screen.getByRole("heading", "Plan a fictional weekend trail")
  ).toBeVisible();
});
