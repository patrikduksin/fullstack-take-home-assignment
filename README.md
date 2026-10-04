# Core

A clean RAT stack starter for a fullstack take-home assignment. The web app uses TanStack Start with React and server rendering.

## Run locally

Mise is highly recommended for working with this repo. The included `.mise.toml` pins Node 24.18.0 and pnpm 11.3.0 to the toolchain verified for local development, checks, tests, and builds. Using mise ensures you run those exact versions.

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm dev
```

With mise activated in your shell, you can run `pnpm` directly. Otherwise, use `mise exec --` before the pnpm commands below.

`pnpm dev` runs `alchemy dev` from the workspace root. Alchemy starts the TanStack Start website at http://localhost:3000, the backend Worker at http://localhost:3001, and a local D1 database. The website uses a Cloudflare service binding to reach the backend in development and deployment.

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

The only starter capability is `health`. It runs a database query. There are no assignment models, authentication flows, content site, CLI, analytics, or demo domain features.

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
curl http://localhost:3000/api/health
```

Connect an MCP client to `http://localhost:3000/mcp`. The server supports MCP protocol versions 2025-06-18, 2025-03-26, and 2024-11-05, including initialization and session headers.

## Add assignment behavior

Define input, output, and failure schemas in `packages/core/src/contracts.ts`. Implement a capability and register it in `packages/core/src/index.ts`. The backend projects the capability list into all three interfaces. Keep provider adapters in `packages/database` or another adapter package and supply their Layers in the backend.

Browser features read atoms from `apps/web/src/client`. Browser code imports contracts and the contract-only RPC projection. Server implementations remain outside browser modules.

Add SQLite tables to `packages/database/src/schema.ts` with Drizzle, then generate migrations:

```sh
pnpm --filter @core/database generate
```

Commit the generated SQL and Drizzle metadata. Alchemy applies the same SQL to local D1 during development and Cloudflare D1 during deployment. The initial schema is empty so it does not impose a domain on the assignment.

## Validate

```sh
pnpm check
pnpm test
pnpm build
```

The fence includes strict TypeScript, Effect compiler diagnostics, Ultracite/Oxlint, architecture rules, Oxfmt, and Lefthook pre-commit checks. `pnpm build`, `pnpm typecheck`, and `pnpm test` use pnpm recursive workspace scripts. Builds run in dependency order. Type checking builds first to generate the TanStack route tree, then checks every workspace and the root tooling. `pnpm fix` applies safe lint fixes and formatting. CI installs from the frozen lockfile and runs the checks, tests, and build.

## Cloudflare deployment

I chose Cloudflare because I already have an account and can deploy the assignment there easily. Alchemy keeps infrastructure in code, and core service ports separate domain logic from hosting and database adapters. If another provider is preferred, we can target Hetzner, AWS, or GCP by replacing the Cloudflare resource declarations, Worker runtime wiring, and D1 adapter while retaining the domain contracts and handlers. An agent can work from a single migration prompt to update the infrastructure and adapters, then verify the result on the target provider.

Configure an Alchemy Cloudflare profile with `pnpm exec alchemy profile edit --add Cloudflare`. Then review the plan before deploying:

```sh
pnpm infra:plan
pnpm infra:deploy
```

The stack creates a TanStack Start website, a private backend Worker, and D1. The website reaches the backend through a service binding. No custom domain or existing Cloudflare resource is assumed. Deployment is not required for local development.

## Source

Five project skills are maintained in root [`skills/`](skills): `setup`, `add-a-capability`, `add-a-lifecycle-machine`, `learn-alchemy`, and `uncomplect`. The setup skill covers a fresh checkout; the other four are adapted for Core from RAT stack. The reference-repo maintenance and website skills were removed.

After cloning, install them for Codex from their local source with the Skills CLI:

```sh
pnpm skills:install
```

Edit `skills/` and rerun the command after changes. Installed copies in `.agents/skills` are generated and ignored; `skills-lock.json` tracks the local source. [AGENTS.md](AGENTS.md) links to each skill.

Adapted from [joelhooks/rat-stack](https://github.com/joelhooks/rat-stack/tree/c7d11aa396dad097ecb41a3f316cc905f6037063), following its [keep-or-cut guide](https://ratstack.sh/skills/keep-or-cut). The retained capability projections, lint rules, and projection tests originate there. The MIT license is preserved.
