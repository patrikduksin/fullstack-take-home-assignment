import type { Answer } from "@core/core/contracts";
import { SessionViewSchema } from "@core/core/contracts";
import { expect } from "@effect/vitest";
import * as Test from "alchemy/Test/Vitest";
import { Effect, Schema } from "effect";
import { HttpBody, HttpClient } from "effect/http";

import { makeTestStack } from "../../infra/test/stack.js";

const { stack, test } = makeTestStack();

const decodeView = Schema.decodeUnknownEffect(SessionViewSchema);

test(
  "a session validates answers and restores its position after Back",
  Effect.gen(function* persistedSession() {
    const { websiteUrl } = yield* stack;
    // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- Alchemy readiness failures are surfaced as test defects.
    yield* Test.getWhenReady(`${websiteUrl}/api/health`).pipe(Effect.orDie);

    const created = yield* HttpClient.post(`${websiteUrl}/api/sessions`, {
      body: HttpBody.jsonUnsafe({ variant: "A" }),
    });

    expect(created.status).toBe(200);
    const initial = yield* created.json.pipe(Effect.flatMap(decodeView));
    expect(initial).toMatchObject({
      configuration: { name: "Trail planning" },
      session: { answers: {}, currentStep: "welcome", history: [] },
    });
    const url = `${websiteUrl}/api/sessions/${initial.session.id}`;

    const advance = Effect.fnUntraced(function* advance(
      answer: Answer,
      stepId: string
    ) {
      return yield* HttpClient.post(`${url}/advance`, {
        body: HttpBody.jsonUnsafe({ answer, stepId }),
      });
    });

    expect((yield* advance(null, "welcome")).status).toBe(200);
    expect((yield* advance("unlisted", "pace")).status).toBe(422);

    const afterInvalid = yield* HttpClient.get(url).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(decodeView)
    );

    expect(afterInvalid.session).toMatchObject({
      answers: {},
      currentStep: "pace",
      history: ["welcome"],
    });
    expect((yield* advance("gentle", "pace")).status).toBe(200);
    expect((yield* advance([], "interests")).status).toBe(422);
    expect((yield* advance(["forest", "forest"], "interests")).status).toBe(
      422
    );
    expect(
      (yield* advance(["forest", "water", "view"], "interests")).status
    ).toBe(422);
    expect((yield* advance(["forest", "water"], "interests")).status).toBe(200);
    expect((yield* advance(9, "hours")).status).toBe(422);
    expect((yield* advance(3, "hours")).status).toBe(200);
    expect((yield* advance(null, "prepare")).status).toBe(200);

    const completed = yield* HttpClient.get(url).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(decodeView)
    );

    expect(completed.session).toMatchObject({
      answers: { hours: 3, interests: ["forest", "water"], pace: "gentle" },
      currentStep: "result",
      history: ["welcome", "pace", "interests", "hours", "prepare"],
      version: initial.session.version,
    });
    expect(completed.configuration.steps.at(-1)?.cta?.href).toBe(
      "https://www.nps.gov/subjects/trails/index.htm"
    );
    yield* HttpClient.post(`${url}/back`, { body: HttpBody.jsonUnsafe({}) });

    const resumed = yield* HttpClient.get(url).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(decodeView)
    );

    expect(resumed.session).toMatchObject({
      answers: { hours: 3, interests: ["forest", "water"], pace: "gentle" },
      currentStep: "prepare",
      history: ["welcome", "pace", "interests", "hours"],
    });
    expect(
      (yield* HttpClient.get(`${websiteUrl}/api/sessions/missing`)).status
    ).toBe(422);
  }),
  { timeout: 60_000 }
);

test(
  "pins a forced variant and resolves its configured text and order",
  Effect.gen(function* variantSession() {
    const { websiteUrl } = yield* stack;

    const created = yield* HttpClient.post(`${websiteUrl}/api/sessions`, {
      body: HttpBody.jsonUnsafe({ variant: "B" }),
    });

    expect(created.status).toBe(200);
    const initial = yield* created.json.pipe(Effect.flatMap(decodeView));
    expect(initial.session.variant).toBe("B");
    expect(
      initial.configuration.steps.find((step) => step.id === "welcome")?.title
    ).toBe("Build your weekend trail plan");
    const url = `${websiteUrl}/api/sessions/${initial.session.id}`;

    const advanced = yield* HttpClient.post(`${url}/advance`, {
      body: HttpBody.jsonUnsafe({ answer: null, stepId: "welcome" }),
    });

    const next = yield* advanced.json.pipe(Effect.flatMap(decodeView));
    expect(next.session).toMatchObject({
      currentStep: "hours",
      variant: "B",
      version: initial.session.version,
    });
    yield* HttpClient.post(`${url}/back`, { body: HttpBody.jsonUnsafe({}) });

    const restored = yield* HttpClient.get(`${url}?variant=A`).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(decodeView)
    );

    expect(restored.session).toMatchObject({
      currentStep: "welcome",
      variant: "B",
      version: initial.session.version,
    });
  }),
  { timeout: 60_000 }
);

