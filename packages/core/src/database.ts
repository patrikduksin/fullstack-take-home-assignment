import { Context } from "effect";
import type { Effect } from "effect";

import type { DatabaseUnavailable } from "./contracts.js";

export class Database extends Context.Service<
  Database,
  {
    readonly check: Effect.Effect<void, DatabaseUnavailable>;
  }
>()("@core/core/Database") {}
