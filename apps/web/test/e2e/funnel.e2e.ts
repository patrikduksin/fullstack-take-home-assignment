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
  await screen.getByRole("radio", "Gentle stroll").check();
  await browser.reload();
  await expect(screen.getByRole("radio", "Gentle stroll")).toBeChecked();
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

// @effect-diagnostics-next-line asyncFunction:off -- The e2e runner requires a Promise callback for browser fixtures.
test("reviews B's configured order and result without changing a resumed assignment", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/?variant=B");
  await expect(
    screen.getByRole("heading", "Build your weekend trail plan")
  ).toBeVisible();
  await expect(screen.getByText(/Variant B/u)).toBeVisible();
  await app.screenshot("variant-b-welcome");
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("spinbutton", "How many hours do you have?").fill("4");
  await browser.reload();
  await expect(
    screen.getByRole("spinbutton", "How many hours do you have?")
  ).toHaveValue("4");
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("radio", "Gentle stroll").check();
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("checkbox", "Forest").check();
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("button", "Continue").tap();
  await expect(
    screen.getByRole("heading", "Your next trail starts here")
  ).toBeVisible();
  await expect(
    screen.getByRole("link", "Find your next trail")
  ).toHaveAttribute("href", "https://www.nps.gov/subjects/trails/index.htm");
  await app.screenshot("variant-b-result");
  await app.open("/?variant=A");
  await expect(
    screen.getByRole("heading", "Your next trail starts here")
  ).toBeVisible();
  await expect(screen.getByText(/Variant B/u)).toBeVisible();
  await screen.getByRole("button", "Back").tap();
  await expect(
    screen.getByRole("heading", "Before you head out")
  ).toBeVisible();
  await app.restart();
  await expect(
    screen.getByRole("heading", "Before you head out")
  ).toBeVisible();
  await expect(screen.getByText(/Variant B/u)).toBeVisible();
  await app.open("/?variant=A");
  await screen.getByRole("button", "Start new session").tap();
  await expect(
    screen.getByRole("heading", "Plan a fictional weekend trail")
  ).toBeVisible();
  await expect(screen.getByText(/Variant A/u)).toBeVisible();
  await app.screenshot("reviewer-starts-variant-a");
});

// @effect-diagnostics-next-line asyncFunction:off -- The e2e runner requires a Promise callback for browser fixtures.
test("rejects an invalid override and lets the reviewer choose a valid variant", async ({
  app,
  screen,
}) => {
  await app.open("/?variant=C");
  await expect(screen.getByRole("alert")).toContainText(
    "Choose variant A or B for a new session."
  );
  await app.screenshot("invalid-variant-override");
  await app.open("/?variant=A");
  await expect(
    screen.getByRole("heading", "Plan a fictional weekend trail")
  ).toBeVisible();
});

// @effect-diagnostics-next-line asyncFunction:off -- The e2e runner requires a Promise callback for browser fixtures.
test("edits a conditional route and clears an abandoned question's answer and draft", async ({
  app,
  screen,
}) => {
  await app.open("/?variant=A");
  await expect(screen.getByText("Step 1 of 6")).toBeVisible();
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("radio", "Active hike").check();
  await screen.getByRole("button", "Continue").tap();
  await expect(
    screen.getByRole("heading", "Choose your trail supplies")
  ).toBeVisible();
  await expect(screen.getByText("Step 3 of 7")).toBeVisible();
  await app.screenshot("conditional-supplies");
  await screen.getByRole("radio", "Hiking boots").check();
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("button", "Back").tap();
  await screen.getByRole("radio", "Walking shoes").check();
  await screen.getByRole("button", "Back").tap();
  await screen.getByRole("radio", "Gentle stroll").check();
  await screen.getByRole("button", "Continue").tap();
  await expect(
    screen.getByRole("heading", "What would you like to see?")
  ).toBeVisible();
  await expect(screen.getByText("Step 3 of 6")).toBeVisible();
  await app.screenshot("edited-shorter-route");
  await screen.getByRole("button", "Back").tap();
  await screen.getByRole("radio", "Active hike").check();
  await screen.getByRole("button", "Continue").tap();
  await expect(screen.getByRole("radio", "Walking shoes")).not.toBeChecked();
  await expect(screen.getByRole("radio", "Hiking boots")).not.toBeChecked();
  await app.screenshot("abandoned-answer-and-draft-cleared");
  await screen.getByRole("radio", "Hiking boots").check();
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("checkbox", "Forest").check();
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("spinbutton", "How many hours do you have?").fill("3");
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("button", "Continue").tap();
  await expect(
    screen.getByRole("heading", "Your sample trail plan is ready")
  ).toBeVisible();
  await expect(screen.getByText("Step 7 of 7")).toBeVisible();
  await app.screenshot("conditional-route-result");
});
