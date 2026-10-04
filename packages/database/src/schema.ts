import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const funnelVersions = sqliteTable(
  "funnel_versions",
  {
    configuration: text("configuration").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    version: text("version").notNull().primaryKey(),
  },
  (table) => [
    check(
      "funnel_versions_configuration_json",
      sql`json_valid(${table.configuration})`
    ),
  ]
);

export const funnelActive = sqliteTable(
  "funnel_active",
  {
    singleton: integer("singleton").notNull().primaryKey(),
    version: text("version")
      .notNull()
      .references(() => funnelVersions.version),
  },
  (table) => [check("funnel_active_singleton", sql`${table.singleton} = 1`)]
);

export const funnelSessions = sqliteTable(
  "funnel_sessions",
  {
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    id: text("id").notNull().primaryKey(),
    state: text("state").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    variant: text("variant").notNull(),
    version: text("version")
      .notNull()
      .references(() => funnelVersions.version),
  },
  (table) => [
    check("funnel_sessions_state_json", sql`json_valid(${table.state})`),
    check("funnel_sessions_variant", sql`${table.variant} IN ('A', 'B')`),
  ]
);

export const funnelActivations = sqliteTable(
  "funnel_activations",
  {
    activatedAt: text("activated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    kind: text("kind").notNull(),
    previousVersion: text("previous_version").references(
      () => funnelVersions.version
    ),
    sequence: integer("sequence").primaryKey({ autoIncrement: true }),
    version: text("version")
      .notNull()
      .references(() => funnelVersions.version),
  },
  (table) => [
    check(
      "funnel_activations_kind",
      sql`${table.kind} IN ('initial', 'publish', 'rollback')`
    ),
  ]
);

export const schema = {
  funnelActivations,
  funnelActive,
  funnelSessions,
  funnelVersions,
};
