import { FunnelError, SessionViewSchema } from "@core/core/contracts";
import type { Answer } from "@core/core/contracts";
import { Effect, Schema } from "effect";
import { FetchHttpClient, HttpBody, HttpClient } from "effect/http";

const request = Effect.fn("funnel.request")(function* request(
  path: string,
  body?: { readonly answer?: Answer }
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

export const startSession = () => request("/sessions", {});

export const loadSession = (id: string) => request(`/sessions/${id}`);

export const advanceSession = (id: string, answer: Answer) =>
  request(`/sessions/${id}/advance`, { answer });

export const backSession = (id: string) => request(`/sessions/${id}/back`, {});
