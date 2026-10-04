import {
  EventReceiptSchema,
  FunnelEventSchema,
  SessionViewSchema,
  StoredFunnelEventSchema,
  VersionStateSchema,
} from "@core/core/contracts";
import type { EventReceipt, FunnelEvent } from "@core/core/contracts";
import type { Browser } from "@e2e-dev/web";
import { expect } from "e2e";
import { Data, Deferred, Effect, Schedule, Schema } from "effect";
import { FetchHttpClient, HttpBody, HttpClient } from "effect/http";

import { test } from "./browser-ready.js";

class EventsPending extends Data.TaggedError("EventsPending")<{
  message: string;
}> {}

const storedEvents = Effect.fn("storedEvents")(
  function* storedEvents(
    url: string,
    expectedIds: readonly string[],
    minimumCount = expectedIds.length + 1
  ) {
    const response = yield* HttpClient.get(url);

    const events = yield* response.json.pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.Array(StoredFunnelEventSchema))
      )
    );

    if (
      events.length < minimumCount ||
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

const postEvents = Effect.fn("postEvents")(function* postEvents(
  url: string,
  events: readonly FunnelEvent[]
) {
  const response = yield* HttpClient.post(url, {
    body: HttpBody.jsonUnsafe({ events }),
  });

  expect(response.status).toBe(200);

  const receipts = yield* response.json.pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(
        Schema.Struct({ results: Schema.Array(EventReceiptSchema) })
      )
    )
  );

  return receipts.results;
}, Effect.provide(FetchHttpClient.layer));

const changeVersion = Effect.fn("changeVersion")(function* changeVersion(
  url: string,
  body: { configuration: unknown } | Record<string, never>
) {
  const response = yield* HttpClient.post(url, {
    body: HttpBody.jsonUnsafe(body),
  });

  expect(response.status).toBe(200);

  return yield* response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(VersionStateSchema))
  );
}, Effect.provide(FetchHttpClient.layer));

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
  await screen.getByRole("button", "Continue").tap();
  await expect(screen.getByRole("alert")).toBeVisible();
  expect(await pendingEvents(browser)).toEqual(original);
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

// @effect-diagnostics-next-line asyncFunction:off -- The e2e runner requires Promise callbacks.
test("replays an accepted batch after its browser response is lost without changing the server timestamp", async ({
  app,
  browser,
  screen,
}) => {
  const captured = Deferred.makeUnsafe<{
    events: readonly FunnelEvent[];
    receipts: readonly EventReceipt[];
  }>();

  let accepted = false;

  // @effect-diagnostics-next-line asyncFunction:off -- The browser route handler requires a Promise callback.
  await browser.route("**/api/events", async (route) => {
    if (accepted) {
      await route.abort();

      return;
    }

    accepted = true;

    const batch = Schema.decodeUnknownSync(
      Schema.fromJsonString(
        Schema.Struct({ events: Schema.Array(FunnelEventSchema) })
      )
    )(route.request.postData);

    const receipts = await Effect.runPromise(
      postEvents(route.request.url, batch.events)
    );

    await route.abort();
    await Effect.runPromise(
      Deferred.succeed(captured, { events: batch.events, receipts })
    );
  });
  await app.open("/?variant=A&utm_source=uncertain-letter");
  await expect(
    screen.getByRole("heading", "Plan a fictional weekend trail")
  ).toBeVisible();

  const original = await Effect.runPromise(
    Deferred.await(captured).pipe(Effect.timeout("20 seconds"))
  );

  expect(original.events).toHaveLength(1);
  expect(original.receipts[0]?.status).toBe("accepted");
  expect(original.receipts[0]?.serverTimestamp).toMatch(/T.*Z$/u);
  expect(await pendingEvents(browser)).toEqual(original.events);
  await app.restart();
  await expect(
    screen.getByRole("heading", "Plan a fictional weekend trail")
  ).toBeVisible();
  const reopened = await pendingEvents(browser);
  expect(reopened).toHaveLength(2);
  expect(
    reopened.find((event) => event.eventId === original.events[0]?.eventId)
  ).toEqual(original.events[0]);
  await app.screenshot("events-response-lost-and-reopened");
  const delivered = browser.waitForResponse("**/api/events");
  await browser.unroute("**/api/events");
  const response = await delivered;
  expect(response.status).toBe(200);

  const replay = Schema.decodeSync(
    Schema.Struct({ results: Schema.Array(EventReceiptSchema) })
  )(await response.json());

  expect(
    replay.results.find(
      (receipt) => receipt.eventId === original.events[0]?.eventId
    )
  ).toMatchObject({
    serverTimestamp: original.receipts[0]?.serverTimestamp,
    status: "duplicate",
  });

  const events = await Effect.runPromise(
    storedEvents(
      `${app.baseUrl}/api/sessions/${reopened[0]?.sessionId}/events`,
      reopened.map((event) => event.eventId)
    )
  );

  expect(events).toHaveLength(3);
  expect(
    events.find((event) => event.eventId === original.events[0]?.eventId)
      ?.serverTimestamp
  ).toBe(original.receipts[0]?.serverTimestamp);
  expect(await pendingEvents(browser)).toHaveLength(0);
});

