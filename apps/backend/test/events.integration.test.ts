import {
  EventReceiptSchema,
  SessionViewSchema,
  StoredFunnelEventSchema,
} from "@core/core/contracts";
import { expect } from "@effect/vitest";
import * as Test from "alchemy/Test/Vitest";
import { Effect, Schema } from "effect";
import { HttpBody, HttpClient } from "effect/http";

import { makeTestStack } from "../../infra/test/stack.js";

const { stack, test } = makeTestStack();

test(
  "creates one immutable attributed session-start event and preserves it on resume",
  Effect.gen(function* initialAttribution() {
    const { websiteUrl } = yield* stack;
    // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- Alchemy readiness failures are surfaced as test defects.
    yield* Test.getWhenReady(`${websiteUrl}/api/health`).pipe(Effect.orDie);

    const created = yield* HttpClient.post(`${websiteUrl}/api/sessions`, {
      body: HttpBody.jsonUnsafe({
        utm: { campaign: "event-intake", source: "fictional-newsletter" },
      }),
    });

    const view = yield* created.json;
    expect(created.status).toBe(200);
    expect(view).toMatchObject({
      session: {
        utm: { campaign: "event-intake", source: "fictional-newsletter" },
      },
    });

    const session = yield* Schema.decodeUnknownEffect(SessionViewSchema)(view);
    const url = `${websiteUrl}/api/sessions/${session.session.id}`;
    const before = yield* HttpClient.get(`${url}/events`);
    expect(before.status).toBe(200);

    const events = yield* before.json.pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.Array(StoredFunnelEventSchema))
      )
    );

    expect(events).toMatchObject([
      {
        eventId: `session_started:${session.session.id}`,
        properties: {},
        sessionId: session.session.id,
        stepId: null,
        type: "session_started",
        utm: { campaign: "event-intake", source: "fictional-newsletter" },
        variant: session.session.variant,
        version: session.session.version,
      },
    ]);
    expect(events).toHaveLength(1);
    const started = yield* Effect.fromNullishOr(events[0]).pipe(Effect.orDie);
    expect(started.serverTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    expect(started.clientTimestamp).toBe(started.serverTimestamp);

    yield* HttpClient.get(url);
    yield* HttpClient.get(url);

    const resumed = yield* HttpClient.get(`${url}/events`).pipe(
      Effect.flatMap((response) => response.json)
    );

    expect(resumed).toEqual(events);
  }),
  { timeout: 60_000 }
);

test(
  "isolates malformed neighbors and preserves the first envelope through retries and conflicts",
  Effect.gen(function* retrySafeBatch() {
    const { websiteUrl } = yield* stack;

    const created = yield* HttpClient.post(`${websiteUrl}/api/sessions`, {
      body: HttpBody.jsonUnsafe({
        utm: { campaign: "replay-test", source: "test" },
        variant: "A",
      }),
    });

    const view = yield* created.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(SessionViewSchema))
    );

    const url = `${websiteUrl}/api/events`;

    const event = {
      clientTimestamp: "2026-10-04T06:00:00.000Z",
      eventId: `view:${view.session.id}`,
      properties: { routeRevision: 0 },
      sessionId: view.session.id,
      stepId: "welcome",
      type: "step_viewed",
      utm: { campaign: "replay-test", source: "test" },
      variant: view.session.variant,
      version: view.session.version,
    };

    const batch = {
      events: [
        event,
        null,
        { ...event, utm: { campaign: "replay-test", source: "test" } },
        { ...event, clientTimestamp: "2026-10-04T07:00:00.000Z" },
      ],
    };

    const first = yield* HttpClient.post(url, {
      body: HttpBody.jsonUnsafe(batch),
    });

    expect(first.status).toBe(200);
    const received = yield* first.json;
    expect(received).toMatchObject({
      results: [
        { eventId: event.eventId, index: 0, status: "accepted" },
        { index: 1, status: "rejected" },
        { eventId: event.eventId, index: 2, status: "duplicate" },
        { eventId: event.eventId, index: 3, status: "rejected" },
      ],
    });

    const persisted = yield* HttpClient.get(
      `${websiteUrl}/api/sessions/${view.session.id}/events`
    ).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.Array(StoredFunnelEventSchema))
      )
    );

    expect(persisted).toHaveLength(2);
    expect(
      persisted.find((candidate) => candidate.eventId === event.eventId)
    ).toMatchObject(event);

    const replay = yield* HttpClient.post(url, {
      body: HttpBody.jsonUnsafe(batch),
    });

    expect(replay.status).toBe(200);
    expect(yield* replay.json).toMatchObject({
      results: [
        { index: 0, status: "duplicate" },
        { index: 1, status: "rejected" },
        { index: 2, status: "duplicate" },
        { index: 3, status: "rejected" },
      ],
    });

    const after = yield* HttpClient.get(
      `${websiteUrl}/api/sessions/${view.session.id}/events`
    ).pipe(Effect.flatMap((response) => response.json));

    expect(after).toEqual(persisted);
    expect(
      (yield* HttpClient.post(url, { body: HttpBody.jsonUnsafe({}) })).status
    ).toBe(400);
    expect(
      (yield* HttpClient.post(url, {
        body: HttpBody.jsonUnsafe({ events: "bad" }),
      })).status
    ).toBe(400);
  }),
  { timeout: 60_000 }
);

