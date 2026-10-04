import { implement } from "@core/capability/implement";
import { Context, Effect } from "effect";

import { loadSessionEventsContract } from "./contracts.js";
import type { FunnelError, StoredFunnelEvent } from "./contracts.js";
import { FunnelSessions } from "./session.js";

export class FunnelEvents extends Context.Service<
  FunnelEvents,
  {
    readonly forSession: (
      id: string
    ) => Effect.Effect<readonly StoredFunnelEvent[], FunnelError>;
  }
>()("@core/core/funnel/FunnelEvents") {}

const loadSessionEvents = implement(
  loadSessionEventsContract,
  Effect.fn("loadSessionEvents")(function* loadSessionEvents({ id }) {
    const sessions = yield* FunnelSessions;
    yield* sessions.load(id);
    const events = yield* FunnelEvents;

    return yield* events.forSession(id);
  })
);

export const funnelEventCapabilities = [loadSessionEvents] as const;
