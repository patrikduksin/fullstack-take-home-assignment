import { toRpcGroup } from "@core/capability/rpc-group";
import { healthContract } from "@core/core/contracts";
import { expect } from "@effect/vitest";
import * as Test from "alchemy/Test/Vitest";
import { Effect } from "effect";
import { HttpClient, HttpBody } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";

import { makeTestStack } from "../../infra/test/stack.js";

const { stack, test } = makeTestStack();

test(
  "queries D1 through the website's backend service binding",
  Effect.gen(function* health() {
    const { websiteUrl } = yield* stack;

    // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- Alchemy exposes unknown readiness failures; orDie surfaces them as test defects.
    const response = yield* Test.getWhenReady(`${websiteUrl}/api/health`).pipe(
      Effect.orDie
    );

    expect(response.status).toBe(200);
    expect(yield* response.json).toEqual({ database: "ready", status: "ok" });
  })
);

test(
  "round-trips a typed RPC call through the deployed proxy",
  Effect.gen(function* rpc() {
    const { websiteUrl } = yield* stack;

    const client = yield* RpcClient.make(
      toRpcGroup([healthContract]).group
    ).pipe(
      Effect.provide(
        Test.rpcClientLayer(`${websiteUrl}/rpc`, {
          serialization: RpcSerialization.json,
        })
      )
    );

    expect(yield* client.health({})).toEqual({
      database: "ready",
      status: "ok",
    });
  }).pipe(Effect.scoped)
);

test(
  "initializes an MCP session and calls health over the service binding",
  Effect.gen(function* mcp() {
    const { websiteUrl } = yield* stack;
    const url = `${websiteUrl}/mcp`;
    const headers = { accept: "application/json, text/event-stream" };

    const initialized = yield* HttpClient.post(url, {
      body: HttpBody.text(
        JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            capabilities: {},
            clientInfo: { name: "core-tests", version: "1" },
            protocolVersion: "2025-06-18",
          },
        }),
        "application/json"
      ),
      headers,
    });

    if (initialized.status !== 200) {
      yield* Effect.logError(
        "MCP initialization failed",
        yield* initialized.text
      );
    }

    expect(initialized.status).toBe(200);
    const sessionId = initialized.headers["mcp-session-id"];
    expect(sessionId).toBeDefined();
    const session = yield* Effect.fromNullishOr(sessionId).pipe(Effect.orDie);

    const sessionHeaders = {
      ...headers,
      "mcp-protocol-version": "2025-06-18",
      "mcp-session-id": session,
    };

    const acknowledged = yield* HttpClient.post(url, {
      body: HttpBody.text(
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
        "application/json"
      ),
      headers: sessionHeaders,
    });

    if (acknowledged.status !== 202) {
      yield* Effect.logError(
        "MCP notification failed",
        yield* acknowledged.text
      );
    }

    expect(acknowledged.status).toBe(202);

    const called = yield* HttpClient.post(url, {
      body: HttpBody.text(
        JSON.stringify({
          id: 2,
          jsonrpc: "2.0",
          method: "tools/call",
          params: { arguments: {}, name: "health" },
        }),
        "application/json"
      ),
      headers: sessionHeaders,
    });

    expect(called.status).toBe(200);
    expect(yield* called.json).toMatchObject({
      id: 2,
      result: { structuredContent: { database: "ready", status: "ok" } },
    });
  })
);
