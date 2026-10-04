# Database migrations

Define assignment tables in `src/schema.ts` with `drizzle-orm/sqlite-core`, then run `pnpm --filter @core/database generate`.

Alchemy applies the generated SQL files to local D1 during `pnpm dev` and Cloudflare D1 during deployment. The first migration creates immutable funnel-version records, the active-version pointer, and resumable sessions, then seeds the authored fictional configuration. Keep the seed with its initial migration so empty databases start with a complete funnel.

The event migration adds immutable envelopes and a session-creation trigger. The trigger records `session_started` in the same transaction as its session, using stored initial attribution and the server creation time. Historical sessions get empty attribution and a single start envelope at their recorded creation time. Resuming and saving a session never emit another start event. The generated Drizzle snapshot describes the table; the trigger and data backfill are authored SQL in that new migration.
