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
      body: HttpBody.jsonUnsafe({}),
    });

    expect(created.status).toBe(200);
    const initial = yield* created.json.pipe(Effect.flatMap(decodeView));
    expect(initial).toMatchObject({
      configuration: { name: "Trail planning" },
      session: { answers: {}, currentStep: "welcome", history: [] },
    });
    const url = `${websiteUrl}/api/sessions/${initial.session.id}`;

    const advance = Effect.fnUntraced(function* advance(answer: Answer) {
      return yield* HttpClient.post(`${url}/advance`, {
        body: HttpBody.jsonUnsafe({ answer }),
      });
    });

    expect((yield* advance(null)).status).toBe(200);
    expect((yield* advance("unlisted")).status).toBe(422);

    const afterInvalid = yield* HttpClient.get(url).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(decodeView)
    );

    expect(afterInvalid.session).toMatchObject({
      answers: {},
      currentStep: "pace",
      history: ["welcome"],
    });
    expect((yield* advance("active")).status).toBe(200);
    expect((yield* advance([])).status).toBe(422);
    expect((yield* advance(["forest", "forest"])).status).toBe(422);
    expect((yield* advance(["forest", "water", "view"])).status).toBe(422);
    expect((yield* advance(["forest", "water"])).status).toBe(200);
    expect((yield* advance(9)).status).toBe(422);
    expect((yield* advance(3)).status).toBe(200);
    expect((yield* advance(null)).status).toBe(200);

    const completed = yield* HttpClient.get(url).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(decodeView)
    );

    expect(completed.session).toMatchObject({
      answers: { hours: 3, interests: ["forest", "water"], pace: "active" },
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
      answers: { hours: 3, interests: ["forest", "water"], pace: "active" },
      currentStep: "prepare",
      history: ["welcome", "pace", "interests", "hours"],
    });
    expect(
      (yield* HttpClient.get(`${websiteUrl}/api/sessions/missing`)).status
    ).toBe(422);
  }),
  { timeout: 60_000 }
);
