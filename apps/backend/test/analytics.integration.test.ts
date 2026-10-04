import { expect } from "@effect/vitest";
import { Effect } from "effect";
import { HttpBody, HttpClient } from "effect/http";

import { makeTestStack } from "../../infra/test/stack.js";

const { stack, test } = makeTestStack();

test(
  "counts real attributed starts and reports unavailable rates for an empty cohort",
  Effect.gen(function* startedAnalytics() {
    const { websiteUrl } = yield* stack;
    yield* HttpClient.post(`${websiteUrl}/api/sessions`, {
      body: HttpBody.jsonUnsafe({
        utm: { campaign: "analytics-starts" },
        variant: "A",
      }),
    });
    yield* HttpClient.post(`${websiteUrl}/api/sessions`, {
      body: HttpBody.jsonUnsafe({
        utm: { campaign: "analytics-starts" },
        variant: "B",
      }),
    });

    const response = yield* HttpClient.get(
      `${websiteUrl}/api/analytics?campaign=analytics-starts`
    );

    expect(response.status).toBe(200);
    expect(yield* response.json).toMatchObject({
      summary: {
        ctaClickers: 0,
        ctaCtr: null,
        resultReachRate: 0,
        resultReached: 0,
        resultViewers: 0,
        started: 2,
      },
    });

    const empty = yield* HttpClient.get(
      `${websiteUrl}/api/analytics?campaign=missing`
    );

    expect(yield* empty.json).toMatchObject({
      summary: {
        ctaClickers: 0,
        ctaCtr: null,
        resultReachRate: null,
        resultReached: 0,
        resultViewers: 0,
        started: 0,
      },
    });
  })
);