test(
  "rejects invalid overrides and preserves backend assignments during resume",
  Effect.gen(function* assignments() {
    const { websiteUrl } = yield* stack;

    for (const variant of ["", "C", "a"]) {
      const rejected = yield* HttpClient.post(`${websiteUrl}/api/sessions`, {
        body: HttpBody.jsonUnsafe({ variant }),
      });

      expect(rejected.status).toBe(422);
      expect(yield* rejected.json).toMatchObject({
        message: "Choose variant A or B for a new session.",
      });
    }

    for (const input of [{}, { variant: "A" }, { variant: "B" }]) {
      const created = yield* HttpClient.post(`${websiteUrl}/api/sessions`, {
        body: HttpBody.jsonUnsafe(input),
      });

      const initial = yield* created.json.pipe(Effect.flatMap(decodeView));
      expect(["A", "B"]).toContain(initial.session.variant);

      if ("variant" in input) {
        expect(initial.session.variant).toBe(input.variant);
      }

      const resumed = yield* HttpClient.get(
        `${websiteUrl}/api/sessions/${initial.session.id}?variant=C`
      ).pipe(
        Effect.flatMap((response) => response.json),
        Effect.flatMap(decodeView)
      );

      expect(resumed).toEqual(initial);
    }
  }),
  { timeout: 60_000 }
);

test(
  "editing a branch prunes abandoned answers and rejects unavailable submissions",
  Effect.gen(function* editedRoute() {
    const { websiteUrl } = yield* stack;

    const initial = yield* HttpClient.post(`${websiteUrl}/api/sessions`, {
      body: HttpBody.jsonUnsafe({ variant: "A" }),
    }).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(decodeView)
    );

    const url = `${websiteUrl}/api/sessions/${initial.session.id}`;

    const advance = Effect.fnUntraced(function* advance(
      stepId: string,
      answer: Answer
    ) {
      const response = yield* HttpClient.post(`${url}/advance`, {
        body: HttpBody.jsonUnsafe({ answer, stepId }),
      });

      expect(response.status).toBe(200);

      return yield* response.json.pipe(Effect.flatMap(decodeView));
    });

    const back = Effect.fnUntraced(function* back() {
      return yield* HttpClient.post(`${url}/back`, {
        body: HttpBody.jsonUnsafe({}),
      }).pipe(
        Effect.flatMap((response) => response.json),
        Effect.flatMap(decodeView)
      );
    });

    expect(initial.route).toHaveLength(6);
    yield* advance("welcome", null);
    const branched = yield* advance("pace", "active");
    expect(branched.route).toHaveLength(7);
    expect(branched.session.routeRevision).toBe(1);
    yield* advance("supplies", "boots");
    yield* back();
    yield* back();
    const edited = yield* advance("pace", "gentle");
    expect(edited.session).toMatchObject({
      answers: { pace: "gentle" },
      currentStep: "interests",
      history: ["welcome", "pace"],
      routeRevision: 2,
    });
    expect(edited.session.answers.supplies).toBeUndefined();
    expect(edited.route).not.toContain("supplies");

    const unavailable = yield* HttpClient.post(`${url}/advance`, {
      body: HttpBody.jsonUnsafe({ answer: "boots", stepId: "supplies" }),
    });

    expect(unavailable.status).toBe(422);

    const unchanged = yield* HttpClient.get(url).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(decodeView)
    );

    expect(unchanged.session).toEqual(edited.session);
    yield* back();
    const restoredBranch = yield* advance("pace", "active");
    expect(restoredBranch.session.currentStep).toBe("supplies");
    expect(restoredBranch.session.answers.supplies).toBeUndefined();
    expect(restoredBranch.session.routeRevision).toBe(3);
  }),
  { timeout: 60_000 }
);
