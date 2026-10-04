---
name: setup-core
description: Set up a fresh Core checkout for local development and verify the web, backend, and D1 work together.
---

# Set up Core

Read `AGENTS.md` and `README.md`. From the repo root:

1. Mise is highly recommended to select the exact verified Node and pnpm versions in `.mise.toml`. Run `mise install`, then use an activated mise shell or prefix pnpm commands with `mise exec --`.
2. Run `pnpm install --frozen-lockfile` and `pnpm skills:install`.
3. Run `pnpm dev`. Alchemy starts the TanStack Start web app, backend Worker, and local D1; no cloud deployment is needed.
4. Verify the web app at `http://localhost:3000` and `GET /api/health` on ports 3000 and 3001. Both health responses must report `status: "ok"` and `database: "ready"`.
5. Run `pnpm check`, `pnpm test`, and `pnpm build` before handing over the checkout.

Keep development rooted in Alchemy. If setup fails, inspect the actual error and pinned sources rather than adding a second server or changing dependency versions. Report any blocker and whether the dev process remains running.
