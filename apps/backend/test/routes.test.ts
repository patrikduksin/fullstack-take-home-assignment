import { Database } from "@core/core";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { Etag, HttpPlatform, HttpRouter } from "effect/http";

import { routes } from "../src/routes.js";

const platform = Layer.mergeAll(
  Path.layer,
  Etag.layerWeak,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})));

const testLayer = routes.pipe(
  Layer.provide(Layer.succeed(Database, { check: Effect.void })),
  Layer.provide(platform)
);

it.effect(
  "projects database readiness through HTTP and serves the generated API contract",
  () =>
    Effect.gen(function* realDatabaseHealth() {
      const { dispose, handler } = HttpRouter.toWebHandler(testLayer, {
        disableLogger: true,
      });

      yield* Effect.addFinalizer(() => Effect.promise(dispose));

      // oxlint-disable-next-line typescript/promise-function-async -- HttpRouter exposes a native Promise at the in-memory transport boundary.
      const response = yield* Effect.promise(() =>
        handler(new Request("http://localhost/api/health"))
      );

      expect(response.status).toBe(200);
      // oxlint-disable-next-line typescript/promise-function-async -- Response.json returns a Promise at the transport boundary.
      const body = yield* Effect.promise<unknown>(() => response.json());
      expect(body).toEqual({ database: "ready", status: "ok" });

      // oxlint-disable-next-line typescript/promise-function-async -- HttpRouter exposes a native Promise at the in-memory transport boundary.
      const specification = yield* Effect.promise(() =>
        handler(new Request("http://localhost/openapi.json"))
      );

      expect(specification.status).toBe(200);
      // oxlint-disable-next-line typescript/promise-function-async -- Response.text returns a Promise at the transport boundary.
      const document = yield* Effect.promise(() => specification.text());
      expect(document).toContain("/api/health");
    })
);
