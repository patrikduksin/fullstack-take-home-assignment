---
name: setup
description: Set up a fresh Core checkout for local development and verify the web, backend, and D1 work together.
---

# Set up Core

Read `AGENTS.md` and `README.md`. From the repo root:

1. Run `mise run setup`. Mise selects the pinned Node and pnpm versions, installs workspace dependencies and local agent skills, and downloads Chromium for the pinned Playwright version.
2. Use an activated mise shell or prefix subsequent pnpm commands with `mise exec --`.
3. Configure an Alchemy Cloudflare profile, then run `pnpm dev`. Alchemy starts the TanStack Start web app, backend Worker, and local D1; no cloud deployment is needed.
4. Read Alchemy's `websiteUrl` and `backendUrl` outputs. Verify the web app at `websiteUrl` and `GET /api/health` on both URLs. Both health responses must report `status: "ok"` and `database: "ready"`.
5. For browser agent assertions, sign in once with `pnpm exec e2e login openai`; without that login, use `E2E_AGENT_ASSERTIONS=0` for tests. Run `pnpm check` and `pnpm test` before handover. Integration and browser tests deploy temporary remote stacks and destroy them afterward.

Keep development rooted in Alchemy. If setup fails, inspect the actual error and pinned sources rather than adding a second server or changing dependency versions. Report any blocker and whether the dev process remains running.
