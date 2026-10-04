import {
  FunnelEventSchema,
  StoredFunnelEventSchema,
} from "@core/core/contracts";
import type { Browser } from "@e2e-dev/web";
import { expect } from "e2e";
import { Data, Effect, Schedule, Schema } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";

import { test } from "./browser-ready.js";

class EventsPending extends Data.TaggedError("EventsPending")<{
  message: string;
}> {}

const storedEvents = Effect.fn("storedEvents")(
  function* storedEvents(url: string, expectedIds: readonly string[]) {
    const response = yield* HttpClient.get(url);

    const events = yield* response.json.pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.Array(StoredFunnelEventSchema))
      )
    );

    if (
      !expectedIds.every((id) => events.some((event) => event.eventId === id))
    ) {
      return yield* new EventsPending({
        message: "Events have not arrived yet.",
      });
    }

    return events;
  },
  Effect.retry({ schedule: Schedule.spaced("200 millis"), times: 60 }),
  Effect.provide(FetchHttpClient.layer)
);

// @effect-diagnostics-next-line asyncFunction:off -- Browser fixtures return Promises.
const pendingEvents = async (browser: Browser) => {
  const records = await browser.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith("funnel-event:pending:"))
      .map((key) => localStorage.getItem(key) ?? "")
  );

  return Schema.decodeSync(
    Schema.Array(Schema.fromJsonString(FunnelEventSchema))
  )(records);
};

// @effect-diagnostics-next-line asyncFunction:off -- The e2e runner requires Promise callbacks.
test("retains offline display events across reopening and delivers their original IDs once", async ({
  app,
  browser,
  screen,
}) => {
  // @effect-diagnostics-next-line asyncFunction:off -- The browser route handler requires a Promise callback.
  await browser.route("**/api/events", async (route) => {
    await route.abort();
  });
  await app.open(
    "/?variant=A&utm_source=offline-letter&utm_campaign=durable-demo"
  );
  await expect(
    screen.getByRole("heading", "Plan a fictional weekend trail")
  ).toBeVisible();
  await screen.getByRole("button", "Continue").tap();
  await expect(screen.getByRole("heading", "Choose your pace")).toBeVisible();
  const original = await pendingEvents(browser);
  const displayed = original.filter((event) => event.type === "step_viewed");
  expect(displayed).toHaveLength(2);
  expect(
    displayed
      .map((event) => event.stepId)
      .toSorted((left, right) => String(left).localeCompare(String(right)))
  ).toEqual(["pace", "welcome"]);
  expect(
    original.every((event) => !Object.hasOwn(event.properties, "answer"))
  ).toBe(true);
  expect(
    original.every(
      (event) =>
        event.utm.source === "offline-letter" &&
        event.utm.campaign === "durable-demo"
    )
  ).toBe(true);
  await app.screenshot("events-pending-offline");
  await app.restart();
  await expect(screen.getByRole("heading", "Choose your pace")).toBeVisible();
  const reopened = await pendingEvents(browser);
  expect(reopened.filter((event) => event.type === "step_viewed")).toHaveLength(
    3
  );

  for (const event of original) {
    expect(
      reopened.find((pending) => pending.eventId === event.eventId)
    ).toEqual(event);
  }

  await app.screenshot("events-retained-after-reopening");
  const delivered = browser.waitForResponse("**/api/events");
  await browser.unroute("**/api/events");
  const deliveredResponse = await delivered;
  expect(deliveredResponse.status).toBe(200);
  const sessionId = original[0]?.sessionId;
  expect(sessionId).toBeDefined();

  const stored = await Effect.runPromise(
    storedEvents(
      `${app.baseUrl}/api/sessions/${sessionId}/events`,
      reopened.map((event) => event.eventId)
    )
  );

  expect(stored).toHaveLength(reopened.length + 1);
  expect(
    stored.filter((event) => event.type === "session_started")
  ).toHaveLength(1);
  expect(new Set(stored.map((event) => event.eventId)).size).toBe(
    stored.length
  );
  expect(await pendingEvents(browser)).toEqual([]);
  await expect(screen.getByRole("heading", "Choose your pace")).toBeVisible();
  await app.screenshot("events-delivered-with-session-preserved");
});

