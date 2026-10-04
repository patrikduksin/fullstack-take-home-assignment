---
name: learn-alchemy
description: Trace or change Core's Alchemy infrastructure for the TanStack Start website, backend Worker, and D1, including local development and deployment plans.
---

# Learn Core's Alchemy setup

Read `AGENTS.md` and inspect the pinned Alchemy source before changing resource APIs. Alchemy 2 expresses resources and runtime bindings in an Effect program; the CLI evaluates that graph for development, planning, and deployment.

## Trace the graph

Read these files in order:

1. `apps/infra/alchemy.run.ts` declares the `Core` Stack with `Cloudflare.providers()` and `Cloudflare.state()`, yields Backend and Website, and returns backend and website URLs.
2. `apps/backend/src/worker.ts` declares `CoreBackend`, its runtime entrypoint, and compatibility date. Its construction supplies HTTP platform services and database dependencies to backend routes.
3. `packages/database/src/d1.ts` declares `CoreDatabase`, obtains its query binding, and implements the core Database service. Its migrations path is resolved from `import.meta.url`.
4. `apps/web/src/website.ts` declares `CoreWebsite` and the `BACKEND` service binding. `apps/web/src/server/backend.ts` consumes that binding for TanStack Start server requests. Alchemy chooses available local ports; use the Stack's reported URLs.

A resource is a cloud object with a stable logical name. A binding gives runtime code access to a declared resource. A Layer supplies service implementations. Keep these concerns aligned so removing an adapter also removes its resource declarations and binding dependencies.

This graph has no existing domain, DNS adoption, analytics pipeline, sandbox, or Durable Objects. Add resources only for the assignment's requirements.

## Local development

Run root `pnpm dev`. This is the only development flow: Alchemy manages the website, backend Worker, local D1, migrations, and reloads. Keep invocation at the workspace root so changes in sibling packages are watched. Do not replace it with a standalone Vite server or Node/SQLite backend.

Workspace runtime exports point to TypeScript sources; development does not require a separate build watcher. Resolve resource and migration paths relative to their modules, not the shell's working directory. Local generated state stays ignored.

Define tables in `packages/database/src/schema.ts`, generate SQL with `pnpm --filter @core/database generate`, and review and commit the migrations and Drizzle metadata. Alchemy applies the same migrations locally and during deployment. Verify migration changes against local D1, including existing local data when relevant.

## Plans and deployment

Root scripts are `pnpm infra:plan` and `pnpm infra:deploy`. Configure Cloudflare credentials with an Alchemy profile; keep credentials out of source and Worker bindings.

Read every plan action and check the intended account, stage, resource names, bindings, replacements, and data retention. A stage separates deployment state; use the project's intended stage rather than importing RAT stack's production stage. Adoption transfers ownership of an existing resource and needs an explicit reason. A successful build is not proof that a provider operation will succeed.

Planning or studying infrastructure does not authorize a deployment or resource destruction. Follow the user's requested scope and existing authorization.

## Verify changes

Run `pnpm check` and `pnpm test`. Use root `pnpm dev` to verify affected routes, service bindings, D1 queries, and reload behavior. For deployment changes, inspect the plan when credentials are available and report any verification that remains blocked. Keep the Worker compatibility date supported by the pinned local runtime.
