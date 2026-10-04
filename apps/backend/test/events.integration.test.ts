import {
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