test(
  "publishes safe custom events without changing storage and rejects attribution and answer leakage",
  Effect.gen(function* extensiblePrivateEvents() {
    const { websiteUrl } = yield* stack;

    const oldResponse = yield* HttpClient.post(`${websiteUrl}/api/sessions`, {
      body: HttpBody.jsonUnsafe({ variant: "A" }),
    });

    const old = yield* oldResponse.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(SessionViewSchema))
    );

    const declaration = {
      on: "step_completed",
      properties: {
        acknowledged: { emit: true, kind: "boolean" },
        channel: { emit: "funnel", kind: "enum", values: ["funnel"] },
        screen: { emit: "source", kind: "step" },
      },
      stepIds: ["welcome"],
      type: "information_acknowledged",
    };

    const configuration = {
      ...old.configuration,
      eventTypes: [declaration],
      id: `event-schema-${old.session.id}`,
      name: "Declared event fixture",
    };

    const published = yield* HttpClient.post(`${websiteUrl}/api/versions`, {
      body: HttpBody.jsonUnsafe({ configuration }),
    });

    expect(published.status).toBe(200);

    const response = yield* HttpClient.post(`${websiteUrl}/api/sessions`, {
      body: HttpBody.jsonUnsafe({
        utm: { campaign: "privacy-test" },
        variant: "A",
      }),
    });

    const view = yield* response.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(SessionViewSchema))
    );

    expect(view.session.version).toBe(configuration.id);
    const sessionUrl = `${websiteUrl}/api/sessions/${view.session.id}`;
    expect(
      (yield* HttpClient.post(`${sessionUrl}/advance`, {
        body: HttpBody.jsonUnsafe({ answer: null, stepId: "welcome" }),
      })).status
    ).toBe(200);
    expect(
      (yield* HttpClient.post(`${sessionUrl}/advance`, {
        body: HttpBody.jsonUnsafe({ answer: "active", stepId: "pace" }),
      })).status
    ).toBe(200);

    const envelope = (
      type: string,
      stepId: string,
      properties: Record<string, string | number | boolean>
    ) => ({
      clientTimestamp: "2026-10-04T06:00:00.000Z",
      eventId: `${type}:${view.session.id}`,
      properties,
      sessionId: view.session.id,
      stepId,
      type,
      utm: view.session.utm,
      variant: view.session.variant,
      version: view.session.version,
    });

    const viewed = envelope("step_viewed", "welcome", { routeRevision: 0 });

    const custom = envelope("information_acknowledged", "welcome", {
      acknowledged: true,
      channel: "funnel",
      screen: "welcome",
    });

    const valid = [
      viewed,
      envelope("answer_submitted", "pace", { routeRevision: 0 }),
      envelope("step_completed", "welcome", {
        nextStepId: "pace",
        routeRevision: 0,
      }),
      envelope("back_clicked", "pace", {
        routeRevision: 0,
        targetStepId: "welcome",
      }),
      envelope("result_viewed", "result", { routeRevision: 0 }),
      envelope("cta_clicked", "result", { routeRevision: 0 }),
      custom,
    ];

    const invalid = [
      { ...viewed, version: "conflicting-version" },
      { ...viewed, variant: "B" },
      { ...viewed, stepId: "missing-step" },
      { ...viewed, utm: { campaign: "conflicting-attribution" } },
      envelope("answer_submitted", "pace", {
        answer: "active",
        routeRevision: 0,
      }),
      {
        ...custom,
        properties: { ...custom.properties, channel: "private-text" },
      },
      envelope("undeclared_event", "welcome", {}),
      envelope("session_started", "welcome", {}),
      { ...viewed, clientTimestamp: "2026-02-30T06:00:00.000Z" },
      { ...viewed, sessionId: "missing-session" },
      { ...viewed, properties: { routeRevision: 999_999 } },
      {
        ...viewed,
        properties: { email: "private@example.test", routeRevision: 0 },
      },
      envelope("step_completed", "welcome", {
        nextStepId: "result",
        routeRevision: 0,
      }),
      envelope("result_viewed", "pace", { routeRevision: 0 }),
      envelope("cta_clicked", "welcome", { routeRevision: 0 }),
      envelope("back_clicked", "pace", {
        routeRevision: 0,
        targetStepId: "pace",
      }),
      envelope("answer_submitted", "welcome", { routeRevision: 0 }),
      { ...custom, stepId: "pace" },
    ];

    const batch = yield* HttpClient.post(`${websiteUrl}/api/events`, {
      body: HttpBody.jsonUnsafe({ events: [...valid, ...invalid] }),
    });

    expect(batch.status).toBe(200);

    const receipts = yield* batch.json.pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.Struct({ results: Schema.Array(EventReceiptSchema) })
        )
      )
    );

    expect(
      receipts.results.slice(0, 7).map((receipt) => receipt.status)
    ).toEqual([
      "accepted",
      "accepted",
      "accepted",
      "accepted",
      "accepted",
      "accepted",
      "accepted",
    ]);
    expect(receipts.results.slice(7).map((receipt) => receipt.status)).toEqual(
      Array.from({ length: 18 }, () => "rejected")
    );

    const stored = yield* HttpClient.get(`${sessionUrl}/events`).pipe(
      Effect.flatMap((http) => http.json),
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.Array(StoredFunnelEventSchema))
      )
    );

    expect(stored.map((event) => event.type).toSorted()).toEqual([
      "answer_submitted",
      "back_clicked",
      "cta_clicked",
      "information_acknowledged",
      "result_viewed",
      "session_started",
      "step_completed",
      "step_viewed",
    ]);
    expect(JSON.stringify(stored)).not.toContain('"active"');
    expect(JSON.stringify(stored)).not.toContain('"answer":');

    const resumed = yield* HttpClient.get(sessionUrl).pipe(
      Effect.flatMap((http) => http.json)
    );

    expect(resumed).toMatchObject({
      session: {
        answers: { pace: "active" },
        utm: { campaign: "privacy-test" },
      },
    });

    const replay = yield* HttpClient.post(`${websiteUrl}/api/events`, {
      body: HttpBody.jsonUnsafe({
        events: [
          { ...viewed, clientTimestamp: "2026-10-04T08:00:00.000+02:00" },
          custom,
        ],
      }),
    });

    expect(yield* replay.json).toMatchObject({
      results: [{ status: "duplicate" }, { status: "duplicate" }],
    });
    expect(
      yield* HttpClient.get(`${sessionUrl}/events`).pipe(
        Effect.flatMap((http) => http.json)
      )
    ).toEqual(stored);

    const oldCustom = {
      ...custom,
      eventId: `custom:${old.session.id}`,
      sessionId: old.session.id,
      utm: old.session.utm,
      version: old.session.version,
    };

    const oldResult = yield* HttpClient.post(`${websiteUrl}/api/events`, {
      body: HttpBody.jsonUnsafe({ events: [oldCustom] }),
    });

    expect(yield* oldResult.json).toMatchObject({
      results: [{ status: "rejected" }],
    });
    expect(
      (yield* HttpClient.post(`${websiteUrl}/api/events`, {
        body: HttpBody.jsonUnsafe({
          events: Array.from({ length: 101 }, () => viewed),
        }),
      })).status
    ).toBe(400);
  }),
  { timeout: 60_000 }
);

