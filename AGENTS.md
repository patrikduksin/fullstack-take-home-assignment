# Project instructions

This is a take-home assignment starter based on RAT stack. Product requirements belong in VISION.md when the assignment is available.

Mise is highly recommended: `.mise.toml` pins the verified toolchain to Node 24.18.0 and pnpm 11.3.0. Run `mise install`, then use an activated mise shell or `mise exec --` for pnpm and Git commands that run hooks. Keep dependencies pinned. Run `pnpm check`, `pnpm test`, and `pnpm build` before handing over changes. Never bypass Git hooks.

Define Effect Schema contracts in packages/core, bind handlers with implement, and project them through packages/capability to HTTP, RPC, and MCP. Core owns service ports; database implements adapters; backend provides Layers; web features read atoms from web/client. Browser code imports contracts, never server implementations. Infrastructure belongs in apps/infra and uses Alchemy. Finite domain lifecycles use XState and @xstate/effect when needed.

Read the installed Effect AGENTS.md before Effect work. Use @effect/vitest for Effect tests. Retain the lint boundaries, compiler diagnostics, and pre-commit checks. Do not publish secrets, generated builds, local D1 state, or source mirrors.

Use `pnpm dev` as the sole development entrypoint. It runs Alchemy from the workspace root to watch the whole source graph and manage the website, backend Worker, and local D1. Keep workspace runtime exports pointing to TypeScript sources. Use pnpm recursive workspace scripts for builds, checks, and tests. Local development creates no cloud resources. Deployment is a separate action and requires an Alchemy Cloudflare profile and review of infra:plan.

## Repo-local skills

Core-specific skill sources live in root `skills/`. Read the relevant skill:

- [setup](skills/setup/SKILL.md) for setting up and verifying a fresh checkout.
- [add-a-capability](skills/add-a-capability/SKILL.md) for contracts and shared HTTP/RPC/MCP handlers.
- [add-a-lifecycle-machine](skills/add-a-lifecycle-machine/SKILL.md) for XState lifecycles with Effect actors and tests.
- [learn-alchemy](skills/learn-alchemy/SKILL.md) for the website, backend Worker, D1, and deployment graph.
- [uncomplect](skills/uncomplect/SKILL.md) for architecture review and simplification.

Edit the source files in `skills/`, then run `pnpm skills:install`. That command uses the Skills CLI to install from the local directory into `.agents/skills`, which is generated and ignored. Run it after cloning to enable native agent discovery. `skills-lock.json` tracks the local source and hashes. These are maintained Core adaptations; do not replace them with upstream copies during an update.
