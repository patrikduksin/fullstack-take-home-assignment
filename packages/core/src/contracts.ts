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

export type {
  CreateSessionInput,
  FunnelSession,
  SessionView,
} from "./funnel/contracts.js";

export {
  AnswerSchema,
  ConfigurationInvalid,
  FunnelConfigurationSchema,
  FunnelStepSchema,
} from "./funnel/configuration.js";

export type {
  Answer,
  FunnelConfiguration,
  FunnelStep,
} from "./funnel/configuration.js";

export {
  CreateSessionInputSchema,
  UtmSchema,
  FunnelEventSchema,
  StoredFunnelEventSchema,
  loadSessionEventsContract,
} from "./funnel/contracts.js";

export type {
  Utm,
  FunnelEvent,
  StoredFunnelEvent,
} from "./funnel/contracts.js";

export {
  EventReceiptSchema,
  ingestEventsContract,
} from "./funnel/contracts.js";

export type { EventReceipt } from "./funnel/contracts.js";

export { BuiltinEventTypeSchema } from "./funnel/configuration.js";

export type { BuiltinEventType } from "./funnel/configuration.js";

export {
  listVersionsContract,
  publishVersionContract,
  rollbackVersionContract,
  VersionError,
  VersionStateSchema,
} from "./funnel/version-contracts.js";

export type { VersionState } from "./funnel/version-contracts.js";

export { EventDeclarationSchema } from "./funnel/configuration.js";

export type { EventDeclaration } from "./funnel/configuration.js";

export {
  analyticsContract,
  AnalyticsFilterSchema,
  AnalyticsReportSchema,
} from "./funnel/analytics-contracts.js";

export type {
  AnalyticsFilter,
  AnalyticsReport,
} from "./funnel/analytics-contracts.js";