// @effect-diagnostics-next-line asyncFunction:off -- The e2e runner requires Promise callbacks.
test("records accepted branch actions, Back, result and a real departing CTA without answers", async ({
  app,
  browser,
  screen,
}) => {
  // @effect-diagnostics-next-line asyncFunction:off -- The browser route handler requires a Promise callback.
  await browser.route("**/api/events", async (route) => {
    await route.abort();
  });
  const departures: string[] = [];
  // @effect-diagnostics-next-line asyncFunction:off -- Abort the real external request without inventing a destination response.
  await browser.route("https://www.nps.gov/**", async (route) => {
    departures.push(route.request.url);
    await route.abort();
  });
  await app.open("/?variant=A&utm_source=action-letter");
  await expect(
    screen.getByRole("heading", "Plan a fictional weekend trail")
  ).toBeVisible();
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("radio", "Active hike").check();
  await screen.getByRole("button", "Continue").tap();
  await expect(
    screen.getByRole("heading", "Choose your trail supplies")
  ).toBeVisible();
  await screen.getByRole("button", "Back").tap();
  await expect(screen.getByRole("heading", "Choose your pace")).toBeVisible();
  await screen.getByRole("radio", "Gentle stroll").check();
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("checkbox", "Forest").check();
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("spinbutton", "How many hours do you have?").fill("4");
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("button", "Continue").tap();
  await expect(
    screen.getByRole("heading", "Your sample trail plan is ready")
  ).toBeVisible();
  await app.screenshot("event-actions-result-before-departure");
  await screen.getByRole("link", "Explore trail ideas").tap();
  expect(departures).toContain("https://www.nps.gov/subjects/trails/index.htm");
  await app.restart();
  await expect(
    screen.getByRole("heading", "Your sample trail plan is ready")
  ).toBeVisible();
  const queued = await pendingEvents(browser);
  expect(queued.filter((event) => event.type === "cta_clicked")).toHaveLength(
    1
  );
  expect(queued.filter((event) => event.type === "step_viewed")).toHaveLength(
    9
  );
  expect(queued.filter((event) => event.type === "result_viewed")).toHaveLength(
    2
  );
  expect(
    queued.filter((event) => event.type === "answer_submitted")
  ).toHaveLength(4);
  expect(
    queued.filter((event) => event.type === "step_completed")
  ).toHaveLength(6);
  expect(queued.filter((event) => event.type === "back_clicked")).toHaveLength(
    1
  );
  expect(queued).toHaveLength(23);
  const completions = queued.filter((event) => event.type === "step_completed");
  expect(
    completions.find(
      (event) =>
        event.stepId === "pace" && event.properties.nextStepId === "supplies"
    )?.properties
  ).toEqual({ nextStepId: "supplies", routeRevision: 1 });
  expect(
    completions.find(
      (event) =>
        event.stepId === "pace" && event.properties.nextStepId === "interests"
    )?.properties
  ).toEqual({ nextStepId: "interests", routeRevision: 2 });
  expect(
    queued.find((event) => event.type === "back_clicked")?.properties
  ).toEqual({ routeRevision: 1, targetStepId: "pace" });

  for (const event of queued.filter(
    (candidate) => candidate.type === "answer_submitted"
  )) {
    expect(Object.keys(event.properties)).toEqual(["routeRevision"]);
  }

  expect(JSON.stringify(queued)).not.toContain('"active"');
  expect(JSON.stringify(queued)).not.toContain('"gentle"');
  expect(JSON.stringify(queued)).not.toContain('"forest"');
  expect(queued.every((event) => event.utm.source === "action-letter")).toBe(
    true
  );
  await app.screenshot("event-actions-survive-real-navigation");
  const delivered = browser.waitForResponse("**/api/events");
  await browser.unroute("**/api/events");
  const deliveredResponse = await delivered;
  expect(deliveredResponse.status).toBe(200);

  const stored = await Effect.runPromise(
    storedEvents(
      `${app.baseUrl}/api/sessions/${queued[0]?.sessionId}/events`,
      queued.map((event) => event.eventId)
    )
  );

  expect(stored).toHaveLength(24);
  expect(
    stored.filter((event) => event.type === "session_started")
  ).toHaveLength(1);
  expect(await pendingEvents(browser)).toEqual([]);
});
