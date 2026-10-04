import { implement } from "@core/capability/implement";
import { Effect } from "effect";

import { healthContract } from "./contracts.js";
import { Database } from "./database.js";
import { funnelEventCapabilities } from "./funnel/events.js";
import { funnelSessionCapabilities } from "./funnel/session.js";
import { funnelVersionCapabilities } from "./funnel/versions.js";

export { Database } from "./database.js";

export const health = implement(healthContract, () =>
  Database.use((database) => database.check).pipe(
    Effect.as({ database: "ready" as const, status: "ok" as const })
  )
);

export const capabilities = [
  health,
  ...funnelSessionCapabilities,
  ...funnelEventCapabilities,

  ...funnelVersionCapabilities,
] as const;