// @effect-diagnostics-next-line asyncFunction:off -- The e2e runner requires Promise callbacks.
test("keeps events appended while the first real request is in flight", async ({
  app,
  browser,
  screen,
}) => {
  const captured = Deferred.makeUnsafe<readonly FunnelEvent[]>();
  const release = Deferred.makeUnsafe<boolean>();
  let holding = true;

  // @effect-diagnostics-next-line asyncFunction:off -- The browser route handler requires a Promise callback.
  await browser.route("**/api/events", async (route) => {
    if (holding) {
      holding = false;

      const batch = Schema.decodeUnknownSync(
        Schema.fromJsonString(
          Schema.Struct({ events: Schema.Array(FunnelEventSchema) })
        )
      )(route.request.postData);

      await Effect.runPromise(Deferred.succeed(captured, batch.events));
      await Effect.runPromise(
        Deferred.await(release).pipe(Effect.timeout("20 seconds"))
      );
    }

    await route.continue();
  });
  await app.open("/?variant=A");
  await expect(
    screen.getByRole("heading", "Plan a fictional weekend trail")
  ).toBeVisible();

  const initial = await Effect.runPromise(
    Deferred.await(captured).pipe(Effect.timeout("20 seconds"))
  );

  try {
    await screen.getByRole("button", "Continue").tap();
    await expect(screen.getByRole("heading", "Choose your pace")).toBeVisible();
    const appended = await pendingEvents(browser);
    expect(initial).toHaveLength(1);
    expect(appended).toHaveLength(3);
    expect(
      appended.find((event) => event.eventId === initial[0]?.eventId)
    ).toEqual(initial[0]);
    await Effect.runPromise(Deferred.succeed(release, true));

    const events = await Effect.runPromise(
      storedEvents(
        `${app.baseUrl}/api/sessions/${appended[0]?.sessionId}/events`,
        appended.map((event) => event.eventId)
      )
    );

    expect(events).toHaveLength(4);
    expect(await pendingEvents(browser)).toHaveLength(0);
    await app.screenshot("events-appended-during-delivery-preserved");
  } finally {
    await Effect.runPromise(Deferred.succeed(release, true));
  }
});

// @effect-diagnostics-next-line asyncFunction:off -- The e2e runner requires Promise callbacks.
test("quarantines corrupt and permanently rejected records while delivering valid neighbors", async ({
  app,
  browser,
  screen,
}) => {
  // @effect-diagnostics-next-line asyncFunction:off -- The browser route handler requires a Promise callback.
  await browser.route("**/api/events", async (route) => {
    await route.abort();
  });
  await app.open("/?variant=A");
  await expect(
    screen.getByRole("heading", "Plan a fictional weekend trail")
  ).toBeVisible();
  const pending = await pendingEvents(browser);
  const [neighbor] = pending;
  expect(neighbor).toBeDefined();

  if (neighbor === undefined) {
    throw new Error("The visible screen should have a durable display event.");
  }

  const invalid = Array.from({ length: 25 }, (_, index) => ({
    ...neighbor,
    eventId: `reject-${index}-${neighbor.eventId}`,
    properties: {},
    type: "undeclared_event",
  }));

  await browser.evaluate(
    (records) => {
      for (const record of records) {
        localStorage.setItem(record.key, record.value);
      }

      return true;
    },
    [
      { key: "funnel-event:pending:corrupt-record", value: "{" },
      ...invalid.map((event) => ({
        key: `funnel-event:pending:${event.eventId}`,
        value: JSON.stringify(event),
      })),
    ]
  );
  const delivered = browser.waitForResponse("**/api/events");
  await browser.unroute("**/api/events");
  const response = await delivered;
  expect(response.status).toBe(200);
  const secondDelivered = browser.waitForResponse("**/api/events");

  const firstReceipts = Schema.decodeSync(
    Schema.Struct({ results: Schema.Array(EventReceiptSchema) })
  )(await response.json());

  const secondResponse = await secondDelivered;
  expect(secondResponse.status).toBe(200);

  const secondReceipts = Schema.decodeSync(
    Schema.Struct({ results: Schema.Array(EventReceiptSchema) })
  )(await secondResponse.json());

  expect(firstReceipts.results).toHaveLength(20);
  expect(secondReceipts.results).toHaveLength(6);
  const receipts = [...firstReceipts.results, ...secondReceipts.results];
  expect(
    receipts.filter((receipt) => receipt.status === "accepted")
  ).toHaveLength(1);
  expect(
    receipts.filter((receipt) => receipt.status === "rejected")
  ).toHaveLength(25);

  const events = await Effect.runPromise(
    storedEvents(`${app.baseUrl}/api/sessions/${neighbor.sessionId}/events`, [
      neighbor.eventId,
    ])
  );

  expect(events).toHaveLength(2);
  expect(await pendingEvents(browser)).toHaveLength(0);

  const rejected = Schema.decodeUnknownSync(
    Schema.fromJsonString(
      Schema.Array(
        Schema.Struct({
          eventId: Schema.String,
          reason: Schema.String,
          rejectedAt: Schema.String,
          type: Schema.String,
        })
      )
    ),
    { onExcessProperty: "error" }
  )(
    await browser.evaluate(() => localStorage.getItem("funnel-event:rejected"))
  );

  expect(rejected).toHaveLength(20);
  expect(
    rejected.every(
      (event) => event.type === "undeclared_event" && event.reason.length > 0
    )
  ).toBe(true);
  const nextDelivered = browser.waitForResponse("**/api/events");
  await screen.getByRole("button", "Continue").tap();
  await expect(screen.getByRole("heading", "Choose your pace")).toBeVisible();
  const nextResponse = await nextDelivered;

  const nextReceipts = Schema.decodeSync(
    Schema.Struct({ results: Schema.Array(EventReceiptSchema) })
  )(await nextResponse.json());

  expect(
    nextReceipts.results.every((receipt) => receipt.status === "accepted")
  ).toBe(true);
  expect(
    nextReceipts.results.some((receipt) =>
      invalid.some((event) => event.eventId === receipt.eventId)
    )
  ).toBe(false);

  const later = await Effect.runPromise(
    storedEvents(
      `${app.baseUrl}/api/sessions/${neighbor.sessionId}/events`,
      nextReceipts.results.flatMap((receipt) =>
        receipt.eventId === undefined ? [] : [receipt.eventId]
      ),
      4
    )
  );

  expect(later).toHaveLength(4);
  await app.screenshot("events-rejections-do-not-block-progress");
});

