import { defineContract } from "@core/capability/contract";
import { Schema } from "effect";

import { AnswerSchema, FunnelConfigurationSchema } from "./configuration.js";

export class FunnelError extends Schema.TaggedError<FunnelError>()(
  "FunnelError",
  { message: Schema.String }
) {}

const AttributionValue = Schema.String.check(Schema.isMaxLength(256));

export const UtmSchema = Schema.Struct({
  campaign: Schema.optional(AttributionValue),
  content: Schema.optional(AttributionValue),
  medium: Schema.optional(AttributionValue),
  source: Schema.optional(AttributionValue),
  term: Schema.optional(AttributionValue),
});

export type Utm = typeof UtmSchema.Type;

export const CreateSessionInputSchema = Schema.Struct({
  utm: Schema.optional(UtmSchema),
  variant: Schema.optional(Schema.String),
});

export type CreateSessionInput = typeof CreateSessionInputSchema.Type;

export const FunnelSessionSchema = Schema.Struct({
  answers: Schema.Record(Schema.String, AnswerSchema),
  currentStep: Schema.String,
  history: Schema.Array(Schema.String),
  id: Schema.String,
  routeRevision: Schema.Int,
  utm: UtmSchema,
  variant: Schema.Literals(["A", "B"]),
  version: Schema.String,
});

export type FunnelSession = typeof FunnelSessionSchema.Type;

export const SessionViewSchema = Schema.Struct({
  configuration: FunnelConfigurationSchema,
  session: FunnelSessionSchema,
});

export type SessionView = typeof SessionViewSchema.Type;

export const createSessionContract = defineContract("createSession", {
  description: "Start a funnel session pinned to the active configuration",
  failure: FunnelError,
  http: { method: "POST", path: "/sessions" },
  input: CreateSessionInputSchema,
  output: SessionViewSchema,
});

export const loadSessionContract = defineContract("loadSession", {
  annotations: { idempotent: true, readOnly: true },
  description: "Restore a funnel session and its original configuration",
  failure: FunnelError,
  http: { method: "GET", path: "/sessions/:id" },
  input: Schema.Struct({ id: Schema.String }),
  output: SessionViewSchema,
});

export const advanceSessionContract = defineContract("advanceSession", {
  description: "Validate the current answer and advance the funnel",
  failure: FunnelError,
  http: { method: "POST", path: "/sessions/:id/advance" },
  input: Schema.Struct({ answer: AnswerSchema, id: Schema.String }),
  output: SessionViewSchema,
});

export const backSessionContract = defineContract("backSession", {
  description: "Return to the previous visited step without losing answers",
  failure: FunnelError,
  http: { method: "POST", path: "/sessions/:id/back" },
  input: Schema.Struct({ id: Schema.String }),
  output: SessionViewSchema,
});

export const FunnelEventSchema = Schema.Struct({
  clientTimestamp: Schema.String,
  eventId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  properties: Schema.Record(
    Schema.String,
    Schema.Union([Schema.String, Schema.Boolean, Schema.Finite])
  ),
  sessionId: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(128)
  ),
  stepId: Schema.NullOr(Schema.String),
  type: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  utm: UtmSchema,
  variant: Schema.Literals(["A", "B"]),
  version: Schema.String,
});

export type FunnelEvent = typeof FunnelEventSchema.Type;

export const StoredFunnelEventSchema = Schema.Struct({
  ...FunnelEventSchema.fields,
  serverTimestamp: Schema.String,
});

export type StoredFunnelEvent = typeof StoredFunnelEventSchema.Type;

export const loadSessionEventsContract = defineContract("loadSessionEvents", {
  annotations: { idempotent: true, readOnly: true },
  description: "Read immutable analytics envelopes for a funnel session",
  failure: FunnelError,
  http: { method: "GET", path: "/sessions/:id/events" },
  input: Schema.Struct({ id: Schema.String }),
  output: Schema.Array(StoredFunnelEventSchema),
});