test(
  "rejects ambiguous or sensitive event declarations without publishing any version",
  Effect.gen(function* safeDeclarations() {
    const { websiteUrl } = yield* stack;

    const response = yield* HttpClient.post(`${websiteUrl}/api/sessions`, {
      body: HttpBody.jsonUnsafe({ variant: "A" }),
    });

    const view = yield* response.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(SessionViewSchema))
    );

    const before = yield* HttpClient.get(`${websiteUrl}/api/versions`).pipe(
      Effect.flatMap((http) => http.json)
    );

    const declaration = {
      on: "step_completed",
      properties: {},
      stepIds: ["welcome"],
      type: "information_acknowledged",
    };

    const invalid = [
      [{ ...declaration, type: "step_viewed" }],
      [declaration, declaration],
      [{ ...declaration, stepIds: ["missing-step"] }],
      [
        {
          ...declaration,
          properties: {
            answer: { emit: "active", kind: "enum", values: ["active"] },
          },
        },
      ],
      [
        {
          ...declaration,
          properties: {
            channel: { emit: "private", kind: "enum", values: ["funnel"] },
          },
        },
      ],
      [{ ...declaration, properties: { acknowledged: { kind: "boolean" } } }],
      [
        {
          ...declaration,
          properties: {
            channel: {
              emit: "funnel",
              kind: "enum",
              values: ["funnel", "funnel"],
            },
          },
        },
      ],
      [{ ...declaration, stepIds: ["result"] }],
    ];

    for (const [index, eventTypes] of invalid.entries()) {
      const published = yield* HttpClient.post(`${websiteUrl}/api/versions`, {
        body: HttpBody.jsonUnsafe({
          configuration: {
            ...view.configuration,
            eventTypes,
            id: `unsafe-event-${index}-${view.session.id}`,
          },
        }),
      });

      expect(published.status).toBe(422);
    }

    const after = yield* HttpClient.get(`${websiteUrl}/api/versions`).pipe(
      Effect.flatMap((http) => http.json)
    );

    expect(after).toEqual(before);
  }),
  { timeout: 60_000 }
);

