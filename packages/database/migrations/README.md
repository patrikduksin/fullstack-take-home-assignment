# Database migrations

Define assignment tables in `src/schema.ts` with `drizzle-orm/sqlite-core`, then run `pnpm --filter @core/database generate`.

Alchemy applies the generated SQL files to local D1 during `pnpm dev` and Cloudflare D1 during deployment. The first migration creates immutable funnel-version records, the active-version pointer, and resumable sessions, then seeds the authored fictional configuration. Keep the seed with its initial migration so empty databases start with a complete funnel.
