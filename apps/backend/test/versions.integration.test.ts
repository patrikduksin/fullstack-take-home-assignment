import { SessionViewSchema, VersionStateSchema } from "@core/core/contracts";
import { expect } from "@effect/vitest";
import * as Test from "alchemy/Test/Vitest";
import { Effect, Schema } from "effect";
import { HttpBody, HttpClient } from "effect/http";

import configuration from "../../../configurations/variants-v1.json" with { type: "json" };
import { makeTestStack } from "../../infra/test/stack.js";

const { stack, test } = makeTestStack();

const decodeState = Schema.decodeUnknownEffect(VersionStateSchema);

const decodeSession = Schema.decodeUnknownEffect(SessionViewSchema);

test(
  "shows initial history and rejects rollback without a previous activation",
  Effect.gen(function* versions() {
    const { websiteUrl } = yield* stack;
    // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- Alchemy readiness failures are surfaced as test defects.
    yield* Test.getWhenReady(`${websiteUrl}/api/health`).pipe(Effect.orDie);
    const response = yield* HttpClient.get(`${websiteUrl}/api/versions`);
    expect(response.status).toBe(200);
    const initial = yield* response.json.pipe(Effect.flatMap(decodeState));
    expect(initial.history).toHaveLength(1);
    expect(initial.history[0]).toMatchObject({
      kind: "initial",
      previousVersion: null,
      sequence: 1,
      version: initial.activeVersion,
    });
    expect(
      initial.versions.find((version) => version.version === "trail-linear-v1")
        ?.name
    ).toBe("Trail planning");

    const rejected = yield* HttpClient.post(
      `${websiteUrl}/api/versions/rollback`,
      { body: HttpBody.jsonUnsafe({}) }
    );

    expect(rejected.status).toBe(422);
    expect(yield* rejected.json).toMatchObject({
      message: "There is no previous activation to roll back to.",
    });
  }),
  { timeout: 60_000 }
);

test(
  "publishes immutably and rolls back while old and new sessions retain their versions",
  Effect.gen(function* publication() {
    const { websiteUrl } = yield* stack;
    const sessionsUrl = `${websiteUrl}/api/sessions`;
    const versionsUrl = `${websiteUrl}/api/versions`;

    const create = Effect.fnUntraced(function* createSession() {
      return yield* HttpClient.post(sessionsUrl, {
        body: HttpBody.jsonUnsafe({ variant: "A" }),
      }).pipe(
        Effect.flatMap((response) => response.json),
        Effect.flatMap(decodeSession)
      );
    });

    const before = yield* HttpClient.get(versionsUrl).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(decodeState)
    );

    const old = yield* create();
    yield* HttpClient.post(`${sessionsUrl}/${old.session.id}/advance`, {
      body: HttpBody.jsonUnsafe({ answer: null, stepId: "welcome" }),
    });
    yield* HttpClient.post(`${sessionsUrl}/${old.session.id}/advance`, {
      body: HttpBody.jsonUnsafe({ answer: "gentle", stepId: "pace" }),
    });

    const draft = {
      ...configuration,
      id: "api-published-v1",
      name: "Published trail planning",
    };

    const invalid = yield* HttpClient.post(versionsUrl, {
      body: HttpBody.jsonUnsafe({
        configuration: { ...draft, start: "missing" },
      }),
    });

    expect(invalid.status).toBe(422);

    const afterInvalid = yield* HttpClient.get(versionsUrl).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(decodeState)
    );

    expect(afterInvalid).toEqual(before);

    const published = yield* HttpClient.post(versionsUrl, {
      body: HttpBody.jsonUnsafe({ configuration: draft }),
    });

    expect(published.status).toBe(200);
    const state = yield* published.json.pipe(Effect.flatMap(decodeState));
    expect(state.activeVersion).toBe("api-published-v1");
    expect(state.history[0]).toMatchObject({
      kind: "publish",
      previousVersion: before.activeVersion,
      version: "api-published-v1",
    });
    expect(state.history.length).toBe(before.history.length + 1);
    const fresh = yield* create();
    expect(fresh.session.version).toBe("api-published-v1");
    expect(fresh.configuration.name).toBe("Published trail planning");

    const duplicate = yield* HttpClient.post(versionsUrl, {
      body: HttpBody.jsonUnsafe({
        configuration: { ...draft, name: "Overwritten name" },
      }),
    });

    expect(duplicate.status).toBe(422);

    const afterDuplicate = yield* HttpClient.get(versionsUrl).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(decodeState)
    );

    expect(afterDuplicate).toEqual(state);

    const rolledBack = yield* HttpClient.post(`${versionsUrl}/rollback`, {
      body: HttpBody.jsonUnsafe({}),
    });

    expect(rolledBack.status).toBe(200);
    const restored = yield* rolledBack.json.pipe(Effect.flatMap(decodeState));
    expect(restored.activeVersion).toBe(before.activeVersion);
    expect(restored.history[0]).toMatchObject({
      kind: "rollback",
      previousVersion: "api-published-v1",
      version: before.activeVersion,
    });
    expect(
      restored.versions.find(
        (version) => version.version === "api-published-v1"
      )?.name
    ).toBe("Published trail planning");

    const resumedOld = yield* HttpClient.get(
      `${sessionsUrl}/${old.session.id}`
    ).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(decodeSession)
    );

    expect(resumedOld.session).toMatchObject({
      answers: { pace: "gentle" },
      currentStep: "interests",
      history: ["welcome", "pace"],
      version: before.activeVersion,
    });

    const resumedPublished = yield* HttpClient.get(
      `${sessionsUrl}/${fresh.session.id}`
    ).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(decodeSession)
    );

    expect(resumedPublished.session.version).toBe("api-published-v1");
    expect(resumedPublished.configuration.name).toBe(
      "Published trail planning"
    );
    expect((yield* create()).session.version).toBe(before.activeVersion);
  }),
  { timeout: 60_000 }
);
