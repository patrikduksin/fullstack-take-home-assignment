import { FunnelError, SessionViewSchema } from "@core/core/contracts";
import type { Answer, CreateSessionInput } from "@core/core/contracts";
import { Effect, Schema } from "effect";
import { FetchHttpClient, HttpBody, HttpClient } from "effect/http";

const request = Effect.fn("funnel.request")(function* request(
  path: string,
  body?: CreateSessionInput | { readonly answer?: Answer }
) {
  const response = yield* body === undefined
    ? HttpClient.get(`/api${path}`)
    : HttpClient.post(`/api${path}`, { body: HttpBody.jsonUnsafe(body) });

  if (response.status !== 200) {
    const error = yield* response.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(FunnelError))
    );

    return yield* error;
  }

  return yield* response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(SessionViewSchema))
  );
}, Effect.provide(FetchHttpClient.layer));

export const startSession = (variant?: string) => {
  const query = new URLSearchParams(window.location.search);

  const utm = Object.fromEntries(
    ["source", "medium", "campaign", "term", "content"].flatMap((key) => {
      const value = query.get(`utm_${key}`);

      return value === null ? [] : [[key, value]];
    })
  );

  return request(
    "/sessions",
    variant === undefined ? { utm } : { utm, variant }
  );
};

export const loadSession = (id: string) => request(`/sessions/${id}`);

export const advanceSession = (id: string, answer: Answer) =>
  request(`/sessions/${id}/advance`, { answer });

export const backSession = (id: string) => request(`/sessions/${id}/back`, {});