test(
  "accepts delayed configured branch and default completions after route answers change",
  Effect.gen(function* delayedBranchEvents() {
    const { websiteUrl } = yield* stack;

    const created = yield* HttpClient.post(`${websiteUrl}/api/sessions`, {
      body: HttpBody.jsonUnsafe({ variant: "A" }),
    });

    const initial = yield* created.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(SessionViewSchema))
    );

    const url = `${websiteUrl}/api/sessions/${initial.session.id}`;
    yield* HttpClient.post(`${url}/advance`, {
      body: HttpBody.jsonUnsafe({ answer: null, stepId: "welcome" }),
    });

    const branched = yield* HttpClient.post(`${url}/advance`, {
      body: HttpBody.jsonUnsafe({ answer: "active", stepId: "pace" }),
    }).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(Schema.decodeUnknownEffect(SessionViewSchema))
    );

    expect(branched.session.currentStep).toBe("supplies");
    yield* HttpClient.post(`${url}/back`, { body: HttpBody.jsonUnsafe({}) });

    const changed = yield* HttpClient.post(`${url}/advance`, {
      body: HttpBody.jsonUnsafe({ answer: "gentle", stepId: "pace" }),
    }).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(Schema.decodeUnknownEffect(SessionViewSchema))
    );

    expect(changed.session.currentStep).toBe("interests");
    expect(changed.session.routeRevision).toBeGreaterThan(
      branched.session.routeRevision
    );

    const completion = (nextStepId: string, routeRevision: number) => ({
      clientTimestamp: "2026-10-04T06:00:00.000Z",
      eventId: `${initial.session.id}:${nextStepId}`,
      properties: { nextStepId, routeRevision },
      sessionId: initial.session.id,
      stepId: "pace",
      type: "step_completed",
      utm: initial.session.utm,
      variant: initial.session.variant,
      version: initial.session.version,
    });

    const batch = yield* HttpClient.post(`${websiteUrl}/api/events`, {
      body: HttpBody.jsonUnsafe({
        events: [
          completion("supplies", branched.session.routeRevision),
          completion("interests", changed.session.routeRevision),
          completion("result", changed.session.routeRevision),
          {
            ...completion("result", 0),
            eventId: `${initial.session.id}:terminal`,
            stepId: "result",
          },
        ],
      }),
    });

    const receipts = yield* batch.json.pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.Struct({ results: Schema.Array(EventReceiptSchema) })
        )
      )
    );

    expect(receipts.results.map((receipt) => receipt.status)).toEqual([
      "accepted",
      "accepted",
      "rejected",
      "rejected",
    ]);

    const resumed = yield* HttpClient.get(url).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(Schema.decodeUnknownEffect(SessionViewSchema))
    );

    expect(resumed.session).toEqual(changed.session);
  }),
  { timeout: 60_000 }
);
