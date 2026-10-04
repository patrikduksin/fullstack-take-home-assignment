import {
  FunnelConfigurationSchema,
  VersionError,
  VersionStateSchema,
} from "@core/core/contracts";
import type { FunnelConfiguration } from "@core/core/contracts";
import { Effect, Schema } from "effect";
import { FetchHttpClient, HttpBody, HttpClient } from "effect/http";

const request = Effect.fn("versions.request")(function* request(
  path: string,
  body?: { readonly configuration?: unknown }
) {
  const response = yield* body === undefined
    ? HttpClient.get(`/api${path}`)
    : HttpClient.post(`/api${path}`, { body: HttpBody.jsonUnsafe(body) });

  if (response.status !== 200) {
    const error = yield* response.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(VersionError))
    );

    return yield* error;
  }

  return yield* response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(VersionStateSchema))
  );
}, Effect.provide(FetchHttpClient.layer));

export const listVersions = () => request("/versions");

export const publishVersion = (configuration: FunnelConfiguration) =>
  request("/versions", { configuration });

export const rollbackVersion = () => request("/versions/rollback", {});

export const readConfiguration = Effect.fn("readConfiguration")(
  function* readConfiguration(file: File) {
    const text = yield* Effect.tryPromise({
      catch: () =>
        new VersionError({ message: "Could not read the selected file." }),
      // @effect-diagnostics-next-line asyncFunction:off -- Browser file reads return Promises at the input boundary.
      try: async () => await file.text(),
    });

    const json = yield* Schema.decodeEffect(
      Schema.fromJsonString(Schema.Unknown)
    )(text).pipe(
      Effect.mapError(
        () =>
          new VersionError({ message: "The selected file is not valid JSON." })
      )
    );

    return yield* Schema.decodeUnknownEffect(FunnelConfigurationSchema, {
      onExcessProperty: "error",
    })(json).pipe(
      Effect.mapError((issue) => new VersionError({ message: issue.message }))
    );
  }
);
