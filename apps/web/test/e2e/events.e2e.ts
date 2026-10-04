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
