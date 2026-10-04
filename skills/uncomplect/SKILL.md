---
name: uncomplect
description: Review or simplify Core architecture by separating domain behavior, transport, provider adapters, infrastructure, and lifecycle state while preserving observable behavior.
---

# Simplify Core's architecture

Read `AGENTS.md`, the assignment requirements when available, and the code and tests for the design under review. Check unfamiliar Effect, XState, and Alchemy APIs against pinned source. Preserve the user's requested behavior and scope.

Adapted from [RAT stack's simplification skill](https://github.com/joelhooks/rat-stack/tree/c7d11aa396dad097ecb41a3f316cc905f6037063/skills/uncomplect), based on [uncomplect](https://github.com/joelhooks/skills/tree/main/skills/uncomplect).

## Find coupled concerns

For each finding, name the file, the concerns coupled together, the behavior that must remain, and a concrete separation or deletion.

- Domain behavior belongs in a capability handler, defined by input, output, and failure schemas. HTTP, RPC, and MCP derive interfaces from that shared capability rather than implementing independent rules.
- Browser transport belongs in `apps/web/src/client`. Features read atoms and call client commands. Keep server implementations outside browser imports.
- Provider queries and SDK details belong in adapters such as `packages/database`; callers depend on core service ports. Supply adapters through backend Layers.
- Resource declarations and binding dependencies belong with their consuming adapters and application resources. The Stack composes them; runtime modules do not import `apps/infra`.
- Use contract approval metadata and the Approval service for capabilities needing approval. Retry only typed transient failures at the relevant boundary, with policy chosen for the domain.
- Meaningful legal lifecycle transitions belong in a machine; simple work can remain a direct Effect. Do not add a machine solely to rename a status flag.
- The backend or database owns authoritative decisions. A browser cache or replica must reconcile with it rather than become a second authority.

## Compare designs by what they remove

A capability hides validation, typed failures, approval, and interface projections behind one contract. An adapter hides its vendor and infrastructure behind a service port. New tags, Layers, states, or packages should reduce what callers must know or remove a concrete source of coupling.

For a consequential change, compare plausible designs using their contracts, required services, and deletion impact. Do not introduce machinery merely to fit a preferred vocabulary.

Check replaceability by tracing imports: callers should depend on the service port rather than adapter internals. When a removal experiment would help, use an isolated checkout and remove the adapter plus its composition wiring. Compiler failures reveal leaked dependencies. Do not delete live product behavior as a review exercise.

## Make the separation hold

Prefer a type or API that prevents the coupling. Use the existing import boundary rules and compiler diagnostics. Add a focused lint rule or meaningful test when a recurring problem warrants it; ordinary local changes do not require new lint infrastructure. Put conventions in `AGENTS.md` when code and static analysis cannot express them.

Keep one development path through root `pnpm dev`. Run `pnpm check`, `pnpm test`, and `pnpm build` after implementation.

Report the concrete findings, preserved behavior, proposed or completed changes, what can be deleted, and validation. Distinguish a recommendation from an implemented fix.
