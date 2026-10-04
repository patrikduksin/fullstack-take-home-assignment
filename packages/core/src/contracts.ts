import { defineContract } from "@core/capability/contract";
import { Schema } from "effect";

export class DatabaseUnavailable extends Schema.TaggedError<DatabaseUnavailable>()(
  "DatabaseUnavailable",
  { message: Schema.String }
) {}

export const healthContract = defineContract("health", {
  annotations: { idempotent: true, readOnly: true },
  description: "Check that the backend can query its database",
  failure: DatabaseUnavailable,
  http: { method: "GET", path: "/health" },
  input: Schema.Struct({}),
  output: Schema.Struct({
    database: Schema.Literal("ready"),
    status: Schema.Literal("ok"),
  }),
});

export {
  advanceSessionContract,
  backSessionContract,
  createSessionContract,
  FunnelError,
  FunnelSessionSchema,
  loadSessionContract,
  SessionViewSchema,
} from "./funnel/contracts.js";

export type { FunnelSession, SessionView } from "./funnel/contracts.js";

export {
  AnswerSchema,
  FunnelConfigurationSchema,
  FunnelStepSchema,
} from "./funnel/configuration.js";

export type {
  Answer,
  FunnelConfiguration,
  FunnelStep,
} from "./funnel/configuration.js";
