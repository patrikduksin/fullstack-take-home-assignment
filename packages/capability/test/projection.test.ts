import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { defineContract, implement, toHttpApi } from "../src/index.js";
import { inputJsonSchemaOf } from "../src/input-json-schema.js";

describe("contract projection logic", () => {
  it("projects an empty input as an object instead of a null guard", () => {
    const document = inputJsonSchemaOf(Schema.Struct({}));

    expect(document).toMatchObject({ properties: {}, type: "object" });
    expect(document).not.toHaveProperty("not");
  });

  it("preserves enum and collection bounds when converting to JSON Schema", () => {
    const document = inputJsonSchemaOf(
      Schema.Struct({
        mode: Schema.Literals(["fast", "slow"]),
        values: Schema.Array(Schema.String).check(
          Schema.isMinLength(1),
          Schema.isMaxLength(3)
        ),
      })
    );

    expect(document).toMatchObject({
      properties: {
        mode: { enum: ["fast", "slow"] },
        values: { items: { type: "string" }, maxItems: 3, minItems: 1 },
      },
      required: ["mode", "values"],
    });
  });

  it.each(["GET", "DELETE", "POST", "PUT", "PATCH"] as const)(
    "partitions path and remaining fields for %s routes",
    (method) => {
      const contract = defineContract("update", {
        description: "Update a resource",
        failure: Schema.Never,
        http: { method, path: "/resources/:id" },
        input: Schema.Struct({ id: Schema.String, name: Schema.String }),
        output: Schema.String,
      });

      const capability = implement(contract, ({ name }) =>
        Effect.succeed(name)
      );

      const document = toHttpApi("Resources", [capability], {
        prefix: "/api",
      }).openApi();

      const path = document.paths["/api/resources/{id}"];

      const keys = {
        DELETE: "delete",
        GET: "get",
        PATCH: "patch",
        POST: "post",
        PUT: "put",
      } as const;

      const operation = path?.[keys[method]];

      expect(operation?.parameters).toContainEqual(
        expect.objectContaining({ in: "path", name: "id" })
      );

      if (method === "GET" || method === "DELETE") {
        expect(operation?.parameters).toContainEqual(
          expect.objectContaining({ in: "query", name: "name" })
        );
        expect(operation?.requestBody).toBeUndefined();
      } else {
        expect(
          operation?.requestBody?.content["application/json"]?.schema
        ).toMatchObject({
          properties: { name: { type: "string" } },
          required: ["name"],
        });
        expect(
          operation?.requestBody?.content["application/json"]?.schema.properties
        ).not.toHaveProperty("id");
        expect(operation?.parameters).not.toContainEqual(
          expect.objectContaining({ in: "query", name: "name" })
        );
      }
    }
  );

  it("rejects undeclared path fields at compile time and projection time", () => {
    // @ts-expect-error -- Path parameters must exist in the input even when runtime callers erase contract types.
    const contract = defineContract("invalid", {
      description: "Invalid route",
      failure: Schema.Never,
      http: { method: "GET", path: "/resources/:missing" },
      input: Schema.Struct({ id: Schema.String }),
      output: Schema.String,
    });

    const capability = implement(contract, ({ id }) => Effect.succeed(id));

    expect(() => toHttpApi("Invalid", [capability])).toThrow(":missing");
  });
});
