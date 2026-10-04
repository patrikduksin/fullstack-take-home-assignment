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
