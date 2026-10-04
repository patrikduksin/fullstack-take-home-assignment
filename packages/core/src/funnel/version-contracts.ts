import { defineContract } from "@core/capability/contract";
import { Schema } from "effect";

export class VersionError extends Schema.TaggedError<VersionError>()(
  "VersionError",
  {
    message: Schema.String,
  }
) {}

export const VersionStateSchema = Schema.Struct({
  activeVersion: Schema.String,
  history: Schema.Array(
    Schema.Struct({
      activatedAt: Schema.String,
      kind: Schema.Literals(["initial", "publish", "rollback"]),
      previousVersion: Schema.NullOr(Schema.String),
      sequence: Schema.Int,
      version: Schema.String,
    })
  ),
  versions: Schema.Array(
    Schema.Struct({
      createdAt: Schema.String,
      name: Schema.String,
      version: Schema.String,
    })
  ),
});

export type VersionState = typeof VersionStateSchema.Type;

export const listVersionsContract = defineContract("listVersions", {
  annotations: { idempotent: true, readOnly: true },
  description: "List immutable funnel versions and activation history",
  failure: VersionError,
  http: { method: "GET", path: "/versions" },
  input: Schema.Struct({}),
  output: VersionStateSchema,
});

export const publishVersionContract = defineContract("publishVersion", {
  description: "Validate and atomically publish a new immutable funnel version",
  failure: VersionError,
  http: { method: "POST", path: "/versions" },
  input: Schema.Struct({ configuration: Schema.Unknown }),
  output: VersionStateSchema,
});

export const rollbackVersionContract = defineContract("rollbackVersion", {
  description:
    "Activate the previous activation target without changing saved versions",
  failure: VersionError,
  http: { method: "POST", path: "/versions/rollback" },
  input: Schema.Struct({}),
  output: VersionStateSchema,
});
