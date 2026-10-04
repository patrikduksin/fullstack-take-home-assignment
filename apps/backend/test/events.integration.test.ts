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
