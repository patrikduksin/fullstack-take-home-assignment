# Database migrations

Define assignment tables in `src/schema.ts` with `drizzle-orm/sqlite-core`, then run `pnpm --filter @core/database generate`.

Alchemy applies the generated SQL files to local D1 during `pnpm dev` and Cloudflare D1 during deployment. This starter has no domain tables.
