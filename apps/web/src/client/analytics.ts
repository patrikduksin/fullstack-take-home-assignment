import { AnalyticsReportSchema, FunnelError } from "@core/core/contracts";
import type { AnalyticsFilter } from "@core/core/contracts";
import { Effect, Schema } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";

export const getAnalytics = Effect.fn("analytics.get")(function* getAnalytics(
  filter: AnalyticsFilter
) {
  const query = new URLSearchParams();

  for (const [name, value] of Object.entries(filter)) {
    if (value !== undefined) {
      query.set(name, value);
    }
  }

  const response = yield* HttpClient.get(`/api/analytics?${query}`);

  if (response.status !== 200) {
    const error = yield* response.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(FunnelError))
    );

    return yield* error;
  }

  return yield* response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(AnalyticsReportSchema))
  );
}, Effect.provide(FetchHttpClient.layer));