// @effect-diagnostics-next-line asyncFunction:off -- The e2e runner requires Promise callbacks.
test("emits a newly published completion declaration from the session's pinned configuration", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/?variant=A");
  await expect(
    screen.getByRole("heading", "Plan a fictional weekend trail")
  ).toBeVisible();

  const id = await browser.evaluate(() =>
    localStorage.getItem("funnel-session")
  );

  const view = await Effect.runPromise(
    Effect.gen(function* view() {
      const response = yield* HttpClient.get(
        `${app.baseUrl}/api/sessions/${id}`
      );

      return yield* response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(SessionViewSchema))
      );
    }).pipe(Effect.provide(FetchHttpClient.layer))
  );

  const configuration = {
    ...view.configuration,
    eventTypes: [
      {
        on: "step_completed",
        properties: {
          acknowledged: { emit: true, kind: "boolean" },
          channel: { emit: "funnel", kind: "enum", values: ["funnel"] },
          skipped: { emit: false, kind: "boolean" },
          sourceStep: { emit: "source", kind: "step" },
          targetStep: { emit: "target", kind: "step" },
        },
        stepIds: ["welcome"],
        type: "screen_acknowledged",
      },
    ],
    id: `delivery-declaration-${view.session.id}`,
    steps: view.configuration.steps.map((step) =>
      step.id === "welcome"
        ? { ...step, title: "A configured acknowledgement" }
        : step
    ),
  };

  const published = await Effect.runPromise(
    changeVersion(`${app.baseUrl}/api/versions`, { configuration })
  );

  expect(published.activeVersion).toBe(configuration.id);

  try {
    await screen.getByRole("button", "Start new session").tap();
    await expect(
      screen.getByRole("heading", "A configured acknowledgement")
    ).toBeVisible();
  } finally {
    const restored = await Effect.runPromise(
      changeVersion(`${app.baseUrl}/api/versions/rollback`, {})
    );

    expect(restored.activeVersion).toBe(view.session.version);
  }

  // @effect-diagnostics-next-line asyncFunction:off -- The browser route handler requires a Promise callback.
  await browser.route("**/api/events", async (route) => {
    await route.abort();
  });
  await screen.getByRole("button", "Continue").tap();
  await expect(screen.getByRole("heading", "Choose your pace")).toBeVisible();
  const queued = await pendingEvents(browser);
  const pending = queued.filter((event) => event.version === configuration.id);

  const declared = pending.find(
    (event) => event.type === "screen_acknowledged"
  );

  expect(declared).toBeDefined();
  expect(declared).toMatchObject({
    properties: {
      acknowledged: true,
      channel: "funnel",
      skipped: false,
      sourceStep: "welcome",
      targetStep: "pace",
    },
    stepId: "welcome",
    variant: "A",
    version: configuration.id,
  });
  await app.screenshot("configured-completion-event-with-pinned-version");
  const delivered = browser.waitForResponse("**/api/events");
  await browser.unroute("**/api/events");
  const response = await delivered;
  expect(response.status).toBe(200);

  const events = await Effect.runPromise(
    storedEvents(
      `${app.baseUrl}/api/sessions/${declared?.sessionId}/events`,
      pending.map((event) => event.eventId)
    )
  );

  expect(
    events.filter((event) => event.type === "screen_acknowledged")
  ).toHaveLength(1);
  expect(
    events.find((event) => event.type === "screen_acknowledged")?.properties
  ).toEqual(declared?.properties);
  expect(await pendingEvents(browser)).toHaveLength(0);
});
