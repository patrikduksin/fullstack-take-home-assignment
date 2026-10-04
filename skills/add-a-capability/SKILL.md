---
name: add-a-capability
description: Add a Core capability with Effect Schema contracts and a shared handler projected into HTTP, RPC, and MCP.
---

# Add a capability

Read `AGENTS.md` and the installed Effect `AGENTS.md` before changing Effect code. Follow the existing `health` capability from `packages/core/src/contracts.ts` through `packages/core/src/index.ts` to `apps/backend/src/routes.ts`.

## Contract and handler

Define cross-process contracts in `packages/core/src/contracts.ts` with `defineContract` from `@core/capability/contract`. Describe the action with a stable name, input `Schema.Struct`, output schema, and expected failure schema. Schemas must encode and decode without services; keep server dependencies outside this module.

Set annotations such as `readOnly`, `idempotent`, `destructive`, and `openWorld` to describe actual behavior. Use `needsApproval` only for an action that requires approval: `implement` adds the `Approval` requirement and `ApprovalDenied` failure. The backend must supply that service when such capabilities are added.

Bind the contract with `implement` from `@core/capability/implement`. Keep domain behavior in core, declare service ports there, and put provider implementations and queries in adapter packages such as `packages/database`. Supply their Layers at the backend composition boundary. Use a lifecycle machine when legal states and events matter; otherwise use a direct Effect.

Register the implementation in the `capabilities` tuple in `packages/core/src/index.ts`. Preserve the tuple order when public tooling relies on it.

## Interfaces and browser client

`apps/backend/src/routes.ts` projects the same registry through `toHttpApi`, `toRpc`, and `toToolkit`. Reuse those projections rather than adding independent transport handlers with their own domain logic.

- HTTP uses the `/api` prefix. Check the contract's HTTP method/path metadata and generated OpenAPI rather than assuming every action is a POST.
- RPC is served at `/rpc` and MCP at `/mcp`.
- The TanStack Start website forwards backend requests through its Cloudflare service binding.

Browser clients in `apps/web/src/client` import contracts from `@core/core/contracts` and `toRpcGroup` from `@core/capability/rpc-group`. Never import core handlers or server-side `toRpc` into browser code. Features read client atoms and invoke client commands; the client owns transport.

## Verification

Read `skills/testing/SKILL.md` from the repository root. Exercise approval behavior when relevant. Use `Schema.encodeEffect` to check encoded results and `Effect.flip` for expected errors. Do not call `Effect.run*` or construct a managed runtime inside Effect tests.

Add projection tests when transport behavior changes. For a new public action, verify its relevant interfaces against an Alchemy-managed test stack, destroyed in `afterAll`. Add `e2e` tests only for browser behavior. Run `pnpm check` and `pnpm test`; keep the existing diagnostics, import boundaries, and hooks intact.
