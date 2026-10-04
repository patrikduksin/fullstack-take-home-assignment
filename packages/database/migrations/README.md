# Database migrations

Define assignment tables in `src/schema.ts` with `drizzle-orm/sqlite-core`, then run `pnpm --filter @core/database generate`.

Alchemy applies the generated SQL files to local D1 during `pnpm dev` and Cloudflare D1 during deployment. The first migration creates immutable funnel-version records, the active-version pointer, and resumable sessions, then seeds the authored fictional configuration. Keep the seed with its initial migration so empty databases start with a complete funnel.

The event migration adds immutable envelopes and a session-creation trigger. The trigger records `session_started` in the same transaction as its session, using stored initial attribution and the server creation time. Historical sessions get empty attribution and a single start envelope at their recorded creation time. Resuming and saving a session never emit another start event. The generated Drizzle snapshot describes the table; the trigger and data backfill are authored SQL in that new migration.

The activation-history migration initializes its first row from the active pointer after the branch fixtures are seeded. An activation-insert trigger updates that pointer in the same transaction. Publication uses a D1 batch to insert an immutable version and its activation; rollback inserts a new activation referencing the previous target. Historical version rows and sessions are retained.

The event/history reconciliation migration joins the generated snapshot ancestry from the independently implemented event and activation-history branches. Its SQL is a harmless `SELECT 1`; both tables already exist in earlier migrations. Regeneration reports no schema changes. Earlier SQL and snapshots remain unchanged.
