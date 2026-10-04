import { defineContract } from "@core/capability/contract";
import { Schema } from "effect";

import { AnswerSchema, FunnelConfigurationSchema } from "./configuration.js";

export class FunnelError extends Schema.TaggedError<FunnelError>()(
  "FunnelError",
  { message: Schema.String }
) {}

export const FunnelSessionSchema = Schema.Struct({
  answers: Schema.Record(Schema.String, AnswerSchema),
  currentStep: Schema.String,
  history: Schema.Array(Schema.String),
  id: Schema.String,
  routeRevision: Schema.Int,
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
  input: Schema.Struct({ variant: Schema.optional(Schema.String) }),
  output: SessionViewSchema,
});

export type CreateSessionInput = typeof createSessionContract.input.Type;

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
