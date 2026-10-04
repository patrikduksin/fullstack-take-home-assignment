import { toRpcGroup } from "@core/capability/rpc-group";
import { healthContract } from "@core/core/contracts";
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { AtomRpc } from "effect/reactivity";
import { RpcClient, RpcSerialization } from "effect/rpc";

const { group } = toRpcGroup([healthContract]);

export class BackendClient extends AtomRpc.Service<BackendClient>()(
  "BackendClient",
  {
    group,
    protocol: RpcClient.layerProtocolHttp({ url: "/rpc" }).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(RpcSerialization.layerJson)
    ),
  }
) {}

export const backendHealth = BackendClient.query(
  "health",
  {},
  { timeToLive: "10 seconds" }
);
