# Core

A clean RAT stack starter for a fullstack take-home assignment. The web app uses TanStack Start with React and server rendering.

## Run locally

Mise is highly recommended for working with this repo. The included `.mise.toml` pins Node 24.18.0 and pnpm 11.3.0 to the toolchain verified for local development, checks, tests, and builds. Using mise ensures you run those exact versions.

```sh
mise run setup
mise exec -- pnpm dev
```

`mise run setup` installs the pinned tools, workspace dependencies, local agent skills, and Chromium.

With mise activated in your shell, you can run `pnpm` directly. Otherwise, use `mise exec --` before the pnpm commands below.

`pnpm dev` runs `alchemy dev` from the workspace root. Alchemy starts the TanStack Start website, backend Worker, and local D1 database, choosing available ports. Use the reported `websiteUrl` and `backendUrl` outputs. The website uses a Cloudflare service binding to reach the backend in development and deployment.

Alchemy manages Worker reloads, Vite HMR, local D1 migrations, and persistent local state under `.alchemy/`. Local development creates no cloud resources. Private workspace packages export their TypeScript sources so Alchemy and Vite can reload changes without a separate build watcher.

## Workspace

| Package | Directory | Purpose |
| --- | --- | --- |
| `@core/web` | `apps/web` | TanStack Start, React, Effect AtomRpc client |
| `@core/backend` | `apps/backend` | Cloudflare Worker with Effect HTTP API, RPC, and MCP |
| `@core/infra` | `apps/infra` | Alchemy Cloudflare stack and deployment commands |
| `@core/core` | `packages/core` | Schema contracts, service ports, and capability handlers |
| `@core/database` | `packages/database` | Cloudflare D1 adapter, Drizzle schema, and SQL migrations |
| `@core/capability` | `packages/capability` | Shared contract projections for HTTP, RPC, and MCP |

Effect 4 owns services, errors, configuration, and resource lifetimes. XState 6 and `@xstate/effect` are available for assignment lifecycles. Alchemy 2 declares cloud resources. Package versions are pinned to the upstream snapshot.

The home page runs a fictional trail-planning funnel from backend JSON. Sessions pin an immutable configuration version and retain accepted answers and navigation in D1. Unsubmitted edits remain in the same browser through reload and reopening. The diagnostic page at `/health` checks the backend and database separately from the visitor flow.

`configurations/linear-v1.json` is an authored fixture because the original assignment JSON files were not supplied.

## Interfaces

The web app forwards these endpoints to the backend. Both origins expose the same interfaces locally.

| Endpoint            | Purpose                                    |
| ------------------- | ------------------------------------------ |
| `GET /api/health`   | Database readiness                         |
| `/rpc`              | Schema-derived Effect RPC                  |
| `/mcp`              | Streamable HTTP MCP with the `health` tool |
| `GET /openapi.json` | Generated OpenAPI specification            |
| `GET /docs`         | API reference                              |

```sh
# Set WEBSITE_URL to the websiteUrl reported by Alchemy.
curl "$WEBSITE_URL/api/health"
```

Connect an MCP client to `/mcp` on the reported `websiteUrl`. The server supports MCP protocol versions 2025-06-18, 2025-03-26, and 2024-11-05, including initialization and session headers.

MCP requests share one Durable Object because Effect keeps these protocol sessions in memory. This keeps initialization and later tool calls on the same instance across backend Worker isolates. Sessions expire when the object restarts; clients must initialize again after a session returns 404. HTTP and RPC requests go directly to the backend Worker.

## Add assignment behavior

Define input, output, and failure schemas in `packages/core/src/contracts.ts`. Implement a capability and register it in `packages/core/src/index.ts`. The backend projects the capability list into all three interfaces. Keep provider adapters in `packages/database` or another adapter package and supply their Layers in the backend.

Browser features read atoms from `apps/web/src/client`. Browser code imports contracts and the contract-only RPC projection. Server implementations remain outside browser modules.

Add SQLite tables to `packages/database/src/schema.ts` with Drizzle, then generate migrations:

```sh
pnpm --filter @core/database generate
```

Commit the generated SQL and Drizzle metadata. Alchemy applies the same SQL to local D1 during development and Cloudflare D1 during deployment. The initial migration creates the funnel version, active pointer, and session tables and seeds a complete fictional configuration.

## Validate

```sh
pnpm check
pnpm test
```

See the [testing skill](skills/testing/SKILL.md) for test policy, commands, and prerequisites.

The fence includes strict TypeScript, Effect compiler diagnostics, Ultracite/Oxlint, architecture rules, Oxfmt, and Lefthook pre-commit checks. Checks and unit tests run through pnpm workspace scripts; integration and browser suites use their owning packages, with a shared Alchemy harness in `@core/infra`. The generated TanStack route tree is checked into Git so a fresh checkout can typecheck. TanStack Start updates it during Alchemy dev and deployment; include those updates when changing routes. Type checking checks every workspace and the root tooling. Alchemy builds deployment bundles when it deploys the Stack. `pnpm fix` applies safe lint fixes and formatting. CI installs from the frozen lockfile and runs checks and tests.

## Cloudflare deployment

I chose Cloudflare because I already have an account and can deploy the assignment there easily. Alchemy keeps infrastructure in code, and core service ports separate domain logic from hosting and database adapters. If another provider is preferred, we can target Hetzner, AWS, or GCP by replacing the Cloudflare resource declarations, Worker runtime wiring, and D1 adapter while retaining the domain contracts and handlers. An agent can work from a single migration prompt to update the infrastructure and adapters, then verify the result on the target provider.

Configure an Alchemy Cloudflare profile with `pnpm exec alchemy profile edit --add Cloudflare`. Then review the plan before deploying:

```sh
pnpm infra:plan
pnpm infra:deploy
```

The stack creates a TanStack Start website, a private backend Worker, and D1. The website reaches the backend through a service binding. No custom domain or existing Cloudflare resource is assumed. Deployment is not required for local development.

## Source

Project skills are maintained in root [`skills/`](skills): `setup`, `testing`, `add-a-capability`, `add-a-lifecycle-machine`, `learn-alchemy`, and `uncomplect`. Setup and testing describe Core workflows; the other four are adapted from RAT stack.

After cloning, install them for Codex from their local source with the Skills CLI:

```sh
pnpm skills:install
```

Edit `skills/` and rerun the command after changes. Installed copies in `.agents/skills` are generated and ignored; `skills-lock.json` tracks the local source. [AGENTS.md](AGENTS.md) contains the repository rules.

Adapted from [joelhooks/rat-stack](https://github.com/joelhooks/rat-stack/tree/c7d11aa396dad097ecb41a3f316cc905f6037063), following its [keep-or-cut guide](https://ratstack.sh/skills/keep-or-cut). The retained capability projections, lint rules, and projection tests originate there. The MIT license is preserved.
