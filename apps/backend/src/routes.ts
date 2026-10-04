import { toHttpApi } from "@core/capability/http-api";
import { toRpc } from "@core/capability/rpc";
import { toToolkit } from "@core/capability/toolkit";
import { capabilities } from "@core/core";
import { Layer } from "effect";
import { McpProtocol, McpServer } from "effect/ai";
import { HttpApiBuilder, HttpApiScalar } from "effect/http-api";
import { RpcSerialization, RpcServer } from "effect/rpc";

export const http = toHttpApi("Core", capabilities, { prefix: "/api" });

export const rpc = toRpc(capabilities);

export const tools = toToolkit(capabilities);

export const routes = Layer.mergeAll(
  HttpApiBuilder.layer(http.api, { openapiPath: "/openapi.json" }).pipe(
    Layer.provide(http.layer)
  ),
  HttpApiScalar.layer(http.api, { path: "/docs" }),
  RpcServer.layerHttp({
    group: rpc.group,
    path: "/rpc",
    protocol: "http",
  }).pipe(Layer.provide(rpc.layer), Layer.provide(RpcSerialization.layerJson)),
  McpServer.toolkit(tools.toolkit).pipe(
    Layer.provide(tools.layer),
    Layer.provide(
      McpServer.layerHttp({
        name: "core",
        path: "/mcp",
        protocols: [
          McpProtocol.v2025_06_18,
          McpProtocol.v2025_03_26,
          McpProtocol.v2024_11_05,
        ],
        version: "0.1.0",
      })
    )
  )
);
